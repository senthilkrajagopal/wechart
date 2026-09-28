import type { QuickCalc } from '@wechart/core';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { QuickCalcMenu } from './QuickCalcMenu';

/**
 * AC-047: WHEN the user opens the menu on a measure in the chart editor, THE
 * SYSTEM SHALL offer % of total, difference from previous period, % difference
 * from previous period, running total, rank and moving average.
 * Fails when: any of the six is missing from the menu.
 *
 * The rendered editor is `e2e/quick-calcs.spec.ts`'s; this is the menu's own
 * behaviour: what it offers, what choosing does, and taking one off.
 */
const menuFor = (applied?: QuickCalc) => {
  const onApply = vi.fn();
  render(
    <QuickCalcMenu
      title="Count"
      tag="count"
      onApply={onApply}
      {...(applied === undefined ? {} : { applied })}
    />,
  );
  return onApply;
};

const open = async () => {
  await userEvent.click(screen.getByRole('button', { name: 'Calculations on Count' }));
  return screen.getByRole('menu', { name: 'Calculations on Count' });
};

describe('the menu on a measure (AC-047)', () => {
  it('offers the six quick calculations', async () => {
    menuFor();
    const menu = await open();
    const offered = within(menu)
      .getAllByRole('menuitem')
      .map((item) => item.textContent);

    for (const name of [
      '% of total',
      'Difference from previous period',
      '% difference from previous period',
      'Running total',
      'Rank',
      'Moving average, 3 periods',
    ]) {
      expect(offered).toContain(name);
    }
  });

  it('offers a moving average over 3, 6 or 12 periods, 3 first', async () => {
    menuFor();
    const menu = await open();
    const averages = within(menu)
      .getAllByRole('menuitem')
      .map((item) => item.textContent)
      .filter((name) => name?.startsWith('Moving average'));

    expect(averages).toEqual([
      'Moving average, 3 periods',
      'Moving average, 6 periods',
      'Moving average, 12 periods',
    ]);
  });

  it('shows the measure’s aggregation while no calculation is applied', () => {
    menuFor();

    expect(screen.getByRole('button', { name: 'Calculations on Count' }).textContent).toContain(
      'count',
    );
  });

  it('applies the one chosen', async () => {
    const onApply = menuFor();
    const menu = await open();

    await userEvent.click(
      within(menu).getByRole('menuitem', { name: 'Moving average, 6 periods' }),
    );

    expect(onApply).toHaveBeenCalledWith({ kind: 'movingAverage', periods: 6 });
  });

  it('names the one applied on its button, and offers to take it off', async () => {
    const onApply = menuFor({ kind: 'runningTotal' });

    expect(screen.getByRole('button', { name: 'Calculations on Count' }).textContent).toContain(
      'Running total',
    );
    const menu = await open();
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'No calculation' }));

    expect(onApply).toHaveBeenCalledWith(undefined);
  });

  it('offers nothing to take off while none is applied', async () => {
    menuFor();
    const menu = await open();

    expect(within(menu).queryByRole('menuitem', { name: 'No calculation' })).toBeNull();
  });

  /** AC-049: disabled, with the reason said where it can be read. */
  it('disables a calculation that can’t be applied, saying why, and applies nothing', async () => {
    const onApply = vi.fn();
    render(
      <QuickCalcMenu
        title="Count"
        tag="count"
        onApply={onApply}
        whyNot={(kind) => (kind === 'runningTotal' ? 'Needs a time field in Time.' : undefined)}
      />,
    );
    const menu = await open();
    const item = within(menu).getByRole('menuitem', {
      name: 'Running total',
      description: 'Needs a time field in Time.',
    });

    expect(item.getAttribute('aria-disabled')).toBe('true');
    expect(item.textContent).toContain('Needs a time field in Time.');
    expect(item.getAttribute('title')).toBe('Needs a time field in Time.');
    await userEvent.click(item);
    expect(onApply).not.toHaveBeenCalled();

    const rank = within(menu).getByRole('menuitem', { name: 'Rank' });
    expect(rank.getAttribute('aria-disabled')).toBeNull();
  });

  it('changes nothing when the one applied is chosen again', async () => {
    const onApply = menuFor({ kind: 'rank' });
    const menu = await open();

    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Rank' }));

    expect(onApply).not.toHaveBeenCalled();
  });
});
