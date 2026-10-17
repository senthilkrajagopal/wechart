import { expect, test, type APIRequestContext, type Locator, type Page } from '@playwright/test';

import { IN_MY_WORKSPACE, newInMyWorkspace, seedDashboardCopy, sharedIn } from './workspace';

/**
 * The seeded dashboard where a test edits it or opens its settings: the
 * single user's copy in My workspace, the seeded one being shared (T359,
 * AC-254). Asked once in a worker.
 */
let seedCopy: Promise<string> | undefined;
const editableSeed = (): Promise<string> => (seedCopy ??= seedDashboardCopy());

/**
 * AC-187: THE SYSTEM SHALL draw the app bar, workspace navigation, buttons and
 * inputs, the dashboard header and page tabs, the filter bar, tiles, and the
 * edit sidebar with the component styles of the design prototype the user
 * approved (`docs/design/prototype/index.html`), in the tokens of
 * direction.md §3–5.
 * Fails when: one of those components' computed height, padding, border
 * width or radius, font size or weight, or colour token differs from the
 * prototype's rule for the same component.
 *
 * Each expectation cites the prototype rule it comes from. Colours are
 * compared as tokens — each resolved through a probe element in the page —
 * never as hex values, so a theme's token values can change without this
 * suite restating them.
 */

/** A token as the page computes it: the colour an element painted with it gets. */
async function token(page: Page, name: string, property: 'color' | 'background-color' = 'color') {
  return page.evaluate(
    ([tokenName, prop]) => {
      const probe = document.createElement('span');
      probe.style.setProperty(prop, `var(--wc-${tokenName})`);
      document.body.append(probe);
      const value = getComputedStyle(probe).getPropertyValue(prop);
      probe.remove();
      return value;
    },
    [name, property] as const,
  );
}

async function style(locator: Locator, ...properties: string[]) {
  return locator.evaluate(
    (element, props) =>
      Object.fromEntries(
        props.map((prop) => [prop, getComputedStyle(element).getPropertyValue(prop)]),
      ),
    properties,
  );
}

test.describe('T202: the app bar, workspace navigation, buttons and inputs', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/explore');
    await expect(page.getByTestId('explore-contents')).toBeVisible();
  });

  test('the app bar: 48 px, surface, a subtle rule beneath, and the "we" mark', async ({
    page,
  }) => {
    // .topbar { … background: var(--bg-surface); border-bottom: 1px solid var(--border-subtle) }
    // .app { grid-template-rows: 48px 1fr }
    const bar = page.getByRole('banner');
    expect(
      await style(bar, 'height', 'background-color', 'border-bottom-width', 'border-bottom-color'),
    ).toEqual({
      height: '48px',
      'background-color': await token(page, 'bg-surface'),
      'border-bottom-width': '1px',
      'border-bottom-color': await token(page, 'border-subtle'),
    });

    // .brand-mark { width: 22px; height: 22px; border-radius: 5px; background: var(--accent);
    //               color: var(--text-on-accent); font-size: 12px; font-weight: 600 }
    const mark = bar.getByTestId('brand-mark');
    await expect(mark).toHaveText('we');
    expect(
      await style(
        mark,
        'width',
        'height',
        'border-radius',
        'background-color',
        'color',
        'font-size',
        'font-weight',
      ),
    ).toEqual({
      width: '22px',
      height: '22px',
      'border-radius': '5px',
      'background-color': await token(page, 'accent'),
      color: await token(page, 'text-on-accent'),
      'font-size': '12px',
      'font-weight': '600',
    });
  });

  test('the workspace navigation: the current one underlined in the accent, the rest secondary', async ({
    page,
  }) => {
    // .wsnav button { color: var(--text-secondary); border-bottom: 2px solid transparent; padding: 0 12px; height: 100% }
    // .wsnav button[aria-current="page"] { color: var(--text-primary); border-bottom-color: var(--accent); font-weight: 600 }
    const nav = page.getByRole('navigation', { name: 'Workspaces' });
    const current = nav.getByRole('link', { name: 'Explore' });
    // One of the rest: the switcher lists no Model (AC-001; T331).
    const other = nav.getByRole('link', { name: 'Jobs' });
    expect(
      await style(
        current,
        'color',
        'border-bottom-width',
        'border-bottom-color',
        'font-weight',
        'height',
        'padding-left',
      ),
    ).toEqual({
      color: await token(page, 'text-primary'),
      'border-bottom-width': '2px',
      'border-bottom-color': await token(page, 'accent'),
      'font-weight': '600',
      // Full height inside the 48 px bar's 1 px bottom rule: 47 px, as
      // measured on the prototype itself.
      height: '47px',
      'padding-left': '12px',
    });
    expect(await style(other, 'color', 'border-bottom-color', 'background-color')).toEqual({
      color: await token(page, 'text-secondary'),
      'border-bottom-color': 'rgba(0, 0, 0, 0)',
      'background-color': 'rgba(0, 0, 0, 0)',
    });
  });

  test('the theme control: a 32 px icon button', async ({ page }) => {
    // .iconbtn { width: 32px; height: 32px; border: 1px solid transparent; border-radius: 6px;
    //            background: none; color: var(--text-secondary) }
    const toggle = page.getByRole('banner').getByRole('button', { name: /theme/i });
    await expect(toggle.locator('svg')).toHaveCount(1);
    expect(
      await style(
        toggle,
        'width',
        'height',
        'border-radius',
        'background-color',
        'color',
        'border-top-color',
      ),
    ).toEqual({
      width: '32px',
      height: '32px',
      'border-radius': '6px',
      'background-color': 'rgba(0, 0, 0, 0)',
      color: await token(page, 'text-secondary'),
      'border-top-color': 'rgba(0, 0, 0, 0)',
    });
  });

  test('buttons, the primary button and inputs', async ({ page }) => {
    // .btn { height: 32px; padding: 0 12px; border-radius: 6px; border: 1px solid var(--border-strong);
    //        background: var(--bg-surface) }
    // A contents row's rename: its Cancel is a plain button; its name field
    // and Save, the input and primary button. (The old create buttons and
    // their form went with the prototype's one New menu, AC-192; the row's
    // Rename, into its ⋯ menu, AC-193.)
    const row = page.getByTestId('explore-contents').getByRole('row').nth(1);
    await row.getByRole('button', { name: /^Actions for / }).click();
    await page.getByRole('menuitem', { name: 'Rename', exact: true }).click();
    const plain = row.getByRole('button', { name: 'Cancel', exact: true });
    expect(
      await style(
        plain,
        'height',
        'padding-left',
        'border-radius',
        'border-top-width',
        'border-top-color',
        'background-color',
      ),
    ).toEqual({
      height: '32px',
      'padding-left': '12px',
      'border-radius': '6px',
      'border-top-width': '1px',
      'border-top-color': await token(page, 'border-strong'),
      'background-color': await token(page, 'bg-surface'),
    });

    // .input { height: 32px; border: 1px solid var(--border-strong); border-radius: 4px;
    //          background: var(--bg-surface); padding: 0 8px }
    const input = row.getByLabel(/^New name for /);
    expect(
      await style(
        input,
        'height',
        'border-top-width',
        'border-top-color',
        'border-radius',
        'background-color',
        'padding-left',
      ),
    ).toEqual({
      height: '32px',
      'border-top-width': '1px',
      'border-top-color': await token(page, 'border-strong'),
      'border-radius': '4px',
      'background-color': await token(page, 'bg-surface'),
      'padding-left': '8px',
    });

    // .btn.primary { background: var(--accent); border-color: var(--accent); color: var(--text-on-accent); font-weight: 600 }
    // The row's own Save — the rename is put away unsaved (nothing is typed).
    const primary = row.getByRole('button', { name: 'Save', exact: true });
    expect(
      await style(
        primary,
        'background-color',
        'border-top-color',
        'color',
        'font-weight',
        'height',
      ),
    ).toEqual({
      'background-color': await token(page, 'accent'),
      'border-top-color': await token(page, 'accent'),
      color: await token(page, 'text-on-accent'),
      'font-weight': '600',
      height: '32px',
    });
  });
});

/** A tile's action button as the prototype draws it, and how to read one. */
const TILE_ACTION = {
  width: '26px',
  height: '26px',
  'border-radius': '6px',
  'border-top-width': '1px',
  'border-top-color': 'rgba(0, 0, 0, 0)',
};
const tileActionStyle = (action: Locator) =>
  style(action, 'width', 'height', 'border-radius', 'border-top-width', 'border-top-color');

test.describe('T203: the dashboard header, page tabs and tiles', () => {
  test.beforeEach(async ({ page }) => {
    // The copy, where Edit is offered: the shared one offers Edit in my workspace.
    await page.goto(await editableSeed());
    await expect(
      page.getByRole('heading', { name: 'Company dashboard 01', level: 1 }),
    ).toBeVisible();
  });

  test('the header: a 24 px title, a primary Edit with its pencil, and the gear as an icon button', async ({
    page,
  }) => {
    // .dash-head h1 { font-size: 24px; line-height: 32px; font-weight: 600 }
    const title = page.getByRole('heading', { name: 'Company dashboard 01', level: 1 });
    expect(await style(title, 'font-size', 'line-height', 'font-weight')).toEqual({
      'font-size': '24px',
      'line-height': '32px',
      'font-weight': '600',
    });

    // <button class="iconbtn" data-settings aria-label="Dashboard settings">${GEAR}</button>,
    // the header's last control: on the copy, the dashboard the single user
    // may change (T359, AC-254).
    const gear = page.getByRole('button', { name: 'Dashboard settings' });
    await expect(gear.locator('svg')).toHaveCount(1);
    expect(await style(gear, 'width', 'height', 'border-radius', 'background-color')).toEqual({
      width: '32px',
      height: '32px',
      'border-radius': '6px',
      'background-color': 'rgba(0, 0, 0, 0)',
    });
    // Followed only by the ⋯ that holds Export… (T511; design 13, pin 1): the
    // header's last two controls, above the line saying where it is from
    // (design 04, state F).
    const last = await page.locator('.dashboard__header').evaluate((header) =>
      [...header.children]
        .map(
          (child) =>
            child.getAttribute('aria-label') ??
            child.querySelector('[aria-label]')?.getAttribute('aria-label') ??
            null,
        )
        .filter((label) => label !== null)
        .slice(-2),
    );
    expect(last).toEqual(['Dashboard settings', 'More']);

    // <button class="btn primary" data-edit>${PENCIL} Edit</button>: on the
    // shared one, the way to change it is that primary with its pencil, "Edit
    // in my workspace", or "Open my copy" once there is one (design 04,
    // state E; T359, AC-254).
    await page.goto('/explore/dashboards/seed-root-dashboard-1');
    const edit = page
      .locator('.dashboard__header')
      .getByRole('button', { name: /^(Edit in my workspace|Open my copy)$/ });
    await expect(edit.locator('svg')).toHaveCount(1);
    expect(await style(edit, 'background-color', 'color', 'height', 'border-radius')).toEqual({
      'background-color': await token(page, 'accent'),
      color: await token(page, 'text-on-accent'),
      height: '32px',
      'border-radius': '6px',
    });
  });

  test('page tabs: underlined in the accent when selected, on a subtle rule', async ({ page }) => {
    // .dash-tabs { gap: 4px; border-bottom: 1px solid var(--border-subtle) }
    // .dash-tabs button { border: 0; background: none; height: 36px; padding: 0 12px; font-weight: 600;
    //                     font-size: 13px; color: var(--text-secondary); border-bottom: 2px solid transparent }
    // .dash-tabs button[aria-selected="true"] { color: var(--text-primary); border-bottom-color: var(--accent) }
    const tabs = page.getByRole('tablist', { name: 'Pages' });
    expect(await style(tabs, 'border-bottom-width', 'border-bottom-color')).toEqual({
      'border-bottom-width': '1px',
      'border-bottom-color': await token(page, 'border-subtle'),
    });
    const selected = tabs.getByRole('tab', { name: 'Overview' });
    const other = tabs.getByRole('tab', { name: 'Appendix' });
    expect(
      await style(
        selected,
        'height',
        'padding-left',
        'font-size',
        'font-weight',
        'color',
        'border-bottom-width',
        'border-bottom-color',
        'border-top-width',
        'background-color',
      ),
    ).toEqual({
      height: '36px',
      'padding-left': '12px',
      'font-size': '13px',
      'font-weight': '600',
      color: await token(page, 'text-primary'),
      'border-bottom-width': '2px',
      'border-bottom-color': await token(page, 'accent'),
      'border-top-width': '0px',
      'background-color': 'rgba(0, 0, 0, 0)',
    });
    expect(await style(other, 'color', 'border-bottom-color')).toEqual({
      color: await token(page, 'text-secondary'),
      'border-bottom-color': 'rgba(0, 0, 0, 0)',
    });
  });

  test('a chart tile: the prototype’s box, headed by its chart’s title', async ({ page }) => {
    // .tile { background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: 6px; padding: 16px }
    const tile = page.locator('[data-tile="tile-status"]');
    expect(
      await style(
        tile,
        'background-color',
        'border-top-width',
        'border-top-color',
        'border-radius',
        'padding-left',
      ),
    ).toEqual({
      'background-color': await token(page, 'bg-surface'),
      'border-top-width': '1px',
      'border-top-color': await token(page, 'border-subtle'),
      'border-radius': '6px',
      'padding-left': '16px',
    });

    // .tile-head h3 { font-size: 14px; line-height: 20px; font-weight: 600 }
    const heading = tile.getByRole('heading', { name: 'Orders by category and status', level: 3 });
    expect(await style(heading, 'font-size', 'line-height', 'font-weight', 'color')).toEqual({
      'font-size': '14px',
      'line-height': '20px',
      'font-weight': '600',
      color: await token(page, 'text-primary'),
    });

    // The table view: ⋯'s "View as table", no button in the head (T681's
    // follow-up; R76 dashboard-Q1; design 04 pin 5).
    await expect(tile.locator('.tile-head').first().getByRole('button')).toHaveCount(0);
    await tile.getByRole('button', { name: /^Actions for / }).click();
    await expect(
      tile
        .getByRole('menu', { name: /^Actions for / })
        .getByRole('menuitem', { name: 'View as table', exact: true }),
    ).toHaveCount(1);
    await page.keyboard.press('Escape');

    // .tile-actions .iconbtn { width: 26px; height: 26px } over .iconbtn
    // { border: 1px solid transparent; border-radius: 6px; background: none }
    // — the pencil here, the ⋯ menu while editing (T205's review).
    expect(await tileActionStyle(page.getByTestId('edit-chart-tile-status'))).toEqual(TILE_ACTION);
  });

  test('the header, the page tabs and the page are padded as the prototype’s (T205’s review)', async ({
    page,
  }) => {
    // .dash-head { padding: 12px 24px 0 }
    expect(await style(page.locator('.dashboard__header'), 'padding-top', 'padding-left')).toEqual({
      'padding-top': '12px',
      'padding-left': '24px',
    });
    // .dash-tabs { padding: 8px 24px 0 }
    expect(
      await style(page.getByRole('tablist', { name: 'Pages' }), 'padding-top', 'padding-left'),
    ).toEqual({ 'padding-top': '8px', 'padding-left': '24px' });
    // .dgrid { padding: 16px 24px 40px }
    expect(await style(page.getByTestId('dashboard-page'), 'padding-top', 'padding-left')).toEqual({
      'padding-top': '16px',
      'padding-left': '24px',
    });
  });

  test('editing: Save is the primary button, Undo and Redo icon buttons, the sidebar docked (T205’s review)', async ({
    page,
  }) => {
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    const bar = page.getByRole('toolbar', { name: 'Dashboard editing' });

    // <button class="btn primary" data-save>Save</button>
    expect(
      await style(bar.getByRole('button', { name: 'Save' }), 'background-color', 'color'),
    ).toEqual({
      'background-color': await token(page, 'accent'),
      color: await token(page, 'text-on-accent'),
    });
    // <button class="iconbtn" data-undo aria-label="Undo">↶</button>, and Redo the same
    for (const name of ['Undo', 'Redo']) {
      expect(
        await style(
          bar.getByRole('button', { name }),
          'width',
          'height',
          'border-top-color',
          'background-color',
        ),
      ).toEqual({
        width: '32px',
        height: '32px',
        'border-top-color': 'rgba(0, 0, 0, 0)',
        'background-color': 'rgba(0, 0, 0, 0)',
      });
    }

    // Page tabs are deleted from Properties, as dashboard.js has it, not from
    // a row of × under the tabs.
    await expect(page.getByRole('button', { name: /^Delete page / })).toHaveCount(0);
    const sidebar = page.getByRole('complementary', { name: 'Edit sidebar' });
    await sidebar.getByRole('tab', { name: 'Properties' }).click();
    await expect(sidebar.getByRole('heading', { name: 'Page tabs', level: 3 })).toBeVisible();
    await expect(sidebar.getByRole('button', { name: 'Delete page Appendix' })).toBeVisible();

    // The tile's ⋯ menu, which editing brings: the same 26 px icon button.
    expect(
      await tileActionStyle(page.locator('[data-tile="tile-status"] .tile-menu > button')),
    ).toEqual(TILE_ACTION);

    // .pane.right { border-left: 1px solid var(--border-subtle) } — and no other border or radius
    expect(
      await style(
        page.getByRole('complementary', { name: 'Edit sidebar' }),
        'border-left-width',
        'border-left-color',
        'border-top-width',
        'border-radius',
      ),
    ).toEqual({
      'border-left-width': '1px',
      'border-left-color': await token(page, 'border-subtle'),
      'border-top-width': '0px',
      'border-radius': '0px',
    });
  });
});

