import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type ReactNode } from 'react';

import { ExportedToast } from '../../dashboard/export/ExportedToast';
import { dayOf } from '../../shell/formatTime';
import { StateLine, StatusIcon } from '../../shell/StatusIcon';
import { useFocusTrap } from '../../shell/useFocusTrap';
import { shownOf } from '../jobs/BuildPanel';
import { whenOf } from '../jobs/builds';
import { narrowNow, SheetActions } from '../jobs/Sheet';
import { Status } from '../jobs/StateBadge';
import { rollupHref } from '../model/inFolder';
import { lagInWords } from '../model/preagg/RefreshSchedule';
import { OwnerLabel } from './OwnerLabel';
import { PauseSwitch } from './PauseSwitch';
import {
  changeWords,
  dayIn,
  momentWords,
  runsOf,
  timeIn,
  zoneOf,
  type Schedule,
} from './schedule';
import { RefreshKeyRuns, ScheduleForm } from './ScheduleForm';
import {
  deleteSchedule,
  readRunsOf,
  resumeSchedule,
  runScheduleNow,
  WECHART_SCHEDULES_KEY,
  type LastRun,
  type WechartSchedule,
} from './wechart';

/**
 * A refresh key's pane (T551, AC-154; design 16, state D5): read-only, since
 * the key is part of the model. Its schedule in words and its `refresh_key`
 * as written; where it is set, and the way to change it; Open in Model, on
 * the pre-aggregation itself, and Open in Jobs; and its next five runs, in
 * its zone and in UTC, up to the zone's next clock change (Q3), with how
 * late one can start (AC-153).
 */

/** The key as its file writes it: a `refresh_key` block, or the line that stands for one. */
function writtenBlock(written: string): string {
  if (!/^(every|sql):/.test(written)) return written;
  return ['refresh_key:', ...written.split(' · ').map((line) => `  ${line}`)].join('\n');
}

export function SchedulePane({
  schedule,
  now,
  back = null,
}: {
  schedule: Schedule;
  now: Date;
  /** The sheet's ×, first in its head below 1,024 px (design 16, G8; T560). */
  back?: ReactNode;
}) {
  const shown = shownOf(schedule);
  const folder = shown.folder ?? 'Shared';
  const zone = zoneOf(schedule);
  const { runs, change } = runsOf(schedule, now, 5);
  // By the key's own threshold, as the API works it out (T551's review).
  const lag = schedule.lagSeconds;
  const modelHref = rollupHref({
    fileName: schedule.fileName,
    fileFolderId: schedule.fileFolderId,
    cube: schedule.shortName ?? schedule.cube,
    member: schedule.name,
  });
  return (
    <>
      <div className="admin-pane__head">
        {back}
        <h2 className="admin-pane__title" tabIndex={-1}>
          {shown.name}
        </h2>
        <span className="schedules__folder">· {folder}</span>
        <span className="spacer" />
        <OwnerLabel owner={schedule.owner} />
      </div>
      {/* What scrolls under the head, the sheet's body below 1,024 px (T640). */}
      <div className="admin-pane__body">
        <section className="build-log__section" aria-labelledby={`${schedule.id}-schedule`}>
          <h3 id={`${schedule.id}-schedule`}>Schedule</h3>
          <p>{schedule.when}</p>
          <pre className="schedules__written" data-testid="schedule-written">
            {writtenBlock(schedule.written)}
          </pre>
          {/* Why Cube can't run it, as the model editor says it (T551's review). */}
          {schedule.problem === undefined ? null : (
            <StateLine kind="err">{schedule.problem}</StateLine>
          )}
          <p className="help build-log__help" data-testid="schedule-where">
            {schedule.fileName === undefined
              ? `Set in its model in ${folder}, so it’s read-only here.`
              : `Set in ${schedule.fileName} in ${folder}, so it’s read-only here.`}{' '}
            To change it, edit the model in My workspace and propose it.
          </p>
          {/* Pinned in the sheet's foot below 1,024 px (design 16, G8; T640); none, and no empty bar (T610's review). */}
          {modelHref === undefined && schedule.public === false ? null : (
            <SheetActions>
              {modelHref === undefined ? null : (
                <a className="btn btn-sm" href={modelHref}>
                  Open in Model
                </a>
              )}
              {/* Jobs reads only what queries reach: a hidden cube isn't there (T551's review). */}
              {schedule.public === false ? null : (
                <a className="btn btn-sm" href={`/jobs?preagg=${encodeURIComponent(schedule.id)}`}>
                  Open in Jobs
                </a>
              )}
            </SheetActions>
          )}
          {schedule.public === false ? (
            <p className="help build-log__help" data-testid="schedule-not-in-jobs">
              Its cube isn’t public, so Jobs doesn’t list it.
            </p>
          ) : null}
        </section>
        {runs.length === 0 && change === undefined ? null : (
          <section className="build-log__section" aria-labelledby={`${schedule.id}-runs`}>
            <h3 id={`${schedule.id}-runs`}>Next runs · {zone ?? 'your time'}</h3>
            {runs.length === 0 ? null : (
              <ol className="schedules__runs" aria-label="Next runs">
                {runs.map((run) => (
                  <li key={run.getTime()}>
                    <span>{dayIn(zone, run)}</span>
                    <span>{timeIn(zone, run)}</span>
                    <span className="schedules__utc">{`${timeIn('UTC', run)} UTC`}</span>
                  </li>
                ))}
              </ol>
            )}
            {change === undefined ? null : (
              <p className="refresh-schedule__warn" data-testid="schedule-clock-change">
                <StatusIcon kind="warn" />
                {changeWords(change, zone)}
              </p>
            )}
            {lag === undefined ? null : (
              <p className="help build-log__help">
                Cube’s refresh worker checks the key on its own cadence, so a run can start up to
                about {lagInWords(lag)} after its time.
              </p>
            )}
          </section>
        )}
      </div>
    </>
  );
}

