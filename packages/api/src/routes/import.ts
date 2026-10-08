import { randomUUID } from 'node:crypto';

import {
  exportedBodyOf,
  nameKey,
  readExport,
  objectsOf,
  rebound,
  templateNeedsBinding,
  tokenMembersOf,
  type ExportedChart,
  type ExportFile,
} from '@wechart/core';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { cubesOfChartBody } from '../access/queries';
import { USER } from '../auth/guard';
import { textTilesOf } from '../model/bind';
import { namesDeclaredIn } from '../model/names';
import { withChartsRenamed } from './workspace-copy';
import { draftPathOf } from './workspace-models';

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
 *   target or the workspace. A data source or model whose name is held is
 *   mapped to the one holding it, landed or a draft of the importer's (T719,
 *   T720; AC-358, AC-357; R71, R73); one off the target's path blocks, and so
 *   does a model whose path My workspace's root already holds. It writes
 *   nothing.
 * - `POST /api/import` makes the drafts, all together or none.
 *
 * Both read the whole file first (`readExport`): one it can't take is
 * refused with each part and why, and nothing is written (AC-359).
 *
 * A model of a name not held lands in My workspace's root as a draft going
 * to the target, through the workspace's overlay (T720, T347): stored only as
 * xcube takes it. Where wechart holds no workspace models (no xcube), models
 * are listed and not imported (design 13, state V).
 */

/** Where an import is made, and where it is reviewed first. */
const IMPORTS = `/api/import`;
const REVIEWS = `/api/import/review`;

/** What a draft may affect once proposed (AC-357). */
export type Warning =
  /** The target has an item of its kind and name: proposed, the draft replaces it (AC-288). */
  | { readonly kind: 'in-target'; readonly version: number | null }
  /** The workspace has a draft of its kind and name: both are kept. */
  | { readonly kind: 'in-workspace'; readonly targetPath: readonly string[] | null }
  /**
   * The data source, cube or view its name means isn't in the target or a
   * folder above it, so the target couldn't use it: the import waits for a
   * target on its path (T719, T720; AC-358, AC-357's R73 clause). This one
   * blocks. For a cube or view, the file's charts that use it (T736): it
   * blocks only while one of them is not left out.
   */
  | {
      readonly kind: 'off-path';
      readonly charts?: readonly {
        readonly key: string;
        readonly title: string;
        readonly leftOut: boolean;
      }[];
      /** The dashboard's own uses of it, which can't be left out: present where there are any. */
      readonly dashboard?: readonly DashboardUse[];
    }
  /**
   * My workspace's root has a model file at its path, which it would land
   * over (T720): it blocks until one of them is renamed or removed.
   */
  | { readonly kind: 'path-in-workspace' }
  /**
   * The data source its name means has another driver than the file's
   * (AC-361, the coordinator's call on T719): named where the importer may
   * see its folder, only said otherwise. A warning; nothing blocks.
   */
  | { readonly kind: 'driver-differs'; readonly driver?: string };

/** What the target and the workspace hold, as the warnings are reckoned against. */
export interface Holdings {
  readonly target: {
    /** The target's own dashboard or library chart of the kind and title, at its version. */
    readonly named: (
      kind: 'dashboard' | 'chart',
      title: string,
    ) => { readonly version: number } | undefined;
    /** The target's model files' paths. */
    readonly models: readonly { readonly path: string }[];
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
  } & Holdings,
): Warning[] {
  const warnings: Warning[] = [];
  const { target, workspace } = item;
  if (item.kind === 'dashboard' || item.kind === 'chart') {
    const same = target.named(item.kind, item.name);
    if (same !== undefined) warnings.push({ kind: 'in-target', version: same.version });
  }
  // A model whose cube or view the target has is mapped to it (T720; R71),
  // so only its path is reckoned here.
  if (item.kind === 'model' && target.models.some((model) => model.path === item.name))
    warnings.push({ kind: 'in-target', version: null });
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
   * A data source or model mapped to an existing one (T514, T720): its name
   * and folder, none for a folder the importer can't see (T719).
   */
  readonly mappedTo?: { readonly name: string; readonly path: readonly string[] | null };
  /** Mapped because its name is that one's (T719, T720; AC-358): not the importer's to decide. */
  readonly held?: true;
  /** `left-out`: a chart the importer leaves out, with its tiles (T736). */
  readonly lands: 'draft' | 'not-imported-yet' | 'not-imported' | 'left-out';
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
  readonly driver: string;
  /** Its folder's path, where the importer may see it; none where not. */
  readonly path: readonly string[] | null;
  /** In the target or a folder above it, or a draft going to the target: a model there may use it. */
  readonly onPath: boolean;
  /** A draft in the importer's workspace going to the target: counted as made for the import. */
  readonly created: boolean;
}

