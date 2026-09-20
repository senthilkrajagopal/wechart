import { render, screen } from '@testing-library/react';
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
    expect(screen.getAllByRole('treeitem').length).toBe(folders.length + 1);
  });
});
