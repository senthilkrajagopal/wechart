import { useQuery } from '@tanstack/react-query';

import { InfoBar } from '../../shell/InfoBar';
import { StateLine } from '../../shell/StatusIcon';
import { TableScroll } from '../../shell/TableScroll';
import { shownOf } from '../jobs/BuildPanel';
import { rollupHref } from '../model/inFolder';

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
  /** Its cube's short name and folder (T371): what people see (§P2.6 D). */
  readonly shortName?: string;
  readonly folderPath?: readonly string[];
  readonly cube: string;
  readonly name: string;
  readonly fileName?: string;
  /** That file's folder, where it isn't the root (T530). */
  readonly fileFolderId?: string;
  readonly owner: 'cube';
  readonly scheduled: boolean;
  readonly when: string;
}

const OWNERS: Readonly<Record<Schedule['owner'], string>> = {
  cube: 'Cube’s refresh worker',
};

/**
 * Its file, open on its cube's pre-aggregations: a folder's in its folder, by
 * the name its file declares (T530, AC-222).
 */
const modelHref = ({ fileName, fileFolderId, cube, shortName }: Schedule) =>
  rollupHref({ fileName, fileFolderId, cube: shortName ?? cube });

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

  return (
    <div className="admin-page">
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
        <TableScroll label="Refresh schedules">
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
                const shownAs = shownOf(schedule);
                return (
                  <tr key={schedule.id}>
                    <td className="query-log__query">
                      {shownAs.name}
                      {shownAs.folder === undefined ? null : (
                        <span className="schedules__folder">{shownAs.folder}</span>
                      )}
                    </td>
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
                        <a href={href} aria-label={`Edit ${shownAs.name} in Model`}>
                          Edit in Model
                        </a>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableScroll>
      )}
    </div>
  );
}
