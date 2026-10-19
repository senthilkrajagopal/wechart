import { describe, expect, it } from 'vitest';

import { explain } from './explain';
import { recommend } from './recommend';
import type { Field, Signature } from './types';

/**
 * AC-029: WHEN the user opens "Why this chart?", THE SYSTEM SHALL show the
 * field signature, the cardinality of each field, and every hard rule with its
 * pass or fail result.
 * Fails when: a rule that rejected a candidate is absent from the trace.
 *
 * That failing condition is about *rejected* candidates, so the tests below
 * care most about those: a trace listing only the winner would answer "what did
 * you pick" and not "why not the one I expected".
 */
const measure = (name = 'orders.count'): Field => ({ name, kind: 'measure' });
const dimension = (cardinality: number | undefined, name = 'orders.status'): Field => ({
  name,
  kind: 'dimension',
  ...(cardinality === undefined ? {} : { cardinality }),
});

const signature = (...fields: Field[]): Signature => ({ fields });

describe('the field signature (AC-029)', () => {
  it('lists every field with its kind', () => {
    const trace = explain(signature(measure(), dimension(4)));

    expect(trace.signature).toEqual([
      { name: 'orders.count', kind: 'measure', cardinality: null },
      { name: 'orders.status', kind: 'dimension', cardinality: 4 },
    ]);
  });

  it('reports an unknown cardinality as unknown rather than guessing a number', () => {
    const trace = explain(signature(dimension(undefined)));
    expect(trace.signature[0]?.cardinality).toBeNull();
  });
});

describe('the rules (AC-029)', () => {
  it('shows every rule for every candidate, passed and failed alike', () => {
    const trace = explain(signature(measure(), dimension(4)));

    for (const candidate of trace.candidates) {
      expect(candidate.rules.length).toBeGreaterThan(3);
      expect(candidate.rules.every((rule) => typeof rule.passed === 'boolean')).toBe(true);
    }
  });

  it('includes the candidates that were rejected, not only the ones offered', () => {
    // 40 categories is past the pie cap, so a pie is enumerated and rejected.
    const trace = explain(signature(measure(), dimension(40)));

    const pie = trace.candidates.find((candidate) => candidate.chartType === 'pie');
    expect(pie).toBeDefined();
    expect(pie?.legal).toBe(false);
  });

  it('names the rule that rejected a candidate, with its reason', () => {
    const trace = explain(signature(measure(), dimension(40)));
    const pie = trace.candidates.find((candidate) => candidate.chartType === 'pie')!;

    const rejection = pie.rules.find((rule) => !rule.passed);
    expect(rejection?.rule).toBe('pie_slice_capacity');
    expect(rejection?.reason).toContain('40');
  });

  it('carries no rule that rejected a candidate without appearing in its trace', () => {
    const trace = explain(signature(measure(), dimension(30), dimension(30, 'b')));

    for (const candidate of trace.candidates.filter((c) => !c.legal)) {
      // Every illegal candidate must say which rule made it illegal.
      expect(candidate.rules.some((rule) => !rule.passed)).toBe(true);
    }
  });

  it('scores the legal candidates and leaves the rejected ones unscored', () => {
    const trace = explain(signature(measure(), dimension(40)));

    for (const candidate of trace.candidates) {
      if (candidate.legal) expect(typeof candidate.score).toBe('number');
      else expect(candidate.score).toBeNull();
    }
  });
});

describe('the trace agrees with the recommendation', () => {
  it('puts the recommended chart first', () => {
    const input = signature(measure(), dimension(4));

    expect(explain(input).candidates[0]?.chartType).toBe(recommend(input).top?.candidate.chartType);
  });

  it('marks every chart the recommender offered as legal in the trace', () => {
    const input = signature(measure(), dimension(4));
    const { top, runnersUp } = recommend(input);
    const trace = explain(input);

    for (const offered of [top!, ...runnersUp]) {
      const traced = trace.candidates.find(
        (candidate) => candidate.chartType === offered.candidate.chartType,
      );
      expect(traced?.legal).toBe(true);
    }
  });
});

/**
 * T865 (AC-510; design 20 state L): a combo whose author drew a second value
 * axis leaves the recommendation as it is, and the trace's one-value-axis
 * rule says so.
 */
describe('a second axis the author drew (AC-510)', () => {
  // Time × Revenue ($) and Margin % (%): two measures on different scales.
  const input: Signature = {
    fields: [
      { name: 'orders.month', kind: 'timeDimension', cardinality: 12 },
      { name: 'orders.revenue', kind: 'measure', scale: 'currency USD' },
      { name: 'orders.margin_pct', kind: 'measure', scale: 'percent' },
    ],
  };

  it('ranks the same candidates the same way, with or without it', () => {
    const plain = explain(input);
    const byHand = explain(input, { secondAxisByHand: true });

    expect(byHand.candidates).toEqual(plain.candidates);
    expect(byHand.signature).toEqual(plain.signature);
  });

  it('says on the one-value-axis rule that the author drew it, and never otherwise', () => {
    expect(explain(input, { secondAxisByHand: true }).oneValueAxis).toBe(
      'You drew a second axis by hand; the recommender never does',
    );
    expect(explain(input).oneValueAxis).toBeUndefined();
  });

  it('still never recommends a second axis itself (AC-030)', () => {
    const trace = explain(input, { secondAxisByHand: true });
    const { top, runnersUp } = recommend(input);

    expect(top?.candidate.valueAxisCount).toBe(1);
    expect(runnersUp.every((one) => one.candidate.valueAxisCount === 1)).toBe(true);
    // The top of the trace is the recommendation, as it is without the axis.
    expect(trace.candidates[0]?.chartType).toBe(top?.candidate.chartType);
  });
});
