import type { FastifyInstance, FastifyRequest } from 'fastify';

import { AUDIT_RETENTION_DAYS } from '../audit/retention';
import { USER } from '../auth/guard';
import { Forbidden, userOf } from '../auth/user';
import {
  AUDIT_EVENTS,
  isAuditCursor,
  type AuditEvent,
  type AuditFilter,
  type AuditStore,
} from '../repos/audit';
import { isWorkspaceId } from '../repos/catalog';

/**
 * The audit trail (T369, AC-295; design 08 of 2026-09-27): shown to
 * Super-Admins alone — with sign-in off, the one user is one — newest first
 * always, filtered by who, which events, a folder (and its subfolders, when
 * asked) and a time range, a page at a time. Each record carries its
 * folder's path; the answer carries the retention the deployment keeps
 * records for (AC-296, pin 8).
 */
interface Folder {
  readonly id: string;
  readonly title: string;
  readonly parentId: string | null;
}

class Unreadable extends Error {}

/**
 * A comma-separated list, or the parameter repeated; none when not sent. One
 * sent that names nothing (`events=,`) is refused, never taken to match
 * nothing (T369's review).
 */
const listOf = (value: unknown, name: string): string[] | undefined => {
  const given = Array.isArray(value) ? value.join(',') : value;
  if (given === undefined || given === '') return undefined;
  const listed =
    typeof given === 'string'
      ? given
          .split(',')
          .map((each) => each.trim())
          .filter(Boolean)
      : [];
  if (listed.length === 0) throw new Unreadable(`${name} names nothing.`);
  return listed;
};

/** A parameter sent once, or not at all: a repeat is refused, never half-read (T369's review). */
const oneOf = (value: unknown, name: string): string | undefined => {
  if (value === undefined || value === '') return undefined;
  if (typeof value !== 'string') throw new Unreadable(`Send one ${name}.`);
  return value;
};

const timeOf = (value: unknown, name: string): Date | undefined => {
  if (value === undefined || value === '') return undefined;
  const when = typeof value === 'string' ? new Date(value) : new Date(Number.NaN);
  if (Number.isNaN(when.getTime())) throw new Unreadable(`${name} isn’t a time: send an ISO date.`);
  return when;
};

export function registerAudit(
  app: FastifyInstance,
  {
    store,
    folders,
    retentionDays = AUDIT_RETENTION_DAYS,
  }: {
    readonly store: AuditStore;
    /** Every folder, for paths and subfolders. */
    readonly folders: () => Promise<readonly Folder[]>;
    readonly retentionDays?: number;
  },
): void {
  const superAdminOnly = (request: FastifyRequest) => {
    if (!userOf(request).superAdmin)
      throw new Forbidden('Only a Super-Admin can see the audit trail.');
  };

  app.get('/api/audit', USER, async (request, reply) => {
    superAdminOnly(request);
    const query = request.query as Record<string, unknown>;
    let filter: AuditFilter;
    const all = await folders();
    try {
      const events = listOf(query['events'], 'events');
      for (const event of events ?? [])
        if (!(AUDIT_EVENTS as readonly string[]).includes(event))
          throw new Unreadable(`"${event}" isn’t an event: send ${AUDIT_EVENTS.join(', ')}.`);
      const limitSent = oneOf(query['limit'], 'limit');
      const limit = limitSent === undefined ? undefined : Number(limitSent);
      if (limit !== undefined && !(Number.isInteger(limit) && limit >= 1 && limit <= 500))
        throw new Unreadable('limit is a whole number from 1 to 500.');
      const folder = oneOf(query['folder'], 'folder');
      const subfolders = oneOf(query['subfolders'], 'subfolders');
      if (subfolders !== undefined && subfolders !== 'true' && subfolders !== 'false')
        throw new Unreadable('subfolders is true or false.');
      const since = timeOf(query['since'], 'since');
      const until = timeOf(query['until'], 'until');
      const users = listOf(query['users'], 'users');
      const after = oneOf(query['after'], 'page');
      if (after !== undefined && !isAuditCursor(after))
        throw new Unreadable('That page isn’t one this trail gave: start again from the first.');
      filter = {
        ...(users === undefined ? {} : { users }),
        ...(events === undefined ? {} : { events: events as AuditEvent[] }),
        ...(folder === undefined
          ? {}
          : {
              folderIds: subfolders === 'true' ? [folder, ...beneath(all, folder)] : [folder],
            }),
        ...(since === undefined ? {} : { since }),
        ...(until === undefined ? {} : { until }),
        ...(limit === undefined ? {} : { limit }),
        ...(after === undefined ? {} : { after }),
      };
    } catch (error) {
      if (error instanceof Unreadable) return reply.status(400).send({ error: error.message });
      throw error;
    }
    const { limit: _limit, after: _after, ...matching } = filter;
    void _limit;
    void _after;
    const [page, total] = await Promise.all([store.list(filter), store.count(matching)]);
    const pathOf = paths(all);
    return {
      records: page.records.map((record) => ({
        ...record,
        ...(record.folderId === null ? { folderPath: null } : pathOf(record.folderId)),
      })),
      ...(page.next === undefined ? {} : { next: page.next }),
      total,
      retentionDays,
    };
  });

  /** Everyone the records name, each once, for the User filter (pin 2). */
  app.get('/api/audit/people', USER, async (request) => {
    superAdminOnly(request);
    return store.actors();
  });
}

/** Every folder beneath this one, at any depth. */
function beneath(all: readonly Folder[], id: string): string[] {
  const found: string[] = [];
  const queue = [id];
  while (queue.length > 0) {
    const parent = queue.shift()!;
    for (const folder of all)
      if (folder.parentId === parent && !found.includes(folder.id)) {
        found.push(folder.id);
        queue.push(folder.id);
      }
  }
  return found;
}

/**
 * A folder's path from under the root, as the page names it; the root's is
 * empty (Shared). A workspace's, at any depth, is only "in a workspace",
 * never shown as if it were shared (T369's review); one no longer there, or
 * cut off from the root, has none.
 */
function paths(all: readonly Folder[]) {
  const byId = new Map(all.map((folder) => [folder.id, folder]));
  return (
    folderId: string,
  ): { folderPath: { id: string; title: string }[] | null; inWorkspace?: true } => {
    if (folderId === 'root') return { folderPath: [] };
    if (isWorkspaceId(folderId)) return { folderPath: null, inWorkspace: true };
    const path: { id: string; title: string }[] = [];
    let at = byId.get(folderId);
    while (at !== undefined && path.length <= all.length) {
      path.unshift({ id: at.id, title: at.title });
      if (at.parentId === 'root') return { folderPath: path };
      if (at.parentId !== null && isWorkspaceId(at.parentId))
        return { folderPath: null, inWorkspace: true };
      at = at.parentId === null ? undefined : byId.get(at.parentId);
    }
    return { folderPath: null };
  };
}
