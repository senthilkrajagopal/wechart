import { describe, expect, it } from 'vitest';

import { exportNoteOf } from './csv';

/**
 * T178 / AC-172: WHEN an export exceeds the row limit Cube returns, THE
 * SYSTEM SHALL say how many rows were exported and that the result was
 * truncated.
 * Fails when: a truncated export claims to be complete.
 *
 * Cube answers at most its row limit — 10,000 by default — and says nothing
 * of what it left out. Asked with `total: true`, it answers the query's full
 * count as a top-level `total`, past the default limit as past an explicit
 * one (research/cube/data-apis.md, "Observed locally"): more than it
 * returned is truncated.
 */
describe('what a download says of its rows', () => {
  it('says how many rows were written, and that Cube cut none short', () => {
    expect(exportNoteOf({ written: 3, returned: 3, total: 3 })).toEqual({
      truncated: false,
      text: 'Downloaded 3 rows. Nothing was cut short: Cube returned all 3 rows of the query.',
    });
  });

  it('says it was truncated, and by how much, past Cube’s row limit', () => {
    expect(exportNoteOf({ written: 10_000, returned: 10_000, total: 12_345 })).toEqual({
      truncated: true,
      text: 'Downloaded 10,000 rows. Truncated: the query has 12,345 rows, and Cube returned the first 10,000.',
    });
  });

  it('names the query’s own count when the tile folded rows into "Other"', () => {
    // Twenty categories folded to their top five and "Other": six rows written,
    // all twenty returned — not truncated, and not said as if the query had six.
    expect(exportNoteOf({ written: 6, returned: 20, total: 20 }).text).toBe(
      'Downloaded 6 rows. Nothing was cut short: Cube returned all 20 rows of the query.',
    );
  });

  it('never claims nothing was cut short when it could not tell', () => {
    for (const unknown of [
      { written: 3, returned: undefined, total: 3 },
      { written: 3, returned: 3, total: undefined },
      // Fewer in the count than returned: the data moved between the two.
      { written: 3, returned: 3, total: 2 },
    ])
      expect(exportNoteOf(unknown)).toEqual({
        truncated: undefined,
        text: 'Downloaded 3 rows. Could not tell whether Cube cut the result short.',
      });
  });

  it('writes one row as one', () => {
    expect(exportNoteOf({ written: 1, returned: 1, total: 1 }).text).toBe(
      'Downloaded 1 row. Nothing was cut short: Cube returned all 1 row of the query.',
    );
  });
});
