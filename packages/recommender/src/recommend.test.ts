import { describe, expect, it } from 'vitest';

import { isLegal } from './legality';
import { MAX_REASON_LENGTH, enumerate, recommend } from './recommend';
import type { Field, Signature } from './types';

/**
 * AC-028: WHEN the chart's fields change, THE SYSTEM SHALL recommend a chart
 * type from the field signature and cardinalities, and show at least one
 * runner-up, each with a reason of at most 80 characters.
 * Fails when: no runner-up is shown, or a reason exceeds 80 characters.
 *
 * AC-030 and AC-031, carried from T027: both are stated over what is *offered*,
 * so they are demonstrated here — over many signatures, nothing the recommender
 * returns has two value axes or exceeds a channel cap.
 */
const measure = (name = 'orders.count'): Field => ({ name, kind: 'measure' });
const dimension = (cardinality: number, name = 'orders.status'): Field => ({
  name,
  kind: 'dimension',
  cardinality,
});
const time = (name = 'orders.ordered_at'): Field => ({ name, kind: 'timeDimension' });

const signature = (...fields: Field[]): Signature => ({ fields });

/** A spread of shapes, so the guarantees below are not about one lucky case. */
const SIGNATURES: [string, Signature][] = [
  ['one measure', signature(measure())],
  ['two measures', signature(measure(), measure('orders.total_amount'))],
  ['measure by small category', signature(measure(), dimension(4))],
  ['measure by large category', signature(measure(), dimension(60))],
  ['measure by huge category', signature(measure(), dimension(5000))],
  ['measure over time', signature(measure(), time())],
  ['measure over time by category', signature(measure(), time(), dimension(5))],
  ['measure by two categories', signature(measure(), dimension(4), dimension(6, 'b'))],
  ['measure by two large categories', signature(measure(), dimension(30), dimension(30, 'b'))],
  ['two measures by category', signature(measure(), measure('m2'), dimension(9))],
  ['unknown cardinality', signature(measure(), { name: 'd', kind: 'dimension' })],
  // T305's review: every chart over time coloured by these is over the cap.
  ['measure over time by a large category', signature(measure(), time(), dimension(21))],
  [
    'measure over time by a category of unknown size',
    signature(measure(), time(), { name: 'd', kind: 'dimension' }),
  ],
];

describe('a recommendation and a runner-up (AC-028)', () => {
  it.each(SIGNATURES)('offers a top pick and a runner-up for %s', (_label, input) => {
    const { top, runnersUp } = recommend(input);

    expect(top).not.toBeNull();
    expect(runnersUp.length).toBeGreaterThanOrEqual(1);
  });

  it.each(SIGNATURES)('keeps every reason within the limit for %s', (_label, input) => {
    const { top, runnersUp } = recommend(input);

    for (const recommendation of [top!, ...runnersUp]) {
      expect(recommendation.reason.length).toBeLessThanOrEqual(MAX_REASON_LENGTH);
      expect(recommendation.reason.trim()).not.toBe('');
    }
  });

  it('offers runners-up that differ from the winner, not the same chart again', () => {
    const { top, runnersUp } = recommend(signature(measure(), dimension(4)));

    const types = [top!.candidate.chartType, ...runnersUp.map((r) => r.candidate.chartType)];
    expect(new Set(types).size).toBe(types.length);
  });

  it('recommends nothing when there are no fields, rather than inventing a chart', () => {
    expect(recommend(signature()).top).toBeNull();
  });
});

describe('the recommendation follows the signature (AC-028)', () => {
  it('shows a single number as a KPI', () => {
    expect(recommend(signature(measure())).top?.candidate.chartType).toBe('kpi');
  });

  it('shows a measure over time as a line, not a bar', () => {
    expect(recommend(signature(measure(), time())).top?.candidate.chartType).toBe('line');
  });

  it('shows a measure by a small category as a bar', () => {
    expect(recommend(signature(measure(), dimension(4))).top?.candidate.chartType).toBe('bar');
  });

  it('prefers a horizontal bar once there are too many categories to read across', () => {
    const top = recommend(signature(measure(), dimension(60))).top;
    expect(top?.candidate.chartType).toBe('hbar');
  });

  it('uses cardinality, not just the kinds of field', () => {
    const small = recommend(signature(measure(), dimension(4))).top?.candidate.chartType;
    const large = recommend(signature(measure(), dimension(60))).top?.candidate.chartType;
    expect(small).not.toBe(large);
  });

  /**
   * T398, AC-305: a country map is offered — as a runner-up, since a bar
   * reads values more exactly — for a measure by a dimension of ISO-3 codes,
   * and for nothing else.
   */
  it('offers a country map for a measure by country codes, and only then', () => {
    const countries: Field = { ...dimension(20, 'customers.country_iso3'), countryCodes: true };
    const byCountry = recommend(signature(measure(), countries));
    expect(byCountry.top?.candidate.chartType).toBe('bar');
    expect(byCountry.runnersUp.map((each) => each.candidate.chartType)).toContain('map');

    const byStatus = recommend(signature(measure(), dimension(20)));
    expect(
      [byStatus.top, ...byStatus.runnersUp].map((each) => each?.candidate.chartType),
    ).not.toContain('map');
    expect(
      enumerate(signature(measure(), dimension(20))).map((each) => each.chartType),
    ).not.toContain('map');
  });

  /**
   * T516 (AC-036, AC-187; UX-117's second half; R67, the user: "promote the
   * horizontal bar to second when more than half the labels would be hidden
   * at the tile's width, including two-field and map cases; leave today's
   * order when they fit"). `hiddenLabels` is the share a vertical bar would
   * hide there, which the caller reckons (`hiddenLabelShare`).
   */
  describe('the horizontal bar as runner-up where most labels would be hidden (T516)', () => {
    const second = (input: Signature) => recommend(input).runnersUp[0]?.candidate.chartType;
    // Ten long names by four: a grouped or stacked bar second today.
    const twoFields = signature(measure(), dimension(10), dimension(4, 'b'));
    // Ten countries: the map second today, ahead of the horizontal bar
    // (T516's review: at 20 the horizontal bar was second already).
    const countries: Field = { ...dimension(10, 'customers.country_iso3'), countryCodes: true };
    const byCountry = signature(measure(), countries);

    it('promotes it to second, by two fields or by country, when more than half would hide', () => {
      expect(second(twoFields)).not.toBe('hbar');
      expect(second({ ...twoFields, hiddenLabels: 0.6 })).toBe('hbar');
      expect(second(byCountry)).toBe('map');
      expect(second({ ...byCountry, hiddenLabels: 0.6 })).toBe('hbar');
    });

    it('leaves today’s order where the labels fit, or no more than half hide', () => {
      expect(second(twoFields)).not.toBe('hbar');
      expect(second({ ...twoFields, hiddenLabels: 0 })).toBe(second(twoFields));
      expect(second({ ...twoFields, hiddenLabels: 0.5 })).toBe(second(twoFields));
      expect(second({ ...byCountry, hiddenLabels: 0.2 })).toBe(second(byCountry));
    });

    it('keeps it top where it ranks top already', () => {
      const huge = signature(measure(), dimension(60));
      expect(recommend({ ...huge, hiddenLabels: 0.9 }).top?.candidate.chartType).toBe(
        recommend(huge).top?.candidate.chartType,
      );
    });
  });

  it('shows two measures against each other as a scatter', () => {
    const types = [
      recommend(signature(measure(), measure('m2'))).top?.candidate.chartType,
      ...recommend(signature(measure(), measure('m2'))).runnersUp.map((r) => r.candidate.chartType),
    ];
    expect(types).toContain('scatter');
  });
});

