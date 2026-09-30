import type { Page } from '@playwright/test';

import { expect, test } from './fixtures';
import { changeShared } from './shared-change';

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
/**
 * The dashboard the users' queries are for (T340, AC-268): every query names
 * the item it serves. It shows a chart on the secured view, in their folder.
 */
const ids = { board: '', chart: '' };

test.describe.configure({ mode: 'serial' });

test.describe('the groups granted a folder (T436)', () => {
  test.use({ role: 'super' });

  test('grants managers and sales-rw a folder of their own, with a dashboard on the secured view', async ({
    page,
  }) => {
    const request = page.request;
    const made = async (data: Record<string, unknown>) => {
      const answer = await request.post('/api/documents', { data });
      expect(answer.status(), await answer.text()).toBe(201);
      return ((await answer.json()) as { id: string }).id;
    };
    granted = await made({ kind: 'folder', title: `Cube groups ${RUN}`, folderId: 'root' });
    const set = await request.put(`/api/folders/${granted}/access`, {
      data: { readOnly: ['managers', 'sales-rw'], readWrite: null },
    });
    expect(set.status(), await set.text()).toBe(200);
    ids.chart = await made({ kind: 'chart', title: `Secured ${RUN}`, folderId: granted });
    ids.board = await made({ kind: 'dashboard', title: `Secured ${RUN}`, folderId: granted });
    // Given their content as a shared one's is given: by approving a copy (T502).
    await changeShared(request, 'chart', ids.chart, (body) => ({
      ...body,
      chart: {
        source: { cube: 'secured_orders' },
        wells: {
          measures: ['secured_orders.count'],
          dimensions: ['secured_orders.status'],
          timeDimensions: [],
        },
      },
    }));
    await changeShared(request, 'dashboard', ids.board, (body) => ({
      ...body,
      pages: [
        { id: 'p1', title: 'Page 1', items: [{ id: 't1', kind: 'chart', chartId: ids.chart }] },
      ],
    }));
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
    const response = await page.request.post('/api/load', {
      data: { query: QUERY, for: { kind: 'dashboard', id: ids.board } },
    });
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
    if (ids.board !== '') await page.request.delete(`/api/documents/dashboard/${ids.board}`);
    if (ids.chart !== '') await page.request.delete(`/api/documents/chart/${ids.chart}`);
    if (granted !== '') await page.request.delete(`/api/documents/folder/${granted}`);
  });
});
