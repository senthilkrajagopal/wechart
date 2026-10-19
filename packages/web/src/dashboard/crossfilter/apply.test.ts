import { describe, expect, it } from 'vitest';

import type { CrossFilterConfig } from '../settings/interactionMode';
import {
  brushedMembers,
  effectsOn,
  highlightParts,
  pairKey,
  type CrossSelection,
} from './apply';

/**
 * T123 / AC-117: WHILE a dashboard is in cross-filter mode, WHEN the user
 * clicks a mark, THE SYSTEM SHALL apply the action set for that source and
 * target pair: filter the target, highlight it, or leave it unchanged.
 * `Fails when: a pair set to None changes, or a pair set to Filter only
 * highlights.`
 *
 * The decision is a pure function of the pair matrix and what was clicked, so
 * every branch is asserted here; what a tile then draws is the renderer's,
 * and what it asks Cube is the query's.
 *
 * Highlight carries the selection rather than filtering the query, because a
 * highlighted tile keeps its own rows and draws the selection's share beside
 * them — the user's decision, 2026-09-22, following Power BI
 * (`docs/research/cross-highlight.md` §1, option H2).
 */
const clicked: CrossSelection = { from: 'tile-sales', member: 'orders.status', value: 'shipped' };
const also: CrossSelection = {
  from: 'tile-region',
  member: 'products.category',
  value: 'Beverages',
};

/** A bar tile grouped by its own field, which neither selection names. */
const bars = { chartType: 'bar', members: ['orders.ordered_at'] };

const config = (
  defaultAction: CrossFilterConfig['defaultAction'],
  pairs: Record<string, 'filter' | 'highlight' | 'none'> = {},
): CrossFilterConfig => ({ defaultAction, pairs });

describe('the action set for a pair', () => {
  it('filters the target when the pair says Filter', () => {
    const effects = effectsOn(
      'tile-orders',
      [clicked],
      config('none', { [pairKey('tile-sales', 'tile-orders')]: 'filter' }),
    );

    expect(effects.filters).toEqual([clicked]);
    expect(effects.highlight).toBeUndefined();
  });

  it('highlights the target when the pair says Highlight, and does not filter it', () => {
    const effects = effectsOn(
      'tile-orders',
      [clicked],
      config('none', { [pairKey('tile-sales', 'tile-orders')]: 'highlight' }),
      bars,
    );

    // The failing state the criterion names, the other way round: a pair set
    // to Highlight that filtered would drop the rows it is meant to keep.
    expect(effects.filters).toEqual([]);
    expect(effects.highlight).toEqual({ selection: clicked, kind: 'share' });
  });

  it('leaves the target alone when the pair says None', () => {
    const effects = effectsOn(
      'tile-orders',
      [clicked],
      config('filter', { [pairKey('tile-sales', 'tile-orders')]: 'none' }),
    );

    expect(effects.filters).toEqual([]);
    expect(effects.highlight).toBeUndefined();
  });

  it('never acts on the tile the click came from', () => {
    // Its own selection is shown on it, not applied to it: a tile that
    // filtered itself would drop every bar but the one just clicked.
    expect(effectsOn('tile-sales', [clicked], config('filter')).filters).toEqual([]);
    expect(effectsOn('tile-sales', [clicked], config('highlight')).highlight).toBeUndefined();
  });
});

describe('a pair the author has not set', () => {
  it('takes the dashboard default, whichever it is (AC-118)', () => {
    expect(effectsOn('tile-orders', [clicked], config('filter')).filters).toEqual([clicked]);
    expect(effectsOn('tile-orders', [clicked], config('highlight'), bars).highlight).toEqual({
      selection: clicked,
      kind: 'share',
    });
    expect(effectsOn('tile-orders', [clicked], config('none')).filters).toEqual([]);
  });

  it('takes it per pair, so one pair set by hand leaves the others at the default', () => {
    const set = config('filter', { [pairKey('tile-sales', 'tile-orders')]: 'none' });

    expect(effectsOn('tile-orders', [clicked], set).filters).toEqual([]);
    expect(effectsOn('tile-other', [clicked], set).filters).toEqual([clicked]);
  });
});

describe('two tiles cross-filtering at once', () => {
  it('ANDs the filters from both', () => {
    const effects = effectsOn('tile-orders', [clicked, also], config('filter'));

    expect(effects.filters).toEqual([clicked, also]);
  });

  it('filters by one and highlights by the other, where the pairs differ', () => {
    const effects = effectsOn(
      'tile-orders',
      [clicked, also],
      config('filter', { [pairKey('tile-region', 'tile-orders')]: 'highlight' }),
      bars,
    );

    expect(effects.filters).toEqual([clicked]);
    expect(effects.highlight).toEqual({ selection: also, kind: 'share' });
  });

  it('highlights by the first of them, since a tile draws one highlight', () => {
    // The prototype's rule (`docs/design/prototype/dashboard.js`: the tile
    // takes the first cross-filter whose pair highlights). A second would
    // have to be drawn as a share of a share, which no chart can say.
    const effects = effectsOn('tile-orders', [clicked, also], config('highlight'), bars);

    expect(effects.highlight).toEqual({ selection: clicked, kind: 'share' });
    expect(effects.filters).toEqual([]);
  });
});

/**
 * How the highlight is drawn, by what the target is. The user's decision,
 * 2026-09-22: the selection's share as Power BI draws it, and the types that
 * can show neither that nor a fade are filtered instead
 * (`docs/research/cross-highlight.md`, options H2, H1 and H5).
 */
