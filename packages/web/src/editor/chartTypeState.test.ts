import { describe, expect, it } from 'vitest';

import {
  FOLLOWING_RECOMMENDATION,
  afterFieldChange,
  backToRecommended,
  chooseType,
  effectiveType,
  isManual,
} from './chartTypeState';

/**
 * AC-032: WHEN the user picks a chart type manually, THE SYSTEM SHALL keep that
 * type through later field changes until the user chooses "Back to
 * recommended".
 * Fails when: the type reverts to the recommendation after a field change.
 *
 * The failing condition is about what happens *after* a field change, so that
 * is what most of these exercise — including several changes in a row, since
 * an implementation that survives one might not survive the next.
 */
describe('following the recommendation', () => {
  it('starts out following it', () => {
    expect(isManual(FOLLOWING_RECOMMENDATION)).toBe(false);
    expect(effectiveType(FOLLOWING_RECOMMENDATION, 'bar')).toBe('bar');
  });

  it('follows a changed recommendation while no choice has been made', () => {
    const state = afterFieldChange(FOLLOWING_RECOMMENDATION);
    expect(effectiveType(state, 'line')).toBe('line');
  });

  it('has no type when nothing is recommended yet', () => {
    expect(effectiveType(FOLLOWING_RECOMMENDATION, null)).toBeNull();
  });
});

describe('a manual choice (AC-032)', () => {
  it('takes effect immediately', () => {
    const state = chooseType('pie');
    expect(effectiveType(state, 'bar')).toBe('pie');
    expect(isManual(state)).toBe(true);
  });

  it('survives a field change', () => {
    const state = afterFieldChange(chooseType('pie'));
    // The recommendation has moved on; the chart has not.
    expect(effectiveType(state, 'line')).toBe('pie');
  });

  it('survives several field changes in a row', () => {
    let state = chooseType('treemap');
    for (const recommended of ['bar', 'line', 'scatter', 'kpi'] as const) {
      state = afterFieldChange(state);
      expect(effectiveType(state, recommended)).toBe('treemap');
    }
  });

  it('is replaced by another manual choice', () => {
    const state = chooseType('scatter');
    expect(effectiveType(chooseType('heatmap'), 'bar')).toBe('heatmap');
    expect(effectiveType(state, 'bar')).toBe('scatter');
  });

  it('ends only when the user asks for the recommendation back', () => {
    const state = backToRecommended();

    expect(isManual(state)).toBe(false);
    expect(effectiveType(state, 'line')).toBe('line');
  });

  it('follows the recommendation again once it has been given back', () => {
    let state = backToRecommended();
    state = afterFieldChange(state);

    expect(effectiveType(state, 'scatter')).toBe('scatter');
  });
});
