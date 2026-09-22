import { useMutation, useQuery } from '@tanstack/react-query';
import { useRef, useState } from 'react';

import { StateBadge } from './StateBadge';

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
  const jobs = useQuery({
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
  const byToken = new Map((jobs.data ?? []).map((job) => [job.token, job]));
  return (
    <li className="build-jobs">
      <span className="build-jobs__id">{id}</span>
      {tokens.length === 0 ? (
        <p data-testid="build-empty">Cube started no job: no partition of {id} was built.</p>
      ) : null}
      {jobs.isError ? <p role="alert">{jobs.error.message}</p> : null}
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
  const buildable = useQuery({
    queryKey: ['preaggregations'],
    queryFn: ({ signal }) =>
      fetch('/api/preaggregations', { signal }).then(async (response) => {
        if (!response.ok)
          throw new Error(`The pre-aggregations could not be read (${String(response.status)}).`);
        return (await response.json()) as Buildable[];
      }),
    // Read again each time: a publish adds or removes pre-aggregations.
    refetchOnMount: 'always',
  });
  // Newest first, as a run history reads; numbered, not timed, so two builds
  // started together are still two.
  const [builds, setBuilds] = useState<{ id: string; tokens: string[]; n: number }[]>([]);
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

  if (buildable.isPending) return <p>Reading the pre-aggregations…</p>;
  if (buildable.isError) return <p role="alert">{buildable.error.message}</p>;
  return (
    <div className="build-panel">
      {buildable.data.length === 0 ? (
        <p>The model declares no pre-aggregations.</p>
      ) : (
        <table className="query-log" aria-label="Pre-aggregations">
          <thead>
            <tr>
              <th scope="col">Pre-aggregation</th>
              <th scope="col">Type</th>
              <th scope="col">Partitions</th>
              <th scope="col">
                <span className="visually-hidden">Build</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {buildable.data.map(({ id, type, partitionGranularity }) => (
              <tr key={id}>
                <td className="query-log__query">{id}</td>
                <td>{type}</td>
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
      {start.isError ? <p role="alert">{start.error.message}</p> : null}
      {builds.length === 0 ? null : (
        <section aria-label="Builds">
          <h2 className="build-panel__head">Builds</h2>
          <ul className="build-panel__builds">
            {builds.map((build) => (
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
    </div>
  );
}
