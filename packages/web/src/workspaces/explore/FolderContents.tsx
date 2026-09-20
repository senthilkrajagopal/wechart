import { useState } from 'react';

/**
 * The contents of the selected folder (AC-017): sub-folders, dashboards and
 * library charts, each with its type, owner and last-updated time.
 *
 * A real `<table>`, so the column a value belongs to is carried by the markup
 * rather than by position alone (AC-176, AC-178).
 */
export interface CatalogItem {
  readonly kind: 'folder' | 'dashboard' | 'chart';
  readonly id: string;
  readonly title: string;
  readonly owner: string | null;
  readonly updatedAt: string;
}

export interface FolderMove {
  readonly id: string;
  readonly title: string;
}

export interface FolderContentsProps {
  readonly items: readonly CatalogItem[];
  readonly onOpen?: (item: CatalogItem) => void;
  /** Renaming and moving keep the object's id, so references keep working (AC-021). */
  readonly onRename?: (item: CatalogItem, title: string) => void;
  readonly onMove?: (item: CatalogItem, folderId: string) => void;
  readonly folders?: readonly FolderMove[];
}

const TYPE_LABEL: Record<CatalogItem['kind'], string> = {
  folder: 'Folder',
  dashboard: 'Dashboard',
  chart: 'Chart',
};

const TYPE_ICON: Record<CatalogItem['kind'], string> = {
  folder: '🗀',
  dashboard: '▤',
  chart: '▦',
};

export function FolderContents({
  items,
  onOpen,
  onRename,
  onMove,
  folders = [],
}: FolderContentsProps) {
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  if (items.length === 0) {
    return <p className="folder-contents__empty">This folder is empty.</p>;
  }

  return (
    <table className="folder-contents">
      <caption className="visually-hidden">Contents of this folder</caption>
      <thead>
        <tr>
          <th scope="col">Name</th>
          <th scope="col">Type</th>
          <th scope="col">Owner</th>
          <th scope="col">Last updated</th>
          <th scope="col">Actions</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => (
          <tr key={`${item.kind}:${item.id}`} data-testid={`item-${item.id}`}>
            <th scope="row">
              {renaming === item.id ? (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (draft.trim() !== '') onRename?.(item, draft.trim());
                    setRenaming(null);
                  }}
                >
                  <label htmlFor={`rename-${item.id}`} className="visually-hidden">
                    New name for {item.title}
                  </label>
                  <input
                    id={`rename-${item.id}`}
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                  />
                  <button type="submit">Save</button>
                </form>
              ) : (
                <button type="button" className="link-button" onClick={() => onOpen?.(item)}>
                  {item.title}
                </button>
              )}
            </th>
            <td>
              {/* Type is an icon and a label, never the icon alone. */}
              <span data-icon={item.kind} aria-hidden="true">
                {TYPE_ICON[item.kind]}
              </span>{' '}
              {TYPE_LABEL[item.kind]}
            </td>
            <td>{item.owner ?? '—'}</td>
            <td>
              <time dateTime={item.updatedAt}>{new Date(item.updatedAt).toLocaleString()}</time>
            </td>
            <td>
              <button
                type="button"
                onClick={() => {
                  setRenaming(item.id);
                  setDraft(item.title);
                }}
              >
                Rename
              </button>
              {folders.length > 0 && onMove ? (
                <>
                  <label htmlFor={`move-${item.id}`} className="visually-hidden">
                    Move {item.title} to
                  </label>
                  <select
                    id={`move-${item.id}`}
                    defaultValue=""
                    onChange={(event) => {
                      if (event.target.value) onMove(item, event.target.value);
                    }}
                  >
                    <option value="">Move to…</option>
                    {folders.map((folder) => (
                      <option key={folder.id} value={folder.id}>
                        {folder.title}
                      </option>
                    ))}
                  </select>
                </>
              ) : null}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