/**
 * The cube or view an imported model's names already mean (T720, AC-357;
 * R71, R72, R73): the landed one of a name it declares, in any folder and any
 * case, else a draft of it in the importer's workspace.
 */
export interface HeldItem {
  /** Its name, as the one holding it declares it. */
  readonly name: string;
  /** Its folder's path, where the importer may see its models; none where not. */
  readonly path: readonly string[] | null;
  /** In the target or a folder above it, or a draft going there: the target's charts may use it. */
  readonly onPath: boolean;
}

/** A model saved in My workspace, or why it wasn't: the workspace's own answer (T347). */
export interface ModelsAnswer {
  readonly status: number;
  readonly body: unknown;
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
  /**
   * The cube or view each of an imported model's names already means: one
   * per name held (`HeldItem`, T720), none for a name nothing holds.
   */
  readonly heldItems: (
    request: FastifyRequest,
    own: string,
    target: string,
    names: readonly string[],
  ) => Promise<readonly HeldItem[]>;
  /**
   * My workspace's models, where wechart holds them (xcube's overlays, T347);
   * absent, an imported model is listed and not imported.
   */
  readonly models?: {
    /** The paths of the model files in the workspace's root. */
    readonly paths: (own: string) => Promise<ReadonlySet<string>>;
    /** New files in the workspace's root, going to the target, as its overlay takes them. */
    readonly save: (
      own: string,
      target: string,
      files: readonly { readonly path: string; readonly content: string }[],
    ) => Promise<ModelsAnswer>;
    /** A file taken back out of the workspace's root, and its overlay. */
    readonly remove: (own: string, path: string) => Promise<ModelsAnswer>;
  };
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

/**
 * Each of the file's models a name of which is held, by its path in the file:
 * the holder Review names — one off the target's path where any is, so none
 * goes unsaid (T720's review) — with the file's name for it (T720).
 */
async function heldModelsIn(
  request: FastifyRequest,
  access: ImportAccess,
  own: string,
  target: string,
  file: ExportFile,
): Promise<Map<string, HeldModel>> {
  const held = new Map<string, HeldModel>();
  const charts = file.items.filter((item): item is ExportedChart => item.kind === 'chart');
  const board = file.items.find((item) => item.kind === 'dashboard')?.body;
  for (const item of file.items)
    if (item.kind === 'model') {
      const names = namesDeclaredIn(item.content);
      const holders = await access.heldItems(request, own, target, names);
      const holder = holders.find((each) => !each.onPath) ?? holders[0];
      if (holder !== undefined) {
        const off = new Set(
          holders.filter((each) => !each.onPath).map((each) => nameKey(each.name)),
        );
        const taken = new Set(holders.map((each) => nameKey(each.name)));
        const offCube = (member: string) => off.has(nameKey(member.split('.')[0] ?? ''));
        held.set(item.path, {
          // The dashboard's own references to it: its filters', its text's tokens' (T736's follow-up).
          dashboardUses: [
            ...filtersOf(board).flatMap((member) =>
              offCube(member) ? [{ kind: 'filter' as const, member }] : [],
            ),
            ...textTilesOf(board)
              .flatMap(tokenMembersOf)
              .flatMap((member) => (offCube(member) ? [{ kind: 'text' as const, member }] : [])),
          ],
          holder,
          asked: names.find((name) => nameKey(name) === nameKey(holder.name)) ?? holder.name,
          // The file's charts that use a name of it held off the path (T736).
          using: charts.filter((chart) =>
            cubesOfChartBody(chart.body).some((cube) => off.has(nameKey(cube))),
          ),
          heldNames: names.filter((name) => taken.has(nameKey(name))),
          fresh: names.filter((name) => !taken.has(nameKey(name))),
        });
      }
    }
  return held;
}

/** A model of the file mapped to the one holding a name of it (`heldModelsIn`). */
interface HeldModel {
  readonly holder: HeldItem;
  readonly asked: string;
  /** The file's charts that use a name of it held off the target's path (T736). */
  readonly using: readonly ExportedChart[];
  /**
   * The dashboard's own references to such a name, its filters' members and
   * its text's tokens' (T736's follow-up): never left out, so they block.
   */
  readonly dashboardUses: readonly DashboardUse[];
  /** Its names held, and those new, as the file has them. */
  readonly heldNames: readonly string[];
  readonly fresh: readonly string[];
}

/** A dashboard's own reference to a member: a filter on it, or a token in its text (T736's follow-up). */
interface DashboardUse {
  readonly kind: 'filter' | 'text';
  readonly member: string;
}

/** The members a dashboard's filters are on. */
const filtersOf = (body: unknown): string[] => {
  const filters = (body as { filters?: unknown } | null | undefined)?.filters;
  return (Array.isArray(filters) ? (filters as { member?: unknown }[]) : []).flatMap((filter) =>
    typeof filter.member === 'string' ? [filter.member] : [],
  );
};

/** "its filter on a.b and its text’s a.c": a dashboard's own uses, in words. */
const dashboardUsesText = (uses: readonly DashboardUse[]) => {
  const words = uses.map((use) =>
    use.kind === 'filter' ? `its filter on ${use.member}` : `its text’s ${use.member}`,
  );
  return words.length <= 1
    ? (words[0] ?? '')
    : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1] ?? ''}`;
};

const quoted = (names: readonly string[]) => names.map((name) => `“${name}”`).join(', ');

/**
 * The file's models refused before xcube is asked (the coordinator's rulings
 * on T720, 2026-10-08), each part and why: one declaring a name in use beside
 * a new one, which is neither mapped whole nor split; and, where models land,
 * each new one declaring a name another new one in the file declares.
 */
function modelPartsRefused(
  file: ExportFile,
  held: ReadonlyMap<string, HeldModel>,
  lands: boolean,
): { readonly part: string; readonly why: string }[] {
  const parts: { part: string; why: string }[] = [];
  for (const [path, model] of held) {
    if (model.fresh.length > 0)
      parts.push({
        part: `Model ${path}`,
        why: `${quoted(model.heldNames)} ${model.heldNames.length === 1 ? 'is' : 'are'} in use and ${quoted(model.fresh)} ${model.fresh.length === 1 ? 'is' : 'are'} new: a model file is either mapped to items in use or imported as new, not both. Split it, then import again.`,
      });
  }
  if (!lands) return parts;
  const landing = file.items.flatMap((item) =>
    item.kind === 'model' && !held.has(item.path)
      ? [{ path: item.path, names: namesDeclaredIn(item.content) }]
      : [],
  );
  for (const model of landing) {
    const twin = model.names.find((name) =>
      landing.some(
        (other) => other !== model && other.names.some((each) => nameKey(each) === nameKey(name)),
      ),
    );
    if (twin !== undefined)
      parts.push({
        part: `Model ${model.path}`,
        why: `Another model in the file declares “${twin}” too: each name is declared once.`,
      });
  }
  return parts;
}

/** The charts a body asks to leave out (T736): their ids in the file; undefined for a body not so. */
function leaveOutIn(value: unknown): ReadonlySet<string> | undefined {
  if (value === undefined) return new Set();
  if (!Array.isArray(value) || !value.every((each) => typeof each === 'string')) return undefined;
  return new Set(value as string[]);
}

/** Whether every chart to leave out uses an item off the target's path (T736). */
const leavable = (held: ReadonlyMap<string, HeldModel>, leaveOut: ReadonlySet<string>) => {
  const may = new Set(
    [...held.values()]
      .filter((model) => !model.holder.onPath)
      .flatMap((model) => model.using.map((chart) => chart.id)),
  );
  return [...leaveOut].every((id) => may.has(id));
};

/** Why a chart can't be left out: only one that uses an item off the target's path may be (T736). */
const NOT_LEAVABLE = {
  error: 'Only a chart that uses a cube or view off the target’s path can be left out.',
};

/**
 * A dashboard's body without these charts (T736): no tile showing one, and
 * none of them in a `charts` list, at any depth.
 */
export function withoutCharts(body: unknown, dropped: ReadonlySet<string>, key?: string): unknown {
  if (dropped.size === 0) return body;
  if (Array.isArray(body))
    return body
      .filter((each: unknown) => {
        if (typeof each === 'string') return !(key === 'charts' && dropped.has(each));
        const chartId =
          each !== null && typeof each === 'object' && !Array.isArray(each)
            ? (each as { chartId?: unknown }).chartId
            : undefined;
        return !(typeof chartId === 'string' && dropped.has(chartId));
      })
      .map((each: unknown) => withoutCharts(each, dropped));
  if (body === null || typeof body !== 'object') return body;
  return Object.fromEntries(
    Object.entries(body).map(([name, each]) => [name, withoutCharts(each, dropped, name)]),
  );
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
    // Models whose names are held: mapped (T720); the workspace root's paths, for the rest.
    const heldModels = await heldModelsIn(request, access, own, target.id, file);
    // Models refused before xcube is asked, each named (T720's second follow-up).
    const refusedParts = modelPartsRefused(file, heldModels, access.models !== undefined);
    if (refusedParts.length > 0)
      return reply.code(409).send({ error: REFUSED, parts: refusedParts });
    const rootPaths = (await access.models?.paths(own)) ?? new Set<string>();
    // The charts left out, each one that uses an item off the target's path (T736).
    const leaveOut = leaveOutIn((request.body as { leaveOut?: unknown }).leaveOut);
    if (leaveOut === undefined)
      return reply
        .code(400)
        .send({ error: 'Send the charts to leave out as a list of their ids.' });
    if (!leavable(heldModels, leaveOut)) return reply.code(400).send(NOT_LEAVABLE);
    const items = file.items.flatMap((item): ReviewItem[] => {
      if (item.kind === 'dashboard')
        return [
          {
            kind: item.kind,
            key: item.id,
            title: item.title,
            ownCharts: charts.filter(
              (chart) => chart.dashboardId === item.id && !leaveOut.has(chart.id),
            ).length,
            lands: 'draft',
            warnings: warningsOf({ kind: item.kind, name: item.title, ...holdings }),
          },
        ];
      // An own chart goes with its dashboard, as one draft with it.
      if (item.kind === 'chart')
        return item.dashboardId === undefined
          ? [
              leaveOut.has(item.id)
                ? {
                    kind: item.kind,
                    key: item.id,
                    title: item.title,
                    lands: 'left-out',
                    warnings: [],
                  }
                : {
                    kind: item.kind,
                    key: item.id,
                    title: item.title,
                    lands: 'draft',
                    warnings: warningsOf({ kind: item.kind, name: item.title, ...holdings }),
                  },
            ]
          : [];
      if (item.kind === 'model') {
        // One whose name is held: mapped to that one, not imported; off the
        // target's path, it blocks while a chart that uses it stays in (T720,
        // T736; AC-357, R73).
        const mapped = heldModels.get(item.path);
        if (mapped !== undefined)
          return [
            {
              kind: item.kind,
              key: item.path,
              title: item.path,
              lands: 'not-imported',
              mappedTo: { name: mapped.holder.name, path: mapped.holder.path },
              held: true,
              warnings: mapped.holder.onPath
                ? []
                : [
                    {
                      kind: 'off-path',
                      charts: mapped.using.map((chart) => ({
                        key: chart.id,
                        title: chart.title,
                        leftOut: leaveOut.has(chart.id),
                      })),
                      ...(mapped.dashboardUses.length === 0
                        ? {}
                        : { dashboard: mapped.dashboardUses }),
                    },
                  ],
            },
          ];
        return [
          {
            kind: item.kind,
            key: item.path,
            title: item.path,
            lands: access.models === undefined ? 'not-imported-yet' : 'draft',
            warnings:
              access.models === undefined
                ? []
                : [
                    ...warningsOf({ kind: item.kind, name: item.path, ...holdings }),
                    // Where it would be stored: at its cube's name (T737, AC-423).
                    ...(rootPaths.has(draftPathOf({ path: item.path, content: item.content }))
                      ? [{ kind: 'path-in-workspace' } as const]
                      : []),
                  ],
          },
        ];
      }
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
            warnings: [
              ...(holder.onPath ? [] : [{ kind: 'off-path' } as const]),
              // Its driver said only where its folder is seen (AC-361).
              ...(holder.driver === item.driver
                ? []
                : [
                    holder.path === null
                      ? ({ kind: 'driver-differs' } as const)
                      : ({ kind: 'driver-differs', driver: holder.driver } as const),
                  ]),
            ],
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
    /**
     * So too a model whose cube or view is held off its path (T720), while a
     * chart of the file that uses it is not left out (T736, AC-357). Those
     * left out go, with their tiles; a chart may be left out only so.
     */
    const heldModels = await heldModelsIn(request, access, own, target.id, file);
    const refusedParts = modelPartsRefused(file, heldModels, access.models !== undefined);
    if (refusedParts.length > 0)
      return reply.code(409).send({ error: REFUSED, parts: refusedParts });
    const leaveOut = leaveOutIn((request.body as { leaveOut?: unknown }).leaveOut);
    if (leaveOut === undefined)
      return reply
        .code(400)
        .send({ error: 'Send the charts to leave out as a list of their ids.' });
    if (!leavable(heldModels, leaveOut)) return reply.code(400).send(NOT_LEAVABLE);
    for (const { holder, asked, using, dashboardUses } of heldModels.values()) {
      if (holder.onPath) continue;
      // The dashboard's own uses can't be left out: only a target on its path will do.
      if (dashboardUses.length > 0)
        return reply.code(409).send({
          error: `“${asked}” is the name of a cube or view that isn’t in ${where} or a folder above it, so the imported dashboard there couldn’t use it in ${dashboardUsesText(dashboardUses)}. Choose a target on its path.`,
        });
      if (using.some((chart) => !leaveOut.has(chart.id)))
        return reply.code(409).send({
          error: `“${asked}” is the name of a cube or view that isn’t in ${where} or a folder above it, so the imported charts there couldn’t use it. Choose a target on its path, or leave out the charts that use it.`,
        });
    }
    const charts = file.items.filter(
      (item): item is ExportedChart => item.kind === 'chart' && !leaveOut.has(item.id),
    );
    const boardBody = withoutCharts(dashboard.body, leaveOut);
    // Every other model lands in My workspace's root, where none has its path (T720).
    const landing =
      access.models === undefined
        ? []
        : file.items.flatMap((item) =>
            item.kind === 'model' && !heldModels.has(item.path)
              ? [{ path: item.path, content: item.content }]
              : [],
          );
    /** Where a model was stored, by the path it was sent at, when not there (T737). */
    const stored = new Map<string, string>();
    if (landing.length > 0) {
      const taken = await access.models!.paths(own);
      // Where each would be stored: at its cube's name (T737, AC-423).
      const clashes = landing.filter((model) => taken.has(draftPathOf(model)));
      if (clashes.length > 0)
        return reply.code(409).send({
          error: REFUSED,
          parts: clashes.map((model) => ({
            part: `Model ${model.path}`,
            why: 'My workspace already has a model file at this path. Rename or remove one of them, then import again.',
          })),
        });
    }
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
    /** Each of the file's data sources, by its name, to the name of the one it is given (T721). */
    const chosen = new Map<string, string>();
    for (const item of file.items)
      if (item.kind === 'data-source') {
        const holder = held.get(item.name);
        if (holder !== undefined) {
          chosen.set(item.name, holder.name);
          // Counted only where the import names it as the one it made (the pane's Create).
          if (holder.created && decided.get(item.name)?.to === holder.id) createdSources += 1;
          continue;
        }
        const found = await access.mappable(request, decided.get(item.name)!.to!, own, target.id);
        if (found === undefined) return reply.code(404).send(NO_SUCH_SOURCE);
        // One made for it is made under its own name, which would be held (T719).
        if (found.created) return reply.code(400).send(ownName(item.name));
        chosen.set(item.name, found.name);
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
    for (const id of chartsNamedIn(boardBody))
      if (renamed.has(id)) continue;
      else if (await access.keepsChart(request, id, own)) kept.add(id);
      else renamed.set(id, randomUUID());
    // An image the importer may not see stays behind: its tile shows none (T408).
    const dropped = new Set<string>();
    if (access.keepsImage !== undefined)
      for (const imageId of imagesNamedIn(boardBody))
        if (!(await access.keepsImage(request, imageId))) dropped.add(imageId);
    const board = exportedBodyOf(
      withoutImages(withChartsRenamed(boardBody, renamed), dropped) as Record<string, unknown>,
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
    /**
     * The models first, as the workspace's overlay takes them (T720, T347):
     * one xcube refuses is refused here, on its file, and nothing is written.
     */
    if (landing.length > 0) {
      /**
       * A Jinja template isn't YAML until Cube renders it, so it isn't
       * rebound here: one naming a data source given another name is refused,
       * saying which (T721's review).
       */
      const templates = landing.flatMap((model) => {
        if (objectsOf(model.path, model.content).code !== 'Jinja') return [];
        const needs = templateNeedsBinding(model.content, chosen);
        return needs === undefined
          ? []
          : [
              {
                part: `Model ${model.path}`,
                why: `It is a Jinja template, which wechart can’t rebind: write “${needs[1]}” for “${needs[0]}” in it, then import again.`,
              },
            ];
      });
      if (templates.length > 0) return reply.code(422).send({ error: REFUSED, parts: templates });
      // Each cube bound to the data source given for the one it names (T721, AC-358).
      const saved = await access.models!.save(
        own,
        target.id,
        landing.map((model) => ({ ...model, content: rebound(model.content, chosen) })),
      );
      if (saved.status === 422 && Array.isArray((saved.body as { errors?: unknown }).errors))
        return reply.code(422).send({
          error: REFUSED,
          parts: (saved.body as { errors: { path: string; message: string }[] }).errors.map(
            (error) => ({ part: `Model ${error.path}`, why: error.message }),
          ),
        });
      if (saved.status >= 300) return reply.code(saved.status).send(saved.body);
      // Where each was stored, to take it back from (T737, AC-423).
      for (const { from, to } of (saved.body as { moved?: { from: string; to: string }[] }).moved ??
        [])
        stored.set(from, to);
    }
    // All together or none (AC-356): the models go back out if the documents fail (T720's review).
    try {
      await access.create(creates);
    } catch (failure) {
      for (const model of landing)
        await access.models!.remove(own, stored.get(model.path) ?? model.path);
      throw failure;
    }
    return reply.code(201).send({
      dashboard: { id: boardId, title: dashboard.title },
      created: {
        dashboards: 1,
        charts: charts.length,
        models: landing.length,
        dataSources: createdSources,
      },
      target,
    });
  });
}
