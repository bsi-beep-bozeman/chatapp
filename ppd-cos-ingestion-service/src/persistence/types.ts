import type { ValidatedEnvelope } from '../contracts/envelopes.js';

export type AcceptedEvent = Readonly<{
  receiptId: string;
  envelopeId: string;
  envelope: ValidatedEnvelope;
  rawBodyHash: string;
  payloadHash: string | null;
  registrySubjectId: string;
  purpose: string;
  policyVersion: string;
  policyEvaluationId: string;
  receivedAt: string;
  topic: string;
}>;

export type AcceptOutcome =
  | Readonly<{ kind: 'accepted'; receiptId: string; receivedAt: string }>
  | Readonly<{ kind: 'duplicate'; receiptId: string; firstReceivedAt: string }>
  | Readonly<{ kind: 'conflict' }>;

export interface IngressRepository {
  accept(event: AcceptedEvent): Promise<AcceptOutcome>;
}
