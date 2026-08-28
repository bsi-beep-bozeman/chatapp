import assert from 'node:assert/strict';
import test from 'node:test';

import { IntakeError } from '../../src/domain/errors.js';
import {
  RESULT_SCHEMA,
  accepted,
  duplicate,
  rejected,
  unavailable,
} from '../../src/domain/ingestion-result.js';

const now = '2026-08-28T06:30:00.000Z';

test('accepted has only its public state fields and is frozen', () => {
  const result = accepted('rcpt_accepted-1', now);

  assert.deepEqual(result, {
    schemaVersion: 'ppd.cos.ingestion-result.v1',
    state: 'accepted',
    receiptId: 'rcpt_accepted-1',
    receivedAt: now,
  });
  assert.equal(RESULT_SCHEMA, 'ppd.cos.ingestion-result.v1');
  assert.equal(Object.isFrozen(result), true);
  assert.equal('firstReceivedAt' in result, false);
  assert.equal('code' in result, false);
  assert.equal('retryable' in result, false);
});

test('duplicate has only its public state fields and is frozen', () => {
  const result = duplicate('rcpt_duplicate_1', now);

  assert.deepEqual(result, {
    schemaVersion: 'ppd.cos.ingestion-result.v1',
    state: 'duplicate',
    receiptId: 'rcpt_duplicate_1',
    firstReceivedAt: now,
  });
  assert.equal(Object.isFrozen(result), true);
  assert.equal('receivedAt' in result, false);
  assert.equal('code' in result, false);
  assert.equal('retryable' in result, false);
});

test('rejected has only its public state fields and is frozen', () => {
  const result = rejected('EVENT_EXPIRED');

  assert.deepEqual(result, {
    schemaVersion: 'ppd.cos.ingestion-result.v1',
    state: 'rejected',
    code: 'EVENT_EXPIRED',
  });
  assert.equal(Object.isFrozen(result), true);
  assert.equal('receiptId' in result, false);
  assert.equal('receivedAt' in result, false);
  assert.equal('firstReceivedAt' in result, false);
  assert.equal('retryable' in result, false);
});

test('unavailable has only its public state fields and is frozen', () => {
  const result = unavailable('DATABASE_UNAVAILABLE', true);

  assert.deepEqual(result, {
    schemaVersion: 'ppd.cos.ingestion-result.v1',
    state: 'unavailable',
    code: 'DATABASE_UNAVAILABLE',
    retryable: true,
  });
  assert.equal(Object.isFrozen(result), true);
  assert.equal('receiptId' in result, false);
  assert.equal('receivedAt' in result, false);
  assert.equal('firstReceivedAt' in result, false);
});

test('public codes must match the closed safe-code pattern without unsafe echo', () => {
  const unsafe = '<script>alert(1)</script>';

  for (const value of ['AB', 'bad_code', unsafe, `A${'B'.repeat(64)}`]) {
    assert.throws(
      () => rejected(value),
      (error: unknown) => {
        assert.ok(error instanceof TypeError);
        assert.doesNotMatch(error.message, new RegExp(unsafe.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
        return true;
      },
    );
  }
});

test('receipt IDs must match the closed safe-receipt pattern without unsafe echo', () => {
  const unsafe = 'rcpt_<unsafe>';

  for (const value of ['rcpt_', 'RCPT_valid', unsafe, `rcpt_${'a'.repeat(129)}`]) {
    assert.throws(
      () => accepted(value, now),
      (error: unknown) => {
        assert.ok(error instanceof TypeError);
        assert.doesNotMatch(error.message, /<unsafe>/);
        return true;
      },
    );
  }
});

test('IntakeError exposes routing metadata and defaults retryable to false', () => {
  const rejectedError = new IntakeError('EVENT_EXPIRED', 'rejected');
  const unavailableError = new IntakeError('DATABASE_UNAVAILABLE', 'unavailable', true);

  assert.equal(rejectedError.name, 'IntakeError');
  assert.equal(rejectedError.publicCode, 'EVENT_EXPIRED');
  assert.equal(rejectedError.kind, 'rejected');
  assert.equal(rejectedError.retryable, false);
  assert.equal(unavailableError.publicCode, 'DATABASE_UNAVAILABLE');
  assert.equal(unavailableError.kind, 'unavailable');
  assert.equal(unavailableError.retryable, true);
});
