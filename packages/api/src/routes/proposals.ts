import { randomUUID } from 'node:crypto';

import { ChartDocumentError, type ChartDefinition } from '@wechart/core';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { actorOf, recordIn } from '../audit/record';
import { USER } from '../auth/guard';
import { userOf } from '../auth/user';
import type { AuditStore } from '../repos/audit';
import { DataSourceRefused, type DataSource, type DataSourceStore } from '../repos/data-sources';
import {
  OpenProposalError,
  PROPOSAL_KINDS,
  PROPOSAL_TEXT_LIMIT,
  type Proposal,
  type ProposalKind,
  type ProposalStore,
  type ProposedItem,
  type Replaces,
} from '../repos/proposals';
import type { VersionKind, VersionStore } from '../repos/versions';
import { cubesOfChart, cubesOfDashboard, shortOf, xcubeFolderOf } from '../model/bind';
import type { LandingModel } from '../model/landing';
import { declaredIn } from '../model/split';
import type { LandingCheck, ModelLanding } from '../model/publish';
import type {
  ItemBindings,
  ProposalBindings,
  ProposalBindingStore,
} from '../repos/proposal-bindings';
import type { LandedModelFile } from '../repos/calc-resolution';
import type { XcubeAdmin } from '../xcube/client';
import { ModelRefusal, type ProposalModels } from './proposal-models';
import { withChartsRenamed } from './workspace-copy';

/**
 * Proposing (T349, AC-284; design 05 of 2026-09-27, state A): the user offers
 * an item in their own workspace to the shared folder it targets, with an
 * optional description of at most 1,000 characters. The proposal holds what
 * it would land as it is now: a dashboard with the charts it shows from the
 * workspace, a data source with its credentials still sealed (AC-298). Each
 * item names the folder it lands in and what it would replace there: the
 * item of the same kind and name (AC-288), and whether that is what it was
 * copied from (rule 75). Nothing reaches a folder until someone approves it
 * (AC-286); until then each serves what it had. An item waits in one open
 * proposal at a time, as its item or going with another's.
 *
 * With sign-in off, the single user proposes from their workspace and
 * approves their own, as with it on (T359, AC-254).
 */
interface Stored {
  readonly id: string;
  readonly body: Record<string, unknown>;
  readonly version: number;
}

export interface ProposalRoutes {
  readonly store: ProposalStore;
  readonly audit?: AuditStore;
  /** Whether proposals are there at all: not with sign-in off, as workspaces aren't. */
  readonly enabled: boolean;
  readonly documents: {
    get(kind: 'dashboard' | 'chart' | 'folder', id: string): Promise<Stored | null>;
    named(kind: 'dashboard' | 'chart', folderId: string, title: string): Promise<Stored | null>;
    /** What an approval lands through (T352): absent, nothing can be approved. */
    update?(input: {
      kind: 'dashboard' | 'chart';
      id: string;
      body: Record<string, unknown>;
      expectedVersion: number;
    }): Promise<Stored>;
    create?(input: {
      kind: 'dashboard' | 'chart';
      id: string;
      body: Record<string, unknown>;
    }): Promise<Stored>;
    remove?(kind: 'dashboard' | 'chart', id: string): Promise<boolean>;
    /** The charts local to a dashboard. */
    localTo?(dashboardId: string): Promise<Stored[]>;
  };
  /** The versions wechart keeps of what it lands (T352, AC-288). */
  readonly versions?: VersionStore;
  /**
   * A data source landed in its folder (T352): replacing the one it names,
   * or made new, its envelopes as sealed (AC-298), and landed in xcube
   * before it is stored (T442). And the one it replaces as it is now.
   */
  readonly dataSourceLanding?: {
    land(item: ProposedItem): Promise<{ id: string; version: number }>;
    current(
      id: string,
    ): Promise<{ version: number; body: Record<string, unknown>; folderId: string } | undefined>;
  };
  readonly dataSources?: Pick<DataSourceStore, 'get' | 'inFolder' | 'withSealed' | 'setOrigin'>;
  /** The request's user's own workspace root; none for one who has none (AC-277). */
  readonly ownWorkspace: (request: FastifyRequest) => Promise<string | null>;
  /** The workspace a folder is in, at any depth; null for a shared one. */
  readonly workspaceOf: (folderId: string | null) => Promise<string | null>;
  /**
   * Which shared folders the request's user may change what is in: worked
   * out once for the request, then asked per folder (T351's review).
   */
  readonly writable: (request: FastifyRequest) => Promise<(folderId: string) => boolean>;
  /** The shared folders, for a target's path from Shared (T355). */
  readonly folders?: () => Promise<
    readonly { readonly id: string; readonly title: string; readonly parentId: string | null }[]
  >;
  /**
   * Why a workspace data source can't be proposed yet, if it can't (T515,
   * AC-158): settings other than its origin's, with no passing test of them
   * still current. A restored version's draft is one. Unset, none is asked.
   */
  readonly untested?: (source: DataSource) => Promise<string | undefined>;
  /**
   * Binds a chart's or dashboard's cubes in the folder it lands in, nearest
   * first, as a save there did (T429, AC-272, AC-275). With sign-in on an
   * approval is how a shared item is published, since it is never saved in
   * place (T502, AC-278). Unset, it lands as it is.
   */
  readonly bind?: (
    kind: 'chart' | 'dashboard',
    folderId: string,
    body: Record<string, unknown>,
    /**
     * Names resolved as they will be once the proposal's models land (T451):
     * its charts bind to them before anything is written.
     */
    resolver?: Pick<XcubeAdmin, 'resolve' | 'items'>,
  ) => Promise<
    | { readonly kind: 'ok'; readonly body: Record<string, unknown> }
    | { readonly kind: 'refused'; readonly names: readonly string[] }
    | { readonly kind: 'unreachable' }
  >;
  /**
   * A shared folder's path: it, the folders above it, and the root (T537,
   * AC-371). Set with sign-in on, where a landed dashboard shows only library
   * charts kept on its folder's path; unset, it lands showing what it shows.
   */
  readonly pathOf?: (folderId: string) => Promise<ReadonlySet<string>>;
  /**
   * The workspace's models (T350, AC-285): those a dashboard or chart names
   * cubes through go in its proposal, and a model may be proposed by itself.
   * Unset, a proposal holds none.
   */
  readonly models?: ProposalModels;
  /**
   * A folder an approval lands in, deleted since it was proposed (T540,
   * AC-389): made again from wechart's record of it, with its id, its
   * deleted parents first. `there` when it is, made again or never gone;
   * `none` when there is no record to make it from; `unpushed` when it was
   * made again but xcube's folder tree could not be put. Unset, none is made
   * again.
   */
  readonly recreate?: (folderId: string) => Promise<'there' | 'none' | 'unpushed'>;
  /**
   * A proposal's models landed through xcube's changeset (T451): checked by
   * its dry run when proposed and at approval, then applied. Unset, a
   * proposal holding one is checked by nothing and can't be approved.
   */
  readonly modelLanding?: ModelLanding;
  /**
   * What each item bound to when it was proposed (T456, AC-321): an approval
   * binding one otherwise is refused. Unset, nothing is compared.
   */
  readonly bindings?: ProposalBindingStore;
  /** wechart's folder by its xcube id, to say where a name binds (T456). */
  readonly folderOfXcube?: (xcubeId: string) => Promise<string | undefined>;
  /**
   * What else waits for the user, counted with the proposals in the top bar's
   * Reviews count (R60, amending AC-287 and rule 76): the open calculation
   * requests listed to them. Unset, nothing else.
   */
  readonly alsoWaiting?: (request: FastifyRequest) => Promise<number>;
  /**
   * Once an approval has landed models (T385, AC-052): each file as it landed
   * and as it was, with the proposal's author and approver, to resolve the
   * calculation requests its measures answer. A failure here is logged and
   * never undoes the approval.
   */
  readonly afterModelsLanded?: (landed: {
    readonly author: { readonly key: string; readonly name: string };
    readonly approver: { readonly key: string; readonly name: string };
    readonly proposalId: string;
    readonly files: readonly LandedModelFile[];
  }) => Promise<unknown>;
}

const NOT_THERE = { error: 'There is no such item in your workspace.' };
const KIND_WORD: Record<ProposalKind, string> = {
  dashboard: 'dashboard',
  chart: 'chart',
  'data-source': 'data source',
  model: 'model',
};

const folderIdOf = (body: Record<string, unknown>): string | null =>
  typeof body['folderId'] === 'string' ? body['folderId'] : null;
const titleOf = (body: Record<string, unknown>): string =>
  typeof body['title'] === 'string' ? body['title'] : '';
const originIdOf = (snapshot: Record<string, unknown>): string | null => {
  const id = (snapshot['origin'] as { id?: unknown } | null | undefined)?.id;
  return typeof id === 'string' ? id : null;
};

/**
 * The charts a dashboard shows, in the order its pages show them, then any
 * its `charts` list keeps that no tile shows.
 */
