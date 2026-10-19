import type { Kysely, Selectable } from 'kysely';

import type { BoundarySetOrigin, BoundarySetTable, Database } from '../db/schema';

/**
 * Custom boundary sets (T979, AC-628; R81-1): a Map's GeoJSON regions, in a
 * shared folder, or in a workspace with the folder they are to go to. A name
 * is a folder's once. A set read for a list leaves its GeoJSON behind.
 */
export interface BoundarySet {
  readonly id: string;
  readonly folderId: string;
  readonly name: string;
  readonly keyProperty: string;
  readonly regions: number;
  readonly version: number;
  readonly targetFolderId: string | null;
  readonly origin: BoundarySetOrigin | null;
}

export interface NewBoundarySet {
  readonly folderId: string;
  readonly targetFolderId: string | null;
  readonly name: string;
  readonly keyProperty: string;
  readonly geojson: Record<string, unknown>;
  readonly regions: number;
  readonly createdBy: string;
}

const setOf = (row: Omit<Selectable<BoundarySetTable>, 'geojson'>): BoundarySet => ({
  id: row.id,
  folderId: row.folder_id,
  name: row.name,
  keyProperty: row.key_property,
  regions: row.regions,
  version: row.version,
  targetFolderId: row.target_folder_id,
  origin: row.origin,
});

const COLUMNS = [
  'id',
  'folder_id',
  'name',
  'key_property',
  'regions',
  'version',
  'target_folder_id',
  'origin',
  'created_by',
  'created_at',
  'updated_at',
] as const;

const isTaken = (error: unknown) =>
  (error as { code?: unknown } | null)?.code === '23505';

export function boundarySetStore(db: Kysely<Database>) {
  return {
    /** A new set; `{ taken: true }` where its folder has one of its name. */
    async create(input: NewBoundarySet): Promise<BoundarySet | { readonly taken: true }> {
      try {
        const row = await db
          .insertInto('boundary_sets')
          .values({
            folder_id: input.folderId,
            target_folder_id: input.targetFolderId,
            name: input.name,
            key_property: input.keyProperty,
            geojson: JSON.stringify(input.geojson),
            regions: input.regions,
            created_by: input.createdBy,
          })
          .returning(COLUMNS)
          .executeTakeFirstOrThrow();
        return setOf(row);
      } catch (error) {
        if (isTaken(error)) return { taken: true };
        throw error;
      }
    },

    /** One set, without its GeoJSON. */
    async get(id: string): Promise<BoundarySet | undefined> {
      const row = await db
        .selectFrom('boundary_sets')
        .select(COLUMNS)
        .where('id', '=', id)
        .executeTakeFirst();
      return row === undefined ? undefined : setOf(row);
    },

    /** One set's GeoJSON. */
    async geojson(id: string): Promise<Record<string, unknown> | undefined> {
      const row = await db
        .selectFrom('boundary_sets')
        .select('geojson')
        .where('id', '=', id)
        .executeTakeFirst();
      return row?.geojson;
    },

    /** The sets in any of these folders, by name. */
    async inFolders(folderIds: readonly string[]): Promise<BoundarySet[]> {
      if (folderIds.length === 0) return [];
      const rows = await db
        .selectFrom('boundary_sets')
        .select(COLUMNS)
        .where('folder_id', 'in', [...folderIds])
        .orderBy('name')
        .execute();
      return rows.map(setOf);
    },

    /**
     * A proposed set landed in its folder (T979): over the one it replaces,
     * at its next version, or as a new one. Answers where it landed.
     */
    async land(item: {
      readonly landsIn: string;
      readonly replaces: { readonly id: string } | null;
      readonly snapshot: Record<string, unknown>;
      readonly author: string;
    }): Promise<{ id: string; version: number }> {
      const { name, keyProperty, geojson, regions } = item.snapshot as {
        name: string;
        keyProperty: string;
        geojson: Record<string, unknown>;
        regions: number;
      };
      if (item.replaces !== null) {
        const row = await db
          .updateTable('boundary_sets')
          .set((eb) => ({
            name,
            key_property: keyProperty,
            geojson: JSON.stringify(geojson),
            regions,
            version: eb('version', '+', 1),
            updated_at: new Date(),
          }))
          .where('id', '=', item.replaces.id)
          .returning(['id', 'version'])
          .executeTakeFirst();
        if (row !== undefined) return row;
      }
      const row = await db
        .insertInto('boundary_sets')
        .values({
          folder_id: item.landsIn,
          target_folder_id: null,
          name,
          key_property: keyProperty,
          geojson: JSON.stringify(geojson),
          regions,
          created_by: item.author,
        })
        .returning(['id', 'version'])
        .executeTakeFirstOrThrow();
      return row;
    },

    /** A workspace set's origin, once landed. */
    async setOrigin(id: string, origin: BoundarySetOrigin): Promise<void> {
      await db
        .updateTable('boundary_sets')
        .set({ origin: JSON.stringify(origin) })
        .where('id', '=', id)
        .execute();
    },
  };
}

export type BoundarySetStore = ReturnType<typeof boundarySetStore>;
