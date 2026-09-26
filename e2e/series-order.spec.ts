import { expect, test, type APIRequestContext, type Locator } from '@playwright/test';

const API = 'http://localhost:4100';

/**
 * T392, AC-300: WHEN the user orders a chart's series in Customize, THE
 * SYSTEM SHALL draw, stack and list the series in that order, and keep it
 * after a refresh (gap 7).
 * `Fails when: series stack alphabetically after another order was set, or
 * the order changes on refresh.`
 *
 * On a chart of its own: orders by category, split by status and stacked.
 * The legend is read along the drawn tile; that the stack follows the same
 * order is `packages/charts/src/seriesOrder.test.ts`'s, on the same renderer.
 */
async function splitChart(request: APIRequestContext): Promise<string> {
  const created = await request.post(`${API}/api/documents`, {
    data: { kind: 'chart', title: `Series order ${String(Date.now())}`, folderId: 'root' },
  });
  expect(created.status()).toBe(201);
  const { id } = (await created.json()) as { id: string };
  const stored = (await (await request.get(`${API}/api/documents/chart/${id}`)).json()) as {
    version: number;
    body: Record<string, unknown>;
  };
  const saved = await request.put(`${API}/api/documents/chart/${id}`, {
    data: {
      version: stored.version,
      body: {
        ...stored.body,
        chart: {
          source: { cube: 'orders' },
          wells: {
            measures: ['orders.count'],
            dimensions: ['products.category', 'orders.status'],
            timeDimensions: [],
          },
          chartType: 'stackedBar',
          filters: [],
        },
      },
    },
  });
  expect(saved.ok()).toBe(true);
  return id;
}

/** The statuses the seed's orders have: the series. */
async function statuses(request: APIRequestContext): Promise<string[]> {
  const loaded = await request.post(`${API}/api/load`, {
    data: { query: { measures: ['orders.count'], dimensions: ['orders.status'] } },
  });
  const { data } = (await loaded.json()) as { data: Record<string, string>[] };
  return data.map((row) => String(row['orders.status']));
}

/** The legend's names as read along it, in a drawn chart. */
const legendOf = (chart: Locator, names: readonly string[]) =>
  chart.evaluate(
    (node, among) =>
      [...node.querySelectorAll('svg text')]
        .filter((text) => among.includes(text.textContent ?? ''))
        .map((text) => ({ name: text.textContent ?? '', x: text.getBoundingClientRect().x }))
        .sort((a, b) => a.x - b.x)
        .map((entry) => entry.name),
    names,
  );

test('series drawn and listed in the order set in Customize, and kept after a refresh', async ({
  page,
  request,
}) => {
  const names = await statuses(request);
  expect(names.length).toBeGreaterThan(2);
  const id = await splitChart(request);
  await page.goto(`/explore/charts/${id}/edit`);
  const canvas = page.getByTestId('chart-canvas');
  await expect.poll(async () => (await legendOf(canvas, names)).length).toBe(names.length);
  const drawn = await legendOf(canvas, names);

  // The last series moved to the top of the order, a step at a time.
  const last = drawn.at(-1)!;
  const wanted = [last, ...drawn.slice(0, -1)];
  await page.getByRole('tab', { name: 'Customize' }).click();
  for (let step = 1; step < drawn.length; step += 1)
    await page.getByRole('button', { name: `Move ${last} up` }).click();
  await expect(
    page.getByRole('list', { name: 'Series order' }).getByRole('listitem').first(),
  ).toContainText(last);
  await expect.poll(() => legendOf(canvas, names)).toEqual(wanted);

  // Saved with the chart, drawn so on its page, and after a refresh.
  await page.getByTestId('editor-bar').getByRole('button', { name: 'Save chart' }).click();
  await expect(page).toHaveURL(new RegExp(`/explore/charts/${id}$`));
  const tile = page.locator('.chart-page__tile');
  await expect.poll(() => legendOf(tile, names)).toEqual(wanted);
  await page.reload();
  await expect.poll(() => legendOf(page.locator('.chart-page__tile'), names)).toEqual(wanted);

  const stored = (await (await request.get(`${API}/api/documents/chart/${id}`)).json()) as {
    body: { chart: { options?: Record<string, unknown> } };
  };
  expect(stored.body.chart.options?.['seriesOrder']).toEqual(wanted);
});
