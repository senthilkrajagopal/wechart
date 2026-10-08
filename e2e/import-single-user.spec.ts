import { expect, test, type APIRequestContext } from '@playwright/test';

import { IN_MY_WORKSPACE } from './workspace';

/**
 * AC-356's sign-in-off clause (T508; R44, AC-254): with security off, an
 * import lands in the single user's workspace as new drafts with the target
 * they chose. Nothing saved is replaced, renamed or removed, and nothing in a
 * shared folder changes. A draft reaches its folder by a proposal its own
 * author approves.
 *
 * The phase-1 configuration: `playwright.config.ts`, sign-in off. The file
 * is exported from a dashboard of the user's own in My workspace (a table of
 * orders by status, its own chart), and imported to `Import target <run>`.
 * That folder already holds a dashboard, which must stay as it was.
 */
const RUN = Math.random().toString(36).slice(2, 8);
const TARGET = `Import target ${RUN}`;
const TITLE = `Imported ${RUN}`;
const KEPT = `Kept ${RUN}`;
const made = { target: '', kept: '', source: '', sourceChart: '', drafts: [] as string[] };

async function created(request: APIRequestContext, data: Record<string, unknown>) {
  const answer = await request.post('/api/documents', { data });
  expect(answer.status(), await answer.text()).toBe(201);
  return ((await answer.json()) as { id: string }).id;
}

interface Listed {
  kind: string;
  id: string;
  title: string;
  version?: number;
  targetFolderId?: string | null;
}
const contentsOf = async (request: APIRequestContext, folderId: string) =>
  (await (await request.get(`/api/folders/${folderId}/contents`)).json()) as Listed[];
const shapeOf = (items: Listed[]) =>
  items
    .map(({ kind, id, title, version }) => ({ kind, id, title, version }))
    .sort((a, b) => a.id.localeCompare(b.id));

test.describe.configure({ mode: 'serial' });

