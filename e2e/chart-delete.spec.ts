import { expect, test, type APIRequestContext } from '@playwright/test';

/**
 * AC-023: WHEN the user deletes a library chart that dashboards use, THE SYSTEM
 * SHALL name those dashboards and require confirmation before deleting.
 * Fails when: the chart is deleted without naming the dashboards that use it.
 *
 * Both halves matter: the dashboards are *named* (not merely counted), and the
 * chart is still there until the user says so.
 */
const API = 'http://localhost:4100';

async function create(request: APIRequestContext, kind: 'dashboard' | 'chart', title: string) {
  const response = await request.post(`${API}/api/documents`, {
    data: { kind, title, folderId: 'root' },
  });
  expect(response.status()).toBe(201);
  return (await response.json()) as { id: string };
}

test('names the dashboards and does not delete until confirmed', async ({ page, request }) => {
  const unique = `del-${String(Date.now())}`;
  const chart = await create(request, 'chart', `Chart ${unique}`);
  const first = await create(request, 'dashboard', `First ${unique}`);
  const second = await create(request, 'dashboard', `Second ${unique}`);
  for (const dashboard of [first, second]) {
    await request.post(`${API}/api/dashboards/${dashboard.id}/charts`, {
      data: { chartId: chart.id },
    });
  }

  await page.goto(`/explore/charts/${chart.id}`);
  await page.getByRole('button', { name: 'Delete chart' }).click();

  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toBeVisible();
  // Named, not counted.
  await expect(dialog).toContainText(`First ${unique}`);
  await expect(dialog).toContainText(`Second ${unique}`);

  // Still there while the dialog is open.
  expect((await request.get(`${API}/api/folders/root/contents`)).ok()).toBe(true);
  await page.getByRole('button', { name: 'Keep the chart' }).click();
  await expect(page.getByTestId('selected-object')).toHaveText(chart.id);
});

test('deletes once the user confirms', async ({ page, request }) => {
  const unique = `del2-${String(Date.now())}`;
  const chart = await create(request, 'chart', `Chart ${unique}`);
  const dashboard = await create(request, 'dashboard', `Uses ${unique}`);
  await request.post(`${API}/api/dashboards/${dashboard.id}/charts`, {
    data: { chartId: chart.id },
  });

  await page.goto(`/explore/charts/${chart.id}`);
  await page.getByRole('button', { name: 'Delete chart' }).click();
  await page.getByRole('button', { name: 'Delete anyway' }).click();

  await expect(page).toHaveURL(/\/explore$/);
  const after = await request.get(`${API}/api/charts/${chart.id}/dashboards`);
  expect(after.ok()).toBe(true);
});

test('the service refuses an unconfirmed delete even without the dialog', async ({ request }) => {
  const unique = `del3-${String(Date.now())}`;
  const chart = await create(request, 'chart', `Chart ${unique}`);
  const dashboard = await create(request, 'dashboard', `Uses ${unique}`);
  await request.post(`${API}/api/dashboards/${dashboard.id}/charts`, {
    data: { chartId: chart.id },
  });

  // The request a script would send, with no dialog involved.
  const response = await request.delete(`${API}/api/documents/chart/${chart.id}`);

  expect(response.status()).toBe(409);
  const body = (await response.json()) as { dashboards: { title: string }[] };
  expect(body.dashboards.map((d) => d.title)).toContain(`Uses ${unique}`);
});

test('an unused chart deletes without a confirmation step', async ({ page, request }) => {
  const chart = await create(request, 'chart', `Unused ${String(Date.now())}`);

  await page.goto(`/explore/charts/${chart.id}`);
  await page.getByRole('button', { name: 'Delete chart' }).click();

  await expect(page).toHaveURL(/\/explore$/);
});
