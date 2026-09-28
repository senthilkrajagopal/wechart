import { expect, test, type APIRequestContext } from '@playwright/test';

const API = 'http://localhost:4100';

/**
 * T393, AC-301: THE SYSTEM SHALL order a table's columns as the wells order
 * its fields: time and dimensions first, then measures in the Metrics well's
 * order (gap 9).
 * `Fails when: a table's columns differ from the wells' order.`
 *
 * Two tables of the same fields, their measures in the Metrics well either
 * way round, each read on its own page as drawn. With a time dimension: Cube
 * answers its rows as `orders.status, orders.ordered_at.month, <measures>,
 * orders.ordered_at` (observed 2026-09-26), a time column after the measures.
 */
async function table(request: APIRequestContext, measures: readonly string[]): Promise<string> {
  const created = await request.post(`${API}/api/documents`, {
    data: { kind: 'chart', title: `Columns ${String(Date.now())}`, folderId: 'root' },
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
          wells: { measures, dimensions: ['orders.status'], timeDimensions: ['orders.ordered_at'] },
          granularities: { 'orders.ordered_at': 'month' },
          chartType: 'table',
          filters: [],
        },
      },
    },
  });
  expect(saved.ok()).toBe(true);
  return id;
}

test('a table’s columns follow the wells: time, its dimension, then its measures as the Metrics well orders them', async ({
  page,
  request,
}) => {
  for (const measures of [
    ['orders.total_amount', 'orders.count'],
    ['orders.count', 'orders.total_amount'],
  ]) {
    await page.goto(`/explore/charts/${await table(request, measures)}`);
    const headers = page.locator('.chart-page__tile').getByRole('columnheader');
    await expect(headers).not.toHaveCount(0);
    const heads = await headers.allTextContents();
    const said = heads.join(' | ');
    const kinds = heads.map((head) =>
      /ordered at/i.test(head)
        ? 'time'
        : /status/i.test(head)
          ? 'status'
          : /total amount/i.test(head)
            ? 'orders.total_amount'
            : /count/i.test(head)
              ? 'orders.count'
              : head,
    );
    // The time dimension's columns, then the dimension, then the measures in order.
    const times = kinds.filter((kind) => kind === 'time').length;
    expect(times, said).toBeGreaterThan(0);
    expect(kinds, said).toEqual([...Array<string>(times).fill('time'), 'status', ...measures]);
  }
});

/**
 * T467, UX-023 (the phase-1 re-check): Cube answers a time member asked at a
 * grain under two keys, the bucket and the bare member, and the table showed
 * both ("Order date (month)" and "Order date", each "Jul 1996"). One column,
 * the bucket's, on the chart's own table and in the editor's drawer.
 */
test('a table and the drawer show a time member asked at a grain once, as its bucket', async ({
  page,
  request,
}) => {
  const id = await table(request, ['orders.count']);
  await page.goto(`/explore/charts/${id}`);
  const headers = page.locator('.chart-page__tile').getByRole('columnheader');
  await expect(headers).not.toHaveCount(0);
  expect(await headers.allTextContents()).toEqual([
    'Orders Ordered at (month)',
    'Orders Status',
    'Orders Count',
  ]);

  await page.goto(`/explore/charts/${id}/edit`);
  await page.getByRole('tab', { name: 'Results', exact: true }).click();
  const drawer = page.getByTestId('drawer-result-rows');
  await expect(drawer.getByRole('columnheader')).not.toHaveCount(0);
  const drawn = await drawer.getByRole('columnheader').allTextContents();
  expect(drawn.filter((head) => /ordered at/i.test(head))).toEqual(['Orders Ordered at (month)']);
});
