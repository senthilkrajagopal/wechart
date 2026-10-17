import { StatusIcon } from '../../shell/StatusIcon';

/**
 * The SQL runner workspace's empty states (AC-466; design 17, state H;
 * rule 104): an icon and one sentence each, and an action where there is
 * one.
 */

/** A tab with no data source chosen yet (H1): the first visit's. */
export function ChooseASource() {
  return (
    <div className="sql-empty">
      <StatusIcon kind="info" />
      <p>Choose a data source to write SQL against.</p>
    </div>
  );
}

/** A member who may run SQL on no data source (H2), with the way to their own. */
export function NoSourceToRun() {
  return (
    <div className="sql-empty">
      {/* Off, as design 17's H2 draws it. */}
      <StatusIcon kind="off" />
      <p>
        No data source runs SQL for you yet. A Super-Admin turns the SQL runner on for each data
        source. Your own data sources in My workspace need no switch.
      </p>
      <a className="btn" href="/data-sources">
        Go to Data sources
      </a>
    </div>
  );
}
