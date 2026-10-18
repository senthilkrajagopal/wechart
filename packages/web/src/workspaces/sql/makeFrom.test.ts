import { describe, expect, it } from 'vitest';

import type { SqlOutcome } from '../data-sources/SqlResult';
import { makeFrom } from './makeFrom';

/**
 * AC-461: WHEN a run of a SELECT on a data source ends Finished or Limited,
 * THE SYSTEM SHALL offer Make a cube… and Make a chart… to someone who may
 * make a model (AC-350); elsewhere it SHALL show them disabled with the
 * reason.
 * Fails when: either is enabled on an EXPLAIN, on Cube Store, on a stopped or
 * cancelled run, or with repeated column names; or one is disabled without
 * its reason.
 */
const columns = [
  { name: 'customer', type: 'text' },
  { name: 'total', type: 'numeric' },
];
const finished = (over: Partial<Extract<SqlOutcome, { outcome: 'finished' }>> = {}): SqlOutcome => ({
  outcome: 'finished',
  columns,
  rows: [['Ann', '12.50']],
  rowCount: 1,
  truncated: null,
  durationMs: 40,
  statement: 'select',
  ...over,
});

describe('makeFrom (T819, AC-461)', () => {
  it('offers both on a Finished SELECT on a data source, to someone who may make a model', () => {
    expect(makeFrom({ outcome: finished(), onCubeStore: false, mayModel: true })).toEqual({
      enabled: true,
    });
  });

  it('offers both on a Limited SELECT, by rows or by size', () => {
    for (const truncated of ['rows', 'bytes'] as const)
      expect(
        makeFrom({ outcome: finished({ truncated }), onCubeStore: false, mayModel: true }),
      ).toEqual({ enabled: true });
  });

  it('offers both on a SELECT that returned no rows: its columns are known', () => {
    expect(
      makeFrom({
        outcome: finished({ rows: [], rowCount: 0 }),
        onCubeStore: false,
        mayModel: true,
      }),
    ).toEqual({ enabled: true });
  });

  it('shows neither to someone who may not make a model', () => {
    expect(makeFrom({ outcome: finished(), onCubeStore: false, mayModel: false })).toBeNull();
  });

  it('disables both on an EXPLAIN, saying it isn’t data to model', () => {
    expect(
      makeFrom({
        outcome: finished({ statement: 'explain', columns: [{ name: 'QUERY PLAN', type: 'text' }] }),
        onCubeStore: false,
        mayModel: true,
      }),
    ).toEqual({ enabled: false, reason: 'An EXPLAIN’s plan isn’t data to model.' });
  });

  it('disables both on Cube Store, which holds rollups Cube builds', () => {
    expect(makeFrom({ outcome: finished(), onCubeStore: true, mayModel: true })).toEqual({
      enabled: false,
      reason: 'Cube Store holds rollups Cube builds; model the source instead.',
    });
  });

  it('disables both on a stopped or cancelled run, rows read or not', () => {
    const stopped: SqlOutcome[] = [
      { outcome: 'timeout', durationMs: 30000, columns, rows: [['Ann', '1']], rowCount: 1, truncated: 'stopped' },
      { outcome: 'cancelled', durationMs: 900, columns, rows: [['Ann', '1']], rowCount: 1, truncated: 'stopped' },
      { outcome: 'timeout', durationMs: 30000 },
      { outcome: 'cancelled', durationMs: null },
    ];
    for (const outcome of stopped)
      expect(makeFrom({ outcome, onCubeStore: false, mayModel: true })).toEqual({
        enabled: false,
        reason: 'Run it to the end first.',
      });
  });

  it('disables both where two columns share a name, naming it', () => {
    expect(
      makeFrom({
        outcome: finished({
          columns: [
            { name: 'a', type: 'int4' },
            { name: 'b', type: 'text' },
            { name: 'a', type: 'int4' },
          ],
          rows: [[1, 'x', 2]],
        }),
        onCubeStore: false,
        mayModel: true,
      }),
    ).toEqual({
      enabled: false,
      reason: 'Two columns are named `a`: give each its own name with AS, and run it again.',
    });
  });

  it('says Cube Store’s reason first, whatever else holds', () => {
    expect(
      makeFrom({ outcome: { outcome: 'timeout', durationMs: 30000 }, onCubeStore: true, mayModel: true }),
    ).toEqual({
      enabled: false,
      reason: 'Cube Store holds rollups Cube builds; model the source instead.',
    });
  });

  it('offers nothing for a run with no result: refused, failed or not answered', () => {
    const none: SqlOutcome[] = [
      { outcome: 'refused', error: 'Not run.', reason: 'x', statement: 'insert' },
      { outcome: 'failed', error: 'syntax error', durationMs: 3 },
      { outcome: 'busy', error: 'busy' },
      { outcome: 'unavailable', error: 'away' },
    ];
    for (const outcome of none)
      expect(makeFrom({ outcome, onCubeStore: false, mayModel: true })).toBeNull();
  });
});
