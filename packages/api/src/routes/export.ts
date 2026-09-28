import {
  EXPORT_FORMAT,
  EXPORT_VERSION,
  exportedBodyOf,
  exportedDataSourceOf,
  exportFileNameOf,
  objectsOf,
  type ChartDefinition,
  type ExportFile,
  type ExportItem,
} from '@wechart/core';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { parse } from 'yaml';

import { USER } from '../auth/guard';
import { cubesOfChart, cubesOfDashboard } from '../model/bind';
import { isWorkspaceId, ROOT_FOLDER_ID } from '../repos/catalog';
import type { DataSource } from '../repos/data-sources';
import type { ModelFile } from '../server';
import type { PublishedFolders } from '../xcube/folders';
import { extendsIn } from '../xcube/used-by';

/**
 * Exporting a dashboard (T511; F38, AC-354, AC-355; design 13, screen 1).
 *
 * `GET /api/export/dashboards/:id` lists what may go with it, for the Export
 * pane: its own charts, which always go; the library charts it shows; the
 * models its charts use; and the data sources those models bind to. Each is
 * named with what uses it, of those the user may see. What is in a folder
 * they may not see is counted, never named, nor its folder (design 05's way
 * of counting, AC-322).
 *
 * `POST` with the dependencies chosen answers the file: the dashboard as
 * saved, its own charts, and exactly what was chosen of what was offered.
 * Anything else chosen is refused, and no file given.
 *
 * - **A model's use.** Each cube a chart names (`cubesOfChart`) is found as
 *   the chart finds it: a full name (`f…__name`) in the folder it was bound
 *   to at publish (AC-328), a short one nearest first from where the chart
 *   is published up to the root. What a model then needs goes too: the
 *   cubes it joins, a view's cubes, and what a cube extends.
 * - **A model's data sources.** Each cube's `data_source`, its parent's where
 *   it extends one and names none, else `default`, nearest first from the
 *   model's folder (AC-273, AC-310).
 */

type Stored = { readonly id: string; readonly body: Record<string, unknown>; version?: number };
type Folder = { readonly id: string; readonly title: string; readonly parentId: string | null };
/** How much of a folder's content the user may see: none, dashboards only, or every kind. */
type Sight = 'all' | 'dashboards' | undefined;

export interface ExportAccess {
  /** The dashboard, where the request's user may open it; else the answer already sent. */
  readonly dashboardFor: (
    request: FastifyRequest,
    reply: FastifyReply,
    id: string,
  ) => Promise<Stored | undefined>;
  /** A chart as stored, none, or why this version can't read it. */
  readonly chart: (id: string) => Promise<{ found: Stored | null } | { unreadable: string }>;
  /** How much of each folder the request's user may see; everything with sign-in off. */
  readonly sightOf: (request: FastifyRequest) => Promise<(folderId: string) => Sight>;
  /** Whether the request's user may open a chart (the server's `mayOpen`); all with sign-in off. */
  readonly opensOf: (request: FastifyRequest) => Promise<(chart: Stored) => Promise<boolean>>;
  readonly folders: () => Promise<readonly Folder[]>;
  readonly modelFiles: () => Promise<readonly ModelFile[]>;
  /** Where each folder's cubes are published, by xcube's folder id (T452): unset without xcube. */
  readonly published?: () => Promise<PublishedFolders>;
  readonly dataSources?: () => Promise<readonly DataSource[]>;
}

