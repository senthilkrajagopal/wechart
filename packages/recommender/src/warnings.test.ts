import { describe, expect, it } from 'vitest';

import type { Field, Signature } from './types';
import { warningsFor } from './warnings';

/**
 * T230 / AC-218: WHILE a manually chosen type is a combo, or exceeds a
 * channel's capacity for the chart's fields, THE SYSTEM SHALL show a warning
 * with an icon saying why, and offer to switch to the recommended type
 * (direction.md rules 6, 30).
 * `Fails when: a combo, or a pie drawn with more than 6 slices, shows no
 * warning.`
 *
 * Why, from the same hard rules the recommender rejects its own candidates
 * by, run on the chart the chosen type would draw from these fields.
 */
const measure = (name = 'orders.count'): Field => ({ name, kind: 'measure' });
const dimension = (cardinality: number, name = 'orders.status'): Field => ({
  name,
  kind: 'dimension',
  cardinality,
});
const time: Field = { name: 'orders.ordered_at', kind: 'timeDimension', cardinality: 12 };
const signature = (...fields: Field[]): Signature => ({ fields });

describe('what a chosen type warns of (AC-218)', () => {
  it('warns of a combo’s two value axes', () => {
    const [warning] = warningsFor(
      'combo',
      signature(measure(), measure('orders.total_amount'), dimension(4)),
    );
    expect(warning).toMatch(/^Two value axes/);
  });

  it('warns of a pie with more slices than it can show, naming both counts', () => {
    expect(warningsFor('pie', signature(measure(), dimension(8)))).toEqual([
      'A pie is readable up to 6 slices; this has 8.',
    ]);
    expect(warningsFor('donut', signature(measure(), dimension(8)))).toHaveLength(1);
    expect(warningsFor('pie', signature(measure(), dimension(6)))).toEqual([]);
  });

  // T232's review: over two dimensions a pie draws a slice per row (AC-221),
  // so three statuses by four regions are twelve slices, not three.
  it('counts a split pie’s slices as the rows it draws', () => {
    const split = {
      ...signature(measure(), dimension(3), dimension(4, 'orders.region')),
      rowCount: 12,
    };
    expect(warningsFor('pie', split)).toEqual(['A pie is readable up to 6 slices; this has 12.']);
  });

  it('warns of more colours than the palette holds, on the member split by', () => {
    const [warning] = warningsFor(
      'stackedBar',
      signature(measure(), dimension(4), dimension(12, 'orders.region')),
    );
    expect(warning).toBe('Colour carries 8 categories at most; this needs 12.');
    // Over time, the first dimension is the split.
    expect(warningsFor('multiLine', signature(measure(), time, dimension(12)))).toHaveLength(1);
  });

  it('warns of too many heatmap cells and trellis panels', () => {
    expect(
      warningsFor('heatmap', signature(measure(), dimension(20), dimension(20, 'orders.region'))),
    ).toHaveLength(1);
    expect(warningsFor('trellis', signature(measure(), time, dimension(30)))).toHaveLength(1);
  });

  // T230's review: Top N folds a pie's category into its N and one "Other".
  it('counts a pie folded by Top N as its N slices and Other', () => {
    expect(warningsFor('pie', signature(measure(), dimension(240)), { topN: 5 })).toEqual([]);
    expect(warningsFor('pie', signature(measure(), dimension(240)), { topN: 8 })).toEqual([
      'A pie is readable up to 6 slices; this has 9.',
    ]);
  });

  // T230's review: a scatter's colour is never its time. T242's: it is its
  // first dimension, as `compile` colours it — not the second.
  it('warns of a scatter’s colours by its first dimension, as it is drawn', () => {
    expect(
      warningsFor('scatter', signature(measure(), measure('orders.total_amount'), time)),
    ).toEqual([]);
    expect(
      warningsFor(
        'scatter',
        signature(measure(), measure('orders.total_amount'), dimension(12), dimension(3, 'b')),
      ),
    ).toEqual(['Colour carries 8 categories at most; this needs 12.']);
    expect(
      warningsFor(
        'scatter',
        signature(measure(), measure('orders.total_amount'), dimension(3), dimension(12, 'b')),
      ),
    ).toEqual([]);
  });

  // T399's review: a box plot colours by nothing, so no count of categories
  // exceeds a colour's capacity; its boxes lie along an axis.
  it('warns of no colours on a box plot, whatever its dimensions', () => {
    expect(warningsFor('boxplot', signature(measure(), dimension(20)))).toEqual([]);
    expect(
      warningsFor('boxplot', signature(measure(), dimension(3), dimension(20, 'orders.region'))),
    ).toEqual([]);
    expect(warningsFor('boxplot', signature(measure(), time, dimension(20)))).toEqual([]);
  });

  it('warns of nothing a chart can show as it is', () => {
    expect(warningsFor('bar', signature(measure(), dimension(4)))).toEqual([]);
    expect(warningsFor('table', signature(measure(), dimension(400)))).toEqual([]);
    expect(warningsFor('kpi', signature(measure()))).toEqual([]);
  });
});
