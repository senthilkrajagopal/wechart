/** A stored item as the server reads it. */
interface StoredDocument {
  readonly id: string;
  readonly body: Record<string, unknown>;
  /** The version copied; one read before versions were kept is 1. */
  readonly version?: number;
}

/** A copy to make. */
interface CreateInput {
  readonly kind: 'dashboard' | 'chart';
  readonly id: string;
  readonly body: Record<string, unknown>;
}

/**
 * "Edit in my workspace" (T344; AC-278, AC-279; direction.md rule 73): the
 * copies a shared dashboard or library chart makes in the user's workspace.
 *
 * - A dashboard brings copies of the charts it shows, and shows the copies:
 *   the original, and what it shows, are never changed. No model or data
 *   source comes with it (T346, T347).
 * - Each copy names its origin (kind, id, the version copied, and the folder
 *   where its copier may see it), and a dashboard or library chart targets
 *   its origin's folder, where a proposal takes it (T349).
 * - What each chart the dashboard shows becomes is the server's to decide
 *   (T344's review): see `ShownCopy`.
 */
export interface Origin {
  readonly kind: 'dashboard' | 'chart';
  readonly id: string;
  readonly version: number;
  /** Where it was: left out where its copier can't see that folder. */
  readonly folderId?: string;
}

const originOf = (kind: Origin['kind'], stored: StoredDocument, seen = true): Origin => {
  const folderId = typeof stored.body['folderId'] === 'string' ? stored.body['folderId'] : null;
  return {
    kind,
    id: stored.id,
    version: stored.version ?? 1,
    ...(folderId === null || !seen ? {} : { folderId }),
  };
};

/**
 * What a chart the dashboard shows becomes in its copy:
 * - `library`: a library chart its copier may propose back, copied into the
 *   workspace and targeting its folder;
 * - `reuse`: one the copier has a copy of already, which the copy shows;
 * - `local`: the copy's own local chart: its own local charts, another
 *   dashboard's local chart it shows, and a library chart from a folder its
 *   copier can't write, so the copy governs it and names no folder its
 *   copier can't see (`folderSeen`).
 */
export type ShownCopy =
  | { readonly as: 'library'; readonly chart: StoredDocument }
  | { readonly as: 'reuse'; readonly chart: StoredDocument; readonly copyId: string }
  | { readonly as: 'local'; readonly chart: StoredDocument; readonly folderSeen: boolean };

/** A body with every chart it shows, its `charts` list and each tile's `chartId`, renamed. */
export function withChartsRenamed(body: unknown, renamed: ReadonlyMap<string, string>): unknown {
  if (Array.isArray(body)) return body.map((each) => withChartsRenamed(each, renamed));
  if (body === null || typeof body !== 'object') return body;
  return Object.fromEntries(
    Object.entries(body).map(([key, value]) => {
      if (key === 'chartId' && typeof value === 'string') return [key, renamed.get(value) ?? value];
      if (key === 'charts' && Array.isArray(value))
        return [key, value.map((id) => (typeof id === 'string' ? (renamed.get(id) ?? id) : id))];
      return [key, withChartsRenamed(value, renamed)];
    }),
  );
}

/** A body without where it was, and whose it was. */
const placeless = (body: Record<string, unknown>) => {
  const {
    folderId: _folder,
    targetFolderId: _target,
    localToDashboardId: _local,
    origin: _origin,
    ...rest
  } = body;
  void [_folder, _target, _local, _origin];
  return rest;
};

/** A library chart's copy, in the workspace, targeting its own folder. */
function libraryCopy(chart: StoredDocument, id: string, into: string, owner: string): CreateInput {
  const origin = originOf('chart', chart);
  return {
    kind: 'chart',
    id,
    body: {
      ...placeless(chart.body),
      folderId: into,
      owner,
      origin,
      ...(origin.folderId === undefined ? {} : { targetFolderId: origin.folderId }),
    },
  };
}

/**
 * The documents copying `dashboard` into the workspace `into` makes, the
 * dashboard's first: `shown` says what each chart it shows becomes; `newId`
 * names each copy.
 */
export function dashboardCopies(
  dashboard: StoredDocument,
  shown: readonly ShownCopy[],
  into: string,
  owner: string,
  newId: () => string,
): CreateInput[] {
  const boardId = newId();
  const renamed = new Map<string, string>();
  const charts: CreateInput[] = [];
  for (const each of shown) {
    if (each.as === 'reuse') {
      renamed.set(each.chart.id, each.copyId);
      continue;
    }
    const id = newId();
    renamed.set(each.chart.id, id);
    charts.push(
      each.as === 'library'
        ? libraryCopy(each.chart, id, into, owner)
        : {
            kind: 'chart',
            id,
            body: {
              ...placeless(each.chart.body),
              localToDashboardId: boardId,
              owner,
              origin: originOf('chart', each.chart, each.folderSeen),
            },
          },
    );
  }
  const origin = originOf('dashboard', dashboard);
  return [
    {
      kind: 'dashboard',
      id: boardId,
      body: {
        ...placeless(withChartsRenamed(dashboard.body, renamed) as Record<string, unknown>),
        folderId: into,
        owner,
        origin,
        ...(origin.folderId === undefined ? {} : { targetFolderId: origin.folderId }),
      },
    },
    ...charts,
  ];
}

/** The document copying a library chart into the workspace `into` makes. */
export function chartCopy(
  chart: StoredDocument,
  into: string,
  owner: string,
  newId: () => string,
): CreateInput {
  return libraryCopy(chart, newId(), into, owner);
}
