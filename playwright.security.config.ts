import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { defineConfig, devices } from '@playwright/test';

/** xcube's development public key, without which the API won't start (infra/xcube/README.md; T333). */
const DEV_XCUBE_PUBLIC_KEY = readFileSync(
  new URL('./infra/xcube/dev-credential-key.pub.jwk', import.meta.url),
  'utf8',
).trim();
/** wechart's development service key, its own calls' credential (infra/xcube/README.md; T420). */
const DEV_SERVICE_KEY_FILE = fileURLToPath(
  new URL('./infra/xcube/dev-service-key.pem', import.meta.url),
);

/**
 * The install Job's token for this suite's API, a development value (T443,
 * AC-310): `security/root-default.spec.ts` seeds the root's `default` with it.
 */
export const SEED_TOKEN = 'the-security-suite-seed-token-0123456789';

const PORT = 5373;
export const API_PORT = 4300;
const baseURL = `http://localhost:${PORT}`;

/**
 * The security-on end-to-end suite (T320; tasks.md, Phase 2 decisions): its
 * own API (port 4300, `WECHART_SECURITY=oidc`), its own web preview (port
 * 5373, which Dex's `wechart` client lists as a redirect address) and its own
 * database, signing people in through Dex from docker-compose. The phase-1
 * suite, `playwright.config.ts`, keeps running with security off, as it is,
 * until AC-308's end-of-phase check (the user's R13).
 *
 * Run it with `pnpm --filter @wechart/e2e e2e:security`, not while the phase-1
 * suite runs: both rebuild `packages/web/dist` and `packages/api/dist`, which
 * a running preview serves (the e2e lock keeps them apart). Every value here is a
 * development one: Dex's client secret is compose's default, and the test
 * users' passwords live in `infra/dex/test-users.json`.
 */
export default defineConfig({
  testDir: './e2e/security',
  // As generous as the phase-1 suite's, for the same reason (see there).
  timeout: 120_000,
  fullyParallel: true,
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
    // xcube's binding is shown through the API, in no browser, so once: its
    // copies in three browsers would publish and remove data sources in one
    // model at once, and trip each other (T435).
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
      testIgnore: /data-source-binding\.spec\.ts/,
    },
    {
      name: 'safari',
      use: { ...devices['Desktop Safari'] },
      testIgnore: /data-source-binding\.spec\.ts/,
    },
  ],
  webServer: [
    {
      // Dex and the suite's database first (e2e/security/prepare-stack.mjs).
      command: 'node e2e/security/prepare-stack.mjs && pnpm --filter @wechart/api dev',
      url: `http://localhost:${API_PORT}/api/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      env: {
        PORT: String(API_PORT),
        WECHART_DB_URL: 'postgres://wechart:wechart@localhost:55432/wechart_security',
        CUBE_API_SECRET: 'dev-secret',
        CUBE_API_URL: 'http://localhost:54000/cubejs-api',
        WECHART_XCUBE_PUBLIC_KEY: DEV_XCUBE_PUBLIC_KEY,
        WECHART_SEED_TOKEN: SEED_TOKEN,
        WECHART_SEED: '1',
        WECHART_RESET_DATA: '1',
        // xcube serves this suite's model under a model id of its own, apart
        // from the phase-1 suite's (T447, AC-333): a publish through one
        // never reaches the other. A dev value, as compose's.
        WECHART_XCUBE_MODEL: 'e2e-security',
        WECHART_SERVICE_KEY_FILE: DEV_SERVICE_KEY_FILE,
        CUBE_WORKER_URL: 'http://localhost:54001',
        WECHART_SECURITY: 'oidc',
        WECHART_PUBLIC_URL: baseURL,
        WECHART_SESSION_SECRET: 'the-security-suite-session-secret-0123456789',
        WECHART_OIDC_ISSUER: 'http://localhost:5556/dex',
        WECHART_OIDC_CLIENT_ID: 'wechart',
        WECHART_OIDC_CLIENT_SECRET: 'dev-oidc-secret',
        // Dex sends groups only when asked for its `groups` scope (research/dex.md).
        WECHART_OIDC_SCOPES: 'openid profile email groups',
        WECHART_OIDC_ALLOW_HTTP: 'true',
        // Dex's `super` test user is in it (infra/dex/config.yaml; T323).
        WECHART_SUPER_ADMIN_GROUP: 'wechart-super-admins',
      },
    },
    {
      command: `pnpm --filter @wechart/web build && pnpm --filter @wechart/web preview --port ${PORT} --strictPort`,
      url: baseURL,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      env: { WECHART_API_URL: `http://localhost:${API_PORT}` },
    },
  ],
});
