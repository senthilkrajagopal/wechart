import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type ReactNode } from 'react';

import { StateLine } from '../../shell/StatusIcon';
import { BuiltWhen, folderTextOf, periodOf, type Starter } from './builds';
import { Status } from './StateBadge';

/**
 * A rollup's partitions in Jobs' pane (T375, AC-145; design 16, screen 1
 * pins 10–12, state A): every partition Cube derives from its build range,
 * in UTC, newest first, each with a checkbox, its period, its state and when
 * Cube last built it; Rebuild selected (n), one jobs request per partition,
 * and Build all. A rollup that isn't partitioned is one row, built whole with
 * Build now (A2); a lambda or a rollup join names the rollups it combines
 * (A3); and while Cube still works its partitions out, they're asked for
 * again, never shown as none (A4).
 */
type PartitionState = 'built' | 'not-built' | 'building' | 'queued' | 'stalled' | 'failed';

export interface PartitionRow {
  readonly tableName: string;
  readonly start: string | null;
  readonly end: string | null;
  readonly state: PartitionState;
  readonly lastBuiltAt: string | null;
  readonly startedBy?: Starter;
  readonly failed?: {
    readonly runId: string;
    readonly at: string;
    readonly serving: string | null;
  };
}

interface PartitionsAnswer {
  readonly id: string;
  readonly name: string;
  readonly kind: 'partitioned' | 'whole' | 'combined';
  readonly granularity: string | null;
  readonly partitions: readonly PartitionRow[];
  readonly builtFrom?: readonly {
    readonly id: string;
    readonly name: string;
    readonly folderPath: readonly string[] | null;
  }[];
}

/** Cube is still working the partitions out: asked again (A4). */
class StillWorking extends Error {}

/** A time of day, "14:05". */
const hourOf = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });

/** A state in design 16's words, with its icon (pins 5, 12; the legend). */
function StateOf({ row }: { row: PartitionRow }) {
  switch (row.state) {
    case 'built':
      return <Status kind="ok" label="Built" testId="partition-state" state="built" />;
    case 'building':
      return <Status kind="run" label="Building" testId="partition-state" state="building" />;
    case 'queued':
      return (
        <Status
          kind="idle"
          label={`Queued${row.startedBy === undefined ? '' : ` · ${row.startedBy.name}`}`}
          testId="partition-state"
          state="queued"
        />
      );
    case 'stalled':
      return <Status kind="warn" label="Stalled" testId="partition-state" state="stalled" />;
    case 'failed':
      return (
        <>
          <Status
            kind="err"
            label={`Failed${row.failed === undefined ? '' : ` · ${hourOf(row.failed.at)}`}`}
            testId="partition-state"
            state="failed"
          />
          {row.failed?.serving === null || row.failed === undefined ? null : (
            <span className="build-queue__sub">
              Serving the build of {hourOf(row.failed.serving)}
            </span>
          )}
        </>
      );
    default:
      // No version yet: design 16's s-off, as its legend draws it.
      return <Status kind="off" label="Not built" testId="partition-state" state="not-built" />;
  }
}

/** What a checkbox reads: its period and its state (design 16, keyboard). */
function labelOf(row: PartitionRow, period: string): string {
  switch (row.state) {
    case 'failed':
      return `${period}, Failed${row.failed === undefined ? '' : ` at ${hourOf(row.failed.at)}`}`;
    case 'not-built':
      return `${period}, Not built`;
    default:
      return `${period}, ${row.state.charAt(0).toUpperCase()}${row.state.slice(1)}`;
  }
}

