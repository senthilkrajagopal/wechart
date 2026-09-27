import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { DRIVER_TYPES } from '@wechart/core';

import { CLEARED_LOGOS, DriverMark } from './driverMarks';

/**
 * T472 / AC-338: THE SYSTEM SHALL mark each driver type in the new data
 * source wizard with its vendor's logo, where the vendor's licence terms
 * allow wechart to show it, and otherwise with a monogram of its name.
 * `Fails when: a driver's type tile shows neither a logo nor a monogram, or
 * shows a logo whose licence terms, as recorded in docs/research/, don't
 * allow it.`
 *
 * `docs/research/driver-logos.md` (2026-09-27): no vendor's published terms
 * allow its logo on the picker — PostgreSQL, Snowflake, BigQuery and Dremio
 * "not clearly allowed", Redshift, MySQL, SQL Server and Oracle "not
 * allowed". So no logo is cleared, and every driver shows its monogram.
 */
describe('each driver’s mark (AC-338)', () => {
  it('clears no vendor’s logo, as the research found none whose terms allow it', () => {
    expect(Object.keys(CLEARED_LOGOS)).toEqual([]);
  });

  it.each(DRIVER_TYPES)('marks %s with a monogram, and with no logo', (type) => {
    const { container } = render(<DriverMark type={type} />);
    const mark = container.querySelector('.driver-mark');
    expect(mark?.textContent).toMatch(/^[A-Z][A-Za-z]$/);
    expect(container.querySelector('img, svg')).toBeNull();
  });

  it('gives the eight drivers eight different monograms', () => {
    const monograms = DRIVER_TYPES.map(
      (type) => render(<DriverMark type={type} />).container.textContent,
    );
    expect(new Set(monograms).size).toBe(DRIVER_TYPES.length);
  });
});
