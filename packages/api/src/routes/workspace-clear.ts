import type { FastifyInstance, FastifyRequest } from 'fastify';

import { USER } from '../auth/guard';
import type { AuditStore } from '../repos/audit';
import { ROOT_FOLDER_ID } from '../repos/catalog';
import type { Proposal, ProposalKind, ProposalStore } from '../repos/proposals';
import { withdrawWithDelete } from './proposals';

/**
 * Clear My workspace (T522, AC-367; design 14, state F): every item and
 * folder in the user's own workspace, at any depth, removed at once, and the
 * open proposals its items wait in withdrawn first. Nothing outside it
 * changes. Asked first: the same route, read, says what a clear would remove,
 * by kind, and each proposal it would withdraw, for the dialog to name.
 */
export interface WorkspaceClearDeps {
  /**
   * The request's user's workspace: their own `ws:` one with sign-in on, none
   * for one who has none (AC-277); the single user's `mine` with it off.
   */
  readonly workspaceOf: (request: FastifyRequest) => Promise<string | undefined>;
  /** Every folder beneath the workspace's root, each before the folders in it. */
  readonly foldersBeneath: (root: string) => Promise<readonly string[]>;
  /**
   * What a folder holds, as the catalog lists it: a model by its file's path,
   * with the file's id its proposal names it by (T350).
   */
  readonly contents: (
    folderId: string,
  ) => Promise<readonly { readonly kind: string; readonly id: string; readonly fileId?: string }[]>;
  readonly removeDocument: (kind: 'folder' | 'dashboard' | 'chart', id: string) => Promise<unknown>;
  /** A dashboard's own charts, which go with it. */
  readonly localCharts: (dashboardId: string) => Promise<readonly { readonly id: string }[]>;
  /** A dashboard's bookmarks, which go with it. */
  readonly removeBookmarks?: (dashboardId: string) => Promise<unknown>;
  /** A data source removed, and recorded so, as its own delete records it (AC-294). */
  readonly removeDataSource?: (request: FastifyRequest, id: string) => Promise<unknown>;
  readonly removeModel?: (folderId: string, path: string) => Promise<unknown>;
  readonly proposals?: { readonly store: ProposalStore; readonly audit?: AuditStore | undefined };
  /** Each folder's path from the root, for where a proposal goes. */
  readonly pathOf: () => Promise<(folderId: string) => readonly { readonly title: string }[]>;
  /** Changes to one workspace made one at a time, as its copies are (T523). */
  readonly inTurn: <T>(workspace: string, work: () => Promise<T>) => Promise<T>;
}

const NO_WORKSPACE = {
  error: 'You have no workspace: only read-write members and Super-Admins have one.',
};

/** The kinds a proposal takes. */
const PROPOSED: Readonly<Record<string, ProposalKind>> = {
  dashboard: 'dashboard',
  chart: 'chart',
  'data-source': 'data-source',
  model: 'model',
};

interface Held {
  /** Beneath the root, each before the folders in it. */
  readonly folders: readonly string[];
  /** Every item, with the folder it is in. */
  readonly items: readonly {
    readonly folderId: string;
    readonly kind: string;
    readonly id: string;
    /** What a proposal names it by, where not its id: a model's file id. */
    readonly proposedAs: string;
  }[];
}

export function registerWorkspaceClear(app: FastifyInstance, deps: WorkspaceClearDeps): void {
  const heldIn = async (root: string): Promise<Held> => {
    const folders = await deps.foldersBeneath(root);
    const items = (
      await Promise.all(
        [root, ...folders].map(async (folderId) =>
          (await deps.contents(folderId))
            .filter((row) => row.kind !== 'folder')
            .map((row) => ({
              folderId,
              kind: row.kind,
              id: row.id,
              proposedAs: row.fileId ?? row.id,
            })),
        ),
      )
    ).flat();
    return { folders, items };
  };

  /** "14 items and 3 folders (5 dashboards, 6 charts, 2 models, 1 data source)", as numbers. */
  const countsOf = ({ folders, items }: Held) => {
    const count = (kind: string) => items.filter((item) => item.kind === kind).length;
    return {
      items: items.length,
      folders: folders.length,
      dashboards: count('dashboard'),
      charts: count('chart'),
      models: count('model'),
      dataSources: count('data-source'),
    };
  };

  /** The open proposals its items wait in, each once, oldest first. */
  const openIn = async ({ items }: Held): Promise<Proposal[]> => {
    if (deps.proposals === undefined) return [];
    const found = new Map<string, Proposal>();
    for (const item of items) {
      const kind = PROPOSED[item.kind];
      if (kind === undefined) continue;
      const open = await deps.proposals.store.openFor(kind, item.proposedAs);
      if (open !== null) found.set(open.id, open);
    }
    return [...found.values()].sort((a, b) => a.proposedAt.getTime() - b.proposedAt.getTime());
  };

  app.get('/api/workspace/clear', USER, async (request, reply) => {
    const root = await deps.workspaceOf(request);
    if (root === undefined) return reply.code(403).send(NO_WORKSPACE);
    const held = await heldIn(root);
    const pathOf = await deps.pathOf();
    return {
      ...countsOf(held),
      proposals: (await openIn(held)).map((proposal) => ({
        id: proposal.id,
        kind: proposal.kind,
        title: proposal.title,
        targetFolderId: proposal.targetFolderId,
        // Where it goes, as Reviews says it: the Shared root is "Shared", and
        // a folder deleted since is named so, never taken for Shared (T522's review).
        targetPath:
          proposal.targetFolderId === ROOT_FOLDER_ID
            ? 'Shared'
            : pathOf(proposal.targetFolderId)
                .map((folder) => folder.title)
                .join(' / ') || 'A deleted folder',
        proposedAt: proposal.proposedAt.toISOString(),
      })),
    };
  });

  app.post('/api/workspace/clear', USER, async (request, reply) => {
    const root = await deps.workspaceOf(request);
    if (root === undefined) return reply.code(403).send(NO_WORKSPACE);
    return deps.inTurn(root, async () => {
      const held = await heldIn(root);
      // Its open proposals withdrawn first, as a delete withdraws one (T528).
      let withdrawn = 0;
      if (deps.proposals !== undefined)
        for (const proposal of await openIn(held))
          if (
            (await withdrawWithDelete(
              deps.proposals,
              request,
              proposal.kind,
              proposal.itemId,
              'cleared',
            )) !== null
          )
            withdrawn += 1;
      for (const item of held.items) {
        if (item.kind === 'dashboard') {
          // With its own charts and its bookmarks, as its delete takes them.
          const own = await deps.localCharts(item.id);
          await deps.removeDocument('dashboard', item.id);
          for (const chart of own) await deps.removeDocument('chart', chart.id);
          await deps.removeBookmarks?.(item.id);
        } else if (item.kind === 'chart') await deps.removeDocument('chart', item.id);
        else if (item.kind === 'data-source') await deps.removeDataSource?.(request, item.id);
        else if (item.kind === 'model') await deps.removeModel?.(item.folderId, item.id);
      }
      // The folders, each after the folders in it.
      for (const folderId of [...held.folders].reverse())
        await deps.removeDocument('folder', folderId);
      return { ...countsOf(held), withdrawn };
    });
  });
}
