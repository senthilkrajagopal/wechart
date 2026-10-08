import { NAME } from '@wechart/core';

import { heldIn, namesDeclaredIn, type Names } from '../model/names';
import { declaredIn } from '../model/split';
import type { CompileError } from '../model/validate';
import type { ModelOrigin } from '../db/schema';
import type { StoredModelFile, WorkspaceModelFile } from '../repos/model-files';
import type { ModelFile } from '../server';
import type { ItemError } from '../xcube/client';
import { nameInUse } from '../xcube/refusal';
import type { OverlayContent, OverlayModel, OverlaySync, PushResult } from '../xcube/overlays';
import { SUBMITTED } from './submitted';

/**
 * Models in My workspace (T347; AC-222, AC-281, AC-282, AC-323): saved,
 * removed and copied in only as the workspace's overlay takes them.
 *
 * A workspace model is never published: it is the workspace's, previewed
 * through its overlay, where it is placed in its target folder (a copy's is
 * its origin's folder) and its names resolve in the overlay first, then along
 * that folder's path (AC-281). Every change to one is pushed to xcube with the
 * rest of the workspace, its data sources included, before it is stored: xcube
 * takes an overlay only if it applies and every module it changes compiles
 * (research `xcube-slice-5.md`, "PUT …/overlays/{id}"), and a change it
 * refuses is refused here, its errors on the files they are about, with
 * nothing stored. So what the workspace holds is what its previews show.
 */

/** An answer for the route to send. */
export interface Answer {
  readonly status: number;
  readonly body: unknown;
}

export interface WorkspaceModelDeps {
  readonly files: {
    inFolders(folderIds: readonly string[]): Promise<readonly StoredModelFile[]>;
    write(files: readonly WorkspaceModelFile[]): Promise<unknown>;
    remove?(folderId: string, path: string): Promise<unknown>;
    /** A file moved to another path in its folder, its id kept (T737). */
    relocate?(
      folderId: string,
      from: string,
      file: { readonly path: string; readonly content: string },
    ): Promise<unknown>;
  };
  readonly overlays: Pick<OverlaySync, 'push'>;
  /** The workspace's folders: its root and every folder in it. */
  readonly foldersOf: (workspaceId: string) => Promise<readonly string[]>;
  /** The overlay the workspace would have with these models, its data sources as stored. */
  readonly contentWith: (
    workspaceId: string,
    models: readonly OverlayModel[],
  ) => Promise<{ readonly content: OverlayContent; readonly folders: ReadonlyMap<string, string> }>;
  /** Whether a model file waits in an open proposal, and so is frozen (T350, AC-388). */
  readonly submitted?: (fileId: string) => Promise<boolean>;
  /** Each namespace's landed names, a draft's to be checked against (T705, AC-422). */
  readonly landedNames?: () => Promise<Names>;
}

const NEEDS_TARGET =
  'Name the shared folder this model is to go to: one where you have read-write access.';

/** Why an edit copy can't take another name (T706, AC-423). */
export const keepsItsName = (name: string) =>
  `“${name}” has landed, so its name is fixed: a copy of it keeps that name. Its title can still change.`;

/**
 * Where a new draft's file is stored (T737, AC-423; R73): beside where it
 * was sent, at the name of the one cube or view it declares. A file
 * declaring none or several, or a name outside the grammar (AC-426), stays
 * where it was sent: no path is made of what the grammar doesn't take.
 */
export function draftPathOf(file: { readonly path: string; readonly content: string }): string {
  const declared = declaredIn(file.content);
  const name = declared.length === 1 ? declared[0]!.name : '';
  if (!NAME.test(name) || !/^[^/]+\.ya?ml$/.test(file.path.split('/').at(-1) ?? ''))
    return file.path;
  const at = file.path.lastIndexOf('/');
  return `${at < 0 ? '' : file.path.slice(0, at + 1)}${name}.yml`;
}

/** A workspace model file where its overlay puts it: its folder, its text, where it is to go. */
type Placed = {
  readonly folderId: string;
  readonly path: string;
  readonly content: string;
  readonly targetFolderId: string | null;
};

/** What a workspace file is, in its overlay: its text, where it is to go. */
const modelOf = (file: { path: string; content: string; targetFolderId: string | null }) => ({
  path: file.path,
  content: file.content,
  targetFolderId: file.targetFolderId,
});

/**
 * xcube's refusal of an overlay as the model page shows a publish's (AC-136):
 * each error on the workspace file whose item it names, by the item's folder
 * — its target — and name, in the workspace folder holding it; one naming no
 * item, on each file the change touched.
 */
