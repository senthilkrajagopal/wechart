import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { ButtonAction } from '@wechart/core';

import { ActionList } from './ActionList';

/**
 * T894 / AC-530: WHEN the author inserts an Action button, THE SYSTEM SHALL
 * take its label, its style (Button, Primary or Text link …), and an ordered
 * list of actions, each one of Go to page tab, Apply bookmark, Reset filters
 * and Export …, reordered by drag or by a ⋮⋮ menu of Move up and Move down.
 * `Fails when: an action of another kind can be added …`
 */

const PAGES = [
  { id: 'overview', title: 'Overview' },
  { id: 'detail', title: 'Detail' },
];
const BOOKMARKS = [{ id: 'b1', name: 'Q3 review' }];
const TILES = [
  { id: 't1', name: 'Revenue by month' },
  { id: 't2', name: 'Top products' },
];

function Harness({
  start,
  onChange,
}: {
  start: Record<string, unknown>;
  onChange?: (settings: Record<string, unknown>) => void;
}) {
  const [attrs, setAttrs] = useState(start);
  return (
    <ActionList
      attrs={attrs}
      pages={PAGES}
      bookmarks={BOOKMARKS}
      tiles={TILES}
      onChange={(settings) => {
        onChange?.(settings);
        setAttrs((was) => ({ ...was, ...settings }));
      }}
    />
  );
}

const actionRows = () =>
  within(screen.getByRole('list', { name: 'When pressed, in this order' }))
    .getAllByRole('listitem')
    .map((row) => row.dataset['action']);

describe('an Action button’s settings (T894, AC-530)', () => {
  it('takes a label and one of the Link/button tile’s three styles', async () => {
    const onChange = vi.fn();
    render(<Harness start={{ label: 'Button' }} onChange={onChange} />);
    const label = screen.getByRole('textbox', { name: 'Label' });
    await userEvent.clear(label);
    await userEvent.type(label, 'Go');
    expect(onChange).toHaveBeenLastCalledWith({ label: 'Go' });
    const style = screen.getByRole('group', { name: 'Style' });
    expect(
      within(style)
        .getAllByRole('radio')
        .map((radio) => radio.parentElement?.textContent),
    ).toEqual(['Button', 'Primary', 'Text link']);
    await userEvent.click(within(style).getByRole('radio', { name: 'Primary' }));
    expect(onChange).toHaveBeenLastCalledWith({ style: 'primary' });
  });

  it('offers Go to page tab, Apply bookmark, Reset filters and Export, and nothing else', async () => {
    render(<Harness start={{ label: 'Go' }} />);
    await userEvent.click(screen.getByRole('button', { name: '+ action' }));
    const menu = screen.getByRole('menu', { name: 'Add an action' });
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((item) => item.textContent),
    ).toEqual(['Go to page tab', 'Apply bookmark', 'Reset filters', 'Export']);
  });

  it('adds each kind with what it needs, and Move up reorders', async () => {
    const onChange = vi.fn();
    render(<Harness start={{ label: 'Go' }} onChange={onChange} />);
    const add = async (name: string) => {
      await userEvent.click(screen.getByRole('button', { name: '+ action' }));
      await userEvent.click(screen.getByRole('menuitem', { name }));
    };
    await add('Reset filters');
    await add('Go to page tab');
    expect(onChange).toHaveBeenLastCalledWith({
      actions: [{ kind: 'resetFilters' }, { kind: 'page', page: 'overview' }],
    });
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: '2 · Go to page tab' }),
      'Detail',
    );
    await add('Apply bookmark');
    await add('Export');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Revenue by month' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Top products' }));
    const last = onChange.mock.lastCall?.[0] as { actions: ButtonAction[] };
    expect(last.actions).toEqual([
      { kind: 'resetFilters' },
      { kind: 'page', page: 'detail' },
      { kind: 'bookmark', bookmark: 'b1' },
      { kind: 'export', tiles: ['t1', 't2'] },
    ]);
    expect(actionRows()).toEqual(['resetFilters', 'page', 'bookmark', 'export']);

    // ⋮⋮ on the second: Move up.
    await userEvent.click(screen.getByRole('button', { name: 'Move 2 · Go to page tab' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Move up' }));
    expect(actionRows()).toEqual(['page', 'resetFilters', 'bookmark', 'export']);
    await userEvent.click(screen.getByRole('button', { name: 'Move 3 · Apply bookmark' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Move down' }));
    expect(actionRows()).toEqual(['page', 'resetFilters', 'export', 'bookmark']);
    // Removed from its menu.
    await userEvent.click(screen.getByRole('button', { name: 'Move 1 · Go to page tab' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Remove' }));
    expect(actionRows()).toEqual(['resetFilters', 'export', 'bookmark']);
  });
});
