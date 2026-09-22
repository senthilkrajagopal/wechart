import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { FolderContents, type CatalogItem } from './FolderContents';

/**
 * AC-017: WHEN the user opens Explore, THE SYSTEM SHALL show a folder tree and
 * the contents of the selected folder, listing dashboards and library charts
 * with their type, owner and last-updated time.
 * Fails when: the list omits an item in the folder, or a column is blank for an
 * item that has that value.
 *
 * "No column is blank for an item that has that value" is the part worth
 * testing hardest — a table that renders names and leaves the other three
 * columns empty would satisfy a laxer reading.
 */
const items: CatalogItem[] = [
  {
    kind: 'dashboard',
    id: 'd1',
    title: 'Revenue',
    owner: 'admin',
    updatedAt: '2026-09-19T12:00:00.000Z',
  },
  {
    kind: 'chart',
    id: 'c1',
    title: 'Revenue by region',
    owner: 'analyst',
    updatedAt: '2026-09-18T09:30:00.000Z',
  },
  {
    kind: 'folder',
    id: 'f1',
    title: 'Archive',
    owner: null,
    updatedAt: '2026-09-01T08:00:00.000Z',
  },
];

describe('folder contents (AC-017)', () => {
  it('lists every item', () => {
    render(<FolderContents items={items} />);

    // Header row plus one per item.
    expect(screen.getAllByRole('row')).toHaveLength(items.length + 1);
  });

  it('fills the type, owner and last-updated columns for every item that has them', () => {
    render(<FolderContents items={items} />);

    const dashboard = within(screen.getByTestId('item-d1')).getAllByRole('cell');
    expect(dashboard[0]?.textContent).toContain('Dashboard');
    expect(dashboard[1]?.textContent).toBe('admin');
    expect(dashboard[2]?.textContent?.trim()).not.toBe('');
  });

  it('distinguishes dashboards from charts by label, not only by icon', () => {
    render(<FolderContents items={items} />);

    expect(within(screen.getByTestId('item-d1')).getByText('Dashboard')).toBeTruthy();
    expect(within(screen.getByTestId('item-c1')).getByText('Chart')).toBeTruthy();
  });

  it('shows a placeholder rather than a blank cell for an item with no owner', () => {
    render(<FolderContents items={items} />);

    const folder = within(screen.getByTestId('item-f1')).getAllByRole('cell');
    expect(folder[1]?.textContent?.trim()).not.toBe('');
  });

  it('carries a machine-readable timestamp alongside the shown one', () => {
    render(<FolderContents items={items} />);

    const time = within(screen.getByTestId('item-d1')).getByText(/2026|9\/19/);
    expect(time.closest('time')?.getAttribute('datetime')).toBe('2026-09-19T12:00:00.000Z');
  });

  it('opens an item when its name is activated', async () => {
    const onOpen = vi.fn();
    render(<FolderContents items={items} onOpen={onOpen} />);

    await userEvent.click(screen.getByRole('button', { name: 'Revenue' }));

    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'd1' }));
  });

  it('says the folder is empty rather than rendering a headers-only table', () => {
    render(<FolderContents items={[]} />);

    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByText(/empty/i)).toBeTruthy();
  });
});

/**
 * AC-024: WHEN the user navigates the Explore contents with the keyboard, THE
 * SYSTEM SHALL move the selection with the arrow keys and open the selected
 * item with Enter.
 * Fails when: arrow keys do not move the selection, or Enter does not open the
 * selected item.
 */
