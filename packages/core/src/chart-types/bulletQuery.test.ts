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

  /**
   * AC-581: one bullet per member (checkpoint 1's review): asked by every
   * well, a member came back as many rows — one per id, or per day — and its
   * bullet read the first of them. Asked by its member alone, Cube gives the
   * member's own total, whatever the measure's kind.
   */
  it('asks Cube by its member alone, so each bullet is the member’s total', () => {
    const document = {
      ...bullet({ kind: 'measure', member: 'orders.revenue_target' }),
    } as unknown as { chart: Record<string, unknown> };
    const wide = {
      ...document,
      chart: {
        ...document.chart,
        wells: {
          measures: ['orders.revenue'],
          dimensions: ['orders.region', 'orders.id'],
          timeDimensions: ['orders.ordered_at'],
        },
      },
    } as unknown as ChartDocument;
    const query = toCubeQuery(toChartSpec(wide));
    expect(query['dimensions']).toEqual(['orders.region']);
    expect(query['timeDimensions']).toBeUndefined();
    expect(query['measures']).toEqual(['orders.revenue', 'orders.revenue_target']);
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
