const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { loadGs } = require('./helpers/load-gs');

const utilities = {
  Charset: { UTF_8: 'UTF_8' },
  DigestAlgorithm: { SHA_256: 'SHA_256' },
  MacAlgorithm: { HMAC_SHA_256: 'HMAC_SHA_256' },
  computeDigest: (_algorithm, value) => [...crypto.createHash('sha256').update(value).digest()],
  computeHmacSignature: (_algorithm, value, key) => [
    ...crypto.createHmac('sha256', key).update(value).digest(),
  ],
};
const ctx = loadGs(['Errors.gs', 'CanonicalJson.gs', 'Config.gs', 'Transport.gs'], { Utilities: utilities });
const envelope = Object.freeze({
  schemaVersion: 'ppd.cos.intake.v1',
  eventType: 'request.submitted',
  eventId: `evt_${'a'.repeat(32)}`,
  idempotencyKey: 'b'.repeat(64),
  payloadHash: 'c'.repeat(64),
});

function properties(values = {}) {
  return { getProperty: (key) => Object.hasOwn(values, key) ? values[key] : null };
}

function response(status, body) {
  return {
    getResponseCode: () => status,
    getContentText: () => body,
  };
}

function fakeFetch(reply) {
  const fake = (url, options) => {
    fake.calls.push({ url, options });
    if (reply instanceof Error) throw reply;
    return reply;
  };
  fake.calls = [];
  return fake;
}

test('configuration defaults to disabled transport and proactive delivery', () => {
  const config = ctx.PPD.Config.load(properties());
  assert.equal(config.transportMode, 'disabled');
  assert.equal(config.proactiveEnabled, false);
  assert.equal(config.companyDomain, 'ppdpainting.com');
});

test('HTTPS mode requires an exact secure v1 endpoint and credentials', () => {
  assert.throws(() => ctx.PPD.Config.load(properties({ TRANSPORT_MODE: 'other' })), /configuration/);
  assert.throws(() => ctx.PPD.Config.load(properties({ TRANSPORT_MODE: 'https' })), /configuration/);
  assert.throws(() => ctx.PPD.Config.load(properties({
    TRANSPORT_MODE: 'https',
    INGESTION_URL: 'http://intake.invalid/v1/intake-events',
    QUEUE_HMAC_KEY_ID: 'key-1',
    QUEUE_HMAC_SECRET: 'test-value',
  })), /HTTPS/);
  assert.throws(() => ctx.PPD.Config.load(properties({
    TRANSPORT_MODE: 'https',
    INGESTION_URL: 'https://intake.invalid/v1/intake-events',
  })), /incomplete/);
  assert.equal(ctx.PPD.Config.isSecureIntakeUrl('https://intake.invalid/service/v1/intake-events'), true);
  assert.equal(ctx.PPD.Config.isSecureIntakeUrl('https://intake.invalid/v1/intake-events?debug=true'), false);
});

test('deployment default is unavailable and never claims persistence', () => {
  const result = ctx.PPD.Transport.unavailable().send(envelope);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    schemaVersion: 'ppd.cos.ingestion-result.v1',
    state: 'unavailable',
    code: 'INGESTION_NOT_CONNECTED',
    retryable: false,
  });
});

