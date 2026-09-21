import { chartDocumentOf, emptySpec, type ChartDocument } from '@wechart/core';
import { describe, expect, it } from 'vitest';

import { TileLoadError } from '../query/loadTile';
import { recommendedTypeOf } from '../query/signature';
import { tileChartOf } from './chartSpec';
import { NOTHING_CHOSEN } from './edit/templates';

/**
 * T193 / AC-034: a chart that follows its recommendation has to draw on a
 * dashboard, with the type the editor recommends. AC-034 fails when "the
 * dashboard tile does not reflect the applied changes", and until this task a
 * chart saved without a type — the document's way of saying "follow the
 * recommender" — drew in the editor and showed "This chart has no chart type
 * yet" on every dashboard it was placed on.
 *
 * The comment above the old code stated the rule it broke: "a chart has to
 * look the same on a dashboard as it did where it was built". The editor
 * recommends from the chart's wells and the rows its query returns, and
 * nothing else; the dashboard has both, so it now does the same, through the
 * same function.
 */
const rows = [
  { 'orders.status': 'paid', 'orders.count': 120 },
  { 'orders.status': 'shipped', 'orders.count': 80 },
  { 'orders.status': 'cancelled', 'orders.count': 40 },
];

function chartOf(overrides: Partial<Parameters<typeof chartDocumentOf>[0]['spec']> = {}) {
  return chartDocumentOf({
    title: 'Orders by status',
    spec: {
      ...emptySpec('orders'),
      measures: ['orders.count'],
      dimensions: ['orders.status'],
      ...overrides,
    },
  });
}

/** A loader that answers with fixed rows and records whether it was asked. */
function loading(answer: Record<string, unknown>[]) {
  const asked: unknown[] = [];
  const load = async (query: unknown) => {
    asked.push(query);
    return answer;
  };
  return { asked, load };
}

function typeDrawn(chart: Awaited<ReturnType<typeof tileChartOf>>): unknown {
  return 'spec' in chart ? chart.spec.chartType : undefined;
}

describe('a chart with no saved type', () => {
  it('is drawn, rather than refused', async () => {
    const chart = await tileChartOf(chartOf(), loading(rows).load);

    expect('spec' in chart).toBe(true);
  });

  it('is drawn with the type the editor would recommend for the same fields and rows', async () => {
    /**
     * Compared with the shared function's own answer rather than with a type
     * written here, so this pins *agreement with the editor*, which is the
     * rule — not whichever type the recommender happens to favour today.
     */
    const document = chartOf();
    const expected = recommendedTypeOf(
      { ...emptySpec('orders'), measures: ['orders.count'], dimensions: ['orders.status'] },
      rows,
    );

    const chart = await tileChartOf(document, loading(rows).load);

    // Drawn — which also rules out a vacuous null-equals-null match below.
    expect('spec' in chart).toBe(true);
    expect(typeDrawn(chart)).toBe(expected);
  });

  it('follows the result when the result changes the pick, rather than drawing a fixed type', async () => {
    /**
     * Sixty categories are too many for vertical bars, so the pick moves off
     * `bar`. A dashboard that drew every typeless chart as `bar` — the type
     * every other seeded chart happens to save — would fail here and pass the
     * test above.
     *
     * That the pick is made from the rows *returned*, rather than from none,
     * is what the test above guards: three rows give `bar`, no rows give
     * `hbar` (unknown cardinality counts as unbounded). This one cannot tell
     * those apart — sixty categories and none both give `hbar`.
     */
    const many = Array.from({ length: 60 }, (_, index) => ({
      'orders.status': `status ${String(index)}`,
      'orders.count': index,
    }));
    const document = chartOf();
    const spec = {
      ...emptySpec('orders'),
      measures: ['orders.count'],
      dimensions: ['orders.status'],
    };

    const chart = await tileChartOf(document, loading(many).load);

    expect(typeDrawn(chart)).toBe(recommendedTypeOf(spec, many));
  });
});

describe('a chart with a saved type', () => {
  it('keeps the type the user chose, whatever the recommender would say', async () => {
    const document: ChartDocument = chartOf({ chartType: 'pie' });

    const chart = await tileChartOf(document, loading(rows).load);

    expect(typeDrawn(chart)).toBe('pie');
  });
});

