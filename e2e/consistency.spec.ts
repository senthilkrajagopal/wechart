import { expect, test, type Locator, type Page } from '@playwright/test';

import { IN_MY_WORKSPACE, myCopyOf } from './workspace';

/**
 * T466 (AC-187; UX-106, UX-109, UX-111): one page frame and one dialog
 * pattern across the workspaces, as the 2026-09-27 re-check of the phase-1
 * review lists them (`docs/design/reviews/2026-09-27/phase-1-recheck.md`,
 * cleanup items 1, 2 and 8's UX-111).
 *
 * - Every page's title at 24 px from its frame's edge, in direction.md §3's
 *   text-lg, 20/600; a page's note an `.info-bar` with the info icon, never
 *   the clock that means "idle".
 * - No page speaks of phases.
 * - Every dialog titled in text-md, 16/600, its body in 14 px.
 */

test.use({ viewport: { width: 1440, height: 900 } });

/** A page's title, and the edge of the frame it sits in. */
async function frameOf(page: Page, frame: Locator) {
  const title = page.getByRole('heading', { level: 1 }).first();
  await expect(title).toBeVisible();
  const [box, edge] = [await title.boundingBox(), await frame.boundingBox()];
  const style = await title.evaluate((node) => {
    const computed = getComputedStyle(node);
    return { size: computed.fontSize, weight: computed.fontWeight };
  });
  return { gutter: Math.round((box?.x ?? 0) - (edge?.x ?? 0)), ...style };
}

/** Each page, its frame, and its title's size: text-lg, but a dashboard's text-xl (direction.md §3). */
const PAGES: readonly [string, string, (page: Page) => Locator, string][] = [
  ['Data sources', '/data-sources', (page) => page.locator('main'), '20px'],
  ['Jobs', '/jobs', (page) => page.locator('main'), '20px'],
  ['Schedules', '/schedules', (page) => page.locator('main'), '20px'],
  ['Security', '/security', (page) => page.locator('main'), '20px'],
  ['a chart', '/explore/charts/seed-chart-status', (page) => page.locator('main'), '20px'],
  [
    'a dashboard',
    '/explore/dashboards/seed-root-dashboard-1',
    (page) => page.locator('main'),
    '24px',
  ],
  ['Explore', '/explore', (page) => page.getByTestId('explore-contents'), '20px'],
  ['Model', '/model', (page) => page.locator('.model-page__main'), '20px'],
];

test.describe('one page frame (UX-109)', () => {
  for (const [name, path, frame, size] of PAGES) {
    test(`${name}: its title ${size}/600, 24 px from its frame's edge`, async ({ page }) => {
      await page.goto(path);
      expect(await frameOf(page, frame(page))).toEqual({ gutter: 24, size, weight: '600' });
    });
  }

  test('a page’s note is an info bar with the info icon, never the idle clock', async ({
    page,
  }) => {
    for (const path of ['/data-sources', '/schedules', '/security', '/model']) {
      await page.goto(path);
      const notes = page.locator('main .info-bar');
      await expect(notes.first(), path).toBeVisible();
      // Every note the page has drawn, each with the info icon.
      await expect
        .poll(
          async () => {
            const [all, marked] = [
              await notes.count(),
              await notes.locator(':scope > svg[data-icon="info"]').count(),
            ];
            return all > 0 && all === marked;
          },
          { message: path },
        )
        .toBe(true);
      await expect(notes.locator(':scope > svg[data-icon="idle"]'), path).toHaveCount(0);
    }
  });

  test('a page with a docked pane is the window’s height, never scrolling it (T466’s review)', async ({
    page,
  }) => {
    for (const path of ['/jobs', '/security']) {
      await page.goto(path);
      await expect(page.locator('.admin-pane').first(), path).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight),
        path,
      ).toBe(0);
    }
  });

  test('no page speaks of phases (UX-111)', async ({ page }) => {
    for (const path of ['/data-sources', '/jobs', '/schedules', '/security', '/model']) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
      // Its note drawn first, where it has one: Security's waits on the model.
      if (path !== '/jobs') await expect(page.locator('main .info-bar').first()).toBeVisible();
      await expect(page.locator('main'), path).not.toContainText(/\bphase\b/i);
    }
  });
});

