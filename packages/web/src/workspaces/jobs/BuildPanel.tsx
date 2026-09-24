import { useMutation, useQuery } from '@tanstack/react-query';
import { useRef, useState } from 'react';

import { missingScopeOf, ScopeUnavailable, useScopes } from '../../query/scopes';
import { StateLine } from '../../shell/StatusIcon';
import { StateBadge, stateOf, Status } from './StateBadge';

/**
 * Building a pre-aggregation (T155, AC-149), as the prototype's Jobs page lists
 * them: every pre-aggregation Cube compiled, each with Build. A build is
 * Cube's own job — started through its jobs API, one token per partition —
 * and each token is followed until it reports a state it will not leave.
 */
interface Buildable {
  readonly id: string;
  readonly type: string;
  readonly partitionGranularity?: string;
  /** What rebuilds it, in words: its refresh key (AC-229). */
  readonly trigger?: string;
  /** The model file its cube is defined in (AC-229). */
  readonly fileName?: string;
}

/** Where a pre-aggregation is defined, in the Model workspace (AC-229). */
const modelHref = (fileName: string) => `/model/files/${encodeURIComponent(fileName)}`;

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
}: {
  id: string;
  tokens: readonly string[];
  pollMs: number;
}) {
  const jobs = useBuildStatus(tokens, pollMs);
  const byToken = new Map((jobs.data ?? []).map((job) => [job.token, job]));
  return (
    <li className="build-jobs">
      <span className="build-jobs__id">{id}</span>
      {tokens.length === 0 ? (
        <StateLine kind="warn" testId="build-empty">
          Cube started no job: no partition of {id} was built.
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
      <ul className="build-jobs__list" aria-label={`Jobs building ${id}`}>
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

export function BuildPanel({ pollMs = 1500 }: { pollMs?: number }) {
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
  const [selected, setSelected] = useState<string | null>(null);
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
              {buildable.data.map(({ id, partitionGranularity, trigger, fileName }) => (
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
                    {/* Its definition, in Model (AC-229). */}
                    {fileName === undefined ? id : <a href={modelHref(fileName)}>{id}</a>}
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
                      aria-label={`Build ${id}`}
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
              ))}
            </tbody>
          </table>
        )}
        {/* Starting, in words with its icon, not only by the buttons fading (AC-177). */}
        {start.isPending ? <StateLine kind="run">Asking Cube to start the build…</StateLine> : null}
        {start.isError ? <StateLine kind="err">{start.error.message}</StateLine> : null}
      </div>

      {/* The prototype's docked pane (AC-228): the selected pre-aggregation. */}
      <aside
        className="admin-pane"
        aria-label="Pre-aggregation details"
        /**
         * Held where it starts, and as tall as the window below that
         * (T239's review): sized from the app bar alone, it ran past the
         * window's bottom by the height of the title and tabs above it.
         */
        ref={(node) => {
          if (node === null) return;
          const box = node.getBoundingClientRect();
          // Hidden behind the Queries tab it measures nothing: the default holds.
          if (box.height === 0) return;
          const top = box.top + window.scrollY;
          node.style.setProperty('--pane-top', `${String(Math.round(top))}px`);
        }}
      >
        {shown === undefined ? (
          <p className="admin-pane__empty">
            Select a pre-aggregation to see its state, what rebuilds it, and to build it.
          </p>
        ) : (
          <>
            <h2 className="admin-pane__title">{shown.id}</h2>
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
              <button
                type="button"
                className="btn-primary"
                disabled={start.isPending}
                onClick={() => {
                  start.mutate(shown.id);
                }}
              >
                Build now
              </button>
              {shown.fileName === undefined ? null : (
                <a href={modelHref(shown.fileName)}>Open in Model</a>
              )}
            </div>
            {shownBuilds.length === 0 ? null : (
              <section aria-label="Builds">
                <h3 className="build-panel__head">Builds</h3>
                <ul className="build-panel__builds">
                  {shownBuilds.map((build) => (
                    <BuildJobs key={build.n} id={build.id} tokens={build.tokens} pollMs={pollMs} />
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
