import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';

import { ExportedToast } from '../../dashboard/export/ExportedToast';
import { missingScopeOf, ScopeUnavailable, useScopes } from '../../query/scopes';
import { StateLine, type StateKind } from '../../shell/StatusIcon';
import { TableScroll } from '../../shell/TableScroll';
import { rollupHref } from '../model/inFolder';
import {
  BuildOutcomeStatus,
  BuiltWhen,
  partitionsOf,
  periodOf,
  StarterLabel,
  whenOf,
  type BuildSummary,
  type Starter,
} from './builds';
import { Partitions, type Started } from './Partitions';
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

async function send<T>(url: string, init?: { body: unknown; signal?: AbortSignal }): Promise<T> {
  const response = await fetch(
    url,
    init === undefined
      ? undefined
      : {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(init.body),
          ...(init.signal === undefined ? {} : { signal: init.signal }),
        },
  );
  const body = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!response.ok || body === null)
    throw new Error(body?.error ?? `The request failed (status ${String(response.status)}).`);
  return body;
}

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
function RowStatus({ row, testId }: { row: Buildable; testId: string }) {
  const at =
    row.stateAt === undefined
      ? ''
      : row.stateAt === null
        ? ' · whole'
        : ` · ${periodOf(row.stateAt, row.partitionGranularity ?? null)}`;
  const shown = (kind: StateKind, label: string, state: string) => (
    <Status kind={kind} label={label} testId={testId} state={state} />
  );
  switch (row.state) {
    case 'failed':
      return shown('err', `Failed${at}`, 'failed');
    // A whole one's building, queued or stall says no period (screen 1).
    case 'building':
      return shown('run', `Building${row.stateAt === null ? '' : at}`, 'building');
    case 'queued':
      return shown('idle', `Queued${row.stateAt === null ? '' : at}`, 'queued');
    case 'stalled':
      return shown('warn', `Stalled${row.stateAt === null ? '' : at}`, 'stalled');
    case 'partly':
      return shown(
        'part',
        `Partly built · ${String(row.built ?? 0)} of ${String(row.partitions ?? 0)}`,
        'partly',
      );
    case 'not-built':
      return shown('off', 'Not built', 'not-built');
    case 'built':
      return shown('ok', 'Built', 'built');
    default:
      // Made of other rollups (A3); or Cube still working its partitions out
      // (A4), never read as not built; or, with xcube's routes not there, nothing known.
      return row.buildable === false ? (
        <span className="muted" data-testid={testId}>
          No partitions of its own
        </span>
      ) : row.unreadable !== undefined ? (
        // xcube couldn't say: its words on hover; the row and its Build stay.
        <Status
          kind="warn"
          label="Couldn’t read its state"
          testId={testId}
          state="unreadable"
          title={row.unreadable}
        />
      ) : row.pending === true ? (
        shown('run', 'Asking Cube…', 'pending')
      ) : (
        <span className="muted" data-testid={testId}>
          —
        </span>
      );
  }
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
              const when = whenOf(build.startedAt);
              return (
                <tr key={build.id}>
                  <td>
                    <time dateTime={build.startedAt} title={when.utc}>
                      {when.shown}
                    </time>
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
  selectedFirst = null,
  onOpenHistory,
  onOpenQueue,
}: {
  pollMs?: number;
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
        if (!response.ok) {
          // Cube's own words when it gave some: a missing scope among them (T176).
          const said = ((await response.json().catch(() => null)) as { error?: unknown } | null)
            ?.error;
          throw new Error(
            typeof said === 'string'
              ? said
              : `The pre-aggregations could not be read (${String(response.status)}).`,
          );
        }
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
  /** A Build that made no job, said by its name, as the API leaves it to say (T550's review). */
  const [noJob, setNoJob] = useState<string | null>(null);
  const start = useMutation({
    mutationFn: (id: string) =>
      send<{ tokens: string[] }>('/api/builds', { body: { preAggregation: id } }),
    onSuccess: ({ tokens }, id) => {
      setNoJob(tokens.length === 0 ? id : null);
      if (tokens.length > 0) follow(id);
    },
  });
  /** What the pane started, said in a toast with the way to the queue (design 16, A1). */
  const [toast, setToast] = useState<{ said: string; jobs: number } | null>(null);

  /**
   * Without Cube's `jobs` scope no build can start (T176, AC-170): said as
   * that, up front when the probe says so, and when a build is refused for
   * it — never as the build's failure.
   */
  if (scopes.data?.jobs === 'missing' || missingScopeOf(start.error) === 'jobs')
    return <ScopeUnavailable scope="jobs" what="Building pre-aggregations" />;
  if (buildable.isPending) return <StateLine kind="run">Reading the pre-aggregations…</StateLine>;
  if (buildable.isError) {
    const lacking = missingScopeOf(buildable.error);
    return lacking === undefined ? (
      <StateLine kind="err">{buildable.error.message}</StateLine>
    ) : (
      <ScopeUnavailable scope={lacking} what="Listing pre-aggregations" />
    );
  }
  const shown = buildable.data.find((each) => each.id === selected);
  const openQueue = onOpenQueue ?? (() => window.location.assign('/jobs?tab=queue'));

  return (
    <div className="build-panel">
      <div className="build-panel__list">
        {buildable.data.length === 0 ? (
          <p>The model declares no pre-aggregations.</p>
        ) : (
          <TableScroll label="Pre-aggregations">
            <table className="query-log" aria-label="Pre-aggregations">
              <thead>
                <tr>
                  <th scope="col">Pre-aggregation</th>
                  <th scope="col">Status</th>
                  <th scope="col">Last built</th>
                  <th scope="col">Started by</th>
                  <th scope="col">Trigger</th>
                  <th scope="col" className="num">
                    Partitions
                  </th>
                  <th scope="col">
                    <span className="visually-hidden">Build</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {buildable.data.map((row) => {
                  const { id, trigger } = row;
                  const shownAs = shownOf(row);
                  const said =
                    shownAs.folder === undefined
                      ? shownAs.name
                      : `${shownAs.name} in ${shownAs.folder}`;
                  return (
                    <tr
                      key={id}
                      // Selecting a row shows it in the pane (AC-228): by pointer
                      // anywhere in it, or Enter or Space on the row itself.
                      aria-selected={selected === id}
                      tabIndex={0}
                      className="build-panel__row"
                      onClick={() => {
                        setSelected(id);
                      }}
                      onKeyDown={(event) => {
                        if (event.target !== event.currentTarget) return;
                        if (event.key !== 'Enter' && event.key !== ' ') return;
                        event.preventDefault();
                        setSelected(id);
                      }}
                    >
                      <td className="query-log__query">
                        {/* Plain text: a row click selects it, and its pane's
                            Open in Model is the way to its definition (the
                            user, 2026-09-28: UX-080; AC-229 amended, R47). */}
                        <span data-testid="preagg-name">{shownAs.name}</span>
                        {shownAs.folder === undefined ? null : (
                          <span className="build-panel__folder" data-testid="preagg-folder">
                            {shownAs.folder}
                          </span>
                        )}
                      </td>
                      <td>
                        {/* The state of its partitions that most needs attention (AC-391, rule 22). */}
                        <RowStatus row={row} testId="row-state" />
                      </td>
                      <td>
                        {row.lastBuiltAt == null ? (
                          <span className="muted">—</span>
                        ) : (
                          <BuiltWhen iso={row.lastBuiltAt} />
                        )}
                      </td>
                      <td>
                        {/* Who started that build from wechart; "—" when wechart didn't (pin 7). */}
                        {row.startedBy == null ? (
                          <span className="muted">—</span>
                        ) : (
                          <StarterLabel starter={row.startedBy} />
                        )}
                      </td>
                      <td>
                        {/* "Not scheduled" has its icon (design 16, pin 8; T551). */}
                        {row.triggerKind === 'not-scheduled' ? (
                          <Status kind="off" label={trigger ?? 'Not scheduled'} testId="trigger" />
                        ) : (
                          (trigger ?? '—')
                        )}
                      </td>
                      <td className="num">
                        {row.partitions == null ? (
                          <span className="muted">—</span>
                        ) : (
                          String(row.partitions)
                        )}
                      </td>
                      <td>
                        {/* A lambda or a rollup join has nothing of its own to build (A3). */}
                        {row.buildable === false ? null : (
                          <button
                            type="button"
                            className="btn-sm"
                            aria-label={`Build ${said}`}
                            // One start at a time, so each start's answer — a refusal
                            // included — is the one shown (T155's review).
                            disabled={start.isPending}
                            onClick={() => {
                              start.mutate(id);
                            }}
                          >
                            Build
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableScroll>
        )}
        {/* What Last built and Started by mean, so "—" isn't read as never built (pin 9). */}
        <p className="jobs-foot" data-testid="jobs-foot">
          <b>Last built</b> is when Cube started the newest build of one of the rollup’s partitions,
          whoever started it. <b>Started by</b> names who started that build from wechart: a person,
          or a wechart schedule. “—” means wechart didn’t start it. Builds by Cube’s refresh worker
          name no starter until their history is recorded. Times are your local time; hover one for
          UTC.
        </p>
        {/* Starting, in words with its icon, not only by the buttons fading (AC-177). */}
        {start.isPending ? <StateLine kind="run">Asking Cube to start the build…</StateLine> : null}
        {noJob === null ? null : (
          <StateLine kind="warn" testId="build-empty">
            Cube started no job: no partition of{' '}
            {shownOf(buildable.data.find((each) => each.id === noJob) ?? { id: noJob }).name} was
            built.
          </StateLine>
        )}
        {start.isError ? <StateLine kind="err">{start.error.message}</StateLine> : null}
      </div>

      {/*
        The prototype's docked pane (AC-228): the selected pre-aggregation,
        docked under the app bar at the window's right, its full height (T469,
        UX-081; styles.ts).
      */}
      <aside className="admin-pane" aria-label="Pre-aggregation details">
        {shown === undefined ? (
          <p className="admin-pane__empty">
            Select a pre-aggregation to see its state, what rebuilds it, and to build it.
          </p>
        ) : (
          <>
            {/* The prototype's 44 px pane head (T469, UX-081). */}
            <div className="admin-pane__head" data-testid="pane-head">
              <h2 className="admin-pane__title">{shownOf(shown).name}</h2>
            </div>
            {/* Its folder, so /A's and /A/B's `sales.main` are told apart (T371's review). */}
            {shownOf(shown).folder === undefined ? null : (
              <p className="build-panel__folder" data-testid="pane-folder">
                {shownOf(shown).folder}
              </p>
            )}
            <dl className="admin-pane__facts">
              <dt>Status</dt>
              <dd>
                <RowStatus row={shown} testId="pane-state" />
              </dd>
              <dt>Trigger</dt>
              <dd>{shown.trigger ?? '—'}</dd>
              <dt>Type</dt>
              <dd>{shown.type}</dd>
              <dt>Partition granularity</dt>
              <dd>{shown.partitionGranularity ?? 'none'}</dd>
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
                <a className="btn btn-sm" href={memberHref({ ...shown, fileName: shown.fileName })}>
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
              Building and wechart schedules need no proposal. The refresh key is part of the model:
              to change it, edit the model in My workspace and propose it.
            </p>
          </>
        )}
      </aside>
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
    </div>
  );
}
