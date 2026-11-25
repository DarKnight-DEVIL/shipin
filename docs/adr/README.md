# Architecture Decision Records

One file per decision that is expensive to reverse, that trades one risk for
another, or that a reviewer has already asked "why not the other way?". The point
is not ceremony: it is that the reasoning survives the person who had it.

- **Numbered, never renumbered.** `NNNN-short-title.md`.
- **Status** is `Proposed`, `Accepted`, `Superseded by ADR-NNNN`, or `Rejected`.
  A decision is superseded by writing a new record, not by editing the old one.
- **Sections**: Status, Date, Context, Decision, Consequences. Keep it to a page.
  The consequence section has to name what got worse, or the record is advocacy
  rather than a decision.

An ADR is not documentation of how the system works today — that is
`docs/ARCHITECTURE.md` and `docs/OPERATIONS.md`. It records *why*, at the moment
the choice was made, including the alternatives that were rejected and the cost
that was accepted.

| # | Decision | Status |
| --- | --- | --- |
| [0001](0001-fail-closed-production-configuration.md) | Production configuration fails closed at startup | Accepted |
| [0002](0002-static-rendering-no-isr.md) | Static rendering with client-side Firestore; no ISR | Accepted |
| [0003](0003-csp-without-nonces.md) | Strict CSP without nonces | Accepted |
| [0004](0004-test-layers.md) | Three test layers: mocked, emulator, live sandbox | Accepted |
| [0005](0005-dedicated-mfa-session-secret.md) | A dedicated MFA signing secret that fails closed | Accepted |
| [0006](0006-nonce-csp-for-authenticated-tree.md) | A nonce CSP for the authenticated tree only | Rejected |
| [0007](0007-trusted-types-report-only.md) | Trusted Types in report-only mode | Accepted |
| [0008](0008-money-as-integer-minor-units.md) | Money at rest is integer minor units | Accepted |
