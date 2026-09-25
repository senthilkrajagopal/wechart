import { readFile } from 'node:fs/promises';

import { expect, test, type APIRequestContext } from '@playwright/test';

const API = 'http://localhost:4100/api';

/** A dashboard of its own: a table of order count by status, with a status filter. */
async function ordersDashboard(request: APIRequestContext) {
  const unique = `${String(Date.now())}-${String(Math.round(Math.random() * 1e6))}`;
  const title = `Export ${unique}`;
  const dashboard = (await (
    await request.post(`${API}/documents`, { data: { kind: 'dashboard', title, folderId: 'root' } })
  ).json()) as { id: string };
  const chart = (await (
    await request.post(`${API}/documents`, {
      data: { kind: 'chart', title: 'Orders by status', folderId: 'root' },
    })
  ).json()) as { id: string };
  await request.put(`${API}/documents/chart/${chart.id}`, {
    data: {
      version: 1,
      body: {
        schemaVersion: 1,
        title: 'Orders by status',
        owner: 'admin',
        localToDashboardId: dashboard.id,
        chart: {
          source: { cube: 'orders' },
          // Three dimensions: more than the chart's channels place, so the
          // table shows a column no channel does (T177's review).
          // Two measures, one with a currency format (T179, AC-173).
          wells: {
            measures: ['orders.count', 'orders.total_amount'],
            dimensions: ['orders.status', 'customers.name', 'products.name'],
            timeDimensions: [],
          },
          chartType: 'table',
        },
      },
    },
  });
  await request.put(`${API}/documents/dashboard/${dashboard.id}`, {
    data: {
      version: 1,
      body: {
        schemaVersion: 1,
        title,
        folderId: 'root',
        owner: 'admin',
        settings: { width: 'fixed' },
        filters: [{ id: 'f-status', widget: 'checkbox', member: 'orders.status' }],
        pages: [
          {
            id: 'only',
            title: 'Only',
            items: [{ id: 'tile-orders', kind: 'chart', w: 6, h: 40, chartId: chart.id }],
          },
        ],
      },
    },
  });
  return dashboard.id;
}

/**
 * T177 / AC-171: WHEN the user exports a chart, THE SYSTEM SHALL produce a
 * CSV whose rows and columns match what the tile shows, including the applied
 * filters.
 * Fails when: the CSV contains rows the tile excluded, or omits a displayed
 * column.
 *
 * Against the real Cube: a table tile, filtered by the dashboard's status
 * filter from its address, downloaded from the tile's ⋯ menu.
 */
