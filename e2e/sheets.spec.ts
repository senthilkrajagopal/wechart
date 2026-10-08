import { expect, test, type Locator, type Page } from '@playwright/test';

import { PUBLISHED } from './model-files';

/**
 * T640 (AC-176, AC-399; design 16, G8 and direction.md rule 85): below
 * 1,024 px, drawn here at 900, Jobs' and Schedules' panes are full-screen
 * sheets, and each acts as one:
 * - Esc closes it, asking first over a half-typed schedule form;
 * - focus stays inside it, and isn't left under it;
 * - its toast is over it, never hidden under it;
 * - closing it gives focus back to what opened it: its row, or New schedule;
 * - Resume keeps focus in it; a sheet opened from `?preagg=` takes focus
 *   once its pre-aggregation is read; and one closed because access went
 *   (G5) leaves focus on the list.
 */
const ROLLUP = 'monthly_orders.by_status_month';

test.use({ viewport: { width: 900, height: 800 } });

/** Whether focus is inside `box`. */
const focusIn = (box: Locator) =>
  box.evaluate((element) => element.contains(document.activeElement));

/** Tab or Shift+Tab `times` times, focus inside `box` after each. */
async function staysIn(page: Page, box: Locator, key: 'Tab' | 'Shift+Tab', times: number) {
  for (let at = 0; at < times; at += 1) {
    await page.keyboard.press(key);
    expect(await focusIn(box), `${key} ${String(at + 1)}`).toBe(true);
  }
}

test('the Jobs sheet: focus stays in it, Esc closes it, and focus goes back to its row', async ({
  page,
}) => {
  await page.goto('/jobs');
  const row = page
    .getByRole('table', { name: 'Pre-aggregations' })
    .getByRole('row')
    .filter({ hasText: ROLLUP });
  await row.click();
  const sheet = page.getByRole('complementary', { name: 'Pre-aggregation details' });
  await expect(sheet.getByRole('heading', { level: 2 })).toBeFocused();

  // Shift+Tab from × reaches nothing under the sheet.
  await sheet.getByRole('button', { name: 'Back to the list' }).focus();
  await staysIn(page, sheet, 'Shift+Tab', 3);
  await staysIn(page, sheet, 'Tab', 12);

  await page.keyboard.press('Escape');
  await expect(sheet.getByRole('heading', { level: 2 })).toHaveCount(0);
  await expect(row).toBeFocused();
});

test('a sheet left for another tab keeps no hold on Tab there', async ({ page }) => {
  await page.goto('/jobs');
  await page
    .getByRole('table', { name: 'Pre-aggregations' })
    .getByRole('row')
    .filter({ hasText: ROLLUP })
    .click();
  const sheet = page.getByRole('complementary', { name: 'Pre-aggregation details' });
  await sheet.getByRole('link', { name: 'All its builds in Run history' }).click();
  await expect(page.getByRole('tab', { name: 'Run history' })).toHaveAttribute(
    'aria-selected',
    'true',
  );

  // Tab moves on Run history, to what can be seen, not into the sheet left under Pre-aggregations.
  await page.getByRole('tab', { name: 'Run history' }).focus();
  for (let at = 0; at < 3; at += 1) {
    const was = await page.evaluate(() => document.activeElement?.outerHTML ?? '');
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.activeElement?.outerHTML ?? '')).not.toBe(was);
    await expect(page.locator(':focus')).toBeVisible();
  }

  // Back on Pre-aggregations, by ← in the tabs, the sheet over it takes focus again,
  // not the tab it covers (T640's review).
  await page.getByRole('tab', { name: 'Run history' }).focus();
  await page.keyboard.press('ArrowLeft');
  await expect(sheet.getByRole('heading', { level: 2 })).toBeFocused();
});

