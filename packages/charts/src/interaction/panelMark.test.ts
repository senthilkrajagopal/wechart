import { matchesPredicate } from '@wechart/core';
import { describe, expect, it } from 'vitest';

import { trellisOption } from '../layout/trellis';
import { markFromPanel, panelOfTitleClick } from './panelMark';

/**
 * T097 / AC-091: WHEN the user clicks a trellis panel header, THE SYSTEM SHALL
 * mark every item in that panel.
 * `Fails when: the click marks a single item, or nothing.`
 *
 * Two failing states and they fail for opposite reasons. "Marks a single item"
 * is a predicate that names too much — the panel *and* whatever else was under
 * the pointer. "Marks nothing" is reached without writing any marking code at
 * all: ECharts titles emit no events unless `title.triggerEvent` is set, so a
 * header click would land on nothing and the handler would never run.
 *
 * `trellis.ts` has set `triggerEvent: true` since AC-045, with a comment
 * naming this criterion — and nothing asserted it until now. A line that looks
 * unused is a line someone tidies away.
 */
const spec = {
  chartType: 'trellis' as const,
  encoding: { x: ['orders.status'], y: ['orders.count'], facet: ['orders.region'] },
  rows: [
    { 'orders.region': 'east', 'orders.status': 'paid', 'orders.count': 3 },
    { 'orders.region': 'east', 'orders.status': 'shipped', 'orders.count': 4 },
    { 'orders.region': 'west', 'orders.status': 'paid', 'orders.count': 5 },
  ],
};

describe('clicking a trellis panel header', () => {
  it('marks every item in the panel, not one of them', () => {
    const marked = markFromPanel({ member: 'orders.region', value: 'east' });

    expect(spec.rows.filter((row) => matchesPredicate(marked, row))).toEqual([
      spec.rows[0],
      spec.rows[1],
    ]);
  });

  it('marks the panel and nothing outside it', () => {
    const marked = markFromPanel({ member: 'orders.region', value: 'east' });

    expect(spec.rows.filter((row) => matchesPredicate(marked, row))).not.toContain(spec.rows[2]);
  });

  it('marks the panel and only the panel, replacing whatever came before', () => {
    // A panel click replaces, as a plain click does elsewhere. It takes no
    // previous marking at all, so that is true by construction rather than by
    // care — which is the point of the signature.
    const marked = markFromPanel({ member: 'orders.region', value: 'east' });

    expect(marked.items).toEqual([[{ member: 'orders.region', value: 'east' }]]);
    expect(marked.ranges).toEqual([]);
  });

  it('marks something rather than nothing', () => {
    // The second failing state, stated directly: a header click that produced
    // an empty predicate would look like a working feature that silently
    // clears the marking.
    const marked = markFromPanel({ member: 'orders.region', value: 'east' });

    expect(marked.items).not.toEqual([]);
    expect(spec.rows.some((row) => matchesPredicate(marked, row))).toBe(true);
  });
});

describe('reaching the header click at all', () => {
  it('lets the panel titles emit events, which ECharts does not do by default', () => {
    /**
     * Without this every header click lands on nothing, the handler never
     * runs, and the criterion fails at "marks nothing" — with no marking code
     * anywhere at fault.
     */
    const option = trellisOption(spec);
    const titles = option.title as { triggerEvent?: unknown }[];

    expect(titles.length).toBeGreaterThan(0);
    for (const title of titles) expect(title.triggerEvent).toBe(true);
  });

  it('identifies the panel a title click came from, by its index', () => {
    // ECharts reports a title click as `componentType: 'title'` with a
    // `componentIndex`; the panel is whichever title that index names.
    const option = trellisOption(spec);

    expect(panelOfTitleClick(option, 0)).toBe('east');
    expect(panelOfTitleClick(option, 1)).toBe('west');
  });

  it('is nothing for an index that names no panel', () => {
    // A click on some other title component must not mark a panel that does
    // not exist, or mark panel zero by accident.
    expect(panelOfTitleClick(trellisOption(spec), 7)).toBeNull();
  });
});
