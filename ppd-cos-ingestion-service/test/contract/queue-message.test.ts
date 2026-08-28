import assert from 'node:assert/strict';
import test from 'node:test';

import { MockQueuePublisher } from '../../src/outbox/queue-publisher.js';
import { fixtureSchemas, intakeEnvelope } from '../helpers/intake-fixture.js';

test('mock queue publishes an authoritative inbound proposal without reshaping it', async () => {
  const publisher = new MockQueuePublisher();
  const envelope = intakeEnvelope();
  await publisher.publish({
    outboxId: '00000000-0000-4000-8000-000000000001',
    receiptId: 'rcpt_queue_contract',
    topic: 'cos-intake',
    body: envelope,
  });

  const published = publisher.messages[0];
  assert.deepEqual(published?.body, envelope);
  const validator = fixtureSchemas.get(String(published?.body.schemaVersion));
  assert.ok(validator);
  assert.equal(validator(published?.body), true, JSON.stringify(validator.errors));
});
