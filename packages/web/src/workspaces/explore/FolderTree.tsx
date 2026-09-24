import { useId } from 'react';

import { ROOT_FOLDERS, type RootFolder } from './roots';

/**
 * The folder tree beside the contents (AC-017): the shared root and "My
 * workspace" at the top (AC-194), each folder with the number of items it
 * holds, its subfolders' included.
 *
 * A real `tree`/`treeitem` structure rather than nested links, so the shape is
 * announced and the arrow keys mean something (AC-024, AC-176).
 */
export interface FolderNode {
  readonly id: string;
  readonly title: string;
  readonly parentId: string | null;
  /** Its dashboards and charts, including its subfolders' (AC-194). */
  readonly itemCount?: number;
}

export interface FolderTreeProps {
  readonly folders: readonly FolderNode[];
  readonly selectedId: string;
  readonly onSelect: (id: string) => void;
  /** The roots, with their counts when known. */
  readonly roots?: readonly (RootFolder & { readonly itemCount?: number })[];
}

export function FolderTree({
  folders,
  selectedId,
  onSelect,
  roots = ROOT_FOLDERS,
}: FolderTreeProps) {
  const base = useId();
  const childrenOf = (parentId: string) => folders.filter((folder) => folder.parentId === parentId);

  const node = (folder: RootFolder & { readonly itemCount?: number }, level: number) => {
    const countId = `${base}-${folder.id}-count`;
    const children = childrenOf(folder.id);
    return (
      <li
        key={folder.id}
        role="treeitem"
        // Named explicitly: a treeitem's computed name otherwise absorbs
        // every descendant's text, so a parent would be announced as the
        // concatenation of its whole subtree.
        aria-label={folder.title}
        aria-selected={folder.id === selectedId}
        aria-level={level}
      >
        <button
          type="button"
          className="folder-tree__label"
          onClick={() => onSelect(folder.id)}
          // The count is said as a description, so the name stays the name.
          aria-describedby={folder.itemCount === undefined ? undefined : countId}
        >
          <span className="folder-tree__title">{folder.title}</span>
          {folder.itemCount === undefined ? null : (
            <span className="folder-tree__count" aria-hidden="true">
              {folder.itemCount}
            </span>
          )}
        </button>
        {/* Outside the button: inside, it would join the button's name. */}
        {folder.itemCount === undefined ? null : (
          <span id={countId} className="visually-hidden">
            {folder.itemCount} {folder.itemCount === 1 ? 'item' : 'items'}
          </span>
        )}
        {children.length > 0 ? (
          <ul role="group">{children.map((child) => node(child, level + 1))}</ul>
        ) : null}
      </li>
    );
  };

  return (
    <ul role="tree" aria-label="Folders" className="folder-tree">
      {roots.map((root) => node(root, 1))}
    </ul>
  );
}
