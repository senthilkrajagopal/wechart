import { describe, expect, it } from 'vitest';

import { outcomeOf } from './awayRun';
import { runState } from './runState';

/**
 * T804 (AC-452): a run that ended while the user was away reads as its
 * History row says, and a stopped one Cube Store still finishes says so.
 */
const row = {
  sql: 'SELECT 1',
  startedAt: '2026-10-17T14:40:02Z',
  outcome: 'timeout',
  rowCount: null,
  durationMs: 30_000,
  truncated: null,
  statement: 'select',
};
const done = (outcome: ReturnType<typeof outcomeOf>) =>
  runState({ kind: 'done', outcome, sql: 'SELECT 1', at: 0 }, 0, true).label;

describe('a run ended while away, as History has it (T804, AC-452)', () => {
  it('reads each History outcome in the run’s own labels', () => {
    expect(done(outcomeOf({ ...row, outcome: 'finished', rowCount: 3, truncated: 'rows' }, null))).toBe(
      'Limited to 10,000 rows',
    );
    expect(done(outcomeOf(row, null))).toBe('Stopped at 30 seconds');
    expect(done(outcomeOf({ ...row, outcome: 'cancelled' }, null))).toBe('Cancelled');
    expect(done(outcomeOf({ ...row, outcome: 'failed' }, null))).toBe('Database error');
    expect(done(outcomeOf({ ...row, outcome: 'lost' }, null))).toBe('No answer');
  });

  it('says Cube Store still finishing a stopped run where xcube says it runs on', () => {
    const finishing = { endsBy: '2026-10-17T14:41:20Z' };
    expect(outcomeOf(row, finishing)).toMatchObject({ stillRunning: true, endsBy: finishing.endsBy });
    expect(done(outcomeOf(row, finishing))).toBe('Cube Store still finishing');
    expect(done(outcomeOf({ ...row, outcome: 'cancelled' }, finishing))).toBe('Cube Store still finishing');
    // A run that finished isn't still finishing, whatever else goes on.
    expect(done(outcomeOf({ ...row, outcome: 'finished', rowCount: 1 }, finishing))).toBe('Finished');
  });
});
