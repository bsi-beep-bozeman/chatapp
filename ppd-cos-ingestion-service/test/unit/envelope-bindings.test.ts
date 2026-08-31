import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import { canonicalStringify, sha256Hex } from '../../src/canonical/canonical-json.js';
import { createSchemaRegistry } from '../../src/contracts/schema-registry.js';
import type { ValidatedEnvelope } from '../../src/contracts/envelopes.js';
import {
  assertEnvelopeBindings,
  recomputeIdempotencyKey,
} from '../../src/ingress/envelope-bindings.js';
import { parseAndValidateEnvelope } from '../../src/ingress/validate-envelope.js';

const schemas = createSchemaRegistry(path.resolve(import.meta.dirname, '../../schemas'));
const now = new Date('2026-08-28T06:30:00.000Z');
const actor = {
  chatUserName: 'users/123456789',
  email: 'person@example.com',
  domainId: 'example-domain',
  type: 'HUMAN' as const,
  source: 'google_chat_interaction' as const,
};
const source = {
  platform: 'google_chat' as const,
  spaceName: 'spaces/DM_123',
  spaceType: 'DIRECT_MESSAGE' as const,
  channel: 'dm' as const,
  threadName: 'spaces/DM_123/threads/thread-1',
  messageName: 'spaces/DM_123/messages/message-1',
};
const common = {
  requestId: `req_${'a'.repeat(32)}`,
  correlationId: `cor_${'b'.repeat(32)}`,
  actor,
  source,
  createdAt: '2026-08-28T06:29:00.000Z',
  expiresAt: '2026-08-28T06:34:00.000Z',
  adapter: { name: 'ppd-google-chat-cos-adapter' as const, version: '1.2.3' },
};

function intakeEnvelope(): ValidatedEnvelope {
  const payload = { text: 'Prepare the synthetic weekly summary.' };
  const envelope = {
    ...common,
    schemaVersion: 'ppd.cos.intake.v1' as const,
    eventType: 'request.submitted',
    eventId: `evt_${'c'.repeat(32)}`,
    eventUpdateId: `upd_${'d'.repeat(32)}`,
    purpose: 'synthetic_assistance',
    payload,
    payloadHash: sha256Hex(payload),
    idempotencyKey: '',
  };
  envelope.idempotencyKey = sha256Hex({
    schemaVersion: envelope.schemaVersion,
    eventType: envelope.eventType,
    eventId: envelope.eventId,
    eventUpdateId: envelope.eventUpdateId,
    actor: envelope.actor.chatUserName,
    source: envelope.source.spaceName,
    requestId: envelope.requestId,
    payloadHash: envelope.payloadHash,
  });
  return envelope;
}

function clarificationEnvelope(): ValidatedEnvelope {
  const payload = { answer: 'Use the synthetic board-ready format.' };
  const envelope = {
    ...common,
    schemaVersion: 'ppd.cos.clarification-answer.v1' as const,
    eventType: 'clarification.answered',
    eventId: `evt_${'e'.repeat(32)}`,
    eventUpdateId: `upd_${'f'.repeat(32)}`,
    clarificationHandle: `clar_${'1'.repeat(32)}`,
    payload,
    payloadHash: sha256Hex(payload),
    idempotencyKey: '',
  };
  envelope.idempotencyKey = sha256Hex({
    schemaVersion: envelope.schemaVersion,
    eventType: envelope.eventType,
    eventId: envelope.eventId,
    eventUpdateId: envelope.eventUpdateId,
    actor: envelope.actor.chatUserName,
    source: envelope.source.spaceName,
    requestId: envelope.requestId,
    payloadHash: envelope.payloadHash,
  });
  return envelope;
}

