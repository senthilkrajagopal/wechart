import { useQuery } from '@tanstack/react-query';
import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type Dispatch,
  type ReactNode,
  type RefObject,
} from 'react';

import { NotFound } from '../../shell/NotFound';
import { ME_QUERY } from '../../shell/me';
import { StateLine } from '../../shell/StatusIcon';
import { hiddenWorkspacesFor } from '../../shell/WorkspaceSwitcher';
import { sourceQuery } from '../data-sources/SourceSettings';
import { ChooseASource, NoSourceToRun } from './EmptyStates';
import { OffPanel } from './OffPanel';
import { placeOf, SQL_SOURCES_QUERY } from './sources';
import { SourcePicker } from './SourcePicker';
import { CUBE_STORE_ID, CUBE_STORE_QUERY } from '../data-sources/cubeStore';
import { endedAway } from './awayRun';
import { GOING_QUERY } from './going';
import { holdTabs, releaseTabs, tabsStoreFor } from './liveTabs';
import { QueryTab, type Insertion, type MadeFrom, type RunHold, type RunOnOpen } from './QueryTab';
import type { RunParameter } from './tabs';
import type { SqlColumn } from '../data-sources/SqlResult';
import { fileHref } from '../model/inFolder';
import { makeChartOver } from './makeChart';
import { MakeCubePane, type Added } from './MakeCubePane';
import type { MakeKind } from './ResultHead';
import { SchemaTree } from './SchemaTree';
import { runState, type RunState } from './runState';
import { UndoToast } from '../../dashboard/edit/UndoToast';
import { clockOf } from '../../shell/formatTime';
import { HistoryList, type HistoryRun } from './HistoryList';
import type { ParamType } from './parameterNames';
import { SavedList, savedQueryById, type SavedQuery } from './SavedList';
import { SaveKeyContext, useSaveKeyScope } from './saveKey';
import type { SqlSourceRow } from './sources';
import type { SqlSource } from './sqlSource';
import { firstTabs, newTabId, type SqlTab, type TabsAction, type TabsState } from './tabs';
import { TabStrip } from './TabStrip';
import { keepTabs, keptTabs } from './tabStore';
import {
  editorShare,
  LEFT_PANE,
  LEFT_RAIL_QUERY,
  paneWidth,
  RIGHT_PANE,
  RIGHT_RAIL_QUERY,
  roomFor,
  SPLIT,
  useWindowMatches,
} from './panes';

/**
 * The SQL runner workspace at `/sql` (F42; R78; design 17, direction §7f).
 *
 * Super-Admins' and read-write members' alone, as Jobs and Schedules are
 * (AC-001, AC-446; T796). Anyone else gets the page an address that matches
 * nothing gets, so the two can't be told apart (rule 67); and until who is
 * signed in is known, nothing of it, never a moment of content they may not
 * see (T500's review: fail closed).
 */
export function SqlWorkspace({
  tab,
  saved,
  onOpenTab,
  go = (href) => {
    globalThis.location.assign(href);
  },
}: {
  /** Leaves for another page: Make a chart's editor (T821). */
  readonly go?: (href: string) => void;
  /** The tab the address names, `/sql?tab=…` (T801, AC-446). */
  readonly tab?: string | undefined;
  /** The saved query the address names, `/sql?saved=…`, as ⌘K opens one (T815, AC-460). */
  readonly saved?: string | undefined;
  /** Names the open tab in the address, as it opens. */
  readonly onOpenTab?: ((id: string) => void) | undefined;
} = {}) {
  const me = useQuery({ ...ME_QUERY, retry: false });
  if (me.data === undefined) return me.isError ? <NotFound /> : null;
  if (hiddenWorkspacesFor(me.data).includes('sql')) return <NotFound />;
  // Whose tabs these are, as the data source page's runner keys its drafts.
  // An empty identity is none (T801's review): never one key for all such users.
  const user = me.data.identity || me.data.name;
  // With sign-in off, the one user holds every permission (AC-254). Another
  // user's tabs are another workbench's (AC-451).
  return (
    <Workbench
      key={user}
      user={user}
      tab={tab}
      saved={saved}
      onOpenTab={onOpenTab}
      superAdmin={me.data.superAdmin || me.data.security === 'off'}
      go={go}
    />
  );
}

/** Make a cube's docked pane, as Generate cubes' is: 480 px (design 17 §6). */
const MAKE_PANE = 480;

/** The browser's storage, where it has one it lets the page use. */
const browserStorage = (): Storage | undefined => {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
};

