import { expect, test } from '@playwright/test';

/**
 * AC-020: WHEN the user creates a folder, dashboard or chart from Explore, THE
 * SYSTEM SHALL place it in the selected folder and open it.
 * Fails when: the new object lands in a different folder, or is not opened.
 *
 * Both halves are asserted every time: where it landed, and that the app went
 * there. Creating something and leaving the user where they were makes them
 * hunt for it.
 */
async function createIn(
  page: import('@playwright/test').Page,
  kind: 'folder' | 'dashboard' | 'chart',
  title: string,
) {
  await page.getByRole('button', { name: `New ${kind}`, exact: true }).click();
  await page.getByLabel(/in this folder/i).fill(title);
  // Exact: objects created by these tests are named "Created …", which a
  // substring match on "Create" also finds.
  await page.getByRole('button', { name: 'Create', exact: true }).click();
}

test('creates a dashboard in the selected folder and opens it', async ({ page }) => {
  await page.goto('/explore');
  await page.getByRole('tree').getByRole('button', { name: 'Finance' }).click();
  await expect(page.getByTestId('explore-contents').getByRole('table')).toBeVisible();

  const title = `Created dashboard ${String(Date.now())}`;
  await createIn(page, 'dashboard', title);

  // Opened: the URL names the new object and the surface shows it. Asserted
  // through the dashboard's own title, which is what a reader sees — since
  // T023 the route renders a real dashboard rather than a placeholder.
  await expect(page).toHaveURL(/\/explore\/dashboards\//);
  await expect(page.getByRole('heading', { name: title })).toBeVisible();

  // Landed in Finance, not at the root.
  await page.goto('/explore');
  await page.getByRole('tree').getByRole('button', { name: 'Finance' }).click();
  await expect(page.getByTestId('explore-contents')).toContainText(title);
});

test('creates a chart in the selected folder and opens it', async ({ page }) => {
  await page.goto('/explore');
  const title = `Created chart ${String(Date.now())}`;

  await createIn(page, 'chart', title);

  await expect(page).toHaveURL(/\/explore\/charts\//);
});

test('creates a folder and selects it, showing it empty', async ({ page }) => {
  await page.goto('/explore');
  const title = `Created folder ${String(Date.now())}`;

  await createIn(page, 'folder', title);

  // A folder has no page of its own, so opening it means selecting it.
  await expect(page.getByRole('treeitem', { name: title, selected: true })).toBeVisible();
  await expect(page.getByTestId('explore-contents')).toContainText(/empty/i);
});

test('refuses to create without a name', async ({ page }) => {
  await page.goto('/explore');
  await page.getByRole('button', { name: 'New dashboard', exact: true }).click();

  await expect(page.getByRole('button', { name: 'Create', exact: true })).toBeDisabled();
});
