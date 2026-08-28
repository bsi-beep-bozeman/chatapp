import type { OutboxRepository } from './outbox-repository.js';
import type { QueuePublisherPort } from './queue-publisher.js';

export type DispatcherDependencies = Readonly<{
  repository: OutboxRepository;
  publisher: QueuePublisherPort;
  workerId: string;
  batchSize: number;
  now: () => Date;
}>;

export class OutboxDispatcher {
  constructor(private readonly dependencies: DispatcherDependencies) {
    if (
      !/^[A-Za-z0-9._-]{1,128}$/.test(dependencies.workerId)
      || !Number.isInteger(dependencies.batchSize)
      || dependencies.batchSize < 1
      || dependencies.batchSize > 100
    ) {
      throw new TypeError('DISPATCHER_CONFIG_INVALID');
    }
  }

  async runOnce(): Promise<number> {
    const items = await this.dependencies.repository.claimBatch(
      this.dependencies.workerId,
      this.dependencies.batchSize,
      this.dependencies.now(),
    );
    for (const item of items) {
      try {
        await this.dependencies.publisher.publish(item);
        await this.dependencies.repository.markPublished(
          item.outboxId,
          this.dependencies.workerId,
          this.dependencies.now(),
        );
      } catch {
        await this.dependencies.repository.markFailed(
          item.outboxId,
          this.dependencies.workerId,
          'QUEUE_PUBLISH_FAILED',
          this.dependencies.now(),
        );
      }
    }
    return items.length;
  }
}
