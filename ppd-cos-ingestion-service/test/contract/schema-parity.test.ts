import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { createSchemaRegistry } from '../../src/contracts/schema-registry.js';

const serviceRoot = path.resolve(import.meta.dirname, '../..');
const backendSchemas = path.join(serviceRoot, 'schemas');
const referenceSchemas = path.resolve(serviceRoot, '../ppd-google-chat-cos-adapter/schemas');
const schemaNames = [
  'intake-event.v1.schema.json',
  'clarification-answer.v1.schema.json',
  'approval-decision.v1.schema.json',
  'ingestion-result.v1.schema.json',
  'delivery.v1.schema.json',
] as const;

for (const name of schemaNames) {
  test(`${name} is byte-identical to the authoritative wire contract`, () => {
    const backend = readFileSync(path.join(backendSchemas, name));
    const reference = readFileSync(path.join(referenceSchemas, name));

    assert.deepEqual(backend, reference);
  });
}

const actor = {
  chatUserName: 'users/123456789',
  email: 'person@example.com',
  domainId: 'example-domain',
  type: 'HUMAN',
  source: 'google_chat_interaction',
};

const source = {
  platform: 'google_chat',
  spaceName: 'spaces/DM_123',
  spaceType: 'DIRECT_MESSAGE',
  channel: 'dm',
  threadName: 'spaces/DM_123/threads/thread-1',
  messageName: 'spaces/DM_123/messages/message-1',
};

const common = {
  requestId: `req_${'a'.repeat(32)}`,
  correlationId: `cor_${'b'.repeat(32)}`,
  actor,
  source,
  createdAt: '2026-08-28T06:30:00.000Z',
  expiresAt: '2026-08-28T06:35:00.000Z',
  idempotencyKey: 'c'.repeat(64),
  adapter: { name: 'ppd-google-chat-cos-adapter', version: '1.2.3' },
};

const inboundFixtures = {
  'ppd.cos.intake.v1': {
    ...common,
    schemaVersion: 'ppd.cos.intake.v1',
    eventType: 'request.submitted',
    eventId: `evt_${'d'.repeat(32)}`,
    eventUpdateId: `upd_${'e'.repeat(32)}`,
    purpose: 'Handle an executive request',
    payload: { text: 'Prepare the weekly summary.' },
    payloadHash: 'f'.repeat(64),
  },
  'ppd.cos.clarification-answer.v1': {
    ...common,
    schemaVersion: 'ppd.cos.clarification-answer.v1',
    eventType: 'clarification.answered',
    eventId: `evt_${'1'.repeat(32)}`,
    eventUpdateId: `upd_${'2'.repeat(32)}`,
    clarificationHandle: `clar_${'3'.repeat(32)}`,
    payload: { answer: 'Use the board-ready format.' },
    payloadHash: '4'.repeat(64),
  },
  'ppd.cos.approval-decision.v1': {
    ...common,
    schemaVersion: 'ppd.cos.approval-decision.v1',
    eventType: 'approval.decision_submitted',
    decisionId: `dec_${'5'.repeat(32)}`,
    approvalHandle: `apr_${'6'.repeat(32)}`,
    decision: 'approve',
    expectedActionPayloadHash: '7'.repeat(64),
  },
} as const;

test('schema registry compiles and accepts complete sanitized inbound envelopes', () => {
  const registry = createSchemaRegistry(backendSchemas);

  assert.deepEqual([...registry.keys()], Object.keys(inboundFixtures));
  for (const [version, fixture] of Object.entries(inboundFixtures)) {
    const validate = registry.get(version);
    assert.ok(validate, `missing validator for ${version}`);
    assert.equal(validate(fixture), true, JSON.stringify(validate.errors));
  }
});

test('schema registry rejects unsupported versions and additional properties', () => {
  const registry = createSchemaRegistry(backendSchemas);
  const intakeValidator = registry.get('ppd.cos.intake.v1');

  assert.equal(registry.has('ppd.cos.intake.v2'), false);
  assert.ok(intakeValidator);
  assert.equal(
    intakeValidator({ ...inboundFixtures['ppd.cos.intake.v1'], unexpected: 'not allowed' }),
    false,
  );
  assert.equal(
    intakeValidator({
      ...inboundFixtures['ppd.cos.intake.v1'],
      schemaVersion: 'ppd.cos.intake.v2',
    }),
    false,
  );
});