describe('a chart with nothing in it', () => {
  it('is not queried', async () => {
    /**
     * An empty spec is no query at all, and sending one to Cube to learn that
     * would put an error on a tile that has simply not been built yet. The
     * editor's own guard is the same (`enabled: !isEmpty(spec)`).
     */
    const { asked, load } = loading(rows);

    /**
     * Given a saved type on purpose. A typeless empty chart was never queried
     * even before this task — it was refused for having no type first — so
     * using one here would pass whether or not the emptiness guard existed.
     * With a type, the old code went straight to the query.
     */
    await tileChartOf(
      chartDocumentOf({ title: 'Nothing yet', spec: { ...emptySpec('orders'), chartType: 'bar' } }),
      load,
    );

    expect(asked).toEqual([]);
  });

  it('says it has no fields yet, in the words an unbound tile uses', async () => {
    // The same condition as a tile bound to no chart at all (AC-068), so the
    // same sentence — imported, not retyped, so the two cannot drift.
    const chart = await tileChartOf(
      chartDocumentOf({ title: 'Nothing yet', spec: emptySpec('orders') }),
      loading(rows).load,
    );

    expect(chart).toEqual({ error: NOTHING_CHOSEN });
  });
});

describe('when nothing can be recommended', () => {
  it('says it has no chart type — for a chart with only a time dimension', async () => {
    /**
     * The one refusal left, and it is now true when it is shown. With no
     * measure and no dimension, every candidate the recommender enumerates
     * needs a measure except a table, and a table with no value field and no
     * category field has nothing to encode — so nothing is legal, whatever
     * the rows. The editor draws nothing for the same chart.
     *
     * An earlier version of this file claimed this branch could not be
     * reached, generalising from the recommender's one *documented* empty
     * case (no fields at all), and left it untested on that basis. It is
     * reached by a chart the user can build in two clicks.
     */
    const timeOnly = chartDocumentOf({
      title: 'Only a date',
      spec: { ...emptySpec('orders'), timeDimensions: ['orders.ordered_at'] },
    });

    const chart = await tileChartOf(
      timeOnly,
      loading([{ 'orders.ordered_at': '2026-01-01' }, { 'orders.ordered_at': '2026-01-02' }]).load,
    );

    expect(chart).toEqual({ error: 'This chart has no chart type yet.' });
  });
});

describe('a chart whose query returns no rows', () => {
  it('is still drawn, with a recommendation, rather than refused', async () => {
    // Fields the recommender can place get a type even from an empty result,
    // which is what the editor shows for the same chart.
    const spec = {
      ...emptySpec('orders'),
      measures: ['orders.count'],
      dimensions: ['orders.status'],
    };

    const chart = await tileChartOf(chartOf(), loading([]).load);

    // Drawn, not refused — stated outright rather than implied.
    expect('spec' in chart).toBe(true);
    expect(typeDrawn(chart)).toBe(recommendedTypeOf(spec, []));
  });
});

describe('when the query fails', () => {
  it('carries the very value thrown, so the tile can still offer the query', async () => {
    /**
     * AC-012: `TileError` offers the query JSON only for a `TileLoadError`.
     * Checked by identity, because `toEqual` compares errors by name and
     * message — so rebuilding the value as a fresh `Error` with the same
     * message, which is exactly the flattening that loses the query, would
     * have passed an equality check.
     */
    const failure = new TileLoadError('Cube said no', { measures: ['orders.count'] }, 400);
    const chart = await tileChartOf(chartOf(), async () => {
      throw failure;
    });

    expect('error' in chart && chart.error).toBe(failure);
  });
});

describe('when drawing the result throws', () => {
  it('fails that tile only, not the whole dashboard', async () => {
    /**
     * Every tile's chart is loaded together (`Promise.all` in DashboardPage),
     * so a rejection here would fail the lot and every tile would read "no
     * longer available". Anything that throws after the query — reading the
     * rows, recommending, compiling — has to become this tile's error.
     *
     * A value whose text cannot be read makes counting distinct values throw,
     * which is the most direct way to reach that path.
     */
    const unreadable = {
      toString() {
        throw new Error('unreadable value');
      },
    };

    const chart = await tileChartOf(
      chartOf(),
      loading([{ 'orders.status': unreadable, 'orders.count': 1 }]).load,
    );

    expect('error' in chart).toBe(true);
  });
});
