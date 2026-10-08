import { expect, test, type APIRequestContext, type Locator, type Page } from '@playwright/test';

import { IN_MY_WORKSPACE, seedDashboardCopy, sharedIn } from './workspace';

/**
 * T182 / AC-176: THE SYSTEM SHALL make every action reachable from the
 * keyboard: navigation, authoring, marking, filtering and every dialog, with
 * a visible focus indicator distinct from the marking outline (direction.md
 * rules 39, 52).
 * Fails when: an action can be performed only with a pointer, or focus is
 * invisible on any control.
 *
 * Each case drives a surface with the keyboard alone, from the gaps an audit
 * of the running app found (2026-09-22), and the gaps that round left open
 * (2026-09-25, with markings built: see "T182: what the first round left open").
 */
const API = 'http://localhost:4100';

async function create(request: APIRequestContext, kind: 'dashboard' | 'chart', title: string) {
  const response = await request.post(`${API}/api/documents`, {
    data: { kind, title, ...IN_MY_WORKSPACE },
  });
  return (await response.json()) as { id: string };
}

test('a delete dialog takes focus on its safe choice, closes on Escape, and gives focus back', async ({
  page,
  request,
}) => {
  const unique = `kb-${String(Date.now())}-${String(Math.round(Math.random() * 1e6))}`;
  // Shared, on a shared dashboard: only a shared dashboard keeps a chart from
  // being deleted (T517), and the single user shares both through My
  // workspace and their own approval (T359, AC-254).
  const chart = { id: await sharedIn(request, 'chart', 'root', { title: `Chart ${unique}` }) };
  await sharedIn(request, 'dashboard', 'root', {
    title: `Uses ${unique}`,
    pages: [
      {
        id: 'only',
        title: 'Only',
        items: [{ id: 'tile', kind: 'chart', w: 6, h: 30, chartId: chart.id }],
      },
    ],
  });

  await page.goto(`/explore/charts/${chart.id}`);
  // Delete chart…, in the header's ⋯ (T517; design 14, screen 2).
  const more = page.getByRole('button', { name: `More actions for Chart ${unique}` });
  await more.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('menuitem', { name: 'Delete chart…' })).toBeFocused();
  await page.keyboard.press('Enter');

  // A dashboard uses it: Can't delete, with Close, the choice that loses nothing.
  const dialog = page.getByRole('alertdialog', { name: `Can’t delete “Chart ${unique}”` });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Close' })).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(more).toBeFocused();
});

/** The seeded dashboard as the single user edits it: their copy (T359, AC-254). */
let DASHBOARD = '';
test.beforeAll(async () => {
  DASHBOARD = await seedDashboardCopy();
});

