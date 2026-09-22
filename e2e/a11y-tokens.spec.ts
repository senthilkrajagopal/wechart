import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * AC-004: THE SYSTEM SHALL render every text node at a computed font size of at
 * least 12 px. Fails when: any rendered text node has a computed font-size
 * below 12 px.
 *
 * AC-005: THE SYSTEM SHALL meet WCAG AA contrast for text in both themes.
 * Fails when: any text node's contrast ratio against its own background is
 * below its threshold.
 *
 * Both criteria are stated over *rendered* nodes, which is why they are checked
 * here and not only over the token set in packages/ui: a component that
 * hard-codes a colour or a size without a token passes every unit test and
 * fails here. The token audit and this one both use 700 as the bold threshold,
 * so they agree rather than disagreeing on `text-lg` (see
 * docs/research/test-stack.md, "Addendum: the bold threshold").
 */
const THEMES = ['light', 'dark'] as const;
// A model file's page too: its YAML is text, in the editor's own colours (T139's review).
// And a dashboard being read: its tiles' heads carry text (T154's data-as-of badge).
const SURFACES = [
  '/explore',
  '/explore/dashboards/seed-root-dashboard-1',
  '/jobs',
  // The query log, a tab beside the pre-aggregations since T155.
  '/jobs?tab=queries',
  '/model',
  '/model/files/cubes%2Forders.yml',
  '/security',
];

const MIN_FONT_SIZE_PX = 12;

/** Every rendered text node's computed size, with enough context to find it. */
const FONT_SIZE_SWEEP = `(() => {
  const offenders = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (!node.textContent || !node.textContent.trim()) continue;
    const element = node.parentElement;
    if (!element) continue;
    const style = getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden') continue;
    // No skip. An earlier version of this file excluded <option> on the
    // grounds that WebKit ignored author font-size there; measuring each
    // engine showed it does not (docs/research/webkit-select-font-size.md),
    // and an explicit size in the shell stylesheet brings the open list to
    // 14px. What WebKit will not move is the *closed* select control, which
    // has no text node of its own and so was never measured here anyway.
    const size = Number.parseFloat(style.fontSize);
    if (size < ${String(MIN_FONT_SIZE_PX)}) {
      offenders.push({
        text: node.textContent.trim().slice(0, 40),
        size,
        selector: element.tagName.toLowerCase() + (element.className ? '.' + String(element.className).split(' ').join('.') : ''),
      });
    }
  }
  return offenders;
})()`;

async function openInTheme(page: Page, path: string, theme: (typeof THEMES)[number]) {
  await page.addInitScript(
    ([key, value]) => window.localStorage.setItem(key as string, value as string),
    ['wechart.theme', theme],
  );
  await page.goto(path);
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
  // Wait for the app to be mounted and its data settled before auditing.
  // Under parallel load axe otherwise runs mid-render and reports colours from
  // a frame where the token stylesheet or the content is not yet in place —
  // a failure about timing rather than about contrast.
  await expect(page.getByRole('banner')).toBeVisible();
  await page.waitForLoadState('networkidle');
}

for (const theme of THEMES) {
  test.describe(`${theme} theme`, () => {
    for (const path of SURFACES) {
      test(`meets WCAG AA contrast at ${path} (AC-005)`, async ({ page }) => {
        await openInTheme(page, path, theme);

        const results = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze();

        expect(
          results.violations.flatMap((violation) =>
            violation.nodes.map((node) => `${node.target.join(' ')}: ${node.failureSummary ?? ''}`),
          ),
        ).toEqual([]);
      });

      test(`renders no text below 12 px at ${path} (AC-004)`, async ({ page }) => {
        await openInTheme(page, path, theme);

        expect(await page.evaluate(FONT_SIZE_SWEEP)).toEqual([]);
      });
    }
  });
}

test('the font-size sweep detects a violation, so a pass means something', async ({ page }) => {
  await openInTheme(page, '/explore', 'light');

  // Without this, "no offenders" could mean the walker never found any text.
  expect(await page.evaluate(FONT_SIZE_SWEEP)).toEqual([]);

  await page.evaluate(() => {
    const offender = document.createElement('p');
    offender.textContent = 'too small to read';
    offender.style.fontSize = '11px';
    document.body.append(offender);
  });

  const offenders = (await page.evaluate(FONT_SIZE_SWEEP)) as { size: number; text: string }[];
  expect(offenders).toHaveLength(1);
  expect(offenders[0]?.size).toBe(11);
});

test('the contrast audit detects a violation, so a pass means something', async ({ page }) => {
  await openInTheme(page, '/explore', 'light');

  await page.evaluate(() => {
    const offender = document.createElement('p');
    offender.textContent = 'grey on white, far below AA';
    offender.style.color = '#bbbbbb';
    offender.style.backgroundColor = '#ffffff';
    document.body.append(offender);
  });

  const results = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze();
  expect(results.violations).not.toEqual([]);
});
