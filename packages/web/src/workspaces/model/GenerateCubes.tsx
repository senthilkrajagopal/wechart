import { useEffect, useId, useRef, useState } from 'react';

import { StateLine } from '../../shell/StatusIcon';
import { useFocusTrap } from '../../shell/useFocusTrap';
import { objectsOf } from './objects';
import { publishModel } from './publish';

/**
 * Generate cubes (T145, AC-139; R10): the flow of Superset's and Metabase's
 * "create dataset", through the introspection API in the user's Cube fork
 * (research/cube/introspection-api.md), by way of wechart's API (T145's
 * proxy), which alone holds the scope (T275, AC-250).
 *
 * A data source, then a schema, then its tables — found by name, narrowed by
 * type, a page at a time — with a look at any table's columns; then a cube
 * for each table chosen, as Cube's scaffolding writes it, shown with every
 * column it left out and why; then all of them published as one model change
 * (AC-136, AC-137), so the joins between them compile with them. Cube writes
 * nothing: the files are wechart's, in its model store.
 */

interface Source {
  readonly dataSource: string;
  readonly dbType: string;
}
interface TableRow {
  readonly schema: string;
  readonly name: string;
  readonly type: string | null;
}
interface Column {
  readonly name: string;
  readonly rawType: string;
  readonly type: string;
  readonly primaryKey: boolean;
  readonly foreignKeys: readonly {
    readonly schema?: string | null;
    readonly table: string;
    readonly column: string;
  }[];
}
interface Generated {
  readonly cube: string;
  readonly fileName: string;
  readonly content: string;
  readonly unmappedColumns: readonly { name: string; rawType: string; reason: string }[];
  /** False when a column's measure took the count's name (the API's check). */
  readonly countMeasure?: boolean;
  /** The table's key columns no dimension marks `primary_key` (the API's check). */
  readonly unmarkedKeys?: readonly string[];
  /** The API could not read the file to check it: Cube's list alone is shown. */
  readonly unchecked?: boolean;
}

type Asked<T> =
  | { readonly kind: 'idle' }
  | { readonly kind: 'run' }
  | { readonly kind: 'ok'; readonly value: T }
  | { readonly kind: 'err'; readonly message: string };

/** What the API answered, or its reason for not answering. */
async function askApi<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new Error('wechart could not be reached.', { cause: error });
  }
  const body = (await response.json().catch(() => null)) as { error?: unknown } | null;
  if (!response.ok)
    throw new Error(
      typeof body?.error === 'string'
        ? body.error
        : `The data source could not be read (${String(response.status)}).`,
    );
  return body as T;
}

/** A GET, asked again when its address changes; nothing while there is none. */
function useAsked<T>(url: string | undefined): Asked<T> {
  const [asked, setAsked] = useState<{ url: string | undefined; state: Asked<T> }>({
    url: undefined,
    state: { kind: 'idle' },
  });
  useEffect(() => {
    if (url === undefined) return undefined;
    const aborted = new AbortController();
    askApi<T>(url, { signal: aborted.signal }).then(
      (value) => {
        setAsked({ url, state: { kind: 'ok', value } });
      },
      (error: unknown) => {
        if (aborted.signal.aborted) return;
        setAsked({
          url,
          state: {
            kind: 'err',
            message: error instanceof Error ? error.message : 'It could not be read.',
          },
        });
      },
    );
    return () => {
      aborted.abort();
    };
  }, [url]);
  if (url === undefined) return { kind: 'idle' };
  return asked.url === url ? asked.state : { kind: 'run' };
}

/**
 * Cube's reasons for leaving a column out, in words (research, "Generation
 * rules"), and the API's for one Cube dropped unsaid ("Silent losses").
 */
const REASONS: Readonly<Record<string, string>> = {
  underscore_prefix: 'its name starts with an underscore',
  numeric_not_measure: 'a number, neither a key nor named like a measure',
  not_mapped: 'Cube left it out',
  member_name_taken: 'its member’s name is another column’s, and Cube kept only one',
};

/** The table types the API filters by, and their names here. */
const TYPES = [
  ['table', 'Tables'],
  ['view', 'Views'],
  ['materialized_view', 'Materialized views'],
  ['external', 'External tables'],
] as const;

const PAGE = 50;

