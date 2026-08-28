export class IntakeError extends Error {
  constructor(
    readonly publicCode: string,
    readonly kind: 'rejected' | 'unavailable',
    readonly retryable = false,
  ) {
    super(publicCode);
    this.name = 'IntakeError';
  }
}
