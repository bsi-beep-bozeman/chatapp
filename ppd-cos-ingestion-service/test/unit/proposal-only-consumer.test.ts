import assert from 'node:assert/strict';
import test from 'node:test';

import {
  type FreshAccessCheck,
  ProposalOnlyChiefOfStaffMock,
  type ProposalOnlyDependencies,
} from '../../src/mock-cos/proposal-only-consumer.js';

const message = Object.freeze({
  subjectId: 'subject_test',
  requestId: `req_${'a'.repeat(32)}`,
  payloadHash: 'b'.repeat(64),
});

class RecordingAccess implements FreshAccessCheck {
  readonly phases: string[] = [];
  denyAt: 'pre_retrieval' | 'pre_execution' | null = null;

  async check(input: { phase: 'pre_retrieval' | 'pre_execution' }): Promise<'allow' | 'deny'> {
    this.phases.push(input.phase);
    return input.phase === this.denyAt ? 'deny' : 'allow';
  }
}

test('requires distinct fresh checks before retrieval and immediately before execution', async () => {
  const access = new RecordingAccess();
  const consumer = new ProposalOnlyChiefOfStaffMock(access);

  assert.deepEqual(await consumer.observe(message), { state: 'proposal_only' });
  assert.deepEqual(access.phases, ['pre_retrieval', 'pre_execution']);
});

test('blocks at either gate and exposes no state-writing capability', async () => {
  type Forbidden = Extract<
    keyof ProposalOnlyDependencies,
    'approve' | 'execute' | 'consumeApproval' | 'transition' | 'commit' | 'acknowledge'
  >;
  const containsNoWriter: Forbidden extends never ? true : false = true;
  assert.equal(containsNoWriter, true);

  const retrieval = new RecordingAccess();
  retrieval.denyAt = 'pre_retrieval';
  assert.deepEqual(
    await new ProposalOnlyChiefOfStaffMock(retrieval).observe(message),
    { state: 'blocked' },
  );
  assert.deepEqual(retrieval.phases, ['pre_retrieval']);

  const execution = new RecordingAccess();
  execution.denyAt = 'pre_execution';
  assert.deepEqual(
    await new ProposalOnlyChiefOfStaffMock(execution).observe(message),
    { state: 'blocked' },
  );
  assert.deepEqual(execution.phases, ['pre_retrieval', 'pre_execution']);
});
