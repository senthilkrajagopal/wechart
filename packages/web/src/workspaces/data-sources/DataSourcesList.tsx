import { DRIVERS, type DriverType } from '@wechart/core';
import { useId, useRef, useState } from 'react';

import { InfoBar } from '../../shell/InfoBar';
import { exactOf } from '../../shell/formatTime';
import { shortDay } from '../../shell/relativeAge';
import { healthOf, HealthBadge } from './health';
import { TableScroll } from '../../shell/TableScroll';
import { MY_WORKSPACE, SHARED_ROOT } from '../explore/roots';
import { CUBE_STORE_ID } from './cubeStore';

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
  /**
   * The cubes xcube bound to it at publish, in folders the user sees (T459,
   * AC-157); null when xcube couldn't be asked.
   */
  readonly usedBy: readonly UsingCube[] | null;
  /** How many more use it in folders the user can't see: counted, never named (AC-322's way). */
  readonly usedElsewhere?: number;
}

interface UsingCube {
  readonly name: string;
  readonly folderId: string;
  readonly folderPath: readonly { readonly id: string; readonly title: string }[];
  /** Its model file's path, where wechart holds it (T499). */
  readonly file?: string;
}

const driverLabel = (driver: string) =>
  Object.hasOwn(DRIVERS, driver) ? DRIVERS[driver as DriverType].label : driver;

const ROOTS = new Map([SHARED_ROOT, MY_WORKSPACE].map((root) => [root.id, root.title]));

/** A folder's path as Explore names it: a root by its title, else each folder's. */
const pathLabel = (at: Pick<ListedSource, 'folderId' | 'folderPath'>) =>
  at.folderPath.length === 0
    ? (ROOTS.get(at.folderId) ?? at.folderId)
    : at.folderPath.map((folder) => folder.title).join(' / ');

const elsewhere = (count: number) =>
  count === 1
    ? '1 cube in a folder you can’t see'
    : `${String(count)} cubes in folders you can’t see`;

/**
 * How many cubes use it, as a count (design 01 item 10, T496): which, and in
 * which folders, one step away in a tooltip that hovering or focusing opens —
 * each cube once, not a line per cube with its folder repeated.
 */
