import { useId, useState, type MouseEvent } from 'react';

import { StatusIcon } from '../../shell/StatusIcon';
import { SHARED_ROOT } from '../explore/roots';
import { fileHref } from './inFolder';
import { objectsOf, type FileObjects, type MemberKind, type ModelObject } from './objects';

/**
 * The Model workspace's overview (T137, AC-131), as design 12 draws it (T486,
 * AC-344; MW-01): one card holding a table, a row per cube or view — its
 * file, kind and name, how many of each member it has, and the members, all
 * of them one step away in a tooltip grouped by kind — sorted by file.
 */
interface ModelFile {
  readonly path: string;
  readonly content: string;
}

/** The counts' columns, in the editor's tabs' order (design 12 pin 10). */
const COUNTED: readonly [kind: MemberKind, header: string][] = [
  ['dimension', 'Dimensions'],
  ['measure', 'Measures'],
  ['join', 'Joins'],
  ['pre-aggregation', 'Pre-aggs'],
  ['segment', 'Segments'],
];

/** File, Kind, Name and the counts at design 12's widths (12:220); Members takes the rest. */
const COLUMN_WIDTHS = [232, 92, 168, 88, 80, 60, 74, 80] as const;

/** Every kind a member may be, in the Members cell's and tooltip's order (pin 12). */
const LISTED: readonly [kind: MemberKind, title: string][] = [
  ['dimension', 'Dimensions'],
  ['measure', 'Measures'],
  ['join', 'Joins'],
  // As design 12's tooltip and the Pre-aggs column say it (T486's review).
  ['pre-aggregation', 'Pre-aggs'],
  ['segment', 'Segments'],
  ['hierarchy', 'Hierarchies'],
  ['include', 'Includes'],
];

/**
 * What a file that is not plain YAML is, and why its objects are not listed:
 * the model is served as plain YAML alone, so such a file stays in wechart and
 * is never sent (T447, AC-335, R29; research xcube-slice-2.md, "Path rules").
 * Cube once ran, rendered or read such files itself (research/cube/
 * data-modeling.md, "How each file type is compiled"); now it sees none of
 * them. Said without xcube, the fork's internal name (D3; T483).
 */
export function codeNoteOf(_path: string, code: NonNullable<FileObjects['code']>): string {
  if (code === 'JavaScript')
    return 'JavaScript: wechart publishes plain YAML only, so Cube never runs this file, and its cubes and views aren’t served or listed.';
  if (code === 'Jinja')
    return 'Jinja template: wechart publishes plain YAML only, so this template is never rendered or served, and its cubes and views aren’t listed.';
  return 'Python: wechart publishes plain YAML only, so Cube never reads this file.';
}

export const MODEL_FILES_QUERY = {
  queryKey: ['model-files'],
  queryFn: async ({ signal }: { signal: AbortSignal }): Promise<readonly ModelFile[]> => {
    const response = await fetch('/api/model/files', { signal });
    if (!response.ok)
      throw new Error(`The model files could not be read (${String(response.status)}).`);
    return ((await response.json()) as { files: ModelFile[] }).files;
  },
};

/**
 * A folder the API says isn't there, or isn't the user's to see (404): its
 * page reads as Not found, the same for both (rule 67; T342's review).
 */
export class ModelFilesNotFound extends Error {}

/**
 * A folder's model files (T334, T342): the root's are `MODEL_FILES_QUERY`,
 * under whose key every folder's sits, so invalidating it reads them all
 * again.
 */
export const modelFilesQuery = (folderId: string) =>
  folderId === SHARED_ROOT.id
    ? MODEL_FILES_QUERY
    : {
        queryKey: [...MODEL_FILES_QUERY.queryKey, folderId],
        queryFn: async ({ signal }: { signal: AbortSignal }): Promise<readonly ModelFile[]> => {
          const response = await fetch(`/api/model/files?folder=${encodeURIComponent(folderId)}`, {
            signal,
          });
          if (response.status === 404) throw new ModelFilesNotFound('No such folder.');
          if (!response.ok)
            throw new Error(`The model files could not be read (${String(response.status)}).`);
          return ((await response.json()) as { files: ModelFile[] }).files;
        },
        // No folder is no folder on a second asking either: said at once.
        retry: (failures: number, error: Error) =>
          !(error instanceof ModelFilesNotFound) && failures < 3,
      };

/**
 * Every folder's model files the user may see, each with its folder (T342):
 * what a save's edited members are looked for across (AC-141). Read at
 * the save, not kept.
 */
export const ALL_MODEL_FILES_QUERY = {
  queryKey: [...MODEL_FILES_QUERY.queryKey, '*all'],
  queryFn: async (): Promise<readonly (ModelFile & { readonly folderId?: string })[]> => {
    const response = await fetch('/api/model/files?all=true');
    if (!response.ok)
      throw new Error(`The model files could not be read (${String(response.status)}).`);
    return ((await response.json()) as { files: (ModelFile & { folderId?: string })[] }).files;
  },
  staleTime: 0,
};

