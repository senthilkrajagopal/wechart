import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  REFUSED_ROLLUP_ONLY,
  RollupOnlyWarning,
  refusedInRollupOnly,
  rollupOnlyKnown,
} from './RollupOnlyWarning';

/**
 * AC-147 as amended by R76 (chart-editor-Q4; T690): WHERE wechart knows that
 * Cube runs in rollup-only mode, the chart shows that as a warning banner.
 * wechart knows it where xcube's revision route says `rollupOnly: true`
 * (`GET /api/rollup-only`), or — where it can't say (null) — once a query has
 * failed with Cube's "No pre-aggregation table has been built for this query
 * yet", which Cube 1.7.45 throws only in that mode (research
 * `cube/rollup-only-mode.md`, `xcube-407622a6b8.md`).
 */
describe('whether rollup-only mode is known on (T690, AC-147)', () => {
  const refused = new Error(
    `Cube answered 400: ${REFUSED_ROLLUP_ONLY} Please check your refresh worker configuration if it persists.`,
  );
  const otherRefusal = new Error(
    'Cube answered 400: No pre-aggregation partitions were built yet for the pre-aggregation serving this query.',
  );

  it('is known on where xcube says so', () => {
    expect(rollupOnlyKnown(true, null)).toBe(true);
  });

  it('is not where xcube says it is off, whatever a query failed with', () => {
    expect(rollupOnlyKnown(false, null)).toBe(false);
    expect(rollupOnlyKnown(false, refused)).toBe(false);
  });

  it('falls back on Cube’s refusal where xcube can’t say, and only on that text', () => {
    expect(rollupOnlyKnown(null, refused)).toBe(true);
    expect(rollupOnlyKnown(undefined, refused)).toBe(true);
    expect(rollupOnlyKnown(null, otherRefusal)).toBe(false);
    expect(rollupOnlyKnown(null, null)).toBe(false);
  });
});

/**
 * T690's review: a failed query carries the banner only where Cube refused it
 * for rollup-only mode, its own words, and the mode isn't known off — never
 * for any other failure (a refusal of access, a compile error, a matched
 * rollup not built yet), which "no pre-aggregation serves" would misstate.
 */
describe('whether a failed query was refused for rollup-only mode (T690’s review)', () => {
  const refused = new Error(
    `${REFUSED_ROLLUP_ONLY}. Please check your refresh worker configuration if it persists.`,
  );
  const notBuilt = new Error(
    'No pre-aggregation partitions were built yet for the pre-aggregation serving this query.',
  );

  it('was, on Cube’s own words, where xcube says on or can’t say', () => {
    expect(refusedInRollupOnly(true, refused)).toBe(true);
    expect(refusedInRollupOnly(null, refused)).toBe(true);
  });

  it('wasn’t, for any other failure, even with the mode known on', () => {
    expect(refusedInRollupOnly(true, notBuilt)).toBe(false);
    expect(refusedInRollupOnly(true, new Error('You can’t open this folder.'))).toBe(false);
    expect(refusedInRollupOnly(null, notBuilt)).toBe(false);
  });

  it('wasn’t where xcube says the mode is off', () => {
    expect(refusedInRollupOnly(false, refused)).toBe(false);
  });
});

describe('the banner (T690, AC-147)', () => {
  it('warns, with its icon, that Cube runs rollup-only and refuses what no pre-aggregation serves', () => {
    render(<RollupOnlyWarning />);
    const banner = screen.getByTestId('rollup-only-warning');
    expect(banner.getAttribute('role')).toBe('status');
    expect(banner.querySelector('[data-icon]')?.getAttribute('data-icon')).toBe('warning');
    expect(banner.textContent).toBe(
      'Cube runs in rollup-only mode: it refuses this chart, which no pre-aggregation serves.',
    );
  });
});
