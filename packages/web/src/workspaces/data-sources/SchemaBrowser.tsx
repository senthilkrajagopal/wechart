import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
  type Dispatch,
  type KeyboardEvent,
  type SetStateAction,
  type ReactNode,
  type RefObject,
} from 'react';

import { StateLine } from '../../shell/StatusIcon';

/**
 * The schema browser beside the SQL editor (T539, AC-386; design 15's P3,
 * approved with R51): the data source's schemas, a schema's tables and a
 * table's columns with their types, as xcube's introspection lists them
 * (research/cube/introspection-api.md), asked through wechart's API by the
 * data source's id, which lets only those who may run SQL on it.
 *
 * - A tree, one stop in the tab order (T539's review): ↑ and ↓ move, → opens
 *   and goes in, ← goes up and closes, Home and End, and Enter chooses. The
 *   mouse opens a row by its caret and chooses it by its name.
 * - A schema opens to its tables, 100 at a time, the rest a press away
 *   (introspection's `limit` has no cap, research "Paging").
 * - A table opens to its columns, each with the type its database names.
 * - Choosing a name hands it to the editor, which puts it in at the cursor:
 *   a schema's and a column's as listed, a table's with its schema
 *   (`schema.table`).
 * - What it read is kept for the data source's version, so a change to its
 *   settings reads it again, and Read again asks at once.
 *
 * Claude's calls, overturnable: names go in unquoted, as listed, since each
 * database quotes its own way; 100 tables at a time; what it read kept for
 * five minutes.
 */

/** Tables asked for at a time. */
const PAGE = 100;
/** Read once a while: a catalog changes seldom, and each read is a full one (research "Paging"). */
const KEPT = 5 * 60_000;

interface Table {
  readonly schema: string;
  readonly name: string;
  /** Introspection's kind: `table`, `view`, … */
  readonly type: string | null;
  readonly rawType: string | null;
}

interface Column {
  readonly name: string;
  /** As the database names it. */
  readonly rawType: string;
}

/** The API's refusal, with its status: a 409 is a state to say, not a failure. */
class CatalogError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** The API's answer, or its words for why not. */
async function answerOf<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    const error = (body as { error?: unknown } | null)?.error;
    throw new CatalogError(
      typeof error === 'string'
        ? error
        : `Its tables could not be read (${String(response.status)}).`,
      response.status,
    );
  }
  return body as T;
}

const catalogOf = (sourceId: string) => `/api/data-sources/${encodeURIComponent(sourceId)}/catalog`;

/** The tree's own: where its rows ask, which row holds the tab stop, and the chooser. */
interface Tree {
  readonly sourceId: string;
  /** What its queries are kept under: the data source at its version. */
  readonly key: readonly unknown[];
  readonly root: RefObject<HTMLUListElement | null>;
  readonly stop: string | null;
  /** Null hands it back to the first row. */
  readonly setStop: Dispatch<SetStateAction<string | null>>;
  readonly onChoose: (name: string) => void;
}
const TreeContext = createContext<Tree | null>(null);
const useTree = () => useContext(TreeContext)!;