/** A code file's kind, as its row names it (pin 9). */
const codeLabel = (code: NonNullable<FileObjects['code']>) =>
  code === 'Jinja' ? 'Jinja template' : code;
const codeWhy = (code: NonNullable<FileObjects['code']>) =>
  code === 'Jinja' ? 'a template isn’t read here' : `${code} isn’t read here`;

const namesOf = (object: ModelObject, kind: MemberKind) =>
  object.members.filter((member) => member.kind === kind).map((member) => member.name);

/** The members, by kind, in the pins' order, as the cell and its tooltip list them. */
const groupsOf = (object: ModelObject) =>
  LISTED.map(([kind, title]) => [title, namesOf(object, kind)] as const).filter(
    ([, names]) => names.length > 0,
  );

function Members({ object }: { object: ModelObject }) {
  const tip = useId();
  const groups = groupsOf(object);
  if (groups.length === 0) return <span className="model-overview__none">None</span>;
  return (
    <span className="model-overview__members-cell">
      {/* Focusable, so the tooltip opens from the keyboard too (pin 12): the
          cell is truncated, and the full list is its description. */}
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
      <span className="model-overview__members" tabIndex={0} aria-describedby={tip}>
        {groups.map(([, names]) => names.join(', ')).join(' · ')}
      </span>
      <span id={tip} role="tooltip" className="model-overview__tip">
        <b className="is-code">{object.name}</b>
        {groups.map(([title, names]) => (
          <span key={title} className="model-overview__tip-row">
            <span className="model-overview__tip-kind">{title}</span> ·{' '}
            <span className="is-code">{names.join(', ')}</span>
          </span>
        ))}
      </span>
    </span>
  );
}

/** One file's rows: one per cube or view, or one saying why it has none listed. */
interface Row {
  readonly path: string;
  readonly key: string;
  readonly read: FileObjects;
  readonly object?: ModelObject;
}

function rowsOf(files: readonly ModelFile[]): Row[] {
  return files.flatMap((file) => {
    const read = objectsOf(file.path, file.content);
    return read.objects.length === 0
      ? [{ path: file.path, key: file.path, read }]
      : read.objects.map((object, at) => ({
          path: file.path,
          // By place too: a draft may name two cubes alike (T486's review).
          key: `${file.path} ${String(at)} ${object.kind} ${object.name}`,
          read,
          object,
        }));
  });
}

/** By path as the tree orders them, code point by code point (pin 8; T486's review). */
const byPath = (a: ModelFile, b: ModelFile) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0);

