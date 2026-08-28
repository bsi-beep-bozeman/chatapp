const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { loadGs } = require('./helpers/load-gs');

const NOW = Date.parse('2026-08-27T00:00:00.000Z');
const utilities = {
  Charset: { UTF_8: 'UTF_8' },
  DigestAlgorithm: { SHA_256: 'SHA_256' },
  MacAlgorithm: { HMAC_SHA_256: 'HMAC_SHA_256' },
  computeDigest: (_algorithm, value) => [...crypto.createHash('sha256').update(value).digest()],
  computeHmacSignature: (_algorithm, value, key) => [
    ...crypto.createHmac('sha256', key).update(value).digest(),
  ],
  base64EncodeWebSafe: (value) => Buffer.from(Array.isArray(value) ? value : String(value)).toString('base64url'),
  computeRsaSha256Signature: () => [...Buffer.from('test-signature')],
};
const ctx = loadGs(['Errors.gs', 'CanonicalJson.gs', 'ProactiveDelivery.gs'], { Utilities: utilities });

function delivery(overrides = {}) {
  const message = Object.hasOwn(overrides, 'message')
    ? overrides.message
    : { text: 'Sensitive result available in this DM.' };
  return {
    schemaVersion: 'ppd.cos.delivery.v1',
    deliveryId: `delivery_${'a'.repeat(32)}`,
    requestId: `req_${'b'.repeat(32)}`,
    correlationId: `cor_${'c'.repeat(32)}`,
    recipient: 'users/123456789',
    destination: {
      recipient: 'users/123456789',
      spaceName: 'spaces/DM1',
      spaceType: 'DIRECT_MESSAGE',
    },
    sensitivity: 'sensitive',
    message,
    payloadHash: ctx.PPD.Canonical.sha256(message),
    createdAt: '2026-08-27T00:00:00.000Z',
    expiresAt: '2026-08-27T01:00:00.000Z',
    idempotencyKey: 'd'.repeat(64),
    ...overrides,
    message,
  };
}

function properties(values) {
  return { getProperty: (key) => values[key] || null };
}

function cache() {
  const values = new Map();
  return {
    get: (key) => values.get(key) || null,
    put: (key, value) => values.set(key, value),
  };
}

test('sensitive delivery is refused outside a bound direct message', () => {
  const value = delivery();
  value.destination = { ...value.destination, spaceType: 'SPACE' };
  assert.throws(() => ctx.PPD.Proactive.validate(value, NOW), /direct message/);
});

test('recipient and payload hash must match the delivery envelope', () => {
  assert.throws(() => ctx.PPD.Proactive.validate(delivery({ payloadHash: '0'.repeat(64) }), NOW), /hash/);
  assert.throws(
    () => ctx.PPD.Proactive.send(delivery(), { recipient: 'users/other', spaceName: 'spaces/DM1' }, { config: { proactiveEnabled: true } }),
    /recipient/
  );
});

test('expired and overlong delivery grants fail closed', () => {
  assert.throws(
    () => ctx.PPD.Proactive.validate(delivery({
      createdAt: '2026-08-26T23:00:00.000Z',
      expiresAt: '2026-08-26T23:59:59.000Z',
    }), NOW),
    /expired/
  );
  assert.throws(
    () => ctx.PPD.Proactive.validate(delivery({ expiresAt: '2026-08-28T00:00:00.001Z' }), NOW),
    /expiry/
  );
});

test('proactive delivery is unavailable while disabled', () => {
  const result = ctx.PPD.Proactive.send(delivery(), delivery().destination, {
    config: { proactiveEnabled: false, now: () => NOW },
  });
  assert.equal(result.state, 'unavailable');
  assert.equal(result.code, 'PROACTIVE_NOT_ENABLED');
});

