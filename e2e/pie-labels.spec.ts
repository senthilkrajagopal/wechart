import { expect, test, type APIRequestContext, type Locator } from '@playwright/test';

const API = 'http://localhost:4100/api';

/**
 * T395, AC-303: WHEN data labels are on for a pie or donut, THE SYSTEM SHALL
 * draw each label whole, moving or hiding the labels that don't fit (gap 3).
 * `Fails when: a slice's label shows a truncated value such as "$…".`
 *
 * On a dashboard of its own: a pie and a donut of orders' amounts by status,
 * their data labels on, in tiles three columns wide with the legend at the
 * top, and two columns wide — the narrowest a tile can be — with the legend
 * at the side (T395's review). The browser measures the text itself, where
 * the unit test estimates it.
 */
const TILES = [
  { id: 'tile-pie', chartType: 'pie', w: 3, legend: 'top' },
  { id: 'tile-donut', chartType: 'donut', w: 3, legend: 'top' },
  { id: 'tile-pie-side', chartType: 'pie', w: 2, legend: 'right' },
  { id: 'tile-donut-side', chartType: 'donut', w: 2, legend: 'left' },
] as const;

/** A side legend's room, as the chart leaves it (charts' `customize.ts`). */
const SIDE_PX = 120;

async function pieDashboard(request: APIRequestContext): Promise<string> {
  const title = `Pie labels ${String(Date.now())}`;
  const dashboard = (await (
    await request.post(`${API}/documents`, { data: { kind: 'dashboard', title, folderId: 'root' } })
  ).json()) as { id: string };
  const chart = async ({ chartType, legend }: (typeof TILES)[number]) => {
    const chartTitle = `Amount by status, ${chartType}, legend ${legend}`;
    const created = (await (
      await request.post(`${API}/documents`, {
        data: { kind: 'chart', title: chartTitle, folderId: 'root' },
      })
    ).json()) as { id: string };
    await request.put(`${API}/documents/chart/${created.id}`, {
      data: {
        version: 1,
        body: {
          schemaVersion: 1,
          title: chartTitle,
          owner: 'admin',
          localToDashboardId: dashboard.id,
          chart: {
            source: { cube: 'orders' },
            wells: {
              measures: ['orders.total_amount'],
              dimensions: ['orders.status'],
              timeDimensions: [],
            },
            chartType,
            options: { dataLabels: true, legend: { show: true, position: legend } },
          },
        },
      },
    });
    return created.id;
  };
  const items = [];
  for (const tile of TILES)
    items.push({ id: tile.id, kind: 'chart', w: tile.w, h: 40, chartId: await chart(tile) });
  await request.put(`${API}/documents/dashboard/${dashboard.id}`, {
    data: {
      version: 1,
      body: {
        schemaVersion: 1,
        title,
        folderId: 'root',
        owner: 'admin',
        settings: { width: 'fixed' },
        pages: [{ id: 'only', title: 'Only', items }],
      },
    },
  });
  return dashboard.id;
}

/** Each value label drawn in a tile's chart, and where it lies against the chart's box. */
async function valueLabelsOf(svg: Locator) {
  return svg.evaluate((node) => {
    const box = node.getBoundingClientRect();
    return {
      box: { left: box.left, right: box.right },
      labels: [...node.querySelectorAll('text')]
        .filter((text) => (text.textContent ?? '').startsWith('$'))
        .map((text) => {
          const rect = text.getBoundingClientRect();
          return { text: text.textContent ?? '', left: rect.left, right: rect.right };
        }),
    };
  });
}

test('a narrow pie’s and donut’s data labels are drawn whole, each inside its tile', async ({
  page,
  request,
}) => {
  await page.goto(`/explore/dashboards/${await pieDashboard(request)}`);
  for (const { id, legend } of TILES) {
    const svg = page.locator(`[data-tile="${id}"]`).locator('svg').first();
    // Drawn: its legend names the statuses.
    await expect(svg.locator('text', { hasText: /^shipped$/i }).first()).toBeVisible();
    // Where a tile's labels have room, its values in money, as the measure's format writes it.
    if (legend === 'top')
      await expect(svg.locator('text', { hasText: /^\$/ }).first()).toBeVisible();

    const { box, labels } = await valueLabelsOf(svg);
    // The pie's own box: the chart less a side legend's room.
    const [from, to] =
      legend === 'right'
        ? [box.left, box.right - SIDE_PX]
        : legend === 'left'
          ? [box.left + SIDE_PX, box.right]
          : [box.left, box.right];
    const said = `${id} (${String(Math.round(box.right - box.left))} px): ${labels.map((label) => label.text).join(' | ')}`;
    expect(
      labels.filter(
        (label) => /…|\.\.\./.test(label.text) || !/^\$[\d,]+(\.\d+)?$/.test(label.text),
      ),
      said,
    ).toEqual([]);
    expect(
      labels.filter((label) => label.left < from - 0.5 || label.right > to + 0.5),
      said,
    ).toEqual([]);
  }
});
