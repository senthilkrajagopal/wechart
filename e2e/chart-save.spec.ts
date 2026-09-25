import { expect, test, type APIRequestContext, type Page, type Route } from '@playwright/test';

import { chooseChartType, expectChartType } from './chartType';

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

/** What a save refused as stale says (AC-015), and what to do (AC-184, T197). */
const CHART_CONFLICT =
  'A chart on this dashboard changed somewhere else while you were editing it. To save the rest, undo back past your change to that chart — anything changed after it is undone too — and save again. Or reload: that shows their change and discards yours.';
const DASHBOARD_CONFLICT =
  'This dashboard changed somewhere else while you were editing it. Reloading shows that change and discards yours — copy anything you need first.';
/** What a save that never reached the server says (AC-184, T197). */
const UNREACHABLE =
  'Could not save: the server could not be reached. Check the connection, then save again.';

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
  await chooseChartType(page, 'stackedBar');
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
  await expectChartType(page, 'stackedBar');
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
  await chooseChartType(page, 'stackedBar');

  await saveDashboard(page).click();

  // Back on the dashboard, out of edit mode, with the chart applied and written.
  await expect(editor(page)).toBeHidden();
  await expect(bar(page)).toBeHidden();
  await expect(canvas(page)).toHaveAttribute('data-chart-type', 'stackedBar');
  await expect.poll(() => storedType(request, chartId)).toBe('stackedBar');
  // Focus back on the pencil the editor was opened from, as Back leaves it —
  // not dropped to the page because the dashboard was busy saving.
  await expect(page.getByTestId('edit-chart-tile-save')).toBeFocused();

  // The dashboard was saved, not only the chart: its own change is kept too.
  await page.reload();
  await expect(canvas(page)).toHaveAttribute('data-chart-type', 'stackedBar');
  await expect(page.getByRole('heading', { name: 'New heading' })).toBeVisible();
});

/**
 * T255 / AC-214: a title typed in the dashboard's editor and saved straight
 * away, without leaving the field, is the one saved (recheck-chart-editor
 * N1's sibling: the overlay takes the editor's state the same way).
 */
test('a title typed in the editor and saved at once, with Save dashboard, is the one saved', async ({
  page,
  request,
}) => {
  const { dashboardId, chartId } = await makeDashboard(request);
  const title = `Typed on the dashboard ${String(Date.now())}`;
  await page.goto(`/explore/dashboards/${dashboardId}`);
  await expect(canvas(page)).toHaveAttribute('data-chart-type', 'bar');
  await page.getByTestId('edit-chart-tile-save').click();
  const field = editor(page).getByLabel('Chart title');
  await field.fill(title);
  await expect(field).toBeFocused();

  await saveDashboard(page).click();
  await expect(editor(page)).toBeHidden();
  await expect.poll(async () => (await stored(request, chartId)).body['title']).toBe(title);
});

/** A second dashboard showing the same chart: a library chart's other user. */
async function alsoOn(request: APIRequestContext, chartId: string) {
  const unique = `${String(Date.now())}-${String(Math.round(Math.random() * 1e6))}`;
  const dashboard = (await (
    await request.post(`${API}/documents`, {
      data: { kind: 'dashboard', title: `Also ${unique}`, folderId: 'root' },
    })
  ).json()) as { id: string };
  await request.put(`${API}/documents/dashboard/${dashboard.id}`, {
    data: {
      version: 1,
      body: {
        schemaVersion: 1,
        title: `Also ${unique}`,
        folderId: 'root',
        owner: 'admin',
        settings: { width: 'fixed' },
        pages: [
          {
            id: 'only',
            title: 'Only',
            items: [{ id: 'tile-save', kind: 'chart', w: 6, h: 40, chartId }],
          },
        ],
      },
    },
  });
  return dashboard.id;
}

/**
 * T134 / AC-128: WHEN a library chart is opened for editing from a dashboard,
 * THE SYSTEM SHALL state that it is shared and on how many dashboards, and
 * offer to make a local copy before changes spread (direction.md rule 41).
 * Fails when: the editor gives no shared indication for a library chart used
 * by more than one dashboard.
 *
 * And kept, the change spreads: saved everywhere the chart is used (the
 * user's decision, 2026-09-22), no longer held back as at T192.
 */
