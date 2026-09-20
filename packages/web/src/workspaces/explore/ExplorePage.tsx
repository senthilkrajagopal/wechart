import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { CreateMenu, type CreatableKind } from './CreateMenu';
import { FolderContents, type CatalogItem } from './FolderContents';
import { FolderTree, type FolderNode } from './FolderTree';

/**
 * Explore: the folder tree and the selected folder's contents (AC-017).
 *
 * Dashboards and charts live in folders here; there is no separate Dashboards
 * workspace (docs/inputs §8).
 */
const ROOT = 'root';

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
  const [folderId, setFolderId] = useState(ROOT);
  const queryClient = useQueryClient();

  /**
   * AC-020: the new object lands in the selected folder and is opened.
   * A folder "opens" by becoming the selection, since it has no page of its
   * own; a dashboard or chart opens at its own route.
   */
  const create = useMutation({
    mutationFn: async ({ kind, title }: { kind: CreatableKind; title: string }) => {
      const response = await fetch('/api/documents', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind, title, folderId }),
      });
      if (!response.ok) throw new Error(`Could not create: ${String(response.status)}`);
      return (await response.json()) as CreatedObject;
    },
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({ queryKey: ['folder-contents'] });
      if (created.kind === 'folder') {
        await queryClient.invalidateQueries({ queryKey: ['folders'] });
        setFolderId(created.id);
        return;
      }
      globalThis.location.assign(`/explore/${created.kind}s/${encodeURIComponent(created.id)}`);
    },
  });

  const folders = useQuery({
    queryKey: ['folders'],
    queryFn: () => getJson<FolderNode[]>('/api/folders'),
  });

  const contents = useQuery({
    queryKey: ['folder-contents', folderId],
    queryFn: () => getJson<CatalogItem[]>(`/api/folders/${encodeURIComponent(folderId)}/contents`),
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
      item: CatalogItem;
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

  return (
    <div className="explore">
      <aside className="explore__tree">
        <FolderTree
          folders={folders.data ?? []}
          selectedId={folderId}
          onSelect={setFolderId}
          rootId={ROOT}
        />
      </aside>
      <section className="explore__contents" data-testid="explore-contents">
        <CreateMenu
          folderId={folderId}
          busy={create.isPending}
          onCreate={(kind, title) => create.mutateAsync({ kind, title }).then(() => undefined)}
        />
        {create.isError ? <p role="alert">{(create.error as Error).message}</p> : null}
        {contents.isPending ? <p>Loading…</p> : null}
        {contents.isError ? (
          <p role="alert">Could not load this folder: {(contents.error as Error).message}</p>
        ) : null}
        {contents.isSuccess ? (
          <FolderContents
            items={contents.data}
            folders={folders.data ?? []}
            onOpen={(item) => {
              // A folder has no page of its own: opening it means selecting it.
              if (item.kind === 'folder') {
                setFolderId(item.id);
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
