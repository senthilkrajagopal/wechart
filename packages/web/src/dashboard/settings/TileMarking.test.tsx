import type { Marking } from '@wechart/core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { TileMarking } from './TileMarking';

/**
 * T091 / AC-085: WHEN a chart tile is created, THE SYSTEM SHALL set it to
 * mark with the dashboard's default marking, and the tile's Marking setting
 * SHALL also offer "(None)" and every other marking (direction.md rule 44).
 * `Fails when: a new tile marks with nothing, or the setting omits "(None)".`
 *
 * The creation half is the dashboard's (`addTile`); this is the setting, and
 * what it offers.
 */
const MARKINGS: readonly Marking[] = [
  { id: 'm1', name: 'Marking', slot: 'mk1', isDefault: true },
  { id: 'm2', name: 'Cohort', slot: 'mk2', isDefault: false },
];

const show = (marksWith: string | undefined, onChange = vi.fn()) => {
  render(<TileMarking markings={MARKINGS} marksWith={marksWith} onChange={onChange} />);
  return onChange;
};

const picker = () => screen.getByLabelText('Marking') as HTMLSelectElement;

describe('a chart tile’s Marking setting', () => {
  it('offers every marking, and "(None)"', () => {
    show('m1');

    expect([...picker().options].map((option) => option.textContent)).toEqual([
      '(None)',
      'Marking',
      'Cohort',
    ]);
  });

  it('shows the marking the tile marks with', () => {
    show('m2');

    expect(picker().value).toBe('m2');
  });

  it('shows the dashboard’s default where the tile names none', () => {
    // A tile saved before the setting existed follows the default, which is
    // what it is actually marking with — so that is what the picker says.
    show(undefined);

    expect(picker().value).toBe('m1');
  });

  it('marks with nothing when "(None)" is chosen', async () => {
    const onChange = show('m1');

    await userEvent.selectOptions(picker(), '');

    // Stored as "" rather than absent: absent means "follow the default",
    // and those are different answers.
    expect(onChange).toHaveBeenCalledWith('');
  });

  it('changes which marking the tile marks with', async () => {
    const onChange = show('m1');

    await userEvent.selectOptions(picker(), 'm2');

    expect(onChange).toHaveBeenCalledWith('m2');
  });
});