test('the editor says a library chart is shared and on how many dashboards, and its Save dashboard saves it everywhere', async ({
  page,
  request,
}) => {
  const { dashboardId, chartId } = await makeDashboard(request, true);
  const other = await alsoOn(request, chartId);
  await page.goto(`/explore/dashboards/${dashboardId}`);
  await expect(canvas(page)).toHaveAttribute('data-chart-type', 'bar');
  await page.getByTestId('edit-chart-tile-save').click();

  const notice = editor(page).locator('.shared-chart-notice');
  await expect(notice).toHaveText(/Shared chart · on 2 dashboards · edits change all of them/);
  await expect(notice.locator('[data-icon="warn"]')).toHaveCount(1);

  await chooseChartType(page, 'stackedBar');
  await expect(saveDashboard(page)).toHaveAttribute('aria-disabled', 'false');
  await expect(editor(page).getByTestId('editor-save-blocked')).toHaveText('');
  // Nothing written until saved (AC-183; T134's review).
  expect(await storedType(request, chartId)).toBe('bar');
  await saveDashboard(page).click();

  await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeVisible();
  await expect(page.getByTestId('save-failed')).toHaveCount(0);
  await expect(canvas(page)).toHaveAttribute('data-chart-type', 'stackedBar');
  await expect.poll(() => storedType(request, chartId)).toBe('stackedBar');
  // Still the shared chart, in its folder: changed, not taken over.
  const after = await stored(request, chartId);
  expect(after.body['localToDashboardId']).toBeUndefined();
  expect(after.body['folderId']).toBe('root');
  // The other dashboard that uses it draws it changed.
  await page.goto(`/explore/dashboards/${other}`);
  await expect(canvas(page)).toHaveAttribute('data-chart-type', 'stackedBar');
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
  await chooseChartType(page, 'hbar');
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

  await expect(page.getByTestId('save-failed')).toHaveText(CHART_CONFLICT);
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
  await expectChartType(page, 'stackedBar');
  await chooseChartType(page, 'hbar');
  await page.getByTestId('editor-back').click();
  await expect(canvas(page)).toHaveAttribute('data-chart-type', 'hbar');

  await barButton(page, 'Save').click();

  await expect(page.getByTestId('save-failed')).toHaveText(CHART_CONFLICT);
  expect(await storedType(request, chartId)).toBe('pie');
});

/**
 * T197 / AC-184: IF a dashboard save fails, THEN THE SYSTEM SHALL stay in edit
 * mode with every change made in the session kept, including charts edited
 * from its tiles, and show why the save failed.
 * Fails when: after a failed save the dashboard is out of edit mode, a change
 * made before the save is missing from the dashboard or from Undo, or no
 * reason for the failure is shown.
 */
