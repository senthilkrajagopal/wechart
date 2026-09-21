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
    const plain = page.getByRole('button', { name: 'New dashboard' });
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

    await plain.click();
    // .input { height: 32px; border: 1px solid var(--border-strong); border-radius: 4px;
    //          background: var(--bg-surface); padding: 0 8px }
    const input = page.getByLabel('New dashboard in this folder');
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
    await input.fill('Anything');
    // The form's own Create — other tests leave items whose names contain it.
    const primary = page
      .getByRole('form', { name: 'New dashboard' })
      .getByRole('button', { name: 'Create', exact: true });
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
          pages: [{ id: 'only', title: 'Only', items: [] }],
          filters: [{ id: 'f-status', widget: 'checkbox', member: 'orders.status' }],
        },
      },
    });
    await page.goto(`/explore/dashboards/${id}`);
    await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible();

    // .filterbar { background: var(--bg-page); border-bottom: 1px solid var(--border-subtle) }
    const bar = page.getByRole('region', { name: 'Filters' });
    expect(
      await style(bar, 'background-color', 'border-bottom-width', 'border-bottom-color'),
    ).toEqual({
      'background-color': await token(page, 'bg-page'),
      'border-bottom-width': '1px',
      'border-bottom-color': await token(page, 'border-subtle'),
    });

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
    await page.keyboard.press('Escape');
    await expect(pill.getByRole('checkbox')).toHaveCount(0);
  });
});
