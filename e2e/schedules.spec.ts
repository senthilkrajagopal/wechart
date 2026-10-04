import { expect, test } from '@playwright/test';

import { ownCubeFile, PUBLISHED } from './model-files';

/**
 * T160, T551 / AC-154: THE SYSTEM SHALL list every pre-aggregation's refresh
 * schedule in Schedules, those of cubes marked `public: false` included, …;
 * label each with its owner … as an icon and a label; show each schedule in
 * words and as written, with its zone, its next run …, and its last run …;
 * show Cube-owned schedules read-only there with a link opening the
 * pre-aggregation in the model editor, and say when one is not scheduled.
 * `Fails when: a refresh_key schedule is editable on the Schedules page, is
 * unlabelled, or its link does not open the model editor; a pre-aggregation
 * of a cube marked public: false is missing; …`
 *
 * On the real Cube, through xcube's admin meta with hidden=true (research
 * xcube-jobs-schedules-routes.md §2), with cube files of this browser's own:
 * a cron in its zone, a rollup Cube never refreshes, and a cube that isn't
 * public.
 */
test('Schedules lists each refresh schedule as Cube’s, a hidden cube’s too, read-only, and opens the pre-aggregation in Model', async ({
  page,
  request,
  browserName,
}) => {
  const cube = `schedules_${browserName}`;
  const hidden = `schedules_hidden_${browserName}`;
  await ownCubeFile(
    request,
    cube,
    `cubes:
  - name: ${cube}
    sql_table: public.orders
    dimensions:
      - name: status
        sql: status
        type: string
    measures:
      - name: count
        type: count
    pre_aggregations:
      - name: mornings
        measures: [CUBE.count]
        dimensions: [CUBE.status]
        refresh_key:
          every: "0 8 * * *"
          timezone: America/Los_Angeles
      - name: on_demand
        measures: [CUBE.count]
        scheduled_refresh: false
`,
  );
  const hiddenPath = await ownCubeFile(
    request,
    hidden,
    `cubes:
  - name: ${hidden}
    sql_table: public.orders
    public: false
    measures:
      - name: count
        type: count
    pre_aggregations:
      - name: main
        measures: [CUBE.count]
        scheduled_refresh: false
        refresh_key:
          every: 1 day
`,
  );

  await page.goto('/schedules');
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { level: 1 })).toHaveText('Schedules');
  const table = main.getByRole('table', { name: 'Refresh schedules' });
  const mornings = table.getByRole('row').filter({ hasText: `${cube}.mornings` });
  // In words and as written, with its zone: as written on a line of its own (T551's review).
  await expect(mornings).toContainText('Daily at 08:00, Los Angeles', PUBLISHED);
  const written = mornings.getByText('every: "0 8 * * *" · timezone: America/Los_Angeles');
  const words = mornings.getByText('Daily at 08:00, Los Angeles');
  const below = async () =>
    ((await written.boundingBox())?.y ?? 0) >=
    ((await words.boundingBox())?.y ?? 0) + ((await words.boundingBox())?.height ?? 0) - 1;
  expect(await below()).toBe(true);
  // Labelled with its owner, as an icon and a label.
  const owner = mornings.getByTestId('owner');
  await expect(owner).toHaveText('Cube’s refresh worker');
  await expect(owner.locator('svg[data-icon="cube"]')).toHaveCount(1);
  // Its next run, with UTC; its pane's five, a grid of day, time and UTC.
  await expect(mornings.getByRole('cell').nth(3)).toContainText(/\d{2}:\d{2} UTC · in /);
  await mornings.click();
  const runs = page
    .getByRole('complementary', { name: 'Schedule details' })
    .getByRole('list', { name: 'Next runs' });
  await expect(runs).toHaveCSS('display', 'grid');
  await expect(runs).toHaveCSS('list-style-type', 'none');
  // One Cube never refreshes says so, with its icon.
  const onDemand = table.getByRole('row').filter({ hasText: `${cube}.on_demand` });
  await expect(onDemand).toContainText('Not scheduled');
  await expect(onDemand.locator('svg[data-icon="off"]')).toHaveCount(1);
  // The seed rollup, with its interval.
  await expect(
    table.getByRole('row').filter({ hasText: 'monthly_orders.by_status_month' }),
  ).toContainText('Every hour');
  // A cube marked public: false: listed all the same.
  const hiddenRow = table.getByRole('row').filter({ hasText: `${hidden}.main` });
  await expect(hiddenRow).toContainText('Not scheduled', PUBLISHED);

  // Read-only: nothing on the page edits a schedule.
  await expect(main.locator('input, select, textarea, [role="switch"]')).toHaveCount(0);
  await expect(table.getByRole('button')).toHaveCount(0);

  // Its pane opens the pre-aggregation itself in the model editor: its file,
  // on its cube's Pre-aggregations tab, with this one open (T160's review).
  await hiddenRow.click();
  const pane = page.getByRole('complementary', { name: 'Schedule details' });
  await expect(pane.getByTestId('schedule-written')).toHaveText('scheduled_refresh: false');
  // Jobs reads only what queries reach, so it isn't there: said, not linked (T551's review).
  await expect(pane.getByRole('link', { name: 'Open in Jobs' })).toHaveCount(0);
  await expect(pane.getByTestId('schedule-not-in-jobs')).toHaveText(
    'Its cube isn’t public, so Jobs doesn’t list it.',
  );
  await pane.getByRole('link', { name: 'Open in Model' }).click();
  await expect(page).toHaveURL(
    new RegExp(
      `/model/files/${encodeURIComponent(hiddenPath)}\\?cube=${hidden}&tab=pre_aggregations&member=main$`,
    ),
  );
  const form = page.getByRole('region', { name: `Cube ${hidden}` });
  await expect(form.getByRole('tab', { name: /^Pre-aggs/ })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(
    form
      .locator('details.model-member')
      .filter({ has: page.locator('summary', { hasText: 'main' }) }),
  ).toHaveAttribute('open', '');
});
