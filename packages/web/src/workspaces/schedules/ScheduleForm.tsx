import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useId, useState, type ReactNode } from 'react';

import { StateLine, StatusIcon } from '../../shell/StatusIcon';
import { shownOf } from '../jobs/BuildPanel';
import { dayIn, timeIn, type Schedule } from './schedule';
import {
  clockChangeLine,
  readPreview,
  saveSchedule,
  SUSPEND_AFTER,
  SUSPEND_AFTER_REFUSAL,
  WECHART_SCHEDULES_KEY,
  type ScheduleFields,
  type WechartSchedule,
} from './wechart';

/**
 * A wechart schedule's form (T552, AC-234, AC-392; design 16, screen 2 pins
 * 9–15 and states D1–D4), in the pane: New schedule's, or a schedule's own
 * fields to change. The cron is read back in words as it's typed, or what's
 * wrong with it is named; the zone is required, and starts empty; the next
 * five runs, in the zone and in UTC, mark a clock change among them; a cron
 * a refresh key could run says so (Q11); a rollup whose refresh key runs
 * says that it runs too (Q2). Each run builds every partition (Q7), and a
 * run missed while wechart was stopped is run once or skipped (Q8). Saved at
 * once, with no proposal.
 */

/** A pre-aggregation as Jobs lists it, in the user's folders (T371). */
interface Pickable {
  readonly id: string;
  readonly shortName?: string;
  readonly folderPath?: readonly string[];
  /** A lambda's or a rollup join's: built through the rollups it combines (T375). */
  readonly buildable?: false;
}

/** Every zone this browser knows, for the zone field's suggestions. */
const ZONES: readonly string[] =
  typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];

/**
 * After "rebuilds x": a refresh key's words, run on — "daily at 08:00, Los
 * Angeles", "on Cube’s default, every hour" — or set off after a colon.
 */
function runOn(when: string): string {
  if (when.startsWith('Cube’s default: ')) return ` on Cube’s default, ${when.slice(16)}`;
  return /^(Every|At|When|Daily|Hourly|On)\b/.test(when)
    ? ` ${when.charAt(0).toLowerCase()}${when.slice(1)}`
    : `: ${when}`;
}

/**
 * What a rollup's refresh key does beside this schedule (AC-392, pin 12);
 * none where Cube's refresh worker never runs it, or can't.
 */
export function RefreshKeyRuns({ refreshKey }: { refreshKey: Schedule | undefined }) {
  if (refreshKey?.scheduled !== true || refreshKey.kind === 'unrunnable') return null;
  const name = shownOf(refreshKey).name;
  return (
    <p className="notebar" data-testid="refresh-key-runs">
      <span>
        <b>Its refresh key also runs:</b> Cube’s refresh worker rebuilds {name}
        {runOn(refreshKey.when.replace(/\.$/, ''))}. Both run; this schedule adds builds.
      </span>
    </p>
  );
}

