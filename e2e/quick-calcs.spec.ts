import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

import { cubePicker } from './cubePicker';
import { wellPicker } from './wells';
import { IN_MY_WORKSPACE, newInMyWorkspace } from './workspace';

/**
 * Quick calculations (F6), in the chart editor as it is served.
 *
 * A test either opens the empty seed chart and never saves it, or saves a
 * chart of its own, so the browsers running at once share nothing they change.
 */
async function openEditorWithCount(page: Page) {
  await page.goto('/explore/charts/seed-chart-empty/edit');
  await cubePicker(page).selectOption({ label: 'Orders' });
  await expect(page.getByTestId('member-orders.count')).toBeVisible();
  await wellPicker(page, 'measures').selectOption('orders.count');
  await expect(page.getByTestId('in-measures-orders.count')).toBeVisible();
}

/**
 * AC-047: WHEN the user opens the menu on a measure in the chart editor, THE
 * SYSTEM SHALL offer % of total, difference from previous period, % difference
 * from previous period, running total, rank and moving average.
 * Fails when: any of the six is missing from the menu.
 */
test.describe('the menu on a measure (AC-047)', () => {
  test('offers the six quick calculations', async ({ page }) => {
    await openEditorWithCount(page);

    await page
      .getByTestId('in-measures-orders.count')
      .getByRole('button', { name: 'Calculations on Count' })
      .click();
    const menu = page.getByRole('menu', { name: 'Calculations on Count' });

    for (const name of [
      '% of total',
      'Difference from previous period',
      '% difference from previous period',
      'Running total',
      'Rank',
      'Moving average, 3 periods',
    ]) {
      await expect(menu.getByRole('menuitem', { name, exact: true })).toBeVisible();
    }
  });

  test('names the calculation chosen on the measure’s pill', async ({ page }) => {
    await openEditorWithCount(page);
    const pill = page.getByTestId('in-measures-orders.count');

    await pill.getByRole('button', { name: 'Calculations on Count' }).click();
    await page.getByRole('menuitem', { name: 'Rank', exact: true }).click();

    await expect(pill.getByRole('button', { name: 'Calculations on Count' })).toContainText('Rank');
  });

  test('keeps the calculation chosen when the chart is saved and opened again', async ({
    page,
  }) => {
    // A chart of this test's own: New › Chart in My workspace, to go to
    // Finance, as the single user makes one (T359, AC-254).
    await newInMyWorkspace(page, 'Chart', 'seed-folder-0');
    await expect(page).toHaveURL(/\/explore\/charts\/[^/]+\/edit\?new=true$/);
    const id = /\/explore\/charts\/([^/]+)\/edit\?new=true$/.exec(page.url())?.[1] ?? '';

    await cubePicker(page).selectOption({ label: 'Orders' });
    await wellPicker(page, 'measures').selectOption('orders.count');
    await page
      .getByTestId('in-measures-orders.count')
      .getByRole('button', { name: 'Calculations on Count' })
      .click();
    await page.getByRole('menuitem', { name: 'Rank', exact: true }).click();
    await page.getByRole('button', { name: 'Save chart' }).click();
    await expect(page).toHaveURL(new RegExp(`/explore/charts/${id}$`));

    await page.goto(`/explore/charts/${id}/edit`);
    await expect(
      page
        .getByTestId('in-measures-orders.count')
        .getByRole('button', { name: 'Calculations on Count' }),
    ).toContainText('Rank');
  });
});

/**
 * AC-049: WHEN a quick calculation needs a time dimension and the chart has
 * none, THE SYSTEM SHALL disable it and say which field is missing.
 * Fails when: the calculation is offered and produces an error, or gives no
 * reason when disabled.
 */
