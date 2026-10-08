import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import { useNarrowWindow } from '../../dashboard/useNarrowWindow';
import { dayOf } from '../../shell/formatTime';
import { StateLine } from '../../shell/StatusIcon';
import {
  BuildOutcomeStatus,
  clockOf,
  durationOf,
  partitionsOf,
  periodOfTable,
  shortToken,
  StarterLabel,
  useSingleUser,
  whenOf,
  type BuildSummary,
} from './builds';
import { readErrorOf } from './ListStates';
import { SheetTrap, useSheetEscape } from './Sheet';
import { StateBadge } from './StateBadge';

/**
 * A build's log, in Run history's pane (T374, AC-150; design 16, state B):
 * how it ended, what it built, where, who started it and how, when it ended
 * and how long it took as wechart saw it, Cube's error, and each state Cube
 * reported for each job, with its token and the time wechart saw it.
 */
export interface LogEntry {
  readonly at: string;
  readonly status: string;
  readonly table?: string;
}

export interface BuildRecord extends Omit<BuildSummary, 'jobs' | 'progress'> {
  readonly requestId: string;
  /** When Cube answered the post with the jobs. */
  readonly answeredAt: string;
  readonly tokens: readonly {
    readonly token: string;
    readonly status: string | null;
    readonly table: string | null;
    readonly finished: boolean;
    readonly finishedAt: string | null;
    readonly log: readonly LogEntry[];
  }[];
}

/**
 * How it was started, in words: "with Rebuild selected in Jobs". With
 * sign-in off, the one user is "you" (G7; T610).
 */
function howOf(record: BuildRecord, single: boolean): string {
  const who = (person: { readonly name: string }) => (single ? 'you' : person.name);
  if (record.starter.kind === 'schedule')
    // A Run now names who chose it (T555's review).
    return record.starter.by === undefined
      ? `by ${record.starter.name}, a wechart schedule`
      : `by ${who(record.starter.by)}, with Run now on ${record.starter.name}, a wechart schedule`;
  const how =
    record.via === 'rebuild-selected'
      ? 'Rebuild selected'
      : record.granularity === null
        ? 'Build now'
        : 'Build all';
  return `by ${who(record.starter)}, with ${how} in Jobs`;
}

/** A Cube Store table shortened to its partition: "…by_month20260801_abcd…". */
function shortTable(table: string): string {
  const name = table.slice(table.lastIndexOf('.') + 1);
  const parts = name.split('_');
  const base = parts.slice(0, -3).join('_');
  const content = parts.at(-3) ?? '';
  return `…${base.slice(-16)}_${content.slice(0, 4)}…`;
}

/** Whether two times fall on one day, the reader's. */
const sameDay = (a: string, b: string) => new Date(a).toDateString() === new Date(b).toDateString();

/**
 * A log line's time: to the millisecond on the day the build started, and
 * with its date on any other (state B2), "3 Oct 12:14:40".
 */
function timeOf(at: string, startedAt: string): string {
  if (sameDay(at, startedAt)) return clockOf(at, true);
  // "26 Sep", never en-GB's "26 Sept" (T477).
  return `${dayOf(new Date(at))} ${clockOf(at)}`;
}

interface Line {
  readonly at?: string;
  readonly text: string;
  readonly title?: string;
  readonly gap?: boolean;
  readonly bad?: boolean;
}

/**
 * The log's lines: the ask, Cube's answer with its jobs, then each state
 * each job reported, in the order wechart saw them. One whose record Cube
 * dropped before its end was seen has the gap named (state B2).
 */