export function SchemaBrowser({
  sourceId,
  sourceVersion,
  sourceName,
  onChoose,
}: {
  sourceId: string;
  /** Its settings' version: another reads it again. */
  sourceVersion: number;
  sourceName: string;
  /** A name chosen, for the editor. */
  onChoose: (name: string) => void;
}) {
  const queryClient = useQueryClient();
  const root = useRef<HTMLUListElement>(null);
  const [stop, setStop] = useState<string | null>(null);
  const key = ['sql-catalog', sourceId, sourceVersion] as const;
  const schemas = useQuery({
    queryKey: [...key, 'schemas'],
    queryFn: () => answerOf<{ schemas: { name: string }[] }>(`${catalogOf(sourceId)}/schemas`),
    staleTime: KEPT,
  });
  const listed = schemas.data?.schemas ?? [];
  const tree: Tree = {
    sourceId,
    key,
    root,
    // The first row holds it until another is moved to.
    stop: stop ?? (listed[0] === undefined ? null : `s:${listed[0].name}`),
    setStop,
    onChoose,
  };
  return (
    <section className="sql-schema" aria-label={`Tables in ${sourceName}`}>
      <div className="sql-schema__top">
        <h2 className="sql-schema__head">Tables</h2>
        <button
          type="button"
          className="btn-link sql-schema__again"
          onClick={() => void queryClient.invalidateQueries({ queryKey: key })}
        >
          <span aria-hidden="true">↻</span>
          <span className="visually-hidden">Read its tables again</span>
        </button>
      </div>
      <p className="sql-schema__sub">Choose a name to put it in the editor.</p>
      {schemas.isPending ? <StateLine kind="run">Reading its schemas…</StateLine> : null}
      {schemas.isError ? (
        schemas.error instanceof CatalogError && schemas.error.status === 409 ? (
          // Not landed yet: a state, said as a note (T539's review).
          <StateLine kind="idle" role="status">
            {schemas.error.message}
          </StateLine>
        ) : (
          <div className="sql-schema__failed">
            <StateLine kind="err">{schemas.error.message}</StateLine>
            <button type="button" className="btn-link" onClick={() => void schemas.refetch()}>
              Try again
            </button>
          </div>
        )
      ) : null}
      {schemas.isSuccess && listed.length === 0 ? (
        <p className="sql-schema__none">Its login sees no schemas.</p>
      ) : null}
      {listed.length === 0 ? null : (
        <TreeContext.Provider value={tree}>
          <ul
            ref={root}
            role="tree"
            className="sql-schema__tree"
            aria-label={`Schemas in ${sourceName}`}
          >
            {listed.map(({ name }) => (
              <SchemaItem key={name} schema={name} />
            ))}
          </ul>
        </TreeContext.Provider>
      )}
    </section>
  );
}

/** The rows shown, in order: those inside a closed row aren't drawn. */
const rowsIn = (root: HTMLElement | null) =>
  root === null ? [] : [...root.querySelectorAll<HTMLElement>('[role="treeitem"]')];

/**
 * A row of the tree (WAI-ARIA's tree view): its keys, its focus, and its
 * caret and name for the mouse. `open` is undefined for a leaf.
 */
