import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MockAccessRegistry,
  type RegistryResolution,
} from '../../src/identity/access-registry.js';
import {
  MockIntakePolicy,
  type IntakePolicyPort,
} from '../../src/identity/intake-policy.js';

const mapped: RegistryResolution = Object.freeze({
  kind: 'mapped',
  subjectId: 'subject_test_1',
  canonicalEmail: 'person@example.com',
  policyVersion: 'policy_test_v1',
});

test('registry maps only a stable Google Chat user resource', async () => {
  const values = new Map<string, RegistryResolution>([['users/123456789', mapped]]);
  const registry = new MockAccessRegistry(values);

  assert.deepEqual(await registry.resolve('users/123456789'), mapped);
  assert.deepEqual(await registry.resolve('Display Name'), { kind: 'unmapped' });
  assert.deepEqual(await registry.resolve('users/unknown'), { kind: 'unmapped' });
});

test('registry exposes no grant set or mutation API and copies its input', async () => {
  const values = new Map<string, RegistryResolution>([['users/123456789', mapped]]);
  const registry = new MockAccessRegistry(values);
  values.delete('users/123456789');

  assert.deepEqual(await registry.resolve('users/123456789'), mapped);
  assert.equal('grant' in registry, false);
  assert.equal('set' in registry, false);
  assert.equal('delete' in registry, false);
});

test('registry preserves every fail-closed resolution', async () => {
  const values = new Map<string, RegistryResolution>([
    ['users/disabled', { kind: 'disabled' }],
    ['users/ambiguous', { kind: 'ambiguous' }],
    ['users/unavailable', { kind: 'unavailable', retryable: true }],
  ]);
  const registry = new MockAccessRegistry(values);

  assert.deepEqual(await registry.resolve('users/disabled'), { kind: 'disabled' });
  assert.deepEqual(await registry.resolve('users/ambiguous'), { kind: 'ambiguous' });
  assert.deepEqual(
    await registry.resolve('users/unavailable'),
    { kind: 'unavailable', retryable: true },
  );
});

test('submission policy receives shared scope without promotion', async () => {
  const seen: unknown[] = [];
  const policy: IntakePolicyPort = {
    async evaluate(input) {
      seen.push(input);
      return {
        kind: 'allow',
        evaluationId: 'eval_test_1',
        policyVersion: 'policy_test_v1',
      };
    },
  };
  const sharedSource = {
    platform: 'google_chat' as const,
    spaceName: 'spaces/SHARED_123',
    spaceType: 'SPACE' as const,
    channel: 'shared' as const,
    threadName: 'spaces/SHARED_123/threads/thread-1',
    messageName: 'spaces/SHARED_123/messages/message-1',
  };

  const verdict = await policy.evaluate({
    subjectId: 'subject_test_1',
    source: sharedSource,
    purpose: 'synthetic_assistance',
    eventType: 'request.submitted',
    schemaVersion: 'ppd.cos.intake.v1',
  });

  assert.equal(verdict.kind, 'allow');
  assert.deepEqual(seen, [{
    subjectId: 'subject_test_1',
    source: sharedSource,
    purpose: 'synthetic_assistance',
    eventType: 'request.submitted',
    schemaVersion: 'ppd.cos.intake.v1',
  }]);
  assert.equal((seen[0] as { source: { channel: string } }).source.channel, 'shared');
});

test('mock policy returns the configured immutable verdict', async () => {
  const verdict = Object.freeze({ kind: 'deny' as const, code: 'INTAKE_DENIED' });
  const policy = new MockIntakePolicy(verdict);
  assert.equal(policy.kind, 'mock-test-only');
  const result = await policy.evaluate({
      subjectId: 'subject_test_1',
      source: {
        platform: 'google_chat',
        spaceName: 'spaces/DM_123',
        spaceType: 'DIRECT_MESSAGE',
        channel: 'dm',
        threadName: null,
        messageName: null,
      },
      purpose: 'synthetic_assistance',
      eventType: 'request.submitted',
      schemaVersion: 'ppd.cos.intake.v1',
    });
  assert.deepEqual(result, verdict);
  assert.equal(Object.isFrozen(result), true);
});
