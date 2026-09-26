import type { Kysely } from 'kysely';

import type { Database } from '../db/schema';

/** A model file, as a draft holds it. */
export interface DraftFile {
  readonly path: string;
  readonly content: string;
}

/**
 * Publish drafts while Cube compiles them (T142), kept only while wechart
 * waits for Cube's answer, and marked once Cube has read one: an answer given
 * without reading it was of another model.
 */
export interface PublishDraftStore {
  put(id: string, files: readonly DraftFile[]): Promise<void>;
  /** The draft's files, marked read; undefined for one that isn't there. */
  take(id: string): Promise<readonly DraftFile[] | undefined>;
  wasRead(id: string): Promise<boolean>;
  remove(id: string): Promise<void>;
}

/** In one process: enough for one API instance and for tests without a database. */
export function memoryDraftStore(): PublishDraftStore {
  const drafts = new Map<string, { files: readonly DraftFile[]; read: boolean }>();
  return {
    put: async (id, files) => {
      drafts.set(id, { files, read: false });
    },
    take: async (id) => {
      const draft = drafts.get(id);
      if (draft === undefined) return undefined;
      draft.read = true;
      return draft.files;
    },
    wasRead: async (id) => drafts.get(id)?.read ?? false,
    remove: async (id) => {
      drafts.delete(id);
    },
  };
}

/**
 * In the metadata database (T418, AC-319), so that with two API replicas the
 * one Cube's read-back reaches has the draft the other made.
 */
export function publishDraftStore(db: Kysely<Database>): PublishDraftStore {
  return {
    put: async (id, files) => {
      await db
        .insertInto('publish_drafts')
        .values({
          id,
          files: JSON.stringify(files.map(({ path, content }) => ({ path, content }))),
        })
        .execute();
    },
    take: async (id) => {
      const row = await db
        .updateTable('publish_drafts')
        .set({ read: true })
        .where('id', '=', id)
        .returning('files')
        .executeTakeFirst();
      return row?.files;
    },
    wasRead: async (id) => {
      const row = await db
        .selectFrom('publish_drafts')
        .select('read')
        .where('id', '=', id)
        .executeTakeFirst();
      return row?.read ?? false;
    },
    remove: async (id) => {
      await db.deleteFrom('publish_drafts').where('id', '=', id).execute();
    },
  };
}
