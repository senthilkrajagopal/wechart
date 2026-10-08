import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';

import { ExportedToast } from '../../dashboard/export/ExportedToast';
import { useNarrowWindow } from '../../dashboard/useNarrowWindow';
import { missingScopeOf, ScopeUnavailable, useScopes } from '../../query/scopes';
import { StateLine, type StateKind } from '../../shell/StatusIcon';
import { TableScroll } from '../../shell/TableScroll';
import { rollupHref } from '../model/inFolder';
import {
  announced,
  BuildOutcomeStatus,
  BuiltWhen,
  partitionsOf,
  periodOf,
  StarterLabel,
  stepRows,
  type BuildSummary,
  type Starter,
} from './builds';
import { OwnerIcon } from '../schedules/OwnerLabel';
import { ActionIcon } from './ActionIcon';
import { readWechartSchedules, WECHART_SCHEDULES_KEY } from '../schedules/wechart';
import {
  failedAtOf,
  Partitions,
  partitionsLineOf,
  partitionsQueryOf,
  type Started,
} from './Partitions';
import {
  EVERY_FOLDER,
  FolderFilter,
  inFolder,
  ScopeNote,
  useJobsFolders,
  type FolderChoice,
} from './FolderFilter';
import {
  ACCESS_LOST,
  ListEmpty,
  ListError,
  ListLoading,
  NoFolderLeft,
  noFolderLeft,
  readErrorOf,
} from './ListStates';
import { ChoicePill } from './Pill';
import {
  focusAfterClose,
  narrowNow,
  SheetFootContext,
  SheetTrap,
  useFootHeight,
  useSheetEscape,
} from './Sheet';
import { Status } from './StateBadge';

/**
 * Building a pre-aggregation (T155, AC-149), as the prototype's Jobs page lists
 * them: every pre-aggregation Cube compiled, each with Build. A build is
 * Cube's own job — started through its jobs API, one token per partition —
 * and each token is followed until it reports a state it will not leave.
 *
 * Its pane (T375; design 16, screen 1): its partitions, rebuilt by the
 * selected ones or all (AC-145), and the builds started from wechart, with
 * the way to all of them in Run history. A build's tokens are in Queue and
 * in Run history's log (T374, T376).
 */
interface Buildable {
  /** Its published name, `cube.preAggregation`, which a build names. */
  readonly id: string;
  /** Its cube's folder and short name (T371): what people see (§P2.6 D). */
  readonly folderId?: string | null;
  readonly shortName?: string;
  readonly folderPath?: readonly string[];
  readonly type: string;
  readonly partitionGranularity?: string;
  /** What rebuilds it, in words: its refresh key (AC-229), as Schedules says it (T551). */
  readonly trigger?: string;
  /** Its kind: "Not scheduled" has its icon (design 16, pin 8). */
  readonly triggerKind?: string;
  /** The model file its cube is defined in (AC-229). */
  readonly fileName?: string;
  /** That file's folder, where it isn't the root (T530). */
  readonly fileFolderId?: string;
  /** A lambda or a rollup join: nothing of its own to build (T375, A3). */
  readonly buildable?: false;
  /**
   * Its row's state (T550, AC-391): the state of its partitions that most
   * needs attention, and the partition it is of (none, whole); how many are
   * built when partly; how many it has (none, not partitioned); when Cube
   * made its newest version; and who started that build from wechart (none,
   * wechart didn't). None known without xcube's routes.
   */
  readonly state?: RowState | null;
  readonly stateAt?: string | null;
  readonly built?: number;
  readonly partitions?: number | null;
  readonly lastBuiltAt?: string | null;
  readonly startedBy?: Starter | null;
  /** Cube is still working its partitions out (A4). */
  readonly pending?: boolean;
  /** xcube couldn't say its state: its words (T550's review). */
  readonly unreadable?: string;
}
type RowState = 'failed' | 'building' | 'queued' | 'stalled' | 'partly' | 'not-built' | 'built';
/** A state the Status filter chooses (T558): any of a row's, most needing attention first. */
export type StatusChoice = RowState;

/** The list's columns, as screen 1 heads them; those that move into the sheet below 1,024 px (G8). */
const PREAGG_COLUMNS = [
  'Pre-aggregation',
  'Folder',
  'Status',
  'Last built',
  'Started by',
  'Trigger',
  'Partitions',
];
const PREAGG_NARROW = ['Last built', 'Started by', 'Trigger', 'Partitions'];

/**
 * Design 16's Status filter (s1-filters), Any or one of AC-391's states, in
 * its order (T558; the user's answer, R66): Jobs' summary opens it on Failed.
 */
