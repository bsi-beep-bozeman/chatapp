import assert from 'node:assert/strict';
import test from 'node:test';

import {
  canonicalStringify,
  equalHex,
  hmacSha256Hex,
  sha256Hex,
} from '../../src/canonical/canonical-json.js';

test('canonical JSON recursively sorts object keys', () => {
  assert.equal(
    canonicalStringify({ z: 1, a: { y: true, b: null }, m: 'value' }),
    '{"a":{"b":null,"y":true},"m":"value","z":1}',
  );
});

test('canonical JSON preserves array order while sorting nested objects', () => {
  assert.equal(
    canonicalStringify([{ z: 1, a: 2 }, 'second', [3, 2, 1]]),
    '[{"a":2,"z":1},"second",[3,2,1]]',
  );
});

test('SHA-256 hashes strings verbatim and objects canonically', () => {
  assert.equal(
    sha256Hex('hello'),
    '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
  );
  assert.notEqual(sha256Hex('hello'), sha256Hex(canonicalStringify('hello')));
  assert.equal(sha256Hex({ b: 2, a: 1 }), sha256Hex({ a: 1, b: 2 }));
  assert.match(sha256Hex({ a: 1 }), /^[a-f0-9]{64}$/);
});

test('HMAC-SHA-256 matches the stable UTF-8 test vector', () => {
  assert.equal(
    hmacSha256Hex('The quick brown fox jumps over the lazy dog', Buffer.from('key', 'utf8')),
    'f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8',
  );
});

test('equalHex accepts equal lowercase hex and rejects unsafe comparisons', () => {
  const digest = sha256Hex('same');

  assert.equal(equalHex(digest, digest), true);
  assert.equal(equalHex(digest, sha256Hex('different')), false);
  assert.equal(equalHex(digest, digest.slice(2)), false);
  assert.equal(equalHex(digest.toUpperCase(), digest.toUpperCase()), false);
  assert.equal(equalHex('not-hex', 'not-hex'), false);
  assert.equal(equalHex('abc', 'abc'), false);
  assert.equal(equalHex('', ''), false);
});

test('canonical JSON rejects unsupported and non-finite values', () => {
  class UnsupportedClass {
    readonly value = 1;
  }

  const unsupported: unknown[] = [
    undefined,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    new Date('2026-08-28T00:00:00.000Z'),
    new UnsupportedClass(),
    () => 'unsafe',
    Symbol('unsafe'),
    1n,
    { nested: undefined },
  ];

  for (const value of unsupported) {
    assert.throws(() => canonicalStringify(value), TypeError);
  }
});
