# Approval lifecycle

## Snapshot binding

The Chief of Staff, not this adapter, creates the durable approval snapshot. It must bind the approval handle, request and correlation IDs, proposer identity, permitted approver identities, exact action/payload hash, target, human-readable action summary, policy version, issue time, expiry, and unused state.

The Chat card carries only bounded opaque bindings needed to propose a decision. On click, actor and source come from the fresh Google Chat event. The adapter never accepts an approver identity or permission flag from card parameters.

## Five controls

- **Approve** proposes approval of exactly the bound action.
- **Reject** proposes rejection; it does not delete the request or audit trail.
- **Amend** opens a dialog. Submitting the dialog creates a new bounded instruction, amendment hash, decision ID, and idempotency key.
- **Explain** asks the Chief of Staff to explain the proposed action without approving it.
- **Remind Me** asks the Chief of Staff to schedule a reminder proposal without approving or executing the action.

Every submitted control remains proposal-only until the Chief of Staff validates it.

## Self-approval denial

The proposer cannot approve their own proposal. The Chief of Staff must compare the freshly resolved approver identity with the bound proposer and permitted approver set. The adapter includes a pure snapshot validator for contract tests, but only the durable service can enforce this authoritatively.

## Amendment invalidation

Amendment changes the proposed action. The old approval cannot carry forward. The Chief of Staff must invalidate the prior snapshot, create a newly hashed proposal, repeat policy/critic review as required, and request a fresh approval for the new exact action and target.

Changing presentation text does not change the authorization binding; changing action, payload, target, purpose, or relevant policy does.

## Atomic consumption

A production Chief of Staff service must enforce one-time use and consume an approval exactly once in the same durable transaction that verifies identity, permitted approver, request, exact action/payload hash, target, policy version, expiry, and unused state. Concurrent attempts must yield one winner and explicit duplicate/rejected outcomes.

The Chat adapter never marks an approval used and never writes commitment or execution state. This preserves the Chief of Staff as the single shared-state writer.

## Expiry

Card interaction events expire after five minutes in this contract. A durable approval snapshot may live for at most 24 hours and can use a shorter policy-specific lifetime. Expired, malformed, already-consumed, changed, or missing snapshots fail closed. Reminders do not extend approval expiry; they lead to a new interaction.
