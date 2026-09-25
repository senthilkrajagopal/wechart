import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter, useRouterState } from '@tanstack/react-router';
import { useState } from 'react';

import { META_QUERY } from '../../query/meta';
import { StateLine } from '../../shell/StatusIcon';
import { CreateMenu, DEFAULT_TITLES, type CreatableKind } from './CreateMenu';
import { FolderContents, type CatalogItem } from './FolderContents';
import { FolderTree } from './FolderTree';
import { exploreHref, folderChain, FOLDERS_QUERY } from './folders';
import { ROOT_FOLDERS, SHARED_ROOT, rootTitleOf } from './roots';

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
    mutationFn: async (kind: CreatableKind) => {
      const response = await fetch('/api/documents', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind, title: DEFAULT_TITLES[kind], folderId }),
      });
      if (!response.ok) throw new Error(`Could not create: ${String(response.status)}`);
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
      // A chart opens in the editor, to be built (AC-213); a dashboard, in
      // edit mode, as the prototype's New opens it (T245, N15).
      globalThis.location.assign(
        `/explore/${created.kind}s/${encodeURIComponent(created.id)}${created.kind === 'chart' ? '/edit' : '?editing=true'}`,
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
      // A move can change a root's count as well as its folders' (AC-194).
      await queryClient.invalidateQueries({ queryKey: ['folder-roots'] });
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
  const folderTitle = known ? (chain.at(-1)?.title ?? SHARED_ROOT.title) : '';

  /** The roots' counts, which are no folder's (AC-194). */
  const rootCounts = useQuery({
    queryKey: ['folder-roots'],
    queryFn: () => getJson<Record<string, number>>('/api/folder-roots'),
  });
  const roots = ROOT_FOLDERS.map((root) => ({
    ...root,
    ...(rootCounts.data?.[root.id] === undefined ? {} : { itemCount: rootCounts.data[root.id] }),
  }));

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
    <div className="explore">
      {/* The prototype's docked Folders pane (AC-194), kept in view as the
          contents scroll. */}
      <aside className="explore__tree" aria-labelledby="explore-folders-heading">
        <div className="explore__pane-head">
          <h2 id="explore-folders-heading">Folders</h2>
          <button
            type="button"
            className="btn-ghost btn-sm"
            onClick={() => create.mutate('folder')}
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
          <span className="explore__spacer" />
          <input
            type="search"
            className="explore__search"
            aria-label="Search dashboards and charts"
            placeholder="Search dashboards and charts"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <CreateMenu busy={create.isPending} onCreate={(kind) => create.mutate(kind)} />
        </div>

        {create.isError ? (
          <StateLine kind="err">{(create.error as Error).message}</StateLine>
        ) : null}
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
                globalThis.location.assign(`/explore/${item.kind}s/${encodeURIComponent(item.id)}`);
              }}
              onRename={(item, title) => relocate.mutate({ item, title })}
              onMove={(item, target) => relocate.mutate({ item, folderId: target })}
            />
            {/* The prototype's footnote under the list (F22). */}
            <p className="explore__note">
              Charts are shared: a chart used on several dashboards is edited once, and every
              dashboard shows the change.
            </p>
          </div>
        ) : null}
      </section>
    </div>
  );
}
