import { nextRefreshesBeforeChange, refreshPeriodOf, type ClockChange } from '@wechart/core';

/**
 * A refresh-key schedule as Schedules shows it (T551, AC-154; design 16,
 * screen 2 and D5): its row's fields, as `GET /api/schedules` gives them,
 * and how its runs are said.
 */
export interface Schedule {
  readonly id: string;
  readonly folderId?: string | null;
  /** Its cube's short name and folder (T371): what people see (§P2.6 D). */
  readonly shortName?: string;
  readonly folderPath?: readonly string[];
  readonly cube: string;
  readonly name: string;
  readonly type: string;
  readonly fileName?: string;
  /** That file's folder, where it isn't the root (T530). */
  readonly fileFolderId?: string;
  readonly owner: 'cube';
  readonly kind: 'key' | 'sql' | 'default' | 'cube-keys' | 'not-scheduled' | 'unrunnable';
  readonly scheduled: boolean;
  /** In words. */
  readonly when: string;
  /** As the model writes it. */
  readonly written: string;
  /** The key Cube turns over on, where one says when. */
  readonly runs?: { readonly every: string; readonly timezone?: string };
  readonly public?: false;
  /** When Cube last built it; null, never; none known, without xcube's routes. */
  readonly lastBuiltAt?: string | null;
  /** At most how late a run starts, by the key's own threshold (T551's review). */
  readonly lagSeconds?: number;
  /** Why Cube's refresh worker can't run it. */
  readonly problem?: string;
}

/** A schedule's next runs, up to its zone's next clock change (design 16's Q3), with the change. */
export function runsOf(
  schedule: Schedule,
  now: Date,
  count: number,
): { runs: Date[]; change?: ClockChange } {
  if (schedule.runs === undefined || !schedule.scheduled) return { runs: [] };
  return nextRefreshesBeforeChange(schedule.runs.every, schedule.runs.timezone, now, count);
}

/** The zone a schedule's times are shown in: its own, else the viewer's. */
export const zoneOf = (schedule: Schedule): string | undefined => schedule.runs?.timezone;

const format = (zone: string | undefined, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('en-GB', {
    ...(zone === undefined ? {} : { timeZone: zone }),
    ...options,
  });

/** "Thu 24 Sep" in a zone: three-letter months, as design 16 writes them. */
export function dayIn(zone: string | undefined, at: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    ...(zone === undefined ? {} : { timeZone: zone }),
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).formatToParts(at);
  const part = (type: string) => parts.find((each) => each.type === type)?.value ?? '';
  return `${part('weekday')} ${part('day')} ${part('month')}`;
}

/** "08:00" in a zone. */
export const timeIn = (zone: string | undefined, at: Date) =>
  format(zone, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(at);

/** The viewer's own zone: "Europe/Berlin". */
export const viewerZone = (): string => Intl.DateTimeFormat().resolvedOptions().timeZone;

/**
 * A run's moment, in a zone (else yours), as design 16's lists say it:
 * "Today 15:00" on that zone's today, else "Fri 2 Oct, 04:00" (T612).
 */
export function momentIn(zone: string | undefined, at: Date, now: Date): string {
  return dayIn(zone, at) === dayIn(zone, now)
    ? `Today ${timeIn(zone, at)}`
    : `${dayIn(zone, at)}, ${timeIn(zone, at)}`;
}

/** The same, in a sentence (design 16, E1 and E3): "today at 15:00", else "Mon 5 Oct, 07:55". */
export function momentWords(zone: string | undefined, at: Date, now: Date): string {
  return dayIn(zone, at) === dayIn(zone, now)
    ? `today at ${timeIn(zone, at)}`
    : `${dayIn(zone, at)}, ${timeIn(zone, at)}`;
}

/**
 * Whether a time set in a zone needs its UTC time beside it (design 16,
 * screen 2): only one set in another zone than the viewer's (T612).
 */
export const offZone = (setIn: string | undefined): boolean =>
  setIn !== undefined && canonicalZone(setIn) !== canonicalZone(viewerZone());

/** A zone by its one name, "Etc/UTC" as "UTC", so two names of one zone are one (T612's review). */
function canonicalZone(zone: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: zone }).resolvedOptions().timeZone;
  } catch {
    return zone;
  }
}

/**
 * The zone a refresh key's times are set in: for a cron, its own, else UTC,
 * which Cube runs it in; none for an interval, which has no clock, a zone it
 * names included, as Cube ignores one there (research
 * cube/refresh-key-schedule.md; T612's review).
 */
export function keyZoneOf(schedule: Schedule): string | undefined {
  if (schedule.runs === undefined) return undefined;
  if (refreshPeriodOf(schedule.runs.every)?.cron !== true) return undefined;
  return schedule.runs.timezone ?? 'UTC';
}

/** "in 20 min", "in 3 h", "in 31 days". */
export function untilIn(at: Date, now: Date): string {
  const minutes = Math.max(0, Math.round((at.getTime() - now.getTime()) / 60_000));
  if (minutes < 60) return `in ${String(minutes)} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `in ${String(hours)} h`;
  return `in ${String(Math.round(hours / 24))} days`;
}

/** The clocks' change, in design 16 D5's words. */
export const changeWords = (change: ClockChange, zone: string | undefined) =>
  `The clocks go ${change.back ? 'back' : 'forward'} on ${dayIn(zone, change.at)}. Cube may run this key an hour off after that, until it next compiles the model, so later runs aren’t listed.`;
