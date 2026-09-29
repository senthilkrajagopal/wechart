import { useMutation, useQuery } from '@tanstack/react-query';
import { useRef, useState } from 'react';

import { missingScopeOf, ScopeUnavailable, useScopes } from '../../query/scopes';
import { StateLine } from '../../shell/StatusIcon';
import { TableScroll } from '../../shell/TableScroll';
import { StateBadge, stateOf, Status } from './StateBadge';

/**
 * Building a pre-aggregation (T155, AC-149), as the prototype's Jobs page lists
 * them: every pre-aggregation Cube compiled, each with Build. A build is
 * Cube's own job — started through its jobs API, one token per partition —
 * and each token is followed until it reports a state it will not leave.
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
  /** What rebuilds it, in words: its refresh key (AC-229). */
  readonly trigger?: string;
  /** The model file its cube is defined in (AC-229). */
  readonly fileName?: string;
}

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

/** Where a pre-aggregation is defined, in the Model workspace (AC-229). */
const modelHref = (fileName: string) => `/model/files/${encodeURIComponent(fileName)}`;

/**
 * The same file open on its cube's Pre-aggs tab with this pre-aggregation
 * open (T469, UX-080): the cube by the name its file declares — a folder's by
 * its short name, not its prefixed published one — and the member by its own.
 */
function memberHref(row: Buildable & { readonly fileName: string }): string {
  const dot = row.id.lastIndexOf('.');
  const cube = row.shortName ?? row.id.slice(0, dot);
  const member = row.id.slice(dot + 1);
  const search = new URLSearchParams({ cube, tab: 'pre_aggregations', member });
  return `${modelHref(row.fileName)}?${search.toString()}`;
}

