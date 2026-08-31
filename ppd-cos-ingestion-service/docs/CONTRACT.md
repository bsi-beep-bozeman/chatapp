# Versioned intake contract

## Endpoint

The adapter submits canonical UTF-8 JSON with `POST /v1/intake-events`. The raw request body is limited to 32,768 bytes. The only accepted media type is `application/json`, optionally with a charset parameter.

Required headers are:

- `X-PPD-Key-Id`
- `X-PPD-Timestamp`
- `Idempotency-Key`
- `X-PPD-Signature`

The service verifies the signature over the exact raw body before JSON parsing. The v1 signature input is five newline-delimited UTF-8 values in this exact order:

```text
POST
/v1/intake-events
<X-PPD-Timestamp>
<Idempotency-Key>
<lowercase SHA-256 of the raw body>
```

`X-PPD-Signature` is `v1=` followed by the lowercase HMAC-SHA-256 value. Authentication material is obtained only through the secret-provider port. A timestamp more than 120 seconds behind or ahead of service time is rejected.

## Canonical envelopes

The entire request body must be canonical JSON: object keys sorted recursively, array order preserved, no whitespace outside string values, and no unsupported JSON values. The received bytes must exactly equal the canonical serialization. These v1 schemas are accepted without transformation:

- `ppd.cos.intake.v1`
- `ppd.cos.clarification-answer.v1`
- `ppd.cos.approval-decision.v1`

Every schema is closed to additional properties. The service recomputes payload, amendment, and idempotency hashes. The header and envelope idempotency keys must both equal the recomputed key. Expired or future-dated events fail closed.

## Bound fields

An accepted proposal binds its verified Google identity, source space/thread/message and channel, request and correlation IDs, event or decision ID, schema version, declared purpose, payload or action hash, creation and expiry, adapter identity/version, intake-policy decision, raw-body hash, and idempotency key.

## Results

Authenticated intake outcomes use `ppd.cos.ingestion-result.v1` and one of four states: `accepted`, `duplicate`, `rejected`, or `unavailable`. Contract outcomes use HTTP 200 so the Chat adapter can interpret the state. Boundary failures such as an invalid media type or oversized body use the corresponding HTTP error status.

- `accepted`: ingress and outbox rows committed atomically.
- `duplicate`: the same idempotency key and identical raw-body hash were already committed; the first receipt is returned.
- `rejected`: the request cannot be accepted unchanged.
- `unavailable`: durable acceptance could not be established; `retryable` states whether retry is appropriate.

The same key with a different raw-body hash returns `rejected` with `IDEMPOTENCY_CONFLICT`. Results never echo event contents, email addresses, space identifiers, key identifiers, signatures, hashes, database details, or policy internals.

## Queue boundary

The transactional outbox carries the validated inbound proposal envelope unchanged. It does not convert an intake proposal into the proactive Chat `ppd.cos.delivery.v1` shape. A queue publication is still only a proposal delivery to the accountable Chief of Staff; it is not a business-state transition.
