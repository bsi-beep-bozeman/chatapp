const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { loadGs } = require('./helpers/load-gs');
const { cardEvent } = require('./fixtures/events');

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
  ['Errors.gs', 'CanonicalJson.gs', 'Identity.gs', 'ScopePolicy.gs', 'ApprovalActions.gs', 'Cards.gs'],
  { Utilities: utilities }
);
const config = {
  adapterVersion: '0.1.0',
  companyDomain: 'ppdpainting.com',
  expectedWorkspaceDomainId: null,
  now: () => NOW,
};
const snapshot = {
  approvalHandle: `apr_${'a'.repeat(32)}`,
  requestId: `req_${'b'.repeat(32)}`,
  correlationId: `cor_${'c'.repeat(32)}`,
  proposedBy: 'users/requester',
  permittedApprovers: ['users/123456789'],
  actionSummary: 'Set deal stage to Closed Won',
  target: 'HubSpot deal 8291',
  actionPayloadHash: 'd'.repeat(64),
  policyVersion: 'access-2026-08-27',
  issuedAt: '2026-08-27T00:00:00.000Z',
  expiresAt: '2026-08-27T01:00:00.000Z',
  consumedAt: null,
};

function approvalEvent(decision = 'approve', overrides = {}) {
  return cardEvent({
    decision,
    approvalHandle: snapshot.approvalHandle,
    requestId: snapshot.requestId,
    correlationId: snapshot.correlationId,
    expectedActionPayloadHash: snapshot.actionPayloadHash,
  }, overrides);
}

test('approval card contains all five exact actions and displays target, hash, and expiry', () => {
  const card = ctx.PPD.Cards.approval(snapshot);
  const json = JSON.stringify(card);
  for (const label of ['Approve', 'Reject', 'Amend', 'Explain', 'Remind Me']) {
    assert.match(json, new RegExp(label));
  }
  assert.match(json, /HubSpot deal 8291/);
  assert.match(json, new RegExp(snapshot.actionPayloadHash.slice(0, 12)));
  assert.match(json, /2026-08-27T01:00:00.000Z/);
  assert.equal(json.includes('secret-field-value'), false);
});

test('amend opens a dialog and other controls submit fixed actions', () => {
  const buttons = ctx.PPD.Cards.approval(snapshot).cardsV2[0].card.sections[1].widgets[0].buttonList.buttons;
  const amend = buttons.find((button) => button.text === 'Amend');
  const approve = buttons.find((button) => button.text === 'Approve');
  assert.equal(amend.onClick.action.interaction, 'OPEN_DIALOG');
  assert.equal(approve.onClick.action.function, 'handleApprovalAction');
});

test('decision envelope ignores caller permission flags and binds event identity', () => {
  const event = approvalEvent();
  event.action.parameters.push({ key: 'canApprove', value: 'true' });
  const decision = ctx.PPD.Approvals.fromEvent(event, config);
  assert.equal(decision.schemaVersion, 'ppd.cos.approval-decision.v1');
  assert.equal(decision.actor.chatUserName, event.user.name);
  assert.equal(decision.expectedActionPayloadHash, snapshot.actionPayloadHash);
  assert.match(decision.decisionId, /^dec_[a-f0-9]{32}$/);
  assert.equal(JSON.stringify(decision).includes('canApprove'), false);
});

test('only the five exact decisions are accepted', () => {
  for (const decision of ['approve', 'reject', 'amend', 'explain', 'remind_me']) {
    assert.equal(ctx.PPD.Approvals.fromEvent(approvalEvent(decision), config).decision, decision);
  }
  assert.throws(() => ctx.PPD.Approvals.fromEvent(approvalEvent('override'), config), /decision/);
});

test('self approval, unauthorized approver, expiry, consumption, and invalid hash fail closed', () => {
  assert.throws(
    () => ctx.PPD.Approvals.validateSnapshot(snapshot, { chatUserName: snapshot.proposedBy }, NOW),
    /self-approval/
  );
  assert.throws(
    () => ctx.PPD.Approvals.validateSnapshot(snapshot, { chatUserName: 'users/not-listed' }, NOW),
    /not designated/
  );
  assert.throws(
    () => ctx.PPD.Approvals.validateSnapshot({ ...snapshot, expiresAt: '2026-08-26T00:00:00.000Z' }, { chatUserName: 'users/123456789' }, NOW),
    /expired/
  );
  assert.throws(
    () => ctx.PPD.Approvals.validateSnapshot({ ...snapshot, consumedAt: '2026-08-27T00:01:00.000Z' }, { chatUserName: 'users/123456789' }, NOW),
    /already used/
  );
  assert.throws(
    () => ctx.PPD.Approvals.validateSnapshot({ ...snapshot, actionPayloadHash: 'bad' }, { chatUserName: 'users/123456789' }, NOW),
    /hash/
  );
});