test('enabled delivery uses service-account app auth and a deterministic Chat message ID', () => {
  const fetchCalls = [];
  const chatCalls = [];
  const deps = {
    config: { proactiveEnabled: true, now: () => NOW },
    properties: properties({
      CHAT_APP_SERVICE_ACCOUNT_JSON: JSON.stringify({
        client_email: 'chat-app@project.invalid',
        private_key: 'test-key-material',
      }),
    }),
    cache: cache(),
    fetch: (url, options) => {
      fetchCalls.push({ url, options });
      return {
        getResponseCode: () => 200,
        getContentText: () => JSON.stringify({ access_token: 'test-access-token', expires_in: 3600 }),
      };
    },
    chat: {
      Spaces: { Messages: { create: (message, parent, options, headers) => {
        chatCalls.push({ message, parent, options, headers });
        return { name: `${parent}/messages/M1` };
      } } },
    },
  };
  const value = delivery();
  const result = ctx.PPD.Proactive.send(value, value.destination, deps);
  assert.equal(result.state, 'sent');
  assert.equal(fetchCalls[0].url, 'https://oauth2.googleapis.com/token');
  assert.match(chatCalls[0].options.messageId, /^client-[a-f0-9]{32}$/);
  assert.equal(chatCalls[0].headers.Authorization, 'Bearer test-access-token');
  assert.equal(JSON.stringify(result).includes('test-access-token'), false);
  assert.equal(JSON.stringify(result).includes('test-key-material'), false);
});

test('duplicate Chat message IDs return duplicate without inventing a new ID', () => {
  const value = delivery();
  const deps = {
    config: { proactiveEnabled: true, now: () => NOW },
    properties: properties({ CHAT_APP_SERVICE_ACCOUNT_JSON: JSON.stringify({ client_email: 'chat-app@project.invalid', private_key: 'test-key-material' }) }),
    cache: { get: () => 'cached-token', put: () => {} },
    fetch: () => { throw new Error('token fetch should not run'); },
    chat: { Spaces: { Messages: { create: () => { const error = new Error('ALREADY_EXISTS'); error.code = 409; throw error; } } } },
  };
  const result = ctx.PPD.Proactive.send(value, value.destination, deps);
  assert.equal(result.state, 'duplicate');
  assert.match(result.messageId, /^client-[a-f0-9]{32}$/);
});

test('polling remains unavailable because no delivery service exists', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.PPD.Proactive.poll())), {
    state: 'unavailable', code: 'DELIVERY_SERVICE_NOT_CONNECTED', retryable: false,
  });
});

test('delivery validation rejects malformed schema, target, message, and time fields', () => {
  const cases = [
    [null, /schema/],
    [delivery({ schemaVersion: 'ppd.cos.delivery.v2' }), /schema/],
    [delivery({ destination: { recipient: 'users/other', spaceName: 'spaces/DM1', spaceType: 'DIRECT_MESSAGE' } }), /recipient/],
    [delivery({ destination: { recipient: 'users/123456789', spaceName: 'bad', spaceType: 'DIRECT_MESSAGE' } }), /space/],
    [delivery({ destination: { recipient: 'users/123456789', spaceName: 'spaces/DM1', spaceType: 'UNKNOWN' } }), /space type/],
    [delivery({ sensitivity: 'classified' }), /sensitivity/],
    [delivery({ sensitivity: 'personal', destination: { recipient: 'users/123456789', spaceName: 'spaces/S1', spaceType: 'SPACE' } }), /direct message/],
    [delivery({ message: null }), /message/],
    [delivery({ message: [] }), /message/],
    [delivery({ message: {} }), /message/],
    [delivery({ message: { unexpected: true } }), /message/],
    [delivery({ payloadHash: 'bad' }), /hash/],
    [delivery({ idempotencyKey: 'bad' }), /idempotency/],
    [delivery({ createdAt: 'invalid' }), /time/],
    [delivery({ expiresAt: 'invalid' }), /time/],
    [delivery({ createdAt: '2026-08-27T01:00:00.000Z', expiresAt: '2026-08-27T00:00:00.000Z' }), /expiry/],
  ];
  for (const [value, pattern] of cases) {
    assert.throws(() => ctx.PPD.Proactive.validate(value, NOW), pattern);
  }
  assert.throws(() => ctx.PPD.Proactive.validate(delivery(), 'invalid'), /time/);
});

