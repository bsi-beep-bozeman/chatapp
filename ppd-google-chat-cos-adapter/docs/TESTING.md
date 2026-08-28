# Testing

## Local commands

Run from the standalone adapter folder:

```text
npm test
npm run test:coverage
npm run check:secrets
npm run check
```

`npm run check` is the handoff gate. It executes the complete test suite with coverage thresholds and then scans supported source/document formats for credential and live-deployment patterns. Tests are dependency-free and use Node's built-in runner.

## Test matrix

| Boundary | Evidence |
|---|---|
| Project isolation | No runtime data folder and no PMT/cockpit dependency |
| Canonicalization | Stable JSON, SHA-256/HMAC, ID shapes, mutation detection |
| Identity | Canonical `users/{id}`, human/domain checks, display-name and permission-claim exclusion |
| Disclosure | DM/shared classification and sensitive-output denial in shared spaces |
| Intake | Immutable bounded envelopes, stable retry IDs, expiry and size limits |
| Approval | Five exact actions, parameter allowlist, self-approval/expiry/hash checks, amendment rehash |
| Transport | Explicit accepted/duplicate/rejected/unavailable states, signing contract, redacted failures |
| Entry points | Message, membership, approval, amendment, and clarification flows with scripted transport |
| Proactive delivery | Exact user/space binding, DM policy, payload hash, deterministic message ID, disabled default |
| Schemas/docs | Closed versioned contracts and required operator/security guidance |

No test fixture contains a real employee identity, secret, endpoint, or business record.

## Coverage

The required minimum is 80% for branches, functions, and lines. Coverage is a floor, not a security proof. Boundary cases with a meaningful denial path are tested directly even when they do not materially affect the percentage.

The final handoff must report the actual test count and percentages from a fresh run. It must not reuse an earlier result after source changes.

## Trusted-tester checklist

The following actions must be performed by a PPD Google Workspace administrator; they are not completed by local verification:

- [ ] Link the PPD-controlled Cloud project.
- [ ] Enable Google Chat API.
- [ ] Set the OAuth audience to Internal.
- [ ] Create the Apps Script test deployment.
- [ ] Restrict visibility to named trusted testers or approved groups.
- [ ] Confirm the disabled transport returns “not connected yet” and says nothing was queued or changed.
- [ ] Test a DM and a dedicated shared-space mention with synthetic requests.
- [ ] Test approval buttons, amendment dialog, and clarification dialog with fixtures only.
- [ ] Confirm shared-space output is generic and sensitive output is not posted there.
- [ ] Configure proactive app authentication only in a dedicated test space, and only after separate review.
- [ ] Inspect redacted Cloud logs and verify that they contain no secrets or sensitive payloads.

## Production test gaps

Local tests do not cover Google Workspace administrator configuration, real Chat event delivery, Apps Script quotas/concurrency, service-account policy, Cloud Logging retention, network failure under load, a live ingestion service, Access Registry lookup, durable idempotency, approval races, Chief of Staff skill routing, retrieval authorization, execution authorization, Cockpit/Chat convergence, audit retention, disaster recovery, or the roughly 16-person rollout.

Those gaps must be closed in staged integration, security, abuse, concurrency, and recovery tests before production. Until then, keep the transport disabled.

