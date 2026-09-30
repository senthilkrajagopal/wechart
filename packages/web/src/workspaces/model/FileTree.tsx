import { useId, useMemo, useState } from 'react';

import { StateLine, StatusIcon } from '../../shell/StatusIcon';
import { fileHref } from './inFolder';
import { objectsOf, type FileObjects } from './objects';
import { validationProblems } from './validate';

/**
 * The Model workspace's file tree (T234, AC-222), the prototype's left pane
 * (model.js, `renderTree`): the model's files under their folders, each a
 * link to itself — opened in place, the tree staying — the open one marked
 * current, each that has problems marked with its icon and a word, and New
 * cube and New view.
 *
 * Drawn as design 03 note 1 (T479, AC-344): headed "Model" with the model's
 * state, its folders rows under `model/` that fold, a file the form can't
 * open tagged with its kind, and New cube, New view and Generate cubes after
 * the files.
 */

/** What a code or template file is, in its tag's tooltip: it opens read-only (AC-140). */
const KIND_TITLES: Readonly<Record<NonNullable<FileObjects['code']>, string>> = {
  Jinja: 'Jinja template · read-only here',
  Python: 'Python file · read-only here',
  JavaScript: 'JavaScript file · read-only here',
};

const folderOf = (path: string) => {
  const at = path.lastIndexOf('/');
  return at < 0 ? '' : `${path.slice(0, at)}/`;
};
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
  /**
   * Files with changes not yet published (AC-222, AC-226): made here, or
   * edited in the open editor.
   */
  readonly unpublished?: ReadonlySet<string> | undefined;
  readonly onOpen: (path: string) => void;
  /**
   * New cube and New view; none where the model is read-only, in a shared
   * folder with sign-in on (T342, AC-222).
   */
  readonly onNew?: ((kind: 'cube' | 'view') => void) | undefined;
  /** Generate cubes from a data source's tables (T145, AC-139). */
  readonly onGenerate?: (() => void) | undefined;
  /** Whether Generate cubes is open: its button is shown pressed (design 11 pin 9). */
  readonly generating?: boolean | undefined;
  /** Whether the model's files are still being read (design 12 state F). */
  readonly reading?: boolean | undefined;
  /** Each file's address: in its folder, opened from Explore (T342); the Model workspace's by default. */
  readonly hrefOf?: ((path: string) => string) | undefined;
}