describe('nothing offered breaks a hard rule (AC-030, AC-031)', () => {
  it.each(SIGNATURES)('every candidate offered for %s is legal', (_label, input) => {
    const { top, runnersUp } = recommend(input);

    for (const recommendation of [top, ...runnersUp].filter(Boolean)) {
      expect(isLegal(recommendation!.candidate)).toBe(true);
    }
  });

  it.each(SIGNATURES)('nothing offered for %s uses two value axes (AC-030)', (_label, input) => {
    const { top, runnersUp } = recommend(input);

    for (const recommendation of [top, ...runnersUp].filter(Boolean)) {
      expect(recommendation!.candidate.valueAxisCount).toBeLessThanOrEqual(1);
    }
  });

  it('never offers a pie once there are too many slices (AC-031)', () => {
    const { top, runnersUp } = recommend(signature(measure(), dimension(40)));
    const types = [top!.candidate.chartType, ...runnersUp.map((r) => r.candidate.chartType)];

    expect(types).not.toContain('pie');
  });

  // T230's review: split by a second dimension a pie draws a slice per row
  // (AC-221) — three statuses by 240 orders is 240 slices, not three.
  it('never offers a pie whose second dimension makes too many slices (AC-031)', () => {
    const { top, runnersUp } = recommend({
      ...signature(measure(), dimension(3), dimension(240, 'b')),
      rowCount: 240,
    });
    const types = [top!.candidate.chartType, ...runnersUp.map((r) => r.candidate.chartType)];

    expect(types).not.toContain('pie');
  });

  /**
   * T305, the Superset-parity rebuild's gap 11: bars over time coloured by 21
   * countries were offered. `compile` colours a chart over time by the first
   * dimension, and one by category by the second, so the candidates drawn
   * that way carry it as their colour, and its cap applies.
   */
  it('never offers a chart over time coloured by more than 8 members (AC-031)', () => {
    const { top, runnersUp } = recommend(
      signature(measure(), time(), dimension(21, 'customers.country')),
    );
    const offered = [top!, ...runnersUp].map((r) => r.candidate);

    for (const type of ['bar', 'line', 'multiLine', 'area'])
      expect(offered.map((candidate) => candidate.chartType)).not.toContain(type);
  });

  it('offers a line over time coloured by a small dimension, and says so', () => {
    const { top, runnersUp } = recommend(signature(measure(), time(), dimension(5)));
    const line = [top!, ...runnersUp].find((r) => r.candidate.chartType === 'line');

    expect(line?.candidate.colorField?.name).toBe('orders.status');
  });

  it('never offers a bar by category coloured by more than 8 members of the second (AC-031)', () => {
    const { top, runnersUp } = recommend(
      signature(measure(), dimension(4), dimension(21, 'customers.country')),
    );
    const offered = [top!, ...runnersUp].map((r) => r.candidate.chartType);

    expect(offered).not.toContain('bar');
    expect(offered).not.toContain('hbar');
  });

  it('never offers a heatmap once there are too many cells (AC-031)', () => {
    const { top, runnersUp } = recommend(signature(measure(), dimension(30), dimension(30, 'b')));
    const types = [top!.candidate.chartType, ...runnersUp.map((r) => r.candidate.chartType)];

    expect(types).not.toContain('heatmap');
  });

  it('treats unknown cardinality as too large rather than assuming it is small', () => {
    // The optimistic guess is the one that misleads, so a pie is not offered
    // for a category whose size nobody knows.
    const offered = enumerate(signature(measure(), { name: 'd', kind: 'dimension' })).filter(
      isLegal,
    );
    expect(offered.map((candidate) => candidate.chartType)).not.toContain('pie');
  });
});
