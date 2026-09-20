import { expect, test } from '@playwright/test';

/**
 * AC-017: WHEN the user opens Explore, THE SYSTEM SHALL show a folder tree and
 * the contents of the selected folder, listing dashboards and library charts
 * with their type, owner and last-updated time.
 *
 * Against the real API and the real database, seeded by the service in e2e
 * mode — the repository test covers the query, the component test covers the
 * markup, and this covers the two meeting.
 */
test('shows the folder tree and the selected folder’s contents', async ({ page }) => {
  await page.goto('/explore');

  const tree = page.getByRole('tree', { name: /folders/i });
  await expect(tree).toBeVisible();
  await expect(tree.getByRole('button', { name: 'Finance' })).toBeVisible();

  const contents = page.getByTestId('explore-contents');
  await expect(contents.getByRole('table')).toBeVisible();
  await expect(contents.getByRole('row').nth(1)).toBeVisible();
});

test('lists each item with its type, owner and last-updated time', async ({ page }) => {
  await page.goto('/explore');

  const firstItem = page.getByTestId('explore-contents').getByRole('row').nth(1);
  const cells = firstItem.getByRole('cell');

  await expect(cells.nth(0)).toContainText(/dashboard|chart|folder/i);
  await expect(cells.nth(1)).not.toBeEmpty();
  await expect(cells.nth(2)).not.toBeEmpty();
});

test('selecting a folder shows that folder’s contents', async ({ page }) => {
  await page.goto('/explore');
  const contents = page.getByTestId('explore-contents');
  await expect(contents.getByRole('table')).toBeVisible();

  // Scoped to the tree: "Finance" is also a row in the contents list, and an
  // unscoped query matches both.
  await page.getByRole('tree').getByRole('button', { name: 'Finance' }).click();

  await expect(contents.getByRole('row').nth(1)).toContainText(/Finance/);
});

/**
 * AC-003, the half T007 could not demonstrate: switching the theme must not
 * lose scroll position. This is the first surface long enough to scroll.
 */
test('switching theme keeps the scroll position (AC-003)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 600 });
  await page.goto('/explore');
  await expect(page.getByTestId('explore-contents').getByRole('table')).toBeVisible();

  await page.evaluate(() => window.scrollTo(0, 400));
  const before = await page.evaluate(() => window.scrollY);
  // The assertion is worthless unless the page really scrolled.
  expect(before).toBeGreaterThan(0);

  await page.getByRole('button', { name: /theme/i }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  expect(await page.evaluate(() => window.scrollY)).toBe(before);
});
