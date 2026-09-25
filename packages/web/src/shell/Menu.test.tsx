import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Menu, type MenuEntry } from './Menu';

/**
 * T266 (AC-199, AC-246, AC-176): the tile menu's core, in the WAI-ARIA APG
 * Menu pattern (research/context-menu-and-submenus.md, "Key map"): items,
 * checkbox items, submenus, groups and separators, with the pattern's keys —
 * so every action in it is reachable from the keyboard (AC-176).
 */
function menu(entries: readonly MenuEntry[], onClose = vi.fn()) {
  render(
    <div>
      <span id="named">Actions for Revenue</span>
      <Menu labelledBy="named" entries={entries} onClose={onClose} />
    </div>,
  );
  return { onClose };
}

const focused = () => document.activeElement?.textContent ?? '';

describe('the tile menu', () => {
  it('is a menu of items, named by its opener, the first item focused', () => {
    menu([
      { kind: 'item', key: 'a', label: 'View as table', onSelect: vi.fn() },
      { kind: 'item', key: 'b', label: 'View query', onSelect: vi.fn() },
    ]);

    expect(screen.getByRole('menu', { name: 'Actions for Revenue' })).toBeTruthy();
    expect(screen.getAllByRole('menuitem')).toHaveLength(2);
    expect(focused()).toBe('View as table');
  });

  it('moves with the arrows, wrapping, and to the ends with Home and End', async () => {
    menu([
      { kind: 'item', key: 'a', label: 'One', onSelect: vi.fn() },
      { kind: 'separator', key: 's' },
      {
        kind: 'group',
        key: 'g',
        label: 'Marking · 2 marked',
        entries: [{ kind: 'item', key: 'b', label: 'Two', onSelect: vi.fn() }],
      },
      { kind: 'item', key: 'c', label: 'Three', onSelect: vi.fn() },
    ]);

    await userEvent.keyboard('{ArrowDown}');
    expect(focused()).toBe('Two');
    await userEvent.keyboard('{ArrowDown}{ArrowDown}');
    expect(focused()).toBe('One');
    await userEvent.keyboard('{ArrowUp}');
    expect(focused()).toBe('Three');
    await userEvent.keyboard('{Home}');
    expect(focused()).toBe('One');
    await userEvent.keyboard('{End}');
    expect(focused()).toBe('Three');
    // Groups are named, and separators are not stops.
    expect(screen.getByRole('group', { name: 'Marking · 2 marked' })).toBeTruthy();
    expect(screen.getByRole('separator')).toBeTruthy();
  });

  it('runs an item with Enter, a click or Space, and closes', async () => {
    const run = vi.fn();
    const { onClose } = menu([{ kind: 'item', key: 'a', label: 'View query', onSelect: run }]);

    await userEvent.keyboard('{Enter}');
    expect(run).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenLastCalledWith('selected');

    await userEvent.keyboard(' ');
    expect(run).toHaveBeenCalledTimes(2);

    await userEvent.click(screen.getByRole('menuitem', { name: 'View query' }));
    expect(run).toHaveBeenCalledTimes(3);
  });

  it('keeps a disabled item reachable and says why, and does not run it', async () => {
    const run = vi.fn();
    const { onClose } = menu([
      {
        kind: 'item',
        key: 'a',
        label: 'Filter to marked',
        onSelect: run,
        disabled: 'Nothing is marked.',
      },
    ]);

    const item = screen.getByRole('menuitem', { name: 'Filter to marked' });
    expect(item.getAttribute('aria-disabled')).toBe('true');
    // Its reason as its description, which a keyboard reaches (T182).
    const described = item.getAttribute('aria-describedby') ?? '';
    expect(document.getElementById(described)?.textContent).toBe('Nothing is marked.');
    expect(focused()).toBe('Filter to marked');
    await userEvent.keyboard('{Enter}');
    await userEvent.click(item);
    expect(run).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('opens a submenu with Right, Enter or a click, and closes only it with Left or Escape', async () => {
    const svg = vi.fn();
    const { onClose } = menu([
      { kind: 'item', key: 'a', label: 'View query', onSelect: vi.fn() },
      {
        kind: 'submenu',
        key: 'x',
        label: 'Export',
        entries: [
          { kind: 'item', key: 'csv', label: 'CSV', onSelect: vi.fn() },
          { kind: 'item', key: 'svg', label: 'SVG', onSelect: svg },
        ],
      },
    ]);

    await userEvent.keyboard('{ArrowDown}');
    const parent = screen.getByRole('menuitem', { name: 'Export' });
    expect(parent.getAttribute('aria-haspopup')).toBe('menu');
    expect(parent.getAttribute('aria-expanded')).toBe('false');

    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('menu', { name: 'Export' })).toBeTruthy();
    expect(parent.getAttribute('aria-expanded')).toBe('true');
    expect(focused()).toBe('CSV');

    await userEvent.keyboard('{ArrowLeft}');
    expect(screen.queryByRole('menu', { name: 'Export' })).toBeNull();
    expect(focused()).toBe('Export ›');

    await userEvent.keyboard('{Enter}{ArrowDown}');
    expect(focused()).toBe('SVG');
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('menu', { name: 'Export' })).toBeNull();
    expect(onClose).not.toHaveBeenCalled();

    await userEvent.click(parent);
    await userEvent.click(screen.getByRole('menuitem', { name: 'SVG' }));
    expect(svg).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenLastCalledWith('selected');
  });

  it('toggles a checkbox item with Space and stays open; Enter toggles and closes', async () => {
    const toggle = vi.fn();
    const { onClose } = menu([
      { kind: 'checkbox', key: 'p', label: 'Details panel', checked: false, onToggle: toggle },
    ]);

    const item = screen.getByRole('menuitemcheckbox', { name: 'Details panel' });
    expect(item.getAttribute('aria-checked')).toBe('false');
    await userEvent.keyboard(' ');
    expect(toggle).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    await userEvent.keyboard('{Enter}');
    expect(toggle).toHaveBeenCalledTimes(2);
    expect(onClose).toHaveBeenLastCalledWith('selected');
  });

  it('closes on Escape at the top, and on Tab from anywhere in it', async () => {
    const { onClose } = menu([
      { kind: 'item', key: 'a', label: 'View query', onSelect: vi.fn() },
      {
        kind: 'submenu',
        key: 'x',
        label: 'Export',
        entries: [{ kind: 'item', key: 'csv', label: 'CSV', onSelect: vi.fn() }],
      },
    ]);

    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenLastCalledWith('escape');

    await userEvent.keyboard('{ArrowDown}{ArrowRight}');
    expect(focused()).toBe('CSV');
    await userEvent.keyboard('{Tab}');
    expect(onClose).toHaveBeenLastCalledWith('tab');
  });
});
