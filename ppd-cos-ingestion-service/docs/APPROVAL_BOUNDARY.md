# Approval boundary

Approve, Reject, Amend, Explain, and Remind Me arrive as versioned, immutable events. Ingress verifies their transport, schema, actor mapping, source binding, hashes, expiry, and submission permission, then records them exactly like any other proposal.

An approval event is not approval authority. The ingestion service cannot consume an approval and cannot execute an action. It has no dependency capable of approving, retrieving, transitioning lifecycle state, acknowledging a commitment, or writing Chief-of-Staff shared state.

The authoritative one-Chief-of-Staff runtime must validate an approval snapshot against all of the following immediately before execution:

- Verified approver identity and designated approver scope.
- Request and correlation IDs and approval handle.
- Exact action and payload hash.
- Exact target and operation.
- Applicable policy version and fresh access verdict.
- Issue time and expiry.
- One-time consumption state.
- Proposer identity, with self-approval prohibited.

An amendment has its own canonical hash and becomes a new bounded instruction. Any changed action, payload, target, or policy binding requires a new approval snapshot. Reject, Explain, and Remind Me are instructions for the authoritative lifecycle, not mutations performed by Chat or ingress.