/** A dialog's title and body sizes, as drawn. */
const typeOf = (dialog: Locator) =>
  dialog.evaluate((node) => {
    const title = node.querySelector('h2');
    const body = node.querySelector(':scope > p, :scope p');
    const style = (element: Element | null) =>
      element === null
        ? null
        : {
            size: getComputedStyle(element).fontSize,
            weight: getComputedStyle(element).fontWeight,
          };
    return { title: style(title), body: style(body) };
  });

test.describe('one dialog pattern (UX-106)', () => {
  test('the chart type gallery: a 16/600 title', async ({ page }) => {
    await page.goto('/explore/charts/seed-chart-status/edit');
    await page.getByTestId('chart-type-change').click();
    const dialog = page.getByRole('dialog', { name: 'Choose chart type' });
    expect((await typeOf(dialog)).title).toEqual({ size: '16px', weight: '600' });
  });

  test('Generate cubes: a 16/600 title, and Cancel beside its one primary at the foot', async ({
    page,
  }) => {
    // In My workspace's model, where cubes are generated (T492; T451's switch, AC-254).
    // From the tree: an empty model offers it in the overview as well.
    await page.goto('/explore/folders/mine/models');
    await page
      .getByRole('navigation', { name: 'Model files' })
      .getByRole('button', { name: 'Generate from a data source…' })
      .click();
    // Design 11's pane, as design 01's: its title, then Cancel and the step's one primary.
    const dialog = page.getByRole('dialog', { name: 'Generate cubes' });
    expect((await typeOf(dialog)).title).toEqual({ size: '16px', weight: '600' });
    const foot = dialog.locator('.source-pane__foot');
    await expect(foot.getByRole('button')).toHaveText(['Cancel', /^Next: Tables/]);
    await expect(foot.getByRole('button', { name: /^Next: Tables/ })).toHaveClass(/btn-primary/);
  });

  test('a dashboard’s settings discard question: a 16/600 title, 14 px body', async ({
    page,
    request,
  }) => {
    // Its settings are changed in the single user's copy (T359, AC-254).
    await page.goto(
      `/explore/dashboards/${await myCopyOf(request, 'dashboard', 'seed-root-dashboard-1')}`,
    );
    await page.getByRole('button', { name: 'Dashboard settings' }).click();
    const settings = page.getByTestId('dashboard-settings');
    await settings.getByLabel('Description', { exact: true }).fill('Changed');
    await page.keyboard.press('Escape');
    const question = page.getByRole('alertdialog', { name: 'Discard your changes?' });
    expect(await typeOf(question)).toEqual({
      title: { size: '16px', weight: '600' },
      body: { size: '14px', weight: '400' },
    });
  });

  test('a tile’s View query: a 16/600 title', async ({ page }) => {
    await page.goto('/explore/dashboards/seed-root-dashboard-1');
    const tile = page.locator('[data-tile="tile-status"]');
    await tile.getByTestId('tile-view-menu-tile-status').click();
    await tile
      .getByRole('menu', { name: /^Actions for / })
      .getByRole('menuitem', { name: 'View query' })
      .click();
    const dialog = page.getByRole('dialog', { name: /query/i });
    expect((await typeOf(dialog)).title).toEqual({ size: '16px', weight: '600' });
  });
});

/**
 * T478 (AC-220; UX-102, UX-013): members named by title wherever a person
 * reads them. The ⌘K palette's field results: found by a member's name, but
 * said by its title and its cube's, never an identifier. The query log's half
 * is `jobs.spec.ts`'s "the query log is grouped by day, its members by title"
 * (T469).
 */
/**
 * T476 (AC-187; UX-108, UX-090, the 2026-09-27 re-check): the theme's own
 * native controls. A checkbox or radio takes the accent, never the browser's
 * blue; and in the dark theme the root says so, so native checkboxes,
 * selects and scrollbars draw dark chrome.
 */
test.describe('the theme’s own controls (UX-108, UX-090)', () => {
  /** The accent as the browser resolves it, to compare with a computed colour. */
  const accentOf = (page: Page) =>
    page.evaluate(() => {
      const probe = document.createElement('span');
      probe.style.color = 'var(--wc-accent)';
      document.body.append(probe);
      const colour = getComputedStyle(probe).color;
      probe.remove();
      return colour;
    });

  for (const theme of ['light', 'dark'] as const) {
    test(`native controls take the accent, and the root's scheme is ${theme}`, async ({ page }) => {
      await page.addInitScript((value) => {
        window.localStorage.setItem('wechart.theme', value);
      }, theme);
      await page.goto('/data-sources');
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      const root = await page.evaluate(() => {
        const style = getComputedStyle(document.documentElement);
        return { accent: style.accentColor, scheme: style.colorScheme };
      });
      expect(root).toEqual({ accent: await accentOf(page), scheme: theme });
    });
  }
});