/**
 * The tabs a visit opens with (T801, AC-451, AC-446): the user's kept in
 * this browser, open on the one the address names where it is among them;
 * else a first visit's (AC-466).
 */
function openingTabs(user: string, asked: string | undefined): TabsState {
  const kept = keptTabs(browserStorage(), user);
  if (kept === null) return firstTabs();
  return kept.tabs.some((each) => each.id === asked) && asked !== undefined
    ? { ...kept, active: asked }
    : kept;
}

/**
 * An off source chosen in the picker (T798, AC-447, AC-373): the off panel,
 * as the data source's own page shows it, with Turn on… for a Super-Admin,
 * and never an editor that can run.
 */
function ChosenOff({ id, superAdmin }: { readonly id: string; readonly superAdmin: boolean }) {
  const page = useQuery({ ...sourceQuery(id), retry: false });
  if (page.isError) return <StateLine kind="err">{page.error.message}</StateLine>;
  if (page.data === undefined) return null;
  const source = page.data;
  return (
    <OffPanel
      source={{
        id: source.id,
        version: source.version,
        name: source.name,
        driver: source.driver,
        fields: source.fields,
        folderPath: source.folderPath,
        inWorkspace: source.inWorkspace,
        sqlRunner: {
          on: false,
          tab: true,
          runs: false,
          ...source.sqlRunner,
          ...source.sqlAccess,
        },
      }}
      superAdmin={superAdmin}
      turnedOff={false}
      onTurnedOn={() => undefined}
    />
  );
}

/**
 * A source chosen that runs (T802, AC-373): the open tab's editor and
 * result, once its page says who may run there and as which login. Its page
 * saying this user may no longer run SQL there shows the off panel, never
 * an editor that can run; until it is read, the split stays empty.
 */
function ChosenOn({
  row,
  tab,
  dispatch,
  grip,
  superAdmin,
  run,
}: {
  readonly row: SqlSourceRow;
  readonly tab: SqlTab;
  readonly dispatch: Dispatch<TabsAction>;
  readonly grip: ReactNode;
  readonly superAdmin: boolean;
  /** Its run's state and clock, and what holds its Run (T804). */
  readonly run: {
    readonly state: RunState;
    readonly hold: RunHold | null;
    readonly onGoTo: (id: string) => void;
    readonly insertion: Insertion | undefined;
    readonly runOnOpen: RunOnOpen | undefined;
    /** Make a cube… or Make a chart… on its result (T820). */
    readonly onMake: (kind: MakeKind, made: MadeFrom) => void;
  };
}) {
  const page = useQuery({ ...sourceQuery(row.id), retry: false, enabled: !row.cubeStore });
  const store = useQuery({ ...CUBE_STORE_QUERY, retry: false, enabled: row.cubeStore });
  const failed = row.cubeStore ? store.error : page.error;
  const source: SqlSource | undefined = row.cubeStore
    ? store.data == null
      ? undefined
      : {
          cubeStore: true,
          id: CUBE_STORE_ID,
          version: 0,
          name: 'Cube Store',
          folderPath: [],
          inWorkspace: false,
          sqlRunner: {
            on: store.data.on,
            ...(store.data.confirmedBy === undefined ? {} : { confirmedBy: store.data.confirmedBy }),
            ...(store.data.confirmedAt === undefined ? {} : { confirmedAt: store.data.confirmedAt }),
            tab: true,
            runs: store.data.runs,
          },
        }
    : page.data === undefined
      ? undefined
      : {
          id: page.data.id,
          version: page.data.version,
          name: page.data.name,
          driver: page.data.driver,
          fields: page.data.fields,
          folderPath: page.data.folderPath,
          inWorkspace: page.data.inWorkspace,
          sqlRunner: { on: false, tab: false, runs: false, ...page.data.sqlRunner, ...page.data.sqlAccess },
        };
  if (source !== undefined && source.sqlRunner.runs)
    return <QueryTab tab={tab} source={source} dispatch={dispatch} grip={grip} {...run} />;
  if (source !== undefined)
    return (
      <div className="sql-centre__off">
        <OffPanel source={source} superAdmin={superAdmin} turnedOff={false} onTurnedOn={() => undefined} />
      </div>
    );
  return (
    <>
      <div className="sql-centre__editor" data-testid="sql-editor-area">
        {failed === null ? null : <StateLine kind="err">{failed.message}</StateLine>}
      </div>
      {grip}
      <div className="sql-centre__results" data-testid="sql-results-area" />
    </>
  );
}