test.describe('an import with sign-in off (T508, AC-356, AC-254)', () => {
  test.afterAll(async ({ request }) => {
    const target = made.target === '' ? [] : await contentsOf(request, made.target);
    for (const item of target)
      if (item.kind === 'dashboard' || item.kind === 'chart')
        await request.delete(`/api/documents/${item.kind}/${item.id}`);
    for (const id of made.drafts) {
      await request.delete(`/api/documents/dashboard/${id}`);
      await request.delete(`/api/documents/chart/${id}`);
    }
    if (made.source !== '') await request.delete(`/api/documents/dashboard/${made.source}`);
    if (made.target !== '') await request.delete(`/api/documents/folder/${made.target}`);
  });

  test('lands the file in My workspace as new drafts, changing nothing saved, and the draft lands by a self-approved proposal', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const { request } = page;
    // Nothing asks for a sign-in or refuses a permission (AC-254).
    const refused: string[] = [];
    page.on('response', (response) => {
      if (response.status() === 401 || response.status() === 403)
        refused.push(`${String(response.status())} ${response.url()}`);
    });

    made.target = await created(request, { kind: 'folder', title: TARGET, folderId: 'root' });
    made.kept = await created(request, { kind: 'dashboard', title: KEPT, folderId: made.target });
    // The dashboard to export, the user's own in My workspace, with its own chart.
    made.source = await created(request, { kind: 'dashboard', title: TITLE, ...IN_MY_WORKSPACE });
    made.sourceChart = await created(request, {
      kind: 'chart',
      title: `Orders by status ${RUN}`,
      ...IN_MY_WORKSPACE,
    });
    const chart = await request.put(`/api/documents/chart/${made.sourceChart}`, {
      data: {
        version: 1,
        body: {
          schemaVersion: 1,
          title: `Orders by status ${RUN}`,
          owner: 'admin',
          ...IN_MY_WORKSPACE,
          localToDashboardId: made.source,
          chart: {
            source: { cube: 'orders' },
            wells: {
              measures: ['orders.count'],
              dimensions: ['orders.status'],
              timeDimensions: [],
            },
            chartType: 'table',
          },
        },
      },
    });
    expect(chart.status(), await chart.text()).toBe(200);
    const board = await request.put(`/api/documents/dashboard/${made.source}`, {
      data: {
        version: 1,
        body: {
          schemaVersion: 1,
          title: TITLE,
          ...IN_MY_WORKSPACE,
          owner: 'admin',
          pages: [
            {
              id: 'only',
              title: 'Only',
              items: [{ id: 'tile', kind: 'chart', w: 6, h: 40, chartId: made.sourceChart }],
            },
          ],
        },
      },
    });
    expect(board.status(), await board.text()).toBe(200);
    const exported = await request.post(`/api/export/dashboards/${made.source}`, {
      data: { libraryCharts: [], models: [], dataSources: [] },
    });
    expect(exported.status(), await exported.text()).toBe(200);
    const file = await exported.text();

    const targetBefore = shapeOf(await contentsOf(request, made.target));
    const mineBefore = (await contentsOf(request, 'mine')).map((item) => item.id);
    const sourceBefore = (await (
      await request.get(`/api/documents/dashboard/${made.source}`)
    ).json()) as { version: number };

    // Imported from My workspace's New, to the target.
    await page.goto('/explore?folder=mine');
    await page.getByRole('button', { name: 'New', exact: true }).click();
    await page.getByRole('menuitem', { name: /Import a dashboard…/ }).click();
    const pane = page.getByRole('dialog', { name: 'Import a dashboard' });
    await pane.locator('input[type="file"]').setInputFiles({
      name: `import-${RUN}.json`,
      mimeType: 'application/json',
      buffer: Buffer.from(file),
    });
    await expect(pane.getByText('Read · every part is one this wechart has')).toBeVisible();
    await pane.getByRole('button', { name: /Next: Target/ }).click();
    await pane.getByRole('treeitem', { name: TARGET }).click();
    await expect(pane).toContainText(
      `Everything in the file lands in My workspace as new drafts with this target. Nothing in ${TARGET} changes until you propose a draft and the proposal is approved. You may approve your own.`,
    );
    await pane.getByRole('button', { name: /Next: Review/ }).click();
    await pane.getByRole('button', { name: 'Import to My workspace' }).click();
    await expect(pane).toHaveCount(0);
    const toast = page.getByRole('status').filter({ hasText: 'Imported to My workspace' });
    await expect(toast).toContainText(
      `Imported to My workspace as new drafts: 1 dashboard and 1 chart. Nothing in ${TARGET} changed.`,
    );

    // New drafts in the single user's workspace, going to the target.
    const landed = (await contentsOf(request, 'mine')).filter(
      (item) => !mineBefore.includes(item.id),
    );
    made.drafts.push(...landed.map((item) => item.id));
    expect(landed.map((item) => [item.kind, item.title, item.targetFolderId])).toEqual([
      ['dashboard', TITLE, made.target],
    ]);
    // Nothing saved replaced, renamed or removed: the target, and the dashboard exported.
    expect(shapeOf(await contentsOf(request, made.target))).toEqual(targetBefore);
    expect(
      (
        (await (await request.get(`/api/documents/dashboard/${made.source}`)).json()) as {
          version: number;
        }
      ).version,
    ).toBe(sourceBefore.version);

    // Proposed to the target, and approved by its own author.
    await toast.getByRole('button', { name: `Propose to ${TARGET}…` }).click();
    const propose = page.getByRole('dialog', { name: `Propose to ${TARGET}` });
    await propose.getByLabel('What changed').fill(`Imported (${RUN}).`);
    await propose.getByRole('button', { name: 'Propose', exact: true }).click();
    await expect(propose).toHaveCount(0);
    await page
      .getByRole('banner')
      .getByRole('link', { name: /^Reviews, \d+ waiting$/ })
      .click();
    const row = page
      .getByRole('table', { name: 'To review' })
      .getByRole('row')
      .filter({ hasText: TITLE });
    await row.getByRole('button', { name: TITLE }).click();
    await page
      .getByRole('region', { name: TITLE })
      .getByRole('link', { name: 'Open review' })
      .click();
    const inspector = page.getByRole('complementary', { name: 'About this proposal' });
    await inspector.getByRole('button', { name: 'Approve my own proposal' }).click();
    await page
      .getByRole('dialog', { name: `Publish to ${TARGET}?` })
      .getByRole('button', { name: 'Approve and publish' })
      .click();
    await expect(page.getByTestId('review-said')).toContainText('Approved.', { timeout: 90_000 });

    // Landed in the target beside what it held, which is as it was.
    const after = await contentsOf(request, made.target);
    expect(
      after
        .filter((item) => item.kind === 'dashboard')
        .map((item) => item.title)
        .sort(),
    ).toEqual([KEPT, TITLE].sort());
    expect(shapeOf(after.filter((item) => item.id === made.kept))).toEqual(targetBefore);
    expect(refused).toEqual([]);
  });
});