test.describe('T204: the filter bar', () => {
  test('each filter is the prototype’s pill, its control opening from it', async ({
    page,
    request,
  }) => {
    const api = 'http://localhost:4100/api';
    const title = `Pills ${String(Date.now())}`;
    const { id } = (await (
      await request.post(`${api}/documents`, {
        data: { kind: 'dashboard', title, ...IN_MY_WORKSPACE },
      })
    ).json()) as { id: string };
    await request.put(`${api}/documents/dashboard/${id}`, {
      data: {
        version: 1,
        body: {
          schemaVersion: 1,
          title,
          ...IN_MY_WORKSPACE,
          owner: 'admin',
          settings: { width: 'fixed' },
          pages: [
            { id: 'only', title: 'Only', items: [] },
            { id: 'second', title: 'Second', items: [] },
          ],
          filters: [
            { id: 'f-status', widget: 'checkbox', member: 'orders.status' },
            { id: 'f-ordered', widget: 'dateRange', member: 'orders.ordered_at' },
          ],
        },
      },
    });
    await page.goto(`/explore/dashboards/${id}`);
    await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible();

    // .filterbar { padding: 10px 24px; background: var(--bg-page); border-bottom: 1px solid var(--border-subtle) }
    const bar = page.getByRole('region', { name: 'Filters' });
    expect(
      await style(
        bar,
        'background-color',
        'border-bottom-width',
        'border-bottom-color',
        'padding-top',
        'padding-left',
      ),
    ).toEqual({
      'background-color': await token(page, 'bg-page'),
      'border-bottom-width': '1px',
      'border-bottom-color': await token(page, 'border-subtle'),
      'padding-top': '10px',
      'padding-left': '24px',
    });
    // Under the page tabs, as dashboard.js draws .dash-tabs and then .filterbar.
    const tabsFirst = await page.evaluate(() => {
      const tabs = document.querySelector('[role="tablist"][aria-label="Pages"]');
      const filters = document.querySelector('section[aria-label="Filters"]');
      return tabs !== null && filters !== null
        ? Boolean(tabs.compareDocumentPosition(filters) & Node.DOCUMENT_POSITION_FOLLOWING)
        : null;
    });
    expect(tabsFirst).toBe(true);

    // .fw { height: 32px; border: 1px solid var(--border-strong); border-radius: 6px;
    //       background: var(--bg-surface); padding: 0 6px 0 10px; font-size: 13px }
    const pill = bar.getByRole('group', { name: 'Checkbox list filter 1' });
    expect(
      await style(
        pill,
        'height',
        'border-top-width',
        'border-top-color',
        'border-radius',
        'background-color',
        'padding-left',
        'font-size',
      ),
    ).toEqual({
      height: '32px',
      'border-top-width': '1px',
      'border-top-color': await token(page, 'border-strong'),
      'border-radius': '6px',
      'background-color': await token(page, 'bg-surface'),
      'padding-left': '10px',
      'font-size': '13px',
    });

    // .fw .scope { font-size: 12px; font-weight: 600; color: var(--text-muted);
    //              border: 1px solid var(--border-subtle); border-radius: 3px; padding: 0 4px }
    const scope = pill.getByTestId('scope-badge');
    await expect(scope).toHaveText('Dashboard');
    expect(
      await style(
        scope,
        'font-size',
        'font-weight',
        'color',
        'border-top-width',
        'border-top-color',
        'border-radius',
      ),
    ).toEqual({
      'font-size': '12px',
      'font-weight': '600',
      color: await token(page, 'text-muted'),
      'border-top-width': '1px',
      'border-top-color': await token(page, 'border-subtle'),
      'border-radius': '3px',
    });

    // The field and its value, in the pill; its control in a popover that
    // opens from it and closes with Escape.
    const summary = pill.getByRole('button', { name: 'Orders Status: All' });
    await expect(summary).toHaveAttribute('aria-expanded', 'false');
    await expect(pill.getByRole('checkbox')).toHaveCount(0);
    await summary.click();
    await expect(summary).toHaveAttribute('aria-expanded', 'true');
    await pill.getByRole('checkbox', { name: 'shipped' }).check();
    await expect(pill.getByRole('button', { name: 'Orders Status: shipped' })).toBeVisible();
    // Focus in the popover, as a keyboard user has it — Safari does not
    // focus a checkbox on click.
    await pill.getByRole('checkbox', { name: 'shipped' }).focus();
    await page.keyboard.press('Escape');
    await expect(pill.getByRole('checkbox')).toHaveCount(0);
    // Escape hands focus back to the pill (T204's review).
    await expect(pill.getByRole('button', { name: 'Orders Status: shipped' })).toBeFocused();

    // .select { height: 32px; border: 1px solid var(--border-strong); border-radius: 4px;
    //           background: var(--bg-surface) } — the date filter's presets.
    const dates = bar.getByRole('group', { name: 'Date range filter 2' });
    await dates.locator('button[aria-expanded]').click();
    /**
     * The radius a select given the prototype's 4 px computes in this browser.
     * WebKit's native select reports its own (5 px, measured) whatever is
     * declared — as it keeps its own closed font size (direction.md §3) — and
     * would do the same to the prototype's select, so the rule is compared,
     * not WebKit's rendering of it.
     */
    const prototypeRadius = await page.evaluate(() => {
      const probe = document.createElement('select');
      probe.style.borderRadius = '4px';
      document.body.append(probe);
      const radius = getComputedStyle(probe).borderRadius;
      probe.remove();
      return radius;
    });
    expect(
      await style(
        dates.getByLabel('Orders Ordered at', { exact: true }),
        'height',
        'border-top-width',
        'border-top-color',
        'border-radius',
        'background-color',
      ),
    ).toEqual({
      height: '32px',
      'border-top-width': '1px',
      'border-top-color': await token(page, 'border-strong'),
      'border-radius': prototypeRadius,
      'background-color': await token(page, 'bg-surface'),
    });
  });
});

test.describe('T205: the edit sidebar', () => {
  test('its tabs, Add palette and Properties are the prototype’s', async ({ page, request }) => {
    const api = 'http://localhost:4100/api';
    const title = `Sidebar ${String(Date.now())}`;
    const { id } = (await (
      await request.post(`${api}/documents`, {
        data: { kind: 'dashboard', title, ...IN_MY_WORKSPACE },
      })
    ).json()) as { id: string };
    await request.put(`${api}/documents/dashboard/${id}`, {
      data: {
        version: 1,
        body: {
          schemaVersion: 1,
          title,
          ...IN_MY_WORKSPACE,
          owner: 'admin',
          settings: { width: 'fixed' },
          pages: [{ id: 'only', title: 'Only', items: [] }],
        },
      },
    });
    await page.goto(`/explore/dashboards/${id}`);
    await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible();
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    const sidebar = page.getByRole('complementary', { name: 'Edit sidebar' });

    // .tabs { border-bottom: 1px solid var(--border-subtle); background: var(--bg-surface) }
    expect(
      await style(
        sidebar.getByRole('tablist'),
        'border-bottom-width',
        'border-bottom-color',
        'background-color',
      ),
    ).toEqual({
      'border-bottom-width': '1px',
      'border-bottom-color': await token(page, 'border-subtle'),
      'background-color': await token(page, 'bg-surface'),
    });
    // .tabs button { height: 36px; padding: 0 10px; font-size: 12px; font-weight: 600;
    //                color: var(--text-secondary); border-bottom: 2px solid transparent }
    // .tabs button[aria-selected='true'] { color: var(--accent); border-bottom-color: var(--accent) }
    expect(
      await style(
        sidebar.getByRole('tab', { name: 'Add' }),
        'height',
        'padding-left',
        'font-size',
        'font-weight',
        'color',
        'border-bottom-width',
        'border-bottom-color',
      ),
    ).toEqual({
      height: '36px',
      'padding-left': '10px',
      'font-size': '12px',
      'font-weight': '600',
      color: await token(page, 'accent'),
      'border-bottom-width': '2px',
      'border-bottom-color': await token(page, 'accent'),
    });
    expect(await style(sidebar.getByRole('tab', { name: 'Outline' }), 'color')).toEqual({
      color: await token(page, 'text-secondary'),
    });

    // .section { padding: 12px; border-bottom: 1px solid var(--border-subtle) }
    // .section > h3 { font-size: 12px; line-height: 16px; font-weight: 600;
    //                 color: var(--text-secondary); text-transform: uppercase }
    const heading = async (name: string) =>
      style(
        sidebar.getByRole('heading', { name, level: 3 }),
        'font-size',
        'line-height',
        'font-weight',
        'color',
        'text-transform',
      );
    const sectionHeading = {
      'font-size': '12px',
      'line-height': '16px',
      'font-weight': '600',
      color: await token(page, 'text-secondary'),
      'text-transform': 'uppercase',
    };
    expect(await heading('Section templates')).toEqual(sectionHeading);
    expect(
      await style(
        sidebar.getByRole('heading', { name: 'Section templates', level: 3 }).locator('..'),
        'padding-top',
        'padding-left',
        'border-bottom-width',
        'border-bottom-color',
      ),
    ).toEqual({
      'padding-top': '12px',
      'padding-left': '12px',
      'border-bottom-width': '1px',
      'border-bottom-color': await token(page, 'border-subtle'),
    });

    // The palette's entries (dashboard.js's .el): a 1 px subtle border, radius 6,
    // on the surface, the name at 600 and the hint in 12 px muted ink.
    const image = sidebar.getByTestId('add-image');
    expect(
      await style(
        image,
        'border-top-width',
        'border-top-color',
        'border-radius',
        'background-color',
      ),
    ).toEqual({
      'border-top-width': '1px',
      'border-top-color': await token(page, 'border-subtle'),
      'border-radius': '6px',
      'background-color': await token(page, 'bg-surface'),
    });
    expect(await style(image.locator('.add-panel__hint'), 'font-size', 'color')).toEqual({
      'font-size': '12px',
      color: await token(page, 'text-muted'),
    });

    // Properties: a section headed by the tile's kind; each field's label
    // (.field > label: 12/16 600, secondary) over its 28 px input.
    await image.click();
    await page
      .locator('[data-tile]')
      .filter({ has: page.locator('.image-tile') })
      .click();
    await sidebar.getByRole('tab', { name: 'Properties' }).click();
    expect(await heading('Image')).toEqual(sectionHeading);
    expect(
      await style(
        sidebar.locator('label', { hasText: 'Alternative text' }),
        'font-size',
        'line-height',
        'font-weight',
        'color',
      ),
    ).toEqual({
      'font-size': '12px',
      'line-height': '16px',
      'font-weight': '600',
      color: await token(page, 'text-secondary'),
    });
    // .input.sm { height: 28px; font-size: 12px } — dashboard.js draws every
    // Properties control small. This said 32 px, against the prototype, until
    // T205's review.
    expect(await style(sidebar.getByLabel('Alternative text'), 'height', 'font-size')).toEqual({
      height: '28px',
      'font-size': '12px',
    });
  });
});

/**
 * T244: Explore as the prototype's browse() lays it out (recheck-shell-explore
 * F6–F8, F14, F17, F20, F22–F25, N2–N5, N13; AC-187 mismatches 5–23; AC-231's
 * 34 px rows). The rules cited are index.html's.
 */
test.describe('T244: Explore’s tree, header and table', () => {
  const api = 'http://localhost:4100/api';
  /**
   * A folder, made where it is asked for; a dashboard or chart, put in its
   * shared folder as the single user puts one there: through My workspace and
   * a proposal they approve (T359, AC-254).
   */
  const make = async (
    request: APIRequestContext,
    kind: 'folder' | 'dashboard' | 'chart',
    folderId: string,
    title: string,
    body: Record<string, unknown> = {},
  ) => {
    if (kind !== 'folder') return sharedIn(request, kind, folderId, { ...body, title });
    const made = await request.post(`${api}/documents`, { data: { kind, title, folderId } });
    expect(made.status()).toBe(201);
    return ((await made.json()) as { id: string }).id;
  };
  const folders = (page: Page) => page.getByRole('complementary', { name: 'Folders' });
  const contents = (page: Page) => page.getByTestId('explore-contents');

  test('the Folders pane is docked: 260 px on the surface, under a 44 px head and its rule', async ({
    page,
  }) => {
    await page.goto('/explore?folder=seed-folder-0');
    const pane = folders(page);
    const finance = pane.getByRole('button', { name: 'Finance', exact: true });
    await expect(finance).toBeVisible();

    // .browser { grid-template-columns: 260px … } at the window's edge, from
    // the app bar to the window's foot.
    const bar = await page.getByRole('banner').boundingBox();
    const box = await pane.boundingBox();
    const below = (bar?.y ?? 0) + (bar?.height ?? 0);
    expect(box?.x).toBe(0);
    expect(box?.y).toBeCloseTo(below, 0);
    expect(box?.width).toBe(260);
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeCloseTo(page.viewportSize()?.height ?? 0, 0);
    // .pane { background: var(--bg-surface) } .pane.left { border-right: 1px solid var(--border-subtle) }
    expect(
      await style(pane, 'background-color', 'border-right-width', 'border-right-color'),
    ).toEqual({
      'background-color': await token(page, 'bg-surface', 'background-color'),
      'border-right-width': '1px',
      'border-right-color': await token(page, 'border-subtle'),
    });
    // .pane-head { min-height: 44px; padding: 8px 12px; border-bottom: 1px solid var(--border-subtle) }
    const head = pane.getByRole('heading', { name: 'Folders' }).locator('..');
    expect(
      await style(
        head,
        'height',
        'padding-top',
        'padding-right',
        'padding-bottom',
        'padding-left',
        'border-bottom-width',
        'border-bottom-color',
      ),
    ).toEqual({
      height: '44px',
      'padding-top': '8px',
      'padding-right': '12px',
      'padding-bottom': '8px',
      'padding-left': '12px',
      'border-bottom-width': '1px',
      'border-bottom-color': await token(page, 'border-subtle'),
    });

    // .file { height: 28px; padding: 0 12px 0 (12 + depth × 14)px; font-size: 12px },
    // full width and square (F8, mismatches 10–11).
    const shared = pane.getByRole('button', { name: 'Shared', exact: true });
    expect(
      await style(shared, 'height', 'font-size', 'padding-left', 'padding-right', 'border-radius'),
    ).toEqual({
      height: '28px',
      'font-size': '12px',
      'padding-left': '12px',
      'padding-right': '12px',
      'border-radius': '0px',
    });
    expect(await style(finance, 'padding-left')).toEqual({ 'padding-left': '26px' });
    const [rowWidth, treeWidth] = await finance.evaluate((element) => [
      element.getBoundingClientRect().width,
      element.closest('[role="tree"]')?.clientWidth ?? 0,
    ]);
    expect(rowWidth).toBe(treeWidth);

    // .file[aria-current='true'] { background: var(--accent-soft); color: var(--accent); font-weight: 600 }
    expect(await style(finance, 'background-color', 'color', 'font-weight')).toEqual({
      'background-color': await token(page, 'bg-accent-soft', 'background-color'),
      color: await token(page, 'accent'),
      'font-weight': '600',
    });
    // The count: .xs.muted (mismatch 13) — but secondary on the selection's
    // tint, where muted is 4.28:1 in dark, below AA (direction rule 2).
    const marketing = pane.getByRole('button', { name: 'Marketing', exact: true });
    expect(await style(marketing.locator('.folder-tree__count'), 'color', 'font-size')).toEqual({
      color: await token(page, 'text-muted'),
      'font-size': '12px',
    });
    // And in the selected row's weight, as the prototype's count inherits it.
    expect(await style(finance.locator('.folder-tree__count'), 'color', 'font-weight')).toEqual({
      color: await token(page, 'text-secondary'),
      'font-weight': '600',
    });
    // Each row's chip: .itemicon.ic-folder at 18 px — ◉ for My workspace, ▣
    // for a folder (F7, mismatch 14).
    const chip = (row: Locator) => row.locator('.itemicon');
    const chipStyle = {
      width: '18px',
      height: '18px',
      'border-radius': '5px',
      'background-color': await token(page, 'bg-subtle', 'background-color'),
      color: await token(page, 'text-secondary'),
    };
    expect(
      await style(chip(finance), 'width', 'height', 'border-radius', 'background-color', 'color'),
    ).toEqual(chipStyle);
    const glyph = (row: Locator) =>
      chip(row).evaluate((element) => getComputedStyle(element, '::before').content);
    expect(await glyph(finance)).toBe('"▣"');
    expect(await glyph(pane.getByRole('button', { name: 'My workspace', exact: true }))).toBe(
      '"◉"',
    );

    // .file:hover { background: var(--bg-hover) } — and nothing else (N13).
    await marketing.hover();
    expect(await style(marketing, 'background-color', 'text-decoration-line')).toEqual({
      'background-color': await token(page, 'bg-hover', 'background-color'),
      'text-decoration-line': 'none',
    });
  });

  test('the header: 24 px crumbs, a 28 × 260 search and a 36 px rename, spaced as design 14 draws them', async ({
    page,
  }) => {
    await page.goto('/explore?folder=seed-folder-0');
    const main = contents(page);
    const nav = main.getByRole('navigation', { name: 'Breadcrumb' });
    const crumb = nav.getByRole('button', { name: 'Finance' });
    await expect(crumb).toBeVisible();
    await expect(main.getByRole('table')).toBeVisible();

    // .crumbs button { padding: 2px 4px; border-radius: 4px } at 12/20 (N5, mismatch 5).
    expect(
      await style(crumb, 'height', 'line-height', 'padding-top', 'padding-left', 'border-radius'),
    ).toEqual({
      height: '24px',
      'line-height': '20px',
      'padding-top': '2px',
      'padding-left': '4px',
      'border-radius': '4px',
    });
    // .input.sm with max-width: 260px (N3, mismatch 6).
    const search = main.getByRole('searchbox', { name: 'Search dashboards and charts' });
    expect(await style(search, 'height', 'width', 'font-size')).toEqual({
      height: '28px',
      width: '260px',
      'font-size': '12px',
    });

    // Design 14's main (screen 1, state A; it supersedes the prototype's
    // .admin-main, R37): `padding: 14px 24px; gap: 8px`. The crumbs 8 px over
    // the head; "Add a description" 8 px under it (H1, E2); the Show row's
    // `margin-top: 4px`, 12 px under what's above it; the card 8 px under the
    // Show row (14:305–309; T741, re-based from T244's 12 px).
    const heading = main.getByRole('heading', { level: 1 });
    const crumbsBox = await nav.boundingBox();
    const headBox = await heading.locator('..').boundingBox();
    const addBox = await main.getByRole('button', { name: /Add a description/ }).boundingBox();
    const showBox = await main.getByRole('radiogroup', { name: 'Show' }).boundingBox();
    const tableBox = await main.getByRole('table').boundingBox();
    const pane = await folders(page).boundingBox();
    const bar = await page.getByRole('banner').boundingBox();
    const below = (lower: typeof headBox, upper: typeof headBox) =>
      (lower?.y ?? 0) - ((upper?.y ?? 0) + (upper?.height ?? 0));
    expect((crumbsBox?.x ?? 0) - ((pane?.x ?? 0) + (pane?.width ?? 0))).toBeCloseTo(24, 0);
    expect(below(crumbsBox, bar)).toBeCloseTo(14, 0);
    expect(below(headBox, crumbsBox)).toBeCloseTo(8, 0);
    expect(below(addBox, headBox)).toBeCloseTo(8, 0);
    expect(below(showBox, addBox)).toBeCloseTo(12, 0);
    expect(below(tableBox, showBox)).toBeCloseTo(8, 0);

    // The description's editor, opened, 8 px under the name too (H2; T741's
    // review: it inherited the text's −4 px), and Cancel leaves it untouched.
    await main.getByRole('button', { name: /Add a description/ }).click();
    const editor = main.locator('.folder-description--editing');
    await expect(editor).toBeVisible();
    expect(below(await editor.boundingBox(), headBox)).toBeCloseTo(8, 0);
    await page.keyboard.press('Escape');
    await expect(editor).toHaveCount(0);

    // In My workspace, its band flush under the top bar and the crumbs 14 px
    // under the band (2026-09-27 design 04:199–200; T741).
    await page.goto('/explore?folder=mine');
    const band = page.getByTestId('explore-contents').locator('.workspace-band');
    await expect(band).toBeVisible();
    const bandBox = await band.boundingBox();
    const mineCrumbs = await page
      .getByTestId('explore-contents')
      .getByRole('navigation', { name: 'Breadcrumb' })
      .boundingBox();
    expect(below(bandBox, bar)).toBeCloseTo(0, 0);
    expect(below(mineCrumbs, bandBox)).toBeCloseTo(14, 0);
    await page.goto('/explore?folder=seed-folder-0');
    await expect(heading).toHaveText('Finance');

    // The folder's name, renamed in place: 36 px at 20/600 (N4, mismatch 7).
    await main.getByRole('button', { name: 'Rename', exact: true }).click();
    const rename = main.getByRole('textbox', { name: 'Folder name' });
    expect(await style(rename, 'height', 'font-size', 'font-weight')).toEqual({
      height: '36px',
      'font-size': '20px',
      'font-weight': '600',
    });
    await rename.press('Escape');
    await expect(heading).toHaveText('Finance');

    // Searching keeps the head row where it was: the crumbs row does not
    // shrink when it becomes a sentence (F25).
    const titleAt = (await heading.boundingBox())?.y;
    await search.fill('dashboard 1');
    await expect(heading).toHaveText('Search');
    expect((await heading.boundingBox())?.y).toBeCloseTo(titleAt ?? 0, 0);
  });

  test('the table: 34 px rows under a 28 px header, 12/600 names beside a 22 px chip, and each column in the prototype’s ink', async ({
    page,
    request,
  }) => {
    const unique = String(Date.now());
    const home = await make(request, 'folder', 'root', `Table ${unique}`);
    const sub = await make(request, 'folder', home, `Sub ${unique}`);
    // A description long enough to wrap, were cells let wrap: .grid-table
    // td { white-space: nowrap } keeps the row at 34 px (T244's review).
    const board = await make(request, 'dashboard', home, `Board ${unique}`, {
      description: `What the board is for. ${'It reads on and on, well past its column. '.repeat(6)}`,
    });
    const chart = await make(request, 'chart', home, `Chart ${unique}`, {
      chart: {
        source: { cube: 'orders' },
        wells: { measures: ['orders.count'], dimensions: ['orders.status'], timeDimensions: [] },
        chartType: 'bar',
      },
    });
    await page.goto(`/explore?folder=${home}`);
    const table = contents(page).getByRole('table');
    const row = (id: string) => table.getByTestId(`item-${id}`);
    await expect(row(chart)).toBeVisible();

    // .grid-table th { height: 28px; padding: 0 8px }; .comfy td { height: 34px }
    // — a dashboard with its description line included (F17, mismatches 15–16).
    const nameHeader = table.getByRole('columnheader', { name: 'Name' });
    expect((await nameHeader.boundingBox())?.height).toBe(28);
    expect(await style(nameHeader, 'padding-top', 'padding-left')).toEqual({
      'padding-top': '0px',
      'padding-left': '8px',
    });
    for (const id of [sub, board, chart]) {
      expect((await row(id).boundingBox())?.height).toBe(34);
      expect(await style(row(id).getByRole('cell').first(), 'padding-top', 'padding-left')).toEqual(
        {
          'padding-top': '0px',
          'padding-left': '8px',
        },
      );
    }
    // Nothing is painted at rest (N12, mismatch 21).
    for (const id of [sub, board, chart])
      expect(await style(row(id).getByRole('cell').first(), 'background-color')).toEqual({
        'background-color': 'rgba(0, 0, 0, 0)',
      });

    // The name: .strong at 12 px (mismatch 17), beside its kind's 22 px chip —
    // .itemicon.ic-folder, .ic-dash, .ic-chart (F20, mismatch 20).
    const chips = {
      [sub]: ['bg-subtle', 'text-secondary', '"▣"'],
      [board]: ['bg-crossfilter-soft', 'crossfilter', '"▦"'],
      [chart]: ['bg-accent-soft', 'accent', '"◢"'],
    } as const;
    for (const [id, [ground, ink, glyph]] of Object.entries(chips)) {
      const name = row(id).getByRole('rowheader').getByRole('button').first();
      expect(await style(name, 'font-size', 'font-weight')).toEqual({
        'font-size': '12px',
        'font-weight': '600',
      });
      const chip = row(id).locator('.itemicon');
      expect(
        await style(chip, 'width', 'height', 'border-radius', 'background-color', 'color'),
      ).toEqual({
        width: '22px',
        height: '22px',
        'border-radius': '5px',
        'background-color': await token(page, ground, 'background-color'),
        color: await token(page, ink),
      });
      expect(await chip.evaluate((element) => getComputedStyle(element, '::before').content)).toBe(
        glyph,
      );
    }

    // Type: .sec (mismatch 18). Built on: a chart's source in the code face,
    // a dashboard's tabs .sec, a folder's items .muted (N2, mismatch 19).
    const cells = (id: string) => row(id).getByRole('cell');
    for (const id of [sub, board, chart])
      expect(await style(cells(id).nth(0), 'color')).toEqual({
        color: await token(page, 'text-secondary'),
      });
    expect((await style(cells(chart).nth(1), 'font-family'))['font-family']).toMatch(
      /^"?IBM Plex Mono"?/,
    );
    expect(await style(cells(board).nth(1), 'color')).toEqual({
      color: await token(page, 'text-secondary'),
    });
    expect(await style(cells(sub).nth(1), 'color')).toEqual({
      color: await token(page, 'text-muted'),
    });
    // A folder row keeps its date and owner, though browse() leaves them
    // blank (F20): AC-017 fails on a blank column for an item that has the
    // value (T244's review).
    // Day first (T477, Q6): "19 Sep", "30 Dec 2025".
    await expect(cells(sub).nth(2)).toHaveText(/^\d{1,2} [A-Z][a-z]{2}( \d{4})?$/);
    await expect(cells(sub).nth(3)).toHaveText('admin');

    // .grid-table tbody tr:hover td { background: var(--bg-hover) } (mismatch 22).
    await cells(board).nth(2).hover();
    expect(await style(cells(board).nth(2), 'background-color')).toEqual({
      'background-color': await token(page, 'bg-hover', 'background-color'),
    });
    // A focused row takes the selection's tint, and its muted text turns
    // secondary on it: muted is 4.28:1 on the dark tint (T243's review).
    await row(board).focus();
    const description = row(board).getByText(/^What the board is for/);
    expect(await style(cells(board).nth(2), 'background-color')).toEqual({
      'background-color': await token(page, 'bg-accent-soft', 'background-color'),
    });
    expect(await style(description, 'color')).toEqual({
      color: await token(page, 'text-secondary'),
    });
    await row(sub).focus();
    expect(await style(cells(sub).nth(1), 'color')).toEqual({
      color: await token(page, 'text-secondary'),
    });

    // The footnote under the card: <p class="xs muted"> (F22, mismatch 23).
    // A shared folder's says where the rest is made (design 04, state C;
    // T331), with sign-in off too (T359, AC-254).
    const note = contents(page).getByText(
      'To add a dashboard, chart, model or data source here, create it in My workspace with this folder as its target.',
    );
    expect(await style(note, 'font-size', 'line-height', 'color')).toEqual({
      'font-size': '12px',
      'line-height': '16px',
      color: await token(page, 'text-muted'),
    });
  });

  test('the list scrolls under a sticky header, and the page, the tree and the head row stay put', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 600 });
    await page.goto('/explore');
    const main = contents(page);
    const rows = main.getByRole('row');
    await expect(rows.nth(20)).toBeVisible();

    // The prototype's document is the window's height (F23): only the list scrolls.
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(
      600,
    );
    const header = main.getByRole('columnheader', { name: 'Name' });
    const before = (await header.boundingBox())?.y;
    await rows.last().scrollIntoViewIfNeeded();
    await expect(rows.nth(1)).not.toBeInViewport();
    // .grid-table th { position: sticky; top: 0 } — held where it began, less
    // the table's 1 px top rule, which scrolls away above it.
    const after = (await header.boundingBox())?.y ?? 0;
    expect((before ?? 0) - after).toBeGreaterThanOrEqual(0);
    expect((before ?? 0) - after).toBeLessThanOrEqual(1);
    await expect(main.getByRole('heading', { level: 1 })).toBeInViewport();
    await expect(
      main.getByRole('searchbox', { name: 'Search dashboards and charts' }),
    ).toBeInViewport();
    await expect(
      folders(page).getByRole('button', { name: 'Shared', exact: true }),
    ).toBeInViewport();

    // A row the keys move onto comes to rest below the sticky header, not
    // under it (T244's review): one tucked 10 px under the header, reached by
    // ArrowUp from the row below, is brought out.
    const scroller = main.getByRole('table').locator('..');
    const tucked = rows.nth(12);
    await tucked.evaluate((row) => {
      const list = row.closest('table')?.parentElement;
      if (list)
        list.scrollTop += row.getBoundingClientRect().top - list.getBoundingClientRect().top - 10;
    });
    await rows.nth(13).focus();
    await page.keyboard.press('ArrowUp');
    await expect(tucked).toBeFocused();
    const headerBottom = await header.evaluate((cell) => cell.getBoundingClientRect().bottom);
    expect((await tucked.boundingBox())?.y).toBeGreaterThanOrEqual(headerBottom - 0.5);
    expect(await scroller.evaluate((list) => list.scrollTop)).toBeGreaterThan(0);
  });

  test('an empty folder, and a search that finds nothing, keep the header over a centred 120 px row', async ({
    page,
    request,
  }) => {
    const unique = String(Date.now());
    const empty = await make(request, 'folder', 'root', `Empty ${unique}`);
    await page.goto(`/explore?folder=${empty}`);
    const main = contents(page);

    const said = async (text: string) => {
      const table = main.getByRole('table');
      await expect(table.getByRole('columnheader')).toHaveText([
        'Name',
        'Type',
        'Built on',
        'Updated',
        'Owner',
        'Actions',
      ]);
      // <tr><td colspan="5" style="height:120px;text-align:center" class="sec">
      const cell = table.getByRole('cell', { name: text, exact: true });
      expect((await cell.boundingBox())?.height).toBeCloseTo(120, 0);
      expect(await style(cell, 'text-align', 'font-size', 'color')).toEqual({
        'text-align': 'center',
        'font-size': '12px',
        color: await token(page, 'text-secondary'),
      });
    };
    // A shared folder's: New makes no dashboard or chart there (T331), with
    // sign-in off too (T359, AC-254).
    await said('This folder is empty.');
    await main
      .getByRole('searchbox', { name: 'Search dashboards and charts' })
      .fill(`nothing called ${unique}`);
    await said('Nothing matches.');
  });
});

