import type { Kysely } from 'kysely';

import type { Database } from '../db/schema';

/**
 * The versions of a shared item wechart landed (T352, AC-288; T354, AC-289),
 * each a copy it holds: its content as it was, who proposed it, who approved
 * it, when, and the description. A version from before proposals, replaced by
 * the first approval, has neither author nor approver. A data source's
 * content keeps its credentials as sealed (AC-298). A model's is its file,
 * `{ path, content }` (T451).
 */
export type VersionKind = 'dashboard' | 'chart' | 'data-source' | 'model';

/** How many of an item's versions are kept, newest first (AC-289). */
export const KEPT_VERSIONS = 10;

type Person = { readonly key: string; readonly name: string };

export interface ItemVersion {
  readonly kind: VersionKind;
  readonly itemId: string;
  readonly version: number;
  /** `{ body, parts }`: the item, and a dashboard's own charts. */
  readonly content: Record<string, unknown>;
  readonly folderId: string;
  readonly title: string;
  readonly author: Person | null;
  readonly approver: Person | null;
  readonly description: string | null;
  readonly proposalId: string | null;
}

export interface KeptVersion extends ItemVersion {
  readonly at: Date;
}

export interface VersionStore {
  /** Keeps a version once: one already kept at that number is left as it is. */
  keep(version: ItemVersion & { readonly at?: Date }): Promise<void>;
  /** An item's versions, newest first. */
  list(kind: VersionKind, itemId: string): Promise<KeptVersion[]>;
  get(kind: VersionKind, itemId: string, version: number): Promise<KeptVersion | null>;
  /** The versions an approval landed (T355: "Approved as version n"), without their content. */
  landedBy(
    proposalId: string,
  ): Promise<{ readonly kind: VersionKind; readonly itemId: string; readonly version: number }[]>;
}

export function versionStore(db: Kysely<Database>): VersionStore {
  const select = () => db.selectFrom('item_versions').selectAll();
  type Row = Awaited<ReturnType<ReturnType<typeof select>['executeTakeFirstOrThrow']>>;
  const person = (key: string | null, name: string | null): Person | null =>
    key === null ? null : { key, name: name ?? key };
  const toVersion = (row: Row): KeptVersion => ({
    kind: row.kind as VersionKind,
    itemId: row.item_id,
    version: row.version,
    content: row.content,
    folderId: row.folder_id,
    title: row.title,
    author: person(row.author_key, row.author_name),
    approver: person(row.approver_key, row.approver_name),
    at: row.at,
    description: row.description,
    proposalId: row.proposal_id,
  });

  return {
    async keep(version) {
      await db
        .insertInto('item_versions')
        .values({
          kind: version.kind,
          item_id: version.itemId,
          version: version.version,
          content: JSON.stringify(version.content),
          folder_id: version.folderId,
          title: version.title,
          author_key: version.author?.key ?? null,
          author_name: version.author?.name ?? null,
          approver_key: version.approver?.key ?? null,
          approver_name: version.approver?.name ?? null,
          // Stamped here, to the millisecond a JavaScript date holds.
          at: version.at ?? new Date(),
          description: version.description,
          proposal_id: version.proposalId,
        })
        .onConflict((conflict) => conflict.columns(['kind', 'item_id', 'version']).doNothing())
        .execute();
      // Only the last 10 are kept (T354, AC-289): the oldest go.
      const tenth = await db
        .selectFrom('item_versions')
        .select('version')
        .where('kind', '=', version.kind)
        .where('item_id', '=', version.itemId)
        .orderBy('version', 'desc')
        .offset(KEPT_VERSIONS - 1)
        .limit(1)
        .executeTakeFirst();
      if (tenth !== undefined)
        await db
          .deleteFrom('item_versions')
          .where('kind', '=', version.kind)
          .where('item_id', '=', version.itemId)
          .where('version', '<', tenth.version)
          .execute();
    },

    async list(kind, itemId) {
      const rows = await select()
        .where('kind', '=', kind)
        .where('item_id', '=', itemId)
        .orderBy('version', 'desc')
        .execute();
      return rows.map(toVersion);
    },

    async get(kind, itemId, version) {
      const row = await select()
        .where('kind', '=', kind)
        .where('item_id', '=', itemId)
        .where('version', '=', version)
        .executeTakeFirst();
      return row === undefined ? null : toVersion(row);
    },

    async landedBy(proposalId) {
      const rows = await db
        .selectFrom('item_versions')
        .select(['kind', 'item_id', 'version'])
        .where('proposal_id', '=', proposalId)
        .execute();
      return rows.map((row) => ({
        kind: row.kind as VersionKind,
        itemId: row.item_id,
        version: row.version,
      }));
    },
  };
}
