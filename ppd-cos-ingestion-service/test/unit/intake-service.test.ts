import assert from 'node:assert/strict';
import test from 'node:test';

import { InMemorySecretProvider } from '../../src/auth/secret-provider.js';
import type { RegistryResolution } from '../../src/identity/access-registry.js';
import type { IntakePolicyInput, IntakePolicyVerdict } from '../../src/identity/intake-policy.js';
import { IntakeService, type IntakeDependencies } from '../../src/ingress/intake-service.js';
import type { AcceptOutcome, AcceptedEvent, IngressRepository } from '../../src/persistence/types.js';
import {
  approvalEnvelope,
  fixtureKey,
  fixtureKeyId,
  fixtureNow,
  fixtureSchemas,
  intakeEnvelope,
  signedRequest,
} from '../helpers/intake-fixture.js';

class MutableRegistry {
  next: RegistryResolution = {
    kind: 'mapped',
    subjectId: 'subject_test',
    canonicalEmail: 'person@example.com',
    policyVersion: 'registry_v1',
  };

  async resolve(): Promise<RegistryResolution> {
    return this.next;
  }
}

class MutablePolicy {
  next: IntakePolicyVerdict = {
    kind: 'allow',
    evaluationId: 'evaluation_test',
    policyVersion: 'policy_v1',
  };
  readonly inputs: IntakePolicyInput[] = [];

  async evaluate(input: IntakePolicyInput): Promise<IntakePolicyVerdict> {
    this.inputs.push(input);
    return this.next;
  }
}

class RecordingRepository implements IngressRepository {
  next: AcceptOutcome = {
    kind: 'accepted',
    receiptId: 'rcpt_test',
    receivedAt: fixtureNow.toISOString(),
  };
  failure: Error | null = null;
  readonly accepted: AcceptedEvent[] = [];

  async accept(event: AcceptedEvent): Promise<AcceptOutcome> {
    if (this.failure) throw this.failure;
    this.accepted.push(event);
    return this.next;
  }
}

function harness() {
  const registry = new MutableRegistry();
  const policy = new MutablePolicy();
  const repository = new RecordingRepository();
  const dependencies: IntakeDependencies = {
    secrets: new InMemorySecretProvider(new Map([[fixtureKeyId, fixtureKey]])),
    schemas: fixtureSchemas,
    registry,
    policy,
    repository,
    now: () => fixtureNow,
    topic: 'cos-intake',
  };
  return { service: new IntakeService(dependencies), registry, policy, repository };
}

async function resultCode(service: IntakeService): Promise<string> {
  const result = await service.ingest(signedRequest());
  assert.ok(result.state === 'rejected' || result.state === 'unavailable');
  return result.code;
}

test('accepts only after verified identity policy and durable repository acceptance', async () => {
  const { service, policy, repository } = harness();
  const result = await service.ingest(signedRequest());

  assert.equal(result.state, 'accepted');
  assert.equal(repository.accepted.length, 1);
  assert.equal(repository.accepted[0]?.registrySubjectId, 'subject_test');
  assert.equal(repository.accepted[0]?.payloadHash, intakeEnvelope().payloadHash);
  assert.deepEqual(policy.inputs[0], {
    subjectId: 'subject_test',
    source: intakeEnvelope().source,
    purpose: 'synthetic_assistance',
    eventType: 'request.submitted',
    schemaVersion: 'ppd.cos.intake.v1',
  });
});

test('fails closed for every non-mapped registry result and email mismatch', async () => {
  for (const [resolution, code] of [
    [{ kind: 'unmapped' }, 'IDENTITY_UNMAPPED'],
    [{ kind: 'disabled' }, 'IDENTITY_DISABLED'],
    [{ kind: 'ambiguous' }, 'IDENTITY_AMBIGUOUS'],
  ] as const) {
    const { service, registry, repository } = harness();
    registry.next = resolution;
    assert.equal(await resultCode(service), code);
    assert.equal(repository.accepted.length, 0);
  }

  const unavailableHarness = harness();
  unavailableHarness.registry.next = { kind: 'unavailable', retryable: true };
  assert.deepEqual(await unavailableHarness.service.ingest(signedRequest()), {
    schemaVersion: 'ppd.cos.ingestion-result.v1',
    state: 'unavailable',
    code: 'ACCESS_REGISTRY_UNAVAILABLE',
    retryable: true,
  });

  const mismatchHarness = harness();
  mismatchHarness.registry.next = {
    kind: 'mapped',
    subjectId: 'subject_test',
    canonicalEmail: 'different@example.com',
    policyVersion: 'registry_v1',
  };
  assert.equal(await resultCode(mismatchHarness.service), 'IDENTITY_EMAIL_MISMATCH');
  assert.equal(mismatchHarness.repository.accepted.length, 0);
});

test('maps policy and repository outcomes to the closed public result states', async () => {
  const denied = harness();
  denied.policy.next = { kind: 'deny', code: 'PURPOSE_NOT_ALLOWED' };
  assert.equal(await resultCode(denied.service), 'PURPOSE_NOT_ALLOWED');
  assert.equal(denied.repository.accepted.length, 0);

  const policyUnavailable = harness();
  policyUnavailable.policy.next = { kind: 'unavailable', retryable: false };
  assert.equal((await policyUnavailable.service.ingest(signedRequest())).state, 'unavailable');

  const duplicate = harness();
  duplicate.repository.next = {
    kind: 'duplicate',
    receiptId: 'rcpt_original',
    firstReceivedAt: fixtureNow.toISOString(),
  };
  assert.equal((await duplicate.service.ingest(signedRequest())).state, 'duplicate');

  const conflict = harness();
  conflict.repository.next = { kind: 'conflict' };
  assert.equal(await resultCode(conflict.service), 'IDEMPOTENCY_CONFLICT');

  const failed = harness();
  failed.repository.failure = new Error('synthetic database detail must not escape');
  assert.deepEqual(await failed.service.ingest(signedRequest()), {
    schemaVersion: 'ppd.cos.ingestion-result.v1',
    state: 'unavailable',
    code: 'DATABASE_UNAVAILABLE',
    retryable: true,
  });
});

test('approval intake is proposal-only and has no action capability', async () => {
  type Forbidden = Extract<
    keyof IntakeDependencies,
    'approve' | 'execute' | 'consumeApproval' | 'transition' | 'retrieve' | 'acknowledge'
  >;
  const containsNoActionCapability: Forbidden extends never ? true : false = true;
  const { service, repository } = harness();

  assert.equal(containsNoActionCapability, true);
  assert.equal((await service.ingest(signedRequest(approvalEnvelope()))).state, 'accepted');
  assert.equal(repository.accepted.length, 1);
  assert.equal(repository.accepted[0]?.envelope.schemaVersion, 'ppd.cos.approval-decision.v1');
});