/**
 * T245: the app bar's search and avatar, and the palette, as the prototype
 * draws them (recheck-shell-explore N6–N10; AC-187 mismatches 1–4), and a new
 * dashboard opened for editing, as its New › Dashboard does (N15).
 */
test.describe('T245: the app bar’s search and avatar, the palette, and a new dashboard', () => {
  const trigger = (page: Page) => page.getByRole('banner').getByRole('button', { name: /^Search/ });
  const palette = (page: Page) => page.getByRole('dialog', { name: 'Search' });

  test('the search trigger: 260 px, its words whole, its shortcut muted at normal height', async ({
    page,
  }) => {
    await page.goto('/explore');
    await expect(trigger(page)).toBeVisible();

    // .search { width: 260px } — with words that fit it (N6).
    expect((await trigger(page).boundingBox())?.width).toBe(260);
    const [needed, given] = await trigger(page)
      .locator('span')
      .evaluate((words) => [words.scrollWidth, words.clientWidth]);
    expect(needed).toBeLessThanOrEqual(given ?? 0);
    // .search kbd { font: 600 12px var(--font-ui) }: the field's text-muted,
    // and the shorthand's normal line height (mismatches 1–2).
    expect(
      await style(trigger(page).locator('kbd'), 'color', 'line-height', 'font-size', 'font-weight'),
    ).toEqual({
      color: await token(page, 'text-muted'),
      'line-height': 'normal',
      'font-size': '12px',
      'font-weight': '600',
    });
    // The height AC-187 measures: 16.5 px in the prototype, where a 20 px
    // line had made it 22 (mismatch 2; T245's review).
    expect((await trigger(page).locator('kbd').boundingBox())?.height).toBeLessThan(18);
  });

  test('the avatar: the dimension role on its tint', async ({ page }) => {
    await page.goto('/explore');
    // .avatar { background: var(--role-dim-soft); color: var(--role-dim) } (N7, mismatch 3)
    const avatar = page.getByRole('banner').getByRole('img', { name: /^Signed in/ });
    // In both themes, and painted at all: a token the sheet never emitted
    // would read as transparent on both sides of the comparison (T245's review).
    for (const theme of ['light', 'dark'] as const) {
      if (theme === 'dark') {
        await page.getByRole('button', { name: /theme/i }).click();
        await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
      }
      const painted = await style(avatar, 'background-color', 'color');
      expect(painted).toEqual({
        'background-color': await token(page, 'bg-role-dimension-soft', 'background-color'),
        color: await token(page, 'role-dimension'),
      });
      expect(painted['background-color']).not.toBe('rgba(0, 0, 0, 0)');
    }
  });

  test('the palette: over the app bar, lifted by the pop shadow, a 6 px Close, and a fresh query each time', async ({
    page,
  }) => {
    await page.goto('/explore');
    await trigger(page).click();
    await expect(palette(page)).toBeVisible();

    // .btn { border-radius: 6px } (N8, mismatch 4).
    expect(
      await style(palette(page).getByRole('button', { name: 'Close' }), 'border-radius'),
    ).toEqual({ 'border-radius': '6px' });
    // bg-raised with --shadow-pop (direction §5; N9).
    const pop = await page.evaluate(() => {
      const probe = document.createElement('div');
      probe.style.boxShadow = 'var(--wc-shadow-pop)';
      document.body.append(probe);
      const value = getComputedStyle(probe).boxShadow;
      probe.remove();
      return value;
    });
    expect(await style(palette(page), 'box-shadow')).toEqual({ 'box-shadow': pop });
    // The backdrop covers the app bar too: a modal dialog leaves nothing
    // behind it to click (N9) — here, the Jobs tab.
    const jobs = await page.getByRole('banner').getByRole('link', { name: 'Jobs' }).boundingBox();
    const covered = await page.evaluate(
      ([x, y]) => document.elementFromPoint(x ?? 0, y ?? 0)?.closest('header') === null,
      [(jobs?.x ?? 0) + (jobs?.width ?? 0) / 2, (jobs?.y ?? 0) + (jobs?.height ?? 0) / 2],
    );
    expect(covered).toBe(true);

    // And over Explore's sticky table header, which lies across the palette's
    // input: z-index 1 painted it over a backdrop left at auto (T244's review).
    const input = palette(page).getByRole('combobox');
    const field = await input.boundingBox();
    const onTop = await page.evaluate(
      ([x, y]) => document.elementFromPoint(x ?? 0, y ?? 0)?.getAttribute('role'),
      [(field?.x ?? 0) + (field?.width ?? 0) / 2, (field?.y ?? 0) + (field?.height ?? 0) - 3],
    );
    expect(onTop).toBe('combobox');

    // Opened again, it asks afresh rather than adding to the last search (N10).
    await input.fill('fin');
    await page.keyboard.press('Escape');
    await expect(palette(page)).toHaveCount(0);
    await trigger(page).click();
    await expect(palette(page).getByRole('combobox')).toHaveValue('');
  });

  test('New › Dashboard opens the new dashboard ready to edit', async ({ page }) => {
    // In My workspace, to go to Finance: where the single user makes one
    // (T359, AC-254; a shared folder's New makes a folder alone, T331).
    await newInMyWorkspace(page, 'Dashboard', 'seed-folder-0');

    // explore.js: S.editNew = true — straight into edit mode (N15).
    await expect(page).toHaveURL(/\/explore\/dashboards\//);
    await expect(page.getByRole('toolbar', { name: 'Dashboard editing' })).toBeVisible();
    // Once, not for good: the address says nothing of it after, so a reload
    // or a link opens the dashboard to be read.
    await expect.poll(() => new URL(page.url()).searchParams.has('editing')).toBe(false);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeVisible();
    await expect(page.getByRole('toolbar', { name: 'Dashboard editing' })).toHaveCount(0);
  });

  test('a dashboard that cannot be opened forgets the request to edit it too', async ({ page }) => {
    // T245's review: left in the address, a reload once the server was back
    // would have opened it in edit mode.
    await page.route('**/api/documents/dashboard/seed-root-dashboard-1', (route) =>
      route.fulfill({ status: 500, body: 'down' }),
    );
    await page.goto('/explore/dashboards/seed-root-dashboard-1?editing=true');
    await expect(page.getByTestId('dashboard-error')).toBeVisible();
    await expect.poll(() => new URL(page.url()).searchParams.has('editing')).toBe(false);
  });
});

/**
 * T246: the dashboard's header and filter band as dashboard.js draws them
 * (recheck-dashboard F3, N8; AC-187 mismatches 1–7).
 */
test.describe('T246: the dashboard header and the filter band', () => {
  const title = (page: Page) =>
    page.getByRole('heading', { name: 'Company dashboard 01', level: 1 });
  const band = (page: Page) => page.getByRole('region', { name: 'Filters' });
  test.beforeEach(async ({ page }) => {
    await page.goto('/explore/dashboards/seed-root-dashboard-1');
    await expect(title(page)).toBeVisible();
  });

  test('the header: 80 px, its way back a 24 px ghost button, its folder muted', async ({
    page,
  }) => {
    // .dash-head { padding: 12px 24px 0; gap: 12px }: the breadcrumb's 24 px
    // row, then the 32 px title (mismatch 1). To the title's foot: below it
    // now is the line saying where the dashboard is (design 04, state E),
    // which sign-in off shows too (T359, AC-254).
    const head = await title(page).locator('..').boundingBox();
    const titled = await title(page).boundingBox();
    expect((titled?.y ?? 0) + (titled?.height ?? 0) - (head?.y ?? 0)).toBe(80);
    await expect(
      title(page)
        .locator('..')
        .getByText(/^In Shared · version \d+$/),
    ).toBeVisible();
    const crumbs = page.getByRole('navigation', { name: 'Breadcrumb' });
    // <button class="btn ghost sm" data-back>← Explore</button> (mismatches 1–2)
    expect(
      await style(
        crumbs.getByRole('link', { name: '← Explore' }),
        'height',
        'padding-left',
        'padding-right',
        'border-radius',
        'font-size',
        'color',
      ),
    ).toEqual({
      height: '24px',
      'padding-left': '8px',
      'padding-right': '8px',
      'border-radius': '6px',
      'font-size': '12px',
      color: await token(page, 'text-primary'),
    });
    // <span class="muted"> / Shared /</span>
    expect(await style(crumbs.getByRole('link', { name: 'Shared' }), 'color')).toEqual({
      color: await token(page, 'text-muted'),
    });
  });

  test('editing: a 20 px title after a muted "Editing", 14 px Undo and Redo, and "+ Page tab" 12/600 secondary', async ({
    page,
  }) => {
    // Edited in the single user's copy.
    await page.goto(await editableSeed());
    await expect(title(page)).toBeVisible();
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    const bar = page.getByRole('toolbar', { name: 'Dashboard editing' });
    await expect(bar).toBeVisible();

    // <h1 style="font-size:20px"><span class="muted" style="font-weight:400">Editing</span> …</h1> (mismatch 3)
    expect(await style(title(page), 'font-size')).toEqual({ 'font-size': '20px' });
    expect(
      await style(title(page).getByText('Editing', { exact: true }), 'color', 'font-weight'),
    ).toEqual({ color: await token(page, 'text-muted'), 'font-weight': '400' });
    // .iconbtn ↶ and ↷: 14 px text-secondary, at .4 while there is nothing to
    // undo (mismatch 4).
    for (const name of ['Undo', 'Redo'])
      expect(
        await style(bar.getByRole('button', { name }), 'font-size', 'color', 'opacity'),
      ).toEqual({
        'font-size': '14px',
        color: await token(page, 'text-secondary'),
        opacity: '0.4',
      });
    // <button class="btn ghost sm" data-addtoptab>+ Page tab</button> (mismatch 5)
    expect(
      await style(
        page.getByRole('button', { name: '+ Page tab' }),
        'font-size',
        'font-weight',
        'color',
      ),
    ).toEqual({
      'font-size': '12px',
      'font-weight': '600',
      color: await token(page, 'text-secondary'),
    });
  });

  test('the filter band: 53 px whatever it holds, its hint 12/16 muted, and full width while editing', async ({
    page,
  }) => {
    // In the single user's copy, which they may edit.
    await page.goto(await editableSeed());
    await expect(title(page)).toBeVisible();
    // .filterbar { padding: 10px 24px } around a 32 px pill, ruled off: 53 px
    // with only its hint as with a pill (N8, mismatch 6).
    await expect(band(page)).toBeVisible();
    expect((await band(page).boundingBox())?.height).toBe(53);
    const hint = band(page).getByText(/to mark|to cross-filter/);
    expect(await style(hint, 'font-size', 'line-height', 'color')).toEqual({
      'font-size': '12px',
      'line-height': '16px',
      color: await token(page, 'text-muted'),
    });

    // Editing, the band runs the full width over the canvas and the sidebar
    // alike, and the sidebar begins below it (mismatch 7).
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    const sidebar = page.getByRole('complementary', { name: 'Edit sidebar' });
    await expect(sidebar).toBeVisible();
    const across = await band(page).boundingBox();
    expect(across?.x).toBe(0);
    expect(across?.width).toBe(page.viewportSize()?.width);
    expect((await sidebar.boundingBox())?.y).toBeGreaterThanOrEqual(
      (across?.y ?? 0) + (across?.height ?? 0),
    );
    expect((await band(page).boundingBox())?.height).toBe(53);
  });

  test('many page tabs scroll within their strip, never the page (T246’s review)', async ({
    page,
    request,
  }) => {
    // Out of the canvas since T246, a strip wider than the window would carry
    // the whole page sideways with it, the header and the canvas too.
    const api = 'http://localhost:4100/api';
    const name = `Tabs ${String(Date.now())}`;
    const { id } = (await (
      await request.post(`${api}/documents`, {
        data: { kind: 'dashboard', title: name, ...IN_MY_WORKSPACE },
      })
    ).json()) as { id: string };
    await request.put(`${api}/documents/dashboard/${id}`, {
      data: {
        version: 1,
        body: {
          schemaVersion: 1,
          title: name,
          ...IN_MY_WORKSPACE,
          owner: 'admin',
          settings: { width: 'fixed' },
          pages: Array.from({ length: 16 }, (_, index) => ({
            id: `p${String(index)}`,
            title: `Quarterly page ${String(index + 1)}`,
            items: [],
          })),
        },
      },
    });
    await page.setViewportSize({ width: 900, height: 700 });
    await page.goto(`/explore/dashboards/${id}`);
    const tabs = page.getByRole('tablist', { name: 'Pages' });
    await expect(tabs.getByRole('tab')).toHaveCount(16);

    const [pageWide, windowWide] = await page.evaluate(() => [
      document.documentElement.scrollWidth,
      window.innerWidth,
    ]);
    expect(pageWide).toBeLessThanOrEqual(windowWide ?? 0);
    const [strip, shown] = await tabs.evaluate((list) => [list.scrollWidth, list.clientWidth]);
    expect(strip).toBeGreaterThan(shown ?? 0);
    // The last tab is still reachable: it scrolls into its strip.
    await tabs.getByRole('tab').last().click();
    await expect(tabs.getByRole('tab').last()).toBeInViewport();
  });
});

/**
 * T247: a tab group, the Header and Divider, Markdown and the section band as
 * dashboard.js draws them (recheck-dashboard N1, N5, N6, N9; mismatches
 * 15–18).
 */
test.describe('T247: the tab group, the Header, Markdown and the section band', () => {
  test.beforeEach(async ({ page, request }) => {
    const api = 'http://localhost:4100/api';
    const title = `Elements ${String(Date.now())}`;
    const { id } = (await (
      await request.post(`${api}/documents`, {
        data: { kind: 'dashboard', title, ...IN_MY_WORKSPACE },
      })
    ).json()) as { id: string };
    await request.put(`${api}/documents/dashboard/${id}`, {
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
              items: [
                { id: 'el-header', kind: 'header', w: 12, text: 'Definitions' },
                { id: 'el-divider', kind: 'divider', w: 12 },
                {
                  id: 'el-notes',
                  kind: 'markdown',
                  w: 6,
                  h: 20,
                  text: '## Quarter notes\nOrders by status, this quarter.',
                },
                {
                  id: 'el-levels',
                  kind: 'markdown',
                  w: 6,
                  h: 20,
                  text: '# Quarter\n### Detail\nThe detail.',
                },
                {
                  id: 'el-terms',
                  kind: 'section',
                  title: 'Terms',
                  items: [
                    {
                      id: 'el-group',
                      kind: 'tabs',
                      w: 12,
                      tabs: [
                        {
                          id: 'measures',
                          title: 'Measures',
                          items: [
                            {
                              id: 'el-count',
                              kind: 'markdown',
                              w: 6,
                              h: 16,
                              text: 'Count is the number of orders.',
                            },
                          ],
                        },
                        { id: 'dimensions', title: 'Dimensions', items: [] },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      },
    });
    await page.goto(`/explore/dashboards/${id}`);
    await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible();
  });
  const element = (page: Page, id: string) => page.locator(`[data-tile="${id}"]`);
  const plain = {
    'border-top-width': '0px',
    'background-color': 'rgba(0, 0, 0, 0)',
    'padding-top': '0px',
  };
  /** .dsection's ground: color-mix(in srgb, var(--bg-surface) 55%, var(--bg-page)). */
  const bandOf = (page: Page) =>
    page.evaluate(() => {
      const probe = document.createElement('span');
      probe.style.backgroundColor =
        'color-mix(in srgb, var(--wc-bg-surface) 55%, var(--wc-bg-page))';
      document.body.append(probe);
      const value = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return value;
    });

  test('a tab group’s tabs are the page tabs’: the one showing underlined, on a band of its own', async ({
    page,
  }) => {
    const group = page.getByRole('tablist', { name: /Measures/ });
    const showing = group.getByRole('tab', { name: 'Measures' });
    const other = group.getByRole('tab', { name: 'Dimensions' });
    // .dash-tabs button (dashboard.js:361 reuses it): 36 px, 13/600; selected
    // text-primary over a 2 px accent rule (N1, mismatch 18).
    expect(
      await style(showing, 'height', 'font-size', 'font-weight', 'color', 'border-bottom-color'),
    ).toEqual({
      height: '36px',
      'font-size': '13px',
      'font-weight': '600',
      color: await token(page, 'text-primary'),
      'border-bottom-color': await token(page, 'accent'),
    });
    expect(await style(other, 'color', 'border-bottom-color')).toEqual({
      color: await token(page, 'text-secondary'),
      'border-bottom-color': 'rgba(0, 0, 0, 0)',
    });
    // A .dsection of its own (dashboard.js:359), not a white card (N1): the
    // band's ground, rule and 8/12/12 padding, and 8 px between its tabs and
    // what they show. T247 first drew it bare, which its review found was
    // not the prototype's.
    expect(
      await style(
        element(page, 'el-group'),
        'border-top-width',
        'background-color',
        'padding-top',
        'padding-left',
      ),
    ).toEqual({
      'border-top-width': '1px',
      'background-color': await bandOf(page),
      'padding-top': '8px',
      'padding-left': '12px',
    });
    const tabsBottom = await group.evaluate((list) => list.getBoundingClientRect().bottom);
    const shownTop = (await element(page, 'el-count').boundingBox())?.y ?? 0;
    expect(shownTop - tabsBottom).toBeCloseTo(8, 0);
  });

  test('the Header and the Divider sit on the page, the Header a 600 heading on the type scale', async ({
    page,
  }) => {
    // .dplain: no border, background or padding (N5, mismatch 17).
    for (const id of ['el-header', 'el-divider'])
      expect(
        await style(element(page, id), 'border-top-width', 'background-color', 'padding-top'),
      ).toEqual(plain);
    // <h2 style="font-size:20px;line-height:1.3;font-weight:600"> — text-lg.
    expect(
      await style(
        element(page, 'el-header').getByRole('heading', { name: 'Definitions' }),
        'font-size',
        'line-height',
        'font-weight',
      ),
    ).toEqual({ 'font-size': '20px', 'line-height': '26px', 'font-weight': '600' });
    // <hr style="border:0;border-top:1px solid var(--border-strong);margin:8px 0">
    expect(
      await style(
        element(page, 'el-divider').locator('hr'),
        'border-top-width',
        'border-top-color',
        'margin-top',
      ),
    ).toEqual({
      'border-top-width': '1px',
      'border-top-color': await token(page, 'border-strong'),
      'margin-top': '8px',
    });
  });

  test('editing, the Header and the Divider keep their ⋯ whole, their grip beside the heading, and no outline at rest', async ({
    page,
  }) => {
    // T247's review: at no padding, the ⋯ ran past the 32 px row and was
    // clipped, and the corner grip sat on the heading's first letter.
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    for (const id of ['el-header', 'el-divider']) {
      const tile = element(page, id);
      await tile.hover();
      const box = await tile.boundingBox();
      const menu = await tile.getByRole('button', { name: /^Actions for / }).boundingBox();
      expect(menu?.y ?? 0).toBeGreaterThanOrEqual(box?.y ?? 0);
      expect((menu?.y ?? 0) + (menu?.height ?? 0)).toBeLessThanOrEqual(
        (box?.y ?? 0) + (box?.height ?? 0),
      );
    }
    const grip = await element(page, 'el-header')
      .getByRole('button', { name: /^Move / })
      .boundingBox();
    const heading = await element(page, 'el-header').getByRole('heading').boundingBox();
    expect(heading?.x ?? 0).toBeGreaterThanOrEqual((grip?.x ?? 0) + (grip?.width ?? 0));
    // .dplain.editing { outline: 1px dashed transparent } until hovered.
    await page.mouse.move(0, 0);
    expect(await style(element(page, 'el-divider'), 'outline-color')).toEqual({
      'outline-color': 'rgba(0, 0, 0, 0)',
    });
  });

  test('Markdown: headings sized by their marks and levelled in the tile, the shallowest at h3', async ({
    page,
  }) => {
    // "#" at text-xl, "###" at text-md; the shallowest a tile has is h3 and
    // the next one down h4, so the outline agrees with what is drawn (T247's
    // review: "#" and "##" were both h3 at different sizes).
    const levels = element(page, 'el-levels');
    expect(
      await style(
        levels.getByRole('heading', { name: 'Quarter', level: 3 }),
        'font-size',
        'line-height',
      ),
    ).toEqual({ 'font-size': '24px', 'line-height': '32px' });
    expect(
      await style(
        levels.getByRole('heading', { name: 'Detail', level: 4 }),
        'font-size',
        'line-height',
      ),
    ).toEqual({ 'font-size': '16px', 'line-height': '22px' });
    await expect(
      element(page, 'el-notes').getByRole('heading', { name: 'Quarter notes', level: 3 }),
    ).toBeVisible();
  });

  test('Markdown: “##” at 20/26 over a 14/22 secondary body, and each tile named by its text', async ({
    page,
  }) => {
    const notes = element(page, 'el-notes');
    // .md h2 { 20px/26px 600, text-primary } and .md { 14px/22px, text-secondary } (N6, mismatch 16)
    expect(
      await style(
        notes.getByRole('heading', { name: 'Quarter notes' }),
        'font-size',
        'line-height',
        'font-weight',
        'color',
      ),
    ).toEqual({
      'font-size': '20px',
      'line-height': '26px',
      'font-weight': '600',
      color: await token(page, 'text-primary'),
    });
    expect(
      await style(
        notes.getByText('Orders by status, this quarter.'),
        'font-size',
        'line-height',
        'color',
      ),
    ).toEqual({
      'font-size': '14px',
      'line-height': '22px',
      color: await token(page, 'text-secondary'),
    });
    // Named by what it says, not its markup, and one full stop (N9).
    const name = (await notes.getAttribute('aria-label')) ?? '';
    expect(name).toMatch(/^Markdown: Quarter notes/);
    expect(name).not.toContain('#');
    const count = (await element(page, 'el-count').getAttribute('aria-label')) ?? '';
    expect(count).toMatch(/^Markdown: Count is the number of orders\./);
    expect(count).not.toContain('..');
  });

  test('a section is the prototype’s band: its ground between surface and page, its count muted, its toggle 6 px', async ({
    page,
  }) => {
    // .dsection { background: color-mix(in srgb, var(--bg-surface) 55%, var(--bg-page)) } (mismatch 15)
    const band = await bandOf(page);
    const terms = element(page, 'el-terms');
    expect(await style(terms, 'background-color')).toEqual({ 'background-color': band });
    // <span class="xs muted">1 item</span>
    expect(
      await style(terms.getByText('1 item', { exact: true }), 'color', 'font-size', 'line-height'),
    ).toEqual({
      color: await token(page, 'text-muted'),
      'font-size': '12px',
      'line-height': '16px',
    });
    // Its ▾, an .iconbtn at 24 px: radius 6.
    expect(
      await style(terms.getByRole('button', { name: 'Collapse Terms' }), 'border-radius'),
    ).toEqual({ 'border-radius': '6px' });
  });
});

/** The view-mode tile menu's popup: the picker the APG menu sits in (T266). */
const viewMenuOf = (tile: Locator) =>
  tile.getByRole('menu', { name: /^Actions for / }).locator('xpath=..');

const firstChart = (page: Page) =>
  page
    .locator('[data-tile]')
    .filter({ has: page.getByTestId('chart-canvas') })
    .first();

/**
 * T254: a chart's own text and plot as charts.js draws them
 * (recheck-dashboard N7, F9; mismatches 12, 13).
 */
test.describe('T254: a chart’s text and plot', () => {
  test('the chart is drawn in Inter with tabular numerals, its plot down to the tile’s foot', async ({
    page,
  }) => {
    await page.goto('/explore/dashboards/seed-root-dashboard-1');
    const tile = firstChart(page);
    const svg = tile.getByTestId('chart-canvas').locator('svg').first();
    await expect(svg.locator('text').first()).toBeVisible();

    // The prototype's textStyle.fontFamily "Inter, system-ui, sans-serif" (N7, mismatch 13).
    const families = await svg
      .locator('text')
      .evaluateAll((texts) => [...new Set(texts.map((text) => getComputedStyle(text).fontFamily))]);
    expect(families.length).toBeGreaterThan(0);
    for (const family of families) expect(family).toMatch(/^"?Inter"?,/);
    // Direction rule 1: axes in tabular numerals.
    const numerals = await svg
      .locator('text')
      .evaluateAll((texts) => [
        ...new Set(texts.map((text) => getComputedStyle(text).fontVariantNumeric)),
      ]);
    expect(numerals).toEqual(['tabular-nums']);

    // grid: { bottom: 8, containLabel: true } — no band of empty grid under
    // the axis labels (F9, mismatch 12: it was 59 px).
    const gap = await svg.evaluate((element) => {
      const box = element.getBoundingClientRect();
      const lowest = Math.max(
        ...[...element.querySelectorAll('text')].map((text) => text.getBoundingClientRect().bottom),
      );
      return box.bottom - lowest;
    });
    expect(gap).toBeLessThanOrEqual(12);
  });
});

/**
 * T252: a chart tile's badges, head and incomplete state as dashboard.js
 * draws them (recheck-dashboard F8, F13; mismatches 9, 10, 21).
 */
test.describe('T252: a chart tile’s badges, head and incomplete state', () => {
  test('one freshness badge, the prototype’s, and a head no taller than 22 px', async ({
    page,
  }) => {
    await page.goto('/explore/dashboards/seed-root-dashboard-1');
    const tile = firstChart(page);
    const head = tile.locator('.tile-head').first();

    // One badge — design 04's .fresh (note 4; T681, DSH-01, DSH-23): 20 px,
    // padding 0 7, a 5 px gap, bg-subtle, secondary, its 6 px dot and the one
    // word "Live"; the time is its tooltip's (F8, mismatch 10: two pills took
    // the title's room).
    const badges = head.getByTestId('tile-freshness');
    await expect(badges).toHaveCount(1);
    await expect(badges.locator('.tile-freshness__label')).toHaveText('Live');
    await expect(badges).toHaveAttribute('title', /^Live query · as of /);
    // The time kept for a screen reader, out of sight (rule 1's room for the title).
    await expect(badges.locator('.visually-hidden time')).toHaveAttribute('datetime', /^\d{4}-/);
    expect(
      await style(
        badges,
        'height',
        'background-color',
        'color',
        'font-size',
        'padding-left',
        'border-radius',
        'column-gap',
      ),
    ).toEqual({
      height: '20px',
      'background-color': await token(page, 'bg-subtle', 'background-color'),
      color: await token(page, 'text-secondary'),
      'font-size': '12px',
      'padding-left': '7px',
      'border-radius': '999px',
      'column-gap': '5px',
    });
    // Its dot, 6 px, in its ink; no pill inside it (T252's review).
    expect(
      await style(badges.locator('.tile-freshness__dot'), 'width', 'height', 'background-color'),
    ).toEqual({
      width: '6px',
      height: '6px',
      'background-color': await token(page, 'text-secondary', 'background-color'),
    });
    // The prototype's head is 20–22 px; "Table view" made it 24 (mismatch 9).
    expect((await head.boundingBox())?.height).toBeLessThanOrEqual(22);
  });

  test('an incomplete chart keeps its head, says what it needs at 12 px, and hints at editing only while editing', async ({
    page,
    request,
  }) => {
    const api = 'http://localhost:4100/api';
    const name = `Incomplete ${String(Date.now())}`;
    const { id } = (await (
      await request.post(`${api}/documents`, {
        data: { kind: 'dashboard', title: name, ...IN_MY_WORKSPACE },
      })
    ).json()) as { id: string };
    const chart = (await (
      await request.post(`${api}/documents`, {
        data: { kind: 'chart', title: 'Revenue KPI', ...IN_MY_WORKSPACE },
      })
    ).json()) as { id: string };
    await request.put(`${api}/documents/chart/${chart.id}`, {
      data: {
        version: 1,
        body: {
          schemaVersion: 1,
          title: 'Revenue KPI',
          owner: 'admin',
          localToDashboardId: id,
          chart: {
            source: { cube: 'orders' },
            wells: { measures: [], dimensions: [], timeDimensions: [] },
            chartType: 'kpi',
          },
        },
      },
    });
    await request.put(`${api}/documents/dashboard/${id}`, {
      data: {
        version: 1,
        body: {
          schemaVersion: 1,
          title: name,
          ...IN_MY_WORKSPACE,
          owner: 'admin',
          settings: { width: 'fixed' },
          pages: [
            {
              id: 'only',
              title: 'Only',
              items: [{ id: 'tile-kpi', kind: 'chart', w: 3, h: 13, chartId: chart.id }],
            },
          ],
        },
      },
    });
    await page.goto(`/explore/dashboards/${id}`);
    const tile = page.locator('[data-tile="tile-kpi"]');
    const empty = tile.getByTestId('tile-empty-chart');
    await expect(empty).toBeVisible();

    // A head with its title, as a drawn chart has (F13, mismatch 21).
    await expect(tile.getByRole('heading', { name: 'Revenue KPI' })).toBeVisible();
    expect(await style(empty.locator('p').first(), 'font-size', 'color')).toEqual({
      'font-size': '12px',
      color: await token(page, 'text-secondary'),
    });
    // Its ✎ finishes it in either mode, as the prototype says "Use ✎ to finish
    // it"; E on a selected tile is editing's alone (T252's review).
    await expect(empty).toContainText('✎');
    await expect(empty).not.toContainText('E when the tile is selected');
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await expect(empty).toContainText('E when the tile is selected');
    // The message stays under the head in a KPI-sized tile, not over it — a
    // centred message taller than its room spilt upward (T252's review).
    const headBottom = await tile
      .locator('.tile-head')
      .evaluate((head) => head.getBoundingClientRect().bottom);
    expect((await empty.locator('p').first().boundingBox())?.y).toBeGreaterThanOrEqual(headBottom);
  });
});

/**
 * T253: a tile's menus as the prototype's .picker, its grip at the start of
 * its head, and the edit grid's tinted columns (recheck-dashboard N4;
 * mismatches 14, 19, 20).
 */
test.describe('T253: tile menus, the grip and the edit grid', () => {
  test.beforeEach(async ({ page }) => {
    // The copy, which its tests edit.
    await page.goto(await editableSeed());
    await expect(firstChart(page).getByTestId('chart-canvas')).toBeVisible();
  });

  /**
   * The edit menu is the prototype's .picker, 250 px with rows padded 0 6;
   * the view menu is design 08's .ctx, 284 px with rows padded 0 8 (T682;
   * R76 dashboard-Q6). Both bordered and shadowed alike.
   */
  const pickerOf = async (
    page: Page,
    menu: Locator,
    drawn: { width: string; pad: string } = { width: '250px', pad: '6px' },
  ) => {
    // .picker { width: 250px; border: 1px solid var(--border-strong); box-shadow: var(--shadow-pop) }
    const pop = await page.evaluate(() => {
      const probe = document.createElement('div');
      probe.style.boxShadow = 'var(--wc-shadow-pop)';
      document.body.append(probe);
      const value = getComputedStyle(probe).boxShadow;
      probe.remove();
      return value;
    });
    expect(await style(menu, 'width', 'border-top-color', 'box-shadow')).toEqual({
      width: drawn.width,
      'border-top-color': await token(page, 'border-strong'),
      'box-shadow': pop,
    });
    // .picker button { height: 28px; padding: 0 6px; border-radius: 4px; font-size: 12px }
    expect(
      await style(
        // A button in the edit menu; in the view menu, an APG menu item (T266).
        menu.locator('button, [role^="menuitem"]').first(),
        'height',
        'padding-left',
        'border-top-left-radius',
        'font-size',
      ),
    ).toEqual({
      height: '28px',
      'padding-left': drawn.pad,
      'border-top-left-radius': '4px',
      'font-size': '12px',
    });
  };

  test('the view menu is the prototype’s picker', async ({ page }) => {
    const tile = firstChart(page);
    await tile.hover();
    await tile.getByRole('button', { name: /^Actions for / }).click();
    // The popup the menu sits in, with its heading (T266): design 08's (T682).
    await pickerOf(page, viewMenuOf(tile), { width: '284px', pad: '8px' });
  });

  test('the edit menu is the picker too, its heading muted and Delete in the error ink', async ({
    page,
  }) => {
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    const tile = firstChart(page);
    await tile.hover();
    await tile.getByRole('button', { name: /^Actions for / }).click();
    const menu = tile.getByRole('list', { name: /^Actions for / });
    await pickerOf(page, menu);
    // The group heading: 12/16 400 muted (mismatch 14).
    expect(
      await style(
        menu.getByText('Move to', { exact: true }),
        'font-size',
        'line-height',
        'font-weight',
        'color',
      ),
    ).toEqual({
      'font-size': '12px',
      'line-height': '16px',
      'font-weight': '400',
      color: await token(page, 'text-muted'),
    });
    // <button … style="color:var(--err)">Delete</button>
    expect(await style(menu.getByRole('button', { name: /^Delete/ }), 'color')).toEqual({
      color: await token(page, 'status-error'),
    });
  });

  test('editing: the grip starts the tile’s head, and the grid’s columns are tinted bands', async ({
    page,
  }) => {
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    const tile = firstChart(page);
    const grip = tile.getByRole('button', { name: /^Move / });
    await expect(grip).toBeVisible();
    // .grip { color: var(--text-muted); font-size: 14px; padding: 2px 4px; border-radius: 4px } (mismatch 19)
    expect(
      await style(grip, 'color', 'font-size', 'padding-top', 'padding-left', 'border-radius'),
    ).toEqual({
      color: await token(page, 'text-muted'),
      'font-size': '14px',
      'padding-top': '2px',
      'padding-left': '4px',
      'border-radius': '4px',
    });
    // In the head's row, before the title — not over the tile's corner.
    const head = await tile.locator('.tile-head').first().boundingBox();
    const at = await grip.boundingBox();
    const title = await tile.getByRole('heading', { level: 3 }).first().boundingBox();
    const middle = (at?.y ?? 0) + (at?.height ?? 0) / 2;
    expect(middle).toBeGreaterThanOrEqual(head?.y ?? 0);
    expect(middle).toBeLessThanOrEqual((head?.y ?? 0) + (head?.height ?? 0));
    expect(title?.x ?? 0).toBeGreaterThanOrEqual((at?.x ?? 0) + (at?.width ?? 0));

    // .gridlines: columns tinted 4 % accent, not 1 px rules (mismatch 20).
    const bands = await page
      .locator('.grid-canvas[data-gridlines="true"]')
      .first()
      .evaluate((canvas) => getComputedStyle(canvas).backgroundImage);
    expect(bands).toMatch(/0\.04\)|4%/);
  });
});

/**
 * T253's review: a menu kept inside the canvas, a grip that is a 24 px target
 * on its element's own row, Move to's targets wrapped, and the bands measured.
 */
test.describe('T253’s review: menus, the grip and the bands', () => {
  const api = 'http://localhost:4100/api';
  const section = 'Regional performance by territory and sales channel';
  const tabs = ['Revenue by region and customer segment', 'Revenue by region and sales channel'];

  /** A chart local to the dashboard, counting `measure` by `dimension` on `source`. */
  async function chartOn(
    request: APIRequestContext,
    dashboardId: string,
    title: string,
    source: string,
    measure: string,
    dimension: string,
  ) {
    const chart = (await (
      await request.post(`${api}/documents`, { data: { kind: 'chart', title, ...IN_MY_WORKSPACE } })
    ).json()) as { id: string };
    await request.put(`${api}/documents/chart/${chart.id}`, {
      data: {
        version: 1,
        body: {
          schemaVersion: 1,
          title,
          owner: 'admin',
          localToDashboardId: dashboardId,
          chart: {
            source: { cube: source },
            wells: { measures: [measure], dimensions: [dimension], timeDimensions: [] },
            chartType: 'bar',
          },
        },
      },
    });
    return chart.id;
  }

  test.beforeEach(async ({ page, request }) => {
    const title = `Review ${String(Date.now())}`;
    const { id } = (await (
      await request.post(`${api}/documents`, {
        data: { kind: 'dashboard', title, ...IN_MY_WORKSPACE },
      })
    ).json()) as { id: string };
    const narrow = await chartOn(request, id, 'Narrow', 'orders', 'orders.count', 'orders.status');
    const summary = await chartOn(
      request,
      id,
      'Summary',
      'order_summary',
      'order_summary.count',
      'order_summary.status',
    );
    await request.put(`${api}/documents/dashboard/${id}`, {
      data: {
        version: 1,
        body: {
          schemaVersion: 1,
          title,
          ...IN_MY_WORKSPACE,
          owner: 'admin',
          settings: { width: 'fixed' },
          filters: [{ id: 'f-category', widget: 'checkbox', member: 'products.category' }],
          pages: [
            {
              id: 'only',
              title: 'Only',
              items: [
                { id: 'tile-narrow', kind: 'chart', w: 2, h: 40, chartId: narrow },
                { id: 'tile-summary', kind: 'chart', w: 6, h: 40, chartId: summary },
                { id: 'el-notes', kind: 'markdown', w: 4, h: 20, text: 'Orders by status.' },
                { id: 'el-header', kind: 'header', w: 12, text: 'Definitions' },
                { id: 'el-divider', kind: 'divider', w: 12 },
                { id: 'el-image', kind: 'image', w: 4, h: 20 },
                {
                  id: 'el-region',
                  kind: 'section',
                  title: section,
                  items: [
                    {
                      id: 'el-group',
                      kind: 'tabs',
                      w: 12,
                      tabs: tabs.map((name, index) => ({
                        id: `tab-${String(index)}`,
                        title: name,
                        items: [],
                      })),
                    },
                  ],
                },
              ],
            },
          ],
        },
      },
    });
    await page.goto(`/explore/dashboards/${id}`);
    await expect(
      page.locator('[data-tile="tile-narrow"]').getByTestId('chart-canvas'),
    ).toBeVisible();
  });

  const edit = async (page: Page) => {
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await expect(page.getByRole('complementary', { name: 'Edit sidebar' })).toBeVisible();
  };

  /** Whether an open menu lies wholly within the canvas that scrolls it. */
  const withinCanvas = (menu: Locator) =>
    menu.evaluate((list) => {
      const box = list.getBoundingClientRect();
      const canvas = (
        list.closest('.dashboard__canvas') ?? document.documentElement
      ).getBoundingClientRect();
      return { left: box.left - canvas.left, right: canvas.right - box.right };
    });

  test('a narrow tile’s menu opens within the canvas, in view mode and while editing', async ({
    page,
  }) => {
    // Finding 1: 250 px opened leftwards from the ⋯ of a tile narrower than
    // about 243 px ran past the canvas's left edge, where nothing reaches it.
    const tile = page.locator('[data-tile="tile-narrow"]');
    await tile.hover();
    await tile.getByRole('button', { name: /^Actions for / }).click();
    const viewing = await withinCanvas(viewMenuOf(tile));
    expect(viewing.left).toBeGreaterThanOrEqual(0);
    expect(viewing.right).toBeGreaterThanOrEqual(0);
    await page.keyboard.press('Escape');

    await edit(page);
    await tile.hover();
    await tile.getByRole('button', { name: /^Actions for / }).click();
    const editing = await withinCanvas(tile.getByRole('list', { name: /^Actions for / }));
    expect(editing.left).toBeGreaterThanOrEqual(0);
    expect(editing.right).toBeGreaterThanOrEqual(0);
  });

  test('long Move to targets wrap inside the picker, and nothing scrolls sideways', async ({
    page,
  }) => {
    // Finding 5: "Only › Regional performance… › Revenue by region and …"
    // kept to one line cut off the part that tells two targets apart.
    await edit(page);
    const tile = page.locator('[data-tile="tile-summary"]');
    await tile.hover();
    await tile.getByRole('button', { name: /^Actions for / }).click();
    const menu = tile.getByRole('list', { name: /^Actions for / });
    const targets = menu.getByRole('list', { name: /^Move / });
    const last = targets.getByRole('button', { name: new RegExp(`${tabs[1] ?? ''}$`) });
    await expect(last).toBeVisible();
    expect(await style(menu, 'width')).toEqual({ width: '250px' });
    const [wide, shown] = await targets.evaluate((list) => [list.scrollWidth, list.clientWidth]);
    expect(wide).toBeLessThanOrEqual(shown ?? 0);
    const [text, room] = await last.evaluate((button) => [button.scrollWidth, button.clientWidth]);
    expect(text).toBeLessThanOrEqual(room ?? 0);
    // Wrapped, it is taller than one 28 px line, and no shorter than one.
    expect((await last.boundingBox())?.height).toBeGreaterThan(28);
    // The heading is the prototype's: padded 6 6 2 (finding 10).
    expect(
      await style(
        menu.getByText('Move to', { exact: true }),
        'padding-top',
        'padding-left',
        'padding-bottom',
      ),
    ).toEqual({ 'padding-top': '6px', 'padding-left': '6px', 'padding-bottom': '2px' });
  });

  test('the grip is a 24 px target wherever it sits, and its focus ring is not cut off', async ({
    page,
    browserName,
  }) => {
    // Finding 3: 14 px padded 2 by 4 is under WCAG 2.5.8's 24 px, and the
    // grip is the only way to start a drag with the pointer. Finding 8: at the
    // Header's very edge the tile clipped the ring's left side.
    await edit(page);
    for (const id of ['tile-narrow', 'el-notes', 'el-header', 'el-divider', 'el-image']) {
      const tile = page.locator(`[data-tile="${id}"]`);
      const grip = page.getByTestId(`grip-${id}`);
      // In view: under My workspace's band and the line saying where it goes
      // (T359, AC-254), the last ones sit at the window's foot, where a point
      // past its edge finds nothing.
      await grip.scrollIntoViewIfNeeded();
      const reached = await grip.evaluate((element) => {
        const box = element.getBoundingClientRect();
        const [x, y] = [box.left + box.width / 2, box.top + box.height / 2];
        return [
          [-11.5, -11.5],
          [11.5, -11.5],
          [-11.5, 11.5],
          [11.5, 11.5],
        ].every(
          ([dx, dy]) =>
            document.elementFromPoint(x + (dx ?? 0), y + (dy ?? 0))?.closest('.grid-tile__grip') ===
            element,
        );
      });
      expect(reached, `${id}: every corner of a 24 px square on the grip is the grip`).toBe(true);

      // By the keyboard, as a ring is drawn for: Tab from its tile. WebKit on
      // macOS tabs to buttons only with Option held, as Safari does.
      await tile.focus();
      await page.keyboard.press(browserName === 'webkit' ? 'Alt+Tab' : 'Tab');
      await expect(grip).toBeFocused();
      const ring = await grip.evaluate((element) => {
        const style = getComputedStyle(element);
        const reach = parseFloat(style.outlineOffset) + parseFloat(style.outlineWidth);
        const box = element.getBoundingClientRect();
        return {
          visible: element.matches(':focus-visible') && style.outlineStyle !== 'none',
          left: box.left - reach,
          top: box.top - reach,
        };
      });
      const clip = await tile.evaluate((element) => element.getBoundingClientRect());
      expect(ring.visible, `${id}: a focus ring`).toBe(true);
      expect(ring.left, `${id}: the ring's left inside the tile`).toBeGreaterThanOrEqual(clip.left);
      expect(ring.top, `${id}: the ring's top inside the tile`).toBeGreaterThanOrEqual(clip.top);
    }
  });

  test('Markdown and Image take the prototype’s head row while editing, with the grip in it', async ({
    page,
  }) => {
    // Finding 7: dashboard.js:319 and :322 give each a tile-head while
    // editing (the grip, then "Markdown" or "Image" in xs muted), so the grip
    // never sits on the content's corner. View mode has no such row.
    await expect(page.locator('[data-tile="el-notes"]')).toBeVisible();
    await expect(page.locator('[data-tile="el-notes"] .tile-head')).toHaveCount(0);
    await edit(page);
    for (const [id, kind] of [
      ['el-notes', 'Markdown'],
      ['el-image', 'Image'],
    ] as const) {
      const tile = page.locator(`[data-tile="${id}"]`);
      const head = tile.locator('.tile-head');
      await expect(head).toHaveText(kind);
      expect(await style(head.getByText(kind), 'font-size', 'color')).toEqual({
        'font-size': '12px',
        color: await token(page, 'text-muted'),
      });
      const row = await head.boundingBox();
      const grip = await page.getByTestId(`grip-${id}`).boundingBox();
      const middle = (grip?.y ?? 0) + (grip?.height ?? 0) / 2;
      expect(middle).toBeGreaterThanOrEqual(row?.y ?? 0);
      expect(middle).toBeLessThanOrEqual((row?.y ?? 0) + (row?.height ?? 0));
      // The content starts below the row.
      const content = tile.locator(id === 'el-notes' ? '.markdown' : '.image-tile');
      expect((await content.boundingBox())?.y).toBeGreaterThanOrEqual(
        (row?.y ?? 0) + (row?.height ?? 0),
      );
    }
  });

  test('the grip sits on the chart’s head, not on a note above it', async ({ page }) => {
    // Finding 6: with a filter the chart's cube can't reach, the note comes
    // first, and the grip at the tile's first row covered it.
    const bar = page.getByRole('region', { name: 'Filters' });
    await bar.locator('[data-widget="checkbox"] button[aria-expanded]').click();
    await bar.getByRole('checkbox', { name: 'Components' }).check();
    const tile = page.locator('[data-tile="tile-summary"]');
    await expect(tile.getByTestId('not-covered')).toBeVisible();
    await page.keyboard.press('Escape');
    await edit(page);
    await expect(tile.getByTestId('not-covered')).toBeVisible();

    const note = await tile.getByTestId('not-covered').boundingBox();
    const head = await tile.locator('.tile-head').boundingBox();
    const grip = await page.getByTestId('grip-tile-summary').boundingBox();
    const middle = (grip?.y ?? 0) + (grip?.height ?? 0) / 2;
    expect(middle).toBeGreaterThanOrEqual(head?.y ?? 0);
    expect(middle).toBeLessThanOrEqual((head?.y ?? 0) + (head?.height ?? 0));
    // The head comes first and the note under it, clear of the grip.
    expect(note?.y ?? 0).toBeGreaterThanOrEqual((head?.y ?? 0) + (head?.height ?? 0));
    expect(note?.y ?? 0).toBeGreaterThanOrEqual((grip?.y ?? 0) + (grip?.height ?? 0));
  });

  test('the bands are the grid’s own columns, and step up while a tile is dragged', async ({
    page,
  }) => {
    // Finding 4: a 4 % match alone passes bands of any width. Measured here:
    // a band is one of the grid's tracks, and its gutter is the grid's gap.
    await edit(page);
    const canvas = page.locator('.grid-canvas[data-gridlines="true"]').first();
    const measured = await canvas.evaluate((grid) => {
      const probe = document.createElement('div');
      probe.style.cssText = 'position:absolute;left:0;top:0;height:1px;width:var(--wc-grid-column)';
      const was = grid.style.position;
      if (getComputedStyle(grid).position === 'static') grid.style.position = 'relative';
      grid.append(probe);
      const band = probe.getBoundingClientRect().width;
      probe.remove();
      grid.style.position = was;
      const style = getComputedStyle(grid);
      return {
        band,
        track: parseFloat(style.gridTemplateColumns.split(' ')[0] ?? '0'),
        gap: style.columnGap,
        image: style.backgroundImage,
      };
    });
    expect(Math.abs(measured.band - measured.track)).toBeLessThan(0.5);
    expect(measured.gap).toBe('16px');
    // Tinted 4 %, with the gutters between the bands left clear.
    expect(measured.image).toMatch(/0\.04\)|4%/);
    expect(measured.image).toMatch(/rgba\(0, 0, 0, 0\)|transparent/);

    // direction.md §2: "a stronger one during a drag or resize" (finding 11).
    const grip = page.getByTestId('grip-el-notes');
    const at = await grip.boundingBox();
    await page.mouse.move((at?.x ?? 0) + 4, (at?.y ?? 0) + 4);
    await page.mouse.down();
    await page.mouse.move((at?.x ?? 0) + 40, (at?.y ?? 0) + 40, { steps: 4 });
    await expect
      .poll(() => canvas.evaluate((grid) => getComputedStyle(grid).backgroundImage))
      .toMatch(/0\.1\)|10%/);
    await page.mouse.up();
  });

  test('in the dark theme the picker is on the raised surface', async ({ page }) => {
    // Finding 4: bg-raised and bg-surface are both white in the light theme.
    await page.getByRole('button', { name: /theme/i }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    const raised = await token(page, 'bg-raised', 'background-color');
    expect(raised).not.toBe(await token(page, 'bg-surface', 'background-color'));
    const tile = page.locator('[data-tile="tile-narrow"]');
    await tile.hover();
    await tile.getByRole('button', { name: /^Actions for / }).click();
    expect(await style(viewMenuOf(tile), 'background-color')).toEqual({
      'background-color': raised,
    });
  });

  test('a menu with nowhere to move to says so at the picker’s 12 px', async ({ page }) => {
    // Finding 10: the empty line inherited 14 px inside a 12 px menu.
    await edit(page);
    const tile = page.locator('[data-tile="el-region"]');
    await tile
      .getByRole('button', { name: /^Actions for / })
      .first()
      .click();
    const empty = tile.getByText('Nowhere else to move it yet.');
    await expect(empty).toBeVisible();
    expect(await style(empty, 'font-size')).toEqual({ 'font-size': '12px' });
  });
});

/**
 * T248: the edit sidebar's palette, the add slots, Properties and the Outline
 * as dashboard.js draws them (recheck-dashboard F19, F23; mismatches 23–26).
 * Its first half — the sidebar under a full-width band — came with T246.
 */
test.describe('T248: the edit sidebar', () => {
  const sidebar = (page: Page) => page.getByRole('complementary', { name: 'Edit sidebar' });
  test.beforeEach(async ({ page }) => {
    await page.goto(await editableSeed());
    await expect(firstChart(page).getByTestId('chart-canvas')).toBeVisible();
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await expect(sidebar(page)).toBeVisible();
  });

  test('the palette’s rows carry the kind’s 24 px chip, and the add slot is the prototype’s', async ({
    page,
  }) => {
    await sidebar(page).getByRole('tab', { name: 'Add' }).click();
    // <span class="ficon dim" style="width:24px;height:24px">▦</span>, gap 10 (mismatch 23)
    const chart = sidebar(page).getByTestId('add-chart');
    const chip = chart.locator('.add-panel__icon');
    expect(
      await style(chip, 'width', 'height', 'border-radius', 'background-color', 'color'),
    ).toEqual({
      width: '24px',
      height: '24px',
      'border-radius': '4px',
      'background-color': await token(page, 'bg-role-dimension-soft', 'background-color'),
      color: await token(page, 'role-dimension'),
    });
    expect(await style(chart, 'column-gap')).toEqual({ 'column-gap': '10px' });
    expect((await chart.boundingBox())?.height).toBe(50);

    // .dadd { min-height: 56px; font-weight: 600 } reading "＋ Add" (mismatch 24)
    const slot = page.getByRole('button', { name: /^Add to / }).first();
    await expect(slot).toHaveText('＋ Add');
    expect(await style(slot, 'min-height', 'font-weight')).toEqual({
      'min-height': '56px',
      'font-weight': '600',
    });
  });

  test('Properties: the chart’s title at 14, its buttons full width, the limit list at 12/600', async ({
    page,
    browserName,
  }) => {
    await firstChart(page).click();
    const properties = sidebar(page);
    await properties.getByRole('tab', { name: 'Properties' }).click();
    // (mismatch 25)
    expect(await style(properties.getByTestId('properties-chart-title'), 'font-size')).toEqual({
      'font-size': '14px',
    });
    const section = properties.locator('.chart-section');
    // Its content box: the section's width less its own padding.
    const width = await section.evaluate((node) => {
      const box = getComputedStyle(node);
      return node.clientWidth - parseFloat(box.paddingLeft) - parseFloat(box.paddingRight);
    });
    const edit = await properties.getByRole('button', { name: /Edit chart/ }).boundingBox();
    expect(edit?.width).toBeCloseTo(width, 0);
    const limits = properties.locator('.tile-limits');
    expect(
      await style(limits.locator('legend'), 'font-size', 'line-height', 'font-weight', 'color'),
    ).toEqual({
      'font-size': '12px',
      'line-height': '16px',
      'font-weight': '600',
      color: await token(page, 'text-secondary'),
    });
    const row = limits.locator('.tile-limits__row').first();
    // <label class="inline"> in a .field: 12/16/600 text-secondary (T248's review).
    expect(
      await style(row, 'font-size', 'line-height', 'font-weight', 'min-height', 'color'),
    ).toEqual({
      'font-size': '12px',
      'line-height': '16px',
      'font-weight': '600',
      'min-height': '28px',
      color: await token(page, 'text-secondary'),
    });
    // .select.sm { padding: 0 4px 0 8px } (mismatch 25; T248's review). WebKit
    // draws a native select with padding of its own and computes the author's
    // as 0, as the prototype's is in Safari too, so it is measured elsewhere.
    if (browserName !== 'webkit')
      for (const select of await properties.locator('.panel-section select').all())
        expect(await style(select, 'padding-left', 'padding-right')).toEqual({
          'padding-left': '8px',
          'padding-right': '4px',
        });
    // Every action in the chart's section is full width, not only Edit chart.
    for (const button of await section.locator(':scope > button').all())
      expect((await button.boundingBox())?.width).toBeCloseTo(width, 0);
    // The selected tile's ring: 2 px solid accent, 2 px out, as .dtile.selected
    // (mismatch 25) — not the dashed 1 px every tile wears while editing.
    expect(
      await style(
        firstChart(page),
        'outline-offset',
        'outline-style',
        'outline-width',
        'outline-color',
      ),
    ).toEqual({
      'outline-offset': '2px',
      'outline-style': 'solid',
      'outline-width': '2px',
      'outline-color': await token(page, 'accent'),
    });
  });

  test('deleting the last tile on a page lets go of it: the page tabs come back (T248’s review)', async ({
    page,
    request,
  }) => {
    const api = 'http://localhost:4100/api';
    const title = `Last tile ${String(Date.now())}`;
    const { id } = (await (
      await request.post(`${api}/documents`, {
        data: { kind: 'dashboard', title, ...IN_MY_WORKSPACE },
      })
    ).json()) as { id: string };
    await request.put(`${api}/documents/dashboard/${id}`, {
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
              items: [{ id: 'el-note', kind: 'markdown', w: 6, h: 16, text: 'A note.' }],
            },
            { id: 'second', title: 'Second', items: [] },
          ],
        },
      },
    });
    await page.goto(`/explore/dashboards/${id}`);
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    const note = page.locator('[data-tile="el-note"]');
    await note.click();
    await sidebar(page).getByRole('tab', { name: 'Properties' }).click();
    const pageTabs = sidebar(page).getByRole('heading', { name: 'Page tabs', level: 3 });
    await expect(pageTabs).toHaveCount(0);
    await note.hover();
    await note.getByRole('button', { name: /^Actions for / }).click();
    await page.getByTestId('delete-el-note').click();
    await expect(note).toHaveCount(0);
    // Nothing is selected now, so the dashboard's own properties show.
    await expect(pageTabs).toBeVisible();
  });

  test('an empty container’s slot says what it takes, and its name starts with those words', async ({
    page,
    request,
  }) => {
    // T248's review: the visible words were "＋ Add to this section" and the
    // name "Add to Only › Terms" — a speech-input user saying what they see
    // did not match it (WCAG 2.5.3).
    const api = 'http://localhost:4100/api';
    const title = `Empty section ${String(Date.now())}`;
    const { id } = (await (
      await request.post(`${api}/documents`, {
        data: { kind: 'dashboard', title, ...IN_MY_WORKSPACE },
      })
    ).json()) as { id: string };
    await request.put(`${api}/documents/dashboard/${id}`, {
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
              items: [{ id: 'el-terms', kind: 'section', title: 'Terms', items: [] }],
            },
            { id: 'blank', title: 'Blank', items: [] },
          ],
        },
      },
    });
    await page.goto(`/explore/dashboards/${id}`);
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    const inSection = page.getByTestId('add-here-sec:el-terms');
    await expect(inSection).toHaveText('＋ Add to this section');
    await expect(inSection).toHaveAccessibleName(/^Add to this section/);
    await expect(inSection).toHaveAccessibleName(/Terms/);
    // The page's own slot, once it holds something, reads "＋ Add".
    const onPage = page.getByTestId('add-here-page:only');
    await expect(onPage).toHaveText('＋ Add');
    await expect(onPage).toHaveAccessibleName(/^Add/);
    // An empty page: what it takes.
    await page.getByRole('tab', { name: 'Blank' }).click();
    const blank = page.getByTestId('add-here-page:blank');
    await expect(blank).toHaveText('＋ Add a chart, section or text');
    await expect(blank).toHaveAccessibleName(/^Add a chart, section or text/);
  });

  test('the page tabs are the dashboard’s properties, shown with nothing selected, and Escape selects nothing', async ({
    page,
  }) => {
    await sidebar(page).getByRole('tab', { name: 'Properties' }).click();
    const pageTabs = sidebar(page).getByRole('heading', { name: 'Page tabs', level: 3 });
    await expect(pageTabs).toBeVisible();
    // A tile selected: its own properties, and not the dashboard's (F19).
    await firstChart(page).click();
    await expect(pageTabs).toHaveCount(0);
    // Escape lets go of the selection, as the prototype's does.
    await page.keyboard.press('Escape');
    await expect(pageTabs).toBeVisible();
    await expect(firstChart(page)).not.toHaveAttribute('data-selected', 'true');
  });

  test('the Outline’s rows carry the kind’s 18 px chip, padded 0 12 0 26', async ({ page }) => {
    await sidebar(page).getByRole('tab', { name: 'Outline' }).click();
    const row = sidebar(page).locator('.outline__row').first();
    // <button class="file" style="padding-left:26px"><span class="ficon dim" style="width:18px;height:18px"> (mismatch 26)
    expect(await style(row, 'padding-top', 'padding-right', 'padding-left')).toEqual({
      'padding-top': '0px',
      'padding-right': '12px',
      'padding-left': '26px',
    });
    expect(
      await style(row.locator('.outline__icon'), 'width', 'height', 'background-color', 'color'),
    ).toEqual({
      width: '18px',
      height: '18px',
      'background-color': await token(page, 'bg-role-dimension-soft', 'background-color'),
      color: await token(page, 'role-dimension'),
    });
  });
});

