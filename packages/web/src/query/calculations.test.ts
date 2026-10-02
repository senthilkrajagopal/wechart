import { describe, expect, it } from 'vitest';

import { calculatedAnswer, joinAnswers, splitCalculations } from './calculations';

/**
 * AC-048: WHEN a quick calculation is applied, THE SYSTEM SHALL compute it in
 * Cube as a multi-stage measure rather than in the browser, and the tile SHALL
 * label the measure with the calculation applied.
 * Fails when: the value is computed from the already-fetched rows, or the
 * label does not name the calculation.
 *
 * xcube answers each calculation under its companion's column,
 * `<measure>__xc_<calculation>` (research `xcube-quick-calcs.md`, "The
 * answer"). A chart draws its rows by its measures' names, so the column is
 * read back under the measure's name: the value is Cube's, as it came.
 */
describe('reading each calculation’s column (AC-048)', () => {
  const query = {
    measures: ['orders.count', 'orders.total_amount'],
    timeDimensions: [{ dimension: 'orders.ordered_at', granularity: 'month' }],
    calculations: [{ measure: 'orders.count', kind: 'running_total' }],
  };
  const answer = {
    query: { measures: ['orders.count__xc_running_total', 'orders.total_amount'] },
    data: [
      {
        'orders.ordered_at.month': '2026-01-01T00:00:00.000',
        'orders.count__xc_running_total': '30',
        'orders.total_amount': '4987.50',
        'orders.ordered_at': '2026-01-01T00:00:00.000',
      },
      {
        'orders.ordered_at.month': '2026-02-01T00:00:00.000',
        'orders.count__xc_running_total': '58',
        'orders.total_amount': '10745.00',
        'orders.ordered_at': '2026-02-01T00:00:00.000',
      },
    ],
    annotation: {
      measures: {
        'orders.count__xc_running_total': {
          title: 'Orders Count (running total)',
          shortTitle: 'Count (running total)',
          type: 'number',
        },
        'orders.total_amount': { title: 'Orders Total Amount', type: 'number' },
      },
    },
    lastRefreshTime: '2026-10-02T00:00:00.000Z',
  };

  it('puts Cube’s value for the calculation under its measure’s name, as it came', () => {
    const read = calculatedAnswer(answer, query) as typeof answer & {
      data: Record<string, unknown>[];
    };

    expect(read.data).toEqual([
      {
        'orders.ordered_at.month': '2026-01-01T00:00:00.000',
        'orders.count': '30',
        'orders.total_amount': '4987.50',
        'orders.ordered_at': '2026-01-01T00:00:00.000',
      },
      {
        'orders.ordered_at.month': '2026-02-01T00:00:00.000',
        'orders.count': '58',
        'orders.total_amount': '10745.00',
        'orders.ordered_at': '2026-02-01T00:00:00.000',
      },
    ]);
    expect(read.lastRefreshTime).toBe(answer.lastRefreshTime);
  });

  it('keeps Cube’s annotation of it under the measure’s name', () => {
    const read = calculatedAnswer(answer, query) as {
      annotation: { measures: Record<string, { shortTitle?: string }> };
    };

    expect(read.annotation.measures['orders.count']?.shortTitle).toBe('Count (running total)');
    expect(Object.keys(read.annotation.measures)).not.toContain('orders.count__xc_running_total');
  });

  it('leaves an answer to a query with no calculation as it is', () => {
    const plain = { measures: ['orders.count'] };
    const said = { data: [{ 'orders.count': '80' }] };

    expect(calculatedAnswer(said, plain)).toBe(said);
  });
});

/**
 * xcube computes a running total from the start of the chart's range by
 * filtering on that range too, which would cut the earlier periods a
 * difference or a moving average reads, so it refuses the two in one query
 * (`combination`): "ask for them in separate queries" (research
 * `xcube-quick-calcs.md`, Gotcha 4). They are asked apart, and their rows
 * joined by the rest of their columns.
 */
describe('a running total over a range beside another calculation over time', () => {
  const ranged = {
    measures: ['orders.count', 'orders.total_amount', 'orders.average_amount'],
    timeDimensions: [
      { dimension: 'orders.ordered_at', granularity: 'month', dateRange: ['2026-01-01', '2026-03-31'] },
    ],
    filters: [{ member: 'orders.status', operator: 'equals', values: ['shipped'] }],
    calculations: [
      { measure: 'orders.average_amount', kind: 'rank' },
      { measure: 'orders.count', kind: 'running_total' },
      { measure: 'orders.total_amount', kind: 'difference' },
    ],
  };

  it('is asked in a query of its own, the rest in another, each with the chart’s filters', () => {
    expect(splitCalculations(ranged)).toEqual([
      {
        ...ranged,
        measures: ['orders.count'],
        calculations: [{ measure: 'orders.count', kind: 'running_total' }],
      },
      {
        ...ranged,
        measures: ['orders.total_amount', 'orders.average_amount'],
        calculations: [
          { measure: 'orders.average_amount', kind: 'rank' },
          { measure: 'orders.total_amount', kind: 'difference' },
        ],
      },
    ]);
  });

  it('is asked with the rest where xcube takes them together', () => {
    const { timeDimensions: _ranged, ...rest } = ranged;
    void _ranged;
    const unranged = {
      ...rest,
      timeDimensions: [{ dimension: 'orders.ordered_at', granularity: 'month' }],
    };
    const beside = {
      ...ranged,
      calculations: [
        { measure: 'orders.average_amount', kind: 'rank' },
        { measure: 'orders.count', kind: 'running_total' },
      ],
    };

    expect(splitCalculations(unranged)).toEqual([unranged]);
    expect(splitCalculations(beside)).toEqual([beside]);
  });

  it('has its rows joined to the rest’s, a period the other leaves out kept', () => {
    const month = (at: string) => ({
      'orders.ordered_at.month': `2026-${at}-01T00:00:00.000`,
      'orders.ordered_at': `2026-${at}-01T00:00:00.000`,
    });
    const joined = joinAnswers(
      [
        {
          data: [
            { ...month('01'), 'orders.count': '30' },
            { ...month('02'), 'orders.count': '58' },
          ],
          annotation: { measures: { 'orders.count': { title: 'Orders Count (running total)' } } },
          lastRefreshTime: '2026-10-02T01:00:00.000Z',
          usedPreAggregations: { a: {} },
        },
        {
          // No January: the difference has no previous month there.
          data: [{ ...month('02'), 'orders.total_amount': '5757.50' }],
          annotation: {
            measures: { 'orders.total_amount': { title: 'Orders Total Amount (difference)' } },
          },
          lastRefreshTime: '2026-10-02T00:00:00.000Z',
        },
      ],
      ranged,
    ) as {
      data: Record<string, unknown>[];
      annotation: { measures: Record<string, unknown> };
      lastRefreshTime?: string;
      usedPreAggregations?: unknown;
    };

    expect(joined.data).toEqual([
      { ...month('01'), 'orders.count': '30' },
      { ...month('02'), 'orders.count': '58', 'orders.total_amount': '5757.50' },
    ]);
    expect(Object.keys(joined.annotation.measures)).toEqual([
      'orders.count',
      'orders.total_amount',
    ]);
    // The older of the two, and served from rollups only where both were.
    expect(joined.lastRefreshTime).toBe('2026-10-02T00:00:00.000Z');
    expect(joined).not.toHaveProperty('usedPreAggregations');
  });
});
