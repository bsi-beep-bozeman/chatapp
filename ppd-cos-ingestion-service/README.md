# PPD Chief of Staff ingestion service

This standalone service is the durable, fail-closed boundary between PPD's single Google Chat app and the existing one-Chief-of-Staff architecture. It verifies the adapter request, validates the versioned proposal envelope, resolves the stable Google Chat user through an Access Registry port, performs an intake-only policy check, and atomically writes an immutable ingress receipt plus an outbox record.

An `accepted` result means the event was durably recorded and queued. It does not mean the request was approved or executed. This service cannot retrieve protected business data, consume an approval, change Chief-of-Staff lifecycle state, write commitments, or execute an action.

## Current status

This repository is a production-shaped local implementation, not a production deployment. It currently provides the real HTTP, signature, schema, identity-port, persistence, idempotency, and outbox contracts with mock external providers. There is no live Access Registry integration, no live queue, and no live Chief-of-Staff consumer. The queue publisher and Chief-of-Staff consumer are explicitly test-only mocks.

Production startup refuses mock secret, registry, and queue providers. The named production provider integrations are also intentionally refused until separately implemented and reviewed.

## Architecture boundary

```text
Google Chat app -> signed HTTPS intake -> immutable ledger + outbox -> queue port -> one Chief of Staff
```

The service records proposals. The one Chief of Staff remains the only shared-state writer. Chat and the cockpit remain adapters over the same request, approval, commitment, and execution state.

## Start here

- [HTTP and event contract](docs/CONTRACT.md)
- [Identity and access contract](docs/IDENTITY_AND_ACCESS.md)
- [Approval boundary](docs/APPROVAL_BOUNDARY.md)
- [Local testing](docs/LOCAL_TESTING.md)
- [Secret handling](docs/SECRET_HANDLING.md)
- [Production handoff](docs/PRODUCTION_HANDOFF.md)

No PMT, cockpit, or Google Chat adapter source is imported or modified by this project.
