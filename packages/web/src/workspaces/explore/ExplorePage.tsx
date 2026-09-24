import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { StateLine } from '../../shell/StatusIcon';
import { CreateMenu, DEFAULT_TITLES, type CreatableKind } from './CreateMenu';
import { FolderContents, type CatalogItem } from './FolderContents';
import { FolderTree, type FolderNode } from './FolderTree';

/**
 * Explore: the folder tree and the open folder (AC-017), laid out as the
 * prototype lays it out (AC-192): a breadcrumb, the folder's name as the
 * page's heading with Rename beside it, a search box, and one "New" menu.
 *
 * Dashboards and charts live in folders here; there is no separate Dashboards
 * workspace (docs/inputs §8).
 */
const ROOT = 'root';
const ROOT_TITLE = 'All folders';
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

/** The folder and each folder above it, the root first. */
function chainOf(folders: readonly FolderNode[], id: string): { id: string; title: string }[] {
  const out: { id: string; title: string }[] = [];
  let current = folders.find((folder) => folder.id === id);
  // Bounded by the number of folders: a cycle in stored data cannot hang it.
  for (let guard = 0; current !== undefined && guard <= folders.length; guard += 1) {
    out.unshift({ id: current.id, title: current.title });
    const parent: string | null = current.parentId;
    current = folders.find((folder) => folder.id === parent);
  }
  return [{ id: ROOT, title: ROOT_TITLE }, ...out];
}

export function ExplorePage() {
  const [folderId, setFolderId] = useState(ROOT);
  /** The Explore search box (AC-019): typing searches every folder. */
  const [query, setQuery] = useState('');
  /** The open folder's name, while it is being renamed in the heading. */
  const [renaming, setRenaming] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const searching = query.trim() !== '';

  const folders = useQuery({
    queryKey: ['folders'],
    queryFn: () => getJson<FolderNode[]>('/api/folders'),
  });

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
        setRenaming(DEFAULT_TITLES.folder);
        return;
      }
      globalThis.location.assign(`/explore/${created.kind}s/${encodeURIComponent(created.id)}`);
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
    },
  });

  const chain = chainOf(folders.data ?? [], folderId);
  /**
   * Whether the open folder is one the tree knows. While the folders load,
   * or after one is deleted elsewhere, it is not — and borrowing the root's
   * name for it would put "All folders" over a real folder's contents, with
   * a Rename that renames the folder under a name it does not have.
   */
  const known = folderId === ROOT || chain.at(-1)?.id === folderId;
  const folderTitle = known ? (chain.at(-1)?.title ?? ROOT_TITLE) : '';

  /** Open a folder: the tree, a breadcrumb or a folder's row. */
  const openFolder = (id: string) => {
    setQuery('');
    setRenaming(null);
    setFolderId(id);
  };

  const commitRename = () => {
    if (renaming === null) return;
    const title = renaming.trim() === '' ? UNTITLED_FOLDER : renaming.trim();
    setRenaming(null);
    if (title !== folderTitle) relocate.mutate({ item: { kind: 'folder', id: folderId }, title });
  };

  const shown = searching ? results : contents;

  return (
    <div className="explore">
      <aside className="explore__tree">
        <FolderTree
          folders={folders.data ?? []}
          selectedId={searching ? '' : folderId}
          onSelect={openFolder}
          rootId={ROOT}
          rootTitle={ROOT_TITLE}
        />
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
          {/* The root is not a folder anyone named, so it has no Rename. */}
          {!searching && renaming === null && folderId !== ROOT && known ? (
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
          <FolderContents
            items={searching ? shown.data.slice(0, SEARCH_SHOWN) : shown.data}
            folders={folders.data ?? []}
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
        ) : null}
      </section>
    </div>
  );
}
