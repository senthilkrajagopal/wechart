import { DRIVERS } from '@wechart/core';
import { useEffect, useRef, useState } from 'react';

import { MenuButton, type MenuItem } from '../../shell/MenuButton';
import { StatusIcon, type StateKind } from '../../shell/StatusIcon';
import { dayOf, exactOf } from '../../shell/formatTime';
import { CUBE_STORE_ID } from '../data-sources/cubeStore';
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
  /**
   * A model is one model file, by its path (T334, AC-269); a data source is
   * one by its id (T335).
   */
  readonly kind: 'folder' | 'dashboard' | 'chart' | 'model' | 'data-source';
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
  /** What a chart the recommender picks for was drawn as when saved (T243). */
  readonly drawnAs?: string | null;
  /** The cube or view a chart is built on. */
  readonly source?: string | null;
  /** Whether a chart has any field — one with none is incomplete. */
  readonly hasFields?: boolean;
  /** A dashboard's page tabs. */
  readonly tabs?: number | null;
  /** A folder's items the user may see, including its subfolders' (AC-194, T331). */
  readonly itemCount?: number | null;
  /** A model's cubes and views (T334, AC-269). */
  readonly declares?: { readonly cubes: number; readonly views: number } | null;
  /** A data source's driver, by its type id (T335). */
  readonly driver?: string | null;
  /** Where a workspace item is to go (T345, AC-282): a shared folder's id. */
  readonly targetFolderId?: string | null;
  /** A workspace model's file id, which its proposal names it by (T350). */
  readonly fileId?: string;
  /**
   * What a workspace copy was copied from, at which version (T344, AC-278);
   * a data source's names no kind (T346).
   */
  readonly origin?: {
    readonly kind?: string;
    readonly id: string;
    readonly version: number;
    readonly folderId: string;
    /** A model's copy to use, proposed to no folder (T543, T717, AC-283). */
    readonly useOnly?: true;
  } | null;
}

/**
 * The open folder is the user's workspace or in it (T498; design 04, pins 3
 * and 4): each item says where it goes and where it came from, and its
 * status. `pathOf` names a target folder, or nothing for one the user can't
 * see.
 */
export interface InWorkspace {
  readonly pathOf: (folderId: string) => string | undefined;
  /** Proposing an item to its target (T358, AC-284): its row's "Propose…". */
  readonly onPropose?: (item: CatalogItem) => void;
  /**
   * Its status past Draft (T358; design 04 and 05, state M), from its latest
   * proposal: waiting for review, rejected or approved. None is Draft.
   */
  readonly statusOf?: (item: CatalogItem) => { kind: StateKind; text: string } | undefined;
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
  /** The table's caption: the kind shown, where one is (T525, AC-370). */
  readonly caption?: string;
  /**
   * Shown by kind, where the folder holds none of it (T525; design 14, I2):
   * a last row saying so, after its subfolders, with Show all; in place of
   * `emptyText`.
   */
  readonly kindEmpty?: { readonly text: string; readonly onShowAll: () => void } | undefined;
  /**
   * Whether a row opens: every row unless said. One that doesn't shows its
   * name as text, not as a control that does nothing (T334).
   */
  readonly opens?: (item: CatalogItem) => boolean;
  /** Given in the user's workspace: each item's origin and target, and its status (T498). */
  readonly workspace?: InWorkspace | undefined;
  /**
   * Exporting a dashboard from its row (T511, AC-354; design 13, state A):
   * "Export…" in every dashboard row's ⋯, a reader's too.
   */
  readonly onExport?: ((item: CatalogItem) => void) | undefined;
  /**
   * Generating cubes from a data source's row (T492; the user, 2026-10-02):
   * "Generate cubes…" in its ⋯, for those who may make a model.
   */
  readonly onGenerate?: ((item: CatalogItem) => void) | undefined;
  /** Which data sources it is offered for: those Cube lists (T492's review). */
  readonly generates?: ((item: CatalogItem) => boolean) | undefined;
  /**
   * Deleting a row (design 14, pin 8; T517): "Delete…" last in its ⋯, set
   * apart in the error ink, where `deletes` says it may be — given only to
   * those who may change the folder (rule 68). No key deletes from the list.
   */
  readonly onDelete?: ((item: CatalogItem) => void) | undefined;
  readonly deletes?: ((item: CatalogItem) => boolean) | undefined;
}