const keyOf = (table: { schema: string; name: string }) => `${table.schema}.${table.name}`;

/**
 * Where generated files clash with the model's, by generated path (T276,
 * AC-249): a file the model has at that path, or a cube or view it declares
 * already — one namespace in Cube. In the words the API refuses them with
 * (packages/api/src/model/clashes.ts), which it does whatever this says.
 */
function clashesWith(
  existing: readonly { readonly path: string; readonly content: string }[],
  created: readonly { readonly path: string; readonly content: string }[],
): Map<string, string[]> {
  const paths = new Set(existing.map((file) => file.path));
  const names = new Map<string, { kind: 'cube' | 'view'; path: string }>();
  for (const file of existing)
    for (const { kind, name } of objectsOf(file.path, file.content).objects)
      if (!names.has(name)) names.set(name, { kind, path: file.path });
  const clashes = new Map<string, string[]>();
  for (const file of created) {
    const byName = objectsOf(file.path, file.content).objects.flatMap(({ name }) => {
      const found = names.get(name);
      return found === undefined ? [] : [{ name, ...found }];
    });
    const said = [
      ...(paths.has(file.path) && !byName.some((clash) => clash.path === file.path)
        ? [`${file.path} is already in the model store.`]
        : []),
      ...byName.map(({ name, kind, path }) => `\`${name}\` is already a ${kind} in ${path}.`),
    ];
    if (said.length > 0) clashes.set(file.path, said);
  }
  return clashes;
}

