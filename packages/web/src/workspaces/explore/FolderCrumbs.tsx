import { useEffect, useState } from 'react';

import type { FolderNode } from './FolderTree';
import { exploreHref, folderChain } from './folders';
import { rootTitleOf, SHARED_ROOT } from './roots';

/**
 * The way back from a dashboard or a library chart to the folder it lives in
 * (AC-195): the prototype's "← Explore / Sales /" row, each step a link that
 * opens Explore on that folder — by address, so a reload lands there too.
 *
 * Until the folders are read — or if they cannot be — only "← Explore"
 * shows, and it already leads to the item's own folder: the way back never
 * waits on the names. Read with a plain fetch, as the settings' folder picker
 * reads them, so the header needs no query client of its own.
 */
export function FolderCrumbs({ folderId }: { readonly folderId: string | undefined }) {
  const [folders, setFolders] = useState<readonly FolderNode[] | undefined>(undefined);
  // A folder the list does not have — deleted since — is no way back; the
  // shared root is, and both links then say so (T216's review).
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
        // A list, or nothing: an answer of any other shape names no folder.
        if (Array.isArray(read)) setFolders(read as FolderNode[]);
      })
      .catch(() => {
        // Said by "← Explore" alone.
      });
    return () => {
      asked.abort();
    };
  }, []);
  const chain = folders === undefined ? [] : folderChain(folders, home);

  return (
    <nav className="crumbs item-crumbs" aria-label="Breadcrumb">
      <a className="item-crumbs__back" href={exploreHref(home)}>
        ← Explore
      </a>
      {chain.map((crumb) => (
        <span key={crumb.id} className="crumbs__step">
          <span aria-hidden="true">/</span>
          <a href={exploreHref(crumb.id)}>{crumb.title}</a>
        </span>
      ))}
    </nav>
  );
}
