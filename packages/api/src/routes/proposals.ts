import { randomUUID } from 'node:crypto';

import { ChartDocumentError } from '@wechart/core';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { actorOf, recordIn } from '../audit/record';
import { USER } from '../auth/guard';
import { userOf } from '../auth/user';
import type { AuditStore } from '../repos/audit';
import { DataSourceRefused, type DataSourceStore } from '../repos/data-sources';
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
import type { VersionStore } from '../repos/versions';
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
 * With sign-in off there are no workspaces, so nothing to propose (T359
 * brings the single user's).
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
}

const NOT_THERE = { error: 'There is no such item in your workspace.' };
const KIND_WORD: Record<ProposalKind, string> = {
  dashboard: 'dashboard',
  chart: 'chart',
  'data-source': 'data source',
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
    if (kind === 'chart') return [first];
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
    return items;
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
    return ['Shared', ...names];
  };
  /** A folder's path below Shared, as the audit trail names it ("Sales / EMEA"). */
  const pathOf = async (id: string) => {
    if (id === 'root') return 'Shared';
    return (await pathPartsOf(id)).slice(1).join(' / ') || id;
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
    return {
      ...answer,
      items: answer.items.map((item, at) => ({
        ...item,
        snapshot: shownSnapshot(item.kind, proposal.items[at]!.snapshot),
      })),
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

  /** The top bar's count alone (T355's review): what "To review" lists, counted. */
  app.get('/api/reviews/count', USER, async (request, reply) => {
    if (!routes.enabled) return reply.code(404).send({ error: 'Proposals need sign-in.' });
    return { waiting: (await toDecide(request)).length };
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
  const land = async (proposal: Proposal, approver: { key: string; name: string }) => {
    const docs = documents as Required<ProposalRoutes['documents']>;
    const landed: { kind: ProposalKind; id: string; version: number; from: ProposedItem }[] = [];
    const keep = async (
      kind: ProposalKind,
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

    // A data source: landed as it is, envelopes and all (AC-298).
    const source = proposal.items.find((item) => item.kind === 'data-source');
    if (source !== undefined) {
      const lander = routes.dataSourceLanding;
      if (lander === undefined) throw new Refused(503, 'Data sources can’t be landed here.');
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
      return landed;
    }

    // Dashboards and charts: every landed id first, so each shows the folder's.
    const board = proposal.items.find((item) => item.kind === 'dashboard');
    const idOf = new Map(
      proposal.items.map((item) => [item.id, item.replaces?.id ?? randomUUID()] as const),
    );
    const boardId = board === undefined ? undefined : idOf.get(board.id)!;
    const isLocal = (item: ProposedItem) =>
      board !== undefined && item.snapshot['localToDashboardId'] === board.id;

    // The versions replaced, as they are now: a dashboard with its own charts.
    const partsOf = async (dashboardId: string) =>
      (await docs.localTo(dashboardId)).map((chart) => ({ id: chart.id, body: chart.body }));
    for (const item of proposal.items) {
      if (item.replaces === null || isLocal(item)) continue;
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

    // Charts first, then the dashboard that shows them.
    const renamed = new Map([...idOf].filter(([from]) => from !== board?.id));
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
    for (const item of ordered) {
      const replacedOwner =
        item.replaces === null
          ? proposal.author.key
          : (await docs.get(item.kind as 'dashboard' | 'chart', item.replaces.id))?.body['owner'];
      const body =
        item === board
          ? landedBody(
              withChartsRenamed(item.snapshot, renamed) as Record<string, unknown>,
              { folderId: item.landsIn },
              replacedOwner,
            )
          : isLocal(item)
            ? landedBody(item.snapshot, { localTo: boardId! }, replacedOwner)
            : landedBody(item.snapshot, { folderId: item.landsIn }, replacedOwner);
      await write(item, body);
    }
    // The replaced dashboard's own charts it no longer shows go: its kept
    // version holds them.
    if (boardId !== undefined) {
      const shown = new Set(proposal.items.filter(isLocal).map((item) => idOf.get(item.id)!));
      for (const chart of await docs.localTo(boardId))
        if (!shown.has(chart.id)) await docs.remove('chart', chart.id);
    }

    // The new versions, kept: a dashboard with its charts as they landed.
    for (const at of landed) {
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

    return landed;
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
    try {
      landed = await land(decided, approver);
    } catch (failure) {
      // Nothing it couldn't land is left approved: open again, to decide anew.
      await store.reopen(decided.id);
      if (failure instanceof Refused)
        return reply.code(failure.status).send({ error: failure.message });
      // Its folder, or xcube, refused the data source as it would a save.
      if (failure instanceof DataSourceRefused)
        return reply
          .code(failure.status)
          .send({ error: failure.message, problems: failure.problems });
      throw failure;
    }
    await store.settle(decided.id);
    await markOrigins(landed, request.log);
    const first = landed.find((at) => at.from.id === decided.itemId);
    const charts = landed.filter((at) => at !== first).length;
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
          (charts === 0 ? '' : `, with ${String(charts)} ${charts === 1 ? 'chart' : 'charts'}`),
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
  async function plan(request: FastifyRequest) {
    const body = request.body as
      { kind?: unknown; id?: unknown; description?: unknown } | undefined;
    const kind = body?.kind;
    const id = body?.id;
    if (
      !(PROPOSAL_KINDS as readonly unknown[]).includes(kind) ||
      typeof id !== 'string' ||
      id === ''
    )
      throw new Refused(400, 'Name the dashboard, chart or data source to propose: { kind, id }.');
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
    } else
      items = await documentItems(writes, proposing as 'dashboard' | 'chart', stored, own, target);
    return { proposing, id, description, target, items };
  }

  /** The message for an item already waiting, in its proposal or as another's. */
  const waitingMessage = (items: readonly ProposedItem[], kind: string, itemId: string) => {
    const waiting = items.find((each) => each.kind === kind && each.id === itemId);
    return waiting === undefined || waiting === items[0]
      ? 'It is waiting for review already: its proposal must be decided first.'
      : `It shows “${waiting.title}”, which is waiting for review in another proposal. That one must be decided first.`;
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
      const { target, items } = await plan(request);
      for (const item of items) {
        const open = await store.openFor(item.kind, item.id);
        if (open !== null)
          throw new Refused(409, waitingMessage(items, item.kind, item.id), {
            proposalId: open.id,
          });
      }
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
    const { proposing, id, description, target, items } = await plan(request);
    const user = userOf(request);
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

    const answer = answerOf(proposal);
    const goesWith = items.length - 1;
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
          (goesWith === 0
            ? ''
            : `, with ${String(goesWith)} ${goesWith === 1 ? 'chart' : 'charts'}`),
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