export const ROW_STATUSES: readonly (readonly [StatusChoice, string])[] = [
  ['failed', 'Failed'],
  ['building', 'Building'],
  ['queued', 'Queued'],
  ['stalled', 'Stalled'],
  ['partly', 'Partly built'],
  ['not-built', 'Not built'],
  ['built', 'Built'],
];

/**
 * How a pre-aggregation is shown (T371; §P2.6 D): a folder's cube by its
 * short name, `sales.main`, with its folder, never its prefixed name; the
 * root's as it always was.
 */
export function shownOf(row: {
  readonly id: string;
  readonly shortName?: string;
  readonly folderPath?: readonly string[];
}): { name: string; folder?: string } {
  const own = row.id.slice(row.id.lastIndexOf('.') + 1);
  const name = row.shortName === undefined ? row.id : `${row.shortName}.${own}`;
  const below = row.folderPath?.[0] === 'Shared' ? row.folderPath.slice(1) : [];
  return below.length === 0 ? { name } : { name, folder: below.join(' / ') };
}

/**
 * The file where a pre-aggregation is defined (AC-229), open on its cube's
 * Pre-aggs tab with this pre-aggregation open (T469, UX-080): the cube by the
 * name its file declares — a folder's by its short name, not its prefixed
 * published one — and the member by its own; a folder's file in its folder
 * (T530, AC-222).
 */
function memberHref(row: Buildable & { readonly fileName: string }): string {
  const dot = row.id.lastIndexOf('.');
  return rollupHref({
    fileName: row.fileName,
    fileFolderId: row.fileFolderId,
    cube: row.shortName ?? row.id.slice(0, dot),
    member: row.id.slice(dot + 1),
  })!;
}

/** The list, or Jobs' tab where none is listed: focus, once a sheet with no row to go back to closes (T640). */
const TO_THE_LIST = [
  '.build-panel [role="region"][aria-label="Pre-aggregations"]',
  '[role="tab"][aria-selected="true"]',
] as const;

/** States a build is under way in: the row is read again soon (AC-229). */
const UNDER_WAY = new Set(['building', 'queued', 'stalled']);
/** How often the list is read with nothing started here under way: others' builds go on. */
const NOW_AND_THEN_MS = 30_000;
/** How often while Cube still works a rollup's partitions out (A4). */
const PENDING_MS = 5_000;
/** How long a start is awaited in its row before it's read only now and then. */
const AWAITED_MS = 60_000;

/**
 * A pre-aggregation's state as its row and pane show it (T550, AC-391;
 * design 16, pin 5 and its legend): the state of its partitions that most
 * needs attention, with the partition it is of, as an icon and words.
 */
function RowStatus({
  row,
  testId,
  more = '',
}: {
  row: Buildable;
  testId: string;
  /** More of it, as the pane says it: when it failed (T611; pin 13). */
  more?: string;
}) {
  const { kind, label, state, title } = stateOf(row);
  return kind === null ? (
    <span className="muted" data-testid={testId}>
      {label}
    </span>
  ) : (
    <Status
      kind={kind}
      label={`${label}${more}`}
      testId={testId}
      {...(state === undefined ? {} : { state })}
      {...(title === undefined ? {} : { title })}
    />
  );
}

/** A row's state in words with its icon: what RowStatus draws, and its row's name says (T611). */
function stateOf(row: Buildable): {
  kind: StateKind | null;
  label: string;
  state?: string;
  title?: string;
} {
  const at =
    row.stateAt === undefined
      ? ''
      : row.stateAt === null
        ? ' · whole'
        : ` · ${periodOf(row.stateAt, row.partitionGranularity ?? null)}`;
  switch (row.state) {
    case 'failed':
      return { kind: 'err', label: `Failed${at}`, state: 'failed' };
    // A whole one's building, queued or stall says no period (screen 1).
    case 'building':
      return { kind: 'run', label: `Building${row.stateAt === null ? '' : at}`, state: 'building' };
    case 'queued':
      return { kind: 'idle', label: `Queued${row.stateAt === null ? '' : at}`, state: 'queued' };
    case 'stalled':
      return { kind: 'warn', label: `Stalled${row.stateAt === null ? '' : at}`, state: 'stalled' };
    case 'partly':
      return {
        kind: 'part',
        label: `Partly built · ${String(row.built ?? 0)} of ${String(row.partitions ?? 0)}`,
        state: 'partly',
      };
    case 'not-built':
      return { kind: 'off', label: 'Not built', state: 'not-built' };
    case 'built':
      return { kind: 'ok', label: 'Built', state: 'built' };
    default:
      // Made of other rollups (A3); or Cube still working its partitions out
      // (A4), never read as not built; or, with xcube's routes not there, nothing known.
      return row.buildable === false
        ? { kind: null, label: 'No partitions of its own' }
        : row.unreadable !== undefined
          ? // xcube couldn't say: its words on hover; the row and building from its pane stay.
            {
              kind: 'warn',
              label: 'Couldn’t read its state',
              state: 'unreadable',
              title: row.unreadable,
            }
          : row.pending === true
            ? { kind: 'run', label: 'Asking Cube…', state: 'pending' }
            : { kind: null, label: '—' };
  }
}

