import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Fragment, useEffect, useId, useRef, useState } from 'react';

import { CUBE_STORE_ID } from '../data-sources/cubeStore';
import { readOnlyLayers } from '../data-sources/sqlLogin';
import { folderAccessQuery } from '../explore/access/AccessPanel';
import { AccessIcon } from '../explore/AccessChip';
import { SHARED_ROOT } from '../explore/roots';
import { StatusIcon } from '../../shell/StatusIcon';
import { useFocusTrap } from '../../shell/useFocusTrap';
import { loginFor, pageKeyOf, pathText, routeOf, type SqlSource } from './sqlSource';

/**
 * The SQL runner's off panel and its Turn on… dialog (T535, design 15's P1
 * and G1), moved here from the data source page's `SqlRunner.tsx` (T798) so
 * the page's tab and the SQL runner workspace show the same one: when a
 * source chosen there is off, this, and never an editor that can run
 * (AC-447, AC-373).
 */

/**
 * The folder's read-write groups, named as design 15 names them (pin 1;
 * T698, SRC-21): as the Access panel reads them, for one who may see them.
 * None named where they can't be read.
 */
export function useReadWriteGroups(source: SqlSource): readonly string[] {
  const folderId = source.folderPath.at(-1)?.id ?? SHARED_ROOT.id;
  const access = useQuery({
    ...folderAccessQuery(folderId),
    enabled: !source.inWorkspace && source.cubeStore !== true,
    retry: false,
  });
  return [...new Set(access.data?.effective.readWrite.map((grant) => grant.group) ?? [])];
}

/** "Super-Admins, and read-write members of Sales / EMEA: sales-emea-rw" (pin 1; design 17's N1). */
export function WhoRuns({
  source,
  groups,
}: {
  readonly source: SqlSource;
  readonly groups: readonly string[];
}) {
  return (
    <>
      Super-Admins, and read-write members of {pathText(source.folderPath)}
      {groups.length === 0 ? null : (
        <>
          {': '}
          {groups.map((group, at) => (
            <Fragment key={group}>
              {at === 0 ? '' : ', '}
              <code>{group}</code>
            </Fragment>
          ))}
        </>
      )}
    </>
  );
}

/** While off (P1; screen 2, G3): who could run SQL once on, and Turn on… for a Super-Admin. */
export function OffPanel({
  source,
  superAdmin,
  turnedOff,
  onTurnedOn,
}: {
  source: SqlSource;
  superAdmin: boolean;
  /** Just turned off here: focus on Turn on…, and say so. */
  turnedOff: boolean;
  onTurnedOn: () => void;
}) {
  const heading = useId();
  const [asking, setAsking] = useState(false);
  const turnOn = useRef<HTMLButtonElement>(null);
  const login = loginFor(source);
  const canTurnOn = superAdmin && (!source.inWorkspace || source.sqlRunner.needsSwitch === true);
  useEffect(() => {
    if (turnedOff) turnOn.current?.focus();
    // On showing only: the panel is shown again after each switch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const turnOnLabel =
    source.cubeStore === true
      ? 'Turn on the SQL runner for Cube Store…'
      : 'Turn on the SQL runner…';
  const groups = useReadWriteGroups(source);
  return (
    <section className="sql-off" aria-labelledby={heading}>
      <h2 id={heading}>
        {/* Off, design 15's s-off (SRC-20). */}
        <StatusIcon kind="off" />
        The SQL runner is off for {source.name}
      </h2>
      {turnedOff ? (
        <p className="sql-off__note" role="status" data-testid="sql-turned-off">
          The SQL runner is off. Turning it on again asks for the confirmation again.
        </p>
      ) : null}
      {source.cubeStore === true ? (
        // Seen off by a Super-Admin alone: nobody else is told of it (AC-384).
        <p>
          Once on, Super-Admins and everyone who may run SQL on a data source in a folder can read
          every folder’s rollups here, past folder permissions and access policies. It starts off.
        </p>
      ) : source.inWorkspace ? (
        <p>{source.sqlRunner.why}</p>
      ) : (
        <>
          <p>
            Once on, it runs SELECT and EXPLAIN on this database directly, as the data source’s own
            login
            {login.as === null ? (
              ''
            ) : (
              <>
                , <code>{login.as}</code>
              </>
            )}
            , past folder permissions and access policies. Every data source starts with it off.
          </p>
          <dl className="sql-off__who">
            <dt>Who could run SQL</dt>
            <dd>
              <WhoRuns source={source} groups={groups} />
            </dd>
            <dt>Who couldn’t</dt>
            <dd>Members who see it from a folder below, and read-only members</dd>
          </dl>
        </>
      )}
      {canTurnOn ? (
        <div className="sql-off__act">
          <button
            ref={turnOn}
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setAsking(true);
            }}
          >
            {/* With its shield, as design 15 draws it (SRC-05). */}
            <AccessIcon name="shield" />
            {turnOnLabel}
          </button>
          <span className="sql-off__note">Only Super-Admins see this button.</span>
        </div>
      ) : source.inWorkspace || source.cubeStore === true ? null : (
        <p>
          Only a Super-Admin can turn it on. Your own data sources in My workspace need no switch.
        </p>
      )}
      {asking ? (
        <TurnOnDialog
          source={source}
          onTurnedOn={onTurnedOn}
          onClose={() => {
            setAsking(false);
            turnOn.current?.focus();
          }}
        />
      ) : null}
    </section>
  );
}