export function FileList({
  files,
  unpublished,
  onOpen,
  onNew,
  onGenerate,
  hrefOf = (path) => fileHref(path),
}: {
  /** The model's files: the store's, and the drafts made here. */
  files: readonly ModelFile[];
  /** Files not yet published: marked, as the tree marks them (state C). */
  unpublished: ReadonlySet<string>;
  onOpen: (path: string) => void;
  /** New cube and New view; none where the model is read-only (T342, AC-222). */
  onNew?: ((kind: 'cube' | 'view') => void) | undefined;
  /** Generate cubes; none where the model is read-only, or in a folder (T342). */
  onGenerate?: (() => void) | undefined;
  /** Each file's address: in its folder, opened from Explore (T342); the Model workspace's by default. */
  hrefOf?: ((path: string) => string) | undefined;
}) {
  const [ascending, setAscending] = useState(true);

  if (files.length === 0)
    // Nothing seeded: an empty or missing model directory (logged by the API). State B.
    return (
      <div className="model-overview model-overview--empty">
        <p className="model-overview__empty-title">There are no model files.</p>
        {onNew === undefined && onGenerate === undefined ? null : (
          <>
            <p className="model-overview__empty-text">
              {onGenerate === undefined
                ? 'Start a cube or a view by hand.'
                : 'Generate cubes from a data source’s tables, or start a cube or a view by hand.'}
            </p>
            <div className="model-overview__empty-actions">
              {onGenerate === undefined ? null : (
                <button type="button" className="btn-sm" onClick={onGenerate}>
                  Generate from a data source…
                </button>
              )}
              {onNew === undefined ? null : (
                <>
                  <button
                    type="button"
                    className="btn-sm"
                    onClick={() => {
                      onNew('cube');
                    }}
                  >
                    New cube
                  </button>
                  <button
                    type="button"
                    className="btn-sm"
                    onClick={() => {
                      onNew('view');
                    }}
                  >
                    New view
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    );

  const sorted = [...files].sort((a, b) => (ascending ? 1 : -1) * byPath(a, b));
  /**
   * The whole row opens its file (pin 13) — its Members too, whose tooltip is
   * for hover and focus — but not the link, which opens it itself.
   */
  const openRow = (path: string) => (event: MouseEvent<HTMLTableRowElement>) => {
    if ((event.target as HTMLElement).closest('a, button') !== null) return;
    onOpen(path);
  };
  /** The link opens in place; a new tab, as a link does. */
  const openLink = (path: string) => (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0)
      return;
    event.preventDefault();
    onOpen(path);
  };

  return (
    <>
      <div className="model-overview" data-testid="model-files">
        <table className="grid-table model-overview__table" aria-label="Cubes and views">
          {/* The drawn widths, Members taking the rest (design 12, 12:220; T691, MOD-06). */}
          <colgroup>
            {COLUMN_WIDTHS.map((width, at) => (
              <col key={at} style={{ width }} />
            ))}
            <col />
          </colgroup>
          <thead>
            <tr>
              <th scope="col" aria-sort={ascending ? 'ascending' : 'descending'}>
                {/* Its arrow is drawn from `aria-sort`, not written (pin 8). */}
                <button
                  type="button"
                  className="model-overview__sort"
                  onClick={() => {
                    setAscending(!ascending);
                  }}
                >
                  File
                </button>
              </th>
              <th scope="col">Kind</th>
              <th scope="col">Name</th>
              {COUNTED.map(([, header]) => (
                <th key={header} scope="col" className="is-num">
                  {header}
                </th>
              ))}
              <th scope="col">Members</th>
            </tr>
          </thead>
          <tbody>
            {rowsOf(sorted).map(({ path, key, read, object }) => (
              <tr key={key} className="model-overview__row" onClick={openRow(path)}>
                <td>
                  <span className="model-overview__file">
                    <a className="is-code" href={hrefOf(path)} onClick={openLink(path)}>
                      {path}
                    </a>
                    {unpublished.has(path) ? (
                      <span className="model-tree__tag">
                        <StatusIcon kind="idle" />
                        unpublished
                      </span>
                    ) : null}
                    {read.problem === undefined ? null : (
                      <span className="model-overview__mark is-err">
                        <StatusIcon kind="err" />
                        problems
                      </span>
                    )}
                  </span>
                </td>
                {read.problem !== undefined ? (
                  // Nothing in it could be read: the parser's line, in full on hover (state D).
                  <td colSpan={COUNTED.length + 3} className="is-err" title={read.problem}>
                    {read.problem}
                  </td>
                ) : read.code !== undefined ? (
                  <>
                    <td colSpan={2}>
                      <span className="model-overview__code" title={codeNoteOf(path, read.code)}>
                        {/* The lock the data source form's pasted secret wears. */}
                        <span className="secret-pasted__lock" aria-hidden="true" />
                        {codeLabel(read.code)} · read-only
                      </span>
                    </td>
                    {COUNTED.map(([, header]) => (
                      <td key={header} className="is-num is-muted">
                        —
                      </td>
                    ))}
                    <td className="is-muted">Not listed: {codeWhy(read.code)}</td>
                  </>
                ) : object === undefined ? (
                  <td colSpan={COUNTED.length + 3} className="is-muted">
                    Defines no cube or view
                  </td>
                ) : (
                  <>
                    <td>{object.kind === 'cube' ? 'Cube' : 'View'}</td>
                    <td className="is-code">{object.name}</td>
                    {object.kind === 'view' ? (
                      <ViewCounts object={object} />
                    ) : (
                      COUNTED.map(([kind, header]) => {
                        const count = namesOf(object, kind).length;
                        return (
                          <td key={header} className={`is-num${count === 0 ? ' is-zero' : ''}`}>
                            {count}
                          </td>
                        );
                      })
                    )}
                    <td className="model-overview__members-td">
                      <Members object={object} />
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="model-overview__caption">
        Sorted by file. A file that defines several cubes or views has a row for each, under the
        same path.
      </p>
    </>
  );
}

/**
 * A view counts what it includes, by path, and its own members: the parser
 * can't say which of its includes are dimensions and which measures, so one
 * cell spans both (pin 11). A view has no joins, pre-aggregations or
 * segments of its own: those don't apply.
 */
function ViewCounts({ object }: { object: ModelObject }) {
  const included = namesOf(object, 'include').length;
  const own = object.members.filter((member) => member.kind !== 'include').length;
  return (
    <>
      <td colSpan={2} className="is-num is-secondary">
        {`${String(included)} included${own === 0 ? '' : ` · ${String(own)} own`}`}
      </td>
      {COUNTED.slice(2).map(([, header]) => (
        <td key={header} className="is-num is-muted">
          —
        </td>
      ))}
    </>
  );
}
