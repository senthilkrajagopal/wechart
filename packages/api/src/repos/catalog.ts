import { objectsOf } from '@wechart/core';
import { sql, type Kysely } from 'kysely';

import type { Database } from '../db/schema';

/**
 * Explore's folder tree and contents (AC-017), and the search behind AC-019.
 *
 * Reads the generated columns on `documents`, so a listing cannot disagree with
 * the object it lists.
 */
export interface CatalogItem {
  /** A model is one model file, by its path (T334, AC-269). */
  readonly kind: 'folder' | 'dashboard' | 'chart' | 'model';
  readonly id: string;
  readonly title: string;
  readonly owner: string | null;
  readonly updatedAt: Date;
  /** Set on a chart that belongs to one dashboard rather than to a folder. */
  readonly localToDashboardId: string | null;
  /**
   * A dashboard's description, shown beneath its name in Explore (AC-197) —
   * read from the body like the other columns, so it cannot go stale.
   */
  readonly description: string | null;
  /** The folder it sits in, which a move need not offer (AC-193). */
  readonly folderId: string | null;
  /** A chart's saved type; null when the recommender picks it, or it has none. */
  readonly chartType: string | null;
  /**
   * What a chart that follows the recommendation was drawn as when last
   * saved (T243, AC-193): Explore names it by that, as it cannot query each.
   * Null for a chart with a saved type, or one never drawn.
   */
  readonly drawnAs: string | null;
  /** The cube or view a chart is built on. */
  readonly source: string | null;
  /** Whether a chart has any field in its wells — one with none is incomplete. */
  readonly hasFields: boolean;
  /** A dashboard's page tabs: one before any is added, as it opens on one. */
  readonly tabs: number | null;
  /** A folder's dashboards and charts, including those in its subfolders. */
  readonly itemCount: number | null;
  /**
   * A model's cubes and views, what Explore's Built on says of it (T334,
   * AC-269; references.md §4): read from its text by the model editor's
   * parser. Null for every other kind.
   */
  readonly declares?: { readonly cubes: number; readonly views: number } | null;
}

export interface FolderNode {
  readonly id: string;
  readonly title: string;
  readonly parentId: string | null;
  /** Its dashboards and charts, including those in its subfolders (AC-194). */
  readonly itemCount: number;
  /** Its id in xcube (T425), which names its items; none until it has one (T429, AC-329). */
  readonly xcubeId: string | null;
}

/** The folder a document sits in when it sits at the top of the shared tree. */
export const ROOT_FOLDER_ID = 'root';
/**
 * The personal root, the prototype's "My workspace" (AC-194, R9): in phase 1,
 * with one user, a place for personal and draft work. Like the shared root it
 * is not a document — a document sits in it by carrying its id.
 */
export const MY_WORKSPACE_ID = 'mine';
const ROOT_IDS = [ROOT_FOLDER_ID, MY_WORKSPACE_ID];

