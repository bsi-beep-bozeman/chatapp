const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { loadGs } = require('./helpers/load-gs');
const { messageEvent } = require('./fixtures/events');

const NOW = Date.parse('2026-08-27T00:00:00.000Z');
const utilities = {
  Charset: { UTF_8: 'UTF_8' },
  DigestAlgorithm: { SHA_256: 'SHA_256' },
  MacAlgorithm: { HMAC_SHA_256: 'HMAC_SHA_256' },
  computeDigest: (_algorithm, value) => [...crypto.createHash('sha256').update(value).digest()],
  computeHmacSignature: (_algorithm, value, key) => [
    ...crypto.createHmac('sha256', key).update(value).digest(),
  ],
};
const ctx = loadGs(
  ['Errors.gs', 'CanonicalJson.gs', 'Identity.gs', 'ScopePolicy.gs', 'EventEnvelope.gs'],
  { Utilities: utilities }
);
const config = {
  adapterVersion: '0.1.0',
  companyDomain: 'ppdpainting.com',
  expectedWorkspaceDomainId: null,
  now: () => NOW,
};

test('intake envelope binds identity, source, IDs, purpose, hash, expiry, and idempotency', () => {
  const envelope = ctx.PPD.Envelopes.intake(messageEvent(), config);
  assert.equal(envelope.schemaVersion, 'ppd.cos.intake.v1');
  assert.equal(envelope.eventType, 'request.submitted');
  assert.equal(envelope.actor.chatUserName, 'users/123456789');
  assert.equal(envelope.source.spaceName, 'spaces/DM1');
  assert.equal(envelope.purpose, 'general_assistance');
  assert.match(envelope.eventId, /^evt_[a-f0-9]{32}$/);
  assert.match(envelope.eventUpdateId, /^upd_[a-f0-9]{32}$/);
  assert.match(envelope.requestId, /^req_[a-f0-9]{32}$/);
  assert.match(envelope.correlationId, /^cor_[a-f0-9]{32}$/);
  assert.match(envelope.payloadHash, /^[a-f0-9]{64}$/);
  assert.match(envelope.idempotencyKey, /^[a-f0-9]{64}$/);
  assert.equal(Date.parse(envelope.expiresAt) - Date.parse(envelope.createdAt), 300000);
  assert.equal(Object.isFrozen(envelope), true);
  assert.equal(Object.isFrozen(envelope.actor), true);
});

test('retries produce identical envelopes and changed text changes only update-bound values', () => {
  const first = ctx.PPD.Envelopes.intake(messageEvent(), config);
  const retry = ctx.PPD.Envelopes.intake(messageEvent(), config);
  const changed = ctx.PPD.Envelopes.intake(messageEvent({ message: { text: 'Plan next week' } }), config);
  assert.equal(ctx.PPD.Canonical.stringify(first), ctx.PPD.Canonical.stringify(retry));
  assert.equal(first.eventId, changed.eventId);
  assert.notEqual(first.eventUpdateId, changed.eventUpdateId);
  assert.notEqual(first.payloadHash, changed.payloadHash);
  assert.notEqual(first.idempotencyKey, changed.idempotencyKey);
});

test('unknown permission-like event fields are not forwarded', () => {
  const event = messageEvent({ role: 'owner', canExecute: true });
  event.user.displayName = 'Owner';
  const serialized = JSON.stringify(ctx.PPD.Envelopes.intake(event, config));
  assert.equal(serialized.includes('canExecute'), false);
  assert.equal(serialized.includes('displayName'), false);
  assert.equal(serialized.includes('"role"'), false);
});

test('stale, future, empty, and oversized messages are rejected', () => {
  assert.throws(
    () => ctx.PPD.Envelopes.intake(messageEvent({ eventTime: '2026-08-26T23:54:59.999Z' }), config),
    /expired/
  );
  assert.throws(
    () => ctx.PPD.Envelopes.intake(messageEvent({ eventTime: '2026-08-27T00:02:00.001Z' }), config),
    /invalid time/
  );
  assert.throws(() => ctx.PPD.Envelopes.intake(messageEvent({ message: { text: ' ' } }), config), /empty/);
  assert.throws(
    () => ctx.PPD.Envelopes.intake(messageEvent({ message: { text: 'x'.repeat(16385) } }), config),
    /too long/
  );
});

test('clarification answer inherits request bindings and creates a new immutable proposal', () => {
  const event = messageEvent({ type: 'CARD_CLICKED' });
  const answer = ctx.PPD.Envelopes.clarification(event, config, {
    clarificationHandle: `clar_${'a'.repeat(32)}`,
    requestId: `req_${'b'.repeat(32)}`,
    correlationId: `cor_${'c'.repeat(32)}`,
  }, 'The target is Job 8291.');
  assert.equal(answer.schemaVersion, 'ppd.cos.clarification-answer.v1');
  assert.equal(answer.eventType, 'clarification.answered');
  assert.equal(answer.requestId, `req_${'b'.repeat(32)}`);
  assert.equal(answer.correlationId, `cor_${'c'.repeat(32)}`);
  assert.deepEqual(JSON.parse(JSON.stringify(answer.payload)), { answer: 'The target is Job 8291.' });
  assert.equal(Object.isFrozen(answer), true);
});

test('clarification rejects malformed bindings and oversized answers', () => {
  const event = messageEvent({ type: 'CARD_CLICKED' });
  assert.throws(
    () => ctx.PPD.Envelopes.clarification(event, config, {
      clarificationHandle: 'clar_bad', requestId: `req_${'b'.repeat(32)}`, correlationId: `cor_${'c'.repeat(32)}`,
    }, 'answer'),
    /handle/
  );
  assert.throws(
    () => ctx.PPD.Envelopes.clarification(event, config, {
      clarificationHandle: `clar_${'a'.repeat(32)}`, requestId: `req_${'b'.repeat(32)}`, correlationId: `cor_${'c'.repeat(32)}`,
    }, 'x'.repeat(4097)),
    /too long/
  );
});