function Row({
  rowKey,
  level,
  label,
  open,
  onToggle,
  onChoose,
  caret = open !== undefined,
  className,
  children,
  inside,
}: {
  rowKey: string;
  level: number;
  label: string;
  open?: boolean | undefined;
  onToggle?: (() => void) | undefined;
  onChoose: () => void;
  caret?: boolean;
  className?: string | undefined;
  /** What the row shows: its name, and its type or kind. */
  children: ReactNode;
  /** Its group, drawn when open. */
  inside?: ReactNode;
}) {
  const tree = useTree();
  const self = useRef<HTMLLIElement>(null);
  // Gone while it held the tab stop (closed over, or "more" once all are
  // read): the first row takes it, so the tree stays in the tab order.
  const { setStop } = tree;
  useLayoutEffect(
    () => () => {
      setStop((now) => (now === rowKey ? null : now));
    },
    [rowKey, setStop],
  );
  const move = (to: HTMLElement | undefined) => {
    if (to === undefined) return;
    to.focus();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLLIElement>) => {
    // A row's own keys only: a row inside it handles its own.
    if (event.target !== event.currentTarget) return;
    const rows = rowsIn(tree.root.current);
    const at = rows.indexOf(event.currentTarget);
    const handled = (() => {
      switch (event.key) {
        case 'ArrowDown':
          move(rows[at + 1]);
          return true;
        case 'ArrowUp':
          move(rows[at - 1]);
          return true;
        case 'Home':
          move(rows[0]);
          return true;
        case 'End':
          move(rows.at(-1));
          return true;
        case 'ArrowRight':
          if (open === false) onToggle?.();
          else if (open === true) {
            const first = rows[at + 1];
            if (first !== undefined && event.currentTarget.contains(first)) move(first);
          }
          return true;
        case 'ArrowLeft':
          if (open === true) onToggle?.();
          else
            move(
              event.currentTarget.parentElement?.closest<HTMLElement>('[role="treeitem"]') ??
                undefined,
            );
          return true;
        case 'Enter':
        case ' ':
          onChoose();
          return true;
        default:
          return false;
      }
    })();
    if (handled) event.preventDefault();
  };
  return (
    // A tree row takes focus and its keys, as WAI-ARIA's tree view has it.
    <li
      ref={self}
      role="treeitem"
      aria-level={level}
      aria-label={label}
      aria-selected={false}
      {...(open === undefined ? {} : { 'aria-expanded': open })}
      tabIndex={tree.stop === rowKey ? 0 : -1}
      className={className}
      onKeyDown={onKeyDown}
      onFocus={(event) => {
        if (event.target === event.currentTarget) tree.setStop(rowKey);
      }}
      onClick={(event) => {
        // A click inside a row inside it is that row's.
        if ((event.target as HTMLElement).closest('[role="treeitem"]') !== self.current) return;
        self.current?.focus();
        if ((event.target as HTMLElement).closest('[data-caret]') !== null) onToggle?.();
        else onChoose();
      }}
    >
      <span className="sql-schema__row">
        {caret ? (
          <span className="sql-schema__caret" data-caret="" data-testid="sql-schema-caret">
            {open === true ? '▾' : '▸'}
          </span>
        ) : (
          <span className="sql-schema__caret" />
        )}
        {children}
      </span>
      {inside}
    </li>
  );
}

function SchemaItem({ schema }: { schema: string }) {
  const tree = useTree();
  const [open, setOpen] = useState(false);
  const tables = useInfiniteQuery({
    queryKey: [...tree.key, 'tables', schema],
    enabled: open,
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      answerOf<{ tables: Table[]; total: number }>(
        `${catalogOf(tree.sourceId)}/tables?${new URLSearchParams({
          schema,
          limit: String(PAGE),
          offset: String(pageParam),
        }).toString()}`,
      ),
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((sum, page) => sum + page.tables.length, 0);
      return last.tables.length > 0 && loaded < last.total ? loaded : undefined;
    },
    staleTime: KEPT,
  });
  const listed = tables.data?.pages.flatMap((page) => page.tables) ?? [];
  const total = tables.data?.pages.at(-1)?.total ?? 0;
  const more = Math.min(PAGE, total - listed.length);
  return (
    <Row
      rowKey={`s:${schema}`}
      level={1}
      label={schema}
      open={open}
      onToggle={() => {
        setOpen(!open);
      }}
      onChoose={() => {
        tree.onChoose(schema);
      }}
      inside={
        open ? (
          <ul role="group" aria-label={`Tables in ${schema}`}>
            {tables.isPending ? <Pending level={2}>Reading its tables…</Pending> : null}
            {tables.isError ? (
              <Failed
                rowKey={`s:${schema}:failed`}
                level={2}
                error={tables.error}
                onRetry={() => void tables.refetch()}
              />
            ) : null}
            {tables.isSuccess && listed.length === 0 ? (
              <Pending level={2}>No tables.</Pending>
            ) : null}
            {listed.map((table) => (
              <TableItem key={table.name} table={table} />
            ))}
            {tables.hasNextPage ? (
              <Row
                rowKey={`s:${schema}:more`}
                level={2}
                label={`Show ${more.toLocaleString('en')} more tables`}
                caret={false}
                className="sql-schema__more"
                onChoose={() => {
                  if (tables.isFetchingNextPage) return;
                  // Focus goes on to the first table read, where this row was.
                  const at = rowsIn(tree.root.current).indexOf(
                    document.activeElement as HTMLElement,
                  );
                  void tables.fetchNextPage().then(() => {
                    requestAnimationFrame(() => {
                      rowsIn(tree.root.current)[at]?.focus();
                    });
                  });
                }}
              >
                <span className="sql-schema__link">
                  Show {more.toLocaleString('en')} more tables
                </span>
              </Row>
            ) : null}
          </ul>
        ) : undefined
      }
    >
      <span className="sql-schema__name">{schema}</span>
    </Row>
  );
}

