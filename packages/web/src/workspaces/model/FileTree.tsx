import { useMemo } from 'react';

import { StatusIcon } from '../../shell/StatusIcon';
import { objectsOf } from './objects';

/**
 * The Model workspace's file tree (T234, AC-222), the prototype's left pane
 * (model.js, `renderTree`): the model's files under their folders, each a
 * link to itself — opened in place, the tree staying — the open one marked
 * current, each that has problems marked with its icon and a word, and New
 * cube and New view.
 */
export interface FileTreeProps {
  readonly files: readonly { readonly path: string; readonly content: string }[];
  /** The file open in the editor. */
  readonly current?: string | undefined;
  /**
   * The errors the open file's editor knows of, by file — its own as it
   * stands, and those Cube gave for any file — which its stored text does not
   * show (T234's review).
   */
  readonly reported?: Readonly<Record<string, number>> | undefined;
  /** Files made here and not yet published. */
  readonly drafts?: ReadonlySet<string> | undefined;
  readonly onOpen: (path: string) => void;
  readonly onNew: (kind: 'cube' | 'view') => void;
}

export function fileHref(path: string): string {
  return `/model/files/${encodeURIComponent(path)}`;
}

export function FileTree({ files, current, reported, drafts, onOpen, onNew }: FileTreeProps) {
  // Each file read once for whether it parses, not on every render.
  const unparsed = useMemo(
    () =>
      new Set(
        files
          .filter((file) => objectsOf(file.path, file.content).problem !== undefined)
          .map((file) => file.path),
      ),
    [files],
  );
  const folders = new Map<string, (typeof files)[number][]>();
  for (const file of [...files].sort((a, b) => (a.path < b.path ? -1 : 1))) {
    const at = file.path.lastIndexOf('/');
    const folder = at < 0 ? '' : `${file.path.slice(0, at)}/`;
    folders.set(folder, [...(folders.get(folder) ?? []), file]);
  }
  /** Problems: as the editor has the open file now; for another, its text or Cube's word. */
  const troubled = (path: string) => {
    const said = reported?.[path];
    if (path === current && said !== undefined) return said > 0;
    return unparsed.has(path) || (said ?? 0) > 0;
  };

  return (
    <nav className="model-tree" aria-label="Model files">
      <div className="model-tree__head">
        <h2>Files</h2>
        <button type="button" className="btn-sm" onClick={() => onNew('cube')}>
          New cube
        </button>
        <button type="button" className="btn-sm" onClick={() => onNew('view')}>
          New view
        </button>
      </div>
      <div className="model-tree__body">
        {[...folders.entries()].map(([folder, inside]) => (
          <div
            key={folder}
            role="group"
            aria-label={folder === '' ? 'Model root' : folder}
            className="model-tree__folder"
          >
            <p className="model-tree__dir" aria-hidden="true">
              {folder === '' ? 'model/' : folder}
            </p>
            <ul>
              {inside.map((file) => (
                <li key={file.path}>
                  <a
                    className="model-tree__file"
                    href={fileHref(file.path)}
                    aria-current={file.path === current ? 'page' : undefined}
                    onClick={(event) => {
                      // A plain click opens it in place; a new tab still can.
                      if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0)
                        return;
                      event.preventDefault();
                      onOpen(file.path);
                    }}
                  >
                    <span className="model-tree__name">{file.path.slice(folder.length)}</span>
                    {/* Each with its icon and a word (direction.md rule 3). */}
                    {drafts?.has(file.path) === true ? (
                      <span className="model-tree__tag">
                        <StatusIcon kind="idle" />
                        unpublished
                      </span>
                    ) : null}
                    {troubled(file.path) ? (
                      <span className="model-tree__mark">
                        <StatusIcon kind="err" />
                        problems
                      </span>
                    ) : null}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  );
}
