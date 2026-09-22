import { expect, test } from '@playwright/test';

/**
 * T154 / AC-148: WHEN the user asks to refresh a chart's data, THE SYSTEM
 * SHALL re-query Cube bypassing wechart's cached result and show the new
 * data-as-of time.
 * Fails when: the previous result is shown again with an unchanged
 * timestamp.
 *
 * On the seed dashboard, against the real Cube: the tile says when its data
 * is from (Cube's `lastRefreshTime`), and "Refresh" asks Cube past its cache
 * (`cache: 'no-cache'`, which "Skips refresh key checks"; research/cube/
 * refresh-jobs-caching.md), so the time moves on.
 */
test('refreshing a chart asks Cube again and shows the newer data-as-of time', async ({ page }) => {
  await page.goto('/explore/dashboards/seed-root-dashboard-1');
  const tile = page.locator('[data-tile="tile-status"]');
  const asOf = tile.getByTestId('data-as-of');
  await expect(asOf).toHaveText(/^Data as of \d{1,2}:\d{2}:\d{2}/);
  const before = await asOf.getAttribute('datetime');

  // A second on, so a newer answer has a later time to show.
  await page.waitForTimeout(1100);
  const asked: string[] = [];
  page.on('request', (request) => {
    if (request.url().endsWith('/api/load')) asked.push(request.postData() ?? '');
  });
  await tile.getByRole('button', { name: /^Refresh / }).click();

  await expect(async () => {
    const after = await asOf.getAttribute('datetime');
    expect(Date.parse(after ?? '')).toBeGreaterThan(Date.parse(before ?? ''));
  }).toPass({ timeout: 10_000 });
  // Asked past Cube's cache, and only this tile's chart.
  expect(asked.length).toBeGreaterThan(0);
  expect(asked.every((body) => (JSON.parse(body) as { cache?: string }).cache === 'no-cache')).toBe(
    true,
  );
});