test.describe('a save that fails keeps the session (AC-184)', () => {
  /**
   * Still editing, with both changes on screen, and Undo able to step back
   * through them. `stored` is the chart the tile goes back to once the edit
   * is undone: what the server has *now*, which after someone else's save is
   * theirs, not the chart the session opened with.
   */
  async function expectSessionKept(page: Page, stored = 'bar') {
    await expect(bar(page)).toBeVisible();
    await expect(page.getByRole('heading', { name: 'New heading' })).toBeVisible();
    await expect(canvas(page)).toHaveAttribute('data-chart-type', 'stackedBar');

    await barButton(page, 'Undo').click();
    await expect(canvas(page)).toHaveAttribute('data-chart-type', stored);
    await barButton(page, 'Undo').click();
    await expect(page.getByRole('heading', { name: 'New heading' })).toBeHidden();
  }

  test('when a chart was changed elsewhere', async ({ page, request }) => {
    const { dashboardId, chartId } = await makeDashboard(request);
    await page.goto(`/explore/dashboards/${dashboardId}`);
    await addHeading(page);
    await editToStacked(page);

    await changeElsewhere(request, chartId);
    await barButton(page, 'Save').click();

    await expect(page.getByTestId('save-failed')).toHaveText(CHART_CONFLICT);
    await expectSessionKept(page, 'pie');
  });

  test('and after a chart conflict, the rest can be saved as the message says', async ({
    page,
    request,
  }) => {
    // "To save the rest, undo back past your change to that chart … and save
    // again": the dashboard itself has not moved, so that save goes through.
    const { dashboardId, chartId } = await makeDashboard(request);
    await page.goto(`/explore/dashboards/${dashboardId}`);
    await addHeading(page);
    await editToStacked(page);

    await changeElsewhere(request, chartId);
    await barButton(page, 'Save').click();
    await expect(page.getByTestId('save-failed')).toHaveText(CHART_CONFLICT);

    await barButton(page, 'Undo').click();
    await expect(canvas(page)).toHaveAttribute('data-chart-type', 'pie');
    await barButton(page, 'Save').click();
    await expect(bar(page)).toBeHidden();

    await page.reload();
    await expect(page.getByRole('heading', { name: 'New heading' })).toBeVisible();
    await expect(canvas(page)).toHaveAttribute('data-chart-type', 'pie');
    expect(await storedType(request, chartId)).toBe('pie');
  });

  test('when the dashboard was changed elsewhere', async ({ page, request }) => {
    const { dashboardId } = await makeDashboard(request);
    await page.goto(`/explore/dashboards/${dashboardId}`);
    await addHeading(page);
    await editToStacked(page);

    const current = (await (
      await request.get(`${API}/documents/dashboard/${dashboardId}`)
    ).json()) as { body: Record<string, unknown>; version: number };
    await request.put(`${API}/documents/dashboard/${dashboardId}`, {
      data: { version: current.version, body: { ...current.body, title: 'Renamed elsewhere' } },
    });
    await barButton(page, 'Save').click();

    await expect(page.getByTestId('save-failed')).toHaveText(DASHBOARD_CONFLICT);
    await expectSessionKept(page);
  });

  test('when the editor’s Save dashboard fails', async ({ page, request }) => {
    // The editor closes as it saves; the edit it applied must be in the
    // session regardless, with the dashboard's own change before it.
    const { dashboardId, chartId } = await makeDashboard(request);
    await page.goto(`/explore/dashboards/${dashboardId}`);
    await addHeading(page);
    await page.getByTestId('edit-chart-tile-save').click();
    await chooseChartType(page, 'stackedBar');

    await changeElsewhere(request, chartId);
    await saveDashboard(page).click();

    await expect(editor(page)).toBeHidden();
    await expect(page.getByTestId('save-failed')).toHaveText(CHART_CONFLICT);
    await expect(page.getByTestId('edit-chart-tile-save')).toBeFocused();
    await expectSessionKept(page, 'pie');
  });

  test('at once, not after every tile’s query has run again', async ({ page, request }) => {
    /**
     * A dashboard-only save (its own route, `PUT /api/documents/dashboard`),
     * refused because the dashboard changed elsewhere — with every tile's
     * query held. The session must come back as soon as the refusal does:
     * waiting for Cube to re-run each tile would keep the user at "Saving…",
     * locked out, beside a message saying the save has already failed.
     */
    const { dashboardId } = await makeDashboard(request);
    await page.goto(`/explore/dashboards/${dashboardId}`);
    await addHeading(page);

    const current = (await (
      await request.get(`${API}/documents/dashboard/${dashboardId}`)
    ).json()) as { body: Record<string, unknown>; version: number };
    await request.put(`${API}/documents/dashboard/${dashboardId}`, {
      data: { version: current.version, body: { ...current.body, title: 'Renamed elsewhere' } },
    });
    const heldQueries: Route[] = [];
    await page.route('**/api/load', (route) => {
      heldQueries.push(route);
    });

    await barButton(page, 'Save').click();

    await expect(page.getByTestId('save-failed')).toHaveText(DASHBOARD_CONFLICT);
    await expect(barButton(page, 'Save')).toHaveAttribute('aria-disabled', 'false');
    await expect(page.getByRole('heading', { name: 'New heading' })).toBeVisible();
    await barButton(page, 'Undo').click();
    await expect(page.getByRole('heading', { name: 'New heading' })).toBeHidden();
  });

  test('at once, with a chart edit in it too', async ({ page, request }) => {
    /**
     * The same on the route that carries chart edits, where a failure also
     * takes the unsaved charts back out of the cache and fetches them again —
     * which must not be waited for either.
     */
    const { dashboardId, chartId } = await makeDashboard(request);
    await page.goto(`/explore/dashboards/${dashboardId}`);
    await addHeading(page);
    await editToStacked(page);

    await changeElsewhere(request, chartId);
    const heldQueries: Route[] = [];
    await page.route('**/api/load', (route) => {
      heldQueries.push(route);
    });

    await barButton(page, 'Save').click();

    await expect(page.getByTestId('save-failed')).toHaveText(CHART_CONFLICT);
    await expect(barButton(page, 'Save')).toHaveAttribute('aria-disabled', 'false');
    await expect(canvas(page)).toHaveAttribute('data-chart-type', 'stackedBar');
    await expect(page.getByRole('heading', { name: 'New heading' })).toBeVisible();
    // The charts were fetched again, and their queries are the ones held: the
    // session came back without them. Never let through; they end with the page.
    await expect.poll(() => heldQueries.length).toBeGreaterThan(0);
  });

  test('when the server fails', async ({ page, request }) => {
    const { dashboardId } = await makeDashboard(request);
    await page.goto(`/explore/dashboards/${dashboardId}`);
    await addHeading(page);
    await editToStacked(page);

    await page.route(`**/api/dashboards/${dashboardId}`, (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Internal error' }),
      }),
    );
    await barButton(page, 'Save').click();

    await expect(page.getByTestId('save-failed')).toHaveText('Could not save: 500');
    await expectSessionKept(page);
  });

  test('when the browser is offline', async ({ page, context, request }) => {
    /**
     * Decided with the user (2026-09-21): a save made offline fails at once
     * and keeps the work, rather than waiting for the connection behind
     * "Saving…" with nothing said — which is what the data library does with
     * a save by default (docs/research/tanstack-query-mutations.md, gotcha 4).
     * Unlike an aborted request, this is the browser *reporting* itself
     * offline, which is what makes the library wait.
     */
    const { dashboardId } = await makeDashboard(request);
    await page.goto(`/explore/dashboards/${dashboardId}`);
    await addHeading(page);
    await editToStacked(page);

    await context.setOffline(true);
    await barButton(page, 'Save').click();

    await expect(page.getByTestId('save-failed')).toHaveText(UNREACHABLE);
    await expectSessionKept(page);
    await context.setOffline(false);
  });

  test('when the connection drops', async ({ page, request }) => {
    const { dashboardId } = await makeDashboard(request);
    await page.goto(`/explore/dashboards/${dashboardId}`);
    await addHeading(page);
    await editToStacked(page);

    await page.route(`**/api/dashboards/${dashboardId}`, (route) => route.abort('failed'));
    await barButton(page, 'Save').click();

    // Not the browser's own words for a failed request, which differ between
    // browsers and say nothing about what to do.
    await expect(page.getByTestId('save-failed')).toHaveText(UNREACHABLE);
    await expectSessionKept(page);
  });
});

