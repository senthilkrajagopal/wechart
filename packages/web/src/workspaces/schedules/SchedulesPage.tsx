import { useQuery } from '@tanstack/react-query';

import { StateLine, StatusIcon } from '../../shell/StatusIcon';

/**
 * Schedules (T160, AC-154): every pre-aggregation's refresh schedule, labelled
 * with its owner, read-only, each linking to where it is set — the
 * pre-aggregation in Model. Cube's refresh worker owns each one today: a
 * schedule is its refresh key, in the model (the user's "Cube-owned now",
 * 2026-09-24). wechart's own scheduler is deferred (AC-234), so the page says
 * that too, rather than offering a "+ Schedule" that could do nothing.
 */
interface Schedule {
  readonly id: string;
  readonly cube: string;
  readonly name: string;
  readonly fileName?: string;
  readonly owner: 'cube';
  readonly scheduled: boolean;
  readonly when: string;
}

const OWNERS: Readonly<Record<Schedule['owner'], string>> = {
  cube: 'Cube’s refresh worker',
};

/** Its file in Model, open on its cube's pre-aggregations. */
const modelHref = ({ fileName, cube }: Schedule) =>
  fileName === undefined
    ? undefined
    : `/model/files/${encodeURIComponent(fileName)}?cube=${encodeURIComponent(cube)}&tab=pre_aggregations`;

export function SchedulesPage() {
  const schedules = useQuery({
    queryKey: ['schedules'],
    queryFn: async () => {
      const response = await fetch('/api/schedules');
      if (!response.ok)
        throw new Error(`The schedules could not be read (${String(response.status)}).`);
      return (await response.json()) as Schedule[];
    },
  });

  return (
    <div className="admin-page">
      <h1 className="workspace-title">Schedules</h1>
      <div className="info-bar" role="note">
        <StatusIcon kind="idle" />
        <div>
          <p>
            When each pre-aggregation is rebuilt is set by its refresh key in the model, and Cube’s
            refresh worker runs it: change one in Model. Scheduling builds and cache warm-ups from
            wechart is not part of this phase.
          </p>
        </div>
      </div>
      {schedules.isPending ? (
        <StateLine kind="run">Reading the schedules…</StateLine>
      ) : schedules.isError ? (
        <StateLine kind="err">{schedules.error.message}</StateLine>
      ) : schedules.data.length === 0 ? (
        <p>The model declares no pre-aggregations.</p>
      ) : (
        <table className="query-log" aria-label="Refresh schedules">
          <thead>
            <tr>
              <th scope="col">Pre-aggregation</th>
              <th scope="col">When</th>
              <th scope="col">Owner</th>
              <th scope="col">
                <span className="visually-hidden">Where it is set</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {schedules.data.map((schedule) => {
              const href = modelHref(schedule);
              return (
                <tr key={schedule.id}>
                  <td className="query-log__query">{schedule.id}</td>
                  <td>
                    {schedule.scheduled ? (
                      schedule.when
                    ) : (
                      // A state, so with its icon, never colour alone (AC-152).
                      <StateLine kind="idle">{schedule.when}</StateLine>
                    )}
                  </td>
                  <td>{OWNERS[schedule.owner]}</td>
                  <td>
                    {href === undefined ? null : (
                      <a href={href} aria-label={`Edit ${schedule.id} in Model`}>
                        Edit in Model
                      </a>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