/** What the Export pane lists (AC-354). */
export interface Offered {
  readonly dashboard: {
    readonly id: string;
    readonly title: string;
    readonly version: number;
    /** Its folder's path from Shared, or My workspace's; null where it isn't the user's to see. */
    readonly path: readonly string[] | null;
    /** Where a workspace draft is to go. */
    readonly targetPath?: readonly string[];
  };
  readonly fileName: string;
  readonly ownCharts: readonly { readonly id: string; readonly title: string }[];
  readonly libraryCharts: readonly {
    readonly id: string;
    readonly title: string;
    /** Its folder's path; null for a folder the user can't see (design 13, pin 7). */
    readonly path: readonly string[] | null;
    readonly chartIds: readonly string[];
  }[];
  readonly models: readonly {
    readonly id: string;
    readonly path: string;
    readonly folderPath: readonly string[];
    readonly chartIds: readonly string[];
    /** Used by the dashboard's own filters or text tokens too. */
    readonly byDashboard: boolean;
  }[];
  readonly dataSources: readonly {
    readonly id: string;
    readonly name: string;
    readonly driver: string;
    readonly authMethod: string;
    readonly fields: DataSource['fields'];
    readonly description: string | null;
    readonly folderPath: readonly string[];
    /** The offered models that bind to it, by path. */
    readonly boundBy: readonly string[];
    readonly chartIds: readonly string[];
    readonly byDashboard: boolean;
  }[];
  /** Counted only (AC-354): what the dashboard's charts use, in folders the user can't see. */
  readonly notOffered: {
    /** Charts on it the user may not open (data from before workspaces kept theirs apart). */
    readonly charts: number;
    readonly models: number;
    readonly dataSources: number;
    /** How many such folders, so the pane can say "a folder" or "folders". */
    readonly folders: number;
    /** The charts using them, which the user sees on the dashboard. */
    readonly usedBy: readonly string[];
  };
  /** Nothing of models or data sources is theirs to see (design 13, state D). */
  readonly viewOnly: boolean;
}

/** A full name's folder prefix, and its short name (research 3a, "Names"; `model/bind.ts`). */
const FULL_NAME = /^(f[a-z0-9]{1,40})__(.+)$/;
const DEFAULT_SOURCE = 'default';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const textOf = (value: unknown): string | undefined =>
  typeof value === 'string' && value !== '' ? value : undefined;

/** The charts a dashboard's body shows, in its order: its tiles' and its `charts` list. */
function chartIdsIn(body: unknown): string[] {
  const found: string[] = [];
  const add = (id: string) => {
    if (!found.includes(id)) found.push(id);
  };
  const read = (value: unknown): void => {
    if (Array.isArray(value)) value.forEach(read);
    else if (isRecord(value))
      for (const [key, each] of Object.entries(value)) {
        if (key === 'chartId' && typeof each === 'string') add(each);
        else if (key !== 'charts') read(each);
      }
  };
  read(isRecord(body) ? body['pages'] : undefined);
  const listed = isRecord(body) ? body['charts'] : undefined;
  if (Array.isArray(listed)) for (const id of listed) if (typeof id === 'string') add(id);
  return found;
}

/** A model file's key: its folder and its path, the same path in two folders being two files. */
const keyOf = (file: ModelFile) => `${file.folderId ?? ROOT_FOLDER_ID}::${file.path}`;

interface ModelIndex {
  /** Each folder's files by the cube or view they declare. */
  readonly declared: ReadonlyMap<string, ReadonlyMap<string, ModelFile>>;
  /** What each file needs besides itself: the names it joins, includes and extends. */
  readonly needs: ReadonlyMap<string, readonly string[]>;
}

function indexOf(files: readonly ModelFile[]): ModelIndex {
  const declared = new Map<string, Map<string, ModelFile>>();
  const needs = new Map<string, string[]>();
  for (const file of files) {
    const folderId = file.folderId ?? ROOT_FOLDER_ID;
    const own = declared.get(folderId) ?? new Map<string, ModelFile>();
    declared.set(folderId, own);
    const wanted: string[] = [];
    for (const object of objectsOf(file.path, file.content).objects) {
      if (!own.has(object.name)) own.set(object.name, file);
      for (const member of object.members) {
        // A join names its cube; a view's include names the cubes on its join path.
        if (member.kind === 'join') wanted.push(member.name);
        if (member.kind === 'include') wanted.push(...member.name.split('.').slice(0, -1));
      }
    }
    const parent = extendsIn(file.content)?.extends;
    if (parent !== undefined) wanted.push(parent);
    needs.set(keyOf(file), [...new Set(wanted)]);
  }
  return { declared, needs };
}

/**
 * The cubes a model file declares, each with its data source and what it
 * extends: read as Cube reads YAML, `<<` merges resolved (`CUBE_PARSE`), and
 * the data source named either way xcube takes it (`xcube-slice-6.md`).
 */
