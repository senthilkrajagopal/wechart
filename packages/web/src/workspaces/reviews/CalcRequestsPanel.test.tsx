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

  it('says when there is nothing to do', async () => {
    serve([]);
    shown();
    expect((await screen.findByTestId('requests-none')).textContent).toBe(
      'No calculations have been asked of the folders you may change.',
    );
  });
});
