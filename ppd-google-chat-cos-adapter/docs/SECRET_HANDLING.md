# Secret handling

## Prohibited locations

Never store a secret, private key, service-account document, ingestion URL, webhook URL, authentication token, HMAC value, or live deployment identifier in source control, `.gs` source, HTML, Markdown, a card, a Chat message, a test fixture, an ordinary Drive file, a Sheet, a copied support ticket, or a screenshot.

Never put secrets in ordinary Drive even if access is restricted. Never hardcode secrets in source. Never include them in error messages, exception objects returned to Chat, or diagnostic output.

Incoming webhook URLs are bearer credentials and notification-only endpoints; this app does not use them for conversation or approval.

## Apps Script Properties

Apps Script Properties are the minimum acceptable secret store for this lightweight trusted-tester prototype. Google documents Script Properties as shared across all users of a script, so only project editors trusted with all values may edit the project. Production should prefer a centrally managed secret store with access audit, rotation workflow, and short-lived credentials.

The recognized property names are listed here without values:

```text
TRANSPORT_MODE
INGESTION_URL
QUEUE_HMAC_KEY_ID
QUEUE_HMAC_SECRET
PROACTIVE_ENABLED
CHAT_APP_SERVICE_ACCOUNT_JSON
EXPECTED_WORKSPACE_DOMAIN_ID
```

Set and view them only through Apps Script Project Settings or an approved secret-deployment process. `TRANSPORT_MODE` must default to disabled when absent or invalid. Ingestion URL, HMAC material, and service-account material must be absent until their corresponding services have passed review.

## Service accounts

Proactive messages require Chat app authentication. Google's [authentication guide](https://developers.google.com/workspace/chat/authenticate-authorize) states that `chat.bot` uses app authentication, and the [message guide](https://developers.google.com/workspace/chat/create-messages) requires the Chat app to be a member of the target space.

Use a dedicated PPD test service account with no unrelated roles. Do not grant domain-wide delegation. Restrict key creation under organization policy where possible. The prototype accepts service-account JSON from Script Properties only; production should replace long-lived key material with a reviewed workload-identity or managed-secret design where supported.

The proactive path must remain disabled until the service account, target test space, least-privilege scope, rotation owner, and incident procedure are approved.

## Rotation

Assign an owner and expiry to every credential. Rotate on staff/editor change, suspected exposure, policy change, and the regular PPD rotation interval. Support overlapping HMAC key IDs during a bounded migration, then revoke the old key. Invalidate cached access tokens after service-account rotation.

After rotation, rerun local checks and a synthetic trusted-tester smoke test. Never preserve the old value in a document or commit.

## Logging

Log only stable error codes, request/correlation IDs when appropriate, transport state, and coarse timing. Do not log raw Chat events, message text, card parameters, request bodies, signatures, authorization headers, Script Properties, tokens, service-account fields, personal/sensitive results, Access Registry records, or stack traces that embed values.

User-facing responses remain generic. Cloud log access and retention must be explicitly restricted and reviewed before rollout.

## Incident response

1. Disable Chat app visibility and keep transport/proactive delivery disabled.
2. Revoke the suspected credential at its authority and clear related caches.
3. Preserve audit metadata without copying the exposed value.
4. Determine which editors, logs, deployments, spaces, and service calls were in scope.
5. Rotate dependent credentials, review Access Registry/audit evidence, and notify the PPD incident owner.
6. Fix the storage or logging path, rerun security tests, and require approval before a new trusted-tester deployment.

Do not delete audit evidence. Record fingerprints or key IDs, never the secret itself.

