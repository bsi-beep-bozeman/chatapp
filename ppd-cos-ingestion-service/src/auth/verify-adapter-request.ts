import { equalHex, hmacSha256Hex, sha256Hex } from '../canonical/canonical-json.js';
import { IntakeError } from '../domain/errors.js';
import type { SecretProvider } from './secret-provider.js';

export type SignedRequest = Readonly<{
  method: string;
  path: string;
  rawBody: Buffer;
  headers: Readonly<{
    keyId: string;
    timestamp: string;
    idempotencyKey: string;
    signature: string;
  }>;
}>;

export async function verifyAdapterRequest(
  request: SignedRequest,
  secrets: SecretProvider,
  now: Date,
): Promise<void> {
  const headers = request.headers;
  if (
    !/^[A-Za-z0-9._-]{1,64}$/.test(headers.keyId)
    || !/^[a-f0-9]{64}$/.test(headers.idempotencyKey)
    || !/^v1=[a-f0-9]{64}$/.test(headers.signature)
  ) {
    throw new IntakeError('ADAPTER_AUTHENTICATION_FAILED', 'rejected');
  }

  const sentAt = Date.parse(headers.timestamp);
  if (!Number.isFinite(sentAt) || Math.abs(now.getTime() - sentAt) > 120_000) {
    throw new IntakeError('ADAPTER_TIMESTAMP_INVALID', 'rejected');
  }

  let key: Uint8Array | null;
  try {
    key = await secrets.getHmacKey(headers.keyId);
  } catch {
    throw new IntakeError('SECRET_PROVIDER_UNAVAILABLE', 'unavailable', true);
  }
  if (!key) {
    throw new IntakeError('ADAPTER_AUTHENTICATION_FAILED', 'rejected');
  }

  const signatureInput = [
    request.method,
    request.path,
    headers.timestamp,
    headers.idempotencyKey,
    sha256Hex(request.rawBody.toString('utf8')),
  ].join('\n');
  const expected = hmacSha256Hex(signatureInput, key);
  if (!equalHex(expected, headers.signature.slice(3))) {
    throw new IntakeError('ADAPTER_AUTHENTICATION_FAILED', 'rejected');
  }
}