export function catalog(db: Kysely<Database>) {
  const selectItems = () =>
    db
      .selectFrom('documents')
      .select(['kind', 'id', 'title', 'owner', 'updated_at', 'folder_id', 'local_to_dashboard_id'])
      .select(sql<string | null>`body ->> 'description'`.as('description'))
      // What the Type and Built on columns say (AC-193), read from the body
      // like the rest, so they cannot disagree with the object.
      .select(sql<string | null>`body -> 'chart' ->> 'chartType'`.as('chart_type'))
      .select(sql<string | null>`body -> 'chart' ->> 'drawnAs'`.as('drawn_as'))
      .select(sql<string | null>`body -> 'chart' -> 'source' ->> 'cube'`.as('source'))
      .select(
        // Silent: a body with no chart, or no wells, has no fields rather
        // than being an error.
        sql<boolean>`coalesce(jsonb_path_exists(body, 'strict $.chart.wells.* ? (@.size() > 0)', '{}', true), false)`.as(
          'has_fields',
        ),
      )
      .select(
        sql<
          number | null
        >`case when jsonb_typeof(body -> 'pages') = 'array' then jsonb_array_length(body -> 'pages') end`.as(
          'pages',
        ),
      );

  /**
   * Each of these folders' dashboards and library charts, counting those in
   * every folder beneath it (AC-193, AC-194). Dashboard-local charts are not
   * catalog objects (AC-126), so they are not counted.
   *
   * The recursion follows `folder_id` from each folder down; a cycle in
   * stored data would repeat a row, and `union` (not `union all`) drops the
   * repeat, so it ends.
   */
  const itemCounts = async (folderIds: readonly string[]): Promise<Map<string, number>> => {
    if (folderIds.length === 0) return new Map();
    const result = await sql<{ root: string; count: string }>`
      with recursive tree(root, id) as (
        -- Any id: the roots are not documents, so they are not looked up.
        select seed.id, seed.id from unnest(array[${sql.join(folderIds)}]::text[]) as seed(id)
        union
        select tree.root, d.id from documents d join tree on d.folder_id = tree.id
        where d.kind = 'folder'
      )
      select tree.root, count(i.id) as count
      from tree left join documents i
        on i.folder_id = tree.id
        and i.kind in ('dashboard', 'chart')
        and i.local_to_dashboard_id is null
      group by tree.root`.execute(db);
    return new Map(result.rows.map((row) => [row.root, Number(row.count)]));
  };

  return {
    /**
     * Every folder, for the tree. `counted: false` leaves out every count,
     * for a caller that counts only what its user may see (T325).
     */
    async folders({ counted = true }: { counted?: boolean } = {}): Promise<FolderNode[]> {
      const rows = await db
        .selectFrom('documents')
        .leftJoin('folder_xcube_ids', 'folder_xcube_ids.folder_id', 'documents.id')
        .select([
          'documents.id',
          'documents.title',
          'documents.folder_id',
          'folder_xcube_ids.xcube_id',
        ])
        .where('documents.kind', '=', 'folder')
        .orderBy('documents.title', 'asc')
        .execute();

      // Each with its items, its subfolders' included (AC-194).
      const counts = counted
        ? await itemCounts(rows.map((row) => row.id))
        : new Map<string, number>();
      return rows.map((row) => ({
        id: row.id,
        title: row.title ?? '(untitled)',
        parentId: row.folder_id,
        itemCount: counts.get(row.id) ?? 0,
        xcubeId: row.xcube_id,
      }));
    },

    /**
     * Each folder's own dashboards and library charts, not its subfolders':
     * what a count of only the folders a user may see adds up (T325, AC-194).
     * Dashboard-local charts are no catalog objects, and not counted (AC-126).
     */
    async libraryCounts(): Promise<Map<string, { dashboards: number; charts: number }>> {
      const rows = await db
        .selectFrom('documents')
        .select(['folder_id', 'kind'])
        .select((eb) => eb.fn.countAll<string>().as('count'))
        .where('kind', 'in', ['dashboard', 'chart'])
        .where('local_to_dashboard_id', 'is', null)
        .where('folder_id', 'is not', null)
        .groupBy(['folder_id', 'kind'])
        .execute();
      const counts = new Map<string, { dashboards: number; charts: number }>();
      for (const row of rows) {
        const folder = row.folder_id as string;
        const each = counts.get(folder) ?? { dashboards: 0, charts: 0 };
        if (row.kind === 'dashboard') each.dashboards = Number(row.count);
        else each.charts = Number(row.count);
        counts.set(folder, each);
      }
      return counts;
    },

    /** The shared root's and My workspace's items, everything beneath each counted (AC-194). */
    async rootCounts(): Promise<Record<string, number>> {
      const counts = await itemCounts(ROOT_IDS);
      return Object.fromEntries(ROOT_IDS.map((id) => [id, counts.get(id) ?? 0]));
    },

    /**
     * What a folder contains: sub-folders, dashboards and library charts.
     *
     * A chart local to a dashboard is excluded even if it carries a folder id,
     * because it is not a catalog object (AC-126) — it belongs to its dashboard
     * and appears in no folder listing.
     */
    async contents(
      folderId: string = ROOT_FOLDER_ID,
      /** `false`: no subfolder counts, for a caller that counts what its user may see (T325). */
      { counted = true }: { counted?: boolean } = {},
    ): Promise<CatalogItem[]> {
      const rows = await selectItems()
        .where('folder_id', '=', folderId)
        .where('local_to_dashboard_id', 'is', null)
        // Subfolders first, then dashboards, then charts (AC-193).
        .orderBy(sql`case kind when 'folder' then 0 when 'dashboard' then 1 else 2 end`)
        .orderBy('title', 'asc')
        .execute();

      const counts = counted
        ? await itemCounts(rows.filter((row) => row.kind === 'folder').map((row) => row.id))
        : new Map<string, number>();
      // Then its models, one to a model file, by path (T334, AC-269).
      const models = await db
        .selectFrom('model_files')
        .select(['path', 'content', 'updated_at'])
        .where('folder_id', '=', folderId)
        .orderBy(sql`path collate "C"`)
        .execute();
      return [
        ...rows.map((row) => ({
          ...toItem(row),
          itemCount: row.kind === 'folder' ? (counts.get(row.id) ?? 0) : null,
        })),
        ...models.map((model): CatalogItem => {
          const { objects } = objectsOf(model.path, model.content);
          return {
            kind: 'model',
            id: model.path,
            title: model.path.slice(model.path.lastIndexOf('/') + 1),
            owner: null,
            updatedAt: model.updated_at,
            localToDashboardId: null,
            description: null,
            folderId,
            chartType: null,
            drawnAs: null,
            source: null,
            hasFields: false,
            tabs: null,
            itemCount: null,
            declares: {
              cubes: objects.filter((object) => object.kind === 'cube').length,
              views: objects.filter((object) => object.kind === 'view').length,
            },
          };
        }),
      ];
    },

    /** Every chart and dashboard with its body, for what uses a member (T147, AC-141). */
    async referenceDocuments() {
      const rows = await db
        .selectFrom('documents')
        .select(['kind', 'id', 'title', 'body', 'local_to_dashboard_id'])
        .where('kind', 'in', ['chart', 'dashboard'])
        .orderBy('kind')
        .orderBy('title')
        .execute();
      return rows.map((row) => ({
        kind: row.kind,
        id: row.id,
        title: row.title,
        body: row.body,
        localToDashboardId: row.local_to_dashboard_id,
      }));
    },

    /**
     * The dashboards that use a library chart (AC-021, AC-022, AC-023,
     * AC-128).
     *
     * A dashboard refers to a chart by id, so this survives the chart being
     * renamed or moved — which is exactly what AC-021 asks for: in the
     * `body.charts` list a chart added from its own page writes, or on any
     * tile, however deep in sections and tabs (T134) — `.**` in strict mode,
     * as PostgreSQL recommends (research/db-access.md). By the list alone, a
     * chart shown on two dashboards' tiles read as on none.
     */
    async dashboardsUsing(chartId: string): Promise<CatalogItem[]> {
      const rows = await selectItems()
        .where('kind', '=', 'dashboard')
        .where(
          sql<boolean>`(body -> 'charts' @> ${JSON.stringify([chartId])}::jsonb
            or jsonb_path_exists(body, 'strict $.** ? (@.chartId == $id)', jsonb_build_object('id', ${chartId}::text), true))`,
        )
        .orderBy('title', 'asc')
        .execute();

      return rows.map(toItem);
    },

    /**
     * Search by title (AC-019). Dashboards and library charts only: folders are
     * not what someone is looking for here, and a chart local to a dashboard is
     * not a catalog object at all — it belongs to its dashboard and must never
     * surface in search (AC-126).
     */
    async search(
      text: string,
      limit = 50,
      /** One kind alone — dashboards, for the security preview's list (T241). */
      only?: 'dashboard' | 'chart',
      /**
       * With security on, the folders whose dashboards, and whose library
       * charts, the user may see (T325, AC-264): narrowed here, before the
       * limit, so hidden rows can't crowd out visible ones.
       */
      within?: { readonly dashboards: readonly string[]; readonly charts: readonly string[] },
    ): Promise<CatalogItem[]> {
      const needle = text.trim();
      if (needle === '') return [];
      if (within !== undefined && within.dashboards.length === 0 && within.charts.length === 0)
        return [];

      const rows = await selectItems()
        .where('kind', 'in', only === undefined ? ['dashboard', 'chart'] : [only])
        .where('local_to_dashboard_id', 'is', null)
        // Each list one array parameter, however many folders (T325's review:
        // one parameter per id slows planning and caps out at 65,535).
        .$if(within !== undefined, (query) =>
          query.where(
            sql<boolean>`((kind = 'dashboard' and folder_id = any(${[...within!.dashboards]}::text[]))
              or (kind = 'chart' and folder_id = any(${[...within!.charts]}::text[])))`,
          ),
        )
        .where((eb) =>
          eb(eb.fn('lower', ['title']), 'like', `%${escapeLike(needle.toLowerCase())}%`),
        )
        .orderBy('title', 'asc')
        .limit(limit)
        .execute();

      return rows.map(toItem);
    },
  };
}

