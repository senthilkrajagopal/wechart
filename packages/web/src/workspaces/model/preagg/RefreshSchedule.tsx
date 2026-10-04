import {
  nextRefreshesBeforeChange,
  refreshEveryRefusal,
  refreshLagSeconds,
  refreshPeriodOf,
} from '@wechart/core';
import { useId, useState } from 'react';

import { StatusIcon } from '../../../shell/StatusIcon';

/**
 * A pre-aggregation's refresh key as a schedule (T159, AC-153): a cron or an
 * interval, a time zone for a cron, the next runs the key implies, and how
 * late Cube's refresh worker may start one.
 *
 * Cube's refresh worker owns the schedule (the user's "Cube-owned now",
 * 2026-09-24): what is set here is written into the model as the key's
 * `every` and `timezone`, and published as any model change is. Only what
 * Cube can run as written is taken (`refreshEveryRefusal`, T258); anything
 * else is said at the field and not written. A cron runs in its zone, or in
 * UTC with none; an interval ignores a zone, so none is written with one
 * (research/cube/refresh-key-schedule.md, "YAML to write").
 */
type Value = Record<string, unknown>;

/** The keys a schedule is made of: anything else (a key of SQL) is not one. */
const SCHEDULE_KEYS = new Set([
  'every',
  'timezone',
  'incremental',
  'update_window',
  'updateWindow',
]);

/** Whether a refresh key is a schedule this control edits: none yet, or `every` and its settings. */
export function isSchedule(value: unknown): boolean {
  if (value === undefined) return true;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const key = value as Value;
  return (
    Object.keys(key).every((name) => SCHEDULE_KEYS.has(name)) &&
    (key['every'] === undefined || typeof key['every'] === 'string') &&
    (key['timezone'] === undefined || typeof key['timezone'] === 'string')
  );
}

