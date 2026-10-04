/**
 * wechart's own schedules as Schedules shows them (T552, AC-234, AC-154;
 * design 16, screen 2 and state D): the rows `GET /api/wechart-schedules`
 * gives, and the form's reading of a cron, `GET /api/wechart-schedules/preview`,
 * which comes from the scheduler's own preview, so what is shown is what runs.
 */
export interface WechartSchedule {
  readonly id: string;
  /** Names its runs in Run history. */
  readonly name: string;
  /** `cube.pre_aggregation`, as published. */
  readonly preAggregation: string;
  readonly folderId: string | null;
  readonly cron: string;
  readonly timezone: string;
  readonly missed: 'once' | 'skip';
  readonly createdBy: { readonly key: string; readonly name: string };
  readonly createdAt: string;
  readonly updatedBy: { readonly key: string; readonly name: string };
  readonly updatedAt: string;
  /** Its pre-aggregation's cube by its short name, and its folder, where the model has it. */
  readonly shortName?: string;
  readonly folderPath?: readonly string[];
  /** Its cron in words. */
  readonly when?: string;
  /** Its next five runs. */
  readonly runs?: readonly string[];
  /** A clock change among them, and how many runs come before it. */
  readonly change?: ClockChangeSeen;
  /** How its last run went; none before its first. */
  readonly lastRun: LastRun | null;
}

export interface ClockChangeSeen {
  readonly at: string;
  readonly back: boolean;
  readonly before: number;
}

export interface LastRun {
  readonly id: string;
  /** None while it is under way. */
  readonly outcome: 'done' | 'failed' | 'cancelled' | 'expired' | null;
  readonly startedAt: string;
  readonly endedAt: string | null;
  readonly error: string | null;
}

/** A cron and zone as the form reads them as they're typed. */
export type CronPreview =
  | {
      readonly ok: true;
      readonly words: string;
      readonly refreshKeyCould: boolean;
      readonly timezone?: string;
      readonly runs: readonly string[];
      readonly change?: ClockChangeSeen;
    }
  | {
      readonly ok: false;
      /** The field that's wrong: the cron, or the zone. */
      readonly field: 'cron' | 'timezone';
      readonly problem: string;
      /** The cron in words, where it is the zone that's wrong. */
      readonly words?: string;
    };

/** What a person sets. */
export interface ScheduleFields {
  readonly preAggregation: string;
  readonly name: string;
  readonly cron: string;
  readonly timezone: string;
  readonly missed: 'once' | 'skip';
}

export const WECHART_SCHEDULES_KEY = ['wechart-schedules'] as const;

/** The API's words for a refusal, else what failed. */
async function refusalOf(response: Response, what: string): Promise<Error> {
  const said = ((await response.json().catch(() => null)) as { error?: unknown } | null)?.error;
  return new Error(typeof said === 'string' ? said : `${what} (${String(response.status)}).`);
}

/**
 * wechart's schedules in the user's folders. None where the API offers none:
 * a server with no scheduler, as in a component's own test.
 */
export async function readWechartSchedules(): Promise<WechartSchedule[]> {
  const response = await fetch('/api/wechart-schedules');
  if (response.status === 404) return [];
  if (!response.ok) throw await refusalOf(response, 'wechart’s schedules could not be read');
  return (await response.json()) as WechartSchedule[];
}

export async function readPreview(
  cron: string,
  timezone: string,
  signal?: AbortSignal,
): Promise<CronPreview> {
  const response = await fetch(
    `/api/wechart-schedules/preview?${new URLSearchParams({ cron, timezone }).toString()}`,
    signal === undefined ? {} : { signal },
  );
  if (!response.ok) throw await refusalOf(response, 'The cron could not be read');
  return (await response.json()) as CronPreview;
}

/** Makes one, or changes the one named, at once (AC-234): the schedule as stored, or the API's refusal. */
export async function saveSchedule(fields: ScheduleFields, id?: string): Promise<WechartSchedule> {
  const response = await fetch(
    id === undefined
      ? '/api/wechart-schedules'
      : `/api/wechart-schedules/${encodeURIComponent(id)}`,
    {
      method: id === undefined ? 'POST' : 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(fields),
    },
  );
  if (!response.ok) throw await refusalOf(response, 'The schedule could not be saved');
  return (await response.json()) as WechartSchedule;
}

export async function deleteSchedule(id: string): Promise<void> {
  const response = await fetch(`/api/wechart-schedules/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  if (!response.ok) throw await refusalOf(response, 'The schedule could not be deleted');
}

/** "Sun 25 Oct: clocks go back an hour" (design 16, D4). */
export const clockChangeLine = (day: string, back: boolean) =>
  `${day}: clocks go ${back ? 'back' : 'forward'} an hour`;
