import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CalcRequestRow } from './calcRequests';
import { CalcRequestSummary, CalcRequestsPanel } from './CalcRequestsPanel';

/**
 * T383 / AC-050: a calculation request is shown to the read-write members of
 * the folder whose model defines the chart's cube: on the Reviews page, under
 * "Calculation requests", as `GET /api/calc-requests` lists those asked of
 * the folders the user writes. A row opens it beside the list: the chart it
 * came from, the fields in use and the description.
 */
const NOW = new Date(2026, 9, 2, 12, 0);

const REQUEST: CalcRequestRow = {
  id: 'r1',
  chart: { id: 'c1', title: 'Margins by month' },
  cube: 'fsales__orders',
  folderId: 'sales',
  folderPath: ['Sales'],
  modelPath: 'cubes/orders.yml',
  fields: {
    measures: ['fsales__orders.total_amount'],
    dimensions: ['fsales__orders.status'],
    timeDimensions: ['fsales__orders.ordered_at'],
    filters: [],
  },
  unseenFields: 0,
  description: 'Margin per order: amount less cost.',
  requestedBy: 'Manager',
  requestedAt: new Date(2026, 9, 2, 9, 30).toISOString(),
  status: 'open',
  resolution: null,
};

/** What resolved it (T385): two measures on its cube, from writer's proposal, approved by super. */
const RESOLUTION: CalcRequestRow['resolution'] = {
  members: ['fsales__orders.margin', 'fsales__orders.margin_share'],
  by: 'Writer',
  approvedBy: 'Super',
  at: new Date(2026, 9, 2, 11, 0).toISOString(),
};

function serve(requests: readonly CalcRequestRow[]) {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) =>
      Promise.resolve(
        url === '/api/calc-requests'
          ? new Response(JSON.stringify({ requests }), { status: 200 })
          : new Response('{}', { status: 404 }),
      ),
    ),
  );
}

/** The list and, as the Reviews page places it, the summary beside it. */
function Panel() {
  const [selected, setSelected] = useState<string | undefined>(undefined);
  return (
    <>
      <CalcRequestsPanel selected={selected} onSelect={setSelected} summaryId="s" now={NOW} />
      <CalcRequestSummary
        id="s"
        selected={selected}
        now={NOW}
        onClose={() => {
          setSelected(undefined);
        }}
      />
    </>
  );
}

