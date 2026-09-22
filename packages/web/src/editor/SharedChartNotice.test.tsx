import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SharedChartNotice } from './SharedChartNotice';

/**
 * T134 / AC-128: WHEN a library chart is opened for editing from a dashboard,
 * THE SYSTEM SHALL state that it is shared and on how many dashboards, and
 * offer to make a local copy before changes spread (direction.md rule 41).
 * Fails when: the editor gives no shared indication for a library chart used
 * by more than one dashboard.
 *
 * The prototype's editor note (`prototype/dashboard.js`): "Shared chart · on
 * N dashboards · edits change all of them", a warning; one no other dashboard
 * uses yet, named by its folder.
 */
function answering(using: { id: string; title: string }[] | 'fail') {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === '/api/folders')
        return new Response(JSON.stringify([{ id: 'sales', title: 'Sales', parentId: 'root' }]));
      if (using === 'fail') return new Response('{}', { status: 503 });
      return new Response(JSON.stringify(using));
    }),
  );
}

const notice = (folderId = 'sales') =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <SharedChartNotice chartId="c1" folderId={folderId} />
    </QueryClientProvider>,
  );

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('a shared chart, opened for editing', () => {
  it('says it is shared, on how many dashboards, and that edits change all of them', async () => {
    answering([
      { id: 'd1', title: 'Sales' },
      { id: 'd2', title: 'Board' },
      { id: 'd3', title: 'Ops' },
    ]);
    notice();
    const said = await screen.findByText(/on 3 dashboards/);
    expect(said.closest('[role="status"]')?.textContent).toMatch(
      /Shared chart · on 3 dashboards · edits change all of them/,
    );
    expect(said.closest('[role="status"]')?.querySelector('[data-icon="warn"]')).not.toBeNull();
  });

  it('names its folder when no other dashboard uses it yet', async () => {
    answering([{ id: 'd1', title: 'Sales' }]);
    notice();
    expect(
      (await screen.findByText(/no other dashboard uses it yet/)).closest('[role="status"]')
        ?.textContent,
    ).toMatch(/Shared chart from Sales · no other dashboard uses it yet/);
  });

  it('still says it is shared when who uses it cannot be read', async () => {
    answering('fail');
    notice();
    expect((await screen.findByText(/could not be read/)).textContent).toMatch(
      /Shared chart.*every dashboard that uses it/,
    );
  });
});