/**
 * How a schedule's last run went, as an icon and a word (design 16's
 * legend), with when where it's said: "Done · today 07:55" (T612).
 */
export function LastRunStatus({ run, when }: { run: LastRun; when?: string }) {
  const at = when === undefined ? '' : ` · ${when}`;
  switch (run.outcome) {
    case 'done':
      return <Status kind="ok" label={`Done${at}`} testId="last-run" state="done" />;
    case 'failed':
      return <Status kind="err" label={`Failed${at}`} testId="last-run" state="failed" />;
    case 'cancelled':
      return <Status kind="cancel" label={`Cancelled${at}`} testId="last-run" state="cancelled" />;
    case 'expired':
      return (
        <Status kind="warn" label={`Cube’s record expired${at}`} testId="last-run" state="expired" />
      );
    default:
      return <Status kind="run" label={`Under way${at}`} testId="last-run" state="open" />;
  }
}

/** "today 14:01", "yesterday 16:20", "28 Sep 09:12": your local time, to the minute. */
export function minuteOf(iso: string, lower = false): string {
  const shown = whenOf(iso).shown.replace(/(\d{2}:\d{2}):\d{2}$/, '$1');
  return lower ? `${shown.charAt(0).toLowerCase()}${shown.slice(1)}` : shown;
}

/** "2 Sep": a day, three-letter months, as design 16 writes them. */
function dateOf(iso: string): string {
  const at = new Date(iso);
  // The day alone, read against itself, so no year (T477's one format).
  return dayOf(at, at);
}

/**
 * A wechart schedule's pane (T552, AC-234, AC-392; design 16, state D1): its
 * state and next run, what it builds, who made it and when it last changed,
 * its last run with the way to Run history, the refresh key that runs too,
 * its fields to change, applied at once, and Delete, asked first (D6).
 */
