import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ALL_CARDS, CARD_NAMES, TYPE_PURPOSES } from '../chartTypeCatalog';
import type { Member } from '../fields';
import { MapWells } from './map';
import { TYPE_WELLS } from './registry';

/**
 * T973 / AC-622: THE SYSTEM SHALL offer one Map type, in place of the Country
 * map, taking a Boundary set (Countries, Natural Earth 1:50m admin-0 as today;
 * Admin-1, by country; or a custom set) and up to three layers, Regions (a
 * region key coloured by a measure), Points (a geo dimension sized by a
 * measure) and Density (a geo dimension) …
 * `Fails when: a boundary set or layer is missing; two map cards are offered; …`
 */
const member = (name: string, title: string, kind: Member['kind'], type: string): Member => ({
  name,
  title,
  shortTitle: title,
  kind,
  type,
  cube: name.split('.')[0] ?? '',
});

const AVAILABLE: readonly Member[] = [
  member('orders.revenue', 'Revenue', 'measure', 'number'),
  member('orders.count', 'Orders', 'measure', 'number'),
  member('customers.country', 'Country', 'dimension', 'string'),
  member('stores.location', 'Store location', 'dimension', 'geo'),
];

const titleOf = (name: string) => AVAILABLE.find((one) => one.name === name)?.title ?? name;

const wells = ({
  options = {},
  measures = ['orders.revenue'],
  dimensions = ['customers.country'],
}: {
  options?: Record<string, unknown>;
  measures?: string[];
  dimensions?: string[];
} = {}) => {
  const onOptions = vi.fn();
  render(
    <MapWells
      chartType="map"
      options={options}
      onOptions={onOptions}
      available={AVAILABLE}
      titleOf={titleOf}
      spec={{ measures, dimensions }}
      customSets={[{ id: 'territories', name: 'Sales territories' }]}
    />,
  );
  return onOptions;
};

describe('the Map’s wells (AC-622)', () => {
  it('is the map’s wells module', () => {
    expect(TYPE_WELLS.map).toBe(MapWells);
  });

  it('offers Countries, Admin-1 and the custom sets as its Boundary set, Countries by default', () => {
    wells();
    const set = screen.getByRole('combobox', { name: 'Boundary set' }) as HTMLSelectElement;
    expect([...set.options].map((option) => option.textContent)).toEqual([
      'Countries',
      'Admin-1, by country',
      'Sales territories',
    ]);
    expect(within(set).getByRole('group', { name: 'Custom' })).toBeTruthy();
    expect(set.value).toBe('countries');
  });

  it('stores the boundary set chosen, and Countries as nothing', async () => {
    const onOptions = wells();
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Boundary set' }), 'admin1');
    expect(onOptions).toHaveBeenLastCalledWith({ map: { boundarySet: 'admin1' } });

    const back = wells({ options: { map: { boundarySet: 'custom:territories' } } });
    const [, second] = screen.getAllByRole('combobox', { name: 'Boundary set' });
    expect((second as HTMLSelectElement).value).toBe('custom:territories');
    await userEvent.selectOptions(second!, 'countries');
    expect(back).toHaveBeenLastCalledWith({ map: undefined });
  });

  it('shows a stored custom set it doesn’t offer as chosen, so Countries can be chosen back (T973’s review)', async () => {
    const onOptions = vi.fn();
    render(
      <MapWells
        chartType="map"
        options={{ map: { boundarySet: 'custom:gone' } }}
        onOptions={onOptions}
        available={AVAILABLE}
        titleOf={titleOf}
        spec={{ measures: ['orders.revenue'], dimensions: ['customers.country'] }}
      />,
    );
    const set = screen.getByRole('combobox', { name: 'Boundary set' }) as HTMLSelectElement;
    expect(set.value).toBe('custom:gone');
    expect(set.selectedOptions[0]?.textContent).toBe('A custom set no longer offered here');
    await userEvent.selectOptions(set, 'countries');
    expect(onOptions).toHaveBeenLastCalledWith({ map: undefined });
  });

  it('offers the three layers: Regions, Points and Density', () => {
    wells();
    for (const layer of ['Regions layer', 'Points layer', 'Density layer'])
      expect(screen.getByRole('heading', { name: layer })).toBeTruthy();
  });

  it('draws Regions from the chart’s dimension, coloured by its measure', () => {
    wells();
    expect(screen.getByTestId('map-layer-regions').textContent).toBe('Country coloured by Revenue');
  });

  it('says what Regions needs while Dimensions is empty', () => {
    wells({ dimensions: [] });
    expect(screen.getByTestId('map-layer-regions').textContent).toBe(
      'Put a region key in Dimensions and a measure in Metrics.',
    );
  });

  it('takes a geo dimension as the Points layer’s location, sized by a measure', async () => {
    const onOptions = wells();
    await userEvent.click(screen.getByTestId('add-mapPoints'));
    // Only geo dimensions are locations.
    expect(screen.queryByTestId('pick-customers.country')).toBeNull();
    await userEvent.click(screen.getByTestId('pick-stores.location'));
    expect(onOptions).toHaveBeenLastCalledWith({
      map: { points: { location: 'stores.location' } },
    });
  });

  it('sizes the Points layer by a measure, and removes it', async () => {
    const onOptions = wells({ options: { map: { points: { location: 'stores.location' } } } });
    const points = screen.getByTestId('map-layer-points');
    expect(within(points).getByText('Store location')).toBeTruthy();
    await userEvent.click(screen.getByTestId('add-mapPointsSize'));
    await userEvent.click(screen.getByTestId('pick-orders.count'));
    expect(onOptions).toHaveBeenLastCalledWith({
      map: { points: { location: 'stores.location', size: 'orders.count' } },
    });
    await userEvent.click(
      within(points).getByRole('button', { name: 'Remove Store location from Points layer' }),
    );
    expect(onOptions).toHaveBeenLastCalledWith({ map: undefined });
  });

  it('takes a geo dimension as the Density layer’s location', async () => {
    const onOptions = wells();
    await userEvent.click(screen.getByTestId('add-mapDensity'));
    await userEvent.click(screen.getByTestId('pick-stores.location'));
    expect(onOptions).toHaveBeenLastCalledWith({
      map: { density: { location: 'stores.location' } },
    });
  });

  it('is one Map card in the gallery, and no Country map', () => {
    const shelved = new Set(TYPE_PURPOSES.flatMap((purpose) => purpose.cards));
    const maps = [...shelved].filter((card) => /\bmap\b/i.test(CARD_NAMES[card]));
    expect(maps).toEqual(['map']);
    expect(CARD_NAMES.map).toBe('Map');
    expect(ALL_CARDS.filter((card) => card === 'map')).toHaveLength(1);
  });
});
