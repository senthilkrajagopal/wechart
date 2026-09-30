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

/**
 * With xcube's folder gate on (T436, AC-320), the root admits a group only
 * while some folder grants it: every group granted anywhere reaches up to the
 * root. So a folder of this spec's own grants both users' groups, read-only,
 * for its run, and the view's own policies decide within.
 */
const RUN = Math.random().toString(36).slice(2, 8);
let granted = '';

test.describe.configure({ mode: 'serial' });

test.describe('the groups granted a folder (T436)', () => {
  test.use({ role: 'super' });

  test('grants managers and sales-rw a folder of their own', async ({ page }) => {
    const made = await page.request.post('/api/documents', {
      data: { kind: 'folder', title: `Cube groups ${RUN}`, folderId: 'root' },
    });
    expect(made.status(), await made.text()).toBe(201);
    granted = ((await made.json()) as { id: string }).id;
    const set = await page.request.put(`/api/folders/${granted}/access`, {
      data: { readOnly: ['managers', 'sales-rw'], readWrite: null },
    });
    expect(set.status(), await set.text()).toBe(200);
  });
});

/**
 * The API's answer to the query, asked again while Cube says "Continue
 * wait", and while xcube's folder gate still refuses the root: the grant
 * reaches every Cube instance within 60 seconds (AC-320).
 */
async function answerTo(
  page: Page,
): Promise<{ status: number; rows: unknown[]; error: unknown; source: unknown }> {
  const until = Date.now() + 60_000;
  for (let attempt = 0; attempt < 90; attempt += 1) {
    const response = await page.request.post('/api/load', { data: { query: QUERY } });
    const body = (await response.json()) as { data?: unknown[]; error?: unknown; source?: unknown };
    if (body.error === 'Continue wait') continue;
    if (/None of these groups reaches folder/.test(String(body.error)) && Date.now() < until) {
      await new Promise((resolve) => setTimeout(resolve, 1_000));
      continue;
    }
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

test.describe('cleaning up', () => {
  test.use({ role: 'super' });

  test('removes the folder', async ({ page }) => {
    if (granted !== '') await page.request.delete(`/api/documents/folder/${granted}`);
  });
});
