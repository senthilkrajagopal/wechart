import { expect, test, type Page } from '@playwright/test';

/**
 * T023. The seeded dashboard, opened for real.
 *
 * AC-018: WHEN the user opens a dashboard from Explore, THE SYSTEM SHALL open
 * it in view mode with its saved page tabs, tiles and settings.
 * AC-053: WHEN the user activates Edit, THE SYSTEM SHALL show the edit bar
 * with Undo, Redo, Discard and Save, and the edit sidebar with Add, Outline
 * and Properties.
 * AC-054: WHILE editing, THE SYSTEM SHALL show a 12-column grid on the canvas.
 * AC-039: THE SYSTEM SHALL give a member the same colour in every tile.
 *
 * The components behind all four are unit-tested, but unit tests cannot show
 * that anything renders them, that the CSS paints, or that a mark comes out
 * the colour it was assigned. That is what this file is for — and it is why
 * these criteria were left unticked at T059 and T060.
 */
const DASHBOARD = '/explore/dashboards/seed-root-dashboard-1';

const open = async (page: Page) => {
  await page.goto(DASHBOARD);
  await expect(page.getByRole('heading', { name: 'Company dashboard 01' })).toBeVisible();
};

test('opens in view mode with its saved pages, tiles and settings', async ({ page }) => {
  await open(page);

  // View mode, not edit mode: the criterion fails if it opens ready to edit.
  await expect(page.getByRole('toolbar', { name: 'Dashboard editing' })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Edit' })).toBeVisible();

  // Both saved page tabs.
  const pages = page.getByRole('tablist', { name: 'Pages' });
  await expect(pages.getByRole('tab')).toHaveText(['Overview', 'Appendix']);

  // Every saved tile on the open page, the one inside the section included.
  await expect(page.getByTestId('grid-tile')).toHaveCount(3);
  await expect(page.getByText('Orders by status, this quarter.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Detail' })).toBeVisible();

  // And the saved setting, as painted rather than as an attribute: a setting
  // that is read back and then ignored is a setting that did not survive.
  const surface = page.getByTestId('dashboard-page');
  await expect(surface).toHaveAttribute('data-width', 'fixed');
  expect(await surface.evaluate((node) => getComputedStyle(node).maxWidth)).toBe('1440px');
});

test('opens the other saved page tab', async ({ page }) => {
  await open(page);
  await page.getByRole('tablist', { name: 'Pages' }).getByRole('tab', { name: 'Appendix' }).click();

  await expect(page.getByRole('heading', { name: 'Definitions' })).toBeVisible();
  await expect(page.getByTestId('grid-tile')).toHaveCount(1);
});

test('activating Edit reveals the edit bar and the sidebar', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Edit' }).click();

  const bar = page.getByRole('toolbar', { name: 'Dashboard editing' });
  await expect(bar.getByRole('button')).toHaveText(['Undo', 'Redo', 'Discard', 'Save']);

  const sidebar = page.getByRole('complementary', { name: 'Edit sidebar' });
  await expect(sidebar.getByRole('tab')).toHaveText(['Add', 'Outline', 'Properties']);
});

test('the canvas is actually painted with a 12-column grid while editing', async ({ page }) => {
  await open(page);
  const canvas = page.getByTestId('grid-canvas').first();

  const before = await canvas.evaluate((node) => getComputedStyle(node).backgroundImage);
  // In view mode the gridlines would be chrome over the data.
  expect(before).toBe('none');

  await page.getByRole('button', { name: 'Edit' }).click();

  const painted = await canvas.evaluate((node) => getComputedStyle(node).backgroundImage);
  // The data- attribute is the switch; this is the painting. A rule that was
  // deleted or whose selector stopped matching leaves the attribute set and
  // the canvas blank, which is the failure a unit test cannot see.
  expect(painted).toContain('repeating-linear-gradient');

  // And the lines have to fall on the real tracks. The period is one column
  // pitch: a track plus its gutter, which for 12 columns and 11 gutters of
  // 16px is (width + 16) / 12.
  const { period, width } = await canvas.evaluate((node) => ({
    period: getComputedStyle(node).backgroundImage,
    width: node.getBoundingClientRect().width,
  }));
  // The browser keeps the period as a calc of a percentage and a length —
  // `calc(8.33333% + 1.33333px)` — because a percentage of the element cannot
  // be resolved until it is laid out. Resolve it here against the measured
  // width and compare with the pitch the tiles are actually on.
  const calc = /calc\(([\d.]+)%\s*\+\s*([\d.]+)px\)/.exec(period);
  expect(calc).not.toBeNull();

  const found = (Number(calc?.[1]) / 100) * width + Number(calc?.[2]);
  const expected = (width + 16) / 12;

  expect(found).toBeGreaterThan(1);
  expect(Math.abs(found - expected)).toBeLessThan(0.5);
});