/**
 * Under a workspace item's name, where it goes, read as "Goes to" and drawn
 * as an arrow, and whether it was copied or is new; a folder has no target
 * (design 04, pin 3; rule 73).
 */
function OriginLine({ item, workspace }: { item: CatalogItem; workspace: InWorkspace }) {
  if (item.kind === 'folder') {
    const count = item.itemCount;
    return (
      <span className="folder-contents__origin">
        {count == null ? '' : `${String(count)} ${count === 1 ? 'item' : 'items'} · `}
        {count == null ? 'Folders' : 'folders'} in My workspace have no target
      </span>
    );
  }
  // A use-only copy goes to no folder (T717, AC-283; R73).
  if (item.origin?.useOnly === true)
    return (
      <span className="folder-contents__origin">
        A copy for use only of version {String(item.origin.version)} · proposed to no folder
      </span>
    );
  if (item.targetFolderId == null) return null;
  const target = workspace.pathOf(item.targetFolderId) ?? 'a folder you can no longer see';
  return (
    <span className="folder-contents__origin">
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
        <path d="M3 8h9M9 4.5L12.5 8 9 11.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      </svg>
      <span className="visually-hidden">Goes to </span>
      {target} ·{' '}
      {item.origin == null ? 'new' : `copied from version ${String(item.origin.version)}`}
    </span>
  );
}

/**
 * A workspace item's status, icon and label (design 04, pin 4; rule 79).
 * Until proposals are built, every item there is a draft; a folder is never
 * proposed, so has none.
 */
function WorkspaceStatus({ item, workspace }: { item: CatalogItem; workspace: InWorkspace }) {
  if (item.kind === 'folder') return null;
  const status = workspace.statusOf?.(item) ?? { kind: 'draft' as const, text: 'Draft' };
  return (
    <span className="folder-contents__status">
      <StatusIcon kind={status.kind} />
      <span>{status.text}</span>
    </span>
  );
}

const TYPE_LABEL: Record<CatalogItem['kind'], string> = {
  folder: 'Folder',
  dashboard: 'Dashboard',
  chart: 'Chart',
  model: 'Model',
  'data-source': 'Data source',
};

/** Each kind's chip, the prototype's .itemicon — the New menu's own (F20). */
const CHIP: Record<CatalogItem['kind'], string> = {
  folder: 'ic-folder',
  dashboard: 'ic-dash',
  chart: 'ic-chart',
  model: 'ic-model',
  'data-source': 'ic-source',
};

/**
 * The Built on column's ink, as browse() sets it (N2): a folder's count
 * muted, a dashboard's tabs secondary, a chart's cube or view in the code
 * face.
 */
const BUILT_ON_CLASS: Record<CatalogItem['kind'], string> = {
  folder: 'folder-contents__built-on is-muted',
  dashboard: 'folder-contents__built-on is-secondary',
  chart: 'folder-contents__built-on is-code',
  model: 'folder-contents__built-on is-secondary',
  'data-source': 'folder-contents__built-on is-secondary',
};

const plural = (count: number, one: string) => `${String(count)} ${one}${count === 1 ? '' : 's'}`;

/** A model's and a data source's name, `.strong.mono` at 13 px (design 14:319–320; T693). */
const NAMED_IN_CODE = new Set<CatalogItem['kind']>(['model', 'data-source']);

/**
 * Each row's ⋯ menu at design 14's width (T693, EXP-07): a folder's 196
 * (screen 1), a model's 170 (D1), a dashboard's and the rest 210 (B1).
 */
const MENU_WIDTH: Record<CatalogItem['kind'], number> = {
  folder: 196,
  dashboard: 210,
  chart: 210,
  model: 170,
  'data-source': 210,
};

/**
 * Whether Explore opens a row: every kind. A data source opens in its
 * settings (T462, UX-222), and a model in its own folder, beside that
 * folder's files (T342) — the root's and every other folder's alike.
 */
export const opensFromExplore: (item: CatalogItem) => boolean = () => true;

