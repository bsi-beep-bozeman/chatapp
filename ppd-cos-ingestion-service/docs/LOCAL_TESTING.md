# Local testing

## Prerequisites

- Node.js 24 matching `package.json`.
- Docker Desktop when running PostgreSQL integration tests.
- No production credentials or company data.

## Safe sequence

From this project directory:

```powershell
npm ci
npm run typecheck
npm run test:unit
npm run test:contract
docker compose up -d postgres
npm run test:integration
npm run test:coverage
npm run check:secrets
npm run audit:runtime
npm run build
```

The compose database binds only to `127.0.0.1:55432`, uses explicitly synthetic local-only credentials, and stores its data in a temporary in-memory filesystem. Integration tests create a unique schema per test and remove that schema afterward. They never connect to Drive, Google Chat, the PMT/cockpit, or company data.

Stop the local test database with `docker compose stop postgres`. Removing the disposable container is optional and affects only the synthetic local service defined by this project.

## Coverage and failure cases

Tests cover canonical schema parity, raw-body HMAC verification, replay bounds, payload/amendment/idempotency binding, every identity outcome, intake policy denial/outage, atomic ingress/outbox persistence, duplicate concurrency, idempotency conflict, append-only enforcement, rollback, HTTP limits, outbox leasing/recovery/retry/quarantine, proposal-only access gates, production provider refusal, documentation boundaries, and secret scanning.

The full test command is expected to fail with a connection-refused error if the isolated PostgreSQL service is not running. That is an environment failure, not a signal to use another database or add an in-memory fallback.

## What local tests do not prove

Local success does not prove Google Cloud IAM, Cloud SQL, Secret Manager, Pub/Sub, Workspace domain restriction, live Access Registry behavior, live Chief-of-Staff consumption, protected retrieval, approval consumption, execution, proactive delivery, operational alerting, disaster recovery, penetration resistance, or production load capacity.