function cubesIn(content: string): { name: string; dataSource?: string; extends?: string }[] {
  let doc: unknown;
  try {
    doc = parse(content, { merge: true });
  } catch {
    return [];
  }
  const cubes = isRecord(doc) && Array.isArray(doc['cubes']) ? doc['cubes'] : [];
  return cubes.filter(isRecord).flatMap((cube) => {
    const name = textOf(cube['name']);
    if (name === undefined) return [];
    const dataSource = textOf(cube['data_source']) ?? textOf(cube['dataSource']);
    const parent = textOf(cube['extends']);
    return [
      {
        name,
        ...(dataSource === undefined ? {} : { dataSource }),
        ...(parent === undefined ? {} : { extends: parent }),
      },
    ];
  });
}

/**
 * The dependencies of one dashboard, as `sight` lets its user see them: the
 * pane's listing, and what a file may hold.
 */
export async function dependenciesOf(
  dashboard: Stored,
  access: ExportAccess,
  sight: (folderId: string) => Sight,
  /** Whether the user may open a chart the dashboard shows (the server's `mayOpen`). */
  opens: (chart: Stored) => Promise<boolean> = async () => true,
): Promise<
  | { readonly kind: 'unreadable'; readonly message: string }
  | {
      readonly kind: 'ok';
      readonly offered: Offered;
      readonly charts: ReadonlyMap<string, Stored>;
      readonly files: ReadonlyMap<string, ModelFile>;
      readonly sources: ReadonlyMap<string, DataSource>;
    }
