import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DashboardView } from '../dashboard/DashboardView';
import type { DashboardDocument } from '../dashboard/model/document';
import { TileLoadError } from '../query/loadTile';

/**
 * T173 / AC-167 on the dashboard (from T173's review): a tile whose query
 * Cube refuses as a hidden member reads as unavailable to a previewed
 * security context — and, outside a preview, as the failure it is, with
 * Cube's message.
 */
const DOC: DashboardDocument = {
  schemaVersion: 1,
  title: 'Secured',
  settings: { width: 'full' },
  pages: [
    {
      id: 'p1',
      title: 'Only',
      items: [{ id: 't-secured', kind: 'chart', chartId: 'c-secured', w: 6 }],
    },
  ],
};

const HIDDEN = new TileLoadError(
  "Error: You requested hidden member: 'secured_orders.count'. Please make it visible using `public: true`.",
  { measures: ['secured_orders.count'] },
  500,
);

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ cubes: [] }))),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function dashboard(preview?: Record<string, unknown>) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <DashboardView
        dashboardId="d1"
        document={DOC}
        specs={{}}
        errors={{ 'c-secured': HIDDEN }}
        onSave={vi.fn()}
        {...(preview === undefined ? {} : { preview })}
      />
    </QueryClientProvider>,
  );
  return document.querySelector('[data-tile="t-secured"]') as HTMLElement;
}

describe('a tile Cube refuses a member', () => {
  it('reads as unavailable to a previewed context, not as an error', () => {
    const tile = dashboard({ groups: ['sales'] });

    expect(within(tile).getByTestId('tile-unavailable').textContent).toContain(
      'Not available to this security context',
    );
    expect(within(tile).queryByRole('alert')).toBeNull();
    expect(tile.textContent).not.toContain('Please make it visible');
  });

  it('reads as the failure it is outside a preview, in Cube’s words', () => {
    const tile = dashboard();

    expect(within(tile).getByRole('alert').textContent).toContain(
      "You requested hidden member: 'secured_orders.count'",
    );
    expect(screen.queryByTestId('tile-unavailable')).toBeNull();
  });
});
