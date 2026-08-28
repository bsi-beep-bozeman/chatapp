# Prototype versus production

## Prototype proves

This scaffold proves that one internal Google Chat app can act as a narrow adapter to the one-Chief-of-Staff design. It derives a bounded identity from Chat, separates DM and shared-space disclosure, constructs immutable hashed proposals, renders five exact approval controls and clarification dialogs, validates proactive-delivery commands, and exposes a fail-closed versioned transport contract.

It also proves through local tests that the adapter does not need to write Chief of Staff shared state. The single runtime remains the intended owner of the Triage, Planner, Critic, Memory, Coder, Executor, Researcher, and Strategist skills.

## Prototype does not guarantee

This scaffold is not production-ready. There is no live HTTPS ingestion service, no durable queue receipt, no durable idempotency, no Access Registry service lookup, no authoritative approval store/atomic consumption, no Chief of Staff worker integration, and no verified execution path. The mock transport is test-only; the HTTPS transport is a contract until an ingestion service is intentionally built.

Local tests do not guarantee Google Workspace configuration, request provenance beyond Google's managed Apps Script connection, Apps Script capacity, proactive authentication in the tenant, shared-space membership-aware projection, audit durability, recovery, or cockpit/Chat state convergence.

An `accepted` result would mean only “proposal received,” never “authorized,” “committed,” or “executed.” The adapter cannot retrieve records or execute actions.

## Production prerequisites

- Build and independently review a versioned ingestion service with HTTPS, authenticated requests, timestamp/replay bounds, schema validation, durable receipts, and atomic idempotency.
- Map the canonical `users/{id}` identity to exactly one active Access Registry subject; support role-, division-, source-, record-, purpose-, field-, and action-scoped policy.
- Recheck permissions before retrieval and again immediately before execution.
- Make the Chief of Staff the single shared-state writer for request, approval, commitment, and execution lifecycle data.
- Implement durable approval snapshots bound to identity, request, exact action/payload hash, target, policy, expiry, and one-time use; deny bypass and self-approval.
- Implement shared-space membership/purpose scoping and route personal or sensitive results to a bound DM.
- Add audited delivery-command storage so proactive messages and reminders are initiated by the Chief of Staff, not arbitrary adapter callers.
- Complete service-account/secret management, redacted observability, quotas, concurrency, retry/dead-letter, backup, recovery, and incident controls.
- Demonstrate that Chat and cockpit render the same authoritative lifecycle state and cannot race as independent writers.

## Rollout gates

1. **Local:** full tests, at least 80% branch/function/line coverage, clean secret scan, reviewed source isolation.
2. **Tenant configuration:** PPD-controlled project, Internal audience, specific trusted testers, least-privilege scopes, error logging review.
3. **Disabled smoke test:** DM/shared behaviors and all controls with synthetic data while nothing can queue or execute.
4. **Integration environment:** real ingestion/Access Registry/Chief of Staff test services, durable duplicate and approval-race tests, no production records.
5. **Security review:** threat model, request authentication, identity mapping, access decisions, secrets, logs, abuse, failure recovery, and manual kill switch.
6. **Pilot:** a small cross-role tester group with explicit support and rollback owners.
7. **Company rollout:** expand toward roughly 16 employees only after role/division/source/record/purpose/field/action test cases pass and audit evidence is accepted.

Any failed gate returns the deployment to disabled mode. No delete operation or state-write fallback is added to the adapter.

