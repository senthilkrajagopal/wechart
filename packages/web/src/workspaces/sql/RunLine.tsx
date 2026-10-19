import { exactOf, whenOf } from '../../shell/formatTime';
import { StatusIcon } from '../../shell/StatusIcon';
import { loginFor, type SqlSource } from './sqlSource';

/**
 * Above every tab's editor (T802, AC-385; design 17, pins 8 and 9): where
 * the tab's SQL runs, its database, host and login, and who switched the
 * runner on; then the warning, always shown and never closed, that it runs
 * on that data source's database directly, past folder permissions and
 * access policies. Each names the tab's own source, never another tab's.
 */
export function RunLine({ source, warningId }: { readonly source: SqlSource; readonly warningId: string }) {
  const login = loginFor(source);
  const runner = source.sqlRunner;
  const onCubeStore = source.cubeStore === true;
  const switchedBy = runner.confirmedBy?.name;
  return (
    <>
      <div className="sql-runner__line">
        {onCubeStore ? (
          <span data-testid="sql-runline">
            Runs on <span className="is-code">Cube Store</span>, which holds every folder’s rollups
          </span>
        ) : (
          <span data-testid="sql-runline">
            Runs on{' '}
            {login.database === null ? null : (
              <>
                <b className="is-code">{login.database}</b> at{' '}
              </>
            )}
            <span className="is-code">{login.where}</span>
            {login.as === null ? null : (
              <>
                , as <span className="is-code">{login.as}</span>
              </>
            )}
          </span>
        )}
        <span className="sql-runner__spacer" />
        {source.inWorkspace && runner.needsSwitch !== true ? (
          <span className="status status--ok" data-testid="sql-yours">
            <StatusIcon kind="ok" />
            Yours: you may run SQL on your own data sources in My workspace, with no switch. Nobody
            else can.
          </span>
        ) : runner.on ? (
          <span className="status status--ok" data-testid="sql-switch">
            <StatusIcon kind="ok" />
            SQL runner on · turned on by {switchedBy ?? 'a Super-Admin'}, who confirmed{' '}
            {onCubeStore ? 'everyone allowed may read every folder’s rollups' : 'the login can only read'}
            {runner.confirmedAt === undefined ? null : (
              <>
                {' · '}
                <time dateTime={runner.confirmedAt} title={exactOf(new Date(runner.confirmedAt))}>
                  {whenOf(new Date(runner.confirmedAt))}
                </time>
              </>
            )}
          </span>
        ) : !runner.runs ? (
          // Turned off since the tab was opened (T824, AC-466; design 17's L1).
          <span className="status status--idle" data-testid="sql-runner-off">
            <StatusIcon kind="idle" />
            Off
          </span>
        ) : null}
      </div>
      <p id={warningId} className="notebar notebar--warn sql-runner__warning" data-testid="sql-warning">
        <StatusIcon kind="warn" />
        {onCubeStore ? (
          <span>
            <b>This SQL runs on Cube Store directly.</b> It holds every folder’s rollups, and folder
            permissions and access policies don’t apply.
          </span>
        ) : (
          <span>
            <b>
              This SQL runs on {source.name}’s database directly
              {login.as === null ? '' : `, as ${login.as}`}.
            </b>{' '}
            Folder permissions and access policies don’t apply here: you can read whatever that login
            can read.
          </span>
        )}
      </p>
    </>
  );
}