/** The Type column: a chart by its chart type, never only "Chart" (AC-193). */
function typeText(item: CatalogItem): string {
  return item.kind === 'chart' ? chartTypeText(item) : TYPE_LABEL[item.kind];
}

/** The Built on column: a folder's items, a dashboard's tabs, a chart's cube or view. */
function builtOnText(item: CatalogItem, kinds: ReadonlyMap<string, 'cube' | 'view'>): string {
  if (item.kind === 'folder') return item.itemCount == null ? '—' : plural(item.itemCount, 'item');
  if (item.kind === 'dashboard') return item.tabs == null ? '—' : plural(item.tabs, 'tab');
  // "_n_ cubes · _n_ views" (references.md §4).
  if (item.kind === 'model')
    return item.declares == null
      ? '—'
      : `${plural(item.declares.cubes, 'cube')} · ${plural(item.declares.views, 'view')}`;
  // Cube Store, once on, among the root's data sources (T536; design 15's H1).
  if (item.kind === 'data-source' && item.id === CUBE_STORE_ID) return 'Cube Store · read-only SQL';
  // Its driver, by name (references.md §4); its health joins it (T362, T365).
  if (item.kind === 'data-source')
    return item.driver == null
      ? '—'
      : ((DRIVERS as Record<string, { label: string } | undefined>)[item.driver]?.label ??
          item.driver);
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
  // The folder itself and what is beneath it — walked from the folder alone:
  // walked from its parent too, every sibling came out with it
  // (recheck-shell-explore N17).
  const beneath = new Set<string>();
  if (item.kind === 'folder') {
    beneath.add(item.id);
    // Bounded by the number of folders, so a cycle in stored data cannot hang it.
    for (let grew = true, guard = 0; grew && guard <= folders.length; guard += 1) {
      grew = false;
      for (const folder of folders)
        if (folder.parentId != null && beneath.has(folder.parentId) && !beneath.has(folder.id)) {
          beneath.add(folder.id);
          grew = true;
        }
    }
  }
  return folders.filter((folder) => !beneath.has(folder.id) && folder.id !== item.folderId);
}

/**
 * The Updated column's date, day first: "19 Sep", with the year where it is
 * not this one (recheck-shell-explore F19; T477's Q6). The moment in full is
 * the element's title (`exactOf`), and its `dateTime` the machine's.
 */
function shortDate(iso: string): string {
  return dayOf(new Date(iso));
}

/**
 * A folder by its path — "Operations / sss / hello" — as Settings › General
 * names one (recheck-shell-explore F16): two folders may share a name.
 */
