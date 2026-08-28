var PPD = PPD || {};

PPD.Approvals = (function () {
  var DECISIONS = Object.freeze(['approve', 'reject', 'amend', 'explain', 'remind_me']);
  var MAX_SNAPSHOT_MS = 24 * 60 * 60 * 1000;
  var DECISION_TTL_MS = 5 * 60 * 1000;

  function parametersFromEvent(event) {
    var output = {};
    var allowed = [
      'decision',
      'approvalHandle',
      'requestId',
      'correlationId',
      'expectedActionPayloadHash',
    ];
    var common = event && event.common && event.common.parameters;
    if (common) {
      allowed.forEach(function (key) {
        if (typeof common[key] === 'string') output[key] = common[key];
      });
    }
    var legacy = event && event.action && event.action.parameters;
    if (Array.isArray(legacy)) {
      legacy.forEach(function (item) {
        if (item && allowed.indexOf(item.key) !== -1 && typeof item.value === 'string') {
          output[item.key] = item.value;
        }
      });
    }
    return output;
  }

  function requirePattern(value, pattern, code, message) {
    var text = String(value || '');
    if (!pattern.test(text)) throw PPD.Errors.create(code, message);
    return text;
  }

  function decisionTime(event, config) {
    var created = new Date(event && event.eventTime);
    var now = new Date(config.now());
    if (Number.isNaN(created.getTime()) ||
        created.getTime() < now.getTime() - DECISION_TTL_MS ||
        created.getTime() > now.getTime() + 2 * 60 * 1000) {
      throw PPD.Errors.create('APPROVAL_EVENT_EXPIRED', 'The approval decision event is expired.');
    }
    return {
      createdAt: created.toISOString(),
      expiresAt: new Date(created.getTime() + DECISION_TTL_MS).toISOString(),
    };
  }

  function fromEvent(event, config) {
    var values = parametersFromEvent(event);
    if (DECISIONS.indexOf(values.decision) === -1) {
      throw PPD.Errors.create('APPROVAL_DECISION_INVALID', 'The approval decision is invalid.');
    }
    var approvalHandle = requirePattern(
      values.approvalHandle,
      /^apr_[a-f0-9]{32}$/,
      'APPROVAL_HANDLE_INVALID',
      'The approval handle is invalid.'
    );
    var requestId = requirePattern(values.requestId, /^req_[a-f0-9]{32}$/, 'APPROVAL_REQUEST_INVALID', 'The approval request binding is invalid.');
    var correlationId = requirePattern(values.correlationId, /^cor_[a-f0-9]{32}$/, 'APPROVAL_CORRELATION_INVALID', 'The approval correlation binding is invalid.');
    var hash = requirePattern(values.expectedActionPayloadHash, /^[a-f0-9]{64}$/, 'APPROVAL_HASH_INVALID', 'The approval action hash is invalid.');
    var actor = PPD.Identity.fromEvent(event, config);
    var scope = PPD.ScopePolicy.fromEvent(event);
    var clock = decisionTime(event, config);
    var decisionId = PPD.Canonical.id('dec', {
      approvalHandle: approvalHandle,
      decision: values.decision,
      actor: actor.chatUserName,
      source: scope.spaceName,
      eventTime: clock.createdAt,
      expectedActionPayloadHash: hash,
    });
    var envelope = {
      schemaVersion: 'ppd.cos.approval-decision.v1',
      eventType: 'approval.decision_submitted',
      decisionId: decisionId,
      approvalHandle: approvalHandle,
      decision: values.decision,
      requestId: requestId,
      correlationId: correlationId,
      actor: actor,
      source: {
        platform: 'google_chat',
        spaceName: scope.spaceName,
        spaceType: scope.spaceType,
        channel: scope.channel,
        threadName: event.message && event.message.thread && event.message.thread.name || null,
        messageName: event.message && event.message.name || null,
      },
      expectedActionPayloadHash: hash,
      createdAt: clock.createdAt,
      expiresAt: clock.expiresAt,
      idempotencyKey: null,
      adapter: { name: 'ppd-google-chat-cos-adapter', version: config.adapterVersion },
    };
    envelope.idempotencyKey = PPD.Canonical.sha256({
      schemaVersion: envelope.schemaVersion,
      decisionId: decisionId,
      approvalHandle: approvalHandle,
      decision: envelope.decision,
      actor: actor.chatUserName,
      requestId: requestId,
      expectedActionPayloadHash: hash,
    });
    return PPD.Envelopes && PPD.Envelopes.deepFreeze
      ? PPD.Envelopes.deepFreeze(envelope)
      : Object.freeze(envelope);
  }

  function validateSnapshot(snapshot, actor, nowValue, expectedHash) {
    if (!snapshot || !/^apr_[a-f0-9]{32}$/.test(String(snapshot.approvalHandle || ''))) {
      throw PPD.Errors.create('APPROVAL_SNAPSHOT_INVALID', 'The approval snapshot is invalid.');
    }
    var actorName = String(actor && actor.chatUserName || '');
    if (!/^users\/[A-Za-z0-9._@-]+$/.test(actorName)) {
      throw PPD.Errors.create('APPROVER_IDENTITY_INVALID', 'The approver identity is invalid.');
    }
    if (actorName === snapshot.proposedBy) {
      throw PPD.Errors.create('APPROVAL_SELF_DENIED', 'The proposal cannot use self-approval.');
    }
    if (!Array.isArray(snapshot.permittedApprovers) || snapshot.permittedApprovers.indexOf(actorName) === -1) {
      throw PPD.Errors.create('APPROVER_NOT_DESIGNATED', 'This identity is not designated to approve the proposal.');
    }
    if (!/^[a-f0-9]{64}$/.test(String(snapshot.actionPayloadHash || ''))) {
      throw PPD.Errors.create('APPROVAL_HASH_INVALID', 'The approval action hash is invalid.');
    }
    if (expectedHash && !PPD.Canonical.equalHex(snapshot.actionPayloadHash, expectedHash)) {
      throw PPD.Errors.create('APPROVAL_ACTION_CHANGED', 'The proposed action changed after the approval was issued.');
    }
    if (!snapshot.policyVersion || !snapshot.target || !snapshot.actionSummary) {
      throw PPD.Errors.create('APPROVAL_BINDING_INCOMPLETE', 'The approval snapshot binding is incomplete.');
    }
    if (snapshot.consumedAt) {
      throw PPD.Errors.create('APPROVAL_ALREADY_USED', 'This approval was already used.');
    }
    var issuedAt = new Date(snapshot.issuedAt).getTime();
    var expiresAt = new Date(snapshot.expiresAt).getTime();
    var now = new Date(nowValue).getTime();
    if (!Number.isFinite(issuedAt) || !Number.isFinite(expiresAt) || !Number.isFinite(now) ||
        expiresAt <= issuedAt || expiresAt - issuedAt > MAX_SNAPSHOT_MS || now > expiresAt) {
      throw PPD.Errors.create('APPROVAL_EXPIRED', 'The approval snapshot is expired or has an invalid expiry.');
    }
    return true;
  }

  function amendmentFromEvent(event, config, instruction) {
    var base = fromEvent(event, config);
    if (base.decision !== 'amend') {
      throw PPD.Errors.create('AMENDMENT_DECISION_INVALID', 'The amendment decision is invalid.');
    }
    var text = String(instruction || '').trim();
    if (!text) throw PPD.Errors.create('AMENDMENT_EMPTY', 'The amendment is empty.');
    if (text.length > 4096) throw PPD.Errors.create('AMENDMENT_TOO_LONG', 'The amendment is too long.');
    var amendment = { instruction: text };
    var amendmentHash = PPD.Canonical.sha256(amendment);
    var decisionId = PPD.Canonical.id('dec', {
      priorDecisionId: base.decisionId,
      amendmentHash: amendmentHash,
    });
    var output = {
      schemaVersion: base.schemaVersion,
      eventType: base.eventType,
      decisionId: decisionId,
      approvalHandle: base.approvalHandle,
      decision: base.decision,
      requestId: base.requestId,
      correlationId: base.correlationId,
      actor: base.actor,
      source: base.source,
      expectedActionPayloadHash: base.expectedActionPayloadHash,
      amendment: amendment,
      amendmentHash: amendmentHash,
      createdAt: base.createdAt,
      expiresAt: base.expiresAt,
      idempotencyKey: PPD.Canonical.sha256({
        schemaVersion: base.schemaVersion,
        decisionId: decisionId,
        approvalHandle: base.approvalHandle,
        actor: base.actor.chatUserName,
        requestId: base.requestId,
        expectedActionPayloadHash: base.expectedActionPayloadHash,
        amendmentHash: amendmentHash,
      }),
      adapter: base.adapter,
    };
    return PPD.Envelopes && PPD.Envelopes.deepFreeze
      ? PPD.Envelopes.deepFreeze(output)
      : Object.freeze(output);
  }

  return Object.freeze({
    decisions: DECISIONS,
    parametersFromEvent: parametersFromEvent,
    fromEvent: fromEvent,
    amendmentFromEvent: amendmentFromEvent,
    validateSnapshot: validateSnapshot,
  });
}());
