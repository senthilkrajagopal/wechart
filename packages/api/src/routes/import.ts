import { randomUUID } from 'node:crypto';

import { exportedBodyOf, readExport, type ExportedChart, type ExportFile } from '@wechart/core';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { USER } from '../auth/guard';
import { withChartsRenamed } from './workspace-copy';

/**
 * Importing a dashboard's export file (T513; F38, AC-356, AC-357, AC-359;
 * design 13, screen 2; R44).
 *
 * Everything the file holds lands in the importer's workspace as new drafts,
 * with the one target folder they chose among those they may write, as New in
 * My workspace makes one (T345). From there each draft reaches its folder
 * only by Propose and Approve. Nothing already saved is replaced, renamed or
 * removed. With sign-in off it lands in the single user's workspace, `mine`
 * (AC-254). A user with no workspace can't import.
 *
 * - `POST /api/import/review` says what would land and what each draft may
 *   affect once proposed (AC-357): an item of the same kind and name in the
 *   target or the workspace; a model's cube or view the target already has
 *   (AC-270). A data source whose name is held is mapped to the one holding
 *   it, landed or a draft of the importer's (T719, AC-358); one off the
 *   target's path is the one warning that blocks. It writes nothing.
 * - `POST /api/import` makes the drafts, all together or none.
 *
 * Both read the whole file first (`readExport`): one it can't take is
 * refused with each part and why, and nothing is written (AC-359).
 *
 * Models are listed and not imported until the workspace holds models (T347,
 * T350; design 13, state V).
 */

/** Until the workspace holds models (T347): listed, "not imported yet". */
export const MODELS_IMPORT = false;

/** Where an import is made, and where it is reviewed first. */
const IMPORTS = `/api/import`;
const REVIEWS = `/api/import/review`;

/** What a draft may affect once proposed (AC-357). */
export type Warning =
  /** The target has an item of its kind and name: proposed, the draft replaces it (AC-288). */
  | { readonly kind: 'in-target'; readonly version: number | null }
  /** The workspace has a draft of its kind and name: both are kept. */
  | { readonly kind: 'in-workspace'; readonly targetPath: readonly string[] | null }
  /** A cube or view it defines is already in the target, in another model file (AC-270). */
  | { readonly kind: 'cube-in-target'; readonly cube: string; readonly file: string }
  /**
   * The data source its name means isn't in the target or a folder above it,
   * so a model there couldn't use it: the import waits for a target on its
   * path (T719; AC-358, AC-357's R73 clause). This one blocks.
   */
  | { readonly kind: 'off-path' };

/** What the target and the workspace hold, as the warnings are reckoned against. */
export interface Holdings {
  readonly target: {
    /** The target's own dashboard or library chart of the kind and title, at its version. */
    readonly named: (
      kind: 'dashboard' | 'chart',
      title: string,
    ) => { readonly version: number } | undefined;
    readonly models: readonly { readonly path: string; readonly declares: readonly string[] }[];
  };
  /** The workspace's drafts: their kind, name, and target's path (null for none or one not seen). */
  readonly workspace: readonly {
    readonly kind: string;
    readonly title: string;
    readonly targetPath: readonly string[] | null;
  }[];
}

/** One item's warnings: what it may affect, in the target, then the workspace. */
export function warningsOf(
  item: {
    readonly kind: 'dashboard' | 'chart' | 'model' | 'data-source';
    /** Its title; a model's path; a data source's name. */
    readonly name: string;
    /** A model's cubes and views. */
    readonly declares?: readonly string[];
  } & Holdings,
): Warning[] {
  const warnings: Warning[] = [];
  const { target, workspace } = item;
  if (item.kind === 'dashboard' || item.kind === 'chart') {
    const same = target.named(item.kind, item.name);
    if (same !== undefined) warnings.push({ kind: 'in-target', version: same.version });
  }
  if (item.kind === 'model') {
    if (target.models.some((model) => model.path === item.name))
      warnings.push({ kind: 'in-target', version: null });
    for (const cube of item.declares ?? []) {
      const holder = target.models.find(
        (model) => model.path !== item.name && model.declares.includes(cube),
      );
      if (holder !== undefined) warnings.push({ kind: 'cube-in-target', cube, file: holder.path });
    }
  }
  // A dashboard's or library chart's draft of the name: both are kept.
  const drafted =
    item.kind === 'dashboard' || item.kind === 'chart'
      ? workspace.find((each) => each.kind === item.kind && each.title === item.name)
      : undefined;
  if (drafted !== undefined)
    warnings.push({ kind: 'in-workspace', targetPath: drafted.targetPath });
  return warnings;
}

