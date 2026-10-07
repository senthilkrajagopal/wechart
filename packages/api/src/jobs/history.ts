import type { FastifyInstance, FastifyRequest } from 'fastify';

import { USER } from '../auth/guard';
import type {
  BuildHistory,
  BuildListFilters,
  BuildRecord,
  BuildSummary,
} from '../repos/build-history';
import { ROOT_FOLDER_ID } from '../repos/catalog';
import { EVERYTHING, NO_JOBS, type JobsAccess, type JobsScope } from './scope';

/**
 * Run history (T374, AC-150; design 16, state B): the builds wechart started,
 * newest first, 50 at a time, narrowed by outcome, starter, folder and time,
 * and each build's own record with its log. Scoped as T371 scopes Jobs
 * (AC-297): a Super-Admin's every folder, a read-write member's the folders
 * they write, and no one else's. A build out of scope reads as one that
 * doesn't exist (state G6).
 */

/** "Last 24 hours", "Last 7 days", "Last 30 days"; none for all of it. */
const WITHIN_MS: Readonly<Record<string, number>> = {
  day: 86_400_000,
  week: 7 * 86_400_000,
  month: 30 * 86_400_000,
};
const OUTCOMES = new Set(['done', 'failed', 'cancelled', 'expired', 'open']);
const NOT_FOUND = { error: 'There’s no build by that id in your folders.' };

/** A published pre-aggregation's name as people see it: its cube's short name, and its own (T371). */
export function shownNameOf(preAggregation: string): string {
  const dot = preAggregation.lastIndexOf('.');
  const cube = dot < 0 ? preAggregation : preAggregation.slice(0, dot);
  const own = dot < 0 ? '' : preAggregation.slice(dot);
  return `${cube.replace(/^f[0-9a-z]+__/, '')}${own}`;
}