test('the Not found sheet, closed, leaves focus on the list', async ({ page }) => {
  await page.goto('/jobs?preagg=no_such.rollup');
  const sheet = page.getByRole('complementary', { name: 'Pre-aggregation details' });
  await expect(sheet.getByRole('heading', { level: 2 })).toHaveText('Not found');
  await expect(sheet.getByRole('heading', { level: 2 })).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(sheet.getByRole('heading', { level: 2 })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Pre-aggregations' })).toBeFocused();
});

test('the build toast is over the sheet, its buttons in reach, never hidden under it', async ({
  page,
}) => {
  await page.route('**/api/builds', (route) =>
    route.fulfill({ json: { tokens: ['t-sheet'], runId: 'run-sheet' } }),
  );
  await page.goto(`/jobs?preagg=${encodeURIComponent(ROLLUP)}`);
  const sheet = page.getByRole('complementary', { name: 'Pre-aggregation details' });
  await sheet.getByRole('button', { name: /^Build (all|now)/ }).click();

  const toast = page.getByRole('status').filter({ hasText: 'Follow it in Queue' });
  await expect(toast).toBeVisible();
  const follow = toast.getByRole('button', { name: 'Follow it in Queue' });
  // What is at its middle is the toast's own button, not the sheet over it.
  const box = await follow.boundingBox();
  const atMiddle = await page.evaluate(
    ({ x, y }) => document.elementFromPoint(x, y)?.closest('[role="status"]') !== null,
    { x: (box?.x ?? 0) + (box?.width ?? 0) / 2, y: (box?.y ?? 0) + (box?.height ?? 0) / 2 },
  );
  expect(atMiddle).toBe(true);
  // Above the sheet's pinned foot, its actions not under it (T640's review).
  const said = await toast.boundingBox();
  const foot = await sheet.locator('.source-pane__foot').boundingBox();
  expect((said?.y ?? Infinity) + (said?.height ?? 0)).toBeLessThanOrEqual(foot?.y ?? -1);
  // Tab reaches it from the sheet, and comes back.
  let reached = false;
  for (let at = 0; at < 20 && !reached; at += 1) {
    await page.keyboard.press('Tab');
    reached = await follow.evaluate((element) => element === document.activeElement);
  }
  expect(reached).toBe(true);
});

test('Run history’s build log sheet: Esc closes it, and focus goes back to its row', async ({
  page,
}) => {
  const build = {
    id: 'b-sheet',
    preAggregation: ROLLUP,
    name: ROLLUP,
    folderId: 'root',
    folderPath: ['Shared'],
    partitions: null,
    granularity: null,
    jobs: 1,
    via: 'build-all',
    starter: { kind: 'person', key: 'admin', name: 'admin' },
    startedAt: '2026-10-02T12:05:12.000Z',
    endedAt: '2026-10-02T12:05:53.000Z',
    durationMs: 41_000,
    outcome: 'done',
    failedCount: 0,
    error: null,
    progress: { done: 1, building: 0 },
  };
  await page.route(/\/api\/jobs\/builds(\?.*)?$/, (route) =>
    route.fulfill({ json: { records: [build], starters: [], folders: [], everyFolder: true } }),
  );
  await page.route('**/api/jobs/builds/b-sheet', (route) =>
    route.fulfill({
      json: { ...build, requestId: 'r', answeredAt: build.startedAt, tokens: [] },
    }),
  );
  await page.goto('/jobs?tab=history');
  const row = page.getByTestId('build-row-b-sheet');
  await row.getByRole('button', { name: ROLLUP }).click();
  const sheet = page.getByRole('complementary', { name: `Build of ${ROLLUP}` });
  await expect(sheet).toBeVisible();
  await staysIn(page, sheet, 'Shift+Tab', 3);

  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
  await expect(row.getByRole('button', { name: ROLLUP })).toBeFocused();

  // × too gives focus back to its row, not the page.
  await row.getByRole('button', { name: ROLLUP }).click();
  await sheet.getByRole('button', { name: 'Close' }).click();
  await expect(sheet).toHaveCount(0);
  await expect(row.getByRole('button', { name: ROLLUP })).toBeFocused();
});

test('the Schedules sheet: New schedule asks before Esc drops what was typed, and gives focus back', async ({
  page,
}) => {
  await page.goto('/schedules');
  const opener = page.getByRole('button', { name: 'New schedule' });
  await expect(opener).toBeVisible(PUBLISHED);
  const sheet = page.getByRole('complementary', { name: 'Schedule details' });

  // × gives focus back to New schedule.
  await opener.click();
  await expect(sheet.getByRole('heading', { level: 2 })).toHaveText('New schedule');
  await sheet.getByRole('button', { name: 'Back to the list' }).click();
  await expect(sheet).toHaveCount(0);
  await expect(opener).toBeFocused();

  // So does Cancel.
  await opener.click();
  await sheet.getByRole('button', { name: 'Cancel' }).click();
  await expect(sheet).toHaveCount(0);
  await expect(opener).toBeFocused();

  // Esc over a half-typed form asks first; Keep editing keeps it, and focus inside it.
  await opener.click();
  const named = sheet.getByRole('textbox', { name: /^Name/ });
  await named.fill('Half typed');
  await staysIn(page, sheet, 'Shift+Tab', 3);
  await page.keyboard.press('Escape');
  const asked = page.getByRole('alertdialog', { name: 'Discard your changes?' });
  await expect(asked).toBeVisible();
  await asked.getByRole('button', { name: 'Keep editing' }).click();
  await expect(named).toHaveValue('Half typed');
  expect(await focusIn(sheet)).toBe(true);
  await page.keyboard.press('Escape');
  await page
    .getByRole('alertdialog', { name: 'Discard your changes?' })
    .getByRole('button', { name: /^Discard/ })
    .click();
  await expect(sheet).toHaveCount(0);
  await expect(opener).toBeFocused();

  // Cancel loses what's typed with no question, as design 16 says (pin 15), focus back on New schedule.
  await opener.click();
  await named.fill('Half typed');
  await sheet.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('alertdialog', { name: 'Discard your changes?' })).toHaveCount(0);
  await expect(sheet).toHaveCount(0);
  await expect(opener).toBeFocused();

  // A refresh key's sheet: Esc closes it, focus back on its row.
  const row = page
    .getByRole('table', { name: 'Refresh schedules' })
    .getByRole('row')
    .filter({ hasText: ROLLUP })
    .filter({ has: page.getByTestId('owner').filter({ hasText: 'Cube’s refresh worker' }) })
    .first();
  await row.click();
  await expect(sheet.getByRole('heading', { level: 2 })).toHaveText(ROLLUP);
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
  await expect(row).toBeFocused();
});