function shownCharts(body: Record<string, unknown>): string[] {
  const found: string[] = [];
  const add = (id: unknown) => {
    if (typeof id === 'string' && !found.includes(id)) found.push(id);
  };
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) value.forEach(walk);
    else if (value !== null && typeof value === 'object') {
      for (const [key, each] of Object.entries(value)) {
        if (key === 'chartId') add(each);
        else if (key !== 'charts') walk(each);
      }
    }
  };
  walk(body['pages']);
  walk(Object.fromEntries(Object.entries(body).filter(([key]) => key !== 'pages')));
  const listed = body['charts'];
  if (Array.isArray(listed)) listed.forEach(add);
  return found;
}

/**
 * A proposal as the browser gets it: what each item is, where it lands, and
 * what it replaces — and whether that is what it was copied from (rule 75)
 * — never what it holds.
 */
const answerOf = (proposal: Proposal) => {
  const items = proposal.items.map(({ snapshot, ...item }) => ({
    ...item,
    replaces:
      item.replaces === null
        ? null
        : { ...item.replaces, copiedFrom: item.replaces.id === originIdOf(snapshot) },
  }));
  return { ...proposal, replaces: items[0]?.replaces ?? null, items };
};

/**
 * What an item holds, as a reviewer is shown it (T351; design 05's review
 * view): a data source's settings, with each credential only named as
 * stored, never its envelope (AC-298, rule 83).
 */
const shownSnapshot = (kind: string, snapshot: Record<string, unknown>) => {
  if (kind !== 'data-source') return snapshot;
  // Only what may be shown, named, so a key added later stays hidden until
  // it is named here (T351's review).
  const shown = Object.fromEntries(
    ['name', 'driver', 'authMethod', 'fields', 'description', 'origin']
      .filter((key) => key in snapshot)
      .map((key) => [key, snapshot[key]]),
  );
  return {
    ...shown,
    secrets: Object.keys((snapshot['sealed'] as Record<string, unknown> | null | undefined) ?? {}),
  };
};

/** Why it can't be proposed, answered; the route stops there. */
class Refused extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

/**
 * A workspace item deleted withdraws the open proposal it waits in, its own
 * or another item's it goes with (T528, AC-372; design 14's Q2): withdrawn
 * by the user deleting it, as their own rejection withdraws one (state K),
 * and recorded so. Asked before the item goes, so none is left open on an
 * item that's gone. The proposal withdrawn, or none.
 */
export async function withdrawWithDelete(
  { store, audit }: { readonly store: ProposalStore; readonly audit?: AuditStore | undefined },
  request: FastifyRequest,
  kind: ProposalKind,
  itemId: string,
  /** Why it goes: deleted alone, or with all of My workspace (T522, AC-367). */
  because: 'deleted' | 'cleared' = 'deleted',
): Promise<Proposal | null> {
  const open = await store.openFor(kind, itemId);
  if (open === null) return null;
  const user = userOf(request);
  const decided = await store.decide(open.id, {
    status: 'withdrawn',
    by: { key: user.key, name: user.name },
    reason: null,
  });
  if (decided === null) return null;
  await recordIn(
    audit,
    {
      actor: actorOf(user),
      event: 'rejection',
      folderId: decided.targetFolderId,
      item: { kind: decided.kind, id: decided.itemId, title: decided.title },
      summary:
        because === 'cleared'
          ? `Withdrew “${decided.title}”: My workspace was cleared`
          : `Withdrew “${decided.title}”: ${
              decided.kind === kind && decided.itemId === itemId
                ? 'it was'
                : `“${decided.items.find((item) => item.kind === kind && item.id === itemId)?.title ?? 'an item it holds'}”, which goes with it, was`
            } deleted from My workspace`,
      details: {
        proposalId: decided.id,
        reason: null,
        author: decided.author,
        ...(because === 'cleared' ? { cleared: true } : { deleted: { kind, id: itemId } }),
      },
    },
    request.log,
  );
  return decided;
}

