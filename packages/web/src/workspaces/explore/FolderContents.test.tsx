import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { FolderContents, opensFromExplore, type CatalogItem } from './FolderContents';

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
    chartType: 'bar',
    source: 'orders',
    hasFields: true,
    folderId: 'root',
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

    // Type, Built on, Updated, Owner (AC-193's order).
    const dashboard = within(screen.getByTestId('item-d1')).getAllByRole('cell');
    expect(dashboard[0]?.textContent).toContain('Dashboard');
    expect(dashboard[3]?.textContent).toBe('admin');
    expect(dashboard[2]?.textContent?.trim()).not.toBe('');
  });

  it('distinguishes dashboards from charts by label, not only by icon', () => {
    render(<FolderContents items={items} />);

    expect(within(screen.getByTestId('item-d1')).getByText('Dashboard')).toBeTruthy();
    // A chart by its chart type (AC-193), never only "Chart".
    const chart = within(screen.getByTestId('item-c1')).getAllByRole('cell');
    expect(chart[0]?.textContent?.trim()).toBe('Bar');
    expect(chart[1]?.textContent).toBe('orders');
  });

  it('shows a placeholder rather than a blank cell for an item with no owner', () => {
    render(<FolderContents items={[{ ...items[0]!, id: 'd2', owner: null }]} />);

    const dashboard = within(screen.getByTestId('item-d2')).getAllByRole('cell');
    expect(dashboard[3]?.textContent?.trim()).not.toBe('');
    expect(dashboard[3]?.textContent).toBe('—');
  });

  // T244 left these blank, as the prototype's browse() does (F20); its review
  // found that AC-017's Fails-when forbids it: a folder has both values.
  it('fills a folder’s Updated and Owner too, as AC-017 asks of every item', () => {
    render(<FolderContents items={items} />);

    const folder = within(screen.getByTestId('item-f1')).getAllByRole('cell');
    expect(folder[2]?.textContent).toMatch(/^Sep 1(, 2026)?$/);
    expect(folder[3]?.textContent).toBe('—');
  });

  it('carries a machine-readable timestamp alongside the shown one', () => {
    render(<FolderContents items={items} />);

    const time = within(screen.getByTestId('item-d1')).getByText(/^Sep 19(, 2026)?$/);
    expect(time.closest('time')?.getAttribute('datetime')).toBe('2026-09-19T12:00:00.000Z');
    // The prototype's short date, the moment in full on hover (recheck-shell-explore F19).
    expect(time.closest('time')?.getAttribute('title')).toContain('2026');
  });

  it('opens an item when its name is activated', async () => {
    const onOpen = vi.fn();
    render(<FolderContents items={items} onOpen={onOpen} />);

    await userEvent.click(screen.getByRole('button', { name: 'Revenue' }));

    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'd1' }));
  });

  it('opens an item from anywhere on its row, but not from its menu (recheck-shell-explore N11)', async () => {
    const onOpen = vi.fn();
    render(<FolderContents items={items} onOpen={onOpen} onRename={vi.fn()} />);

    await userEvent.click(within(rowFor('d1')).getAllByRole('cell')[0] as HTMLElement);
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'd1' }));

    await userEvent.click(within(rowFor('d1')).getByRole('button', { name: /^Actions for / }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  // Reversed by T244: the prototype keeps the header over one row that says
  // so, where this said the table went (recheck-shell-explore F24).
  it('says the folder is empty in one row under the header, not in a bare header', () => {
    render(<FolderContents items={[]} />);

    expect(screen.getAllByRole('columnheader')).toHaveLength(6);
    expect(screen.getAllByRole('row')).toHaveLength(2);
    const said = screen.getByRole('cell', { name: 'This folder is empty.' });
    expect(said.getAttribute('colspan')).toBe('6');
  });
});

/**
 * AC-024: WHEN the user navigates the Explore contents with the keyboard, THE
 * SYSTEM SHALL move the selection with the arrow keys and open the selected
 * item with Enter.
 * Fails when: arrow keys do not move the selection, or Enter does not open the
 * selected item.
 */
const rowFor = (id: string) => screen.getByTestId(`item-${id}`);