test.describe('a calculation over time on a chart with no time field (AC-049)', () => {
  test('is disabled, naming the field to add, until one is added', async ({ page }) => {
    await openEditorWithCount(page);
    const pill = page.getByTestId('in-measures-orders.count');
    const button = pill.getByRole('button', { name: 'Calculations on Count' });

    await button.click();
    const menu = page.getByRole('menu', { name: 'Calculations on Count' });
    for (const name of [
      'Difference from previous period',
      '% difference from previous period',
      'Running total',
      'Moving average, 3 periods',
      'Moving average, 6 periods',
      'Moving average, 12 periods',
    ]) {
      const item = menu.getByRole('menuitem', { name, exact: true });
      await expect(item).toHaveAttribute('aria-disabled', 'true');
      // Said where it can be read, naming Orders' time field, and as its description.
      await expect(item).toContainText('Needs a time field in Time: add Ordered at.');
      await expect(item).toHaveAccessibleDescription('Needs a time field in Time: add Ordered at.');
    }
    for (const name of ['% of total', 'Rank']) {
      await expect(menu.getByRole('menuitem', { name, exact: true })).not.toHaveAttribute(
        'aria-disabled',
      );
    }
    // Clicked anyway (past Playwright's own refusal to click a disabled
    // item), it isn't applied.
    await menu.getByRole('menuitem', { name: 'Running total', exact: true }).click({ force: true });
    await expect(button).toContainText('count');
    await expect(button).not.toContainText('Running total');

    // With the time field in Time, it is offered, and applies.
    await page.keyboard.press('Escape');
    await wellPicker(page, 'timeDimensions').selectOption('orders.ordered_at');
    await expect(page.getByTestId('in-timeDimensions-orders.ordered_at')).toBeVisible();
    await button.click();
    const running = menu.getByRole('menuitem', { name: 'Running total', exact: true });
    await expect(running).not.toHaveAttribute('aria-disabled');
    await running.click();
    await expect(button).toContainText('Running total');
  });

  test('says so in full, inside the menu, when the cube has no time field (T381’s review)', async ({
    page,
  }) => {
    await page.goto('/explore/charts/seed-chart-empty/edit');
    await cubePicker(page).selectOption({ label: 'Products' });
    await wellPicker(page, 'measures').selectOption('products.count');
    await page
      .getByTestId('in-measures-products.count')
      .getByRole('button', { name: 'Calculations on Count' })
      .click();
    const menu = page.getByRole('menu', { name: 'Calculations on Count' });
    const item = menu.getByRole('menuitem', { name: 'Running total', exact: true });
    const reason = 'Needs a time field in Time, and this cube or view has none.';

    await expect(item).toContainText(reason);
    // Read to its end: the menu doesn't cut it off or scroll sideways to show it.
    const fits = await menu.evaluate((element, text) => {
      const why = [...element.querySelectorAll('.quick-calc__why')].find(
        (each) => each.textContent === text,
      );
      if (why === undefined) return 'no reason drawn';
      const box = element.getBoundingClientRect();
      const line = why.getBoundingClientRect();
      if (element.scrollWidth > element.clientWidth) return 'the menu scrolls sideways';
      return line.right <= box.right && line.left >= box.left ? 'fits' : 'cut off';
    }, reason);
    expect(fits).toBe('fits');
  });
});

const API = 'http://localhost:4100/api';

/**
 * A table chart of the test's own, in My workspace: `measure` by month of
 * Ordered at, or by `dimension`, with `calculation` applied to the measure.
 */
async function calculatedChart(
  request: APIRequestContext,
  {
    measure,
    calculation,
    dimension,
    chartType = 'table',
    localTo,
  }: {
    measure: string;
    calculation: Record<string, unknown>;
    dimension?: string;
    chartType?: string;
    localTo?: string;
  },
): Promise<string> {
  const title = `Calculated ${String(Date.now())}-${String(Math.round(Math.random() * 1e6))}`;
  const created = await request.post(`${API}/documents`, {
    data: { kind: 'chart', title, ...IN_MY_WORKSPACE },
  });
  expect(created.status()).toBe(201);
  const { id } = (await created.json()) as { id: string };
  const stored = (await (await request.get(`${API}/documents/chart/${id}`)).json()) as {
    version: number;
    body: Record<string, unknown>;
  };
  const saved = await request.put(`${API}/documents/chart/${id}`, {
    data: {
      version: stored.version,
      body: {
        ...stored.body,
        ...(localTo === undefined ? {} : { localToDashboardId: localTo }),
        chart: {
          source: { cube: 'orders' },
          wells: {
            measures: [measure],
            dimensions: dimension === undefined ? [] : [dimension],
            timeDimensions: dimension === undefined ? ['orders.ordered_at'] : [],
          },
          ...(dimension === undefined ? { granularities: { 'orders.ordered_at': 'month' } } : {}),
          chartType,
          filters: [],
          calculations: { [measure]: calculation },
        },
      },
    },
  });
  expect(saved.ok()).toBe(true);
  return id;
}

