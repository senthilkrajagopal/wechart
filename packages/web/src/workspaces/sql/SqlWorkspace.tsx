import { useQuery } from '@tanstack/react-query';
import {
  useEffect,
  useId,
  useReducer,
  useRef,
  useState,
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
import { SQL_SOURCES_QUERY } from './sources';
import { SourcePicker } from './SourcePicker';
import { CUBE_STORE_ID, CUBE_STORE_QUERY } from '../data-sources/cubeStore';
import { QueryTab } from './QueryTab';
import type { SqlSourceRow } from './sources';
import type { SqlSource } from './sqlSource';
import { firstTabs, tabsReducer, type SqlTab, type TabsAction, type TabsState } from './tabs';
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
  onOpenTab,
}: {
  /** The tab the address names, `/sql?tab=…` (T801, AC-446). */
  readonly tab?: string | undefined;
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
      onOpenTab={onOpenTab}
      superAdmin={me.data.superAdmin || me.data.security === 'off'}
    />
  );
}

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
}: {
  readonly row: SqlSourceRow;
  readonly tab: SqlTab;
  readonly dispatch: Dispatch<TabsAction>;
  readonly grip: ReactNode;
  readonly superAdmin: boolean;
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
    return <QueryTab tab={tab} source={source} dispatch={dispatch} grip={grip} />;
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
  onOpenTab,
}: {
  readonly superAdmin: boolean;
  readonly user: string;
  readonly tab: string | undefined;
  readonly onOpenTab: ((id: string) => void) | undefined;
}) {
  const sources = useQuery({ ...SQL_SOURCES_QUERY, retry: false });
  /** The editor tabs, each bound to one data source (T800, AC-450). */
  const [tabs, dispatch] = useReducer(
    (state: TabsState, action: TabsAction) => tabsReducer(state, action),
    undefined,
    () => openingTabs(user, tab),
  );
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
   * Whether to ask them to choose one (AC-466, H1) rather than say none runs
   * SQL for them (H2): a source listed on, or their own; and for a
   * Super-Admin, any listed, since they may turn one on. H2 is a member's
   * (T799's review; lane SQL's call, overturnable).
   */
  const runsAny =
    sources.data?.some((row) => row.runner !== 'off' || superAdmin) === true;
  const ids = useId();
  const picker = useRef<HTMLButtonElement>(null);
  const leftRail = useRef<HTMLButtonElement>(null);
  const [left, setLeft] = useState<number>(LEFT_PANE.start);
  const [right, setRight] = useState<number>(RIGHT_PANE.start);
  const [share, setShare] = useState<number>(SPLIT.editor);
  const [open, setOpen] = useState<Side | null>(null);
  const leftFolded = useWindowMatches(LEFT_RAIL_QUERY);
  const rightFolded = useWindowMatches(RIGHT_RAIL_QUERY);
  const workspace = useRef<HTMLElement>(null);
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
  const rightShown = rightFolded ? RIGHT_PANE.rail : right;

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
            />
          ) : (
            <>
              <div className="sql-centre__editor" data-testid="sql-editor-area">
                {sources.data === undefined ? null : runsAny ? <ChooseASource /> : <NoSourceToRun />}
              </div>
              {grip}
              <div className="sql-centre__results" data-testid="sql-results-area" />
            </>
          )}
        </div>
      </div>
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
      </SidePane>
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
