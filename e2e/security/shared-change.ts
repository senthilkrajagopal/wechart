import { randomUUID } from 'node:crypto';

import type { APIRequestContext, APIResponse } from '@playwright/test';

import { expect } from './fixtures';

/**
 * T502 (AC-278): with sign-in on, a shared dashboard, chart or data source is
 * never changed in place, by anyone. A spec that needs one with other
 * content changes it as a user must: a copy in the signed-in user's
 * workspace, changed there, proposed and approved (the user may approve
 * their own, as a read-write member of its folder or a Super-Admin). An
 * approval publishes it, so its cubes are bound in its folder then (AC-272).
 * The copy, and the library charts' copies a dashboard's copy made, are then
 * removed from the workspace, so none is left in it.
 */
type Body = Record<string, unknown>;
export interface Landed {
  readonly kind: string;
  readonly id: string;
  readonly version: number;
}

/** A chart made on a dashboard's copy, by the change: its body, less its dashboard. */
export interface OwnChart {
  readonly body: Body;
}

/**
 * Proposes a change to a shared dashboard or chart, and asks for its
 * approval, giving the approval's answer. `change` gets the copy's body and,
 * for a dashboard, the ids given to `ownCharts`, made on its copy; it gives
 * the body to land.
 */
export async function proposeShared(
  request: APIRequestContext,
  kind: 'dashboard' | 'chart',
  id: string,
  change: (body: Body, ownChartIds: readonly string[]) => Body,
  { description = 'Changed for a test.', ownCharts = [] as readonly OwnChart[] } = {},
): Promise<{ approved: APIResponse; cleanUp: () => Promise<void> }> {
  const copied = await request.post('/api/workspace/copies', {
    data: { kind, id, timeZone: 'UTC' },
  });
  expect(copied.status(), await copied.text()).toBeLessThan(300);
  // In the project folder it made, where one was (T523).
  const { id: copyId, folderId: projectId } = (await copied.json()) as {
    id: string;
    folderId?: string;
  };
  const read = async () =>
    (await (await request.get(`/api/documents/${kind}/${copyId}`)).json()) as {
      body: Body;
      version: number;
    };
  const copy = await read();
  const ownIds = ownCharts.map(() => randomUUID());
  const next = change(copy.body, ownIds);
  const saved =
    ownCharts.length === 0
      ? await request.put(`/api/documents/${kind}/${copyId}`, {
          data: { body: next, version: copy.version },
        })
      : await request.put(`/api/dashboards/${copyId}`, {
          data: {
            dashboard: { body: next, version: copy.version },
            charts: ownCharts.map((chart, index) => ({
              id: ownIds[index],
              body: { ...chart.body, localToDashboardId: copyId },
              version: 0,
            })),
          },
        });
  expect(saved.status(), await saved.text()).toBe(200);

  const proposed = await request.post('/api/proposals', {
    data: { kind, id: copyId, description },
  });
  expect(proposed.status(), await proposed.text()).toBe(201);
  const proposalId = ((await proposed.json()) as { id: string }).id;
  const approved = await request.post(`/api/proposals/${proposalId}/approve`, { data: {} });

  const cleanUp = async () => {
    if (!approved.ok()) await request.post(`/api/proposals/${proposalId}/reject`, { data: {} });
    // Out of the workspace again: a dashboard's copy with the copies of the
    // library charts it shows (its own charts go with it).
    const left = await read();
    const chartIds = new Set<string>();
    const collect = (value: unknown): void => {
      if (Array.isArray(value)) value.forEach(collect);
      else if (value !== null && typeof value === 'object')
        for (const [key, each] of Object.entries(value))
          if (key === 'chartId' && typeof each === 'string') chartIds.add(each);
          else collect(each);
    };
    if (kind === 'dashboard') collect(left.body['pages']);
    expect((await request.delete(`/api/documents/${kind}/${copyId}`)).status()).toBe(204);
    for (const chartId of chartIds) {
      const chart = await request.get(`/api/documents/chart/${chartId}`);
      if (!chart.ok()) continue;
      const { body } = (await chart.json()) as { body: { folderId?: string } };
      if (body.folderId === 'mine' || (projectId !== undefined && body.folderId === projectId))
        await request.delete(`/api/documents/chart/${chartId}`);
    }
    if (projectId !== undefined) await request.delete(`/api/documents/folder/${projectId}`);
  };
  return { approved, cleanUp };
}

/** A shared dashboard or chart changed, approved and landed: what landed, charts first. */
export async function changeShared(
  request: APIRequestContext,
  kind: 'dashboard' | 'chart',
  id: string,
  change: (body: Body, ownChartIds: readonly string[]) => Body,
  options: { description?: string; ownCharts?: readonly OwnChart[] } = {},
): Promise<readonly Landed[]> {
  const { approved, cleanUp } = await proposeShared(request, kind, id, change, options);
  expect(approved.status(), await approved.text()).toBe(200);
  const { landed } = (await approved.json()) as { landed: Landed[] };
  await cleanUp();
  return landed;
}

/**
 * A shared data source changed as a user changes one: its copy, changed
 * there (a change to where or how it connects needs a passing test of it,
 * which `change` gives as `testId`), proposed and approved, which lands it in
 * its folder. The copy is then discarded.
 */
export async function changeSharedSource(
  request: APIRequestContext,
  id: string,
  change: (copyId: string) => Promise<Body>,
  description = 'Changed for a test.',
): Promise<void> {
  const copied = await request.post(`/api/data-sources/${id}/copy`, {
    data: { timeZone: 'UTC' },
  });
  expect(copied.status(), await copied.text()).toBeLessThan(300);
  // In the project folder it made, where one was (T523).
  const { id: copyId, folderId } = (await copied.json()) as { id: string; folderId: string };
  const saved = await request.put(`/api/data-sources/${copyId}`, { data: await change(copyId) });
  expect(saved.status(), await saved.text()).toBe(200);
  const proposed = await request.post('/api/proposals', {
    data: { kind: 'data-source', id: copyId, description },
  });
  expect(proposed.status(), await proposed.text()).toBe(201);
  const approved = await request.post(
    `/api/proposals/${((await proposed.json()) as { id: string }).id}/approve`,
    { data: {}, timeout: 90_000 },
  );
  expect(approved.status(), await approved.text()).toBe(200);
  expect((await request.delete(`/api/data-sources/${copyId}`)).status()).toBe(204);
  if (folderId !== 'mine') await request.delete(`/api/documents/folder/${folderId}`);
}