/** Cube Store, for its switch's dialog where no page of its shows (Data sources' ⋯, P5). */
const CUBE_STORE_SOURCE: SqlSource = {
  cubeStore: true,
  id: CUBE_STORE_ID,
  version: 0,
  name: 'Cube Store',
  folderPath: [],
  inWorkspace: false,
  sqlRunner: { on: false, tab: true, runs: false },
};

/** Cube Store's switch, turned on from Data sources' header ⋯ (T536; design 15's P5, Q9). */
export function CubeStoreTurnOn({
  onClose,
  onTurnedOn = () => undefined,
}: {
  onClose: () => void;
  onTurnedOn?: () => void;
}) {
  return <TurnOnDialog source={CUBE_STORE_SOURCE} onTurnedOn={onTurnedOn} onClose={onClose} />;
}

/**
 * Turning it on (screen 2, G1): what it runs as, what wechart does on the
 * driver, and the confirmation. Cube Store's says who may then read every
 * folder's rollups, and that wechart's check is the only guard (H5, Q9).
 */
function TurnOnDialog({
  source,
  onTurnedOn,
  onClose,
}: {
  source: SqlSource;
  onTurnedOn: () => void;
  onClose: () => void;
}) {
  const heading = useId();
  const box = useRef<HTMLDivElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const queryClient = useQueryClient();
  const [confirmed, setConfirmed] = useState(false);
  /** Asked once: a second press while the first is answered would switch, and audit, twice. */
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const login = loginFor(source);
  const as = login.as ?? 'its login';
  useFocusTrap(box);
  const closing = useRef(onClose);
  useEffect(() => {
    closing.current = onClose;
  }, [onClose]);
  useEffect(() => {
    cancel.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closing.current();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);
  const turnOn = async () => {
    if (pending) return;
    setPending(true);
    setFailed(null);
    const response = await fetch(routeOf(source, 'sql-runner'), {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ on: true, readOnlyConfirmed: true }),
    }).catch(() => null);
    if (response === null || !response.ok) {
      const said = (await response?.json().catch(() => ({}))) as { error?: string } | undefined;
      setFailed(
        said?.error ??
          `It could not be turned on (${response === null ? 'no answer' : String(response.status)}).`,
      );
      setPending(false);
      return;
    }
    onTurnedOn();
    await queryClient.invalidateQueries({ queryKey: pageKeyOf(source) });
    // Cube Store is listed among the root's data sources once on (AC-384).
    if (source.cubeStore === true)
      await queryClient.invalidateQueries({ queryKey: ['folder-contents'] });
    // And the SQL runner workspace's picker lists it on (T798).
    await queryClient.invalidateQueries({ queryKey: ['sql-sources'] });
    onClose();
  };
  const confirmation =
    source.cubeStore === true
      ? 'I confirm that what wechart reaches Cube Store with can only read, and that everyone allowed may read every folder’s rollups.'
      : `I confirm that ${as} can only read: it has no grant to insert, update, delete, create, alter or drop.`;
  return (
    <div className="dialog-backdrop">
      <div
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-labelledby={heading}
        className="dialog sql-turn-on"
      >
        <h2 id={heading}>Turn on the SQL runner for {source.name}?</h2>
        {source.cubeStore === true ? (
          <>
            <p>
              Cube Store holds the rollups of every folder. Once it’s on, Super-Admins and everyone
              who may run SQL on a data source in a folder can read any of them here, past folder
              permissions and access policies. wechart runs only SELECT and EXPLAIN on it, one at a
              time, within the same limits.
            </p>
            <p>
              Cube Store has no logins of its own, so wechart’s check on each command is the only
              guard.
            </p>
          </>
        ) : (
          <>
            <p>
              Those allowed will run SQL on this database directly, as its own login, past folder
              permissions and access policies.
            </p>
            <dl className="source-settings__rows sql-turn-on__as">
              <dt>Runs as</dt>
              <dd className="is-code">{as}</dd>
              <dt>Database</dt>
              <dd>
                {login.database === null ? null : (
                  <>
                    <span className="is-code">{login.database}</span> at{' '}
                  </>
                )}
                <span className="is-code">{login.where}</span>
              </dd>
              <dt>Password</dt>
              <dd>Stored · encrypted</dd>
            </dl>
            <h3 className="sql-turn-on__sub">What wechart does on this driver</h3>
            <ul className="sql-turn-on__layers">
              {readOnlyLayers(source.driver).map((layer) => (
                <li key={layer}>{layer}</li>
              ))}
            </ul>
            <p>
              What <b>{as}</b> may change is set by its grants in the database, which wechart can’t
              check. Confirm that it can only read.
            </p>
          </>
        )}
        <label className="sql-turn-on__attest">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => {
              setConfirmed(event.target.checked);
            }}
          />
          <span>{confirmation}</span>
        </label>
        <p>
          {source.cubeStore === true
            ? ''
            : source.inWorkspace
              ? 'Then you may run SQL here, as its owner: nobody else sees your workspace. '
              : `Then Super-Admins and read-write members of ${pathText(source.folderPath)} may run SQL here. `}
          Your name and the time are kept with the switch, and shown on the SQL tab.
        </p>
        {failed === null ? null : <p className="sql-turn-on__failed">{failed}</p>}
        <div className="dialog__actions">
          <button ref={cancel} type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!confirmed || pending}
            onClick={() => void turnOn()}
          >
            {pending ? 'Turning on…' : 'Turn on'}
          </button>
        </div>
      </div>
    </div>
  );
}