/** What Review lists of one item: whether it lands, and what it may affect. */
export interface ReviewItem {
  readonly kind: 'dashboard' | 'chart' | 'model' | 'data-source';
  /** Its id in the file; a model's path; a data source's name. */
  readonly key: string;
  readonly title: string;
  /** A dashboard's own charts, which land with it. */
  readonly ownCharts?: number;
  /** A data source's driver. */
  readonly driver?: string;
  /**
   * A data source mapped to an existing one (T514): its name and folder,
   * none for a folder the importer can't see (T719).
   */
  readonly mappedTo?: { readonly name: string; readonly path: readonly string[] | null };
  /** Mapped because its name is that one's (T719, AC-358): not the importer's to decide. */
  readonly held?: true;
  readonly lands: 'draft' | 'not-imported-yet' | 'not-imported';
  readonly warnings: readonly Warning[];
}

/**
 * A data source an imported one may be given (T514, AC-358): one a model in
 * the target can bind to — in the target or a folder above it (AC-273) — or
 * one the importer has just created in their workspace, going to the target.
 */
export interface Mappable {
  readonly id: string;
  readonly name: string;
  readonly driver: string;
  readonly path: readonly string[];
  /** Made in the importer's workspace: a new draft. */
  readonly created: boolean;
}

/**
 * The data source an imported one's name already means (T719, AC-358; R71,
 * R72, R73): the landed one of that name, in any folder and any case, else a
 * draft of it in the importer's workspace.
 */
export interface HeldSource {
  readonly id: string;
  readonly name: string;
  /** Its folder's path, where the importer may see it; none where not. */
  readonly path: readonly string[] | null;
  /** In the target or a folder above it, or a draft going to the target: a model there may use it. */
  readonly onPath: boolean;
  /** A draft in the importer's workspace going to the target: counted as made for the import. */
  readonly created: boolean;
}

/** A data source is created under its own name (T719, AC-358; R71: names never change). */
const ownName = (name: string) => ({
  error: `A data source is created under its own name: “${name}”.`,
});

/** One stored document to make. */
interface Create {
  readonly kind: 'dashboard' | 'chart';
  readonly id: string;
  readonly body: Record<string, unknown>;
}

export interface ImportAccess {
  /**
   * The request's user's own workspace: `mine` with sign-in off; none for
   * one who has none (AC-277).
   */
  readonly workspaceOf: (request: FastifyRequest) => Promise<string | undefined>;
  /** The target chosen, where it is a shared folder they may write; else the answer already sent. */
  readonly targetOf: (
    request: FastifyRequest,
    reply: FastifyReply,
    own: string,
    target: unknown,
  ) => Promise<{ readonly id: string; readonly path: readonly string[] } | undefined>;
  /** What the target and the workspace hold, for the warnings. */
  readonly holdings: (
    request: FastifyRequest,
    own: string,
    target: string,
    titles: readonly { readonly kind: 'dashboard' | 'chart'; readonly title: string }[],
  ) => Promise<Holdings>;
  /** A model file's cubes and views. */
  readonly declares: (path: string, content: string) => readonly string[];
  /**
   * Whether a chart the dashboard names and the file doesn't hold may stay
   * on the imported dashboard: one this wechart has, the importer may open,
   * and that may show on a dashboard in their workspace.
   */
  readonly keepsChart: (request: FastifyRequest, chartId: string, own: string) => Promise<boolean>;
  /**
   * Whether an image the dashboard shows may stay on it: one this wechart
   * has and the importer may see (T408). Absent, every one stays.
   */
  readonly keepsImage?: (request: FastifyRequest, imageId: string) => Promise<boolean>;
  readonly owner: (request: FastifyRequest) => string;
  /** Made together, or none (the documents' `createTogether`). */
  readonly create: (creates: readonly Create[]) => Promise<unknown>;
  /**
   * A data source an imported one may be mapped to (`Mappable`), or none
   * where there is no such one the importer may use, which says nothing of
   * one they can't see.
   */
  readonly mappable: (
    request: FastifyRequest,
    id: string,
    own: string,
    target: string,
  ) => Promise<Mappable | undefined>;
  /** The data source an imported one's name already means, if any (`HeldSource`, T719). */
  readonly heldSource: (
    request: FastifyRequest,
    own: string,
    target: string,
    name: string,
  ) => Promise<HeldSource | undefined>;
}

/** Each of the file's data sources whose name is held, by its name in the file (T719). */
async function heldIn(
  request: FastifyRequest,
  access: ImportAccess,
  own: string,
  target: string,
  file: ExportFile,
): Promise<Map<string, HeldSource>> {
  const held = new Map<string, HeldSource>();
  for (const item of file.items)
    if (item.kind === 'data-source') {
      const found = await access.heldSource(request, own, target, item.name);
      if (found !== undefined) held.set(item.name, found);
    }
  return held;
}