export function GenerateCubes({
  existing,
  onClose,
  onPublished,
  onOpen,
}: {
  /** The model's files, stored and drafted: what a generated cube must not clash with (T276). */
  existing: readonly { readonly path: string; readonly content: string }[];
  onClose: () => void;
  /** The files published, by path, once they are: the tree reads the store again. */
  onPublished: (paths: string[]) => void;
  /** Opens a file published here, when the user chooses one. */
  onOpen?: ((path: string) => void) | undefined;
}) {
  const heading = useId();
  const box = useRef<HTMLDivElement>(null);
  useFocusTrap(box);

  const sources = useAsked<{ dataSources: Source[] }>('/api/introspection/sources');
  const [chosenSource, setSource] = useState<string>();
  const source =
    chosenSource ?? (sources.kind === 'ok' ? sources.value.dataSources[0]?.dataSource : undefined);
  const sourceUrl =
    source === undefined ? undefined : `/api/introspection/sources/${encodeURIComponent(source)}`;
  const schemas = useAsked<{ schemas: { name: string }[] }>(
    sourceUrl === undefined ? undefined : `${sourceUrl}/schemas`,
  );
  const [schema, setSchema] = useState('');
  const [search, setSearch] = useState('');
  const [types, setTypes] = useState<ReadonlySet<string>>(new Set());
  const [offset, setOffset] = useState(0);
  const tablesUrl =
    sourceUrl === undefined || schema === ''
      ? undefined
      : `${sourceUrl}/tables?${[
          `schema=${encodeURIComponent(schema)}`,
          ...(search.trim() === '' ? [] : [`search=${encodeURIComponent(search.trim())}`]),
          ...[...types].map((type) => `type=${encodeURIComponent(type)}`),
          `limit=${String(PAGE)}`,
          `offset=${String(offset)}`,
        ].join('&')}`;
  const tables = useAsked<{ tables: TableRow[]; total: number }>(tablesUrl);
  /** Chosen tables, in the order chosen, kept across pages and searches. */
  const [chosen, setChosen] = useState<ReadonlyMap<string, TableRow>>(new Map());
  const [peek, setPeek] = useState<TableRow>();
  const [columns, setColumns] = useState<Asked<Column[]>>({ kind: 'idle' });
  const [generated, setGenerated] = useState<Asked<Generated[]>>({ kind: 'idle' });
  const [published, setPublished] = useState<
    | { kind: 'idle' }
    | { kind: 'run' }
    | { kind: 'done'; count: number }
    | { kind: 'refused'; problems: { path?: string; message: string }[] }
    | { kind: 'err'; message: string }
  >({ kind: 'idle' });

  // Escape closes it, as every dialog here closes.
  const closing = useRef(onClose);
  useEffect(() => {
    closing.current = onClose;
  }, [onClose]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closing.current();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  /** A new question about the tables starts from the first page. */
  const narrow = (change: () => void) => {
    change();
    setOffset(0);
  };

  /**
   * The latest look at columns and the latest generation, each by its turn:
   * an answer to an earlier one, or to another data source's, is dropped
   * (T145's review).
   */
  const turns = useRef({ look: 0, generate: 0 });

  const lookAt = (table: TableRow) => {
    if (sourceUrl === undefined) return;
    const turn = (turns.current.look += 1);
    const current = () => turns.current.look === turn;
    setPeek(table);
    setColumns({ kind: 'run' });
    askApi<{ tables: { columns: Column[] }[] }>(`${sourceUrl}/columns`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tables: [{ schema: table.schema, table: table.name }] }),
    }).then(
      (answer) => {
        if (current()) setColumns({ kind: 'ok', value: answer.tables[0]?.columns ?? [] });
      },
      (error: unknown) => {
        if (current())
          setColumns({
            kind: 'err',
            message: error instanceof Error ? error.message : 'Its columns could not be read.',
          });
      },
    );
  };

  const generate = () => {
    if (sourceUrl === undefined || chosen.size === 0) return;
    const turn = (turns.current.generate += 1);
    const current = () => turns.current.generate === turn;
    setGenerated({ kind: 'run' });
    setPublished({ kind: 'idle' });
    askApi<{ cubes: Generated[] }>(`${sourceUrl}/scaffold`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        tables: [...chosen.values()].map((table) => ({ schema: table.schema, table: table.name })),
      }),
    }).then(
      (answer) => {
        if (current()) setGenerated({ kind: 'ok', value: answer.cubes });
      },
      (error: unknown) => {
        if (current())
          setGenerated({
            kind: 'err',
            message: error instanceof Error ? error.message : 'The cubes could not be generated.',
          });
      },
    );
  };

  const pathOf = (cube: Generated) => `cubes/${cube.fileName}`;
  const clashes =
    generated.kind === 'ok'
      ? clashesWith(
          existing,
          generated.value.map((cube) => ({ path: pathOf(cube), content: cube.content })),
        )
      : new Map<string, string[]>();
  const clashing = clashes.size > 0;
  const publish = () => {
    if (generated.kind !== 'ok') return;
    const files = generated.value.map((cube) => ({ path: pathOf(cube), content: cube.content }));
    setPublished({ kind: 'run' });
    void publishModel(files, { create: true }).then((outcome) => {
      if (outcome.kind === 'published') {
        setPublished({ kind: 'done', count: files.length });
        onPublished(files.map((file) => file.path));
      } else if (outcome.kind === 'refused')
        setPublished({
          kind: 'refused',
          problems: outcome.problems.map((problem) => ({
            ...(problem.path === undefined ? {} : { path: problem.path }),
            message: problem.message,
          })),
        });
      else setPublished({ kind: 'err', message: outcome.message });
    });
  };

  const cubes = (count: number) => `${String(count)} ${count === 1 ? 'cube' : 'cubes'}`;

  return (
    <div className="dialog-backdrop">
      <div
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-labelledby={heading}
        className="dialog generate-cubes"
      >
        <h2 id={heading}>Generate cubes from a data source</h2>

        {sources.kind === 'err' ? <StateLine kind="err">{sources.message}</StateLine> : null}
        {sources.kind === 'run' ? (
          <StateLine kind="run">Reading the data sources…</StateLine>
        ) : null}
        {sources.kind === 'ok' ? (
          <div className="generate-cubes__where">
            <label>
              Data source
              <select
                value={source ?? ''}
                onChange={(event) => {
                  // Another source: nothing of this one's stays, nor lands later.
                  turns.current.look += 1;
                  turns.current.generate += 1;
                  setSource(event.target.value);
                  setSchema('');
                  setChosen(new Map());
                  setPeek(undefined);
                  setColumns({ kind: 'idle' });
                  setGenerated({ kind: 'idle' });
                  setPublished({ kind: 'idle' });
                }}
              >
                {sources.value.dataSources.map((each) => (
                  <option key={each.dataSource} value={each.dataSource}>
                    {each.dataSource} ({each.dbType})
                  </option>
                ))}
              </select>
            </label>
            {schemas.kind === 'err' ? <StateLine kind="err">{schemas.message}</StateLine> : null}
            {schemas.kind === 'ok' ? (
              <label>
                Schema
                <select
                  value={schema}
                  onChange={(event) => {
                    narrow(() => {
                      setSchema(event.target.value);
                    });
                  }}
                >
                  <option value="">Choose a schema</option>
                  {schemas.value.schemas.map((each) => (
                    <option key={each.name} value={each.name}>
                      {each.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
        ) : null}

        {schema === '' ? null : (
          <section className="generate-cubes__tables" aria-label="Tables">
            <div className="generate-cubes__filters">
              <label>
                Find a table
                <input
                  type="search"
                  value={search}
                  placeholder="Its name"
                  onChange={(event) => {
                    narrow(() => {
                      setSearch(event.target.value);
                    });
                  }}
                />
              </label>
              <fieldset>
                <legend>Types</legend>
                {TYPES.map(([type, label]) => (
                  <label key={type}>
                    <input
                      type="checkbox"
                      checked={types.has(type)}
                      onChange={(event) => {
                        const next = new Set(types);
                        if (event.target.checked) next.add(type);
                        else next.delete(type);
                        narrow(() => {
                          setTypes(next);
                        });
                      }}
                    />
                    {label}
                  </label>
                ))}
              </fieldset>
            </div>
            {tables.kind === 'run' ? <StateLine kind="run">Reading the tables…</StateLine> : null}
            {tables.kind === 'err' ? <StateLine kind="err">{tables.message}</StateLine> : null}
            {tables.kind === 'ok' ? (
              <>
                <p className="generate-cubes__count">
                  {String(tables.value.total)} {tables.value.total === 1 ? 'table' : 'tables'}
                  {tables.value.total > PAGE
                    ? ` · showing ${String(offset + 1)}–${String(
                        Math.min(offset + PAGE, tables.value.total),
                      )}`
                    : ''}
                </p>
                <div className="generate-cubes__list">
                  <table aria-label={`Tables in ${schema}`}>
                    <thead>
                      <tr>
                        <th scope="col">Table</th>
                        <th scope="col">Type</th>
                        <th scope="col">
                          <span className="visually-hidden">Columns</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {tables.value.tables.map((table) => (
                        <tr key={keyOf(table)}>
                          <td>
                            <label>
                              <input
                                type="checkbox"
                                checked={chosen.has(keyOf(table))}
                                onChange={(event) => {
                                  const next = new Map(chosen);
                                  if (event.target.checked) next.set(keyOf(table), table);
                                  else next.delete(keyOf(table));
                                  setChosen(next);
                                }}
                              />
                              {table.name}
                            </label>
                          </td>
                          <td>{table.type ?? 'unknown'}</td>
                          <td>
                            <button
                              type="button"
                              aria-label={`Columns of ${table.name}`}
                              onClick={() => {
                                lookAt(table);
                              }}
                            >
                              Columns
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {tables.value.total > PAGE ? (
                  <div className="generate-cubes__pages">
                    <button
                      type="button"
                      disabled={offset === 0}
                      onClick={() => {
                        setOffset(Math.max(0, offset - PAGE));
                      }}
                    >
                      Previous
                    </button>
                    <button
                      type="button"
                      disabled={offset + PAGE >= tables.value.total}
                      onClick={() => {
                        setOffset(offset + PAGE);
                      }}
                    >
                      Next
                    </button>
                  </div>
                ) : null}
              </>
            ) : null}
          </section>
        )}

        {peek === undefined ? null : (
          <section className="generate-cubes__columns" aria-label={`Columns of ${peek.name}`}>
            {columns.kind === 'run' ? <StateLine kind="run">Reading its columns…</StateLine> : null}
            {columns.kind === 'err' ? <StateLine kind="err">{columns.message}</StateLine> : null}
            {columns.kind === 'ok' ? (
              <table aria-label={`Columns of ${peek.name}`}>
                <thead>
                  <tr>
                    <th scope="col">Column</th>
                    <th scope="col">Its type</th>
                    <th scope="col">Cube type</th>
                    <th scope="col">Key</th>
                  </tr>
                </thead>
                <tbody>
                  {columns.value.map((column) => (
                    <tr key={column.name}>
                      <td>{column.name}</td>
                      <td>{column.rawType}</td>
                      <td>{column.type}</td>
                      <td>
                        {column.primaryKey
                          ? 'Primary key'
                          : column.foreignKeys
                              .map((key) => `→ ${key.table}.${key.column}`)
                              .join(', ')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
          </section>
        )}

        {generated.kind === 'err' ? <StateLine kind="err">{generated.message}</StateLine> : null}
        {generated.kind === 'run' ? <StateLine kind="run">Generating…</StateLine> : null}
        {generated.kind === 'ok' ? (
          <div className="generate-cubes__made">
            {generated.value.map((cube) => (
              <section
                key={cube.fileName}
                aria-label={pathOf(cube)}
                className="generate-cubes__cube"
              >
                <h3>{pathOf(cube)}</h3>
                <pre data-testid="generated-yaml">{cube.content}</pre>
                {cube.unchecked === true ? (
                  <p>
                    wechart could not read this file to check it against its table: only Cube’s list
                    of what it left out is shown.
                  </p>
                ) : null}
                {cube.unmappedColumns.length === 0 ? (
                  cube.unchecked === true ? null : (
                    <p>Every column is in the cube.</p>
                  )
                ) : (
                  <>
                    <p>Left out of the cube:</p>
                    <ul aria-label="Columns left out">
                      {cube.unmappedColumns.map((column) => (
                        <li key={column.name}>
                          {column.name} ({column.rawType}):{' '}
                          {REASONS[column.reason] ?? column.reason}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                {cube.countMeasure === false ? (
                  <p>No count measure: a column’s measure took its name, count.</p>
                ) : null}
                {(cube.unmarkedKeys ?? []).length === 0 ? null : (
                  <p>
                    Not marked as the cube’s primary key: {(cube.unmarkedKeys ?? []).join(', ')}. A
                    join to this cube needs one.
                  </p>
                )}
                {(clashes.get(pathOf(cube)) ?? []).length === 0 ? null : (
                  <ul aria-label="Clashes with the model" className="generate-cubes__clashes">
                    {(clashes.get(pathOf(cube)) ?? []).map((clash) => (
                      <li key={clash}>{clash}</li>
                    ))}
                  </ul>
                )}
              </section>
            ))}
            <p className="generate-cubes__note">
              A column used only in a join, such as a foreign key, is listed as left out too.
            </p>
          </div>
        ) : null}

        {published.kind === 'run' ? <StateLine kind="run">Publishing…</StateLine> : null}
        {published.kind === 'done' ? (
          <>
            <StateLine kind="ok">Published {cubes(published.count)}.</StateLine>
            {/* Each to open, when the user chooses: opening one leaves here. */}
            {onOpen === undefined || generated.kind !== 'ok' ? null : (
              <ul className="generate-cubes__opened" aria-label="Published files">
                {generated.value.map((cube) => (
                  <li key={cube.fileName}>
                    <button
                      type="button"
                      onClick={() => {
                        onOpen(pathOf(cube));
                      }}
                    >
                      Open {pathOf(cube)}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : null}
        {published.kind === 'err' ? <StateLine kind="err">{published.message}</StateLine> : null}
        {published.kind === 'refused' ? (
          <div role="alert">
            {/* Cube's compile, or the API's own refusal of a clash (T276). */}
            <p>Nothing was published:</p>
            <ul>
              {published.problems.map((problem, at) => (
                <li key={at}>
                  {problem.path === undefined ? '' : `${problem.path}: `}
                  {problem.message}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {clashing ? (
          <p className="generate-cubes__note">
            Nothing is published while a cube clashes with the model: leave its table out and
            generate again.
          </p>
        ) : null}
        <div className="dialog__actions">
          {generated.kind === 'ok' && published.kind !== 'done' ? (
            <button
              type="button"
              disabled={published.kind === 'run'}
              aria-disabled={clashing}
              onClick={clashing ? undefined : publish}
            >
              Publish {cubes(generated.value.length)}
            </button>
          ) : null}
          <button
            type="button"
            disabled={chosen.size === 0 || generated.kind === 'run'}
            onClick={generate}
          >
            Generate {cubes(chosen.size)}
          </button>
          <button type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
