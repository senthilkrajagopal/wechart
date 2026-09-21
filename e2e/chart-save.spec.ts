import { expect, test, type APIRequestContext, type Page, type Route } from '@playwright/test';

/**
 * T192 / AC-183: WHEN a chart edited from a dashboard tile is applied, THE
 * SYSTEM SHALL hold the edit in the dashboard's edit session and write the
 * chart document only when the dashboard is saved.
 * Fails when: the chart document changes before the dashboard is saved, or
 * the tile does not show the edit before saving.
 *
 * Every test makes its own dashboard and its own chart. Saving changes them,
 * and the three browsers run against one server at once: sharing a seeded
 * chart would have them overwrite each other, and change the chart other
 * specs expect.
 */
const API = 'http://localhost:4100/api';

const definition = {
  source: { cube: 'orders' },
  wells: { measures: ['orders.count'], dimensions: ['orders.status'], timeDimensions: [] },
  chartType: 'bar',
};

/**
 * A dashboard of its own holding one chart: local to it, or with `library`,
 * a library chart in a folder — one that other dashboards can use.
 */
async function makeDashboard(request: APIRequestContext, library = false) {
  const unique = `${String(Date.now())}-${String(Math.round(Math.random() * 1e6))}`;

  const dashboard = (await (
    await request.post(`${API}/documents`, {
      data: { kind: 'dashboard', title: `Chart save ${unique}`, folderId: 'root' },
    })
  ).json()) as { id: string };
  const chart = (await (
    await request.post(`${API}/documents`, {
      data: { kind: 'chart', title: `Chart ${unique}`, folderId: 'root' },
    })
  ).json()) as { id: string };

  await request.put(`${API}/documents/chart/${chart.id}`, {
    data: {
      version: 1,
      body: {
        schemaVersion: 1,
        title: `Chart ${unique}`,
        owner: 'admin',
        ...(library ? { folderId: 'root' } : { localToDashboardId: dashboard.id }),
        chart: definition,
      },
    },
  });
  await request.put(`${API}/documents/dashboard/${dashboard.id}`, {
    data: {
      version: 1,
      body: {
        schemaVersion: 1,
        title: `Chart save ${unique}`,
        folderId: 'root',
        owner: 'admin',
        settings: { width: 'fixed' },
        pages: [
          {
            id: 'only',
            title: 'Only',
            items: [{ id: 'tile-save', kind: 'chart', w: 6, h: 40, chartId: chart.id }],
          },
        ],
      },
    },
  });

  return { dashboardId: dashboard.id, chartId: chart.id, title: `Chart save ${unique}` };
}

/** The chart as stored: its whole body and its version. */
async function stored(request: APIRequestContext, chartId: string) {
  const document = (await (await request.get(`${API}/documents/chart/${chartId}`)).json()) as {
    body: Record<string, unknown>;
    version: number;
  };
  return { body: document.body, version: document.version };
}

async function storedType(request: APIRequestContext, chartId: string) {
  const { body } = await stored(request, chartId);
  return (body['chart'] as { chartType?: string }).chartType;
}

const tile = (page: Page) => page.locator('[data-tile="tile-save"]');
const canvas = (page: Page) => tile(page).getByTestId('chart-canvas');
const bar = (page: Page) => page.getByRole('toolbar', { name: 'Dashboard editing' });
const barButton = (page: Page, name: string) =>
  bar(page).getByRole('button', { name, exact: true });
const editor = (page: Page) => page.getByTestId('chart-editor-overlay');
const saveDashboard = (page: Page) =>
  editor(page).getByRole('button', { name: 'Save dashboard', exact: true });

async function editToStacked(page: Page) {
  await expect(canvas(page)).toHaveAttribute('data-chart-type', 'bar');
  await page.getByTestId('edit-chart-tile-save').click();
  await expect(editor(page)).toBeVisible();
  await page.getByLabel('Chart type').selectOption('stackedBar');
  await page.getByTestId('editor-back').click();
  await expect(canvas(page)).toHaveAttribute('data-chart-type', 'stackedBar');
}

/**
 * A change to the dashboard itself, in the same session: a heading added. A
 * save that wrote only the chart and left edit mode would lose it — which
 * asserting on the chart alone could not see.
 */
async function addHeading(page: Page) {
  // From view mode, once the dashboard has drawn.
  await expect(canvas(page)).toHaveAttribute('data-chart-type', 'bar');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page
    .getByRole('complementary', { name: 'Edit sidebar' })
    .getByRole('tab', { name: 'Add' })
    .click();
  await page.getByTestId('add-header').click();
  await expect(page.getByRole('heading', { name: 'New heading' })).toBeVisible();
}

