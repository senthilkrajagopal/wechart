import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { NewItemDialog } from './NewItemDialog';

/**
 * T345 (AC-282; direction.md rule 74; references.md "New in My workspace"):
 * a dashboard or chart made in the workspace takes its name and the shared
 * folder it is to go to, from the folders where its author has read-write
 * access (`GET /api/folders/targets`), chosen for them when there is one.
 */
const targets = [
  { id: 'root', path: [] },
  { id: 'f-sales', path: ['Finance', 'Sales'] },
];

describe('the folder a new workspace item is to go to (T345, AC-282)', () => {
  it('lists the folders its author writes, by path, and makes nothing until one is chosen', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    render(
      <NewItemDialog
        kind="dashboard"
        defaultTitle="Untitled dashboard"
        targets={targets}
        onCreate={onCreate}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole('dialog', { name: 'New dashboard in My workspace' })).toBeDefined();
    // Design 04, state A (T692): a tree of full paths, a folder on a target's
    // path that isn't one shown for where it is, and none chosen yet.
    const picker = screen.getByRole('tree', { name: 'Target folder' });
    expect([...picker.querySelectorAll('[role="treeitem"]')].map((row) => row.textContent)).toEqual(
      ['Shared', 'Finance', 'Finance / Sales'],
    );
    expect(picker.querySelector('[aria-selected="true"]')).toBeNull();
    // Both fields required, as the design marks them; its help line beneath.
    expect(screen.getByText('Name').parentElement?.textContent).toBe('Name · required');
    expect(screen.getByText(/^Only folders where/).textContent).toBe(
      'Only folders where you have read-write access.',
    );
    const make = screen.getByRole('button', { name: 'Create' });
    expect(make).toHaveProperty('disabled', true);

    const name = screen.getByRole('textbox', { name: 'Name' });
    expect(name).toHaveProperty('value', 'Untitled dashboard');
    await user.clear(name);
    await user.type(name, 'EMEA revenue');
    await user.click(screen.getByRole('treeitem', { name: 'Finance / Sales' }));
    // The note names the folder chosen, in bold, rather than "this folder".
    const note = screen.getByText(/^It stays private in My workspace until you propose it to/);
    expect(note.textContent).toBe(
      'It stays private in My workspace until you propose it to Finance / Sales.',
    );
    expect(note.querySelector('b')?.textContent).toBe('Finance / Sales');
    await user.click(make);
    expect(onCreate).toHaveBeenCalledWith('EMEA revenue', 'f-sales');
  });

  /**
   * Design 04, state B (T692): with more than about ten folders, a filter
   * heads the tree and matches any part of a path; it says how many of all
   * match. Type to filter, arrows to move, Enter to choose, as the design
   * notes it.
   */
  it('filters many folders by any part of their paths, and says how many match', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    const many = [
      { id: 'sales', path: ['Sales'] },
      { id: 'emea', path: ['Sales', 'EMEA'] },
      { id: 'dach', path: ['Sales', 'EMEA', 'DACH'] },
      { id: 'nordics', path: ['Sales', 'EMEA', 'Nordics'] },
      { id: 'support-emea', path: ['Support', 'EMEA'] },
      ...Array.from({ length: 8 }, (_, at) => ({
        id: `f${String(at)}`,
        path: [`Ops ${String(at)}`],
      })),
    ];
    render(
      <NewItemDialog
        kind="dashboard"
        defaultTitle="Untitled dashboard"
        targets={many}
        onCreate={onCreate}
        onClose={vi.fn()}
      />,
    );
    const filter = screen.getByRole('searchbox', { name: 'Filter folders' });
    // The design's search icon at its head (state B; T697, the coordinator's call).
    expect(filter.parentElement?.querySelector('svg[data-icon="search"]')).not.toBeNull();
    await user.type(filter, 'emea');
    const tree = screen.getByRole('tree', { name: 'Target folder' });
    expect([...tree.querySelectorAll('[role="treeitem"]')].map((row) => row.textContent)).toEqual([
      'Sales / EMEA',
      'Sales / EMEA / DACH',
      'Sales / EMEA / Nordics',
      'Support / EMEA',
    ]);
    // The matching part in bold.
    expect(tree.querySelector('[role="treeitem"] b')?.textContent).toBe('EMEA');
    expect(screen.getByText(/folders where you have read-write access\.$/).textContent).toBe(
      '4 of 13 folders where you have read-write access.',
    );
    // The arrows move the choice among what matches, from the filter.
    await user.keyboard('{ArrowDown}{ArrowDown}');
    expect(tree.querySelector('[aria-selected="true"]')?.textContent).toBe('Sales / EMEA / DACH');
    await user.keyboard('{Enter}');
    await user.click(screen.getByRole('button', { name: 'Create' }));
    expect(onCreate).toHaveBeenCalledWith('Untitled dashboard', 'dach');

    // A choice the filter hides gives way to Enter: it chooses the first match
    // (T692's review), rather than leaving the hidden one chosen.
    await user.clear(filter);
    await user.type(filter, 'ops 3');
    expect(tree.querySelector('[aria-selected="true"]')).toBeNull();
    await user.keyboard('{Enter}');
    expect(tree.querySelector('[aria-selected="true"]')?.textContent).toBe('Ops 3');
  });

  it('chooses the one there is, needs a name, and says so where there is no folder', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    const { unmount } = render(
      <NewItemDialog
        kind="chart"
        defaultTitle="Untitled chart"
        targets={[targets[1]!]}
        onCreate={onCreate}
        onClose={vi.fn()}
      />,
    );
    // The one there is, chosen for them (design 04, state A).
    expect(
      screen.getByRole('treeitem', { name: 'Finance / Sales' }).getAttribute('aria-selected'),
    ).toBe('true');
    const make = screen.getByRole('button', { name: 'Create' });
    await user.clear(screen.getByRole('textbox', { name: 'Name' }));
    expect(make).toHaveProperty('disabled', true);
    await user.type(screen.getByRole('textbox', { name: 'Name' }), '  Margin  ');
    await user.click(make);
    expect(onCreate).toHaveBeenCalledWith('Margin', 'f-sales');
    unmount();

    render(
      <NewItemDialog
        kind="chart"
        defaultTitle="Untitled chart"
        targets={[]}
        onCreate={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByRole('note').textContent).toBe(
      'You have read-write access to no shared folder, so there is nowhere for it to go.',
    );
    expect(screen.getByRole('button', { name: 'Create' })).toHaveProperty('disabled', true);
  });

  /**
   * T347 (AC-282's model half, AC-222): a cube or view made in My workspace
   * asks where it is to go as a dashboard does, its name being the one the
   * model gives it.
   */
  it('asks a new cube or view for its name and the folder it is to go to', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    render(
      <NewItemDialog
        kind="cube"
        defaultTitle="new_cube_1"
        targets={targets}
        onCreate={onCreate}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByRole('dialog', { name: 'New cube in My workspace' })).toBeDefined();
    await user.clear(screen.getByRole('textbox', { name: 'Name' }));
    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'orders_emea');
    await user.click(screen.getByRole('treeitem', { name: 'Finance / Sales' }));
    await user.click(screen.getByRole('button', { name: 'Create' }));
    expect(onCreate).toHaveBeenCalledWith('orders_emea', 'f-sales');
  });

  // Only a name xcube takes for an item (T347's review): said before Create, not at Save.
  it('takes only a name a cube can have', async () => {
    const user = userEvent.setup();
    render(
      <NewItemDialog
        kind="view"
        defaultTitle="new_view_1"
        targets={[targets[1]!]}
        onCreate={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    const name = screen.getByRole('textbox', { name: 'Name' });
    await user.clear(name);
    await user.type(name, 'My Sales');
    expect(screen.getByRole('button', { name: 'Create' })).toHaveProperty('disabled', true);
    // Said beside the field, as its description.
    const rule = document.getElementById(name.getAttribute('aria-describedby') ?? '');
    // R72's grammar, core's one rule (T703, AC-426).
    expect(rule?.textContent).toBe(
      '“My Sales” isn’t a name: start with a letter, then use letters, digits and single underscores, not ending in one, at most 40 characters.',
    );
    await user.clear(name);
    await user.type(name, 'Table');
    expect(screen.getByRole('button', { name: 'Create' })).toHaveProperty('disabled', true);
    expect(document.getElementById(name.getAttribute('aria-describedby') ?? '')?.textContent).toBe(
      '“Table” is a reserved word, so a cube or view can’t take it.',
    );
    await user.clear(name);
    await user.type(name, 'My_sales');
    expect(screen.getByRole('button', { name: 'Create' })).toHaveProperty('disabled', false);
  });

  it('closes on Cancel and Escape', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <NewItemDialog
        kind="dashboard"
        defaultTitle="Untitled dashboard"
        targets={targets}
        onCreate={vi.fn()}
        onClose={onClose}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  /**
   * T405 (AC-176; rule 85): a name typed is asked about before Escape or
   * Cancel loses it, and focus goes back to what opened the dialog.
   */
  it('asks before losing a typed name, and gives focus back to its opener', async () => {
    const user = userEvent.setup();
    function Opener() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            New
          </button>
          {open ? (
            <NewItemDialog
              kind="dashboard"
              defaultTitle="Untitled dashboard"
              targets={targets}
              onCreate={vi.fn()}
              onClose={() => setOpen(false)}
            />
          ) : null}
        </>
      );
    }
    render(<Opener />);
    const opener = screen.getByRole('button', { name: 'New' });
    await user.click(opener);
    // The field by its accessible name: "· required" is said by aria-required (T692).
    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Revenue');
    await user.keyboard('{Escape}');
    const asking = screen.getByRole('alertdialog', { name: 'Discard your changes?' });
    expect(asking.textContent).toContain('The name you typed isn’t kept.');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Name' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.click(screen.getByRole('button', { name: 'Discard changes' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(opener));
  });
});
