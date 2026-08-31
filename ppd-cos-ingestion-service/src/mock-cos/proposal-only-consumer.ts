export type CheckedMessage = Readonly<{
  subjectId: string;
  requestId: string;
  payloadHash: string;
}>;

export interface FreshAccessCheck {
  check(input: Readonly<{
    phase: 'pre_retrieval' | 'pre_execution';
    subjectId: string;
    requestId: string;
    payloadHash: string;
  }>): Promise<'allow' | 'deny'>;
}

export type ProposalOnlyDependencies = Readonly<{
  access: FreshAccessCheck;
}>;

export class ProposalOnlyChiefOfStaffMock {
  readonly kind = 'proposal-only-mock';

  constructor(private readonly access: FreshAccessCheck) {}

  async observe(
    message: CheckedMessage,
  ): Promise<Readonly<{ state: 'proposal_only' | 'blocked' }>> {
    if (
      !message.subjectId
      || !/^req_[a-f0-9]{32}$/.test(message.requestId)
      || !/^[a-f0-9]{64}$/.test(message.payloadHash)
    ) {
      return Object.freeze({ state: 'blocked' });
    }
    if (await this.access.check({ phase: 'pre_retrieval', ...message }) !== 'allow') {
      return Object.freeze({ state: 'blocked' });
    }
    if (await this.access.check({ phase: 'pre_execution', ...message }) !== 'allow') {
      return Object.freeze({ state: 'blocked' });
    }
    return Object.freeze({ state: 'proposal_only' });
  }
}