/**
 * T257 (AC-187, AC-214): the chart editor as the prototype draws it — its
 * header's icon buttons and heading-like title, the field list's role chips
 * and "used" dot, dashed wells with an inline "+" picker and role-tinted
 * pills, the preview in a tile, the drawer's tab strip and data grid, and the
 * empty state in the tile (recheck-chart-editor F4–F7, F18, N3, N4).
 *
 * Every value was measured on the prototype's editor (editor.js 404–481,
 * index.html 504–1124) at 1,440 × 900 on 2026-09-25; the rule each one comes
 * from is quoted beside the check that uses it.
 */
test.describe('T257: the chart editor', () => {
  const EDITOR = '/explore/charts/seed-chart-axes/edit';
  const editorReady = async (page: Page) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(EDITOR);
    await expect(page.getByTestId('result-row-count')).toBeVisible();
    // At rest: nothing focused, nothing hovered.
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.mouse.move(0, 899);
  };

  test('the header: Undo and Redo are 32 px icon buttons, the title reads as a heading', async ({
    page,
  }) => {
    await editorReady(page);
    const head = page.getByTestId('editor-bar');
    // .iconbtn { width: 32px; height: 32px; border: 1px solid transparent; border-radius: 6px;
    //            background: none; color: var(--text-secondary) }, "↶" and "↷" (editor.js 408)
    for (const [name, glyph] of [
      ['Undo', '↶'],
      ['Redo', '↷'],
    ] as const) {
      const button = head.getByRole('button', { name, exact: true });
      await expect(button).toHaveText(glyph);
      expect(
        await style(
          button,
          'width',
          'height',
          'border-top-width',
          'border-top-color',
          'border-radius',
          'background-color',
          'color',
          'font-size',
        ),
      ).toEqual({
        width: '32px',
        height: '32px',
        'border-top-width': '1px',
        'border-top-color': 'rgba(0, 0, 0, 0)',
        'border-radius': '6px',
        'background-color': 'rgba(0, 0, 0, 0)',
        color: await token(page, 'text-secondary'),
        'font-size': '14px',
      });
      // disabled … style="opacity:.4" (editor.js 408)
      expect(await style(button, 'opacity')).toEqual({ opacity: '0.4' });
    }
    // <input class="input" style="font-weight:600;font-size:15px;border-color:transparent;background:transparent">
    const title = head.getByRole('textbox', { name: 'Chart title' });
    expect(
      await style(
        title,
        'height',
        'font-size',
        'font-weight',
        'border-top-color',
        'background-color',
      ),
    ).toEqual({
      height: '32px',
      // 16, text-md, not the drawn 15 (components-Q3; T688).
      'font-size': '16px',
      'font-weight': '600',
      'border-top-color': 'rgba(0, 0, 0, 0)',
      'background-color': 'rgba(0, 0, 0, 0)',
    });
    // .editor-page { grid-template-columns: 280px minmax(0, 1fr) 360px }
    const inspector = page.getByRole('complementary', { name: 'Chart settings' });
    expect((await inspector.boundingBox())?.width).toBe(360);
  });

  test('the field list: 18 px role chips, a 6 px "used" dot, 12 px rows under 28 px cube heads', async ({
    page,
  }) => {
    await editorReady(page);
    const fields = page.getByRole('complementary', { name: 'Fields' });

    // .tree-search input.input.sm { height: 28px; font-size: 12px }
    expect(await style(fields.getByLabel('Search fields'), 'height', 'font-size')).toEqual({
      height: '28px',
      'font-size': '12px',
    });
    // .tgroup-head { height: 28px; font-size: 12px; font-weight: 600; color: var(--text-secondary) }
    // .tgroup-head .count { font-weight: 400; color: var(--text-muted) }
    const cube = fields.locator('.field-list__cube-head').first();
    expect(await style(cube, 'height', 'font-size', 'font-weight', 'color')).toEqual({
      height: '28px',
      'font-size': '12px',
      'font-weight': '600',
      color: await token(page, 'text-secondary'),
    });
    expect(await style(cube.locator('.field-list__count'), 'font-weight', 'color')).toEqual({
      'font-weight': '400',
      color: await token(page, 'text-muted'),
    });

    // .frow { height: 28px; padding: 0 12px 0 22px; font-size: 12px; gap: 8px; border-radius: 4px }
    const count = fields.getByTestId('member-orders.count').locator('.field-row');
    expect(
      await style(
        count,
        'height',
        'padding-left',
        'padding-right',
        'font-size',
        'column-gap',
        'border-radius',
      ),
    ).toEqual({
      height: '28px',
      'padding-left': '22px',
      'padding-right': '12px',
      'font-size': '12px',
      'column-gap': '8px',
      'border-radius': '4px',
    });
    // .ficon { width: 18px; height: 18px; border-radius: 4px; font-size: 12px; font-weight: 600 }
    // .ficon.measure { color: var(--role-measure); background: var(--role-measure-soft) }
    // .ficon.dim { color: var(--role-dim); background: var(--role-dim-soft) }
    const chip = (member: string) =>
      fields.getByTestId(`member-${member}`).locator('.field-row__icon');
    const chipStyle = (member: string) =>
      style(
        chip(member),
        'width',
        'height',
        'border-radius',
        'font-size',
        'font-weight',
        'color',
        'background-color',
      );
    expect(await chipStyle('orders.count')).toEqual({
      width: '18px',
      height: '18px',
      'border-radius': '4px',
      'font-size': '12px',
      'font-weight': '600',
      color: await token(page, 'role-measure'),
      'background-color': await token(page, 'bg-role-measure-soft', 'background-color'),
    });
    expect(await chipStyle('orders.status')).toEqual({
      width: '18px',
      height: '18px',
      'border-radius': '4px',
      'font-size': '12px',
      'font-weight': '600',
      color: await token(page, 'role-dimension'),
      'background-color': await token(page, 'bg-role-dimension-soft', 'background-color'),
    });
    // A dimension's chip names its type, as direction.md §5 has it: Aa, #, ◷.
    await expect(chip('orders.status')).toHaveText('Aa');
    await expect(chip('orders.id')).toHaveText('#');
    await expect(chip('orders.ordered_at')).toHaveText('◷');

    // .frow.used .fname::after { width: 6px; height: 6px; border-radius: 50%; background: var(--accent) }
    const dot = count.locator('.field-row__used');
    expect(await style(dot, 'width', 'height', 'border-radius', 'background-color')).toEqual({
      width: '6px',
      height: '6px',
      'border-radius': '50%',
      'background-color': await token(page, 'accent', 'background-color'),
    });
    await expect(count).toContainText('in the chart');
    await expect(count).not.toContainText('✓');
    // .fname is 400 whether used or not; .fmeta is muted.
    expect(await style(count.locator('.field-row__name'), 'font-weight')).toEqual({
      'font-weight': '400',
    });
    expect(await style(count.locator('.field-row__meta'), 'color')).toEqual({
      color: await token(page, 'text-muted'),
    });
  });

  test('the wells: a 12/600 label over a dashed well, role-tinted pills and an inline "+" picker', async ({
    page,
  }) => {
    await editorReady(page);
    const inspector = page.getByRole('complementary', { name: 'Chart settings' });

    // .field > .lbl { font-size: 12px; line-height: 16px; font-weight: 600; color: var(--text-secondary) }
    const label = inspector.getByRole('heading', { name: 'Metrics', exact: true });
    expect(await style(label, 'font-size', 'line-height', 'font-weight', 'color')).toEqual({
      'font-size': '12px',
      'line-height': '16px',
      'font-weight': '600',
      color: await token(page, 'text-secondary'),
    });
    // .well { border: 1px dashed var(--border-strong); border-radius: 6px; padding: 6px;
    //         background: var(--bg-surface) } with min-height:36px (editor.js 222)
    const well = page.getByTestId('well-measures');
    expect(
      await style(
        well,
        'border-top-width',
        'border-top-style',
        'border-top-color',
        'border-radius',
        'padding-top',
        'padding-left',
        'background-color',
      ),
    ).toEqual({
      'border-top-width': '1px',
      'border-top-style': 'dashed',
      'border-top-color': await token(page, 'border-strong', 'background-color'),
      'border-radius': '6px',
      // Design 01's 5 (02:283; T688, EDI-09).
      'padding-top': '5px',
      'padding-left': '5px',
      'background-color': await token(page, 'bg-surface', 'background-color'),
    });
    expect((await well.boundingBox())?.height).toBeGreaterThanOrEqual(36);
    // The label sits above its well, not inside it.
    expect((await label.boundingBox())!.y).toBeLessThan((await well.boundingBox())!.y);

    // .pill { height: 24px; padding: 0 4px 0 6px; border-radius: 4px; font-size: 12px; font-weight: 600 }
    // .pill.measure { background: var(--role-measure-soft); color: var(--role-measure) }
    const pill = page.getByTestId('in-measures-orders.count');
    const pillStyle = (locator: Locator) =>
      style(
        locator,
        'height',
        'padding-left',
        'padding-right',
        'border-radius',
        'border-top-width',
        'font-size',
        'font-weight',
        'color',
        'background-color',
      );
    expect(await pillStyle(pill)).toEqual({
      height: '24px',
      'padding-left': '6px',
      'padding-right': '4px',
      'border-radius': '4px',
      'border-top-width': '0px',
      'font-size': '12px',
      'font-weight': '600',
      color: await token(page, 'role-measure'),
      'background-color': await token(page, 'bg-role-measure-soft', 'background-color'),
    });
    // .pill.dim { background: var(--role-dim-soft); color: var(--role-dim) }
    expect(await pillStyle(page.getByTestId('in-dimensions-orders.status'))).toEqual({
      height: '24px',
      'padding-left': '6px',
      'padding-right': '4px',
      'border-radius': '4px',
      'border-top-width': '0px',
      'font-size': '12px',
      'font-weight': '600',
      color: await token(page, 'role-dimension'),
      'background-color': await token(page, 'bg-role-dimension-soft', 'background-color'),
    });
    // .pill .agg { font-weight: 400 } — at full strength: the prototype's
    // opacity .85 takes the measure's ink under AA on its tint (rule 2). A
    // measure's aggregation tag is the menu of its quick calculations (T380).
    expect(
      await style(
        pill.getByRole('button', { name: 'Calculations on Count' }),
        'font-weight',
        'opacity',
      ),
    ).toEqual({
      'font-weight': '400',
      opacity: '1',
    });
    // .pill button { width: 18px; height: 18px; border-radius: 3px; color: inherit }
    expect(
      await style(
        pill.getByRole('button', { name: 'Remove Count from Metrics' }),
        'width',
        'height',
        'border-radius',
        'color',
      ),
    ).toEqual({
      width: '18px',
      height: '18px',
      'border-radius': '3px',
      color: await token(page, 'role-measure'),
    });

    // .addbtn { height: 24px; padding: 0 6px; border: 0; border-radius: 4px; font-size: 12px;
    //           color: var(--text-muted); background: none }, "+ metric" inside the well
    const add = well.getByRole('button', { name: 'Add to Metrics' });
    await expect(add).toHaveText('+ metric');
    expect(
      await style(
        add,
        'height',
        'padding-left',
        'border-top-width',
        'border-radius',
        'font-size',
        'color',
        'background-color',
      ),
    ).toEqual({
      height: '24px',
      'padding-left': '6px',
      'border-top-width': '0px',
      'border-radius': '4px',
      'font-size': '12px',
      color: await token(page, 'text-muted'),
      'background-color': 'rgba(0, 0, 0, 0)',
    });
    // Inline after the pills, not a grid of its own (T688's review): its
    // inline-block, as a flex item of the well, computes to "block" (CSS
    // Display 3, blockification); the grid it lost to computed "grid".
    expect(await style(well.locator('.cube-picker--add'), 'display')).toEqual({
      display: 'block',
    });
    // The picker it opens, as 2026-09-24 design 01 state A draws it, later
    // than the prototype's 240 px menu (R37; T688, EDI-11): 264 px, a filter
    // over the fields by cube, each with its chip, the one held "✓ in chart".
    await add.click();
    const picker = page.locator('.cube-picker__pop--fields');
    await expect(picker).toBeVisible();
    expect(await style(picker, 'width', 'border-radius', 'background-color')).toEqual({
      width: '264px',
      'border-radius': '6px',
      'background-color': await token(page, 'bg-raised', 'background-color'),
    });
    // At its well's left edge, as design 01 state A draws it, so it stays
    // inside the inspector however far the pills push the "+" (T257's
    // review; T688's review).
    const [menuBox, wellBox, inspectorBox] = await Promise.all(
      [picker, well, inspector].map((each) => each.boundingBox()),
    );
    // At the well's padding edge, inside its 1 px rule, as measured on the prototype.
    expect(Math.abs(menuBox!.x - wellBox!.x)).toBeLessThanOrEqual(1);
    expect(menuBox!.x + menuBox!.width).toBeLessThanOrEqual(inspectorBox!.x + inspectorBox!.width);
    const list = page.getByRole('listbox', { name: 'Fields' });
    const total = list.getByTestId('pick-orders.total_amount');
    await expect(total.locator('.field-row__icon')).toHaveText('Σ');
    // What the well already holds, listed and not offered.
    await expect(list.getByTestId('pick-orders.count')).toHaveAttribute('aria-disabled', 'true');
    await total.click();
    await expect(page.getByTestId('in-measures-orders.total_amount')).toBeVisible();
    await expect(add).toBeFocused();

    // The other wells' buttons say what they add (editor.js 275–297).
    await expect(
      page.getByTestId('well-dimensions').getByRole('button', { name: 'Add to Dimensions' }),
    ).toHaveText('+ dimension');
    await expect(
      page.getByTestId('well-timeDimensions').getByRole('button', { name: 'Add to Time' }),
      // "+ time dimension", design 01's words (T688, EDI-09).
    ).toHaveText('+ time dimension');
    await expect(
      page.getByTestId('well-filters').getByRole('button', { name: 'Add a filter' }),
    ).toHaveText('+ filter');

    // Sort by and Top N side by side under the wells, as .input.sm / .select.sm (editor.js 298–307).
    const sort = inspector.getByLabel('Sort');
    const top = inspector.getByLabel('Top N (+ Other)');
    expect(await style(sort, 'height', 'font-size')).toEqual({
      height: '28px',
      'font-size': '12px',
    });
    expect(await style(top, 'height', 'font-size')).toEqual({
      height: '28px',
      'font-size': '12px',
    });
    // Read together: the wells above still settle as the chart's answer
    // comes, moving both rows at once between two separate reads.
    expect(
      await sort.evaluate(
        (node, other) => node.getBoundingClientRect().y - other!.getBoundingClientRect().y,
        await top.elementHandle(),
      ),
    ).toBe(0);
  });

  test('the preview sits in a tile, over a drawer whose tabs always show, its rows a data grid', async ({
    page,
  }) => {
    await editorReady(page);
    // .tile { border: 1px solid var(--border-subtle); border-radius: 6px; padding: 16px;
    //         background: var(--bg-surface) } around #ed-chart (editor.js 414)
    const frame = page.getByTestId('preview-frame');
    await expect(frame.getByTestId('chart-canvas')).toBeVisible();
    expect(
      await style(
        frame,
        'border-top-width',
        'border-top-color',
        'border-radius',
        'padding-top',
        'background-color',
      ),
    ).toEqual({
      'border-top-width': '1px',
      'border-top-color': await token(page, 'border-subtle', 'background-color'),
      'border-radius': '6px',
      'padding-top': '16px',
      'background-color': await token(page, 'bg-surface', 'background-color'),
    });

    // .drawer { height: 220px; border-top: 1px solid var(--border-subtle); background: var(--bg-surface) },
    // open by default on Results (editor.js 183, 416).
    const drawer = page.getByTestId('results-drawer');
    await expect(drawer).toBeVisible();
    expect(await style(drawer, 'height', 'border-top-width', 'background-color')).toEqual({
      height: '220px',
      'border-top-width': '1px',
      'background-color': await token(page, 'bg-surface', 'background-color'),
    });
    // .tabs button { height: 36px; padding: 0 10px; font-size: 12px; font-weight: 600;
    //                color: var(--text-secondary); border-bottom: 2px solid transparent }
    // [aria-selected=true] { color: var(--accent); border-bottom-color: var(--accent) }
    const tabs = drawer.getByRole('tablist', { name: 'Results' });
    await expect(tabs.getByRole('tab')).toHaveText([
      'Results',
      'Underlying rows',
      'Cube query',
      'Acceleration',
    ]);
    const selected = tabs.getByRole('tab', { name: 'Results' });
    await expect(selected).toHaveAttribute('aria-selected', 'true');
    expect(
      await style(
        selected,
        'height',
        'padding-left',
        'font-size',
        'font-weight',
        'color',
        'border-bottom-width',
        'border-bottom-color',
      ),
    ).toEqual({
      height: '36px',
      'padding-left': '10px',
      'font-size': '12px',
      'font-weight': '600',
      color: await token(page, 'accent'),
      'border-bottom-width': '2px',
      'border-bottom-color': await token(page, 'accent', 'background-color'),
    });
    expect(
      await style(tabs.getByRole('tab', { name: 'Cube query' }), 'color', 'border-bottom-color'),
    ).toEqual({
      color: await token(page, 'text-secondary'),
      'border-bottom-color': 'rgba(0, 0, 0, 0)',
    });

    // .grid-table { font-size: 12px; font-variant-numeric: tabular-nums }
    // th { position: sticky; height: 28px; background: var(--bg-subtle); text-align: left; font-weight: 600 }
    // td { height: 24px; padding: 0 8px } td.num { text-align: right }
    const table = drawer.getByTestId('drawer-result-rows');
    expect(await style(table, 'font-size', 'font-variant-numeric')).toEqual({
      'font-size': '12px',
      'font-variant-numeric': 'tabular-nums',
    });
    const header = table.getByRole('columnheader', { name: 'Orders Status' });
    expect(
      await style(header, 'height', 'position', 'background-color', 'text-align', 'font-weight'),
    ).toEqual({
      height: '28px',
      position: 'sticky',
      'background-color': await token(page, 'bg-subtle', 'background-color'),
      'text-align': 'left',
      'font-weight': '600',
    });
    const cells = table.locator('tbody tr').first().getByRole('cell');
    // A dimension's cell keeps the start alignment, as measured on the prototype.
    expect(await style(cells.first(), 'height', 'padding-left', 'text-align')).toEqual({
      height: '24px',
      'padding-left': '8px',
      'text-align': 'start',
    });
    // The count, a measure, is a number and lines up on the right.
    expect(await style(cells.last(), 'text-align')).toEqual({ 'text-align': 'right' });
    expect(
      await style(table.getByRole('columnheader', { name: 'Orders Count' }), 'text-align'),
    ).toEqual({ 'text-align': 'right' });

    // Collapsed, the strip stays, so the drawer can always be found (UX-058).
    await drawer.getByRole('button', { name: 'Hide the results' }).click();
    await expect(table).toHaveCount(0);
    await expect(tabs).toBeVisible();
    await tabs.getByRole('tab', { name: 'Cube query' }).click();
    await expect(drawer.getByTestId('drawer-query')).toBeVisible();
  });

  test('mid-drag in the dark theme, a legal well’s "+" keeps AA on the accent’s tint (T257’s review)', async ({
    page,
  }) => {
    await page.addInitScript(() => window.localStorage.setItem('wechart.theme', 'dark'));
    await editorReady(page);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    const field = page.getByTestId('member-orders.total_amount');
    const from = (await field.boundingBox())!;
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    const to = (await page.getByTestId('well-dimensions').boundingBox())!;
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 8 });
    const well = page.getByTestId('well-measures');
    await expect(well).toHaveAttribute('data-drop', 'legal');
    // text-secondary on bg-accent-soft is an audited pair; text-muted there is 4.28:1.
    expect(await style(well.getByRole('button', { name: 'Add to Metrics' }), 'color')).toEqual({
      color: await token(page, 'text-secondary'),
    });
    await page.mouse.up();
  });

  test('Actual size and Fit are the prototype’s segmented control, the chosen one on the accent’s tint', async ({
    page,
  }) => {
    await page.goto(await editableSeed());
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.getByTestId('edit-chart-tile-status').click();
    const sizes = page.getByRole('group', { name: 'Preview size' });
    // .seg { border: 1px solid var(--border-strong); border-radius: 4px }
    // .seg button { height: 28px; padding: 0 10px; font-size: 12px }
    // [aria-pressed='true'] { background: var(--accent-soft); color: var(--accent); font-weight: 600 }
    expect(await style(sizes, 'border-top-width', 'border-top-color', 'border-radius')).toEqual({
      'border-top-width': '1px',
      'border-top-color': await token(page, 'border-strong', 'background-color'),
      'border-radius': '4px',
    });
    const actual = sizes.getByRole('button', { name: 'Actual size' });
    await expect(actual).toHaveAttribute('aria-pressed', 'true');
    expect(
      await style(
        actual,
        'height',
        'padding-left',
        'font-size',
        'font-weight',
        'color',
        'background-color',
      ),
    ).toEqual({
      height: '28px',
      'padding-left': '10px',
      'font-size': '12px',
      'font-weight': '600',
      color: await token(page, 'accent'),
      'background-color': await token(page, 'bg-accent-soft', 'background-color'),
    });
    expect(
      await style(sizes.getByRole('button', { name: 'Fit' }), 'font-weight', 'background-color'),
    ).toEqual({
      'font-weight': '400',
      'background-color': await token(page, 'bg-surface', 'background-color'),
    });
  });

  test('the empty state: two lines in the tile, 16/600 over 12 px secondary', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/explore/charts/seed-chart-empty/edit');
    const empty = page.getByTestId('result-empty');
    await expect(empty).toBeVisible();
    // It is drawn in the preview's tile.
    await expect(page.getByTestId('preview-frame').getByTestId('result-empty')).toBeVisible();
    // <div class="strong" style="font-size:16px;color:var(--text-primary)"> over
    // <p class="xs">Click fields on the left, or use the + buttons under Metrics and Dimensions.</p>
    const headline = empty.getByText('Add at least one metric or dimension', { exact: true });
    expect(await style(headline, 'font-size', 'font-weight', 'color')).toEqual({
      'font-size': '16px',
      'font-weight': '600',
      color: await token(page, 'text-primary'),
    });
    const line = empty.getByText(
      'Click fields on the left, or use the + buttons under Metrics and Dimensions.',
      { exact: true },
    );
    expect(await style(line, 'font-size', 'color')).toEqual({
      'font-size': '12px',
      color: await token(page, 'text-secondary'),
    });
  });
});

