import { useQuery } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

import { InfoBar } from '../../shell/InfoBar';
import { StateLine, StatusIcon, type StateKind } from '../../shell/StatusIcon';
import { TableScroll } from '../../shell/TableScroll';
import { shownOf } from '../jobs/BuildPanel';
import { BuiltWhen } from '../jobs/builds';
import { OwnerLabel } from './OwnerLabel';
import { SchedulePane } from './SchedulePane';
import { dayIn, runsOf, timeIn, untilIn, zoneOf, type Schedule } from './schedule';

/**
 * Schedules (T160, AC-154; T551, design 16's screen 2): every
 * pre-aggregation's refresh schedule, a `public: false` cube's included, one
 * row each, labelled with its owner as an icon and words, read-only, each
 * opening its pane, where it is set — the pre-aggregation in Model — and
 * Jobs are a click away. Cube's refresh worker owns each one today: a
 * schedule is its refresh key, in the model (the user's "Cube-owned now",
 * 2026-09-24). wechart's own schedules come with AC-234 (T378).
 */

/** The icon a schedule's words wear, where its kind has one (design 07, pin 4; design 16). */
const ICONS: Partial<Record<Schedule['kind'], StateKind>> = {
  'not-scheduled': 'off',
  default: 'info',
  'cube-keys': 'info',
  unrunnable: 'warn',
};

/** Its next run, in its zone (else yours), with UTC and how long until it. */
function NextRun({ schedule, now }: { schedule: Schedule; now: Date }) {
  const { runs, change } = runsOf(schedule, now, 1);
  const zone = zoneOf(schedule);
  const next = runs[0];
  if (next !== undefined)
    return (
      <>
        {`${dayIn(zone, next)}, ${timeIn(zone, next)}`}
        <span className="schedules__sub">{`${timeIn('UTC', next)} UTC · ${untilIn(next, now)}`}</span>
      </>
    );
  if (change !== undefined)
    return (
      <span className="schedules__sub">After the clocks change on {dayIn(zone, change.at)}</span>
    );
  if (schedule.kind === 'sql') return <span className="schedules__sub">When its SQL changes</span>;
  if (schedule.kind === 'cube-keys')
    return <span className="schedules__sub">Depends on its cubes’ keys</span>;
  return <span className="muted">—</span>;
}

/** When Cube last built it: "Built today 14:01", "Not built yet", or "—" where not known. */
function LastRun({ schedule }: { schedule: Schedule }): ReactNode {
  if (schedule.lastBuiltAt === undefined) return <span className="muted">—</span>;
  if (schedule.lastBuiltAt === null) return <span className="schedules__sub">Not built yet</span>;
  return (
    <span className="schedules__sub">
      Built <BuiltWhen iso={schedule.lastBuiltAt} lower />
    </span>
  );
}

export function SchedulesPage() {
  const schedules = useQuery({
    queryKey: ['schedules'],
    queryFn: async () => {
      const response = await fetch('/api/schedules');
      if (!response.ok) {
        // The API's own words where it gives them: who Schedules is for (T371).
        const said = ((await response.json().catch(() => null)) as { error?: unknown } | null)
          ?.error;
        throw new Error(
          typeof said === 'string'
            ? said
            : `The schedules could not be read (${String(response.status)}).`,
        );
      }
      return (await response.json()) as Schedule[];
    },
  });
  const [selected, setSelected] = useState<string | null>(null);
  const now = new Date();
  const open = schedules.data?.find((each) => each.id === selected);

  return (
    <div className={open === undefined ? 'admin-page' : 'admin-page admin-page--docked'}>
      <div className="admin-page__main">
        <h1 className="workspace-title">Schedules</h1>
        {/* What the page does now, and that scheduling from wechart waits
            (AC-233), with no word of phases (T466, UX-111). */}
        <InfoBar>
          <p>
            When each pre-aggregation is rebuilt is set by its refresh key in the model, and Cube’s
            refresh worker runs it: change one in Model. Scheduling builds and cache warm-ups from
            wechart isn’t available yet.
          </p>
        </InfoBar>
        {schedules.isPending ? (
          <StateLine kind="run">Reading the schedules…</StateLine>
        ) : schedules.isError ? (
          <StateLine kind="err">{schedules.error.message}</StateLine>
        ) : schedules.data.length === 0 ? (
          <p>The model declares no pre-aggregations.</p>
        ) : (
          <>
            <TableScroll label="Refresh schedules">
              <table className="query-log" aria-label="Refresh schedules">
                <thead>
                  <tr>
                    {['Pre-aggregation', 'Folder', 'Schedule', 'Next run', 'Last run', 'Owner'].map(
                      (column) => (
                        <th key={column} scope="col">
                          {column}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {schedules.data.map((schedule) => {
                    const shownAs = shownOf(schedule);
                    const icon = ICONS[schedule.kind];
                    return (
                      <tr
                        key={schedule.id}
                        // A row opens its pane (D5): by pointer, or Enter or Space on it.
                        aria-selected={selected === schedule.id}
                        tabIndex={0}
                        className="build-panel__row"
                        onClick={() => {
                          setSelected(schedule.id);
                        }}
                        onKeyDown={(event) => {
                          if (event.target !== event.currentTarget) return;
                          if (event.key !== 'Enter' && event.key !== ' ') return;
                          event.preventDefault();
                          setSelected(schedule.id);
                        }}
                      >
                        <td className="query-log__query">
                          <span data-testid="schedule-name">{shownAs.name}</span>
                        </td>
                        <td>{shownAs.folder ?? 'Shared'}</td>
                        <td>
                          <span
                            className={icon === undefined ? undefined : `status status--${icon}`}
                          >
                            {icon === undefined ? null : <StatusIcon kind={icon} />}
                            {schedule.when}
                          </span>
                          <code className="schedules__sub">{schedule.written}</code>
                        </td>
                        <td>
                          <NextRun schedule={schedule} now={now} />
                        </td>
                        <td>
                          <LastRun schedule={schedule} />
                        </td>
                        <td>
                          <OwnerLabel owner={schedule.owner} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableScroll>
            {/* What Last run means for a refresh key (design 16, screen 2's foot). */}
            <p className="jobs-foot">
              Times are your local time unless a schedule names its own zone. For a refresh key,
              Last run is when Cube last built the rollup; who started it and how it ended aren’t
              recorded yet, until the refresh worker’s history is.
            </p>
          </>
        )}
      </div>
      {open === undefined ? null : (
        <aside className="admin-pane" aria-label="Schedule details">
          <SchedulePane schedule={open} now={now} />
        </aside>
      )}
    </div>
  );
}