test('snapshot validation compares the exact expected action hash', () => {
  assert.equal(
    ctx.PPD.Approvals.validateSnapshot(snapshot, { chatUserName: 'users/123456789' }, NOW, snapshot.actionPayloadHash),
    true
  );
  assert.throws(
    () => ctx.PPD.Approvals.validateSnapshot(snapshot, { chatUserName: 'users/123456789' }, NOW, 'e'.repeat(64)),
    /changed/
  );
});

test('approval bindings, event age, and legacy parameters fail closed or normalize safely', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.PPD.Approvals.parametersFromEvent(null))), {});
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.PPD.Approvals.parametersFromEvent({
    common: { parameters: { decision: 42, approvalHandle: snapshot.approvalHandle } },
    action: { parameters: [null, { key: 'requestId', value: snapshot.requestId }, { key: 'role', value: 'owner' }] },
  }))), { approvalHandle: snapshot.approvalHandle, requestId: snapshot.requestId });

  for (const [field, value] of [
    ['approvalHandle', 'apr_bad'],
    ['requestId', 'req_bad'],
    ['correlationId', 'cor_bad'],
    ['expectedActionPayloadHash', 'bad'],
  ]) {
    const event = approvalEvent();
    event.action.parameters.find((parameter) => parameter.key === field).value = value;
    assert.throws(
      () => ctx.PPD.Approvals.fromEvent(event, config),
      /invalid/
    );
  }
  assert.throws(
    () => ctx.PPD.Approvals.fromEvent(approvalEvent('approve', { eventTime: '2026-08-26T23:54:59.000Z' }), config),
    /expired/
  );
  assert.throws(
    () => ctx.PPD.Approvals.fromEvent(approvalEvent('approve', { eventTime: '2026-08-27T00:02:01.000Z' }), config),
    /expired/
  );
});

test('approval snapshot validates every durable binding and time bound', () => {
  const actor = { chatUserName: 'users/123456789' };
  assert.throws(() => ctx.PPD.Approvals.validateSnapshot(null, actor, NOW), /snapshot/);
  assert.throws(() => ctx.PPD.Approvals.validateSnapshot(snapshot, {}, NOW), /identity/);
  assert.throws(
    () => ctx.PPD.Approvals.validateSnapshot({ ...snapshot, policyVersion: '' }, actor, NOW),
    /incomplete/
  );
  assert.throws(
    () => ctx.PPD.Approvals.validateSnapshot({ ...snapshot, issuedAt: 'invalid' }, actor, NOW),
    /expired/
  );
  assert.throws(
    () => ctx.PPD.Approvals.validateSnapshot({ ...snapshot, expiresAt: snapshot.issuedAt }, actor, NOW),
    /expired/
  );
  assert.throws(
    () => ctx.PPD.Approvals.validateSnapshot({ ...snapshot, expiresAt: '2026-08-28T00:00:00.001Z' }, actor, NOW),
    /expired/
  );
  assert.throws(() => ctx.PPD.Approvals.validateSnapshot(snapshot, actor, 'invalid'), /expired/);
});

test('amendment creates a distinct immutable decision and rejects invalid submissions', () => {
  assert.throws(
    () => ctx.PPD.Approvals.amendmentFromEvent(approvalEvent('approve'), config, 'Change it'),
    /amendment decision/
  );
  assert.throws(() => ctx.PPD.Approvals.amendmentFromEvent(approvalEvent('amend'), config, ' '), /empty/);
  assert.throws(
    () => ctx.PPD.Approvals.amendmentFromEvent(approvalEvent('amend'), config, 'x'.repeat(4097)),
    /too long/
  );
  const amended = ctx.PPD.Approvals.amendmentFromEvent(approvalEvent('amend'), config, 'Change target date');
  assert.equal(amended.decision, 'amend');
  assert.match(amended.amendmentHash, /^[a-f0-9]{64}$/);
  assert.equal(Object.isFrozen(amended), true);
});

test('card helpers fail closed and render bounded dialog states', () => {
  assert.throws(() => ctx.PPD.Cards.approval(null), /safely/);
  assert.equal(ctx.PPD.Cards.status({ state: 'unknown' }).text, ctx.PPD.Cards.status(null).text);
  assert.equal(ctx.PPD.Cards.dialogStatus({ state: 'accepted' }).actionResponse.dialogAction.actionStatus.statusCode, 'OK');
  assert.equal(ctx.PPD.Cards.dialogStatus({ state: 'rejected' }).actionResponse.dialogAction.actionStatus.statusCode, 'FAILED_PRECONDITION');
  assert.match(ctx.PPD.Cards.welcome({ channel: 'dm' }, { state: 'accepted' }).text, /direct message/);
  assert.match(ctx.PPD.Cards.welcome({ channel: 'shared' }, { state: 'accepted' }).text, /shared space/);
  assert.match(ctx.PPD.Cards.escapeHtml(`<>&"'`), /&lt;&gt;&amp;&quot;&#39;/);
  assert.equal(
    ctx.PPD.Cards.clarificationDialog({ requestId: snapshot.requestId }, '<target?>')
      .actionResponse.dialogAction.dialog.body.sections[0].widgets[0].textParagraph.text,
    '&lt;target?&gt;'
  );
});