/** The query a tile asks for its chart, and Cube's answer to it, as they cross the network. */
function askedOfCube(page: Page, column: string) {
  return page.waitForResponse(async (response) => {
    if (!response.url().endsWith('/api/load') || !response.ok()) return false;
    const answer = (await response.json()) as { data?: Record<string, unknown>[] };
    return answer.data?.some((row) => column in row) === true;
  });
}

/**
 * AC-048: WHEN a quick calculation is applied, THE SYSTEM SHALL compute it in
 * Cube as a multi-stage measure rather than in the browser, and the tile SHALL
 * label the measure with the calculation applied.
 * Fails when: the value is computed from the already-fetched rows, or the
 * label does not name the calculation.
 *
 * Each of the six on a chart drawn on its page. The query names the
 * calculation, Cube's answer carries it in the companion's own column (so it
 * was computed there, as xcube's multi-stage measure: research
 * `xcube-quick-calcs.md`), and the table heads the measure's column with the
 * calculation and shows Cube's values. The seed's monthly order counts, from
 * January 2026, are 30, 28, 31, 30, 31, 30, 31, 29, and each status has 80.
 */
test.describe('a quick calculation, computed in Cube and named on the chart (AC-048)', () => {
  const CASES = [
    {
      calculation: { kind: 'runningTotal' },
      kind: 'running_total',
      measure: 'orders.count',
      column: 'orders.count__xc_running_total',
      heading: 'Orders Count (running total)',
      rows: { 'Jan 2026': '30', 'Feb 2026': '58', 'Mar 2026': '89' },
    },
    {
      calculation: { kind: 'percentOfTotal' },
      kind: 'pct_of_total',
      measure: 'orders.total_amount',
      dimension: 'orders.status',
      column: 'orders.total_amount__xc_pct_of_total',
      heading: 'Orders Total Amount (% of total)',
      rows: { completed: '33.6%', processing: '33.33%', shipped: '33.07%' },
    },
    {
      calculation: { kind: 'differenceFromPrevious' },
      kind: 'difference',
      measure: 'orders.count',
      column: 'orders.count__xc_diff_month',
      heading: 'Orders Count (difference from previous month)',
      rows: { 'Feb 2026': '-2', 'Mar 2026': '3', 'Apr 2026': '-1' },
    },
    {
      calculation: { kind: 'percentDifferenceFromPrevious' },
      kind: 'pct_difference',
      measure: 'orders.count',
      column: 'orders.count__xc_pdiff_month',
      heading: 'Orders Count (% difference from previous month)',
      rows: { 'Feb 2026': '-6.67%', 'Mar 2026': '10.71%' },
    },
    {
      calculation: { kind: 'rank' },
      kind: 'rank',
      measure: 'orders.count',
      column: 'orders.count__xc_rank',
      heading: 'Orders Count (rank)',
      rows: { 'Jan 2026': '4', 'Feb 2026': '8', 'Mar 2026': '1' },
    },
    {
      calculation: { kind: 'movingAverage', periods: 3 },
      kind: 'moving_average',
      measure: 'orders.count',
      column: 'orders.count__xc_ma3_month',
      heading: 'Orders Count (3-month moving average)',
      rows: { 'Jan 2026': '30', 'Feb 2026': '29', 'Mar 2026': '29.67' },
    },
  ] as const;

  for (const each of CASES) {
    test(`${each.heading}: asked of Cube, answered there, and named`, async ({
      page,
      request,
    }) => {
      const id = await calculatedChart(request, {
        measure: each.measure,
        calculation: each.calculation,
        ...('dimension' in each ? { dimension: each.dimension } : {}),
      });
      const answered = askedOfCube(page, each.column);
      await page.goto(`/explore/charts/${id}`);

      // Asked of Cube by its measure, and answered in the companion's column.
      const response = await answered;
      const { query } = response.request().postDataJSON() as {
        query: { measures: string[]; calculations: unknown };
      };
      expect(query.measures).toEqual([each.measure]);
      expect(query.calculations).toEqual([
        { measure: each.measure, kind: each.kind, ...('periods' in each.calculation ? { periods: 3 } : {}) },
      ]);

      // The tile names the calculation, and shows Cube's values.
      const tile = page.locator('.chart-page__tile');
      await expect(tile.getByRole('columnheader', { name: each.heading })).toBeVisible();
      for (const [at, value] of Object.entries(each.rows)) {
        const row = tile.getByTestId('table-row').filter({ hasText: at });
        await expect(row.getByRole('cell').last()).toHaveText(value);
      }
    });
  }

  /**
   * The user's answer (2026-09-24): a running total counts from the start of
   * the chart's range. On a dashboard whose date filter holds March to June,
   * March is March's own 31, not the 89 counted from the data's start.
   */
  test('a running total on a dashboard counts from the start of its date range', async ({
    page,
    request,
  }) => {
    const unique = `${String(Date.now())}-${String(Math.round(Math.random() * 1e6))}`;
    const title = `Running ${unique}`;
    const dashboard = (await (
      await request.post(`${API}/documents`, {
        data: { kind: 'dashboard', title, ...IN_MY_WORKSPACE },
      })
    ).json()) as { id: string };
    const chart = await calculatedChart(request, {
      measure: 'orders.count',
      calculation: { kind: 'runningTotal' },
      chartType: 'bar',
      localTo: dashboard.id,
    });
    const placed = await request.put(`${API}/documents/dashboard/${dashboard.id}`, {
      data: {
        version: 1,
        body: {
          schemaVersion: 1,
          title,
          ...IN_MY_WORKSPACE,
          owner: 'admin',
          settings: { width: 'fixed' },
          pages: [
            {
              id: 'only',
              title: 'Only',
              items: [{ id: 'tile-running', kind: 'chart', w: 6, h: 40, chartId: chart }],
            },
          ],
          filters: [{ id: 'f-ordered', widget: 'dateRange', member: 'orders.ordered_at' }],
        },
      },
    });
    expect(placed.ok()).toBe(true);
    const range = [
      {
        id: 'f-ordered',
        member: 'orders.ordered_at',
        value: { kind: 'dates', from: '2026-03-01', to: '2026-06-30' },
      },
    ];

    // The tile's query with the dashboard's range on it.
    const answered = page.waitForResponse(async (response) => {
      if (!response.url().endsWith('/api/load') || !response.ok()) return false;
      const { query } = response.request().postDataJSON() as { query: Record<string, unknown> };
      const answer = (await response.json()) as { data?: Record<string, unknown>[] };
      return (
        JSON.stringify(query['timeDimensions']).includes('dateRange') &&
        answer.data?.some((row) => 'orders.count__xc_running_total' in row) === true
      );
    });
    await page.goto(
      `/explore/dashboards/${dashboard.id}?filters=${encodeURIComponent(JSON.stringify(range))}`,
    );
    await expect(page.getByRole('heading', { name: title })).toBeVisible();
    const { query } = (await answered).request().postDataJSON() as {
      query: { timeDimensions: unknown; calculations: unknown };
    };
    expect(query.calculations).toEqual([{ measure: 'orders.count', kind: 'running_total' }]);
    expect(query.timeDimensions).toEqual([
      { dimension: 'orders.ordered_at', granularity: 'month', dateRange: ['2026-03-01', '2026-06-30'] },
    ]);

    const tile = page.locator('[data-tile="tile-running"]');
    await expect(tile.getByTestId('chart-canvas')).toBeVisible();
    await tile.getByTestId('toggle-table-view').click();
    await expect(tile.getByRole('columnheader', { name: 'Orders Count (running total)' })).toBeVisible();
    for (const [at, value] of Object.entries({
      'Mar 2026': '31',
      'Apr 2026': '61',
      'May 2026': '92',
      'Jun 2026': '122',
    })) {
      const row = tile.getByTestId('table-row').filter({ hasText: at });
      await expect(row.getByRole('cell').last()).toHaveText(value);
    }
  });
});