function pathOf(folder: FolderMove, folders: readonly FolderMove[]): string {
  const byId = new Map(folders.map((each) => [each.id, each]));
  const names: string[] = [];
  let at: FolderMove | undefined = folder;
  for (let guard = 0; at !== undefined && guard <= folders.length; guard += 1) {
    names.unshift(at.title);
    at = at.parentId == null ? undefined : byId.get(at.parentId);
  }
  return names.join(' / ');
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
  caption = 'Contents of this folder',
  kindEmpty,
  opens = () => true,
  workspace,
  onExport,
  onGenerate,
  generates = () => true,
  onDelete,
  deletes = () => false,
}: FolderContentsProps) {
  const open = (item: CatalogItem) => {
    if (opens(item)) onOpen?.(item);
  };
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
   * What a row's ⋯ offers: Rename and Move only where Explore gives them,
   * never where the user may change nothing (rule 68, T331); Propose… in the
   * workspace; Export… for a dashboard.
   */
  const menuOf = (item: CatalogItem, targets: readonly FolderMove[]): MenuItem[] => {
    const deletable = onDelete !== undefined && deletes(item);
    // A model's name is its file's, changed in the model editor (T334): its
    // ⋯ holds Open and Delete…, where it may be deleted (design 14, pin 9),
    // and in the workspace Propose… (T350).
    const others =
      item.kind === 'model'
        ? [
            ...(deletable ? [{ key: 'open', label: 'Open', onSelect: () => onOpen?.(item) }] : []),
            // Never a use-only copy, which goes to no folder (T717, AC-283).
            ...(workspace?.onPropose !== undefined && item.origin?.useOnly !== true
              ? [
                  {
                    key: 'propose',
                    label: 'Propose…',
                    onSelect: () => workspace.onPropose?.(item),
                  },
                ]
              : []),
          ]
        : otherActions(item, targets);
    return deletable
      ? [
          ...others,
          {
            key: 'delete',
            label: 'Delete…',
            danger: true,
            separatorBefore: others.length > 0,
            onSelect: () => onDelete(item),
          },
        ]
      : others;
  };
  const otherActions = (item: CatalogItem, targets: readonly FolderMove[]): MenuItem[] => [
    // A data source's name changes only on its own page, and only a draft's (T497, T722).
    ...(onRename !== undefined && item.kind !== 'data-source'
      ? [
          {
            key: 'rename',
            label: 'Rename',
            onSelect: () => {
              setRenaming(item.id);
              setDraft(item.title);
            },
          },
        ]
      : []),
    ...(onMove && targets.length > 0 && item.kind !== 'data-source'
      ? [{ key: 'move', label: 'Move to…', onSelect: () => setMoving(item.id) }]
      : []),
    // To its target, by a proposal (T358, AC-284; design 05, state A).
    ...(workspace?.onPropose !== undefined && item.kind !== 'folder'
      ? [
          {
            key: 'propose',
            label: 'Propose…',
            onSelect: () => workspace.onPropose?.(item),
          },
        ]
      : []),
    // Into a file, in the Export pane (T511; design 13, state A).
    ...(onExport !== undefined && item.kind === 'dashboard'
      ? [{ key: 'export', label: 'Export…', onSelect: () => onExport(item) }]
      : []),
    // Its tables as cubes, in the Generate cubes pane (T492).
    ...(onGenerate !== undefined && item.kind === 'data-source' && generates(item)
      ? [{ key: 'generate', label: 'Generate cubes…', onSelect: () => onGenerate(item) }]
      : []),
  ];

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
  /** The row in the Tab order: the selected one, or the last where fewer are listed (T525's review). */
  const tabbed = Math.max(0, Math.min(selected, items.length - 1));

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
        if (item) open(item);
        break;
      }
      default:
        break;
    }
  };

  return (
    <table className="folder-contents">
      <caption className="visually-hidden">{caption}</caption>
      <thead>
        {/* In the workspace, Status takes Built on's and Owner's places:
            everything there is the user's (design 04, pins 3 and 4). */}
        <tr>
          <th scope="col">Name</th>
          <th scope="col">Type</th>
          {workspace === undefined ? <th scope="col">Built on</th> : <th scope="col">Status</th>}
          <th scope="col">Updated</th>
          {workspace === undefined ? <th scope="col">Owner</th> : null}
          <th scope="col">
            <span className="visually-hidden">Actions</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {/* Empty, the header stays and a row says so, as the prototype's
            (recheck-shell-explore F24, F25). */}
        {items.length === 0 && kindEmpty === undefined ? (
          <tr className="folder-contents__empty-row">
            <td colSpan={workspace === undefined ? 6 : 5} className="folder-contents__empty">
              {emptyText}
            </td>
          </tr>
        ) : null}
        {items.map((item, index) => {
          const targets = onMove ? targetsFor(item, folders) : [];
          // A second line under the name: design 14's 44 px td, not td.one.
          const twoLine =
            (item.kind === 'folder' && Boolean(item.description)) ||
            (workspace === undefined && item.kind === 'dashboard' && Boolean(item.description));
          return (
            <tr
              key={`${item.kind}:${item.id}`}
              data-testid={`item-${item.id}`}
              className={twoLine ? 'is-two-line' : undefined}
              ref={(element) => {
                rowRefs.current[index] = element;
              }}
              // The selection is the row in the tab order, shown when it has
              // the focus: a plain table's rows take no `aria-selected`
              // (recheck-shell-explore F27, N12).
              tabIndex={index === tabbed ? 0 : -1}
              onKeyDown={(event) => onKeyDown(event, index)}
              onFocus={() => setSelected(index)}
              // The whole row opens it, as the prototype's does, but not
              // its name's button (which does already), its menu, or a
              // rename or move under way (recheck-shell-explore N11).
              onClick={(event) => {
                const target = event.target as HTMLElement;
                if (target.closest('button, a, input, select, textarea, form, [role="menu"]'))
                  return;
                if (renaming === item.id || moving === item.id) return;
                open(item);
              }}
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
                      className={`itemicon ${CHIP[item.kind]}`}
                      data-icon={item.kind}
                      aria-hidden="true"
                    />
                    <span>
                      {opens(item) ? (
                        <button
                          type="button"
                          className={
                            NAMED_IN_CODE.has(item.kind)
                              ? 'folder-contents__open is-code'
                              : 'folder-contents__open'
                          }
                          onClick={() => onOpen?.(item)}
                        >
                          {item.title}
                        </button>
                      ) : (
                        <span
                          className={
                            NAMED_IN_CODE.has(item.kind)
                              ? 'folder-contents__title is-code'
                              : 'folder-contents__title'
                          }
                        >
                          {item.title}
                        </span>
                      )}
                      {/* The prototype's second line: what the dashboard is for,
                          or the folder (T524; design 14, P1); in the workspace,
                          where it goes (design 04, pin 3), a folder its
                          description in that line's place where it has one. */}
                      {item.kind === 'folder' && item.description ? (
                        <span className="folder-contents__description is-one-line">
                          {item.description}
                        </span>
                      ) : workspace !== undefined ? (
                        <OriginLine item={item} workspace={workspace} />
                      ) : item.kind === 'dashboard' && item.description ? (
                        <span className="folder-contents__description">{item.description}</span>
                      ) : null}
                    </span>
                  </span>
                )}
              </th>
              <td className="folder-contents__type">{typeText(item)}</td>
              {workspace === undefined ? (
                <td className={BUILT_ON_CLASS[item.kind]}>{builtOn(item)}</td>
              ) : (
                <td>
                  <WorkspaceStatus item={item} workspace={workspace} />
                </td>
              )}
              {/* A folder's too, though browse() leaves them blank (F20):
                  AC-017 fails on a blank column for an item that has the
                  value (T244's review). */}
              <td>
                <time dateTime={item.updatedAt} title={exactOf(new Date(item.updatedAt))}>
                  {shortDate(item.updatedAt)}
                </time>
              </td>
              {/* A folder is no one's: "—", as design 14 draws it (EXP-10). */}
              {workspace === undefined ? (
                <td>{item.kind === 'folder' ? '—' : (item.owner ?? '—')}</td>
              ) : null}
              <td
                className="folder-contents__actions"
                ref={(element) => {
                  if (element === null) actionRefs.current.delete(item.id);
                  else actionRefs.current.set(item.id, element);
                }}
              >
                {/* A model's name is its file's, changed in the model editor
                    (T334): it has no rename or move here. A row with nothing
                    to offer, a reader's folder's (rule 68, T331), has no ⋯. */}
                {menuOf(item, targets).length === 0 ? null : (
                  <MenuButton
                    label={`Actions for ${item.title}`}
                    // Design 14's .iconbtn.sm, 24 × 24 (EXP-27).
                    className="icon-button icon-button--sm folder-contents__menu"
                    items={menuOf(item, targets)}
                    menuWidth={MENU_WIDTH[item.kind]}
                  >
                    <span aria-hidden="true">⋯</span>
                  </MenuButton>
                )}
                {/* Over the row, beside its ⋯, rather than in its place: the
                    table does not reflow (recheck-shell-explore N14). */}
                {moving === item.id ? (
                  <div className="folder-contents__move">
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
                      // Left, it is put away, not left over the next row's ⋯
                      // (T243's review); the focus stays where it went.
                      onBlur={() => setMoving((current) => (current === item.id ? null : current))}
                    >
                      <option value="">Move to…</option>
                      {targets.map((folder) => (
                        <option key={folder.id} value={folder.id}>
                          {pathOf(folder, folders)}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}
              </td>
            </tr>
          );
        })}
        {/* Shown by kind, none of it here: said after the subfolders (T525; design 14, I2). */}
        {kindEmpty === undefined ? null : (
          <tr className="folder-contents__empty-row">
            <td colSpan={workspace === undefined ? 6 : 5} className="folder-contents__empty">
              {kindEmpty.text}{' '}
              <button type="button" className="btn-link" onClick={kindEmpty.onShowAll}>
                Show all
              </button>
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}