> {
  const [folders, files, sources, published] = await Promise.all([
    access.folders(),
    access.modelFiles(),
    access.dataSources?.() ?? Promise.resolve([] as readonly DataSource[]),
    access.published?.(),
  ]);
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const parentOf = (folderId: string): string | null => {
    if (folderId === ROOT_FOLDER_ID || isWorkspaceId(folderId)) return null;
    return byId.get(folderId)?.parentId ?? ROOT_FOLDER_ID;
  };
  /** A folder and each above it, nearest first, to the root or a workspace. */
  const upFrom = (folderId: string): string[] => {
    const chain: string[] = [];
    for (let at: string | null = folderId; at !== null && !chain.includes(at); at = parentOf(at))
      chain.push(at);
    return chain;
  };
  /** Its path from Shared, or from My workspace. */
  const pathOf = (folderId: string): string[] => {
    const chain = upFrom(folderId).reverse();
    const top = chain[0];
    const titles = chain
      .filter((id) => id !== ROOT_FOLDER_ID && !isWorkspaceId(id))
      .map((id) => byId.get(id)?.title ?? id);
    return top !== undefined && isWorkspaceId(top) ? ['My workspace', ...titles] : titles;
  };
  const inWorkspace = (folderId: string) => {
    const top = upFrom(folderId).at(-1);
    return top !== undefined && isWorkspaceId(top);
  };
  const folderOf = (body: Record<string, unknown>) => textOf(body['folderId']) ?? null;
  /**
   * Where an item's short names resolve from: where it is, or, in a
   * workspace, its origin's folder or its target (T347's order).
   */
  const resolvesFrom = (body: Record<string, unknown>, at: string | null): string => {
    if (at === null) return ROOT_FOLDER_ID;
    if (!inWorkspace(at)) return at;
    const origin = isRecord(body['origin']) ? textOf(body['origin']['folderId']) : undefined;
    return origin ?? textOf(body['targetFolderId']) ?? ROOT_FOLDER_ID;
  };

  // The dashboard's charts: its own always go, a library chart if chosen. One
  // the user may not open goes neither way, and is counted (as the copy route
  // refuses one, T344's review).
  const charts = new Map<string, Stored>();
  const own: Stored[] = [];
  const library: Stored[] = [];
  const hiddenFolders = new Set<string>();
  let hiddenCharts = 0;
  for (const id of chartIdsIn(dashboard.body)) {
    const read = await access.chart(id);
    if ('unreadable' in read) return { kind: 'unreadable', message: read.unreadable };
    if (read.found === null) continue;
    if (!(await opens(read.found))) {
      hiddenCharts += 1;
      hiddenFolders.add(folderOf(read.found.body) ?? `chart:${id}`);
      continue;
    }
    charts.set(id, read.found);
    // Another dashboard's local chart it shows goes as this one's own: the
    // file has no other place for it, and imported it is this one's alone.
    if (typeof read.found.body['localToDashboardId'] === 'string') own.push(read.found);
    else library.push(read.found);
  }

  // The models each chart uses, and what those need, found as the chart finds them.
  const index = indexOf(files);
  const byXcubeId = new Map(
    [...(published?.ids ?? new Map<string, string>())].map(([id, xcubeId]) => [xcubeId, id]),
  );
  const nearest = (short: string, from: string): ModelFile | undefined => {
    for (const folderId of upFrom(from)) {
      const found = index.declared.get(folderId)?.get(short);
      if (found !== undefined) return found;
    }
    return undefined;
  };
  /**
   * A cube a chart stores, by the name it stores (AC-328): a full name in its
   * folder; a short one, where the chart's folder is published, the root's,
   * as xcube bound it and never rebinds it (AC-273); else, or where the root
   * has none, nearest first.
   */
  const storedNamed = (name: string, from: string): ModelFile | undefined => {
    const full = FULL_NAME.exec(name);
    const bound = full === null ? undefined : byXcubeId.get(full[1]!);
    if (full !== null && bound !== undefined) return index.declared.get(bound)?.get(full[2]!);
    const short = full === null ? name : full[2]!;
    const root =
      published?.ids.has(from) === true
        ? index.declared.get(ROOT_FOLDER_ID)?.get(short)
        : undefined;
    return root ?? nearest(short, from);
  };
  /** What a model file names — a join, a view's cube, a parent — as a publish binds it: nearest first. */
  const neededBy = (name: string, file: ModelFile) =>
    nearest(FULL_NAME.exec(name)?.[2] ?? name, file.folderId ?? ROOT_FOLDER_ID);
  const usedBy = new Map<string, Set<string>>();
  /** The model files the dashboard's own filters and text tokens use (T429's `cubesOfDashboard`). */
  const byDashboard = new Set<string>();
  const modelFiles = new Map<string, ModelFile>();
  /** Each model file these names need, and all those need in turn. */
  const reachedFrom = (names: readonly string[], from: string): Set<string> => {
    const pending = names.flatMap((name) => {
      const file = storedNamed(name, from);
      return file === undefined ? [] : [file];
    });
    const reached = new Set<string>();
    while (pending.length > 0) {
      const file = pending.pop()!;
      const key = keyOf(file);
      if (reached.has(key)) continue;
      reached.add(key);
      modelFiles.set(key, file);
      for (const name of index.needs.get(key) ?? []) {
        const needed = neededBy(name, file);
        if (needed !== undefined) pending.push(needed);
      }
    }
    return reached;
  };
  const dashboardFolder = folderOf(dashboard.body);
  const dashboardFrom = resolvesFrom(dashboard.body, dashboardFolder);
  for (const [chartId, stored] of charts) {
    const definition = stored.body['chart'] as ChartDefinition | undefined;
    const source = definition?.source?.cube;
    if (typeof source !== 'string' || source === '') continue;
    const { others } = cubesOfChart(definition!);
    const local = typeof stored.body['localToDashboardId'] === 'string';
    const from = local ? dashboardFrom : resolvesFrom(stored.body, folderOf(stored.body));
    for (const key of reachedFrom([source, ...others], from)) {
      const users = usedBy.get(key) ?? new Set<string>();
      users.add(chartId);
      usedBy.set(key, users);
    }
  }
  for (const key of reachedFrom(cubesOfDashboard(dashboard.body), dashboardFrom))
    byDashboard.add(key);

  // The data source each cube binds to, nearest first from its model's folder.
  const sourcesByFolder = new Map<string, DataSource[]>();
  for (const each of sources) {
    const held = sourcesByFolder.get(each.folderId) ?? [];
    held.push(each);
    sourcesByFolder.set(each.folderId, held);
  }
  const sourceNamed = (name: string, from: string): DataSource | undefined => {
    for (const folderId of upFrom(from)) {
      const found = sourcesByFolder.get(folderId)?.find((each) => each.name === name);
      if (found !== undefined) return found;
    }
    return undefined;
  };
  /**
   * A cube's data source: the one it names, from its own folder; a cube that
   * extends another and names none, its parent's as bound where the parent is
   * (AC-273; `xcube-slice-6.md`); else `default`, from its own folder.
   */
  const sourceOf = (file: ModelFile, cube: string, seen: Set<string>): DataSource | undefined => {
    const at = file.folderId ?? ROOT_FOLDER_ID;
    const found = cubesIn(file.content).find((each) => each.name === cube);
    if (found?.dataSource !== undefined) return sourceNamed(found.dataSource, at);
    if (found?.extends !== undefined && !seen.has(`${keyOf(file)}/${cube}`)) {
      seen.add(`${keyOf(file)}/${cube}`);
      const parentName = FULL_NAME.exec(found.extends)?.[2] ?? found.extends;
      const parent = neededBy(found.extends, file);
      if (parent !== undefined) return sourceOf(parent, parentName, seen);
    }
    return sourceNamed(DEFAULT_SOURCE, at);
  };
  const boundTo = new Map<string, Set<string>>();
  for (const [key, file] of modelFiles)
    for (const cube of cubesIn(file.content)) {
      const bound = sourceOf(file, cube.name, new Set());
      if (bound === undefined) continue;
      const models = boundTo.get(bound.id) ?? new Set<string>();
      models.add(key);
      boundTo.set(bound.id, models);
    }

  // Offered where the user sees every kind of the folder's items; else counted.
  const sees = (folderId: string) => sight(folderId) === 'all';
  const hiddenUsers = new Set<string>();
  const models: Offered['models'][number][] = [];
  let hiddenModels = 0;
  for (const [key, file] of modelFiles) {
    const folderId = file.folderId ?? ROOT_FOLDER_ID;
    const users = [...(usedBy.get(key) ?? [])];
    if (sees(folderId))
      models.push({
        id: key,
        path: file.path,
        folderPath: pathOf(folderId),
        chartIds: users,
        byDashboard: byDashboard.has(key),
      });
    else {
      hiddenModels += 1;
      hiddenFolders.add(folderId);
      users.forEach((user) => hiddenUsers.add(user));
    }
  }
  const offeredModels = new Set(models.map((model) => model.id));
  const dataSources: Offered['dataSources'][number][] = [];
  let hiddenSources = 0;
  for (const [sourceId, keys] of boundTo) {
    const bound = sources.find((each) => each.id === sourceId)!;
    const users = [...new Set([...keys].flatMap((key) => [...(usedBy.get(key) ?? [])]))];
    if (!sees(bound.folderId)) {
      hiddenSources += 1;
      hiddenFolders.add(bound.folderId);
      users.forEach((user) => hiddenUsers.add(user));
      continue;
    }
    dataSources.push({
      id: bound.id,
      name: bound.name,
      driver: bound.driver,
      authMethod: bound.authMethod,
      fields: bound.fields,
      description: bound.description,
      folderPath: pathOf(bound.folderId),
      boundBy: [...keys]
        .filter((key) => offeredModels.has(key))
        .map((key) => modelFiles.get(key)!.path),
      chartIds: users,
      byDashboard: [...keys].some((key) => byDashboard.has(key)),
    });
  }

  const titleOf = (stored: Stored, untitled = 'Untitled chart') =>
    textOf(stored.body['title']) ?? untitled;
  const target = textOf(dashboard.body['targetFolderId']);
  const offered: Offered = {
    dashboard: {
      id: dashboard.id,
      title: titleOf(dashboard, 'Untitled dashboard'),
      version: dashboard.version ?? 1,
      path:
        dashboardFolder === null || sight(dashboardFolder) === undefined
          ? null
          : pathOf(dashboardFolder),
      // Named only where the user may still see it.
      ...(target === undefined || sight(target) === undefined
        ? {}
        : { targetPath: pathOf(target) }),
    },
    fileName: exportFileNameOf(textOf(dashboard.body['title']) ?? ''),
    ownCharts: own.map((each) => ({ id: each.id, title: titleOf(each) })),
    libraryCharts: library.map((each) => {
      const at = folderOf(each.body);
      return {
        id: each.id,
        title: titleOf(each),
        path: at === null || sight(at) === undefined ? null : pathOf(at),
        chartIds: [each.id],
      };
    }),
    models,
    dataSources,
    notOffered: {
      charts: hiddenCharts,
      models: hiddenModels,
      dataSources: hiddenSources,
      folders: hiddenFolders.size,
      usedBy: [...charts.keys()].filter((id) => hiddenUsers.has(id)).map((id) => titleOf(charts.get(id)!)),
    },
    viewOnly: false,
  };
  return {
    kind: 'ok',
    offered,
    charts,
    files: modelFiles,
    sources: new Map(sources.map((each) => [each.id, each])),
  };
}

