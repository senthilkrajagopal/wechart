import type { Kysely, Selectable } from 'kysely';

import type { CalcRequestFields, CalcRequestTable, Database } from '../db/schema';
import type { OpenRequest } from './calc-resolution';

/**
 * Calculation requests (T383, AC-050; F6): a calculation the quick
 * calculations menu can't express, asked of the read-write members of the
 * folder whose model defines the chart's cube. Each holds the chart it came
 * from, the fields the chart had in use, the requester's words, and the
 * folder and model file it is asked of.
 */
export interface CalcRequest {
  readonly id: string;
  readonly chartId: string;
  /** The chart's cube or view, by its full published name. */
  readonly cube: string;
  readonly folderId: string;
  /** The model file defining the cube, by its path in that folder. */
  readonly modelPath: string;
  readonly fields: CalcRequestFields;
  readonly description: string;
  readonly requestedBy: { readonly key: string; readonly name: string };
  readonly requestedAt: Date;
  readonly status: 'open' | 'resolved';
  /** What resolved it (T385, AC-052); null while it is open. */
  readonly resolution: CalcResolution | null;
}

/**
 * A request's resolution (T385, AC-052, amended by R63): the approval of a
 * proposal adding measures to its cube, from a member who took it up.
 */
export interface CalcResolution {
  /** The measures that resolve it, each `<cube>.<measure>` by full name. */
  readonly members: readonly string[];
  readonly proposalId: string;
  /** The proposal's author, who took the request up. */
  readonly by: { readonly key: string; readonly name: string };
  /** Who approved the proposal, by name. */
  readonly approvedBy: string;
  readonly at: Date;
}

export type NewCalcRequest = Omit<CalcRequest, 'id' | 'requestedAt' | 'status' | 'resolution'>;

export interface CalcRequestStore {
  record(request: NewCalcRequest): Promise<CalcRequest>;
  /** The requests asked of any of these folders, newest first. */
  inFolders(folderIds: readonly string[]): Promise<readonly CalcRequest[]>;
  /** Every request, newest first: for one no folder tree holds back. */
  all(): Promise<readonly CalcRequest[]>;
  /** How many open requests are asked of any of these folders; of every one, for `'all'` (R60). */
  openCount(folderIds: readonly string[] | 'all'): Promise<number>;
  get(id: string): Promise<CalcRequest | undefined>;
  /** A member takes the request up, opening it into their workspace (T384); twice is once. */
  take(id: string, by: { readonly key: string; readonly name: string }): Promise<void>;
  /** Who took it up, first first. */
  takersOf(id: string): Promise<readonly { readonly key: string; readonly name: string }[]>;
  /**
   * The open requests a member took up, in any folder, newest first, each
   * with the keys of all who took it up (T385, T590): what an approval of
   * their proposal may resolve. A view's request may sit in a folder beneath
   * the cubes its measures land on.
   */
  openTakenBy(userKey: string): Promise<readonly OpenRequest[]>;
  /** Resolves an open request (T385); false, changing nothing, for one already resolved. */
  resolve(id: string, resolution: Omit<CalcResolution, 'at'>): Promise<boolean>;
}

const requestOf = (row: Selectable<CalcRequestTable>): CalcRequest => ({
  id: row.id,
  chartId: row.chart_id,
  cube: row.cube,
  folderId: row.folder_id,
  modelPath: row.model_path,
  fields: row.fields,
  description: row.description,
  requestedBy: { key: row.requested_by_key, name: row.requested_by_name },
  requestedAt: row.requested_at,
  status: row.status,
  resolution:
    row.status !== 'resolved' ||
    row.resolved_members === null ||
    row.resolved_proposal_id === null ||
    row.resolved_by_key === null ||
    row.resolved_by_name === null ||
    row.approved_by_name === null ||
    row.resolved_at === null
      ? null
      : {
          members: row.resolved_members,
          proposalId: row.resolved_proposal_id,
          by: { key: row.resolved_by_key, name: row.resolved_by_name },
          approvedBy: row.approved_by_name,
          at: row.resolved_at,
        },
});