const shown = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <Panel />
    </QueryClientProvider>,
  );

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('calculation requests on the Reviews page (T383, AC-050)', () => {
  it('lists each request asked of the folders the user writes', async () => {
    serve([REQUEST]);
    shown();
    const table = await screen.findByRole('table', { name: 'Calculation requests' });

    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((cell) => cell.textContent),
    ).toEqual(['Cube', 'Folder', 'Asked by', 'Asked', 'Status']);
    expect(
      within(within(table).getAllByRole('row')[1]!)
        .getAllByRole('cell')
        .map((cell) => cell.textContent),
    ).toEqual(['orders', 'Sales', 'Manager', 'Today 09:30', 'Open']);
  });

  it('opens one beside the list: the description, the fields in use and the chart', async () => {
    serve([REQUEST]);
    shown();
    await userEvent.click(await screen.findByRole('button', { name: 'orders' }));
    const summary = screen.getByRole('region', { name: 'Calculation on orders' });

    expect(within(summary).getByTestId('request-description').textContent).toBe(
      'Margin per order: amount less cost.',
    );
    expect(within(summary).getByTestId('request-fields').textContent).toBe(
      'Metrics: orders.total_amount · Dimensions: orders.status · Time: orders.ordered_at',
    );
    expect(
      within(summary).getByRole('link', { name: 'Margins by month' }).getAttribute('href'),
    ).toBe('/explore/charts/c1');
    expect(within(summary).getByTestId('request-by').textContent).toBe(
      'Asked by Manager · Today 09:30 · model cubes/orders.yml',
    );
  });

  it('says so of a chart the user can’t open, and counts fields they can’t see', async () => {
    serve([{ ...REQUEST, chart: null, unseenFields: 2 }]);
    shown();
    await userEvent.click(await screen.findByRole('button', { name: 'orders' }));
    const summary = screen.getByRole('region', { name: 'Calculation on orders' });

    expect(within(summary).getByTestId('request-chart').textContent).toBe(
      'From a chart you can’t open.',
    );
    expect(within(summary).getByTestId('request-fields').textContent).toContain(
      ' · and 2 fields of cubes you can’t see',
    );
  });

  /**
   * T384 / AC-051: a read-write member opens it: its cube's model copied
   * into My workspace and taken up, then the model editor on the copy, the
   * request beside it (`RequestPane.tsx`).
   */
  it('opens an open request in My workspace, where its model is copied and it is taken up', async () => {
    const asked: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        asked.push(url);
        return Promise.resolve(
          url === '/api/calc-requests'
            ? new Response(JSON.stringify({ requests: [REQUEST] }), { status: 200 })
            : url === '/api/workspace/copies'
              ? new Response(JSON.stringify({ folderId: 'ws-p', path: 'cubes/orders.yml' }), {
                  status: 201,
                })
              : new Response(
                  JSON.stringify({
                    folderId: 'sales',
                    modelPath: 'cubes/orders.yml',
                    cube: 'fsales__orders',
                  }),
                  { status: 200 },
                ),
        );
      }),
    );
    const go = vi.fn();
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <CalcRequestSummary id="s" selected="r1" now={NOW} onClose={vi.fn()} go={go} />
      </QueryClientProvider>,
    );

    await userEvent.click(await screen.findByRole('button', { name: 'Open in My workspace' }));

    await vi.waitFor(() => {
      expect(go).toHaveBeenCalledWith('/explore/folders/ws-p/models/cubes%2Forders.yml?request=r1');
    });
    expect(asked).toContain('/api/calc-requests/r1/take');
  });

  it('says why it couldn’t be opened, and lets it be tried again', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        url === '/api/calc-requests'
          ? Promise.resolve(new Response(JSON.stringify({ requests: [REQUEST] }), { status: 200 }))
          : Promise.reject(new TypeError('Failed to fetch')),
      ),
    );
    const go = vi.fn();
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <CalcRequestSummary id="s" selected="r1" now={NOW} onClose={vi.fn()} go={go} />
      </QueryClientProvider>,
    );

    await userEvent.click(await screen.findByRole('button', { name: 'Open in My workspace' }));

    expect((await screen.findByRole('alert')).textContent).toBe(
      'It couldn’t be opened: Failed to fetch.',
    );
    expect(
      (screen.getByRole('button', { name: 'Open in My workspace' }) as HTMLButtonElement).disabled,
    ).toBe(false);
    expect(go).not.toHaveBeenCalled();
  });

  it('offers no opening of a resolved request', async () => {
    serve([{ ...REQUEST, status: 'resolved', resolution: RESOLUTION }]);
    shown();
    await userEvent.click(await screen.findByRole('button', { name: 'orders' }));

    expect(screen.queryByRole('button', { name: 'Open in My workspace' })).toBeNull();
  });

  /**
   * T385 / AC-052 (amended 2026-10-04, R63): resolved by the approval of a
   * proposal from a member who took it up, adding measures to its cube; the
   * request names those members.
   * Fails when: the request stays open after that approval, or names no member.
   */
  it('names the members that resolved it, whose proposal added them, and who approved it', async () => {
    serve([{ ...REQUEST, status: 'resolved', resolution: RESOLUTION }]);
    shown();
    const table = await screen.findByRole('table', { name: 'Calculation requests' });
    expect(within(table).getAllByRole('row')[1]!.lastElementChild?.textContent).toBe('Resolved');
    await userEvent.click(screen.getByRole('button', { name: 'orders' }));

    expect(
      within(screen.getByRole('region', { name: 'Calculation on orders' })).getByTestId(
        'request-resolution',
      ).textContent,
    ).toBe(
      'Resolved by orders.margin, orders.margin_share · added by Writer, approved by Super · Today 11:00',
    );
  });

  it('names nothing resolved while it is open', async () => {
    serve([REQUEST]);
    shown();
    await userEvent.click(await screen.findByRole('button', { name: 'orders' }));

    expect(screen.queryByTestId('request-resolution')).toBeNull();
  });

  it('says when there is nothing to do', async () => {
    serve([]);
    shown();
    expect((await screen.findByTestId('requests-none')).textContent).toBe(
      'No calculations have been asked of the folders you may change.',
    );
  });
});