/**
 * The pane's facts (design 16, screen 1 pin 13; T611): its state, with when
 * it failed; its partitions in a line; its trigger, its refresh key; the
 * wechart schedules that also rebuild it, each opening on Schedules; and its
 * model, read-only in its folder.
 */
function PaneFacts({ row }: { row: Buildable }) {
  const partitions = useQuery(partitionsQueryOf(row.id));
  const schedules = useQuery({ queryKey: WECHART_SCHEDULES_KEY, queryFn: readWechartSchedules });
  const failedAt =
    row.state === 'failed' && partitions.data !== undefined
      ? failedAtOf(partitions.data)
      : undefined;
  const line = partitions.data === undefined ? undefined : partitionsLineOf(partitions.data);
  const also = (schedules.data ?? []).filter((each) => each.preAggregation === row.id);
  const shown = shownOf(row);
  return (
    <dl className="admin-pane__facts" role="group" aria-label="Facts">
      <dt>Status</dt>
      <dd>
        <RowStatus
          row={row}
          testId="pane-state"
          more={failedAt === undefined ? '' : `, ${failedAt}`}
        />
      </dd>
      {line === undefined ? null : (
        <>
          <dt>Partitions</dt>
          <dd data-testid="pane-partitions">{line}</dd>
        </>
      )}
      <dt>Trigger</dt>
      <dd>
        {row.trigger ?? '—'}
        {row.trigger === undefined || row.triggerKind === 'not-scheduled' ? null : (
          <span className="muted"> · its refresh key</span>
        )}
      </dd>
      {also.length === 0 ? null : (
        <>
          <dt>Also rebuilt by</dt>
          <dd>
            {also.map((each, at) => (
              <span key={each.id} className="owner">
                {at === 0 ? null : ', '}
                <OwnerIcon owner="wechart" />
                <a className="btn-link" href={`/schedules?schedule=${encodeURIComponent(each.id)}`}>
                  {each.name}
                </a>
                <span className="muted"> · wechart</span>
              </span>
            ))}
          </dd>
        </>
      )}
      {row.fileName === undefined ? null : (
        <>
          <dt>Model</dt>
          <dd>
            <code>{row.fileName}</code>
            <span className="muted"> · read-only in {shown.folder ?? 'Shared'}</span>
          </dd>
        </>
      )}
    </dl>
  );
}

/** How many of its builds the pane lists (design 16, pin 14). */
const RECENT = 3;

/**
 * The builds of one pre-aggregation started from wechart, its last three,
 * with their outcome and who started them, and the way to all of them in Run
 * history (design 16, pin 14; state B). The refresh worker's builds aren't
 * listed (R41).
 */
