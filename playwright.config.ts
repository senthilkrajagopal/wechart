import { defineConfig, devices } from '@playwright/test';

const PORT = 5273;
const baseURL = `http://localhost:${PORT}`;

/**
 * AC-180: the acceptance suite runs in current Chrome, Edge, Firefox and Safari
 * on desktop. Chrome and Edge are the installed browser channels, not bundled
 * Chromium, so the suite exercises what the user actually runs.
 *
 * Edge runs in CI only. Installing it on a developer machine needs a root
 * password (`playwright install msedge` shells out to sudo), so a local run
 * covers Chrome, Firefox and Safari and CI covers all four. AC-180 is
 * demonstrated by the CI run, not by a local one.
 */
const edgeProject = {
  name: 'edge',
  use: { ...devices['Desktop Edge'], channel: 'msedge' as const },
};

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chrome', use: { ...devices['Desktop Chrome'], channel: 'chrome' } },
    ...(process.env.CI ? [edgeProject] : []),
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'safari', use: { ...devices['Desktop Safari'] } },
  ],
  // The API is a separate process holding the Cube credentials and the
  // metadata database; the web server proxies /api to it, so the browser only
  // ever talks to one origin (AC-007).
  webServer: [
    {
      command: 'pnpm --filter @wechart/api dev',
      url: 'http://localhost:4100/api/health',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        CUBE_API_SECRET: 'e2e-secret',
        WECHART_SEED: '1',
      },
    },
    {
      command: `pnpm --filter @wechart/web dev --port ${PORT} --strictPort`,
      url: baseURL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