/** Open a row's ⋯ menu and choose one of its items (AC-193). */
async function chooseFromMenu(row: HTMLElement, title: string, item: string) {
  await userEvent.click(within(row).getByRole('button', { name: `Actions for ${title}` }));
  await userEvent.click(screen.getByRole('menuitem', { name: item }));
}

describe('keyboard navigation (AC-024)', () => {
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
    // The selection is the row in the tab order — not `aria-selected`, which
    // a plain table's rows do not take (recheck-shell-explore F27).
    expect(rowFor('c1').getAttribute('tabindex')).toBe('0');
    expect(rowFor('d1').getAttribute('tabindex')).toBe('-1');
    expect(rowFor('c1').hasAttribute('aria-selected')).toBe(false);

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

    await chooseFromMenu(row, 'Revenue by region', 'Rename');
    const field = within(row).getByLabelText(/^New name for/);
    await userEvent.clear(field);
    await userEvent.type(field, 'Renamed{Home}{End}{ArrowUp}{Enter}');

    expect(onRename).toHaveBeenCalledWith(expect.objectContaining({ id: 'c1' }), 'Renamed');
    expect(onOpen).not.toHaveBeenCalled();

    // The Move-to list: arrow keys choose within it, not another row.
    await chooseFromMenu(rowFor('d1'), 'Revenue', 'Move to…');
    const move = within(rowFor('d1')).getByLabelText(/^Move .* to$/);
    move.focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(move);
  });

  it('puts the keyboard in the rename field, and Escape puts the name back', async () => {
    const onRename = vi.fn();
    render(<FolderContents items={items} onRename={onRename} />);
    const row = rowFor('c1');
    const trigger = within(row).getByRole('button', { name: 'Actions for Revenue by region' });

    trigger.focus();
    await userEvent.keyboard('{Enter}');
    await userEvent.keyboard('{Enter}');
    const field = within(row).getByLabelText(/^New name for/);
    expect(document.activeElement).toBe(field);

    await userEvent.keyboard('Other{Escape}');
    expect(within(row).queryByLabelText(/^New name for/)).toBeNull();
    expect(onRename).not.toHaveBeenCalled();
    // Back where the rename began: the row's menu button.
    expect(document.activeElement).toBe(trigger);
  });

  it('leaves the empty folder message alone', () => {
    render(<FolderContents items={[]} />);

    expect(screen.queryByRole('button', { name: /^Actions for / })).toBeNull();
    expect(screen.getByText(/empty/i)).toBeTruthy();
  });
});

/**
 * AC-193: … showing a dashboard's number of page tabs, a chart's chart type
 * and the cube or view it is built on, and a subfolder's item count, and SHALL
 * offer rename and move through a menu on each row.
 * `Fails when: … a row shows a rename or move control before its menu is
 * opened, or a move offers the item's own folder or, for a folder, itself or a
 * folder inside it.`
 */
