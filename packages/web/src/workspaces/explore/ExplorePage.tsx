import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter, useRouterState } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';

import { META_QUERY } from '../../query/meta';
import { ME_QUERY } from '../../shell/me';
import { StateLine } from '../../shell/StatusIcon';
import {
  AccessPanel,
  AccessRefused,
  folderAccessQuery,
  refreshFolderAccess,
} from './access/AccessPanel';
import { AccessChip, OnlySuperAdminsChip } from './AccessChip';
import { CreateMenu, DEFAULT_TITLES, type CreatableKind } from './CreateMenu';
import { folderRoleOf, rightFrom } from './folderRole';
import { NewSourceWizard } from '../data-sources/NewSourceWizard';
import { NewItemDialog, type Target } from './NewItemDialog';
import { FolderContents, opensFromExplore, type CatalogItem } from './FolderContents';
import { FolderTree } from './FolderTree';
import { exploreHref, folderChain, FOLDERS_QUERY, targetPathOf } from './folders';
import { isMyWorkspace, ROOT_FOLDERS, SHARED_ROOT, rootTitleOf, visibleRoots } from './roots';
import { WorkspaceBand } from './WorkspaceBand';
import { ProposeFlow } from './ProposeFlow';
import { REVIEWS_QUERY } from '../reviews/reviews';
import { statusOfItem } from './proposalStatus';
import { ExportPane } from '../../dashboard/export/ExportPane';
import { ExportedToast } from '../../dashboard/export/ExportedToast';
import { ImportPane } from './import/ImportPane';
import { fileHref } from '../model/inFolder';
import { generateFrom, startModelDraft } from '../model/ModelFilePage';
import { cubeSourceOf } from '../data-sources/cubeSource';
import { FolderDescription } from './FolderDescription';
import { DeleteDialog, type Checked, type Confirmation, type Refusal } from './DeleteDialog';
import { ClearWorkspaceDialog } from './ClearWorkspaceDialog';
import {
  KindFilter,
  captionOf,
  emptyTextOf,
  kindFrom,
  sayShown,
  shownOf,
  type ShownKind,
} from './KindFilter';
import {
  checkChart,
  checkDashboard,
  checkModel,
  checkSource,
  FOLDER_CONFIRMATION,
  removeChart,
  removeDashboard,
  removeFolder,
  removeModel,
  removeSource,
} from './deleteChecks';
import { MenuButton, type MenuItem } from '../../shell/MenuButton';
import { clearSaid, peekSaid } from './deletedToast';
import { movedCopiesText, type MovedCopies } from './movedCopies';

const counted = (count: number, one: string) => `${String(count)} ${count === 1 ? one : `${one}s`}`;
/** "A", "A and B", "A, B and C". */
const listed = (names: readonly string[]) =>
  names.length <= 1
    ? (names[0] ?? '')
    : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1] ?? ''}`;

/** A path "Sales / EMEA" as the dialog takes it, from Shared. */
const pathFromShared = (path: string | undefined): string[] =>
  path === undefined || path === SHARED_ROOT.title ? ['Shared'] : ['Shared', ...path.split(' / ')];

/**
 * Explore: the folder tree and the open folder (AC-017), laid out as the
 * prototype lays it out (AC-192): a breadcrumb, the folder's name as the
 * page's heading with Rename beside it, a search box, and one "New" menu.
 *
 * Dashboards and charts live in folders here; there is no separate Dashboards
 * workspace (docs/inputs §8).
 */
const ROOT = SHARED_ROOT.id;
/** What a folder renamed to nothing is called — the prototype's fallback. */
const UNTITLED_FOLDER = 'Untitled folder';
/** The Access panel, for its button's `aria-controls`. */
const ACCESS_PANEL_ID = 'explore-access-panel';
/**
 * How many search results the box lists. Past this a list stops being read
 * and the search wants narrowing, which the box then says (AC-019).
 */
const SEARCH_SHOWN = 1000;

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Request failed: ${String(response.status)}`);
  return (await response.json()) as T;
}

interface CreatedObject {
  readonly kind: CreatableKind;
  readonly id: string;
}