/** A list of ids in a body, or why not. */
const idsIn = (value: unknown): string[] | undefined =>
  value === undefined
    ? []
    : Array.isArray(value) && value.every((id) => typeof id === 'string')
      ? (value as string[])
      : undefined;

export function registerExport(
  app: FastifyInstance,
  access: ExportAccess & {
    /** Whether the user may see no model or data source anywhere (design 13, state D). */
    readonly viewOnly: (request: FastifyRequest) => Promise<boolean>;
  },
): void {
  /** The dashboard's dependencies as its user may see them; else the answer already sent. */
  const listed = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const dashboard = await access.dashboardFor(request, reply, id);
    if (dashboard === undefined) return undefined;
    const [sight, viewOnly, opens] = await Promise.all([
      access.sightOf(request),
      access.viewOnly(request),
      access.opensOf(request),
    ]);
    const found = await dependenciesOf(dashboard, access, sight, opens);
    if (found.kind === 'unreadable') {
      await reply.code(422).send({ error: found.message });
      return undefined;
    }
    return {
      ...found,
      dashboard,
      offered: viewOnly
        ? { ...found.offered, models: [], dataSources: [], viewOnly: true }
        : found.offered,
    };
  };

  app.get('/api/export/dashboards/:id', USER, async (request, reply) => {
    const found = await listed(request, reply);
    return found === undefined ? reply : found.offered;
  });

  app.post('/api/export/dashboards/:id', USER, async (request, reply) => {
    const body = (request.body ?? {}) as Record<string, unknown>;
    const chosen = {
      libraryCharts: idsIn(body['libraryCharts']),
      models: idsIn(body['models']),
      dataSources: idsIn(body['dataSources']),
    };
    if (
      chosen.libraryCharts === undefined ||
      chosen.models === undefined ||
      chosen.dataSources === undefined
    )
      return reply.code(400).send({
        error: 'Send what goes with it as { libraryCharts, models, dataSources }, each a list of ids.',
      });
    const found = await listed(request, reply);
    if (found === undefined) return reply;
    const { offered } = found;
    const offers = {
      libraryCharts: new Set(offered.libraryCharts.map((each) => each.id)),
      models: new Set(offered.models.map((each) => each.id)),
      dataSources: new Set(offered.dataSources.map((each) => each.id)),
    };
    for (const group of ['libraryCharts', 'models', 'dataSources'] as const)
      if (chosen[group]!.some((id) => !offers[group].has(id)))
        return reply.code(400).send({
          error: 'Something chosen isn’t among what this dashboard’s export offers you.',
        });

    const titleOf = (stored: Stored) => textOf(stored.body['title']) ?? '';
    const chartItem = (stored: Stored, own: boolean): ExportItem => ({
      kind: 'chart',
      id: stored.id,
      title: titleOf(stored),
      ...(own ? { dashboardId: found.dashboard.id } : {}),
      body: exportedBodyOf(stored.body),
    });
    const items: ExportItem[] = [
      {
        kind: 'dashboard',
        id: found.dashboard.id,
        title: titleOf(found.dashboard),
        body: exportedBodyOf(found.dashboard.body),
      },
      ...offered.ownCharts.map((each) => chartItem(found.charts.get(each.id)!, true)),
      ...offered.libraryCharts
        .filter((each) => chosen.libraryCharts!.includes(each.id))
        .map((each) => chartItem(found.charts.get(each.id)!, false)),
      ...offered.models
        .filter((each) => chosen.models!.includes(each.id))
        .map((each): ExportItem => {
          const file = found.files.get(each.id)!;
          return { kind: 'model', path: file.path, content: file.content };
        }),
      ...offered.dataSources
        .filter((each) => chosen.dataSources!.includes(each.id))
        .map((each) => exportedDataSourceOf(found.sources.get(each.id)!)),
    ];
    const file: ExportFile = {
      format: EXPORT_FORMAT,
      version: EXPORT_VERSION,
      exportedAt: new Date().toISOString(),
      items,
    };
    return reply.header('content-type', 'application/json; charset=utf-8').send(JSON.stringify(file));
  });
}