interface JobStatus {
  readonly token: string;
  readonly status: string;
  /** Said by the API, by its one tested rule (`isFinished`). */
  readonly finished: boolean;
  readonly table?: string;
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

/**
 * A build's jobs, followed until each has finished. One definition, under one
 * key, so the row's state and the pane's list of jobs share one poll.
 */
function useBuildStatus(tokens: readonly string[], pollMs: number) {
  return useQuery({
    queryKey: ['build-status', tokens],
    queryFn: ({ signal }) => send<JobStatus[]>('/api/builds/status', { body: { tokens }, signal }),
    // Stopped once every token asked about has finished — not merely every
    // answer, which may leave a token out (T155's review).
    refetchInterval: (query) => {
      const answered = new Map((query.state.data ?? []).map((job) => [job.token, job]));
      return tokens.every((token) => answered.get(token)?.finished === true) ? false : pollMs;
    },
    // A build that started no job has nothing to follow.
    enabled: tokens.length > 0,
  });
}

/**
 * A build as one state, for its pre-aggregation's row (AC-229, rule 22):
 * failed if any partition failed, done when every one is, processing while
 * any is, and otherwise what the first says — "Asking Cube…" before any
 * answer.
 */
export function buildStateOf(
  tokens: readonly string[],
  jobs: readonly JobStatus[] | undefined,
): string {
  const answered = new Map((jobs ?? []).map((job) => [job.token, job.status]));
  const states = tokens.map((token) => answered.get(token) ?? '');
  const failed = states.find(
    (state) =>
      state.startsWith('failure') || state === 'missing_partition' || state === 'pre_agg_not_found',
  );
  if (failed !== undefined) return failed;
  if (states.length > 0 && states.every((state) => state === 'done')) return 'done';
  if (states.includes('processing')) return 'processing';
  // Otherwise the first partition not done — not merely the first answered,
  // which read "Done" while another was unanswered or waiting (T239's
  // review); `''` is "Asking Cube…".
  return states.find((state) => state !== 'done') ?? '';
}

/** A pre-aggregation's state: its latest build's here, or none started. */
function BuildState({
  build,
  pollMs,
  testId,
}: {
  build: { tokens: string[] } | undefined;
  pollMs: number;
  testId: string;
}) {
  const jobs = useBuildStatus(build?.tokens ?? [], pollMs);
  if (build === undefined)
    return <Status kind="idle" label="Not built here" testId={testId} state="none" />;
  if (build.tokens.length === 0)
    return <Status kind="warn" label="No job started" testId={testId} state="empty" />;
  // Following it failed: said in the row, not only in the pane (T239's review).
  if (jobs.isError && jobs.data === undefined)
    return <Status kind="err" label="Could not follow the build" testId={testId} state="unknown" />;
  const state = buildStateOf(build.tokens, jobs.data);
  const { kind, label } = stateOf(state);
  return <Status kind={kind} label={label} testId={testId} state={state} />;
}

/** One build's jobs, followed until each has finished. */
function BuildJobs({
  id,
  tokens,
  pollMs,
  name = id,
}: {
  id: string;
  tokens: readonly string[];
  pollMs: number;
  /** How it is shown: a folder's by its short name, never its prefixed one (T371). */
  name?: string;
}) {
  const jobs = useBuildStatus(tokens, pollMs);
  const byToken = new Map((jobs.data ?? []).map((job) => [job.token, job]));
  return (
    <li className="build-jobs">
      <span className="build-jobs__id">{name}</span>
      {tokens.length === 0 ? (
        <StateLine kind="warn" testId="build-empty">
          Cube started no job: no partition of {name} was built.
        </StateLine>
      ) : null}
      {!jobs.isError ? null : missingScopeOf(jobs.error) === undefined ? (
        <StateLine kind="err">{jobs.error.message}</StateLine>
      ) : (
        // Refused its scope since the build started (T176, AC-170).
        <ScopeUnavailable
          scope={missingScopeOf(jobs.error) ?? 'jobs'}
          what="Following this build"
        />
      )}
      <ul className="build-jobs__list" aria-label={`Jobs building ${name}`}>
        {tokens.map((token) => {
          const job = byToken.get(token);
          return (
            <li key={token} data-testid={`job-${token}`} className="build-jobs__job">
              <code data-testid="job-token">{token}</code>
              {/* Its icon and its words (T158, AC-152); "Asking Cube…" until the first answer. */}
              <StateBadge status={job?.status ?? ''} />
              {job?.table === undefined ? null : (
                <code className="build-jobs__table" data-testid="job-table">
                  {job.table}
                </code>
              )}
            </li>
          );
        })}
      </ul>
    </li>
  );
}

export function BuildPanel({
  pollMs = 1500,
  selectedFirst = null,
}: {
  pollMs?: number;
  /**
   * The pre-aggregation to open on (T273, AC-245): the one a tile's Data as
   * of › Open in Jobs names, `?preagg=` in the address.
   */
  selectedFirst?: string | null;
}) {
  const scopes = useScopes();
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
  });
  // Newest first, as a run history reads; numbered, not timed, so two builds
  // started together are still two.
  const [builds, setBuilds] = useState<{ id: string; tokens: string[]; n: number }[]>([]);
  /** The pre-aggregation whose details the pane shows (AC-228). */
  const [selected, setSelected] = useState<string | null>(selectedFirst);
  const latestOf = (id: string) => builds.find((build) => build.id === id);
  const started = useRef(0);
  const start = useMutation({
    mutationFn: (id: string) =>
      send<{ tokens: string[] }>('/api/builds', { body: { preAggregation: id } }),
    onSuccess: ({ tokens }, id) => {
      started.current += 1;
      const n = started.current;
      setBuilds((before) => [{ id, tokens, n }, ...before]);
    },
  });

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
  const shownBuilds = builds.filter((build) => build.id === selected);

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
                  <th scope="col">Trigger</th>
                  <th scope="col">Partition granularity</th>
                  <th scope="col">
                    <span className="visually-hidden">Build</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {buildable.data.map((row) => {
                  const { id, partitionGranularity, trigger } = row;
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
                        {/* Its latest build's state here, in its own row (rule 22). */}
                        <BuildState build={latestOf(id)} pollMs={pollMs} testId="row-state" />
                      </td>
                      <td>{trigger ?? '—'}</td>
                      <td>{partitionGranularity ?? 'none'}</td>
                      <td>
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
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableScroll>
        )}
        {/* Starting, in words with its icon, not only by the buttons fading (AC-177). */}
        {start.isPending ? <StateLine kind="run">Asking Cube to start the build…</StateLine> : null}
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
              <dt>State</dt>
              <dd>
                <BuildState build={latestOf(shown.id)} pollMs={pollMs} testId="pane-state" />
              </dd>
              <dt>Trigger</dt>
              <dd>{shown.trigger ?? '—'}</dd>
              <dt>Type</dt>
              <dd>{shown.type}</dd>
              <dt>Partition granularity</dt>
              <dd>{shown.partitionGranularity ?? 'none'}</dd>
            </dl>
            <div className="admin-pane__actions">
              {/* 24 px actions, the prototype's btn sm (T469, UX-081). */}
              <button
                type="button"
                className="btn-primary btn-sm"
                disabled={start.isPending}
                onClick={() => {
                  start.mutate(shown.id);
                }}
              >
                Build now
              </button>
              {shown.fileName === undefined ? null : (
                <a className="btn btn-sm" href={memberHref({ ...shown, fileName: shown.fileName })}>
                  Open in Model
                </a>
              )}
            </div>
            {shownBuilds.length === 0 ? null : (
              <section aria-label="Builds">
                <h3 className="build-panel__head">Builds</h3>
                <ul className="build-panel__builds">
                  {shownBuilds.map((build) => (
                    <BuildJobs
                      key={build.n}
                      id={build.id}
                      name={shownOf(shown).name}
                      tokens={build.tokens}
                      pollMs={pollMs}
                    />
                  ))}
                </ul>
                {/* research/cube/refresh-jobs-caching.md, gotcha 3. */}
                <p className="build-panel__note">
                  States are Cube&rsquo;s own. Cube 1.7.42 reports <code>done</code> once the
                  partition&rsquo;s table exists, which a failed import can leave behind.
                </p>
              </section>
            )}
          </>
        )}
      </aside>
    </div>
  );
}
