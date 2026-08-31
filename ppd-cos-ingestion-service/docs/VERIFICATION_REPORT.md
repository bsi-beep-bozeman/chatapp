# Verification report

Date: 2026-08-28 (Australia/Perth)

Implementation commit: `441712c`

## Outcome

The standalone ingestion boundary passed the complete local verification plan, including real PostgreSQL integration, coverage thresholds, container construction, fail-closed container startup, and outage/recovery. This report does not claim production readiness or deployment; the live organization-owned integrations listed below remain intentionally absent.

## Toolchain observed

- Node.js 24.14.1
- npm 11.11.0
- PostgreSQL client 17.0
- Docker CLI and engine 29.5.3

No identities, endpoints, signatures, authentication material, connection strings, or event payloads are recorded here.

## Passed evidence

- TypeScript strict typecheck: passed.
- Production build: passed.
- Backend complete suite: 68 passed, 0 failed.
- PostgreSQL integration suite: 13 passed, 0 failed, including all nine durable-ledger/outbox cases.
- Coverage: 95.8% statements/lines, 87.36% branches, and 97.77% functions.
- Google Chat adapter regression: 79 passed, 0 failed.
- Backend secret scan: passed.
- Google Chat adapter secret/live-endpoint scan: passed.
- Production startup with default mock providers: refused with `PRODUCTION_PROVIDER_INVALID` as designed.
- Compose syntax validation: passed.
- Container image build: passed.
- Container runtime identity: non-root `node` user.
- Database stop/restart recovery: outage remained unavailable and the complete integration suite passed after recovery.
- Repository scope check: only `ppd-cos-ingestion-service` changed in the implementation commit.
- Whitespace/error check: passed.
- Runtime dependency audit at the high threshold: passed with no high or critical advisory.

The dependency audit reports one moderate AJV advisory that applies when AJV's optional `$data` mode is enabled. This service does not enable `$data`; all schema validators are constructed with that behavior disabled. The pinned version remains unchanged pending a separately reviewed dependency update.

## Security boundary reviewed

- Exact raw-byte HMAC verification precedes JSON parsing.
- Timestamp, schema, canonical JSON, expiry, payload/amendment hash, and idempotency bindings fail closed.
- Only the stable Google Chat user resource reaches the read-only Access Registry port.
- Display names and caller permission claims are unused.
- Submission, pre-retrieval, and pre-execution checks remain separate.
- Approval intake has no approval, retrieval, execution, consumption, transition, commitment, or acknowledgement capability.
- Ingress is append-only; outbox proposal identity/topic/body is immutable while delivery metadata may change.
- Database uncertainty returns `unavailable`; there is no in-memory persistence fallback.
- Queue retries use leases, bounded backoff, stable redacted failure codes, and quarantine rather than delete.
- Production startup refuses mocks and refuses unimplemented live providers.
- Logs and public results exclude bodies, identity, authentication material, connection details, and internal errors.

## Durable integration evidence

The PostgreSQL suite passed all of the following:

- Atomic ingress and outbox commit.
- Identical duplicate and changed-body conflict behavior.
- Twenty-way idempotency concurrency.
- Append-only ingress update/delete rejection.
- Outbox failure transaction rollback.
- Concurrent outbox lease claiming.
- Retry with immutable ingress/outbox payload.
- Expired-lease recovery and matching-worker publication.
- Bounded retry quarantine without deletion.

The complete coverage command ran against the unit, contract, documentation, HTTP, outage, and PostgreSQL suites. Every configured threshold passed. The local image built successfully, identifies the non-root runtime user, and refused production-default mock providers before binding a service port.

## Missing production integrations

There is still no live Access Registry provider, Pub/Sub publisher/subscription, version-pinned Secret Manager provider, Cloud SQL deployment, authenticated Chief-of-Staff consumer, or Google Cloud deployment. The Google Chat app has not been switched to this HTTPS service. No Workspace domain rollout or production release has occurred.

## Required next phase

Before any PPD-owned staging provisioning or release approval, complete an independent security review and intentionally implement the live Access Registry, Secret Manager, Cloud SQL, Pub/Sub, and Chief-of-Staff consumer providers. Then repeat these checks in a separate synthetic staging environment with organization-approved IAM, region, logging, rollback, and tester-rollout decisions.
