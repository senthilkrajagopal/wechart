import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';

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
  readonly table?: string;
}

/**
 * Finished: done, missing its partition, failed, or unknown to Cube — as the
 * API's `isFinished` (packages/api/src/jobs/build.ts) reads Cube's states.
 */
function isFinished(status: string): boolean {
  return (
    status === 'done' ||
    status === 'missing_partition' ||
    status === 'not_found' ||
    status === 'pre_agg_not_found' ||
    status.startsWith('failure')
  );
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
    refetchInterval: (query) =>
      query.state.data !== undefined && query.state.data.every((job) => isFinished(job.status))
        ? false
        : pollMs,
  });
  const byToken = new Map((jobs.data ?? []).map((job) => [job.token, job]));
  return (
    <li className="build-jobs">
      <span className="build-jobs__id">{id}</span>
      {jobs.isError ? <p role="alert">{jobs.error.message}</p> : null}
      <ul className="build-jobs__list" aria-label={`Jobs building ${id}`}>
        {tokens.map((token) => {
          const job = byToken.get(token);
          return (
            <li key={token} data-testid={`job-${token}`} className="build-jobs__job">
              <code data-testid="job-token">{token}</code>
              <span data-testid="job-state">{job?.status ?? 'asking Cube…'}</span>
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
  });
  // Newest first, as a run history reads.
  const [builds, setBuilds] = useState<{ id: string; tokens: string[]; at: number }[]>([]);
  const start = useMutation({
    mutationFn: (id: string) =>
      send<{ tokens: string[] }>('/api/builds', { body: { preAggregation: id } }),
    onSuccess: ({ tokens }, id) => {
      setBuilds((before) => [{ id, tokens, at: Date.now() }, ...before]);
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
                    disabled={start.isPending && start.variables === id}
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
              <BuildJobs key={build.at} id={build.id} tokens={build.tokens} pollMs={pollMs} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
