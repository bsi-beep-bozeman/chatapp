# Identity and access contract

## Canonical identity

The only interaction identity accepted by the adapter is the Google Chat event's canonical user resource in `user.name`, shaped as `users/{id}`. The event must represent a human. A supplied `ppdpainting.com` email and Workspace domain ID can corroborate the account, but neither replaces the canonical resource.

Never trust a display name, typed email in a message, card parameter, claimed role, `canExecute` flag, or caller-supplied permission object. The adapter copies only an allowlisted identity projection and discards the rest of the raw event.

For platform details, see Google's [interaction event](https://developers.google.com/workspace/chat/api/reference/rest/v1/Event) and [identify users](https://developers.google.com/workspace/chat/identify-reference-users) references. Apps Script receives interactions through Google's managed connection; a future HTTP implementation must additionally follow Google's [request verification](https://developers.google.com/workspace/chat/verify-requests-from-chat) guidance.

## Registry mapping

The future Chief of Staff ingestion service must resolve `google_chat_interaction + users/{id}` to exactly one active Access Registry subject. No match, multiple matches, suspended account, external domain, stale registry data, or inconsistent corroborating attributes must fail closed.

The registry is authoritative for access. It must be able to evaluate role-, division-, source-, record-, purpose-, field-, and action-scoped policy for the planned population of roughly 16 employees. The Chat adapter does not cache or reproduce that authorization model.

## Pre-retrieval gate

After accepting an intake proposal but before retrieval, the Chief of Staff must:

1. Re-resolve the canonical user to the current Access Registry entry.
2. Evaluate role, division, source, record, purpose, and field scope against the proposed retrieval.
3. Derive the permitted response channel and data projection.
4. Reject or request clarification when policy, identity, purpose, or target is ambiguous.

Event acceptance is not authorization. An `accepted` transport receipt means only that a valid proposal was durably received by the future service.

## Pre-execution gate

Immediately before execution, the single Chief of Staff runtime must re-resolve identity and re-evaluate the current action-scoped policy, target, payload hash, approval snapshot, expiry, and one-time-use state. It must also reject self-approval and any proposal changed after approval.

No earlier check, card click, transport receipt, plan, or cockpit display can substitute for this gate. The Executor skill executes only after this recheck; the adapter cannot invoke it directly.

## Shared-space policy

Direct messages can receive personalized output within the user's current scope. Shared spaces and group chats use the shared-space, least-privilege intersection for their members and purpose. They receive only generic intake/decision status from this adapter.

Personal or sensitive results must go to a verified direct-message destination bound to the intended `users/{id}`. A shared-space request never authorizes posting a private result back into that space.

## Failure modes

Fail closed on missing or malformed user/space/message identity, non-human actors, external corroborating email, unexpected domain ID, stale interactions, unsupported space types, ambiguous registry mapping, inaccessible target, insufficient purpose, changed action hash, expired approval, reused approval, self-approval, target mismatch, unavailable ingestion, or an unknown transport response.

User-facing errors are generic. Internal logs may record a stable error code and correlation ID, but never secrets, raw credentials, complete event bodies, or sensitive business data.

