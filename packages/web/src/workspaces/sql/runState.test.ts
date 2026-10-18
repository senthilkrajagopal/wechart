import { describe, expect, it } from 'vitest';

import { runState } from './runState';
import type { TabRun } from './tabs';

/**
 * T804 (AC-452): WHILE a user has a run going, THE SYSTEM SHALL show its
 * state the same way, as an icon and a label, on its tab, in its result head
 * and in its History row (Running · n s of 30, Finished, Limited to 10,000
 * rows, Limited to 10 MB, Stopped at 30 seconds, Cancelled, Not run,
 * Database error, Busy, or Cube Store still finishing). One function names
 * each, and the tab, the result head and History all ask it.
 */
const AT = Date.UTC(2026, 9, 17, 14, 40, 2);
const done = (outcome: object): TabRun =>
  ({ kind: 'done', sql: 'SELECT 1', at: AT, outcome }) as TabRun;
const finished = {
  outcome: 'finished',
  columns: [{ name: 'n', type: 'int4' }],
  rows: [[1]],
  rowCount: 1284,
  truncated: null,
  durationMs: 410,
  statement: 'select',
};

describe('a run’s state, one icon and one label wherever it shows (T804, AC-452)', () => {
  it('reads Running · n s of 30, counting whole seconds since it started', () => {
    const running: TabRun = { kind: 'running', at: AT };
    expect(runState(running, AT + 400)).toEqual({ kind: 'run', label: 'Running · 0 s of 30', rows: null });
    expect(runState(running, AT + 12_900)).toEqual({ kind: 'run', label: 'Running · 12 s of 30', rows: null });
    // Never past its limit, nor before its start on a clock that moved back.
    expect(runState(running, AT + 31_500).label).toBe('Running · 30 s of 30');
    expect(runState(running, AT - 2_000).label).toBe('Running · 0 s of 30');
  });

  it('maps every ending to one icon and one label', () => {
    const cases: readonly [object, string, string][] = [
      [finished, 'ok', 'Finished'],
      [{ ...finished, truncated: 'rows' }, 'warn', 'Limited to 10,000 rows'],
      [{ ...finished, truncated: 'bytes' }, 'warn', 'Limited to 10 MB'],
      [{ outcome: 'timeout', durationMs: 30_000 }, 'err', 'Stopped at 30 seconds'],
      [{ outcome: 'cancelled', durationMs: 1_200, rows: [[1]], rowCount: 1, truncated: 'stopped' }, 'cancel', 'Cancelled'],
      [{ outcome: 'refused', error: 'x', reason: 'x', statement: 'delete' }, 'err', 'Not run'],
      [{ outcome: 'going', error: 'You have a run going.' }, 'err', 'Not run'],
      [{ outcome: 'failed', error: 'x', durationMs: 12 }, 'err', 'Database error'],
      [{ outcome: 'busy', error: 'x' }, 'warn', 'Busy'],
      // No answer came, so whether it ran isn't known: not "Not run" (lane SQL's call).
      [{ outcome: 'unavailable', error: 'x' }, 'err', 'No answer'],
    ];
    for (const [outcome, kind, label] of cases)
      expect(runState(done(outcome), AT)).toMatchObject({ kind, label });
  });

  it('says a finished run’s rows apart from its label, for the tab to add', () => {
    expect(runState(done(finished), AT).rows).toBe('1,284 rows');
    expect(runState(done({ ...finished, rowCount: 1 }), AT).rows).toBe('1 row');
    expect(runState(done({ ...finished, truncated: 'rows' }), AT).rows).toBeNull();
    expect(runState(done({ outcome: 'busy', error: 'x' }), AT).rows).toBeNull();
  });

  it('reads Cube Store still finishing while a stopped run goes on there, then its stop once it has ended', () => {
    const stopped = done({ outcome: 'timeout', durationMs: 30_000, stillRunning: true, endsBy: null });
    const cancelled = done({ outcome: 'cancelled', durationMs: 900, stillRunning: true, endsBy: null });
    expect(runState(stopped, AT, true)).toEqual({ kind: 'run', label: 'Cube Store still finishing', rows: null });
    expect(runState(cancelled, AT, true)).toMatchObject({ kind: 'run', label: 'Cube Store still finishing' });
    expect(runState(stopped, AT, false)).toMatchObject({ kind: 'err', label: 'Stopped at 30 seconds' });
    expect(runState(cancelled, AT, false)).toMatchObject({ kind: 'cancel', label: 'Cancelled' });
    // A stop on a database that stopped it: never still finishing.
    expect(runState(done({ outcome: 'timeout', durationMs: 30_000 }), AT, true).label).toBe('Stopped at 30 seconds');
  });

  it('reads Not run yet before a tab’s first run', () => {
    expect(runState(null, AT)).toEqual({ kind: 'idle', label: 'Not run yet', rows: null });
  });
});
