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

  // Rendered by React, not present in index.html: the shell's top bar and its
  // workspace switcher (AC-001). A browser that served the page but ran no
  // script fails here.
  const switcher = page.getByRole('navigation', { name: /workspace/i });
  await expect(switcher).toBeVisible();
  // Every workspace the single user may use, and no Model entry (AC-001;
  // T331): with sign-in off they hold every permission (AC-254).
  await expect(switcher.getByRole('link')).toHaveText([
    'Explore',
    'Data sources',
    'Jobs',
    'Schedules',
    'SQL runner',
    'Security',
  ]);
  await expect(page).toHaveTitle('wechart');

  expect(pageErrors.map((e) => e.message)).toEqual([]);
});