function TableItem({ table }: { table: Table }) {
  const tree = useTree();
  const [open, setOpen] = useState(false);
  const qualified = `${table.schema}.${table.name}`;
  const columns = useQuery({
    queryKey: [...tree.key, 'columns', table.schema, table.name],
    enabled: open,
    queryFn: async () =>
      (
        await answerOf<{ tables: { columns: Column[] }[] }>(`${catalogOf(tree.sourceId)}/columns`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ tables: [{ schema: table.schema, table: table.name }] }),
        })
      ).tables[0]?.columns ?? [],
    staleTime: KEPT,
  });
  const kind = table.type === null || table.type === 'table' ? null : table.type;
  return (
    <Row
      rowKey={`t:${qualified}`}
      level={2}
      label={kind === null ? table.name : `${table.name}, ${kind}`}
      open={open}
      onToggle={() => {
        setOpen(!open);
      }}
      onChoose={() => {
        tree.onChoose(qualified);
      }}
      inside={
        open ? (
          <ul role="group" aria-label={`Columns of ${qualified}`}>
            {columns.isPending ? <Pending level={3}>Reading its columns…</Pending> : null}
            {columns.isError ? (
              <Failed
                rowKey={`t:${qualified}:failed`}
                level={3}
                error={columns.error}
                onRetry={() => void columns.refetch()}
              />
            ) : null}
            {columns.isSuccess && columns.data.length === 0 ? (
              <Pending level={3}>No columns.</Pending>
            ) : null}
            {columns.data?.map((column, at) => (
              <Row
                // By place: a table may name two columns alike in some databases.
                key={String(at)}
                rowKey={`c:${qualified}:${String(at)}`}
                level={3}
                label={`${column.name}, ${column.rawType}`}
                onChoose={() => {
                  tree.onChoose(column.name);
                }}
              >
                <span className="sql-schema__name">{column.name}</span>
                <span className="sql-schema__type" title={column.rawType}>
                  {column.rawType}
                </span>
              </Row>
            ))}
          </ul>
        ) : undefined
      }
    >
      <span className="sql-schema__name">{table.name}</span>
      {kind === null ? null : <span className="sql-schema__kind">{kind}</span>}
    </Row>
  );
}

/** A state inside a row, not a row of its own: read, not moved to. */
const Pending = ({ level, children }: { level: number; children: ReactNode }) => (
  <li role="none" className="sql-schema__state" style={{ paddingLeft: `${String(level * 4)}px` }}>
    {children}
  </li>
);

/** A row's read that failed: its words, and Enter or a click to try again. */
function Failed({
  rowKey,
  level,
  error,
  onRetry,
}: {
  rowKey: string;
  level: number;
  error: Error;
  onRetry: () => void;
}) {
  return (
    <Row
      rowKey={rowKey}
      level={level}
      label={`${error.message.replace(/\.$/, '')}. Try again`}
      caret={false}
      className="sql-schema__error"
      onChoose={() => {
        // Focus goes up to the row it was read for, as this one goes.
        (document.activeElement as HTMLElement | null)?.parentElement
          ?.closest<HTMLElement>('[role="treeitem"]')
          ?.focus();
        onRetry();
      }}
    >
      <span className="sql-schema__failed-text">
        {error.message} <span className="sql-schema__link">Try again</span>
      </span>
    </Row>
  );
}
