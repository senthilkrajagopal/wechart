import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

/**
 * T389 / AC-116: WHEN a text tile contains a marking token, THE SYSTEM SHALL
 * render the marking's summary or count, and a measure token limited by a
 * marking SHALL show the measure over the marked rows, or over all data when
 * nothing is marked.
 * `Fails when: a token renders as literal text, or a limited measure ignores
 * the marking.`
 *
 * On the seeded model: 240 orders, 80 of them shipped. A dashboard in
 * Markings mode, with a bar per status that marks with "Picks", and a text
 * tile of tokens (direction.md, "Markdown tokens").
 */
const API = 'http://localhost:4100/api';

async function tokenDashboard(request: APIRequestContext) {
  const title = `Tokens ${String(Date.now())}-${String(Math.round(Math.random() * 1e6))}`;
  const dashboard = (await (
    await request.post(`${API}/documents`, {
      data: { kind: 'dashboard', title, folderId: 'root' },
    })
  ).json()) as { id: string };
  const chart = (await (
    await request.post(`${API}/documents`, {
      data: { kind: 'chart', title: 'By status', folderId: 'root' },
    })
  ).json()) as { id: string };
  await request.put(`${API}/documents/chart/${chart.id}`, {
    data: {
      version: 1,
      body: {
        schemaVersion: 1,
        title: 'By status',
        owner: 'admin',
        localToDashboardId: dashboard.id,
        chart: {
          source: { cube: 'orders' },
          wells: { measures: ['orders.count'], dimensions: ['orders.status'], timeDimensions: [] },
          chartType: 'bar',
        },
      },
    },
  });
  const placed = await request.put(`${API}/documents/dashboard/${dashboard.id}`, {
    data: {
      version: 1,
      body: {
        schemaVersion: 1,
        title,
        folderId: 'root',
        owner: 'admin',
        settings: { width: 'fixed', interactions: { mode: 'markings' } },
        markings: [{ id: 'm1', name: 'Picks', slot: 'mk1', isDefault: true }],
        pages: [
          {
            id: 'only',
            title: 'Only',
            items: [
              { id: 'tile-status', kind: 'chart', w: 6, h: 40, chartId: chart.id },
              {
                id: 'tile-text',
                kind: 'markdown',
                w: 6,
                h: 20,
                text: [
                  'Marked: {{marking:Picks.count}}',
                  'Which: {{marking:Picks.summary}}',
                  'Orders: {{measure:orders.count | marking:Picks}} of {{measure:orders.count}}',
                  'Kept as it is: `{{measure:orders.count}}` and {{not a token}}',
                ].join('\n\n'),
              },
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

test('a text tile’s tokens show the marking and the measure over what it marks', async ({
  page,
  request,
}) => {
  const { id, title } = await tokenDashboard(request);
  await page.goto(`/explore/dashboards/${id}`);
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  const text = page.locator('[data-tile="tile-text"] .markdown');
  const lines = text.locator('p');

  // Nothing marked: a count of none, and the measure over all data.
  await expect(lines.nth(0)).toHaveText('Marked: 0');
  await expect(lines.nth(1)).toHaveText('Which: nothing marked');
  await expect(lines.nth(2)).toHaveText('Orders: 240 of 240');
  // A code span, and braces that are no token, stay the text they are.
  await expect(lines.nth(3)).toHaveText(
    'Kept as it is: {{measure:orders.count}} and {{not a token}}',
  );

  await clickBar(page, 'shipped');

  // One status marked: the count, what it is, and the orders over it alone.
  await expect(lines.nth(0)).toHaveText('Marked: 1');
  await expect(lines.nth(1)).toHaveText('Which: Orders Status: shipped');
  await expect(lines.nth(2)).toHaveText('Orders: 80 of 240');
  // Braces left only where the text asked for them: in its code span.
  await expect(text.locator('code')).toHaveText('{{measure:orders.count}}');

  // Under the dashboard's filters, as its tiles are (T389's review): Filter
  // to marked clears the marking, and every tile — and every token — shows
  // the 80 shipped orders.
  const status = page.locator('[data-tile="tile-status"]');
  await status.getByRole('button', { name: /^Actions for / }).click();
  await status
    .getByRole('menu', { name: /^Actions for / })
    .getByRole('group', { name: /marked$/ })
    .getByRole('menuitem', { name: 'Filter to marked' })
    .click();
  await expect(page.getByTestId('mark-filter-chip')).toContainText('shipped');
  await expect(lines.nth(0)).toHaveText('Marked: 0');
  await expect(lines.nth(2)).toHaveText('Orders: 80 of 80');
});