/**
 * Every chart type the tile shows from here on. Asserting the type after
 * saving would not do: the assertion retries until it holds, so the old chart
 * showing for a moment — while the charts are fetched again — would pass it.
 */
async function recordTypes(page: Page) {
  await page.evaluate(() => {
    const seen: string[] = [];
    const tileElement = document.querySelector('[data-tile="tile-save"]');
    if (tileElement === null) throw new Error('no tile');
    Object.assign(window, { seenTypes: seen, watchedTile: tileElement });
    new MutationObserver(() => {
      for (const drawn of tileElement.querySelectorAll('[data-chart-type]')) {
        seen.push(drawn.getAttribute('data-chart-type') ?? '');
      }
    }).observe(tileElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['data-chart-type'],
    });
  });
}

/**
 * The types recorded — and whether the element watched is still the tile on
 * screen. Had the tile been replaced, the observer would have watched a
 * detached element and recorded nothing, and "nothing but the edit" would
 * hold for the wrong reason.
 */
async function typesSeen(page: Page) {
  const { seen, stillWatching } = await page.evaluate(() => {
    const { seenTypes, watchedTile } = window as unknown as {
      seenTypes: string[];
      watchedTile: Element;
    };
    return {
      seen: seenTypes,
      stillWatching:
        watchedTile.isConnected &&
        document.querySelector('[data-tile="tile-save"]') === watchedTile,
    };
  });
  expect(stillWatching).toBe(true);
  return seen;
}

test('the edit is held, not written, until the dashboard is saved', async ({ page, request }) => {
  const { dashboardId, chartId } = await makeDashboard(request);
  const before = await stored(request, chartId);
  await page.goto(`/explore/dashboards/${dashboardId}`);

  await editToStacked(page);

  // The criterion's first failing state: "the chart document changes before
  // the dashboard is saved". The tile shows the edit; the server has none of
  // it — not the type, not any other field, not a new version.
  expect(await stored(request, chartId)).toEqual(before);

  // Nor later in the session, before a save: undone, redone, and the editor
  // opened on the draft and left again.
  await barButton(page, 'Undo').click();
  await expect(canvas(page)).toHaveAttribute('data-chart-type', 'bar');
  await barButton(page, 'Redo').click();
  await expect(canvas(page)).toHaveAttribute('data-chart-type', 'stackedBar');
  await page.getByTestId('edit-chart-tile-save').click();
  await expect(page.getByTestId('chart-type')).toHaveText('stackedBar');
  await page.getByTestId('editor-back').click();
  await expect(editor(page)).toBeHidden();

  expect(await stored(request, chartId)).toEqual(before);
});

test('saving writes the chart with the dashboard’s own changes, and both are there after a reload', async ({
  page,
  request,
}) => {
  const { dashboardId, chartId } = await makeDashboard(request);
  await page.goto(`/explore/dashboards/${dashboardId}`);
  await addHeading(page);
  await editToStacked(page);
  await recordTypes(page);

  // A chart local to this dashboard does not hold Save back.
  const save = barButton(page, 'Save');
  await expect(save).toHaveAttribute('aria-disabled', 'false');
  const refetched = page.waitForResponse(
    (response) =>
      response.request().method() === 'GET' &&
      response.url().endsWith(`/api/documents/chart/${chartId}`),
  );
  await save.click();

  await expect(bar(page)).toBeHidden();
  await expect.poll(() => storedType(request, chartId)).toBe('stackedBar');
  // The charts are fetched again after the save. The old chart would show in
  // the moment between leaving edit mode and that fetch, so once the fetch
  // has begun to come back, the tile has shown nothing but the edit.
  await refetched;
  await expect(canvas(page)).toHaveAttribute('data-chart-type', 'stackedBar');
  expect((await typesSeen(page)).filter((type) => type !== 'stackedBar')).toEqual([]);

  await page.reload();
  await expect(canvas(page)).toHaveAttribute('data-chart-type', 'stackedBar');
  await expect(page.getByRole('heading', { name: 'New heading' })).toBeVisible();
});

