/**
 * Pages that must keep `'unsafe-inline'` for scripts.
 *
 * The PayPal SDK injects its own inline bootstrap script at runtime, after CSP has
 * already been evaluated. Measured: with the strict policy in place the browser
 * refuses it on /wallet/topup with "Executing inline script violates the following
 * Content Security Policy directive". The content of that script depends on the SDK
 * version and the query string, so it cannot be hashed at build time the way the
 * theme bootstrap is, and a static page cannot carry a per-request nonce.
 *
 * So these pages keep the permissive `script-src`. That is a real weakening and it is
 * stated as one: on these routes an injected inline script would run. It is bounded
 * by `script-src-attr 'none'` (no event-handler attributes) and by the fact that
 * these pages render no user-controlled HTML - they are checkout and wallet shells.
 *
 * Anything that loads the PayPal SDK belongs here. `/wallet/topup` imports
 * `PayPalProvider` directly; the others reach it through `PayPalCheckout`
 * (`PaymentCard` for /payment/[id], `AdditionalItemPaymentsCard` for /requests/[id]).
 * `injectStaticCsp.test.ts` fails if a route that uses the SDK is missing, so this
 * list cannot quietly fall behind the code.
 */
export const PAYPAL_SCRIPT_ROUTES: readonly string[] = [
  "/wallet/topup",
  "/payment/[id]",
  "/requests/[id]",
  "/requests/[id]/invoice",
];