/**
 * R46: a calculation wrong for the measure's type is disabled in the menu,
 * with the reason (research `xcube-quick-calcs.md`, "Which types take which
 * calculation").
 */
test('the menu on an average disables % of total, running total and moving average, saying why', async ({
  page,
}) => {
  await page.goto('/explore/charts/seed-chart-empty/edit');
  await cubePicker(page).selectOption({ label: 'Orders' });
  await wellPicker(page, 'measures').selectOption('orders.average_amount');
  await wellPicker(page, 'timeDimensions').selectOption('orders.ordered_at');
  const pill = page.getByTestId('in-measures-orders.average_amount');
  await pill.getByRole('button', { name: 'Calculations on Average Amount' }).click();
  const menu = page.getByRole('menu', { name: 'Calculations on Average Amount' });

  for (const [name, why] of [
    ['% of total', 'Not for an average: its values don’t add up to a total.'],
    ['Running total', 'Not for an average: adding up its periods gives no true total.'],
    ['Moving average, 3 periods', 'Not for an average: averaging its periods gives no true average.'],
  ] as const) {
    const item = menu.getByRole('menuitem', { name, exact: true });
    await expect(item).toHaveAttribute('aria-disabled', 'true');
    await expect(item).toHaveAccessibleDescription(why);
  }
  for (const name of ['Difference from previous period', '% difference from previous period', 'Rank'])
    await expect(menu.getByRole('menuitem', { name, exact: true })).not.toHaveAttribute(
      'aria-disabled',
    );
});