/** Each imported data source's name, and what was decided for it. */
type Decided = ReadonlyMap<
  string,
  { readonly map?: string; readonly create?: string; readonly to?: string }
>;

/** The decisions a body sends, one per name: `{ name, map | create | to }` (T514). */
function decisionsIn(value: unknown): Decided | undefined {
  if (value === undefined) return new Map();
  if (!Array.isArray(value)) return undefined;
  const decided = new Map<string, { map?: string; create?: string; to?: string }>();
  for (const each of value as unknown[]) {
    if (each === null || typeof each !== 'object') return undefined;
    const { name, map, create, to } = each as Record<string, unknown>;
    if (typeof name !== 'string') return undefined;
    const one = {
      ...(typeof map === 'string' ? { map } : {}),
      ...(typeof create === 'string' ? { create } : {}),
      ...(typeof to === 'string' ? { to } : {}),
    };
    if (Object.keys(one).length !== 1) return undefined;
    decided.set(name, one);
  }
  return decided;
}

const NO_SUCH_SOURCE = {
  error:
    'There’s no such data source for a model in the target to bind to, or it isn’t yours to use.',
};

/** A refusal of the file, in the pane's words (design 13, states J and K). */
const REFUSED = 'Refused: nothing was imported.';

/** The workspace, the file and the target, each checked: else the answer already sent. */
async function preludeOf(
  request: FastifyRequest,
  reply: FastifyReply,
  access: ImportAccess,
): Promise<
  | {
      readonly own: string;
      readonly file: ExportFile;
      readonly target: { readonly id: string; readonly path: readonly string[] };
    }
  | undefined
> {
  const own = await access.workspaceOf(request);
  if (own === undefined) {
    await reply.code(403).send({
      error:
        'Importing needs My workspace: an import lands there, and view-only access comes without one.',
    });
    return undefined;
  }
  const body = (request.body ?? {}) as { file?: unknown; targetFolderId?: unknown };
  const read = readExport(body.file);
  if (!read.ok) {
    await reply
      .code(422)
      .send(
        'parts' in read
          ? { error: REFUSED, parts: read.parts }
          : { error: REFUSED, unreadable: read.unreadable },
      );
    return undefined;
  }
  const target = await access.targetOf(request, reply, own, body.targetFolderId);
  if (target === undefined) return undefined;
  return { own, file: read.file, target };
}

/**
 * Every chart a dashboard's body names, as anything that reads it may take
 * one (the catalog's `dashboardsUsing`, `withChartsRenamed`): a `chartId` at
 * any depth, and each id in a `charts` list, whose other entries are walked
 * too. Walked with a stack of its own.
 */
export function chartsNamedIn(body: unknown): Set<string> {
  const named = new Set<string>();
  const pending: unknown[] = [body];
  while (pending.length > 0) {
    const value = pending.pop();
    if (Array.isArray(value)) for (const each of value as unknown[]) pending.push(each);
    else if (value !== null && typeof value === 'object')
      for (const [key, each] of Object.entries(value)) {
        if (key === 'chartId' && typeof each === 'string') named.add(each);
        else if (key === 'charts' && Array.isArray(each)) {
          for (const id of each as unknown[])
            if (typeof id === 'string') named.add(id);
            else pending.push(id);
        } else pending.push(each);
      }
  }
  return named;
}

/** Every image a dashboard's body shows: an `imageId` at any depth (T408). */
export function imagesNamedIn(body: unknown): Set<string> {
  const named = new Set<string>();
  const pending: unknown[] = [body];
  while (pending.length > 0) {
    const value = pending.pop();
    if (Array.isArray(value)) for (const each of value as unknown[]) pending.push(each);
    else if (value !== null && typeof value === 'object')
      for (const [key, each] of Object.entries(value))
        if (key === 'imageId' && typeof each === 'string') named.add(each);
        else pending.push(each);
  }
  return named;
}

/** A body with these images taken off their tiles, which then show none (T408). */
export function withoutImages(body: unknown, dropped: ReadonlySet<string>): unknown {
  if (dropped.size === 0) return body;
  if (Array.isArray(body)) return body.map((each: unknown) => withoutImages(each, dropped));
  if (body === null || typeof body !== 'object') return body;
  return Object.fromEntries(
    Object.entries(body)
      .filter(
        ([key, each]) => !(key === 'imageId' && typeof each === 'string' && dropped.has(each)),
      )
      .map(([key, each]) => [key, withoutImages(each, dropped)]),
  );
}

