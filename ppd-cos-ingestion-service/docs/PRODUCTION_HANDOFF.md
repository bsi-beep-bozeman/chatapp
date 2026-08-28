# Production handoff

## Current outcome

This local phase implements and tests the versioned intake boundary, cryptographic verification, schema and hash binding, read-only identity/policy ports, durable PostgreSQL ledger, transactional outbox, leased mock dispatch, proposal-only consumer, safe configuration, container build, and operational documentation.

It is not deployed. No Google Cloud project, billing account, IAM binding, Cloud SQL instance, Pub/Sub resource, Secret Manager value, DNS route, Workspace Chat configuration, tester assignment, or production data has been created or changed.

There is no live Access Registry provider, no live queue publisher, and no live Chief-of-Staff consumer. Production startup intentionally refuses to substitute mocks for those integrations.

## Work the implementation team can complete before PPD intervention

- Maintain the local service and tests.
- Perform code, dependency, threat-model, and container review.
- Prepare infrastructure-as-code and deployment runbooks as drafts.
- Define provider interfaces and synthetic staging tests.
- Produce release evidence and rollback criteria.

None of those activities authorize a deployment.

## PPD-owned decisions and approvals

PPD intervention is required later, at the production provisioning and release gates:

1. Select the organization-owned Google Cloud project and billing arrangement.
2. Approve region and data residency for compute, database, secrets, logs, and queue data.
3. Approve IAM and Google Workspace domain administration, service identities, least-privilege roles, and audit retention.
4. Provision production secret material directly into Secret Manager without passing values through source, Markdown, Drive, or chat.
5. Approve the live Access Registry integration and authoritative data ownership.
6. Approve the Pub/Sub topic/subscription and the separately identified Chief-of-Staff consumer.
7. Restrict the single Google Chat app to `ppdpainting.com` and select trusted testers.
8. Approve the staged tester rollout, approximately 16-employee rollout, rollback criteria, and final release authorization.

These are organization-level actions and cannot be safely inferred or performed from the local repository approval alone.

## Required staged release gates

1. Build, unit, contract, integration, coverage, dependency, container, and secret checks pass.
2. Independent security review closes all high-severity findings.
3. Staging uses separate non-production identities and synthetic data.
4. End-to-end staging proves identity mapping, shared-space least privilege, sensitive-result DM routing, approval immutability, duplicate handling, two fresh access checks, and Chief-of-Staff-only state writing.
5. PPD reviews monitoring, audit retention, backup/restore, incident response, and rollback evidence.
6. A named PPD owner grants final release authorization.

Recommended rollout is trusted testers first, followed by a small division cohort, then the approximately 16-person company scope. Each stage has a manual approval gate and a tested rollback path.
