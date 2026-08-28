import { canonicalStringify, sha256Hex } from '../canonical/canonical-json.js';
import type { SchemaRegistry } from '../contracts/schema-registry.js';
import type { ValidatedEnvelope } from '../contracts/envelopes.js';
import { IntakeError } from '../domain/errors.js';

export function parseAndValidateEnvelope(
  rawBody: Buffer,
  schemas: SchemaRegistry,
  now: Date,
): ValidatedEnvelope {
  let value: unknown;
  try {
    value = JSON.parse(rawBody.toString('utf8'));
  } catch {
    throw new IntakeError('ENVELOPE_JSON_INVALID', 'rejected');
  }

  let canonical: string;
  try {
    canonical = canonicalStringify(value);
  } catch {
    throw new IntakeError('ENVELOPE_JSON_INVALID', 'rejected');
  }
  if (canonical !== rawBody.toString('utf8')) {
    throw new IntakeError('ENVELOPE_NOT_CANONICAL', 'rejected');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new IntakeError('ENVELOPE_SCHEMA_INVALID', 'rejected');
  }

  const record = value as Record<string, unknown>;
  const validator = schemas.get(String(record.schemaVersion ?? ''));
  if (!validator || !validator(value)) {
    throw new IntakeError('ENVELOPE_SCHEMA_INVALID', 'rejected');
  }

  const envelope = value as ValidatedEnvelope;
  const createdAt = Date.parse(envelope.createdAt);
  const expiresAt = Date.parse(envelope.expiresAt);
  if (
    !Number.isFinite(createdAt)
    || !Number.isFinite(expiresAt)
    || expiresAt <= createdAt
  ) {
    throw new IntakeError('ENVELOPE_TIME_INVALID', 'rejected');
  }
  if (now.getTime() > expiresAt) {
    throw new IntakeError('EVENT_EXPIRED', 'rejected');
  }
  if (createdAt > now.getTime() + 120_000) {
    throw new IntakeError('ENVELOPE_TIME_INVALID', 'rejected');
  }
  return Object.freeze(envelope);
}

export function rawBodyHash(rawBody: Buffer): string {
  return sha256Hex(rawBody.toString('utf8'));
}
