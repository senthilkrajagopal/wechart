import { CHART_TYPES } from '@wechart/core';
import { describe, expect, it } from 'vitest';

import {
  ALL_CARDS,
  CARD_NAMES,
  cardChoice,
  DESIGNED_PURPOSES,
  needsText,
  PARKED,
  TYPE_DESCRIPTIONS,
  TYPE_PURPOSES,
  typesMatching,
} from './chartTypeCatalog';

/**
 * T230 / AC-217: … a Change action opening a gallery of every type that can
 * be searched, groups types by purpose, states what each needs and greys
 * those the chart's fields cannot draw …
 * `Fails when: … a type the fields cannot draw is not greyed with its
 * requirement …`
 */
describe('the chart type gallery’s catalog (AC-217)', () => {
  it('puts every type in a purpose, and describes each', () => {
    const grouped = new Set(TYPE_PURPOSES.flatMap((purpose) => purpose.cards));
    for (const card of ALL_CARDS) {
      expect(grouped.has(card)).toBe(true);
      expect(TYPE_DESCRIPTIONS[card].length).toBeGreaterThan(0);
    }
    // Every type the spec knows has a card of its own, but a parked one's
    // is hidden (the user, 2026-10-18).
    for (const type of CHART_TYPES) if (!PARKED.has(type)) expect(ALL_CARDS).toContain(type);
  });

  it('says what each type needs, in the field list’s words', () => {
    expect(needsText('line')).toBe('Needs a measure and a time dimension');
    expect(needsText('stackedArea')).toBe('Needs a measure, a time dimension and a dimension');
    // A time dimension counts as one of a pivot's groupings, as `compile`
    // draws it (T305's review), and no sentence ends on a comma.
    expect(needsText('pivot')).toBe('Needs 2 dimensions, or a time dimension and a dimension');
    expect(needsText('trellis')).toBe(
      'Needs a measure and 2 dimensions, or a time dimension and a dimension',
    );
    expect(needsText('table')).toBe('Draws any fields');
  });

  it('finds types by name or description, ignoring case', () => {
    expect(typesMatching('TREND')).toContain('line');
    expect(typesMatching('grouped')).toEqual(['groupedBar']);
    expect(typesMatching('  ')).toEqual(ALL_CARDS);
    expect(typesMatching('no type is called this')).toEqual([]);
  });
});

/**
 * T934 / AC-559: THE SYSTEM SHALL list in the chart-type gallery nine
 * purposes, in this order, holding these cards … each new card stating its
 * purpose and what it needs in design 23's words … with "summed" wherever the
 * measure must add up; and no gauge, a search for "gauge" listing Bullet
 * chart and KPI.
 * `Fails when: a purpose, a card or their order differs; a new card's purpose
 * or needs differ from design 23's, or Waterfall's, 100 % stacked bar's or
 * area's, Sankey's or Icicle's needs lack "summed"; a type's two cards pin
 * different types; a gauge card exists; or a search for "gauge" doesn't list
 * Bullet chart and KPI.`
 */
