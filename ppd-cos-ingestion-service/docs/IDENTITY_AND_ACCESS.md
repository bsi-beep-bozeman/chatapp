# Identity and access contract

## Identity source

HMAC authenticates the Google Chat adapter but does not authorize an employee. The sole Chat-to-registry mapping key is the stable `actor.chatUserName` resource supplied by the verified Google Chat interaction event, such as a `users/...` resource. Display names and caller-supplied roles, permissions, grants, or administrator flags are ignored.

The envelope email is corroborating information only. When present, it must case-insensitively match the canonical email returned by the Access Registry. Email never replaces the stable Chat user mapping key.

Only a single `mapped` registry resolution may proceed. `unmapped`, `disabled`, and `ambiguous` are rejected. Registry unavailability returns a bounded unavailable result and never falls back to a local grant cache or caller assertions.

## Separate authorization decisions

There are three intentionally distinct checks:

1. Submission: may this mapped subject submit this event from this source for this declared purpose?
2. Pre-retrieval: may the subject currently access the requested source, record, and fields for this purpose?
3. Pre-execution: immediately before acting, may the subject perform this exact action against this exact target and payload?

The ingestion service performs only the submission check. The authoritative Chief of Staff must re-resolve current access before protected retrieval and immediately before execution. An intake allow never promotes into retrieval or execution permission.

## Scope

Private direct messages may use personalized scope. Shared spaces always remain shared-space, least privilege scope. A shared-space request cannot inherit private DM context or personal permissions. Sensitive or personal results must be routed to an identity-bound DM by the authoritative delivery path.

The eventual Access Registry must support role-, division-, source-, record-, purpose-, field-, and action-scoped decisions for the approximately 16-person rollout. This repository defines a read-only port; there is no live Access Registry provider yet and no mutation API.
