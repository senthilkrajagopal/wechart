import { randomUUID } from 'node:crypto';

import { sql, type Kysely } from 'kysely';

import type { Database } from '../db/schema';

/**
 * The audit trail (T368, AC-294; design 08 of 2026-09-27): the seven kinds
 * of event AC-294 names, each recorded with who, what, which folder and when,
 * with a one-line summary and the full record's details. Records are only
 * ever added, and removed by the retention period alone (T370, AC-296). None
 * holds a credential: a secret is said "replaced" (AC-298, rule 83).
 */
export const AUDIT_EVENTS = [
  'sign-in',
  'access-change',
  'proposal',
  'approval',
  'rejection',
  'restore',
  'data-source-change',
] as const;
export type AuditEvent = (typeof AUDIT_EVENTS)[number];

/** Who did it, as wechart knew them then. */
export interface AuditActor {
  readonly key: string;
  readonly name: string;
  readonly identity?: string;
}

export interface AuditEntry {
  /** When; now unless given. */
  readonly at?: Date;
  readonly actor: AuditActor | null;
  readonly event: AuditEvent;
  /** The folder it happened in; none for a sign-in. */
  readonly folderId: string | null;
  /** What it was done to; none for a sign-in. */
  readonly item: { readonly kind: string; readonly id: string; readonly title: string } | null;
  /** The line the trail shows. */
  readonly summary: string;
  /** The full record, for the inspector: never a credential. */
  readonly details?: Record<string, unknown>;
}

export interface AuditRecord extends Required<Omit<AuditEntry, 'details'>> {
  readonly id: string;
  readonly at: Date;
  readonly details: Record<string, unknown> | null;
}

export interface AuditFilter {
  /** Records by any of these people, by key. */
  readonly users?: readonly string[];
  readonly events?: readonly AuditEvent[];
  /** Records in any of these folders; a folder's subfolders are the caller's to list. */
  readonly folderIds?: readonly string[];
  readonly since?: Date;
  readonly until?: Date;
  /** A page's size; 50 unless said. */
  readonly limit?: number;
  /** The page after the one that gave this; none for the first. */
  readonly after?: string | undefined;
}

export interface AuditStore {
  record(entry: AuditEntry): Promise<void>;
  /** Newest first, always (AC-295): a page, and where the next begins, if there is one. */
  list(filter: AuditFilter): Promise<{ records: AuditRecord[]; next?: string }>;
  /** Everyone the records name, each once, by name, for the User filter. */
  actors(): Promise<AuditActor[]>;
  /** Removes the records from before `cutoff`; says how many (T370, AC-296). */
  removeBefore(cutoff: Date): Promise<number>;
}

const PAGE = 50;

/** A page's end, as the next page's start: its last record's time and id. */
const cursorOf = (record: { at: Date; id: string }) =>
  Buffer.from(JSON.stringify([record.at.toISOString(), record.id])).toString('base64url');
const fromCursor = (cursor: string): [Date, string] | undefined => {
  try {
    const [at, id] = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as [
      string,
      string,
    ];
    const when = new Date(at);
    return Number.isNaN(when.getTime()) || typeof id !== 'string' ? undefined : [when, id];
  } catch {
    return undefined;
  }
};

export function auditStore(db: Kysely<Database>): AuditStore {
  return {
    async record(entry) {
      await db
        .insertInto('audit_records')
        .values({
          id: randomUUID(),
          // Stamped here, to the millisecond a JavaScript date holds: the
          // database's own now() keeps microseconds, which a page's cursor,
          // read back as a date, would lose (T368's review).
          at: entry.at ?? new Date(),
          actor_key: entry.actor?.key ?? null,
          actor_name: entry.actor?.name ?? null,
          actor_identity: entry.actor?.identity ?? null,
          event: entry.event,
          folder_id: entry.folderId,
          item_kind: entry.item?.kind ?? null,
          item_id: entry.item?.id ?? null,
          item_title: entry.item?.title ?? null,
          summary: entry.summary,
          details: entry.details === undefined ? null : JSON.stringify(entry.details),
        })
        .execute();
    },

    async list(filter) {
      const limit = Math.max(1, Math.min(filter.limit ?? PAGE, 500));
      let query = db.selectFrom('audit_records').selectAll();
      if (filter.users !== undefined) {
        if (filter.users.length === 0) return { records: [] };
        query = query.where('actor_key', 'in', [...filter.users]);
      }
      if (filter.events !== undefined) {
        if (filter.events.length === 0) return { records: [] };
        query = query.where('event', 'in', [...filter.events]);
      }
      if (filter.folderIds !== undefined) {
        if (filter.folderIds.length === 0) return { records: [] };
        query = query.where('folder_id', 'in', [...filter.folderIds]);
      }
      if (filter.since !== undefined) query = query.where('at', '>=', filter.since);
      if (filter.until !== undefined) query = query.where('at', '<', filter.until);
      const after = filter.after === undefined ? undefined : fromCursor(filter.after);
      if (after !== undefined)
        query = query.where(sql<boolean>`(at, id) < (${after[0]}, ${after[1]})`);
      // One more than a page, to know whether another follows.
      const rows = await query
        .orderBy('at', 'desc')
        .orderBy('id', 'desc')
        .limit(limit + 1)
        .execute();
      const records = rows.slice(0, limit).map((row): AuditRecord => ({
        id: row.id,
        at: row.at,
        actor:
          row.actor_key === null
            ? null
            : {
                key: row.actor_key,
                name: row.actor_name ?? row.actor_key,
                ...(row.actor_identity === null ? {} : { identity: row.actor_identity }),
              },
        event: row.event as AuditEvent,
        folderId: row.folder_id,
        item:
          row.item_kind === null || row.item_id === null
            ? null
            : { kind: row.item_kind, id: row.item_id, title: row.item_title ?? row.item_id },
        summary: row.summary,
        details: row.details,
      }));
      const last = records.at(-1);
      return rows.length > limit && last !== undefined
        ? { records, next: cursorOf(last) }
        : { records };
    },

    async actors() {
      const rows = await db
        .selectFrom('audit_records')
        .select(['actor_key', 'actor_name', 'actor_identity'])
        .distinctOn('actor_key')
        .where('actor_key', 'is not', null)
        .orderBy('actor_key')
        .orderBy('at', 'desc')
        .execute();
      return rows
        .map((row) => ({
          key: row.actor_key!,
          name: row.actor_name ?? row.actor_key!,
          ...(row.actor_identity === null ? {} : { identity: row.actor_identity }),
        }))
        .sort((a, b) => a.name.localeCompare(b.name) || a.key.localeCompare(b.key));
    },

    async removeBefore(cutoff) {
      const removed = await db
        .deleteFrom('audit_records')
        .where('at', '<', cutoff)
        .executeTakeFirst();
      return Number(removed.numDeletedRows);
    },
  };
}