/**
 * T249 (AC-187, AC-231): the dashboard settings page as the prototype draws it
 * (dash-settings.js, index.html 2107–2205) — its bar, nav, flat content, mode
 * cards, inactive banner and markings tables, and Escape leaving as Cancel
 * does (recheck-dashboard F26–F29; mismatches 27–34).
 *
 * Measured on the prototype's settings page at 1,440 × 900 on 2026-09-25.
 * Weights are direction.md's 600 where the prototype's headings are 700
 * (direction.md §3: only 400 and 600).
 */
test.describe('T249: the dashboard settings page', () => {
  const openSettings = async (page: Page) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    // The copy's settings, which the single user may change.
    await page.goto(await editableSeed());
    await page.getByRole('button', { name: 'Dashboard settings' }).click();
    const settings = page.getByTestId('dashboard-settings');
    await expect(settings.getByRole('heading', { name: 'General', level: 2 })).toBeVisible();
    return settings;
  };
  const section = (settings: Locator, name: string) =>
    settings
      .getByRole('navigation', { name: 'Settings sections' })
      .locator(`[data-section="${name}"]`);

  test('the bar: 41 px, titled "Dashboard settings", its buttons 24 px and Save the primary', async ({
    page,
  }) => {
    const settings = await openSettings(page);
    // .settings-head { padding: 8px 16px; border-bottom: 1px solid var(--border-subtle);
    //                  background: var(--bg-surface) } — 41 px measured
    const bar = settings.locator('.settings-page__bar');
    expect(
      await style(
        bar,
        'height',
        'padding-left',
        'background-color',
        'border-bottom-width',
        'border-bottom-color',
      ),
    ).toEqual({
      height: '41px',
      'padding-left': '16px',
      'background-color': await token(page, 'bg-surface', 'background-color'),
      'border-bottom-width': '1px',
      'border-bottom-color': await token(page, 'border-subtle', 'background-color'),
    });
    // .settings-head h1 { font-size: 16px } "Dashboard settings"
    const title = bar.getByRole('heading', { name: 'Dashboard settings', level: 1 });
    expect(await style(title, 'font-size', 'font-weight')).toEqual({
      'font-size': '16px',
      'font-weight': '600',
    });
    // .btn.sm { height: 24px; padding: 0 8px; font-size: 12px; border-radius: 6px }
    for (const name of [/^← Back to/, /^Cancel$/, /^Save settings$/]) {
      expect(
        await style(bar.getByRole('button', { name }), 'height', 'font-size', 'border-radius'),
      ).toEqual({ height: '24px', 'font-size': '12px', 'border-radius': '6px' });
    }
    // .btn.primary
    expect(
      await style(
        bar.getByRole('button', { name: 'Save settings' }),
        'background-color',
        'color',
        'font-weight',
      ),
    ).toEqual({
      'background-color': await token(page, 'accent', 'background-color'),
      color: await token(page, 'text-on-accent'),
      'font-weight': '600',
    });
  });

  test('the nav: 220 px, 32 px rows, the open section on the accent’s tint; the content flat', async ({
    page,
  }) => {
    const settings = await openSettings(page);
    // .settings-nav { width: 220px; border-right: 1px solid var(--border-subtle); background: var(--bg-surface) }
    const nav = settings.getByRole('navigation', { name: 'Settings sections' });
    expect(
      await style(nav, 'width', 'background-color', 'border-right-width', 'border-right-color'),
    ).toEqual({
      width: '220px',
      'background-color': await token(page, 'bg-surface', 'background-color'),
      'border-right-width': '1px',
      'border-right-color': await token(page, 'border-subtle', 'background-color'),
    });
    // .settings-nav .file { height: 32px; padding: 0 12px 0 24px; font-size: 12px }
    // .file[aria-current='true'] { background: var(--accent-soft); color: var(--accent); font-weight: 600 }
    const rowStyle = (name: string) =>
      style(
        section(settings, name),
        'height',
        'padding-left',
        'font-size',
        'border-radius',
        'background-color',
        'color',
        'font-weight',
      );
    expect(await rowStyle('General')).toEqual({
      height: '32px',
      'padding-left': '24px',
      'font-size': '12px',
      'border-radius': '0px',
      'background-color': await token(page, 'bg-accent-soft', 'background-color'),
      color: await token(page, 'accent'),
      'font-weight': '600',
    });
    expect(await rowStyle('Layout')).toEqual({
      height: '32px',
      'padding-left': '24px',
      'font-size': '12px',
      'border-radius': '0px',
      'background-color': 'rgba(0, 0, 0, 0)',
      color: await token(page, 'text-primary'),
      'font-weight': '400',
    });

    // .settings-inner { padding: 16px 24px 48px } — flat, no card round it
    const panel = settings.getByRole('region', { name: 'General settings' });
    expect(
      await style(
        panel,
        'padding-top',
        'padding-left',
        'padding-bottom',
        'border-top-width',
        'background-color',
      ),
    ).toEqual({
      'padding-top': '16px',
      'padding-left': '24px',
      'padding-bottom': '48px',
      'border-top-width': '0px',
      'background-color': 'rgba(0, 0, 0, 0)',
    });
    // .settings-inner h2 { font-size: 18px }
    expect(
      await style(
        panel.getByRole('heading', { name: 'General', level: 2 }),
        'font-size',
        'font-weight',
      ),
    ).toEqual({ 'font-size': '18px', 'font-weight': '600' });
    // .field > label 12/16/600 secondary; Name and Folder side by side (.formgrid), Description wide
    const name = panel.getByLabel('Name', { exact: true });
    const folder = panel.getByLabel('Folder', { exact: true });
    const description = panel.getByLabel('Description', { exact: true });
    expect(
      await style(
        panel.locator('label', { hasText: /^Name$/ }),
        'font-size',
        'line-height',
        'font-weight',
        'color',
      ),
    ).toEqual({
      'font-size': '12px',
      'line-height': '16px',
      'font-weight': '600',
      color: await token(page, 'text-secondary'),
    });
    const [nameBox, folderBox, descriptionBox] = await Promise.all(
      [name, folder, description].map((field) => field.boundingBox()),
    );
    expect(nameBox!.y).toBe(folderBox!.y);
    expect(folderBox!.x).toBeGreaterThan(nameBox!.x + nameBox!.width);
    expect(descriptionBox!.y).toBeGreaterThan(nameBox!.y + nameBox!.height);
    expect(descriptionBox!.width).toBeGreaterThan(folderBox!.x + folderBox!.width - nameBox!.x - 1);
  });

  test('Interactions: two described radio cards, the chosen one on the accent', async ({
    page,
  }) => {
    const settings = await openSettings(page);
    await section(settings, 'Interactions').click();
    const markings = settings.getByRole('radio', { name: 'Markings', exact: true });
    const cross = settings.getByRole('radio', {
      name: 'Cross-filtering and cross-highlighting',
      exact: true,
    });
    await expect(markings).toBeChecked();
    // .radio-card { padding: 12px; border: 1px solid var(--border-strong); border-radius: 8px }
    // .radio-card.on { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent) }
    const card = (radio: Locator) => radio.locator('xpath=ancestor::label[1]');
    expect(await style(card(markings), 'padding-top', 'border-radius', 'border-top-color')).toEqual(
      {
        'padding-top': '12px',
        'border-radius': '8px',
        'border-top-color': await token(page, 'accent', 'background-color'),
      },
    );
    expect(await style(card(cross), 'border-top-color')).toEqual({
      'border-top-color': await token(page, 'border-strong', 'background-color'),
    });
    // .radio-card input { accent-color: var(--accent) } — not the browser's blue (F27)
    expect(await style(markings, 'accent-color')).toEqual({
      'accent-color': await token(page, 'accent'),
    });
    // Each card says what the mode does (F27), read as the radio's description.
    await expect(markings).toHaveAccessibleDescription(/marks items in a named, coloured marking/);
    await expect(cross).toHaveAccessibleDescription(/filters or highlights the other tiles/);
  });

  test('an inactive section says so in a banner, with its icon (F28)', async ({ page }) => {
    const settings = await openSettings(page);
    await section(settings, 'Cross-filtering').click();
    // .warnbar with SV.warn: "Inactive: this dashboard uses Markings. …"
    const banner = settings
      .getByRole('note')
      .filter({ hasText: 'Inactive: this dashboard uses Markings' });
    await expect(banner).toBeVisible();
    await expect(banner.locator('[data-icon="warn"]')).toHaveCount(1);
    expect(await style(banner, 'font-size', 'border-radius', 'padding-left')).toEqual({
      'font-size': '12px',
      'border-radius': '6px',
      'padding-left': '12px',
    });
    // And Markings, once the draft cross-filters.
    await section(settings, 'Interactions').click();
    await settings.getByRole('radio', { name: 'Cross-filtering and cross-highlighting' }).check();
    await section(settings, 'Markings').click();
    await expect(
      settings
        .getByRole('note')
        .filter({ hasText: 'Inactive: this dashboard uses cross-filtering' })
        .locator('[data-icon="warn"]'),
    ).toHaveCount(1);
  });

  test('Escape leaves as Cancel does: at once with nothing changed, and asking first with a change (F29)', async ({
    page,
  }) => {
    let settings = await openSettings(page);
    await page.keyboard.press('Escape');
    await expect(settings).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Dashboard settings' })).toBeFocused();

    settings = await openSettings(page);
    await settings.getByLabel('Description', { exact: true }).fill('Changed');
    await page.keyboard.press('Escape');
    const question = page.getByRole('alertdialog', { name: 'Discard your changes?' });
    await expect(question).toBeVisible();
    // Escape on the question is "Keep editing": the page and the change stay.
    await page.keyboard.press('Escape');
    await expect(question).toHaveCount(0);
    await expect(settings.getByLabel('Description', { exact: true })).toHaveValue('Changed');
    await page.keyboard.press('Escape');
    await question.getByRole('button', { name: 'Discard changes' }).click();
    await expect(settings).toHaveCount(0);
  });

  test('Escape that closes the search palette leaves the settings page open (T249’s review)', async ({
    page,
  }) => {
    const settings = await openSettings(page);
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+k' : 'Control+k');
    const palette = page.getByRole('dialog', { name: /search/i });
    await expect(palette).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(palette).toBeHidden();
    await expect(settings).toBeVisible();
    await expect(page.getByRole('alertdialog', { name: 'Discard your changes?' })).toHaveCount(0);
  });

  test('only the inactive section has the banner, and a change says it is unsaved (T249’s review)', async ({
    page,
  }) => {
    const settings = await openSettings(page);
    const banners = settings.getByRole('note').filter({ hasText: /^Inactive:/ });
    // Markings is the mode in use: no banner there.
    await section(settings, 'Markings').click();
    await expect(settings.getByRole('heading', { name: 'Markings', level: 2 })).toBeVisible();
    await expect(banners).toHaveCount(0);
    await section(settings, 'Cross-filtering').click();
    await expect(banners).toHaveCount(1);

    const bar = settings.locator('.settings-page__bar');
    await expect(bar.getByText('Unsaved changes')).toHaveCount(0);
    await section(settings, 'General').click();
    await settings.getByLabel('Description', { exact: true }).fill('Changed');
    const unsaved = bar.getByText('Unsaved changes');
    await expect(unsaved).toBeVisible();
    // A state, with its icon (AC-177).
    await expect(bar.locator('.settings-page__unsaved [data-icon]')).toHaveCount(1);
  });

  test('Markings: the prototype’s tables, 29 px rows, slot buttons and limit pills', async ({
    page,
  }) => {
    const settings = await openSettings(page);
    await section(settings, 'Markings').click();
    // .settings-inner > p.sec: the intro in the secondary ink (mismatch 34)
    expect(
      await style(settings.getByText(/^A marking is a named, coloured selection/), 'color'),
    ).toEqual({ color: await token(page, 'text-secondary') });

    const markings = settings.getByRole('table', { name: 'Markings', exact: true });
    // .grid-table: 12 px, tabular, the head 28 px on bg-subtle; rows 29 px (a 28 px .input.sm)
    expect(await style(markings, 'font-size', 'font-variant-numeric')).toEqual({
      'font-size': '12px',
      'font-variant-numeric': 'tabular-nums',
    });
    expect(
      await style(markings.getByRole('columnheader').first(), 'height', 'background-color'),
    ).toEqual({
      height: '28px',
      'background-color': await token(page, 'bg-subtle', 'background-color'),
    });
    const row = markings.locator('tbody tr').first();
    expect((await row.boundingBox())?.height).toBe(29);
    expect(
      await style(row.getByRole('textbox', { name: 'Name of marking 1' }), 'height', 'font-size'),
    ).toEqual({ height: '28px', 'font-size': '12px' });
    // .mk-slot { height: 24px; padding: 2px; border: 1px solid transparent; border-radius: 4px }
    // [aria-checked='true'] { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent) }
    const slot = (n: number) =>
      row.getByRole('radio', { name: `Colour ${String(n)}` }).locator('xpath=ancestor::label[1]');
    expect(await style(slot(1), 'width', 'height', 'border-radius', 'border-top-color')).toEqual({
      width: '22px',
      height: '24px',
      'border-radius': '4px',
      'border-top-color': await token(page, 'accent', 'background-color'),
    });
    expect(await style(slot(2), 'border-top-color')).toEqual({
      'border-top-color': 'rgba(0, 0, 0, 0)',
    });

    const tiles = settings.getByRole('table', { name: 'Tiles and markings' });
    // .select.sm 28 px; .chk { font-size: 12px; padding: 2px 6px; border: 1px solid var(--border-subtle); border-radius: 6px }
    const marksWith = tiles.getByRole('combobox').first();
    expect(await style(marksWith, 'height', 'font-size')).toEqual({
      height: '28px',
      'font-size': '12px',
    });
    const pill = tiles.getByRole('checkbox').first().locator('xpath=ancestor::label[1]');
    expect(
      await style(
        pill,
        'font-size',
        'padding-left',
        'border-top-width',
        'border-top-color',
        'border-radius',
      ),
    ).toEqual({
      'font-size': '12px',
      'padding-left': '6px',
      'border-top-width': '1px',
      'border-top-color': await token(page, 'border-subtle', 'background-color'),
      'border-radius': '6px',
    });
  });
});

