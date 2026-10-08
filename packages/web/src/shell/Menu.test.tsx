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

  it('reads out a line of information in turn, and runs nothing on it (T273)', async () => {
    const { onClose } = menu([
      { kind: 'text', key: 't', text: 'Pre-aggregation a.b' },
      { kind: 'item', key: 'a', label: 'Refresh now', onSelect: vi.fn() },
    ]);

    expect(focused()).toBe('Pre-aggregation a.b');
    expect(
      screen.getByRole('menuitem', { name: 'Pre-aggregation a.b' }).getAttribute('aria-disabled'),
    ).toBe('true');
    await userEvent.keyboard('{Enter}');
    expect(onClose).not.toHaveBeenCalled();
    await userEvent.keyboard('{ArrowDown}');
    expect(focused()).toBe('Refresh now');
  });

  it('reaches a submenu inside a group, and opens and closes it (T266’s review)', async () => {
    menu([
      { kind: 'item', key: 'a', label: 'View query', onSelect: vi.fn() },
      {
        kind: 'group',
        key: 'g',
        label: 'Marked',
        entries: [
          {
            kind: 'submenu',
            key: 'x',
            label: 'Drill by',
            entries: [{ kind: 'item', key: 'r', label: 'Region', onSelect: vi.fn() }],
          },
        ],
      },
    ]);

    await userEvent.keyboard('{ArrowDown}');
    expect(focused()).toContain('Drill by');
    await userEvent.keyboard('{ArrowRight}');
    expect(focused()).toBe('Region');
    await userEvent.keyboard('{Escape}');
    expect(focused()).toContain('Drill by');
  });

  it('places a submenu by its item’s box, fixed, so a menu that scrolls cannot clip it', async () => {
    menu([
      {
        kind: 'submenu',
        key: 'x',
        label: 'Export',
        entries: [{ kind: 'item', key: 'csv', label: 'CSV', onSelect: vi.fn() }],
      },
    ]);
    const item = screen.getByRole('menuitem', { name: /Export/ });
    item.getBoundingClientRect = () => DOMRect.fromRect({ x: 100, y: 200, width: 250, height: 28 });

    await userEvent.keyboard('{ArrowRight}');

    const sub = screen.getByRole('menu', { name: /Export/ });
    expect(sub.style.position).toBe('fixed');
    expect(sub.style.left).toBe('354px');
    expect(sub.style.top).toBe('200px');
  });

  /**
   * T634 (AC-176; R64, the user: "Ctrl+Enter adds"): an item that can add
   * runs its add with Ctrl+Enter or ⌘+Enter, as a Ctrl- or ⌘-click does; a
   * plain Enter or click runs it as before. It says so in its description.
   */
  it('runs an item’s add with Ctrl+Enter, ⌘+Enter or a Ctrl-click, and says so', async () => {
    const onSelect = vi.fn();
    const onAdd = vi.fn();
    const entries: MenuEntry[] = [
      { kind: 'item', key: 'a', label: 'shipped', onSelect, onAdd, addHint: 'Ctrl+Enter adds it' },
    ];
    const { onClose } = menu(entries);
    const item = screen.getByRole('menuitem', { name: 'shipped' });
    expect(document.getElementById(item.getAttribute('aria-describedby') ?? '')?.textContent).toBe(
      'Ctrl+Enter adds it',
    );

    await userEvent.keyboard('{Control>}{Enter}{/Control}');
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenLastCalledWith('selected');

    item.focus();
    await userEvent.keyboard('{Meta>}{Enter}{/Meta}');
    expect(onAdd).toHaveBeenCalledTimes(2);

    // One user, so the key held is held through the click.
    const user = userEvent.setup();
    await user.keyboard('{Control>}');
    await user.click(item);
    await user.keyboard('{/Control}');
    expect(onAdd).toHaveBeenCalledTimes(3);
    expect(onSelect).not.toHaveBeenCalled();

    item.focus();
    await userEvent.keyboard('{Enter}');
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onAdd).toHaveBeenCalledTimes(3);
  });

  // T634's review: a key from a value such as "United States" must not split the reference.
  it('says an item’s add whatever its key holds, spaces and all', () => {
    menu([
      {
        kind: 'item',
        key: 'series-United States',
        label: 'United States',
        onSelect: vi.fn(),
        onAdd: vi.fn(),
        addHint: 'Ctrl/⌘+Enter adds it',
      },
    ]);
    const described = screen
      .getByRole('menuitem', { name: 'United States' })
      .getAttribute('aria-describedby');
    // An ID reference list is split at whitespace (WAI-ARIA): one id, no spaces.
    expect(described).not.toMatch(/\s/);
    expect(document.getElementById(described ?? '')?.textContent).toBe('Ctrl/⌘+Enter adds it');
  });
});

/**
 * T681 (design 08, pin 10 and state D; DSH-21): the Data as of footer on two
 * lines with its clock, and the submenu's heading and key-value line, each
 * still a line the arrows reach and a screen reader reads in turn.
 */
describe('the menu’s two-line footer and its lines of information (T681)', () => {
  it('draws a submenu’s second line and icon, its name both lines', async () => {
    menu([
      {
        kind: 'submenu',
        key: 'as-of',
        label: 'Data as of 09:27',
        detail: 'Live · from the database',
        icon: <svg data-icon="clock" />,
        entries: [{ kind: 'item', key: 'r', label: 'Refresh now', onSelect: vi.fn() }],
      },
    ]);
    const item = screen.getByRole('menuitem', { name: /^Data as of 09:27/ });
    expect(item.querySelector('.menu__icon svg')?.getAttribute('data-icon')).toBe('clock');
    expect(item.querySelector('.menu__lines')?.textContent).toBe(
      'Data as of 09:27 Live · from the database',
    );
    expect(item.querySelector('.menu__detail')?.textContent).toBe('Live · from the database');
    await userEvent.keyboard('{ArrowRight}');
    expect(focused()).toBe('Refresh now');
  });

  it('draws a heading line and a key-value line, each reached in turn, with its time', async () => {
    menu([
      {
        kind: 'text',
        key: 'h',
        text: 'Answered by the database',
        heading: true,
        dot: true,
        sub: 'No pre-aggregation matched this chart’s query.',
      },
      {
        kind: 'text',
        key: 'kv',
        term: 'Data as of',
        text: 'Today 09:27:42',
        sub: 'when Cube answered',
        dateTime: '2026-09-25T09:27:42.000Z',
      },
      { kind: 'item', key: 'r', label: 'Refresh now', onSelect: vi.fn() },
    ]);
    expect(focused()).toBe('Answered by the database No pre-aggregation matched this chart’s query.');
    const heading = screen.getAllByRole('menuitem')[0]!;
    expect(heading.className).toBe('menu__item menu__text menu__text--heading');
    // State D's live dot before it, for the eye only.
    expect(heading.querySelector('.menu__dot')?.getAttribute('aria-hidden')).toBe('true');
    await userEvent.keyboard('{ArrowDown}');
    expect(focused()).toBe('Data as of Today 09:27:42 when Cube answered');
    const time = document.activeElement?.querySelector('time');
    expect(time?.getAttribute('datetime')).toBe('2026-09-25T09:27:42.000Z');
    expect(time?.getAttribute('data-testid')).toBe('data-as-of');
    expect(document.activeElement?.querySelector('.menu__term')?.textContent).toBe('Data as of');
    await userEvent.keyboard('{ArrowDown}');
    expect(focused()).toBe('Refresh now');
  });
});
