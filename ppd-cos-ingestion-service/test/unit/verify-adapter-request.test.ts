import assert from 'node:assert/strict';
import test from 'node:test';

import {
  InMemorySecretProvider,
  UnavailableSecretProvider,
} from '../../src/auth/secret-provider.js';
import {
  type SignedRequest,
  verifyAdapterRequest,
} from '../../src/auth/verify-adapter-request.js';
import { hmacSha256Hex, sha256Hex } from '../../src/canonical/canonical-json.js';

const now = new Date('2026-08-28T06:30:00.000Z');
const key = Buffer.from('synthetic-test-key-only', 'utf8');
const keyId = 'test-key-1';
const idempotencyKey = 'a'.repeat(64);
const rawBody = Buffer.from('{"text":"synthetic"}', 'utf8');

function signedRequest(overrides: Partial<SignedRequest> = {}): SignedRequest {
  const method = overrides.method ?? 'POST';
  const path = overrides.path ?? '/v1/intake-events';
  const body = overrides.rawBody ?? rawBody;
  const timestamp = overrides.headers?.timestamp ?? now.toISOString();
  const requestKey = overrides.headers?.idempotencyKey ?? idempotencyKey;
  const signatureInput = [
    method,
    path,
    timestamp,
    requestKey,
    sha256Hex(body.toString('utf8')),
  ].join('\n');
  return {
    method,
    path,
    rawBody: body,
    headers: {
      keyId: overrides.headers?.keyId ?? keyId,
      timestamp,
      idempotencyKey: requestKey,
      signature: overrides.headers?.signature ?? `v1=${hmacSha256Hex(signatureInput, key)}`,
    },
  };
}

test('verifies the exact signed method path timestamp key and body', async () => {
  const secrets = new InMemorySecretProvider(new Map([[keyId, key]]));
  await assert.doesNotReject(verifyAdapterRequest(signedRequest(), secrets, now));
});

test('rejects body path method and idempotency tampering', async () => {
  const secrets = new InMemorySecretProvider(new Map([[keyId, key]]));
  const valid = signedRequest();
  const altered = [
    { ...valid, rawBody: Buffer.from('{"text":"changed"}', 'utf8') },
    { ...valid, path: '/v1/other' },
    { ...valid, method: 'PUT' },
    { ...valid, headers: { ...valid.headers, idempotencyKey: 'b'.repeat(64) } },
  ];
  for (const request of altered) {
    await assert.rejects(
      verifyAdapterRequest(request, secrets, now),
      /ADAPTER_AUTHENTICATION_FAILED/,
    );
  }
});

test('rejects stale future and malformed transport timestamps', async () => {
  const secrets = new InMemorySecretProvider(new Map([[keyId, key]]));
  for (const timestamp of [
    '2026-08-28T06:27:59.000Z',
    '2026-08-28T06:32:01.000Z',
    'not-a-time',
  ]) {
    await assert.rejects(
      verifyAdapterRequest(signedRequest({ headers: { ...signedRequest().headers, timestamp } }), secrets, now),
      /ADAPTER_TIMESTAMP_INVALID/,
    );
  }
});

test('unknown and malformed keys fail without exposing key status', async () => {
  const secrets = new InMemorySecretProvider(new Map([[keyId, key]]));
  await assert.rejects(
    verifyAdapterRequest(
      signedRequest({ headers: { ...signedRequest().headers, keyId: 'unknown-key' } }),
      secrets,
      now,
    ),
    /ADAPTER_AUTHENTICATION_FAILED/,
  );
  await assert.rejects(
    verifyAdapterRequest(
      signedRequest({ headers: { ...signedRequest().headers, signature: 'invalid' } }),
      secrets,
      now,
    ),
    /ADAPTER_AUTHENTICATION_FAILED/,
  );
});

test('secret-provider outage is retryable unavailable', async () => {
  await assert.rejects(
    verifyAdapterRequest(signedRequest(), new UnavailableSecretProvider(), now),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal(error.message, 'SECRET_PROVIDER_UNAVAILABLE');
      assert.equal((error as { retryable?: boolean }).retryable, true);
      return true;
    },
  );
});
