import { describe, expect, it } from 'vitest';

import { MARKED_OUTLINE_PX, UNMARKED_OPACITY } from './render';
import { isAdditive, partialMark } from './partial';

/**
 * T103 / AC-097: WHEN an item is partly marked and its measure is additive,
 * THE SYSTEM SHALL draw the marked share from the baseline at full strength
 * and fade the remainder; WHEN the measure is not additive, THE SYSTEM SHALL
 * draw the whole item with a pattern and show the marked and total values in
 * its tooltip.
 * `Fails when: a partial average or distinct count is drawn as a sub-length,
 * or a partly marked sum shows no marked share.`
 *
 * This is the criterion where drawing the obvious thing is *wrong*. Splitting
 * a bar in proportion looks right for every measure and is only true when the
 * measure sums across rows: half the rows of an average do not make half the
 * average, and the distinct customers in a subset are not a fraction of the
 * distinct customers overall — they overlap. A sub-length there would be a
 * confident, readable, precisely drawn lie.
 *
 * direction.md names the split: additive is Cube's `sum` and `count`; avg,
 * count distinct and ratios are not.
 */
const colours = { own: '#2a78d6', marking: '#151107' };

describe('which measures can be drawn as a share', () => {
  it('counts sum and count as additive', () => {
    expect(isAdditive('sum')).toBe(true);
    expect(isAdditive('count')).toBe(true);
  });

  it('does not count an average', () => {
    expect(isAdditive('avg')).toBe(false);
  });

  it('does not count a distinct count, however Cube describes it', () => {
    /**
     * `docs/research/cube/data-modeling.md` calls `count_distinct_approx`
     * "additive and rollup-friendly" — true of *merging sketches across
     * rollups*, and false of what matters here. The distinct customers in a
     * marked subset are not a share of the distinct customers overall,
     * because they overlap. Two meanings of one word, and taking the
     * research's meaning would draw exactly the lie this criterion forbids.
     */
    expect(isAdditive('countDistinct')).toBe(false);
    expect(isAdditive('countDistinctApprox')).toBe(false);
  });

  it('does not count min, max or a calculated number', () => {
    // A marked subset's minimum is not a portion of the whole's minimum, and
    // a ratio over a subset is not a slice of the ratio.
    expect(isAdditive('min')).toBe(false);
    expect(isAdditive('max')).toBe(false);
    expect(isAdditive('number')).toBe(false);
  });

  it('does not count a measure whose type is unknown', () => {
    // The safe default: a sub-length is a claim, and drawing one for a measure
    // nothing is known about would assert something unchecked.
    expect(isAdditive(undefined)).toBe(false);
    expect(isAdditive('somethingNew')).toBe(false);
  });
});

describe('an item that is partly marked', () => {
  describe('with an additive measure', () => {
    const drawn = partialMark({ marked: 30, total: 100, aggType: 'sum' }, colours);

    it('draws the marked share from the baseline', () => {
      expect(drawn.kind).toBe('share');
      expect(drawn.kind === 'share' && drawn.marked).toBe(30);
      expect(drawn.kind === 'share' && drawn.remainder).toBe(70);
    });

    it('draws the share at full strength and the remainder faded', () => {
      expect(drawn.kind === 'share' && drawn.markedStyle.opacity).toBe(1);
      expect(drawn.kind === 'share' && drawn.remainderStyle.opacity).toBe(UNMARKED_OPACITY);
    });

    it('outlines the marked share so it says which marking it belongs to', () => {
      expect(drawn.kind === 'share' && drawn.markedStyle.borderColor).toBe('#151107');
      expect(drawn.kind === 'share' && drawn.markedStyle.borderWidth).toBe(MARKED_OUTLINE_PX);
    });

    it('keeps both parts in the series colour', () => {
      expect(drawn.kind === 'share' && drawn.markedStyle.color).toBe('#2a78d6');
      expect(drawn.kind === 'share' && drawn.remainderStyle.color).toBe('#2a78d6');
    });
  });

  describe('with a non-additive measure', () => {
    const drawn = partialMark({ marked: 12, total: 40, aggType: 'avg' }, colours);

    it('never draws a sub-length', () => {
      // The criterion's first failing state, stated directly.
      expect(drawn.kind).toBe('pattern');
      expect(drawn).not.toHaveProperty('marked');
    });

    it('keeps the whole item at full colour with a pattern', () => {
      expect(drawn.kind === 'pattern' && drawn.style.opacity).toBe(1);
      expect(drawn.kind === 'pattern' && drawn.style.decal).toBeDefined();
    });

    it('says the marked and total values in the tooltip instead', () => {
      // The information a sub-length would have conveyed, given exactly rather
      // than drawn approximately.
      expect(drawn.kind === 'pattern' && drawn.tooltip).toBe('Marked: 12 of 40');
    });
  });
});

describe('an item that is not partly marked', () => {
  it('is whole when all of it is marked, whatever the measure', () => {
    // Fully marked is not partial: there is nothing to split and no pattern to
    // draw, and an average marked in full is simply marked.
    expect(partialMark({ marked: 40, total: 40, aggType: 'avg' }, colours).kind).toBe('whole');
    expect(partialMark({ marked: 40, total: 40, aggType: 'sum' }, colours).kind).toBe('whole');
  });

  it('is nothing when none of it is marked', () => {
    expect(partialMark({ marked: 0, total: 40, aggType: 'sum' }, colours).kind).toBe('none');
  });

  it('treats a zero total as nothing marked rather than dividing by it', () => {
    // A measure can sum to zero, and "0 of 0" is not partly marked.
    expect(partialMark({ marked: 0, total: 0, aggType: 'sum' }, colours).kind).toBe('none');
  });
});