export function WechartPane({
  schedule,
  refreshKeys,
  onDeleted,
  onTyped,
  back = null,
}: {
  schedule: WechartSchedule;
  refreshKeys: readonly Schedule[];
  onDeleted: () => void;
  /** Whether a change typed in its fields would be lost on closing (rule 85; T640). */
  onTyped?: (typed: boolean) => void;
  /** The sheet's ×, first in its head below 1,024 px (design 16, G8; T560). */
  back?: ReactNode;
}) {
  const [deleting, setDeleting] = useState(false);
  /** Delete…, where focus goes back to when its question is cancelled (T552's review). */
  const opener = useRef<HTMLButtonElement>(null);
  // None before its first run; none either from an answer that lacks it.
  const lastRun = schedule.lastRun ?? null;
  const refreshKey = refreshKeys.find((each) => each.id === schedule.preAggregation);
  const shown = shownOf({
    id: schedule.preAggregation,
    ...(schedule.shortName === undefined ? {} : { shortName: schedule.shortName }),
    ...(schedule.folderPath === undefined ? {} : { folderPath: schedule.folderPath }),
  });
  const next = schedule.runs?.[0];
  const zone = schedule.timezone;
  // "today at 15:00", else "Mon 5 Oct, 07:55" (design 16, E1; T612).
  const nextWords = next === undefined ? undefined : momentWords(zone, new Date(next), new Date());
  /** Said once Resume has started it again (design 16, E3). */
  const [resumedSaid, setResumedSaid] = useState<string | undefined>(undefined);
  /**
   * Resume takes focus only as the pane opens on a suspended schedule
   * (design 16's keyboard table): never when a refresh finds one suspended
   * while someone is working in the pane (T379's review).
   */
  const [focusResume, setFocusResume] = useState(schedule.suspendedAt !== null);
  const client = useQueryClient();
  /** Run now (T555, AC-395): its last run on Schedules, and Run history, read again. */
  const runNow = useMutation({
    // Which schedule, so a refusal finding access gone is told apart (G5; T560).
    meta: { scheduleId: schedule.id },
    mutationFn: () => runScheduleNow(schedule.id),
    onSettled: () => void client.invalidateQueries({ queryKey: WECHART_SCHEDULES_KEY }),
  });
  return (
    <>
      <div className="admin-pane__head">
        {back}
        <h2 className="admin-pane__title" tabIndex={-1}>
          {schedule.name}
        </h2>
        <span className="spacer" />
        {/* On, or paused by hand (T556; design 16, P3). */}
        <PauseSwitch schedule={schedule} />
        <OwnerLabel owner="wechart" />
      </div>
      {/* What scrolls under the head, the sheet's body below 1,024 px (T640). */}
      <div className="admin-pane__body">
        {schedule.suspendedAt === null ? null : (
          <Suspension
            schedule={schedule}
            nextWords={nextWords}
            focus={focusResume}
            onResumed={(resumed) => {
              const at = resumed.runs?.[0];
              setFocusResume(false);
              setResumedSaid(
                `Resumed “${resumed.name}”.${
                  at === undefined
                    ? ''
                    : ` Its next run is ${momentWords(zone, new Date(at), new Date())}.`
                }`,
              );
              // Focus stays on its row (design 16's keyboard table), its name, not lost
              // with Resume; below 1,024 px the sheet covers the row, so on the sheet's head (T640).
              document
                .querySelector<HTMLElement>(
                  narrowNow()
                    ? '.schedules__pane .admin-pane__title'
                    : `tr[data-schedule-id="${resumed.id}"] .list-name`,
                )
                ?.focus();
            }}
          />
        )}
        {/* A resume, said in a polite toast (E3; T611). */}
        <ExportedToast
          message={schedule.suspendedAt === null ? (resumedSaid ?? '') : ''}
          onDismiss={() => {
            setResumedSaid(undefined);
          }}
        />
        {/* There from the start, so what it comes to say is read: a Run now started (T555). */}
        <p role="status" className="schedules__resumed">
          <span data-testid="ran-now">
            {!runNow.isSuccess
              ? ''
              : runNow.data.tokens.length === 0
                ? // Cube started no job: nothing to list (T555's review).
                  `Cube started no job: nothing of “${schedule.name}” was built.`
                : `Started “${schedule.name}” now. Run history lists it.`}
          </span>
        </p>
        <dl className="admin-pane__facts">
          <dt>State</dt>
          <dd>
            {schedule.suspendedAt !== null ? (
              <Status kind="susp" label="Suspended" testId="schedule-state" state="suspended" />
            ) : schedule.pausedAt !== null ? (
              // Paused by hand, by whom (T556; design 16, P3).
              <Status
                kind="idle"
                label={`Paused · by ${schedule.pausedBy?.name ?? 'someone'}`}
                testId="schedule-state"
                state="paused"
              />
            ) : (
              <>
                <Status kind="ok" label="Active" testId="schedule-state" state="active" />
                {nextWords === undefined ? null : ` · next ${nextWords}`}
              </>
            )}
          </dd>
          <dt>Builds</dt>
          <dd>{`${shown.name} · ${shown.folder ?? 'Shared'}`}</dd>
          <dt>Made by</dt>
          <dd>
            {`${schedule.createdBy.name}, ${dateOf(schedule.createdAt)}`}
            {schedule.updatedAt === schedule.createdAt
              ? null
              : ` · changed ${minuteOf(schedule.updatedAt, true)}`}
          </dd>
          <dt>Last run</dt>
          <dd>
            {lastRun === null ? (
              'Not run yet'
            ) : (
              <>
                <LastRunStatus run={lastRun} />
                {` · ${minuteOf(lastRun.startedAt, true)} · `}
                <a
                  className="btn-link"
                  href={`/jobs?tab=history&preagg=${encodeURIComponent(schedule.preAggregation)}`}
                >
                  Run history
                </a>
              </>
            )}
          </dd>
        </dl>
        <RefreshKeyRuns refreshKey={refreshKey} />
        {/* Keyed by its id and last change: another schedule, or one changed, starts afresh. */}
        <ScheduleForm
          key={`${schedule.id}-${schedule.updatedAt}`}
          schedule={schedule}
          refreshKeys={refreshKeys}
          onSaved={() => undefined}
          {...(onTyped === undefined ? {} : { onTyped })}
        >
          <button
            type="button"
            ref={opener}
            className="btn-sm btn-danger"
            onClick={() => {
              setDeleting(true);
            }}
          >
            Delete…
          </button>
          {/* Run now, on the right (design 16, D1 and P2): suspended or not (R59). */}
          <span className="spacer" />
          <button
            type="button"
            className="btn-sm"
            disabled={runNow.isPending}
            onClick={() => runNow.mutate()}
          >
            <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
              <path d="M5 3.2v9.6L12.6 8z" fill="currentColor" />
            </svg>
            Run now
          </button>
        </ScheduleForm>
        {runNow.isError ? (
          <p className="schedules__ran-refused" data-testid="ran-now-refused" role="alert">
            <StatusIcon kind="err" />
            {`Not started: ${runNow.error.message}`}
          </p>
        ) : null}
        {deleting ? (
          <DeleteScheduleDialog
            schedule={schedule}
            refreshKey={refreshKey}
            name={shown.name}
            onCancel={() => {
              setDeleting(false);
              opener.current?.focus();
            }}
            onDeleted={() => {
              setDeleting(false);
              onDeleted();
            }}
          />
        ) : null}
      </div>
    </>
  );
}

