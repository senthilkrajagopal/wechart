import { describe, expect, it } from 'vitest';

import { canRedo, canUndo, discard, historyOf, isDirty, push, redo, undo } from './history';

/**
 * AC-035: WHEN the user changes the chart in the editor, THE SYSTEM SHALL
 * support undo and redo of every change made since the editor opened, and a
 * "Discard changes" that restores the chart as it was.
 * Fails when: any change cannot be undone, or Discard leaves a change applied.
 *
 * "Every change" and "as it was" are both absolute, so these walk a long
 * sequence back to the start rather than testing one step.
 */
const start = { name: 'start' };

describe('undo and redo (AC-035)', () => {
  it('has nothing to undo when the editor opens', () => {
    const history = historyOf(start);

    expect(canUndo(history)).toBe(false);
    expect(canRedo(history)).toBe(false);
    expect(isDirty(history)).toBe(false);
  });

  it('undoes a single change', () => {
    const history = push(historyOf(start), { name: 'one' });

    expect(undo(history).present).toBe(start);
  });

  it('undoes every change, all the way back to the start', () => {
    let history = historyOf(start);
    const states = [{ name: 'a' }, { name: 'b' }, { name: 'c' }, { name: 'd' }, { name: 'e' }];
    for (const state of states) history = push(history, state);

    for (const state of [...states].reverse()) {
      expect(history.present).toBe(state);
      history = undo(history);
    }

    expect(history.present).toBe(start);
    expect(canUndo(history)).toBe(false);
  });

  it('redoes what was undone', () => {
    const history = push(historyOf(start), { name: 'one' });
    const back = undo(history);

    expect(canRedo(back)).toBe(true);
    expect(redo(back).present).toEqual({ name: 'one' });
  });

  it('redoes a whole sequence forward again', () => {
    let history = historyOf(start);
    for (const state of [{ name: 'a' }, { name: 'b' }, { name: 'c' }]) {
      history = push(history, state);
    }
    for (let i = 0; i < 3; i += 1) history = undo(history);
    expect(history.present).toBe(start);

    for (let i = 0; i < 3; i += 1) history = redo(history);
    expect(history.present).toEqual({ name: 'c' });
  });

  it('drops the redo branch once a new change is made', () => {
    let history = push(historyOf(start), { name: 'one' });
    history = undo(history);
    history = push(history, { name: 'other' });

    // The abandoned branch is not somewhere the user can step forward into.
    expect(canRedo(history)).toBe(false);
  });

  it('ignores a change that changed nothing', () => {
    const history = historyOf(start);
    expect(push(history, start)).toBe(history);
  });

  it('does nothing when there is nothing to undo or redo', () => {
    const history = historyOf(start);
    expect(undo(history)).toBe(history);
    expect(redo(history)).toBe(history);
  });
});

describe('discard (AC-035)', () => {
  it('restores the state the editor opened with', () => {
    let history = historyOf(start);
    for (const state of [{ name: 'a' }, { name: 'b' }, { name: 'c' }]) {
      history = push(history, state);
    }

    expect(discard(history).present).toBe(start);
    expect(isDirty(discard(history))).toBe(false);
  });

  it('leaves no change applied, however many there were', () => {
    let history = historyOf(start);
    for (let i = 0; i < 20; i += 1) history = push(history, { name: `step ${String(i)}` });

    expect(discard(history).present).toBe(start);
  });

  it('is itself undoable, so discarding by mistake is recoverable', () => {
    const history = push(historyOf(start), { name: 'one' });
    const discarded = discard(history);

    expect(canUndo(discarded)).toBe(true);
    expect(undo(discarded).present).toEqual({ name: 'one' });
  });

  it('does nothing when there is nothing to discard', () => {
    const history = historyOf(start);
    expect(discard(history)).toBe(history);
  });
});
