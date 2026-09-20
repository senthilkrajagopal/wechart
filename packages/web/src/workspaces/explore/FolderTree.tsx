/**
 * The folder tree beside the contents (AC-017).
 *
 * A real `tree`/`treeitem` structure rather than nested links, so the shape is
 * announced and the arrow keys mean something (AC-024, AC-176).
 */
export interface FolderNode {
  readonly id: string;
  readonly title: string;
  readonly parentId: string | null;
}

export interface FolderTreeProps {
  readonly folders: readonly FolderNode[];
  readonly selectedId: string;
  readonly onSelect: (id: string) => void;
  readonly rootId?: string;
  readonly rootTitle?: string;
}

export function FolderTree({
  folders,
  selectedId,
  onSelect,
  rootId = 'root',
  rootTitle = 'All folders',
}: FolderTreeProps) {
  const childrenOf = (parentId: string | null) =>
    folders.filter((folder) => folder.parentId === parentId);

  const renderLevel = (parentId: string | null, level: number) => {
    const children = childrenOf(parentId);
    if (children.length === 0) return null;

    return (
      <ul role="group">
        {children.map((folder) => (
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
            >
              {folder.title}
            </button>
            {renderLevel(folder.id, level + 1)}
          </li>
        ))}
      </ul>
    );
  };

  return (
    <nav aria-label="Folders" className="folder-tree">
      <ul role="tree" aria-label="Folders">
        <li
          role="treeitem"
          aria-label={rootTitle}
          aria-selected={selectedId === rootId}
          aria-level={1}
        >
          <button type="button" className="folder-tree__label" onClick={() => onSelect(rootId)}>
            {rootTitle}
          </button>
          {renderLevel(rootId, 2)}
        </li>
      </ul>
    </nav>
  );
}
