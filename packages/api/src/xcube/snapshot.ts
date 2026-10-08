import { createHash } from 'node:crypto';

import type { ModelFile } from '../server';
import type { Changeset } from './changesets';
import { XcubeError, type HeldFolder, type XcubeAdmin } from './client';
import { treeHashOf, type TreeFolder } from './folders';
import { itemsHashOf, itemsOf } from './items';
import type { PublicationStore } from './publications';

/**
 * Bringing xcube's copy of the model up to wechart's published files (T419,
 * AC-333; `docs/research/xcube-slice-2.md`; the contract's §3.1), as items
 * from T449 (`xcube-slice-3a.md`, "Switch once").
 *
 * The whole model is sent as items, with the folder tree, whenever its items
 * hash differs from xcube's current one: when the API starts, after each
 * publish, and from a reconcile every 60 s. A model xcube holds as slice 2's
 * file set is moved to items mode by the first such snapshot, and no file set
 * is sent again. wechart commits a publish to its own store before sending
 * it, so xcube is never ahead of wechart, and a send lost on its way is made
 * by the next reconcile. The tree is also put on its own when the API starts
 * and after every folder change.
 */

/**
 * xcube's content hash (research, "Input claims checked" rows 27–29): the
 * SHA-256, in hex, of the files sorted by path, as `[{fileName, content}]`.
 */
