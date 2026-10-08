import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DASHBOARD_LIMIT, modelHref, previewHref, useDashboards } from './dashboardPreview';

/**
 * Preview as groups' links (T438, AC-166, AC-232), kept from phase 1's
 * context pane when it went (T698): what they asked and answered there,
 * asked of them here.
 */
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('previewHref', () => {
  it('opens the dashboard with the context in its address', () => {
    expect(previewHref('d 1', { groups: ['sales'] })).toBe(
      `/explore/dashboards/d%201?preview=${encodeURIComponent('{"groups":["sales"]}')}`,
    );
  });
});

describe('modelHref', () => {
  it('opens a model file in Model', () => {
    expect(modelHref('cubes/orders.yml')).toBe('/model/files/cubes%2Forders.yml');
  });
});

describe('useDashboards (AC-232)', () => {
  it('asks for dashboards alone, one more than are shown, and keeps only dashboards', async () => {
    const asked: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        asked.push(url);
        return Response.json([
          { kind: 'dashboard', id: 'd1', title: 'Sales review' },
          { kind: 'chart', id: 'c1', title: 'Sales by month' },
        ]);
      }),
    );
    const { result } = renderHook(() => useDashboards('Sales'));
    await waitFor(() => {
      expect(result.current.answered).toBe(true);
    });
    expect(result.current.items).toEqual([{ kind: 'dashboard', id: 'd1', title: 'Sales review' }]);
    expect(asked.at(-1)).toBe(
      `/api/search?q=Sales&kind=dashboard&limit=${String(DASHBOARD_LIMIT + 1)}`,
    );
    expect(DASHBOARD_LIMIT).toBe(8);
  });

  it('says a search that failed failed, rather than that nothing matched', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('down', { status: 500 })),
    );
    const { result } = renderHook(() => useDashboards('Sales'));
    await waitFor(() => {
      expect(result.current.failed).toBe('HTTP 500');
    });
    expect(result.current.items).toEqual([]);
  });

  it('asks nothing for nothing typed', () => {
    const fetched = vi.fn();
    vi.stubGlobal('fetch', fetched);
    const { result } = renderHook(() => useDashboards('  '));
    expect(result.current.answered).toBe(false);
    expect(fetched).not.toHaveBeenCalled();
  });
});
