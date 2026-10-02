import { Status } from './StateBadge';

/**
 * How Jobs says a build wechart started (T374, AC-150; design 16, state B):
 * its times, its partitions, its outcome and who started it, each as an icon
 * and words (rule 3), the same in Run history's list and in a build's log.
 */

/** Who or what started a build: a person, or a wechart schedule. */
export type Starter =
  | { readonly kind: 'person'; readonly key: string; readonly name: string }
  | { readonly kind: 'schedule'; readonly id: string; readonly name: string };

export type BuildVia = 'build-all' | 'rebuild-selected' | 'schedule';
export type BuildOutcome = 'done' | 'failed' | 'cancelled' | 'expired';

/** A build as Run history lists it (`GET /api/jobs/builds`). */
export interface BuildSummary {
  readonly id: string;
  /** Its published name, which a link to Jobs names. */
  readonly preAggregation: string;
  /** As people see it: its cube's short name and its own (T371). */
  readonly name: string;
  readonly folderId: string | null;
  /** From Shared down. */
  readonly folderPath: readonly string[];
  /** The partitions asked for, by their starts in UTC; none for every one. */
  readonly partitions: readonly string[] | null;
  /** How its pre-aggregation was partitioned when it was started; none when not. */
  readonly granularity: string | null;
  /** How many jobs Cube made for it: one per partition. */
  readonly jobs: number;
  readonly via: BuildVia;
  readonly starter: Starter;
  readonly startedAt: string;
  readonly endedAt: string | null;
  readonly durationMs: number | null;
  /** None while it is open. */
  readonly outcome: BuildOutcome | null;
  readonly failedCount: number | null;
  readonly error: string | null;
  /** Who cancelled it from the queue, and when (T376). */
  readonly cancelledBy?: { readonly key: string; readonly name: string } | null;
  readonly cancelledAt?: string | null;
  /** While it is open: its jobs done, and building. */
  readonly progress: { readonly done: number; readonly building: number };
}

/** A time of day on one 24-hour clock, "14:05:12", or "14:05:12.204" in a log. */
export const clockOf = (iso: string, ms = false): string =>
  new Date(iso).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    ...(ms ? { fractionalSecondDigits: 3 } : {}),
  });

/** "Today 14:05:12", "Yesterday 16:20:31", then "29 Sep 07:55:00", with UTC for the title. */
export function whenOf(iso: string, now: Date = new Date()): { shown: string; utc: string } {
  const at = new Date(iso);
  const day = new Date(at);
  day.setHours(0, 0, 0, 0);
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  const days = Math.round((midnight.getTime() - day.getTime()) / 86_400_000);
  const date =
    days === 0
      ? 'Today'
      : days === 1
        ? 'Yesterday'
        : at.toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'short',
            ...(at.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
          });
  return { shown: `${date} ${clockOf(iso)}`, utc: `${iso.slice(0, 19).replace('T', ' ')} UTC` };
}

/**
 * When Cube last built something, to the minute — "Today 14:01", "Yesterday
 * 16:20", "28 Sep 09:12" — your local time, UTC on hover (design 16, pins 6
 * and 11, and its footnote).
 */
export function BuiltWhen({ iso }: { iso: string }) {
  const when = whenOf(iso);
  return (
    <time dateTime={iso} title={when.utc}>
      {when.shown.replace(/(\d{2}:\d{2}):\d{2}$/, '$1')}
    </time>
  );
}

