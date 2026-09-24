import { useEffect, useRef, useState } from 'react';

import { MenuButton } from '../../shell/MenuButton';
import { chartTypeText } from './chartTypeLabels';

/**
 * The contents of the selected folder (AC-017), under the prototype's columns
 * (AC-193): Name, Type, Built on, Updated and Owner — subfolders first, then
 * dashboards, then charts, in the order the listing gives them.
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
  /** A dashboard's description, beneath its name (AC-197); absent is none. */
  readonly description?: string | null;
  /** The folder it sits in, which a move does not offer (AC-193). */
  readonly folderId?: string | null;
  /** A chart's saved type; null when the recommender picks it. */
  readonly chartType?: string | null;
  /** The cube or view a chart is built on. */
  readonly source?: string | null;
  /** Whether a chart has any field — one with none is incomplete. */
  readonly hasFields?: boolean;
  /** A dashboard's page tabs. */
  readonly tabs?: number | null;
  /** A folder's dashboards and charts, including its subfolders'. */
  readonly itemCount?: number | null;
}

export interface FolderMove {
  readonly id: string;
  readonly title: string;
  /** Its parent, so a folder is never moved into itself or beneath itself. */
  readonly parentId?: string | null;
}

export interface FolderContentsProps {
  readonly items: readonly CatalogItem[];
  readonly onOpen?: (item: CatalogItem) => void;
  /** Renaming and moving keep the object's id, so references keep working (AC-021). */
  readonly onRename?: (item: CatalogItem, title: string) => void;
  readonly onMove?: (item: CatalogItem, folderId: string) => void;
  /** Where an item can be moved to, the top included. */
  readonly folders?: readonly FolderMove[];
  /** Whether each cube or view name is a cube or a view, from the model's meta. */
  readonly sourceKinds?: ReadonlyMap<string, 'cube' | 'view'>;
  /**
   * Each folder's name by id, given for a search's results: they come from
   * every folder, so Built on also says which one (the prototype's search).
   */
  readonly folderNames?: ReadonlyMap<string, string>;
  /** What an empty list says: a folder's, or a search's (AC-019). */
  readonly emptyText?: string;
}

const TYPE_LABEL: Record<CatalogItem['kind'], string> = {
  folder: 'Folder',
  dashboard: 'Dashboard',
  chart: 'Chart',
};

const plural = (count: number, one: string) => `${String(count)} ${one}${count === 1 ? '' : 's'}`;

/** The Type column: a chart by its chart type, never only "Chart" (AC-193). */
function typeText(item: CatalogItem): string {
  return item.kind === 'chart' ? chartTypeText(item) : TYPE_LABEL[item.kind];
}

/** The Built on column: a folder's items, a dashboard's tabs, a chart's cube or view. */
function builtOnText(item: CatalogItem, kinds: ReadonlyMap<string, 'cube' | 'view'>): string {
  if (item.kind === 'folder') return item.itemCount == null ? '—' : plural(item.itemCount, 'item');
  if (item.kind === 'dashboard') return item.tabs == null ? '—' : plural(item.tabs, 'tab');
  if (item.source == null || item.source === '') return '—';
  // Unknown to the meta (not loaded, or hidden): the name alone, not a guess.
  const kind = kinds.get(item.source);
  return kind === undefined ? item.source : `${kind}: ${item.source}`;
}

/**
 * Where an item may be moved: anywhere but the folder it is already in, and,
 * for a folder, neither itself nor any folder beneath it — a folder moved
 * into its own subtree would detach from the tree altogether.
 */
function targetsFor(item: CatalogItem, folders: readonly FolderMove[]): FolderMove[] {
  const excluded = new Set<string>();
  if (item.folderId != null) excluded.add(item.folderId);
  if (item.kind === 'folder') {
    excluded.add(item.id);
    // Bounded by the number of folders, so a cycle in stored data cannot hang it.
    for (let grew = true, guard = 0; grew && guard <= folders.length; guard += 1) {
      grew = false;
      for (const folder of folders)
        if (folder.parentId != null && excluded.has(folder.parentId) && !excluded.has(folder.id)) {
          excluded.add(folder.id);
          grew = true;
        }
    }
  }
  return folders.filter((folder) => !excluded.has(folder.id));
}