describe('R81’s gallery: nine purposes and the new cards (AC-559)', () => {
  it('lists the nine purposes in order, each with its cards as designed', () => {
    expect(DESIGNED_PURPOSES.map((purpose) => [purpose.name, purpose.cards])).toEqual([
      [
        'Evolution over time',
        [
          'line',
          'area',
          'multiLine',
          'stackedArea',
          'combo',
          'stackedArea100',
          'timeline',
          'calendar',
        ],
      ],
      [
        'Ranking and comparison',
        ['bar', 'hbar', 'groupedBar', 'stackedBar', 'waterfall', 'bullet', 'funnel'],
      ],
      [
        'Part of a whole',
        [
          'pie',
          'donut',
          'treemap',
          'stackedBar',
          'stackedArea',
          'stackedBar100',
          'stackedArea100',
          'icicle',
        ],
      ],
      ['Flow', ['sankey', 'funnel']],
      ['Distribution and matrix', ['histogram', 'boxplot', 'heatmap', 'pivot', 'trellis']],
      ['Correlation', ['scatter', 'bubble', 'parallel']],
      ['Geography', ['map']],
      ['KPI', ['kpi', 'bullet']],
      ['Table', ['table', 'pivot', 'graphicalTable']],
    ]);
  });

  /**
   * The user, 2026-10-18: "any of the charts that you have not started
   * implmentation put them in the parking lot for now". A parked type's card
   * is hidden from every shelf, from All charts and from search, so no one
   * can choose a type that isn't drawn; un-parking a type is one line of
   * `PARKED`.
   */
  it('hides the parked types’ cards from the shelves, All charts and search', () => {
    const parked = [
      'waterfall',
      'histogram',
      'bubble',
      'funnel',
      'timeline',
      'calendar',
      'icicle',
    ] as const;
    expect([...PARKED].sort()).toEqual([...parked].sort());
    const shown = new Set(TYPE_PURPOSES.flatMap((purpose) => purpose.cards));
    for (const card of parked) {
      expect(shown.has(card)).toBe(false);
      expect(ALL_CARDS).not.toContain(card);
      expect(typesMatching(CARD_NAMES[card])).not.toContain(card);
    }
    // Each shelf as designed, less its parked cards; Flow keeps the Sankey.
    expect(TYPE_PURPOSES.map((purpose) => purpose.cards)).toEqual(
      DESIGNED_PURPOSES.map((purpose) => purpose.cards.filter((card) => !PARKED.has(card))),
    );
    expect(TYPE_PURPOSES.find((purpose) => purpose.id === 'flow')?.cards).toEqual(['sankey']);
  });

  it('names each new card and says what it is for and needs, in design 23’s words', () => {
    const card = (id: Parameters<typeof needsText>[0]) => [
      CARD_NAMES[id],
      TYPE_DESCRIPTIONS[id],
      needsText(id),
    ];
    expect(card('waterfall')).toEqual([
      'Waterfall',
      'What moved a total from one value to another',
      'Needs a summed measure, and a dimension or time for its steps',
    ]);
    expect(card('bullet')).toEqual([
      'Bullet chart',
      'Each member against its target and bands',
      'Needs a measure, a target and a dimension',
    ]);
    expect(card('funnel')).toEqual([
      'Funnel',
      'Where volume drops between steps',
      'Needs a stage dimension and a measure, or measures in order',
    ]);
    expect(card('stackedBar100')).toEqual([
      '100 % stacked bar',
      'Mix within each category; every bar is 100 %',
      'Needs a summed measure and two dimensions',
    ]);
    expect(card('stackedArea100')).toEqual([
      '100 % stacked area',
      'Mix over time; every point is 100 %',
      'Needs a summed measure, time and a dimension',
    ]);
    expect(card('timeline')).toEqual([
      'Timeline',
      'What ran when, for how long, and what overlapped',
      'Needs a dimension, a start time and an end time',
    ]);
    expect(card('calendar')).toEqual([
      'Calendar heatmap',
      'Which days run hot or cold',
      'Needs a time dimension by day and a measure',
    ]);
    expect(card('icicle')).toEqual([
      'Icicle',
      'A total broken down level by level; sunburst as an option',
      'Needs a summed measure and 2–4 dimensions, or a hierarchy',
    ]);
    expect(card('sankey')).toEqual([
      'Sankey',
      'How volume flows between stages or categories',
      'Needs a summed measure and 2–4 dimensions',
    ]);
    expect(card('histogram')).toEqual([
      'Histogram',
      'How values are spread, in bins',
      'Needs a numeric dimension, or a measure with Each point is',
    ]);
    expect(card('bubble')).toEqual([
      'Bubble',
      'Three measures: across, up, and size',
      'Needs 3 measures and a dimension',
    ]);
    expect(card('parallel')).toEqual([
      'Parallel coordinates',
      'Compare members across 3 or more measures',
      'Needs 3 or more measures and a dimension',
    ]);
    expect(card('map')).toEqual([
      'Map',
      'Regions, points or density on vector boundaries',
      'Needs a region key or a location, and a measure',
    ]);
    expect(card('graphicalTable')).toEqual([
      'Graphical table',
      'Rows of values, sparklines, bullets and icons',
      'Needs a dimension and a measure',
    ]);
  });

  it('says "summed" wherever the measure must add up', () => {
    for (const id of [
      'waterfall',
      'stackedBar100',
      'stackedArea100',
      'sankey',
      'icicle',
    ] as const) {
      expect(needsText(id), id).toContain('summed');
    }
  });

  it('pins one type from every card of it, the 100 % cards their stacked type at 100 %', () => {
    expect(cardChoice('funnel')).toEqual({ type: 'funnel' });
    expect(cardChoice('bullet')).toEqual({ type: 'bullet' });
    expect(cardChoice('stackedBar100')).toEqual({ type: 'stackedBar', stack: 'percent' });
    expect(cardChoice('stackedArea100')).toEqual({ type: 'stackedArea', stack: 'percent' });
  });

  it('offers no gauge, and finds Bullet chart and KPI for "gauge"', () => {
    expect(ALL_CARDS.some((card) => /gauge/i.test(`${card} ${CARD_NAMES[card]}`))).toBe(false);
    expect([...typesMatching('gauge')].sort()).toEqual(['bullet', 'kpi']);
    expect([...typesMatching('Gauge')].sort()).toEqual(['bullet', 'kpi']);
  });
});
