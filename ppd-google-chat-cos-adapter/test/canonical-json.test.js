const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { loadGs } = require('./helpers/load-gs');

function utilities() {
  return {
    Charset: { UTF_8: 'UTF_8' },
    DigestAlgorithm: { SHA_256: 'SHA_256' },
    MacAlgorithm: { HMAC_SHA_256: 'HMAC_SHA_256' },
    computeDigest: (_algorithm, value) => [...crypto.createHash('sha256').update(value).digest()],
    computeHmacSignature: (_algorithm, value, key) => [
      ...crypto.createHmac('sha256', key).update(value).digest(),
    ],
  };
}

const ctx = loadGs(['Errors.gs', 'CanonicalJson.gs'], { Utilities: utilities() });

test('canonical JSON sorts object keys and preserves array order', () => {
  assert.equal(ctx.PPD.Canonical.stringify({ z: 1, a: [3, 2] }), '{"a":[3,2],"z":1}');
});

test('payload mutation changes the SHA-256 hash', () => {
  const first = ctx.PPD.Canonical.sha256({ target: 'job-1', value: 'open' });
  const second = ctx.PPD.Canonical.sha256({ target: 'job-1', value: 'closed' });
  assert.notEqual(first, second);
  assert.match(first, /^[a-f0-9]{64}$/);
});

test('HMAC is deterministic and distinct from an ordinary digest', () => {
  const first = ctx.PPD.Canonical.hmac('message', 'test-only-key');
  const second = ctx.PPD.Canonical.hmac('message', 'test-only-key');
  assert.equal(first, second);
  assert.notEqual(first, ctx.PPD.Canonical.sha256('message'));
});

test('IDs use a stable prefix and 32 digest characters', () => {
  assert.match(ctx.PPD.Canonical.id('evt', { a: 1 }), /^evt_[a-f0-9]{32}$/);
});

test('constant-time comparison rejects length and content mismatches', () => {
  assert.equal(ctx.PPD.Canonical.equalHex('aabb', 'aabb'), true);
  assert.equal(ctx.PPD.Canonical.equalHex('aabb', 'aabc'), false);
  assert.equal(ctx.PPD.Canonical.equalHex('aa', 'aabb'), false);
});

test('non-finite numbers and unsupported values are rejected', () => {
  assert.throws(() => ctx.PPD.Canonical.stringify({ value: NaN }), /unsupported/);
  assert.throws(() => ctx.PPD.Canonical.stringify({ value: undefined }), /unsupported/);
  assert.throws(() => ctx.PPD.Canonical.stringify(new Date()), /unsupported/);
});