function errorsOf(
  errors: readonly ItemError[],
  files: readonly Placed[],
  changed: readonly { folderId: string; path: string }[],
  folders: ReadonlyMap<string, string>,
): CompileError[] {
  const byItem = new Map<string, { path: string; folderId: string }>();
  for (const file of files) {
    const xcubeId = folders.get(file.targetFolderId ?? '');
    if (xcubeId === undefined) continue;
    for (const { name } of declaredIn(file.content))
      byItem.set(`${xcubeId}/${name}`, { path: file.path, folderId: file.folderId });
  }
  return errors.flatMap((error): CompileError[] => {
    const placed =
      error.folderId === null || error.name === null
        ? undefined
        : byItem.get(`${error.folderId}/${error.name}`);
    // Only a YAML error's line is the author's (AC-136, research 3b).
    const at =
      error.kind === 'yaml'
        ? {
            ...(error.line === undefined ? {} : { line: error.line }),
            ...(error.column === undefined ? {} : { column: error.column }),
          }
        : {};
    return placed !== undefined
      ? [{ path: placed.path, folderId: placed.folderId, ...at, message: error.message }]
      : changed.map((file) => ({
          path: file.path,
          folderId: file.folderId,
          message: error.message,
        }));
  });
}

/** A refused push, answered: its errors on files, or why a data source can't be brought. */
function refusalOf(
  result: Exclude<PushResult, { kind: 'stored' } | { kind: 'empty' }>,
  files: Parameters<typeof errorsOf>[1],
  changed: Parameters<typeof errorsOf>[2],
  folders: ReadonlyMap<string, string>,
): Answer {
  if (result.kind === 'refused')
    return { status: 422, body: { errors: errorsOf(result.errors, files, changed, folders) } };
  if (result.kind === 'older')
    return {
      status: 503,
      body: {
        error:
          'An older xcube is still running, which can’t preview a workspace’s data sources. Try again once it has been replaced.',
      },
    };
  // A data source xcube won't bring: its secret, or its connection, in xcube's words.
  return { status: 422, body: { error: result.error } };
}

