import { expect, test, type APIRequestContext } from '@playwright/test';

/**
 * AC-022: WHEN the user opens a library chart's page, THE SYSTEM SHALL list
 * every dashboard that uses it and offer to add it to another dashboard.
 * Fails when: a dashboard that contains the chart is missing from the list.
 *
 * "Every" is the word under test, so the fixture has three dashboards using the
 * chart and one that does not — a page that listed only the first would pass a
 * laxer assertion.
 */
const API = 'http://localhost:4100';

async function create(
  request: APIRequestContext,
  kind: 'folder' | 'dashboard' | 'chart',
  title: string,
  folderId = 'root',
) {
  const response = await request.post(`${API}/api/documents`, { data: { kind, title, folderId } });
  expect(response.status()).toBe(201);
  return (await response.json()) as { id: string };
}

test('lists every dashboard that uses the chart, and none that do not', async ({
  page,
  request,
}) => {
  const unique = `uses-${String(Date.now())}`;
  const chart = await create(request, 'chart', `Chart ${unique}`);

  const users = [];
  for (let n = 1; n <= 3; n += 1) {
    const dashboard = await create(request, 'dashboard', `Uses ${unique} ${String(n)}`);
    await request.post(`${API}/api/dashboards/${dashboard.id}/charts`, {
      data: { chartId: chart.id },
    });
    users.push(dashboard);
  }
  const bystander = await create(request, 'dashboard', `Ignores ${unique}`);

  await page.goto(`/explore/charts/${chart.id}`);

  const list = page.getByRole('list', { name: /dashboards using this chart/i });
  await expect(list).toBeVisible();
  for (const dashboard of users) {
    await expect(page.getByTestId(`using-${dashboard.id}`)).toBeVisible();
  }
  await expect(page.getByTestId(`using-${bystander.id}`)).toBeHidden();
});

test('says so when no dashboard uses the chart', async ({ page, request }) => {
  const chart = await create(request, 'chart', `Unused ${String(Date.now())}`);

  await page.goto(`/explore/charts/${chart.id}`);

  await expect(page.getByTestId('used-by-none')).toBeVisible();
});

test('offers to add the chart to another dashboard, and the list then includes it', async ({
  page,
  request,
}) => {
  const unique = `add-${String(Date.now())}`;
  const chart = await create(request, 'chart', `Chart ${unique}`);
  const dashboard = await create(request, 'dashboard', `Target ${unique}`);

  await page.goto(`/explore/charts/${chart.id}`);
  await expect(page.getByTestId('used-by-none')).toBeVisible();

  await page.getByLabel('Dashboard', { exact: true }).selectOption({ label: `Target ${unique}` });
  await page.getByRole('button', { name: 'Add to dashboard' }).click();

  await expect(page.getByTestId(`using-${dashboard.id}`)).toBeVisible();
});
