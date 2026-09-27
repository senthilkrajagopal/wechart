import { expect, test } from '@playwright/test';

/**
 * T238 / AC-233: WHEN the user opens Schedules or Data sources, THE SYSTEM
 * SHALL show the page's title and a note saying what the page is for, and,
 * where managing its subject waits for a later phase (Schedules), that it
 * does; Data sources SHALL NOT say so (T364). It SHALL treat "/sources" as
 * Data sources.
 * `Fails when: either page renders nothing, or "/sources" shows Not found.`
 *
 * The admin critique found both pages rendering an empty <main> — which reads
 * as broken rather than as deferred — and "/sources" answering Not found with
 * Explore marked as the current workspace.
 */
test('Schedules shows its title and says what it is for, and that scheduling from wechart waits', async ({
  page,
}) => {
  await page.goto('/schedules');
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { level: 1 })).toHaveText('Schedules');
  // A note, with its icon, rather than an empty page.
  const note = main.getByRole('note');
  await expect(note).toContainText(/isn’t available yet/i);
  // And what the page is for: where its subject is set today.
  await expect(note).toContainText(/refresh key/);
  // Said without a word of phases (T466, UX-111).
  await expect(note).not.toContainText(/\bphase\b/i);
  await expect(note.locator('[data-icon]')).toHaveCount(1);
});

/**
 * T364: data sources are folders' items now (T335), so Data sources says what
 * it is for and lists them; AC-233 fails when it says managing them is not
 * part of this phase. This suite's single user sees every folder: the page
 * lists what its database holds or, holding none, says none has been added.
 */
test('Data sources shows its title and says what it is for, never that it waits', async ({
  page,
}) => {
  await page.goto('/data-sources');
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { level: 1 })).toHaveText('Data sources');
  const notes = main.getByRole('note');
  await expect(notes.first()).toContainText('Every data source you can see, in every folder');
  await expect(notes.first().locator('[data-icon]')).toHaveCount(1);
  await expect(main).not.toContainText(/not part of this phase/i);
  // It read them: a list, or the note that there are none — never an error.
  await expect(
    main
      .getByRole('table', { name: 'Data sources' })
      .or(main.getByText('No data source has been added yet.')),
  ).toBeVisible();
});

test('"/sources" opens Data sources', async ({ page }) => {
  await page.goto('/sources');
  await expect(page).toHaveURL(/\/data-sources$/);
  await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toHaveText(
    'Data sources',
  );
});

/**
 * T238 / AC-231: THE SYSTEM SHALL draw the workspaces' page titles in
 * direction.md's page-title style, and their tables as cards with a header
 * band, rows of 34 pixels, 12-pixel cells and tabular numerals.
 * `Fails when: a workspace page title is not 20 px at weight 600, or a
 * workspace table's numbers are not tabular.`
 *
 * The admin critique measured the browser-default h1 — 28 px at 700 — on Jobs
 * and Security, and tables bare on the page with proportional figures.
 */
for (const path of [
  '/jobs',
  '/security',
  '/model',
  '/schedules',
  '/data-sources',
  '/explore',
  // A page inside a workspace is titled the same way.
  '/explore/charts/seed-chart-status',
  // Not the chart editor: its title is the chart's own, an editable field in
  // its one header row (AC-214), as the prototype's editor has it.
])
  test(`${path}'s title is the prototype's page title, 20 px at 600`, async ({ page }) => {
    await page.goto(path);
    const title = page.getByRole('main').getByRole('heading', { level: 1 }).first();
    await expect(title).toBeVisible();
    expect(
      await title.evaluate((node) => {
        const style = getComputedStyle(node);
        return [style.fontSize, style.fontWeight, style.lineHeight];
      }),
    ).toEqual(['20px', '600', '26px']);
  });

// AC-231 as amended by R34: a model file is headed by its path in the editor's
// head, at design 03's 13/600 in the code face — a file, one that is code, and
// one there is none of (T234's review) — not by a page title (T479, D1).
for (const path of [
  '/model/files/cubes%2Forders.yml',
  '/model/files/cubes%2Ftemplated_example.yml',
  '/model/files/cubes%2Fno_such_file.yml',
])
  test(`${path} is headed by its path, 13 px at 600 in the code face`, async ({ page }) => {
    await page.goto(path);
    const title = page.getByRole('main').getByRole('heading', { level: 1 }).first();
    await expect(title).toBeVisible();
    expect(
      await title.evaluate((node) => {
        const style = getComputedStyle(node);
        return [
          style.fontSize,
          style.fontWeight,
          style.lineHeight,
          style.fontFamily.split(',')[0]?.replace(/"/g, ''),
        ];
      }),
    ).toEqual(['13px', '600', '20px', 'IBM Plex Mono']);
  });

for (const [path, name] of [
  ['/jobs?tab=queries', 'Query log'],
  ['/security', 'Access policies'],
  ['/explore', 'Explore contents'],
] as const)
  test(`the ${name} table is a card with tabular numerals and 34 px rows`, async ({ page }) => {
    // A dashboard's queries first, so the log has rows to measure.
    await page.goto('/explore/dashboards/seed-root-dashboard-1');
    await expect(page.getByTestId('chart-canvas').first()).toBeVisible();
    await page.goto(path);
    const table = page.getByRole('main').getByRole('table').first();
    await expect(table.getByRole('row').nth(1)).toBeVisible();
    const drawn = await table.evaluate((node) => {
      const cell = node.querySelector('tbody td') as HTMLElement;
      const head = node.querySelector('thead th') as HTMLElement;
      // A one-line row, as the rules draw it: a row grows to fit what wraps,
      // and which rows wrap depends on the browser's fonts, so a copy of the
      // first row with one character in each cell is what is measured.
      const sample = (node.querySelector('tbody tr') as HTMLElement).cloneNode(true) as HTMLElement;
      for (const each of sample.children) (each as HTMLElement).textContent = '1';
      (node.querySelector('tbody') as HTMLElement).prepend(sample);
      const oneLine = Math.round(sample.getBoundingClientRect().height);
      sample.remove();
      // The band is bg-subtle itself, resolved the way the browser paints it.
      const probe = document.createElement('div');
      probe.style.background = 'var(--wc-bg-subtle)';
      document.body.append(probe);
      const subtle = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return {
        numerals: getComputedStyle(cell).fontVariantNumeric,
        cellSize: getComputedStyle(cell).fontSize,
        row: oneLine,
        width:
          Math.round(node.getBoundingClientRect().width) ===
          Math.round(
            (node.parentElement as HTMLElement).getBoundingClientRect().width -
              parseFloat(getComputedStyle(node.parentElement as HTMLElement).paddingLeft) -
              parseFloat(getComputedStyle(node.parentElement as HTMLElement).paddingRight),
          ),
        border: getComputedStyle(node).borderTopWidth,
        radius: getComputedStyle(node).borderTopLeftRadius,
        band: getComputedStyle(head).backgroundColor === subtle,
      };
    });
    expect(drawn).toEqual({
      numerals: 'tabular-nums',
      cellSize: '12px',
      row: 34,
      width: true,
      border: '1px',
      radius: '6px',
      band: true,
    });
  });

test('a page that does not exist marks no workspace as the current one', async ({ page }) => {
  await page.goto('/no-such-place');
  await expect(page.getByRole('heading', { name: 'Not found' })).toBeVisible();
  await expect(
    page.getByRole('navigation', { name: /workspaces/i }).locator('[aria-current="page"]'),
  ).toHaveCount(0);
});
