import { countryMap, loadCountryMap } from '@wechart/charts';
import type { RenderSpec } from '@wechart/core';
import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { UnplacedCodes } from './UnplacedCodes';

/**
 * T398 / AC-305 … and names any codes it can't place. `Fails when: … an
 * unplaced code isn't named.` Rule 87: a country map names every code it
 * can't place in a text note under the map, in page DOM rather than inside
 * the chart (direction.md: "Not on the map: XKX, …").
 */
const spec = (codes: readonly (string | null)[]): RenderSpec => ({
  chartType: 'map',
  encoding: { x: ['customers.iso3'], y: ['orders.count'] },
  rows: codes.map((code, at) => ({ 'customers.iso3': code, 'orders.count': at + 1 })),
});

describe('the codes a map can’t place', () => {
  it('names each under the map, once its boundaries are in', async () => {
    render(<UnplacedCodes spec={spec(['FRA', 'XKX', 'SGP', null, 'GUF'])} />);

    expect((await screen.findByTestId('unplaced-codes')).textContent).toBe(
      'Not on the map: XKX, (empty), GUF',
    );
  });

  it('says nothing when every code is placed', async () => {
    const { container } = render(<UnplacedCodes spec={spec(['FRA', 'NOR', 'SGP'])} />);

    // The boundaries in (the placed codes' check needs them), and still no note.
    await act(async () => {
      await loadCountryMap();
    });
    expect(countryMap()?.keys.has('SGP')).toBe(true);
    expect(container.innerHTML).toBe('');
  });
});
