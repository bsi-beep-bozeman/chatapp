var PPD = PPD || {};

PPD.Envelopes = (function () {
  var EVENT_TTL_MS = 5 * 60 * 1000;
  var FUTURE_SKEW_MS = 2 * 60 * 1000;

  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.keys(value).forEach(function (key) { deepFreeze(value[key]); });
    return Object.freeze(value);
  }

  function validateTime(event, config) {
    var created = new Date(event && event.eventTime);
    var now = new Date(config.now());
    if (Number.isNaN(created.getTime()) || Number.isNaN(now.getTime())) {
      throw PPD.Errors.create('EVENT_TIME_INVALID', 'The Chat event has an invalid time.');
    }
    if (created.getTime() < now.getTime() - EVENT_TTL_MS) {
      throw PPD.Errors.create('EVENT_EXPIRED', 'The Chat event is expired.');
    }
    if (created.getTime() > now.getTime() + FUTURE_SKEW_MS) {
      throw PPD.Errors.create('EVENT_TIME_INVALID', 'The Chat event has an invalid time.');
    }
    return Object.freeze({
      createdAt: created.toISOString(),
      expiresAt: new Date(created.getTime() + EVENT_TTL_MS).toISOString(),
    });
  }

  function requirePrefixedId(value, prefix, code, message) {
    var pattern = new RegExp('^' + prefix + '_[a-f0-9]{32}$');
    var text = String(value || '');
    if (!pattern.test(text)) throw PPD.Errors.create(code, message);
    return text;
  }

  function sourceFromEvent(event, scope) {
    var message = event.message || {};
    var messageName = message.name ? String(message.name) : null;
    var threadName = message.thread && message.thread.name
      ? String(message.thread.name)
      : (event.thread && event.thread.name ? String(event.thread.name) : null);
    return {
      platform: 'google_chat',
      spaceName: scope.spaceName,
      spaceType: scope.spaceType,
      channel: scope.channel,
      threadName: threadName,
      messageName: messageName,
    };
  }

  function purposeFromEvent(event) {
    var candidate = event && event.common && event.common.parameters
      ? event.common.parameters.purpose
      : null;
    var purpose = String(candidate || 'general_assistance').trim();
    if (!purpose || purpose.length > 256) {
      throw PPD.Errors.create('PURPOSE_INVALID', 'The request purpose is invalid.');
    }
    return purpose;
  }

  function idempotencyFor(envelope) {
    return PPD.Canonical.sha256({
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

  function intake(event, config) {
    var actor = PPD.Identity.fromEvent(event, config);
    var scope = PPD.ScopePolicy.fromEvent(event);
    var message = event.message || {};
    var messageName = String(message.name || '').trim();
    if (!/^spaces\/[A-Za-z0-9_-]+\/messages\/[A-Za-z0-9_.-]+$/.test(messageName)) {
      throw PPD.Errors.create('MESSAGE_IDENTITY_INVALID', 'The Chat message identity is invalid.');
    }
    var text = String(message.text || '').trim();
    if (!text) throw PPD.Errors.create('MESSAGE_EMPTY', 'The request text is empty.');
    if (text.length > 16384) throw PPD.Errors.create('MESSAGE_TOO_LONG', 'The request text is too long.');

    var clock = validateTime(event, config);
    var eventCore = {
      actor: actor.chatUserName,
      space: scope.spaceName,
      message: messageName,
      eventTime: clock.createdAt,
    };
    var eventId = PPD.Canonical.id('evt', eventCore);
    var eventUpdateId = PPD.Canonical.id('upd', { event: eventCore, text: text });
    var payload = { text: text };
    var payloadHash = PPD.Canonical.sha256(payload);
    var requestId = PPD.Canonical.id('req', eventId);
    var correlationId = PPD.Canonical.id('cor', eventId);
    var envelope = {
      schemaVersion: 'ppd.cos.intake.v1',
      eventType: 'request.submitted',
      eventId: eventId,
      eventUpdateId: eventUpdateId,
      requestId: requestId,
      correlationId: correlationId,
      actor: actor,
      source: sourceFromEvent(event, scope),
      purpose: purposeFromEvent(event),
      payload: payload,
      payloadHash: payloadHash,
      createdAt: clock.createdAt,
      expiresAt: clock.expiresAt,
      idempotencyKey: null,
      adapter: {
        name: 'ppd-google-chat-cos-adapter',
        version: config.adapterVersion,
      },
    };
    envelope.idempotencyKey = idempotencyFor(envelope);
    return deepFreeze(envelope);
  }

  function clarification(event, config, parameters, answer) {
    var actor = PPD.Identity.fromEvent(event, config);
    var scope = PPD.ScopePolicy.fromEvent(event);
    var bindings = parameters || {};
    var clarificationHandle = requirePrefixedId(
      bindings.clarificationHandle,
      'clar',
      'CLARIFICATION_HANDLE_INVALID',
      'Clarification handle is invalid.'
    );
    var requestId = requirePrefixedId(
      bindings.requestId,
      'req',
      'CLARIFICATION_REQUEST_INVALID',
      'Clarification request binding is invalid.'
    );
    var correlationId = requirePrefixedId(
      bindings.correlationId,
      'cor',
      'CLARIFICATION_CORRELATION_INVALID',
      'Clarification correlation binding is invalid.'
    );
    var value = String(answer || '').trim();
    if (!value) throw PPD.Errors.create('CLARIFICATION_EMPTY', 'Clarification answer is empty.');
    if (value.length > 4096) {
      throw PPD.Errors.create('CLARIFICATION_TOO_LONG', 'Clarification answer is too long.');
    }

    var clock = validateTime(event, config);
    var payload = { answer: value };
    var payloadHash = PPD.Canonical.sha256(payload);
    var eventId = PPD.Canonical.id('evt', {
      actor: actor.chatUserName,
      space: scope.spaceName,
      handle: clarificationHandle,
      eventTime: clock.createdAt,
    });
    var eventUpdateId = PPD.Canonical.id('upd', { eventId: eventId, payloadHash: payloadHash });
    var envelope = {
      schemaVersion: 'ppd.cos.clarification-answer.v1',
      eventType: 'clarification.answered',
      eventId: eventId,
      eventUpdateId: eventUpdateId,
      clarificationHandle: clarificationHandle,
      requestId: requestId,
      correlationId: correlationId,
      actor: actor,
      source: sourceFromEvent(event, scope),
      payload: payload,
      payloadHash: payloadHash,
      createdAt: clock.createdAt,
      expiresAt: clock.expiresAt,
      idempotencyKey: null,
      adapter: {
        name: 'ppd-google-chat-cos-adapter',
        version: config.adapterVersion,
      },
    };
    envelope.idempotencyKey = idempotencyFor(envelope);
    return deepFreeze(envelope);
  }

  function spaceLifecycle(event, config, eventType) {
    if (['space.added', 'space.removed'].indexOf(eventType) === -1) {
      throw PPD.Errors.create('SPACE_EVENT_INVALID', 'Space event type is invalid.');
    }
    var actor = PPD.Identity.fromEvent(event, config);
    var scope = PPD.ScopePolicy.fromEvent(event);
    var clock = validateTime(event, config);
    var payload = { membershipEvent: eventType };
    var payloadHash = PPD.Canonical.sha256(payload);
    var eventId = PPD.Canonical.id('evt', {
      actor: actor.chatUserName,
      space: scope.spaceName,
      eventType: eventType,
      eventTime: clock.createdAt,
    });
    var requestId = PPD.Canonical.id('req', eventId);
    var envelope = {
      schemaVersion: 'ppd.cos.intake.v1',
      eventType: eventType,
      eventId: eventId,
      eventUpdateId: PPD.Canonical.id('upd', { eventId: eventId, payloadHash: payloadHash }),
      requestId: requestId,
      correlationId: PPD.Canonical.id('cor', eventId),
      actor: actor,
      source: sourceFromEvent(event, scope),
      purpose: 'chat_space_lifecycle',
      payload: payload,
      payloadHash: payloadHash,
      createdAt: clock.createdAt,
      expiresAt: clock.expiresAt,
      idempotencyKey: null,
      adapter: { name: 'ppd-google-chat-cos-adapter', version: config.adapterVersion },
    };
    envelope.idempotencyKey = idempotencyFor(envelope);
    return deepFreeze(envelope);
  }

  return Object.freeze({
    intake: intake,
    clarification: clarification,
    spaceLifecycle: spaceLifecycle,
    deepFreeze: deepFreeze,
  });
}());