describe("the contents' columns and row menu (AC-193)", () => {
  const listed: CatalogItem[] = [
    {
      kind: 'folder',
      id: 'sub',
      title: 'Sub',
      owner: 'admin',
      updatedAt: '2026-09-01T08:00:00.000Z',
      folderId: 'home',
      itemCount: 1,
    },
    {
      kind: 'dashboard',
      id: 'board',
      title: 'Board',
      owner: 'admin',
      updatedAt: '2026-09-01T08:00:00.000Z',
      folderId: 'home',
      tabs: 3,
    },
    {
      kind: 'chart',
      id: 'auto',
      title: 'Auto',
      owner: 'admin',
      updatedAt: '2026-09-01T08:00:00.000Z',
      folderId: 'home',
      chartType: null,
      source: 'order_summary',
      hasFields: true,
    },
  ];
  const folders = [
    { id: 'root', title: 'Shared', parentId: null },
    { id: 'home', title: 'Home', parentId: 'root' },
    { id: 'sub', title: 'Sub', parentId: 'home' },
    { id: 'inner', title: 'Inner', parentId: 'sub' },
    { id: 'elsewhere', title: 'Elsewhere', parentId: 'root' },
  ];
  const sourceKinds = new Map([['order_summary', 'view' as const]]);

  it('says what each row is built on: items, tabs, or a cube or view', () => {
    render(<FolderContents items={listed} sourceKinds={sourceKinds} />);

    const builtOn = (id: string) => within(rowFor(id)).getAllByRole('cell')[1]?.textContent;
    expect(builtOn('sub')).toBe('1 item');
    expect(builtOn('board')).toBe('3 tabs');
    expect(builtOn('auto')).toBe('view: order_summary');
    expect(within(rowFor('auto')).getAllByRole('cell')[0]?.textContent?.trim()).toBe('Automatic');
  });

  it("says in a search's results which folder each item is in", () => {
    // The prototype's Built on in search: "3 tabs · Finance" (explore.js).
    render(
      <FolderContents
        items={listed}
        sourceKinds={sourceKinds}
        folderNames={new Map([['home', 'Home']])}
      />,
    );

    const builtOn = (id: string) => within(rowFor(id)).getAllByRole('cell')[1]?.textContent;
    expect(builtOn('board')).toBe('3 tabs · Home');
    expect(builtOn('auto')).toBe('view: order_summary · Home');
  });

  it('does not offer the top to an item already there', async () => {
    const atTop: CatalogItem = { ...listed[1]!, id: 'top', title: 'Top', folderId: 'root' };
    render(<FolderContents items={[atTop]} folders={folders} onMove={vi.fn()} />);

    await chooseFromMenu(rowFor('top'), 'Top', 'Move to…');
    const offered = within(within(rowFor('top')).getByRole('combobox'))
      .getAllByRole('option')
      .map((option) => option.textContent);
    // Each by its path: two folders may share a name (recheck-shell-explore F16).
    expect(offered).toEqual([
      'Move to…',
      'Shared / Home',
      'Shared / Home / Sub',
      'Shared / Home / Sub / Inner',
      'Shared / Elsewhere',
    ]);
  });

  it('offers a folder its sibling folders (recheck-shell-explore N17)', async () => {
    const home: CatalogItem = { ...listed[0]!, id: 'home', title: 'Home', folderId: 'root' };
    render(<FolderContents items={[home]} folders={folders} onMove={vi.fn()} />);

    await chooseFromMenu(rowFor('home'), 'Home', 'Move to…');
    const offered = within(within(rowFor('home')).getByRole('combobox'))
      .getAllByRole('option')
      .map((option) => option.textContent);
    // Not the folder it is in, itself or what is beneath it; its sibling, yes.
    expect(offered).toEqual(['Move to…', 'Shared / Elsewhere']);
  });

  it('shows no rename or move control on a row until its menu is opened', () => {
    render(<FolderContents items={listed} folders={folders} onRename={vi.fn()} onMove={vi.fn()} />);

    for (const id of ['sub', 'board', 'auto']) {
      expect(within(rowFor(id)).queryByRole('button', { name: 'Rename' })).toBeNull();
      expect(within(rowFor(id)).queryByRole('combobox')).toBeNull();
    }
  });

  it("never offers a chart's own folder as where to move it", async () => {
    const onMove = vi.fn();
    render(<FolderContents items={listed} folders={folders} onMove={onMove} />);

    await chooseFromMenu(rowFor('auto'), 'Auto', 'Move to…');
    const list = within(rowFor('auto')).getByRole('combobox', { name: 'Move Auto to' });
    expect(document.activeElement).toBe(list);
    const offered = within(list)
      .getAllByRole('option')
      .map((option) => option.textContent);
    expect(offered).toEqual([
      'Move to…',
      'Shared',
      'Shared / Home / Sub',
      'Shared / Home / Sub / Inner',
      'Shared / Elsewhere',
    ]);

    await userEvent.selectOptions(list, 'Shared / Elsewhere');
    expect(onMove).toHaveBeenCalledWith(expect.objectContaining({ id: 'auto' }), 'elsewhere');
  });

  it('never offers a folder itself, or a folder inside it, as where to move it', async () => {
    render(<FolderContents items={listed} folders={folders} onMove={vi.fn()} />);

    await chooseFromMenu(rowFor('sub'), 'Sub', 'Move to…');
    const offered = within(within(rowFor('sub')).getByRole('combobox'))
      .getAllByRole('option')
      .map((option) => option.textContent);
    expect(offered).toEqual(['Move to…', 'Shared', 'Shared / Elsewhere']);
  });

  it('puts the Move list away with Escape, back on the row menu', async () => {
    render(<FolderContents items={listed} folders={folders} onMove={vi.fn()} />);

    await chooseFromMenu(rowFor('board'), 'Board', 'Move to…');
    await userEvent.keyboard('{Escape}');

    expect(within(rowFor('board')).queryByRole('combobox')).toBeNull();
    expect(document.activeElement).toBe(
      within(rowFor('board')).getByRole('button', { name: 'Actions for Board' }),
    );
  });

  // T243's review: left open, it sat over the next row's ⋯ until a choice or
  // Escape. Leaving it puts it away, and moves nothing.
  it('puts the Move list away when the focus leaves it, moving nothing', async () => {
    const onMove = vi.fn();
    render(<FolderContents items={listed} folders={folders} onMove={onMove} />);

    await chooseFromMenu(rowFor('board'), 'Board', 'Move to…');
    expect(within(rowFor('board')).getByRole('combobox')).toBe(document.activeElement);
    await userEvent.tab();

    expect(within(rowFor('board')).queryByRole('combobox')).toBeNull();
    expect(onMove).not.toHaveBeenCalled();
  });
});

