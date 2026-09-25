import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { CATEGORICAL } from '@wechart/ui';

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
  // A library chart's page: its type badge, field pills and section heads (T226).
  '/explore/charts/seed-chart-status',
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

/**
 * T249's review / AC-005, AC-004: the dashboard settings page, section by
 * section, in both themes — the chosen mode card's tint and the inactive
 * banner's warning tint are grounds no token audit covers.
 */
for (const theme of THEMES) {
  test(`the dashboard settings page meets AA contrast and the 12 px floor in ${theme} (AC-005, AC-004)`, async ({
    page,
  }) => {
    await openInTheme(page, '/explore/dashboards/seed-root-dashboard-1', theme);
    await page.getByRole('button', { name: 'Dashboard settings' }).click();
    const settings = page.getByTestId('dashboard-settings');
    const nav = settings.getByRole('navigation', { name: 'Settings sections' });
    for (const section of ['General', 'Interactions', 'Markings', 'Cross-filtering', 'Layout']) {
      await nav.locator(`[data-section="${section}"]`).click();
      await expect(settings.getByRole('heading', { name: section, level: 2 })).toBeVisible();
      const results = await new AxeBuilder({ page })
        .include('[data-testid="dashboard-settings"]')
        .withRules(['color-contrast'])
        .analyze();
      expect(
        results.violations.flatMap((violation) =>
          violation.nodes.map((node) => `${section}: ${node.target.join(' ')}: ${node.failureSummary ?? ''}`),
        ),
      ).toEqual([]);
      expect(await page.evaluate(FONT_SIZE_SWEEP)).toEqual([]);
    }
  });
}

/**
 * T233 / AC-004, reopened 2026-09-24: the surfaces above are swept as they
 * open, and some text only exists in a state they never reach. The Model
 * critique measured one — a problem's `file:line`, at 11 px — which appears
 * only once the YAML stops parsing.
 */
test('renders no text below 12 px with a problem listed in the Model (AC-004)', async ({
  page,
}) => {
  await page.goto('/model/files/cubes%2Forders.yml');
  const problems = page.getByRole('region', { name: 'Problems' });
  await expect(problems).toContainText('No problems in cubes/orders.yml');

  // The same break as model.spec's parse-error test: a nested mapping.
  await page.locator('.cm-line', { hasText: 'sql_table: public.orders' }).click();
  await page.keyboard.press('End');
  await page.keyboard.type(': x');
  await expect(problems.getByRole('listitem')).toHaveCount(1);

  expect(await page.evaluate(FONT_SIZE_SWEEP)).toEqual([]);
});

/**
 * T248's review / AC-004: a dashboard being edited has text a dashboard being
 * read never shows — the sidebar's Add palette, its Outline and a tile's
 * Properties. The Outline's kind chips were drawn at 10 px, and the sweep
 * above, which reads the dashboard only in view mode, could not see them.
 */
test('renders no text below 12 px while a dashboard is edited: Add, Outline and Properties (AC-004)', async ({
  page,
}) => {
  await page.goto('/explore/dashboards/seed-root-dashboard-1');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  const sidebar = page.getByRole('complementary', { name: 'Edit sidebar' });
  await expect(sidebar).toBeVisible();
  expect(await page.evaluate(FONT_SIZE_SWEEP)).toEqual([]);

  await sidebar.getByRole('tab', { name: 'Outline' }).click();
  await expect(sidebar.locator('.outline__icon').first()).toBeVisible();
  expect(await page.evaluate(FONT_SIZE_SWEEP)).toEqual([]);

  await page.locator('.grid-tile').first().click();
  await sidebar.getByRole('tab', { name: 'Properties' }).click();
  expect(await page.evaluate(FONT_SIZE_SWEEP)).toEqual([]);
});

/**
 * T210 / AC-005 and AC-211. axe's colour-contrast rule does not measure text
 * inside an SVG, which is how a chart's axis labels sat at 2.3:1 on the dark
 * tile while every audit here passed. So chart text is measured directly:
 * each label's fill against the background actually behind its tile.
 */
