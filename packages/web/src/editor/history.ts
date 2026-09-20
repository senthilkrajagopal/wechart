/**
 * Undo, redo and discard for the chart editor (AC-035).
 *
 * "Every change made since the editor opened" is the criterion, so the history
 * keeps the state the editor opened with and every state since — not a log of
 * actions. Storing states rather than inverse operations means a new kind of
 * change is undoable the day it is added, with nothing to remember to write.
 */
export interface History<T> {
  /** What the editor opened with. Discard returns here. */
  readonly initial: T;
  readonly past: readonly T[];
  readonly present: T;
  readonly future: readonly T[];
}

export function historyOf<T>(initial: T): History<T> {
  return { initial, past: [], present: initial, future: [] };
}

/**
 * Record a change. A new change clears the redo stack: once you have gone back
 * and done something else, the branch you abandoned is not somewhere the user
 * can still step forward into.
 */
export function push<T>(history: History<T>, next: T): History<T> {
  if (Object.is(next, history.present)) return history;
  return {
    initial: history.initial,
    past: [...history.past, history.present],
    present: next,
    future: [],
  };
}

export function canUndo<T>(history: History<T>): boolean {
  return history.past.length > 0;
}

export function canRedo<T>(history: History<T>): boolean {
  return history.future.length > 0;
}

export function undo<T>(history: History<T>): History<T> {
  const previous = history.past.at(-1);
  if (previous === undefined) return history;

  return {
    initial: history.initial,
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
  };
}

export function redo<T>(history: History<T>): History<T> {
  const [next, ...rest] = history.future;
  if (next === undefined) return history;

  return {
    initial: history.initial,
    past: [...history.past, history.present],
    present: next,
    future: rest,
  };
}

/**
 * Back to what the editor opened with.
 *
 * Discard is itself undoable: it lands on the initial state with everything
 * before it still in the past, so someone who discards by mistake is not left
 * with no way back. The criterion asks that Discard restores the original, not
 * that it destroys the history.
 */
export function discard<T>(history: History<T>): History<T> {
  if (Object.is(history.present, history.initial)) return history;

  return {
    initial: history.initial,
    past: [...history.past, history.present],
    present: history.initial,
    future: [],
  };
}

export function isDirty<T>(history: History<T>): boolean {
  return !Object.is(history.present, history.initial);
}