function RecentBuilds({
  id,
  name,
  onOpenHistory,
}: {
  id: string;
  name: string;
  onOpenHistory?: ((preAggregation: { id: string; name: string }) => void) | undefined;
}) {
  const recent = useQuery({
    queryKey: ['jobs', 'builds', 'of', id],
    queryFn: async ({ signal }) => {
      const response = await fetch(
        `/api/jobs/builds?${new URLSearchParams({ preagg: id, within: 'all' }).toString()}`,
        { signal },
      );
      const body = (await response.json().catch(() => null)) as {
        records?: BuildSummary[];
        error?: unknown;
      } | null;
      if (!response.ok || body === null)
        throw new Error(
          typeof body?.error === 'string'
            ? body.error
            : `Its builds could not be read (${String(response.status)}).`,
        );
      return (body.records ?? []).slice(0, RECENT);
    },
    // Builds end while the pane is open: read again now and then, as Run history is.
    refetchInterval: 5_000,
  });
  const href = `/jobs?${new URLSearchParams({ tab: 'history', preagg: id }).toString()}`;
  return (
    <section className="build-log__section" aria-labelledby={`${id}-recent`}>
      <h3 id={`${id}-recent`}>Builds started from wechart</h3>
      {recent.isPending ? <StateLine kind="run">Reading its builds…</StateLine> : null}
      {recent.isError ? <StateLine kind="err">{recent.error.message}</StateLine> : null}
      {recent.data?.length === 0 ? (
        <p className="help build-log__help">
          None yet. Builds started here, or by a wechart schedule, are listed here.
        </p>
      ) : null}
      {recent.data === undefined || recent.data.length === 0 ? null : (
        <table className="query-log build-panel__recent" aria-label="Builds started from wechart">
          <tbody>
            {recent.data.map((build) => {
              return (
                <tr key={build.id}>
                  <td>
                    {/* To the minute, "Today 14:05", as pin 14 draws it (T612). */}
                    <BuiltWhen iso={build.startedAt} />
                  </td>
                  <td>{partitionsOf(build)}</td>
                  <td>
                    <BuildOutcomeStatus build={build} />
                  </td>
                  <td>
                    <StarterLabel starter={build.starter} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <a
        className="link-button"
        href={href}
        onClick={(event) => {
          // In Jobs, its own tab, without leaving the page.
          if (onOpenHistory === undefined) return;
          event.preventDefault();
          onOpenHistory({ id, name });
        }}
      >
        All its builds in Run history
      </a>
    </section>
  );
}

export function BuildPanel({
  pollMs = 1500,
  active = true,
  selectedFirst = null,
  onOpenHistory,
  onOpenQueue,
  status = '',
  onStatus,
  folderChoice: folderChosen,
  onFolderChoice,
  search: searched,
  onSearch,
}: {
  pollMs?: number;
  /**
   * Whether its tab is the one shown: its pane is a sheet that keeps Tab and
   * takes Esc only then, not from under Run history or the queue (T640).
   */
  active?: boolean;
  /** The folder listed (T559), where Jobs holds it; none, and the panel does. */
  folderChoice?: FolderChoice;
  onFolderChoice?: (choice: FolderChoice) => void;
  /** What Search pre-aggregations holds (T610), where Jobs holds it; none, and the panel does. */
  search?: string;
  onSearch?: (search: string) => void;
  /** The rows listed: those in this state, or every one (T558). */
  status?: StatusChoice | '';
  /** Status chosen; none, and the filter isn't offered. */
  onStatus?: (status: StatusChoice | '') => void;
  /**
   * The pre-aggregation to open on (T273, AC-245): the one a tile's Data as
   * of › Open in Jobs names, `?preagg=` in the address.
   */
  selectedFirst?: string | null;
  /** Opens Run history on one pre-aggregation's builds: Jobs' own tab (T375). */
  onOpenHistory?: (preAggregation: { id: string; name: string }) => void;
  /** Opens the queue: Jobs' own tab (T375; design 16, A1). */
  onOpenQueue?: () => void;
}) {
  const scopes = useScopes();
  const client = useQueryClient();
  /**
   * Builds started here, by their pre-aggregation, with its last build then
   * and when: followed in its row, read again soon, until it is neither
   * awaited — not yet under way or built anew, for up to a minute — nor
   * under way (AC-229). Others' builds are read now and then (T550's review).
   */
  const followed = useRef(
    new Map<string, { lastBuiltAt: string | null; at: number; seen: boolean }>(),
  );
  /** Whether a build started here is still to follow in these rows; those that ended, let go. */
  const following = (rows: readonly Buildable[]): boolean => {
    for (const [id, was] of followed.current) {
      const row = rows.find((each) => each.id === id);
      const underWay = row !== undefined && UNDER_WAY.has(row.state ?? '');
      if (underWay) was.seen = true;
      const awaited =
        !was.seen &&
        row !== undefined &&
        (row.lastBuiltAt ?? null) === was.lastBuiltAt &&
        Date.now() - was.at <= AWAITED_MS;
      if (!underWay && !awaited) followed.current.delete(id);
    }
    return followed.current.size > 0;
  };
  const buildable = useQuery({
    queryKey: ['preaggregations'],
    queryFn: ({ signal }) =>
      fetch('/api/preaggregations', { signal }).then(async (response) => {
        // Cube's own words when it gave some: a missing scope among them (T176).
        if (!response.ok)
          throw await readErrorOf(
            response,
            'The pre-aggregations could not be read',
            'GET /api/preaggregations',
          );
        return (await response.json()) as Buildable[];
      }),
    // Read again each time: a publish adds or removes pre-aggregations.
    refetchOnMount: 'always',
    // A started build's progress in its row (AC-229): read again soon while
    // a build started here goes on; sooner than now and then while Cube
    // still works partitions out (A4); now and then otherwise, as others'
    // builds go on.
    refetchInterval: (query) => {
      const rows = query.state.data ?? [];
      if (following(rows)) return pollMs;
      return rows.some((row) => row.pending === true) ? PENDING_MS : NOW_AND_THEN_MS;
    },
  });
  /** The pre-aggregation whose details the pane shows (AC-228). */
  const [selected, setSelected] = useState<string | null>(selectedFirst);
  /**
   * The folder listed, Jobs' own where it holds it, so a summary's link can
   * list every folder again (T559's review); and the folders the user builds
   * in, for the filter and the note (T559).
   */
  /**
   * Below 1,024 px the pane is a sheet over the list (design 16, G8; T640),
   * as designs 01, 11 and 13 have theirs: opened, it takes focus at its
   * head, once what it shows is read, so one opened from `?preagg=` before
   * the list answers takes it too; Tab stays in it; Esc or × closes it, and
   * focus goes back to its row (rule 85).
   */
  const narrow = useNarrowWindow();
  const pane = useRef<HTMLElement>(null);
  const [foot, setFoot] = useState<HTMLElement | null>(null);
  const sheetHead = useRef<HTMLHeadingElement>(null);
  const showing =
    selected === null
      ? null
      : buildable.data?.some((each) => each.id === selected) === true
        ? selected
        : selected === selectedFirst && buildable.data !== undefined
          ? 'not-found'
          : null;
  const sheetOpen = narrow && active && showing !== null;
  /** The sheet and its toasts, Tab's box while it covers the page (T640's review). */
  const over = useRef<HTMLDivElement>(null);
  useFootHeight(sheetOpen ? foot : null, over);
  // Its head takes focus as it opens, and as its tab is shown again over it (T640's review).
  useEffect(() => {
    if (showing !== null && active && narrowNow()) sheetHead.current?.focus();
  }, [showing, active]);
  /** Back to the list: the sheet closed, focus on its row, else the list (rule 85). */
  const closePane = () => {
    const was = selected;
    setSelected(null);
    // On its row's name, the row's one stop (T611).
    if (was !== null)
      focusAfterClose(`tr[data-preagg=${JSON.stringify(was)}] .list-name`, ...TO_THE_LIST);
  };
  useSheetEscape(pane, active && showing !== null, closePane);
  const [ownChoice, setOwnChoice] = useState<FolderChoice>(EVERY_FOLDER);
  const folderChoice = folderChosen ?? ownChoice;
  const setFolderChoice = onFolderChoice ?? setOwnChoice;
  const [ownSearch, setOwnSearch] = useState('');
  const search = searched ?? ownSearch;
  const setSearch = onSearch ?? setOwnSearch;
  const folders = useJobsFolders();
  /** A build started: its row followed until it ends, and listed in its pane once recorded. */
  const follow = (id: string) => {
    const row = buildable.data?.find((each) => each.id === id);
    followed.current.set(id, {
      lastBuiltAt: row?.lastBuiltAt ?? null,
      at: Date.now(),
      seen: false,
    });
    void client.invalidateQueries({ queryKey: ['preaggregations'] });
    void client.invalidateQueries({ queryKey: ['jobs', 'builds', 'of', id] });
  };
  /**
   * A start refused for Cube's missing `jobs` scope: building is said to be
   * unavailable, never as the build's failure (T176, AC-170). Builds start
   * from the pane, a row click only selecting (design 16, J; T611).
   */
  const [noJobsScope, setNoJobsScope] = useState(false);
  /** Access lost while the page was open (design 16, G5), said once the list is read again. */
  const [lost, setLost] = useState(false);
  /**
   * A refused start (G4, G5): the list read again, and where its row went
   * with it, access was lost: the pane closes, and it is said (T560).
   */
  const refusedFor = async (id: string) => {
    await client.invalidateQueries({ queryKey: ['preaggregations'] });
    const rows = client.getQueryData<Buildable[]>(['preaggregations']) ?? [];
    if (rows.some((row) => row.id === id)) return;
    setSelected((was) => (was === id ? null : was));
    setLost(true);
    // Its row went with it: focus on the list, or Jobs' tab where none is left (T640).
    focusAfterClose(...TO_THE_LIST);
  };
  /** What the pane started, said in a toast with the way to the queue (design 16, A1). */
  const [toast, setToast] = useState<{ said: string; jobs: number } | null>(null);

  /**
   * Without Cube's `jobs` scope no build can start (T176, AC-170): said as
   * that, up front when the probe says so, and when a build is refused for
   * it — never as the build's failure.
   */
  if (scopes.data?.jobs === 'missing' || noJobsScope)
    return <ScopeUnavailable scope="jobs" what="Building pre-aggregations" />;
  // Skeleton rows while it's read, under the list's heads (design 16, G1; T560, T610).
  if (buildable.isPending)
    return (
      <ListLoading
        said="Reading the pre-aggregations…"
        label="Pre-aggregations"
        columns={PREAGG_COLUMNS}
        narrow={PREAGG_NARROW}
      />
    );
  // The last read-write folder gone while open (G5b; T610).
  if (noFolderLeft(buildable)) return <NoFolderLeft page="Jobs" />;
  if (buildable.isError) {
    const lacking = missingScopeOf(buildable.error);
    // Couldn't read them, with Retry and Details (G2); a refusal in the API's words (G4).
    return lacking === undefined ? (
      <ListError
        what="the pre-aggregations"
        error={buildable.error}
        carryOn="Your builds carry on; this list will show them once it’s read."
        onRetry={() => void buildable.refetch()}
      />
    ) : (
      <ScopeUnavailable scope={lacking} what="Listing pre-aggregations" />
    );
  }
  const shown = buildable.data.find((each) => each.id === selected);
  const openQueue = onOpenQueue ?? (() => window.location.assign('/jobs?tab=queue'));
  /** What the pane started: in the sheet, a modal dialog, while one covers the page (T611's review). */
  const startedToast = (
    <ExportedToast
      message={toast === null ? '' : `${toast.said}.`}
      action={
        toast === null
          ? undefined
          : {
              label: toast.jobs > 1 ? 'Follow them in Queue' : 'Follow it in Queue',
              onSelect: openQueue,
            }
      }
      onDismiss={() => setToast(null)}
    />
  );
  /**
   * Access lost while the page was open (design 16, G5; T560): said as the
   * sheet closes, so kept in one place outside it, and announced (T640's review).
   */
  const lostToast = (
    <ExportedToast
      message={lost ? ACCESS_LOST : ''}
      kind="err"
      onDismiss={() => {
        setLost(false);
      }}
    />
  );
  /** The sheet's ×, back to the list, focus back on its row (design 16, G8; rule 85). */
  const backToList = (
    <button
      type="button"
      className="btn-ghost btn-sm admin-pane__close"
      aria-label="Back to the list"
      onClick={closePane}
    >
      ×
    </button>
  );
  // Those of the chosen folder (T559) in the chosen state, as Jobs' summary counts them
  // (T558), whose name or folder holds what was searched (T610).
  const sought = search.trim().toLowerCase();
  const listed = buildable.data.filter(
    (row) =>
      (status === '' || row.state === status) &&
      inFolder(row.folderId, folderChoice, folders.data?.folders ?? []) &&
      (sought === '' ||
        [shownOf(row).name, shownOf(row).folder ?? 'Shared'].some((words) =>
          words.toLowerCase().includes(sought),
        )),
  );

  return (
    <div className="build-panel">
      <div className="build-panel__list">
        {/* For a read-write member: their folders only (design 16, pin 3). */}
        <ScopeNote folders={folders.data}>
          Showing pre-aggregations of models in the folders where you have read-write access.
        </ScopeNote>
        {buildable.data.length === 0 ? (
          // Nothing in their folders yet (design 16, G3; T560).
          <ListEmpty title="No pre-aggregations in your folders">
            None of the models in the folders where you have read-write access defines one yet. Add
            one to a model in My workspace and propose it.
          </ListEmpty>
        ) : (
          <>
            <div className="sources-filters run-history__filters">
              <FolderFilter
                folders={folders.data}
                choice={folderChoice}
                onChange={setFolderChoice}
              />
              {onStatus === undefined ? null : (
                <ChoicePill
                  label="Status"
                  choices={[['', 'Any'], ...ROW_STATUSES]}
                  value={status}
                  onChange={onStatus}
                />
              )}
              {/* Search pre-aggregations, after Folder and Status (screen 1; T610). */}
              <input
                type="search"
                className="sources-filters__search"
                aria-label="Search pre-aggregations"
                placeholder="Search pre-aggregations"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                }}
              />
              {/* A count, read as it changes, not a state (T611: status-labels' sweep). */}
              <span className="run-history__count" aria-live="polite">
                {`${String(listed.length)} ${listed.length === 1 ? 'pre-aggregation' : 'pre-aggregations'}`}
              </span>
            </div>
            <TableScroll label="Pre-aggregations">
              {/*
                Below 1,024 px its rows are drawn stacked, as G8 draws them
                (J2, the user's call R76; T614): a table's roles, set here,
                are kept whatever display draws it (research table.md).
              */}
              {/* A td's own role, cell, given it explicitly: no other role is given it. */}
              {/* eslint-disable jsx-a11y/no-redundant-roles, jsx-a11y/no-interactive-element-to-noninteractive-role */}
              <table
                className="query-log build-panel__list"
                aria-label="Pre-aggregations"
                role="table"
              >
                {/* G8 draws no header row over its stacked rows: the heads are a reader's there. */}
                <thead className="build-panel__heads" role="rowgroup">
                  <tr role="row">
                    <th scope="col" role="columnheader">
                      Pre-aggregation
                    </th>
                    {/* Each row's folder, after its name (pin 4). */}
                    <th scope="col" role="columnheader">
                      Folder
                    </th>
                    <th scope="col" role="columnheader">
                      Status
                    </th>
                    {/* Below 1,024 px, these move into the sheet (design 16, G8). */}
                    <th scope="col" role="columnheader" className="jobs-wide">
                      Last built
                    </th>
                    <th scope="col" role="columnheader" className="jobs-wide">
                      Started by
                    </th>
                    <th scope="col" role="columnheader" className="jobs-wide">
                      Trigger
                    </th>
                    <th scope="col" role="columnheader" className="num jobs-wide">
                      Partitions
                    </th>
                  </tr>
                </thead>
                <tbody role="rowgroup">
                  {listed.map((row) => {
                    const { id, trigger } = row;
                    const shownAs = shownOf(row);
                    return (
                      <tr
                        key={id}
                        role="row"
                        // The sheet's × gives focus back to it (G8).
                        data-preagg={id}
                        // Selecting a row shows it in the pane (AC-228): a click
                        // anywhere in it only selects, building being the pane's
                        // (design 16, J; T611).
                        aria-selected={selected === id}
                        className="build-panel__row"
                        onClick={() => {
                          setSelected(id);
                        }}
                      >
                        <td role="cell" className="query-log__query">
                          {/* Its name, a button read as the row is (design 16's
                            keyboard table): Enter or Space selects it, ↑ ↓ go
                            to the next row's (T611). Its pane's Open in Model
                            is the way to its definition (UX-080; R47). */}
                          <button
                            type="button"
                            className="link-button list-name"
                            aria-label={announced(
                              shownAs.name,
                              shownAs.folder ?? 'Shared',
                              stateOf(row).label,
                            )}
                            onKeyDown={stepRows}
                          >
                            <span data-testid="preagg-name">{shownAs.name}</span>
                          </button>
                        </td>
                        <td role="cell" data-testid="preagg-folder">
                          {shownAs.folder ?? 'Shared'}
                        </td>
                        <td role="cell">
                          {/* The state of its partitions that most needs attention (AC-391, rule 22). */}
                          <RowStatus row={row} testId="row-state" />
                        </td>
                        <td role="cell" className="jobs-wide">
                          {row.lastBuiltAt == null ? (
                            <span className="muted">—</span>
                          ) : (
                            <BuiltWhen iso={row.lastBuiltAt} />
                          )}
                        </td>
                        <td role="cell" className="jobs-wide">
                          {/* Who started that build from wechart; "—" when wechart didn't (pin 7). */}
                          {row.startedBy == null ? (
                            <span className="muted">—</span>
                          ) : (
                            <StarterLabel starter={row.startedBy} />
                          )}
                        </td>
                        <td role="cell" className="jobs-wide">
                          {/* "Not scheduled" has its icon (design 16, pin 8; T551). */}
                          {row.triggerKind === 'not-scheduled' ? (
                            <Status
                              kind="off"
                              label={trigger ?? 'Not scheduled'}
                              testId="trigger"
                            />
                          ) : (
                            (trigger ?? '—')
                          )}
                        </td>
                        <td role="cell" className="num jobs-wide">
                          {row.partitions == null ? (
                            <span className="muted">—</span>
                          ) : (
                            String(row.partitions)
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {/* eslint-enable jsx-a11y/no-redundant-roles, jsx-a11y/no-interactive-element-to-noninteractive-role */}
            </TableScroll>
          </>
        )}
        {/* What Last built and Started by mean, so "—" isn't read as never built (pin 9). */}
        <p className="jobs-foot" data-testid="jobs-foot">
          <b>Last built</b> is when Cube started the newest build of one of the rollup’s partitions,
          whoever started it. <b>Started by</b> names who started that build from wechart: a person,
          or a wechart schedule. “—” means wechart didn’t start it. Builds by Cube’s refresh worker
          name no starter until their history is recorded. Times are your local time; hover one for
          UTC.
        </p>
      </div>

      {/*
        The prototype's docked pane (AC-228): the selected pre-aggregation,
        docked under the app bar at the window's right, its full height (T469,
        UX-081; styles.ts).
      */}
      {/* The sheet and what's said over it, as one, for Tab (T640). */}
      <div ref={over} className="sheet-over">
        <aside
          ref={pane}
          className="admin-pane"
          aria-label="Pre-aggregation details"
          // Covering the page, a modal dialog, as the .source-pane sheets are (T611).
          {...(sheetOpen ? { role: 'dialog', 'aria-modal': true } : {})}
        >
          {/* Below 1,024 px, its actions pinned in the sheet's foot (G8; T640). */}
          <SheetFootContext.Provider value={sheetOpen ? foot : null}>
            {shown === undefined && selected !== null && selected === selectedFirst ? (
              // `?preagg=` out of scope reads as one that doesn't exist (design 16, G6; rule 67).
              <div className="admin-pane__missing" data-testid="not-found">
                <div className="admin-pane__head">
                  {backToList}
                  <h2 className="admin-pane__title" tabIndex={-1} ref={sheetHead}>
                    Not found
                  </h2>
                </div>
                {/* With the search's icon, as G6 draws it (T613). */}
                <div className="admin-pane__notfound">
                  <ActionIcon name="search" size={24} />
                  <p>There’s no pre-aggregation by that name in your folders.</p>
                </div>
              </div>
            ) : shown === undefined ? (
              <p className="admin-pane__empty">
                Select a pre-aggregation to see its state, what rebuilds it, and to build it.
              </p>
            ) : (
              <>
                {/* The prototype's 44 px pane head (T469, UX-081). */}
                <div className="admin-pane__head" data-testid="pane-head">
                  {/* Below 1,024 px the pane is a sheet: × first in its head goes back to the list (design 16, G8). */}
                  {backToList}
                  <h2 className="admin-pane__title" tabIndex={-1} ref={sheetHead}>
                    {shownOf(shown).name}
                  </h2>
                </div>
                {/* What scrolls under the head, the sheet's body below 1,024 px (T640). */}
                <div className="admin-pane__body">
                  {/* Its folder from the root, "Shared / Sales / EMEA" (pin 13; T611). */}
                  <p className="build-panel__folder" data-testid="pane-folder">
                    {(shown.folderPath ?? ['Shared']).join(' / ')}
                  </p>
                  <PaneFacts row={shown} />
                  {/* Below 1,024 px, what the list leaves out (G8; T611). */}
                  <dl
                    className="admin-pane__facts jobs-narrow"
                    role="group"
                    aria-label="On the list"
                  >
                    <dt>Last built</dt>
                    <dd>
                      {shown.lastBuiltAt == null ? '—' : <BuiltWhen iso={shown.lastBuiltAt} />}
                    </dd>
                    <dt>Started by</dt>
                    <dd>
                      {shown.startedBy == null ? '—' : <StarterLabel starter={shown.startedBy} />}
                    </dd>
                  </dl>
                  {/*
              Its partitions, with Rebuild selected and Build all, or Build now
              for one not partitioned (T375, AC-145; design 16, pins 10–12):
              24 px actions, the prototype's btn sm (T469, UX-081). Keyed by
              it, so another's selection is never carried over.
            */}
                  <Partitions
                    key={shown.id}
                    id={shown.id}
                    name={shownOf(shown).name}
                    pollMs={Math.max(pollMs, 5_000)}
                    // A refused start: access may be lost (design 16, G5; T560).
                    onRefused={(error) => {
                      if (missingScopeOf(error) === 'jobs') setNoJobsScope(true);
                      else void refusedFor(shown.id);
                    }}
                    onStarted={(begun: Started) => {
                      follow(shown.id);
                      // A start that made no job is said in the pane, not toasted (T375's review).
                      setToast(
                        begun.tokens.length === 0
                          ? null
                          : { said: begun.said, jobs: begun.tokens.length },
                      );
                    }}
                  >
                    {shown.fileName === undefined ? null : (
                      <a
                        className="btn btn-sm"
                        href={memberHref({ ...shown, fileName: shown.fileName })}
                      >
                        Open in Model
                      </a>
                    )}
                  </Partitions>
                  <RecentBuilds
                    key={`recent-${shown.id}`}
                    id={shown.id}
                    name={shownOf(shown).name}
                    onOpenHistory={onOpenHistory}
                  />
                  <p className="help build-log__help">
                    Building and wechart schedules need no proposal. The refresh key is part of the
                    model: to change it, edit the model in My workspace and propose it.
                  </p>
                </div>
              </>
            )}
          </SheetFootContext.Provider>
          {narrow ? <footer className="source-pane__foot" ref={setFoot} /> : null}
          {/* In the modal sheet, so a screen reader that honours aria-modal reads it (T611's review). */}
          {sheetOpen ? startedToast : null}
        </aside>
        {/* Kept in one place, so each is announced as it comes; over the sheet,
          above its foot, and in its Tab order while it covers the page (T640). */}
        {sheetOpen ? null : startedToast}
        {lostToast}
      </div>
      {sheetOpen ? <SheetTrap pane={over} /> : null}
    </div>
  );
}