/**
 * T300 and T304: the tiles that draw in the DOM, as the prototype draws them
 * (the Superset-parity rebuild's gaps 1 and 9). The rules cited are
 * index.html's, and charts.js's kpiHtml, pivotHtml and tableHtml.
 */
test.describe('T300 and T304: KPI, table and pivot tiles', () => {
  const api = 'http://localhost:4100/api';

  async function chartOn(
    request: APIRequestContext,
    dashboardId: string,
    title: string,
    chartType: string,
    wells: { measures: string[]; dimensions: string[] },
  ) {
    const chart = (await (
      await request.post(`${api}/documents`, { data: { kind: 'chart', title, ...IN_MY_WORKSPACE } })
    ).json()) as { id: string };
    await request.put(`${api}/documents/chart/${chart.id}`, {
      data: {
        version: 1,
        body: {
          schemaVersion: 1,
          title,
          owner: 'admin',
          localToDashboardId: dashboardId,
          chart: {
            source: { cube: 'orders' },
            wells: { ...wells, timeDimensions: [] },
            chartType,
          },
        },
      },
    });
    return chart.id;
  }

  test.beforeEach(async ({ page, request }) => {
    const stamp = String(Date.now());
    const title = `DOM tiles ${stamp}`;
    const { id } = (await (
      await request.post(`${api}/documents`, {
        data: { kind: 'dashboard', title, ...IN_MY_WORKSPACE },
      })
    ).json()) as { id: string };
    const kpi = await chartOn(request, id, `Order count ${stamp}`, 'kpi', {
      measures: ['orders.count'],
      dimensions: [],
    });
    const table = await chartOn(request, id, `Orders table ${stamp}`, 'table', {
      measures: ['orders.count'],
      dimensions: ['orders.status'],
    });
    const pivot = await chartOn(request, id, `Orders pivot ${stamp}`, 'pivot', {
      measures: ['orders.count'],
      dimensions: ['products.category', 'orders.status'],
    });
    await request.put(`${api}/documents/dashboard/${id}`, {
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
              items: [
                { id: 'tile-kpi', kind: 'chart', w: 3, h: 13, chartId: kpi },
                { id: 'tile-table', kind: 'chart', w: 4, h: 24, chartId: table },
                { id: 'tile-pivot', kind: 'chart', w: 5, h: 24, chartId: pivot },
              ],
            },
          ],
        },
      },
    });
    await page.goto(`/explore/dashboards/${id}`);
  });

  test('a KPI tile draws its value at 32 px in tabular numerals, under its name', async ({
    page,
  }) => {
    const tile = page.locator('[data-tile="tile-kpi"]');
    const value = tile.getByTestId('kpi-value');
    await expect(value).toBeVisible({ timeout: 15_000 });

    // .kpi-val { font-size: 32px; line-height: 40px; font-weight: 600;
    // font-variant-numeric: tabular-nums; letter-spacing: -0.01em }
    // .dtile.kpi .kpi-val { line-height: 36px }
    expect(
      await style(
        value,
        'font-size',
        'line-height',
        'font-weight',
        'font-variant-numeric',
        'letter-spacing',
      ),
    ).toEqual({
      'font-size': '32px',
      'line-height': '36px',
      'font-weight': '600',
      'font-variant-numeric': 'tabular-nums',
      'letter-spacing': '-0.32px',
    });
    // kpiHtml: <div class="xs sec strong">{title}</div> above the value.
    const label = tile.getByTestId('kpi-label');
    expect(await style(label, 'font-size', 'line-height', 'font-weight', 'color')).toEqual({
      'font-size': '12px',
      'line-height': '16px',
      'font-weight': '600',
      color: await token(page, 'text-secondary'),
    });
    const labelBox = await label.boundingBox();
    const valueBox = await value.boundingBox();
    expect((labelBox?.y ?? 0) + (labelBox?.height ?? 0)).toBeLessThanOrEqual(valueBox?.y ?? 0);

    // .dtile.kpi { padding: 12px 16px } .dtile.kpi .tile-head { margin-bottom: 4px }
    expect(
      await style(tile, 'padding-top', 'padding-right', 'padding-bottom', 'padding-left'),
    ).toEqual({
      'padding-top': '12px',
      'padding-right': '16px',
      'padding-bottom': '12px',
      'padding-left': '16px',
    });
    expect(await style(tile.locator('.tile-head'), 'margin-bottom')).toEqual({
      'margin-bottom': '4px',
    });
  });

  /**
   * .grid-table { font-size: 12px; font-variant-numeric: tabular-nums }
   * .grid-table th { position: sticky; top: 0; background: var(--bg-subtle);
   *   font-weight: 600; height: 28px; padding: 0 8px }
   * .grid-table td { padding: 0 8px } .grid-table.comfy td { height: 34px }
   * .grid-table td.num, .grid-table th.num { text-align: right }
   */
  const asGridTable = async (page: Page, table: Locator, measureCell: Locator) => {
    const head = table.locator('thead th').first();
    expect(
      await style(
        head,
        'position',
        'top',
        'font-size',
        'font-weight',
        'background-color',
        'padding-left',
      ),
    ).toEqual({
      position: 'sticky',
      top: '0px',
      'font-size': '12px',
      'font-weight': '600',
      'background-color': await token(page, 'bg-subtle', 'background-color'),
      'padding-left': '8px',
    });
    expect((await table.locator('thead tr').first().boundingBox())?.height).toBeCloseTo(28, 0);
    expect((await table.locator('tbody tr').first().boundingBox())?.height).toBeCloseTo(34, 0);
    expect(
      await style(measureCell, 'font-size', 'font-variant-numeric', 'text-align', 'padding-right'),
    ).toEqual({
      'font-size': '12px',
      'font-variant-numeric': 'tabular-nums',
      'text-align': 'right',
      'padding-right': '8px',
    });
  };

  test('a table tile is the prototype’s comfy grid table: a sticky head, 34 px rows, measures set right', async ({
    page,
  }) => {
    const tile = page.locator('[data-tile="tile-table"]');
    const table = tile.getByTestId('data-table').locator('table');
    await expect(table.locator('tbody tr').first()).toBeVisible({ timeout: 15_000 });
    // Its columns: the status, then the count.
    const count = table.locator('tbody tr').first().locator('td').last();
    await asGridTable(page, table, count);
    // A dimension's cell is left at the table's own start, as the
    // prototype's td is: no text-align of its own.
    expect(
      await style(table.locator('tbody tr').first().locator('td').first(), 'text-align'),
    ).toEqual({ 'text-align': 'start' });
    expect(await style(table.locator('thead th').last(), 'text-align')).toEqual({
      'text-align': 'right',
    });
  });

  test('a pivot tile is the same grid table, its row names in 600 and its figures set right', async ({
    page,
  }) => {
    const tile = page.locator('[data-tile="tile-pivot"]');
    const table = tile.getByTestId('pivot-table').locator('table');
    await expect(table.getByTestId('pivot-row').first()).toBeVisible({ timeout: 15_000 });
    const cell = table.getByTestId('pivot-row').first().locator('td').first();
    await asGridTable(page, table, cell);
    // pivotHtml: <td class="strong">{row}</td>, on the row's own ground.
    const rowName = table.getByTestId('pivot-row-header').first();
    expect(await style(rowName, 'font-weight', 'background-color', 'position')).toEqual({
      'font-weight': '600',
      'background-color': 'rgba(0, 0, 0, 0)',
      position: 'static',
    });
    // <th class="num">{column}</th>
    expect(await style(table.getByTestId('pivot-column-header').first(), 'text-align')).toEqual({
      'text-align': 'right',
    });
  });
});

