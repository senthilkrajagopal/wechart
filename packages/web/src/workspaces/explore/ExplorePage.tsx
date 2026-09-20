import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

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

export function ExplorePage() {
  const [folderId, setFolderId] = useState(ROOT);

  const folders = useQuery({
    queryKey: ['folders'],
    queryFn: () => getJson<FolderNode[]>('/api/folders'),
  });

  const contents = useQuery({
    queryKey: ['folder-contents', folderId],
    queryFn: () => getJson<CatalogItem[]>(`/api/folders/${encodeURIComponent(folderId)}/contents`),
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
        {contents.isPending ? <p>Loading…</p> : null}
        {contents.isError ? (
          <p role="alert">Could not load this folder: {(contents.error as Error).message}</p>
        ) : null}
        {contents.isSuccess ? <FolderContents items={contents.data} /> : null}
      </section>
    </div>
  );
}