export function FileTree({
  files,
  current,
  reported,
  unpublished,
  onOpen,
  onNew,
  onGenerate,
  generating = false,
  reading = false,
  hrefOf = (path) => fileHref(path),
}: FileTreeProps) {
  // Each file read once for whether it parses, whether Cube would take what
  // it says (AC-227), and whether it is code the form can't open (AC-140) —
  // not on every render.
  const { unparsed, kinds } = useMemo(() => {
    const read = files.map((file) => ({ file, objects: objectsOf(file.path, file.content) }));
    return {
      unparsed: new Set(
        read
          .filter(
            ({ file, objects }) =>
              objects.problem !== undefined ||
              validationProblems(file.path, file.content).length > 0,
          )
          .map(({ file }) => file.path),
      ),
      kinds: new Map(
        read.flatMap(({ file, objects }) =>
          objects.code === undefined ? [] : [[file.path, objects.code] as const],
        ),
      ),
    };
  }, [files]);
  const folders = new Map<string, (typeof files)[number][]>();
  for (const file of [...files].sort((a, b) => (a.path < b.path ? -1 : 1))) {
    const folder = folderOf(file.path);
    folders.set(folder, [...(folders.get(folder) ?? []), file]);
  }
  /** Problems: as the editor has the open file now; for another, its text or Cube's word. */
  const troubled = (path: string) => {
    const said = reported?.[path];
    if (path === current && said !== undefined) return said > 0;
    return unparsed.has(path) || (said ?? 0) > 0;
  };

  /** Folders folded away, any of them; a file opened in one opens it again. */
  const [folded, setFolded] = useState<ReadonlySet<string>>(new Set());
  const openFolder = current === undefined ? undefined : folderOf(current);
  const [shownFolder, setShownFolder] = useState(openFolder);
  if (openFolder !== shownFolder) {
    setShownFolder(openFolder);
    if (openFolder !== undefined && folded.has(openFolder))
      setFolded(new Set([...folded].filter((each) => each !== openFolder)));
  }
  const base = useId();
  const waiting = unpublished?.size ?? 0;

  return (
    <nav className="model-tree" aria-label="Model files">
      <div className="model-tree__head">
        <h2>Model</h2>
        {/* The model's state, with its icon and in words (direction.md rule 3):
            none while it reads, or with nothing in it to publish (design 12). */}
        {reading || files.length === 0 ? null : (
          <span className={`model-tree__state${waiting === 0 ? ' model-tree__state--ok' : ''}`}>
            <StatusIcon kind={waiting === 0 ? 'ok' : 'idle'} />
            {waiting === 0 ? 'All published' : `${String(waiting)} unpublished`}
          </span>
        )}
      </div>
      <div className="model-tree__body">
        {reading ? (
          <StateLine kind="run" className="model-tree__empty">
            Reading the model…
          </StateLine>
        ) : files.length === 0 ? (
          <p className="model-tree__empty">No files yet.</p>
        ) : null}
        {[...folders.entries()].map(([folder, inside], index) => {
          const label = `model/${folder}`;
          const open = !folded.has(folder);
          const group = `${base}-${String(index)}`;
          return (
            <div key={folder} className="model-tree__folder">
              <button
                type="button"
                className="model-tree__dir"
                aria-expanded={open}
                aria-controls={group}
                onClick={() => {
                  const next = new Set(folded);
                  if (next.has(folder)) next.delete(folder);
                  else next.add(folder);
                  setFolded(next);
                }}
              >
                <span className="model-tree__caret" aria-hidden="true">
                  {open ? '▾' : '▸'}
                </span>
                {label}
              </button>
              {/* Named as a group around the list, which stays a list (T479's review). */}
              <div id={group} role="group" aria-label={label} hidden={!open}>
                <ul>
                  {inside.map((file) => {
                    const kind = kinds.get(file.path);
                    return (
                      <li key={file.path}>
                        <a
                          className="model-tree__file"
                          href={hrefOf(file.path)}
                          aria-current={file.path === current ? 'page' : undefined}
                          onClick={(event) => {
                            // A plain click opens it in place; a new tab still can.
                            if (
                              event.metaKey ||
                              event.ctrlKey ||
                              event.shiftKey ||
                              event.button !== 0
                            )
                              return;
                            event.preventDefault();
                            onOpen(file.path);
                          }}
                        >
                          {/* Cut short to make room for its marks, whole in its tooltip (design 12 pin 3). */}
                          <span className="model-tree__name" title={file.path.slice(folder.length)}>
                            {file.path.slice(folder.length)}
                          </span>
                          {kind === undefined ? null : (
                            <span className="model-tree__kind" title={KIND_TITLES[kind]}>
                              {/* Locked: it opens read-only (design 12 pin 3, MW-03). */}
                              <span className="secret-pasted__lock" aria-hidden="true" />
                              {kind}
                              {/* Said, not only shown on a hover (T479's review). */}
                              <span className="visually-hidden">, read-only</span>
                            </span>
                          )}
                          {/* Each with its icon and a word (direction.md rule 3). */}
                          {unpublished?.has(file.path) === true ? (
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
                    );
                  })}
                </ul>
              </div>
            </div>
          );
        })}
        {/* After the files, as design 03 draws New cube and New view: none
            where the model is read-only (T342). */}
        {onNew === undefined && onGenerate === undefined ? null : (
          <div className="model-tree__actions">
            {onNew === undefined ? null : (
              <>
                <button type="button" className="btn-sm" onClick={() => onNew('cube')}>
                  <span aria-hidden="true">+ </span>New cube
                </button>
                <button type="button" className="btn-sm" onClick={() => onNew('view')}>
                  <span aria-hidden="true">+ </span>New view
                </button>
              </>
            )}
            {onGenerate === undefined ? null : (
              // As designs 11 and 12 name it, drawn pressed while its pane is open;
              // it opens a pane, not a disclosure, so pressed again it goes there.
              <button
                type="button"
                className={`btn-sm model-tree__generate${generating ? ' is-open' : ''}`}
                onClick={onGenerate}
              >
                <span aria-hidden="true">+ </span>Generate from a data source…
              </button>
            )}
          </div>
        )}
      </div>
    </nav>
  );
}
