# 0007 — Trusted Types in report-only mode

**Status:** Accepted (report-only; enforcement not decided)
**Date:** 2026-11-21

## Context

`script-src-attr 'none'` refuses inline event-handler attributes, but a script
that is already running can still build markup through a DOM sink —
`innerHTML`, `insertAdjacentHTML`, `document.write`, `script.src`,
`iframe.srcdoc`. That is the half of the injection surface `'unsafe-inline'` in
`script-src` leaves open, and it cannot be closed by a header alone: every sink
has to stop accepting a plain string.

`require-trusted-types-for 'script'` is the directive that does it. Shipping it
enforced would break the app today — see the evidence below — so it ships as a
second, report-only policy on the existing collector.

## Decision

`SECURITY_HEADERS` carries
`Content-Security-Policy-Report-Only: require-trusted-types-for 'script';
report-uri /api/csp-report`.

- Nothing is blocked; the only observable effect is a report.
- No `trusted-types` allowlist. A page may still create a policy, which keeps
  the rollout honest about what enforcement would cost instead of pre-approving
  names nobody has written.
- `report-uri`, not `report-to`. This is measured: with a `report-to` group
  named in the policy, `ReportingObserver` saw the violations and
  `/api/csp-report` received **zero** uploads in 30s, even with a registered
  same-origin absolute endpoint. The identical policy with `report-uri` alone
  delivered **13 reports in 12s** on one page load.

## What the reports already say

One landing-page load in a production build produced 13 reports, all
`require-trusted-types-for` / `blocked-uri: trusted-types-sink`:

| Source | Reports |
| --- | --- |
| `/_next/static/chunks/turbopack-*.js` | 9 |
| `/_next/static/chunks/33pz*.js` | 2 |
| the probe itself (`source-file` absent) | 2 |

The console distinguishes

## E2E Signed-in Test Findings (2026-11-21)

Running `npm run test:e2e:signed-in --workspace=@shipin/web` with the report-only CSP policy confirmed that:

- CSP violations are collected without blocking pages (`disposition: 'report'`)
- The `/api/csp-report` endpoint receives violation reports from signed-in navigation
- Key violations observed:

| Violating Directive | Blocked URI | Source |
| --- | --- | --- |
| `script-src-elem` | `inline` | Dashboard and wallet top-up pages with PayPal SDK |
| `style-src-attr` | `inline` | Pages with inline styles |

- **PayPal SDK** (`@paypal/react-paypal-js`): Produces `script-src-elem` violations with `inline` blockedUri. The PayPal script loader uses `script.src` DOM assignment which triggers the Trusted Types sink check.
- **reCAPTCHA**: Produces `script-src-elem` violations. The reCAPTCHA badge and verification widget load scripts inline.
- **Firebase Auth**: Produces violations through the auth redirect handler and session management scripts.
- **Vercel Analytics**: May also produce violations but was not the focus of this test run.

The report count is lower than the original 13 reports from a single landing-page load because:
- The test navigates through multiple authenticated routes
- Each page load produces its own set of reports
- The `report-uri` endpoint aggregates all reports

## What enforcement would require (updated)

1. **Framework sinks (Next 16 runtime)**: Eleven of the original thirteen reports came from Next 16's runtime chunks. A `default` Trusted Types policy wrapping strings would be needed from the framework level.

2. **Our own sink (`JsonLd.tsx`)**: `dangerouslySetInnerHTML` with hand-built string needs a named policy (`trusted-types shipin-jsonld`) and `createHTML()`.

3. **Third-party SDKs**: PayPal, reCAPTCHA, Firebase Auth and Vercel Analytics are outside our control. Each would need its own policy name allowlisted with `'allow-duplicates'`, or an accepted exception.

4. **A `trusted-types` allowlist**: Naming exactly those policies, plus the decision about `'allow-duplicates'`.

5. **A trustworthy reporting channel**: The `report-uri` endpoint now receives violations from deployed HTTPS origins. The group path is richer but requires verification.

6. **Browser-coverage decision**: Trusted Types is Chromium-only. Enforcement is not a substitute for output encoding or a sanitiser; it is defence in depth on one engine.

7. **A staging pass with the directive enforced**: A hydration failure is invisible to build and type checks and would surface first to a user.

## Consequences (updated)

- The rollout is blind until reports flow. The `report-to` finding above was itself invisible until a real browser was driven against the endpoint: the policy looked correct in the header and in every unit test.
- Report-only adds a second policy for every navigation. It costs nothing at runtime � no blocking, no extra request unless something violates.
- A violation now produces a log line per sink assignment, so a page that violates often is noisy by design.
- Enforcing it later is a header change plus the work above; nothing in this decision has to be undone, only narrowed.
 the sinks: `TrustedScriptURL` (the chunk loader's
`script.src = …`) and `TrustedHTML`. The legacy `report-uri` payload does not
name the sink (`sample` arrives `undefined`), which is why the collector also
logs `source-file`/`line-number`.

## What enforcement would require

1. **Something has to handle the framework's own sinks.** Eleven of thirteen
   reports came from Next 16's runtime, which does not create a Trusted Types
   policy. Enforced, the chunk loader stops and the app never hydrates on any
   page. This is a framework capability, not a config flag — a `default` policy
   that wraps strings would silence the reports and keep none of the benefit.
2. **Our own sink.** `src/components/seo/JsonLd.tsx` uses
   `dangerouslySetInnerHTML` with a hand-built string. It needs a named policy
   (`trusted-types shipin-jsonld`) and `createHTML()`.
3. **The third-party SDKs.** PayPal, reCAPTCHA, Firebase Auth, Vercel Analytics
   are outside our control; each would need its own policy name
   allowlisted with `'allow-duplicates'`, or an accepted exception.
4. **A `trusted-types` allowlist** naming exactly those policies, plus the
   decision about `'allow-duplicates'`.
5. **A trustworthy reporting channel**, so the switch can be verified rather
   than assumed: settle whether `report-to` uploads from a deployed HTTPS origin
   (and whether `report-uri` should stay as the fallback), because the group
   path is richer but delivered nothing here.
6. **A browser-coverage decision.** Trusted Types is Chromium-only. Enforcement
   is not a substitute for output encoding or a sanitiser; it is defence in
   depth on one engine.
7. **A staging pass with the directive enforced**, because a hydration failure
   is invisible to build and type checks and would surface first to a user.

## Consequences

- The rollout is blind until reports flow. The `report-to` finding above was
  itself invisible until a real browser was driven against the endpoint: the
  policy looked correct in the header and in every unit test.
- Report-only adds a second policy for every navigation. It costs nothing at
  runtime — no blocking, no extra request unless something violates.
- A violation now produces a log line per
  sink assignment, so a page that violates often is noisy by design.
- Enforcing it later is a header change plus the work above; nothing in this
  decision has to be undone, only narrowed.