describe('a highlight on a tile that cannot draw one', () => {
  const highlighting = config('highlight');

  it('draws the share on a plain bar tile, whatever it groups by', () => {
    for (const chartType of ['bar', 'hbar']) {
      const effects = effectsOn('tile-orders', [clicked], highlighting, { chartType, members: [] });
      expect(effects.highlight?.kind).toBe('share');
      expect(effects.filters).toEqual([]);
    }
  });

  it('does not draw the share on a bar tile with more than one series', () => {
    // A bar chart of two measures draws two series, and the overlay's
    // `barGap: '-100%'` belongs to the whole grid, so it would land on both
    // (`docs/research/cross-highlight.md`, gotcha 4). Split by the clicked
    // member it fades instead; otherwise it is filtered (T123's review).
    expect(
      effectsOn('tile-orders', [clicked], highlighting, {
        chartType: 'bar',
        members: ['orders.ordered_at'],
        seriesCount: 2,
      }).filters,
    ).toEqual([clicked]);

    expect(
      effectsOn('tile-orders', [clicked], highlighting, {
        chartType: 'bar',
        members: ['orders.status'],
        seriesCount: 2,
      }).highlight,
    ).toEqual({ selection: clicked, kind: 'fade' });
  });

  it('fades a grouped or stacked bar split by the clicked member', () => {
    // The share's overlay is a property of the whole grid, so on these it
    // would land on every series at once; the series that matches staying
    // full while the others fade says the same thing honestly.
    for (const chartType of ['groupedBar', 'stackedBar', 'combo']) {
      const effects = effectsOn('tile-orders', [clicked], highlighting, {
        chartType,
        members: ['orders.status'],
      });
      expect(effects.highlight).toEqual({ selection: clicked, kind: 'fade' });
    }
  });

  it('fades a pie or treemap that groups by the clicked member', () => {
    // No second query: the slice that matches is one of its own.
    const effects = effectsOn('tile-orders', [clicked], highlighting, {
      chartType: 'pie',
      members: ['orders.status'],
    });

    expect(effects.highlight).toEqual({ selection: clicked, kind: 'fade' });
  });

  it('filters a pie that does not group by it, since no slice is the match', () => {
    const effects = effectsOn('tile-orders', [clicked], highlighting, {
      chartType: 'pie',
      members: ['products.category'],
    });

    expect(effects.highlight).toBeUndefined();
    expect(effects.filters).toEqual([clicked]);
  });

  it('filters lines, scatter, KPIs and tables, as Power BI does', () => {
    for (const chartType of ['line', 'multiLine', 'area', 'scatter', 'kpi', 'table', 'pivot']) {
      const effects = effectsOn('tile-orders', [clicked], highlighting, {
        chartType,
        members: ['orders.status'],
      });
      expect(effects.highlight).toBeUndefined();
      expect(effects.filters).toEqual([clicked]);
    }
  });
});

/**
 * Checkpoint 3's review (AC-599, AC-612, AC-568, AC-117): Highlight carries a
 * selection whole, as Filter does — every member a parallel brush passes, and
 * every part of a Sankey link's tuple — never its first value alone.
 */
describe('a highlight carries the whole selection', () => {
  const brushed: CrossSelection = {
    from: 'tile-parallel',
    member: 'products.name',
    value: 'Chai',
    values: ['Chai', 'Chang', 'Tofu', 'Ikura', 'Konbu', 'Pavlova'],
    words: 'Product: 6 brushed in Margin %',
  };
  const link: CrossSelection = {
    from: 'tile-sankey',
    member: 'orders.channel',
    value: 'Web',
    also: [{ member: 'orders.region', value: 'EMEA' }],
  };

  it('asks a share by every brushed value, under the name the target takes it by', () => {
    expect(highlightParts(brushed, 'view.product_name')).toEqual([
      { member: 'view.product_name', values: brushed.values },
    ]);
  });

  /** AC-599: "stored as a member list of at most 1,000 (AC-102)", cross-filtering too. */
  it('holds a brush’s cross-filter to 1,000 members, saying how many were left out', () => {
    const many = Array.from({ length: 1_250 }, (_, at) => String(at));
    const capped = brushedMembers(many);
    expect(capped.values).toEqual(many.slice(0, 1_000));
    expect(capped.message).toBe('A cross-filter holds at most 1,000 members. 250 were not added.');
    expect(brushedMembers(many.slice(0, 6))).toEqual({ values: many.slice(0, 6) });
  });

  it('asks a share by every part of a tuple', () => {
    expect(highlightParts(link)).toEqual([
      { member: 'orders.channel', values: ['Web'] },
      { member: 'orders.region', values: ['EMEA'] },
    ]);
  });

  it('fades only a tile showing every member of the tuple; one that shows part of it is filtered', () => {
    const pair = config('none', { [pairKey('tile-sankey', 'tile-stacked')]: 'highlight' });
    const both = { chartType: 'stackedBar', members: ['orders.channel', 'orders.region'], seriesCount: 3 };
    expect(effectsOn('tile-stacked', [link], pair, both).highlight).toEqual({
      selection: link,
      kind: 'fade',
    });
    const channelOnly = { chartType: 'stackedBar', members: ['orders.channel', 'orders.status'], seriesCount: 3 };
    const effects = effectsOn('tile-stacked', [link], pair, channelOnly);
    expect(effects.highlight).toBeUndefined();
    expect(effects.filters).toEqual([link]);
  });
});
