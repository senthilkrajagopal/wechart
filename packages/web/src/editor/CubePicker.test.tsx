import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { CubePicker } from './CubePicker';
import type { PickerGroup } from './pathCubes';

/**
 * T475 (AC-329, AC-342; 2026-09-27 design 10, state D): the chart editor's
 * cube picker, drawn as the design draws it. "Cube or view" opens a list with
 * a "Search cubes and views" box; the cubes on the item's path grouped by
 * folder, nearest first, each by its title with C or V and its path beside
 * it; a farther cube a nearer one hides listed dimmed and unselectable,
 * saying what hides it. The APG combobox keys: Down and Up move, skipping
 * what can't be picked; Enter picks; Escape closes, back on the button.
 */
const cube = (name: string, title: string, isView = false) => ({ name, title, isView });
const row = (group: string, one: ReturnType<typeof cube>, hiddenBy?: string) => ({
  cube: one,
  key: `${group}/${one.name}`,
  ...(hiddenBy === undefined ? {} : { hiddenBy }),
});
const GROUPS: readonly PickerGroup[] = [
  { label: 'Sales / EMEA', rows: [row('Sales / EMEA', cube('femea__returns', 'Returns'))] },
  { label: 'Sales', rows: [row('Sales', cube('fsales__pipeline', 'Pipeline', true))] },
  {
    label: 'Shared',
    rows: [
      row('Shared', cube('customers', 'Customers')),
      row('Shared', cube('orders', 'Orders'), 'hidden by Orders in Sales / EMEA'),
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

describe('the cube picker (T475, AC-329, AC-342)', () => {
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
      'COrdersShared · hidden by Orders in Sales / EMEA',
    ]);
  });

  // AC-342: listed dimmed and unselectable, saying which folder's cube hides it.
  it('lists a hidden cube dimmed and unselectable, saying what hides it', async () => {
    const { button, onChoose } = show();
    await userEvent.click(button);
    const hidden = screen.getByRole('option', { name: /^Orders/ });
    expect(hidden.getAttribute('aria-disabled')).toBe('true');
    expect(hidden.className).toContain('is-hidden');
    await userEvent.click(hidden);
    expect(onChoose).not.toHaveBeenCalled();
    expect(screen.getByRole('listbox').tagName).toBe('DIV');
  });

  it('picks by pointer, closing back on its button', async () => {
    const { button, onChoose } = show();
    await userEvent.click(button);
    await userEvent.click(screen.getByRole('option', { name: /^Customers/ }));
    expect(onChoose).toHaveBeenCalledWith('customers');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(document.activeElement).toBe(button);
  });

  it('picks from the keyboard, skipping what can’t be picked, and narrows by title', async () => {
    const { button, onChoose } = show();
    button.focus();
    await userEvent.keyboard('{ArrowDown}');
    const search = screen.getByRole('combobox', { name: 'Search cubes and views' });
    expect(document.activeElement).toBe(search);
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}');
    // Customers, the last that can be picked: Orders is skipped.
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
    expect(onChoose).toHaveBeenLastCalledWith('fsales__pipeline');
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