/** One of wechart's schedules as the API lists it, this browser's page's own (routed). */
const OWN = {
  id: 's-sheet',
  name: 'Sheet mornings',
  preAggregation: ROLLUP,
  folderId: 'root',
  cron: '0 5 * * *',
  timezone: 'UTC',
  missed: 'once',
  createdBy: { key: 'admin', name: 'admin' },
  createdAt: '2026-10-01T09:00:00.000Z',
  updatedBy: { key: 'admin', name: 'admin' },
  updatedAt: '2026-10-01T09:00:00.000Z',
  shortName: 'monthly_orders',
  folderPath: ['Shared'],
  when: 'At 05:00 every day.',
  runs: ['2030-01-01T05:00:00.000Z'],
  lastRun: null,
  suspendAfter: 3,
  failuresInARow: 0,
  suspendedAt: null,
  pausedAt: null,
  pausedBy: null,
};

test('a schedule’s sheet: Esc in its Delete dialog closes the dialog only; × asks over a change', async ({
  page,
}) => {
  await page.route('**/api/wechart-schedules', (route) => route.fulfill({ json: [OWN] }));
  await page.goto('/schedules');
  await page
    .getByRole('table', { name: 'Refresh schedules' })
    .getByRole('row')
    .filter({ hasText: 'Sheet mornings' })
    .click();
  const sheet = page.getByRole('complementary', { name: 'Schedule details' });
  await expect(sheet.getByRole('heading', { level: 2 })).toHaveText('Sheet mornings');

  const remove = sheet.getByRole('button', { name: 'Delete…' });
  await remove.click();
  const dialog = page.getByRole('alertdialog', { name: 'Delete “Sheet mornings”?' });
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(sheet.getByRole('heading', { level: 2 })).toHaveText('Sheet mornings');
  await expect(remove).toBeFocused();

  // A change typed, × asks before it goes.
  await sheet.getByRole('textbox', { name: 'Cron expression' }).fill('0 6 * * *');
  await sheet.getByRole('button', { name: 'Back to the list' }).click();
  const asked = page.getByRole('alertdialog', { name: 'Discard your changes?' });
  await expect(asked).toBeVisible();
  await asked.getByRole('button', { name: 'Keep editing' }).click();
  await expect(sheet.getByRole('textbox', { name: 'Cron expression' })).toHaveValue('0 6 * * *');
});

