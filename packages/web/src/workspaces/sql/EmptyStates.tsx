import { StatusIcon } from '../../shell/StatusIcon';

/**
 * The SQL runner workspace's empty states (AC-466; design 17, state H;
 * rule 104): an icon and one sentence each, and an action where there is
 * one.
 */

/**
 * A tab with no data source chosen yet (H1): the first visit's; or a saved
 * query's whose source the user can no longer run SQL on, never naming it
 * (T814, AC-459; design 17, §5).
 */
export function ChooseASource({ lost = false }: { readonly lost?: boolean }) {
  return (
    <div className="sql-empty">
      <StatusIcon kind="info" />
      <p>
        {lost
          ? 'Choose a data source: the one it was saved with isn’t available to you.'
          : 'Choose a data source to write SQL against.'}
      </p>
    </div>
  );
}

/**
 * A tab whose source was found no longer the user's by its Run (T824,
 * AC-466; design 17's L2): said without naming it again.
 */
export function AccessLost() {
  return (
    <div className="sql-empty" data-testid="sql-access-lost">
      <StatusIcon kind="info" />
      <p>
        <span className="sql-empty__line">This tab’s data source isn’t available to you.</span>
        <span className="sql-empty__line">Choose a data source: this one isn’t available to you.</span>
      </p>
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
