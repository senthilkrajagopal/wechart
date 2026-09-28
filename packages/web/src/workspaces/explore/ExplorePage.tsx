import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter, useRouterState } from '@tanstack/react-router';
import { useRef, useState } from 'react';

import { META_QUERY } from '../../query/meta';
import { ME_QUERY } from '../../shell/me';
import { StateLine } from '../../shell/StatusIcon';
import { AccessPanel, folderAccessQuery, refreshFolderAccess } from './access/AccessPanel';
import { CreateMenu, DEFAULT_TITLES, type CreatableKind } from './CreateMenu';
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
  const setFolderId = (id: string) => {
    // The folder already open is no new place for Back to step through.
    if (id !== folderId) router.history.push(exploreHref(id));
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
      const response = await fetch('/api/documents', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          kind,
          title,
          folderId,
          ...(targetFolderId === undefined ? {} : { targetFolderId }),
        }),
      });
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
      if (!response.ok) throw new Error(`Could not save: ${String(response.status)}`);
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
    kind: 'dashboard' | 'chart' | 'data-source';
    targets: readonly Target[];
    /** The folder it is made in: the one open when it was asked for. */
    folderId: string;
  } | null>(null);
  const [targetsFailed, setTargetsFailed] = useState<string | null>(null);
  const askTarget = async (kind: 'dashboard' | 'chart' | 'data-source') => {
    setTargetsFailed(null);
    const asked = folderId;
    try {
      const targets = await getJson<Target[]>('/api/folders/targets');
      // The two docked panes replace each other (T471): Access closes first.
      if (kind === 'data-source') setAccessOf(null);
      setAskingTarget({ kind, targets, folderId: asked });
    } catch (error) {
      setTargetsFailed((error as Error).message);
    }
  };
  /** A dashboard or chart being asked for: made at once, once its target is chosen. */
  const askingItem =
    askingTarget === null || askingTarget.kind === 'data-source'
      ? null
      : { kind: askingTarget.kind, targets: askingTarget.targets };
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
   * member, rule 68). With sign-in off there is one user and no groups, and
   * Explore stays as phase 1 had it.
   */
  const me = useQuery(ME_QUERY);
  const signedIn = me.data?.security === 'oidc';
  // My workspace only where the API counts one (T343, AC-277); with sign-in
  // on, first in the tree (T498; design 04, pin 1).
  const roots = visibleRoots(rootCounts.data, { workspaceFirst: signedIn });
  /**
   * In a signed-in user's workspace, each item says where it goes and where
   * it came from, and its status (T498; design 04, pins 2–4 and 8). With
   * sign-in off, phase 1's one user's workspace goes nowhere.
   */
  const inOwnWorkspace =
    signedIn && inMyWorkspace && !searching && roots.some((root) => isMyWorkspace(root.id));
  // What is being proposed (T358), and each item's latest proposal, for its
  // status past Draft (design 04; design 05, state M).
  const [proposing, setProposing] = useState<CatalogItem | null>(null);
  const myProposals = useQuery({ ...REVIEWS_QUERY, enabled: inOwnWorkspace, retry: false });
  const access = useQuery({
    ...folderAccessQuery(folderId),
    enabled: signedIn && !searching && !isMyWorkspace(folderId),
    retry: false,
  });
  const mayEditAccess = signedIn && !searching && known && access.isSuccess;
  const [accessOf, setAccessOf] = useState<string | null>(null);
  const accessButton = useRef<HTMLButtonElement>(null);
  // The two docked panes replace each other: not both at once (T471).
  const accessOpen = mayEditAccess && accessOf === folderId && addingSource === null;
  const titleOf = (id: string) =>
    rootTitleOf(id) ?? (folders.data ?? []).find((folder) => folder.id === id)?.title ?? id;

  /** Open a folder: the tree, a breadcrumb or a folder's row. */
  const openFolder = (id: string) => {
    setQuery('');
    setRenaming(null);
    setFolderId(id);
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

  return (
    <div
      className={
        addingSource !== null
          ? 'explore explore--source'
          : accessOpen
            ? 'explore explore--access'
            : 'explore'
      }
    >
      {/* The prototype's docked Folders pane (AC-194), kept in view as the
          contents scroll. */}
      <aside className="explore__tree" aria-labelledby="explore-folders-heading">
        <div className="explore__pane-head">
          <h2 id="explore-folders-heading">Folders</h2>
          <button
            type="button"
            className="btn-ghost btn-sm"
            onClick={() => create.mutate({ kind: 'folder' })}
          >
            + Folder
          </button>
        </div>
        <div className="explore__pane-body">
          <FolderTree
            folders={folders.data ?? []}
            roots={roots}
            selectedId={searching ? '' : folderId}
            onSelect={openFolder}
          />
        </div>
      </aside>
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
            <h1 className="explore__title">{searching ? 'Search' : folderTitle}</h1>
          )}
          {/* A root is not a folder anyone named, so it has no Rename. */}
          {!searching && renaming === null && !isRoot && known ? (
            <button
              type="button"
              className="btn-ghost btn-sm"
              onClick={() => setRenaming(folderTitle)}
            >
              Rename
            </button>
          ) : null}
          {mayEditAccess && access.data?.onlySuperAdmins ? (
            <span className="explore__alone">Only Super-Admins can see this folder</span>
          ) : null}
          {mayEditAccess ? (
            <button
              type="button"
              className="btn-ghost btn-sm"
              ref={accessButton}
              aria-expanded={accessOpen}
              aria-controls={accessOpen ? ACCESS_PANEL_ID : undefined}
              // Where the new data source's pane is docked, until it closes.
              disabled={addingSource !== null}
              onClick={() => setAccessOf(accessOpen ? null : folderId)}
            >
              Access
            </button>
          ) : null}
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
            // Not until the open folder is known: until then, whether it is
            // in the workspace isn't (T345's review).
            // Nor while a data source is being added in its pane: something
            // new would replace it, and what was typed there with it (T471).
            busy={create.isPending || !known || me.isPending || addingSource !== null}
            onCreate={(kind) => {
              // In a signed-in user's workspace, a dashboard or chart names the
              // shared folder it is to go to first (T345, AC-282). With sign-in
              // off, phase 1's one user's is theirs alone: nothing goes anywhere.
              if (kind !== 'folder' && signedIn && inMyWorkspace) void askTarget(kind);
              else create.mutate({ kind });
            }}
            {...(signedIn && inMyWorkspace
              ? { onNewSource: () => void askTarget('data-source') }
              : {})}
          />
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
        {searching && results.isSuccess && results.data.length > SEARCH_SHOWN ? (
          <StateLine kind="warn">
            Showing the first {SEARCH_SHOWN.toLocaleString('en-US')} matches. Type more to narrow
            the search.
          </StateLine>
        ) : null}
        {shown.isPending ? <StateLine kind="run">Loading…</StateLine> : null}
        {shown.isError ? (
          <StateLine kind="err">
            {searching ? 'Could not search: ' : 'Could not load this folder: '}
            {(shown.error as Error).message}
          </StateLine>
        ) : null}
        {shown.isSuccess ? (
          <div className="explore__scroll">
            <FolderContents
              items={searching ? shown.data.slice(0, SEARCH_SHOWN) : shown.data}
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
                  : 'This folder is empty. Use ＋ New to add a dashboard or chart.'
              }
              onOpen={(item) => {
                // A folder has no page of its own: opening it means selecting it.
                if (item.kind === 'folder') {
                  openFolder(item.id);
                  return;
                }
                // A model file, in the model editor (T334, AC-269).
                if (item.kind === 'model') {
                  globalThis.location.assign(`/model/files/${encodeURIComponent(item.id)}`);
                  return;
                }
                globalThis.location.assign(`/explore/${item.kind}s/${encodeURIComponent(item.id)}`);
              }}
              opens={opensFromExplore}
              onRename={(item, title) => relocate.mutate({ item, title })}
              onMove={(item, target) => relocate.mutate({ item, folderId: target })}
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
            (proposing.kind !== 'dashboard' &&
              proposing.kind !== 'chart' &&
              proposing.kind !== 'data-source') ? null : (
              <ProposeFlow
                item={{ kind: proposing.kind, id: proposing.id, title: proposing.title }}
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
                workspace, the workspace's own (design 04, pin 8). */}
            {inOwnWorkspace ? (
              <p className="explore__note explore__note--workspace">
                Items here are private. Each goes to its target folder only when you propose it and
                it’s approved; you may approve your own.
              </p>
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