export function registerBuildHistory(
  app: FastifyInstance,
  {
    store,
    access,
    now,
  }: {
    readonly store: BuildHistory;
    readonly access?: JobsAccess;
    readonly now: () => Date;
  },
): void {
  const scopeOf = (request: FastifyRequest) =>
    access === undefined ? Promise.resolve(EVERYTHING) : access.scope(request);
  /**
   * The shared folders only: those whose parents lead to the shared root. A
   * folder in anyone's workspace is no one else's to know of, a
   * Super-Admin's included (AC-276; T374's review), and no model is
   * published in one.
   */
  const treeOf = async () => {
    const tree = (await access?.tree?.()) ?? [];
    const byId = new Map(tree.map((folder) => [folder.id, folder]));
    const shared = (id: string): boolean => {
      const seen = new Set<string>();
      for (let at = byId.get(id); at !== undefined && !seen.has(at.id);) {
        if (at.id === ROOT_FOLDER_ID || at.parentId === ROOT_FOLDER_ID) return true;
        seen.add(at.id);
        at = at.parentId === null ? undefined : byId.get(at.parentId);
      }
      return false;
    };
    return tree.filter((folder) => shared(folder.id));
  };

  /** The folders a scope's builds are in: none named for everything. */
  const foldersOf = async (scope: JobsScope): Promise<readonly string[] | undefined> => {
    if (scope.all) return undefined;
    const ids = new Set([ROOT_FOLDER_ID, ...(await treeOf()).map((folder) => folder.id)]);
    return [...ids].filter((id) => scope.writes(id));
  };

  /** Each folder's path from Shared: `['Shared', 'Sales', 'EMEA']`. */
  const pathsOf = async () => {
    const tree = await treeOf();
    const byId = new Map(tree.map((folder) => [folder.id, folder]));
    return (folderId: string | null): readonly string[] => {
      if (folderId === null) return ['Shared', 'A folder no longer there'];
      const path: string[] = [];
      const seen = new Set<string>();
      for (let at = byId.get(folderId); at !== undefined && !seen.has(at.id);) {
        seen.add(at.id);
        if (at.id !== ROOT_FOLDER_ID) path.unshift(at.title);
        at = at.parentId === null ? undefined : byId.get(at.parentId);
      }
      if (folderId !== ROOT_FOLDER_ID && path.length === 0)
        return ['Shared', 'A folder no longer there'];
      return ['Shared', ...path];
    };
  };

  const shown = <T extends BuildSummary | BuildRecord>(
    record: T,
    pathOf: (folderId: string | null) => readonly string[],
  ) => ({
    ...record,
    name: shownNameOf(record.preAggregation),
    folderPath: pathOf(record.folderId),
  });

  /** A folder and every shared folder below it (Include subfolders; T559). */
  const withBelow = async (folderId: string): Promise<string[]> => {
    const tree = await treeOf();
    const found = [folderId];
    for (let at = 0; at < found.length; at += 1)
      for (const folder of tree)
        if (folder.parentId === found[at] && !found.includes(folder.id)) found.push(folder.id);
    return found;
  };

  /**
   * The Folder filter's choices on every Jobs tab and Schedules (T559,
   * AC-297; design 16, state H2): the folders a member writes, a
   * Super-Admin's every shared folder, the root's included, each by its path
   * and with its parent, for Include subfolders.
   */
  app.get('/api/jobs/folders', USER, async (request, reply) => {
    const scope = await scopeOf(request);
    if (!scope.all && !scope.writesAny) return reply.status(403).send(NO_JOBS);
    const tree = await treeOf();
    const parentOf = new Map(tree.map((folder) => [folder.id, folder.parentId]));
    const pathOf = await pathsOf();
    const folderIds = (await foldersOf(scope)) ?? [
      ROOT_FOLDER_ID,
      ...tree.map((folder) => folder.id),
    ];
    return {
      folders: [...new Set(folderIds)]
        .map((id) => ({
          id,
          path: pathOf(id),
          parentId: id === ROOT_FOLDER_ID ? null : (parentOf.get(id) ?? null),
        }))
        .sort((a, b) => a.path.join('/').localeCompare(b.path.join('/'))),
      everyFolder: scope.all,
    };
  });

  app.get('/api/jobs/builds', USER, async (request, reply) => {
    const scope = await scopeOf(request);
    if (!scope.all && !scope.writesAny) return reply.status(403).send(NO_JOBS);
    const asked = request.query as Record<string, string | undefined>;
    const span = asked['within'] === undefined ? undefined : WITHIN_MS[asked['within']];
    const starter = /^(person|schedule):(.+)$/.exec(asked['starter'] ?? '');
    const filters: BuildListFilters = {
      ...(asked['outcome'] !== undefined && OUTCOMES.has(asked['outcome'])
        ? { outcome: asked['outcome'] as BuildListFilters['outcome'] & string }
        : {}),
      ...(starter === null
        ? {}
        : { starter: { kind: starter[1] as 'person' | 'schedule', id: starter[2]! } }),
      // One folder's, or with Include subfolders those below it too (T559).
      ...(asked['folder'] === undefined || asked['folder'] === ''
        ? {}
        : {
            folderIds:
              asked['subfolders'] === 'true' ? await withBelow(asked['folder']) : [asked['folder']],
          }),
      ...(span === undefined ? {} : { since: new Date(now().getTime() - span) }),
      ...(asked['preagg'] === undefined || asked['preagg'] === ''
        ? {}
        : { preAggregation: asked['preagg'] }),
    };
    const within = await foldersOf(scope);
    const page = await store.list({
      within,
      filters,
      ...(asked['before'] === undefined ? {} : { before: asked['before'] }),
    });
    const pathOf = await pathsOf();
    // The Folder filter's choices: the folders they build in, a Super-Admin's every one.
    const folderIds = within ?? [ROOT_FOLDER_ID, ...(await treeOf()).map((folder) => folder.id)];
    return {
      records: page.records.map((record) => shown(record, pathOf)),
      ...(page.older === undefined ? {} : { older: page.older }),
      starters: await store.starters(within),
      folders: [...new Set(folderIds)]
        .map((id) => ({ id, path: pathOf(id) }))
        .sort((a, b) => a.path.join('/').localeCompare(b.path.join('/'))),
      everyFolder: scope.all,
    };
  });

  app.get('/api/jobs/builds/:id', USER, async (request, reply) => {
    const scope = await scopeOf(request);
    if (!scope.all && !scope.writesAny) return reply.status(403).send(NO_JOBS);
    const record = await store.get((request.params as { id: string }).id);
    const folders = await foldersOf(scope);
    if (
      record === undefined ||
      (folders !== undefined && (record.folderId === null || !folders.includes(record.folderId)))
    )
      return reply.status(404).send(NOT_FOUND);
    return shown(record, await pathsOf());
  });
}
