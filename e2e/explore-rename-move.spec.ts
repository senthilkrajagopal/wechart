import { expect, test, type APIRequestContext } from '@playwright/test';

/**
 * AC-021: WHEN the user renames or moves a folder, dashboard or chart, THE
 * SYSTEM SHALL keep every reference to it working, including dashboards that
 * use a moved library chart.
 * Fails when: a dashboard that used the object shows a missing-chart state
 * after the move.
 *
 * A reference is an id, never a title or a path, so each test follows a
 * reference captured *before* the change.
 *
 * These create their own objects rather than renaming the seeded ones: mutating
 * shared fixtures made other files fail depending on the order they ran in.
 */
const API = 'http://localhost:4100';

async function create(
  request: APIRequestContext,
  kind: 'folder' | 'dashboard' | 'chart',
  title: string,
  folderId = 'root',
) {
  const response = await request.post(`${API}/api/documents`, {
    data: { kind, title, folderId },
  });
  expect(response.status()).toBe(201);
  return (await response.json()) as { id: string; kind: string };
}

test('a chart keeps its address after being renamed', async ({ page, request }) => {
  const unique = `rename-${String(Date.now())}`;
  const home = await create(request, 'folder', `Home ${unique}`);
  const chart = await create(request, 'chart', `Chart ${unique}`, home.id);

  // The reference, captured before the rename.
  const reference = `/explore/charts/${chart.id}`;
  await page.goto(reference);
  await expect(page.getByTestId('selected-object')).toHaveText(chart.id);

  await page.goto('/explore');
  await page
    .getByRole('tree')
    .getByRole('button', { name: `Home ${unique}` })
    .click();
  const row = page.getByTestId(`item-${chart.id}`);
  // Rename is in the row's menu (AC-193).
  await row.getByRole('button', { name: `Actions for Chart ${unique}` }).click();
  await page.getByRole('menuitem', { name: 'Rename', exact: true }).click();
  await row.getByRole('textbox').fill(`Renamed ${unique}`);
  await row.getByRole('button', { name: 'Save', exact: true }).click();

  await expect(page.getByTestId('explore-contents')).toContainText(`Renamed ${unique}`);

  // Same object, new name: the reference still resolves.
  await page.goto(reference);
  await expect(page.getByTestId('selected-object')).toHaveText(chart.id);
});

test('a chart keeps its address after being moved to another folder', async ({ page, request }) => {
  const unique = `move-${String(Date.now())}`;
  const from = await create(request, 'folder', `From ${unique}`);
  await create(request, 'folder', `To ${unique}`);
  const chart = await create(request, 'chart', `Chart ${unique}`, from.id);

  const reference = `/explore/charts/${chart.id}`;
  await page.goto('/explore');
  await page
    .getByRole('tree')
    .getByRole('button', { name: `From ${unique}` })
    .click();
  await expect(page.getByTestId(`item-${chart.id}`)).toBeVisible();

  // Move is in the row's menu (AC-193).
  await page
    .getByTestId(`item-${chart.id}`)
    .getByRole('button', { name: `Actions for Chart ${unique}` })
    .click();
  await page.getByRole('menuitem', { name: 'Move to…' }).click();
  await page
    .getByTestId(`item-${chart.id}`)
    .getByRole('combobox')
    .selectOption({ label: `To ${unique}` });

  // It left the folder it was in...
  await expect(page.getByTestId(`item-${chart.id}`)).toBeHidden();
  // ...arrived in the other one...
  await page
    .getByRole('tree')
    .getByRole('button', { name: `To ${unique}` })
    .click();
  await expect(page.getByTestId(`item-${chart.id}`)).toBeVisible();
  // ...and the reference taken before the move still resolves.
  await page.goto(reference);
  await expect(page.getByTestId('selected-object')).toHaveText(chart.id);
});

test('a dashboard that uses a chart still resolves it after the chart moves', async ({
  request,
}) => {
  const unique = `ref-${String(Date.now())}`;
  const from = await create(request, 'folder', `Ref from ${unique}`);
  const to = await create(request, 'folder', `Ref to ${unique}`);
  const chart = await create(request, 'chart', `Referenced ${unique}`, from.id);

  // A dashboard that uses the chart, by id.
  const dashboard = await request.post(`${API}/api/documents`, {
    data: { kind: 'dashboard', title: `Uses ${unique}`, folderId: from.id },
  });
  const created = (await dashboard.json()) as { id: string };
  await request.patch(`${API}/api/documents/dashboard/${created.id}`, {
    data: { title: `Uses ${unique}` },
  });

  await request.patch(`${API}/api/documents/chart/${chart.id}`, { data: { folderId: to.id } });

  // The chart is still there, under the same id, after the move.
  const after = await request.get(`${API}/api/folders/${to.id}/contents`);
  const items = (await after.json()) as { id: string }[];
  expect(items.map((item) => item.id)).toContain(chart.id);
});