test('only four result states with state-specific fields are accepted', () => {
  const results = [
    { schemaVersion: 'ppd.cos.ingestion-result.v1', state: 'accepted', receiptId: 'rcpt_one' },
    { schemaVersion: 'ppd.cos.ingestion-result.v1', state: 'duplicate', receiptId: 'rcpt_one' },
    { schemaVersion: 'ppd.cos.ingestion-result.v1', state: 'rejected', code: 'POLICY_DENIED' },
    { schemaVersion: 'ppd.cos.ingestion-result.v1', state: 'unavailable', code: 'SERVICE_DOWN', retryable: true },
  ];
  for (const result of results) assert.equal(ctx.PPD.Transport.validateResult(result).state, result.state);
  assert.throws(
    () => ctx.PPD.Transport.validateResult({ schemaVersion: 'ppd.cos.ingestion-result.v1', state: 'queued' }),
    /state/
  );
  assert.throws(
    () => ctx.PPD.Transport.validateResult({ schemaVersion: 'ppd.cos.ingestion-result.v1', state: 'accepted' }),
    /receipt/
  );
  assert.throws(() => ctx.PPD.Transport.validateResult(null), /schema/);
  assert.throws(
    () => ctx.PPD.Transport.validateResult({ schemaVersion: 'ppd.cos.ingestion-result.v1', state: 'rejected', code: 'bad' }),
    /code/
  );
  assert.throws(
    () => ctx.PPD.Transport.validateResult({ schemaVersion: 'ppd.cos.ingestion-result.v1', state: 'unavailable', code: 'SERVICE_DOWN' }),
    /retry/
  );
  assert.throws(
    () => ctx.PPD.Transport.validateResult({
      schemaVersion: 'ppd.cos.ingestion-result.v1', state: 'accepted', receiptId: 'rcpt_one', receivedAt: 'invalid',
    }),
    /receivedAt/
  );
});

test('transport constructors reject invalid dependencies and scripted retries consume in order', () => {
  assert.throws(() => ctx.PPD.Transport.https(null, () => {}), /configuration/);
  assert.throws(() => ctx.PPD.Transport.https({ transportMode: 'https' }, null), /configuration/);
  const scripted = ctx.PPD.Transport.scripted([
    { schemaVersion: 'ppd.cos.ingestion-result.v1', state: 'rejected', code: 'POLICY_DENIED' },
    { schemaVersion: 'ppd.cos.ingestion-result.v1', state: 'unavailable', code: 'SERVICE_DOWN', retryable: true },
  ]);
  assert.equal(scripted.send(envelope).state, 'rejected');
  assert.equal(scripted.send(envelope).state, 'unavailable');
  assert.equal(scripted.send(envelope).state, 'unavailable');
});

test('HTTPS transport signs method, path, timestamp, idempotency key, and body hash', () => {
  const config = ctx.PPD.Config.load(properties({
    TRANSPORT_MODE: 'https',
    INGESTION_URL: 'https://intake.invalid/v1/intake-events',
    QUEUE_HMAC_KEY_ID: 'key-1',
    QUEUE_HMAC_SECRET: 'test-value',
  }), () => Date.parse('2026-08-27T00:00:00.000Z'));
  const fetcher = fakeFetch(response(200, JSON.stringify({
    schemaVersion: 'ppd.cos.ingestion-result.v1', state: 'accepted', receiptId: 'rcpt_one',
  })));
  const result = ctx.PPD.Transport.https(config, fetcher).send(envelope);
  assert.equal(result.state, 'accepted');
  assert.equal(fetcher.calls[0].url, 'https://intake.invalid/v1/intake-events');
  assert.match(fetcher.calls[0].options.headers['X-PPD-Signature'], /^v1=[a-f0-9]{64}$/);
  assert.equal(fetcher.calls[0].options.headers['Idempotency-Key'], envelope.idempotencyKey);
  assert.equal(fetcher.calls[0].options.headers['X-PPD-Timestamp'], '2026-08-27T00:00:00.000Z');
});

test('network, HTTP, and invalid body failures become redacted unavailable states', () => {
  const config = ctx.PPD.Config.load(properties({
    TRANSPORT_MODE: 'https',
    INGESTION_URL: 'https://intake.invalid/v1/intake-events',
    QUEUE_HMAC_KEY_ID: 'key-1',
    QUEUE_HMAC_SECRET: 'test-value',
  }));
  const network = ctx.PPD.Transport.https(config, fakeFetch(new Error('contains sensitive transport detail'))).send(envelope);
  const http = ctx.PPD.Transport.https(config, fakeFetch(response(503, '{"internal":"sensitive"}'))).send(envelope);
  const invalid = ctx.PPD.Transport.https(config, fakeFetch(response(200, 'not-json'))).send(envelope);
  for (const result of [network, http, invalid]) {
    assert.equal(result.state, 'unavailable');
    assert.equal(JSON.stringify(result).includes('sensitive'), false);
  }
});
