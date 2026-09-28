import { ChartDocumentError } from '@wechart/core';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { actorOf, recordIn } from '../audit/record';
import { USER } from '../auth/guard';
import { userOf } from '../auth/user';
import type { AuditStore } from '../repos/audit';
import type { DataSourceStore } from '../repos/data-sources';
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
  };
  readonly dataSources?: Pick<DataSourceStore, 'get' | 'inFolder' | 'withSealed'>;
  /** The request's user's own workspace root; none for one who has none (AC-277). */
  readonly ownWorkspace: (request: FastifyRequest) => Promise<string | null>;
  /** The workspace a folder is in, at any depth; null for a shared one. */
  readonly workspaceOf: (folderId: string | null) => Promise<string | null>;
  /** Whether the request's user may change what is in a shared folder. */
  readonly mayWrite: (request: FastifyRequest, folderId: string) => Promise<boolean>;
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
  const landing = async (request: FastifyRequest, folderId: string, what: string) => {
    if (folderId !== 'root' && (await read('folder', folderId)) === null)
      throw new Refused(
        404,
        `${what} is to go to a folder that is no longer there. Choose another target.`,
      );
    if ((await routes.workspaceOf(folderId)) !== null)
      throw new Refused(400, `${what} is to go to a workspace folder. Choose a shared one.`);
    if (!(await routes.mayWrite(request, folderId)))
      throw new Refused(
        403,
        `${what} is to go to a folder you can’t propose into: only its read-write members can. Choose another target.`,
      );
  };

  /** The items proposing a dashboard or chart lands, the item first. */
  const documentItems = async (
    request: FastifyRequest,
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
      await landing(request, chartTarget, `“${title}”, which it shows,`);
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

  /** A folder's path below Shared, as the audit trail names it ("Sales / EMEA"). */
  const pathOf = async (id: string) => {
    if (id === 'root') return 'Shared';
    const names: string[] = [];
    for (let at: string | null = id; at !== null && at !== 'root' && names.length < 64;) {
      const folder = await read('folder', at);
      if (folder === null) break;
      names.unshift(titleOf(folder.body) || at);
      at = folderIdOf(folder.body);
    }
    return names.join(' / ') || id;
  };

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

  async function propose(request: FastifyRequest, reply: FastifyReply) {
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
    if (sent !== undefined && sent !== null && typeof sent !== 'string')
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
      throw home !== null && (await routes.mayWrite(request, home))
        ? new Refused(400, 'It is in a shared folder: edit it in your workspace, and propose that.')
        : new Refused(404, NOT_THERE.error);
    if (workspace !== own) throw new Refused(404, NOT_THERE.error);
    if (typeof target !== 'string' || target === '')
      throw new Refused(
        400,
        `This ${KIND_WORD[proposing]} names no folder to go to, so it can’t be proposed.`,
      );
    await landing(request, target, `This ${KIND_WORD[proposing]}`);

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
      items = await documentItems(request, proposing as 'dashboard' | 'chart', stored, own, target);

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
      const waiting = items.find(
        (each) => each.kind === failure.kind && each.id === failure.itemId,
      );
      throw new Refused(
        409,
        waiting === undefined || waiting === items[0]
          ? 'It is waiting for review already: its proposal must be decided first.'
          : `It shows “${waiting.title}”, which is waiting for review in another proposal. That one must be decided first.`,
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