function approvalEnvelope(decision: 'approve' | 'amend' = 'approve'): ValidatedEnvelope {
  const base = {
    ...common,
    schemaVersion: 'ppd.cos.approval-decision.v1' as const,
    eventType: 'approval.decision_submitted',
    decisionId: `dec_${'2'.repeat(32)}`,
    approvalHandle: `apr_${'3'.repeat(32)}`,
    decision,
    expectedActionPayloadHash: '4'.repeat(64),
    idempotencyKey: '',
  };
  if (decision === 'amend') {
    const amendment = { instruction: 'Change only the synthetic title.' };
    const amendmentHash = sha256Hex(amendment);
    const envelope = { ...base, amendment, amendmentHash };
    envelope.idempotencyKey = sha256Hex({
      schemaVersion: envelope.schemaVersion,
      decisionId: envelope.decisionId,
      approvalHandle: envelope.approvalHandle,
      actor: envelope.actor.chatUserName,
      requestId: envelope.requestId,
      expectedActionPayloadHash: envelope.expectedActionPayloadHash,
      amendmentHash,
    });
    return envelope;
  }
  base.idempotencyKey = sha256Hex({
    schemaVersion: base.schemaVersion,
    decisionId: base.decisionId,
    approvalHandle: base.approvalHandle,
    decision: base.decision,
    actor: base.actor.chatUserName,
    requestId: base.requestId,
    expectedActionPayloadHash: base.expectedActionPayloadHash,
  });
  return base;
}

function raw(envelope: ValidatedEnvelope): Buffer {
  return Buffer.from(canonicalStringify(envelope), 'utf8');
}

test('parses canonical complete supported envelopes', () => {
  for (const envelope of [
    intakeEnvelope(),
    clarificationEnvelope(),
    approvalEnvelope(),
    approvalEnvelope('amend'),
  ]) {
    assert.deepEqual(parseAndValidateEnvelope(raw(envelope), schemas, now), envelope);
  }
});

test('rejects noncanonical duplicate-key malformed and unsupported envelopes', () => {
  assert.throws(
    () => parseAndValidateEnvelope(Buffer.from(` ${canonicalStringify(intakeEnvelope())}`), schemas, now),
    /ENVELOPE_NOT_CANONICAL/,
  );
  assert.throws(
    () => parseAndValidateEnvelope(Buffer.from('{"schemaVersion":"one","schemaVersion":"two"}'), schemas, now),
    /ENVELOPE_NOT_CANONICAL/,
  );
  assert.throws(
    () => parseAndValidateEnvelope(Buffer.from('{'), schemas, now),
    /ENVELOPE_JSON_INVALID/,
  );
  assert.throws(
    () => parseAndValidateEnvelope(raw({ ...intakeEnvelope(), schemaVersion: 'ppd.cos.intake.v2' } as unknown as ValidatedEnvelope), schemas, now),
    /ENVELOPE_SCHEMA_INVALID/,
  );
});

test('rejects expired invalid-range and future-dated envelopes', () => {
  assert.throws(
    () => parseAndValidateEnvelope(raw({ ...intakeEnvelope(), expiresAt: '2026-08-28T06:29:59.000Z' }), schemas, now),
    /EVENT_EXPIRED/,
  );
  assert.throws(
    () => parseAndValidateEnvelope(raw({
      ...intakeEnvelope(),
      createdAt: '2026-08-28T06:34:00.000Z',
      expiresAt: '2026-08-28T06:33:00.000Z',
    }), schemas, now),
    /ENVELOPE_TIME_INVALID/,
  );
  assert.throws(
    () => parseAndValidateEnvelope(raw({
      ...intakeEnvelope(),
      createdAt: '2026-08-28T06:32:01.000Z',
      expiresAt: '2026-08-28T06:37:01.000Z',
    }), schemas, now),
    /ENVELOPE_TIME_INVALID/,
  );
});

test('recomputes intake clarification approval and amendment idempotency', () => {
  for (const envelope of [
    intakeEnvelope(),
    clarificationEnvelope(),
    approvalEnvelope(),
    approvalEnvelope('amend'),
  ]) {
    assert.equal(recomputeIdempotencyKey(envelope), envelope.idempotencyKey);
    assert.doesNotThrow(() => assertEnvelopeBindings(envelope, envelope.idempotencyKey));
  }
});

test('rejects payload amendment and header-key substitution', () => {
  const intake = intakeEnvelope();
  assert.throws(
    () => assertEnvelopeBindings({ ...intake, payload: { text: 'Changed' } }, intake.idempotencyKey),
    /PAYLOAD_HASH_MISMATCH/,
  );
  const amendment = approvalEnvelope('amend');
  assert.throws(
    () => assertEnvelopeBindings({
      ...amendment,
      amendment: { instruction: 'Changed after issue.' },
    }, amendment.idempotencyKey),
    /AMENDMENT_HASH_MISMATCH/,
  );
  assert.throws(
    () => assertEnvelopeBindings(intake, '9'.repeat(64)),
    /IDEMPOTENCY_KEY_MISMATCH/,
  );
});