test('a schedule’s sheet closed because access went leaves focus on the list (G5)', async ({
  page,
}) => {
  let gone = false;
  await page.route('**/api/wechart-schedules', (route) =>
    route.fulfill({ json: gone ? [] : [OWN] }),
  );
  await page.route('**/api/wechart-schedules/s-sheet/run', (route) => {
    gone = true;
    return route.fulfill({
      status: 403,
      json: {
        error:
          'You may schedule only the pre-aggregations of folders where you have read-write access.',
      },
    });
  });
  await page.goto('/schedules');
  await page
    .getByRole('table', { name: 'Refresh schedules' })
    .getByRole('row')
    .filter({ hasText: 'Sheet mornings' })
    .click();
  const sheet = page.getByRole('complementary', { name: 'Schedule details' });
  await sheet.getByRole('button', { name: 'Run now' }).click();

  await expect(page.getByText('You no longer have access to do this.')).toBeVisible();
  await expect(sheet).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Refresh schedules' })).toBeFocused();
});

test('Resume keeps focus in the sheet, on its heading', async ({ page }) => {
  const suspended = {
    ...OWN,
    failuresInARow: 3,
    suspendedAt: '2026-10-02T05:00:00.000Z',
    suspendedError: 'failure: timed out',
  };
  let resumed = false;
  await page.route('**/api/wechart-schedules', (route) =>
    route.fulfill({
      json: [resumed ? { ...suspended, suspendedAt: null, failuresInARow: 0 } : suspended],
    }),
  );
  await page.route('**/api/wechart-schedules/s-sheet/resume', (route) => {
    resumed = true;
    return route.fulfill({ json: { ...suspended, suspendedAt: null, failuresInARow: 0 } });
  });
  await page.goto('/schedules');
  await page
    .getByRole('table', { name: 'Refresh schedules' })
    .getByRole('row')
    .filter({ hasText: 'Sheet mornings' })
    .click();
  const sheet = page.getByRole('complementary', { name: 'Schedule details' });
  await sheet.getByRole('button', { name: 'Resume' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Resumed' })).toBeVisible();
  // Not a row under the sheet, nor the page: the sheet's own heading.
  await expect(sheet.getByRole('heading', { level: 2 })).toBeFocused();
});

test('a sheet opened from ?preagg= takes focus once its pre-aggregation is read', async ({
  page,
}) => {
  let release = () => undefined as void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/preaggregations', async (route) => {
    await held;
    await route.continue();
  });
  await page.goto(`/jobs?preagg=${encodeURIComponent(ROLLUP)}`);
  await expect(
    page.getByRole('tabpanel', { name: 'Pre-aggregations' }).getByTestId('skeleton-rows'),
  ).toBeAttached();
  release();
  const sheet = page.getByRole('complementary', { name: 'Pre-aggregation details' });
  await expect(sheet.getByRole('heading', { level: 2 })).toHaveText(ROLLUP);
  await expect(sheet.getByRole('heading', { level: 2 })).toBeFocused();
});

test('a sheet closed because access went leaves focus on the list (G5)', async ({ page }) => {
  let gone = false;
  await page.route('**/api/builds', (route) => {
    gone = true;
    return route.fulfill({
      status: 403,
      json: {
        error:
          'You may build only the pre-aggregations of folders where you have read-write access.',
      },
    });
  });
  // Another rollup stays listed, so the list is there to take focus.
  await page.route('**/api/preaggregations', async (route) => {
    const answer = await route.fetch();
    const rows = (await answer.json()) as { id: string; shortName?: string }[];
    const other = rows.find((each) => each.id === ROLLUP);
    const listed =
      other === undefined
        ? rows
        : [...rows, { ...other, id: 'sheet_other.main', shortName: 'sheet_other' }];
    await route.fulfill({ json: gone ? listed.filter((each) => each.id !== ROLLUP) : listed });
  });
  await page.goto('/jobs');
  await page
    .getByRole('table', { name: 'Pre-aggregations' })
    .getByRole('row')
    .filter({ hasText: ROLLUP })
    .click();
  const sheet = page.getByRole('complementary', { name: 'Pre-aggregation details' });
  await sheet.getByRole('button', { name: /^Build (all|now)/ }).click();

  await expect(page.getByText('You no longer have access to do this.')).toBeVisible();
  await expect(sheet.getByRole('heading', { level: 2 })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Pre-aggregations' })).toBeFocused();
});
