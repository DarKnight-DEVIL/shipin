import {
  defineConfig,
  devices,
  type PlaywrightTestConfig,
} from "@playwright/test";

// `PLAYWRIGHT_DEV=1` skips the production build for the inner loop. The
// production artefact stays the default because standalone output and
// prerendering differ from dev; CI must never set this flag.
const useDevServer = process.env.PLAYWRIGHT_DEV === "1";

// When BASE_URL points at a remote environment (staging/production),
// we must NOT start a local web server — tests run against the live URL.
const isRemoteTarget =
  !!process.env.BASE_URL &&
  !process.env.BASE_URL.startsWith("http://localhost");

const config: PlaywrightTestConfig = {
  testDir: "./playwright-test/tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
};

// Only manage a local dev server when not targeting a remote environment.
// (The production build in CI is managed by the workflow, not Playwright.)
if (!isRemoteTarget && process.env.PLAYWRIGHT_MANAGE_WEBSERVER !== "0") {
  config.webServer = {
    // Default to the production artefact: standalone output and prerendered
    // routes differ from dev, and a dev-only pass hides those differences.
    // Override with PLAYWRIGHT_WEBSERVER_COMMAND='npm run dev' for a quick loop.
    command:
      process.env.PLAYWRIGHT_WEBSERVER_COMMAND ??
      (useDevServer ? "npm run dev" : "npm run build && npm start"),
    url: process.env.BASE_URL ?? "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    // Dev compiles each route on first request, so it needs a longer window.
    timeout: useDevServer ? 180_000 : 60_000,
  };
}

export default defineConfig(config);
