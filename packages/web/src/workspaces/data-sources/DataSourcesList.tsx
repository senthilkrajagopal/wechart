import { DRIVERS, type DriverType } from '@wechart/core';
import { useState } from 'react';

import { StatusIcon, type StateKind } from '../../shell/StatusIcon';
import { TableScroll } from '../../shell/TableScroll';
import { MY_WORKSPACE, SHARED_ROOT } from '../explore/roots';

/**
 * Every data source the user may see, in every folder (T364, AC-157), as
 * `GET /api/data-sources` lists them. Each row: its name, its folder's path —
 * which opens the folder in Explore — its driver, and its health from the
 * last test of its stored settings (T362; a trial of changes not saved isn't
 * its health): an icon, its words and when, never colour alone (direction.md
 * rules 22 and 84; references.md surface 10). Filters: folder, driver, health
 * and a search by name.
 */
export interface ListedSource {
  readonly id: string;
  readonly name: string;
  readonly folderId: string;
  readonly folderPath: readonly { readonly id: string; readonly title: string }[];
  readonly driver: string;
  readonly authMethod: string;
  readonly updatedAt: string;
  readonly lastTest: {
    readonly ok: boolean;
    readonly ranAt: string;
    readonly checks: readonly {
      readonly id: string;
      readonly status: string;
      readonly durationMs?: number;
      readonly error?: string;
    }[];
    /** False once a save changed the settings it tested: no longer its health (T364's review). */
    readonly current: boolean;
  } | null;
}

const driverLabel = (driver: string) =>
  Object.hasOwn(DRIVERS, driver) ? DRIVERS[driver as DriverType].label : driver;

const ROOTS = new Map([SHARED_ROOT, MY_WORKSPACE].map((root) => [root.id, root.title]));

/** Its path as Explore names it: a root by its title, else each folder's. */
const pathLabel = (source: ListedSource) =>
  source.folderPath.length === 0
    ? (ROOTS.get(source.folderId) ?? source.folderId)
    : source.folderPath.map((folder) => folder.title).join(' / ');

function healthOf(source: ListedSource): { kind: StateKind; label: string } {
  const test = source.lastTest;
  if (test === null) return { kind: 'idle', label: 'Not tested yet' };
  if (!test.current) return { kind: 'idle', label: 'Not tested since it changed' };
  if (test.ok) return { kind: 'ok', label: 'Passed' };
  const failed = test.checks.find((check) => check.status === 'failed');
  return { kind: 'err', label: failed === undefined ? 'Failed' : `Failed at ${failed.id}` };
}

export function DataSourcesList({
  sources,
  seesEveryFolder = false,
  readWrite = false,
}: {
  sources: readonly ListedSource[];
  /** A Super-Admin, or the one user with security off: none listed is none there. */
  seesEveryFolder?: boolean;
  /** A read-write member of some folder: none listed is none in their folders yet. */
  readWrite?: boolean;
}) {
  const [folder, setFolder] = useState('');
  const [driver, setDriver] = useState('');
  const [health, setHealth] = useState('');
  const [search, setSearch] = useState('');

  if (sources.length === 0 && seesEveryFolder)
    return (
      <div className="info-bar" role="note">
        <StatusIcon kind="idle" />
        <p>No data source has been added yet.</p>
      </div>
    );
  if (sources.length === 0 && readWrite)
    return (
      <div className="info-bar" role="note">
        <StatusIcon kind="idle" />
        <p>No data source has been added to your folders, or to the folders above them, yet.</p>
      </div>
    );
  if (sources.length === 0)
    return (
      <div className="sources-empty">
        <div className="info-bar" role="note">
          <StatusIcon kind="idle" />
          <p>
            Data sources are available to read-write members of a folder. Your dashboards are in
            Explore.
          </p>
        </div>
        <a className="btn" href="/explore">
          Open Explore
        </a>
      </div>
    );

  const folders = [...new Map(sources.map((source) => [source.folderId, pathLabel(source)]))];
  const drivers = [...new Set(sources.map((source) => source.driver))];
  const shown = sources.filter(
    (source) =>
      (folder === '' || source.folderId === folder) &&
      (driver === '' || source.driver === driver) &&
      (health === '' || healthOf(source).kind === health) &&
      source.name.toLowerCase().includes(search.trim().toLowerCase()),
  );

  return (
    <>
      <div className="query-log__filters">
        <label>
          Folder
          <select value={folder} onChange={(event) => setFolder(event.target.value)}>
            <option value="">All folders</option>
            {folders.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Driver
          <select value={driver} onChange={(event) => setDriver(event.target.value)}>
            <option value="">All drivers</option>
            {drivers.map((each) => (
              <option key={each} value={each}>
                {driverLabel(each)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Health
          <select value={health} onChange={(event) => setHealth(event.target.value)}>
            <option value="">Any health</option>
            <option value="ok">Passed</option>
            <option value="err">Failed</option>
            <option value="idle">Not tested</option>
          </select>
        </label>
        <input
          type="search"
          aria-label="Search data sources"
          placeholder="Search by name"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>
      <TableScroll label="Data sources">
        <table className="query-log" aria-label="Data sources">
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Folder</th>
              <th scope="col">Driver</th>
              <th scope="col">Health</th>
              <th scope="col">Updated</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((source) => {
              const { kind, label } = healthOf(source);
              return (
                <tr key={source.id} data-testid={`source-${source.id}`}>
                  <td>{source.name}</td>
                  <td>
                    <a href={`/explore?folder=${encodeURIComponent(source.folderId)}`}>
                      {pathLabel(source)}
                    </a>
                  </td>
                  <td>{driverLabel(source.driver)}</td>
                  <td>
                    <span
                      className={`status status--${kind}`}
                      data-testid="source-health"
                      data-state={kind}
                    >
                      <StatusIcon kind={kind} />
                      {label}
                      {source.lastTest === null || !source.lastTest.current ? null : (
                        <span className="status__when">
                          {' · '}
                          {new Date(source.lastTest.ranAt).toLocaleString()}
                        </span>
                      )}
                    </span>
                  </td>
                  <td>{new Date(source.updatedAt).toLocaleString()}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </TableScroll>
    </>
  );
}
