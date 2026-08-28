# PPD Google Chat Chief of Staff Adapter

## Purpose

This standalone Google Apps Script project is the company-restricted Google Chat control surface for PPD's one-Chief-of-Staff architecture. One Chat app serves all employees. It converts verified Chat interactions into bounded, immutable proposal events for the same request, approval, commitment, and execution lifecycle used by the standalone cockpit.

The adapter does not run a second Chief of Staff. It does not own the Triage, Planner, Critic, Memory, Coder, Executor, Researcher, or Strategist skills. It does not write shared state, retrieve business records, authorize work, execute actions, delete data, or consume approvals.

## Current status

This is a contract-complete prototype scaffold, not a production-ready integration. PPD has no live HTTPS ingestion service today. The safe default is a disabled transport that returns an explicit unavailable result. When that occurs, the user is told that the service is not connected and that nothing was queued or changed.

The included HTTPS transport is a versioned contract implementation for a future, intentionally deployed ingestion service. Its presence does not imply that such a service or URL exists. Tests use an in-memory scripted transport only.

## Safety boundary

- Identity starts with the Google Chat interaction event's canonical `users/{id}` resource and is later mapped to the existing Access Registry. Display names and caller-supplied permission flags are ignored.
- The future Chief of Staff must revalidate permission before retrieval and again immediately before execution.
- Shared spaces receive only shared-space, least-privilege acknowledgements. Personal or sensitive output belongs in a direct message.
- Approval proposals bind approver identity, request, exact action/payload hash, target, policy version, expiry, and one-time consumption. The adapter proposes a decision; the Chief of Staff validates and consumes it atomically.
- There is no self-approval, bypass, delete path, or adapter-owned shared-state store.
- Incoming webhooks are notification-only and are not used as the conversational interface.

## Local verification

From this directory, run:

```text
npm test
npm run test:coverage
npm run check:secrets
npm run check
```

The full check requires at least 80% branch, function, and line coverage and a clean credential/live-endpoint scan. Local tests prove deterministic adapter behavior with sanitized fixtures; they do not prove a Google Workspace deployment or a live Chief of Staff service.

## Documentation map

- [Setup and deployment](docs/SETUP_AND_DEPLOYMENT.md)
- [Identity and access contract](docs/IDENTITY_AND_ACCESS_CONTRACT.md)
- [Interaction schemas](docs/INTERACTION_SCHEMAS.md)
- [Approval lifecycle](docs/APPROVAL_LIFECYCLE.md)
- [Testing](docs/TESTING.md)
- [Secret handling](docs/SECRET_HANDLING.md)
- [Prototype versus production](docs/PROTOTYPE_VS_PRODUCTION.md)
- Machine-readable JSON Schemas are in [`schemas/`](schemas/).