/**
 * T135 / AC-129: WHEN the user makes a local copy of a shared chart, THE
 * SYSTEM SHALL repoint that tile to the copy, keep edits made so far, and
 * leave the shared chart unchanged.
 * Fails when: the shared chart changes, or the edits are lost.
 *
 * And AC-128's offer, made where the editor says the chart is shared.
 */
test('a local copy of a shared chart takes the tile and the edits so far, and leaves the shared chart as it was', async ({
  page,
  request,
}) => {
  const { dashboardId, chartId } = await makeDashboard(request, true);
  const other = await alsoOn(request, chartId);
  await page.goto(`/explore/dashboards/${dashboardId}`);
  await expect(canvas(page)).toHaveAttribute('data-chart-type', 'bar');
  await page.getByTestId('edit-chart-tile-save').click();

  const notice = editor(page).locator('.shared-chart-notice');
  await expect(notice).toContainText('on 2 dashboards');
  // An edit made before the copy: it goes with it.
  await chooseChartType(page, 'stackedBar');
  await notice.getByRole('button', { name: 'Make a local copy' }).click();

  await expect(editor(page).getByTestId('local-copy-made')).toContainText(
    'The shared chart is unchanged',
  );
  await expect(editor(page).getByRole('button', { name: 'Make a local copy' })).toHaveCount(0);
  await expectChartType(page, 'stackedBar');
  // Focus on what was done, not dropped to the page (T135's review).
  await expect(editor(page).getByTestId('local-copy-made')).toBeFocused();
  // The editor's history goes on through the copy: Undo reaches the edit
  // made before it, and Redo brings it back (AC-035; T135's review).
  await editor(page).getByRole('button', { name: 'Undo', exact: true }).click();
  await expectChartType(page, 'bar');
  await editor(page).getByRole('button', { name: 'Redo', exact: true }).click();
  await expectChartType(page, 'stackedBar');

  await page.getByTestId('editor-back').click();
  await expect(canvas(page)).toHaveAttribute('data-chart-type', 'stackedBar');
  await barButton(page, 'Save').click();
  await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeVisible();

  // The tile shows a copy of its own, local to this dashboard, with the edit.
  const saved = (await (await request.get(`${API}/documents/dashboard/${dashboardId}`)).json()) as {
    body: { pages: { items: { chartId?: string }[] }[] };
  };
  const copyId = saved.body.pages[0]?.items[0]?.chartId ?? '';
  expect(copyId).not.toBe(chartId);
  const copy = await stored(request, copyId);
  expect(copy.body['localToDashboardId']).toBe(dashboardId);
  expect((copy.body['chart'] as { chartType?: string }).chartType).toBe('stackedBar');
  // The shared chart as it was, and the other dashboard with it.
  expect(await storedType(request, chartId)).toBe('bar');
  await page.goto(`/explore/dashboards/${other}`);
  await expect(canvas(page)).toHaveAttribute('data-chart-type', 'bar');
});

