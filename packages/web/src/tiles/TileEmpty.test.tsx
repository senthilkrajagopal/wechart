import type { RenderSpec } from '@wechart/core';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { describeFilter } from '../filters/describe';
import { ChartTile } from './ChartTile';

/**
 * T050 / AC-043: WHEN a query returns no rows, THE SYSTEM SHALL show an empty
 * state naming the filters that are in effect.
 * Fails when: the tile renders blank axes with no message, or the message
 * omits an active filter.
 */
const empty = (chartType: RenderSpec['chartType']): RenderSpec => ({
  chartType,
  encoding: { x: ['orders.status'], y: ['orders.count'] },
  rows: [],
});

describe('a chart whose query returned no rows', () => {
  it.each(['bar', 'line', 'pie', 'table', 'kpi'] as const)(
    'as a %s: says so, naming every filter in effect, and draws no chart',
    (chartType) => {
      render(
        <ChartTile
          spec={empty(chartType)}
          inEffect={['Status is completed', 'Ordered at: last 30 days']}
        />,
      );

      const state = screen.getByTestId('tile-no-rows');
      expect(within(state).getByText('No rows to show.')).toBeTruthy();
      expect(within(state).getByText('Nothing matches the filters in effect:')).toBeTruthy();
      expect(
        within(state)
          .getAllByRole('listitem')
          .map((item) => item.textContent),
      ).toEqual(['Status is completed', 'Ordered at: last 30 days']);
      expect(screen.queryByTestId('chart-canvas')).toBeNull();
      expect(screen.queryByRole('table')).toBeNull();
    },
  );

  it('says the query itself returned nothing when no filter is in effect', () => {
    render(<ChartTile spec={empty('bar')} />);

    const state = screen.getByTestId('tile-no-rows');
    expect(state.textContent).toBe('No rows to show.The query returned no rows.');
    expect(within(state).queryByRole('list')).toBeNull();
  });
});

describe('a filter, in words', () => {
  it('picked values', () => {
    expect(describeFilter('Status', { kind: 'values', values: ['completed'] })).toBe(
      'Status is completed',
    );
    expect(
      describeFilter('Status', { kind: 'values', values: ['completed', 'shipped', 'processing'] }),
    ).toBe('Status is completed, shipped or processing');
  });

  it('a range, and either end of one', () => {
    expect(describeFilter('Amount', { kind: 'range', min: 10, max: 99 })).toBe(
      'Amount from 10 to 99',
    );
    expect(describeFilter('Amount', { kind: 'range', min: 10 })).toBe('Amount at least 10');
    expect(describeFilter('Amount', { kind: 'range', max: 99 })).toBe('Amount at most 99');
  });

  it('a preset, and dates', () => {
    expect(describeFilter('Ordered at', { kind: 'preset', preset: 'last 30 days' })).toBe(
      'Ordered at: last 30 days',
    );
    expect(
      describeFilter('Ordered at', { kind: 'dates', from: '2026-01-01', to: '2026-03-31' }),
    ).toBe('Ordered at from 2026-01-01 to 2026-03-31');
    expect(describeFilter('Ordered at', { kind: 'dates', from: '2026-01-01', to: '' })).toBe(
      'Ordered at on or after 2026-01-01',
    );
    expect(describeFilter('Ordered at', { kind: 'dates', from: '', to: '2026-03-31' })).toBe(
      'Ordered at on or before 2026-03-31',
    );
  });
});
