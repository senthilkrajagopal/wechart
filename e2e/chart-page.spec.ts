import { expect, test, type APIRequestContext } from '@playwright/test';

import { chooseChartType } from './chartType';
import { psql } from './store';
import { IN_MY_WORKSPACE } from './workspace';

const API = 'http://localhost:4100/api';

/**
 * T463 (UX-040, critical; phase-1 design 06, item 1): a dashboard-local
 * chart's page never leads to an editor that can't save.
 *
 * AC-126: a chart created on a dashboard is local to it. Its page says where
 * it lives, and its primary action is "Edit on ‹dashboard›", which opens that
 * dashboard in edit mode with this tile's editor open, where the dashboard's
 * Save saves the change. Beside it is "Save to folders…" (AC-127), which
 * makes it a library chart. The editor, reached any other way, offers the
 * same two actions in place of a sentence and no Save.
 */

interface Made {
  readonly unique: string;
  readonly dashboardId: string;
  readonly dashboardTitle: string;
  readonly chartId: string;
}

/**
 * A dashboard with one tile, `tile`, showing a chart local to it — or, with
 * `onTile: false`, a chart local to a dashboard none of whose tiles shows it.
 */
async function localChart(
  request: APIRequestContext,
  { onTile = true }: { onTile?: boolean } = {},
): Promise<Made> {
  const unique = `${String(Date.now())}-${String(Math.round(Math.random() * 1e6))}`;
  const created = async (kind: string, title: string) =>
    (
      (await (
        await request.post(`${API}/documents`, { data: { kind, title, ...IN_MY_WORKSPACE } })
      ).json()) as { id: string }
    ).id;
  const dashboardTitle = `Home ${unique}`;
  const dashboardId = await created('dashboard', dashboardTitle);
  const chartId = await created('chart', `Orders ${unique}`);
  const chart = await request.put(`${API}/documents/chart/${chartId}`, {
    data: {
      version: 1,
      body: {
        schemaVersion: 1,
        title: `Orders ${unique}`,
        owner: 'admin',
        localToDashboardId: dashboardId,
        chart: {
          source: { cube: 'orders' },
          wells: { measures: ['orders.count'], dimensions: ['orders.status'], timeDimensions: [] },
          chartType: 'bar',
        },
      },
    },
  });
  expect(chart.status()).toBe(200);
  const dashboard = await request.put(`${API}/documents/dashboard/${dashboardId}`, {
    data: {
      version: 1,
      body: {
        schemaVersion: 1,
        title: dashboardTitle,
        ...IN_MY_WORKSPACE,
        owner: 'admin',
        settings: { width: 'fixed' },
        pages: [
          {
            id: 'only',
            title: 'Only',
            items: onTile ? [{ id: 'tile', kind: 'chart', w: 6, h: 40, chartId }] : [],
          },
        ],
      },
    },
  });
  expect(dashboard.status()).toBe(200);
  return { unique, dashboardId, dashboardTitle, chartId };
}

const storedChart = async (request: APIRequestContext, chartId: string) =>
  (
    (await (await request.get(`${API}/documents/chart/${chartId}`)).json()) as {
      body: {
        localToDashboardId?: string;
        folderId?: string;
        chart: { chartType?: string };
      };
    }
  ).body;

