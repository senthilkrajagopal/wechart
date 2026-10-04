import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CalcRequestRow } from '../reviews/calcRequests';
import { openRequest, RequestPane, requestHref } from './RequestPane';

/**
 * T384 / AC-051: WHEN a read-write member of that folder opens a calculation
 * request, THE SYSTEM SHALL open the target cube's model in the model editor,
 * in their workspace, with the request visible beside it.
 * Fails when: the editor opens without the request, or on a different cube
 * than the request names.
 *
 * Opening one copies the model defining its cube into the member's workspace
 * (or opens their copy already there), since models change only through My
 * workspace and a proposal (T451), and takes the request up, so its approval
 * resolves it (T385). The editor opens on that file, the one model of that
 * cube (T448), with the request beside it.
 */
const REQUEST: CalcRequestRow = {
  id: 'r1',
  chart: { id: 'c1', title: 'Margins by month' },
  cube: 'fsales__orders',
  folderId: 'sales',
  folderPath: ['Sales'],
  modelPath: 'cubes/orders.yml',
  fields: {
    measures: ['fsales__orders.total_amount'],
    dimensions: [],
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
const NOW = new Date(2026, 9, 2, 12, 0);

afterEach(() => {
  vi.unstubAllGlobals();
});

const json = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

describe('opening a calculation request (T384, AC-051)', () => {
  /** The take-up answers the file defining the cube now: moved since it was asked, here. */
  const TAKEN = { folderId: 'sales', modelPath: 'models/orders.yml', cube: 'fsales__orders' };

  it('takes it up, copies the file that defines its cube now into the workspace, and opens the copy with the request', async () => {
    const asked: [string, RequestInit | undefined][] = [];
    const fetchImpl = vi.fn((url: string, init?: RequestInit) => {
      asked.push([url, init]);
      return url === '/api/workspace/copies'
        ? json(201, {
            kind: 'model',
            created: true,
            folderId: 'ws-project',
            path: 'models/orders.yml',
          })
        : json(200, TAKEN);
    }) as unknown as typeof fetch;

    const opened = await openRequest(REQUEST, fetchImpl, 'Europe/London');

    expect(asked.map(([url, init]) => [url, init?.method])).toEqual([
      ['/api/calc-requests/r1/take', 'POST'],
      ['/api/workspace/copies', 'POST'],
    ]);
    expect(JSON.parse(String(asked[1]![1]?.body))).toEqual({
      kind: 'model',
      folderId: 'sales',
      path: 'models/orders.yml',
      timeZone: 'Europe/London',
    });
    expect(opened).toEqual({
      href: '/explore/folders/ws-project/models/models%2Forders.yml?request=r1',
    });
  });

  it('copies nothing when it can’t be taken up, and says why', async () => {
    const fetchImpl = vi.fn(() =>
      json(409, { error: 'It is resolved already.' }),
    ) as unknown as typeof fetch;

    expect(await openRequest(REQUEST, fetchImpl, 'UTC')).toEqual({
      error: 'It is resolved already.',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('says why when the model can’t be copied', async () => {
    const fetchImpl = vi.fn((url: string) =>
      url === '/api/workspace/copies'
        ? json(409, { error: 'It can’t be previewed in your workspace with what is there.' })
        : json(200, TAKEN),
    ) as unknown as typeof fetch;

    expect(await openRequest(REQUEST, fetchImpl, 'UTC')).toEqual({
      error: 'It can’t be previewed in your workspace with what is there.',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('says so when wechart can’t be reached, rather than failing', async () => {
    const fetchImpl = vi.fn(() =>
      Promise.reject(new TypeError('Failed to fetch')),
    ) as unknown as typeof fetch;

    expect(await openRequest(REQUEST, fetchImpl, 'UTC')).toEqual({
      error: 'It couldn’t be opened: Failed to fetch.',
    });
  });

  it('names the file and the request in the address', () => {
    expect(requestHref('ws-project', 'cubes/orders.yml', 'r1')).toBe(
      '/explore/folders/ws-project/models/cubes%2Forders.yml?request=r1',
    );
  });
});

describe('the request beside the model editor (T384, AC-051)', () => {
  const shown = (requests: readonly CalcRequestRow[]) => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        url === '/api/calc-requests' ? json(200, { requests }) : json(404, {}),
      ),
    );
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <RequestPane requestId="r1" now={NOW} />
      </QueryClientProvider>,
    );
  };

  it('shows what was asked, on which cube, by whom, and the fields in use', async () => {
    shown([REQUEST]);
    const pane = await screen.findByRole('complementary', { name: 'Calculation request' });

    expect((await within(pane).findByTestId('pane-request-description')).textContent).toBe(
      'Margin per order: amount less cost.',
    );
    expect(within(pane).getByTestId('pane-request-cube').textContent).toBe(
      'On orders, asked by Manager',
    );
    expect(within(pane).getByTestId('pane-request-fields').textContent).toBe(
      'Metrics: orders.total_amount · Time: orders.ordered_at',
    );
    expect(within(pane).getByRole('link', { name: 'Margins by month' }).getAttribute('href')).toBe(
      '/explore/charts/c1',
    );
  });

  it('says what to do while it is open', async () => {
    shown([REQUEST]);
    expect((await screen.findByTestId('pane-request-next')).textContent).toBe(
      'Add the measure to this model, then propose it: approving the proposal resolves the request.',
    );
    expect(screen.queryByTestId('pane-request-resolution')).toBeNull();
  });

  /** T385 / AC-052 (amended 2026-10-04, R63): resolved, it names the members that resolve it. */
  it('says what resolved it, in place of what to do, once resolved', async () => {
    shown([
      {
        ...REQUEST,
        status: 'resolved',
        resolution: {
          members: ['fsales__orders.margin'],
          by: 'Writer',
          approvedBy: 'Super',
          at: new Date(2026, 9, 2, 11, 0).toISOString(),
        },
      },
    ]);
    expect((await screen.findByTestId('pane-request-resolution')).textContent).toBe(
      'Resolved by orders.margin · added by Writer, approved by Super · Today 11:00',
    );
    expect(screen.queryByTestId('pane-request-next')).toBeNull();
  });

  it('says so when the request isn’t one the user may see', async () => {
    shown([]);
    expect((await screen.findByTestId('pane-request-missing')).textContent).toBe(
      'This request isn’t one of those asked of the folders you may change.',
    );
  });
});