/**
 * T243 (AC-193; its review): a chart handed back to the recommender in a
 * dashboard's editor is saved with the type it was drawn as — by Save
 * dashboard and by Make a local copy, as by the chart editor's Save chart —
 * so Explore names it by that type rather than "Automatic".
 */
test.describe('a chart handed back to the recommender is saved with the type it was drawn as', () => {
  const chartOf = async (request: APIRequestContext, chartId: string) => {
    const chart = (await stored(request, chartId)).body['chart'] as {
      chartType?: string | null;
      drawnAs?: string | null;
    };
    return [chart.chartType ?? null, chart.drawnAs ?? null];
  };
  const handBack = async (page: Page) => {
    await expect(canvas(page)).toHaveAttribute('data-chart-type', 'bar');
    await page.getByTestId('edit-chart-tile-save').click();
    await expect(editor(page)).toBeVisible();
    // The preview drawn first: before its rows arrive the recommender has no
    // cardinalities to go on, and its pick is not the one the rows give.
    const preview = editor(page).getByTestId('chart-canvas');
    await expect(preview).toHaveAttribute('data-chart-type', 'bar');
    await editor(page).getByTestId('back-to-recommended').click();
    await expect(editor(page).getByTestId('back-to-recommended')).toHaveCount(0);
    // What the editor now draws, the card and the preview agreeing.
    let drawn = '';
    await expect
      .poll(async () => {
        const card = await editor(page).getByTestId('chart-type').getAttribute('data-chart-type');
        drawn = card === (await preview.getAttribute('data-chart-type')) ? (card ?? '') : '';
        return drawn;
      })
      .toMatch(/^[a-zA-Z]+$/);
    return drawn;
  };

  test('by the editor’s Save dashboard', async ({ page, request }) => {
    const { dashboardId, chartId } = await makeDashboard(request);
    await page.goto(`/explore/dashboards/${dashboardId}`);
    const drawn = await handBack(page);

    await saveDashboard(page).click();
    await expect.poll(() => chartOf(request, chartId)).toEqual([null, drawn]);
  });

  test('by Make a local copy', async ({ page, request }) => {
    const { dashboardId, chartId } = await makeDashboard(request, true);
    await alsoOn(request, chartId);
    await page.goto(`/explore/dashboards/${dashboardId}`);
    const drawn = await handBack(page);
    await editor(page)
      .locator('.shared-chart-notice')
      .getByRole('button', { name: 'Make a local copy' })
      .click();
    await expect(editor(page).getByTestId('local-copy-made')).toBeVisible();

    await saveDashboard(page).click();
    await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeVisible();
    const saved = (await (
      await request.get(`${API}/documents/dashboard/${dashboardId}`)
    ).json()) as { body: { pages: { items: { chartId?: string }[] }[] } };
    const copyId = saved.body.pages[0]?.items[0]?.chartId ?? '';
    expect(copyId).not.toBe(chartId);
    expect(await chartOf(request, copyId)).toEqual([null, drawn]);
  });
});

/**
 * T223 / AC-205: a shared chart tile's edit menu offers "Make a local copy",
 * between Duplicate and Move to — the editor's path, from the menu: the tile
 * repointed to a copy with the edits so far, drawn as edited, and the shared
 * chart left as it was (AC-129).
 */