test('the editor’s Save dashboard applies the chart and saves the dashboard', async ({
  page,
  request,
}) => {
  // direction.md §2: "Save dashboard" (applies the chart and saves the dashboard).
  const { dashboardId, chartId } = await makeDashboard(request);
  await page.goto(`/explore/dashboards/${dashboardId}`);
  await expect(canvas(page)).toHaveAttribute('data-chart-type', 'bar');
  await addHeading(page);
  await page.getByTestId('edit-chart-tile-save').click();
  await page.getByLabel('Chart type').selectOption('stackedBar');

  await saveDashboard(page).click();

  // Back on the dashboard, out of edit mode, with the chart applied and written.
  await expect(editor(page)).toBeHidden();
  await expect(bar(page)).toBeHidden();
  await expect(canvas(page)).toHaveAttribute('data-chart-type', 'stackedBar');
  await expect.poll(() => storedType(request, chartId)).toBe('stackedBar');

  // The dashboard was saved, not only the chart: its own change is kept too.
  await page.reload();
  await expect(canvas(page)).toHaveAttribute('data-chart-type', 'stackedBar');
  await expect(page.getByRole('heading', { name: 'New heading' })).toBeVisible();
});

test('the editor’s Save dashboard is held back by a change to a library chart, saying why', async ({
  page,
  request,
}) => {
  const { dashboardId, chartId } = await makeDashboard(request, true);
  await page.goto(`/explore/dashboards/${dashboardId}`);
  await expect(canvas(page)).toHaveAttribute('data-chart-type', 'bar');
  await page.getByTestId('edit-chart-tile-save').click();

  // Only a *change* to it holds Save back: opened and left as it is, a library
  // chart applies nothing, so the dashboard's other changes can still be saved.
  await expect(saveDashboard(page)).toHaveAttribute('aria-disabled', 'false');

  await page.getByLabel('Chart type').selectOption('stackedBar');

  await expect(saveDashboard(page)).toHaveAttribute('aria-disabled', 'true');
  const reason = editor(page).getByTestId('editor-save-blocked');
  await expect(reason).toContainText(/library chart/);
  await expect(reason).toContainText(/other dashboards can use it too/);
  await expect(saveDashboard(page)).toHaveAttribute(
    'aria-describedby',
    (await reason.getAttribute('id')) ?? 'no id',
  );

  /**
   * Pressed anyway: nothing is applied or saved, and the editor stays open and
   * live. Checked only after a later change has been drawn, so the press has
   * certainly been handled — leaving takes a moment (the edit's query runs
   * first), and the editor still being there straight after a press that
   * *had* started leaving would prove nothing.
   */
  await saveDashboard(page).click({ force: true });
  await page.getByLabel('Chart type').selectOption('bar');
  await expect(page.getByTestId('chart-type')).toHaveText('bar');
  await expect(editor(page).getByTestId('editor-applying')).toHaveText('');
  await expect(editor(page)).toBeVisible();
  // Unwritten — though this alone could not tell: the server refuses a
  // library chart too (400). The client's own hold is what the rest checks.
  expect(await storedType(request, chartId)).toBe('bar');

  // Changed back, the chart applies nothing, so Save dashboard is free again.
  await expect(saveDashboard(page)).toHaveAttribute('aria-disabled', 'false');
  await expect(editor(page).getByTestId('editor-save-blocked')).toHaveText('');
});

test('a chart load still running from the last save does not put that chart back over the next', async ({
  page,
  request,
}) => {
  /**
   * Two saves close together, with Cube slow. The first save re-fetches the
   * charts; the user edits again and saves before that fetch is back. The
   * second save shows its edit on the tile at once — and without cancelling
   * the fetch still running, the first save's chart lands over it, until the
   * second save's own fetch comes back.
   *
   * The network is held so the race runs in that order every time: the
   * re-fetch of the chart and the second save are each let through only when
   * the test says.
   */
  const { dashboardId, chartId } = await makeDashboard(request);
  const heldFetches: Route[] = [];
  const heldSaves: Route[] = [];
  let holdFetch = false;
  let holdSave = false;
  await page.route(`**/api/documents/chart/${chartId}`, async (route) => {
    if (route.request().method() === 'GET' && holdFetch) {
      holdFetch = false;
      heldFetches.push(route);
      return;
    }
    await route.continue();
  });
  await page.route(`**/api/dashboards/${dashboardId}`, async (route) => {
    if (holdSave) {
      holdSave = false;
      heldSaves.push(route);
      return;
    }
    await route.continue();
  });

  await page.goto(`/explore/dashboards/${dashboardId}`);
  await editToStacked(page);

  // The first save, whose re-fetch of the chart is held.
  holdFetch = true;
  await barButton(page, 'Save').click();
  await expect.poll(() => heldFetches.length).toBe(1);

  // Edited again and saved again, while that fetch is still out; this save
  // is held too, so the fetch can be let back before it.
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByTestId('edit-chart-tile-save').click();
  await page.getByLabel('Chart type').selectOption('hbar');
  await page.getByTestId('editor-back').click();
  await expect(canvas(page)).toHaveAttribute('data-chart-type', 'hbar');

  await recordTypes(page);
  holdSave = true;
  await barButton(page, 'Save').click();
  await expect.poll(() => heldSaves.length).toBe(1);

  // The first save's fetch comes back now, carrying that save's chart, and
  // its query runs; only then does the second save go through.
  const staleQuery = page.waitForResponse((response) => response.url().endsWith('/api/load'));
  await heldFetches[0]?.continue();
  await staleQuery;
  await heldSaves[0]?.continue();

  await expect.poll(() => storedType(request, chartId)).toBe('hbar');
  await expect(canvas(page)).toHaveAttribute('data-chart-type', 'hbar');
  expect((await typesSeen(page)).filter((type) => type !== 'hbar')).toEqual([]);
});

