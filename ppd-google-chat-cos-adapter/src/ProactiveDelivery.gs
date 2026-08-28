var PPD = PPD || {};

PPD.Proactive = (function () {
  var MAX_DELIVERY_MS = 24 * 60 * 60 * 1000;
  var TOKEN_CACHE_KEY = 'ppd_chat_app_access_token_v1';
  var CHAT_SCOPE = 'https://www.googleapis.com/auth/chat.bot';
  var TOKEN_URL = 'https://oauth2.googleapis.com/token';

  function requirePattern(value, pattern, code, message) {
    var text = String(value || '');
    if (!pattern.test(text)) throw PPD.Errors.create(code, message);
    return text;
  }

  function unavailable(code, retryable) {
    return Object.freeze({ state: 'unavailable', code: code, retryable: Boolean(retryable) });
  }

  function validate(delivery, nowValue) {
    if (!delivery || delivery.schemaVersion !== 'ppd.cos.delivery.v1') {
      throw PPD.Errors.create('DELIVERY_SCHEMA_INVALID', 'The proactive delivery schema is invalid.');
    }
    requirePattern(delivery.deliveryId, /^delivery_[a-f0-9]{32}$/, 'DELIVERY_ID_INVALID', 'The delivery identifier is invalid.');
    requirePattern(delivery.requestId, /^req_[a-f0-9]{32}$/, 'DELIVERY_REQUEST_INVALID', 'The delivery request binding is invalid.');
    requirePattern(delivery.correlationId, /^cor_[a-f0-9]{32}$/, 'DELIVERY_CORRELATION_INVALID', 'The delivery correlation binding is invalid.');
    var recipient = requirePattern(delivery.recipient, /^users\/[A-Za-z0-9._@-]+$/, 'DELIVERY_RECIPIENT_INVALID', 'The delivery recipient is invalid.');
    var destination = delivery.destination || {};
    if (destination.recipient !== recipient) {
      throw PPD.Errors.create('DELIVERY_RECIPIENT_MISMATCH', 'The delivery recipient binding does not match.');
    }
    requirePattern(destination.spaceName, /^spaces\/[A-Za-z0-9_-]+$/, 'DELIVERY_SPACE_INVALID', 'The delivery space is invalid.');
    if (['DIRECT_MESSAGE', 'SPACE', 'GROUP_CHAT'].indexOf(destination.spaceType) === -1) {
      throw PPD.Errors.create('DELIVERY_SPACE_TYPE_INVALID', 'The delivery space type is invalid.');
    }
    if (['shared', 'personal', 'sensitive'].indexOf(delivery.sensitivity) === -1) {
      throw PPD.Errors.create('DELIVERY_SENSITIVITY_INVALID', 'The delivery sensitivity is invalid.');
    }
    if (delivery.sensitivity !== 'shared' && destination.spaceType !== 'DIRECT_MESSAGE') {
      throw PPD.Errors.create('DELIVERY_DM_REQUIRED', 'Personal and sensitive delivery requires a direct message.');
    }
    if (!delivery.message || Object.prototype.toString.call(delivery.message) !== '[object Object]') {
      throw PPD.Errors.create('DELIVERY_MESSAGE_INVALID', 'The delivery message is invalid.');
    }
    var keys = Object.keys(delivery.message);
    if (!keys.length || keys.some(function (key) {
      return ['text', 'cardsV2', 'accessoryWidgets'].indexOf(key) === -1;
    })) {
      throw PPD.Errors.create('DELIVERY_MESSAGE_INVALID', 'The delivery message is invalid.');
    }
    requirePattern(delivery.payloadHash, /^[a-f0-9]{64}$/, 'DELIVERY_HASH_INVALID', 'The delivery payload hash is invalid.');
    if (!PPD.Canonical.equalHex(delivery.payloadHash, PPD.Canonical.sha256(delivery.message))) {
      throw PPD.Errors.create('DELIVERY_HASH_MISMATCH', 'The delivery payload hash does not match.');
    }
    requirePattern(delivery.idempotencyKey, /^[a-f0-9]{64}$/, 'DELIVERY_IDEMPOTENCY_INVALID', 'The delivery idempotency key is invalid.');
    var createdAt = new Date(delivery.createdAt).getTime();
    var expiresAt = new Date(delivery.expiresAt).getTime();
    var now = new Date(nowValue).getTime();
    if (!Number.isFinite(createdAt) || !Number.isFinite(expiresAt) || !Number.isFinite(now)) {
      throw PPD.Errors.create('DELIVERY_TIME_INVALID', 'The delivery time is invalid.');
    }
    if (expiresAt <= createdAt || expiresAt - createdAt > MAX_DELIVERY_MS) {
      throw PPD.Errors.create('DELIVERY_EXPIRY_INVALID', 'The delivery expiry is invalid.');
    }
    if (now > expiresAt) throw PPD.Errors.create('DELIVERY_EXPIRED', 'The proactive delivery is expired.');
    return true;
  }

  function base64Url(value, charset) {
    return Utilities.base64EncodeWebSafe(value, charset).replace(/=+$/g, '');
  }

  function parseCredentials(properties) {
    var raw = properties && properties.getProperty
      ? properties.getProperty('CHAT_APP_SERVICE_ACCOUNT_JSON')
      : null;
    if (!raw) throw PPD.Errors.create('SERVICE_ACCOUNT_MISSING', 'Chat app authentication is unavailable.');
    var credentials;
    try {
      credentials = JSON.parse(raw);
    } catch (error) {
      throw PPD.Errors.create('SERVICE_ACCOUNT_INVALID', 'Chat app authentication is unavailable.');
    }
    if (!/^[^@\s]+@[^@\s]+$/.test(String(credentials.client_email || '')) ||
        !String(credentials.private_key || '').trim()) {
      throw PPD.Errors.create('SERVICE_ACCOUNT_INVALID', 'Chat app authentication is unavailable.');
    }
    return credentials;
  }

  function accessToken(dependencies) {
    var cached = dependencies.cache && dependencies.cache.get
      ? dependencies.cache.get(TOKEN_CACHE_KEY)
      : null;
    if (cached) return cached;

    var credentials = parseCredentials(dependencies.properties);
    var issuedAt = Math.floor(dependencies.config.now() / 1000);
    var header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }), Utilities.Charset.UTF_8);
    var claim = base64Url(JSON.stringify({
      iss: credentials.client_email,
      scope: CHAT_SCOPE,
      aud: TOKEN_URL,
      iat: issuedAt,
      exp: issuedAt + 3600,
    }), Utilities.Charset.UTF_8);
    var unsigned = header + '.' + claim;
    var signature = Utilities.computeRsaSha256Signature(
      unsigned,
      credentials.private_key,
      Utilities.Charset.UTF_8
    );
    var assertion = unsigned + '.' + base64Url(signature);
    var response = dependencies.fetch(TOKEN_URL, {
      method: 'post',
      contentType: 'application/x-www-form-urlencoded',
      payload: 'grant_type=' + encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer') +
        '&assertion=' + encodeURIComponent(assertion),
      muteHttpExceptions: true,
    });
    if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) {
      throw PPD.Errors.create('SERVICE_ACCOUNT_TOKEN_FAILED', 'Chat app authentication is unavailable.');
    }
    var tokenResponse;
    try {
      tokenResponse = JSON.parse(response.getContentText());
    } catch (error) {
      throw PPD.Errors.create('SERVICE_ACCOUNT_TOKEN_INVALID', 'Chat app authentication is unavailable.');
    }
    if (!tokenResponse.access_token || typeof tokenResponse.access_token !== 'string') {
      throw PPD.Errors.create('SERVICE_ACCOUNT_TOKEN_INVALID', 'Chat app authentication is unavailable.');
    }
    if (dependencies.cache && dependencies.cache.put) {
      dependencies.cache.put(TOKEN_CACHE_KEY, tokenResponse.access_token, 3300);
    }
    return tokenResponse.access_token;
  }

  function send(delivery, requestedDestination, dependencies) {
    var bound = delivery && delivery.destination || {};
    if (!requestedDestination || requestedDestination.recipient !== delivery.recipient ||
        requestedDestination.spaceName !== bound.spaceName) {
      throw PPD.Errors.create('DELIVERY_TARGET_MISMATCH', 'The requested delivery recipient or target does not match.');
    }
    var now = dependencies && dependencies.config && dependencies.config.now
      ? dependencies.config.now()
      : Date.now();
    validate(delivery, now);
    if (!dependencies.config.proactiveEnabled) {
      return unavailable('PROACTIVE_NOT_ENABLED', false);
    }
    var messageId = 'client-' + PPD.Canonical.sha256(delivery.deliveryId).slice(0, 32);
    try {
      var token = accessToken(dependencies);
      var result = dependencies.chat.Spaces.Messages.create(
        delivery.message,
        bound.spaceName,
        { messageId: messageId },
        { Authorization: 'Bearer ' + token }
      );
      return Object.freeze({
        state: 'sent',
        deliveryId: delivery.deliveryId,
        messageId: messageId,
        messageName: result && result.name || null,
      });
    } catch (error) {
      if (error && (error.code === 409 || String(error.message || '').indexOf('ALREADY_EXISTS') !== -1)) {
        return Object.freeze({ state: 'duplicate', deliveryId: delivery.deliveryId, messageId: messageId });
      }
      return unavailable('PROACTIVE_DELIVERY_FAILED', true);
    }
  }

  function poll() {
    return unavailable('DELIVERY_SERVICE_NOT_CONNECTED', false);
  }

  return Object.freeze({ validate: validate, send: send, poll: poll });
}());

function pollProactiveDeliveries() {
  return PPD.Proactive.poll();
}

function sendProactiveDelivery(delivery) {
  return PPD.Proactive.send(delivery, delivery && delivery.destination, PPD.Config.runtime());
}
