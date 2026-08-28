import assert from 'node:assert/strict';
import test from 'node:test';

import { sha256Hex } from '../../src/canonical/canonical-json.js';
import { PostgresIngressRepository } from '../../src/persistence/ingress-repository.js';
import type { AcceptedEvent } from '../../src/persistence/types.js';
import { PostgresOutboxRepository } from '../../src/outbox/outbox-repository.js';
import { intakeEnvelope } from '../helpers/intake-fixture.js';
import { withTestDatabase } from '../helpers/postgres.js';

const receivedAt = new Date('2026-08-28T06:30:00.000Z');

function acceptedEvent(): AcceptedEvent {
  const envelope = intakeEnvelope();
  return {
    receiptId: 'rcpt_outbox_test',
    envelopeId: String(envelope.eventId),
    envelope,
    rawBodyHash: sha256Hex('synthetic-raw-body'),
    payloadHash: String(envelope.payloadHash),
    registrySubjectId: 'subject_test',
    purpose: String(envelope.purpose),
    policyVersion: 'policy_test_v1',
    policyEvaluationId: 'evaluation_test',
    receivedAt: receivedAt.toISOString(),
    topic: 'cos-intake',
  };
}

test('concurrent workers claim one immutable proposal only once', async () => {
  await withTestDatabase(async (pool) => {
    const event = acceptedEvent();
    await new PostgresIngressRepository(pool).accept(event);
    const repository = new PostgresOutboxRepository(pool);

    const claimed = await Promise.all([
      repository.claimBatch('worker-one', 10, receivedAt),
      repository.claimBatch('worker-two', 10, receivedAt),
    ]);
    assert.equal(claimed.flat().length, 1);
    assert.deepEqual(claimed.flat()[0]?.body, event.envelope);
  });
});

test('publish failure retries without changing the ingress or outbox payload', async () => {
  await withTestDatabase(async (pool) => {
    const event = acceptedEvent();
    await new PostgresIngressRepository(pool).accept(event);
    const repository = new PostgresOutboxRepository(pool);
    const [item] = await repository.claimBatch('worker-one', 1, receivedAt);
    assert.ok(item);

    await repository.markFailed(item.outboxId, 'worker-one', 'QUEUE_PUBLISH_FAILED', receivedAt);
    const row = await pool.query(
      'SELECT state, attempt_count, delivery_envelope FROM outbox_events WHERE outbox_id = $1',
      [item.outboxId],
    );
    assert.equal(row.rows[0].state, 'pending');
    assert.equal(row.rows[0].attempt_count, 1);
    assert.deepEqual(row.rows[0].delivery_envelope, event.envelope);
    const ingress = await pool.query('SELECT canonical_envelope FROM ingress_events');
    assert.deepEqual(ingress.rows[0].canonical_envelope, event.envelope);
    await assert.rejects(
      pool.query(
        'UPDATE outbox_events SET delivery_envelope = $1 WHERE outbox_id = $2',
        [{ schemaVersion: 'changed' }, item.outboxId],
      ),
      /payload is immutable/,
    );
  });
});

test('expired leases recover and matching workers alone can publish', async () => {
  await withTestDatabase(async (pool) => {
    await new PostgresIngressRepository(pool).accept(acceptedEvent());
    const repository = new PostgresOutboxRepository(pool);
    const [first] = await repository.claimBatch('worker-one', 1, receivedAt);
    assert.ok(first);

    assert.equal((await repository.claimBatch('worker-two', 1, receivedAt)).length, 0);
    const afterLease = new Date(receivedAt.getTime() + 61_000);
    const [recovered] = await repository.claimBatch('worker-two', 1, afterLease);
    assert.equal(recovered?.outboxId, first.outboxId);

    await assert.rejects(
      repository.markPublished(first.outboxId, 'worker-one', afterLease),
      /OUTBOX_LEASE_LOST/,
    );
    await assert.doesNotReject(
      repository.markPublished(first.outboxId, 'worker-two', afterLease),
    );
  });
});

test('bounded failures quarantine rather than delete the proposal', async () => {
  await withTestDatabase(async (pool) => {
    await new PostgresIngressRepository(pool).accept(acceptedEvent());
    const repository = new PostgresOutboxRepository(pool);
    let current = receivedAt;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const [item] = await repository.claimBatch('worker-one', 1, current);
      assert.ok(item);
      await repository.markFailed(item.outboxId, 'worker-one', 'QUEUE_PUBLISH_FAILED', current);
      current = new Date(current.getTime() + 301_000);
    }
    const row = await pool.query('SELECT state, attempt_count, last_error_code FROM outbox_events');
    assert.deepEqual(row.rows[0], {
      state: 'quarantined',
      attempt_count: 5,
      last_error_code: 'QUEUE_PUBLISH_FAILED',
    });
    assert.deepEqual(
      (await pool.query('SELECT count(*)::int AS count FROM ingress_events')).rows[0],
      { count: 1 },
    );
  });
});
