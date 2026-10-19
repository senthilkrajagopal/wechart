/**
 * T860 (AC-504, AC-505): a split combo's count against its 8 series, and its
 * "‹dimension› shown", All or the top k by the first measure plus Other.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { SplitCount, splitCountText } from './SplitCount';

describe("a split combo's count against 8 (T860)", () => {
  it('counts measures times members', () => {
    expect(splitCountText({ measures: 2, members: 4, dimension: 'Region', series: 8 })).toBe(
      '2 measures × 4 regions = 8 of 8 series',
    );
  });

  it('counts a fold as its top k plus Other', () => {
    expect(
      splitCountText({ measures: 2, members: 21, top: 3, dimension: 'Country', series: 8 }),
    ).toBe('2 measures × 4 (3 countries + Other) = 8 of 8 series');
    expect(
      splitCountText({ measures: 3, members: 4, top: 1, dimension: 'Region', series: 6 }),
    ).toBe('3 measures × 2 (1 region + Other) = 6 of 8 series');
  });

  it('says one measure in the singular', () => {
    expect(splitCountText({ measures: 1, members: 3, dimension: 'Status', series: 3 })).toBe(
      '1 measure × 3 statuses = 3 of 8 series',
    );
  });

  it('offers "Regions shown": Auto, All, or a top k below the members', async () => {
    const onShown = vi.fn();
    render(
      <SplitCount measures={2} members={4} dimension="Region" series={8} onShown={onShown} />,
    );
    const shown = screen.getByRole('combobox', { name: 'Regions shown' }) as HTMLSelectElement;

    expect(screen.getByTestId('split-count').textContent).toBe(
      '2 measures × 4 regions = 8 of 8 series',
    );
    expect([...shown.options].map((option) => option.textContent)).toEqual([
      'Auto',
      'All 4',
      'Top 1 + Other',
      'Top 2 + Other',
      'Top 3 + Other',
    ]);
    expect(shown.value).toBe('auto');

    await userEvent.selectOptions(shown, 'All 4');
    expect(onShown).toHaveBeenLastCalledWith('all');
    await userEvent.selectOptions(shown, 'Top 2 + Other');
    expect(onShown).toHaveBeenLastCalledWith(2);
    await userEvent.selectOptions(shown, 'Auto');
    expect(onShown).toHaveBeenLastCalledWith(undefined);
  });

  it('shows the choice made', () => {
    render(
      <SplitCount
        measures={2}
        members={4}
        dimension="Region"
        series={8}
        shown="all"
        onShown={vi.fn()}
      />,
    );

    expect(
      (screen.getByRole('combobox', { name: 'Regions shown' }) as HTMLSelectElement).value,
    ).toBe('all');
  });
});
