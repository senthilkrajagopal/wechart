import { defineConfig, devices } from '@playwright/test';

/**
 * The MCP suite (T790, AC-444): real Claude Code against wechart's `/mcp`.
 * Its `claude -p` calls a model on the signed-in user's own Claude account,
 * so it is never part of the default run (`playwright.config.ts` leaves
 * `e2e/mcp/` out) and runs only when asked: `pnpm --filter @wechart/e2e
 * e2e:mcp`, which builds the API first. Each spec starts the API it needs
 * itself (`e2e/mcp/fixtures.ts`), on the docker-compose stack, so there is no
 * web server here. No page is opened: one project, on Playwright's bundled
 * Chromium.
 */
export default defineConfig({
  testDir: './e2e/mcp',
  timeout: 300_000,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? 'github' : 'list',
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