/** "6 s", "41 s", "2 min 4 s", "1 h 3 min": how long, in words. */
export function durationOf(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${String(seconds)} s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    const rest = seconds % 60;
    return rest === 0 ? `${String(minutes)} min` : `${String(minutes)} min ${String(rest)} s`;
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${String(hours)} h` : `${String(hours)} h ${String(rest)} min`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * A partition by its period (research cube/system-partitions.md, "Derivation
 * of partitions"): its start, a UTC wall-clock `YYYY-MM-DDTHH:mm:ss.SSS`, as
 * its granularity names it — "Aug 2026", "29 Sep 2026", "Q3 2026", "Week of
 * 28 Sep 2026", "2026", "29 Sep 2026, 14:00".
 */
export function periodOf(start: string, granularity: string | null): string {
  const [date = '', time = ''] = start.split('T');
  const [year = '', month = '01', day = '01'] = date.split('-');
  const monthName = MONTHS[Number(month) - 1] ?? month;
  const dayName = `${String(Number(day))} ${monthName} ${year}`;
  switch (granularity) {
    case 'year':
      return year;
    case 'quarter':
      return `Q${String(Math.floor((Number(month) - 1) / 3) + 1)} ${year}`;
    case 'month':
      return `${monthName} ${year}`;
    case 'week':
      return `Week of ${dayName}`;
    case 'hour':
    case 'minute':
      return `${dayName}, ${time.slice(0, 5)}`;
    default:
      return dayName;
  }
}

/** The partition a job's table builds, from the name Cube gives it (research cube/job-records.md, "Table names"). */
export function periodOfTable(table: string | null, granularity: string | null): string | null {
  if (table === null || granularity === null) return null;
  const base = table.split('_').slice(0, -3).join('_');
  const length = granularity === 'hour' ? 10 : granularity === 'minute' ? 12 : 8;
  const digits = base.slice(-length);
  if (!/^\d+$/.test(digits)) return null;
  const start = `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}T${
    digits.slice(8, 10) || '00'
  }:${digits.slice(10, 12) || '00'}:00.000`;
  return periodOf(start, granularity);
}

/** What a build asked for: "Whole", "All 10", "Aug 2026", "Sep, Aug 2026". */
export function partitionsOf(
  build: Pick<BuildSummary, 'partitions' | 'granularity' | 'jobs'>,
): string {
  if (build.partitions === null)
    return build.granularity === null ? 'Whole' : `All ${String(build.jobs)}`;
  const starts = build.partitions;
  const years = new Set(starts.map((start) => start.slice(0, 4)));
  // Months of one year say the year once (design 16, B1).
  if (build.granularity === 'month' && years.size === 1)
    return `${starts.map((start) => MONTHS[Number(start.slice(5, 7)) - 1] ?? '').join(', ')} ${[...years][0]!}`;
  return starts.map((start) => periodOf(start, build.granularity)).join(', ');
}

/** How a build ended, or how far it has got while open, as an icon and words. */
export function BuildOutcomeStatus({
  build,
}: {
  build: Pick<
    BuildSummary,
    'outcome' | 'failedCount' | 'jobs' | 'progress' | 'cancelledBy' | 'cancelledAt'
  >;
}) {
  const ofAll = (n: number) => ` · ${String(n)} of ${String(build.jobs)}`;
  switch (build.outcome) {
    case 'done':
      return <Status kind="ok" label="Done" testId="build-outcome" state="done" />;
    case 'failed':
      return (
        <Status
          kind="err"
          label={`Failed${build.jobs > 1 ? ofAll(build.failedCount ?? 0) : ''}`}
          testId="build-outcome"
          state="failed"
        />
      );
    case 'cancelled': {
      // By whom and when (design 16, C2): "Cancelled · by Wren Writer, 14:39".
      const by = build.cancelledBy?.name;
      const at =
        typeof build.cancelledAt === 'string'
          ? new Date(build.cancelledAt).toLocaleTimeString('en-GB', {
              hour: '2-digit',
              minute: '2-digit',
              hour12: false,
            })
          : undefined;
      return (
        <Status
          kind="cancel"
          label={`Cancelled${by === undefined ? '' : ` · by ${by}${at === undefined ? '' : `, ${at}`}`}`}
          testId="build-outcome"
          state="cancelled"
        />
      );
    }
    case 'expired':
      return (
        <Status kind="warn" label="Cube’s record expired" testId="build-outcome" state="expired" />
      );
    default:
      return build.progress.building > 0 ? (
        <Status
          kind="run"
          label={`Building${ofAll(build.progress.done)}`}
          testId="build-outcome"
          state="building"
        />
      ) : (
        <Status
          kind="idle"
          label={`Queued${ofAll(build.progress.done)}`}
          testId="build-outcome"
          state="queued"
        />
      );
  }
}

/** A person's icon, or a wechart schedule's calendar, beside their name (design 16, rule 3). */
export function StarterLabel({ starter }: { starter: Starter }) {
  return (
    <span className="owner" data-testid="starter">
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" data-icon={starter.kind}>
        {starter.kind === 'person' ? (
          <>
            <circle cx="8" cy="5.5" r="2.6" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <path
              d="M3 13.5c.6-2.6 2.6-4 5-4s4.4 1.4 5 4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            />
          </>
        ) : (
          <>
            <rect
              x="2.2"
              y="3.2"
              width="11.6"
              height="10.6"
              rx="1.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
            />
            <path
              d="M2.2 6.5h11.6M5.3 1.8v2.8M10.7 1.8v2.8"
              stroke="currentColor"
              strokeWidth="1.4"
            />
            <circle cx="8" cy="10" r="1.3" fill="currentColor" />
          </>
        )}
      </svg>
      {starter.name}
    </span>
  );
}

/** A folder's path below Shared, "Sales / EMEA"; the root's "Shared". */
export const folderTextOf = (path: readonly string[]): string =>
  path.length <= 1 ? (path[0] ?? 'Shared') : path.slice(1).join(' / ');

/** A long token shortened, "9f2c41e0…a41e"; the whole of it in the title. */
export const shortToken = (token: string): string =>
  token.length <= 14 ? token : `${token.slice(0, 8)}…${token.slice(-4)}`;
