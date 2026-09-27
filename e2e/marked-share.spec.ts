import { expect, test, type APIRequestContext, type Page, type Request } from '@playwright/test';

/**
 * T388 / AC-104: WHEN a tile needs the marked share and the marking's members
 * are not among its own groupings, THE SYSTEM SHALL obtain it with one
 * additional query per tile and keep the unmarked result cached across
 * marking changes.
 * `Fails when: more than one extra query per tile is issued for a marking
 * change, or the base result is re-fetched when only the marking changed.`
 *
 * On the seeded model: a bar of orders by status, which marks, and a bar of
 * orders by product category, which marks with the same marking but doesn't
 * group by status — so each of its bars is partly marked, and its marked
 * share is a second answer from Cube (research/cube/markings-query-support.md,
 * Q3, option B).
 */
const API = 'http://localhost:4100/api';

async function shareDashboard(request: APIRequestContext) {
  const title = `Marked share ${String(Date.now())}-${String(Math.round(Math.random() * 1e6))}`;
  const dashboard = (await (
    await request.post(`${API}/documents`, {
      data: { kind: 'dashboard', title, folderId: 'root' },
    })
  ).json()) as { id: string };
  const chartOn = async (chartTitle: string, dimension: string) => {
    const chart = (await (
      await request.post(`${API}/documents`, {
        data: { kind: 'chart', title: chartTitle, folderId: 'root' },
      })
    ).json()) as { id: string };
    await request.put(`${API}/documents/chart/${chart.id}`, {
      data: {
        version: 1,
        body: {
          schemaVersion: 1,
          title: chartTitle,
          owner: 'admin',
          localToDashboardId: dashboard.id,
          chart: {
            source: { cube: 'orders' },
            wells: { measures: ['orders.count'], dimensions: [dimension], timeDimensions: [] },
            chartType: 'bar',
          },
        },
      },
    });
    return chart.id;
  };
  const status = await chartOn('By status', 'orders.status');
  const category = await chartOn('By category', 'products.category');
  const placed = await request.put(`${API}/documents/dashboard/${dashboard.id}`, {
    data: {
      version: 1,
      body: {
        schemaVersion: 1,
        title,
        folderId: 'root',
        owner: 'admin',
        settings: { width: 'fixed', interactions: { mode: 'markings' } },
        markings: [{ id: 'm1', name: 'Marking', slot: 'mk1', isDefault: true }],
        pages: [
          {
            id: 'only',
            title: 'Only',
            items: [
              { id: 'tile-status', kind: 'chart', w: 6, h: 40, chartId: status },
              { id: 'tile-category', kind: 'chart', w: 6, h: 40, chartId: category },
            ],
          },
        ],
      },
    },
  });
  expect(placed.ok(), await placed.text()).toBe(true);
  return { id: dashboard.id, title };
}

/** Clicks the bar over a status's axis label. */
async function clickBar(page: Page, status: string) {
  const label = page.locator('[data-tile="tile-status"] svg text', { hasText: status }).first();
  await expect(label).toBeVisible();
  let last = '';
  let box = { x: 0, y: 0, width: 0 };
  await expect
    .poll(async () => {
      box = await label.evaluate((text) => {
        const rect = text.getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width };
      });
      const now = JSON.stringify(box);
      const settled = box.width > 0 && now === last;
      last = now;
      return settled;
    })
    .toBe(true);
  await page.mouse.click(box.x + box.width / 2, box.y - 10);
}

type Query = { dimensions?: string[]; filters?: unknown[] };
const queryOf = (request: Request): Query | undefined => {
  if (!request.url().endsWith('/api/load') || request.method() !== 'POST') return undefined;
  return (request.postDataJSON() as { query?: Query } | null)?.query;
};

test('a marking change asks a tile that doesn’t group by the marked member once more, and never its own query again', async ({
  page,
  request,
}) => {
  const { id, title } = await shareDashboard(request);
  /**
   * Each tile's queries, once each: Cube's "Continue wait" asks a query
   * again under the same request id, which is one question, not two.
   */
  const asked: { tile: 'category' | 'status'; marked: string | undefined }[] = [];
  const seen = new Set<string>();
  page.on('request', (sent) => {
    const query = queryOf(sent);
    const tile = query?.dimensions?.includes('products.category')
      ? 'category'
      : query?.dimensions?.includes('orders.status')
        ? 'status'
        : undefined;
    if (tile === undefined) return;
    const requestId = sent.headers()['x-request-id'] ?? `${String(asked.length)}`;
    if (seen.has(requestId)) return;
    seen.add(requestId);
    const text = JSON.stringify(query?.filters ?? []);
    const marked = /orders\.status/.test(text)
      ? (/"values":\["([^"]+)"\]/.exec(text)?.[1] ?? '?')
      : undefined;
    asked.push({ tile, marked });
  });
  const categoryAsked = () => asked.filter((each) => each.tile === 'category');
  /** The share's answer for a status, in: the next click can't cancel it. */
  const shareAnswered = (status: string) =>
    page.waitForResponse((response) => {
      const query = queryOf(response.request());
      return (
        query?.dimensions?.includes('products.category') === true &&
        JSON.stringify(query.filters ?? []).includes(`"${status}"`)
      );
    });

  await page.goto(`/explore/dashboards/${id}`);
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  await expect(page.locator('[data-tile="tile-category"] svg').first()).toBeVisible();
  // Its own answer, asked once.
  await expect.poll(() => categoryAsked().length).toBe(1);
  expect(categoryAsked()).toEqual([{ tile: 'category', marked: undefined }]);

  // Marked: one more question, the marked share, and not its own again.
  let answered = shareAnswered('shipped');
  await clickBar(page, 'shipped');
  await answered;
  // Another marking: one more.
  answered = shareAnswered('completed');
  await clickBar(page, 'completed');
  await answered;
  await expect(page.getByTestId('mark-chip')).toContainText('completed');
  // The first marking again, as the marking now holds it: answered from the
  // cache, no question at all.
  await clickBar(page, 'shipped');
  await expect(page.getByTestId('mark-chip')).toContainText('shipped');
  await page.waitForTimeout(1_000);
  expect(categoryAsked()).toEqual([
    { tile: 'category', marked: undefined },
    { tile: 'category', marked: 'shipped' },
    { tile: 'category', marked: 'completed' },
  ]);
  // The tile that groups by status reads its marks from its own rows: asked
  // once, and no share.
  expect(asked.filter((each) => each.tile === 'status')).toEqual([
    { tile: 'status', marked: undefined },
  ]);
});
