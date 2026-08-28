import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');

function document(relativePath: string): string {
  return readFileSync(path.join(root, relativePath), 'utf8');
}

test('README distinguishes durable intake from approval and execution', () => {
  const text = document('README.md');
  assert.match(text, /accepted.*durably recorded/is);
  assert.match(text, /does not mean.*approved.*executed/is);
  assert.match(text, /no live Access Registry/i);
  assert.match(text, /no live Chief.of.Staff consumer/i);
});

test('contract fixes route authentication body limit schemas and result states', () => {
  const text = document('docs/CONTRACT.md');
  for (const pattern of [
    /`POST \/v1\/intake-events`/,
    /X-PPD-Key-Id/,
    /X-PPD-Timestamp/,
    /Idempotency-Key/,
    /X-PPD-Signature/,
    /32,768 bytes/,
    /ppd\.cos\.intake\.v1/,
    /ppd\.cos\.clarification-answer\.v1/,
    /ppd\.cos\.approval-decision\.v1/,
    /accepted.*duplicate.*rejected.*unavailable/is,
    /canonical JSON/i,
    /IDEMPOTENCY_CONFLICT/,
  ]) assert.match(text, pattern);
});

test('identity and approval documents preserve all authorization boundaries', () => {
  const identity = document('docs/IDENTITY_AND_ACCESS.md');
  assert.match(identity, /HMAC.*does not authorize/i);
  assert.match(identity, /actor\.chatUserName/);
  assert.match(identity, /display names.*ignored/is);
  assert.match(identity, /pre-retrieval.*pre-execution/is);
  assert.match(identity, /shared spaces.*least privilege/is);

  const approval = document('docs/APPROVAL_BOUNDARY.md');
  assert.match(approval, /immutable event/i);
  assert.match(approval, /identity.*request.*hash.*target.*expiry.*one-time/is);
  assert.match(approval, /self-approval/i);
  assert.match(approval, /cannot consume.*cannot execute/is);
});

test('handoff lists user-owned production decisions and current non-deployment', () => {
  const text = document('docs/PRODUCTION_HANDOFF.md');
  assert.match(text, /project and billing/i);
  assert.match(text, /region and data residency/i);
  assert.match(text, /IAM/i);
  assert.match(text, /tester rollout/i);
  assert.match(text, /release authorization/i);
  assert.match(text, /not deployed/i);
});

test('secret handling requires a managed store rotation overlap and audit logging', () => {
  const text = document('docs/SECRET_HANDLING.md');
  assert.match(text, /never.*source.*Markdown/is);
  assert.match(text, /process-local/i);
  assert.match(text, /version-pinned.*Secret Manager/is);
  assert.match(text, /least privilege/i);
  assert.match(text, /rotation.*overlap/i);
  assert.match(text, /access log/i);
});