function linesOf(record: BuildRecord): Line[] {
  const asked =
    record.partitions === null
      ? record.granularity === null
        ? 'the whole pre-aggregation'
        : 'every partition'
      : partitionsOf({ ...record, jobs: record.tokens.length });
  const many = record.tokens.length > 1;
  const lines: Line[] = [
    { at: record.startedAt, text: `Asked Cube to build ${asked}` },
    many
      ? { at: record.answeredAt, text: `${String(record.tokens.length)} jobs, one per partition` }
      : {
          at: record.answeredAt,
          text: `1 job · token ${shortToken(record.tokens[0]?.token ?? '')}`,
          title: record.tokens[0]?.token ?? '',
        },
  ];
  const entries = record.tokens.flatMap((job) => {
    // Each line of several jobs names its job: by its partition, else its token.
    const named = periodOfTable(job.table, record.granularity) ?? shortToken(job.token);
    let table: string | undefined;
    return job.log.map((entry, at) => {
      const shown = entry.table !== undefined && entry.table !== table ? entry.table : undefined;
      if (entry.table !== undefined) table = entry.table;
      return {
        entry,
        // The gap before the record Cube no longer had, which ended the job
        // (B2): what's known, not why — wechart can't tell.
        gap: job.finished && job.status === 'not_found' && at === job.log.length - 1 && at > 0,
        text: `${many ? `${named}: ` : ''}${entry.status}${
          shown === undefined ? '' : ` · table ${shortTable(shown)}`
        }`,
      };
    });
  });
  entries.sort((a, b) => a.entry.at.localeCompare(b.entry.at));
  for (const { entry, gap, text } of entries) {
    if (gap) lines.push({ text: 'wechart didn’t see how it ended', gap: true });
    lines.push({
      at: entry.at,
      text,
      bad: entry.status.startsWith('failure') || entry.status === 'missing_partition',
    });
  }
  return lines;
}

/** One build's record, as its log reads it; refused or not found with its status (G6; T610). */
export const buildQueryOf = (id: string) => ({
  queryKey: ['jobs', 'build', id] as const,
  queryFn: async ({ signal }: { signal?: AbortSignal }): Promise<BuildRecord> => {
    const response = await fetch(
      `/api/jobs/builds/${encodeURIComponent(id)}`,
      signal === undefined ? {} : { signal },
    );
    if (!response.ok)
      throw await readErrorOf(response, 'The build could not be read', 'GET /api/jobs/builds/…');
    return (await response.json()) as BuildRecord;
  },
});