export function ScheduleForm({
  schedule,
  refreshKeys,
  onSaved,
  onCancel,
  children,
}: {
  /** The schedule to change; none, a new one. */
  readonly schedule?: WechartSchedule;
  /** Each rollup's refresh key, as Schedules lists it: what runs beside this one. */
  readonly refreshKeys: readonly Schedule[];
  readonly onSaved: (saved: WechartSchedule) => void;
  readonly onCancel?: () => void;
  /** More of the pane's actions, after Save: Delete. */
  readonly children?: ReactNode;
}) {
  const id = useId();
  const client = useQueryClient();
  const [fields, setFields] = useState<Omit<ScheduleFields, 'suspendAfter'>>(() => ({
    preAggregation: schedule?.preAggregation ?? '',
    name: schedule?.name ?? '',
    cron: schedule?.cron ?? '',
    timezone: schedule?.timezone ?? '',
    missed: schedule?.missed ?? 'once',
  }));
  const set = (change: Partial<ScheduleFields>) => {
    setFields((was) => ({ ...was, ...change }));
  };
  // How many failed runs in a row suspend it, as typed: 3 unless changed (T379, pin 14).
  const [limit, setLimit] = useState(() => String(schedule?.suspendAfter ?? SUSPEND_AFTER));
  const suspendAfter = /^\d+$/.test(limit.trim()) ? Number(limit.trim()) : 0;
  const limitWrong = suspendAfter < 1;

  // The pre-aggregations of the user's folders, as Jobs lists them (T371): New schedule's.
  const pickable = useQuery({
    queryKey: ['preaggregations'],
    queryFn: async () => {
      const response = await fetch('/api/preaggregations');
      if (!response.ok)
        throw new Error(`The pre-aggregations could not be read (${String(response.status)}).`);
      return (await response.json()) as Pickable[];
    },
    enabled: schedule === undefined,
  });

  const cron = fields.cron.trim();
  const zone = fields.timezone.trim();
  // The scheduler's own reading (research pg-boss-12.33.2-installed.md): what's shown is what runs.
  const preview = useQuery({
    queryKey: ['wechart-schedules', 'preview', cron, zone],
    queryFn: ({ signal }) => readPreview(cron, zone, signal),
    enabled: cron !== '',
    placeholderData: keepPreviousData,
  });
  const read = cron === '' ? undefined : preview.data;
  const current = read !== undefined && !preview.isPlaceholderData;

  const save = useMutation({
    // Which schedule, so a refusal finding access gone is told apart (G5; T560).
    ...(schedule === undefined ? {} : { meta: { scheduleId: schedule.id } }),
    mutationFn: () =>
      saveSchedule({ ...fields, name: fields.name.trim(), suspendAfter }, schedule?.id),
    onSuccess: async (saved) => {
      await client.invalidateQueries({ queryKey: WECHART_SCHEDULES_KEY });
      onSaved(saved);
    },
  });

  // Create waits for a pre-aggregation, a name, a cron it can read and a zone (pin 15).
  const complete =
    fields.preAggregation !== '' &&
    fields.name.trim() !== '' &&
    zone !== '' &&
    !limitWrong &&
    current &&
    read.ok &&
    read.runs.length > 0;
  const changed =
    schedule === undefined ||
    fields.name !== schedule.name ||
    fields.cron !== schedule.cron ||
    fields.timezone !== schedule.timezone ||
    fields.missed !== schedule.missed ||
    suspendAfter !== schedule.suspendAfter;
  const refreshKey = refreshKeys.find((each) => each.id === fields.preAggregation);
  const shownZone = read?.ok === true ? (read.timezone ?? zone) : zone;
  // Which field is wrong, said under that field; the cron's words kept when it's the zone.
  const cronWrong = read?.ok === false && read.field !== 'timezone';
  const zoneWrong = read?.ok === false && read.field === 'timezone';
  const words = read?.words;
  /** "Mon 5 Oct", or "Fri 1 Jan 2027" in another year than this one (screen 2, pin 11). */
  const dayOf = (run: Date) => {
    const yearOf = (at: Date) =>
      new Intl.DateTimeFormat('en-US', { timeZone: shownZone, year: 'numeric' }).format(at);
    const year = yearOf(run);
    return year === yearOf(new Date()) ? dayIn(shownZone, run) : `${dayIn(shownZone, run)} ${year}`;
  };

  return (
    <form
      className="schedule-form"
      aria-label={schedule === undefined ? 'New schedule' : `Change ${schedule.name}`}
      onSubmit={(event) => {
        event.preventDefault();
        if (complete && changed && !save.isPending) save.mutate();
      }}
    >
      {schedule === undefined ? (
        <div className="field">
          <label htmlFor={`${id}-preagg`}>Pre-aggregation</label>
          <select
            id={`${id}-preagg`}
            value={fields.preAggregation}
            onChange={(event) => {
              set({ preAggregation: event.target.value });
            }}
            aria-describedby={`${id}-preagg-help`}
          >
            <option value="">Choose a pre-aggregation</option>
            {(pickable.data ?? [])
              .filter((row) => row.buildable !== false)
              .map((row) => {
                const shown = shownOf(row);
                return (
                  <option key={row.id} value={row.id}>
                    {`${shown.name} · ${shown.folder ?? 'Shared'}`}
                  </option>
                );
              })}
          </select>
          <p className="help field__help" id={`${id}-preagg-help`}>
            From the folders where you have read-write access.
          </p>
          {pickable.isError ? <StateLine kind="err">{pickable.error.message}</StateLine> : null}
        </div>
      ) : null}
      <div className="field">
        <label htmlFor={`${id}-name`}>
          Name <span className="field__req">· names its runs in Run history</span>
        </label>
        <input
          id={`${id}-name`}
          type="text"
          value={fields.name}
          onChange={(event) => {
            set({ name: event.target.value });
          }}
        />
      </div>
      <div className="field">
        <label htmlFor={`${id}-cron`}>Cron expression</label>
        <input
          id={`${id}-cron`}
          type="text"
          className="is-code"
          spellCheck={false}
          autoComplete="off"
          value={fields.cron}
          aria-invalid={cronWrong ? true : undefined}
          aria-describedby={`${id}-cron-help ${id}-cron-reading`}
          onChange={(event) => {
            set({ cron: event.target.value });
          }}
        />
        <p className="help field__help" id={`${id}-cron-help`}>
          minute · hour · day of month · month · day of week
        </p>
        <div id={`${id}-cron-reading`} aria-live="polite">
          {words !== undefined ? (
            <p className="schedule-form__reading">{words}</p>
          ) : read?.ok === false && cronWrong ? (
            <p className="field__error">
              <StatusIcon kind="err" />
              <span>{read.problem}</span>
            </p>
          ) : null}
        </div>
      </div>
      <div className="field">
        <label htmlFor={`${id}-zone`}>Time zone</label>
        <input
          id={`${id}-zone`}
          type="text"
          list={`${id}-zones`}
          required
          autoComplete="off"
          value={fields.timezone}
          aria-invalid={zoneWrong ? true : undefined}
          aria-describedby={`${id}-zone-reading`}
          onChange={(event) => {
            set({ timezone: event.target.value });
          }}
        />
        <datalist id={`${id}-zones`}>
          {ZONES.map((each) => (
            <option key={each} value={each} />
          ))}
        </datalist>
        {/* A zone it doesn't know, under the zone (T552's review). */}
        <div id={`${id}-zone-reading`} aria-live="polite">
          {read?.ok === false && zoneWrong ? (
            <p className="field__error">
              <StatusIcon kind="err" />
              <span>{read.problem}</span>
            </p>
          ) : null}
        </div>
      </div>
      {read?.ok === true && read.runs.length > 0 ? (
        <div className="field">
          <span className="field__label" id={`${id}-runs`}>
            Next runs <span className="field__req">· {shownZone}, then UTC</span>
          </span>
          <ol className="schedules__runs" aria-label="Next runs">
            {read.runs.flatMap((iso, at) => {
              const run = new Date(iso);
              const item = (
                <li key={iso}>
                  <span>{dayOf(run)}</span>
                  <span>{timeIn(shownZone, run)}</span>
                  <span className="schedules__utc">{`${timeIn('UTC', run)} UTC`}</span>
                </li>
              );
              // The clock change where it falls among them (D4).
              return read.change !== undefined && read.change.before === at
                ? [
                    <li key="change" className="schedules__change">
                      <span>
                        {clockChangeLine(
                          dayIn(shownZone, new Date(read.change.at)),
                          read.change.back,
                        )}
                      </span>
                    </li>,
                    item,
                  ]
                : [item];
            })}
          </ol>
        </div>
      ) : null}
      {read?.ok === true && read.refreshKeyCould ? (
        <p className="notebar" data-testid="refresh-key-could">
          <span>
            <b>A refresh key could run this.</b> Set in the model as{' '}
            <code>{`every: "${cron}"`}</code>
            {zone === '' ? null : (
              <>
                {' '}
                with <code>{`timezone: ${shownZone}`}</code>
              </>
            )}
            , Cube’s refresh worker runs it, and it changes by proposal. This schedule works too.
          </span>
        </p>
      ) : null}
      {/* A schedule's own pane says it above its fields (D1). */}
      {schedule === undefined ? <RefreshKeyRuns refreshKey={refreshKey} /> : null}
      <div className="field">
        <p className="schedule-form__each" data-testid="each-run">
          <b>Each run</b> builds every partition, as Build all does.
        </p>
        <span className="field__label" id={`${id}-missed`}>
          If wechart was stopped when a run was due
        </span>
        <div role="radiogroup" aria-labelledby={`${id}-missed`} className="schedule-form__choice">
          {(
            [
              ['once', 'Run it once, when wechart is back'],
              ['skip', 'Skip it'],
            ] as const
          ).map(([value, label]) => (
            <label key={value}>
              <input
                type="radio"
                name={`${id}-missed`}
                value={value}
                checked={fields.missed === value}
                onChange={() => {
                  set({ missed: value });
                }}
              />
              {label}
            </label>
          ))}
        </div>
      </div>
      {/* On failure (T379, AC-155; pin 14): a whole number from 1 up, with no "never" (Q9). */}
      <div className="field">
        <span className="field__label">On failure</span>
        <span className="schedule-form__limit">
          Suspend after{' '}
          <input
            type="number"
            min={1}
            step={1}
            inputMode="numeric"
            aria-label="Suspend after failed runs in a row"
            aria-invalid={limitWrong ? true : undefined}
            aria-describedby={`${id}-limit-help${limitWrong ? ` ${id}-limit-error` : ''}`}
            value={limit}
            onChange={(event) => {
              setLimit(event.target.value);
            }}
          />{' '}
          failed runs in a row
        </span>
        <p className="help field__help" id={`${id}-limit-help`} data-testid="suspend-help">
          It then stops running until someone resumes it.
        </p>
        {limitWrong ? (
          <p className="field__error" id={`${id}-limit-error`} data-testid="suspend-error">
            <StatusIcon kind="err" />
            <span>{SUSPEND_AFTER_REFUSAL}</span>
          </p>
        ) : null}
      </div>
      {save.isError ? <StateLine kind="err">{save.error.message}</StateLine> : null}
      <div className="schedule-form__foot">
        {/* Recorded with who made it (T505, AC-294; design 16, state I). */}
        <p className="help" data-testid="applies-at-once">
          Applies at once, with no proposal. Recorded in the audit trail.
        </p>
        <div className="admin-pane__actions">
          {schedule === undefined ? (
            <>
              <button type="button" onClick={onCancel}>
                Cancel
              </button>
              <button type="submit" className="btn-primary" disabled={!complete || save.isPending}>
                Create schedule
              </button>
            </>
          ) : (
            <>
              <button
                type="submit"
                className="btn-primary btn-sm"
                disabled={!complete || !changed || save.isPending}
              >
                Save changes
              </button>
              {children}
            </>
          )}
        </div>
      </div>
    </form>
  );
}