function UsedBy({ cubes, hidden = 0 }: { cubes: ListedSource['usedBy']; hidden?: number }) {
  const tip = useId();
  const anchor = useRef<HTMLSpanElement>(null);
  /**
   * Where the list opens: under the count, fixed to the window, so no
   * scrolling table cuts it off (T496's review). Closed, it is hidden, and
   * still the count's description.
   */
  const [at, setAt] = useState<{ top: number; right: number } | null>(null);
  const open = () => {
    const box = anchor.current?.getBoundingClientRect();
    if (box !== undefined) setAt({ top: box.bottom, right: window.innerWidth - box.right });
  };
  const close = () => {
    setAt(null);
  };
  if (cubes === null) return <span className="sources-muted">Not known: Cube didn’t answer</span>;
  if (cubes.length === 0 && hidden === 0) return <span className="sources-muted">No cube</span>;
  const count = cubes.length + hidden;
  return (
    <span className="sources-used-by" onMouseEnter={open} onMouseLeave={close}>
      {/* Focusable, so the list opens from the keyboard too, and Escape closes it
          without moving on (WCAG 1.4.13): it is the count's description. */}
      {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
      <span
        ref={anchor}
        className="sources-used-by__count"
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- the tooltip's anchor
        tabIndex={0}
        aria-describedby={tip}
        onFocus={open}
        onBlur={close}
        onKeyDown={(event) => {
          if (event.key === 'Escape') close();
        }}
      >
        {count === 1 ? '1 cube' : `${String(count)} cubes`}
      </span>
      <span
        id={tip}
        role="tooltip"
        className="sources-used-by__tip"
        hidden={at === null}
        style={at === null ? undefined : { top: at.top, right: at.right }}
      >
        {cubes.length === 0 ? (
          elsewhere(hidden)
        ) : (
          <ul>
            {cubes.map((cube) => (
              <li key={`${cube.folderId}/${cube.name}`}>
                <span className="is-code">{cube.name}</span>
                <span className="sources-muted"> · {pathLabel(cube)}</span>
              </li>
            ))}
            {hidden === 0 ? null : <li className="sources-muted">{elsewhere(hidden)}</li>}
          </ul>
        )}
      </span>
    </span>
  );
}

export function DataSourcesList({
  sources,
  seesEveryFolder = false,
  readWrite = false,
  cubeStore = false,
}: {
  sources: readonly ListedSource[];
  /** A Super-Admin, or the one user with security off: none listed is none there. */
  seesEveryFolder?: boolean;
  /** A read-write member of some folder: none listed is none in their folders yet. */
  readWrite?: boolean;
  /** Cube Store listed, once on, to one who may use it (T536, AC-384; design 15's H1). */
  cubeStore?: boolean;
}) {
  const [folder, setFolder] = useState('');
  const [driver, setDriver] = useState('');
  const [health, setHealth] = useState('');
  const [search, setSearch] = useState('');

  if (sources.length === 0 && !cubeStore && seesEveryFolder)
    return (
      <InfoBar>
        <p>No data source has been added yet.</p>
      </InfoBar>
    );
  if (sources.length === 0 && !cubeStore && readWrite)
    return (
      <InfoBar>
        <p>No data source has been added to your folders, or to the folders above them, yet.</p>
      </InfoBar>
    );
  if (sources.length === 0 && !cubeStore)
    return (
      <div className="sources-empty">
        <InfoBar>
          <p>
            Data sources are available to read-write members of a folder. Your dashboards are in
            Explore.
          </p>
        </InfoBar>
        <a className="btn" href="/explore">
          Open Explore
        </a>
      </div>
    );

  const now = new Date();
  const folders = [...new Map(sources.map((source) => [source.folderId, pathLabel(source)]))];
  const drivers = [...new Set(sources.map((source) => source.driver))];
  const shown = sources.filter(
    (source) =>
      (folder === '' || source.folderId === folder) &&
      (driver === '' || source.driver === driver) &&
      (health === '' || healthOf(source).kind === health) &&
      source.name.toLowerCase().includes(search.trim().toLowerCase()),
  );
  // Its own row, at the root, while no filter but its name leaves it out.
  const cubeStoreShown =
    cubeStore &&
    (folder === '' || folder === SHARED_ROOT.id) &&
    driver === '' &&
    health === '' &&
    'cube store'.includes(search.trim().toLowerCase());

  return (
    <>
      {/* Design 01's filter pills: each says what it filters and what it holds,
          "Folder All", a native select within (T496). */}
      <div className="sources-filters">
        <label className="select-pill">
          <span>Folder</span>
          <select value={folder} onChange={(event) => setFolder(event.target.value)}>
            <option value="">All</option>
            {folders.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="select-pill">
          <span>Driver</span>
          <select value={driver} onChange={(event) => setDriver(event.target.value)}>
            <option value="">All</option>
            {drivers.map((each) => (
              <option key={each} value={each}>
                {driverLabel(each)}
              </option>
            ))}
          </select>
        </label>
        <label className="select-pill">
          <span>Health</span>
          <select value={health} onChange={(event) => setHealth(event.target.value)}>
            <option value="">Any</option>
            <option value="ok">Passed</option>
            <option value="err">Failed</option>
            <option value="idle">Not tested</option>
          </select>
        </label>
        <input
          type="search"
          className="sources-filters__search"
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
              <th scope="col" className="sources-num">
                Used by
              </th>
              <th scope="col">Updated</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((source) => {
              return (
                <tr key={source.id} data-testid={`source-${source.id}`}>
                  {/* A name as Cube's model writes it, in the code face (design 01). */}
                  <td className="is-code sources-name">
                    {/* Opens its settings, the page Explore's row opens (T462, state J). */}
                    <a href={`/explore/data-sources/${encodeURIComponent(source.id)}`}>
                      {source.name}
                    </a>
                  </td>
                  <td>
                    <a href={`/explore?folder=${encodeURIComponent(source.folderId)}`}>
                      {pathLabel(source)}
                    </a>
                  </td>
                  <td>{driverLabel(source.driver)}</td>
                  <td>
                    {/* How long ago, the time on hover (design 01 item 9; T490). */}
                    <HealthBadge source={source} />
                  </td>
                  <td data-testid="source-used-by" className="sources-num">
                    <UsedBy
                      cubes={source.usedBy}
                      {...(source.usedElsewhere === undefined
                        ? {}
                        : { hidden: source.usedElsewhere })}
                    />
                  </td>
                  <td className="sources-muted">
                    {/* The day, the time on hover (design 01 item 9). */}
                    <time dateTime={source.updatedAt} title={exactOf(new Date(source.updatedAt))}>
                      {shortDay(new Date(source.updatedAt), now)}
                    </time>
                  </td>
                </tr>
              );
            })}
            {cubeStoreShown ? (
              // "Cube Store · Shared · Cube Store · every folder's rollups" (design 15's H1).
              <tr data-testid="source-cubestore">
                <td className="sources-name">
                  <a href={`/explore/data-sources/${CUBE_STORE_ID}`}>Cube Store</a>
                </td>
                <td>
                  <a href={`/explore?folder=${SHARED_ROOT.id}`}>{SHARED_ROOT.title}</a>
                </td>
                <td>Cube Store</td>
                <td className="sources-muted">every folder’s rollups</td>
                <td />
                <td />
              </tr>
            ) : null}
          </tbody>
        </table>
      </TableScroll>
      {/* What a read-write member is shown, and that some of it is only to look at. */}
      {readWrite && !seesEveryFolder ? (
        <p className="sources-footnote">
          Showing data sources in the folders where you have read-write access, and in the folders
          above them (view only).
        </p>
      ) : null}
    </>
  );
}
