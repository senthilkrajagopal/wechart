import { StateLine, StatusIcon } from '../../shell/StatusIcon';
import { shownOf } from '../jobs/BuildPanel';
import { rollupHref } from '../model/inFolder';
import { lagInWords } from '../model/preagg/RefreshSchedule';
import { OwnerLabel } from './OwnerLabel';
import { changeWords, dayIn, runsOf, timeIn, zoneOf, type Schedule } from './schedule';

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

export function SchedulePane({ schedule, now }: { schedule: Schedule; now: Date }) {
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
        <h2 className="admin-pane__title">{shown.name}</h2>
        <span className="schedules__folder">· {folder}</span>
        <span className="spacer" />
        <OwnerLabel owner={schedule.owner} />
      </div>
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
        <div className="admin-pane__actions">
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
        </div>
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
    </>
  );
}