test('a local chart page says where it lives, and Edit on its dashboard opens its tile there, where Save saves it', async ({
  page,
  request,
}) => {
  const made = await localChart(request);
  await page.goto(`/explore/charts/${made.chartId}`);

  const head = page.locator('.chart-page__head');
  // Design 06 pin 2's words (T686, DSH-13).
  await expect(head.getByTestId('chart-home')).toHaveText(
    `Local chart · only on ${made.dashboardTitle}`,
  );
  // Never the editor that can't save.
  await expect(head.getByRole('link', { name: /Edit chart/ })).toHaveCount(0);
  const editOn = head.getByRole('link', { name: `Edit on ${made.dashboardTitle}` });
  await expect(editOn).toHaveClass(/btn-primary/);
  // "Save to folders…" beside it (AC-127).
  await expect(head.getByRole('link', { name: 'Save to folders…' })).toBeVisible();
  // The pane says where it lives, and offers no way onto a second dashboard.
  const details = page.getByRole('complementary', { name: 'Chart details' });
  await expect(details.getByRole('heading', { name: 'Lives on' })).toBeVisible();
  await expect(details.getByRole('link', { name: made.dashboardTitle })).toHaveAttribute(
    'href',
    `/explore/dashboards/${made.dashboardId}`,
  );
  await expect(details.getByRole('heading', { name: 'Used in' })).toHaveCount(0);
  await expect(details.getByRole('button', { name: '＋ Add to a dashboard…' })).toHaveCount(0);

  await editOn.click();
  await expect(page).toHaveURL(new RegExp(`/explore/dashboards/${made.dashboardId}\\?`));
  // The tile's own editor, on the dashboard, in edit mode.
  const overlay = page.getByTestId('chart-editor-overlay');
  await expect(overlay.getByTestId('chart-type-change')).toBeVisible();
  await chooseChartType(overlay, 'table');
  await page.getByTestId('editor-back').click();
  await expect(overlay).toHaveCount(0);
  await page
    .getByRole('toolbar', { name: 'Dashboard editing' })
    .getByRole('button', { name: 'Save', exact: true })
    .click();

  // Saved with the dashboard, and still its own.
  await expect
    .poll(async () => (await storedChart(request, made.chartId)).chart.chartType)
    .toBe('table');
  expect((await storedChart(request, made.chartId)).localToDashboardId).toBe(made.dashboardId);
});

test('Save to folders on a local chart page opens its dashboard ready to choose the folder, and makes it a library chart', async ({
  page,
  request,
}) => {
  const made = await localChart(request);
  const folderTitle = `Shared charts ${made.unique}`;
  const folderId = (
    (await (
      await request.post(`${API}/documents`, {
        // In My workspace, where its dashboard is: a workspace's save puts no
        // chart in a shared folder (T502; T359).
        data: { kind: 'folder', title: folderTitle, folderId: 'mine' },
      })
    ).json()) as { id: string }
  ).id;

  await page.goto(`/explore/charts/${made.chartId}`);
  await page.locator('.chart-page__head').getByRole('link', { name: 'Save to folders…' }).click();

  // The dashboard in edit mode, with this tile's Properties asking for a folder.
  const sidebar = page.getByRole('complementary', { name: 'Edit sidebar' });
  const folder = sidebar.getByRole('combobox', { name: 'Folder' });
  await expect(folder).toBeVisible();
  // Asked once: the address no longer asks, so a reload opens it to be read.
  await expect(page).not.toHaveURL(/publish=/);
  await expect(page).not.toHaveURL(/editing=/);
  await folder.selectOption(folderId);
  await sidebar.getByRole('button', { name: 'Save to this folder' }).click();
  await page
    .getByRole('toolbar', { name: 'Dashboard editing' })
    .getByRole('button', { name: 'Save', exact: true })
    .click();
  await expect(page.getByTestId('saved-to-folder')).toContainText(folderTitle);

  const stored = await storedChart(request, made.chartId);
  expect(stored.localToDashboardId).toBeUndefined();
  expect(stored.folderId).toBe(folderId);

  // Now a library chart, its page offers Edit chart again, and no home. In
  // My workspace, its way back, the proposal, is the primary and Edit is
  // beside it (design 04, state F; T359, AC-254).
  await page.goto(`/explore/charts/${made.chartId}`);
  const head = page.locator('.chart-page__head');
  // A plain .btn at the head's one height, 32 px (T684, CMP-02).
  const edit = head.getByRole('link', { name: /Edit chart/ });
  await expect(edit).toHaveClass('btn');
  expect(await edit.evaluate((node) => Math.round(node.getBoundingClientRect().height))).toBe(32);
  await expect(head.getByRole('button', { name: /^Propose to / })).toHaveClass('btn-primary');
  await expect(head.getByTestId('chart-home')).toHaveCount(0);
});

