import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FileList } from './FileList';

/**
 * T137 / AC-131: WHEN the user opens the Model workspace, THE SYSTEM SHALL
 * list the model files and show the cubes, views, measures, dimensions,
 * segments, hierarchies, joins and pre-aggregations each file defines.
 * Fails when: a file's object is missing from the listing.
 */
const FILES = [
  {
    path: 'cubes/orders.yml',
    content: `cubes:
  - name: orders
    joins:
      - name: customers
        relationship: many_to_one
        sql: '{CUBE}.customer_id = {customers}.id'
    dimensions:
      - name: status
        sql: status
        type: string
    measures:
      - name: count
        type: count
    segments:
      - name: shipped
        sql: "{CUBE}.status = 'shipped'"
    hierarchies:
      - name: by_status
        levels: [status]
    pre_aggregations:
      - name: by_day
`,
  },
  { path: 'views/summary.yml', content: 'views:\n  - name: summary\n' },
  { path: 'cubes/broken.yml', content: 'cubes:\n  - name: [unclosed\n' },
];

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) =>
      String(input) === '/api/model/files'
        ? new Response(JSON.stringify({ files: FILES }))
        : new Response('{}', { status: 404 }),
    ),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const list = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <FileList />
    </QueryClientProvider>,
  );

describe('the model files', () => {
  it('are each listed with everything they define', async () => {
    list();

    const orders = await screen.findByRole('region', { name: 'cubes/orders.yml' });
    const cube = within(orders).getByRole('group', { name: 'Cube orders' });
    for (const [group, name] of [
      ['Measures', 'count'],
      ['Dimensions', 'status'],
      ['Segments', 'shipped'],
      ['Hierarchies', 'by_status'],
      ['Joins', 'customers'],
      ['Pre-aggregations', 'by_day'],
    ] as const) {
      expect(within(within(cube).getByRole('list', { name: group })).getByText(name)).toBeTruthy();
    }

    const summary = screen.getByRole('region', { name: 'views/summary.yml' });
    expect(within(summary).getByRole('group', { name: 'View summary' })).toBeTruthy();
  });

  it('say which file could not be read, and where', async () => {
    list();

    const broken = await screen.findByRole('region', { name: 'cubes/broken.yml' });
    expect(within(broken).getByRole('alert').textContent).toMatch(/line \d+/);
  });
});