/**
 * `%` and `_` are LIKE wildcards, so a title search for "50%" would otherwise
 * match everything containing "50". Postgres' default LIKE escape is a
 * backslash, which must therefore be escaped first.
 */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

interface Row {
  kind: string;
  id: string;
  title: string | null;
  owner: string | null;
  updated_at: Date;
  local_to_dashboard_id: string | null;
  description: string | null;
  folder_id: string | null;
  chart_type: string | null;
  drawn_as: string | null;
  source: string | null;
  has_fields: boolean;
  pages: number | null;
}

function toItem(row: Row): CatalogItem {
  const chart = row.kind === 'chart';
  return {
    kind: row.kind as CatalogItem['kind'],
    id: row.id,
    title: row.title ?? '(untitled)',
    owner: row.owner,
    updatedAt: row.updated_at,
    localToDashboardId: row.local_to_dashboard_id,
    // A blank description is none: the line beneath the name would be empty.
    description: row.description?.trim() ? row.description : null,
    folderId: row.folder_id,
    chartType: chart ? row.chart_type : null,
    // Only beside no saved type: a chosen type is the chart's name.
    drawnAs: chart && row.chart_type === null ? row.drawn_as : null,
    source: chart ? row.source : null,
    hasFields: chart && row.has_fields,
    // A dashboard opens on one page before any is added (DashboardPage).
    tabs: row.kind === 'dashboard' ? Math.max(1, row.pages ?? 0) : null,
    itemCount: null,
  };
}
