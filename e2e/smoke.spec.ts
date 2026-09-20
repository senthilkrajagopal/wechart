import { expect, test } from '@playwright/test';

/**
 * AC-180: THE SYSTEM SHALL work in current Chrome, Edge, Firefox and Safari on
 * desktop. This is the harness that criterion is measured with: every project in
 * playwright.config.ts runs it, so a browser that cannot run the app fails here
 * before any feature test does.
 *
 * The assertions deliberately depend on JavaScript having executed. The title
 * and #root are in the static index.html and would pass in a browser that ran
 * no script at all, so they prove nothing about the engine; only React's own
 * output does.
 */
test('the app shell renders in this browser', async ({ page }) => {
  const pageErrors: Error[] = [];
  page.on('pageerror', (error) => pageErrors.push(error));

  await page.goto('/');

  // Rendered by packages/web/src/App.tsx, not present in index.html.
  await expect(page.getByRole('main')).toHaveText('wechart');
  await expect(page).toHaveTitle('wechart');

  expect(pageErrors.map((e) => e.message)).toEqual([]);
});
