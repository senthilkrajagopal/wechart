import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

const API = 'http://localhost:4100/api';

/**
 * T464 (AC-201, AC-013; UX-104, UX-021): a tile's head is its title's. Its
 * badges sit beside the title only where the head holds both whole, and go
 * to the tile's foot whenever the title would be cut — decided from the
 * title's whole width once the fonts have loaded, in view and edit mode
 * alike, so tiles of one width in one situation place them alike, load after
 * load (the user's answer to question 29, "the head is the title's").
 */

const KPIS = ['Orders', 'Customers', 'Total Revenue', 'Avg Order Value'] as const;

/** A dashboard whose first row is four 3-column KPI tiles, as the review's. */
async function kpiRow(request: APIRequestContext): Promise<string> {
  const stamp = `${String(Date.now())}-${String(Math.round(Math.random() * 1e6))}`;
  const created = async (kind: string, title: string) =>
    (
      (await (
        await request.post(`${API}/documents`, { data: { kind, title, folderId: 'root' } })
      ).json()) as { id: string }
    ).id;
  const id = await created('dashboard', `KPI row ${stamp}`);
  const charts: string[] = [];
  for (const title of KPIS) {
    const chartId = await created('chart', `${title} ${stamp}`);
    const stored = await request.put(`${API}/documents/chart/${chartId}`, {
      data: {
        version: 1,
        body: {
          schemaVersion: 1,
          title,
          owner: 'admin',
          localToDashboardId: id,
          chart: {
            source: { cube: 'orders' },
            wells: { measures: ['orders.count'], dimensions: [], timeDimensions: [] },
            chartType: 'kpi',
          },
        },
      },
    });
    expect(stored.status()).toBe(200);
    charts.push(chartId);
  }
  const dashboard = await request.put(`${API}/documents/dashboard/${id}`, {
    data: {
      version: 1,
      body: {
        schemaVersion: 1,
        title: `KPI row ${stamp}`,
        folderId: 'root',
        owner: 'admin',
        settings: { width: 'fixed' },
        pages: [
          {
            id: 'only',
            title: 'Only',
            items: charts.map((chartId, index) => ({
              id: `kpi-${String(index)}`,
              kind: 'chart',
              w: 3,
              h: 13,
              chartId,
            })),
          },
        ],
      },
    },
  });
  expect(dashboard.status()).toBe(200);
  return id;
}

interface Head {
  readonly title: string;
  /** The title's text is wider than the room it is drawn in. */
  readonly cut: boolean;
  /** A badge — the freshness badge or the marking's — sits in the head. */
  readonly badgeInHead: boolean;
  /** The freshness badge sits in the foot, under the chart. */
  readonly inFoot: boolean;
  readonly width: number;
  /** Everything in the head ends inside its room: nothing runs into its corner controls. */
  readonly fits: boolean;
  /**
   * The head could not have held the title whole beside the freshness badge
   * at its least width: the only reason for the badge to be in the foot.
   */
  readonly noRoom: boolean;
}

/** Each KPI tile's head, measured as drawn, once the fonts are ready. */
async function headsOf(page: Page): Promise<Head[]> {
  return page.evaluate(async (count) => {
    await document.fonts.ready;
    return Array.from({ length: count }, (_, index) => {
      const tile = document.querySelector<HTMLElement>(`[data-tile="kpi-${String(index)}"]`);
      const head = tile?.querySelector<HTMLElement>('.tile-head');
      const title = tile?.querySelector<HTMLElement>('.tile-head__title');
      if (tile === null || tile === undefined || head === null || head === undefined || !title)
        throw new Error(`Tile kpi-${String(index)} has no head and title`);
      const style = getComputedStyle(head);
      const padLeft = Number.parseFloat(style.paddingLeft) || 0;
      const padRight = Number.parseFloat(style.paddingRight) || 0;
      const gap = Number.parseFloat(style.columnGap) || 0;
      const box = head.getBoundingClientRect();
      const items = [...head.children];
      const range = document.createRange();
      range.selectNodeContents(title);
      const whole = range.getBoundingClientRect().width;
      // Beside the title, as they are drawn, less any badge: its least width is added.
      const others = items
        .filter(
          (item) => item !== title && !item.matches('.tile-freshness, .mark-badge, .tile-busy'),
        )
        .reduce((sum, item) => sum + item.getBoundingClientRect().width + gap, 0);
      const content = head.clientWidth - padLeft - padRight;
      return {
        title: title.textContent ?? '',
        cut: title.scrollWidth > title.clientWidth,
        badgeInHead:
          tile.querySelector('.tile-head > .tile-freshness, .tile-head > .mark-badge') !== null,
        inFoot: tile.querySelector('.tile-foot > .tile-freshness') !== null,
        width: Math.round(tile.getBoundingClientRect().width),
        fits: items.every(
          (item) => item.getBoundingClientRect().right <= box.right - padRight + 0.5,
        ),
        noRoom: whole + others + 64 + gap > content + 0.5,
      };
    });
  }, KPIS.length);
}

/** Every KPI tile has drawn its freshness badge, in its head or its foot. */
async function drawn(page: Page) {
  for (const index of KPIS.keys()) {
    await expect(
      page.locator(`[data-tile="kpi-${String(index)}"]`).getByTestId('tile-freshness'),
    ).toBeVisible({ timeout: 15_000 });
  }
}

function expectTheHeadIsTheTitles(heads: readonly Head[], when: string) {
  for (const head of heads) {
    // Never a cut title while a badge keeps the head.
    expect(head.cut && head.badgeInHead, `${when}: "${head.title}" ${JSON.stringify(head)}`).toBe(
      false,
    );
    // Its badge in one place: the head or the foot, not both, not neither.
    expect(head.badgeInHead !== head.inFoot, `${when}: "${head.title}"`).toBe(true);
    // In the head only while all of it fits there (T464's review: the badge
    // has to move, not just the title stay whole) ...
    if (head.badgeInHead)
      expect(head.fits, `${when}: "${head.title}" ${JSON.stringify(head)}`).toBe(true);
    // ... and in the foot only when the head had no room for it.
    if (head.inFoot)
      expect(head.noRoom, `${when}: "${head.title}" ${JSON.stringify(head)}`).toBe(true);
  }
}

test.use({ viewport: { width: 1440, height: 900 } });

test('on the KPI row, no title is cut while a badge sits in its head, load after load', async ({
  page,
  request,
}) => {
  const id = await kpiRow(request);
  const placements: string[] = [];
  for (let load = 0; load < 3; load += 1) {
    await page.goto(`/explore/dashboards/${id}`);
    await drawn(page);
    const heads = await headsOf(page);
    expectTheHeadIsTheTitles(heads, `load ${String(load)}`);
    // Tiles of one width, measured alike.
    expect(new Set(heads.map((head) => head.width)).size).toBe(1);
    placements.push(heads.map((head) => `${head.title}:${String(head.inFoot)}`).join(','));
  }
  // The same placement every time: decided by what the head holds, not by
  // when the tile happened to be measured.
  expect(new Set(placements).size).toBe(1);
});

test('in edit mode too, no title is cut while a badge sits in its head', async ({
  page,
  request,
}) => {
  const id = await kpiRow(request);
  await page.goto(`/explore/dashboards/${id}`);
  await drawn(page);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByRole('toolbar', { name: 'Dashboard editing' })).toBeVisible();
  await drawn(page);
  expectTheHeadIsTheTitles(await headsOf(page), 'edit mode');
});