/** An id as the database reads one, so a malformed one finds nothing rather than failing. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function calcRequestStore(db: Kysely<Database>): CalcRequestStore {
  return {
    async record(request) {
      const row = await db
        .insertInto('calc_requests')
        .values({
          chart_id: request.chartId,
          cube: request.cube,
          folder_id: request.folderId,
          model_path: request.modelPath,
          fields: JSON.stringify(request.fields),
          description: request.description,
          requested_by_key: request.requestedBy.key,
          requested_by_name: request.requestedBy.name,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      return requestOf(row);
    },
    async inFolders(folderIds) {
      if (folderIds.length === 0) return [];
      const rows = await db
        .selectFrom('calc_requests')
        .selectAll()
        .where('folder_id', 'in', folderIds)
        .orderBy('requested_at', 'desc')
        .orderBy('id', 'desc')
        .execute();
      return rows.map(requestOf);
    },
    async openCount(folderIds) {
      if (folderIds !== 'all' && folderIds.length === 0) return 0;
      let query = db
        .selectFrom('calc_requests')
        .select((eb) => eb.fn.countAll<string>().as('count'))
        .where('status', '=', 'open');
      if (folderIds !== 'all') query = query.where('folder_id', 'in', folderIds);
      return Number((await query.executeTakeFirstOrThrow()).count);
    },
    async all() {
      const rows = await db
        .selectFrom('calc_requests')
        .selectAll()
        .orderBy('requested_at', 'desc')
        .orderBy('id', 'desc')
        .execute();
      return rows.map(requestOf);
    },
    async take(id, by) {
      await db
        .insertInto('calc_request_takers')
        .values({ request_id: id, user_key: by.key, user_name: by.name })
        .onConflict((conflict) => conflict.columns(['request_id', 'user_key']).doNothing())
        .execute();
    },
    async takersOf(id) {
      if (!UUID.test(id)) return [];
      const rows = await db
        .selectFrom('calc_request_takers')
        .select(['user_key', 'user_name'])
        .where('request_id', '=', id)
        .orderBy('taken_at')
        .orderBy('user_key')
        .execute();
      return rows.map((row) => ({ key: row.user_key, name: row.user_name }));
    },
    async openTakenBy(userKey) {
      const rows = await db
        .selectFrom('calc_requests')
        .select(['id', 'cube', 'folder_id'])
        .where('status', '=', 'open')
        .where('id', 'in', (eb) =>
          eb.selectFrom('calc_request_takers').select('request_id').where('user_key', '=', userKey),
        )
        .orderBy('requested_at', 'desc')
        .orderBy('id', 'desc')
        .execute();
      if (rows.length === 0) return [];
      const takers = await db
        .selectFrom('calc_request_takers')
        .select(['request_id', 'user_key'])
        .where(
          'request_id',
          'in',
          rows.map((row) => row.id),
        )
        .orderBy('taken_at')
        .orderBy('user_key')
        .execute();
      return rows.map((row) => ({
        id: row.id,
        cube: row.cube,
        folderId: row.folder_id,
        takenBy: takers.flatMap((taker) => (taker.request_id === row.id ? [taker.user_key] : [])),
      }));
    },
    async resolve(id, resolution) {
      if (!UUID.test(id)) return false;
      const resolved = await db
        .updateTable('calc_requests')
        .set({
          status: 'resolved',
          resolved_members: JSON.stringify(resolution.members),
          resolved_proposal_id: resolution.proposalId,
          resolved_by_key: resolution.by.key,
          resolved_by_name: resolution.by.name,
          approved_by_name: resolution.approvedBy,
          resolved_at: new Date(),
        })
        .where('id', '=', id)
        .where('status', '=', 'open')
        .executeTakeFirst();
      return Number(resolved.numUpdatedRows) > 0;
    },
    async get(id) {
      if (!UUID.test(id)) return undefined;
      const row = await db
        .selectFrom('calc_requests')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst();
      return row === undefined ? undefined : requestOf(row);
    },
  };
}