/** Every zone this browser knows, UTC first; a cube's refresh key picks from them too (T481). */
export function zones(): string[] {
  const known = (Intl as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf;
  const all = known === undefined ? [] : known('timeZone');
  return ['UTC', ...all.filter((zone) => zone !== 'UTC')];
}

/** How late, in words: seconds under a minute and a half, else halves of minutes. */
export function lagInWords(seconds: number): string {
  if (seconds < 90) return `${String(seconds)} seconds`;
  const halves = Math.round(seconds / 30);
  const whole = Math.floor(halves / 2);
  return `${String(whole)}${halves % 2 === 1 ? '½' : ''} minutes`;
}

/** Keys that need `every` beside them: Cube's validator requires `every` or `sql` (research, "Where each key is allowed"). */
const NEEDS_EVERY = ['incremental', 'update_window', 'updateWindow'];

/** The day of a clock change in its zone: "Sun 1 Nov". */
const dayIn = (zone: string, at: Date) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: zone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(at);

export function RefreshSchedule({
  id,
  value,
  onChange,
  scheduled = true,
}: {
  id: string;
  value: unknown;
  onChange: (next: unknown) => void;
  /** False when the rollup says `scheduled_refresh: false`: the worker never runs its key (T377). */
  scheduled?: boolean;
}) {
  const key = (value ?? {}) as Value;
  const written = typeof key['every'] === 'string' ? key['every'] : '';
  const [draft, setDraft] = useState<string | null>(null);
  // Only the ends' spaces, as Cube drops them: a tab or newline is the cron's (T377).
  const every = (draft ?? written).replace(/^ +| +$/g, '');
  const zone = typeof key['timezone'] === 'string' ? key['timezone'] : undefined;
  // Cleared, with keys that need a schedule left: Cube would refuse the key.
  const stranded =
    every === '' && NEEDS_EVERY.some((name) => key[name] !== undefined)
      ? 'A refresh key with incremental or update_window needs a schedule: Cube refuses one without. Give it one, or remove those in YAML.'
      : undefined;
  const refusal = every === '' ? stranded : refreshEveryRefusal(every);
  const read = every === '' ? undefined : refreshPeriodOf(every);
  const problemId = useId();
  const zoneId = useId();
  const runsId = useId();

  /** The key with `every` set, a zone kept only for a cron; none left, no key. */
  const keyWith = (nextEvery: string, nextZone: string | undefined): unknown => {
    const next: Value = { ...key };
    if (nextEvery === '') delete next['every'];
    else next['every'] = nextEvery;
    const cron = nextEvery !== '' && refreshPeriodOf(nextEvery)?.cron === true;
    if (cron && nextZone !== undefined) next['timezone'] = nextZone;
    else delete next['timezone'];
    return Object.keys(next).length === 0 ? undefined : next;
  };

  // Up to the zone's next daylight-saving change (design 16's Q3), and none
  // for a rollup the worker never refreshes (T377).
  const { runs, change } =
    read === undefined || !scheduled
      ? { runs: [], change: undefined }
      : nextRefreshesBeforeChange(every, read.cron ? zone : undefined, new Date(), 5);
  const shownIn = read?.cron === true ? (zone ?? 'UTC') : 'UTC';
  const format = new Intl.DateTimeFormat('en-GB', {
    timeZone: shownIn,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const lag = every === '' ? undefined : refreshLagSeconds(every);

  return (
    <div className="refresh-schedule">
      <input
        id={id}
        type="text"
        className="refresh-schedule__every"
        placeholder="1 hour (Cube’s default)"
        value={draft ?? written}
        aria-invalid={refusal === undefined ? undefined : true}
        aria-describedby={refusal === undefined ? runsId : problemId}
        onChange={(event) => {
          setDraft(event.target.value);
        }}
        onBlur={() => {
          if (draft === null) return;
          // Only what Cube can run is written; the rest is said, and waits.
          if (refusal !== undefined) return;
          onChange(keyWith(every, zone));
          setDraft(null);
        }}
      />
      {read?.cron === true ? (
        <span className="refresh-schedule__zone">
          <label htmlFor={zoneId}>Time zone</label>
          <select
            id={zoneId}
            className="select-sm"
            value={zone ?? 'UTC'}
            onChange={(event) => {
              onChange(keyWith(every, event.target.value));
              setDraft(null);
            }}
          >
            {zones().map((each) => (
              <option key={each} value={each}>
                {each}
              </option>
            ))}
          </select>
        </span>
      ) : null}
      {refusal === undefined ? null : (
        <span id={problemId} role="alert" className="model-field__problem">
          <StatusIcon kind="err" />
          {refusal}
        </span>
      )}
      {scheduled || every === '' ? null : (
        <p id={runsId} className="refresh-schedule__note" data-testid="refresh-not-scheduled">
          Not scheduled: scheduled_refresh is false, so Cube’s refresh worker never rebuilds it on
          this key. Build it from Jobs.
        </p>
      )}
      {/* With runs, or a clock change before the first of them (T377's review). */}
      {runs.length === 0 && change === undefined ? null : (
        <div id={runsId} className="refresh-schedule__runs">
          {runs.length === 0 ? null : (
            <ol aria-label="Next refreshes">
              {runs.map((run) => (
                <li key={run.getTime()}>
                  {format.format(run)}{' '}
                  <span className="refresh-schedule__zone-name">{shownIn}</span>
                </li>
              ))}
            </ol>
          )}
          {change === undefined ? null : (
            // Cube keeps the offset it took when it generated the key's SQL
            // (design 16's Q3, D5; research cube/refresh-key-schedule.md).
            <p className="refresh-schedule__warn" data-testid="refresh-clock-change">
              <StatusIcon kind="warn" />
              {`The clocks go ${change.back ? 'back' : 'forward'} on ${dayIn(shownIn, change.at)}. Cube may run this key an hour off after that, until it next compiles the model, so later runs aren’t listed.`}
            </p>
          )}
          {lag === undefined ? null : (
            <p className="refresh-schedule__note">
              Cube’s refresh worker checks the key on a beat, so a run can start up to about{' '}
              {lagInWords(lag)} after its time while the worker keeps up — longer while it is busy
              with other pre-aggregations — and then takes as long as its build.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
