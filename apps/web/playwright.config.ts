import { defineConfig, devices, type PlaywrightTestConfig } from '@playwright/test';

// When BASE_URL points at a remote environment (staging/production),
// we must NOT start a local web server — tests run against the live URL.
const isRemoteTarget = !!process.env.BASE_URL && !process.env.BASE_URL.startsWith('http://localhost');

const config: PlaywrightTestConfig = {
  testDir: './playwright-test/tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
};

// Only manage a local dev server when not targeting a remote environment.
// (The production build in CI is managed by the workflow, not Playwright.)
if (!isRemoteTarget && process.env.PLAYWRIGHT_MANAGE_WEBSERVER !== '0') {
  config.webServer = {
    // CI builds first and then serves that build; local runs default to dev.
    command: process.env.PLAYWRIGHT_WEBSERVER_COMMAND ?? 'npm run dev',
    url: process.env.BASE_URL ?? 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  };
}

export default defineConfig(config);