/**
 * T310: the chart editor's buttons and inputs the 2026-09-25 re-critique
 * measured off the prototype (critiques/2026-09-25-chart-editor.md, findings
 * 1 and 3–7): the Customize tab's controls, the type gallery's, "Why this
 * chart?", the type card, the title field's hover, and the tabs' hover.
 * The rules cited are index.html's and editor.js's.
 */
test.describe('T310: the chart editor’s remaining controls', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/explore/charts/seed-chart-axes/edit');
    await expect(page.getByTestId('chart-canvas')).toBeVisible();
  });

  test('Customize: 28 px fields at 12 px, and its toggles as the prototype’s switch', async ({
    page,
  }) => {
    await page.getByRole('tab', { name: 'Customize' }).click();
    const x = page.getByRole('group', { name: 'X axis' });
    // .input.sm and .select.sm { height: 28px; font-size: 12px }
    for (const control of [x.getByLabel('Title'), x.getByLabel('Label rotation')])
      expect(await style(control, 'height', 'font-size')).toEqual({
        height: '28px',
        'font-size': '12px',
      });
    // .switch { width: 32px; height: 18px; border-radius: 999px;
    //   background: var(--border-strong) } [aria-checked='true'] { background: var(--accent) }
    const log = x.getByLabel('Logarithmic scale');
    expect(await style(log, 'width', 'height', 'border-top-left-radius')).toEqual({
      width: '32px',
      height: '18px',
      'border-top-left-radius': '999px',
    });
    expect(await style(log, 'background-color')).toEqual({
      'background-color': await token(page, 'border-strong', 'background-color'),
    });
    await log.check();
    expect(await style(log, 'background-color')).toEqual({
      'background-color': await token(page, 'accent', 'background-color'),
    });
    // Its label on the 12 px scale (§3 has no 13 px here).
    expect(await style(page.locator('.customize-tab__check').first(), 'font-size')).toEqual({
      'font-size': '12px',
    });
  });

  test('“Why this chart?” is a ghost .btn.sm, the type card a .reco-row, the title bare when pointed at', async ({
    page,
  }) => {
    // .btn.ghost.sm { height: 24px; padding: 0 8px; border-color: transparent;
    //   font-size: 12px; background: none }
    const why = page.getByRole('button', { name: 'Why this chart?' });
    expect(
      await style(
        why,
        'height',
        'padding-left',
        'border-top-color',
        'font-size',
        'background-color',
      ),
    ).toEqual({
      height: '24px',
      'padding-left': '8px',
      'border-top-color': 'rgba(0, 0, 0, 0)',
      'font-size': '12px',
      'background-color': 'rgba(0, 0, 0, 0)',
    });
    // .reco-row { padding: 8px } .reco-name { font-size: 12px; font-weight: 600 }
    const card = page.getByTestId('chart-type-change');
    expect(await style(card, 'padding-top', 'padding-left')).toEqual({
      'padding-top': '8px',
      'padding-left': '8px',
    });
    expect(await style(card.locator('.type-card-field__name'), 'font-size', 'font-weight')).toEqual(
      {
        'font-size': '12px',
        'font-weight': '600',
      },
    );
    // [data-title] keeps a transparent border and ground under the pointer.
    const title = page.getByLabel('Chart title');
    await title.hover();
    expect(await style(title, 'border-top-color', 'background-color')).toEqual({
      'border-top-color': 'rgba(0, 0, 0, 0)',
      'background-color': 'rgba(0, 0, 0, 0)',
    });
  });

  test('the inspector’s and the drawer’s tabs take no ground under the pointer', async ({
    page,
  }) => {
    // .tabs button { background: none } in every state.
    const customize = page.getByRole('tab', { name: 'Customize' });
    await customize.hover();
    expect(await style(customize, 'background-color')).toEqual({
      'background-color': 'rgba(0, 0, 0, 0)',
    });
    const underlying = page.getByRole('tab', { name: 'Underlying rows' });
    await underlying.hover();
    expect(await style(underlying, 'background-color')).toEqual({
      'background-color': 'rgba(0, 0, 0, 0)',
    });
  });

  test('the type gallery: an .input.sm search, .btn.sm Close and Use Auto, .file shelves, 13 px card names', async ({
    page,
  }) => {
    await page.getByTestId('chart-type-change').click();
    const gallery = page.getByRole('dialog', { name: 'Choose chart type' });
    expect(await style(gallery.getByLabel('Search chart types'), 'height', 'font-size')).toEqual({
      height: '28px',
      'font-size': '12px',
    });
    // .btn.sm { height: 24px; padding: 0 8px; border-radius: 6px }
    for (const name of ['Close', 'Use Auto'])
      expect(
        await style(
          gallery.getByRole('button', { name, exact: true }),
          'height',
          'padding-left',
          'border-top-left-radius',
        ),
      ).toEqual({ height: '24px', 'padding-left': '8px', 'border-top-left-radius': '6px' });
    // .file { height: 28px; padding: 0 12px 0 24px; font-size: 12px; border-radius: 0 }
    const shelf = gallery
      .getByRole('navigation', { name: 'Chart purposes' })
      .getByRole('button')
      .first();
    expect(
      await style(
        shelf,
        'height',
        'padding-left',
        'padding-right',
        'font-size',
        'border-top-left-radius',
      ),
    ).toEqual({
      height: '28px',
      'padding-left': '24px',
      'padding-right': '12px',
      'font-size': '12px',
      'border-top-left-radius': '0px',
    });
    // A card's name: <span class="strong" style="font-size:13px">.
    expect(
      await style(
        gallery.getByTestId('type-card-bar').locator('.type-card__name'),
        'font-size',
        'font-weight',
      ),
    ).toEqual({ 'font-size': '13px', 'font-weight': '600' });
  });
});
