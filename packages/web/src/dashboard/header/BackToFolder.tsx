import { useEffect, useState } from 'react';

import type { FolderNode } from '../../workspaces/explore/FolderTree';
import { exploreHref, folderChain } from '../../workspaces/explore/folders';
import { rootTitleOf, SHARED_ROOT } from '../../workspaces/explore/roots';

/**
 * The way back, first in the compact row (AC-485, AC-195; design 19 pin 1,
 * 19-Q9): one step, "← ‹folder›", naming the dashboard's folder, with the
 * whole path — as `FolderCrumbs` builds it — in its accessible name and
 * tooltip. It opens Explore on that folder.
 *
 * A folder deleted since, which the list no longer has, is no way back: it
 * leads to Shared, and says so, as the crumbs did (T216's review).
 */
export function BackToFolder({ folderId }: { readonly folderId: string | undefined }) {
  const [folders, setFolders] = useState<readonly FolderNode[] | undefined>(undefined);
  const known =
    folderId === undefined ||
    rootTitleOf(folderId) !== undefined ||
    folders === undefined ||
    folders.some((folder) => folder.id === folderId);
  const home = folderId !== undefined && known ? folderId : SHARED_ROOT.id;
  useEffect(() => {
    const asked = new AbortController();
    void fetch('/api/folders', { signal: asked.signal })
      .then(async (response) => {
        if (!response.ok) return;
        const read: unknown = await response.json();
        if (Array.isArray(read)) setFolders(read as FolderNode[]);
      })
      .catch(() => {
        // Said by the root's name alone, or "Explore".
      });
    return () => {
      asked.abort();
    };
  }, []);

  // Before the folders are read, a root names itself; another folder waits.
  const rootTitle = rootTitleOf(home);
  const chain =
    folders !== undefined
      ? folderChain(folders, home)
      : rootTitle === undefined
        ? []
        : [{ id: home, title: rootTitle }];
  const path = chain.map((crumb) => crumb.title).join(' / ');
  const name = `Back to ${path === '' ? 'Explore' : path}`;

  return (
    <a className="header-back" href={exploreHref(home)} aria-label={name} title={name}>
      <span aria-hidden="true">←</span>{' '}
      <span className="header-back__folder">{chain.at(-1)?.title ?? 'Explore'}</span>
    </a>
  );
}