/**
 * T476 (AC-187; the coordinator's calls under R37): each surface's controls
 * at the size its own latest approved design draws them. Forms and dialogs
 * at 32/14, the inspector and the compact panes at 28/12, page filter rows
 * at 28/12 with the label in the pill, the dashboard's filter bar at 32/13.
 */
test.describe('control sizes by surface (T476)', () => {
  /** A control's drawn height and font size. */
  const sizeOf = (control: Locator) =>
    control.evaluate((node) => ({
      height: Math.round(node.getBoundingClientRect().height),
      font: getComputedStyle(node).fontSize,
    }));
  /** A colour token as the browser resolves it. */
  const tokenOf = (page: Page, token: string) =>
    page.evaluate((name) => {
      const probe = document.createElement('span');
      probe.style.color = `var(${name})`;
      document.body.append(probe);
      const colour = getComputedStyle(probe).color;
      probe.remove();
      return colour;
    }, token);
  /** A label's size and weight. */
  const labelOf = (label: Locator) =>
    label.evaluate((node) => ({
      font: getComputedStyle(node).fontSize,
      weight: getComputedStyle(node).fontWeight,
    }));

  test('the data source wizard: 32/14 fields, identifiers 32/12 in the code face, under 12/600 labels (2026-09-27 01)', async ({
    page,
  }) => {
    await page.goto('/data-sources');
    await page.getByRole('button', { name: '+ Data source' }).click();
    const wizard = page.getByRole('dialog', { name: 'New data source' });
    await wizard.getByRole('radio', { name: 'PostgreSQL' }).click();
    await wizard.getByRole('button', { name: 'Next: Connection' }).click();
    // The design's `.input.mono`: an identifier, typed exactly (pin 4).
    const host = wizard.getByRole('textbox', { name: /^Host/ });
    expect(await sizeOf(host)).toEqual({ height: 32, font: '12px' });
    // Its plain `.input`.
    expect(await sizeOf(wizard.getByLabel(/^Password/))).toEqual({ height: 32, font: '14px' });
    // Port too is `.input.mono tnum` in designs 01 and 02 (T476's review).
    const port = wizard.getByRole('spinbutton', { name: /^Port/ });
    expect(await sizeOf(port)).toEqual({ height: 32, font: '12px' });
    expect(await port.evaluate((node) => getComputedStyle(node).fontFamily)).toMatch(/Plex Mono/);
    const hostLabel = wizard.locator('label', { hasText: /^Host/ }).first();
    expect(await labelOf(hostLabel)).toEqual({ font: '12px', weight: '600' });
    // In text-secondary, its "· required" in text-muted (design 01's .field > label, .req).
    expect(await hostLabel.evaluate((node) => getComputedStyle(node).color)).toBe(
      await tokenOf(page, '--wc-text-secondary'),
    );
    expect(
      await hostLabel.locator('.field__req').evaluate((node) => getComputedStyle(node).color),
    ).toBe(await tokenOf(page, '--wc-text-muted'));
  });

  test('a dialog: a 32/14 field (2026-09-27 04)', async ({ page }) => {
    await page.goto('/explore?folder=mine');
    await page
      .getByTestId('explore-contents')
      .getByRole('button', { name: 'New', exact: true })
      .click();
    await page
      .getByRole('menu', { name: 'New' })
      .getByRole('menuitem', { name: 'Dashboard', exact: true })
      .click();
    const dialog = page.getByRole('dialog', { name: 'New dashboard in My workspace' });
    expect(await sizeOf(dialog.getByRole('textbox', { name: 'Name' }))).toEqual({
      height: 32,
      font: '14px',
    });
  });

  test('the schedule pane: 32/14 fields, the cron 32/13 in the code face (2026-10-01 16)', async ({
    page,
  }) => {
    await page.goto('/schedules');
    await page.getByRole('button', { name: 'New schedule' }).click();
    expect(await sizeOf(page.getByRole('textbox', { name: /^Name/ }))).toEqual({
      height: 32,
      font: '14px',
    });
    // The design's `.input.mono`, 13 px in design 16.
    const cron = page.getByRole('textbox', { name: 'Cron expression' });
    expect(await sizeOf(cron)).toEqual({ height: 32, font: '13px' });
  });

  test('the inspector: 28/12 (2026-09-24 01)', async ({ page }) => {
    await page.goto('/explore/charts/seed-chart-status/edit');
    expect(await sizeOf(page.getByLabel('Sort by'))).toEqual({ height: 28, font: '12px' });
    expect(await sizeOf(page.getByLabel('Top N (+ Other)'))).toEqual({ height: 28, font: '12px' });
  });

  test('page filter rows: 28/12 pills, the label in the pill (2026-09-27 01, 10; 2026-10-01 16)', async ({
    page,
  }) => {
    // The audit trail's are the security suite's to check, where it is shown.
    for (const [path, word] of [
      ['/jobs', 'Status'],
      ['/schedules', 'State'],
    ] as const) {
      await page.goto(path);
      const pill = page.locator('main .select-pill', { hasText: word }).first();
      await expect(pill, path).toBeVisible();
      expect(await sizeOf(pill), path).toEqual({ height: 28, font: '12px' });
      // Its label inside it, on its row, not above it: the label's middle
      // within the pill's height.
      const [own, label] = [await pill.boundingBox(), await pill.getByText(word).boundingBox()];
      expect(own, path).not.toBeNull();
      expect(label, path).not.toBeNull();
      const middle = (label?.y ?? 0) + (label?.height ?? 0) / 2;
      expect(middle, path).toBeGreaterThan(own?.y ?? 0);
      expect(middle, path).toBeLessThan((own?.y ?? 0) + (own?.height ?? 0));
    }
  });

  test('Explore’s search: 28/12 (2026-09-30 14)', async ({ page }) => {
    await page.goto('/explore');
    const search = page.getByRole('searchbox', { name: 'Search dashboards and charts' });
    expect(await sizeOf(search)).toEqual({ height: 28, font: '12px' });
  });

  test('the dashboard’s filter bar: 32/13 pills (2026-09-24 04)', async ({ page, request }) => {
    const title = `Sizes ${String(Date.now())}`;
    const made = (await (
      await request.post('/api/documents', {
        data: { kind: 'dashboard', title, ...IN_MY_WORKSPACE },
      })
    ).json()) as { id: string };
    const saved = await request.put(`/api/documents/dashboard/${made.id}`, {
      data: {
        version: 1,
        body: {
          schemaVersion: 1,
          title,
          ...IN_MY_WORKSPACE,
          owner: 'admin',
          pages: [{ id: 'only', title: 'Only', items: [] }],
          filters: [{ id: 'f-list', widget: 'list', member: 'orders.status' }],
        },
      },
    });
    expect(saved.ok(), await saved.text()).toBe(true);
    await page.goto(`/explore/dashboards/${made.id}`);
    // The pill, the design's `.fw`; its value's button sits inside it.
    const pill = page.locator('[data-filter-id="f-list"]');
    await expect(pill).toBeVisible();
    expect(await sizeOf(pill)).toEqual({ height: 32, font: '13px' });
    // "Label: value" inside it, on its row.
    await expect(pill.locator('button[aria-expanded]')).toBeVisible();
    await expect(pill).toContainText(/Status\s*:/);
  });
});

test.describe('members by title (UX-102)', () => {
  test('the search palette names fields and their cubes by title, never by id', async ({
    page,
  }) => {
    await page.goto('/explore');
    // The shortcut is bound once the app is mounted (search-palette.spec.ts).
    await expect(page.getByRole('button', { name: /theme/i })).toBeVisible();
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+k' : 'Control+k');
    const palette = page.getByRole('dialog', { name: /search/i });
    await palette.getByRole('combobox').fill('orders.count');
    const fields = palette
      .getByRole('listbox', { name: 'Search results' })
      .getByRole('option')
      .filter({ hasText: /^(Measure|Dimension)/ });
    // The seeded `orders.count`: its type, its title, then its cube's.
    await expect(fields.filter({ hasText: /^MeasureOrders CountCube Orders$/ })).toHaveCount(1);
    // Others found by their names too ("monthly_orders.count"), each said by title.
    expect(await fields.count()).toBeGreaterThan(1);
    for (const text of await fields.allTextContents()) expect(text).not.toMatch(/[a-z]\.[a-z]|_/);
  });
});
