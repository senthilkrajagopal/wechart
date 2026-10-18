import type { FastifyInstance, FastifyRequest } from 'fastify';

import { USER } from '../auth/guard';
import { ROOT_FOLDER_ID } from '../repos/catalog';
import type { DataSource, DataSourceStore } from '../repos/data-sources';
import { CUBE_STORE_TARGET, type SqlRunnerSwitchStore } from '../repos/sql-runner-switches';
import type { DataSourceAccess } from './data-sources';
import { needsSwitch } from './sql-runner';

/**
 * The SQL runner workspace's data source picker (T798; F42, R78; design 17,
 * state B; AC-447): `GET /api/sql/sources`, the data sources the user may
 * run SQL on, and the off ones they may see off, by the rules a run itself
 * is held to (`mayRunSql`, AC-373, AC-383, AC-384):
 *
 * - **Their own workspace's,** for its owner alone, never another user's,
 *   Super-Admins included: "no-switch", unless a copy pointed elsewhere
 *   needs one (Q8), when it is on or off by its switch.
 * - **A shared folder's,** for Super-Admins and that folder's own read-write
 *   members (a member who sees it only as an ancestor's has no right to
 *   write it): on or off by its switch. An off one is listed so that
 *   choosing it shows the off panel (AC-447).
 * - **Cube Store,** at the root while it is on, to Super-Admins and to those
 *   who may run SQL on a shared folder's data source switched on (AC-384,
 *   Q7): a workspace's doesn't count.
 *
 * My workspace's first, then the shared ones by folder path and name, then
 * Cube Store. Only names, drivers, folders and states: never a field or a
 * secret.
 */
export type RunnerState = 'on' | 'off' | 'no-switch';

export interface SqlSourceRow {
  readonly id: string;
  readonly name: string;
  /** None for Cube Store. */
  readonly driver: string | null;
  readonly cubeStore: boolean;
  readonly folderId: string;
  readonly folderPath: readonly { readonly id: string; readonly title: string }[];
  readonly inWorkspace: boolean;
  readonly runner: RunnerState;
}

/** Cube Store's row: the root's, by its switch's own id (T536). */
const CUBE_STORE_ROW: SqlSourceRow = {
  id: CUBE_STORE_TARGET,
  name: 'Cube Store',
  driver: null,
  cubeStore: true,
  folderId: ROOT_FOLDER_ID,
  folderPath: [],
  inWorkspace: false,
  runner: 'on',
};

export interface SqlSourcesDeps {
  readonly store: Pick<DataSourceStore, 'all' | 'get'>;
  readonly access: DataSourceAccess;
  readonly switches: SqlRunnerSwitchStore | undefined;
  /** The workspace a folder is in, or null for a shared one; unset with sign-in off. */
  readonly workspaceOf: ((folderId: string) => Promise<string | null>) | undefined;
  /** The request's user's own workspace; unset with sign-in off. */
  readonly ownWorkspace: ((request: FastifyRequest) => Promise<string | undefined>) | undefined;
  readonly paths: () => Promise<
    (folderId: string) => readonly { readonly id: string; readonly title: string }[]
  >;
  /** Whether xcube's runner is set up here: none runs SQL without it. */
  readonly runs: boolean;
}

/**
 * The request's user's picker rows, as `GET /api/sql/sources` answers them;
 * undefined where the SQL runner isn't set up here. With `only`, those of
 * these ids alone (Cube Store's id among them, every one).
 */
export type SqlSourcesOf = (
  request: FastifyRequest,
  only?: ReadonlySet<string>,
) => Promise<SqlSourceRow[] | undefined>;

/**
 * Whether the request's user may run SQL on the data source `id` (Cube
 * Store's by its own id): listed for them and not off. A saved query's or a
 * History row's source they may not is never named to them (T814, AC-459;
 * T817, AC-381).
 */
export const runsSqlOn = (rows: readonly SqlSourceRow[], id: string): boolean =>
  rows.some((row) => row.id === id && row.runner !== 'off');

export function sqlSourcesLister({
  store,
  access,
  switches,
  workspaceOf,
  ownWorkspace,
  paths,
  runs,
}: SqlSourcesDeps): SqlSourcesOf {
  return async (request, only) => {
    if (!runs || switches === undefined) return undefined;
    // Only the ones asked about, where none is Cube Store, whose row depends
    // on every shared one: each source's checks cost a folder's access.
    const all = (await store.all()).filter(
      (source) => only === undefined || only.has(CUBE_STORE_TARGET) || only.has(source.id),
    );
    const on = await switches.among([...all.map((source) => source.id), CUBE_STORE_TARGET]);
    const own = (await ownWorkspace?.(request)) ?? null;
    const pathOf = await paths();
    const rowOf = (source: DataSource, inWorkspace: boolean, runner: RunnerState) => ({
      id: source.id,
      name: source.name,
      driver: source.driver,
      cubeStore: false,
      folderId: source.folderId,
      folderPath: pathOf(source.folderId),
      inWorkspace,
      runner,
    });

    const mine: SqlSourceRow[] = [];
    const shared: SqlSourceRow[] = [];
    for (const source of all) {
      const workspace = (await workspaceOf?.(source.folderId)) ?? null;
      const state: RunnerState = on.has(source.id) ? 'on' : 'off';
      if (workspace !== null) {
        // The owner's alone: never another user's, a Super-Admin's included.
        if (workspace !== own) continue;
        mine.push(rowOf(source, true, (await needsSwitch(source, store)) ? state : 'no-switch'));
        continue;
      }
      if ((await access(request, source.folderId, 'write')) !== undefined) continue;
      shared.push(rowOf(source, false, state));
    }
    const byPlace = (a: SqlSourceRow, b: SqlSourceRow) => {
      const where = (row: SqlSourceRow) => row.folderPath.map((step) => step.title).join(' / ');
      return where(a).localeCompare(where(b)) || a.name.localeCompare(b.name);
    };
    mine.sort(byPlace);
    shared.sort(byPlace);
    // As `GET /api/cube-store` decides it (T536).
    const cubeStore =
      on.has(CUBE_STORE_TARGET) &&
      (request.wechartUser?.superAdmin === true || shared.some((row) => row.runner === 'on'));
    return [...mine, ...shared, ...(cubeStore ? [CUBE_STORE_ROW] : [])];
  };
}

export function registerSqlSources(app: FastifyInstance, sourcesOf: SqlSourcesOf): void {
  app.get('/api/sql/sources', USER, async (request: FastifyRequest, reply) => {
    const rows = await sourcesOf(request);
    if (rows === undefined) return reply.status(503).send({ error: 'The SQL runner isn’t set up here.' });
    return rows;
  });
}