export function contentHashOf(files: readonly ModelFile[]): string {
  const sorted = [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return createHash('sha256')
    .update(JSON.stringify(sorted.map(({ path, content }) => ({ fileName: path, content }))))
    .digest('hex');
}

/**
 * What of wechart's files xcube is sent (T446, AC-335): plain YAML only.
 * xcube takes nothing else by default, refusing the whole set over one
 * JavaScript, Python or `.jinja` file, or a YAML file with `{{`, `}}`, `{%` or
 * `%}` anywhere, comments included (research, "Path rules"). Such a file stays
 * in wechart's store, read-only with its reason (AC-140), and is never sent.
 */
const JINJA_TAG = /{%|%}|{{|}}/;
export function plainYamlOf(files: readonly ModelFile[]): readonly ModelFile[] {
  return files.filter((file) => /\.ya?ml$/.test(file.path) && !JINJA_TAG.test(file.content));
}

export type SyncResult =
  | { readonly kind: 'same' | 'sent'; readonly revision: number }
  | { readonly kind: 'refused'; readonly errors: readonly unknown[] }
  | { readonly kind: 'skipped' }
  | { readonly kind: 'failed' };

/** Why a set was sent: xcube records it with the revision. */
export type SyncReason = 'start' | 'publish' | 'reconcile';

export type TreeResult =
  | { readonly kind: 'sent'; readonly hash: string }
  | { readonly kind: 'failed' }
  /**
   * The tree would strand cubes from their data sources, or items from what
   * they refer to (T715; `409 data_source_range` / `reference_range`,
   * research `xcube-256d632371.md`, "On `PUT …/folders`"): by name. The
   * tree xcube holds is unchanged.
   */
  | {
      readonly kind: 'refused';
      readonly cubes: readonly string[];
      readonly items: readonly string[];
    }
  /**
   * The tree drops folders xcube still holds items or data sources in
   * (`409 folder_in_use`): ones wechart deleted while xcube missed it. A
   * catch-up (`catchUp`) brings xcube level (T765, AC-330).
   */
  | { readonly kind: 'in-use'; readonly folders: readonly string[] };

/** A folder's move not yet written: `folder` held by `to` (T715). */
export interface FolderMove {
  readonly folder: string;
  readonly to: string;
}

/**
 * wechart's tree with each folder xcube still holds items or data sources in
 * (T765, AC-330; research `xcube-c2602ac72a.md`, step 2): kept under its
 * parent there, and that parent too where wechart has it no more, up to a
 * folder of wechart's. Where a folder is in both, wechart's parent stands.
 */
export function keptTree(
  ours: readonly TreeFolder[],
  held: readonly HeldFolder[],
): readonly TreeFolder[] {
  const tree = new Map(ours.map((folder) => [folder.id, folder]));
  const byId = new Map(held.map((folder) => [folder.id, folder]));
  for (const folder of held) {
    if (folder.items === 0 && folder.dataSources === 0) continue;
    for (
      let at: HeldFolder | undefined = folder;
      at !== undefined && !tree.has(at.id);
      at = at.parentId === null ? undefined : byId.get(at.parentId)
    )
      tree.set(at.id, { id: at.id, parentId: at.parentId, allowedGroups: at.allowedGroups });
  }
  return [...tree.values()];
}

/** A tree whose hash xcube answers wrong is put this many more times. */
const TREE_RETRIES = 1;

/** A refused set isn't sent again for this long (the contract's §3.1). */
const REFUSED_FOR_MS = 10 * 60_000;
/** A conflict is read and sent again this many more times. */
const RETRIES = 3;
export function modelSync({
  model,
  admin,
  files,
  tree,
  folderIds,
  publications,
  log,
  now = Date.now,
  security,
}: {
  readonly model: string;
  readonly admin: XcubeAdmin;
  /** wechart's published files, as its store holds them now. */
  readonly files: () => Promise<readonly ModelFile[]>;
  /**
   * The folder tree wechart publishes, by xcube id (T425); with a folder's
   * move not yet written, as it will be (T715).
   */
  readonly tree: (moving?: FolderMove) => Promise<readonly TreeFolder[]>;
  /**
   * Each served folder's xcube id, by wechart's (T452): a file is its
   * folder's item. The root alone where not given.
   */
  readonly folderIds?: () => Promise<ReadonlyMap<string, string>>;
  readonly publications: PublicationStore;
  readonly log: {
    warn: (details: Record<string, unknown>, message: string) => void;
    info: (details: Record<string, unknown>, message: string) => void;
  };
  readonly now?: () => number;
  /**
   * Whether xcube's folder gate is on for the model (T436, AC-320): sent
   * with every tree. Sign-in on, it is; off, every token is admitted. Not
   * sent where not given.
   */
  readonly security?: boolean;
}) {
  let refused: { hash: string; at: number } | undefined;
  /**
   * One at a time in this process, each reading xcube's head afresh; and at
   * most one waiting: whatever is asked for while one runs is merged into the
   * next, which reads the files as they are then (T419's review).
   */
  let running: Promise<SyncResult> | undefined;
  let waiting: Promise<SyncResult> | undefined;

  /** A send; with `heldTree`, the items go with that tree, a catch-up's (T765). */
  const once = async (
    reason: SyncReason,
    heldTree?: readonly TreeFolder[],
  ): Promise<SyncResult> => {
    try {
      for (let attempt = 0; attempt <= RETRIES; attempt += 1) {
        // xcube's head first, then the files: a base older than the files is
        // at worst a conflict, never a revision built on content it lacks.
        const head = await admin.revision();
        // What's recorded follows xcube's store before anything is sent: a
        // revision of an older store means nothing there (research, Gotcha 8;
        // T419's review). Within one store the record only rises (T421's
        // review): a higher recorded revision there is another replica's
        // publish, recorded after this read xcube's head, not one xcube lost.
        // The record's `contentHash` holds the items hash from T449 on.
        const recorded = await publications.get(model);
        if (recorded !== undefined && recorded.generation !== head.generation)
          await publications.put(model, {
            generation: head.generation,
            revision: head.current?.revision ?? 0,
            contentHash: head.current?.itemsHash ?? '',
          });
        const items = itemsOf(await files(), await folderIds?.());
        const hash = itemsHashOf(items);
        // Only an items-mode head is the same: a file set is moved over, whatever it holds.
        if (head.mode === 'items' && head.current !== null && head.current.itemsHash === hash) {
          await publications.put(model, {
            generation: head.generation,
            revision: head.current.revision,
            contentHash: hash,
          });
          return { kind: 'same', revision: head.current.revision };
        }
        if (refused?.hash === hash && now() - refused.at < REFUSED_FOR_MS)
          return { kind: 'skipped' };

        const answer = await admin.itemsSnapshot({
          baseRevision: head.current?.revision ?? null,
          folders: heldTree ?? (await tree()),
          items,
          source: { reason },
        });
        if (answer.kind === 'stored') {
          refused = undefined;
          await publications.put(model, {
            generation: answer.generation,
            revision: answer.revision,
            contentHash: answer.itemsHash,
          });
          log.info({ model, revision: answer.revision, reason }, 'xcube holds the model');
          return { kind: answer.created ? 'sent' : 'same', revision: answer.revision };
        }
        if (answer.kind === 'refused') {
          refused = { hash, at: now() };
          log.warn(
            { model, reason, errors: answer.errors, cubeMessage: answer.cubeMessage },
            'xcube refused the model; the same content is not sent again for 10 minutes',
          );
          return { kind: 'refused', errors: answer.errors };
        }
        // A conflict: another replica got there first. Read again.
      }
      log.warn({ model, reason }, 'xcube’s model kept changing under this send; gave up');
      return { kind: 'failed' };
    } catch (error) {
      log.warn(
        { model, reason, err: error },
        'could not bring xcube’s copy of the model up to date',
      );
      return { kind: 'failed' };
    }
  };

  /**
   * A publish's changeset applied (T426; research 3a, "POST …/changesets"):
   * on xcube's current revision, read again and sent again on a stale base,
   * and taken as done where xcube already holds it. A model still holding a
   * file set is sent whole, as items, instead.
   */
  const apply = async (changeset: Changeset): Promise<SyncResult> => {
    try {
      for (let attempt = 0; attempt <= RETRIES; attempt += 1) {
        const head = await admin.revision();
        if (head.mode !== 'items' || head.current === null) return await once('publish');
        const answer = await admin.applyChangeset({
          baseRevision: head.current.revision,
          upserts: changeset.upserts,
          deletes: changeset.deletes,
          // Recorded with the revision: a changeset told from a whole snapshot.
          source: { reason: 'publish', via: 'changeset' },
        });
        if (answer.kind === 'stored') {
          refused = undefined;
          await publications.put(model, {
            generation: answer.generation,
            revision: answer.revision,
            contentHash: answer.itemsHash,
          });
          log.info({ model, revision: answer.revision }, 'xcube holds the published change');
          return { kind: answer.created ? 'sent' : 'same', revision: answer.revision };
        }
        if (answer.kind === 'refused') {
          log.warn(
            { model, errors: answer.errors, cubeMessage: answer.cubeMessage },
            'xcube refused the published change; the next reconcile sends the whole model',
          );
          return { kind: 'refused', errors: answer.errors };
        }
        // A stale base: another replica's change landed first. Read again.
      }
      log.warn({ model }, 'xcube’s model kept changing under this change; gave up');
      return { kind: 'failed' };
    } catch (error) {
      log.warn({ model, err: error }, 'could not send the published change to xcube');
      return { kind: 'failed' };
    }
  };

  let treeRunning: Promise<TreeResult> | undefined;
  let treeWaiting: Promise<TreeResult> | undefined;
  const putTree = async (
    reason: SyncReason | 'folder',
    moving?: FolderMove,
  ): Promise<TreeResult> => {
    try {
      const folders = await tree(moving);
      const expected = treeHashOf(folders);
      let turningOn = security;
      for (let attempt = 0; attempt <= TREE_RETRIES; attempt += 1) {
        let hash: string;
        try {
          ({ hash } = await admin.folders(folders, turningOn));
        } catch (error) {
          // Folders xcube still holds things in, deleted here while it missed
          // it: for a catch-up (T765, AC-330).
          if (
            error instanceof XcubeError &&
            error.status === 409 &&
            error.code === 'folder_in_use' &&
            moving === undefined
          ) {
            const held = error.details?.['folders'];
            const folders = Array.isArray(held)
              ? held.filter((each): each is string => typeof each === 'string')
              : [];
            log.warn(
              { model, reason, folders },
              'xcube still holds items or data sources in folders wechart has deleted: catching up',
            );
            return { kind: 'in-use', folders };
          }
          // A tree that would strand what is published: refused, said by name (T715).
          if (
            error instanceof XcubeError &&
            error.status === 409 &&
            (error.code === 'data_source_range' || error.code === 'reference_range')
          ) {
            const names = (key: string) => {
              const value = error.details?.[key];
              return Array.isArray(value)
                ? value.filter((each): each is string => typeof each === 'string')
                : [];
            };
            const refused = { cubes: names('cubes'), items: names('items') };
            // Said where it isn't a move's own check: wechart's tree and xcube's then differ (T715's review).
            if (moving === undefined)
              log.warn(
                { model, reason, ...refused },
                'xcube refused the folder tree: it would leave items using what isn’t in their folder or one of its ancestors',
              );
            return { kind: 'refused', ...refused };
          }
          /**
           * An older xcube is connected, so security can't be turned on yet
           * (`409 older_instances`). The tree and its groups are put without
           * it, so new folders and changed groups still land, and turning it
           * on is retried at the next push: the 60 s reconcile at the latest.
           */
          if (!(error instanceof XcubeError && error.code === 'older_instances') || !turningOn)
            throw error;
          log.warn(
            { model, reason, instances: error.details?.['instances'] },
            'xcube runs an older instance that can’t hold security: the folders’ groups are put, and security is turned on at the next push',
          );
          turningOn = undefined;
          attempt -= 1;
          continue;
        }
        if (hash === expected) return { kind: 'sent', hash };
      }
      log.warn({ model, reason }, 'xcube answered a folder tree hash that isn’t wechart’s');
      return { kind: 'failed' };
    } catch (error) {
      log.warn({ model, reason, err: error }, 'could not put the folder tree to xcube');
      return { kind: 'failed' };
    }
  };

  return {
    sync(reason: SyncReason): Promise<SyncResult> {
      const start = (why: SyncReason) => {
        const run = once(why).finally(() => {
          if (running === run) running = undefined;
        });
        running = run;
        return run;
      };
      if (running === undefined) return start(reason);
      waiting ??= running.then(() => {
        waiting = undefined;
        return start(reason);
      });
      return waiting;
    },

    /**
     * A committed publish sent (T426): its changeset where the check gave
     * one, else the whole model. After whatever is running, so it never
     * races a send already under way.
     */
    publish(changeset?: Changeset): Promise<SyncResult> {
      if (changeset === undefined) return this.sync('publish');
      const prior = running ?? Promise.resolve();
      const run = prior
        .then(
          () => apply(changeset),
          () => apply(changeset),
        )
        .finally(() => {
          if (running === run) running = undefined;
        });
      running = run;
      return run;
    },

    /**
     * The folder tree put on its own (T449, AC-333): when the API starts,
     * after every folder change and on the 60 s reconcile. One at a time,
     * and at most one waiting, which reads the tree as it is when it runs,
     * so an older tree never lands last (T449's review). xcube answers the
     * tree's hash; one that isn't this tree's is put again, then said.
     */
    pushTree(reason: SyncReason | 'folder'): Promise<TreeResult> {
      const start = (why: SyncReason | 'folder') => {
        const run = putTree(why).finally(() => {
          if (treeRunning === run) treeRunning = undefined;
        });
        treeRunning = run;
        return run;
      };
      if (treeRunning === undefined) return start(reason);
      treeWaiting ??= treeRunning.then(() => {
        treeWaiting = undefined;
        return start(reason);
      });
      return treeWaiting;
    },

    /**
     * A folder's move asked of xcube before it is written (T715, AC-425):
     * the tree as it will be, put after whatever push is under way and never
     * merged with another. `sent` holds it in xcube already; `refused` leaves
     * xcube's tree as it was.
     */
    /**
     * Catching xcube up to wechart where its tree was refused `in-use` (T765,
     * AC-330): folders wechart deleted while xcube missed it still hold
     * items or data sources there. In xcube's six steps, each valid alone, so
     * one cut short starts over at the next push (research
     * `xcube-c2602ac72a.md`, "The catch-up, in order"):
     * 1. xcube's tree read;
     * 2. wechart's tree put with each folder xcube holds anything in, under
     *    its parent there, its chain kept up to a folder of wechart's;
     * 3. the data sources put (`connections`);
     * 4. the items sent with step 2's tree, so the old folders' items go;
     * 5. the data sources again, the old ones now unused and dropped;
     * 6. wechart's own tree put, the old folders going.
     * After whatever tree push is under way.
     */
    catchUp(reason: SyncReason, connections: () => Promise<void>): Promise<TreeResult> {
      const steps = async (): Promise<TreeResult> => {
        try {
          const held = await admin.heldFolders();
          const ours = await tree();
          const kept = keptTree(ours, held);
          await admin.folders(kept, security);
          await connections();
          const sent = await once(reason, kept);
          if (sent.kind === 'refused' || sent.kind === 'failed') {
            log.warn({ model, reason, sent: sent.kind }, 'xcube’s catch-up stopped at its items');
            return { kind: 'failed' };
          }
          await connections();
        } catch (error) {
          log.warn({ model, reason, err: error }, 'could not catch xcube up to wechart');
          return { kind: 'failed' };
        }
        return putTree(reason);
      };
      const prior = treeRunning ?? Promise.resolve();
      const run = prior.then(steps, steps).finally(() => {
        if (treeRunning === run) treeRunning = undefined;
      });
      treeRunning = run;
      return run;
    },

    checkMove(moving: FolderMove): Promise<TreeResult> {
      const prior = treeRunning ?? Promise.resolve();
      const run = prior
        .then(
          () => putTree('folder', moving),
          () => putTree('folder', moving),
        )
        .finally(() => {
          if (treeRunning === run) treeRunning = undefined;
        });
      treeRunning = run;
      return run;
    },
  };
}
