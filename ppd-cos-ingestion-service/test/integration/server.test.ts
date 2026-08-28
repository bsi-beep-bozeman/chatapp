import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import test from 'node:test';

import type { SignedRequest } from '../../src/auth/verify-adapter-request.js';
import { createAppServer } from '../../src/app/server.js';
import { accepted } from '../../src/domain/ingestion-result.js';
import { fixtureNow, signedRequest } from '../helpers/intake-fixture.js';

async function withServer(
  run: (baseUrl: string, requests: SignedRequest[]) => Promise<void>,
): Promise<void> {
  const requests: SignedRequest[] = [];
  const server = createAppServer({
    intake: {
      async ingest(request) {
        requests.push(request);
        return accepted('rcpt_server_test', fixtureNow.toISOString());
      },
    },
    ready: async () => true,
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address() as AddressInfo;
  try {
    await run(`http://127.0.0.1:${address.port}`, requests);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
}

function adapterHeaders(request: SignedRequest): Record<string, string> {
  return {
    'content-type': 'application/json',
    'x-ppd-key-id': request.headers.keyId,
    'x-ppd-timestamp': request.headers.timestamp,
    'idempotency-key': request.headers.idempotencyKey,
    'x-ppd-signature': request.headers.signature,
  };
}

test('POST forwards exact raw bytes and returns a hardened four-state response', async () => {
  await withServer(async (baseUrl, requests) => {
    const request = signedRequest();
    const response = await fetch(`${baseUrl}/v1/intake-events`, {
      method: 'POST',
      headers: adapterHeaders(request),
      body: request.rawBody.toString('utf8'),
    });

    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.match(response.headers.get('content-type') ?? '', /^application\/json/);
    assert.equal((await response.json()).state, 'accepted');
    assert.equal(requests.length, 1);
    assert.deepEqual(requests[0]?.rawBody, request.rawBody);
    assert.equal(requests[0]?.headers.signature, request.headers.signature);
  });
});

test('rejects invalid content type and oversized bodies before intake', async () => {
  await withServer(async (baseUrl, requests) => {
    const request = signedRequest();
    const invalidType = await fetch(`${baseUrl}/v1/intake-events`, {
      method: 'POST',
      headers: { ...adapterHeaders(request), 'content-type': 'text/plain' },
      body: request.rawBody.toString('utf8'),
    });
    assert.equal(invalidType.status, 415);

    const oversized = await fetch(`${baseUrl}/v1/intake-events`, {
      method: 'POST',
      headers: adapterHeaders(request),
      body: 'a'.repeat(32_769),
    });
    assert.equal(oversized.status, 413);
    assert.equal(requests.length, 0);
  });
});

test('health and unknown routes are minimal and never invoke intake', async () => {
  await withServer(async (baseUrl, requests) => {
    assert.deepEqual(await (await fetch(`${baseUrl}/health/live`)).json(), { status: 'ok' });
    assert.deepEqual(await (await fetch(`${baseUrl}/health/ready`)).json(), { status: 'ready' });
    assert.equal((await fetch(`${baseUrl}/not-a-route`)).status, 404);
    assert.equal(requests.length, 0);
  });
});
