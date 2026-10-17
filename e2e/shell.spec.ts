import { expect, test, type Locator, type Page } from '@playwright/test';

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
  '/sql',
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
    // Closed once wide (T696): narrowed again before a frame has drawn the
    // wide window, the page never sees it wide at all.
    await expect(page.locator('.app-bar__menu-button')).toHaveAttribute('aria-expanded', 'false');
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(menu).toHaveAttribute('aria-expanded', 'false');

    // Navigation, from the menu: it goes. To Jobs: the switcher lists no
    // Model (AC-001; T331).
    await menu.click();
    await nav.getByRole('link', { name: 'Jobs' }).click();
    await expect(page).toHaveURL(/\/jobs$/);
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
  // The records' rows, not the days' headings among them (T469).
  await expect(log.getByTestId('query-row')).toHaveCount(25);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(200);
  const header = log.locator('thead th').first();
  await expect(header).toBeInViewport();
  const top = (await header.boundingBox())?.y ?? 0;
  expect(top).toBeGreaterThanOrEqual(47);
  expect(top).toBeLessThanOrEqual(50);
});

/**
 * T696 (AC-190 as amended, AC-004, AC-254, AC-287, AC-304; design 09 states
 * B and H; R76 explore-Q1, components-Q4 and Q5): with sign-in off, the
 * "Single-user mode" chip in the avatar's place, 28 px with its chevron, its
 * menu a heading and a sentence; Reviews at 14/400 with the inbox and its
 * count 12/18/600 in the accent; the search and icon buttons never shrink;
 * below 1,280 the chip its icon alone; below 1,024 state H's order.
 */
test.describe('the app bar as design 09 draws it, sign-in off (T696)', () => {
  const styleOf = (locator: Locator, ...names: string[]) =>
    locator.evaluate(
      (each, keys) => keys.map((key) => getComputedStyle(each).getPropertyValue(key)),
      names,
    );
  const accentOf = (page: Page) =>
    page.getByTestId('brand-mark').evaluate((each) => getComputedStyle(each).backgroundColor);

  test.beforeEach(async ({ page }) => {
    await page.route('**/api/reviews/count', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{"waiting":3}' }),
    );
  });

  test('at 1,280: the chip in the avatar’s place, Reviews and its count, nothing shrinking', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/explore');
    const bar = page.getByRole('banner');
    const reviews = bar.getByRole('link', { name: 'Reviews, 3 waiting' });
    expect(await styleOf(reviews, 'font-size', 'font-weight')).toEqual(['14px', '400']);
    await expect(reviews.locator('svg[data-icon="inbox"]')).toHaveCount(1);
    const count = reviews.getByTestId('reviews-count');
    expect(
      await styleOf(count, 'font-size', 'line-height', 'font-weight', 'height', 'background-color'),
    ).toEqual(['12px', '18px', '600', '18px', await accentOf(page)]);

    const chip = bar.getByRole('button', { name: 'Single-user mode' });
    expect(Math.round((await chip.boundingBox())!.height)).toBe(28);
    await expect(chip.getByText('Single-user mode')).toBeVisible();
    await expect(chip.getByTestId('account-chevron')).toBeVisible();
    // No avatar beside it (AC-190 as amended), and it is at the far right, after search.
    await expect(bar.getByRole('img', { name: /^Signed in/ })).toHaveCount(0);
    const search = bar.getByRole('button', { name: /^Search wechart/ });
    expect((await chip.boundingBox())!.x).toBeGreaterThan((await search.boundingBox())!.x);
    for (const each of [search, bar.getByRole('button', { name: /theme/i }), chip, reviews])
      expect(await styleOf(each, 'flex-shrink')).toEqual(['0']);

    await chip.click();
    const panel = page.getByTestId('account-panel');
    expect(Math.round((await panel.boundingBox())!.width)).toBe(320);
    const heading = panel.locator('.menu__main');
    await expect(heading).toHaveText('Sign-in is off');
    expect(await styleOf(heading, 'font-weight')).toEqual(['600']);
    const sentence = panel.locator('.menu__sub-line');
    await expect(sentence).toHaveText(
      'wechart runs as one user with every permission. Your proposals still wait for your approval in Reviews.',
    );
    expect(await styleOf(sentence, 'font-size', 'line-height')).toEqual(['14px', '20px']);
  });

  test('on Reviews, its control is marked in the accent', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/reviews');
    const reviews = page.getByRole('banner').getByRole('link', { name: 'Reviews, 3 waiting' });
    await expect(reviews).toHaveAttribute('aria-current', 'page');
    expect(await styleOf(reviews, 'color', 'font-weight')).toEqual([await accentOf(page), '600']);
    // On the accent's soft ground, design 05's .reviews.on.
    expect((await styleOf(reviews, 'background-color'))[0]).not.toBe('rgba(0, 0, 0, 0)');
  });

  test('below 1,280 the chip is its icon alone, named and titled', async ({ page }) => {
    await page.setViewportSize({ width: 1100, height: 800 });
    await page.goto('/explore');
    const chip = page.getByRole('banner').getByRole('button', { name: 'Single-user mode' });
    await expect(chip.getByTestId('single-user-icon')).toBeVisible();
    await expect(chip.getByText('Single-user mode')).toBeHidden();
    await expect(chip.getByTestId('account-chevron')).toBeHidden();
    await expect(chip).toHaveAttribute('title', 'Single-user mode');
    // The search and Reviews keep their words (components-Q4).
    await expect(page.locator('.app-bar > .app-search')).toContainText('Search wechart');
    await expect(page.locator('.app-bar > .app-search')).toBeVisible();
    await expect(page.locator('.app-bar .app-reviews__label')).toBeVisible();
  });

  test('at 1,024 the bar fits: every workspace on one line, the search at 260', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1024, height: 800 });
    await page.goto('/explore');
    const bar = page.getByRole('banner');
    const links = bar.getByRole('navigation', { name: 'Workspaces' }).getByRole('link');
    // One line each: its words' boxes all on one row, never wrapped (CMP-07).
    for (const link of await links.all())
      expect(
        await link.evaluate((each) => {
          const words = document.createRange();
          words.selectNodeContents(each);
          return new Set([...words.getClientRects()].map((box) => Math.round(box.top))).size;
        }),
        await link.innerText(),
      ).toBe(1);
    const search = (await page.locator('.app-bar > .app-search').boundingBox())!;
    expect(Math.round(search.width)).toBe(260);
    expect(
      await page.locator('.app-bar').evaluate((each) => each.scrollWidth - each.clientWidth),
    ).toBe(0);
  });

  test('below 1,024, state H’s order: brand, menu, then Reviews, theme and the chip', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 900, height: 800 });
    await page.goto('/explore');
    const bar = page.getByRole('banner');
    const xs: number[] = [];
    for (const each of [
      bar.getByTestId('brand-mark'),
      bar.getByRole('button', { name: 'Menu' }),
      bar.getByRole('link', { name: 'Reviews, 3 waiting' }),
      bar.getByRole('button', { name: /theme/i }),
      bar.getByRole('button', { name: 'Single-user mode' }),
    ])
      xs.push((await each.boundingBox())!.x);
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
    // The menu straight after the brand, the spacer after it.
    const brand = (await bar.locator('.app-bar__product').boundingBox())!;
    expect(Math.round(xs[1]! - (brand.x + brand.width))).toBeLessThanOrEqual(16);
  });
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