async function editSeedDashboard(page: Page) {
  await page.goto(DASHBOARD);
  // By the keyboard, as everything here: after a click the browser draws no
  // focus ring for focus moved by script, and the ring is under test too.
  await page.getByRole('button', { name: 'Edit', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('toolbar', { name: 'Dashboard editing' })).toBeVisible();
}

/**
 * A tile's Properties, from the tile itself: Tab towards the sidebar selects
 * every tile it passes, so without a key on the tile the Properties shown
 * would be the last tile's, never this one's.
 */
test('Enter on a tile opens its Properties, with focus there', async ({ page }) => {
  await editSeedDashboard(page);
  const tile = page.locator('[data-tile="tile-status"]');
  await tile.focus();
  await page.keyboard.press('Enter');

  const sidebar = page.getByRole('complementary', { name: 'Edit sidebar' });
  await expect(sidebar.getByRole('tab', { name: 'Properties' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  const panel = sidebar.getByRole('tabpanel', { name: 'Properties' });
  await expect(panel).toBeFocused();
  await expect(tile).toHaveAttribute('data-selected', 'true');
  // This tile's: a chart tile's Properties say who owns its chart.
  await expect(panel.getByRole('heading', { name: 'Ownership' })).toBeVisible();
  await expect(tile).toHaveAccessibleName(/Enter opens its properties\./);
});

test('Delete on a tile leaves focus on the tile next to it', async ({ page }) => {
  await editSeedDashboard(page);
  await page.locator('[data-tile="tile-status"]').focus();
  await page.keyboard.press('Delete');

  await expect(page.locator('[data-tile="tile-status"]')).toHaveCount(0);
  // Not the page: the next tile along, so a second Delete or an arrow key
  // carries on from where the first left off.
  await expect(page.locator('[data-tile="tile-notes"]')).toBeFocused();
});

test('the section delete question keeps Tab inside it, and Cancel returns to the section', async ({
  page,
}) => {
  await editSeedDashboard(page);
  await page.getByTestId('tile-menu-section-detail').click();
  await page.getByTestId('delete-section-detail').click();

  const dialog = page.getByRole('alertdialog');
  const keep = dialog.getByTestId('keep-contents');
  const cancel = dialog.getByTestId('cancel-delete-section');
  await expect(keep).toBeFocused();
  // Round from the last choice to the first and back, never onto the page
  // behind the backdrop: the foot reads Cancel · Delete · Keep since T466's
  // dialog pattern, Keep the primary it opens on.
  await page.keyboard.press('Tab');
  await expect(cancel).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(keep).toBeFocused();

  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('[data-tile="section-detail"]')).toBeFocused();

  // Asked again, and answered "keep": focus onto what was kept, in its place.
  await page.getByTestId('tile-menu-section-detail').focus();
  await page.keyboard.press('Enter');
  await page.getByTestId('delete-section-detail').focus();
  await page.keyboard.press('Enter');
  await expect(keep).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-tile="section-detail"]')).toHaveCount(0);
  await expect(page.locator('[data-tile="tile-region"]')).toBeFocused();
});

test('a tile deleted from its ⋯ menu leaves focus on the tile next to it', async ({ page }) => {
  await editSeedDashboard(page);
  await page.getByTestId('tile-menu-tile-status').focus();
  await page.keyboard.press('Enter');
  await page.getByTestId('delete-tile-status').focus();
  await page.keyboard.press('Enter');

  await expect(page.locator('[data-tile="tile-status"]')).toHaveCount(0);
  await expect(page.locator('[data-tile="tile-notes"]')).toBeFocused();
});

test('Move to keeps focus on the tile, in the place it went', async ({ page }) => {
  await editSeedDashboard(page);
  await page.getByTestId('tile-menu-tile-status').focus();
  await page.keyboard.press('Enter');
  await page.getByTestId('move-tile-status-to-sec:section-detail').focus();
  await page.keyboard.press('Enter');

  const moved = page.locator('[data-section="section-detail"] [data-tile="tile-status"]');
  await expect(moved).toHaveCount(1);
  await expect(moved).toBeFocused();
});

/** A dashboard with no tiles and two filters: order status, and when ordered. */
async function filteredDashboard(request: APIRequestContext) {
  const unique = `kb-${String(Date.now())}-${String(Math.round(Math.random() * 1e6))}`;
  const title = `Filters ${unique}`;
  const dashboard = await create(request, 'dashboard', title);
  await request.put(`${API}/api/documents/dashboard/${dashboard.id}`, {
    data: {
      version: 1,
      body: {
        schemaVersion: 1,
        title,
        ...IN_MY_WORKSPACE,
        owner: 'admin',
        settings: { width: 'fixed' },
        pages: [{ id: 'only', title: 'Only', items: [] }],
        filters: [
          { id: 'f-status', widget: 'checkbox', member: 'orders.status' },
          { id: 'f-ordered', widget: 'dateRange', member: 'orders.ordered_at' },
        ],
      },
    },
  });
  return { id: dashboard.id, title };
}

const pill = (page: Page, id: string) => page.locator(`[data-filter-id="${id}"]`);

test('clearing a filter leaves focus on the filter', async ({ page, request }) => {
  const { id, title } = await filteredDashboard(request);
  await page.goto(`/explore/dashboards/${id}`);
  await expect(page.getByRole('heading', { name: title })).toBeVisible();

  const status = pill(page, 'f-status');
  const summary = status.locator('button[aria-expanded]');
  await summary.focus();
  await page.keyboard.press('Enter');
  await status.getByRole('checkbox', { name: 'shipped' }).focus();
  await page.keyboard.press('Space');
  await page.keyboard.press('Escape');
  await expect(summary).toBeFocused();

  const clear = status.getByRole('button', { name: /^Clear / });
  await clear.focus();
  await page.keyboard.press('Enter');
  // The × goes with the value it cleared; the filter it belonged to stays.
  await expect(clear).toHaveCount(0);
  await expect(summary).toBeFocused();
});

test('removing a filter leaves focus on the next one', async ({ page, request }) => {
  const { id } = await filteredDashboard(request);
  await page.goto(`/explore/dashboards/${id}`);
  await page.getByRole('button', { name: 'Edit', exact: true }).focus();
  await page.keyboard.press('Enter');

  const summary = pill(page, 'f-status').locator('button[aria-expanded]');
  await summary.focus();
  // Selected by Enter: focus in its field picker in Properties, then Tab by
  // Tab to its scope and its Remove (T468, UX-031; its review).
  await page.keyboard.press('Enter');
  const settings = page.getByRole('complementary', { name: 'Edit sidebar' });
  await expect(settings.getByLabel('Filter on')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(settings.getByLabel('Applies to')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(settings.getByRole('button', { name: /^Remove / })).toBeFocused();
  await page.keyboard.press('Enter');

  await expect(pill(page, 'f-status')).toHaveCount(0);
  await expect(pill(page, 'f-ordered').locator('button[aria-expanded]')).toBeFocused();
});

/**
 * Whether the whole focus ring shows: none of it cut off by a box around the
 * control that clips or scrolls. The ring reaches `outline-offset` plus its
 * width beyond the control's edge, and a box with `overflow` other than
 * visible cuts off whatever reaches past its padding edge.
 */
async function ringShows(control: Locator) {
  await expect(control).toBeFocused();
  return control.evaluate((element) => {
    const style = getComputedStyle(element);
    if (style.outlineStyle === 'none') return 'no ring';
    const reach = Number.parseFloat(style.outlineWidth) + Number.parseFloat(style.outlineOffset);
    const box = element.getBoundingClientRect();
    for (let at = element.parentElement; at !== null; at = at.parentElement) {
      const clip = getComputedStyle(at);
      if (clip.overflowX === 'visible' && clip.overflowY === 'visible') continue;
      const edge = at.getBoundingClientRect();
      const left = edge.left + at.clientLeft;
      const top = edge.top + at.clientTop;
      if (
        box.left - reach < left - 0.5 ||
        box.top - reach < top - 0.5 ||
        box.right + reach > left + at.clientWidth + 0.5 ||
        box.bottom + reach > top + at.clientHeight + 0.5
      ) {
        return `cut off by ${at.tagName.toLowerCase()}.${[...at.classList].join('.')}`;
      }
    }
    return 'whole';
  });
}

test('focus rings are not cut off by the boxes around them', async ({ page }) => {
  // The model file's YAML / Join toggle, inside a rounded box that clips.
  await page.goto('/model/files/cubes%2Forders.yml');
  // (The head's Form | YAML shows only below 1,280 px, T487.)
  const toggle = page.locator('.model-editor__view button').first();
  await toggle.focus();
  expect(await ringShows(toggle)).toBe('whole');

  // The edit sidebar's tabs, in a strip that scrolls sideways, and its panel,
  // in a sidebar that clips.
  await editSeedDashboard(page);
  const sidebar = page.getByRole('complementary', { name: 'Edit sidebar' });
  const tab = sidebar.getByRole('tab', { name: 'Add' });
  await tab.focus();
  expect(await ringShows(tab)).toBe('whole');
  const panel = sidebar.getByRole('tabpanel');
  await panel.focus();
  expect(await ringShows(panel)).toBe('whole');

  // A tile's ⋯ menu, a list that scrolls, its items full width.
  await page.getByTestId('tile-menu-tile-status').focus();
  await page.keyboard.press('Enter');
  const item = page.getByTestId('move-tile-status-to-sec:section-detail');
  await item.focus();
  expect(await ringShows(item)).toBe('whole');
});

test('the settings page takes focus as it opens and gives it back to the gear', async ({
  page,
}) => {
  await page.goto(DASHBOARD);
  const gear = page.getByRole('button', { name: 'Dashboard settings' });
  await gear.focus();
  await page.keyboard.press('Enter');

  const settings = page.getByTestId('dashboard-settings');
  await expect(settings.getByRole('heading', { name: 'General', level: 2 })).toBeFocused();
  // Its section list scrolls, and its buttons fill it edge to edge.
  const section = settings.getByRole('button', { name: /^Layout/ });
  await section.focus();
  expect(await ringShows(section)).toBe('whole');

  await settings.getByTestId('settings-back').focus();
  await page.keyboard.press('Enter');
  await expect(settings).toHaveCount(0);
  await expect(gear).toBeFocused();
});

/** The WCAG contrast ratio of two colours, read as the browser paints them. */
async function contrastOf(page: Page, one: string, other: string) {
  return page.evaluate(
    ([a, b]) => {
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (context === null) throw new Error('No 2D canvas.');
      const luminance = (colour: string) => {
        context.clearRect(0, 0, 1, 1);
        context.fillStyle = colour;
        context.fillRect(0, 0, 1, 1);
        const [r = 0, g = 0, bl = 0] = context.getImageData(0, 0, 1, 1).data;
        const linear = (channel: number) => {
          const c = channel / 255;
          return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        };
        return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(bl);
      };
      const [light, dark] = [luminance(a as string), luminance(b as string)].sort((x, y) => y - x);
      return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05);
    },
    [one, other],
  );
}

/**
 * T638 (AC-176; the re-audit of 2026-10-07): focus seen on controls whose ring
 * was clipped to a sliver by the box around them: the editor's Actual size /
 * Fit, the connection form's segmented and row choices, and the edit
 * sidebar's Outline rows; and on Jobs' rows in a narrow window.
 */
test('focus rings are not cut off on segmented choices, rows and the Outline (T638)', async ({
  page,
}) => {
  // The editor opened from a tile: its preview's Actual size and Fit.
  await editSeedDashboard(page);
  await page.locator('[data-tile="tile-status"]').focus();
  await page.keyboard.press('e');
  const sizes = page.getByRole('group', { name: 'Preview size' });
  for (const name of ['Actual size', 'Fit']) {
    const size = sizes.getByRole('button', { name });
    await size.focus();
    expect(await ringShows(size), name).toBe('whole');
  }
  await page.keyboard.press('Escape');

  // The edit sidebar's Outline, its rows full width in a box that clips.
  await editSeedDashboard(page);
  const sidebar = page.getByRole('complementary', { name: 'Edit sidebar' });
  // By the keyboard: after a click the browser draws no ring for focus moved by script.
  await sidebar.getByRole('tab', { name: 'Outline' }).focus();
  await page.keyboard.press('Enter');
  const row = sidebar
    .getByRole('navigation', { name: 'Dashboard outline' })
    .getByRole('button')
    .first();
  await row.focus();
  expect(await ringShows(row)).toBe('whole');

  // A new data source's connection: two sign-ins as a segmented choice,
  // three as rows.
  await page.goto('/data-sources');
  for (const [tile, method] of [
    ['PostgreSQL', 'Password'],
    ['Snowflake', 'Password'],
  ] as const) {
    // By the keyboard, so the browser draws the ring for focus moved by script.
    await page.getByRole('button', { name: '+ Data source' }).focus();
    await page.keyboard.press('Enter');
    const wizard = page.getByRole('dialog', { name: 'New data source' });
    await wizard.getByRole('radio', { name: tile }).focus();
    await page.keyboard.press('Space');
    await wizard.getByRole('button', { name: 'Next: Connection' }).focus();
    await page.keyboard.press('Enter');
    const choice = wizard
      .getByRole('radiogroup', { name: 'Sign in with' })
      .getByRole('radio', { name: method, exact: true });
    await choice.focus();
    expect(await ringShows(choice), tile).toBe('whole');
    await page.keyboard.press('Escape');
    const discard = page.getByRole('button', { name: 'Discard changes' });
    if (await discard.isVisible()) await discard.click();
    await expect(wizard).toHaveCount(0);
  }

  // Jobs' pre-aggregations, its rows in a table that scrolls sideways below 1,024 px.
  await page.setViewportSize({ width: 900, height: 800 });
  await page.goto('/jobs');
  // A row's stop is its name, a button read as the row is (T611; design 16's keyboard table).
  const preAgg = page.locator('.build-panel__row .list-name').first();
  await expect(preAgg).toBeVisible();
  await preAgg.focus();
  expect(await ringShows(preAgg)).toBe('whole');
});

/** A dashboard with one list filter, shipped chosen (T638). */
async function listFilterDashboard(request: APIRequestContext) {
  const unique = `kb-${String(Date.now())}-${String(Math.round(Math.random() * 1e6))}`;
  const title = `List ${unique}`;
  const dashboard = await create(request, 'dashboard', title);
  await request.put(`${API}/api/documents/dashboard/${dashboard.id}`, {
    data: {
      version: 1,
      body: {
        schemaVersion: 1,
        title,
        ...IN_MY_WORKSPACE,
        owner: 'admin',
        settings: { width: 'fixed' },
        pages: [{ id: 'only', title: 'Only', items: [] }],
        filters: [{ id: 'f-list', widget: 'list', member: 'orders.status' }],
      },
    },
  });
  return { id: dashboard.id, title };
}

for (const theme of ['light', 'dark'] as const) {
  /**
   * T638 (AC-176): a list filter's chosen value, filled in the accent: its
   * focus ring was the accent too, on it, and couldn't be seen.
   */
  test(`a list filter’s chosen value shows its focus ring, ${theme} (T638)`, async ({
    page,
    request,
  }) => {
    await page.addInitScript((value) => {
      window.localStorage.setItem('wechart.theme', value);
    }, theme);
    const { id, title } = await listFilterDashboard(request);
    await page.goto(`/explore/dashboards/${id}`);
    await expect(page.getByRole('heading', { name: title })).toBeVisible();
    const filter = pill(page, 'f-list');
    await filter.locator('button[aria-expanded]').focus();
    await page.keyboard.press('Enter');
    const shipped = filter.getByRole('button', { name: 'shipped', exact: true });
    await shipped.focus();
    await page.keyboard.press('Enter');
    await expect(shipped).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    await expect(shipped).toBeFocused();
    // A ring is drawn at all (T638's review: with none, the colour read is
    // `currentColor`, which would pass on its own).
    const drawn = await shipped.evaluate((element) => {
      const style = getComputedStyle(element);
      return { style: style.outlineStyle, width: Number.parseFloat(style.outlineWidth) };
    });
    expect(drawn.style).not.toBe('none');
    expect(drawn.width).toBeGreaterThanOrEqual(2);
    const ring = await shipped.evaluate((element) => getComputedStyle(element).outlineColor);
    const fill = await shipped.evaluate((element) => getComputedStyle(element).backgroundColor);
    // WCAG 1.4.11: 3:1 against what it sits on, here the chosen value's fill.
    expect(await contrastOf(page, ring, fill)).toBeGreaterThanOrEqual(3);
  });

  test(`the undo toast’s focus ring stands out from the toast, ${theme}`, async ({ page }) => {
    await page.addInitScript((value) => {
      window.localStorage.setItem('wechart.theme', value);
    }, theme);
    await editSeedDashboard(page);
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await page.locator('[data-tile="tile-notes"]').focus();
    await page.keyboard.press('Delete');

    const toast = page.getByTestId('undo-toast');
    const undo = toast.getByRole('button', { name: 'Undo' });
    await undo.focus();
    const ring = await undo.evaluate((element) => getComputedStyle(element).outlineColor);
    const ground = await toast.evaluate((element) => getComputedStyle(element).backgroundColor);
    // WCAG 1.4.11: a focus indicator is a graphical object, 3:1 against what
    // it sits on.
    expect(await contrastOf(page, ring, ground)).toBeGreaterThanOrEqual(3);
  });
}

/**
 * A tile's table view scrolls from the keyboard: its scrolling region takes
 * focus from the Table view switch — in WebKit too, which does not make a
 * scrolling box focusable of itself.
 */
test('a tile’s table can be reached and scrolled from the keyboard', async ({ page }) => {
  await page.goto(DASHBOARD);
  const tile = page.locator('[data-tile="tile-status"]');
  // The chart it replaces fits the tile as well: both were drawn at the
  // tile's whole height, below its head, and ran past its clipped bottom.
  await expect(tile.getByTestId('chart-canvas')).toBeVisible();
  const overrun = await tile.evaluate((node) => {
    const canvas = node.querySelector('[data-testid="chart-canvas"]');
    if (canvas === null) return 'no chart';
    const inner = node.getBoundingClientRect().bottom - node.clientTop;
    return Math.max(0, Math.round(canvas.getBoundingClientRect().bottom - inner));
  });
  expect(overrun).toBe(0);
  const toggle = tile.getByTestId('toggle-table-view');
  await toggle.focus();
  await page.keyboard.press('Enter');
  const table = tile.getByRole('region', { name: /, table$/ });
  await expect(table).toBeVisible();

  await toggle.focus();
  await page.keyboard.press('Tab');
  await expect(table).toBeFocused();
  // Its ring whole, inside a tile that clips.
  expect(await ringShows(table)).toBe('whole');
});

/**
 * T182, completed 2026-09-25 with markings built: the gaps its first round
 * left open, each driven by the keyboard alone.
 */
test.describe('T182: what the first round left open', () => {
  test('page tabs are one Tab stop, and the arrow keys move between them (APG tabs)', async ({
    page,
  }) => {
    await page.goto(DASHBOARD);
    const pages = page.getByRole('tablist', { name: 'Pages' });
    const overview = pages.getByRole('tab', { name: 'Overview' });
    const appendix = pages.getByRole('tab', { name: 'Appendix' });
    await expect(overview).toHaveAttribute('tabindex', '0');
    await expect(appendix).toHaveAttribute('tabindex', '-1');
    await overview.focus();
    await page.keyboard.press('ArrowRight');
    await expect(appendix).toBeFocused();
    await expect(appendix).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('ArrowLeft');
    await expect(overview).toBeFocused();
    await expect(overview).toHaveAttribute('aria-selected', 'true');
    // Wrapping, and Home and End (T182's review).
    await page.keyboard.press('ArrowLeft');
    await expect(appendix).toBeFocused();
    await page.keyboard.press('Home');
    await expect(overview).toBeFocused();
    await page.keyboard.press('End');
    await expect(appendix).toBeFocused();
    // Its ring whole, in a strip that scrolls sideways (T182's review).
    expect(await ringShows(appendix)).toBe('whole');
  });

  test('a tab group’s tabs take the arrow keys too', async ({ page }) => {
    await page.goto(DASHBOARD);
    await page
      .getByRole('tablist', { name: 'Pages' })
      .getByRole('tab', { name: 'Appendix' })
      .click();
    const group = page.locator('[data-tab-group="group-terms"]').getByRole('tablist');
    const measures = group.getByRole('tab', { name: 'Measures' });
    const dimensions = group.getByRole('tab', { name: 'Dimensions' });
    await expect(dimensions).toHaveAttribute('tabindex', '-1');
    await measures.focus();
    await page.keyboard.press('ArrowRight');
    await expect(dimensions).toBeFocused();
    await expect(dimensions).toHaveAttribute('aria-selected', 'true');
  });

  test('the folder tree moves with the arrow keys, as a tree promises', async ({ page }) => {
    await page.goto('/explore');
    const tree = page.getByRole('tree', { name: 'Folders' });
    const first = tree.getByRole('button').first();
    const second = tree.getByRole('button').nth(1);
    await first.focus();
    await page.keyboard.press('ArrowDown');
    await expect(second).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await expect(first).toBeFocused();
  });

  test('a tile’s grip is no dead Tab stop: pressed, it hands the keyboard to its tile', async ({
    page,
  }) => {
    await editSeedDashboard(page);
    const grip = page.getByTestId('grip-tile-status');
    await grip.focus();
    await page.keyboard.press('Enter');
    const tile = page.locator('[data-tile="tile-status"]');
    await expect(tile).toBeFocused();
    // And the tile's own keys move it: one place along, into the notes' place.
    const before = (await tile.boundingBox())!.x;
    await page.keyboard.press('ArrowRight');
    await expect(async () => {
      expect((await tile.boundingBox())!.x).not.toBe(before);
    }).toPass();
  });

  test('the undo toast waits while focus is in it, and Undo leaves focus on the page’s tiles', async ({
    page,
  }) => {
    await page.clock.install();
    await editSeedDashboard(page);
    await page.locator('[data-tile="tile-notes"]').focus();
    await page.keyboard.press('Delete');
    // The delete puts focus on the tile beside it, on the next frame.
    await page.clock.runFor(100);
    const toast = page.getByTestId('undo-toast');
    const undo = toast.getByRole('button', { name: 'Undo' });
    await undo.focus();
    // Past its 8 s, with focus on it: still there (WCAG 2.2.1).
    await page.clock.runFor(12_000);
    await expect(toast).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(page.locator('[data-tile="tile-notes"]')).toHaveCount(1);
    // Focus goes back on the next frame, on the clock this test holds.
    await page.clock.runFor(100);
    // Not the page: where focus was before it went to the toast.
    expect(await page.evaluate(() => document.activeElement?.closest('[data-tile]') !== null)).toBe(
      true,
    );

    // The same delete again, the same message: a new toast, which times out
    // as a fresh one does, not held over from the last (T182's review).
    await page.locator('[data-tile="tile-notes"]').focus();
    await page.keyboard.press('Delete');
    await expect(toast).toBeVisible();
    await page.mouse.move(0, 0);
    await page.clock.runFor(9_000);
    await expect(toast).toHaveCount(0);
  });

  test('deleting a tab by its × leaves focus on its group’s tab strip', async ({ page }) => {
    await editSeedDashboard(page);
    await page
      .getByRole('tablist', { name: 'Pages' })
      .getByRole('tab', { name: 'Appendix' })
      .click();
    await page.getByTestId('delete-tab-group-terms-dimensions').focus();
    await page.keyboard.press('Enter');
    const measures = page
      .locator('[data-tab-group="group-terms"]')
      .getByRole('tab', { name: 'Measures' });
    await expect(measures).toBeFocused();
  });

  test('Escape closes the search palette opened over a dialog, and only the palette', async ({
    page,
  }) => {
    await editSeedDashboard(page);
    await page.getByTestId('tile-menu-section-detail').click();
    await page.getByTestId('delete-section-detail').click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toBeVisible();
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+k' : 'Control+k');
    const palette = page.getByRole('dialog', { name: /search/i });
    await expect(palette).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(palette).toBeHidden();
    await expect(dialog).toBeVisible();
  });

  test('removing the only filter leaves focus in the filter bar', async ({ page, request }) => {
    const { id } = await filteredDashboard(request);
    await page.goto(`/explore/dashboards/${id}`);
    await page.getByRole('button', { name: 'Edit', exact: true }).focus();
    await page.keyboard.press('Enter');
    for (const filter of ['f-status', 'f-ordered']) {
      await pill(page, filter).locator('button[aria-expanded]').focus();
      // Selected by Enter: focus in its field picker, then Tab to its scope
      // and its Remove (T468, UX-031).
      await page.keyboard.press('Enter');
      const settings = page.getByRole('complementary', { name: 'Edit sidebar' });
      await expect(settings.getByLabel('Filter on')).toBeFocused();
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');
      await expect(settings.getByRole('button', { name: /^Remove / })).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(pill(page, filter)).toHaveCount(0);
      // The first gone, focus is on the one left (the test above), before it is chosen.
      if (filter === 'f-status')
        await expect(pill(page, 'f-ordered').locator('button[aria-expanded]')).toBeFocused();
    }
    // On the frame after the filter goes, so asked until then.
    await expect(async () => {
      expect(
        await page.evaluate(() => document.activeElement?.closest('.filter-bar') !== null),
      ).toBe(true);
    }).toPass();
  });

  test('after a settings save in view mode, focus is back on the gear', async ({
    page,
    request,
  }) => {
    // A dashboard of its own: a save bumps the version other tests edit at.
    const { id } = await filteredDashboard(request);
    await page.goto(`/explore/dashboards/${id}`);
    const gear = page.getByRole('button', { name: 'Dashboard settings' });
    await gear.focus();
    await page.keyboard.press('Enter');
    const settings = page.getByTestId('dashboard-settings');
    const description = settings.getByLabel('Description', { exact: true });
    await description.fill(`Saved by the keyboard ${String(Date.now())}`);
    await settings.getByRole('button', { name: 'Save settings' }).focus();
    await page.keyboard.press('Enter');
    await expect(settings).toHaveCount(0);
    await expect(gear).toBeFocused();
  });

  test('marking by the keyboard, under a focus ring unlike the marking’s outline', async ({
    page,
  }) => {
    await page.goto(DASHBOARD);
    const tile = page.locator('[data-tile="tile-status"]');
    await expect(tile.getByTestId('chart-canvas')).toBeVisible();
    await tile.focus();
    // AC-100's keys: the arrows move between items, Space marks.
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Space');
    await expect(page.locator('.mark-chip')).toHaveCount(1);
    // The ring: 2 px, 2 px out from the tile, in the accent — the marked
    // items' outline is 1.5 px, hugging each mark, in the marking's ink.
    const ring = await tile.evaluate((element) => {
      const style = getComputedStyle(element);
      return { width: style.outlineWidth, offset: style.outlineOffset, colour: style.outlineColor };
    });
    expect(ring.width).toBe('2px');
    expect(Number.parseFloat(ring.offset)).toBeGreaterThanOrEqual(2);
    const outlined = await tile
      .locator('svg path[stroke-width="1.5"], svg path[style*="stroke-width: 1.5"]')
      .first()
      .evaluate((path) => ({
        stroke: getComputedStyle(path).stroke,
        width: getComputedStyle(path).strokeWidth,
      }));
    expect(outlined.width).toBe('1.5px');
    expect(outlined.stroke).not.toBe(ring.colour);
  });
});

/**
 * T306 (AC-176, AC-100): the item a tile's keyboard is on is drawn. The
 * arrows moved it with nothing on screen to show where, so a sighted keyboard
 * user could not see what Space would mark (T182's review).
 */
test.describe('T306: the item the keyboard is on', () => {
  test('is ringed dashed in the accent as the arrows move, unlike a marked outline, and not once Tab leaves', async ({
    page,
  }) => {
    await page.goto(DASHBOARD);
    // Categories across, split by status: a category is a bar in each series.
    const tile = page.locator('[data-tile="tile-status"]');
    await expect(tile.getByTestId('chart-canvas')).toBeVisible();
    const accent = await page.evaluate(() => {
      const probe = document.createElement('span');
      probe.style.color = 'var(--wc-accent)';
      document.body.append(probe);
      const colour = getComputedStyle(probe).color;
      probe.remove();
      return colour;
    });
    const ringed = () =>
      tile.locator('svg path[stroke-dasharray]').evaluateAll((paths) =>
        paths.map((path) => ({
          left: Math.round(path.getBoundingClientRect().left),
          stroke: getComputedStyle(path).stroke,
          width: getComputedStyle(path).strokeWidth,
        })),
      );

    // ECharts' tooltip, a div of its own in the canvas.
    const tip = tile.getByTestId('chart-canvas').locator('div[style*="z-index: 9999999"]');

    await tile.focus();
    expect(await ringed()).toHaveLength(0);

    // Two categories, three statuses: the second category is three bars.
    await page.keyboard.press('ArrowRight');
    await expect.poll(async () => (await ringed()).length).toBe(3);
    // Its tooltip too, as the prototype shows it.
    await expect(tip).toBeVisible();
    const second = await ringed();
    for (const { stroke, width } of second)
      expect({ stroke, width }).toEqual({ stroke: accent, width: '2px' });

    // Back to the first category: every ringed bar now left of the second's.
    await page.keyboard.press('ArrowLeft');
    await expect
      .poll(async () => Math.max(...(await ringed()).map((one) => one.left)))
      .toBeLessThan(Math.min(...second.map((one) => one.left)));

    // Marked, it keeps its marking's 1.5 px outline, not the ring, and its
    // tooltip still says where the keyboard is.
    await page.keyboard.press('Space');
    await expect(page.locator('.mark-chip')).toHaveCount(1);
    await expect.poll(async () => (await ringed()).length).toBe(0);
    await expect(
      tile.locator('svg path[stroke-width="1.5"], svg path[style*="stroke-width: 1.5"]'),
    ).toHaveCount(3);
    await expect(tip).toBeVisible();
    // On to the unmarked category: ringed again.
    await page.keyboard.press('ArrowRight');
    await expect.poll(async () => (await ringed()).length).toBe(3);

    // Tab away: neither the ring nor the tooltip stays.
    await page.keyboard.press('Tab');
    await expect.poll(async () => (await ringed()).length).toBe(0);
    await expect(tip).toBeHidden();
  });
});

/**
 * T631 (AC-176, AC-090; R63, the user: "Tile ⋯ menu entries"): a whole
 * series, marked from the keyboard as a click on its legend entry marks it:
 * Shift+F10 on the tile, then "Mark series ›" in its marked group, then the
 * series.
 */
test('marks a whole series from the tile’s menu, by the keyboard alone (T631)', async ({
  page,
}) => {
  await page.goto(DASHBOARD);
  // Categories across, split by status: each status a series.
  const tile = page.locator('[data-tile="tile-status"]');
  await expect(tile.getByTestId('chart-canvas')).toBeVisible();
  await tile.focus();
  await page.keyboard.press('Shift+F10');
  const menu = page.getByRole('menu', { name: /^Actions for / });
  await expect(menu.getByRole('menuitem').first()).toBeFocused();
  const markSeries = menu.getByRole('menuitem', { name: /^Mark series/ });
  for (let step = 0; step < 30; step += 1) {
    if (await markSeries.evaluate((element) => element === document.activeElement)) break;
    await page.keyboard.press('ArrowDown');
  }
  await expect(markSeries).toBeFocused();
  await page.keyboard.press('ArrowRight');
  const series = page.getByRole('menu', { name: /^Mark series/ });
  const first = series.getByRole('menuitem').first();
  await expect(first).toBeFocused();
  const value = ((await first.textContent()) ?? '').trim();
  await page.keyboard.press('Enter');
  await expect(page.locator('.mark-chip')).toHaveCount(1);
  await expect(page.locator('.mark-chip')).toContainText(value);

  /**
   * T634 (AC-176; R64, the user: "Ctrl+Enter adds"): a second series added
   * from the same menu with Ctrl+Enter, as a Ctrl-click on its legend entry
   * adds it, the first kept.
   */
  await tile.focus();
  await page.keyboard.press('Shift+F10');
  await expect(menu.getByRole('menuitem').first()).toBeFocused();
  for (let step = 0; step < 30; step += 1) {
    if (await markSeries.evaluate((element) => element === document.activeElement)) break;
    await page.keyboard.press('ArrowDown');
  }
  await page.keyboard.press('ArrowRight');
  await expect(series.getByRole('menuitem').first()).toBeFocused();
  await page.keyboard.press('ArrowDown');
  const second = ((await series.getByRole('menuitem').nth(1).textContent()) ?? '').trim();
  await page.keyboard.press('ControlOrMeta+Enter');
  await expect(tile.getByTestId('mark-badge')).toContainText('2 marked');
  await expect(page.locator('.mark-chip')).toContainText(value);
  await expect(page.locator('.mark-chip')).toContainText(second);

  /**
   * T638 (AC-176; the coordinator's call E (a)): Ctrl+Enter on a series already
   * marked takes it off, mirroring the Ctrl-click toggle, the other kept; and
   * its entry says so.
   */
  await tile.focus();
  await page.keyboard.press('Shift+F10');
  await expect(menu.getByRole('menuitem').first()).toBeFocused();
  for (let step = 0; step < 30; step += 1) {
    if (await markSeries.evaluate((element) => element === document.activeElement)) break;
    await page.keyboard.press('ArrowDown');
  }
  await page.keyboard.press('ArrowRight');
  await expect(series.getByRole('menuitem').first()).toBeFocused();
  await page.keyboard.press('ArrowDown');
  const again = series.getByRole('menuitem').nth(1);
  await expect(again).toBeFocused();
  await expect(again).toHaveAccessibleDescription('Ctrl/⌘+Enter takes it off the marking.');
  await page.keyboard.press('ControlOrMeta+Enter');
  await expect(tile.getByTestId('mark-badge')).toContainText('1 marked');
  await expect(page.locator('.mark-chip')).toContainText(value);
  await expect(page.locator('.mark-chip')).not.toContainText(second);
});

/**
 * The model's code editor is no keyboard trap: CodeMirror leaves Tab alone
 * unless told to indent with it (research/code-editor.md), and ours is not —
 * so Tab moves on, as from any field, and needs no Escape-then-Tab hint.
 */
test('Tab leaves the model’s code editor, as from any field', async ({ page }) => {
  await page.goto('/model/files/cubes%2Forders.yml');
  const code = page.getByRole('textbox', { name: 'cubes/orders.yml, as YAML' });
  await code.click();
  await expect(code).toBeFocused();
  const before = await code.evaluate((element) => element.textContent);
  /**
   * Backwards, onto the control before it: forwards, the editor is the last
   * thing on the page, and Tab from it goes to the browser's own controls —
   * where Firefox still reports the editor as the page's active element.
   */
  await page.keyboard.press('Shift+Tab');
  await expect(code).not.toBeFocused();
  // On a control of the page's, outside the editor.
  expect(
    await page.evaluate(
      () =>
        document.activeElement !== document.body &&
        document.activeElement?.closest('.cm-editor') === null,
    ),
  ).toBe(true);
  // Nor was a tab typed into the file.
  expect(await code.evaluate((element) => element.textContent)).toBe(before);
});
