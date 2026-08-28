import type { Source, ValidatedEnvelope } from '../contracts/envelopes.js';

export type IntakePolicyVerdict =
  | Readonly<{
      kind: 'allow';
      evaluationId: string;
      policyVersion: string;
    }>
  | Readonly<{ kind: 'deny'; code: string }>
  | Readonly<{ kind: 'unavailable'; retryable: boolean }>;

export type IntakePolicyInput = Readonly<{
  subjectId: string;
  source: Source;
  purpose: string;
  eventType: string;
  schemaVersion: ValidatedEnvelope['schemaVersion'];
}>;

export interface IntakePolicyPort {
  evaluate(input: IntakePolicyInput): Promise<IntakePolicyVerdict>;
}

export class MockIntakePolicy implements IntakePolicyPort {
  readonly kind = 'mock-test-only';
  private readonly verdict: IntakePolicyVerdict;

  constructor(verdict: IntakePolicyVerdict) {
    this.verdict = Object.freeze({ ...verdict });
  }

  async evaluate(_input: IntakePolicyInput): Promise<IntakePolicyVerdict> {
    return this.verdict;
  }
}
