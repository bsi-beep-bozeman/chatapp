import assert from 'node:assert/strict';
import test from 'node:test';

import { OutboxDispatcher } from '../../src/outbox/dispatcher.js';
import type { DispatchItem, OutboxRepository } from '../../src/outbox/outbox-repository.js';
import { MockQueuePublisher } from '../../src/outbox/queue-publisher.js';

const now = new Date('2026-08-28T06:30:00.000Z');
const item: DispatchItem = Object.freeze({
  outboxId: '00000000-0000-4000-8000-000000000001',
  receiptId: 'rcpt_dispatcher_test',
  topic: 'cos-intake',
  body: Object.freeze({ schemaVersion: 'ppd.cos.intake.v1' }),
});

class RecordingOutbox implements OutboxRepository {
  claimed: DispatchItem[] = [item];
  readonly published: string[] = [];
  readonly failed: string[] = [];

  async claimBatch(): Promise<DispatchItem[]> {
    return this.claimed.splice(0);
  }

  async markPublished(outboxId: string): Promise<void> {
    this.published.push(outboxId);
  }

  async markFailed(outboxId: string): Promise<void> {
    this.failed.push(outboxId);
  }
}

test('publishes a bounded claimed batch and marks the matching lease published', async () => {
  const repository = new RecordingOutbox();
  const publisher = new MockQueuePublisher();
  const dispatcher = new OutboxDispatcher({
    repository,
    publisher,
    workerId: 'worker-test-1',
    batchSize: 10,
    now: () => now,
  });

  assert.equal(await dispatcher.runOnce(), 1);
  assert.deepEqual(publisher.messages, [item]);
  assert.deepEqual(repository.published, [item.outboxId]);
  assert.deepEqual(repository.failed, []);
});

test('records only a stable failure code when publishing fails', async () => {
  const repository = new RecordingOutbox();
  const publisher = new MockQueuePublisher();
  publisher.failure = new Error('synthetic secret-like error must not persist');
  const dispatcher = new OutboxDispatcher({
    repository,
    publisher,
    workerId: 'worker-test-1',
    batchSize: 10,
    now: () => now,
  });

  assert.equal(await dispatcher.runOnce(), 1);
  assert.deepEqual(repository.published, []);
  assert.deepEqual(repository.failed, [item.outboxId]);
});

test('rejects unsafe worker and batch configuration', () => {
  const repository = new RecordingOutbox();
  const publisher = new MockQueuePublisher();
  for (const dependencies of [
    { repository, publisher, workerId: '', batchSize: 1, now: () => now },
    { repository, publisher, workerId: 'worker', batchSize: 0, now: () => now },
    { repository, publisher, workerId: 'worker', batchSize: 101, now: () => now },
  ]) {
    assert.throws(() => new OutboxDispatcher(dependencies), /DISPATCHER_CONFIG_INVALID/);
  }
});