export function FolderContents({
  items,
  onOpen,
  onRename,
  onMove,
  folders = [],
  sourceKinds = new Map(),
  folderNames,
  emptyText = 'This folder is empty.',
}: FolderContentsProps) {
  const builtOn = (item: CatalogItem) => {
    const text = builtOnText(item, sourceKinds);
    const folder = item.folderId == null ? undefined : folderNames?.get(item.folderId);
    return folder === undefined ? text : `${text} · ${folder}`;
  };
  const [renaming, setRenaming] = useState<string | null>(null);
  const [moving, setMoving] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [selected, setSelected] = useState(0);
  const rowRefs = useRef<(HTMLTableRowElement | null)[]>([]);
  /** Each row's actions cell, whose menu button focus goes back to. */
  const actionRefs = useRef(new Map<string, HTMLTableCellElement>());
  /**
   * The row whose ⋯ button focus goes back to once a rename or a move is put
   * away. Done after the render that brings the button back, not at the
   * moment of the key: until then the row still shows the field or list.
   */
  const refocus = useRef<string | null>(null);
  const backToMenu = (id: string) => {
    refocus.current = id;
  };
  useEffect(() => {
    const id = refocus.current;
    if (id === null) return;
    refocus.current = null;
    actionRefs.current.get(id)?.querySelector<HTMLButtonElement>('[aria-haspopup="menu"]')?.focus();
  });

  /**
   * AC-024: arrow keys move the selection, Enter opens it.
   *
   * A roving tabindex, so the list is one stop in the page's tab order rather
   * than one stop per row — with thirty dashboards, tabbing through every one
   * to reach what follows is its own accessibility failure.
   */
  const focusRow = (index: number) => {
    const clamped = Math.max(0, Math.min(index, items.length - 1));
    setSelected(clamped);
    rowRefs.current[clamped]?.focus();
  };

  const onKeyDown = (event: React.KeyboardEvent, index: number) => {
    // The row's own keys only: those pressed in its rename field, its
    // buttons or its Move-to list are theirs — Enter saving a rename, the
    // arrows choosing a folder (found by the AC-176 keyboard audit).
    if (event.target !== event.currentTarget) return;
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        focusRow(index + 1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        focusRow(index - 1);
        break;
      case 'Home':
        event.preventDefault();
        focusRow(0);
        break;
      case 'End':
        event.preventDefault();
        focusRow(items.length - 1);
        break;
      case 'Enter': {
        event.preventDefault();
        const item = items[index];
        if (item) onOpen?.(item);
        break;
      }
      default:
        break;
    }
  };

  if (items.length === 0) {
    return <p className="folder-contents__empty">{emptyText}</p>;
  }

  return (
    <table className="folder-contents">
      <caption className="visually-hidden">Contents of this folder</caption>
      <thead>
        <tr>
          <th scope="col">Name</th>
          <th scope="col">Type</th>
          <th scope="col">Built on</th>
          <th scope="col">Updated</th>
          <th scope="col">Owner</th>
          <th scope="col">
            <span className="visually-hidden">Actions</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {items.map((item, index) => {
          const targets = onMove ? targetsFor(item, folders) : [];
          return (
            <tr
              key={`${item.kind}:${item.id}`}
              data-testid={`item-${item.id}`}
              ref={(element) => {
                rowRefs.current[index] = element;
              }}
              tabIndex={index === selected ? 0 : -1}
              aria-selected={index === selected}
              onKeyDown={(event) => onKeyDown(event, index)}
              onFocus={() => setSelected(index)}
            >
              <th scope="row">
                {renaming === item.id ? (
                  <form
                    className="folder-contents__rename"
                    onSubmit={(event) => {
                      event.preventDefault();
                      if (draft.trim() !== '') onRename?.(item, draft.trim());
                      setRenaming(null);
                      backToMenu(item.id);
                    }}
                  >
                    <label htmlFor={`rename-${item.id}`} className="visually-hidden">
                      New name for {item.title}
                    </label>
                    <input
                      id={`rename-${item.id}`}
                      value={draft}
                      // The keyboard goes where the rename is (AC-176 audit).
                      ref={(element) => element?.focus()}
                      onChange={(event) => setDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key !== 'Escape') return;
                        // The name as it was, and focus back where it began.
                        event.preventDefault();
                        setRenaming(null);
                        backToMenu(item.id);
                      }}
                    />
                    <button type="submit" className="btn-primary">
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setRenaming(null);
                        backToMenu(item.id);
                      }}
                    >
                      Cancel
                    </button>
                  </form>
                ) : (
                  <span className="folder-contents__name">
                    {/* Type is an icon and a label, never the icon alone. The
                        glyph is the stylesheet's, so the name's text is the
                        name alone. */}
                    <span
                      className="folder-contents__icon"
                      data-icon={item.kind}
                      aria-hidden="true"
                    />
                    <span>
                      <button type="button" className="link-button" onClick={() => onOpen?.(item)}>
                        {item.title}
                      </button>
                      {/* The prototype's second line: what the dashboard is for. */}
                      {item.kind === 'dashboard' && item.description ? (
                        <span className="folder-contents__description">{item.description}</span>
                      ) : null}
                    </span>
                  </span>
                )}
              </th>
              <td>{typeText(item)}</td>
              <td className="folder-contents__built-on">{builtOn(item)}</td>
              <td>
                <time dateTime={item.updatedAt}>{new Date(item.updatedAt).toLocaleString()}</time>
              </td>
              <td>{item.owner ?? '—'}</td>
              <td
                className="folder-contents__actions"
                ref={(element) => {
                  if (element === null) actionRefs.current.delete(item.id);
                  else actionRefs.current.set(item.id, element);
                }}
              >
                {moving === item.id ? (
                  <>
                    <label htmlFor={`move-${item.id}`} className="visually-hidden">
                      Move {item.title} to
                    </label>
                    <select
                      id={`move-${item.id}`}
                      defaultValue=""
                      ref={(element) => element?.focus()}
                      onChange={(event) => {
                        if (!event.target.value) return;
                        setMoving(null);
                        onMove?.(item, event.target.value);
                      }}
                      onKeyDown={(event) => {
                        if (event.key !== 'Escape') return;
                        event.preventDefault();
                        setMoving(null);
                        backToMenu(item.id);
                      }}
                    >
                      <option value="">Move to…</option>
                      {targets.map((folder) => (
                        <option key={folder.id} value={folder.id}>
                          {folder.title}
                        </option>
                      ))}
                    </select>
                  </>
                ) : (
                  <MenuButton
                    label={`Actions for ${item.title}`}
                    className="btn-ghost btn-sm folder-contents__menu"
                    items={[
                      {
                        key: 'rename',
                        label: 'Rename',
                        onSelect: () => {
                          setRenaming(item.id);
                          setDraft(item.title);
                        },
                      },
                      ...(onMove && targets.length > 0
                        ? [{ key: 'move', label: 'Move to…', onSelect: () => setMoving(item.id) }]
                        : []),
                    ]}
                  >
                    <span aria-hidden="true">⋯</span>
                  </MenuButton>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