test('the editor reached directly for a local chart offers Edit on its dashboard and Save to folders, not a dead end', async ({
  page,
  request,
}) => {
  const made = await localChart(request);
  await page.goto(`/explore/charts/${made.chartId}/edit`);

  await expect(page.getByTestId('chart-type-change')).toBeVisible();
  await expect(page.getByText('edit and save it there')).toHaveCount(0);
  const editOn = page.getByRole('link', { name: `Edit on ${made.dashboardTitle}` });
  await expect(editOn).toHaveClass(/btn-primary/);
  await expect(page.getByRole('link', { name: 'Save to folders…' })).toBeVisible();

  await editOn.click();
  await expect(
    page.getByTestId('chart-editor-overlay').getByTestId('chart-type-change'),
  ).toBeVisible();
});

test('a local chart no tile shows any more offers only the way to its dashboard (T463 review)', async ({
  page,
  request,
}) => {
  const made = await localChart(request, { onTile: false });
  await page.goto(`/explore/charts/${made.chartId}`);

  const head = page.locator('.chart-page__head');
  // Design 06 pin 2's words (T686), and that no tile shows it.
  await expect(head.getByTestId('chart-home')).toHaveText(
    `Local chart · only on ${made.dashboardTitle} · on none of its tiles`,
  );
  await expect(head.getByRole('link', { name: `Open ${made.dashboardTitle}` })).toHaveAttribute(
    'href',
    `/explore/dashboards/${made.dashboardId}`,
  );
  // Nothing to edit it in, nor to save it to folders from.
  await expect(head.getByRole('link', { name: /Edit on|Edit chart/ })).toHaveCount(0);
  await expect(head.getByRole('link', { name: 'Save to folders…' })).toHaveCount(0);
});

test('a local chart whose dashboard cannot be opened says so, on its page and in the editor (T463 review)', async ({
  page,
  request,
}) => {
  const made = await localChart(request);
  // Its dashboard can't be opened: one that never existed. A dashboard's
  // delete takes its own charts with it (T518, AC-363), and no save moves a
  // chart off its dashboard's workspace (T359, R52), so no local chart comes
  // to this through the API any more: it is set so in the store.
  expect(
    psql(
      `UPDATE documents SET body = jsonb_set(body, '{localToDashboardId}', to_jsonb('never-${made.unique}'::text)) WHERE kind = 'chart' AND id = '${made.chartId}' RETURNING id;`,
    ).split('\n')[0],
  ).toBe(made.chartId);

  await page.goto(`/explore/charts/${made.chartId}`);
  await expect(page.locator('.chart-page__head')).toContainText(
    "Its dashboard could not be opened, so this chart can't be edited from here.",
  );

  await page.goto(`/explore/charts/${made.chartId}/edit`);
  await expect(page.getByTestId('chart-type-change')).toBeVisible();
  await expect(
    page.getByText("Its dashboard could not be opened, so this chart can't be edited from here."),
  ).toBeVisible();
});

/**
 * T686 (AC-352, AC-126, AC-022; design 06; DSH-11 to DSH-16; R76
 * dashboard-Q7): the chart page as design 06 draws it.
 */