/** "at 11:00:41 today", "at 16:20:31 yesterday", "on 29 Sep at 07:55:00": your local time. */
function momentOf(iso: string): string {
  const [day = '', time = ''] = whenOf(iso).shown.split(/ (?=\d{2}:\d{2}:\d{2}$)/);
  return day === 'Today' || day === 'Yesterday'
    ? `at ${time} ${day.toLowerCase()}`
    : `on ${day} at ${time}`;
}

/**
 * A suspended schedule's pane head (T379, AC-155; design 16, E1, E4): that
 * it's suspended, after how many failed runs in a row and when, and that it
 * won't run until it's resumed; Resume, focused, with when it would next run
 * and the count starting again; its failed runs, from Run history, each "k
 * of N", and Cube's error on the last one.
 */
function Suspension({
  schedule,
  nextWords,
  focus,
  onResumed,
}: {
  schedule: WechartSchedule;
  nextWords: string | undefined;
  /** Whether Resume takes focus: the pane just opened on it. */
  focus: boolean;
  onResumed: (resumed: WechartSchedule) => void;
}) {
  const client = useQueryClient();
  const resumeButton = useRef<HTMLButtonElement>(null);
  const focusing = useRef(focus);
  useEffect(() => {
    // Its way out, at hand (E1's ring), as the pane opens on it.
    if (focusing.current) resumeButton.current?.focus();
  }, []);
  const resume = useMutation({
    meta: { scheduleId: schedule.id },
    mutationFn: () => resumeSchedule(schedule.id),
    onSuccess: async (resumed) => {
      await client.invalidateQueries({ queryKey: WECHART_SCHEDULES_KEY });
      onResumed(resumed);
    },
  });
  const runs = useQuery({
    queryKey: ['wechart-schedules', 'runs', schedule.id],
    queryFn: ({ signal }) => readRunsOf(schedule.id, signal),
  });
  const count = schedule.failuresInARow || schedule.suspendAfter;
  // Its failures in a row, then the run before them (E1), newest first: of
  // the runs that count, a dropped record or a cancel left out (T379's review).
  const shownRuns = (runs.data ?? [])
    // Its runs at its times: a Run now's don't count toward suspending it (T555, R59).
    .filter((run) => run.via !== 'run-now')
    .filter((run) => run.outcome === 'failed' || run.outcome === 'done')
    .slice(0, count + 1);
  return (
    <section className="build-log__section" aria-label="Suspended">
      <p className="notebar notebar--err" data-testid="suspended-note">
        <span>
          <b>{`Suspended after ${String(count)} failed ${count === 1 ? 'run' : 'runs'} in a row,`}</b>{' '}
          {`${momentOf(schedule.suspendedAt ?? '')}. It won’t run again until it’s resumed.`}
        </span>
      </p>
      <div className="admin-pane__actions">
        <button
          type="button"
          ref={resumeButton}
          className="btn-primary btn-sm"
          disabled={resume.isPending}
          onClick={() => {
            resume.mutate();
          }}
        >
          Resume
        </button>
        <span className="help" data-testid="resume-help">
          {`${nextWords === undefined ? '' : `Its next run would be ${nextWords}. `}The count of failures starts again from 0.`}
        </span>
      </div>
      {resume.isError ? <StateLine kind="err">{resume.error.message}</StateLine> : null}
      <h3>The failed runs</h3>
      {runs.isError ? <StateLine kind="err">{runs.error.message}</StateLine> : null}
      <table className="query-log schedules__failed" aria-label="The failed runs">
        <tbody>
          {shownRuns.map((run, at) => (
            <tr key={run.id}>
              <td>{minuteOf(run.startedAt)}</td>
              <td>
                <LastRunStatus
                  run={{
                    id: run.id,
                    outcome: run.outcome,
                    startedAt: run.startedAt,
                    endedAt: null,
                    error: run.error,
                  }}
                />
              </td>
              <td className="schedules__sub">
                {run.outcome === 'failed' && at < count
                  ? `${String(count - at)} of ${String(schedule.suspendAfter)}`
                  : ''}
              </td>
              <td>
                {/* That run's log, at its address (E1; T611): a failed run's, as drawn. */}
                {run.outcome === 'failed' ? (
                  <a className="btn-link" href={`/jobs/builds/${encodeURIComponent(run.id)}`}>
                    Log
                  </a>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {schedule.suspendedError === null ? null : (
        <>
          <p className="help">Cube’s error on the last one:</p>
          <pre className="schedules__written" data-testid="last-error">
            {schedule.suspendedError}
          </pre>
        </>
      )}
      {/* Its pre-aggregation gone from the model (E4): what to do. Not said where the model couldn't be read. */}
      {schedule.inModel !== false ? null : (
        <p className="help" data-testid="not-in-model">
          Cube’s answer when the pre-aggregation it names no longer exists. Delete the schedule, or
          resume it once the pre-aggregation is back.
        </p>
      )}
    </section>
  );
}

/**
 * Deleting a wechart schedule (design 16, D6): what stops and what stays,
 * what then rebuilds its rollup, and "You can't undo this." last (design
 * 14's rule), with Cancel focused and one destructive button.
 */
function DeleteScheduleDialog({
  schedule,
  refreshKey,
  name,
  onCancel,
  onDeleted,
}: {
  schedule: WechartSchedule;
  refreshKey: Schedule | undefined;
  name: string;
  onCancel: () => void;
  onDeleted: () => void;
}) {
  const client = useQueryClient();
  const box = useRef<HTMLDivElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  useFocusTrap(box);
  const cancelling = useRef(onCancel);
  useEffect(() => {
    cancelling.current = onCancel;
  }, [onCancel]);
  useEffect(() => {
    cancel.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      // Its Esc, not the sheet's under it as well (T640).
      event.preventDefault();
      cancelling.current();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);
  const remove = useMutation({
    meta: { scheduleId: schedule.id },
    mutationFn: () => deleteSchedule(schedule.id),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: WECHART_SCHEDULES_KEY });
      onDeleted();
    },
  });
  // What rebuilds the rollup after it: its refresh key, where Cube runs one.
  const after =
    refreshKey === undefined
      ? ''
      : refreshKey.scheduled
        ? ` ${name} keeps its refresh key, which Cube’s refresh worker runs.`
        : ` ${name} keeps its refresh key, which is Not scheduled, so nothing will rebuild it until someone builds it or schedules it again.`;
  return (
    <div className="dialog-backdrop">
      <div
        ref={box}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={`delete-${schedule.id}`}
        className="dialog"
      >
        <h2 id={`delete-${schedule.id}`}>Delete “{schedule.name}”?</h2>
        <p>{`Its runs stop. The builds it started stay in Run history.${after}`}</p>
        <p>You can’t undo this.</p>
        {remove.isError ? <StateLine kind="err">{remove.error.message}</StateLine> : null}
        <div className="dialog__actions">
          {/* Plain, with the focus ring: the one primary is the destructive one (D6; T611). */}
          <button type="button" ref={cancel} className="btn" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="dialog__destructive"
            disabled={remove.isPending}
            onClick={() => {
              remove.mutate();
            }}
          >
            Delete schedule
          </button>
        </div>
      </div>
    </div>
  );
}
