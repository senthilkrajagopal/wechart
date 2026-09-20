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
