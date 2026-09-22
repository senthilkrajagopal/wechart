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
   * Generous on purpose, and raised twice now from Playwright's 30s.
   *
   * The failure it exists to absorb reports itself as `Test timeout … exceeded
   * while setting up "context"` on an arbitrary test, which reads like that
   * test failing and is nothing of the sort: the browser did not hand out a
   * context in time because the machine is also running the docker stack and
   * other services. A pass here takes about a second, so a ceiling this high
   * still catches a genuine hang — it just stops starvation being reported as
   * a product defect. Chasing one of these through the font tokens once was
   * enough.
   */
  timeout: 120_000,
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
        // Cube reads this API's model store (infra/cube/cube.js, T142): the
        // key the compose Cube holds, and this API as the Cube container
        // reaches it — one of the stores it is told to trust.
        WECHART_MODEL_KEY: 'dev-model-key',
        WECHART_CUBE_STORE_URL: 'http://host.docker.internal:4100',
        // The compose refresh worker's own health probes (T162, AC-156).
        CUBE_WORKER_URL: 'http://localhost:54001',
      },
    },
    {
      /**
       * The built app, not the dev server — matching what the API webServer
       * above already does.
       *
       * Once the app started drawing charts it began pulling ECharts through
       * Vite's dev transform on every page load, and the suite went from about
       * 40 seconds to two minutes, with WebKit timing out. Serving the real
       * bundle removes that per-load cost, and it is also the artefact users
       * get: a dev-server-only suite cannot catch anything the production
       * build changes.
       */
      command: `pnpm --filter @wechart/web build && pnpm --filter @wechart/web preview --port ${PORT} --strictPort`,
      url: baseURL,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
  ],
});
