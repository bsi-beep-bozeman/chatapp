export type QueueMessage = Readonly<{
  outboxId: string;
  receiptId: string;
  topic: string;
  body: Readonly<Record<string, unknown>>;
}>;

export interface QueuePublisherPort {
  publish(message: QueueMessage): Promise<void>;
}

function deepFreeze(value: unknown): unknown {
  if (value && typeof value === 'object') {
    for (const nested of Object.values(value)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}

export class MockQueuePublisher implements QueuePublisherPort {
  readonly kind = 'mock-test-only';
  readonly messages: QueueMessage[] = [];
  failure: Error | null = null;

  async publish(message: QueueMessage): Promise<void> {
    if (this.failure) throw this.failure;
    const copy = structuredClone(message) as QueueMessage;
    this.messages.push(deepFreeze(copy) as QueueMessage);
  }
}