type Side = 'left' | 'right';

/**
 * Direction §2's three-pane workbench (T797; rule 91; design 17, screen 1
 * and state O): the picker and schema browser on the left, the tabs over the
 * editor over the results in the centre, Saved and History on the right.
 * Each side pane is dragged by its edge within its range; below 1,280 px the
 * right one, and below 1,024 the left one too, is a 40 px rail that opens
 * over the centre (design 17's Q1, (a)), one at a time.
 */
function Workbench({
  superAdmin,
  user,
  tab,
  saved,
  onOpenTab,
  go,
}: {
  readonly go: (href: string) => void;
  readonly superAdmin: boolean;
  readonly user: string;
  readonly tab: string | undefined;
  readonly saved: string | undefined;
  readonly onOpenTab: ((id: string) => void) | undefined;
}) {
  const sources = useQuery({ ...SQL_SOURCES_QUERY, retry: false });
  /** The editor tabs, each bound to one data source (T800, AC-450). */
  // Held outside React, so a run going lands in its tab while the user is
  // away, and shows on their return (T804, AC-452).
  const [store] = useState(() => tabsStoreFor(user, () => openingTabs(user, tab)));
  const tabs = useSyncExternalStore(store.subscribe, store.get);
  const dispatch = store.dispatch;
  useEffect(() => {
    holdTabs(user, store);
    return () => {
      releaseTabs(user, store);
    };
  }, [user, store]);
  // Kept from before, and the address names a tab: that one opens (AC-446).
  useEffect(() => {
    if (tab !== undefined) store.dispatch({ kind: 'select', id: tab });
    // On opening only, as the address is read once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const runningTab = tabs.tabs.find((each) => each.run?.kind === 'running');
  /**
   * A run kept from a page since left (T804, AC-452): going while wechart's
   * server says the user's run goes on its source; once not, ended, as
   * History says. Its answer came to that page, so its rows aren't here.
   */
  const keptRun =
    runningTab?.run?.kind === 'running' && runningTab.run.kept !== undefined ? runningTab : undefined;
  const keptSince = keptRun?.run?.kind === 'running' ? keptRun.run.kept : undefined;
  /**
   * The user's run going outside these tabs, or their last still finishing
   * in Cube Store; asked every 3 seconds while a kept run is followed, a
   * failed ask included (T804's review).
   */
  const going = useQuery({
    ...GOING_QUERY,
    retry: false,
    refetchInterval: (query) => (keptSince !== undefined ? 3_000 : GOING_QUERY.refetchInterval(query)),
  });
  // Asked at once for a run kept since what was last heard: Back to a kept page.
  const askGoing = going.refetch;
  useEffect(() => {
    if (keptSince !== undefined) void askGoing();
  }, [keptSince, askGoing]);
  /** One clock for the tab and its result head, ticking while a run goes (AC-452). */
  const [now, setNow] = useState(() => Date.now());
  const ticking = runningTab !== undefined;
  useEffect(() => {
    // Until its first tick, a clock from before the run reads 0 s.
    if (!ticking) return undefined;
    const every = setInterval(() => {
      setNow(Date.now());
    }, 1_000);
    return () => {
      clearInterval(every);
    };
  }, [ticking]);
  const goingOn =
    going.data != null &&
    going.data.stopping !== true &&
    (keptRun?.sourceId === CUBE_STORE_ID
      ? going.data.cubeStore === true
      : going.data.dataSource?.id === keptRun?.sourceId);
  // Heard since it was kept, and not going: it ended.
  const keptEnded =
    keptSince !== undefined && going.isSuccess && going.dataUpdatedAt > keptSince && !going.isFetching && !goingOn;
  /** Cube Store runs a stopped query on: where xcube says so, the kept run's end says so too. */
  const stillFinishing = going.data?.stopping === true ? { endsBy: going.data.endsBy ?? null } : null;
  useEffect(() => {
    if (!keptEnded || keptRun?.run?.kind !== 'running') return undefined;
    const { id, sourceId, lastRunSql } = keptRun;
    const at = keptRun.run.at;
    let gone = false;
    void endedAway(keptRun, at, stillFinishing).then((outcome) => {
      if (gone) return;
      dispatch({
        kind: 'run-done',
        id,
        sourceId,
        sql: lastRunSql ?? '',
        at,
        outcome,
        answeredAt: Date.now(),
        away: true,
      });
    });
    return () => {
      gone = true;
    };
    // Once per kept run, as it is found ended.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keptEnded, keptRun?.id]);
  /** A tab's run's state, as its tab, its result head and History name it. */
  const stateOf = (each: SqlTab) => {
    const run = each.run;
    // Heard since its answer: Cube Store's run on has ended (T548).
    const ended =
      run?.kind === 'done' &&
      going.dataUpdatedAt > (run.answeredAt ?? 0) &&
      going.data?.stopping !== true;
    return runState(run, now, !ended);
  };
  // Kept in this browser, for this user, as they change (T801, AC-451).
  useEffect(() => {
    keepTabs(browserStorage(), user, tabs);
  }, [user, tabs]);
  // The open tab named in the address (AC-446).
  const naming = useRef(onOpenTab);
  useEffect(() => {
    naming.current = onOpenTab;
  }, [onOpenTab]);
  useEffect(() => {
    naming.current?.(tabs.active);
  }, [tabs.active]);
  const openTab = tabs.tabs.find((tab) => tab.id === tabs.active) ?? tabs.tabs[0];
  /** The open tab's data source, which the picker shows and chooses. */
  const chosen = openTab?.sourceId ?? '';
  const chosenRow = sources.data?.find((row) => row.id === chosen);
  /**
   * What holds the open tab's Run (AC-452, AC-379): another tab's run; else
   * one wechart's server says goes outside the tabs, or still finishes in
   * Cube Store. A tab's own run, just ended, isn't one (lane SQL's call).
   */
  const runningRow = sources.data?.find((row) => row.id === runningTab?.sourceId);
  const goingAfter = Math.max(
    0,
    ...tabs.tabs.map((each) => (each.run?.kind === 'done' ? (each.run.answeredAt ?? 0) : 0)),
  );
  const hold: RunHold | null =
    runningTab !== undefined
      ? runningTab.id === openTab?.id || runningTab.run?.kind !== 'running'
        ? null
        : {
            kind: 'tab',
            tabId: runningTab.id,
            sourceName: runningRow?.name ?? 'a data source',
            startedAt: runningTab.run.at,
            cubeStore: runningRow?.cubeStore === true,
          }
      : going.data != null && going.dataUpdatedAt > goingAfter
        ? { kind: 'elsewhere', going: going.data }
        : null;
  /**
   * Whether to ask them to choose one (AC-466, H1) rather than say none runs
   * SQL for them (H2): a source listed on, or their own; and for a
   * Super-Admin, any listed, since they may turn one on. H2 is a member's
   * (T799's review; lane SQL's call, overturnable).
   */
  const runsAny =
    sources.data?.some((row) => row.runner !== 'off' || superAdmin) === true;
  /**
   * A saved query opened (T813, T814): on its own source where the user
   * still has it; else none, never named (AC-459), the API saying none where
   * they may not run SQL on it. A tab already holding it is selected, and
   * loses its source if the user may no longer run SQL there (T814's review).
   */
  const openSaved = (query: SavedQuery) => {
    const own = query.sourceId;
    const runs = (id: string) => sources.data?.some((row) => row.id === id && row.runner !== 'off') === true;
    const has = own !== null && sources.data?.some((row) => row.id === own) === true;
    const holding = tabs.tabs.find((each) => each.saved?.id === query.id);
    const lose = !has && holding !== undefined && holding.sourceId !== '' && !runs(holding.sourceId);
    dispatch({ kind: 'open-saved', query, sourceId: has ? own : '', ...(lose ? { lose: true as const } : {}) });
  };
  /** What a History row replaced in a tab, for the toast's Undo (T818, AC-465). */
  const [replaced, setReplaced] = useState<{
    readonly tabId: string;
    readonly sql: string;
    readonly params: Readonly<Record<string, string>>;
    readonly paramTypes?: Readonly<Record<string, ParamType>>;
  } | null>(null);
  /**
   * A History row chosen (T818, AC-465; design 17, J): its SQL and values
   * into the open tab, with Undo, where the row's source is that tab's;
   * else into a new tab on the row's source, or on none where the user can
   * no longer run SQL on it (AC-381). Nothing runs.
   */
  const putBack = (run: HistoryRun) => {
    const params = Object.fromEntries(run.parameters.map((each) => [each.name, each.value]));
    const typed = run.parameters.filter((each) => each.type !== 'text');
    const paramTypes =
      typed.length === 0 ? undefined : Object.fromEntries(typed.map((each) => [each.name, each.type]));
    const own = run.unavailable === true ? '' : run.cubeStore ? CUBE_STORE_ID : (run.dataSource?.id ?? '');
    // One the user may still run SQL on: a row read before its source went off names it still (T818's review).
    const rowSource =
      own !== '' && sources.data?.some((row) => row.id === own && row.runner !== 'off') === true ? own : '';
    if (openTab !== undefined && rowSource !== '' && openTab.sourceId === rowSource) {
      setReplaced({
        tabId: openTab.id,
        sql: openTab.sql,
        params: openTab.params,
        ...(openTab.paramTypes === undefined ? {} : { paramTypes: openTab.paramTypes }),
      });
      dispatch({ kind: 'put-back', id: openTab.id, sql: run.sql, params, ...(paramTypes === undefined ? {} : { paramTypes }) });
    } else {
      dispatch({
        kind: 'open',
        sourceId: rowSource,
        sql: run.sql,
        name: `From History · ${clockOf(new Date(run.startedAt))}`,
        params,
        ...(paramTypes === undefined ? {} : { paramTypes }),
      });
    }
    setOpen(null);
  };
  /**
   * The saved query the address names, as ⌘K opens one (T815, AC-460):
   * opened once, when it and the sources are read, as the Saved tab's Open
   * opens it. One the API doesn't answer, another's included, opens nothing.
   */
  const named = useQuery({ ...savedQueryById(saved ?? ''), retry: false, enabled: saved !== undefined });
  const openedNamed = useRef(false);
  useEffect(() => {
    if (openedNamed.current || named.data === undefined || sources.data === undefined) return;
    openedNamed.current = true;
    openSaved(named.data);
    // Once, as the address is read once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [named.data, sources.data]);
  const ids = useId();
  const picker = useRef<HTMLButtonElement>(null);
  const leftRail = useRef<HTMLButtonElement>(null);
  const [left, setLeft] = useState<number>(LEFT_PANE.start);
  const [right, setRight] = useState<number>(RIGHT_PANE.start);
  const [share, setShare] = useState<number>(SPLIT.editor);
  /** A name chosen in the schema browser, for the tab open as it was chosen (T805). */
  const [insertion, setInsertion] = useState<Insertion | undefined>(undefined);
  /** A tab opened by Preview 100 rows, to run as it opens (T807, AC-449). */
  const [runOnOpen, setRunOnOpen] = useState<RunOnOpen | undefined>(undefined);
  const [open, setOpen] = useState<Side | null>(null);
  /** What the right pane shows: Saved, first, or History (T817). */
  const [rightShows, setRightShows] = useState<'saved' | 'history'>('saved');
  const leftFolded = useWindowMatches(LEFT_RAIL_QUERY);
  const rightFolded = useWindowMatches(RIGHT_RAIL_QUERY);
  const workspace = useRef<HTMLElement>(null);
  /** ⌘/Ctrl+S anywhere in the workspace saves the open tab's query (T816, AC-455). */
  const saveKeys = useSaveKeyScope();
  useEffect(() => {
    const element = workspace.current;
    const onKeyDown = saveKeys.onKeyDown;
    element?.addEventListener('keydown', onKeyDown);
    return () => {
      element?.removeEventListener('keydown', onKeyDown);
    };
  }, [saveKeys.onKeyDown]);
  const below = useRef<HTMLDivElement>(null);
  const split = useRef<{ readonly y: number; readonly from: number } | null>(null);
  const leftShown = leftFolded ? LEFT_PANE.rail : left;

  // A first visit: focus on the picker (AC-466; design 17, H1), or, where
  // the left pane is a rail, on the rail's button that opens it.
  useEffect(() => {
    (leftFolded ? leftRail : picker).current?.focus();
    // On opening only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  /** Make a cube… or Make a chart… open, on a run of a tab (T820, AC-462): the pane in the right pane's place. */
  const [making, setMaking] = useState<{
    readonly kind: MakeKind;
    readonly row: SqlSourceRow;
    readonly sql: string;
    readonly columns: readonly SqlColumn[];
    readonly parameters: readonly RunParameter[];
    readonly tabName: string;
    /** The tab it was made from, for the chart editor's way back (T821). */
    readonly tabId: string;
    /** Each choice of Make a cube… opens a fresh pane, on that run (T820's review). */
    readonly opened: number;
  } | null>(null);
  /** What was last added, said until dismissed (design 17 §6); and why a chart wasn't made over it. */
  const [made, setMade] = useState<(Added & { readonly failed?: string }) | null>(null);
  const rightShown = making !== null ? MAKE_PANE : rightFolded ? RIGHT_PANE.rail : right;

  // A pane opened over the centre, then unfolded by a wider window: closed,
  // so it doesn't come back open, and take focus, when the window narrows
  // again (T797's review). Set as it renders, as React's "adjusting state
  // when a prop changes" does.
  if ((open === 'left' && !leftFolded) || (open === 'right' && !rightFolded)) setOpen(null);

  /** The room a pane has beside the other and the editor's 560 px; any, until measured. */
  const roomBeside = (other: number) => {
    const width = workspace.current?.getBoundingClientRect().width ?? 0;
    return width > 0 ? roomFor(width, other) : Infinity;
  };
  /** The editor and results' height, below the tabs. */
  const splitHeight = () => below.current?.getBoundingClientRect().height ?? 0;
  const endSplit = () => {
    split.current = null;
  };

  /** The split's grip, between the editor and the results. */
  const grip = (
    <span
      className="sql-centre__grip"
      title="Drag to resize · double-click to reset"
      aria-hidden="true"
      onPointerDown={(event) => {
        split.current = { y: event.clientY, from: share * splitHeight() };
        event.currentTarget.setPointerCapture?.(event.pointerId);
      }}
      onPointerMove={(event) => {
        const from = split.current;
        if (from === null) return;
        setShare(editorShare(from.from + (event.clientY - from.y), splitHeight()));
      }}
      onPointerUp={endSplit}
      onPointerCancel={endSplit}
      onLostPointerCapture={endSplit}
      onDoubleClick={() => {
        setShare(SPLIT.editor);
      }}
    />
  );

  const style = {
    '--sql-left': `${String(leftShown)}px`,
    '--sql-right': `${String(rightShown)}px`,
  } as CSSProperties;
  return (
    <section
      ref={workspace}
      className="sql-workspace"
      aria-labelledby="sql-workspace-title"
      style={style}
    >
      {/* Design 17 draws no title over the panes; the page still has its heading. */}
      <h1 id="sql-workspace-title" className="visually-hidden">
        SQL runner
      </h1>
      <SaveKeyContext.Provider value={saveKeys.slot}>
      <SidePane
        side="left"
        label="Data source and schema"
        railRef={leftRail}
        folded={leftFolded}
        open={leftFolded && open === 'left'}
        width={left}
        onResize={(width) => {
          setLeft(paneWidth(LEFT_PANE, width, roomBeside(rightShown)));
        }}
        onOpen={(opened) => {
          setOpen(opened ? 'left' : null);
        }}
      >
        <h2 className="sql-pane__head">Data source</h2>
        <div className="sql-pane__section">
          {sources.isError ? (
            <StateLine kind="err">{sources.error.message}</StateLine>
          ) : (
            <SourcePicker
              rows={sources.data ?? []}
              value={chosen}
              onChoose={(sourceId) => {
                dispatch({ kind: 'source', id: tabs.active, sourceId });
              }}
              buttonRef={picker}
            />
          )}
        </div>
        <h2 className="sql-pane__head">Schema</h2>
        <div className="sql-pane__section">
          {/* The open tab's own source's (T805, AC-386); a name chosen goes into that tab. */}
          <SchemaTree
            row={chosenRow}
            onChoose={(name) => {
              setInsertion({ text: name, tabId: tabs.active });
            }}
            onPreview={(sql, table) => {
              // Preview 100 rows: a new tab on this source, holding its SELECT, run as it opens (T807).
              if (chosenRow === undefined) return;
              const id = newTabId();
              dispatch({ kind: 'open', id, sourceId: chosenRow.id, sql, name: table.name });
              setRunOnOpen({ tabId: id });
            }}
          />
        </div>
      </SidePane>
      <div
        className="sql-centre"
        data-testid="sql-centre"
        style={{ '--sql-editor': `${String(Math.round(share * 1000) / 10)}%` } as CSSProperties}
      >
        <div className="sql-centre__tabs" data-testid="sql-tabs-area">
          <TabStrip
            state={tabs}
            dispatch={dispatch}
            sourceName={(id) => sources.data?.find((row) => row.id === id)?.name}
            stateOf={(each) => {
              const { kind, label, rows } = stateOf(each);
              return { kind, label: rows === null ? label : `${label}, ${rows}` };
            }}
            tabId={(id) => `${ids}-tab-${id}`}
            panelId={(id) => `${ids}-panel-${id}`}
          />
        </div>
        {/* The split is of what lies below the tabs (T797's review): the open tab's panel. */}
        <div
          ref={below}
          className="sql-centre__split"
          role="tabpanel"
          id={`${ids}-panel-${tabs.active}`}
          aria-labelledby={`${ids}-tab-${tabs.active}`}
        >
          {chosenRow?.runner === 'off' ? (
            // In the editor's place: nothing here runs (design 17, B2).
            <div className="sql-centre__off">
              <ChosenOff id={chosenRow.id} superAdmin={superAdmin} />
            </div>
          ) : chosenRow !== undefined && openTab !== undefined ? (
            // The open tab's editor and result, on its own source (T802).
            <ChosenOn
              key={`${openTab.id} ${chosenRow.id}`}
              row={chosenRow}
              tab={openTab}
              dispatch={dispatch}
              grip={grip}
              superAdmin={superAdmin}
              run={{
                state: stateOf(openTab),
                hold,
                onGoTo: (id) => {
                  dispatch({ kind: 'select', id });
                },
                insertion,
                runOnOpen,
                onMake: (kind, { sql, columns, parameters }) => {
                  setMade(null);
                  setMaking((was) => ({
                    kind,
                    row: chosenRow,
                    sql,
                    columns,
                    parameters,
                    tabName: openTab.name,
                    tabId: openTab.id,
                    opened: (was?.opened ?? 0) + 1,
                  }));
                },
              }}
            />
          ) : (
            <>
              <div className="sql-centre__editor" data-testid="sql-editor-area">
                {sources.data === undefined ? null : openTab?.sourceLost === true ? (
                  <ChooseASource lost />
                ) : runsAny ? (
                  <ChooseASource />
                ) : (
                  <NoSourceToRun />
                )}
              </div>
              {grip}
              <div className="sql-centre__results" data-testid="sql-results-area" />
            </>
          )}
        </div>
      </div>
      {making !== null ? (
        // Docked in the right pane's place, 480 px, as Generate cubes' pane is (T820; design 17 §6).
        <MakeCubePane
          key={making.opened}
          kind={making.kind}
          source={making.row}
          sql={making.sql}
          parameters={making.parameters}
          columns={making.columns}
          suggested={making.tabName}
          onClose={() => {
            setMaking(null);
          }}
          onAdded={(added) => {
            const from = making.tabId;
            setMaking(null);
            if (added.kind === 'cube') {
              setMade(added);
              return;
            }
            // Make a chart: a new chart over the cube, in My workspace, opened in the editor (T821, AC-463).
            makeChartOver({ cube: added.name, targetFolderId: added.targetFolderId, tabId: from }).then(
              go,
              (error: unknown) => {
                setMade({ ...added, failed: error instanceof Error ? error.message : String(error) });
              },
            );
          }}
        />
      ) : (
      <SidePane
        side="right"
        label="Saved and History"
        folded={rightFolded}
        open={rightFolded && open === 'right'}
        width={right}
        onResize={(width) => {
          setRight(paneWidth(RIGHT_PANE, width, roomBeside(leftShown)));
        }}
        onOpen={(opened) => {
          setOpen(opened ? 'right' : null);
        }}
      >
        <h2 className="sql-pane__head">Saved and History</h2>
        {/* Saved (T813, AC-458) or History (T817, AC-381), one at a time, as design 17 draws them. */}
        <div className="seg sql-pane__switch" role="group" aria-label="Saved or History">
          {(
            [
              ['saved', 'Saved'],
              ['history', 'History'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={rightShows === value}
              className={rightShows === value ? 'is-on' : undefined}
              onClick={() => {
                setRightShows(value);
              }}
            >
              {label}
            </button>
          ))}
        </div>
        {rightShows === 'saved' ? (
          <SavedList
            sourceOf={(id) => sources.data?.find((row) => row.id === id)}
            onOpen={(query) => {
              openSaved(query);
              setOpen(null);
            }}
            onRenamed={(savedId, name) => {
              dispatch({ kind: 'saved-renamed', savedId, name });
            }}
          />
        ) : (
          <HistoryList
            sourceId={chosen}
            stillFinishing={stillFinishing}
            onChoose={putBack}
            // The run going, in the state its tab shows (AC-452).
            going={
              runningTab?.run?.kind === 'running'
                ? {
                    sql: runningTab.lastRunSql ?? '',
                    sourceId: runningTab.sourceId,
                    at: runningTab.run.at,
                    state: stateOf(runningTab),
                    place:
                      runningRow === undefined
                        ? 'a data source'
                        : runningRow.cubeStore
                          ? 'Cube Store'
                          : `${runningRow.name} · ${placeOf(runningRow)}`,
                  }
                : undefined
            }
          />
        )}
      </SidePane>
      )}
      </SaveKeyContext.Provider>
      {made === null ? null : (
        // Said until dismissed: a draft, in My workspace (design 17 §6).
        <div className="undo-toast sql-made" role="status" data-testid="sql-made">
          <span>
            {made.name} is in My workspace, unpublished ·{' '}
            <a href={fileHref(made.path, 'mine')}>Open in Model</a>
            {made.failed === undefined ? null : ` · ${made.failed}`}          </span>
          <button
            type="button"
            onClick={() => {
              setMade(null);
            }}
          >
            Dismiss
          </button>
        </div>
      )}
      {/* A History row put into a tab, with Undo (T818, AC-465; design 17, J). */}
      <UndoToast
        message={replaced === null ? '' : 'Put back from History into this tab.'}
        onUndo={() => {
          if (replaced === null) return;
          dispatch({
            kind: 'put-back',
            id: replaced.tabId,
            sql: replaced.sql,
            params: replaced.params,
            ...(replaced.paramTypes === undefined ? {} : { paramTypes: replaced.paramTypes }),
          });
          setReplaced(null);
        }}
        onDismiss={() => {
          setReplaced(null);
        }}
      />
    </section>
  );
}

/**
 * A side pane: its body, and the edge that resizes it; folded, a rail whose
 * button opens the body over the centre. Opened, focus goes into it, and
 * Esc closes it and hands focus back to the button (rule 85).
 */
function SidePane({
  side,
  label,
  folded,
  open,
  width,
  onResize,
  onOpen,
  children,
  railRef,
}: {
  readonly side: Side;
  readonly label: string;
  /** Its rail's button, for the workspace to put focus on. */
  readonly railRef?: RefObject<HTMLButtonElement | null>;
  readonly folded: boolean;
  readonly open: boolean;
  readonly width: number;
  readonly onResize: (width: number) => void;
  readonly onOpen: (open: boolean) => void;
  readonly children: ReactNode;
}) {
  const body = useRef<HTMLDivElement>(null);
  const own = useRef<HTMLButtonElement>(null);
  const rail = railRef ?? own;
  const dragged = useRef<{ readonly x: number; readonly from: number } | null>(null);
  const start = side === 'left' ? LEFT_PANE.start : RIGHT_PANE.start;
  // Opened from its rail: focus into it once it shows, so Tab goes on from there.
  const closing = useRef(onOpen);
  useEffect(() => {
    closing.current = onOpen;
  }, [onOpen]);
  useEffect(() => {
    if (!open) return undefined;
    body.current?.focus();
    // Its own Escape only, from within it: another popover's is that one's.
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !body.current?.contains(event.target as Node)) return;
      closing.current(false);
      rail.current?.focus();
    };
    // A press outside it and its rail, in the editor say: closed, never left
    // over the centre (T797's review), as the narrow menu does.
    const onPress = (event: PointerEvent) => {
      const target = event.target as Node;
      if (body.current?.contains(target) || rail.current?.contains(target)) return;
      closing.current(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPress);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPress);
    };
  }, [open, rail]);
  const endDrag = () => {
    dragged.current = null;
  };
  return (
    <aside
      className={`sql-pane sql-pane--${side}`}
      aria-label={label}
      data-folded={String(folded)}
      data-open={String(open)}
    >
      <div className="sql-pane__rail">
        <button
          ref={rail}
          type="button"
          aria-label={label}
          title={label}
          aria-expanded={open}
          onClick={() => {
            onOpen(!open);
          }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            {side === 'left' ? (
              <path d="M6 3l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.5" />
            ) : (
              <path d="M10 3L5 8l5 5" fill="none" stroke="currentColor" strokeWidth="1.5" />
            )}
          </svg>
        </button>
      </div>
      <div ref={body} className="sql-pane__body" tabIndex={-1}>
        {children}
      </div>
      <span
        className="sql-pane__grip"
        title="Drag to resize · double-click to reset"
        aria-hidden="true"
        onPointerDown={(event) => {
          dragged.current = { x: event.clientX, from: width };
          event.currentTarget.setPointerCapture?.(event.pointerId);
        }}
        onPointerMove={(event) => {
          const from = dragged.current;
          if (from === null) return;
          const dx = event.clientX - from.x;
          onResize(side === 'left' ? from.from + dx : from.from - dx);
        }}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onLostPointerCapture={endDrag}
        onDoubleClick={() => {
          onResize(start);
        }}
      />
    </aside>
  );
}
