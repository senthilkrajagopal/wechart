import { expect, test } from '@playwright/test';

/**
 * T396, AC-304: WHILE the window is narrower than 1,024 pixels, THE SYSTEM
 * SHALL fit the app bar within it, folding navigation and search into a menu
 * (the UI review's narrow-shell change). `Fails when: a page scrolls sideways
 * at 390 pixels wide.`
 *
 * Every workspace, a dashboard in view mode (below 1,024 px the app is for
 * viewing, direction.md §2 "Breakpoints"), and the pages its links still
 * reach there: a library chart, the chart editor and a model file, at a
 * phone's 390 px.
 */
const PAGES = [
  '/explore',
  '/explore/dashboards/seed-root-dashboard-1',
  '/explore/charts/seed-chart-status',
  '/explore/charts/seed-chart-status/edit',
  '/model',
  '/model/files/cubes%2Forders.yml',
  '/data-sources',
  '/jobs',
  '/jobs#queries',
  '/schedules',
  '/security',
];

test.describe('at 390 pixels wide', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  for (const path of PAGES)
    test(`${path} doesn’t scroll sideways`, async ({ page }) => {
      if (path === '/jobs#queries') {
        // The query log with rows in it: a dashboard's queries first.
        await page.goto('/explore/dashboards/seed-root-dashboard-1');
        await expect(page.getByTestId('chart-canvas').first()).toBeVisible();
        await page.goto('/jobs');
        await page.getByRole('tab', { name: 'Queries' }).click();
        await expect(
          page
            .getByRole('table', { name: 'Queries wechart has issued, newest first' })
            .getByRole('row'),
        ).not.toHaveCount(0);
      } else {
        await page.goto(path);
      }
      await expect(page.locator('main')).not.toBeEmpty();
      // Drawn: a dashboard's tiles, where the page has them, and every page's
      // tables filled in, not measured while they still load.
      if (path.includes('/dashboards/'))
        await expect(page.locator('[data-tile]').first()).toBeVisible();
      await page.waitForLoadState('networkidle');

      // As the user ruled for T184: the page, the shell's main region and a
      // dashboard's canvas never scroll sideways; a pane may within itself,
      // as a wide table does.
      const over = await page.evaluate(() => {
        const past = (element: Element | null) =>
          element === null ? 0 : element.scrollWidth - element.clientWidth;
        return {
          main: past(document.querySelector('main')),
          canvas: past(document.querySelector('[data-testid="canvas-scroll"]')),
        };
      });
      expect(over).toEqual({ main: 0, canvas: 0 });
      const widths = await page.evaluate(() => ({
        page: document.documentElement.scrollWidth,
        window: document.documentElement.clientWidth,
        // What runs past the window's right edge, to say what to fix.
        past: [...document.querySelectorAll('body *')]
          .filter((element) => element.getBoundingClientRect().right > window.innerWidth + 0.5)
          .filter((element) => {
            // Only the outermost of each, and only what is shown.
            const parent = element.parentElement;
            return (
              element.getClientRects().length > 0 &&
              (parent === null || parent.getBoundingClientRect().right <= window.innerWidth + 0.5)
            );
          })
          .slice(0, 8)
          .map((element) => `${element.tagName.toLowerCase()}.${[...element.classList].join('.')}`),
      }));
      expect(widths.page, widths.past.join(', ')).toBeLessThanOrEqual(widths.window);
    });

  test('the app bar folds navigation and search into a menu', async ({ page, browserName }) => {
    // Safari's Tab passes over links unless Option is held, as its own
    // setting has it; its keyboard users move through a menu with Option-Tab.
    const TAB = browserName === 'webkit' ? 'Alt+Tab' : 'Tab';
    await page.goto('/explore');
    const bar = page.getByRole('banner');
    // Not in the bar itself, where they would push it past the window.
    await expect(bar.getByRole('navigation', { name: 'Workspaces' })).toBeHidden();
    await expect(bar.getByRole('button', { name: /Search wechart/ })).toBeHidden();

    const menu = bar.getByRole('button', { name: 'Menu' });
    await expect(menu).toHaveAttribute('aria-expanded', 'false');
    await menu.click();
    await expect(menu).toHaveAttribute('aria-expanded', 'true');
    const nav = page.getByRole('navigation', { name: 'Workspaces' });
    await expect(nav.getByRole('link', { name: 'Explore' })).toHaveAttribute(
      'aria-current',
      'page',
    );

    // Search, from the menu: the palette opens, the menu closes, and closing
    // the palette hands focus back to the menu's button.
    await page.getByRole('button', { name: /Search wechart/ }).click();
    await expect(page.getByRole('dialog', { name: /Search/ })).toBeVisible();
    await expect(menu).toHaveAttribute('aria-expanded', 'false');
    await page.keyboard.press('Escape');
    await expect(menu).toBeFocused();

    // Escape closes it, back on its button; Tab out of it closes it too.
    await page.keyboard.press('Enter');
    await expect(menu).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press(TAB);
    await page.keyboard.press('Escape');
    await expect(menu).toHaveAttribute('aria-expanded', 'false');
    await expect(menu).toBeFocused();
    await page.keyboard.press('Enter');
    for (let press = 0; press < 8; press += 1) await page.keyboard.press(TAB);
    await expect(menu).toHaveAttribute('aria-expanded', 'false');

    // Open when the window widens past 1,024 px: closed, not left to come back.
    await menu.click();
    await page.setViewportSize({ width: 1280, height: 844 });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(menu).toHaveAttribute('aria-expanded', 'false');

    // Navigation, from the menu: it goes.
    await menu.click();
    await nav.getByRole('link', { name: 'Model' }).click();
    await expect(page).toHaveURL(/\/model$/);
  });
});

