import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { CubePicker } from './CubePicker';
import type { PickerGroup } from './pathCubes';

/**
 * T475 (AC-329; 2026-09-27 design 10, state D), as T718 has it (AC-428;
 * R71, R73; AC-342 retired): the chart editor's cube picker. "Cube or view"
 * opens a list with a "Search cubes and views" box; the cubes on the item's
 * path grouped by folder, nearest first, each by its title with C or V and
 * its path beside it, none dimmed. The user's workspace copy of a landed
 * cube is listed in its place, marked "Your copy". The APG combobox keys:
 * Down and Up move; Enter picks; Escape closes, back on the button.
 */
const cube = (name: string, title: string, isView = false) => ({ name, title, isView });
const row = (group: string, one: ReturnType<typeof cube>, yours = false) => ({
  cube: one,
  key: `${group}/${one.name}`,
  ...(yours ? { yours: true as const } : {}),
});
const GROUPS: readonly PickerGroup[] = [
  { label: 'Sales / EMEA', rows: [row('Sales / EMEA', cube('returns', 'Returns'))] },
  { label: 'Sales', rows: [row('Sales', cube('pipeline', 'Pipeline', true))] },
  {
    label: 'Shared',
    rows: [
      row('Shared', cube('customers', 'Customers')),
      row('Shared', cube('orders', 'Orders (mine)'), true),
    ],
  },
];

function show(value = '') {
  const onChoose = vi.fn();
  render(
    <CubePicker
      groups={GROUPS}
      value={value}
      valueTitle={value === '' ? undefined : 'Customers'}
      onChoose={onChoose}
    />,
  );
  return { onChoose, button: screen.getByRole('button', { name: /^Cube or view/ }) };
}

describe('the cube picker (T475, T718, AC-329, AC-428)', () => {
  it('names the cube chosen, or asks for one', () => {
    show('customers');
    expect(screen.getByRole('button', { name: /^Cube or view/ }).textContent).toContain(
      'Customers',
    );
    expect(screen.getByRole('button', { name: /^Cube or view/ }).getAttribute('data-value')).toBe(
      'customers',
    );
  });

  it('opens on its folders’ cubes, nearest first, each by title with its kind and path', async () => {
    const { button } = show();
    expect(button.textContent).toContain('Choose a cube or view…');
    await userEvent.click(button);
    const search = screen.getByRole('combobox', { name: 'Search cubes and views' });
    expect(document.activeElement).toBe(search);
    expect(search.getAttribute('placeholder')).toBe('Search cubes and views');
    const list = screen.getByRole('listbox', { name: 'Cubes and views' });
    expect(
      within(list)
        .getAllByRole('group')
        .map((group) => group.getAttribute('aria-label')),
    ).toEqual(['Sales / EMEA', 'Sales', 'Shared']);
    expect(
      within(list)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual([
      'CReturnsSales / EMEA',
      'VPipelineSales',
      'CCustomersShared',
      'COrders (mine)Your copyShared',
    ]);
  });

  // T718 (AC-428): the copy in the landed cube's place, marked "Your copy", and picked as any is.
  it('lists the user’s copy in the landed cube’s place, marked as theirs, and none dimmed', async () => {
    const { button, onChoose } = show();
    await userEvent.click(button);
    const options = screen.getAllByRole('option');
    expect(options.filter((option) => option.getAttribute('aria-disabled') === 'true')).toEqual([]);
    expect(options.filter((option) => option.className.includes('is-hidden'))).toEqual([]);
    const yours = screen.getByRole('option', { name: /^Orders \(mine\)/ });
    const chip = yours.querySelector('.cube-picker__chip');
    expect(chip?.textContent).toBe('Your copy');
    await userEvent.click(yours);
    expect(onChoose).toHaveBeenCalledWith('orders');
  });

  it('picks by pointer, closing back on its button', async () => {
    const { button, onChoose } = show();
    await userEvent.click(button);
    await userEvent.click(screen.getByRole('option', { name: /^Customers/ }));
    expect(onChoose).toHaveBeenCalledWith('customers');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(document.activeElement).toBe(button);
  });

  it('picks from the keyboard, and narrows by title', async () => {
    const { button, onChoose } = show();
    button.focus();
    await userEvent.keyboard('{ArrowDown}');
    const search = screen.getByRole('combobox', { name: 'Search cubes and views' });
    expect(document.activeElement).toBe(search);
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}');
    const active = document.getElementById(search.getAttribute('aria-activedescendant') ?? '');
    expect(active?.textContent).toContain('Customers');
    await userEvent.keyboard('{Enter}');
    expect(onChoose).toHaveBeenLastCalledWith('customers');

    await userEvent.click(button);
    await userEvent.type(screen.getByRole('combobox', { name: 'Search cubes and views' }), 'pip');
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      'VPipelineSales',
    ]);
    await userEvent.keyboard('{ArrowDown}{Enter}');
    expect(onChoose).toHaveBeenLastCalledWith('pipeline');
  });

  // T475's review: closed by a press outside, it opens afresh, not on what was typed.
  it('opens afresh after a press outside closed it, on the cube chosen', async () => {
    const { button } = show('customers');
    await userEvent.click(button);
    await userEvent.type(screen.getByRole('combobox', { name: 'Search cubes and views' }), 'ret');
    await userEvent.click(document.body);
    expect(screen.queryByRole('listbox')).toBeNull();
    await userEvent.click(button);
    const search = screen.getByRole('combobox', { name: 'Search cubes and views' });
    expect((search as HTMLInputElement).value).toBe('');
    // The cube chosen is the one active as it opens.
    const active = document.getElementById(search.getAttribute('aria-activedescendant') ?? '');
    expect(active?.getAttribute('data-cube')).toBe('customers');
  });

  it('closes on Escape, back on its button, picking nothing', async () => {
    const { button, onChoose } = show();
    await userEvent.click(button);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(document.activeElement).toBe(button);
    expect(onChoose).not.toHaveBeenCalled();
  });
});