/**
 * T334, AC-269: a folder's models are listed beside its dashboards and
 * charts, labelled by kind, with Built on "_n_ cubes · _n_ views"
 * (references.md §4), and open in the model editor.
 */
describe('models in a folder (T334, AC-269)', () => {
  const model = (id: string, folderId: string, declares = { cubes: 1, views: 0 }): CatalogItem => ({
    kind: 'model',
    id,
    title: id.slice(id.lastIndexOf('/') + 1),
    owner: null,
    updatedAt: '2026-09-20T10:00:00.000Z',
    folderId,
    declares,
  });
  const models = [
    model('cubes/orders.yml', 'root'),
    model('views/summary.yml', 'root', { cubes: 0, views: 1 }),
    model('cubes/returns.yml', 'emea', { cubes: 2, views: 3 }),
  ];

  it('labels each a model, built on its cubes and views', () => {
    render(<FolderContents items={models} />);

    const cells = (id: string) =>
      within(screen.getByTestId(`item-${id}`))
        .getAllByRole('cell')
        .map((cell) => cell.textContent);
    expect(cells('cubes/orders.yml').slice(0, 2)).toEqual(['Model', '1 cube · 0 views']);
    expect(cells('views/summary.yml').slice(0, 2)).toEqual(['Model', '0 cubes · 1 view']);
    expect(cells('cubes/returns.yml').slice(0, 2)).toEqual(['Model', '2 cubes · 3 views']);
    expect(
      screen
        .getByTestId('item-cubes/orders.yml')
        .querySelector('.itemicon')
        ?.getAttribute('data-icon'),
    ).toBe('model');
  });

  it('offers no rename or move: a model’s name is its file’s', () => {
    render(<FolderContents items={models} onRename={vi.fn()} onMove={vi.fn()} folders={[]} />);

    expect(screen.queryByRole('button', { name: 'Actions for orders.yml' })).toBeNull();
  });

  it('opens a model it may open, and leaves one it may not as its name alone', async () => {
    const onOpen = vi.fn();
    render(
      <FolderContents
        items={models}
        onOpen={onOpen}
        // Explore's own rule (T334's review): the root's models open.
        opens={opensFromExplore}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'orders.yml' }));
    expect(onOpen).toHaveBeenCalledWith(models[0]);

    onOpen.mockClear();
    expect(screen.queryByRole('button', { name: 'returns.yml' })).toBeNull();
    await userEvent.click(screen.getByText('returns.yml'));
    screen.getByTestId('item-cubes/returns.yml').focus();
    await userEvent.keyboard('{Enter}');
    expect(onOpen).not.toHaveBeenCalled();
  });
});
