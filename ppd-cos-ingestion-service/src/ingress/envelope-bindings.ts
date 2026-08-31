import { sha256Hex } from '../canonical/canonical-json.js';
import type { ValidatedEnvelope } from '../contracts/envelopes.js';
import { IntakeError } from '../domain/errors.js';

export function recomputeIdempotencyKey(envelope: ValidatedEnvelope): string {
  if (envelope.schemaVersion === 'ppd.cos.approval-decision.v1') {
    const binding: Record<string, unknown> = {
      schemaVersion: envelope.schemaVersion,
      decisionId: envelope.decisionId,
      approvalHandle: envelope.approvalHandle,
      actor: envelope.actor.chatUserName,
      requestId: envelope.requestId,
      expectedActionPayloadHash: envelope.expectedActionPayloadHash,
    };
    if (envelope.decision === 'amend') {
      binding.amendmentHash = envelope.amendmentHash;
    } else {
      binding.decision = envelope.decision;
    }
    return sha256Hex(binding);
  }

  return sha256Hex({
    schemaVersion: envelope.schemaVersion,
    eventType: envelope.eventType,
    eventId: envelope.eventId,
    eventUpdateId: envelope.eventUpdateId,
    actor: envelope.actor.chatUserName,
    source: envelope.source.spaceName,
    requestId: envelope.requestId,
    payloadHash: envelope.payloadHash,
  });
}

export function assertEnvelopeBindings(
  envelope: ValidatedEnvelope,
  headerKey: string,
): void {
  if (
    'payload' in envelope
    && (
      typeof envelope.payloadHash !== 'string'
      || sha256Hex(envelope.payload) !== envelope.payloadHash
    )
  ) {
    throw new IntakeError('PAYLOAD_HASH_MISMATCH', 'rejected');
  }

  if (
    envelope.schemaVersion === 'ppd.cos.approval-decision.v1'
    && envelope.decision === 'amend'
    && (
      typeof envelope.amendmentHash !== 'string'
      || sha256Hex(envelope.amendment) !== envelope.amendmentHash
    )
  ) {
    throw new IntakeError('AMENDMENT_HASH_MISMATCH', 'rejected');
  }

  const recomputed = recomputeIdempotencyKey(envelope);
  if (recomputed !== envelope.idempotencyKey || recomputed !== headerKey) {
    throw new IntakeError('IDEMPOTENCY_KEY_MISMATCH', 'rejected');
  }
}
