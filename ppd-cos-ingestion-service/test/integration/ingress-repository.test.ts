import assert from 'node:assert/strict';
import test from 'node:test';

import { sha256Hex } from '../../src/canonical/canonical-json.js';
import { PostgresIngressRepository } from '../../src/persistence/ingress-repository.js';
import type { AcceptedEvent } from '../../src/persistence/types.js';
import { withTestDatabase } from '../helpers/postgres.js';

function acceptedEvent(suffix = 'a'): AcceptedEvent {
  const payload = { text: `Synthetic request ${suffix}` };
  const payloadHash = sha256Hex(payload);
  const envelope = {
    schemaVersion: 'ppd.cos.intake.v1' as const,
    eventType: 'request.submitted',
    eventId: `evt_${suffix.repeat(32)}`,
    eventUpdateId: `upd_${suffix.repeat(32)}`,
    requestId: `req_${suffix.repeat(32)}`,
    correlationId: `cor_${suffix.repeat(32)}`,
    actor: {
      chatUserName: `users/test-${suffix}`,
      email: 'person@example.com',
      domainId: 'example-domain',
      type: 'HUMAN' as const,
      source: 'google_chat_interaction' as const,
    },
    source: {
      platform: 'google_chat' as const,
      spaceName: `spaces/DM_${suffix}`,
      spaceType: 'DIRECT_MESSAGE' as const,
      channel: 'dm' as const,
      threadName: null,
      messageName: null,
    },
    purpose: 'synthetic_assistance',
    payload,
    payloadHash,
    createdAt: '2026-08-28T06:29:00.000Z',
    expiresAt: '2026-08-28T06:34:00.000Z',
    idempotencyKey: sha256Hex(`idempotency-${suffix}`),
    adapter: { name: 'ppd-google-chat-cos-adapter' as const, version: '1.2.3' },
  };
  return {
    receiptId: `rcpt_${suffix}`,
    envelopeId: envelope.eventId,
    envelope,
    rawBodyHash: sha256Hex(`raw-body-${suffix}`),
    payloadHash,
    registrySubjectId: `subject_test_${suffix}`,
    purpose: envelope.purpose,
    policyVersion: 'policy_test_v1',
    policyEvaluationId: `eval_test_${suffix}`,
    receivedAt: '2026-08-28T06:30:00.000Z',
    topic: 'cos-intake',
  };
}

async function tableCounts(pool: import('pg').default.Pool): Promise<{ ingress: number; outbox: number }> {
  const result = await pool.query(
    'SELECT (SELECT count(*)::int FROM ingress_events) AS ingress, '
    + '(SELECT count(*)::int FROM outbox_events) AS outbox',
  );
  return result.rows[0] as { ingress: number; outbox: number };
}

test('atomically commits one immutable ingress row and one pending outbox row', async () => {
  await withTestDatabase(async (pool) => {
    const repository = new PostgresIngressRepository(pool);
    const event = acceptedEvent();
    const result = await repository.accept(event);

    assert.deepEqual(result, {
      kind: 'accepted',
      receiptId: event.receiptId,
      receivedAt: event.receivedAt,
    });
    assert.deepEqual(await tableCounts(pool), { ingress: 1, outbox: 1 });
    const outbox = await pool.query('SELECT state, attempt_count FROM outbox_events');
    assert.deepEqual(outbox.rows[0], { state: 'pending', attempt_count: 0 });
  });
});

test('returns duplicate for the same key and body and conflict for a changed body', async () => {
  await withTestDatabase(async (pool) => {
    const repository = new PostgresIngressRepository(pool);
    const event = acceptedEvent();
    await repository.accept(event);

    assert.deepEqual(await repository.accept(event), {
      kind: 'duplicate',
      receiptId: event.receiptId,
      firstReceivedAt: event.receivedAt,
    });
    assert.deepEqual(
      await repository.accept({ ...event, rawBodyHash: 'b'.repeat(64) }),
      { kind: 'conflict' },
    );
    assert.deepEqual(await tableCounts(pool), { ingress: 1, outbox: 1 });
  });
});

test('database uniqueness yields one accepted result under concurrency', async () => {
  await withTestDatabase(async (pool) => {
    const repository = new PostgresIngressRepository(pool);
    const event = acceptedEvent('c');
    const outcomes = await Promise.all(
      Array.from({ length: 20 }, () => repository.accept(event)),
    );

    assert.equal(outcomes.filter((value) => value.kind === 'accepted').length, 1);
    assert.equal(outcomes.filter((value) => value.kind === 'duplicate').length, 19);
    assert.deepEqual(await tableCounts(pool), { ingress: 1, outbox: 1 });
  });
});

test('ingress rows reject update and delete attempts', async () => {
  await withTestDatabase(async (pool) => {
    const repository = new PostgresIngressRepository(pool);
    await repository.accept(acceptedEvent());

    await assert.rejects(pool.query(
      'UPDATE ingress_events SET purpose = $1',
      ['changed'],
    ), /append-only/);
    await assert.rejects(pool.query('DELETE FROM ingress_events'), /append-only/);
  });
});

test('outbox insertion failure rolls back the ingress row', async () => {
  await withTestDatabase(async (pool) => {
    const repository = new PostgresIngressRepository(pool);
    await assert.rejects(repository.accept({
      ...acceptedEvent(),
      topic: 'x'.repeat(129),
    }));
    assert.deepEqual(await tableCounts(pool), { ingress: 0, outbox: 0 });
  });
});
