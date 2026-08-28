const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { loadGs } = require('./helpers/load-gs');
const { messageEvent, cardEvent, removeEvent } = require('./fixtures/events');

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
const ctx = loadGs([
  'Errors.gs',
  'CanonicalJson.gs',
  'Identity.gs',
  'ScopePolicy.gs',
  'EventEnvelope.gs',
  'ApprovalActions.gs',
  'Transport.gs',
  'Cards.gs',
  'EntryPoints.gs',
], { Utilities: utilities });
const config = {
  adapterVersion: '0.1.0',
  companyDomain: 'ppdpainting.com',
  expectedWorkspaceDomainId: null,
  now: () => NOW,
};
const accepted = {
  schemaVersion: 'ppd.cos.ingestion-result.v1',
  state: 'accepted',
  receiptId: 'rcpt_one',
};

function deps(transport) {
  return { config, transport };
}

function approvalParameters(decision = 'approve') {
  return {
    decision,
    approvalHandle: `apr_${'a'.repeat(32)}`,
    requestId: `req_${'b'.repeat(32)}`,
    correlationId: `cor_${'c'.repeat(32)}`,
    expectedActionPayloadHash: 'd'.repeat(64),
  };
}

test('DM message submits one proposal and renders an accepted receipt', () => {
  const transport = ctx.PPD.Transport.scripted(accepted);
  const response = ctx.PPD.EntryPoints.onMessage(messageEvent(), deps(transport));
  assert.equal(transport.sent.length, 1);
  assert.match(response.text, /Request received/);
  assert.match(response.text, /evaluate identity and access/);
});

test('shared message returns generic text without request or identity content', () => {
  const event = messageEvent({ space: { name: 'spaces/S1', spaceType: 'SPACE' } });
  const response = ctx.PPD.EntryPoints.onMessage(event, deps(ctx.PPD.Transport.scripted(accepted)));
  const serialized = JSON.stringify(response);
  assert.equal(serialized.includes('Plan tomorrow'), false);
  assert.equal(serialized.includes('tester@ppdpainting.com'), false);
  assert.equal(serialized.includes('users/123456789'), false);
});

test('disabled transport says intake is not connected and nothing changed', () => {
  const response = ctx.PPD.EntryPoints.onMessage(messageEvent(), deps(ctx.PPD.Transport.unavailable()));
  assert.match(response.text, /not connected yet/);
  assert.match(response.text, /Nothing was queued or changed/);
});

test('duplicate and rejected results use explicit safe responses', () => {
  const duplicate = ctx.PPD.EntryPoints.onMessage(messageEvent(), deps(ctx.PPD.Transport.scripted({
    schemaVersion: 'ppd.cos.ingestion-result.v1', state: 'duplicate', receiptId: 'rcpt_one',
  })));
  const rejected = ctx.PPD.EntryPoints.onMessage(messageEvent(), deps(ctx.PPD.Transport.scripted({
    schemaVersion: 'ppd.cos.ingestion-result.v1', state: 'rejected', code: 'POLICY_DENIED',
  })));
  assert.match(duplicate.text, /already received/);
  assert.match(rejected.text, /not accepted/);
});

test('add and remove events submit non-destructive lifecycle proposals', () => {
  const transport = ctx.PPD.Transport.scripted([accepted, accepted]);
  const added = ctx.PPD.EntryPoints.onAddToSpace(messageEvent({ type: 'ADDED_TO_SPACE', message: {} }), deps(transport));
  const removed = ctx.PPD.EntryPoints.onRemoveFromSpace(removeEvent(), deps(transport));
  assert.match(added.text, /proposal-only/);
  assert.equal(removed, undefined);
  assert.deepEqual(
    JSON.parse(JSON.stringify(transport.sent.map((event) => event.eventType))),
    ['space.added', 'space.removed']
  );
});

test('approve, reject, explain, and remind controls submit one immutable decision', () => {
  for (const decision of ['approve', 'reject', 'explain', 'remind_me']) {
    const transport = ctx.PPD.Transport.scripted(accepted);
    const response = ctx.PPD.EntryPoints.onCardClick(cardEvent(approvalParameters(decision)), deps(transport));
    assert.equal(transport.sent.length, 1);
    assert.equal(transport.sent[0].decision, decision);
    assert.match(response.text, /Request received/);
  }
});

test('amend click opens a private dialog without submitting state', () => {
  const transport = ctx.PPD.Transport.scripted(accepted);
  const event = cardEvent(approvalParameters('amend'), { dialogEventType: 'REQUEST_DIALOG' });
  const response = ctx.PPD.EntryPoints.onCardClick(event, deps(transport));
  assert.equal(transport.sent.length, 0);
  assert.equal(response.actionResponse.type, 'DIALOG');
  assert.equal(JSON.stringify(response).includes('submitApprovalAmendment'), true);
});

test('amend dialog submission creates a new hashed proposal event', () => {
  const transport = ctx.PPD.Transport.scripted(accepted);
  const event = cardEvent(approvalParameters('amend'), {
    dialogEventType: 'SUBMIT_DIALOG',
    common: {
      formInputs: {
        amendment: { stringInputs: { value: ['Change the target date to Friday.'] } },
      },
    },
  });
  const response = ctx.PPD.EntryPoints.onCardClick(event, deps(transport));
  assert.equal(transport.sent.length, 1);
  assert.equal(transport.sent[0].decision, 'amend');
  assert.match(transport.sent[0].amendmentHash, /^[a-f0-9]{64}$/);
  assert.equal(Object.isFrozen(transport.sent[0]), true);
  assert.equal(response.actionResponse.type, 'DIALOG');
});

test('clarification dialog submission emits a new clarification proposal', () => {
  const transport = ctx.PPD.Transport.scripted(accepted);
  const event = cardEvent({
    clarificationHandle: `clar_${'a'.repeat(32)}`,
    requestId: `req_${'b'.repeat(32)}`,
    correlationId: `cor_${'c'.repeat(32)}`,
  }, {
    dialogEventType: 'SUBMIT_DIALOG',
    common: {
      invokedFunction: 'submitClarification',
      formInputs: { clarification: { stringInputs: { value: ['Job 8291'] } } },
    },
  });
  const response = ctx.PPD.EntryPoints.onCardClick(event, deps(transport));
  assert.equal(transport.sent[0].schemaVersion, 'ppd.cos.clarification-answer.v1');
  assert.deepEqual(JSON.parse(JSON.stringify(transport.sent[0].payload)), { answer: 'Job 8291' });
  assert.equal(response.actionResponse.type, 'DIALOG');
});

test('malformed events return a redacted refusal and submit nothing', () => {
  const transport = ctx.PPD.Transport.scripted(accepted);
  const event = messageEvent({ user: { name: 'claimed@example.invalid' } });
  const response = ctx.PPD.EntryPoints.onMessage(event, deps(transport));
  assert.equal(transport.sent.length, 0);
  assert.equal(response.text.includes('claimed@example.invalid'), false);
  assert.match(response.text, /could not be verified/);
});