/**
 * R45.4: the chart's last time field taken out, a calculation over time stays
 * chosen but paused: the chart draws the plain measure, and a note names the
 * field it needs. With the field back, it runs again.
 */
test('a running total is paused while the chart has no time field, and runs again with one', async ({
  page,
}) => {
  await page.goto('/explore/charts/seed-chart-empty/edit');
  await cubePicker(page).selectOption({ label: 'Orders' });
  // Time first, so the plain count is first asked once Ordered at is taken out.
  await wellPicker(page, 'timeDimensions').selectOption('orders.ordered_at');
  await wellPicker(page, 'measures').selectOption('orders.count');
  const button = page
    .getByTestId('in-measures-orders.count')
    .getByRole('button', { name: 'Calculations on Count' });
  await button.click();
  const asked = page.waitForRequest(
    (request) =>
      request.url().endsWith('/api/load') &&
      (request.postDataJSON() as { query: Record<string, unknown> }).query['calculations'] !==
        undefined,
  );
  await page.getByRole('menuitem', { name: 'Running total', exact: true }).click();
  await asked;

  // Ordered at taken out: still chosen, paused, and the plain count asked.
  const plain = page.waitForRequest((request) => {
    if (!request.url().endsWith('/api/load')) return false;
    const { query } = request.postDataJSON() as { query: Record<string, unknown> };
    return query['timeDimensions'] === undefined && Array.isArray(query['measures']);
  });
  await page.getByRole('button', { name: 'Remove Ordered at from Time' }).click();
  const { query } = (await plain).postDataJSON() as { query: Record<string, unknown> };
  expect(query).not.toHaveProperty('calculations');
  await expect(button).toContainText('Running total');
  await expect(page.getByTestId('calc-paused-orders.count')).toHaveText(
    'Running total on Count is paused, so Count is drawn as it is. Needs a time field in Time: add Ordered at.',
  );

  // Back in Time, it runs again: the query that asks for it is the one asked
  // before, answered from the cache, so no note is left.
  await wellPicker(page, 'timeDimensions').selectOption('orders.ordered_at');
  await expect(page.getByTestId('calc-paused-orders.count')).toHaveCount(0);
  await expect(button).toContainText('Running total');
});