export function ExplorePage() {
  /**
   * The open folder is the address's (AC-195): `?folder=` names it, so a
   * reload, a link from a dashboard's breadcrumb and Back all land on it.
   * Opening a folder pushes an entry, so Back walks back through folders.
   */
  const router = useRouter();
  const asked = useRouterState({ select: (state) => state.location.search }) as Record<
    string,
    unknown
  >;
  // The router reads a value that looks like JSON as JSON, so a number-like
  // id arrives as a number; ids are strings.
  const folderId =
    asked['folder'] === undefined || asked['folder'] === '' ? ROOT : String(asked['folder']);
  /**
   * The kind the list shows (T525, AC-370; design 14, P2): the address's,
   * so a reload and Back keep it, and kept as another folder opens from the
   * list or the tree. Explore opened afresh shows All.
   */
  const kind = kindFrom(asked['kind']);
  const setFolderId = (id: string) => {
    // The folder already open is no new place for Back to step through.
    if (id !== folderId) router.history.push(exploreHref(id, kind));
  };
  /**
   * The Explore search box (AC-019), and the open folder's name while it is
   * renamed in the heading — each held with the folder it was begun in, and
   * shown only while that folder is open. Back or Forward changes the folder
   * without passing through here, and a rename left open over another folder
   * would rename that one (T216's review).
   */
  const [search, setSearch] = useState({ folder: ROOT, text: '' });
  const query = search.folder === folderId ? search.text : '';
  const setQuery = (text: string) => setSearch({ folder: folderId, text });
  const [renameOf, setRenameOf] = useState<{ folder: string; text: string } | null>(null);
  const renaming = renameOf?.folder === folderId ? renameOf.text : null;
  const setRenaming = (text: string | null) =>
    setRenameOf(text === null ? null : { folder: folderId, text });
  const queryClient = useQueryClient();
  const searching = query.trim() !== '';

  const folders = useQuery(FOLDERS_QUERY);

  const contents = useQuery({
    queryKey: ['folder-contents', folderId],
    queryFn: () => getJson<CatalogItem[]>(`/api/folders/${encodeURIComponent(folderId)}/contents`),
    enabled: !searching,
  });

  /**
   * AC-019: the library's dashboards and charts whose title contains the
   * text — never a chart local to a dashboard, which the search leaves out
   * (T017). The same catalog query the ⌘K palette asks.
   */
  const results = useQuery({
    queryKey: ['explore-search', query.trim()],
    // One more than is shown, so a search too broad to list is said to be,
    // rather than cut short in silence — AC-019 promises *every* match.
    queryFn: () =>
      getJson<CatalogItem[]>(
        `/api/search?q=${encodeURIComponent(query.trim())}&limit=${String(SEARCH_SHOWN + 1)}`,
      ),
    enabled: searching,
  });

  /**
   * AC-020: the new object lands in the open folder and is opened. A folder
   * "opens" by becoming the open folder, its name in the heading ready to
   * type; a dashboard or chart opens at its own route.
   */
  const create = useMutation({
    mutationFn: async ({
      kind,
      title = DEFAULT_TITLES[kind],
      targetFolderId,
    }: {
      kind: CreatableKind;
      title?: string;
      targetFolderId?: string;
    }) => {
      const post = (named: string) =>
        fetch('/api/documents', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            kind,
            title: named,
            folderId,
            ...(targetFolderId === undefined ? {} : { targetFolderId }),
          }),
        });
      let response = await post(title);
      /**
       * A folder holds one dashboard of a name (T336, AC-270): the default
       * one, taken, is numbered on, "Untitled dashboard 2" and so on (T336's
       * review). A name the user gave is refused as it is.
       */
      for (
        let next = 2;
        response.status === 409 &&
        kind === 'dashboard' &&
        title === DEFAULT_TITLES[kind] &&
        next <= 99;
        next += 1
      ) {
        const said = (await response
          .clone()
          .json()
          .catch(() => ({}))) as { existing?: unknown };
        if (said.existing === undefined) break;
        response = await post(`${title} ${String(next)}`);
      }
      if (!response.ok) {
        // The server's reason, where it gives one (T345's review).
        const said = (await response.json().catch(() => ({}))) as {
          error?: string;
          message?: string;
        };
        throw new Error(
          `Could not create it: ${said.error ?? said.message ?? `error ${String(response.status)}`}`,
        );
      }
      return (await response.json()) as CreatedObject;
    },
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({ queryKey: ['folder-contents'] });
      if (created.kind === 'folder') {
        await queryClient.invalidateQueries({ queryKey: ['folders'] });
        setQuery('');
        setFolderId(created.id);
        // Begun in the new folder by name: this handler was made while the
        // folder it was created in was open.
        setRenameOf({ folder: created.id, text: DEFAULT_TITLES.folder });
        return;
      }
      // A chart opens in the editor, to be built (AC-213), and new there
      // (T256's review); a dashboard, in edit mode, as the prototype's New
      // opens it (T245, N15).
      globalThis.location.assign(
        `/explore/${created.kind}s/${encodeURIComponent(created.id)}${created.kind === 'chart' ? '/edit?new=true' : '?editing=true'}`,
      );
    },
  });

  /**
   * AC-021: renaming or moving changes a field, never the id, so everything
   * that refers to this object keeps resolving.
   */
  const relocate = useMutation({
    mutationFn: async ({
      item,
      title,
      folderId: target,
    }: {
      item: Pick<CatalogItem, 'kind' | 'id'>;
      title?: string;
      folderId?: string;
    }) => {
      const response = await fetch(`/api/documents/${item.kind}/${encodeURIComponent(item.id)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title, folderId: target }),
      });
      if (!response.ok) {
        // The server's reason, where it gives one: a name the folder has (T336's review).
        const said = (await response.json().catch(() => ({}))) as {
          error?: string;
          message?: string;
        };
        throw new Error(
          `Could not save: ${said.error ?? said.message ?? `error ${String(response.status)}`}`,
        );
      }
      // A move gives each dashboard it would leave showing a chart off its
      // folder's path its own copy, and says which (T537, AC-371).
      if (target === undefined) return undefined;
      return movedCopiesText(((await response.json().catch(() => ({}))) as MovedCopies) ?? {});
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['folder-contents'] });
      await queryClient.invalidateQueries({ queryKey: ['folders'] });
      // A move can change a root's count as well as its folders' (AC-194),
      // and what a moved folder, and those beneath it, inherit (T330).
      await queryClient.invalidateQueries({ queryKey: ['folder-roots'] });
      await refreshFolderAccess(queryClient);
    },
  });

  const chain = folderChain(folders.data ?? [], folderId);
  /**
   * Whether the open folder is one the tree knows. While the folders load,
   * or after one is deleted elsewhere, it is not — and borrowing the root's
   * name for it would put "Shared" over a real folder's contents, with a
   * Rename that renames the folder under a name it does not have.
   */
  const isRoot = rootTitleOf(folderId) !== undefined;
  const known = isRoot || chain.at(-1)?.id === folderId;
  /** The open folder is My workspace or in it (T345). */
  const inMyWorkspace = isMyWorkspace(folderId) || isMyWorkspace(chain[0]?.id ?? '');
  /**
   * A dashboard or chart made in the workspace asks where it is to go (T345,
   * AC-282), from the folders read afresh as New is chosen: a folder made or
   * granted a moment ago is among them, and the only one is chosen (T345's
   * review).
   */
  const [askingTarget, setAskingTarget] = useState<{
    /** A model is a new cube, opened in the model page as a draft (T347). */
    kind: 'dashboard' | 'chart' | 'data-source' | 'model';
    targets: readonly Target[];
    /** The folder it is made in: the one open when it was asked for. */
    folderId: string;
  } | null>(null);
  const [targetsFailed, setTargetsFailed] = useState<string | null>(null);
  const askTarget = async (kind: 'dashboard' | 'chart' | 'data-source' | 'model') => {
    setTargetsFailed(null);
    const asked = folderId;
    try {
      const targets = await getJson<Target[]>('/api/folders/targets');
      // The docked panes replace each other (T471): Access, or Export, closes first.
      if (kind === 'data-source') {
        setAccessOf(null);
        setExportOf(null);
      }
      setAskingTarget({ kind, targets, folderId: asked });
    } catch (error) {
      setTargetsFailed((error as Error).message);
    }
  };
  /** A dashboard or chart being asked for: made at once, once its target is chosen. */
  const askingItem =
    askingTarget === null || askingTarget.kind === 'data-source' || askingTarget.kind === 'model'
      ? null
      : { kind: askingTarget.kind, targets: askingTarget.targets };
  /** A model being asked for (T347): a new cube, named, to go to the folder chosen. */
  const askingModel = askingTarget?.kind === 'model' ? askingTarget : null;
  /** A data source being added: the folders it may go to, and where it is made. */
  const addingSource = askingTarget?.kind === 'data-source' ? askingTarget.targets : null;
  const addingIn = askingTarget?.folderId ?? folderId;
  const folderTitle = known ? (chain.at(-1)?.title ?? SHARED_ROOT.title) : '';

  /** The roots' counts, which are no folder's (AC-194). */
  const rootCounts = useQuery({
    queryKey: ['folder-roots'],
    queryFn: () => getJson<Record<string, number>>('/api/folder-roots'),
  });
  /**
   * The open folder's Access panel (T330, AC-259, AC-260): with sign-in on,
   * for whoever the folder's access answers (a Super-Admin or a read-write
   * member, rule 68). With sign-in off there is one user and no groups, so
   * no Access; the single user works through My workspace (`viaWorkspace`).
   */
  const me = useQuery(ME_QUERY);
  const signedIn = me.data?.security === 'oidc';
  /**
   * Who may generate cubes from a data source (T492): one with a workspace,
   * whose model they go to, or the single user with sign-in off.
   */
  const mayGenerateCubes =
    me.data !== undefined &&
    (me.data.security === 'off' || me.data.superAdmin || me.data.readWrite === true);
  /** A listed data source's name in Cube, where Cube lists it: a shared one (T492's review). */
  const cubeSourceOfItem = (item: CatalogItem) =>
    cubeSourceOf({ name: item.title, folderId: item.folderId, inWorkspace: inMyWorkspace });
  /**
   * Shared work is changed through My workspace and a proposal: signed in,
   * and with sign-in off too, by the single user, since R52 (T359, AC-254).
   * Unknown until who is asking is.
   */
  const viaWorkspace = me.data !== undefined;
  // My workspace only where the API counts one (T343, AC-277); with sign-in
  // on, first in the tree (T498; design 04, pin 1). The shared root only
  // where a grant lets them see it (T331, AC-194).
  const roots = visibleRoots(rootCounts.data, { workspaceFirst: signedIn });
  /**
   * Signed in with access to no folder at all (T331; design 09, state G;
   * rule 61): no tree root, no New, no "+ Folder", and a note that names no
   * folder and says where access comes from.
   */
  const noAccess = signedIn && rootCounts.isSuccess && roots.length === 0;
  /**
   * Signed in, until the roots are counted, which say which the user has:
   * nothing of the shared root is shown, not even for a moment, to someone
   * who may not see it (rule 67, T331's review).
   */
  const rootsPending = signedIn && rootCounts.isPending;
  /**
   * In the user's workspace, each item says where it goes and where it came
   * from, and its status (T498; design 04, pins 2–4 and 8): the single
   * user's too, with sign-in off (T359).
   */
  const inOwnWorkspace =
    viaWorkspace && inMyWorkspace && !searching && roots.some((root) => isMyWorkspace(root.id));
  /**
   * The Show filter (T525, AC-370; design 14, state I): over the open
   * folder's list, never a search's, which lists dashboards and charts from
   * every folder (AC-019). A read-only user, who sees dashboards alone, has
   * none (Q3): one with no workspace, read-only everywhere (AC-277). With
   * sign-in off, the one user has it.
   */
  const mayFilter =
    !searching &&
    me.data !== undefined &&
    (!signedIn || (rootCounts.isSuccess && roots.some((root) => isMyWorkspace(root.id))));
  const shownKind: ShownKind = mayFilter ? kind : 'all';
  /**
   * A kind asked for, until who is asking is known: the list waits, rather
   * than showing every kind and then narrowing (T525's review).
   */
  const kindPending =
    kind !== 'all' && !searching && (me.isPending || (signedIn && rootCounts.isPending));
  const setKind = (next: ShownKind) => {
    router.history.replace(exploreHref(folderId, next));
    // Said politely, as the list follows: "Models: 1, and 2 folders".
    if (contents.isSuccess) setKindSaid(sayShown(next, shownOf(contents.data, next)));
  };
  const [kindSaid, setKindSaid] = useState('');
  // What is being proposed (T358), and each item's latest proposal, for its
  // status past Draft (design 04; design 05, state M).
  const [proposing, setProposing] = useState<CatalogItem | null>(null);
  const myProposals = useQuery({ ...REVIEWS_QUERY, enabled: inOwnWorkspace, retry: false });
  // Asked of a shared folder while it is searched too: what it offers (New,
  // below) stays what the user may do there.
  const access = useQuery({
    ...folderAccessQuery(folderId),
    enabled: signedIn && !inMyWorkspace,
    retry: false,
  });
  const mayEditAccess = signedIn && !searching && known && access.isSuccess;
  /** A shared folder open: its New and footnote are the role's (T331), the single user's too (T359). */
  const inShared = viaWorkspace && !searching && !inMyWorkspace;
  /**
   * What the open folder offers the user, by their role there (T331; AC-192,
   * AC-194, rule 69): its access answers a Super-Admin or a read-write
   * member, and refuses one who only sees it.
   */
  const role = folderRoleOf({
    signedIn: me.data === undefined ? undefined : signedIn,
    superAdmin: me.data?.superAdmin === true,
    inMyWorkspace,
    // Only where the API counts one: not a reader at `?folder=mine` (AC-277).
    hasWorkspace: roots.some((root) => isMyWorkspace(root.id)),
    right: rightFrom({
      answered: access.isSuccess,
      refusedWith: access.error instanceof AccessRefused ? access.error.status : undefined,
    }),
  });
  /**
   * Rows' Rename and Move (AC-193), only where the user may change what is
   * listed (rule 68, T331): the open folder's role; in a search's results,
   * which come from every folder, for one who may write somewhere. The API
   * refuses the rest (T326).
   */
  const mayChangeRows = searching
    ? me.data !== undefined &&
      (me.data.security === 'off' || me.data.superAdmin || me.data.readWrite === true)
    : role.mayRename;
  /**
   * The open folder's own Delete folder…, in its header's ⋯ (T521, AC-366;
   * design 14, state E2): only while it holds nothing, never on a root, and
   * for one who may change both it and the folder holding it, as its delete
   * needs (AC-291). A header with nothing to offer has no ⋯.
   */
  const parentId = chain.length > 1 ? chain.at(-2)?.id : undefined;
  const openIsEmpty =
    !searching && known && !isRoot && contents.isSuccess && contents.data.length === 0;
  const parentAccess = useQuery({
    ...folderAccessQuery(parentId ?? ''),
    enabled: signedIn && !inMyWorkspace && openIsEmpty && parentId !== undefined,
    retry: false,
  });
  const mayDeleteOpen =
    openIsEmpty &&
    role.mayRename &&
    parentId !== undefined &&
    (!signedIn || inMyWorkspace || parentAccess.isSuccess);
  /**
   * Clear My workspace… (T522, AC-367; design 14, F1): in its root's header
   * ⋯, the one place its whole contents are in view, only while it holds
   * something. Never in the tree, nor in a folder of it.
   */
  const [clearing, setClearing] = useState(false);
  const mayClear =
    isMyWorkspace(folderId) && !searching && contents.isSuccess && contents.data.length > 0;
  const headerMenu: MenuItem[] = [
    ...(mayDeleteOpen
      ? [
          {
            key: 'delete-folder',
            label: 'Delete folder…',
            danger: true,
            onSelect: () => {
              setDeletingOpen(true);
              setDeletingItem({
                kind: 'folder',
                id: folderId,
                title: folderTitle,
                owner: null,
                updatedAt: '',
              });
            },
          },
        ]
      : []),
    ...(mayClear
      ? [
          {
            key: 'clear-workspace',
            label: 'Clear My workspace…',
            danger: true,
            onSelect: () => {
              setClearing(true);
            },
          },
        ]
      : []),
  ];
  const [accessOf, setAccessOf] = useState<string | null>(null);
  const accessButton = useRef<HTMLButtonElement>(null);
  /**
   * A dashboard being exported from its row (T511; design 13, state A),
   * docked where Access docks, replacing it; and the toast once its file is
   * downloaded.
   */
  const [exportOf, setExportOf] = useState<CatalogItem | null>(null);
  const [exported, setExported] = useState('');
  /**
   * Importing an export file (T513; design 13, screen 2), docked where the
   * other panes dock; and what the toast offers once it has landed: the
   * dashboard's Propose (state S), and its row, which takes focus.
   */
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState<{ message: string; dashboard?: CatalogItem } | null>(
    null,
  );
  const focusRow = useRef<string | null>(null);
  const closeExport = (item: CatalogItem) => {
    setExportOf(null);
    // Back to the row's ⋯ it came from.
    requestAnimationFrame(() => {
      document
        .querySelector<HTMLElement>(
          `[data-testid="item-${CSS.escape(item.id)}"] [aria-haspopup="menu"]`,
        )
        ?.focus();
    });
  };
  /**
   * A row being deleted (design 14, states A–E; T517): its dialog asks what
   * depends on it first. Once it's gone, the list stays, the row that took
   * its place takes focus, or the heading where the list is empty, and a
   * toast says so. An item deleted from its own page lands here saying so.
   */
  const [deletingItem, setDeletingItem] = useState<CatalogItem | null>(null);
  /** The open folder, deleted from its header's ⋯ (state E2): its parent opens after. */
  const [deletingOpen, setDeletingOpen] = useState(false);
  const [said, setSaid] = useState('');
  const heading = useRef<HTMLHeadingElement | null>(null);
  /** The heading takes focus once it is drawn: after its item's page deleted it, its folder's. */
  const focusHeading = useRef(false);
  /** Asked for from a dialog's answer, as it closes: the heading takes focus once drawn. */
  const [titleFocus, setTitleFocus] = useState(0);
  useEffect(() => {
    if (titleFocus > 0) heading.current?.focus();
  }, [titleFocus]);
  useEffect(() => {
    // After the page has drawn, so the toast's live region, kept mounted,
    // announces its words as they arrive (design 14, A5 and keyboard).
    const frame = requestAnimationFrame(() => {
      const text = peekSaid();
      if (text === null) return;
      clearSaid();
      setSaid(text);
      if (heading.current === null) focusHeading.current = true;
      else heading.current.focus();
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, []);
  const deleteOf = (
    item: CatalogItem,
  ):
    | {
        action: string;
        check: (() => Promise<Checked>) | Confirmation;
        remove: () => Promise<Refusal | undefined>;
      }
    | undefined => {
    switch (item.kind) {
      // In the workspace its open proposal is withdrawn, named first (T528, AC-372).
      case 'chart':
        return {
          action: 'Delete chart',
          check: checkChart(item.id, viaWorkspace, inOwnWorkspace),
          remove: removeChart(item.id, viaWorkspace),
        };
      // Its own charts and its bookmarks go with it (T518, AC-363; state B).
      case 'dashboard':
        return {
          action: 'Delete dashboard',
          check: checkDashboard(item.id, inOwnWorkspace),
          remove: removeDashboard(item.id),
        };
      // Offered only on an empty one (T521, AC-366): confirmed, nothing asked first.
      case 'folder':
        return {
          action: 'Delete folder',
          check: FOLDER_CONFIRMATION,
          remove: async () => {
            const refusal = await removeFolder(item.id, item.title, () => {
              setDeletingItem(null);
              setDeletingOpen(false);
              openFolder(item.id);
              // Focus on its heading, not left on the dialog gone (T521's review).
              setTitleFocus((times) => times + 1);
            })();
            // It isn't empty: what it holds is read afresh, so Delete is
            // offered on it no more (T521's review).
            if (refusal !== undefined) refreshListings();
            return refusal;
          },
        };
      // A shared one, refused while a cube is bound to it (T526, AC-364;
      // state C). A workspace copy keeps Discard my copy… on its page.
      case 'data-source':
        return inOwnWorkspace
          ? undefined
          : {
              action: 'Delete data source',
              check: checkSource(item.id),
              remove: removeSource(item.id),
            };
      // Its file, refused while anything depends on its cube (T526, AC-365; state D).
      case 'model':
        return {
          action: 'Delete model',
          check: checkModel(item.folderId ?? folderId, item.id, folderPathOf),
          remove: removeModel(item.folderId ?? folderId, item.id, folderPathOf),
        };
    }
  };
  /** A folder the user sees, as the dialogs name it: "Sales / EMEA", or "Shared". */
  const folderPathOf = (id: string) => targetPathOf(folders.data ?? [], id);
  /**
   * A folder with nothing in it (T521, AC-366): no item it counts, and no
   * subfolder. Delete is offered on no other: none rather than a greyed one
   * (design 14, screen 1).
   */
  const isEmptyFolder = (item: CatalogItem) =>
    item.kind === 'folder' &&
    item.itemCount === 0 &&
    folders.isSuccess &&
    !folders.data.some((folder) => folder.parentId === item.id);
  /** What a delete, or a refused one, may have changed: the lists, the tree and its counts. */
  const refreshListings = () => {
    void queryClient.invalidateQueries({ queryKey: ['folder-contents'] });
    void queryClient.invalidateQueries({ queryKey: ['explore-search'] });
    void queryClient.invalidateQueries({ queryKey: ['folders'] });
    void queryClient.invalidateQueries({ queryKey: ['folder-roots'] });
    // A data source gone from its row leaves the Data sources page too (T526's review).
    void queryClient.invalidateQueries({ queryKey: ['data-sources'] });
    // A proposal withdrawn with its item leaves Reviews and the statuses (T528).
    void queryClient.invalidateQueries({ queryKey: ['reviews'] });
    void queryClient.invalidateQueries({ queryKey: ['proposal-of'] });
  };
  const rowDeleted = (item: CatalogItem) => {
    // The rows as listed: of the kind shown (T525).
    const listed = searching ? (shown.data ?? []) : shownOf(shown.data ?? [], shownKind);
    const at = listed.findIndex((each) => each.kind === item.kind && each.id === item.id);
    const next = listed[at + 1] ?? listed[at - 1];
    setDeletingItem(null);
    setSaid(`Deleted “${item.title}”.`);
    if (next === undefined) heading.current?.focus();
    else focusRow.current = next.id;
    refreshListings();
  };
  /** The open folder deleted from its header: its parent opens, saying so, its heading focused (E3). */
  const openDeleted = (item: CatalogItem, parentId: string) => {
    setDeletingItem(null);
    setDeletingOpen(false);
    setSaid(`Deleted “${item.title}”.`);
    openFolder(parentId);
    heading.current?.focus();
    refreshListings();
  };
  // The docked panes replace each other: not two at once (T471).
  const accessOpen =
    mayEditAccess &&
    accessOf === folderId &&
    addingSource === null &&
    exportOf === null &&
    !importing;
  const titleOf = (id: string) =>
    rootTitleOf(id) ?? (folders.data ?? []).find((folder) => folder.id === id)?.title ?? id;

  /** Open a folder: the tree, a breadcrumb or a folder's row. */
  const openFolder = (id: string) => {
    setQuery('');
    setRenaming(null);
    setFolderId(id);
  };

  /** The open folder's description, as the folders were read (T524, AC-369). */
  const openFolderDescription =
    (folders.data ?? []).find((folder) => folder.id === folderId)?.description ?? null;
  /** Saves it, or throws the server's reason; the tree and rows then read it afresh. */
  const saveDescription = async (text: string) => {
    const response = await fetch(`/api/documents/folder/${encodeURIComponent(folderId)}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ description: text }),
    });
    if (!response.ok) {
      const said = (await response.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
      };
      throw new Error(
        `Could not save: ${said.error ?? said.message ?? `error ${String(response.status)}`}`,
      );
    }
    await queryClient.invalidateQueries({ queryKey: ['folders'] });
    await queryClient.invalidateQueries({ queryKey: ['folder-contents'] });
  };

  const commitRename = () => {
    // Only the rename begun in this folder: `renaming` is null otherwise.
    if (renaming === null || renameOf === null) return;
    const title = renaming.trim() === '' ? UNTITLED_FOLDER : renaming.trim();
    const target = renameOf.folder;
    setRenaming(null);
    if (title !== folderTitle) relocate.mutate({ item: { kind: 'folder', id: target }, title });
  };

  const shown = searching ? results : contents;

  /**
   * The imported dashboard's row takes focus once the listing holds it
   * (design 13, state S): where the pane was left from, the next step is.
   */
  useEffect(() => {
    if (focusRow.current === null) return;
    const row = document.querySelector<HTMLElement>(
      `[data-testid="item-${CSS.escape(focusRow.current)}"]`,
    );
    if (row === null) return;
    row.focus();
    focusRow.current = null;
  }, [contents.data]);

  /**
   * Whether a chart's source is a cube or a view, for its Built on column
   * (AC-193) — the model's meta says; until it has, the name stands alone.
   */
  const meta = useQuery(META_QUERY);
  const sourceKinds = new Map(
    (
      (meta.data as { cubes?: readonly { name?: unknown; type?: unknown }[] } | undefined)?.cubes ??
      []
    )
      .filter((cube): cube is { name: string; type?: unknown } => typeof cube.name === 'string')
      .map((cube) => [cube.name, cube.type === 'view' ? ('view' as const) : ('cube' as const)]),
  );

  /**
   * The prototype's docked Folders pane (AC-194), kept in view as the
   * contents scroll. "+ Folder" makes one in the open folder, for those who
   * may (T331). With no root to hold, no tree, rather than an empty one
   * (design 09, state G).
   */
  const treePane = (
    <aside className="explore__tree" aria-labelledby="explore-folders-heading">
      <div className="explore__pane-head">
        <h2 id="explore-folders-heading">Folders</h2>
        {role.mayAddFolder && !noAccess && !rootsPending ? (
          <button
            type="button"
            className="btn-ghost btn-sm"
            onClick={() => create.mutate({ kind: 'folder' })}
          >
            + Folder
          </button>
        ) : null}
      </div>
      <div className="explore__pane-body">
        {noAccess || rootsPending ? null : (
          <FolderTree
            folders={folders.data ?? []}
            roots={roots}
            selectedId={searching ? '' : folderId}
            onSelect={openFolder}
          />
        )}
      </div>
    </aside>
  );

  // Signed in with access to no folder: the tree's pane, and a note that
  // names no folder and says where access comes from (rule 61; design 09,
  // state G). Until the roots are counted, only that they are being read.
  if (noAccess || rootsPending)
    return (
      <div className="explore">
        {treePane}
        <section className="explore__contents" data-testid="explore-contents">
          {noAccess ? (
            <div className="explore__no-access">
              <svg
                width="32"
                height="32"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
                aria-hidden="true"
                data-icon="people"
              >
                <circle cx="6" cy="6" r="2.2" />
                <circle cx="11" cy="6.5" r="1.8" />
                <path d="M1.8 13c.5-2.2 2.1-3.4 4.2-3.4s3.7 1.2 4.2 3.4M10.2 9.8c1.9 0 3.3 1 3.8 3" />
              </svg>
              <h1>You don’t have access to any folders yet.</h1>
              <p>
                wechart gives access through AD groups; ask whoever manages the folder you need to
                add one of your groups.
              </p>
            </div>
          ) : (
            <StateLine kind="run">Loading…</StateLine>
          )}
        </section>
      </div>
    );

  return (
    <div
      className={
        addingSource !== null
          ? 'explore explore--source'
          : importing
            ? 'explore explore--importing'
            : exportOf !== null
              ? 'explore explore--export'
              : accessOpen
                ? 'explore explore--access'
                : 'explore'
      }
    >
      {treePane}
      <section className="explore__contents" data-testid="explore-contents">
        {inOwnWorkspace ? <WorkspaceBand /> : null}
        <nav className="crumbs" aria-label="Breadcrumb">
          {searching ? (
            <span>Search results for “{query.trim()}”</span>
          ) : (
            chain.map((crumb, index) => (
              <span key={crumb.id} className="crumbs__step">
                {index > 0 ? <span aria-hidden="true">/</span> : null}
                <button
                  type="button"
                  aria-current={index === chain.length - 1 ? 'page' : undefined}
                  onClick={() => openFolder(crumb.id)}
                >
                  {crumb.title}
                </button>
              </span>
            ))
          )}
        </nav>

        <div className="explore__head">
          {renaming !== null && !searching ? (
            <input
              className="explore__rename"
              aria-label="Folder name"
              value={renaming}
              // Focus and select the name as the rename begins — the user's own
              // action, as the prototype does it, so typing replaces it.
              ref={(element) => {
                if (element !== null && document.activeElement !== element) {
                  element.focus();
                  element.select();
                }
              }}
              onChange={(event) => setRenaming(event.target.value)}
              onBlur={commitRename}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  commitRename();
                }
                if (event.key === 'Escape') {
                  event.preventDefault();
                  setRenaming(null);
                }
              }}
            />
          ) : (
            // Focusable by script, for after a delete empties the list (design 14).
            <h1
              ref={(element) => {
                heading.current = element;
                if (element !== null && focusHeading.current) {
                  focusHeading.current = false;
                  element.focus();
                }
              }}
              tabIndex={-1}
              className="explore__title"
            >
              {searching ? 'Search' : folderTitle}
            </h1>
          )}
          {/* The user's access here (rule 69; T331), and when no group
              reaches the folder, that only Super-Admins see it (rule 63). */}
          {!searching && known && role.access !== undefined ? (
            <AccessChip access={role.access} />
          ) : null}
          {mayEditAccess && access.data?.onlySuperAdmins ? <OnlySuperAdminsChip /> : null}
          {/* A root is not a folder anyone named, so it has no Rename; nor
              has a folder the user may not change (AC-192, T331). */}
          {!searching && renaming === null && !isRoot && known && role.mayRename ? (
            <button
              type="button"
              className="btn-ghost btn-sm"
              onClick={() => setRenaming(folderTitle)}
            >
              Rename
            </button>
          ) : null}
          {mayEditAccess ? (
            <button
              type="button"
              className="btn-ghost btn-sm"
              ref={accessButton}
              aria-expanded={accessOpen}
              aria-controls={accessOpen ? ACCESS_PANEL_ID : undefined}
              // Where the new data source's pane, or an import's, is docked, until it closes.
              disabled={addingSource !== null || importing}
              onClick={() => {
                // It replaces an Export pane open there (T511).
                setExportOf(null);
                setAccessOf(accessOpen ? null : folderId);
              }}
            >
              Access
            </button>
          ) : null}
          {headerMenu.length === 0 ? null : (
            <MenuButton
              label={`More actions for ${folderTitle}`}
              className="btn-ghost btn-sm"
              testId="folder-more"
              items={headerMenu}
            >
              <span aria-hidden="true">⋯</span>
            </MenuButton>
          )}
          <span className="explore__spacer" />
          <input
            type="search"
            className="explore__search"
            aria-label="Search dashboards and charts"
            placeholder="Search dashboards and charts"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <CreateMenu
            // What the user may make here (T331, AC-192): a shared folder's
            // read-write members a folder alone, the workspace every kind, a
            // reader nothing, and so no New.
            offers={role.creates}
            // Not until the open folder is known: until then, whether it is
            // in the workspace isn't (T345's review).
            // Nor while a data source is being added in its pane: something
            // new would replace it, and what was typed there with it (T471).
            busy={create.isPending || !known || me.isPending || addingSource !== null || importing}
            // Where an import lands: My workspace, with sign-in off too (T513,
            // AC-356; design 13, state G); only the user's own (T331).
            {...(role.inOwnWorkspace && !searching
              ? {
                  onImport: () => {
                    setAccessOf(null);
                    setExportOf(null);
                    setImporting(true);
                  },
                }
              : {})}
            onCreate={(kind) => {
              // In the user's workspace, a dashboard or chart names the shared
              // folder it is to go to first (T345, AC-282), the single user's
              // too with sign-in off (T359).
              if (kind !== 'folder' && role.inOwnWorkspace) void askTarget(kind);
              else create.mutate({ kind });
            }}
            {...(role.inOwnWorkspace
              ? {
                  onNewSource: () => void askTarget('data-source'),
                  // A model, previewed through the workspace's overlay (T347, AC-282).
                  onNewModel: () => void askTarget('model'),
                }
              : {})}
          />
          {askingModel === null ? null : (
            <NewItemDialog
              kind="cube"
              defaultTitle="new_cube_1"
              targets={askingModel.targets}
              onClose={() => {
                setAskingTarget(null);
              }}
              onCreate={(name, targetFolderId) => {
                const taken = new Set(
                  (contents.data ?? [])
                    .filter((item) => item.kind === 'model')
                    .map((item) => item.id),
                );
                const path = startModelDraft(
                  queryClient,
                  askingModel.folderId,
                  'cube',
                  name,
                  targetFolderId,
                  taken,
                );
                setAskingTarget(null);
                router.history.push(fileHref(path, askingModel.folderId));
              }}
            />
          )}
          {askingItem === null ? null : (
            <NewItemDialog
              kind={askingItem.kind}
              defaultTitle={DEFAULT_TITLES[askingItem.kind]}
              targets={askingItem.targets}
              busy={create.isPending}
              onClose={() => {
                setAskingTarget(null);
              }}
              onCreate={(title, targetFolderId) => {
                create.mutate({ kind: askingItem.kind, title, targetFolderId });
                setAskingTarget(null);
              }}
            />
          )}
        </div>

        {/* What the folder is for, under its name (T524, AC-369; design 14,
            state H): never a root's, nor over a search's results. */}
        {!searching && known && !isRoot ? (
          <FolderDescription
            key={folderId}
            folderTitle={folderTitle}
            description={chain.length > 0 ? openFolderDescription : null}
            mayEdit={role.mayRename}
            onSave={saveDescription}
          />
        ) : null}
        {create.isError ? (
          <StateLine kind="err">{(create.error as Error).message}</StateLine>
        ) : null}
        {targetsFailed === null ? null : (
          <StateLine kind="err">Could not list the folders it may go to: {targetsFailed}</StateLine>
        )}
        {/* A rename or move that failed says so; the heading went back to the
            old name, and without this nothing would explain why. */}
        {relocate.isError ? (
          <StateLine kind="err">{(relocate.error as Error).message}</StateLine>
        ) : null}
        {relocate.isSuccess && relocate.data !== undefined ? (
          <StateLine kind="ok" testId="moved-copies">
            {relocate.data}
          </StateLine>
        ) : null}
        {searching && results.isSuccess && results.data.length > SEARCH_SHOWN ? (
          <StateLine kind="warn">
            Showing the first {SEARCH_SHOWN.toLocaleString('en-US')} matches. Type more to narrow
            the search.
          </StateLine>
        ) : null}
        {shown.isPending || kindPending ? <StateLine kind="run">Loading…</StateLine> : null}
        {shown.isError ? (
          <StateLine kind="err">
            {searching ? 'Could not search: ' : 'Could not load this folder: '}
            {(shown.error as Error).message}
          </StateLine>
        ) : null}
        {/* Its own row above the list (design 14, state I). */}
        {mayFilter && shown.isSuccess ? <KindFilter kind={shownKind} onChange={setKind} /> : null}
        <p className="visually-hidden" aria-live="polite">
          {kindSaid}
        </p>
        {shown.isSuccess && !kindPending ? (
          <div className="explore__scroll">
            <FolderContents
              items={searching ? shown.data.slice(0, SEARCH_SHOWN) : shownOf(shown.data, shownKind)}
              caption={captionOf(searching ? 'all' : shownKind)}
              // The folder holds none of the kind: said after its subfolders, with Show all (I2).
              kindEmpty={
                !searching &&
                shownKind !== 'all' &&
                shownOf(shown.data, shownKind).every((item) => item.kind === 'folder')
                  ? {
                      text: emptyTextOf(shownKind),
                      onShowAll: () => {
                        setKind('all');
                        // On the choice it made: the line, and its button, go (T525's review).
                        requestAnimationFrame(() => {
                          document
                            .querySelector<HTMLInputElement>('.kind-filter input[value="all"]')
                            ?.focus();
                        });
                      },
                    }
                  : undefined
              }
              // Both roots are somewhere to move to as well (AC-193, AC-194).
              folders={[
                ...ROOT_FOLDERS.map((root) => ({ ...root, parentId: null })),
                ...(folders.data ?? []),
              ]}
              sourceKinds={sourceKinds}
              {...(searching
                ? {
                    folderNames: new Map([
                      ...ROOT_FOLDERS.map((root) => [root.id, root.title] as const),
                      ...(folders.data ?? []).map((folder) => [folder.id, folder.title] as const),
                    ]),
                  }
                : {})}
              emptyText={
                searching
                  ? 'Nothing matches.'
                  : // New makes no dashboard or chart in a shared folder (T331):
                    // the footnote says where they are made.
                    inShared
                    ? 'This folder is empty.'
                    : 'This folder is empty. Use ＋ New to add a dashboard or chart.'
              }
              onOpen={(item) => {
                // A folder has no page of its own: opening it means selecting it.
                if (item.kind === 'folder') {
                  openFolder(item.id);
                  return;
                }
                // A model file, in the model editor (T334, AC-269), in its own
                // folder beside that folder's files: never the root's file of
                // the same path (T342, AC-222).
                if (item.kind === 'model') {
                  globalThis.location.assign(fileHref(item.id, item.folderId ?? folderId));
                  return;
                }
                globalThis.location.assign(`/explore/${item.kind}s/${encodeURIComponent(item.id)}`);
              }}
              opens={opensFromExplore}
              // Only where the user may change what is listed (rule 68, T331).
              {...(mayChangeRows
                ? {
                    onRename: (item: CatalogItem, title: string) =>
                      relocate.mutate({ item, title }),
                    onMove: (item: CatalogItem, target: string) =>
                      relocate.mutate({ item, folderId: target }),
                    // Delete… last in the row's ⋯ (design 14, pin 8).
                    onDelete: (item: CatalogItem) => {
                      setDeletingItem(item);
                    },
                    deletes: (item: CatalogItem) =>
                      deleteOf(item) !== undefined &&
                      (item.kind !== 'folder' || isEmptyFolder(item)),
                  }
                : {})}
              // Not while a data source is being added in the pane it would
              // replace, with what was typed there (T471).
              onExport={
                addingSource === null && !importing
                  ? (item) => {
                      setAccessOf(null);
                      setExportOf(item);
                    }
                  : undefined
              }
              // A data source's tables as cubes (T492): into My workspace's
              // model, to go to its folder, for those with a workspace; with
              // sign-in off, the root's model.
              onGenerate={
                mayGenerateCubes
                  ? (item) => {
                      const source = cubeSourceOfItem(item);
                      if (source === undefined) return;
                      router.history.push(
                        generateFrom(queryClient, {
                          source,
                          target: item.folderId ?? SHARED_ROOT.id,
                          signedIn,
                        }),
                      );
                    }
                  : undefined
              }
              generates={(item) => cubeSourceOfItem(item) !== undefined}
              // Once the folders are read: before, every target would read as
              // one the user can't see (T498's review).
              {...(inOwnWorkspace && folders.isSuccess
                ? {
                    workspace: {
                      pathOf: (id: string) => targetPathOf(folders.data, id),
                      // To its target, by a proposal (T358, AC-284).
                      onPropose: (item: CatalogItem) => {
                        setProposing(item);
                      },
                      statusOf: (item: CatalogItem) => statusOfItem(myProposals.data?.mine, item),
                    },
                  }
                : {})}
            />
            {proposing === null ||
            proposing.kind === 'folder' ||
            (proposing.kind === 'model' && proposing.fileId === undefined) ? null : (
              <ProposeFlow
                item={{
                  kind: proposing.kind,
                  // A model by its file's id, not its path (T350).
                  id: proposing.kind === 'model' ? proposing.fileId! : proposing.id,
                  title: proposing.title,
                }}
                targetPath={pathFromShared(
                  proposing.targetFolderId == null
                    ? undefined
                    : targetPathOf(folders.data ?? [], proposing.targetFolderId),
                )}
                onClose={() => {
                  setProposing(null);
                }}
                onProposed={() => {
                  setProposing(null);
                }}
              />
            )}
            {/* The prototype's footnote under the list (F22); in the
                workspace, the workspace's own (design 04, pin 8); in a shared
                folder, to those who may make a folder there, where the rest
                is made (design 04, state C; T331). */}
            {inOwnWorkspace ? (
              <p className="explore__note explore__note--workspace">
                Items here are private. Each goes to its target folder only when you propose it and
                it’s approved; you may approve your own.
              </p>
            ) : inShared ? (
              role.creates.length > 0 ? (
                <p className="explore__note">
                  To add a dashboard, chart, model or data source here, create it in My workspace
                  with this folder as its target.
                </p>
              ) : null
            ) : (
              <p className="explore__note">
                Charts are shared: a chart used on several dashboards is edited once, and every
                dashboard shows the change.
              </p>
            )}
          </div>
        ) : null}
      </section>
      {addingSource === null ? null : (
        // Made through its wizard, docked where the Access panel docks, beside
        // the workspace's listing, tested before it is made (T363, T471,
        // AC-158; design 02, pin 6). In the workspace folder it was asked for
        // in, wherever the tree goes while it is open.
        <NewSourceWizard
          folderId={addingIn}
          targets={addingSource}
          onClose={() => {
            setAskingTarget(null);
          }}
          onCreated={() => {
            setAskingTarget(null);
            void queryClient.invalidateQueries({ queryKey: ['folder-contents'] });
            void queryClient.invalidateQueries({ queryKey: ['folder-roots'] });
            void queryClient.invalidateQueries({ queryKey: ['data-sources'] });
          }}
        />
      )}
      {exportOf === null ? null : (
        <ExportPane
          key={exportOf.id}
          dashboardId={exportOf.id}
          title={exportOf.title}
          onClose={() => {
            closeExport(exportOf);
          }}
          onExported={(message) => {
            setExported(message);
            closeExport(exportOf);
          }}
        />
      )}
      <ExportedToast
        message={exported}
        onDismiss={() => {
          setExported('');
        }}
      />
      {(() => {
        const deleting = deletingItem === null ? undefined : deleteOf(deletingItem);
        return deletingItem === null || deleting === undefined ? null : (
          <DeleteDialog
            key={`${deletingItem.kind}:${deletingItem.id}`}
            name={deletingItem.title}
            action={deleting.action}
            check={deleting.check}
            remove={deleting.remove}
            onDeleted={() => {
              if (deletingOpen && parentId !== undefined) openDeleted(deletingItem, parentId);
              else rowDeleted(deletingItem);
            }}
            onClose={() => {
              const item = deletingItem;
              const fromHeader = deletingOpen;
              setDeletingItem(null);
              setDeletingOpen(false);
              // Back on the ⋯ it came from (design 14, keyboard).
              requestAnimationFrame(() => {
                document
                  .querySelector<HTMLElement>(
                    fromHeader
                      ? '[data-testid="folder-more"]'
                      : `[data-testid="item-${CSS.escape(item.id)}"] [aria-haspopup="menu"]`,
                  )
                  ?.focus();
              });
            }}
          />
        );
      })()}
      {clearing ? (
        <ClearWorkspaceDialog
          onCleared={(text) => {
            // Nothing left to clear: the ⋯ goes, the heading has focus (F3).
            setClearing(false);
            setSaid(text);
            heading.current?.focus();
            refreshListings();
          }}
          onFailed={refreshListings}
          onClose={() => {
            setClearing(false);
            requestAnimationFrame(() => {
              document.querySelector<HTMLElement>('[data-testid="folder-more"]')?.focus();
            });
          }}
        />
      ) : null}
      {/* Deleted, from a row or from the item's own page (design 14, A5); cleared (F3). */}
      <ExportedToast
        message={said}
        onDismiss={() => {
          setSaid('');
        }}
      />
      {importing ? (
        <ImportPane
          signedIn={signedIn}
          onClose={() => {
            setImporting(false);
            // Back to New, where it began (design 13, state X).
            requestAnimationFrame(() => {
              document.querySelector<HTMLElement>('[data-testid="explore-new"]')?.focus();
            });
          }}
          onImported={(landed) => {
            setImporting(false);
            const created = [
              counted(landed.created.dashboards, 'dashboard'),
              counted(landed.created.charts, 'chart'),
              ...(landed.created.models === 0 ? [] : [counted(landed.created.models, 'model')]),
              ...(landed.created.dataSources === 0
                ? []
                : [counted(landed.created.dataSources, 'data source')]),
            ];
            const where =
              landed.target.path.length === 0 ? 'Shared' : landed.target.path.join(' / ');
            setImported({
              message: `Imported to My workspace as new drafts: ${listed(created)}. Nothing in ${where} changed.`,
              // Proposed as any draft is (design 05), the single user's too (T359).
              ...(viaWorkspace
                ? {
                    dashboard: {
                      kind: 'dashboard',
                      id: landed.dashboard.id,
                      title: landed.dashboard.title,
                      owner: null,
                      updatedAt: new Date().toISOString(),
                      targetFolderId: landed.target.id,
                    },
                  }
                : {}),
            });
            focusRow.current = landed.dashboard.id;
            void queryClient.invalidateQueries({ queryKey: ['folder-contents'] });
            void queryClient.invalidateQueries({ queryKey: ['folder-roots'] });
            void queryClient.invalidateQueries({ queryKey: ['data-sources'] });
          }}
        />
      ) : null}
      <ExportedToast
        message={imported?.message ?? ''}
        action={
          imported?.dashboard === undefined
            ? undefined
            : {
                label: `Propose to ${
                  targetPathOf(folders.data ?? [], imported.dashboard.targetFolderId ?? '') ??
                  'its folder'
                }…`,
                onSelect: () => {
                  if (imported.dashboard !== undefined) setProposing(imported.dashboard);
                },
              }
        }
        onDismiss={() => {
          setImported(null);
        }}
      />
      {accessOpen ? (
        <AccessPanel
          folderId={folderId}
          folderTitle={folderTitle}
          parentTitle={chain.length > 1 ? chain.at(-2)?.title : undefined}
          titleOf={titleOf}
          myGroups={me.data?.groups ?? []}
          superAdmin={me.data?.superAdmin === true}
          onOpenFolder={openFolder}
          onClose={() => {
            setAccessOf(null);
            // Back where the panel was opened from.
            accessButton.current?.focus();
          }}
          id={ACCESS_PANEL_ID}
        />
      ) : null}
    </div>
  );
}
