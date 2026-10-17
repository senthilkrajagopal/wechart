import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AccelerationPanel } from './AccelerationPanel';

/**
 * T150 / AC-144: WHEN the user opens a chart's acceleration panel, THE SYSTEM
 * SHALL say whether the chart's query matches a pre-aggregation, and when it
 * does not, name the member that prevents the match.
 * Fails when: the panel reports a match that Cube does not use, or names no
 * reason for a miss.
 *
 * The panel says what the API answers: Cube's own match, or the member that
 * stops the nearest rollup (`/api/acceleration`).
 */
const query = { measures: ['monthly_orders.count'], dimensions: ['monthly_orders.id'] };

function answering(body: unknown) {
  const sent: unknown[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('/api/acceleration');
      expect(init?.method).toBe('POST');
      sent.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify(body), {
        headers: { 'content-type': 'application/json' },
      });
    }),
  );
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <AccelerationPanel query={query} />
    </QueryClientProvider>,
  );
  return sent;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('a chart’s acceleration panel', () => {
  it('says which rollup Cube serves the query from', async () => {
    const sent = answering({ matched: 'monthly_orders.by_status_month' });

    const status = await screen.findByTestId('acceleration-matched');
    // "by", as the badge's words have it (chart-editor-Q5; T690, EDI-22).
    expect(status.textContent).toBe(
      'Served by the pre-aggregation monthly_orders.by_status_month.',
    );
    expect(status.querySelector('svg')?.getAttribute('data-icon')).toBe('ok');
    expect(sent).toEqual([{ query }]);
  });

  it('on a miss, names the member that stops the nearest rollup, and the rollup', async () => {
    answering({
      matched: null,
      miss: {
        rollup: 'monthly_orders.by_status_month',
        member: 'monthly_orders.id',
        title: 'Monthly Orders ID',
        reason: 'Monthly Orders ID is not one of the rollup’s dimensions.',
      },
    });

    // T403, AC-220: the member by its title, never its internal name.
    const miss = await screen.findByTestId('acceleration-miss');
    expect(miss.querySelector('[data-testid="acceleration-member"]')?.textContent).toBe(
      'Monthly Orders ID',
    );
    expect(miss.textContent).toBe(
      'Not served by a pre-aggregation; the nearest is monthly_orders.by_status_month. ' +
        'Stopped by Monthly Orders ID: Monthly Orders ID is not one of the rollup’s dimensions.',
    );
    expect(miss.textContent).not.toContain('monthly_orders.id');
  });

  /**
   * T153 / AC-147 as amended by R76 (chart-editor-Q4; T690, EDI-02, EDI-22):
   * … SHALL say in the chart editor's Acceleration tab that Cube would refuse
   * the chart in rollup-only mode. `Fails when: … its Acceleration tab has no
   * rollup-only note …`
   *
   * Under rollup-only mode Cube refuses a query no pre-aggregation serves,
   * rather than falling back to the database (research/cube/
   * pre-aggregations.md §2, "No match") — so a miss is exactly such a chart.
   * Design 02 state D's `.info` note: information, not a warning, with its
   * icon; a warning only where wechart knows the mode is on (the chart's banner).
   */
  const NOTE = 'If Cube runs in rollup-only mode (CUBEJS_ROLLUP_ONLY), it would refuse this chart.';

  it('notes that a chart no rollup serves would be refused in rollup-only mode', async () => {
    answering({
      matched: null,
      miss: { rollup: null, member: 'orders.count', reason: 'orders has no pre-aggregations.' },
    });

    const note = await screen.findByTestId('rollup-only-note');
    expect(note.className).toBe('acceleration-panel__info');
    expect(note.querySelector('svg')?.getAttribute('data-icon')).toBe('info');
    expect(note.textContent).toBe(NOTE);
    // A note here, not the warning the chart carries where the mode is known on.
    expect(screen.queryByTestId('rollup-only-warning')).toBeNull();
  });

  it('notes it on every miss: one with a nearest rollup, and one Cube could not explain', async () => {
    answering({
      matched: null,
      miss: {
        rollup: 'monthly_orders.by_status_month',
        member: 'monthly_orders.ordered_at',
        reason: 'monthly_orders.ordered_at is grouped by day, and the rollup keeps it by month.',
      },
    });
    expect((await screen.findByTestId('rollup-only-note')).textContent).toBe(NOTE);
  });

  it('notes it when Cube planned no rollup but could not say why', async () => {
    answering({ matched: null });

    expect((await screen.findByTestId('acceleration-miss')).textContent).toBe(
      'Not served by a pre-aggregation.',
    );
    expect(screen.getByTestId('rollup-only-note').textContent).toBe(NOTE);
  });

  it('gives no such note to a chart a rollup serves', async () => {
    answering({ matched: 'monthly_orders.by_status_month' });

    await screen.findByTestId('acceleration-matched');
    expect(screen.queryByTestId('rollup-only-note')).toBeNull();
    expect(screen.queryByTestId('rollup-only-warning')).toBeNull();
  });

  // As the API answers it since T403 (AC-220): the member's title beside its
  // name, and the reason in titles — the re-critique's own case.
  it('says so when the chart’s cubes have no rollups at all', async () => {
    answering({
      matched: null,
      miss: {
        rollup: null,
        member: 'orders.count',
        title: 'Orders Count',
        reason: 'Orders has no pre-aggregations.',
      },
    });

    const miss = await screen.findByTestId('acceleration-miss');
    expect(miss.textContent).toBe(
      'Not served by a pre-aggregation. Stopped by Orders Count: Orders has no pre-aggregations.',
    );
    // Design 02 state D (EDI-22): a 12/600 status line with its icon, then why.
    expect(miss.querySelector('.acceleration-panel__status svg')?.getAttribute('data-icon')).toBe(
      'live',
    );
    expect(miss.querySelector('.acceleration-panel__why')?.textContent).toBe(
      'Stopped by Orders Count: Orders has no pre-aggregations.',
    );
  });
});
