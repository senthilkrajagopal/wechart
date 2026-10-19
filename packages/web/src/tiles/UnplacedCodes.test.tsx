import { countryMap, loadCountryMap, registerRegionSet } from '@wechart/charts';
import { regionIndexOf, type RenderSpec } from '@wechart/core';
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

  /**
   * T974 (AC-623): … and SHALL name under the map, in the page's text, every
   * value it can't place ("Not on the map: "Online" (no territory)"), a value
   * matching more than one region being one it can't place and named as such.
   */
  it('names a custom set’s unplaced values quoted, with why, in its own noun', async () => {
    const territories: RenderSpec = {
      chartType: 'map',
      encoding: { x: ['stores.territory'], y: ['orders.revenue'] },
      options: { map: { boundarySet: 'custom:territories' } },
      rows: ['Atlantic', 'Online', 'Gulf', 'Twin'].map((territory, at) => ({
        'stores.territory': territory,
        'orders.revenue': at + 1,
      })),
    };
    render(<UnplacedCodes spec={territories} />);
    // Nothing is said before the set's boundaries are in.
    expect(screen.queryByTestId('unplaced-codes')).toBeNull();

    act(() => {
      registerRegionSet('custom:territories', {
        map: 'wechart-custom-territories',
        index: regionIndexOf([
          { key: 'ATL', names: ['Atlantic'] },
          { key: 'GLF', names: ['Gulf'] },
          { key: 'T1', names: ['Twin'] },
          { key: 'T2', names: ['Twin'] },
        ]),
        noun: 'territory',
        names: new Map(),
      });
    });
    expect((await screen.findByTestId('unplaced-codes')).textContent).toBe(
      'Not on the map: "Online" (no territory), "Twin" (matches more than one region)',
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