export function registerProposals(app: FastifyInstance, routes: ProposalRoutes): void {
  const { store, documents, dataSources } = routes;

  /** A stored document, or said to be one this version can't read (422, as the copy route says). */
  const read = async (kind: 'dashboard' | 'chart' | 'folder', id: string) => {
    try {
      return await documents.get(kind, id);
    } catch (failure) {
      if (failure instanceof ChartDocumentError) throw new Refused(422, failure.message);
      throw failure;
    }
  };

  /** The item of the same kind and name in the folder it lands in (AC-288), not itself. */
  const replacedIn = async (
    kind: 'dashboard' | 'chart',
    item: Stored,
    landsIn: string,
  ): Promise<Replaces | null> => {
    let named: Stored | null;
    try {
      named = await documents.named(kind, landsIn, titleOf(item.body));
    } catch (failure) {
      if (failure instanceof ChartDocumentError) throw new Refused(422, failure.message);
      throw failure;
    }
    return named === null || named.id === item.id ? null : { id: named.id, version: named.version };
  };

  /** A dashboard's own chart replaces its origin, when that is the replaced dashboard's own. */
  const localReplaced = async (chart: Stored, replacedBoard: Replaces | null) => {
    const originId = originIdOf(chart.body);
    if (originId === null || replacedBoard === null) return null;
    const origin = await read('chart', originId);
    return origin !== null && origin.body['localToDashboardId'] === replacedBoard.id
      ? { id: origin.id, version: origin.version }
      : null;
  };

  /** A shared folder the user may write in, where something is to land. */
  const landing = async (writes: (folderId: string) => boolean, folderId: string, what: string) => {
    if (folderId !== 'root' && (await read('folder', folderId)) === null)
      throw new Refused(
        404,
        `${what} is to go to a folder that is no longer there. Choose another target.`,
      );
    if ((await routes.workspaceOf(folderId)) !== null)
      throw new Refused(400, `${what} is to go to a workspace folder. Choose a shared one.`);
    if (!writes(folderId))
      throw new Refused(
        403,
        `${what} is to go to a folder you can’t propose into: only its read-write members can. Choose another target.`,
      );
  };

  /** The items proposing a dashboard or chart lands, the item first. */
  const documentItems = async (
    writes: (folderId: string) => boolean,
    kind: 'dashboard' | 'chart',
    item: Stored,
    own: string,
    target: string,
  ): Promise<ProposedItem[]> => {
    const replaces = await replacedIn(kind, item, target);
    const first: ProposedItem = {
      kind,
      id: item.id,
      title: titleOf(item.body),
      version: item.version,
      snapshot: item.body,
      landsIn: target,
      replaces,
    };
    if (kind === 'chart')
      return [first, ...(await modelItems(writes, () => routes.models!.needed(own, [first])))];
    // The charts it shows from the workspace go with it: its own, and the
    // library charts in the workspace, copied or new, each to its own
    // folder. Shared ones stay as they are.
    const items = [first];
    for (const chartId of shownCharts(item.body)) {
      const chart = await read('chart', chartId);
      if (chart === null) continue;
      const title = titleOf(chart.body);
      const local = chart.body['localToDashboardId'];
      if (typeof local === 'string') {
        if (local !== item.id) {
          // Another workspace dashboard's own chart would land governed by
          // nothing in the folder (AC-276; T349's review).
          const board = await read('dashboard', local);
          if (board !== null && (await routes.workspaceOf(folderIdOf(board.body))) === own)
            throw new Refused(
              409,
              `It shows “${title}”, a chart of another dashboard in your workspace. Show a copy of it instead.`,
            );
          continue;
        }
        items.push({
          kind: 'chart',
          id: chart.id,
          title,
          version: chart.version,
          snapshot: chart.body,
          landsIn: target,
          replaces: await localReplaced(chart, replaces),
        });
        continue;
      }
      if ((await routes.workspaceOf(folderIdOf(chart.body))) !== own) continue;
      const chartTarget = chart.body['targetFolderId'];
      if (typeof chartTarget !== 'string' || chartTarget === '')
        throw new Refused(
          409,
          `It shows “${title}”, which names no folder to go to. Give it one, or show another chart.`,
        );
      // Each folder it lands in must be one its author may propose into
      // (T349's review): a chart bound elsewhere doesn't ride in unchecked.
      await landing(writes, chartTarget, `“${title}”, which it shows,`);
      items.push({
        kind: 'chart',
        id: chart.id,
        title,
        version: chart.version,
        snapshot: chart.body,
        landsIn: chartTarget,
        replaces: await replacedIn('chart', chart, chartTarget),
      });
    }
    return [...items, ...(await modelItems(writes, () => routes.models!.needed(own, items)))];
  };

  /**
   * The workspace models that go with it (T350, AC-285), each to a folder
   * its author may propose into: none where the workspace holds no models.
   */
  const modelItems = async (
    writes: (folderId: string) => boolean,
    find: () => Promise<ProposedItem[] | undefined>,
  ): Promise<ProposedItem[]> => {
    if (routes.models === undefined) return [];
    let found: ProposedItem[];
    try {
      found = (await find()) ?? [];
    } catch (failure) {
      if (failure instanceof ModelRefusal) throw new Refused(409, failure.message);
      throw failure;
    }
    for (const model of found)
      await landing(writes, model.landsIn, `“${model.title}”, which goes with it,`);
    return found;
  };

  /**
   * Each credential a proposed data source holds, against the one it
   * replaces (T356; design 05, state H; rule 83): "unchanged" where its
   * envelope is the very one the folder holds (a copy carries it as it is,
   * under a new revision), "replaced" where it was entered again and sealed
   * afresh, "new" where it replaces nothing. Envelopes are compared, never
   * opened, and never answered.
   */
  const secretChangesOf = async (
    snapshot: Record<string, unknown>,
    replacesId: string | undefined,
  ): Promise<Record<string, 'unchanged' | 'replaced' | 'new'>> => {
    const proposed = (snapshot['sealed'] as Record<string, unknown> | undefined) ?? {};
    const current =
      replacesId === undefined
        ? undefined
        : (await dataSources?.withSealed(replacesId))?.landed.sealed;
    const same = (a: unknown, b: unknown) =>
      a !== undefined && b !== undefined && JSON.stringify(a) === JSON.stringify(b);
    return Object.fromEntries(
      Object.entries(proposed).map(([field, envelope]) => [
        field,
        current === undefined ? 'new' : same(envelope, current[field]) ? 'unchanged' : 'replaced',
      ]),
    );
  };

  /** The version of the item a proposal replaces, as its folder has it now; null when gone. */
  const versionNowOf = async (kind: ProposalKind, id: string | undefined) => {
    if (id === undefined) return null;
    if (kind === 'data-source') return (await dataSources?.get(id))?.version ?? null;
    if (kind === 'model') return (await routes.models?.current(id))?.version ?? null;
    return (await read(kind, id))?.version ?? null;
  };

  /** The file a model item replaces, as its folder has it now. */
  const currentModelOf = async (id: string) => {
    const current = await routes.models?.current(id);
    return current === undefined ? {} : { current };
  };

  /** A folder's path from Shared, a name a step: `['Shared', 'Sales', 'EMEA']`. */
  const pathPartsOf = async (id: string) => {
    const names: string[] = [];
    for (let at: string | null = id; at !== null && at !== 'root' && names.length < 64;) {
      const folder = await read('folder', at);
      if (folder === null) break;
      names.unshift(titleOf(folder.body) || at);
      at = folderIdOf(folder.body);
    }
    // A folder deleted since is named so, never taken for Shared (T356's review).
    if (names.length === 0 && id !== 'root') return ['Shared', 'A deleted folder'];
    return ['Shared', ...names];
  };
  /** A folder's path below Shared, as the audit trail names it ("Sales / EMEA"). */
  const pathOf = async (id: string) => {
    if (id === 'root') return 'Shared';
    return (await pathPartsOf(id)).slice(1).join(' / ') || id;
  };

  /**
   * A dashboard's or a chart's names as bound in the folder it lands in
   * (T456): each cube it names, by its short name, to the full name bound.
   */
  const documentBindingsOf = (kind: ProposalKind, body: Record<string, unknown>): ItemBindings => {
    const chart = body['chart'] as ChartDefinition | undefined;
    const names =
      kind === 'dashboard'
        ? cubesOfDashboard(body)
        : typeof chart?.source?.cube === 'string' && chart.source.cube !== ''
          ? [cubesOfChart(chart).source, ...cubesOfChart(chart).others]
          : [];
    return { bindings: Object.fromEntries(names.map((name) => [shortOf(name), name])) };
  };

  /**
   * What each item would bind to when proposed (T456, AC-321), to hold an
   * approval to: a model's, by the dry run of its changeset; a dashboard's
   * or a chart's, as an approval binds it, with the proposal's models as
   * they would land. One that can't be bound now is held to nothing.
   */
  const bindingsWhenProposed = async (
    items: readonly ProposedItem[],
    landing: Extract<LandingCheck, { kind: 'checked' }> | undefined,
  ): Promise<ProposalBindings> => {
    const bound: Record<string, ItemBindings> = {};
    const board = items.find((item) => item.kind === 'dashboard');
    for (const item of items) {
      if (item.kind === 'model') {
        const model = landing?.bound.get(item.id);
        if (model !== undefined) bound[`${item.kind}/${item.id}`] = model;
        continue;
      }
      if ((item.kind !== 'dashboard' && item.kind !== 'chart') || routes.bind === undefined)
        continue;
      const local = board !== undefined && item.snapshot['localToDashboardId'] === board.id;
      const at = await routes.bind(
        item.kind,
        local ? board.landsIn : item.landsIn,
        item.snapshot,
        landing?.resolver,
      );
      if (at.kind === 'ok')
        bound[`${item.kind}/${item.id}`] = documentBindingsOf(item.kind, at.body);
    }
    return bound;
  };

  /** A name an item would bind otherwise: to the full name it bound when proposed, and now. */
  interface Rebinding {
    readonly name: string;
    readonly was: string | null;
    readonly now: string | null;
  }
  interface Rebound {
    readonly item: ProposedItem;
    readonly names: readonly Rebinding[];
    readonly dataSource?: { readonly was: string | null; readonly now: string | null };
  }

  /**
   * The items an approval would bind otherwise than when they were proposed
   * (T456, AC-321): each name bound to another full name, or to none, and a
   * cube's data source, where both say one. An item with nothing held to
   * (proposed before T456, or not bound then) is held to nothing.
   */
  const reboundIn = (
    recorded: ProposalBindings | null,
    now: readonly { readonly item: ProposedItem; readonly bound: ItemBindings | undefined }[],
  ): Rebound[] =>
    recorded === null
      ? []
      : now.flatMap(({ item, bound }): Rebound[] => {
          const was = recorded[`${item.kind}/${item.id}`];
          if (was === undefined || bound === undefined) return [];
          const names = [...new Set([...Object.keys(was.bindings), ...Object.keys(bound.bindings)])]
            .sort()
            .flatMap((name): Rebinding[] => {
              const before = was.bindings[name] ?? null;
              const after = bound.bindings[name] ?? null;
              return before === after ? [] : [{ name, was: before, now: after }];
            });
          const source =
            'dataSource' in was && 'dataSource' in bound && was.dataSource !== bound.dataSource
              ? { was: was.dataSource ?? null, now: bound.dataSource ?? null }
              : undefined;
          return names.length === 0 && source === undefined
            ? []
            : [{ item, names, ...(source === undefined ? {} : { dataSource: source }) }];
        });

  /** Where a full name binds, as a refusal says it: "the one in Sales / EMEA". */
  const whereBound = async (full: string) => {
    const xcubeId = xcubeFolderOf(full);
    if (xcubeId === null) return 'the one in Shared';
    const folderId = await routes.folderOfXcube?.(xcubeId);
    return folderId === undefined
      ? 'one in a folder no longer there'
      : `the one in ${await pathOf(folderId)}`;
  };

  /**
   * An approval refused for binding its items otherwise than when they were
   * proposed (T456, AC-321; R52, "a submitted item is frozen"), naming each
   * and both bindings. Its author withdraws it and proposes it again.
   */
  const reboundRefusal = async (rebound: readonly Rebound[]) => {
    const sentences = await Promise.all(
      rebound.map(async ({ item, names, dataSource }) => {
        const clauses = await Promise.all(
          names.map(async ({ name, was, now }) =>
            now === null
              ? `“${name}” would bind to nothing, not ${await whereBound(was!)}`
              : was === null
                ? `“${name}” would be ${await whereBound(now)}, though it bound to nothing then`
                : `“${name}” would be ${await whereBound(now)}, not ${await whereBound(was)}`,
          ),
        );
        if (dataSource !== undefined) {
          const sourceOf = async (full: string | null) =>
            full === null
              ? 'the one it extends'
              : `“${shortOf(full)}”, ${(await whereBound(full)).replace(/^the one /, '')}`;
          clauses.push(
            `its data source would be ${await sourceOf(dataSource.now)}, not ${await sourceOf(dataSource.was)}`,
          );
        }
        return `“${item.title}” would bind otherwise than when it was proposed: ${clauses.join('; ')}.`;
      }),
    );
    return new Refused(
      409,
      `${sentences.join(' ')} Nothing was approved; its author can withdraw it and propose it again.`,
      {
        rebound: rebound.map(({ item, names, dataSource }) => ({
          kind: item.kind,
          id: item.id,
          title: item.title,
          names,
          ...(dataSource === undefined ? {} : { dataSource }),
        })),
      },
    );
  };

  /**
   * What the request's user may do with a proposal (T351, AC-286; a small
   * decision of 2026-09-28, overturnable):
   * - `approve`: a Super-Admin, or a read-write member of every folder it
   *   lands in — the author too, who approves their own as a member, never
   *   into a folder they may no longer write; a library chart a dashboard
   *   shows may land in its own, and no folder's content changes without one
   *   of its members (T349's review).
   * - `reject`: whoever may approve, and its author, whose rejection
   *   withdraws it (design 05, state K) and lands nothing.
   * - `see`: either.
   * A decided proposal is decided: neither is offered (T351's review).
   */
  const rightsOn = async (request: FastifyRequest, proposal: Proposal) => {
    const user = userOf(request);
    const writes = await routes.writable(request);
    const member = user.superAdmin || proposal.items.every((item) => writes(item.landsIn));
    const author = proposal.author.key === user.key;
    const open = proposal.status === 'open';
    return {
      see: member || author,
      approve: open && member,
      reject: open && (member || author),
      author,
    };
  };

  /**
   * A proposal, as its deciders and its author open it (T351; design 05's
   * review view): what each item holds, what they may do with it, and
   * whether it is theirs. No one else finds it: 404, as for one that isn't
   * there.
   */
  app.get('/api/proposals/:id', USER, async (request, reply) => {
    if (!routes.enabled) return reply.code(404).send({ error: 'Proposals need sign-in.' });
    const { id } = request.params as { id: string };
    const proposal = await store.get(id);
    const rights = proposal === null ? null : await rightsOn(request, proposal);
    if (proposal === null || rights === null || !rights.see)
      return reply.code(404).send({ error: 'There is no such proposal.' });
    const answer = answerOf(proposal);
    // A folder's model file is shown to whoever may change it: never to an
    // author who has since lost that (T350's review).
    const user = userOf(request);
    const writes = await routes.writable(request);
    const items = [];
    for (const [at, item] of answer.items.entries()) {
      const snapshot = proposal.items[at]!.snapshot;
      items.push({
        ...item,
        snapshot: shownSnapshot(item.kind, snapshot),
        // Where it lands, for the review view (T356).
        landsInPath: await pathPartsOf(item.landsIn),
        // The version the folder has now: it may have moved on since (design
        // 05, pin 6). An approval replaces that one.
        replacesNow: await versionNowOf(item.kind, item.replaces?.id),
        // Set against the folder's while it waits: once decided, what it
        // replaced may be what it landed as (T356's review).
        ...(item.kind === 'data-source' && proposal.status === 'open'
          ? { secretChanges: await secretChangesOf(snapshot, item.replaces?.id) }
          : {}),
        // A model's file as its folder has it now, for its YAML diff (T350;
        // design 05, state G); none for a new one, or once decided.
        ...(item.kind === 'model' &&
        item.replaces !== null &&
        proposal.status === 'open' &&
        (user.superAdmin || writes(item.landsIn))
          ? await currentModelOf(item.replaces.id)
          : {}),
      });
    }
    return {
      ...answer,
      items,
      targetPath: await pathPartsOf(proposal.targetFolderId),
      mayApprove: rights.approve,
      mayReject: rights.reject,
      yours: rights.author,
    };
  });

  /**
   * The Reviews page's lists and the top bar's count (T355, AC-287; design
   * 05, states C, D and E). "To review": every open proposal the user may
   * decide, as T351's `rightsOn` says, their own included. "My proposals":
   * theirs, in every state. Each says what it is, where it goes, who, when
   * and why, and never what it holds.
   */
  const toDecide = async (request: FastifyRequest) => {
    const user = userOf(request);
    const writes = await routes.writable(request);
    // T351's `rightsOn`, for every open proposal at once.
    return (await store.open()).filter(
      (proposal) => user.superAdmin || proposal.items.every((item) => writes(item.landsIn)),
    );
  };

  /**
   * The top bar's count alone (T355's review): what "To review" lists,
   * counted, and the open calculation requests listed to the user (R60).
   */
  app.get('/api/reviews/count', USER, async (request, reply) => {
    if (!routes.enabled) return reply.code(404).send({ error: 'Proposals need sign-in.' });
    const [proposals, requests] = await Promise.all([
      toDecide(request),
      routes.alsoWaiting?.(request) ?? Promise.resolve(0),
    ]);
    return { waiting: proposals.length + requests };
  });

  app.get('/api/reviews', USER, async (request, reply) => {
    if (!routes.enabled) return reply.code(404).send({ error: 'Proposals need sign-in.' });
    const user = userOf(request);
    const tree = (await routes.folders?.()) ?? [];
    const byId = new Map(tree.map((folder) => [folder.id, folder]));
    const pathOf = (folderId: string) => {
      const path: string[] = [];
      const seen = new Set<string>();
      for (let at = byId.get(folderId); at !== undefined && !seen.has(at.id);) {
        seen.add(at.id);
        if (at.id !== 'root') path.unshift(at.title);
        at = at.parentId === null ? undefined : byId.get(at.parentId);
      }
      // A target deleted since, named as such rather than by its id.
      return [
        'Shared',
        ...(path.length === 0 && folderId !== 'root' ? ['A deleted folder'] : path),
      ];
    };
    const rowOf = async (proposal: Proposal) => {
      const { replaces } = answerOf(proposal);
      const landed =
        proposal.status === 'approved'
          ? ((await routes.versions?.landedBy(proposal.id)) ?? []).find(
              (version) => version.kind === proposal.kind,
            )
          : undefined;
      return {
        id: proposal.id,
        kind: proposal.kind,
        itemId: proposal.itemId,
        title: proposal.title,
        targetFolderId: proposal.targetFolderId,
        targetPath: pathOf(proposal.targetFolderId),
        author: proposal.author,
        description: proposal.description,
        proposedAt: proposal.proposedAt,
        status: proposal.status,
        yours: proposal.author.key === user.key,
        // What goes with it, a dashboard's own charts being part of it.
        includes: proposal.items
          .slice(1)
          .filter((item) => item.snapshot['localToDashboardId'] !== proposal.itemId)
          .map((item) => ({ kind: item.kind, title: item.title })),
        // Every item in it, so an item that went with another's is found (T358).
        items: proposal.items.map((item) => ({ kind: item.kind, id: item.id })),
        replaces,
        decision: proposal.decision,
        landedVersion: landed?.version ?? null,
      };
    };
    // One at a time, so a long list never takes every database connection.
    const rowsOf = async (proposals: readonly Proposal[]) => {
      const rows = [];
      for (const proposal of proposals) rows.push(await rowOf(proposal));
      return rows;
    };
    return {
      toReview: await rowsOf(await toDecide(request)),
      mine: await rowsOf(await store.byAuthor(user.key)),
    };
  });

  /**
   * An item's latest proposal, for the band on its author's item (T353,
   * AC-290; design 05, state M): waiting, or decided with who, when and the
   * reason. The item is its author's, so the answer is too: anyone else
   * finds none.
   */
  app.get('/api/proposals', USER, async (request, reply) => {
    if (!routes.enabled) return reply.code(404).send({ error: 'Proposals need sign-in.' });
    const { kind, itemId } = request.query as { kind?: unknown; itemId?: unknown };
    if (
      !(PROPOSAL_KINDS as readonly unknown[]).includes(kind) ||
      typeof itemId !== 'string' ||
      itemId === ''
    )
      return reply
        .code(400)
        .send({ error: 'Name the item whose proposal to show: ?kind=&itemId=.' });
    const latest = await store.latestFor(kind as ProposalKind, itemId);
    if (latest === null || latest.author.key !== userOf(request).key)
      return reply.code(404).send({ error: 'It has not been proposed.' });
    // With its target's path, and where each item lands, for the band on the
    // item: one that went with another's proposal lands in its own (T358).
    const answer = answerOf(latest);
    const items = [];
    for (const item of answer.items)
      items.push({ ...item, landsInPath: await pathPartsOf(item.landsIn) });
    return { ...answer, items, targetPath: await pathPartsOf(latest.targetFolderId) };
  });

  /**
   * Its author dismisses a rejection's band on their item (T358; design 05,
   * state M; R42.1): gone on every device until the item is proposed again.
   * Anyone else finds no such proposal; one not rejected answers 409.
   */
  app.post('/api/proposals/:id/dismiss', USER, async (request, reply) => {
    if (!routes.enabled) return reply.code(404).send({ error: 'Proposals need sign-in.' });
    const { id } = request.params as { id: string };
    const user = userOf(request);
    const proposal = await store.get(id);
    if (proposal === null || proposal.author.key !== user.key)
      return reply.code(404).send({ error: 'There is no such proposal.' });
    if (proposal.status !== 'rejected')
      return reply.code(409).send({ error: 'Only a rejection’s band is dismissed.' });
    const dismissed = await store.dismiss(id, user.key);
    return dismissed === null
      ? reply.code(409).send({ error: 'Only a rejection’s band is dismissed.' })
      : answerOf(dismissed);
  });

  /**
   * Rejecting a proposal (T353, AC-290; design 05, states J and K): its
   * folder stays as it was and the work in its author's workspace, with the
   * decider's reason of at most 1,000 characters. Its author's own rejection
   * withdraws it. Its deciders' alone (T351); anyone else finds no such
   * proposal. A decided one is decided.
   */
  app.post('/api/proposals/:id/reject', USER, async (request, reply) => {
    if (!routes.enabled) return reply.code(404).send({ error: 'Proposals need sign-in.' });
    const { id } = request.params as { id: string };
    const sent = (request.body as { reason?: unknown } | undefined)?.reason;
    // Text Postgres can hold: no NUL character (T353's review).
    if ((sent !== undefined && sent !== null && typeof sent !== 'string') || /\0/.test(`${sent}`))
      return reply.code(400).send({ error: 'A reason is text.' });
    const reason = typeof sent === 'string' && sent.trim() !== '' ? sent : null;
    // Code points, as the description's are counted; never cut.
    const length = reason === null ? 0 : [...reason].length;
    if (length > PROPOSAL_TEXT_LIMIT)
      return reply.code(400).send({
        error: `A reason is at most 1,000 characters: this one has ${length.toLocaleString('en-GB')}.`,
      });
    const proposal = await store.get(id);
    const rights = proposal === null ? null : await rightsOn(request, proposal);
    if (proposal === null || rights === null || !rights.see)
      return reply.code(404).send({ error: 'There is no such proposal.' });
    if (!rights.reject)
      return reply.code(409).send({
        error:
          proposal.decision === null
            ? 'You can’t reject this proposal.'
            : `It was decided already, by ${proposal.decision.by.name}.`,
      });
    const user = userOf(request);
    // An author rejecting their own withdraws it (state K).
    const withdrawn = rights.author;
    const decided = await store.decide(proposal.id, {
      status: withdrawn ? 'withdrawn' : 'rejected',
      by: { key: user.key, name: user.name },
      reason,
    });
    if (decided === null) {
      // Another decision came first, between the read and this one.
      const first = (await store.get(proposal.id))?.decision;
      return reply.code(409).send({
        error: `It was decided already${first == null ? '' : `, by ${first.by.name}`}.`,
      });
    }
    await recordIn(
      routes.audit,
      {
        actor: actorOf(user),
        event: 'rejection',
        folderId: decided.targetFolderId,
        item: { kind: decided.kind, id: decided.itemId, title: decided.title },
        summary: withdrawn
          ? `Withdrew “${decided.title}”`
          : `Rejected “${decided.title}”${reason === null ? '' : `: ${reason}`}`,
        details: { proposalId: decided.id, reason, author: decided.author },
      },
      request.log,
    );
    return answerOf(decided);
  });

  /** A body as it lands in a folder: no target, no origin; where it is, whose. */
  const landedBody = (
    snapshot: Record<string, unknown>,
    place: { folderId?: string; localTo?: string },
    owner: unknown,
  ) => {
    const {
      targetFolderId: _target,
      origin: _origin,
      folderId: _folder,
      localToDashboardId: _local,
      owner: _owner,
      ...rest
    } = snapshot;
    void [_target, _origin, _folder, _local, _owner];
    return {
      ...rest,
      ...(place.folderId === undefined ? {} : { folderId: place.folderId }),
      ...(place.localTo === undefined ? {} : { localToDashboardId: place.localTo }),
      ...(typeof owner === 'string' ? { owner } : {}),
    };
  };

  /**
   * Lands an approved proposal's items (T352, AC-288): each in its folder,
   * over the item it names or as a new one; a dashboard showing the folder's
   * charts, never the workspace's. The version each replaces, and the new
   * one, are kept (AC-289's history). Answers what landed, by item.
   */
  const land = async (
    proposal: Proposal,
    approver: { key: string; name: string },
    request: FastifyRequest,
    /** Each model file it lands, as landed and as it was (T385), gathered here. */
    landedFiles: LandedModelFile[] = [],
  ) => {
    const docs = documents as Required<ProposalRoutes['documents']>;
    const landed: { kind: ProposalKind; id: string; version: number; from: ProposedItem }[] = [];
    const keep = async (
      kind: VersionKind,
      itemId: string,
      version: number,
      content: Record<string, unknown>,
      folderId: string,
      title: string,
      authored: { author: Proposal['author']; approver: typeof approver } | null,
    ) =>
      routes.versions?.keep({
        kind,
        itemId,
        version,
        content,
        folderId,
        title,
        author: authored?.author ?? null,
        approver: authored?.approver ?? null,
        description: authored === null ? null : proposal.description,
        proposalId: authored === null ? null : proposal.id,
      });

    // A folder it lands in, deleted since, made again first (T540, AC-389).
    if (routes.recreate !== undefined)
      for (const folderId of new Set(proposal.items.map((item) => item.landsIn))) {
        const back = await routes.recreate(folderId);
        if (back === 'none')
          throw new Refused(
            409,
            'Its folder was deleted, and wechart has no record of it to make it again. Reject it, and propose it to another folder.',
          );
        if (back === 'unpushed')
          throw new Refused(
            503,
            'Its folder was made again, but Cube’s folder tree could not be updated, so nothing was approved. Approve it again in a moment.',
          );
      }

    /**
     * A data source first: landed as it is, envelopes and all (AC-298), and
     * the rest checked against it. A refused approval leaves it landed
     * (AC-321; R52, "Land data sources first"), its version kept, so
     * approving again lands over it rather than beside it; and the
     * workspace's is a copy of it at once.
     */
    const proposed = proposal.items.find((item) => item.kind === 'data-source');
    if (proposed !== undefined) {
      const lander = routes.dataSourceLanding;
      if (lander === undefined) throw new Refused(503, 'Data sources can’t be landed here.');
      // What this proposal landed before its approval was refused, if it did
      // (T451's review): never another data source of the folder.
      const before = ((await routes.versions?.landedBy(proposal.id)) ?? []).find(
        (version) => version.kind === 'data-source',
      );
      const again = before === undefined ? undefined : await lander.current(before.itemId);
      const source: ProposedItem =
        proposed.replaces === null && before !== undefined && again !== undefined
          ? { ...proposed, replaces: { id: before.itemId, version: again.version } }
          : proposed;
      const current =
        source.replaces === null ? undefined : await lander.current(source.replaces.id);
      const at = await lander.land(source);
      // The one it replaced, kept once it is replaced: a refusal keeps nothing.
      if (current !== undefined)
        await keep(
          'data-source',
          source.replaces!.id,
          current.version,
          { body: current.body },
          current.folderId,
          source.title,
          null,
        );
      await keep(
        'data-source',
        at.id,
        at.version,
        { body: source.snapshot },
        source.landsIn,
        source.title,
        { author: proposal.author, approver },
      );
      landed.push({ kind: 'data-source', id: at.id, version: at.version, from: source });
      await routes.dataSources
        ?.setOrigin(source.id, { id: at.id, version: at.version, folderId: source.landsIn })
        .catch((failure: unknown) => {
          request.log.warn({ err: failure }, 'a landed data source’s origin was not updated');
        });
      if (proposal.items.every((item) => item.kind === 'data-source')) return landed;
    }

    // Dashboards and charts: every landed id first, so each shows the folder's.
    const board = proposal.items.find((item) => item.kind === 'dashboard');
    const idOf = new Map(
      proposal.items.map((item) => [item.id, item.replaces?.id ?? randomUUID()] as const),
    );
    const boardId = board === undefined ? undefined : idOf.get(board.id)!;
    const isLocal = (item: ProposedItem) =>
      board !== undefined && item.snapshot['localToDashboardId'] === board.id;
    const isDocument = (item: ProposedItem) => item.kind === 'dashboard' || item.kind === 'chart';

    // The versions replaced, as they are now: a dashboard with its own charts.
    const partsOf = async (dashboardId: string) =>
      (await docs.localTo(dashboardId)).map((chart) => ({ id: chart.id, body: chart.body }));
    // Kept once it is certain to land: a refused binding keeps nothing (T502's review).
    const keepReplaced = async () => {
      for (const item of proposal.items) {
        if (item.replaces === null || isLocal(item) || !isDocument(item)) continue;
        const kind = item.kind as 'dashboard' | 'chart';
        const current = await docs.get(kind, item.replaces.id);
        if (current === null) continue;
        await keep(
          kind,
          current.id,
          current.version,
          { body: current.body, parts: kind === 'dashboard' ? await partsOf(current.id) : [] },
          item.landsIn,
          titleOf(current.body),
          null,
        );
      }
    };

    // Charts first, then the dashboard that shows them.
    const renamed = new Map(
      [...idOf].filter(
        ([from]) =>
          from !== board?.id &&
          proposal.items.some((item) => item.id === from && item.kind === 'chart'),
      ),
    );
    const write = async (item: ProposedItem, body: Record<string, unknown>) => {
      const kind = item.kind as 'dashboard' | 'chart';
      const id = idOf.get(item.id)!;
      const current = item.replaces === null ? null : await docs.get(kind, id);
      const written =
        current === null
          ? await docs.create({ kind, id, body })
          : await docs.update({ kind, id, body, expectedVersion: current.version });
      landed.push({ kind, id, version: written.version, from: item });
      return { current, written };
    };
    const ordered = [
      ...proposal.items.filter((item) => item.kind === 'chart'),
      ...(board === undefined ? [] : [board]),
    ];
    /**
     * Copy at approval (T537, AC-371): the landed dashboard shows only
     * library charts kept on its folder's path. Any other it shows, a shared
     * one or one of the proposal's landing in another folder, becomes a chart
     * of its own, bound in its folder, as a save in the workspace makes one
     * (T527). The one it copies stays as it is, or lands as proposed.
     */
    const copies: { id: string; body: Record<string, unknown> }[] = [];
    const ownCopies = async (
      dashboard: ProposedItem,
      body: Record<string, unknown>,
      resolver: Pick<XcubeAdmin, 'resolve' | 'items'> | undefined,
    ) => {
      if (routes.pathOf === undefined) return body;
      const path = await routes.pathOf(dashboard.landsIn);
      const going = new Map(proposal.items.map((item) => [idOf.get(item.id)!, item]));
      const renames = new Map<string, string>();
      for (const chartId of shownCharts(body)) {
        const item = going.get(chartId);
        let content: Record<string, unknown>;
        let kept: string | null;
        if (item !== undefined) {
          // Its own charts land with it; a library chart, in its own folder.
          if (item.kind !== 'chart' || isLocal(item)) continue;
          content = item.snapshot;
          kept = item.landsIn;
        } else {
          // One this build can't read is left as it is, as a save leaves it
          // (T527); it doesn't refuse the approval (T537's review).
          const chart = await documents.get('chart', chartId).catch((failure: unknown) => {
            if (failure instanceof ChartDocumentError) return null;
            throw failure;
          });
          // Another dashboard's own chart is none of this one's to copy.
          if (chart === null || typeof chart.body['localToDashboardId'] === 'string') continue;
          content = chart.body;
          kept = folderIdOf(chart.body);
        }
        if (kept === null || path.has(kept)) continue;
        const copy = landedBody(content, { localTo: boardId! }, body['owner']);
        const bound =
          routes.bind === undefined
            ? ({ kind: 'ok', body: copy } as const)
            : await routes.bind('chart', dashboard.landsIn, copy, resolver);
        const title = item === undefined ? titleOf(content) : item.title;
        if (bound.kind === 'refused')
          throw new Refused(
            422,
            `“${title}” is kept off the path of “${dashboard.title}”, and its own copy can’t be bound there: no folder on its path holds ${bound.names.map((name) => `“${name}”`).join(', ')}. Nothing was approved.`,
            { names: bound.names },
          );
        if (bound.kind === 'unreachable')
          throw new Refused(
            502,
            `xcube could not be asked where the cubes of “${title}” are, so nothing was approved.`,
          );
        const id = randomUUID();
        renames.set(chartId, id);
        copies.push({ id, body: bound.body });
      }
      return renames.size === 0
        ? body
        : (withChartsRenamed(body, renames) as Record<string, unknown>);
    };

    /**
     * Each bound in its folder first (T502): a name its path doesn't hold
     * refuses the approval before anything is written. With the proposal's
     * models, as their names will resolve once they land (T451).
     */
    const prepareDocuments = async (
      resolver: Pick<XcubeAdmin, 'resolve' | 'items'> | undefined,
    ) => {
      const bodies: { item: ProposedItem; body: Record<string, unknown> }[] = [];
      for (const item of ordered) {
        const replacedOwner =
          item.replaces === null
            ? proposal.author.key
            : (await docs.get(item.kind as 'dashboard' | 'chart', item.replaces.id))?.body['owner'];
        const body =
          item === board
            ? await ownCopies(
                item,
                landedBody(
                  withChartsRenamed(item.snapshot, renamed) as Record<string, unknown>,
                  { folderId: item.landsIn },
                  replacedOwner,
                ),
                resolver,
              )
            : isLocal(item)
              ? landedBody(item.snapshot, { localTo: boardId! }, replacedOwner)
              : landedBody(item.snapshot, { folderId: item.landsIn }, replacedOwner);
        const folder = isLocal(item) ? board!.landsIn : item.landsIn;
        const bound =
          routes.bind === undefined
            ? ({ kind: 'ok', body } as const)
            : await routes.bind(item.kind as 'dashboard' | 'chart', folder, body, resolver);
        if (bound.kind === 'refused')
          throw new Refused(
            422,
            `No folder on the path of “${item.title}” holds ${bound.names.map((name) => `“${name}”`).join(', ')}, so nothing was approved.`,
            { names: bound.names },
          );
        if (bound.kind === 'unreachable')
          throw new Refused(
            502,
            `xcube could not be asked where the cubes of “${item.title}” are, so nothing was approved.`,
          );
        bodies.push({ item, body: bound.body });
      }
      return bodies;
    };

    const writeDocuments = async (
      bodies: readonly { item: ProposedItem; body: Record<string, unknown> }[],
    ) => {
      await keepReplaced();
      // Its own copies first, then the charts and the dashboard showing them (T537).
      for (const copy of copies) await docs.create({ kind: 'chart', id: copy.id, body: copy.body });
      const from = landed.length;
      for (const { item, body } of bodies) await write(item, body);
      // The replaced dashboard's own charts it no longer shows go: its kept
      // version holds them.
      if (boardId !== undefined) {
        const shown = new Set([
          ...proposal.items.filter(isLocal).map((item) => idOf.get(item.id)!),
          ...copies.map((copy) => copy.id),
        ]);
        for (const chart of await docs.localTo(boardId))
          if (!shown.has(chart.id)) await docs.remove('chart', chart.id);
      }

      // The new versions, kept: a dashboard with its charts as they landed.
      for (const at of landed.slice(from)) {
        if (at.kind === 'chart' && isLocal(at.from)) continue;
        const kind = at.kind as 'dashboard' | 'chart';
        const stored = (await docs.get(kind, at.id))!;
        await keep(
          kind,
          at.id,
          at.version,
          { body: stored.body, parts: kind === 'dashboard' ? await partsOf(at.id) : [] },
          at.from.landsIn,
          titleOf(stored.body),
          { author: proposal.author, approver },
        );
      }
    };

    /**
     * Held to what it bound to when proposed (T456, AC-321): an item that
     * would bind otherwise refuses the approval before anything is written,
     * save the data sources landed first (R52).
     */
    const recorded = (await routes.bindings?.get(proposal.id)) ?? null;
    const documentsBound = (bodies: Awaited<ReturnType<typeof prepareDocuments>>) =>
      bodies.map(({ item, body }) => ({ item, bound: documentBindingsOf(item.kind, body) }));

    // Models next, through xcube's changeset, then what binds to them (T451).
    const models = proposal.items.filter((item) => item.kind === 'model');
    if (models.length === 0) {
      const bodies = await prepareDocuments(undefined);
      const rebound = reboundIn(recorded, documentsBound(bodies));
      if (rebound.length > 0) throw await reboundRefusal(rebound);
      await writeDocuments(bodies);
      return landed;
    }
    const lander = routes.modelLanding;
    if (lander === undefined)
      throw new Refused(503, 'Models can’t be landed here, so nothing was approved.');
    await lander.inTurn(async () => {
      const checked = await lander.check(request, {
        models: models.map(landingModelOf),
        phase: 'approval',
        record: true,
        proposalId: proposal.id,
        title: proposal.title,
        targetFolderId: proposal.targetFolderId,
      });
      if (checked.kind === 'refused') throw await refusedBy(checked);
      const bodies = await prepareDocuments(checked.resolver);
      const rebound = reboundIn(recorded, [
        ...models.map((item) => ({ item, bound: checked.bound.get(item.id) })),
        ...documentsBound(bodies),
      ]);
      if (rebound.length > 0) throw await reboundRefusal(rebound);
      const files = await checked.commit();
      for (const write of checked.writes) {
        const item = models.find((each) => each.id === write.fileId)!;
        const file = files.get(write.fileId);
        if (file === undefined) continue;
        // The one it replaced, kept now it is replaced; then the one landed (AC-288).
        if (write.over !== null)
          await keep(
            'model',
            write.over.id,
            write.over.version,
            { path: write.over.path, content: write.over.content },
            write.folderId,
            write.over.path,
            null,
          );
        await keep(
          'model',
          file.id,
          file.version,
          { path: file.path, content: file.content },
          write.folderId,
          file.path,
          { author: proposal.author, approver },
        );
        landed.push({ kind: 'model', id: file.id, version: file.version, from: item });
        landedFiles.push({
          folderId: write.folderId,
          path: file.path,
          before: write.over?.content ?? null,
          after: file.content,
        });
      }
      await writeDocuments(bodies);
    });
    return landed;
  };

  /** A proposed model as it lands: its file, in the folder it lands in (T451). */
  const landingModelOf = (item: ProposedItem): LandingModel => {
    const origin = item.snapshot['origin'] as { id?: unknown } | null | undefined;
    return {
      fileId: item.id,
      title: item.title,
      folderId: item.landsIn,
      path: String(item.snapshot['path']),
      content: String(item.snapshot['content']),
      originId: typeof origin?.id === 'string' ? origin.id : null,
    };
  };

  /**
   * A landing's refusal, its breaks each with its folder's path from Shared
   * for the review view to say (design 05, state L).
   */
  const refusedBy = async (checked: Extract<LandingCheck, { kind: 'refused' }>) => {
    const { error, errors, ...rest } = checked.body as {
      error: string;
      errors?: readonly { folderId?: string }[];
    };
    return new Refused(checked.status, error, {
      ...rest,
      ...(errors === undefined
        ? {}
        : {
            errors: await Promise.all(
              errors.map(async (each) => ({
                ...each,
                folderPath: await pathPartsOf(each.folderId ?? 'root'),
              })),
            ),
          }),
    });
  };

  /**
   * The workspace items stay, each now in its folder as the version it
   * landed as (design 04): a copy of it, so "Edit in my workspace" finds it
   * (T352's review). Once everything has landed, never a reason to decide
   * again: one the author is saving meanwhile keeps its old origin.
   */
  const markOrigins = async (
    landed: Awaited<ReturnType<typeof land>>,
    log: FastifyRequest['log'],
  ) => {
    const docs = documents as Required<ProposalRoutes['documents']>;
    const board = landed.find((at) => at.kind === 'dashboard');
    for (const at of landed) {
      try {
        if (at.kind === 'data-source') {
          await routes.dataSources?.setOrigin(at.from.id, {
            id: at.id,
            version: at.version,
            folderId: at.from.landsIn,
          });
          continue;
        }
        // A model: a copy of the file it landed as (T451).
        if (at.kind === 'model') {
          await routes.models?.setOrigin(at.from.id, {
            id: at.id,
            folderId: at.from.landsIn,
            path: String(at.from.snapshot['path']),
            version: at.version,
          });
          continue;
        }
        const kind = at.kind as 'dashboard' | 'chart';
        const own = await docs.get(kind, at.from.id);
        if (own === null) continue;
        const local =
          board !== undefined && at.from.snapshot['localToDashboardId'] === board.from.id;
        await docs.update({
          kind,
          id: own.id,
          body: {
            ...own.body,
            origin: {
              kind,
              id: at.id,
              version: at.version,
              ...(local ? {} : { folderId: at.from.landsIn }),
            },
          },
          expectedVersion: own.version,
        });
      } catch (failure) {
        log.warn({ err: failure, item: at.from.id }, 'an approved item’s origin was not updated');
      }
    }
  };

  /**
   * What it replaces is still what it would replace (T352's review): each
   * item replaced still in the folder it lands in, and the folder's item of
   * its name still that one, or none for a new one. Otherwise an approval
   * would pull an item back from a folder the approver may not write, or
   * leave two of a name.
   */
  const changedSince = async (proposal: Proposal): Promise<ProposedItem | undefined> => {
    const board = proposal.items.find((item) => item.kind === 'dashboard');
    for (const item of proposal.items) {
      if (board !== undefined && item.snapshot['localToDashboardId'] === board.id) continue;
      if (item.kind === 'data-source') {
        if (item.replaces === null) continue;
        const current = await routes.dataSources?.get(item.replaces.id);
        if (current?.folderId !== item.landsIn) return item;
        continue;
      }
      // A model: what it replaces still there, and still the folder's file of its name (T451).
      if (item.kind === 'model') {
        if (routes.models === undefined) continue;
        if (item.replaces !== null) {
          const current = await routes.models.file(item.replaces.id);
          if (current === undefined || current.folderId !== item.landsIn) return item;
        }
        const [declared] = declaredIn(String(item.snapshot['content']));
        const named =
          declared === undefined
            ? undefined
            : await routes.models.declaring(item.landsIn, declared.name);
        if ((named?.id ?? null) !== (item.replaces?.id ?? null)) return item;
        continue;
      }
      const kind = item.kind as 'dashboard' | 'chart';
      if (item.replaces !== null) {
        const current = await documents.get(kind, item.replaces.id);
        if (current === null || folderIdOf(current.body) !== item.landsIn) return item;
      }
      const named = await documents.named(kind, item.landsIn, item.title);
      if ((named?.id ?? null) !== (item.replaces?.id ?? null)) return item;
    }
    return undefined;
  };

  /**
   * Approving a proposal (T352, AC-288; design 05, state I): its items land
   * in their folders and its versions are kept. A decider who may write every
   * folder it lands in, or a Super-Admin (T351); anyone else finds no such
   * proposal, and its author who may no longer write there is refused.
   */
  app.post('/api/proposals/:id/approve', USER, async (request, reply) => {
    if (!routes.enabled) return reply.code(404).send({ error: 'Proposals need sign-in.' });
    const { id } = request.params as { id: string };
    const proposal = await store.get(id);
    const rights = proposal === null ? null : await rightsOn(request, proposal);
    if (proposal === null || rights === null || !rights.see)
      return reply.code(404).send({ error: 'There is no such proposal.' });
    if (proposal.decision !== null)
      return reply
        .code(409)
        .send({ error: `It was decided already, by ${proposal.decision.by.name}.` });
    if (!rights.approve)
      return reply.code(403).send({
        error:
          'You can’t approve it: only a read-write member of every folder it lands in, or a Super-Admin, can.',
      });
    // Nothing lands without its history (T352's review).
    if (
      documents.update === undefined ||
      documents.create === undefined ||
      documents.localTo === undefined ||
      documents.remove === undefined ||
      routes.versions === undefined
    )
      return reply.code(503).send({ error: 'Approvals can’t be landed here.' });
    const changed = await changedSince(proposal);
    if (changed !== undefined)
      return reply.code(409).send({
        error: `“${changed.title}” changed in its folder since it was proposed. Propose it again.`,
      });
    const user = userOf(request);
    const approver = { key: user.key, name: user.name };
    // Taken first, so of two approvals at once one lands (T353's `decide`).
    const decided = await store.decide(proposal.id, {
      status: 'approved',
      by: approver,
      reason: null,
    });
    if (decided === null) {
      const first = (await store.get(proposal.id))?.decision;
      return reply.code(409).send({
        error: `It was decided already${first == null ? '' : `, by ${first.by.name}`}.`,
      });
    }
    let landed: Awaited<ReturnType<typeof land>>;
    const landedFiles: LandedModelFile[] = [];
    try {
      landed = await land(decided, approver, request, landedFiles);
    } catch (failure) {
      // Nothing it couldn't land is left approved: open again, to decide anew.
      await store.reopen(decided.id);
      if (failure instanceof Refused)
        return reply.code(failure.status).send({ error: failure.message, ...failure.extra });
      // Its folder, or xcube, refused the data source as it would a save.
      if (failure instanceof DataSourceRefused)
        return reply
          .code(failure.status)
          .send({ error: failure.message, problems: failure.problems });
      throw failure;
    }
    await store.settle(decided.id);
    await markOrigins(landed, request.log);
    // The calculation requests its measures answer, resolved (T385, AC-052).
    if (landedFiles.length > 0 && routes.afterModelsLanded !== undefined)
      await routes
        .afterModelsLanded({
          author: decided.author,
          approver,
          proposalId: decided.id,
          files: landedFiles,
        })
        .catch((failure: unknown) => {
          request.log.warn(
            { err: failure, proposalId: decided.id },
            'the calculation requests an approval answers were not resolved',
          );
        });
    const first = landed.find((at) => at.from.id === decided.itemId);
    // What landed with it, by kind: its charts and its models (T451's review).
    const withIt = goingWithText(landed.filter((at) => at !== first).map((at) => at.from));
    await recordIn(
      routes.audit,
      {
        actor: actorOf(user),
        event: 'approval',
        folderId: decided.targetFolderId,
        item: { kind: decided.kind, id: decided.itemId, title: decided.title },
        summary:
          `Approved “${decided.title}”` +
          (first === undefined ? '' : ` as version ${String(first.version)}`) +
          (withIt === '' ? '' : `, with ${withIt}`),
        details: {
          proposalId: decided.id,
          author: decided.author,
          selfApproved: decided.author.key === user.key,
          landed: landed.map((at) => ({ kind: at.kind, id: at.id, version: at.version })),
        },
      },
      request.log,
    );
    return {
      ...answerOf(decided),
      landed: landed.map((at) => ({ kind: at.kind, id: at.id, version: at.version })),
    };
  });

  app.post('/api/proposals', USER, async (request, reply) => {
    if (!routes.enabled) return reply.code(404).send({ error: 'Proposals need sign-in.' });
    try {
      return await propose(request, reply);
    } catch (failure) {
      if (failure instanceof Refused)
        return reply.code(failure.status).send({ error: failure.message, ...failure.extra });
      throw failure;
    }
  });

  /**
   * What proposing would record, refused as proposing would refuse it (T349),
   * recording nothing: for the route, and for the Propose dialog's check as
   * it opens (T358; design 05, state F).
   */
  async function plan(
    request: FastifyRequest,
    /** Whether a refusal of its models' check is recorded: not the Propose dialog's own check. */
    record: boolean,
  ) {
    const body = request.body as
      { kind?: unknown; id?: unknown; description?: unknown } | undefined;
    const kind = body?.kind;
    const id = body?.id;
    if (
      !(PROPOSAL_KINDS as readonly unknown[]).includes(kind) ||
      typeof id !== 'string' ||
      id === ''
    )
      throw new Refused(
        400,
        'Name the dashboard, chart, model or data source to propose: { kind, id }.',
      );
    const proposing = kind as ProposalKind;
    const sent = body?.description;
    // Text Postgres can hold: no NUL character (T353's review).
    if ((sent !== undefined && sent !== null && typeof sent !== 'string') || /\0/.test(`${sent}`))
      throw new Refused(400, 'A description is text.');
    const description = typeof sent === 'string' && sent.trim() !== '' ? sent : null;
    // Code points, as Postgres counts them and the dialog's counter must; never cut.
    const length = description === null ? 0 : [...description].length;
    if (length > PROPOSAL_TEXT_LIMIT)
      throw new Refused(
        400,
        `A description is at most 1,000 characters: this one has ${length.toLocaleString('en-GB')}.`,
      );

    // As the copy route says it to one who has none (AC-277).
    const own = await routes.ownWorkspace(request);
    const writes = await routes.writable(request);
    if (own === null)
      throw new Refused(
        403,
        'You have no workspace: only read-write members and Super-Admins have one.',
      );

    // The item, which must be in their own workspace.
    const sealedSource =
      proposing === 'data-source' ? await dataSources?.withSealed(id) : undefined;
    let stored: Stored | null;
    let home: string | null;
    let target: unknown;
    if (proposing === 'data-source') {
      const source = sealedSource?.source;
      stored = source === undefined ? null : { id: source.id, body: {}, version: source.version };
      home = source?.folderId ?? null;
      target = source?.targetFolderId;
    } else if (proposing === 'model') {
      // A workspace model file, by its id (T350).
      const file = await routes.models?.file(id);
      stored = file === undefined ? null : { id: file.id, body: {}, version: file.version };
      home = file?.folderId ?? null;
      target = file?.targetFolderId;
    } else {
      stored = await read(proposing, id);
      home = stored === null ? null : folderIdOf(stored.body);
      target = stored?.body['targetFolderId'];
      const local = stored?.body['localToDashboardId'];
      if (proposing === 'chart' && typeof local === 'string') {
        const board = await read('dashboard', local);
        if (board !== null && (await routes.workspaceOf(folderIdOf(board.body))) === own)
          throw new Refused(400, 'A chart on a dashboard is proposed with its dashboard.');
      }
    }
    if (stored === null) throw new Refused(404, NOT_THERE.error);
    const workspace = await routes.workspaceOf(home);
    if (workspace === null)
      // A shared item is changed through a copy (AC-278); one in a folder
      // they can't write is none of theirs to propose.
      throw home !== null && writes(home)
        ? new Refused(400, 'It is in a shared folder: edit it in your workspace, and propose that.')
        : new Refused(404, NOT_THERE.error);
    if (workspace !== own) throw new Refused(404, NOT_THERE.error);
    if (typeof target !== 'string' || target === '')
      throw new Refused(
        400,
        `This ${KIND_WORD[proposing]} names no folder to go to, so it can’t be proposed.`,
      );
    await landing(writes, target, `This ${KIND_WORD[proposing]}`);
    // A data source's changed settings only once a test of them passed (T515, AC-158).
    if (sealedSource !== undefined && routes.untested !== undefined) {
      const why = await routes.untested(sealedSource.source);
      if (why !== undefined) throw new Refused(409, why);
    }

    // What it would land, as it is now.
    let items: ProposedItem[];
    if (sealedSource !== undefined) {
      const { source, landed } = sealedSource;
      const named = (await dataSources!.inFolder(target)).find((each) => each.name === source.name);
      items = [
        {
          kind: 'data-source',
          id,
          title: source.name,
          version: source.version,
          // Its settings and its credentials as sealed, read as of one
          // moment, which wechart never opens (AC-298).
          snapshot: {
            name: source.name,
            driver: source.driver,
            authMethod: source.authMethod,
            fields: source.fields,
            description: source.description,
            origin: source.origin,
            sealed: landed.sealed,
            revisions: landed.revisions,
          },
          landsIn: target,
          replaces: named === undefined ? null : { id: named.id, version: named.version },
        },
      ];
    } else if (proposing === 'model') {
      // With the workspace models it names (T350); one its overlay places
      // nowhere, as no folder xcube serves, can't be.
      items = await modelItems(writes, () => routes.models!.alone(own, id));
      if (items.length === 0)
        throw new Refused(
          409,
          'This model is to go to a folder xcube doesn’t serve now, so it can’t be proposed.',
        );
    } else
      items = await documentItems(writes, proposing as 'dashboard' | 'chart', stored, own, target);
    /**
     * Its models checked by the dry run of the changeset they would make
     * (T451, AC-321): one that breaks the model, renames away a name still
     * used, or can't land where it goes isn't proposed.
     */
    // An item already waiting is said first: nothing is checked for it (T451's review).
    for (const item of items) {
      const open = await store.openFor(item.kind, item.id);
      if (open !== null)
        throw new Refused(409, waitingMessage(items, item.kind, item.id), {
          proposalId: open.id,
        });
    }
    const models = items.filter((item) => item.kind === 'model');
    let checkedModels: Extract<LandingCheck, { kind: 'checked' }> | undefined;
    if (models.length > 0 && routes.modelLanding !== undefined) {
      const checked = await routes.modelLanding.check(request, {
        models: models.map(landingModelOf),
        phase: 'proposal',
        record,
        title: items[0]!.title,
        targetFolderId: target,
      });
      if (checked.kind === 'refused') throw await refusedBy(checked);
      checkedModels = checked;
    }
    return { proposing, id, description, target, items, checkedModels };
  }

  /** The message for an item already waiting, in its proposal or as another's. */
  const waitingMessage = (items: readonly ProposedItem[], kind: string, itemId: string) => {
    const waiting = items.find((each) => each.kind === kind && each.id === itemId);
    return waiting === undefined || waiting === items[0]
      ? 'It is waiting for review already: its proposal must be decided first.'
      : waiting.kind === 'model'
        ? `“${waiting.title}”, which goes with it, is waiting for review in another proposal. That one must be decided first.`
        : `It shows “${waiting.title}”, which is waiting for review in another proposal. That one must be decided first.`;
  };

  /** "1 chart and 2 models": what goes with an item, by kind. */
  const goingWithText = (items: readonly ProposedItem[]) => {
    const count = (kind: ProposalKind, one: string, many: string) => {
      const n = items.filter((each) => each.kind === kind).length;
      return n === 0 ? [] : [`${String(n)} ${n === 1 ? one : many}`];
    };
    return [...count('chart', 'chart', 'charts'), ...count('model', 'model', 'models')].join(
      ' and ',
    );
  };

  /**
   * The Propose dialog's check as it opens (T358; design 05, states A, B and
   * F): what proposing would record, or the refusal it would give, an item
   * already waiting included. Each item by where it lands and what it
   * replaces, never what it holds; nothing is recorded.
   */
  app.post('/api/proposals/check', USER, async (request, reply) => {
    if (!routes.enabled) return reply.code(404).send({ error: 'Proposals need sign-in.' });
    try {
      // An item already waiting is refused there too (`plan`).
      const { target, items } = await plan(request, false);
      const pathParts = pathPartsOf;
      const answered = answerOf({
        id: '',
        kind: items[0]!.kind,
        itemId: items[0]!.id,
        title: items[0]!.title,
        targetFolderId: target,
        author: { key: '', name: '' },
        description: null,
        proposedAt: new Date(0),
        status: 'open',
        replaces: items[0]!.replaces,
        items,
        decision: null,
        dismissedAt: null,
      });
      return {
        targetFolderId: target,
        targetPath: await pathParts(target),
        items: await Promise.all(
          answered.items.map(async (item) => ({
            kind: item.kind,
            id: item.id,
            title: item.title,
            landsIn: item.landsIn,
            landsInPath: await pathParts(item.landsIn),
            replaces: item.replaces,
          })),
        ),
      };
    } catch (failure) {
      if (failure instanceof Refused)
        return reply.code(failure.status).send({ error: failure.message, ...failure.extra });
      throw failure;
    }
  });

  async function propose(request: FastifyRequest, reply: FastifyReply) {
    const { proposing, id, description, target, items, checkedModels } = await plan(request, true);
    const user = userOf(request);
    // What each item binds to as it is proposed: what an approval is held to (T456).
    const bound =
      routes.bindings === undefined ? {} : await bindingsWhenProposed(items, checkedModels);
    let proposal: Proposal;
    try {
      proposal = await store.create({
        author: { key: user.key, name: user.name },
        targetFolderId: target,
        description,
        items,
      });
    } catch (failure) {
      if (!(failure instanceof OpenProposalError)) throw failure;
      const open = await store.openFor(failure.kind, failure.itemId);
      throw new Refused(
        409,
        waitingMessage(items, failure.kind, failure.itemId),
        open === null ? {} : { proposalId: open.id },
      );
    }
    // Made already: one not recorded is held to nothing, never answered as a failure.
    await routes.bindings?.keep(proposal.id, bound).catch((failure: unknown) => {
      request.log.warn({ err: failure }, 'a proposal’s bindings were not recorded');
    });

    const answer = answerOf(proposal);
    const goesWith = goingWithText(items.slice(1));
    await recordIn(
      routes.audit,
      {
        actor: actorOf(user),
        event: 'proposal',
        folderId: target,
        item: { kind: proposing, id, title: items[0]!.title },
        summary:
          `Proposed to ${await pathOf(target)}` +
          (answer.replaces === null
            ? ', as new'
            : `, replacing version ${String(answer.replaces.version)}`) +
          (goesWith === '' ? '' : `, with ${goesWith}`),
        // What each item is and where it lands: never what it holds (AC-298).
        details: {
          proposalId: proposal.id,
          description,
          items: answer.items.map((each) => ({
            kind: each.kind,
            id: each.id,
            title: each.title,
            landsIn: each.landsIn,
            replaces: each.replaces,
          })),
        },
      },
      request.log,
    );
    return reply.code(201).send(answer);
  }
}
