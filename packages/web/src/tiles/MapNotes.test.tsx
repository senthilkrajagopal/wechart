import type { RenderSpec } from '@wechart/core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { MapNotes } from './MapNotes';

/**
 * T976 / AC-625: … count the rows with no location ("312 stores have no
 * location."); and IF Cube returned fewer rows than the data holds, THEN say
 * "Showing ‹n› of ‹N› ‹members› (Cube's row limit)." with "Draw as density"
 * and Filter.
 * `Fails when: … rows without a location aren't counted; or a cut result
 * isn't said.`
 */
const located = (count: number) =>
  Array.from({ length: count }, (_, at) => ({
    'stores.location': `${String(10 + (at % 50))},${String(at % 170)}`,
    'orders.revenue': at + 1,
  }));

const spec = (rows: RenderSpec['rows'], total?: number): RenderSpec => ({
  chartType: 'map',
  encoding: {},
  rows: [{ 'orders.revenue': 1 }],
  options: { map: { points: { location: 'stores.location', size: 'orders.revenue' } } },
  mapPoints: { rows, ...(total === undefined ? {} : { total }) },
});

describe('the Points layer’s notes (AC-625)', () => {
  it('counts the rows with no location', () => {
    render(
      <MapNotes
        spec={spec([
          ...located(10),
          ...Array.from({ length: 312 }, () => ({ 'stores.location': null, 'orders.revenue': 1 })),
        ])}
      />,
    );
    expect(screen.getByTestId('map-unlocated').textContent).toBe('312 stores have no location.');
    expect(screen.queryByTestId('map-points-cut')).toBeNull();
  });

  it('says a cut at Cube’s row limit, with Draw as density and Filter', async () => {
    const onDensity = vi.fn();
    const onFilter = vi.fn();
    render(
      <MapNotes spec={spec(located(10_000), 48_210)} onDrawAsDensity={onDensity} onFilter={onFilter} />,
    );
    const cut = screen.getByTestId('map-points-cut');
    expect(cut.textContent).toContain("Showing 10,000 of 48,210 stores (Cube's row limit).");
    await userEvent.click(screen.getByRole('button', { name: 'Draw as density' }));
    expect(onDensity).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole('button', { name: 'Filter' }));
    expect(onFilter).toHaveBeenCalledOnce();
    expect(screen.queryByTestId('map-unlocated')).toBeNull();
  });

  it('says nothing when every row is placed and nothing is cut', () => {
    const { container } = render(<MapNotes spec={spec(located(10), 10)} />);
    expect(container.innerHTML).toBe('');
  });

  it('says a refused Colour', () => {
    const coloured: RenderSpec = {
      ...spec(
        located(8).map((row, at) => ({ ...row, 'stores.format': ['A', 'B', 'C', 'D'][at % 4] })),
      ),
      options: {
        map: {
          points: { location: 'stores.location', size: 'orders.revenue', colour: 'stores.format' },
        },
      },
      titles: { 'stores.format': 'Format' },
    };
    render(<MapNotes spec={coloured} />);
    expect(screen.getByTestId('map-points-refusal').textContent).toBe(
      'Colour takes at most 3 members; Format has 4.',
    );
  });
});
