/**
 * Production security posture, asserted against a deployed environment.
 *
 * The local E2E suite (`scripts/e2e-local.mjs`) deliberately disables the
 * security controls that need real infrastructure: the emulators cannot mint
 * App Check tokens, there is no shared rate-limit store, and the MFA denylist
 * store is absent. That is fine for the flows under test — but it means the
 * local suite can never notice a deployment whose controls are off when they
 * should be on.
 *
 * This spec closes that gap the cheap way: against a remote target it reads
 * the public `/api/health` probe and asserts the posture the deployment should
 * have — App Check not disabled, the shared rate-limit store configured, the
 * MFA denylist fail-closed and not degraded. Those fields exist precisely so a
 * monitor can read them; asserting on them turns "staging is up" into
 * "staging is up *with its controls on*".
 *
 * It runs in CI's `e2e` job whenever `E2E_STAGING_URL` is set — the same run
 * that exercises the signed-in smoke against staging — and skips everywhere
 * else. Read-only: one unauthenticated GET.
 */
import { test, expect } from "@playwright/test";

const baseUrl = process.env.BASE_URL ?? "";
const isRemoteTarget = !!baseUrl && !baseUrl.startsWith("http://localhost");

test.skip(
  !isRemoteTarget,
  "posture assertions need a deployed target; the local suite disables these controls by design"
);

interface HealthBody {
  status: string;
  redis: { configured: boolean };
  appCheck: { status: string };
  mfaDenylist: { mode: string; degraded: boolean };
}

async function health(request: import("@playwright/test").APIRequestContext) {
  const response = await request.get("/api/health");
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as HealthBody;
}

test.describe("production security posture", () => {
  test("App Check is not disabled", async ({ request }) => {
    const body = await health(request);

    // "disabled" means the deployment neither enforces nor is configured —
    // exactly the `APP_CHECK_ENFORCEMENT=false` drift this spec exists to
    // catch. "configured" (site key set, enforcement off) is still reported
    // and warned about by health; tighten this to `enforced` once staging
    // commits to enforcement.
    expect(["enforced", "configured"]).toContain(body.appCheck.status);
  });

  test("the shared rate-limit store is configured", async ({ request }) => {
    const body = await health(request);

    // A deployment without the store enforces per-instance limits and fails
    // open on limiter outages — the one configuration the startup validator
    // treats as fatal in production. Staging must not drift into it either.
    expect(body.redis.configured).toBe(true);
  });

  test("the MFA denylist is fail-closed and not degraded", async ({ request }) => {
    const body = await health(request);

    // mode "open" accepts elevation sessions without a revocation check; it is
    // an explicit operator choice that must never appear on a deployed target.
    expect(body.mfaDenylist.mode).toBe("closed");
    expect(body.mfaDenylist.degraded).toBe(false);
  });
});
