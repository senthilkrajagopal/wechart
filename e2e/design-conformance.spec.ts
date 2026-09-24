import { expect, test, type Locator, type Page } from '@playwright/test';

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