export function workspaceModels({
  files,
  overlays,
  foldersOf,
  contentWith,
  submitted,
  landedNames,
}: WorkspaceModelDeps) {
  /**
   * The workspace's models now, with these changed, as the overlay would
   * hold them, pushed. A changed file whose target xcube's tree doesn't hold
   * (a folder deleted since, say) has nowhere to go in the overlay: refused,
   * rather than stored and silently left out of the previews.
   */
  const pushWith = async (
    workspaceId: string,
    models: readonly Placed[],
    changed: readonly Placed[],
  ): Promise<
    | { readonly result: PushResult; readonly folders: ReadonlyMap<string, string> }
    | { readonly lost: Answer }
  > => {
    const { content, folders } = await contentWith(workspaceId, models.map(modelOf));
    const unplaced = changed.find((file) => !folders.has(file.targetFolderId ?? ''));
    if (unplaced !== undefined)
      return {
        lost: {
          status: 409,
          body: {
            error: `${unplaced.path} is to go to a folder xcube doesn’t serve now (it may have been deleted), so it can’t be previewed in your workspace.`,
          },
        },
      };
    return { result: await overlays.push(workspaceId, content), folders };
  };

  /**
   * The landed name an edit copy keeps: its original's, as its folder has it
   * now. None for a draft, a use-only copy, or a copy whose original is gone.
   */
  const fixedNameOf = async (file: StoredModelFile): Promise<string | undefined> =>
    file.origin === null || file.origin.useOnly === true ? undefined : originalNameOf(file.origin);
  /** The name a copy's original declares now; none where it is gone. */
  const originalNameOf = async (origin: { readonly id: string; readonly folderId: string }) => {
    const original = (await files.inFolders([origin.folderId])).find(
      (each) => each.id === origin.id,
    );
    return original === undefined ? undefined : declaredIn(original.content)[0]?.name;
  };

  return {
    /**
     * A save in the workspace (T347, AC-282): each file over the one at its
     * path in the folder, keeping where that one is to go; a new one goes to
     * the target named, which the caller has checked the user may write.
     */
    async save(
      workspaceId: string,
      folderId: string,
      changed: readonly ModelFile[],
      /** The target for a new file, checked: undefined where none was named. */
      target: string | undefined,
    ): Promise<Answer> {
      const held = await files.inFolders(await foldersOf(workspaceId));
      // Not while one waits in a proposal (T541, AC-388): withdrawn first.
      for (const file of held)
        if (
          file.folderId === folderId &&
          changed.some((each) => each.path === file.path) &&
          (await submitted?.(file.id)) === true
        )
          return { status: 409, body: SUBMITTED };
      /**
       * A copy made to edit a landed cube or view keeps its name, and lands
       * over it (T706, AC-423, AC-422; `[R71]` 3, 5): its title changes, its
       * name doesn't. A use-only copy is no edit of its original (AC-283).
       */
      /** Each changed file but an edit copy, with the name it may keep: a use-only copy's original's. */
      const drafts: { readonly file: ModelFile; readonly keeps: string | undefined }[] = [];
      for (const file of changed) {
        const stored = held.find((each) => each.folderId === folderId && each.path === file.path);
        const fixed = stored === undefined ? undefined : await fixedNameOf(stored);
        if (fixed !== undefined) {
          const declared = declaredIn(file.content).map(({ name }) => name);
          if (declared.length !== 1 || declared[0] !== fixed)
            return { status: 409, body: { error: keepsItsName(fixed) } };
          continue;
        }
        // A use-only copy stands in for its original under that one's name;
        // a copy whose original is gone keeps none.
        drafts.push({
          file,
          keeps: stored?.origin?.useOnly === true ? await originalNameOf(stored.origin) : undefined,
        });
      }
      /**
       * A draft made or renamed takes no name that has landed, in any folder
       * and in any case, nor one another of the workspace's models declares;
       * another workspace's drafts reserve nothing (T705; AC-422, AC-424). Said
       * only as in use, on its file.
       */
      if (drafts.length > 0 && landedNames !== undefined) {
        const landed = await landedNames();
        const others = held.filter(
          (each) =>
            !(each.folderId === folderId && drafts.some(({ file }) => file.path === each.path)),
        );
        const taken: Names = {
          items: [...landed.items, ...others.flatMap((each) => namesDeclaredIn(each.content))],
          dataSources: [],
        };
        const errors = drafts.flatMap(({ file, keeps }) =>
          heldIn(taken, {
            items: namesDeclaredIn(file.content).filter((name) => name !== keeps),
            dataSources: [],
          }).map((name) => ({ path: file.path, message: nameInUse(name) })),
        );
        if (errors.length > 0) return { status: 422, body: { errors } };
      }
      /**
       * A draft's file is named for its cube or view until it lands (T737,
       * AC-423; R73): saved under another path, it is stored at its name's,
       * moved with its id and where it goes kept. An edit copy's name is
       * fixed, and a use-only copy's is its original's: neither moves. A file
       * of that path in the folder refuses it, named.
       */
      const moved: { readonly from: string; readonly to: string }[] = [];
      const pathOf = (file: ModelFile): string => {
        const stored = held.find((each) => each.folderId === folderId && each.path === file.path);
        return stored?.origin != null ? file.path : draftPathOf(file);
      };
      const movedErrors: { path: string; message: string }[] = [];
      for (const file of changed) {
        const to = pathOf(file);
        if (to === file.path) continue;
        const taken =
          held.some((each) => each.folderId === folderId && each.path === to) ||
          changed.some((each) => each !== file && (each.path === to || pathOf(each) === to));
        if (taken)
          movedErrors.push({ path: file.path, message: `${to} is already in this folder.` });
        else moved.push({ from: file.path, to });
      }
      if (movedErrors.length > 0) return { status: 422, body: { errors: movedErrors } };
      const toOf = (path: string) => moved.find((each) => each.from === path)?.to ?? path;

      const writes: WorkspaceModelFile[] = [];
      const relocations: {
        readonly from: string;
        readonly to: string;
        readonly content: string;
      }[] = [];
      const after: Placed[] = held.filter(
        (file) => !(file.folderId === folderId && changed.some((each) => each.path === file.path)),
      );
      for (const file of changed) {
        const stored = held.find((each) => each.folderId === folderId && each.path === file.path);
        // Where it is to go is kept as stored (as a workspace dashboard's is).
        const goesTo = stored === undefined ? (target ?? null) : stored.targetFolderId;
        if (goesTo === null) return { status: 400, body: { error: NEEDS_TARGET } };
        const path = toOf(file.path);
        if (stored !== undefined && path !== file.path)
          relocations.push({ from: file.path, to: path, content: file.content });
        else
          writes.push({
            folderId,
            path,
            content: file.content,
            ...(stored === undefined ? { targetFolderId: goesTo } : {}),
          });
        after.push({ folderId, path, content: file.content, targetFolderId: goesTo });
      }
      const pushed = await pushWith(
        workspaceId,
        after,
        after.filter(
          (file) =>
            file.folderId === folderId && changed.some((each) => toOf(each.path) === file.path),
        ),
      );
      if ('lost' in pushed) return pushed.lost;
      const { result, folders } = pushed;
      if (result.kind !== 'stored' && result.kind !== 'empty') {
        const refused = refusalOf(
          result,
          after,
          [...writes.map((each) => each.path), ...relocations.map((each) => each.to)].map(
            (path) => ({ folderId, path }),
          ),
          folders,
        );
        // Said on the file as the caller sent it: a move refused is no move.
        const fromOf = (path: unknown) => moved.find((each) => each.to === path)?.from ?? path;
        const body = refused.body as { errors?: { path?: unknown }[] } | null;
        return Array.isArray(body?.errors)
          ? {
              ...refused,
              body: {
                ...body,
                errors: body.errors.map((error) => ({ ...error, path: fromOf(error.path) })),
              },
            }
          : refused;
      }
      for (const { from, to, content } of relocations)
        if (files.relocate !== undefined)
          await files.relocate(folderId, from, { path: to, content });
        else {
          // A store that can't move one: written at its new path, the old one removed.
          const stored = held.find((each) => each.folderId === folderId && each.path === from)!;
          await files.write([
            { folderId, path: to, content, targetFolderId: stored.targetFolderId },
          ]);
          await files.remove?.(folderId, from);
        }
      await files.write(writes);
      return {
        status: 200,
        body: {
          version: result.kind === 'stored' ? String(result.version) : '0',
          ...(moved.length === 0 ? {} : { moved }),
        },
      };
    },

    /**
     * A file removed from the workspace (T347): the overlay without it, then
     * the store. The open proposal it waits in is withdrawn before it goes,
     * as a deleted dashboard's is (T528, AC-372).
     */
    async remove(
      workspaceId: string,
      folderId: string,
      path: string,
      withdraw?: (fileId: string) => Promise<unknown>,
    ): Promise<Answer> {
      const held = await files.inFolders(await foldersOf(workspaceId));
      const file = held.find((each) => each.folderId === folderId && each.path === path);
      if (file === undefined || files.remove === undefined)
        return { status: 404, body: { error: `There’s no model file ${path} here.` } };
      const after = held.filter((each) => each !== file);
      const pushed = await pushWith(workspaceId, after, []);
      if ('lost' in pushed) return pushed.lost;
      const { result, folders } = pushed;
      if (result.kind !== 'stored' && result.kind !== 'empty')
        return refusalOf(result, held, [{ folderId, path }], folders);
      await withdraw?.(file.id);
      await files.remove(folderId, path);
      return {
        status: 200,
        body: { version: result.kind === 'stored' ? String(result.version) : '0' },
      };
    },

    /**
     * "Edit in my workspace" for a shared model (T347, AC-278, AC-283): a
     * copy of its file, at its path in a project folder of its own (T523),
     * going back to its folder, naming what it was copied from; or the copy
     * already there. The overlay takes it first: one whose short name another
     * of the workspace's models has is refused, naming it.
     */
    async copy(
      workspaceId: string,
      original: StoredModelFile,
      project: { readonly id: string; readonly make: () => Promise<unknown> },
      /**
       * A use-only copy (T543, AC-283): of a model in a folder its maker may
       * only read, placed where its original is and proposed to no folder
       * (T717, R73).
       */
      useOnly = false,
    ): Promise<Answer> {
      const held = await files.inFolders(await foldersOf(workspaceId));
      const existing = held.find((file) => file.origin?.id === original.id);
      if (existing !== undefined)
        return {
          status: 200,
          body: { kind: 'model', created: false, folderId: existing.folderId, path: existing.path },
        };
      const origin: ModelOrigin = {
        id: original.id,
        folderId: original.folderId,
        path: original.path,
        version: original.version,
        ...(useOnly ? { useOnly: true } : {}),
      };
      const copied = {
        folderId: project.id,
        path: original.path,
        content: original.content,
        targetFolderId: original.folderId,
      };
      const pushed = await pushWith(workspaceId, [...held, copied], [copied]);
      if ('lost' in pushed) return pushed.lost;
      const { result, folders } = pushed;
      if (result.kind !== 'stored' && result.kind !== 'empty') {
        const refused = refusalOf(result, [...held, copied], [copied], folders);
        return refused.status === 422
          ? { status: 409, body: { ...(refused.body as object), error: clashOf(result) } }
          : refused;
      }
      await project.make();
      await files.write([{ ...copied, origin }]);
      return {
        status: 201,
        body: { kind: 'model', created: true, folderId: project.id, path: original.path },
      };
    },
  };
}

/** Why a copy can't come into the workspace, in a line. */
const clashOf = (result: Exclude<PushResult, { kind: 'stored' } | { kind: 'empty' }>) =>
  result.kind === 'refused'
    ? `It can’t be previewed in your workspace with what is there: ${
        result.errors.map((error) => error.message).join(' ') || 'xcube refused it'
      }`
    : 'error' in result
      ? result.error
      : 'xcube refused it.';