test('a tile’s CSV has the rows and columns the tile shows, its filter applied', async ({
  page,
  request,
}) => {
  const id = await ordersDashboard(request);
  const filters = [
    { id: 'f-status', member: 'orders.status', value: { kind: 'values', values: ['shipped'] } },
  ];
  await page.goto(
    `/explore/dashboards/${id}?filters=${encodeURIComponent(JSON.stringify(filters))}`,
  );

  const tile = page.locator('[data-tile="tile-orders"]');
  const table = tile.getByRole('table');
  await expect(table).toContainText('shipped', { timeout: 15_000 });
  await expect(table).not.toContainText('completed');
  const shown = {
    head: await table.getByRole('columnheader').allTextContents(),
    rows: await Promise.all(
      (await table.locator('tbody tr').all()).map((row) => row.getByRole('cell').allTextContents()),
    ),
  };

  await tile.getByRole('button', { name: 'Actions for Orders by status' }).click();
  // Export › CSV (T272, AC-244), where Download CSV was.
  await tile.getByRole('menuitem', { name: 'Export' }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    tile.getByRole('menuitem', { name: 'CSV', exact: true }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('Orders by status.csv');
  const file = await readFile(await download.path(), 'utf8');
  // The mark that tells a spreadsheet it is UTF-8, then the CSV.
  expect(file.startsWith('﻿')).toBe(true);
  const [head = [], ...rows] = records(file.slice(1));

  // Every column the table heads — the third dimension, on no chart channel,
  // among them (T177's review) — and every row, each as the table writes it.
  // Each measure's raw number beside it is T179's, below; set aside here.
  const raw = new Set(head.flatMap((name, index) => (name.endsWith(' (raw)') ? [index] : [])));
  const shownOf = (record: readonly string[]) => record.filter((_, index) => !raw.has(index));
  expect(shownOf(head)).toEqual(shown.head);
  // By its title, as the table heads it (AC-220).
  expect(head).toContain('Products Name');
  expect(rows.map(shownOf)).toEqual(shown.rows);
  // The filter's exclusions stay excluded.
  expect(file).not.toContain('completed');
});

/**
 * T179 / AC-173: THE SYSTEM SHALL format exported values with their member
 * formats, and SHALL write raw numeric values for measures so the file can be
 * re-analysed.
 * Fails when: a measure is exported only as a formatted string.
 *
 * Against the real Cube: each measure's column as the table writes it —
 * `total_amount` in its model's currency format — and its raw number beside
 * it, the number that formatted value writes.
 */
test('a tile’s CSV writes each measure formatted, and its raw number beside it', async ({
  page,
  request,
}) => {
  const id = await ordersDashboard(request);
  await page.goto(`/explore/dashboards/${id}`);
  const tile = page.locator('[data-tile="tile-orders"]');
  await expect(tile.getByRole('table')).toContainText('shipped', { timeout: 15_000 });

  await tile.getByRole('button', { name: 'Actions for Orders by status' }).click();
  await tile.getByRole('menuitem', { name: 'Export' }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    tile.getByRole('menuitem', { name: 'CSV', exact: true }).click(),
  ]);
  const [head = [], ...rows] = records((await readFile(await download.path(), 'utf8')).slice(1));

  // Each column by its title, as the table heads it (AC-220).
  for (const measure of ['Orders Count', 'Orders Total Amount']) {
    const at = head.indexOf(measure);
    expect(at).toBeGreaterThanOrEqual(0);
    expect(head[at + 1]).toBe(`${measure} (raw)`);
    for (const row of rows) {
      const [written = '', number = ''] = row.slice(at, at + 2);
      // A plain number, and the one the formatted value writes.
      expect(number).toMatch(/^-?\d+(\.\d+)?$/);
      expect(Number(written.replace(/[$,]/g, ''))).toBeCloseTo(Number(number), 2);
    }
  }
  // Formatted by the model's own format: `total_amount` is currency.
  expect(rows[0]?.[head.indexOf('Orders Total Amount')]).toMatch(/^-?\$[\d,]+(\.\d+)?$/);
  // No raw column for a dimension.
  expect(head).toContain('Orders Status');
  expect(head).not.toContain('Orders Status (raw)');
});

/**
 * T178 / AC-172: WHEN an export exceeds the row limit Cube returns, THE
 * SYSTEM SHALL say how many rows were exported and that the result was
 * truncated.
 * Fails when: a truncated export claims to be complete.
 *
 * The count is Cube's: the tile's query asked again with `total: true`
 * (research/cube/data-apis.md, "Observed locally"). The sample model's
 * results are all under Cube's 10,000-row limit, so the real Cube answers the
 * whole result; a count past what was returned is given at the network.
 */
test('a download says how many rows it holds, and whether Cube cut them short', async ({
  page,
  request,
}) => {
  const id = await ordersDashboard(request);
  const filters = [
    { id: 'f-status', member: 'orders.status', value: { kind: 'values', values: ['shipped'] } },
  ];
  const url = `/explore/dashboards/${id}?filters=${encodeURIComponent(JSON.stringify(filters))}`;
  const tile = page.locator('[data-tile="tile-orders"]');
  const download = async () => {
    // The filtered answer, not the unfiltered one drawn while it is asked.
    await expect(tile.getByRole('table')).toContainText('shipped', { timeout: 15_000 });
    await expect(tile.getByRole('table')).not.toContainText('completed');
    const rows = await tile.locator('tbody tr').count();
    await tile.getByRole('button', { name: 'Actions for Orders by status' }).click();
    await tile.getByRole('menuitem', { name: 'Export' }).click();
    await Promise.all([
      page.waitForEvent('download'),
      tile.getByRole('menuitem', { name: 'CSV', exact: true }).click(),
    ]);
    return rows;
  };

  // The real Cube counts: every row returned, nothing cut short.
  await page.goto(url);
  const rows = await download();
  const said = `Downloaded ${String(rows)} ${rows === 1 ? 'row' : 'rows'}.`;
  await expect(tile.getByRole('status')).toHaveText(
    `${said} Nothing was cut short: Cube returned all ${String(rows)} ${rows === 1 ? 'row' : 'rows'} of the query.`,
  );

  // Cube counting more than it returned: its real answer, its `total` past
  // its rows as a result over the row limit's would be — truncated, and said.
  await page.route('**/api/load', async (route) => {
    const body = JSON.parse(route.request().postData() ?? '{}') as { query?: { total?: unknown } };
    if (body.query?.total !== true) return route.continue();
    const answered = await route.fetch();
    const json = (await answered.json()) as { data: unknown[]; total: number };
    return route.fulfill({ response: answered, json: { ...json, total: 12_345 } });
  });
  await page.goto(url);
  await download();
  await expect(tile.getByRole('status')).toHaveText(
    `${said} Truncated: the query has 12,345 rows, and Cube returned the first ${String(rows)}.`,
  );
});

/** RFC 4180 records: CRLF between them, a quoted field's quotes doubled. */
function records(csv: string): string[][] {
  const out: string[][] = [[]];
  let field = '';
  let quoted = false;
  for (let at = 0; at < csv.length; at += 1) {
    const char = csv[at];
    if (quoted) {
      if (char === '"' && csv[at + 1] === '"') {
        field += '"';
        at += 1;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') {
      out.at(-1)?.push(field);
      field = '';
    } else if (char === '\r' && csv[at + 1] === '\n') {
      out.at(-1)?.push(field);
      field = '';
      out.push([]);
      at += 1;
    } else field += char;
  }
  out.at(-1)?.push(field);
  return out;
}