test.describe('the chart page as design 06 draws it (T686)', () => {
  /** A colour token as the browser resolves it. */
  const tokenOf = (page: import('@playwright/test').Page, token: string) =>
    page.evaluate((name) => {
      const probe = document.createElement('span');
      probe.style.color = `var(${name})`;
      document.body.append(probe);
      const colour = getComputedStyle(probe).color;
      probe.remove();
      return colour;
    }, token);
  const styleOf = (locator: import('@playwright/test').Locator, ...properties: string[]) =>
    locator.evaluate(
      (node, names) =>
        Object.fromEntries(names.map((name) => [name, getComputedStyle(node).getPropertyValue(name)])),
      properties,
    );

  test('⋯ holds Open ‹dashboard›, Copy link, View query, Download CSV, then Delete chart… (DSH-11)', async ({
    page,
    request,
  }) => {
    const made = await localChart(request);
    await page.goto(`/explore/charts/${made.chartId}`);
    const head = page.locator('.chart-page__head');
    await expect(head.getByTestId('chart-home')).toBeVisible();
    await head.getByRole('button', { name: /^More actions for / }).click();
    const menu = page.getByRole('menu');
    await expect(menu.getByRole('menuitem')).toHaveText([
      `Open ${made.dashboardTitle}`,
      'Copy link',
      'View query',
      'Download CSV',
      'Delete chart…',
    ]);
    // View query: the chart's Cube query, in its dialog.
    await menu.getByRole('menuitem', { name: 'View query' }).click();
    const query = page.getByRole('dialog', { name: `Query for Orders ${made.unique}` });
    await expect(query).toContainText('orders.count');
    // And the SQL Cube runs for it, asked for this chart (T686's review).
    await expect(query.getByTestId('generated-sql').first()).toContainText(/select/i);
    await query.getByRole('button', { name: 'Close' }).click();
    await expect(query).toHaveCount(0);
    // Download CSV: the drawn rows, as a file.
    await head.getByRole('button', { name: /^More actions for / }).click();
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('menu').getByRole('menuitem', { name: 'Download CSV' }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.csv$/);
    // Open ‹dashboard›: its dashboard.
    await head.getByRole('button', { name: /^More actions for / }).click();
    await page.getByRole('menu').getByRole('menuitem', { name: `Open ${made.dashboardTitle}` }).click();
    await expect(page).toHaveURL(new RegExp(`/explore/dashboards/${made.dashboardId}$`));
  });

  test('Copy link puts the page’s address on the clipboard, and says so (DSH-11)', async ({
    page,
    request,
  }) => {
    // Recorded as the app hands it to the clipboard, as markings.spec's Copy
    // tests do: no browser's clipboard read, which workers share.
    await page.addInitScript(() => {
      const texts: string[] = [];
      Object.assign(window, { __texts: texts });
      const { writeText } = Clipboard.prototype;
      Clipboard.prototype.writeText = function (this: Clipboard, text: string) {
        texts.push(text);
        return writeText.call(this, text);
      };
    });
    const made = await localChart(request);
    await page.goto(`/explore/charts/${made.chartId}`);
    const head = page.locator('.chart-page__head');
    await head.getByRole('button', { name: /^More actions for / }).click();
    await page.getByRole('menu').getByRole('menuitem', { name: 'Copy link' }).click();
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { __texts: string[] }).__texts))
      .toEqual([page.url()]);
    await expect(page.getByTestId('chart-link-copied')).toHaveText('Copied a link to this chart.');
    await expect(page.getByTestId('chart-link-copied').locator('[data-icon="ok"]')).toHaveCount(1);
  });

  test('the crumbs step to its dashboard, its ownership line names it, and Lives on is an item row (DSH-13)', async ({
    page,
    request,
  }) => {
    const made = await localChart(request);
    await page.goto(`/explore/charts/${made.chartId}`);
    const crumbs = page.locator('.chart-page__head').getByRole('navigation', { name: 'Breadcrumb' });
    const last = crumbs.getByRole('link').last();
    await expect(last).toHaveText(made.dashboardTitle);
    await expect(last).toHaveAttribute('href', `/explore/dashboards/${made.dashboardId}`);
    // "Local chart · only on ‹dashboard›", the dashboard at 600 in the primary ink.
    const home = page.getByTestId('chart-home');
    expect(await styleOf(home.locator('b'), 'font-weight', 'color')).toEqual({
      'font-weight': '600',
      color: await tokenOf(page, '--wc-text-primary'),
    });
    // Lives on: an Explore item row, 32 px, its ▦ chip, its name and "Open ›".
    const details = page.getByRole('complementary', { name: 'Chart details' });
    const row = details.getByRole('link', { name: made.dashboardTitle });
    await expect(row).toHaveClass(/chart-page__dashrow/);
    expect(await styleOf(row, 'height')).toEqual({ height: '32px' });
    await expect(row.locator('.itemicon.ic-dash')).toHaveCount(1);
    await expect(row).toContainText('Open ›');
  });

  test('the pane and the type badge as drawn (DSH-15)', async ({ page, request }) => {
    const made = await localChart(request);
    await page.goto(`/explore/charts/${made.chartId}`);
    const details = page.getByRole('complementary', { name: 'Chart details' });
    // The pane on the surface, ruled off at its left; its sections ruled off.
    expect(
      await styleOf(details, 'background-color', 'border-left-width', 'border-left-color'),
    ).toEqual({
      'background-color': await tokenOf(page, '--wc-bg-surface'),
      'border-left-width': '1px',
      'border-left-color': await tokenOf(page, '--wc-border-subtle'),
    });
    const section = details.locator('.chart-page__section').first();
    expect(await styleOf(section, 'border-bottom-width', 'padding-top')).toEqual({
      'border-bottom-width': '1px',
      'padding-top': '12px',
    });
    // Its heads 12/16/600, uppercase, .04em apart, in the secondary ink.
    const heading = details.getByRole('heading', { name: 'Metrics' });
    expect(
      await styleOf(
        heading,
        'font-size',
        'line-height',
        'font-weight',
        'text-transform',
        'letter-spacing',
        'color',
      ),
    ).toEqual({
      'font-size': '12px',
      'line-height': '16px',
      'font-weight': '600',
      'text-transform': 'uppercase',
      'letter-spacing': '0.48px',
      color: await tokenOf(page, '--wc-text-secondary'),
    });
    // The measure's pill in its role's tint at 600, with its aggregation at 400.
    const measure = details.locator('.field-pill--measure').first();
    await expect(measure).toHaveText(/Count\s*count$/);
    expect(await styleOf(measure, 'font-weight', 'color', 'height')).toEqual({
      'font-weight': '600',
      color: await tokenOf(page, '--wc-role-measure'),
      height: '24px',
    });
    expect(await styleOf(measure.locator('.field-pill__agg'), 'font-weight')).toEqual({
      'font-weight': '400',
    });
    const dimension = details.locator('.field-pill--dimension').first();
    expect(await styleOf(dimension, 'font-weight', 'color')).toEqual({
      'font-weight': '600',
      color: await tokenOf(page, '--wc-role-dimension'),
    });
    // The type badge: 22 px, round, on bg-subtle, at 400.
    const badge = page.getByTestId('chart-type');
    expect(
      await styleOf(badge, 'height', 'border-radius', 'background-color', 'font-weight'),
    ).toEqual({
      height: '22px',
      'border-radius': '999px',
      'background-color': await tokenOf(page, '--wc-bg-subtle'),
      'font-weight': '400',
    });
  });

  test('an Updated section: its day, and by whom where its history is the user’s to see (DSH-12)', async ({
    page,
    request,
  }) => {
    const made = await localChart(request);
    // Its history where the API gives it to this user; none, and so no name, where not.
    const asked = await request.get(`${API}/history/chart/${made.chartId}`);
    const history = asked.ok()
      ? ((await asked.json()) as {
          versions: { current: boolean; author: { name: string } | null }[];
        })
      : { versions: [] };
    const author = history.versions.find((version) => version.current)?.author ?? null;
    await page.goto(`/explore/charts/${made.chartId}`);
    const details = page.getByRole('complementary', { name: 'Chart details' });
    const updated = details
      .locator('.chart-page__section')
      .filter({ has: page.getByRole('heading', { name: 'Updated' }) })
      .locator('.chart-page__updated');
    // Saved just now: today's day, as every day is written (T477).
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const today = await page.evaluate(
      (names) => `${String(new Date().getDate())} ${names[new Date().getMonth()] ?? ''}`,
      months,
    );
    // "by ‹name›" where a history is given is `updatedText`'s unit test's.
    await expect(updated).toHaveText(author === null ? today : `${today} by ${author.name}`);
  });

  test('the tile’s head says how many rows it draws, whatever its type (DSH-14)', async ({
    page,
    request,
  }) => {
    const made = await localChart(request);
    await page.goto(`/explore/charts/${made.chartId}`);
    // Orders by their 3 statuses: one bar each.
    await expect(page.locator('.chart-page__tile').getByTestId('tile-row-count')).toHaveText(
      '3 rows',
    );
  });

  test('“＋ Add to a dashboard…” opens a picker to find one by name, and adds the chart there (DSH-16)', async ({
    page,
    request,
  }) => {
    const unique = `${String(Date.now())}-${String(Math.round(Math.random() * 1e6))}`;
    const made = async (kind: string, title: string) =>
      (
        (await (
          await request.post(`${API}/documents`, { data: { kind, title, ...IN_MY_WORKSPACE } })
        ).json()) as { id: string }
      ).id;
    const chart = await made('chart', `Library ${unique}`);
    const target = await made('dashboard', `Target ${unique}`);
    await page.goto(`/explore/charts/${chart}`);
    const details = page.getByRole('complementary', { name: 'Chart details' });
    await expect(details.getByTestId('used-by-none')).toBeVisible();

    const add = details.getByRole('button', { name: '＋ Add to a dashboard…' });
    expect(await styleOf(add, 'height')).toEqual({ height: '24px' });
    await add.click();
    const picker = page.getByRole('dialog', { name: 'Add to a dashboard' });
    const find = picker.getByRole('searchbox', { name: 'Find a dashboard' });
    await expect(find).toBeFocused();
    await find.fill(unique);
    // One row: ▦, its name, and its folder.
    const rows = picker.getByRole('button', { name: new RegExp(`^Target ${unique}`) });
    await expect(rows).toHaveCount(1);
    await expect(rows.locator('.itemicon.ic-dash')).toHaveCount(1);
    await expect(rows.locator('.chart-page__pick-folder')).toHaveText('My workspace');
    // Esc puts it away, back on the button it came from.
    await page.keyboard.press('Escape');
    await expect(picker).toHaveCount(0);
    await expect(add).toBeFocused();

    await add.click();
    await page.getByRole('searchbox', { name: 'Find a dashboard' }).fill(unique);
    await page
      .getByRole('dialog', { name: 'Add to a dashboard' })
      .getByRole('button', { name: new RegExp(`^Target ${unique}`) })
      .click();
    await expect(details.getByTestId(`using-${target}`)).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'Add to a dashboard' })).toHaveCount(0);
  });

  test('a chart that lives only on a shared dashboard is edited through that dashboard’s copy (R76 dashboard-Q7)', async ({
    page,
  }) => {
    // The seed's status chart is its shared dashboard's own.
    await page.goto('/explore/charts/seed-chart-status');
    const head = page.locator('.chart-page__head');
    await expect(head.getByTestId('chart-home')).toBeVisible();
    // Never design 06's in-place edit buttons: the dashboard's own route.
    await expect(head.getByRole('link', { name: /^✎?\s*Edit on / })).toHaveCount(0);
    await expect(head.getByRole('link', { name: 'Save to folders…' })).toHaveCount(0);
    const own = head.getByRole('button', { name: /^(Edit in my workspace|Open my copy)$/ });
    await expect(own).toHaveClass(/btn-primary/);
    const dashboardTitle = (await head.getByTestId('chart-home').locator('b').textContent()) ?? '';
    expect(dashboardTitle).not.toBe('');
    // "Open ‹dashboard›" stays in ⋯ (design 06 pin 5).
    await head.getByRole('button', { name: /^More actions for / }).click();
    await expect(page.getByRole('menu').getByRole('menuitem').first()).toHaveText(
      `Open ${dashboardTitle}`,
    );
    await page.keyboard.press('Escape');
    // Whichever the button is, it goes the dashboard's own way: a copy that
    // exists (another test may have made it) opens to be edited; none yet,
    // and design 04 state D's question names the dashboard it copies.
    if ((await own.textContent()) === 'Open my copy') {
      await own.click();
      await expect(page).toHaveURL(/\/explore\/dashboards\/[^/?]+\?editing=true$/);
      await expect(page).not.toHaveURL(/seed-root-dashboard-1/);
    } else {
      await own.click();
      const dialog = page.getByRole('dialog', { name: 'Edit in my workspace' });
      await expect(dialog).toContainText(`Copies ${dashboardTitle} into My workspace.`);
      await dialog.getByRole('button', { name: 'Cancel' }).click();
      await expect(dialog).toHaveCount(0);
    }
  });
});