export function BuildLog({
  id,
  onClose,
  active = true,
}: {
  id: string;
  onClose: () => void;
  /** Whether Run history's tab is shown: a sheet keeps Tab and takes Esc only then (T640). */
  active?: boolean;
}) {
  const single = useSingleUser();
  const found = useQuery({
    ...buildQueryOf(id),
    // Followed while it is open; still once it has ended.
    refetchInterval: (query) => (query.state.data?.outcome === null ? 2_000 : false),
  });
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), [id]);
  // Esc closes it, as the `.source-pane` sheets close (T640; rule 85).
  const pane = useRef<HTMLElement>(null);
  const narrow = useNarrowWindow();
  useSheetEscape(pane, active, onClose);
  const record = found.data;
  const name = record?.name ?? '';

  return (
    <aside ref={pane} className="admin-pane build-log" aria-label={`Build of ${name}`}>
      {/* Tab stays in it while it covers the page, below 1,024 px (T640). */}
      {narrow && active ? <SheetTrap pane={pane} /> : null}
      <div className="admin-pane__head" data-testid="pane-head">
        <h2 className="admin-pane__title build-log__title" ref={heading} tabIndex={-1}>
          Build of <code>{name}</code>
        </h2>
        <button type="button" className="btn-ghost btn-sm" aria-label="Close" onClick={onClose}>
          ×
        </button>
      </div>
      {/* What scrolls under the head, the sheet's body below 1,024 px (T640). */}
      <div className="admin-pane__body">
        {found.isPending ? <StateLine kind="run">Reading the build…</StateLine> : null}
        {found.isError ? <StateLine kind="err">{found.error.message}</StateLine> : null}
        {record === undefined ? null : (
          <>
            <dl className="admin-pane__facts" role="group" aria-label="Build">
              <dt>Outcome</dt>
              <dd>
                <BuildOutcomeStatus
                  build={{
                    ...record,
                    jobs: record.tokens.length,
                    progress: {
                      done: record.tokens.filter((job) => job.finished).length,
                      building: record.tokens.filter(
                        (job) => !job.finished && job.status === 'processing',
                      ).length,
                    },
                  }}
                />
              </dd>
              <dt>{record.partitions?.length === 1 ? 'Partition' : 'Partitions'}</dt>
              <dd>
                {partitionsOf({ ...record, jobs: record.tokens.length })}
                {record.granularity === null ? '' : ' · UTC'}
              </dd>
              <dt>Folder</dt>
              <dd>{record.folderPath.join(' / ')}</dd>
              <dt>Started</dt>
              <dd>
                <time dateTime={record.startedAt} title={whenOf(record.startedAt).utc}>
                  {whenOf(record.startedAt).shown}
                </time>{' '}
                {howOf(record, single)}
              </dd>
              <dt>Ended</dt>
              <dd>
                {record.endedAt === null || record.durationMs === null
                  ? record.outcome === null
                    ? 'Not yet'
                    : '—'
                  : `${sameDay(record.endedAt, record.startedAt) ? clockOf(record.endedAt) : whenOf(record.endedAt).shown} · ${durationOf(record.durationMs)}, as wechart saw it`}
              </dd>
            </dl>
            {record.starter.kind === 'schedule' ? (
              <p className="build-log__starter">
                <StarterLabel starter={record.starter} />
              </p>
            ) : null}
            {record.outcome === 'expired' ? (
              <p className="help build-log__help">
                Cube no longer knew this job when wechart asked again: it keeps a job’s record for
                24 hours. How the build ended can’t be known, so it isn’t counted as Done or Failed.
              </p>
            ) : null}
            {record.error === null ? null : (
              <section className="build-log__section" aria-labelledby={`${id}-error`}>
                <h3 id={`${id}-error`}>Cube’s error</h3>
                <pre className="build-log__error">{record.error}</pre>
              </section>
            )}
            {record.tokens.length > 1 ? (
              <table className="query-log build-log__parts" aria-label="Partitions of this build">
                <thead>
                  <tr>
                    <th scope="col">Partition</th>
                    <th scope="col">State</th>
                    <th scope="col">Token</th>
                  </tr>
                </thead>
                <tbody>
                  {record.tokens.map((job) => (
                    <tr key={job.token}>
                      <td>
                        {periodOfTable(job.table, record.granularity) ??
                          (record.granularity === null ? 'Whole' : '—')}
                      </td>
                      <td>
                        <StateBadge status={job.status ?? ''} />
                      </td>
                      <td>
                        <code title={job.token}>{shortToken(job.token)}</code>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
            <section className="build-log__section" aria-labelledby={`${id}-log`}>
              <h3 id={`${id}-log`}>Log · what Cube reported, when wechart saw it</h3>
              {/* A list that scrolls and takes focus, as TableScroll's region does (design 16, keyboard). */}
              {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
              <ol className="build-log__lines" tabIndex={0}>
                {linesOf(record).map((line, at) => (
                  <li
                    key={at}
                    className={
                      line.gap ? 'build-log__gap' : line.bad === true ? 'build-log__bad' : undefined
                    }
                  >
                    <span className="build-log__time">
                      {line.at === undefined ? '' : timeOf(line.at, record.startedAt)}
                    </span>
                    <span {...(line.title === undefined ? {} : { title: line.title })}>
                      {line.text}
                    </span>
                  </li>
                ))}
              </ol>
              <a
                className="link-button"
                href={`/jobs?preagg=${encodeURIComponent(record.preAggregation)}`}
              >
                Show {name} in Pre-aggregations
              </a>
            </section>
          </>
        )}
      </div>
    </aside>
  );
}