const CHART_TEXT_CONTRAST = `(() => {
  const channel = (value) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const rgb = (text) => {
    const probe = document.createElement('span');
    probe.style.color = text;
    document.body.appendChild(probe);
    const parsed = getComputedStyle(probe).color.match(/[\\d.]+/g).map(Number);
    probe.remove();
    return parsed;
  };
  const luminance = ([r, g, b]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  // A colour of alpha a over a background, as the eye sees it.
  const over = ([r, g, b, a = 1], [br, bg, bb]) => [
    r * a + br * (1 - a),
    g * a + bg * (1 - a),
    b * a + bb * (1 - a),
  ];
  // The opaque colour behind a node: its ancestors' backgrounds, composited
  // from the page up, so a translucent one is not taken for opaque.
  const backgroundOf = (node) => {
    const layers = [];
    for (let at = node; at; at = at.parentElement) {
      const parts = rgb(getComputedStyle(at).backgroundColor);
      if ((parts[3] ?? 1) > 0) layers.push(parts);
      if ((parts[3] ?? 1) >= 1) break;
    }
    return layers.reverse().reduce((under, layer) => over(layer, under), [255, 255, 255]);
  };
  // Every opacity between the text and its chart multiplies its alpha.
  const opacityOf = (node, stop) => {
    let alpha = 1;
    for (let at = node; at && at !== stop; at = at.parentElement) {
      const style = getComputedStyle(at);
      alpha *= Number(style.opacity || 1) * Number(style.fillOpacity || 1);
    }
    return alpha;
  };
  const failing = [];
  for (const canvas of document.querySelectorAll('[data-testid="chart-canvas"]')) {
    const back = backgroundOf(canvas);
    const behind = luminance(back);
    for (const text of canvas.querySelectorAll('svg text')) {
      if (!text.textContent || !text.textContent.trim()) continue;
      const fill = text.getAttribute('fill') || getComputedStyle(text).fill;
      if (!fill || fill === 'none' || fill.startsWith('url(')) continue;
      const [r, g, b, a = 1] = rgb(fill);
      const own = luminance(over([r, g, b, a * opacityOf(text, canvas)], back));
      const ratio = (Math.max(own, behind) + 0.05) / (Math.min(own, behind) + 0.05);
      if (ratio < 4.5) failing.push(text.textContent.trim().slice(0, 30) + ' ' + fill + ' ' + ratio.toFixed(2));
    }
  }
  return failing;
})()`;

test('draws chart text that meets AA contrast in the dark theme (AC-005, AC-211)', async ({
  page,
}) => {
  await openInTheme(page, '/explore/dashboards/seed-root-dashboard-1', 'dark');
  // Every chart drawn, not only the first: one still loading has no text yet
  // and would pass without being measured.
  const canvases = page.getByTestId('chart-canvas');
  await expect(canvases.first()).toBeVisible();
  await expect
    .poll(async () =>
      canvases.evaluateAll((all) => all.every((node) => node.querySelector('svg text') !== null)),
    )
    .toBe(true);

  expect(await page.evaluate(CHART_TEXT_CONTRAST)).toEqual([]);
});

