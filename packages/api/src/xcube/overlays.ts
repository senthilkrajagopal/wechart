import { createHash } from 'node:crypto';

import type { FieldValue, SealedV1 } from '@wechart/core';

import type { OverlayAnswer, OverlayConnection, XcubeAdmin } from './client';
import { itemsOf, type Item } from './items';

/**
 * A workspace's content as an xcube overlay (T347; AC-281, AC-323, AC-280;
 * research `xcube-slice-5.md`, `xcube-overlay-data-sources.md`), and a
 * proposal's (T440).
 *
 * The overlay holds the workspace's models, each placed in its target folder
 * — a copy's target is its origin's folder — so a name used in it resolves
 * among the overlay's items first and then along that folder's path, as
 * xcube resolves an overlay item's names (Gotcha 5); and every data source
 * the workspace holds, a copy under its original's folder and name, so the
 * workspace's previews query it in the original's place for every cube bound
 * to it, and a new one under its target (AC-280, AC-282).
 *
 * It is pushed whole on each save, over the version xcube holds, and named
 * in the signed token of its owner's previews alone (`CubeClient.inOverlay`).
 * A workspace with nothing to overlay has none: its previews are the
 * published model's. Emptied — its content published or discarded — it is
 * dropped (AC-323).
 */

/** A workspace's overlay id: `ws-` and 40 hex digits of its folder id, in xcube's id form. */
export const workspaceOverlayIdOf = (workspaceId: string): string =>
  `ws-${createHash('sha256').update(workspaceId).digest('hex').slice(0, 40)}`;

/** A proposal's overlay id (T440): `p-` and its UUID. */
export const proposalOverlayIdOf = (proposalId: string): string => `p-${proposalId}`;

/** A workspace model, where its overlay places it: its target, a copy's its origin's folder. */
export interface OverlayModel {
  readonly path: string;
  readonly content: string;
  readonly targetFolderId: string | null;
}

/** A workspace data source, with its envelopes as stored, never opened (AC-298). */
export interface OverlaySource {
  readonly name: string;
  readonly driver: string;
  readonly authMethod: string;
  readonly fields: Readonly<Record<string, FieldValue>>;
  readonly sealed: Readonly<Record<string, SealedV1>>;
  readonly targetFolderId: string | null;
  /** A copy's original's folder: where it stands in for it (T346). */
  readonly origin: { readonly folderId: string } | null;
}

/** What an overlay brings: its items and its data sources, each placed by xcube's folder id. */
export interface OverlayContent {
  readonly upserts: readonly Item[];
  readonly connections: readonly OverlayConnection[];
}

const byPlace = (a: { folderId: string; name: string }, b: { folderId: string; name: string }) =>
  `${a.folderId}/${a.name}` < `${b.folderId}/${b.name}` ? -1 : 1;

/**
 * A workspace's models and data sources as its overlay brings them, by
 * xcube's folder ids (`folders`, by wechart's). One with no target, or whose
 * folder xcube's tree doesn't hold, is left out: there is nowhere to put it.
 */
export function overlayContentOf({
  models,
  sources,
  folders,
}: {
  readonly models: readonly OverlayModel[];
  readonly sources: readonly OverlaySource[];
  readonly folders: ReadonlyMap<string, string>;
}): OverlayContent {
  const placed = models.flatMap((model) =>
    model.targetFolderId === null
      ? []
      : [{ folderId: model.targetFolderId, path: model.path, content: model.content }],
  );
  const connections = sources.flatMap((source): OverlayConnection[] => {
    const folderId = folders.get(source.origin?.folderId ?? source.targetFolderId ?? '');
    return folderId === undefined
      ? []
      : [
          {
            folderId,
            name: source.name,
            driver: source.driver,
            authMethod: source.authMethod,
            fields: source.fields,
            sealed: source.sealed,
          },
        ];
  });
  return {
    upserts: itemsOf(placed, folders).sort(byPlace),
    connections: connections.sort(byPlace),
  };
}

