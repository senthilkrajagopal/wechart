import { DRIVERS, DRIVER_TYPES, type DriverType } from '@wechart/core';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';

import { StateLine, StatusIcon } from '../../shell/StatusIcon';
import { useFocusTrap } from '../../shell/useFocusTrap';
import type { ListedSource } from '../data-sources/DataSourcesList';
import { DriverMark } from '../data-sources/driverMarks';
import { HealthBadge } from '../data-sources/health';
import { DATA_SOURCES_QUERY } from '../data-sources/query';
import { TargetTree } from '../data-sources/TargetTree';
import type { Target } from '../explore/NewItemDialog';
import { SHARED_ROOT } from '../explore/roots';
import { objectsOf } from './objects';
import { modelOf } from './sync';
import { YamlEditor } from './YamlEditor';

/**
 * Generate cubes (T145, AC-139; R10): the flow of Superset's and Metabase's
 * "create dataset", through the introspection API in the user's Cube fork
 * (research/cube/introspection-api.md), by way of wechart's API (T145's
 * proxy), which alone holds the scope (T275, AC-250).
 *
 * Drawn as design 11 (T485, AC-344; R35): design 01's pane, docked beside
 * the model, in three steps. **Source**, a data source and a schema;
 * **Tables**, found by name, narrowed by type, a page at a time, any table's
 * columns opened in place; **Review**, a cube for each table chosen, as Cube's
 * scaffolding writes it, with its status, every column it left out and why,
 * and whatever it clashes with; then all of them added to the model as
 * unpublished drafts (R36, AC-345), each published when it is saved, with the
 * drafts its cubes join so the joins compile (AC-346). Cube writes nothing:
 * the files are wechart's, in its model store once saved.
 *
 * What the pane holds is kept in the query cache, not the component: opening
 * a clashing file from the overview is another page, and the pane stays
 * docked beside it with everything chosen (design 11 pin 17).
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
  /** The table it was generated from, as the API says it. */
  readonly table?: { readonly schema: string; readonly table: string };
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

/** Whether the generated cubes are the model's drafts yet (T488, AC-345). */
type Added = { kind: 'idle' } | { kind: 'done'; count: number };

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

/**
 * A GET, asked again when its address changes, or when `again` does — a
 * Retry (rule 18); nothing while there is none.
 */
