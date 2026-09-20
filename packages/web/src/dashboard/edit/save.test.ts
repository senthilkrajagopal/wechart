import { describe, expect, it, vi } from 'vitest';

import type { DashboardDocument } from '../model/document';
import { StaleSaveError, saveDashboard } from './save';

/**
 * T071 / AC-065: WHEN the user saves a dashboard, THE SYSTEM SHALL persist the
 * layout, tile settings, dashboard settings and marking definitions, and leave
 * edit mode.
 * `Fails when: any of those is missing after reopening the dashboard.`
 *
 * The four things are not four fields to enumerate. Marking definitions
 * arrive at F9, long after this — so a save that listed what it knew about
 * would drop them the day they were added, and the criterion would quietly
 * stop being true without any test noticing. It sends the document it has.
 */
const DOC = {
  schemaVersion: 1,
  title: 'Revenue',
  settings: { width: 'full' },
  pages: [
    {
      id: 'p1',
      title: 'Overview',
      items: [{ id: 't1', kind: 'chart', w: 6, h: 40, chartId: 'c1' }],
    },
  ],
} as DashboardDocument;

const ok = (version = 2) =>
  vi.fn(async () => new Response(JSON.stringify({ version }), { status: 200 }));

describe('what goes to the server', () => {
  it('sends the whole document, layout and settings together', async () => {
    const fetchImpl = ok();
    await saveDashboard({ dashboardId: 'd1', document: DOC, version: 1, fetchImpl });

    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({ body: DOC, version: 1 });
  });

  it('sends parts of the document it knows nothing about', async () => {
    // Markings are exactly this case. A save that enumerated fields would
    // drop them at F9 and nothing here would fail.
    const withMarkings = { ...DOC, markings: [{ id: 'm1', name: 'Selection' }] };
    const fetchImpl = ok();
    await saveDashboard({
      dashboardId: 'd1',
      document: withMarkings as DashboardDocument,
      version: 1,
      fetchImpl,
    });

    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body)).body).toHaveProperty('markings');
  });

  it('puts to the dashboard it was given, with the id escaped', async () => {
    const fetchImpl = ok();
    await saveDashboard({ dashboardId: 'a/b', document: DOC, version: 1, fetchImpl });

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/documents/dashboard/a%2Fb');
    expect(init.method).toBe('PUT');
  });
});

describe('when the save cannot go through', () => {
  it('says the dashboard moved on, rather than a status code', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 409 }));

    await expect(
      saveDashboard({ dashboardId: 'd1', document: DOC, version: 1, fetchImpl }),
    ).rejects.toBeInstanceOf(StaleSaveError);
  });

  it('refuses quietly for nothing else', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 500 }));

    await expect(
      saveDashboard({ dashboardId: 'd1', document: DOC, version: 1, fetchImpl }),
    ).rejects.toThrow(/500/);
  });
});

describe('the version', () => {
  it('comes back, so a second save is not stale against the first', async () => {
    const fetchImpl = ok(7);
    const result = await saveDashboard({
      dashboardId: 'd1',
      document: DOC,
      version: 6,
      fetchImpl,
    });

    expect(result.version).toBe(7);
  });

  it('moves on even when the server does not say so', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 }));
    const result = await saveDashboard({
      dashboardId: 'd1',
      document: DOC,
      version: 6,
      fetchImpl,
    });

    expect(result.version).toBe(7);
  });
});