/** Someone else saves the chart, as `pie`, while an edit to it is held. */
async function changeElsewhere(request: APIRequestContext, chartId: string) {
  const current = await stored(request, chartId);
  await request.put(`${API}/documents/chart/${chartId}`, {
    data: {
      version: current.version,
      body: { ...current.body, chart: { ...definition, chartType: 'pie' } },
    },
  });
}

test('a chart changed elsewhere meanwhile is refused, not overwritten', async ({
  page,
  request,
}) => {
  const { dashboardId, chartId } = await makeDashboard(request);
  await page.goto(`/explore/dashboards/${dashboardId}`);
  await editToStacked(page);

  await changeElsewhere(request, chartId);
  await barButton(page, 'Save').click();

  await expect(page.getByTestId('save-failed')).toHaveText(
    'A chart on this dashboard changed somewhere else while you were editing it.',
  );
  // Their change stands.
  expect(await storedType(request, chartId)).toBe('pie');
});

test('a chart reopened from its draft is still checked against the version first read', async ({
  page,
  request,
}) => {
  /**
   * The draft carries the version its chart was first read at through every
   * reopening. Read afresh on reopening — or reopened from the stored chart —
   * the second edit would be checked against the other person's version, and
   * saved straight over their change.
   */
  const { dashboardId, chartId } = await makeDashboard(request);
  await page.goto(`/explore/dashboards/${dashboardId}`);
  await editToStacked(page);

  await changeElsewhere(request, chartId);
  await page.getByTestId('edit-chart-tile-save').click();
  // Reopened on the draft, not on what is stored now.
  await expect(page.getByTestId('chart-type')).toHaveText('stackedBar');
  await page.getByLabel('Chart type').selectOption('hbar');
  await page.getByTestId('editor-back').click();
  await expect(canvas(page)).toHaveAttribute('data-chart-type', 'hbar');

  await barButton(page, 'Save').click();

  await expect(page.getByTestId('save-failed')).toHaveText(
    'A chart on this dashboard changed somewhere else while you were editing it.',
  );
  expect(await storedType(request, chartId)).toBe('pie');
});

test('a library chart edited from its tile keeps Save held back, saying why', async ({
  page,
  request,
}) => {
  /**
   * A library chart can be on other dashboards. AC-128 requires the editor to
   * say so, with the count, and offer a local copy *before* changes spread
   * (T134); until then it is not written from a dashboard save.
   */
  const { dashboardId, chartId } = await makeDashboard(request, true);
  await page.goto(`/explore/dashboards/${dashboardId}`);
  await editToStacked(page);

  const save = barButton(page, 'Save');
  await expect(save).toHaveAttribute('aria-disabled', 'true');
  await expect(page.getByTestId('save-blocked')).toContainText(/library chart/);
  await expect(page.getByTestId('save-blocked')).toContainText(/other dashboards can use it too/);

  // Pressed anyway, as a user can: aria-disabled keeps it focusable and
  // clickable by design (the toolbar pattern), and Playwright would otherwise
  // wait for it to become enabled rather than press it. Saving regardless
  // dropped the edit in silence and put the old chart back on the tile —
  // AC-034's failing state, reached through Save.
  await save.click({ force: true });

  // Still editing, with the edit on the tile and in the session's history:
  // Undo takes the tile back and Redo returns it. Pressing them — rather
  // than looking once for the bar — is only possible if the press left the
  // session as it was.
  await expect(canvas(page)).toHaveAttribute('data-chart-type', 'stackedBar');
  await barButton(page, 'Undo').click();
  await expect(canvas(page)).toHaveAttribute('data-chart-type', 'bar');
  await barButton(page, 'Redo').click();
  await expect(canvas(page)).toHaveAttribute('data-chart-type', 'stackedBar');
  // Unwritten — though this alone could not tell: the server refuses a
  // library chart too (400). The client's own hold is what the rest checks.
  expect(await storedType(request, chartId)).toBe('bar');
});
