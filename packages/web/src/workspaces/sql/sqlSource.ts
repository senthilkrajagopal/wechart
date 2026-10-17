import type { DriverType, FieldValue } from '@wechart/core';

import { loginOf, type Login } from '../data-sources/sqlLogin';

/**
 * What the SQL runner runs on, shared by the data source page's runner
 * (T535, design 15) and the SQL runner workspace (F42, design 17): moved
 * here from `SqlRunner.tsx` with the off panel (T798).
 */

/** What the data source's page says of its runner, for this user (`GET …/:id`). */
export interface SqlRunnerState {
  readonly on: boolean;
  readonly confirmedBy?: { readonly name: string };
  readonly confirmedAt?: string;
  /** Whether this user gets the tab at all. */
  readonly tab: boolean;
  /** Whether they may run SQL on it now. */
  readonly runs: boolean;
  /** Why not, where they may not. */
  readonly why?: string;
  /** A workspace copy pointed elsewhere, which needs a switch (Q8). */
  readonly needsSwitch?: boolean;
}

interface SqlPage {
  readonly id: string;
  /** Its settings' version: the schema browser reads it again at another (T539's review). */
  readonly version: number;
  readonly name: string;
  readonly folderPath: readonly { readonly id: string; readonly title: string }[];
  readonly inWorkspace: boolean;
  readonly sqlRunner: SqlRunnerState;
}

/** What a SQL tab runs on: a data source, or Cube Store (T536), which has no login of its own. */
export type SqlSource =
  | (SqlPage & {
      readonly cubeStore?: false;
      readonly driver: DriverType;
      readonly fields: Readonly<Record<string, FieldValue>>;
    })
  | (SqlPage & { readonly cubeStore: true });

/** Cube Store has no login: wechart's check on each command is its only guard (Q9). */
const CUBE_STORE_LOGIN: Login = { as: null, database: null, where: 'Cube Store' };
export const loginFor = (source: SqlSource): Login =>
  source.cubeStore === true ? CUBE_STORE_LOGIN : loginOf(source.driver, source.fields);
/** Its routes: a data source's by its id, or Cube Store's (T536). */
export const routeOf = (source: SqlSource, route: 'sql' | 'sql-runner') =>
  source.cubeStore === true
    ? `/api/cube-store/${route}`
    : `/api/data-sources/${encodeURIComponent(source.id)}/${route}`;
/** What the page reads its runner's switch from, again once it changes. */
export const pageKeyOf = (source: SqlSource) =>
  source.cubeStore === true ? ['cube-store'] : ['data-source', source.id];

export const pathText = (path: readonly { readonly title: string }[]) =>
  path.length === 0 ? 'Shared' : path.map((folder) => folder.title).join(' / ');
