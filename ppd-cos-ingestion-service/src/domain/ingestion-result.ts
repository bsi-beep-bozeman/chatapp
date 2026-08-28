export const RESULT_SCHEMA = 'ppd.cos.ingestion-result.v1' as const;

export type AcceptedResult = Readonly<{
  schemaVersion: typeof RESULT_SCHEMA;
  state: 'accepted';
  receiptId: string;
  receivedAt: string;
}>;

export type DuplicateResult = Readonly<{
  schemaVersion: typeof RESULT_SCHEMA;
  state: 'duplicate';
  receiptId: string;
  firstReceivedAt: string;
}>;

export type RejectedResult = Readonly<{
  schemaVersion: typeof RESULT_SCHEMA;
  state: 'rejected';
  code: string;
}>;

export type UnavailableResult = Readonly<{
  schemaVersion: typeof RESULT_SCHEMA;
  state: 'unavailable';
  code: string;
  retryable: boolean;
}>;

export type IngestionResult =
  | AcceptedResult
  | DuplicateResult
  | RejectedResult
  | UnavailableResult;

const PUBLIC_CODE_PATTERN = /^[A-Z][A-Z0-9_]{2,63}$/;
const RECEIPT_ID_PATTERN = /^rcpt_[A-Za-z0-9_-]{1,128}$/;

function safeCode(value: string): string {
  if (!PUBLIC_CODE_PATTERN.test(value)) {
    throw new TypeError('Unsafe result code');
  }
  return value;
}

function safeReceiptId(value: string): string {
  if (!RECEIPT_ID_PATTERN.test(value)) {
    throw new TypeError('Unsafe receipt ID');
  }
  return value;
}

export function accepted(receiptId: string, receivedAt: string): AcceptedResult {
  return Object.freeze({
    schemaVersion: RESULT_SCHEMA,
    state: 'accepted',
    receiptId: safeReceiptId(receiptId),
    receivedAt,
  });
}

export function duplicate(receiptId: string, firstReceivedAt: string): DuplicateResult {
  return Object.freeze({
    schemaVersion: RESULT_SCHEMA,
    state: 'duplicate',
    receiptId: safeReceiptId(receiptId),
    firstReceivedAt,
  });
}

export function rejected(code: string): RejectedResult {
  return Object.freeze({
    schemaVersion: RESULT_SCHEMA,
    state: 'rejected',
    code: safeCode(code),
  });
}

export function unavailable(code: string, retryable: boolean): UnavailableResult {
  return Object.freeze({
    schemaVersion: RESULT_SCHEMA,
    state: 'unavailable',
    code: safeCode(code),
    retryable,
  });
}