/**
 * T396's review, AC-230 at 390 px: the query log's header stays in view as
 * the page scrolls. Its cells wrap to fit the page rather than the table
 * scrolling in a box of its own, which would take the page's place as what
 * the header sticks to. A page of a stand-in log's sixty queries, as
 * jobs.spec.ts has.
 */
test('at 390 pixels the query log fits the page, its header in view as the page scrolls', async ({
  page,
}) => {
  const now = Date.now();
  const records = Array.from({ length: 25 }, (_, index) => ({
    id: index + 1,
    requestId: `r-${String(index)}`,
    query: { measures: ['orders.count'], dimensions: ['orders.status'] },
    durationMs: 100 + index * 10,
    accelerated: index % 2 === 0,
    preAggregation: index % 2 === 0 ? 'orders.main' : null,
    error: index % 5 === 0 ? 'Timed out' : null,
    createdAt: new Date(now - index * 60_000).toISOString(),
  }));
  await page.route('**/api/jobs/queries/page*', (route) =>
    route.fulfill({ json: { records, total: 60 } }),
  );
  await page.setViewportSize({ width: 390, height: 600 });
  await page.goto('/jobs?tab=queries');
  const log = page.getByRole('table', { name: /Queries wechart has issued/ });
  await expect(log.locator('tbody tr')).toHaveCount(25);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(200);
  const header = log.locator('thead th').first();
  await expect(header).toBeInViewport();
  const top = (await header.boundingBox())?.y ?? 0;
  expect(top).toBeGreaterThanOrEqual(47);
  expect(top).toBeLessThanOrEqual(50);
});

test('at 1,280 pixels the bar keeps navigation and search in view, with no menu', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/explore');
  const bar = page.getByRole('banner');
  await expect(bar.getByRole('navigation', { name: 'Workspaces' })).toBeVisible();
  await expect(bar.getByRole('button', { name: /Search wechart/ })).toBeVisible();
  await expect(bar.getByRole('button', { name: 'Menu' })).toBeHidden();
});
