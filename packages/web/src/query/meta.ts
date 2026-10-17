import { createContext, useContext } from 'react';

import type { QueryItem } from './item';

/**
 * The Cube model's metadata, fetched through the wechart API (AC-007).
 *
 * One definition for every caller — the chart editor lists fields from it, a
 * dashboard takes number formats from it (AC-046) — so they share one cache
 * entry. Two query functions registered under the same key would work until
 * they diverged, and then whichever ran first would decide what the other saw.
 */
async function metaAt(url: string): Promise<unknown> {
  const response = await fetch(url);
  if (!response.ok) {
    // Cube's own words when it gave some — a missing scope among them
    // (T176, AC-170) — so a screen can say what is wrong.
    const said = ((await response.json().catch(() => null)) as { error?: unknown } | null)?.error;
    throw new Error(
      typeof said === 'string'
        ? `Could not load the model: ${said}`
        : `Could not load the model: ${String(response.status)}`,
    );
  }
  return (await response.json()) as unknown;
}

export const META_QUERY = {
  queryKey: ['meta'] as const,
  queryFn: (): Promise<unknown> => metaAt('/api/meta'),
};

/**
 * An item in My workspace, whose field list is its workspace's overlay's
 * (T347, AC-323): the cubes its models add, and the shared folder it is to go
 * to, whose path its picker offers after them (AC-329, AC-281). Set by the
 * dashboard, the chart page and the chart editor of an item there.
 */
export interface WorkspaceItem {
  readonly item: QueryItem;
  readonly targetFolderId?: string | undefined;
}

export const WorkspaceItemContext = createContext<WorkspaceItem | undefined>(undefined);

export const useWorkspaceItem = (): WorkspaceItem | undefined => useContext(WorkspaceItemContext);

/** Each cube's joins, by name: the cubes it joins to, as its model declares them (T688). */
export type Joins = Readonly<
  Record<string, readonly { readonly name: string; readonly relationship: string | null }[]>
>;

/**
 * Each cube's joins (T688, EDI-03; `GET /api/meta/joins`), as the open item
 * reads its model: a workspace item's overlay's, else the model's. Under
 * `['meta']`, so a publish's invalidation reaches it too.
 */
export function joinsQueryOf(workspace: WorkspaceItem | undefined): {
  readonly queryKey: readonly string[];
  readonly queryFn: () => Promise<Joins>;
} {
  const url =
    workspace === undefined
      ? '/api/meta/joins'
      : `/api/meta/joins?for=${encodeURIComponent(`${workspace.item.kind}:${workspace.item.id}`)}`;
  return {
    queryKey:
      workspace === undefined
        ? ['meta', 'joins']
        : ['meta', 'joins', workspace.item.kind, workspace.item.id],
    queryFn: async () => ((await metaAt(url)) as { joins?: Joins } | null)?.joins ?? {},
  };
}

/**
 * The cubes a cube reaches by its joins, nearest first: those it names, then
 * theirs (Cube joins along the declared direction; research
 * `cube/meta-extended-joins.md`). Never the cube itself.
 */
export function joinedFrom(joins: Joins, cube: string): string[] {
  const reached: string[] = [];
  const queue = [cube];
  while (queue.length > 0) {
    const next = queue.shift()!;
    for (const join of joins[next] ?? [])
      if (join.name !== cube && !reached.includes(join.name)) {
        reached.push(join.name);
        queue.push(join.name);
      }
  }
  return reached;
}

/**
 * The field list as the open item reads it: a workspace item's from its
 * overlay, asked for by the item (`/api/meta?for=`); any other the model's,
 * shared by every caller under one key (above). Under `['meta']` either way,
 * so a publish's invalidation reaches both.
 */
export function metaQueryOf(workspace: WorkspaceItem | undefined): {
  readonly queryKey: readonly string[];
  readonly queryFn: () => Promise<unknown>;
} {
  if (workspace === undefined) return META_QUERY;
  const { kind, id } = workspace.item;
  return {
    queryKey: ['meta', kind, id],
    queryFn: (): Promise<unknown> => metaAt(`/api/meta?for=${encodeURIComponent(`${kind}:${id}`)}`),
  };
}
