import type { Page } from '@playwright/test';

import { expect, test } from './fixtures';

/**
 * T322 (AC-008): WHILE security is enabled, [wechart] SHALL also attach the
 * signed-in user's AD groups, so the model's access policies apply by group.
 * `Fails when: … a group's access policy doesn't apply to its members' queries.`
 *
 * The seeded `secured_orders` view (infra/cube/model/views/secured_orders.yml)
 * grants `managers` every order and `sales` only shipped ones while employed;
 * any other group gets nothing (research/cube/access-control.md, "Observed
 * locally"). Asked through wechart's API, as the app asks it.
 */
const QUERY = { measures: ['secured_orders.count'], dimensions: ['secured_orders.status'] };

/** The API's answer to the query, asked again while Cube says "Continue wait". */
async function answerTo(
  page: Page,
): Promise<{ status: number; rows: unknown[]; error: unknown; source: unknown }> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const response = await page.request.post('/api/load', { data: { query: QUERY } });
    const body = (await response.json()) as { data?: unknown[]; error?: unknown; source?: unknown };
    if (body.error === 'Continue wait') continue;
    return {
      status: response.status(),
      rows: body.data ?? [],
      error: body.error,
      source: body.source,
    };
  }
  throw new Error('Cube kept answering "Continue wait"');
}

test.describe('as a member of managers', () => {
  test.use({ role: 'manager' });

  test('the secured view answers every status', async ({ page }) => {
    await page.goto('/explore');
    const { status, rows } = await answerTo(page);
    expect(status).toBe(200);
    expect(rows.length).toBeGreaterThan(1);
  });
});

test.describe('as writer, in none of its groups', () => {
  test.use({ role: 'writer' });

  // Cube's default deny reads as a hidden member, not as an empty answer
  // (research/cube/access-control.md, "Observed locally"): Cube's refusal, not
  // wechart's, and no rows (T322's review).
  test('the secured view is refused by Cube’s policies, with no rows', async ({ page }) => {
    await page.goto('/explore');
    const answer = await answerTo(page);
    expect(answer.rows).toEqual([]);
    expect(answer.source).toBe('cube');
    expect(String(answer.error)).toContain('hidden member');
  });
});
