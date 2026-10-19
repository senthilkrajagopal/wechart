import { describe, expect, it } from 'vitest';

import type { ChartDocument } from '../chart-document';
import { toChartSpec } from '../chart-document';
import { toCubeQuery } from '../chart-spec';
import { defaultEncoding } from '../compile';
import { targetMeasuresOf } from './bullet';

/**
 * T954 / AC-581: a bullet is drawn against its target, so a Target measure is
 * asked of Cube with the chart's Metrics, on the dashboard and in the editor
 * alike: never put in Metrics, where it would be a second value.
 */
const bullet = (target: unknown, chartType = 'bullet'): ChartDocument =>
  ({
    schemaVersion: 1,
    title: 'Revenue against target',
    owner: 'admin',
    chart: {
      source: { cube: 'orders' },
      wells: { measures: ['orders.revenue'], dimensions: ['orders.region'], timeDimensions: [] },
      chartType,
      options: { bullet: { target } },
    },
  }) as unknown as ChartDocument;

describe('a bullet’s Target, asked of Cube (AC-581)', () => {
  it('asks for a Target measure beside the Metrics, sorted as every query is', () => {
    const query = toCubeQuery(
      toChartSpec(bullet({ kind: 'measure', member: 'orders.revenue_target' })),
    );
    expect(query['measures']).toEqual(['orders.revenue', 'orders.revenue_target']);
  });

  it('asks nothing more for a target value, no target, or another type', () => {
    expect(toCubeQuery(toChartSpec(bullet({ kind: 'value', value: 450000 })))['measures']).toEqual([
      'orders.revenue',
    ]);
    expect(toCubeQuery(toChartSpec(bullet(undefined)))['measures']).toEqual(['orders.revenue']);
    expect(
      toCubeQuery(toChartSpec(bullet({ kind: 'measure', member: 'orders.revenue_target' }, 'bar')))[
        'measures'
      ],
    ).toEqual(['orders.revenue']);
  });

  it('asks a Target measure that is also in Metrics once', () => {
    const query = toCubeQuery(toChartSpec(bullet({ kind: 'measure', member: 'orders.revenue' })));
    expect(query['measures']).toEqual(['orders.revenue']);
  });

  /**
   * One bullet per member of the chart's dimension (design 23 sheet 8,
   * "Dimensions Region"), its first measure the value: never a bullet per
   * day of a time dimension, which a bar's encoding would put across (found
   * by T956's table-view walk).
   */
  it('draws a bullet per member of its first dimension, of its first measure', () => {
    const wells = {
      measures: ['orders.count', 'orders.total_amount'],
      dimensions: ['orders.status', 'orders.id'],
      timeDimensions: ['orders.ordered_at'],
    };
    expect(defaultEncoding({ wells } as never, 'bullet')).toEqual({
      x: ['orders.status'],
      y: ['orders.count'],
    });
  });

  it('names the measures a type’s settings draw', () => {
    expect(
      targetMeasuresOf('bullet', { bullet: { target: { kind: 'measure', member: 'm.t' } } }),
    ).toEqual(['m.t']);
    expect(
      targetMeasuresOf('kpi', { bullet: { target: { kind: 'measure', member: 'm.t' } } }),
    ).toEqual([]);
  });
});