function enabledDependencies(overrides = {}) {
  return {
    config: { proactiveEnabled: true, now: () => NOW },
    properties: properties({
      CHAT_APP_SERVICE_ACCOUNT_JSON: JSON.stringify({
        client_email: 'chat-app@project.invalid',
        private_key: 'test-key-material',
      }),
    }),
    cache: cache(),
    fetch: () => ({
      getResponseCode: () => 200,
      getContentText: () => JSON.stringify({ access_token: 'test-token' }),
    }),
    chat: { Spaces: { Messages: { create: () => ({ name: 'spaces/DM1/messages/M1' }) } } },
    ...overrides,
  };
}

test('proactive authentication failures are redacted unavailable results', () => {
  const credentials = [
    null,
    properties({ CHAT_APP_SERVICE_ACCOUNT_JSON: '{bad json' }),
    properties({ CHAT_APP_SERVICE_ACCOUNT_JSON: JSON.stringify({ client_email: 'bad', private_key: '' }) }),
  ];
  for (const propertySource of credentials) {
    const value = delivery();
    const result = ctx.PPD.Proactive.send(value, value.destination, enabledDependencies({
      properties: propertySource,
      cache: null,
    }));
    assert.deepEqual(JSON.parse(JSON.stringify(result)), {
      state: 'unavailable', code: 'PROACTIVE_DELIVERY_FAILED', retryable: true,
    });
  }

  const tokenReplies = [
    { getResponseCode: () => 500, getContentText: () => 'server detail' },
    { getResponseCode: () => 100, getContentText: () => 'early response' },
    { getResponseCode: () => 200, getContentText: () => 'not-json' },
    { getResponseCode: () => 200, getContentText: () => '{}' },
  ];
  for (const reply of tokenReplies) {
    const value = delivery();
    assert.equal(ctx.PPD.Proactive.send(value, value.destination, enabledDependencies({
      cache: null,
      fetch: () => reply,
    })).state, 'unavailable');
  }
});

test('proactive sending covers no-cache, empty response, generic failure, and duplicate message branches', () => {
  const value = delivery();
  const sentWithoutCache = ctx.PPD.Proactive.send(value, value.destination, enabledDependencies({
    cache: null,
    chat: { Spaces: { Messages: { create: () => null } } },
  }));
  assert.equal(sentWithoutCache.state, 'sent');
  assert.equal(sentWithoutCache.messageName, null);

  const genericFailure = ctx.PPD.Proactive.send(value, value.destination, enabledDependencies({
    cache: { get: () => 'cached-token' },
    chat: { Spaces: { Messages: { create: () => { throw new Error('generic'); } } } },
  }));
  assert.equal(genericFailure.code, 'PROACTIVE_DELIVERY_FAILED');

  const duplicate = ctx.PPD.Proactive.send(value, value.destination, enabledDependencies({
    cache: { get: () => 'cached-token' },
    chat: { Spaces: { Messages: { create: () => { throw new Error('ALREADY_EXISTS'); } } } },
  }));
  assert.equal(duplicate.state, 'duplicate');

  assert.throws(() => ctx.PPD.Proactive.send(value, null, enabledDependencies()), /target/);
  assert.throws(
    () => ctx.PPD.Proactive.send(value, { ...value.destination, spaceName: 'spaces/other' }, enabledDependencies()),
    /target/
  );
});

test('Apps Script proactive wrappers retain disabled contract behavior', () => {
  assert.equal(ctx.pollProactiveDeliveries().code, 'DELIVERY_SERVICE_NOT_CONNECTED');
  const value = delivery();
  ctx.PPD.Config = { runtime: () => ({ config: { proactiveEnabled: false, now: () => NOW } }) };
  assert.equal(ctx.sendProactiveDelivery(value).code, 'PROACTIVE_NOT_ENABLED');
});
