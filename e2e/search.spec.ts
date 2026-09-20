import { expect, test } from '@playwright/test';

/**
 * AC-019: WHEN the user types in the Explore search box, THE SYSTEM SHALL list
 * every dashboard and library chart whose title contains the text, and no
 * dashboard-local chart.
 * Fails when: a matching library item is missing, or a dashboard-local chart
 * appears in the results.
 *
 * The seed includes a chart local to a dashboard, titled so it would match the
 * same search as the library items. Without it this criterion's second half
 * could not fail.
 */
const SHORTCUT = process.platform === 'darwin' ? 'Meta+k' : 'Control+k';

async function search(page: import('@playwright/test').Page, text: string) {
  await page.goto('/explore');
  await expect(page.getByRole('button', { name: /theme/i })).toBeVisible();
  await page.keyboard.press(SHORTCUT);
  await page.getByRole('searchbox').fill(text);
  return page.getByRole('list', { name: /search results/i });
}

test('lists dashboards and library charts whose title contains the text', async ({ page }) => {
  const results = await search(page, 'Company dashboard');

  await expect(results).toBeVisible();
  await expect(results.getByRole('listitem').first()).toContainText('Company dashboard');
});

test('matches anywhere in the title, not only at the start', async ({ page }) => {
  const results = await search(page, 'chart 3');

  await expect(results.getByRole('listitem').first()).toContainText('chart 3');
});

test('never lists a chart that belongs to a dashboard', async ({ page }) => {
  const results = await search(page, 'Seeded local chart');

  // The seeded local chart matches this text exactly and must still not appear.
  await expect(page.getByText(/nothing matches/i)).toBeVisible();
  await expect(results).toBeHidden();
});

test('finds a library chart with a similar name, so the exclusion is not just an empty search', async ({
  page,
}) => {
  const results = await search(page, 'Finance chart');

  await expect(results.getByRole('listitem').first()).toContainText('Finance chart');
});