describe('keyboard navigation (AC-024)', () => {
  const rowFor = (id: string) => screen.getByTestId(`item-${id}`);

  it('reaches the list in one tab stop, not one per row', async () => {
    render(<FolderContents items={items} />);

    await userEvent.tab();

    // A roving tabindex: with thirty dashboards, one stop per row would make
    // tabbing past the list its own accessibility failure.
    expect(document.activeElement).toBe(rowFor('d1'));
  });

  it('moves the selection down and up with the arrow keys', async () => {
    render(<FolderContents items={items} />);
    await userEvent.tab();

    await userEvent.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(rowFor('c1'));
    expect(rowFor('c1').getAttribute('aria-selected')).toBe('true');

    await userEvent.keyboard('{ArrowUp}');
    expect(document.activeElement).toBe(rowFor('d1'));
  });

  it('stops at the ends rather than wrapping', async () => {
    render(<FolderContents items={items} />);
    await userEvent.tab();

    await userEvent.keyboard('{ArrowUp}');
    expect(document.activeElement).toBe(rowFor('d1'));

    await userEvent.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}');
    expect(document.activeElement).toBe(rowFor('f1'));
  });

  it('jumps to the first and last rows with Home and End', async () => {
    render(<FolderContents items={items} />);
    await userEvent.tab();

    await userEvent.keyboard('{End}');
    expect(document.activeElement).toBe(rowFor('f1'));

    await userEvent.keyboard('{Home}');
    expect(document.activeElement).toBe(rowFor('d1'));
  });

  it('opens the selected item with Enter', async () => {
    const onOpen = vi.fn();
    render(<FolderContents items={items} onOpen={onOpen} />);
    await userEvent.tab();

    await userEvent.keyboard('{ArrowDown}{Enter}');

    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'c1' }));
  });

  it('opens the row that is selected, not always the first', async () => {
    const onOpen = vi.fn();
    render(<FolderContents items={items} onOpen={onOpen} />);
    await userEvent.tab();

    await userEvent.keyboard('{End}{Enter}');

    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'f1' }));
  });

  /**
   * Found by the AC-176 keyboard audit: the row's keys are the row's, not the
   * rename field's or the Move-to list's inside it. Enter in the rename field
   * saves the name — it opened the item, and the rename was lost — and the
   * arrow keys and Home/End act on the field and the list.
   */
  it('leaves the keys of the controls inside a row to them', async () => {
    const onOpen = vi.fn();
    const onRename = vi.fn();
    const onMove = vi.fn();
    render(
      <FolderContents
        items={items}
        onOpen={onOpen}
        onRename={onRename}
        onMove={onMove}
        folders={[{ id: 'f9', title: 'Archive' }]}
      />,
    );
    const row = rowFor('c1');

    await userEvent.click(within(row).getByRole('button', { name: 'Rename' }));
    const field = within(row).getByLabelText(/^New name for/);
    await userEvent.clear(field);
    await userEvent.type(field, 'Renamed{Home}{End}{ArrowUp}{Enter}');

    expect(onRename).toHaveBeenCalledWith(expect.objectContaining({ id: 'c1' }), 'Renamed');
    expect(onOpen).not.toHaveBeenCalled();

    // The Move-to list: arrow keys choose within it, not another row.
    const move = within(rowFor('d1')).getByLabelText(/^Move .* to$/);
    move.focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(move);
  });

  it('puts the keyboard in the rename field, and Escape puts the name back', async () => {
    const onRename = vi.fn();
    render(<FolderContents items={items} onRename={onRename} />);
    const row = rowFor('c1');
    const rename = within(row).getByRole('button', { name: 'Rename' });

    rename.focus();
    await userEvent.keyboard('{Enter}');
    const field = within(row).getByLabelText(/^New name for/);
    expect(document.activeElement).toBe(field);

    await userEvent.keyboard('Other{Escape}');
    expect(within(row).queryByLabelText(/^New name for/)).toBeNull();
    expect(onRename).not.toHaveBeenCalled();
    // Back where the rename began.
    expect(document.activeElement).toBe(within(row).getByRole('button', { name: 'Rename' }));
  });

  it('leaves the empty folder message alone', () => {
    render(<FolderContents items={[]} />);

    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByText(/empty/i)).toBeTruthy();
  });
});
