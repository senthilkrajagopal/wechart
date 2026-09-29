import { useId } from 'react';

import { MY_WORKSPACE, ROOT_FOLDERS, type RootFolder } from './roots';
import { PersonIcon } from './WorkspaceBand';

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
  /**
   * What it holds that the user may see, its subfolders' included: its
   * dashboards, library charts, models and data sources (AC-194, T331).
   */
  readonly itemCount?: number;
  /** Its id in xcube, which names its items (T429, AC-328); none until it has one. */
  readonly xcubeId?: string | null;
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

  /**
   * My workspace heading the tree, as it does with sign-in on, is parted
   * from the shared tree by a rule (design 04, pin 1).
   */
  const parted = roots[0]?.id === MY_WORKSPACE.id && roots.length > 1;
  const node = (folder: RootFolder & { readonly itemCount?: number }, level: number) => {
    const countId = `${base}-${folder.id}-count`;
    const children = childrenOf(folder.id);
    const workspace = folder.id === MY_WORKSPACE.id;
    return (
      <li
        key={folder.id}
        className={parted && workspace && level === 1 ? 'folder-tree__item--parted' : undefined}
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
          // The prototype's tree() indent: 12 px, and 14 more for each level.
          style={{ paddingLeft: 12 + (level - 1) * 14 }}
        >
          {/* A person for My workspace heading the tree (design 04, pin 1);
              with sign-in off, phase 1's ◉ where it comes last; ▣ for any
              other folder (F7). */}
          {workspace && parted ? (
            <span className="itemicon ic-person" data-icon="person" aria-hidden="true">
              <PersonIcon />
            </span>
          ) : (
            <span
              className="itemicon ic-folder"
              data-icon={workspace ? 'personal' : 'folder'}
              aria-hidden="true"
            />
          )}
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
    // A tree's arrow keys (T182, AC-176): ↑ and ↓ move between folders in
    // the order shown, Home and End to the first and last. Each folder is
    // still a button, so Tab and Enter do as they did.
    <ul
      role="tree"
      aria-label="Folders"
      className="folder-tree"
      onKeyDown={(event) => {
        const labels = [
          ...event.currentTarget.querySelectorAll<HTMLElement>('.folder-tree__label'),
        ];
        const at = labels.indexOf(event.target as HTMLElement);
        if (at < 0) return;
        const next =
          event.key === 'ArrowDown'
            ? Math.min(at + 1, labels.length - 1)
            : event.key === 'ArrowUp'
              ? Math.max(at - 1, 0)
              : event.key === 'Home'
                ? 0
                : event.key === 'End'
                  ? labels.length - 1
                  : -1;
        if (next < 0) return;
        event.preventDefault();
        labels[next]?.focus();
      }}
    >
      {roots.map((root) => node(root, 1))}
    </ul>
  );
}
