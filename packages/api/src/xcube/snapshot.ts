import { createHash } from 'node:crypto';

import type { ModelFile } from '../server';
import type { XcubeAdmin } from './client';
import type { PublicationStore } from './publications';

/**
 * Bringing xcube's copy of the model up to wechart's published files (T419,
 * AC-333; `docs/research/xcube-slice-2.md`; the contract's §3.1).
 *
 * The whole set is sent as the model's next revision whenever its content
 * differs from xcube's current one: when the API starts, after each publish,
 * and from a reconcile every 60 s. wechart commits a publish to its own store
 * before sending it, so xcube is never ahead of wechart, and a send lost on
 * its way is made by the next reconcile.
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

/** A refused set isn't sent again for this long (the contract's §3.1). */
const REFUSED_FOR_MS = 10 * 60_000;
/** A conflict is read and sent again this many more times. */
const RETRIES = 3;

export function modelSync({
  model,
  admin,
  files,
  publications,
  log,
  now = Date.now,
}: {
  readonly model: string;
  readonly admin: XcubeAdmin;
  /** wechart's published files, as its store holds them now. */
  readonly files: () => Promise<readonly ModelFile[]>;
  readonly publications: PublicationStore;
  readonly log: {
    warn: (details: Record<string, unknown>, message: string) => void;
    info: (details: Record<string, unknown>, message: string) => void;
  };
  readonly now?: () => number;
}) {
  let refused: { hash: string; at: number } | undefined;
  /**
   * One at a time in this process, each reading xcube's head afresh; and at
   * most one waiting: whatever is asked for while one runs is merged into the
   * next, which reads the files as they are then (T419's review).
   */
  let running: Promise<SyncResult> | undefined;
  let waiting: Promise<SyncResult> | undefined;

  const once = async (reason: SyncReason): Promise<SyncResult> => {
    try {
      for (let attempt = 0; attempt <= RETRIES; attempt += 1) {
        // xcube's head first, then the files: a base older than the files is
        // at worst a conflict, never a revision built on content it lacks.
        const head = await admin.revision();
        // What's recorded follows xcube's store before anything is sent: a
        // revision of an older store, or one it no longer holds, means nothing
        // there (research, Gotcha 8; T419's review).
        const recorded = await publications.get(model);
        const holds = head.current?.revision ?? 0;
        if (
          recorded !== undefined &&
          (recorded.generation !== head.generation || recorded.revision > holds)
        )
          await publications.put(model, {
            generation: head.generation,
            revision: holds,
            contentHash: head.current?.contentHash ?? '',
          });
        const published = plainYamlOf(await files());
        const hash = contentHashOf(published);
        if (head.current !== null && head.current.contentHash === hash) {
          await publications.put(model, {
            generation: head.generation,
            revision: head.current.revision,
            contentHash: hash,
          });
          return { kind: 'same', revision: head.current.revision };
        }
        if (refused?.hash === hash && now() - refused.at < REFUSED_FOR_MS)
          return { kind: 'skipped' };

        const answer = await admin.snapshot({
          baseRevision: head.current?.revision ?? null,
          files: published,
          source: { reason },
        });
        if (answer.kind === 'stored') {
          refused = undefined;
          await publications.put(model, {
            generation: answer.generation,
            revision: answer.revision,
            contentHash: answer.contentHash,
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
  };
}
