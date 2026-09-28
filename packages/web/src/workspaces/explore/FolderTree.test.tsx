import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { FolderTree, type FolderNode } from './FolderTree';

/** AC-017: a folder tree beside the selected folder's contents. */
const folders: FolderNode[] = [
  { id: 'finance', title: 'Finance', parentId: 'root' },
  { id: 'ops', title: 'Operations', parentId: 'root' },
  { id: 'quarterly', title: 'Quarterly', parentId: 'finance' },
];

describe('folder tree (AC-017)', () => {
  it('shows every folder', () => {
    render(<FolderTree folders={folders} selectedId="root" onSelect={vi.fn()} />);

    for (const folder of folders) {
      expect(screen.getByRole('button', { name: folder.title })).toBeTruthy();
    }
  });

  it('nests a folder under its parent, with the depth announced', () => {
    render(<FolderTree folders={folders} selectedId="root" onSelect={vi.fn()} />);

    const quarterly = screen.getByRole('treeitem', { name: /quarterly/i });
    expect(quarterly.getAttribute('aria-level')).toBe('3');
  });

  it('marks the selected folder for assistive technology, not by colour alone', () => {
    render(<FolderTree folders={folders} selectedId="ops" onSelect={vi.fn()} />);

    const selected = screen.getByRole('treeitem', { selected: true });
    expect(selected.textContent).toContain('Operations');
  });

  it('selects a folder when activated', async () => {
    const onSelect = vi.fn();
    render(<FolderTree folders={folders} selectedId="root" onSelect={onSelect} />);

    await userEvent.click(screen.getByRole('button', { name: 'Finance' }));

    expect(onSelect).toHaveBeenCalledWith('finance');
  });

  it('is a tree, so its shape is conveyed structurally', () => {
    render(<FolderTree folders={folders} selectedId="root" onSelect={vi.fn()} />);

    expect(screen.getByRole('tree', { name: /folders/i })).toBeTruthy();
    // Every folder, and the two roots (AC-194).
    expect(screen.getAllByRole('treeitem').length).toBe(folders.length + 2);
  });
});

/**
 * AC-194: … holding a shared root and a personal "My workspace" root, each
 * folder showing the number of items it holds including those in its
 * subfolders.
 */
describe('the roots and counts (AC-194)', () => {
  it('has the shared root and My workspace at the top', () => {
    render(<FolderTree folders={folders} selectedId="root" onSelect={vi.fn()} />);

    const top = screen
      .getAllByRole('treeitem')
      .filter((item) => item.getAttribute('aria-level') === '1')
      .map((item) => item.getAttribute('aria-label'));
    expect(top).toEqual(['Shared', 'My workspace']);
  });

  it('puts a folder under My workspace when that is its parent', () => {
    render(
      <FolderTree
        folders={[...folders, { id: 'drafts', title: 'Drafts', parentId: 'mine' }]}
        selectedId="root"
        onSelect={vi.fn()}
      />,
    );

    const mine = screen.getByRole('treeitem', { name: 'My workspace' });
    expect(within(mine).getByRole('treeitem', { name: 'Drafts' }).getAttribute('aria-level')).toBe(
      '2',
    );
  });

  it('shows each count, and says it as the folder’s description', () => {
    render(
      <FolderTree
        folders={[{ id: 'finance', title: 'Finance', parentId: 'root', itemCount: 3 }]}
        roots={[
          { id: 'root', title: 'Shared', itemCount: 12 },
          { id: 'mine', title: 'My workspace', itemCount: 1 },
        ]}
        selectedId="root"
        onSelect={vi.fn()}
      />,
    );

    const described = (button: HTMLElement) =>
      document.getElementById(button.getAttribute('aria-describedby') ?? '')?.textContent;
    const finance = screen.getByRole('button', { name: 'Finance' });
    expect(finance.querySelector('.folder-tree__count')?.textContent).toBe('3');
    expect(described(finance)).toBe('3 items');
    expect(described(screen.getByRole('button', { name: 'My workspace' }))).toBe('1 item');
  });
});

/**
 * T498 (AC-343; design 04 of 2026-09-27, pin 1): with sign-in on, My
 * workspace comes first, under a person icon, and a rule parts it from the
 * shared tree.
 */
describe('My workspace first (T498)', () => {
  const roots = [
    { id: 'mine', title: 'My workspace', itemCount: 1 },
    { id: 'root', title: 'Shared', itemCount: 12 },
  ];

  it('heads the tree with a person icon, and a rule under it before Shared', () => {
    render(<FolderTree folders={folders} roots={roots} selectedId="mine" onSelect={vi.fn()} />);

    const top = screen
      .getAllByRole('treeitem')
      .filter((item) => item.getAttribute('aria-level') === '1');
    expect(top.map((item) => item.getAttribute('aria-label'))).toEqual(['My workspace', 'Shared']);
    const mine = screen.getByRole('button', { name: 'My workspace' });
    expect(mine.querySelector('.itemicon')?.getAttribute('data-icon')).toBe('person');
    expect(mine.querySelector('.itemicon svg')).not.toBeNull();
    expect(top[0]?.classList.contains('folder-tree__item--parted')).toBe(true);
    expect(top[1]?.classList.contains('folder-tree__item--parted')).toBe(false);
  });

  it('draws no rule where My workspace comes last, as with sign-in off', () => {
    render(
      <FolderTree
        folders={folders}
        roots={[...roots].reverse()}
        selectedId="root"
        onSelect={vi.fn()}
      />,
    );

    expect(document.querySelector('.folder-tree__item--parted')).toBeNull();
    // Phase 1's glyph, as it was.
    expect(
      screen
        .getByRole('button', { name: 'My workspace' })
        .querySelector('.itemicon')
        ?.getAttribute('data-icon'),
    ).toBe('personal');
  });
});