test('a member keeps one colour across two tiles', async ({ page }) => {
  await open(page);

  // Both seeded charts split by orders.status, so the same members are drawn
  // in both tiles. Colour by rank would give them different colours, because
  // the two charts return their statuses in a different order.
  const tiles = page.getByTestId('grid-tile');
  await expect(tiles.nth(0).locator('svg')).toBeVisible();
  await expect(tiles.nth(2).locator('svg')).toBeVisible();

  /**
   * Which colour each member was drawn in, read off the legend, so the
   * comparison is member-to-member. Comparing two lists of fills by position
   * is precisely the bug the criterion is about, and would pass whatever the
   * colours meant.
   *
   * The marker is located by geometry rather than by structure: zrender emits
   * a flat SVG with no group per legend entry, so there is no parent to ask.
   * A legend marker is the nearest filled shape immediately left of its label
   * on the same line.
   */
  const legendOf = (index: number) =>
    tiles.nth(index).evaluate((tile) => {
      const marks = [...tile.querySelectorAll('svg path[fill]')]
        .filter((path) => {
          const fill = path.getAttribute('fill');
          if (fill === null || fill === 'none' || fill === 'transparent') return false;
          // Legend icons are small. This drops the bars themselves and the
          // legend's full-width hit area, either of which could otherwise sit
          // to the left of some label.
          const box = path.getBoundingClientRect();
          return box.height <= 24 && box.width <= 60;
        })
        .map((path) => ({
          fill: path.getAttribute('fill') ?? '',
          box: path.getBoundingClientRect(),
        }));

      const found: Record<string, string> = {};
      for (const text of tile.querySelectorAll('svg text')) {
        const name = (text.textContent ?? '').trim();
        if (name === '') continue;

        const label = text.getBoundingClientRect();
        const middle = label.top + label.height / 2;
        const marker = marks
          .filter(
            (mark) =>
              mark.box.right <= label.left + 2 &&
              Math.abs(mark.box.top + mark.box.height / 2 - middle) < 8,
          )
          .sort((a, b) => b.box.right - a.box.right)[0];

        if (marker !== undefined && label.left - marker.box.right < 24) found[name] = marker.fill;
      }
      return found;
    });

  // The legend is drawn after the SVG appears, so wait for it rather than
  // reading an empty one and concluding the two tiles agree about nothing.
  for (const index of [0, 2]) {
    await expect
      .poll(async () => Object.keys(await legendOf(index)).length, { timeout: 10_000 })
      .toBeGreaterThan(1);
  }

  const [first, third] = [await legendOf(0), await legendOf(2)];
  const shared = Object.keys(first).filter((member) => member in third);

  // Both charts split by orders.status, so they share members to disagree
  // about.
  expect(shared.length).toBeGreaterThan(1);

  /**
   * The premise, asserted rather than assumed. Colour falls back to position
   * when a tile chooses for itself, so two charts that happened to reach their
   * members in the same order would paint identically whether or not the
   * dashboard's assignment reached them — and every assertion below would hold
   * while proving nothing.
   *
   * The seeded pair is built to differ: one chart groups by category, the
   * other runs over time, and the sample orders cycle through the statuses day
   * by day. If that ever stops being true this fails here, loudly, instead of
   * quietly going hollow.
   */
  expect(Object.keys(third)).not.toEqual(Object.keys(first));

  for (const member of shared) expect(third[member]).toBe(first[member]);

  // And the shared members are not all one colour, which would make the
  // assertion above true and meaningless.
  expect(new Set(shared.map((member) => first[member])).size).toBe(shared.length);
});
