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
    // A real marking now that markings have a type (T090); this case is about
    // the save being field-agnostic, so what matters is that it travels.
    const withMarkings = {
      ...DOC,
      markings: [{ id: 'mk1', name: 'Selection', slot: 'mk1', isDefault: true }],
    };
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
    // The body the server really sends on a fault (AC-007): it says nothing,
    // so the status is what is shown.
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify({ error: 'Internal error' }), { status: 500 }),
    );

    await expect(
      saveDashboard({ dashboardId: 'd1', document: DOC, version: 1, fetchImpl }),
    ).rejects.toThrow(/500/);
  });

  it('says the server could not be reached, in words a user can act on', async () => {
    /**
     * Offline, or the connection dropped: the request itself fails, and each
     * browser words that differently ("Failed to fetch", "Load failed", …) —
     * none of which says what to do. The work is kept (AC-184); the reason
     * says how to get it saved.
     */
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });

    await expect(
      saveDashboard({ dashboardId: 'd1', document: DOC, version: 1, fetchImpl }),
    ).rejects.toThrow(
      'Could not save: the server could not be reached. Check the connection, then save again.',
    );
  });

  it('passes on the server’s reason for refusing, rather than only its status', async () => {
    /**
     * The server says why it refused a chart — a library chart, one belonging
     * to another dashboard, one deleted meanwhile — and "Could not save: 400"
     * told the user none of it (T192).
     */
    const refusing = (status: number, body: Record<string, string>) =>
      vi.fn(async () => new Response(JSON.stringify(body), { status }));

    await expect(
      saveDashboard({
        dashboardId: 'd1',
        document: DOC,
        version: 1,
        fetchImpl: refusing(400, {
          error: 'This chart belongs to another dashboard, and can only be saved with that one.',
        }),
      }),
    ).rejects.toThrow(
      'Could not save: This chart belongs to another dashboard, and can only be saved with that one.',
    );
    await expect(
      saveDashboard({
        dashboardId: 'd1',
        document: DOC,
        version: 1,
        fetchImpl: refusing(404, { message: 'No such chart: c1' }),
      }),
    ).rejects.toThrow('Could not save: No such chart: c1');
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

/**
 * T192 / AC-183: a chart edited from a tile is written only when the
 * dashboard is saved — and together with it. Two requests have no safe order:
 * charts first leaves them changed if the dashboard then fails, which is
 * AC-183's failing state; dashboard first loses the edit if a chart then
 * fails. So the dashboard and its edited charts go in one request, which the
 * server writes in one transaction.
 */
describe('saving with charts edited from tiles', () => {
  const edited = {
    schemaVersion: 1,
    title: 'Orders',
    localToDashboardId: 'd1',
    chart: {
      source: { cube: 'orders' },
      wells: { measures: ['orders.count'], dimensions: [], timeDimensions: [] },
    },
  };

  it('sends the dashboard and every edited chart in one request, each with its version', async () => {
    const fetchImpl = ok(3);

    await saveDashboard({
      dashboardId: 'd1',
      document: DOC,
      version: 2,
      charts: [{ id: 'c1', document: edited, version: 5 }],
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/dashboards/d1');
    expect(init.method).toBe('PUT');
    expect(JSON.parse(String(init.body))).toEqual({
      dashboard: { body: DOC, version: 2 },
      charts: [{ id: 'c1', body: edited, version: 5 }],
    });
  });

  it('saves exactly as before when no chart was edited', async () => {
    // The ordinary save is not routed through the new request.
    const fetchImpl = ok();

    await saveDashboard({
      dashboardId: 'd1',
      document: DOC,
      version: 1,
      charts: [],
      fetchImpl,
    });

    const [url] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/documents/dashboard/d1');
  });

  it('says it was a chart that changed elsewhere, when that is what the server refused', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ message: 'stale', document: { kind: 'chart', id: 'c1' } }), {
          status: 409,
        }),
    );

    await expect(
      saveDashboard({
        dashboardId: 'd1',
        document: DOC,
        version: 2,
        charts: [{ id: 'c1', document: edited, version: 5 }],
        fetchImpl,
      }),
    ).rejects.toThrow(
      'A chart on this dashboard changed somewhere else while you were editing it. To save the rest, undo back past your change to that chart — anything changed after it is undone too — and save again. Or reload: that shows their change and discards yours.',
    );
  });
});

describe('a conflict says what to do', () => {
  /**
   * Saving again cannot succeed — the version has moved on — and the work is
   * still on screen (AC-184). Decided with the user (2026-09-21): the message
   * says so plainly, rather than leave a Save that fails every time.
   */
  it('for the dashboard itself', () => {
    expect(new StaleSaveError('dashboard').message).toBe(
      'This dashboard changed somewhere else while you were editing it. Reloading shows that change and discards yours — copy anything you need first.',
    );
  });
});
