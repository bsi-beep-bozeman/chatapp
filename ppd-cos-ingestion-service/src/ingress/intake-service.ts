import { randomUUID } from 'node:crypto';

import type { SecretProvider } from '../auth/secret-provider.js';
import { type SignedRequest, verifyAdapterRequest } from '../auth/verify-adapter-request.js';
import type { SchemaRegistry } from '../contracts/schema-registry.js';
import { IntakeError } from '../domain/errors.js';
import {
  accepted,
  duplicate,
  type IngestionResult,
  rejected,
  unavailable,
} from '../domain/ingestion-result.js';
import type { AccessRegistryPort } from '../identity/access-registry.js';
import type { IntakePolicyPort } from '../identity/intake-policy.js';
import type { IngressRepository } from '../persistence/types.js';
import { assertEnvelopeBindings } from './envelope-bindings.js';
import { parseAndValidateEnvelope, rawBodyHash } from './validate-envelope.js';

export type IntakeDependencies = Readonly<{
  secrets: SecretProvider;
  schemas: SchemaRegistry;
  registry: AccessRegistryPort;
  policy: IntakePolicyPort;
  repository: IngressRepository;
  now: () => Date;
  topic: string;
}>;

function envelopeIdentifier(envelope: Readonly<Record<string, unknown>>): string {
  const identifier = envelope.eventId ?? envelope.decisionId;
  if (typeof identifier !== 'string') {
    throw new IntakeError('ENVELOPE_SCHEMA_INVALID', 'rejected');
  }
  return identifier;
}

function boundPayloadHash(envelope: Readonly<Record<string, unknown>>): string | null {
  if (typeof envelope.payloadHash === 'string') return envelope.payloadHash;
  if (typeof envelope.expectedActionPayloadHash === 'string') {
    return envelope.expectedActionPayloadHash;
  }
  return null;
}

export class IntakeService {
  constructor(private readonly dependencies: IntakeDependencies) {}

  async ingest(request: SignedRequest): Promise<IngestionResult> {
    try {
      const now = this.dependencies.now();
      await verifyAdapterRequest(request, this.dependencies.secrets, now);
      const envelope = parseAndValidateEnvelope(request.rawBody, this.dependencies.schemas, now);
      assertEnvelopeBindings(envelope, request.headers.idempotencyKey);

      const identity = await this.dependencies.registry.resolve(envelope.actor.chatUserName);
      if (identity.kind === 'unavailable') {
        return unavailable('ACCESS_REGISTRY_UNAVAILABLE', identity.retryable);
      }
      if (identity.kind !== 'mapped') {
        return rejected(`IDENTITY_${identity.kind.toUpperCase()}`);
      }
      if (
        envelope.actor.email
        && envelope.actor.email.toLowerCase() !== identity.canonicalEmail.toLowerCase()
      ) {
        return rejected('IDENTITY_EMAIL_MISMATCH');
      }

      const purpose = typeof envelope.purpose === 'string'
        ? envelope.purpose
        : 'interaction_response';
      const verdict = await this.dependencies.policy.evaluate({
        subjectId: identity.subjectId,
        source: envelope.source,
        purpose,
        eventType: envelope.eventType,
        schemaVersion: envelope.schemaVersion,
      });
      if (verdict.kind === 'deny') return rejected(verdict.code);
      if (verdict.kind === 'unavailable') {
        return unavailable('INTAKE_POLICY_UNAVAILABLE', verdict.retryable);
      }

      const receivedAt = now.toISOString();
      const outcome = await this.dependencies.repository.accept({
        receiptId: `rcpt_${randomUUID().replaceAll('-', '')}`,
        envelopeId: envelopeIdentifier(envelope),
        envelope,
        rawBodyHash: rawBodyHash(request.rawBody),
        payloadHash: boundPayloadHash(envelope),
        registrySubjectId: identity.subjectId,
        purpose,
        policyVersion: verdict.policyVersion,
        policyEvaluationId: verdict.evaluationId,
        receivedAt,
        topic: this.dependencies.topic,
      });
      if (outcome.kind === 'accepted') {
        return accepted(outcome.receiptId, outcome.receivedAt);
      }
      if (outcome.kind === 'duplicate') {
        return duplicate(outcome.receiptId, outcome.firstReceivedAt);
      }
      return rejected('IDEMPOTENCY_CONFLICT');
    } catch (error) {
      if (error instanceof IntakeError) {
        return error.kind === 'rejected'
          ? rejected(error.publicCode)
          : unavailable(error.publicCode, error.retryable);
      }
      return unavailable('DATABASE_UNAVAILABLE', true);
    }
  }
}