function useAsked<T>(url: string | undefined, again: number): Asked<T> {
  const [asked, setAsked] = useState<{ key: string | undefined; state: Asked<T> }>({
    key: undefined,
    state: { kind: 'idle' },
  });
  const key = url === undefined ? undefined : `${String(again)} ${url}`;
  useEffect(() => {
    if (url === undefined || key === undefined) return undefined;
    const aborted = new AbortController();
    askApi<T>(url, { signal: aborted.signal }).then(
      (value) => {
        setAsked({ key, state: { kind: 'ok', value } });
      },
      (error: unknown) => {
        if (aborted.signal.aborted) return;
        setAsked({
          key,
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
  }, [url, key]);
  if (key === undefined) return { kind: 'idle' };
  return asked.key === key ? asked.state : { kind: 'run' };
}

/** The pane's state, kept for the tab while it is open: see the header. */
export const GENERATE_KEY = ['generate-cubes'] as const;

/**
 * The pane afresh, on a data source and the folder its cubes are to go to:
 * opened from that data source's page (T492; the user, 2026-10-02: "add
 * generate cube within the datasource details page"). Whatever the pane held
 * before is dropped.
 */
export function generateWith(
  queryClient: QueryClient,
  { source, target }: { readonly source: string; readonly target?: string | undefined },
): void {
  // An answer still owed to the pane before lands in no one's (T492's review).
  nextTurn('look');
  nextTurn('generate');
  queryClient.removeQueries({ queryKey: GENERATE_KEY });
  queryClient.setQueryData([...GENERATE_KEY, 'source'], source);
  if (target !== undefined) queryClient.setQueryData([...GENERATE_KEY, 'target'], target);
}

/**
 * The latest look at columns and the latest generation, each by its turn: an
 * answer to an earlier one, to another data source's, or to a pane since
 * closed is dropped (T145's review). Kept with the pane's state, not in one
 * drawing of it — drawn again on another page, it still knows (T485's review).
 */
const TURNS = { look: 0, generate: 0 };
/** Starts a turn: an answer to any before it is dropped. */
function nextTurn(kind: keyof typeof TURNS): number {
  TURNS[kind] += 1;
  return TURNS[kind];
}
/** Whether an answer to this turn is still the one wanted. */
const isTurn = (kind: keyof typeof TURNS, turn: number) => TURNS[kind] === turn;

/**
 * A value of the pane's, in React's state — so a click shows at once, as a
 * controlled input needs; the cache tells the page a tick later — and kept in
 * the query cache for the tab, whence an answer that lands while the pane is
 * drawn on another page reaches it too (T485's e2e).
 */
function useKept<T>(name: string, initial: () => T): [T, (next: T) => void] {
  const queryClient = useQueryClient();
  const cached = useQuery<T>({
    queryKey: [...GENERATE_KEY, name],
    queryFn: initial,
    initialData: initial,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
    // Always there: its initial data is its value until it is set.
  }).data as T;
  const [value, setValue] = useState(cached);
  const [seen, setSeen] = useState(cached);
  if (cached !== seen) {
    setSeen(cached);
    setValue(cached);
  }
  const set = useCallback(
    (next: T) => {
      setValue(next);
      queryClient.setQueryData([...GENERATE_KEY, name], next);
    },
    [queryClient, name],
  );
  return [value, set];
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

/** The table types the API filters by, and their names here, for a list and for one row. */
const TYPES = [
  ['table', 'Tables', 'Table'],
  ['view', 'Views', 'View'],
  ['materialized_view', 'Materialized views', 'Materialized view'],
  ['external', 'External tables', 'External table'],
] as const;

const typeName = (type: string | null) =>
  TYPES.find(([key]) => key === type)?.[2] ?? (type === null ? 'Unknown' : type);

const PAGE = 50;

const keyOf = (table: { schema: string; name: string }) => `${table.schema}.${table.name}`;

/** A driver's name as Data sources and design 01 say it: "PostgreSQL", not "postgres". */
const driverOf = (dbType: string): DriverType | undefined =>
  (DRIVER_TYPES as readonly string[]).includes(dbType) ? (dbType as DriverType) : undefined;
const driverName = (dbType: string) => {
  const driver = driverOf(dbType);
  return driver === undefined ? dbType : DRIVERS[driver].label;
};

/** What a generated file clashes with: the file, or a cube or view the model declares. */
interface Clash {
  readonly path: string;
  /** The cube or view of the same name, when that is the clash. */
  readonly name?: string;
  readonly kind?: 'cube' | 'view';
}

/** A part of a table's name as `sql_table` writes it: quoted, it is exact; else not by case. */
interface NamePart {
  readonly text: string;
  readonly quoted: boolean;
}
/** A cube that reads a table, from the data source it reads it in. */
interface Reader {
  readonly cube: string;
  readonly source: string;
  readonly schema: NamePart;
  readonly table: NamePart;
}

const partOf = (raw: string): NamePart => {
  const quoted = /^(["`])(.*)\1$/.exec(raw.trim());
  return quoted === null
    ? { text: raw.trim(), quoted: false }
    : { text: quoted[2] ?? '', quoted: true };
};
/** A quoted part is the name exactly; an unquoted one, whatever its case (SQL's folding). */
const names = (part: NamePart, listed: string) =>
  part.quoted ? part.text === listed : part.text.toLowerCase() === listed.toLowerCase();

/**
 * The model's cubes and the tables they read (T489, AC-347; R36): only a
 * cube's `sql_table` names one — a cube defined by its SQL isn't read for it —
 * and only one written `schema.table`; in the data source it reads, its
 * `data_source`, or `default` without one (research/cube/data-sources.md;
 * T489's review). A template's cubes aren't read, as Cube renders them first
 * (`objectsOf`). Not a predicted cube name: Cube's scaffolder names a cube by
 * its whole batch (research/cube/introspection-api.md, "Cube names depend on
 * the batch").
 */
function readersOf(
  files: readonly { readonly path: string; readonly content: string }[],
): Reader[] {
  return files.flatMap((file) => {
    if (objectsOf(file.path, file.content).code !== undefined) return [];
    const cubes = modelOf(file.content).model?.cubes;
    if (!Array.isArray(cubes)) return [];
    return (cubes as unknown[]).flatMap((cube) => {
      if (cube === null || typeof cube !== 'object') return [];
      const { name, sql_table: table, data_source: source } = cube as Record<string, unknown>;
      if (typeof name !== 'string' || typeof table !== 'string') return [];
      const parts = table.split('.');
      const [schema, own] = parts;
      if (parts.length !== 2 || schema === undefined || own === undefined) return [];
      return [
        {
          cube: name,
          source: typeof source === 'string' ? source : 'default',
          schema: partOf(schema),
          table: partOf(own),
        },
      ];
    });
  });
}

/** The cubes that read a listed table of the chosen source. */
const readersFor = (readers: readonly Reader[], source: string | null, table: TableRow) =>
  readers
    .filter(
      (reader) =>
        reader.source === source &&
        names(reader.schema, table.schema) &&
        names(reader.table, table.name),
    )
    .map((reader) => reader.cube);

/**
 * Where generated files clash with the model's, by generated path (T276,
 * AC-249): a file the model has at that path, or a cube or view it declares
 * already — one namespace in Cube. The API refuses them whatever this says
 * (packages/api/src/model/clashes.ts).
 */
function clashesWith(
  existing: readonly { readonly path: string; readonly content: string }[],
  created: readonly { readonly path: string; readonly content: string }[],
): Map<string, Clash[]> {
  const paths = new Set(existing.map((file) => file.path));
  const names = new Map<string, { kind: 'cube' | 'view'; path: string }>();
  for (const file of existing)
    for (const { kind, name } of objectsOf(file.path, file.content).objects)
      if (!names.has(name)) names.set(name, { kind, path: file.path });
  const clashes = new Map<string, Clash[]>();
  for (const file of created) {
    const byName = objectsOf(file.path, file.content).objects.flatMap(({ name }) => {
      const found = names.get(name);
      return found === undefined ? [] : [{ name, ...found }];
    });
    const said: Clash[] = [
      // "The model": the store's files and the unpublished drafts (T276's review).
      ...(paths.has(file.path) && !byName.some((clash) => clash.path === file.path)
        ? [{ path: file.path }]
        : []),
      ...byName,
    ];
    if (said.length > 0) clashes.set(file.path, said);
  }
  return clashes;
}

const plural = (count: number, one: string, many = `${one}s`) =>
  `${String(count)} ${count === 1 ? one : many}`;
const cubes = (count: number) => plural(count, 'cube');
/** Review's primary, for what it does (R36, AC-345). */
const asDrafts = (count: number) =>
  count === 1 ? 'Add 1 cube as a draft' : `Add ${String(count)} cubes as drafts`;

/** What a generated cube holds, in a line: "4 dimensions · 1 measure · 1 join". */
function countsOf(cube: Generated, path: string): string {
  const members = objectsOf(path, cube.content).objects[0]?.members ?? [];
  const count = (kind: string) => members.filter((member) => member.kind === kind).length;
  return [
    [count('dimension'), 'dimension'],
    [count('measure'), 'measure'],
    [count('join'), 'join'],
    [cube.unmappedColumns.length, 'column left out', 'columns left out'],
  ]
    .filter(([n]) => (n as number) > 0)
    .map(([n, one, many]) => plural(n as number, one as string, many as string | undefined))
    .join(' · ');
}

const STEPS = ['Source', 'Tables', 'Review'] as const;

export function GenerateCubes({
  existing,
  onClose,
  onAdded,
  onOpen,
  onShow,
  workspace,
}: {
  /** The model's files, stored and drafted: what a generated cube must not clash with (T276). */
  existing: readonly { readonly path: string; readonly content: string }[];
  onClose: () => void;
  /**
   * The generated files, to keep as the model's unpublished drafts (T488,
   * AC-345); in My workspace, with the shared folder they are to go to (T492).
   */
  onAdded: (files: { path: string; content: string }[], target?: string) => void;
  /**
   * In My workspace (T492, AC-350): the pane says so, and asks which of these
   * shared folders the cubes are to go to, as a new workspace model file must
   * name one. Undefined until they are read.
   */
  workspace?:
    | {
        readonly targets: readonly Target[] | undefined;
        /** Why they couldn't be read, where they couldn't. */
        readonly failed?: string | undefined;
      }
    | undefined;
  /** Opens a file added here, closing the pane (design 11 state N). */
  onOpen?: ((path: string) => void) | undefined;
  /** Opens a file the model has beside the pane, which stays (design 11 pin 17). */
  onShow?: ((path: string) => void) | undefined;
}) {
  const ids = useId();
  const queryClient = useQueryClient();
  const pane = useRef<HTMLElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  /**
   * Focus on the pane's title as it opens (design 11 pin 9) — once: drawn
   * again on another page, it leaves focus where the user is (T485's review).
   */
  const [welcomed, setWelcomed] = useKept('welcomed', () => false);
  useEffect(() => {
    if (welcomed) return;
    heading.current?.focus();
    setWelcomed(true);
    // Once, as it opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [step, setStep] = useKept<number>('step', () => 0);
  const [again, setAgain] = useState({ sources: 0, schemas: 0, tables: 0 });
  const sources = useAsked<{ dataSources: Source[] }>('/api/introspection/sources', again.sources);
  /**
   * Each data source's health, as Data sources has it (T490, AC-348): the
   * shared root's record of that name — the model's data sources are the
   * root's. No record the user can see — the list unread, or the root's not
   * theirs to see (the API lists read-write folders' only), or a source Cube
   * has from its own settings — says nothing, as Data sources shows them
   * nothing (T490's review).
   */
  const listed = useQuery(DATA_SOURCES_QUERY);
  const healthOfSource = (name: string): Pick<ListedSource, 'lastTest'> | undefined =>
    listed.data?.find((each) => each.name === name && each.folderId === SHARED_ROOT.id);
  const [chosenSource, setSource] = useKept<string | null>('source', () => null);
  const source =
    chosenSource ??
    (sources.kind === 'ok' ? (sources.value.dataSources[0]?.dataSource ?? null) : null);
  const sourceType =
    sources.kind === 'ok'
      ? sources.value.dataSources.find((each) => each.dataSource === source)?.dbType
      : undefined;
  const sourceUrl =
    source === null ? undefined : `/api/introspection/sources/${encodeURIComponent(source)}`;
  const schemas = useAsked<{ schemas: { name: string }[] }>(
    sourceUrl === undefined ? undefined : `${sourceUrl}/schemas`,
    again.schemas,
  );
  const [schema, setSchema] = useKept('schema', () => '');
  const [schemaSearch, setSchemaSearch] = useState('');
  const [search, setSearch] = useKept('search', () => '');
  const [types, setTypes] = useKept<ReadonlySet<string>>('types', () => new Set());
  const [offset, setOffset] = useKept('offset', () => 0);
  const tablesUrl =
    sourceUrl === undefined || schema === '' || step === 0
      ? undefined
      : `${sourceUrl}/tables?${[
          `schema=${encodeURIComponent(schema)}`,
          ...(search.trim() === '' ? [] : [`search=${encodeURIComponent(search.trim())}`]),
          ...[...types].map((type) => `type=${encodeURIComponent(type)}`),
          `limit=${String(PAGE)}`,
          `offset=${String(offset)}`,
        ].join('&')}`;
  const tables = useAsked<{ tables: TableRow[]; total: number }>(tablesUrl, again.tables);
  /** Chosen tables, in the order chosen, kept across pages and searches. */
  const [chosen, setChosen] = useKept<ReadonlyMap<string, TableRow>>('chosen', () => new Map());
  const [peek, setPeek] = useKept<TableRow | null>('peek', () => null);
  const [columns, setColumns] = useKept<Asked<Column[]>>('columns', () => ({ kind: 'idle' }));
  const [generated, setGenerated] = useKept<Asked<Generated[]>>('generated', () => ({
    kind: 'idle',
  }));
  const [added, setAdded] = useKept<Added>('added', () => ({ kind: 'idle' }));
  /** In My workspace, the shared folder the cubes are to go to (T492). */
  const [chosenTarget, setTarget] = useKept('target', () => '');
  const targets = workspace?.targets;
  const target =
    chosenTarget !== '' && targets?.some((each) => each.id === chosenTarget) !== false
      ? chosenTarget
      : targets?.length === 1
        ? targets[0]!.id
        : '';
  const needsTarget = workspace !== undefined && target === '';
  const [typesOpen, setTypesOpen] = useState(false);
  // A press or focus outside the Type menu closes it, as a menu does (T485's review).
  const typesBox = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!typesOpen) return undefined;
    const onOutside = (event: Event) => {
      if (event.target instanceof Node && typesBox.current?.contains(event.target) === true) return;
      setTypesOpen(false);
    };
    document.addEventListener('mousedown', onOutside);
    document.addEventListener('focusin', onOutside);
    return () => {
      document.removeEventListener('mousedown', onOutside);
      document.removeEventListener('focusin', onOutside);
    };
  }, [typesOpen]);
  const [asking, setAsking] = useState(false);
  /** Generated files whose YAML is open: only those draw a code view (T485's review). */
  const [yamlOpen, setYamlOpen] = useState<ReadonlySet<string>>(new Set());
  /** The YAML soft-wraps, on by default (design 11 state K). */
  const [wrapYaml, setWrapYaml] = useState(true);

  /**
   * Closed: what it held goes, the next opening starts afresh, and an answer
   * still on its way lands nowhere (T485's review).
   */
  const end = () => {
    nextTurn('look');
    nextTurn('generate');
    queryClient.removeQueries({ queryKey: GENERATE_KEY });
    onClose();
  };
  /** Something chosen or generated and not added: leaving asks first (rule 85). */
  const holding = added.kind !== 'done' && (chosen.size > 0 || generated.kind === 'ok');
  // A reload or a closed tab asks too, as the new data source pane does (state P).
  useEffect(() => {
    if (!holding) return undefined;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [holding]);
  // Each step's first control takes focus as the step opens, never the page
  // (the new data source pane's rule; T485's review).
  const body = useRef<HTMLDivElement>(null);
  const shownStep = useRef(step);
  useEffect(() => {
    if (shownStep.current === step) return;
    shownStep.current = step;
    // With nothing to press yet (generating), the pane's heading holds it.
    (
      body.current?.querySelector<HTMLElement>(
        'input:not([disabled]), button:not([disabled]), summary',
      ) ?? heading.current
    )?.focus();
  }, [step]);
  const leave = () => {
    if (holding) setAsking(true);
    else end();
  };
  const leaveFrom = useRef<HTMLElement | null>(null);
  const ask = () => {
    leaveFrom.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    leave();
  };
  const keepOn = () => {
    setAsking(false);
    leaveFrom.current?.focus();
  };

  // Escape asks as Cancel does; with the question open it keeps editing, the
  // answer that loses nothing. Only an Escape meant for the pane: pressed in
  // it, or with focus on nothing — as the new data source pane (T471's review).
  const onEscape = useRef<() => void>(() => undefined);
  useEffect(() => {
    onEscape.current = () => {
      if (asking) keepOn();
      else ask();
    };
  });
  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      const at = event.target;
      const ours =
        at === document.body ||
        at === document.documentElement ||
        (at instanceof Node && pane.current?.contains(at) === true);
      if (ours) onEscape.current();
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

  const lookAt = (table: TableRow) => {
    if (sourceUrl === undefined) return;
    // Open closes it: one table's columns at a time.
    if (peek !== null && keyOf(peek) === keyOf(table)) {
      nextTurn('look');
      setPeek(null);
      return;
    }
    const turn = nextTurn('look');
    const current = () => isTurn('look', turn);
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

  const generate = (from: ReadonlyMap<string, TableRow> = chosen) => {
    if (sourceUrl === undefined || from.size === 0) return;
    const turn = nextTurn('generate');
    const current = () => isTurn('generate', turn);
    setGenerated({ kind: 'run' });
    setAdded({ kind: 'idle' });
    setStep(2);
    askApi<{ cubes: Generated[] }>(`${sourceUrl}/scaffold`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        tables: [...from.values()].map((table) => ({ schema: table.schema, table: table.name })),
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
  /**
   * Against the model as it is now: a clash put right in a file opened beside
   * the pane clears at once (T485's review). Once added the cubes are the
   * model's drafts, and the files are listed, not checked (T276's review).
   */
  const clashes =
    generated.kind === 'ok'
      ? clashesWith(
          existing,
          generated.value.map((cube) => ({ path: pathOf(cube), content: cube.content })),
        )
      : new Map<string, Clash[]>();
  const clashing = [...clashes.values()].reduce((sum, each) => sum + each.length, 0);
  /**
   * The model's cubes by the table each reads, before anything is generated
   * (T489, AC-347): read once per model, not at each keystroke in the pane.
   */
  const readers = useMemo(() => readersOf(existing), [existing]);
  /** A generated file's status (design 11 pin 13). */
  const statusOf = (cube: Generated): 'ready' | 'clash' | 'check' =>
    (clashes.get(pathOf(cube)) ?? []).length > 0
      ? 'clash'
      : cube.countMeasure === false ||
          (cube.unmarkedKeys ?? []).length > 0 ||
          cube.unchecked === true
        ? 'check'
        : 'ready';
  const checking =
    generated.kind === 'ok'
      ? generated.value.filter((cube) => statusOf(cube) === 'check').length
      : 0;

  /** The table a generated cube came from, to leave out: as the API says, or by its name. */
  const tableOf = (cube: Generated) =>
    cube.table === undefined
      ? [...chosen.values()].find((table) => table.name === cube.cube)
      : chosen.get(`${cube.table.schema}.${cube.table.table}`);
  /** Leaves tables out and generates the rest again; with none left, back to Tables. */
  const leaveOut = (left: readonly (TableRow | undefined)[]) => {
    const next = new Map(chosen);
    for (const table of left) if (table !== undefined) next.delete(keyOf(table));
    setChosen(next);
    if (next.size === 0) {
      nextTurn('generate');
      setGenerated({ kind: 'idle' });
      setStep(1);
      return;
    }
    generate(next);
    // What was pressed goes with the block it was in: focus stays in the pane.
    heading.current?.focus();
  };

  /**
   * The cubes into the model's tree as unpublished drafts, none published
   * (R36, AC-345): each is, when saved, with the drafts its cubes join (AC-346).
   */
  const add = () => {
    if (generated.kind !== 'ok' || clashing > 0 || needsTarget) return;
    const files = generated.value.map((cube) => ({ path: pathOf(cube), content: cube.content }));
    setAdded({ kind: 'done', count: files.length });
    if (workspace === undefined) onAdded(files);
    else onAdded(files, target);
  };

  const goTo = (next: number) => {
    setTypesOpen(false);
    setStep(next);
  };

  /** Another source: nothing of this one's stays, nor lands later. */
  const chooseSource = (next: string) => {
    nextTurn('look');
    nextTurn('generate');
    setSource(next);
    setSchema('');
    setChosen(new Map());
    setPeek(null);
    setColumns({ kind: 'idle' });
    setGenerated({ kind: 'idle' });
    setAdded({ kind: 'idle' });
  };

  const done = added.kind === 'done';
  const running = generated.kind === 'run';
  const shownSchemas =
    schemas.kind === 'ok'
      ? schemas.value.schemas.filter((each) =>
          each.name.toLowerCase().includes(schemaSearch.trim().toLowerCase()),
        )
      : [];
  const typesLabel =
    types.size === 0
      ? 'All'
      : TYPES.filter(([key]) => types.has(key))
          .map(([, label]) => label)
          .join(', ');

  /** "default · PostgreSQL › public", from the Tables step on (design 11 pin 3). */
  const strip =
    step === 0 || source === null ? null : (
      <div className="source-pane__chosen generate-pane__where">
        {sourceType === undefined || driverOf(sourceType) === undefined ? null : (
          <DriverMark type={driverOf(sourceType) as DriverType} />
        )}
        <span className="source-pane__chosen-text">
          <span>
            <b className="is-code">{source}</b>
            {sourceType === undefined ? '' : ` · ${driverName(sourceType)}`}
            {' › '}
            <b className="is-code">{schema}</b>
            {step === 2 ? ` · ${plural(chosen.size, 'table')}` : ''}
          </span>
        </span>
        {done ? null : (
          <button
            type="button"
            className="link-button"
            disabled={running}
            onClick={() => {
              goTo(0);
            }}
          >
            Change
          </button>
        )}
      </div>
    );

  /** The card's foot while there is more than a page: "51–100 of 120" and ‹ › (design 11 state H). */
  const pagesOf = (total: number) =>
    total > PAGE ? (
      <div className="generate-pane__pages">
        <span>
          {String(offset + 1)}–{String(Math.min(offset + PAGE, total))} of {String(total)}
        </span>
        <button
          type="button"
          className="btn-sm"
          aria-label="Previous page"
          disabled={offset === 0}
          onClick={() => {
            setOffset(Math.max(0, offset - PAGE));
          }}
        >
          ‹
        </button>
        <button
          type="button"
          className="btn-sm"
          aria-label="Next page"
          disabled={offset + PAGE >= total}
          onClick={() => {
            setOffset(offset + PAGE);
          }}
        >
          ›
        </button>
      </div>
    ) : null;
  const skeleton = (rows: number, height: 'row' | 'dense' = 'row') => (
    <div className={`generate-pane__skeleton is-${height}`} aria-hidden="true">
      {Array.from({ length: rows }, (_, at) => (
        <span key={at} className="skeleton-bar" />
      ))}
    </div>
  );

  // The foot (design 11 pin 8): Back, then Cancel and one primary, named for
  // what it does next; a blocked primary says why beside it.
  const reviewing = step === 2 && !done;
  const reason =
    step === 0
      ? schema === ''
        ? 'Choose a schema'
        : null
      : step === 1
        ? chosen.size === 0
          ? 'Choose at least one table'
          : null
        : reviewing && clashing > 0
          ? `Resolve ${plural(clashing, 'clash', 'clashes')} first`
          : reviewing && generated.kind === 'ok' && needsTarget
            ? 'Choose where they go'
            : null;
  const primaryLabel =
    step === 0
      ? 'Next: Tables'
      : step === 1
        ? chosen.size === 0
          ? 'Generate cubes'
          : `Generate ${cubes(chosen.size)}`
        : done
          ? 'Close'
          : generated.kind === 'ok'
            ? asDrafts(generated.value.length)
            : 'Add cubes as drafts';
  const primaryDisabled =
    step === 0 ? schema === '' : step === 1 ? chosen.size === 0 : !done && generated.kind !== 'ok';
  /** Pressable, but refused with its reason beside it, while a cube clashes (AC-249). */
  const primaryRefused = reviewing && (clashing > 0 || (generated.kind === 'ok' && needsTarget));
  const onPrimary = () => {
    if (step === 0) goTo(1);
    else if (step === 1) generate();
    else if (done) end();
    else add();
  };
  const onRetryGenerate = () => {
    generate();
  };
  /**
   * Escape in the Type menu, or on its pill while it is open, closes it, not
   * the pane, and puts focus back on the pill.
   */
  const typePill = useRef<HTMLButtonElement>(null);
  const closeTypesOnEscape = (event: ReactKeyboardEvent) => {
    if (event.key !== 'Escape' || !typesOpen) return;
    event.preventDefault();
    setTypesOpen(false);
    typePill.current?.focus();
  };

  return (
    <aside
      ref={pane}
      role="dialog"
      aria-labelledby={`${ids}-title`}
      className="source-pane generate-pane"
    >
      <header className="source-pane__head">
        <h2 ref={heading} id={`${ids}-title`} tabIndex={-1}>
          Generate cubes
        </h2>
        {/* As the new data source pane's head says it (T492, AC-350). */}
        {workspace === undefined ? null : (
          <span className="source-pane__where">
            <span className="source-pane__person" aria-hidden="true" />
            in My workspace
          </span>
        )}
        <button type="button" className="source-pane__close" aria-label="Close" onClick={ask}>
          ×
        </button>
      </header>

      <nav className="source-pane__rail" aria-label="Generate cubes steps">
        <ol aria-label="Steps">
          {STEPS.map((label, at) => (
            <li
              key={label}
              className={
                at < step || (done && at === 2) ? 'is-done' : at === step ? 'is-current' : undefined
              }
            >
              {at < step && !done ? (
                <button
                  type="button"
                  aria-label={`${label}, done`}
                  disabled={running}
                  onClick={() => {
                    goTo(at);
                  }}
                >
                  <span className="source-pane__step" aria-hidden="true">
                    {String(at + 1)}
                  </span>
                  {label}
                </button>
              ) : (
                <span aria-current={at === step ? 'step' : undefined}>
                  <span className="source-pane__step" aria-hidden="true">
                    {String(at + 1)}
                  </span>
                  {label}
                </span>
              )}
            </li>
          ))}
        </ol>
        <p className="source-pane__rail-short">
          <span className="source-pane__step" aria-hidden="true">
            {String(step + 1)}
          </span>
          Step {String(step + 1)} of 3 · {STEPS[step]}
        </p>
      </nav>

      {strip}

      <div ref={body} className="source-pane__body generate-pane__body">
        {step === 0 ? (
          <>
            <section className="generate-pane__section" aria-labelledby={`${ids}-source`}>
              <h3 id={`${ids}-source`} className="connection-form__legend">
                Data source
              </h3>
              {sources.kind === 'run' ? (
                <>
                  <StateLine kind="run">Reading the data sources…</StateLine>
                  {skeleton(3)}
                </>
              ) : null}
              {sources.kind === 'err' ? (
                <ReadFailed
                  what="The data sources can’t be read."
                  message={sources.message}
                  onRetry={() => {
                    setAgain({ ...again, sources: again.sources + 1 });
                  }}
                />
              ) : null}
              {sources.kind === 'ok' && sources.value.dataSources.length === 0 ? (
                <p className="generate-pane__empty">
                  No data source yet. <a href="/data-sources">Add one in Data sources</a>
                </p>
              ) : null}
              {sources.kind === 'ok' && sources.value.dataSources.length > 0 ? (
                <div
                  role="radiogroup"
                  aria-labelledby={`${ids}-source`}
                  className="generate-pane__choices"
                >
                  {sources.value.dataSources.map((each, at) => {
                    // Named by its name and driver; its health, as Data sources says
                    // it, describes it (T490, AC-348).
                    const named = `${ids}-source-${String(at)}`;
                    const record = healthOfSource(each.dataSource);
                    return (
                      <label key={each.dataSource} className="generate-pane__choice">
                        <input
                          type="radio"
                          name={`${ids}-source`}
                          aria-labelledby={`${named}-name ${named}-driver`}
                          aria-describedby={record === undefined ? undefined : `${named}-health`}
                          checked={each.dataSource === source}
                          onChange={() => {
                            chooseSource(each.dataSource);
                          }}
                        />
                        <span id={`${named}-name`} className="is-code generate-pane__choice-name">
                          {each.dataSource}
                        </span>{' '}
                        <span id={`${named}-driver`} className="generate-pane__choice-note">
                          {driverName(each.dbType)}
                        </span>
                        {record === undefined ? null : (
                          <HealthBadge id={`${named}-health`} source={record} />
                        )}
                      </label>
                    );
                  })}
                </div>
              ) : null}
            </section>
            {source === null ? null : (
              <section className="generate-pane__section" aria-labelledby={`${ids}-schema`}>
                <h3 id={`${ids}-schema`} className="connection-form__legend">
                  Schema
                </h3>
                {schemas.kind === 'run' ? (
                  <>
                    <StateLine kind="run">Reading its schemas…</StateLine>
                    {skeleton(3, 'dense')}
                  </>
                ) : null}
                {schemas.kind === 'err' ? (
                  <ReadFailed
                    what="Its schemas can’t be read."
                    message={schemas.message}
                    onRetry={() => {
                      setAgain({ ...again, schemas: again.schemas + 1 });
                    }}
                  />
                ) : null}
                {schemas.kind === 'ok' && schemas.value.schemas.length > 10 ? (
                  <input
                    type="search"
                    className="generate-pane__search"
                    aria-label="Search schemas"
                    placeholder="Search schemas"
                    value={schemaSearch}
                    onChange={(event) => {
                      setSchemaSearch(event.target.value);
                    }}
                  />
                ) : null}
                {schemas.kind === 'ok' ? (
                  <div
                    role="radiogroup"
                    aria-labelledby={`${ids}-schema`}
                    className="generate-pane__choices is-dense"
                  >
                    {shownSchemas.map((each) => (
                      <label key={each.name} className="generate-pane__choice">
                        <input
                          type="radio"
                          name={`${ids}-schema`}
                          checked={each.name === schema}
                          onChange={() => {
                            narrow(() => {
                              setSchema(each.name);
                            });
                          }}
                        />
                        <span className="is-code generate-pane__choice-name">{each.name}</span>
                      </label>
                    ))}
                  </div>
                ) : null}
              </section>
            )}
          </>
        ) : null}

        {step === 1 ? (
          <section className="generate-pane__section" aria-labelledby={`${ids}-tables`}>
            <h3 id={`${ids}-tables`} className="connection-form__legend">
              Tables
            </h3>
            <div className="generate-pane__filters">
              <input
                type="search"
                className="generate-pane__search"
                aria-label="Search tables"
                placeholder="Search tables"
                value={search}
                onChange={(event) => {
                  narrow(() => {
                    setSearch(event.target.value);
                  });
                }}
              />
              <div ref={typesBox} className="generate-pane__types">
                <button
                  ref={typePill}
                  type="button"
                  className="fpill generate-pane__type"
                  aria-expanded={typesOpen}
                  aria-controls={typesOpen ? `${ids}-types` : undefined}
                  onKeyDown={closeTypesOnEscape}
                  onClick={() => {
                    setTypesOpen(!typesOpen);
                  }}
                >
                  Type · <b>{typesLabel}</b> <span aria-hidden="true">▾</span>
                </button>
                {typesOpen ? (
                  <div
                    id={`${ids}-types`}
                    className="generate-pane__menu"
                    role="group"
                    aria-label="Types"
                  >
                    <label>
                      <input
                        type="checkbox"
                        checked={types.size === 0}
                        onKeyDown={closeTypesOnEscape}
                        onChange={() => {
                          narrow(() => {
                            setTypes(new Set());
                          });
                        }}
                      />
                      All
                    </label>
                    {TYPES.map(([type, label]) => (
                      <label key={type}>
                        <input
                          type="checkbox"
                          checked={types.has(type)}
                          onKeyDown={closeTypesOnEscape}
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
                  </div>
                ) : null}
              </div>
            </div>
            {tables.kind === 'run' ? (
              <>
                <StateLine kind="run">Reading the tables…</StateLine>
                {skeleton(5)}
              </>
            ) : null}
            {tables.kind === 'err' ? (
              <ReadFailed
                what="The tables can’t be read."
                message={tables.message}
                onRetry={() => {
                  setAgain({ ...again, tables: again.tables + 1 });
                }}
              />
            ) : null}
            {tables.kind === 'ok' ? (
              <>
                <p className="generate-pane__count">
                  {plural(tables.value.total, 'table')} ·{' '}
                  {chosen.size === 0 ? 'none chosen' : `${String(chosen.size)} chosen`}
                  {tables.value.total > PAGE
                    ? ` · ${String(offset + 1)}–${String(
                        Math.min(offset + PAGE, tables.value.total),
                      )} of ${String(tables.value.total)}`
                    : ''}
                </p>
                {tables.value.tables.length === 0 ? (
                  <div className="generate-pane__card generate-pane__none">
                    {search.trim() === '' ? (
                      <p>No tables in {schema}.</p>
                    ) : (
                      <>
                        <p>No tables match “{search.trim()}”.</p>
                        <button
                          type="button"
                          className="link-button"
                          onClick={() => {
                            narrow(() => {
                              setSearch('');
                            });
                          }}
                        >
                          Clear search
                        </button>
                      </>
                    )}
                    {/* A page past the last can come back empty: the way back stays. */}
                    {pagesOf(tables.value.total)}
                  </div>
                ) : (
                  <div className="generate-pane__card">
                    <table className="generate-pane__tables" aria-label={`Tables in ${schema}`}>
                      <thead>
                        <tr>
                          <th scope="col">
                            <span className="generate-pane__all">
                              <PageBox
                                page={tables.value.tables}
                                chosen={chosen}
                                onChange={setChosen}
                              />
                              Table
                            </span>
                          </th>
                          <th scope="col">Type</th>
                          <th scope="col">
                            <span className="visually-hidden">Columns</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {tables.value.tables.flatMap((table, at) => {
                          const open = peek !== null && keyOf(peek) === keyOf(table);
                          // The cubes that read it, in this source (T489, AC-347), said with its box.
                          const readBy = readersFor(readers, source, table);
                          const readById = `${ids}-read-${String(at)}`;
                          const row = (
                            <tr key={keyOf(table)} className={open ? 'is-open' : undefined}>
                              <td>
                                <label>
                                  <input
                                    type="checkbox"
                                    checked={chosen.has(keyOf(table))}
                                    aria-describedby={readBy.length === 0 ? undefined : readById}
                                    onChange={(event) => {
                                      const next = new Map(chosen);
                                      if (event.target.checked) next.set(keyOf(table), table);
                                      else next.delete(keyOf(table));
                                      setChosen(next);
                                    }}
                                  />
                                  <span className="is-code">{table.name}</span>
                                </label>
                                {/* A cube already reads it: said before generating (T489, AC-347). */}
                                {readBy.length === 0 ? null : (
                                  <span id={readById} className="generate-pane__in-model">
                                    In model · {readBy.join(', ')}
                                  </span>
                                )}
                              </td>
                              <td>{typeName(table.type)}</td>
                              <td>
                                <button
                                  type="button"
                                  className="generate-pane__peek"
                                  aria-label={`Columns of ${table.name}`}
                                  aria-expanded={open}
                                  onClick={() => {
                                    lookAt(table);
                                  }}
                                >
                                  <span aria-hidden="true">{open ? '▴' : '▾'}</span>
                                </button>
                              </td>
                            </tr>
                          );
                          if (!open) return [row];
                          return [
                            row,
                            <tr key={`${keyOf(table)} columns`} className="generate-pane__columns">
                              <td colSpan={3}>
                                <div className="generate-pane__caption">
                                  <span className="is-code">{table.name}</span>
                                  {columns.kind === 'ok'
                                    ? ` · ${plural(columns.value.length, 'column')}`
                                    : ''}
                                  {columns.kind === 'run' ? (
                                    <>
                                      {' · '}
                                      <StateLine kind="run" className="generate-pane__inline">
                                        Reading its columns…
                                      </StateLine>
                                    </>
                                  ) : null}
                                </div>
                                {columns.kind === 'err' ? (
                                  <StateLine kind="err">{columns.message}</StateLine>
                                ) : null}
                                {columns.kind === 'run' ? skeleton(3, 'dense') : null}
                                {columns.kind === 'ok' ? (
                                  <table aria-label={`Columns of ${table.name}`}>
                                    <thead>
                                      <tr>
                                        <th scope="col">Column</th>
                                        <th scope="col">Database type</th>
                                        <th scope="col">Cube type</th>
                                        <th scope="col">Key</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {columns.value.map((column) => (
                                        <tr key={column.name}>
                                          <td className="is-code">{column.name}</td>
                                          <td
                                            className="is-code generate-pane__raw"
                                            title={column.rawType}
                                          >
                                            {column.rawType}
                                          </td>
                                          <td>{column.type}</td>
                                          <td className="is-code">
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
                              </td>
                            </tr>,
                          ];
                        })}
                      </tbody>
                    </table>
                    {pagesOf(tables.value.total)}
                  </div>
                )}
              </>
            ) : null}
          </section>
        ) : null}

        {step === 2 ? (
          <section className="generate-pane__section" aria-label="Review">
            {generated.kind === 'run' ? (
              <>
                <StateLine kind="run">Generating…</StateLine>
                <ul className="generate-pane__files" aria-hidden="true">
                  {[...chosen.values()].map((table) => (
                    <li key={keyOf(table)} className="generate-pane__file is-waiting">
                      <span className="is-code">cubes/{table.name}.yml</span>
                      <span className="skeleton-bar" />
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
            {generated.kind === 'err' ? (
              <ReadFailed
                what="The cubes couldn’t be generated."
                message={generated.message}
                onRetry={onRetryGenerate}
              />
            ) : null}

            {generated.kind === 'ok' && added.kind === 'done' ? (
              <>
                <div className="generate-pane__note is-ok" role="status">
                  <StatusIcon kind="ok" />
                  <div>
                    <p>
                      Added {cubes(added.count)} as {added.count === 1 ? 'a draft' : 'drafts'}.
                    </p>
                    {workspace === undefined ? (
                      <p>
                        Nothing is published yet. Saving a draft publishes it, with the drafts its
                        cubes join.
                      </p>
                    ) : (
                      // Saved in My workspace, then proposed to their folder (T492).
                      <p>
                        Saving a draft keeps it in My workspace, with the drafts its cubes join.
                        Propose it to put it in its folder.
                      </p>
                    )}
                  </div>
                </div>
                <h3 className="connection-form__legend">Files</h3>
                <ul className="generate-pane__card generate-pane__opened" aria-label="Added files">
                  {generated.value.map((cube) => (
                    <li key={cube.fileName}>
                      <span className="is-code">{pathOf(cube)}</span>
                      {onOpen === undefined ? null : (
                        <button
                          type="button"
                          className="btn-sm"
                          aria-label={`Open ${pathOf(cube)}`}
                          onClick={() => {
                            queryClient.removeQueries({ queryKey: GENERATE_KEY });
                            onOpen(pathOf(cube));
                          }}
                        >
                          Open
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}

            {generated.kind === 'ok' && added.kind !== 'done' ? (
              <>
                {/* One summary (design 11 pin 12). */}
                {clashing > 0 ? (
                  <div className="generate-pane__note is-err" role="note">
                    <StatusIcon kind="err" />
                    <div>
                      <p>
                        <b>
                          {String(clashes.size)} of {cubes(generated.value.length)}{' '}
                          {clashes.size === 1 ? 'clashes' : 'clash'} with the model.
                        </b>{' '}
                        Nothing is added while a cube clashes.
                      </p>
                      <button
                        type="button"
                        className="btn-sm"
                        onClick={() => {
                          leaveOut(
                            generated.value
                              .filter((cube) => statusOf(cube) === 'clash')
                              .map(tableOf),
                          );
                        }}
                      >
                        Leave out clashing tables
                      </button>
                    </div>
                  </div>
                ) : checking > 0 ? (
                  <div className="generate-pane__note is-warn" role="note">
                    <StatusIcon kind="warn" />
                    <p>
                      {cubes(generated.value.length)} ready to add; {String(checking)}{' '}
                      {checking === 1 ? 'needs' : 'need'} a look first.
                    </p>
                  </div>
                ) : (
                  <div className="generate-pane__note is-ok" role="note">
                    <StatusIcon kind="ok" />
                    <p>
                      {cubes(generated.value.length)} ready to add as drafts. Nothing is published
                      until you save them.
                    </p>
                  </div>
                )}

                <div className="generate-pane__files">
                  {generated.value.map((cube) => {
                    const path = pathOf(cube);
                    const status = statusOf(cube);
                    const lines = cube.content.replace(/\n$/, '').split('\n').length;
                    return (
                      <section
                        key={cube.fileName}
                        aria-label={path}
                        className="generate-pane__file"
                      >
                        <details open={status !== 'ready'}>
                          <summary>
                            <span className="is-code generate-pane__path">{path}</span>
                            <span className={`generate-pane__status is-${status}`}>
                              <StatusIcon
                                kind={
                                  status === 'ready' ? 'ok' : status === 'clash' ? 'err' : 'warn'
                                }
                              />
                              {status === 'ready'
                                ? 'Ready'
                                : status === 'clash'
                                  ? 'Clashes'
                                  : 'Check'}
                            </span>
                            <span className="generate-pane__counts">{countsOf(cube, path)}</span>
                          </summary>
                          <div className="generate-pane__file-body">
                            {(clashes.get(path) ?? []).map((clash) => (
                              <div
                                key={`${clash.path} ${clash.name ?? ''}`}
                                className="generate-pane__note is-err"
                              >
                                <StatusIcon kind="err" />
                                <div>
                                  <p>
                                    {clash.name === undefined ? (
                                      <>
                                        <span className="is-code">{clash.path}</span> is already in
                                        the model.
                                      </>
                                    ) : (
                                      <>
                                        <span className="is-code">{clash.name}</span> is already a{' '}
                                        {clash.kind} in{' '}
                                        <span className="is-code">{clash.path}</span>.
                                      </>
                                    )}
                                  </p>
                                  <div className="generate-pane__actions">
                                    {onShow === undefined ? null : (
                                      <button
                                        type="button"
                                        className="btn-sm"
                                        onClick={() => {
                                          onShow(clash.path);
                                        }}
                                      >
                                        Open {clash.path}
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      className="btn-sm"
                                      onClick={() => {
                                        leaveOut([tableOf(cube)]);
                                      }}
                                    >
                                      Leave this table out
                                    </button>
                                  </div>
                                </div>
                              </div>
                            ))}
                            {(cube.unmarkedKeys ?? []).length === 0 ? null : (
                              <div className="generate-pane__note is-warn">
                                <StatusIcon kind="warn" />
                                <p>
                                  Not marked as the cube’s primary key:{' '}
                                  {(cube.unmarkedKeys ?? []).join(', ')}. A join to this cube needs
                                  one.
                                </p>
                              </div>
                            )}
                            {cube.countMeasure === false ? (
                              <div className="generate-pane__note is-warn">
                                <StatusIcon kind="warn" />
                                <p>No count measure: a column’s measure took its name, count.</p>
                              </div>
                            ) : null}
                            {cube.unchecked === true ? (
                              <div className="generate-pane__note is-warn">
                                <StatusIcon kind="warn" />
                                <p>
                                  wechart could not read this file to check it against its table:
                                  only Cube’s list of what it left out is shown.
                                </p>
                              </div>
                            ) : null}
                            <details
                              className="generate-pane__yaml"
                              open={yamlOpen.has(path)}
                              onToggle={(event) => {
                                const shown = event.currentTarget.open;
                                if (shown === yamlOpen.has(path)) return;
                                const next = new Set(yamlOpen);
                                if (shown) next.add(path);
                                else next.delete(path);
                                setYamlOpen(next);
                              }}
                            >
                              <summary>
                                YAML <span>· {plural(lines, 'line')}</span>
                              </summary>
                              {/* Drawn once opened: a code view per file is not free. */}
                              {yamlOpen.has(path) ? (
                                <>
                                  <div className="generate-pane__yaml-head">
                                    <button
                                      type="button"
                                      className="btn-sm"
                                      aria-pressed={wrapYaml}
                                      onClick={() => {
                                        setWrapYaml(!wrapYaml);
                                      }}
                                    >
                                      <span aria-hidden="true">↵ </span>Wrap
                                    </button>
                                  </div>
                                  <YamlEditor
                                    value={cube.content}
                                    onChange={() => undefined}
                                    label={`${path}, as generated`}
                                    readOnly
                                    wrap={wrapYaml}
                                  />
                                </>
                              ) : null}
                            </details>
                            {cube.unmappedColumns.length === 0 ? (
                              cube.unchecked === true ? null : (
                                <p className="generate-pane__every">Every column is in the cube.</p>
                              )
                            ) : (
                              <>
                                <h4 className="generate-pane__left-title">
                                  Columns left out ({String(cube.unmappedColumns.length)})
                                </h4>
                                <ul className="generate-pane__left" aria-label="Columns left out">
                                  {cube.unmappedColumns.map((column) => (
                                    <li key={column.name}>
                                      <span className="is-code generate-pane__left-name">
                                        {column.name}
                                      </span>{' '}
                                      <span className="generate-pane__raw">{column.rawType}</span>
                                      <span className="generate-pane__why">
                                        {REASONS[column.reason] ?? column.reason}
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              </>
                            )}
                          </div>
                        </details>
                      </section>
                    );
                  })}
                </div>
                <p className="generate-pane__footnote">
                  A column used only in a join, such as a foreign key, is listed as left out too.
                </p>
                {/* Where they go, which a new workspace model file must name (T492). */}
                {workspace === undefined || done ? null : workspace.failed !== undefined ? (
                  <StateLine kind="err">
                    The folders they may go to couldn’t be read: {workspace.failed}
                  </StateLine>
                ) : targets === undefined ? (
                  <StateLine kind="run">Reading the folders they may go to…</StateLine>
                ) : targets.length === 0 ? (
                  <StateLine kind="err">
                    You have read-write access to no shared folder, so there is nowhere for them to
                    go.
                  </StateLine>
                ) : (
                  <div className="generate-pane__target">
                    <TargetTree
                      targets={targets}
                      chosen={target}
                      onChoose={setTarget}
                      describedBy={`${ids}-target-note`}
                    />
                    <p id={`${ids}-target-note`} className="connection-form__note">
                      They stay private in My workspace until you propose them to the folder.
                    </p>
                  </div>
                )}
              </>
            ) : null}
          </section>
        ) : null}
      </div>

      <footer className="source-pane__foot">
        {step === 0 ? null : (
          <button
            type="button"
            className="btn"
            // While generating, Back stops waiting for it (T485's review).
            onClick={() => {
              if (step === 2) {
                nextTurn('generate');
                if (generated.kind === 'run') setGenerated({ kind: 'idle' });
                // Added, those cubes are the model's drafts: another round starts afresh.
                if (done) {
                  setGenerated({ kind: 'idle' });
                  setAdded({ kind: 'idle' });
                  setChosen(new Map());
                }
              }
              goTo(step - 1);
            }}
          >
            <span aria-hidden="true">‹ </span>Back
          </button>
        )}
        <span className="source-pane__spacer" />
        {reason === null ? null : (
          <span className={`source-pane__foot-note${clashing > 0 && step === 2 ? ' is-err' : ''}`}>
            {reason}
          </span>
        )}
        {done ? null : (
          <button type="button" className="btn btn-ghost" onClick={ask}>
            Cancel
          </button>
        )}
        <button
          type="button"
          className="btn btn-primary"
          disabled={primaryDisabled}
          aria-disabled={primaryRefused ? true : undefined}
          onClick={primaryRefused ? undefined : onPrimary}
        >
          {primaryLabel}
          {step === 0 ? <span aria-hidden="true"> ›</span> : null}
        </button>
      </footer>

      {asking ? (
        <AskToDiscard
          what={
            generated.kind === 'ok'
              ? `The ${String(generated.value.length)} generated ${generated.value.length === 1 ? 'cube isn’t' : 'cubes aren’t'} added.`
              : `The ${plural(chosen.size, 'chosen table')} ${chosen.size === 1 ? 'is' : 'are'} forgotten.`
          }
          onKeep={keepOn}
          onDiscard={end}
        />
      ) : null}
    </aside>
  );
}

/**
 * The table list's header checkbox (T491, AC-349): chooses every table on the
 * page shown, or clears them if all are; mixed while some are. The other
 * pages' choices are left as they are.
 */
function PageBox({
  page,
  chosen,
  onChange,
}: {
  page: readonly TableRow[];
  chosen: ReadonlyMap<string, TableRow>;
  onChange: (next: ReadonlyMap<string, TableRow>) => void;
}) {
  const on = page.filter((table) => chosen.has(keyOf(table))).length;
  const all = page.length > 0 && on === page.length;
  const some = on > 0 && !all;
  const box = useRef<HTMLInputElement>(null);
  // `indeterminate` is a property only, never an attribute: set before paint.
  useLayoutEffect(() => {
    if (box.current !== null) box.current.indeterminate = some;
  }, [some]);
  return (
    <input
      ref={box}
      type="checkbox"
      aria-label="Choose every table on this page"
      checked={all}
      disabled={page.length === 0}
      onChange={() => {
        const next = new Map(chosen);
        for (const table of page)
          if (all) next.delete(keyOf(table));
          else next.set(keyOf(table), table);
        onChange(next);
      }}
    />
  );
}

/** A read that failed: the API's reason, verbatim, and Retry (rule 18; design 11 state C). */
function ReadFailed({
  what,
  message,
  onRetry,
}: {
  what: string;
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="generate-pane__note is-err" role="alert">
      <StatusIcon kind="err" />
      <div>
        <p>
          <b>{what}</b>
        </p>
        <p className="generate-pane__reason">{message}</p>
        <button type="button" className="btn-sm" onClick={onRetry}>
          Retry
        </button>
      </div>
    </div>
  );
}

/**
 * Design 01's discard question, inside the pane (design 11 state P, rule 85):
 * focus on the answer that loses nothing, and Tab kept to its two answers.
 */
function AskToDiscard({
  what,
  onKeep,
  onDiscard,
}: {
  what: string;
  onKeep: () => void;
  onDiscard: () => void;
}) {
  const ids = useId();
  const box = useRef<HTMLDivElement>(null);
  const keep = useRef<HTMLButtonElement>(null);
  useFocusTrap(box);
  useEffect(() => {
    keep.current?.focus();
  }, []);
  return (
    <div className="source-pane__veil">
      <div
        ref={box}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={`${ids}-discard`}
        aria-describedby={`${ids}-discard-body`}
        className="source-pane__ask"
      >
        <h3 id={`${ids}-discard`}>Discard this generation?</h3>
        <p id={`${ids}-discard-body`}>{what}</p>
        <div className="source-pane__ask-actions">
          <button ref={keep} type="button" className="btn" onClick={onKeep}>
            Keep editing
          </button>
          <button type="button" className="btn btn-danger" onClick={onDiscard}>
            Discard
          </button>
        </div>
      </div>
    </div>
  );
}
