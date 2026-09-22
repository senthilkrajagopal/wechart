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
          wells: {
            measures: ['orders.count'],
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
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    tile.getByRole('button', { name: 'Download CSV' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('Orders by status.csv');
  const file = await readFile(await download.path(), 'utf8');
  // The mark that tells a spreadsheet it is UTF-8, then the CSV.
  expect(file.startsWith('﻿')).toBe(true);
  const [head, ...rows] = records(file.slice(1));

  // Every column the table heads — the third dimension, on no chart channel,
  // among them (T177's review) — and every row, each as the table writes it.
  expect(head).toEqual(shown.head);
  expect(head).toContain('products.name');
  expect(rows).toEqual(shown.rows);
  // The filter's exclusions stay excluded.
  expect(file).not.toContain('completed');
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
