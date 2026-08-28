# Interaction schemas

## Envelope families

The `schemas/` folder is the machine-readable source for five versioned contracts:

- `ppd.cos.intake.v1` — a request or non-destructive Chat-space lifecycle proposal.
- `ppd.cos.approval-decision.v1` — an Approve, Reject, Amend, Explain, or Remind Me proposal.
- `ppd.cos.clarification-answer.v1` — a bounded answer tied to a clarification handle and existing request/correlation pair.
- `ppd.cos.delivery.v1` — a future proactive message command addressed to an exact user and destination.
- `ppd.cos.ingestion-result.v1` — the only allowed response family from a future ingestion service.

Every schema is closed with `additionalProperties: false`. Nested security-relevant objects are also closed. Permission booleans, display names, role claims, and raw Chat events are absent by design.

## Hashing

Objects are normalized with lexicographically sorted keys and preserved array order, serialized as canonical JSON, then hashed with SHA-256. The payload hash binds the exact semantic payload. An approval carries the expected exact-action payload hash; an amendment has its own hash and decision ID.

The future HTTPS contract signs the method, request path, timestamp, idempotency key, and body hash with HMAC-SHA-256. Authentication material is loaded only from a secret store. Signature validation is a transport control, not user authorization.

## Idempotency

Event IDs identify the platform interaction. Event-update IDs change when the bounded request content changes. Request and correlation IDs connect lifecycle events. The idempotency key binds the schema version, event/update identity, canonical actor, source, request, and payload hash.

The mock transport makes retry behavior testable but is not durable. A production ingestion service must enforce uniqueness transactionally and retain the first receipt. The adapter must reuse the same key on a retry and must never generate a new key to bypass a duplicate result.

## Transport outcomes

The future service may return only:

- `accepted`: the proposal was durably received for Chief of Staff validation; a receipt is required.
- `duplicate`: the same idempotency key was already received; the first receipt is returned.
- `rejected`: the service refused the proposal with a bounded machine code.
- `unavailable`: delivery could not be established; a bounded code and retryable flag are required.

Event acceptance is not authorization, commitment, or execution. Unknown fields, malformed states, invalid timestamps, invalid receipts, and non-2xx network responses collapse to a fail-closed unavailable result at the adapter boundary.

## Compatibility rules

Consumers must select behavior from the exact `schemaVersion`, never from guessed fields. New optional fields require a new version because these schemas are closed. Breaking changes require a new schema version and an explicit migration window. V1 producers must not silently emit V2 fields.

The Chief of Staff service must validate the complete schema before queue acceptance, then independently revalidate identity, Access Registry policy, lifecycle state, and payload hashes. Schema validity never grants access.