test('the tile menu’s Make a local copy takes the edits so far, and leaves the shared chart as it was', async ({
  page,
  request,
}) => {
  const { dashboardId, chartId } = await makeDashboard(request, true);
  await page.goto(`/explore/dashboards/${dashboardId}`);
  // An edit first, held as a draft: the copy must draw it, not the stored chart.
  await editToStacked(page);

  await page.getByTestId('tile-menu-tile-save').click();
  const menu = page.getByRole('list', { name: /^Actions for / });
  await expect(menu.locator(':scope > li').nth(1)).toHaveText('Make a local copy');
  await menu.getByRole('button', { name: 'Make a local copy' }).click();
  await expect(canvas(page)).toHaveAttribute('data-chart-type', 'stackedBar');
  await expect(page.locator('[data-tile="tile-save"]')).toBeFocused();

  await barButton(page, 'Save').click();
  await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeVisible();
  const saved = (await (await request.get(`${API}/documents/dashboard/${dashboardId}`)).json()) as {
    body: { pages: { items: { chartId?: string }[] }[] };
  };
  const copyId = saved.body.pages[0]?.items[0]?.chartId ?? '';
  expect(copyId).not.toBe(chartId);
  const copy = await stored(request, copyId);
  expect(copy.body['localToDashboardId']).toBe(dashboardId);
  expect((copy.body['chart'] as { chartType?: string }).chartType).toBe('stackedBar');
  expect(await storedType(request, chartId)).toBe('bar');
});

test('a library chart edited from its tile is saved with the dashboard, for every dashboard that uses it', async ({
  page,
  request,
}) => {
  /**
   * A library chart can be on other dashboards. The editor says so, with the
   * count, and offers a local copy first (T134, AC-128); kept, the edit is
   * saved everywhere, at the user's decision (2026-09-22). No longer held
   * back, as it was at T192.
   */
  const { dashboardId, chartId } = await makeDashboard(request, true);
  const other = await alsoOn(request, chartId);
  await page.goto(`/explore/dashboards/${dashboardId}`);
  await editToStacked(page);

  const save = barButton(page, 'Save');
  await expect(save).toHaveAttribute('aria-disabled', 'false');
  await expect(page.getByTestId('save-blocked')).toHaveText('');
  // Nothing written until saved (AC-183; T134's review).
  expect(await storedType(request, chartId)).toBe('bar');

  // An edit of the session like any other: Undo takes the tile back, Redo returns it.
  await barButton(page, 'Undo').click();
  await expect(canvas(page)).toHaveAttribute('data-chart-type', 'bar');
  await barButton(page, 'Redo').click();
  await expect(canvas(page)).toHaveAttribute('data-chart-type', 'stackedBar');

  await save.click();
  await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeVisible();
  await expect(canvas(page)).toHaveAttribute('data-chart-type', 'stackedBar');
  await expect.poll(() => storedType(request, chartId)).toBe('stackedBar');
  // Still shared: the other dashboard that uses it draws it changed.
  expect((await stored(request, chartId)).body['localToDashboardId']).toBeUndefined();
  await page.goto(`/explore/dashboards/${other}`);
  await expect(canvas(page)).toHaveAttribute('data-chart-type', 'stackedBar');
});

/**
 * T200 / AC-186: IF a dashboard save has had no answer 60 seconds after it was
 * sent, THEN THE SYSTEM SHALL treat it as failed — keeping the edit session as
 * AC-184 requires — and say that the save timed out.
 * `Fails when: a save with no answer leaves the edit session waiting for ever.`
 *
 * The real minute, on the real clock: the limit is the behaviour, and a test
 * that shortened it would be testing a different promise. The fake-timer
 * version of the same rule is `dashboard/edit/save.test.ts`.
 */
test('a save nothing answers is given up on, with the session and its work kept', async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);
  const { dashboardId, chartId } = await makeDashboard(request);
  void chartId;

  /**
   * The save is held for ever — never fulfilled, never continued — while
   * everything else, the dashboard's own GET included, goes through.
   */
  const holdSaves = async (route: Route) => {
    if (route.request().method() === 'PUT') return;
    await route.continue();
  };
  await page.route(`**/api/dashboards/${dashboardId}`, holdSaves);
  await page.route(`**/api/documents/dashboard/${dashboardId}`, holdSaves);

  await page.goto(`/explore/dashboards/${dashboardId}`);
  await editToStacked(page);
  await page.getByRole('button', { name: 'Save' }).click();

  // A minute later: failed, said in words, and the work still on the page.
  await expect(page.getByTestId('save-failed')).toContainText('60 seconds', {
    timeout: 90_000,
  });
  await expect(page.getByTestId('save-failed')).toContainText(/may still have gone through/i);
  // The session is still open — Save is still there to press — and the edit
  // it was carrying is still drawn (AC-184).
  await expect(page.getByRole('button', { name: 'Save' })).toBeVisible();
  await expect(canvas(page)).toHaveAttribute('data-chart-type', 'stackedBar');
});