export function registerImport(app: FastifyInstance, access: ImportAccess): void {
  // An export file may hold several model files: more than the default megabyte.
  const route = { ...USER, bodyLimit: 16 * 1024 * 1024 };

  app.post(REVIEWS, route, async (request, reply) => {
    const prelude = await preludeOf(request, reply, access);
    if (prelude === undefined) return reply;
    const { own, file, target } = prelude;
    const charts = file.items.filter((item): item is ExportedChart => item.kind === 'chart');
    const titles = file.items.flatMap((item) =>
      item.kind === 'dashboard' || (item.kind === 'chart' && item.dashboardId === undefined)
        ? [{ kind: item.kind, title: item.title }]
        : [],
    );
    const decided = decisionsIn((request.body as { dataSources?: unknown }).dataSources);
    if (decided === undefined)
      return reply.code(400).send({
        error: 'Send each data source’s decision as { name, map } or { name, create }.',
      });
    // Those whose names are held: mapped, whatever was decided (T719, AC-358).
    const held = await heldIn(request, access, own, target.id, file);
    // Any other is created under its own name alone (T719; R71).
    for (const [name, decision] of decided)
      if (!held.has(name) && decision.create !== undefined && decision.create !== name)
        return reply.code(400).send(ownName(name));
    // Each mapped one, where the importer may use it: else as none there is (T514).
    const mapped = new Map<string, Mappable>();
    for (const [name, decision] of decided)
      if (!held.has(name) && decision.map !== undefined) {
        const found = await access.mappable(request, decision.map, own, target.id);
        if (found === undefined) return reply.code(404).send(NO_SUCH_SOURCE);
        // A draft of another name is one made under it, as Import refuses (T719's review).
        if (found.created) return reply.code(400).send(ownName(name));
        mapped.set(name, found);
      }
    const holdings = await access.holdings(request, own, target.id, titles);
    const items = file.items.flatMap((item): ReviewItem[] => {
      if (item.kind === 'dashboard')
        return [
          {
            kind: item.kind,
            key: item.id,
            title: item.title,
            ownCharts: charts.filter((chart) => chart.dashboardId === item.id).length,
            lands: 'draft',
            warnings: warningsOf({ kind: item.kind, name: item.title, ...holdings }),
          },
        ];
      // An own chart goes with its dashboard, as one draft with it.
      if (item.kind === 'chart')
        return item.dashboardId === undefined
          ? [
              {
                kind: item.kind,
                key: item.id,
                title: item.title,
                lands: 'draft',
                warnings: warningsOf({ kind: item.kind, name: item.title, ...holdings }),
              },
            ]
          : [];
      if (item.kind === 'model')
        return [
          {
            kind: item.kind,
            key: item.path,
            title: item.path,
            lands: MODELS_IMPORT ? 'draft' : 'not-imported-yet',
            warnings: MODELS_IMPORT
              ? warningsOf({
                  kind: item.kind,
                  name: item.path,
                  declares: access.declares(item.path, item.content),
                  ...holdings,
                })
              : [],
          },
        ];
      // One whose name is held: mapped to that one, not imported, nothing
      // asked; off the target's path, it blocks (T719; AC-358, AC-357).
      const holder = held.get(item.name);
      if (holder !== undefined)
        return [
          {
            kind: item.kind,
            key: item.name,
            title: item.name,
            driver: item.driver,
            lands: 'not-imported',
            mappedTo: { name: holder.name, path: holder.path },
            held: true,
            warnings: holder.onPath ? [] : [{ kind: 'off-path' }],
          },
        ];
      // A data source as decided (T514): mapped, not imported; created, a
      // new draft under its own name; undecided, not imported.
      const to = mapped.get(item.name);
      if (to !== undefined)
        return [
          {
            kind: item.kind,
            key: item.name,
            title: item.name,
            driver: item.driver,
            lands: 'not-imported',
            mappedTo: { name: to.name, path: to.path },
            warnings: [],
          },
        ];
      const as = decided.get(item.name)?.create;
      return [
        {
          kind: item.kind,
          key: item.name,
          title: as ?? item.name,
          driver: item.driver,
          lands: as === undefined ? 'not-imported' : 'draft',
          warnings: warningsOf({ kind: item.kind, name: as ?? item.name, ...holdings }),
        },
      ];
    });
    return { target, items };
  });

  app.post(IMPORTS, route, async (request, reply) => {
    const prelude = await preludeOf(request, reply, access);
    if (prelude === undefined) return reply;
    const { own, file, target } = prelude;
    const owner = access.owner(request);
    const dashboard = file.items.find((item) => item.kind === 'dashboard')!;
    const charts = file.items.filter((item): item is ExportedChart => item.kind === 'chart');

    /**
     * Each data source in the file given the one chosen for it (T514,
     * AC-358): an existing one a model in the target can bind to, or one the
     * importer created in their workspace from its settings, tested before it
     * was saved (`POST /api/data-sources`). The models that bind to it come
     * with T347.
     */
    const decided = decisionsIn((request.body as { dataSources?: unknown }).dataSources);
    if (decided === undefined)
      return reply.code(400).send({ error: 'Send each data source’s decision as { name, to }.' });
    const where = target.path.length === 0 ? 'Shared' : target.path.join(' / ');
    /**
     * One whose name is held is that one's, whatever was decided (T719,
     * AC-358); one off the target's path blocks the import until a target on
     * its path is chosen (AC-357's R73 clause), saying no folder of it.
     */
    const held = await heldIn(request, access, own, target.id, file);
    for (const [name, holder] of held)
      if (!holder.onPath)
        return reply.code(409).send({
          error: `“${name}” is the name of a data source that isn’t in ${where} or a folder above it, so a model there couldn’t use it. Choose a target on its path.`,
        });
    const undecided = file.items.flatMap((item) =>
      item.kind === 'data-source' &&
      !held.has(item.name) &&
      decided.get(item.name)?.to === undefined
        ? [item.name]
        : [],
    );
    if (undecided.length > 0)
      return reply.code(400).send({
        error: `Map each data source to one a model in ${where} can bind to, or create it: ${undecided.join(', ')}.`,
      });
    let createdSources = 0;
    for (const item of file.items)
      if (item.kind === 'data-source') {
        const holder = held.get(item.name);
        if (holder !== undefined) {
          if (holder.created) createdSources += 1;
          continue;
        }
        const found = await access.mappable(request, decided.get(item.name)!.to!, own, target.id);
        if (found === undefined) return reply.code(404).send(NO_SUCH_SOURCE);
        // One made for it is made under its own name, which would be held (T719).
        if (found.created) return reply.code(400).send(ownName(item.name));
      }

    // New ids for everything: nothing saved is written over (AC-356).
    const boardId = randomUUID();
    const renamed = new Map(charts.map((chart) => [chart.id, randomUUID()]));
    /**
     * A chart the dashboard names that the file doesn't hold (its exporter
     * left it out) stays only where this wechart has it and the importer may
     * open it there; otherwise the tile shows a chart that is no longer
     * available, and names nothing they can't see (AC-263).
     */
    const kept = new Set<string>();
    for (const id of chartsNamedIn(dashboard.body))
      if (renamed.has(id)) continue;
      else if (await access.keepsChart(request, id, own)) kept.add(id);
      else renamed.set(id, randomUUID());
    // An image the importer may not see stays behind: its tile shows none (T408).
    const dropped = new Set<string>();
    if (access.keepsImage !== undefined)
      for (const imageId of imagesNamedIn(dashboard.body))
        if (!(await access.keepsImage(request, imageId))) dropped.add(imageId);
    const board = exportedBodyOf(
      withoutImages(withChartsRenamed(dashboard.body, renamed), dropped) as Record<string, unknown>,
    );
    // Whatever shape the file gave it, the dashboard names no chart but its
    // own new ones and those the importer may open (AC-263; T513's review).
    const safe = new Set([...renamed.values(), ...kept]);
    const stray = [...chartsNamedIn(board)].filter((id) => !safe.has(id));
    if (stray.length > 0)
      return reply.code(422).send({
        error: REFUSED,
        parts: [
          {
            part: `Dashboard “${dashboard.title}”`,
            why: 'It names a chart in a way this wechart doesn’t read.',
          },
        ],
      });

    const creates: Create[] = [
      {
        kind: 'dashboard',
        id: boardId,
        body: {
          ...board,
          title: dashboard.title,
          folderId: own,
          owner,
          targetFolderId: target.id,
        },
      },
      ...charts.map((chart): Create => ({
        kind: 'chart',
        id: renamed.get(chart.id)!,
        body: {
          ...exportedBodyOf(chart.body),
          title: chart.title,
          owner,
          ...(chart.dashboardId === undefined
            ? { folderId: own, targetFolderId: target.id }
            : { localToDashboardId: boardId }),
        },
      })),
    ];
    await access.create(creates);
    return reply.code(201).send({
      dashboard: { id: boardId, title: dashboard.title },
      created: { dashboards: 1, charts: charts.length, models: 0, dataSources: createdSources },
      target,
    });
  });
}
