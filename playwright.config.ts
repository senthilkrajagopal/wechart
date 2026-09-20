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
  /**
   * 60s rather than Playwright's 30s. On a cold run the machine is building the
   * API, starting Cube and launching several real browsers at once, and
   * browser *context setup* alone can exceed 30s — which fails as a timeout on
   * whichever test happened to be first, with nothing wrong in the app. A
   * passing test here takes about a second, so this still catches a genuine
   * hang.
   */
  timeout: 60_000,
  fullyParallel: true,
  /**
   * Capped locally, left to Playwright on CI.
   *
   * The failure this prevents reports itself as `Test timeout of 60000ms
   * exceeded while setting up "context"` on an arbitrary test — which reads
   * like that test failing and is not: nothing in the app is involved, the
   * browser simply did not hand out a context in time. Playwright's default is
   * half the cores (6 here), and each worker launches a real browser at once,
   * on a development machine that is also running the docker stack and other
   * services. Fewer workers cut the launch spike; CI runs on a dedicated
   * machine and keeps the default.
   */
  ...(process.env.CI ? {} : { workers: 4 }),
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
        // Must match CUBEJS_API_SECRET for the compose stack, since wechart
        // signs every Cube request with it (AC-008).
        CUBE_API_SECRET: 'dev-secret',
        CUBE_API_URL: 'http://localhost:54000/cubejs-api',
        WECHART_SEED: '1',
        // These tests create objects, so each run starts from the seed rather
        // than from whatever the last run left behind.
        WECHART_RESET_DATA: '1',
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
