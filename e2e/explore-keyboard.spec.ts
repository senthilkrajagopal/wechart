import { expect, test } from '@playwright/test';

/**
 * AC-024: WHEN the user navigates the Explore contents with the keyboard, THE
 * SYSTEM SHALL move the selection with the arrow keys and open the selected
 * item with Enter.
 * Fails when: arrow keys do not move the selection, or Enter does not open the
 * selected item.
 *
 * The component test covers the mechanism in jsdom; this covers what the real
 * engines do with a roving tabindex on table rows, which is where browsers
 * differ most.
 */
const API = 'http://localhost:4100';

test('arrow keys move the selection and Enter opens it', async ({ page, request }) => {
  // Its own folder with known contents: other spec files create objects at the
  // root, so what the root list contains -- and in what order -- depends on
  // which of them ran first.
  const unique = `kbd-${String(Date.now())}`;
  const folder = await request.post(`${API}/api/documents`, {
    data: { kind: 'folder', title: `Keyboard ${unique}`, folderId: 'root' },
  });
  const { id: folderId } = (await folder.json()) as { id: string };
  for (const n of [1, 2]) {
    await request.post(`${API}/api/documents`, {
      data: { kind: 'dashboard', title: `Dashboard ${String(n)} ${unique}`, folderId },
    });
  }

  await page.goto('/explore');
  await page
    .getByRole('tree')
    .getByRole('button', { name: `Keyboard ${unique}` })
    .click();
  const contents = page.getByTestId('explore-contents');
  await expect(contents.getByRole('table')).toBeVisible();

  const rows = contents.locator('tbody tr');
  await expect(rows).toHaveCount(2);
  await rows.first().focus();
  await expect(rows.first()).toHaveAttribute('aria-selected', 'true');

  await page.keyboard.press('ArrowDown');
  await expect(rows.nth(1)).toHaveAttribute('aria-selected', 'true');
  await expect(rows.first()).toHaveAttribute('aria-selected', 'false');

  await page.keyboard.press('ArrowUp');
  await expect(rows.first()).toHaveAttribute('aria-selected', 'true');

  // Both rows in this folder are dashboards, so Enter must open a dashboard.
  await page.keyboard.press('ArrowDown');
  await expect(rows.nth(1)).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Enter');

  await expect(page).toHaveURL(/\/explore\/dashboards\//);
  await expect(page.getByTestId('selected-object')).not.toBeEmpty();
});

test('the list is a single tab stop, not one per row', async ({ page }) => {
  await page.goto('/explore');
  const contents = page.getByTestId('explore-contents');
  await expect(contents.getByRole('table')).toBeVisible();

  const rows = contents.locator('tbody tr');
  const count = await rows.count();
  expect(count).toBeGreaterThan(5);

  // Exactly one row is in the tab order at a time.
  await expect(contents.locator('tbody tr[tabindex="0"]')).toHaveCount(1);
});

test('Home and End jump to the ends of the list', async ({ page }) => {
  await page.goto('/explore');
  const contents = page.getByTestId('explore-contents');
  await expect(contents.getByRole('table')).toBeVisible();

  const rows = contents.locator('tbody tr');
  await rows.first().focus();

  await page.keyboard.press('End');
  await expect(rows.last()).toHaveAttribute('aria-selected', 'true');

  await page.keyboard.press('Home');
  await expect(rows.first()).toHaveAttribute('aria-selected', 'true');
});