/** "Sep 2026", "Sep 2026 and Aug 2026", "Sep 2026, Aug 2026 and Jul 2026". */
const listed = (names: readonly string[]) =>
  names.length < 2
    ? (names[0] ?? '')
    : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1] ?? ''}`;

/** "1 partition", "2 partitions". */
const partitionsCount = (n: number) => `${String(n)} partition${n === 1 ? '' : 's'}`;

export interface Started {
  readonly runId?: string;
  readonly tokens: readonly string[];
  /** In words, for the toast: "Rebuilding Sep 2026 and Aug 2026 of orders.by_month". */
  readonly said: string;
}

export function Partitions({
  id,
  name,
  pollMs = 5_000,
  onStarted = () => undefined,
  children,
}: {
  readonly id: string;
  readonly name: string;
  readonly pollMs?: number;
  readonly onStarted?: (started: Started) => void;
  /** More actions, after the builds: Open in Model. */
  readonly children?: ReactNode;
}) {
  const client = useQueryClient();
  const found = useQuery({
    queryKey: ['jobs', 'partitions', id],
    queryFn: async ({ signal }): Promise<PartitionsAnswer> => {
      const response = await fetch(`/api/jobs/partitions?preagg=${encodeURIComponent(id)}`, {
        signal,
      });
      const body = (await response.json().catch(() => null)) as
        (PartitionsAnswer & { error?: unknown; pending?: boolean }) | null;
      if (response.status === 503 && body?.pending === true) throw new StillWorking();
      if (!response.ok || body === null)
        throw new Error(
          typeof body?.error === 'string'
            ? body.error
            : `The partitions could not be read (${String(response.status)}).`,
        );
      return body;
    },
    // States change as builds go: read again while the pane is open.
    refetchInterval: pollMs,
  });
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [said, setSaid] = useState('');
  /** What Cube didn't start of the last build asked for: none, or some partitions. */
  const [unstarted, setUnstarted] = useState('');
  const all = useRef<HTMLInputElement>(null);
  const answer = found.data;
  const parts = answer?.partitions ?? [];
  const periodFor = (row: PartitionRow) =>
    row.start === null ? 'Whole pre-aggregation' : periodOf(row.start, answer?.granularity ?? null);
  const chosen = parts.filter((row) => row.start !== null && selected.has(row.start));
  useEffect(() => {
    if (all.current !== null)
      all.current.indeterminate = chosen.length > 0 && chosen.length < parts.length;
  });

  const build = useMutation({
    mutationFn: async (starts: readonly string[] | undefined) => {
      const response = await fetch('/api/builds', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(
          starts === undefined
            ? { preAggregation: id }
            : { preAggregation: id, partitions: starts },
        ),
      });
      const body = (await response.json().catch(() => null)) as {
        tokens?: string[];
        runId?: string;
        /** The partitions Cube refused, with its words; the others started (T375's review). */
        notStarted?: { start: string; error: string }[];
        error?: string;
      } | null;
      if (!response.ok || body === null)
        throw new Error(
          body?.error ?? `The build didn’t start (status ${String(response.status)}).`,
        );
      return body;
    },
    onSuccess: (body, starts) => {
      const refused = new Set((body.notStarted ?? []).map((each) => each.start));
      const begun = (starts ?? []).filter((start) => !refused.has(start));
      const periodAt = (start: string) => periodOf(start, answer?.granularity ?? null);
      // While Cube still works the list out, Build all knows no count (A4).
      const every =
        parts.length === 0 ? 'all its partitions' : `all ${partitionsCount(parts.length)}`;
      // The toast's words (design 16, A1), naming the pre-aggregation: what started.
      const words =
        starts === undefined
          ? answer?.kind === 'whole'
            ? `Building ${name}`
            : `Building ${every} of ${name}`
          : `Rebuilding ${listed(begun.map(periodAt))} of ${name}`;
      // What didn't start, said beside the actions, as the old pane said it (T375's review).
      const none = (body.tokens ?? []).length === 0;
      setUnstarted(
        none
          ? `Cube started no job: no partition of ${name} was built.`
          : (body.notStarted ?? []).length === 0
            ? ''
            : `Cube didn’t start ${(body.notStarted ?? [])
                .map((each) => `${periodAt(each.start)}: ${each.error}`)
                .join('; ')}`,
      );
      // The polite live region's short words (design 16, keyboard); the toast says the rest.
      setSaid(
        none
          ? 'No job started'
          : starts === undefined
            ? answer?.kind === 'whole'
              ? 'Building it whole'
              : `Building ${every}`
            : `Rebuilding ${partitionsCount(begun.length)}`,
      );
      setSelected(new Set());
      onStarted({
        ...(body.runId === undefined ? {} : { runId: body.runId }),
        tokens: body.tokens ?? [],
        said: words,
      });
      void client.invalidateQueries({ queryKey: ['jobs', 'partitions', id] });
    },
  });

  const failedToStart = build.isError ? (
    <StateLine kind="err">{build.error.message}</StateLine>
  ) : unstarted === '' ? null : (
    <StateLine kind="warn">{unstarted}</StateLine>
  );
  /** Build all needs no list (A4): offered while it's read, or can't be (AC-228; T375's review). */
  const buildAll = (
    <button
      type="button"
      className="btn btn-sm"
      disabled={build.isPending}
      onClick={() => build.mutate(undefined)}
    >
      Build all
    </button>
  );
  const liveRegion = (
    <p className="visually-hidden" role="status">
      {said}
    </p>
  );
  if (found.isError && found.error instanceof StillWorking)
    return (
      <>
        {/* Build all needs no list; Rebuild selected waits for it (A4). */}
        <div className="admin-pane__actions">
          <button
            type="button"
            className="btn-primary btn-sm"
            aria-label={`Rebuild 0 selected partitions of ${name}`}
            disabled
          >
            Rebuild selected
          </button>
          {buildAll}
          {children}
        </div>
        {failedToStart}
        {liveRegion}
        <section
          className="build-log__section partitions partitions--pending"
          aria-label="Partitions"
        >
          <StateLine kind="run">Cube is still working out its partitions. Asking again…</StateLine>
          <p className="help build-log__help">
            Cube answers “Continue wait” while it’s still reading a build range, and xcube’s
            partitions route drops that module rather than say so. So a missing answer is asked for
            again. Rebuild selected waits for the list; Build all doesn’t need it.
          </p>
        </section>
      </>
    );
  // Build all and its other actions, Open in Model, stay while the partitions are read or can't be.
  if (found.isPending || found.isError)
    return (
      <>
        <div className="admin-pane__actions">
          {buildAll}
          {children}
        </div>
        {failedToStart}
        {liveRegion}
        {found.isPending ? (
          <StateLine kind="run">Reading the partitions…</StateLine>
        ) : (
          <StateLine kind="err">{found.error?.message}</StateLine>
        )}
      </>
    );

  if (answer?.kind === 'combined')
    return (
      <section className="build-log__section partitions" aria-labelledby={`${id}-parts`}>
        <h3 id={`${id}-parts`}>Partitions</h3>
        <p className="help build-log__help">
          It has no partitions of its own. Cube answers it from the rollups it combines, so build
          those:
        </p>
        <ul className="partitions__from">
          {(answer.builtFrom ?? []).map((each) => (
            <li key={each.id}>
              <span className="run-history__name">{each.name}</span>
              {each.folderPath === null ? null : (
                <span className="build-queue__sub"> · {folderTextOf(each.folderPath)}</span>
              )}{' '}
              <a
                className="link-button"
                href={`/jobs?preagg=${encodeURIComponent(each.id)}`}
                aria-label={`Open ${each.name}`}
              >
                Open
              </a>
            </li>
          ))}
        </ul>
        <div className="admin-pane__actions">{children}</div>
      </section>
    );

  const whole = answer?.kind === 'whole';
  const toggle = (start: string) =>
    setSelected((was) => {
      const next = new Set(was);
      if (next.has(start)) next.delete(start);
      else next.add(start);
      return next;
    });

  return (
    <>
      <div className="admin-pane__actions">
        {whole ? (
          <button
            type="button"
            className="btn-primary btn-sm"
            disabled={build.isPending}
            onClick={() => build.mutate(undefined)}
          >
            Build now
          </button>
        ) : (
          <>
            <button
              type="button"
              className="btn-primary btn-sm"
              aria-label={`Rebuild ${String(chosen.length)} selected ${chosen.length === 1 ? 'partition' : 'partitions'} of ${name}`}
              disabled={chosen.length === 0 || build.isPending}
              onClick={() => build.mutate(chosen.map((row) => row.start!))}
            >
              Rebuild selected{chosen.length === 0 ? '' : ` (${String(chosen.length)})`}
            </button>
            <button
              type="button"
              className="btn btn-sm"
              disabled={build.isPending}
              onClick={() => build.mutate(undefined)}
            >
              Build all {parts.length}
            </button>
          </>
        )}
        {children}
      </div>
      {failedToStart}
      {liveRegion}
      <section className="build-log__section partitions" aria-labelledby={`${id}-parts`}>
        <h3 id={`${id}-parts`}>
          Partitions <span className="partitions__note">· UTC, newest first</span>
        </h3>
        <table className="query-log partitions__table" aria-label={`Partitions of ${name}`}>
          {whole ? null : (
            <thead>
              <tr>
                <th scope="col">
                  <input
                    ref={all}
                    type="checkbox"
                    aria-label={`Select all ${partitionsCount(parts.length)}`}
                    checked={parts.length > 0 && chosen.length === parts.length}
                    onChange={(event) =>
                      setSelected(
                        new Set(
                          event.target.checked
                            ? parts.flatMap((row) => (row.start === null ? [] : [row.start]))
                            : [],
                        ),
                      )
                    }
                  />
                </th>
                <th scope="col">Period</th>
                <th scope="col">State</th>
                <th scope="col">Last built</th>
              </tr>
            </thead>
          )}
          <tbody>
            {parts.map((row) => {
              const period = periodFor(row);
              return (
                <tr
                  key={row.tableName}
                  className={
                    row.start !== null && selected.has(row.start) ? 'is-picked' : undefined
                  }
                >
                  {whole ? null : (
                    <td>
                      <input
                        type="checkbox"
                        aria-label={labelOf(row, period)}
                        checked={row.start !== null && selected.has(row.start)}
                        onChange={() => {
                          if (row.start !== null) toggle(row.start);
                        }}
                      />
                    </td>
                  )}
                  <td>{period}</td>
                  <td className="build-queue__state">
                    <StateOf row={row} />
                  </td>
                  <td>{row.lastBuiltAt === null ? '—' : <BuiltWhen iso={row.lastBuiltAt} />}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {whole ? (
          <p className="help build-log__help">Not partitioned, so it’s always built whole.</p>
        ) : null}
      </section>
    </>
  );
}
