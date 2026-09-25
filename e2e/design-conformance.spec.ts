import { expect, test, type APIRequestContext, type Locator, type Page } from '@playwright/test';

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
    const other = nav.getByRole('link', { name: 'Model' });
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
    await page.goto('/explore/dashboards/seed-root-dashboard-1');
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

    // <button class="btn primary" data-edit>${PENCIL} Edit</button>
    const edit = page.getByRole('button', { name: 'Edit', exact: true });
    await expect(edit.locator('svg')).toHaveCount(1);
    expect(await style(edit, 'background-color', 'color', 'height', 'border-radius')).toEqual({
      'background-color': await token(page, 'accent'),
      color: await token(page, 'text-on-accent'),
      height: '32px',
      'border-radius': '6px',
    });

    // <button class="iconbtn" data-settings aria-label="Dashboard settings">${GEAR}</button>,
    // the header's last control.
    const gear = page.getByRole('button', { name: 'Dashboard settings' });
    await expect(gear.locator('svg')).toHaveCount(1);
    expect(await style(gear, 'width', 'height', 'border-radius', 'background-color')).toEqual({
      width: '32px',
      height: '32px',
      'border-radius': '6px',
      'background-color': 'rgba(0, 0, 0, 0)',
    });
    const last = await page
      .locator('.dashboard__header')
      .evaluate((header) =>
        header.querySelector(':scope > :last-child')?.getAttribute('aria-label'),
      );
    expect(last).toBe('Dashboard settings');
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

    // The table view: a small ghost button in the head (.btn.ghost.sm).
    const toggle = tile.getByTestId('toggle-table-view');
    expect(
      await style(toggle, 'height', 'font-size', 'background-color', 'border-top-color'),
    ).toEqual({
      height: '24px',
      'font-size': '12px',
      'background-color': 'rgba(0, 0, 0, 0)',
      'border-top-color': 'rgba(0, 0, 0, 0)',
    });

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
        data: { kind: 'dashboard', title, folderId: 'root' },
      })
    ).json()) as { id: string };
    await request.put(`${api}/documents/dashboard/${id}`, {
      data: {
        version: 1,
        body: {
          schemaVersion: 1,
          title,
          folderId: 'root',
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
        data: { kind: 'dashboard', title, folderId: 'root' },
      })
    ).json()) as { id: string };
    await request.put(`${api}/documents/dashboard/${id}`, {
      data: {
        version: 1,
        body: {
          schemaVersion: 1,
          title,
          folderId: 'root',
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
  const make = async (
    request: APIRequestContext,
    kind: 'folder' | 'dashboard' | 'chart',
    folderId: string,
    title: string,
    body: Record<string, unknown> = {},
  ) => {
    const { id } = (await (
      await request.post(`${api}/documents`, { data: { kind, title, folderId } })
    ).json()) as { id: string };
    if (kind !== 'folder' && Object.keys(body).length > 0) {
      const stored = (await (await request.get(`${api}/documents/${kind}/${id}`)).json()) as {
        version: number;
        body: Record<string, unknown>;
      };
      await request.put(`${api}/documents/${kind}/${id}`, {
        data: { version: stored.version, body: { ...stored.body, ...body } },
      });
    }
    return id;
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

  test('the header: 24 px crumbs, a 28 × 260 search and a 36 px rename, 12 px apart', async ({
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

    // .admin-main { padding: 16px 24px; gap: 12px }: the crumbs, the head row
    // and the table 12 px apart (N5).
    const heading = main.getByRole('heading', { level: 1 });
    const crumbsBox = await nav.boundingBox();
    const headBox = await heading.locator('..').boundingBox();
    const tableBox = await main.getByRole('table').boundingBox();
    const pane = await folders(page).boundingBox();
    const bar = await page.getByRole('banner').boundingBox();
    expect((crumbsBox?.x ?? 0) - ((pane?.x ?? 0) + (pane?.width ?? 0))).toBeCloseTo(24, 0);
    expect((crumbsBox?.y ?? 0) - ((bar?.y ?? 0) + (bar?.height ?? 0))).toBeCloseTo(16, 0);
    expect((headBox?.y ?? 0) - ((crumbsBox?.y ?? 0) + (crumbsBox?.height ?? 0))).toBeCloseTo(12, 0);
    expect((tableBox?.y ?? 0) - ((headBox?.y ?? 0) + (headBox?.height ?? 0))).toBeCloseTo(12, 0);

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
    await expect(cells(sub).nth(2)).toHaveText(/^[A-Z][a-z]{2} \d{1,2}(, \d{4})?$/);
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
    const note = contents(page).getByText(
      'Charts are shared: a chart used on several dashboards is edited once, and every dashboard shows the change.',
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
      const cell = table.getByRole('cell', { name: text });
      expect((await cell.boundingBox())?.height).toBeCloseTo(120, 0);
      expect(await style(cell, 'text-align', 'font-size', 'color')).toEqual({
        'text-align': 'center',
        'font-size': '12px',
        color: await token(page, 'text-secondary'),
      });
    };
    await said('This folder is empty. Use ＋ New to add a dashboard or chart.');
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
  });

  test('the avatar: the dimension role on its tint', async ({ page }) => {
    await page.goto('/explore');
    // .avatar { background: var(--role-dim-soft); color: var(--role-dim) } (N7, mismatch 3)
    const avatar = page.getByRole('banner').getByRole('img', { name: /^Signed in/ });
    expect(await style(avatar, 'background-color', 'color')).toEqual({
      'background-color': await token(page, 'bg-role-dimension-soft', 'background-color'),
      color: await token(page, 'role-dimension'),
    });
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
    await page.goto('/explore?folder=seed-folder-0');
    await page
      .getByTestId('explore-contents')
      .getByRole('button', { name: 'New', exact: true })
      .click();
    await page
      .getByRole('menu', { name: 'New' })
      .getByRole('menuitem', { name: 'Dashboard' })
      .click();

    // explore.js: S.editNew = true — straight into edit mode (N15).
    await expect(page).toHaveURL(/\/explore\/dashboards\//);
    await expect(page.getByRole('toolbar', { name: 'Dashboard editing' })).toBeVisible();
    // Once, not for good: the address says nothing of it after, so a reload
    // or a link opens the dashboard to be read.
    await expect.poll(() => new URL(page.url()).searchParams.has('editing')).toBe(false);
  });
});
