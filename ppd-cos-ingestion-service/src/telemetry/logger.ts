export type LogFields = Readonly<{
  requestId?: string;
  correlationId?: string;
  receiptId?: string;
  schemaVersion?: string;
  eventType?: string;
  resultState?: string;
  code?: string;
  durationMs?: number;
}>;

export interface Logger {
  info(event: string, fields: LogFields): void;
  error(event: string, fields: LogFields): void;
}

export const noopLogger: Logger = Object.freeze({
  info(): void {},
  error(): void {},
});
