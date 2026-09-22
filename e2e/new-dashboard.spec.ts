import { expect, test } from '@playwright/test';

const API = 'http://localhost:4100/api';

/**
 * T064 / AC-058, found under T132: a dashboard as it is created — by
 * Explore's New dashboard, `newDashboardBody`, with no pages — took nothing
 * added to it. With no page, the insertion point was a page that did not
 * exist, and the tile went nowhere. It now opens with one empty page, which
 * is saved with it once anything is added.
 */
test('a new dashboard, as created, takes a tile added to it, and keeps it', async ({
  page,
  request,
}) => {
  const unique = `${String(Date.now())}-${String(Math.round(Math.random() * 1e6))}`;
  const created = await request.post(`${API}/documents`, {
    data: { kind: 'dashboard', title: `New ${unique}`, folderId: 'root' },
  });
  expect(created.ok()).toBe(true);
  const { id } = (await created.json()) as { id: string };

  await page.goto(`/explore/dashboards/${id}`);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page
    .getByRole('complementary', { name: 'Edit sidebar' })
    .getByRole('tab', { name: 'Add' })
    .click();
  await page.getByTestId('add-header').click();
  await expect(page.getByTestId('grid-item')).toHaveCount(1);

  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('grid-item')).toHaveCount(1);
});
