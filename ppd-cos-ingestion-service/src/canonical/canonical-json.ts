import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

type CanonicalValue =
  | null
  | string
  | boolean
  | number
  | CanonicalValue[]
  | { [key: string]: CanonicalValue };

function isPlainObject(value: object): boolean {
  const prototype = Object.getPrototypeOf(value) as object | null;
  return prototype === Object.prototype || prototype === null;
}

function normalize(value: unknown): CanonicalValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(normalize);
  }
  if (typeof value === 'object' && isPlainObject(value)) {
    const input = value as Record<string, unknown>;
    const output: Record<string, CanonicalValue> = {};
    for (const key of Object.keys(input).sort()) {
      output[key] = normalize(input[key]);
    }
    return output;
  }
  throw new TypeError('Unsupported canonical JSON value');
}

export function canonicalStringify(value: unknown): string {
  return JSON.stringify(normalize(value));
}

export function sha256Hex(value: unknown): string {
  const text = typeof value === 'string' ? value : canonicalStringify(value);
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

export function hmacSha256Hex(value: string, key: Uint8Array): string {
  return createHmac('sha256', key).update(value, 'utf8').digest('hex');
}

const LOWERCASE_HEX_BYTES_PATTERN = /^(?:[a-f0-9]{2})+$/;

export function equalHex(left: string, right: string): boolean {
  if (
    !LOWERCASE_HEX_BYTES_PATTERN.test(left)
    || !LOWERCASE_HEX_BYTES_PATTERN.test(right)
    || left.length !== right.length
  ) {
    return false;
  }
  return timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}