test('redraws a chart in the other palette when the theme switches (AC-211)', async ({ page }) => {
  await openInTheme(page, '/explore/dashboards/seed-root-dashboard-1', 'light');
  const canvas = page.getByTestId('chart-canvas').first();
  await expect(canvas.locator('svg text').first()).toBeVisible();
  // The first mark with a box — a bar — not an invisible hit area or a line.
  const firstBarFill = () =>
    canvas.evaluate((node) => {
      for (const path of node.querySelectorAll('svg path[fill]')) {
        const fill = path.getAttribute('fill');
        const box = (path as SVGGraphicsElement).getBBox();
        if (fill && fill !== 'none' && fill !== 'transparent' && box.width > 2 && box.height > 2)
          return fill;
      }
      return null;
    });
  const light = (await firstBarFill())?.toLowerCase() ?? '';
  // A light categorical slot — and which one, so the dark one can be named.
  const slot = CATEGORICAL.light.findIndex((colour) => colour.toLowerCase() === light);
  expect(slot).toBeGreaterThanOrEqual(0);

  await page.getByRole('button', { name: /theme/i }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  // The same slot in the dark ramp, drawn without a reload: not just some
  // other colour, the one direction.md §5 gives that slot in dark.
  await expect
    .poll(async () => (await firstBarFill())?.toLowerCase())
    .toBe(CATEGORICAL.dark[slot]?.toLowerCase());
  expect(await page.evaluate(CHART_TEXT_CONTRAST)).toEqual([]);
});

test('a pie, a trellis and a heatmap are drawn in the dark palette too (AC-211)', async ({
  page,
  request,
}) => {
  // The seeded dashboard is all bars; these draw legends, panel titles and a
  // colour ramp the bars never exercise.
  const API = 'http://localhost:4100/api';
  const dashboard = (await (
    await request.post(`${API}/documents`, {
      data: { kind: 'dashboard', title: `Dark ${String(Date.now())}`, folderId: 'root' },
    })
  ).json()) as { id: string };
  const chart = async (chartType: string, dimensions: string[], encoding?: object) => {
    const created = (await (
      await request.post(`${API}/documents`, {
        data: { kind: 'chart', title: chartType, folderId: 'root' },
      })
    ).json()) as { id: string };
    await request.put(`${API}/documents/chart/${created.id}`, {
      data: {
        version: 1,
        body: {
          schemaVersion: 1,
          title: chartType,
          owner: 'admin',
          localToDashboardId: dashboard.id,
          chart: {
            source: { cube: 'orders' },
            wells: { measures: ['orders.count'], dimensions, timeDimensions: [] },
            chartType,
            ...(encoding === undefined ? {} : { encoding }),
          },
        },
      },
    });
    return created.id;
  };
  const charts = [
    await chart('pie', ['orders.status']),
    await chart('heatmap', ['orders.status', 'products.category']),
    await chart('trellis', ['orders.status', 'products.category'], {
      x: ['orders.status'],
      y: ['orders.count'],
      facet: ['products.category'],
    }),
  ];
  await request.put(`${API}/documents/dashboard/${dashboard.id}`, {
    data: {
      version: 1,
      body: {
        schemaVersion: 1,
        title: 'Dark types',
        folderId: 'root',
        owner: 'admin',
        pages: [
          {
            id: 'p',
            title: 'Page',
            items: charts.map((chartId, index) => ({
              id: `t${String(index)}`,
              kind: 'chart',
              w: 12,
              h: 40,
              chartId,
            })),
          },
        ],
      },
    },
  });

  await openInTheme(page, `/explore/dashboards/${dashboard.id}`, 'dark');
  const canvases = page.getByTestId('chart-canvas');
  await expect(canvases).toHaveCount(3);
  await expect
    .poll(async () =>
      canvases.evaluateAll((all) => all.every((node) => node.querySelector('svg path') !== null)),
    )
    .toBe(true);

  expect(await page.evaluate(CHART_TEXT_CONTRAST)).toEqual([]);
  // No light categorical colour anywhere in any of them.
  const fills = await canvases.evaluateAll((all) =>
    all.flatMap((node) =>
      [...node.querySelectorAll('svg [fill]')].map((mark) =>
        mark.getAttribute('fill')?.toLowerCase(),
      ),
    ),
  );
  const light = CATEGORICAL.light.map((colour) => colour.toLowerCase());
  expect(fills.filter((fill) => fill !== undefined && light.includes(fill))).toEqual([]);
});

for (const theme of THEMES)
  test(`the open palette's results meet AA contrast in the ${theme} theme (AC-005)`, async ({
    page,
  }) => {
    // Audited closed before, which is how its results went unmeasured: they
    // were browser-default link blue, 1.63:1 on the dark palette.
    await openInTheme(page, '/explore', theme);
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+k' : 'Control+k');
    const palette = page.getByRole('dialog', { name: 'Search' });
    await palette.getByRole('combobox').fill('Company');
    await expect(
      palette.getByRole('listbox', { name: 'Search results' }).getByRole('option').first(),
    ).toBeVisible();
    // With one result active, so the highlighted row is audited too.
    await page.keyboard.press('ArrowDown');

    const results = await new AxeBuilder({ page })
      .include('.palette')
      .withRules(['color-contrast'])
      .analyze();
    expect(
      results.violations.flatMap((violation) =>
        violation.nodes.map((node) => `${node.target.join(' ')}: ${node.failureSummary ?? ''}`),
      ),
    ).toEqual([]);
  });

test("Security's dashboard results meet AA contrast in the dark theme (AC-005)", async ({
  page,
}) => {
  // Another list of links nothing had styled: browser blue on a dark card.
  await openInTheme(page, '/security', 'dark');
  await page.getByRole('searchbox', { name: /dashboard/i }).fill('Company');
  await expect(page.getByRole('link', { name: /Company dashboard/ }).first()).toBeVisible();

  const results = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze();
  expect(
    results.violations.flatMap((violation) =>
      violation.nodes.map((node) => `${node.target.join(' ')}: ${node.failureSummary ?? ''}`),
    ),
  ).toEqual([]);
});

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