/** A proposal's item as its overlay reads it: what it is, where it lands, and what it holds. */
export interface ProposalOverlayItem {
  readonly kind: string;
  readonly landsIn: string;
  readonly snapshot: Record<string, unknown>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/**
 * A proposal's overlay (T440, AC-323): what it would land, each in the folder
 * it lands in — its data sources as connections, its models (T350) as items,
 * as its approval would publish them. Its dashboards and charts are
 * wechart's, not xcube's: their previews only name the overlay. One whose
 * folder xcube's tree doesn't hold has nowhere to go, and is left out.
 */
export function proposalContentOf(
  items: readonly ProposalOverlayItem[],
  folders: ReadonlyMap<string, string>,
): OverlayContent {
  const sources: OverlaySource[] = items.flatMap((item) => {
    const s = item.snapshot;
    if (item.kind !== 'data-source' || typeof s['name'] !== 'string') return [];
    return [
      {
        name: s['name'],
        driver: String(s['driver']),
        authMethod: String(s['authMethod']),
        fields: (isRecord(s['fields']) ? s['fields'] : {}) as Record<string, FieldValue>,
        sealed: (isRecord(s['sealed']) ? s['sealed'] : {}) as Record<string, SealedV1>,
        targetFolderId: item.landsIn,
        origin: null,
      },
    ];
  });
  const models: OverlayModel[] = items.flatMap((item) =>
    item.kind === 'model' &&
    typeof item.snapshot['path'] === 'string' &&
    typeof item.snapshot['content'] === 'string'
      ? [
          {
            path: item.snapshot['path'],
            content: item.snapshot['content'],
            targetFolderId: item.landsIn,
          },
        ]
      : [],
  );
  return overlayContentOf({ models, sources, folders });
}

const isEmpty = (content: OverlayContent) =>
  content.upserts.length === 0 && content.connections.length === 0;
const hashOf = (content: OverlayContent) =>
  createHash('sha256').update(JSON.stringify(content)).digest('hex');

/** A push's outcome: stored at a version, nothing to overlay, or xcube's refusal. */
export type PushResult =
  | { readonly kind: 'stored'; readonly version: number }
  | { readonly kind: 'empty' }
  | Exclude<OverlayAnswer, { kind: 'stored' } | { kind: 'conflict' }>;

/** An overlay a preview names: its id, what it holds, and the version xcube took of it here. */
export interface EnsuredOverlay {
  readonly id: string;
  readonly content: OverlayContent;
  /** None where this server never had a push of it taken. */
  readonly version?: number;
  /**
   * Why xcube took none of it, where it holds none (T440's review): each
   * item it names and why, as `folderId/name: message`. Such an overlay is
   * never named: Cube would answer only that it is gone.
   */
  readonly problem?: string;
}

/** What xcube said of a push it refused, naming each item where it names one. */
const problemOf = (result: Exclude<PushResult, { kind: 'stored' } | { kind: 'empty' }>) =>
  result.kind === 'refused'
    ? result.errors
        .map((error) =>
          error.folderId === null || error.name === null
            ? error.message
            : `${error.folderId}/${error.name}: ${error.message}`,
        )
        .join('; ') || 'xcube refused it'
    : result.kind === 'older'
      ? 'an older xcube is still running, which can’t preview its data sources'
      : result.error;

/**
 * How long one reading of a workspace answers the previews asked with it: a
 * dashboard's tiles ask at once. A push here reads it afresh.
 */
const ENSURED_FOR_MS = 2_000;

/**
 * xcube counts an overlay's life from each push, a day by default (research
 * `xcube-slice-5.md`, Gotcha 11): one pushed this long ago is pushed again,
 * the same content renewing it, before a preview names it.
 */
const RENEW_AFTER_MS = 6 * 3_600_000;
/** Pushes over a version another push took first, before giving up. */
const CONFLICT_TRIES = 4;

export interface OverlaySync {
  /**
   * The workspace's content pushed now, over the version xcube holds: a save's
   * (T347). A candidate is checked before wechart stores it, and nothing is
   * pushed in its place when xcube refuses it.
   */
  push(workspaceId: string, candidate?: OverlayContent): Promise<PushResult>;
  /**
   * The overlay a preview of the workspace's items names, after making sure
   * xcube holds its content as it is now, with that content; none where the
   * workspace has nothing to overlay, whose previews are the published
   * model's.
   */
  ensure(workspaceId: string): Promise<EnsuredOverlay | undefined>;
  /** Dropped at once: published or discarded (AC-323). */
  drop(workspaceId: string): Promise<void>;
}

export function overlaySync({
  xcube,
  contentOf,
  idOf = workspaceOverlayIdOf,
  now = Date.now,
  log = () => undefined,
}: {
  readonly xcube: Pick<XcubeAdmin, 'putOverlay' | 'dropOverlay'>;
  /** The workspace's content as it is stored now; a proposal's, for its overlays (T440). */
  readonly contentOf: (workspaceId: string) => Promise<OverlayContent>;
  /** Its overlay's id: a workspace's by default, `proposalOverlayIdOf` for proposals (T440). */
  readonly idOf?: (key: string) => string;
  readonly now?: () => number;
  readonly log?: (message: string, details?: unknown) => void;
}): OverlaySync {
  /** What this server last stored in xcube for each overlay: none, or its version and content. */
  const held = new Map<
    string,
    { readonly version: number; readonly hash: string; readonly at: number } | 'none'
  >();
  /** One push of an overlay at a time, in the order asked, within this server. */
  const turns = new Map<string, Promise<unknown>>();
  const inTurn = <T>(id: string, work: () => Promise<T>): Promise<T> => {
    const run = (turns.get(id) ?? Promise.resolve()).then(work, work);
    turns.set(
      id,
      run.catch(() => undefined),
    );
    return run;
  };

  const dropNow = async (id: string) => {
    await xcube.dropOverlay(id);
    held.set(id, 'none');
  };

  const pushNow = async (
    workspaceId: string,
    candidate: OverlayContent | undefined,
  ): Promise<PushResult> => {
    const id = idOf(workspaceId);
    let content = candidate ?? (await contentOf(workspaceId));
    if (isEmpty(content)) {
      if (held.get(id) !== 'none') await dropNow(id);
      return { kind: 'empty' };
    }
    const was = held.get(id);
    let base = was === undefined || was === 'none' ? null : was.version;
    for (let tries = 1; tries <= CONFLICT_TRIES; tries += 1) {
      const answer = await xcube.putOverlay(id, {
        upserts: content.upserts,
        deletes: [],
        connections: content.connections,
        baseVersion: base,
      });
      if (answer.kind === 'stored') {
        held.set(id, { version: answer.version, hash: hashOf(content), at: now() });
        return { kind: 'stored', version: answer.version };
      }
      if (answer.kind !== 'conflict') {
        log('xcube refused a workspace’s overlay', { id, answer });
        return answer;
      }
      // Another push came first (another replica, or a save racing a
      // discard): over what xcube holds, with the workspace read again.
      base = answer.currentVersion;
      if (candidate === undefined) content = await contentOf(workspaceId);
      if (isEmpty(content)) {
        await dropNow(id);
        return { kind: 'empty' };
      }
    }
    throw new Error(`xcube kept answering conflicts for the overlay ${id}`);
  };

  /** Each overlay's last answer to a preview, and when: its tiles ask together. */
  const ensured = new Map<
    string,
    { readonly at: number; readonly answer: EnsuredOverlay | undefined }
  >();

  return {
    push: (workspaceId, candidate) => {
      const id = idOf(workspaceId);
      return inTurn(id, () => {
        ensured.delete(id);
        return pushNow(workspaceId, candidate);
      });
    },

    ensure: (workspaceId) => {
      const id = idOf(workspaceId);
      return inTurn(id, async () => {
        const recent = ensured.get(id);
        if (recent !== undefined && now() - recent.at < ENSURED_FOR_MS) return recent.answer;
        const content = await contentOf(workspaceId);
        const was = held.get(id);
        let answer: EnsuredOverlay | undefined;
        if (isEmpty(content)) {
          // Emptied since this server pushed it: dropped, and named no more.
          // One it never pushed was dropped by whatever emptied it, and no
          // token names it either way.
          if (was !== undefined && was !== 'none') await dropNow(id);
        } else {
          const fresh =
            was !== undefined &&
            was !== 'none' &&
            was.hash === hashOf(content) &&
            now() - was.at < RENEW_AFTER_MS;
          // Named either way: refused now, xcube still holds what it last
          // took, and one it never took answers that it is gone, never the
          // published model (AC-323).
          const pushed = fresh ? undefined : await pushNow(workspaceId, content);
          const taken = held.get(id);
          const holds = taken !== undefined && taken !== 'none';
          answer = {
            id,
            content,
            ...(holds ? { version: taken.version } : {}),
            // Refused, with nothing taken before: said, never named.
            ...(!holds &&
            pushed !== undefined &&
            pushed.kind !== 'stored' &&
            pushed.kind !== 'empty'
              ? { problem: problemOf(pushed) }
              : {}),
          };
        }
        ensured.set(id, { at: now(), answer });
        return answer;
      });
    },

    drop: (workspaceId) => {
      const id = idOf(workspaceId);
      return inTurn(id, () => {
        ensured.delete(id);
        return dropNow(id);
      });
    },
  };
}
