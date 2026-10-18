import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { MenuButton } from './MenuButton';

/**
 * The menu button the prototype uses for "＋ New ▾", a row's ⋯ and a tile's
 * ⋯ — one component, so each of them gets the WAI-ARIA menu button pattern
 * rather than five near-copies of it (AC-176: every action reachable from the
 * keyboard).
 */
const items = (onPick: (key: string) => void) => [
  { key: 'dashboard', label: 'Dashboard', onSelect: () => onPick('dashboard') },
  { key: 'chart', label: 'Chart', onSelect: () => onPick('chart') },
  { key: 'folder', label: 'Folder', onSelect: () => onPick('folder') },
];

function show() {
  const onPick = vi.fn();
  render(
    <>
      <MenuButton label="New" items={items(onPick)}>
        ＋ New ▾
      </MenuButton>
      <button type="button">elsewhere</button>
    </>,
  );
  return { onPick, trigger: screen.getByRole('button', { name: 'New' }) };
}

describe('a menu button', () => {
  it('is named by its label and says it opens a menu', () => {
    const { trigger } = show();

    expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('opens a menu of its items, focusing the first', async () => {
    const { trigger } = show();

    await userEvent.click(trigger);

    const menu = screen.getByRole('menu', { name: 'New' });
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'Dashboard',
      'Chart',
      'Folder',
    ]);
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Dashboard' }));
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(menu).toBeTruthy();
  });

  it('moves between items with the arrow keys, Home and End', async () => {
    const { trigger } = show();
    await userEvent.click(trigger);

    await userEvent.keyboard('{ArrowDown}');
    expect(document.activeElement?.textContent).toBe('Chart');
    await userEvent.keyboard('{End}');
    expect(document.activeElement?.textContent).toBe('Folder');
    // Wraps, as the pattern allows, rather than stopping at the edge.
    await userEvent.keyboard('{ArrowDown}');
    expect(document.activeElement?.textContent).toBe('Dashboard');
    await userEvent.keyboard('{ArrowUp}');
    expect(document.activeElement?.textContent).toBe('Folder');
    await userEvent.keyboard('{Home}');
    expect(document.activeElement?.textContent).toBe('Dashboard');
  });

  it('runs the chosen item and closes', async () => {
    const { trigger, onPick } = show();
    await userEvent.click(trigger);

    await userEvent.click(screen.getByRole('menuitem', { name: 'Chart' }));

    expect(onPick).toHaveBeenCalledWith('chart');
    expect(screen.queryAllByRole('menu')).toHaveLength(0);
  });

  it('runs an item from the keyboard with Enter', async () => {
    const { trigger, onPick } = show();
    trigger.focus();

    await userEvent.keyboard('{Enter}');
    await userEvent.keyboard('{ArrowDown}{Enter}');

    expect(onPick).toHaveBeenCalledWith('chart');
  });

  it('closes on Escape and gives focus back to the button', async () => {
    const { trigger, onPick } = show();
    await userEvent.click(trigger);

    await userEvent.keyboard('{Escape}');

    expect(screen.queryAllByRole('menu')).toHaveLength(0);
    expect(document.activeElement).toBe(trigger);
    expect(onPick).not.toHaveBeenCalled();
  });

  it('keeps a disabled item reachable, says so, and does not run it', async () => {
    // A disabled item stays in the menu and is stepped over by nothing: the
    // keyboard reaches it like any other, so the menu never strands focus.
    const onPick = vi.fn();
    render(
      <MenuButton
        label="New"
        items={[
          { key: 'a', label: 'Dashboard', onSelect: () => onPick('a'), disabled: true },
          { key: 'b', label: 'Chart', onSelect: () => onPick('b') },
        ]}
      >
        New
      </MenuButton>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'New' }));

    const first = screen.getByRole('menuitem', { name: 'Dashboard' });
    expect(document.activeElement).toBe(first);
    expect(first.getAttribute('aria-disabled')).toBe('true');
    await userEvent.keyboard('{Enter}');
    expect(onPick).not.toHaveBeenCalled();
    await userEvent.keyboard('{ArrowDown}');
    expect(document.activeElement?.textContent).toBe('Chart');
    // Escape still works with a disabled item first: the menu kept focus.
    await userEvent.keyboard('{Escape}');
    expect(screen.queryAllByRole('menu')).toHaveLength(0);
  });

  it('gives focus back to the button after an item runs', async () => {
    // So a choice that does not move focus itself leaves the user where they
    // were, rather than on the page body.
    const { trigger } = show();
    await userEvent.click(trigger);

    await userEvent.click(screen.getByRole('menuitem', { name: 'Chart' }));

    expect(document.activeElement).toBe(trigger);
  });

  it('closes when Tab leaves it', async () => {
    const { trigger } = show();
    await userEvent.click(trigger);

    await userEvent.keyboard('{Tab}');

    expect(screen.queryAllByRole('menu')).toHaveLength(0);
  });

  it('closes when the pointer goes down outside it', async () => {
    const { trigger } = show();
    await userEvent.click(trigger);

    await userEvent.click(screen.getByRole('button', { name: 'elsewhere' }));

    expect(screen.queryAllByRole('menu')).toHaveLength(0);
  });

  // T693 (EXP-07): a menu as wide as its design draws it, where one is given;
  // otherwise the stylesheet's.
  it('opens its menu at the width it is given, and at the stylesheet’s otherwise', async () => {
    render(
      <MenuButton label="Wide" items={items(vi.fn())} menuWidth={250}>
        Wide
      </MenuButton>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Wide' }));
    expect(screen.getByRole('menu').style.width).toBe('250px');
    expect(screen.getByRole('menu').style.minWidth).toBe('250px');
    await userEvent.keyboard('{Escape}');

    const { trigger } = show();
    await userEvent.click(trigger);
    expect(screen.getByRole('menu').style.width).toBe('');
  });
});

/**
 * T800: a menu whose button sits in a strip that scrolls sideways (the SQL
 * runner's editor tabs, design 17's Q8) would be clipped at the strip's
 * edge; `fixed` places it by its button's box instead, as a submenu is
 * placed (T266's review).
 */
describe('a menu placed fixed by its button (T800)', () => {
  it('opens below its button’s start, outside any scroller', async () => {
    render(
      <MenuButton label="Actions" items={items(() => undefined)} fixed align="start">
        ⋯
      </MenuButton>,
    );
    const trigger = screen.getByRole('button', { name: 'Actions' });
    trigger.getBoundingClientRect = () =>
      ({ left: 120, right: 142, top: 40, bottom: 62, width: 22, height: 22 }) as DOMRect;

    await userEvent.click(trigger);

    const menu = screen.getByRole('menu');
    expect(menu.style.position).toBe('fixed');
    expect(menu.style.left).toBe('120px');
    expect(menu.style.top).toBe('66px');
  });

  it('closes when what holds its button scrolls, rather than drifting from it (T800’s review)', async () => {
    render(
      <div data-testid="strip">
        <MenuButton label="Actions" items={items(() => undefined)} fixed>
          ⋯
        </MenuButton>
      </div>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Actions' }));

    fireEvent.scroll(screen.getByTestId('strip'));

    expect(screen.queryByRole('menu')).toBeNull();
  });
});
