import path from 'node:path';

import type { SignedRequest } from '../../src/auth/verify-adapter-request.js';
import { canonicalStringify, hmacSha256Hex, sha256Hex } from '../../src/canonical/canonical-json.js';
import { createSchemaRegistry } from '../../src/contracts/schema-registry.js';
import type { ValidatedEnvelope } from '../../src/contracts/envelopes.js';

export const fixtureNow = new Date('2026-08-28T06:30:00.000Z');
export const fixtureKey = Buffer.from('synthetic-intake-test-key-only', 'utf8');
export const fixtureKeyId = 'test-key-1';
export const fixtureSchemas = createSchemaRegistry(
  path.resolve(import.meta.dirname, '../../schemas'),
);

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

export function intakeEnvelope(): ValidatedEnvelope {
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

export function approvalEnvelope(): ValidatedEnvelope {
  const envelope = {
    ...common,
    schemaVersion: 'ppd.cos.approval-decision.v1' as const,
    eventType: 'approval.decision_submitted',
    decisionId: `dec_${'2'.repeat(32)}`,
    approvalHandle: `apr_${'3'.repeat(32)}`,
    decision: 'approve',
    expectedActionPayloadHash: '4'.repeat(64),
    idempotencyKey: '',
  };
  envelope.idempotencyKey = sha256Hex({
    schemaVersion: envelope.schemaVersion,
    decisionId: envelope.decisionId,
    approvalHandle: envelope.approvalHandle,
    decision: envelope.decision,
    actor: envelope.actor.chatUserName,
    requestId: envelope.requestId,
    expectedActionPayloadHash: envelope.expectedActionPayloadHash,
  });
  return envelope;
}

export function signedRequest(envelope: ValidatedEnvelope = intakeEnvelope()): SignedRequest {
  const rawBody = Buffer.from(canonicalStringify(envelope), 'utf8');
  const timestamp = fixtureNow.toISOString();
  const signatureInput = [
    'POST',
    '/v1/intake-events',
    timestamp,
    envelope.idempotencyKey,
    sha256Hex(rawBody.toString('utf8')),
  ].join('\n');
  return {
    method: 'POST',
    path: '/v1/intake-events',
    rawBody,
    headers: {
      keyId: fixtureKeyId,
      timestamp,
      idempotencyKey: envelope.idempotencyKey,
      signature: `v1=${hmacSha256Hex(signatureInput, fixtureKey)}`,
    },
  };
}
