import { expect, type APIRequestContext } from '@playwright/test';

/**
 * How long a test waits for a publish's outcome. The whole model is compiled
 * before anything is published — once by xcube's dry run, and again as the
 * revision it imports (T445, T419) — and Cube's own log timed a compile at
 * 2.7–7.4 s while the suite ran in parallel (`"duration"` on "Compiling
 * schema", 2026-09-22), past the 5 s an assertion waits by default.
 */
export const PUBLISHED = { timeout: 20_000 };

/** A landing's own calls: a dry run when proposed, and the changeset applied at approval (T451). */
const LANDING = { timeout: 90_000 };

export interface ModelFileText {
  readonly path: string;
  readonly content: string;
}

/** A shared folder's model files, as its readers see them; the root's for `root`. */
export async function modelFilesIn(
  request: APIRequestContext,
  folderId: string,
): Promise<ModelFileText[]> {
  const answer = await request.get(`/api/model/files?folder=${encodeURIComponent(folderId)}`);
  expect(answer.status(), await answer.text()).toBe(200);
  return ((await answer.json()) as { files: ModelFileText[] }).files;
}

/**
 * A workspace model proposed by its author, by its file in My workspace: the
 * answer, as `POST /api/proposals` gives it, refusal and all (T350, T451).
 */
export async function proposedModel(
  request: APIRequestContext,
  workspaceFolderId: string,
  path: string,
) {
  const dependents = await request.get(
    `/api/model/files/dependents?folder=${encodeURIComponent(workspaceFolderId)}&path=${encodeURIComponent(path)}`,
  );
  expect(dependents.status(), await dependents.text()).toBe(200);
  const { fileId } = (await dependents.json()) as { fileId?: string };
  expect(fileId, `${path} in ${workspaceFolderId} has no id to propose it by`).toBeDefined();
  return request.post('/api/proposals', { data: { kind: 'model', id: fileId }, ...LANDING });
}

/** Model files written in My workspace to go to a shared folder, until dropped. */
export interface InMyWorkspace {
  /** The workspace folder a file of the batch is in, by its path. */
  readonly folderOf: (path: string) => string;
  /** The batch's files, and the folders made for them, removed from My workspace. */
  readonly drop: () => Promise<void>;
}

/**
 * Model files written in My workspace to go to the shared folder `folderId`,
 * as a shared model is changed with sign-in on (T451; AC-278, `[R52]`): the
 * folder's file of a path copied in ("Edit in my workspace", T347) and
 * changed there; a new one made in a project folder of the batch's own, so
 * two specs' files of one path, going to different folders, never meet.
 * Each save is checked through the workspace's overlay, and held to `200`.
 */
export async function inMyWorkspace(
  request: APIRequestContext,
  folderId: string,
  files: readonly ModelFileText[],
): Promise<InMyWorkspace> {
  const there = new Set((await modelFilesIn(request, folderId)).map((file) => file.path));
  const placed = new Map<string, string>();
  // Removed in this order: a copy, which may name a new one, before the new.
  const written: { folderId: string; path: string }[] = [];
  const folders: string[] = [];
  const drop = async () => {
    for (const file of written)
      await request.delete(
        `/api/model/files?folder=${encodeURIComponent(file.folderId)}&path=${encodeURIComponent(file.path)}`,
        LANDING,
      );
    for (const folder of folders) await request.delete(`/api/documents/folder/${folder}`);
  };
  try {
    // The new ones first, together, so a copy naming one is checked with it.
    const added = files.filter((file) => !there.has(file.path));
    if (added.length > 0) {
      const folder = await request.post('/api/documents', {
        data: {
          kind: 'folder',
          title: `Landing ${Math.random().toString(36).slice(2, 10)}`,
          folderId: 'mine',
        },
      });
      expect(folder.status(), await folder.text()).toBe(201);
      const fresh = ((await folder.json()) as { id: string }).id;
      folders.push(fresh);
      const saved = await request.post('/api/model/publish', {
        data: { folderId: fresh, targetFolderId: folderId, files: added },
        ...LANDING,
      });
      for (const file of added) {
        placed.set(file.path, fresh);
        written.push({ folderId: fresh, path: file.path });
      }
      expect(saved.status(), await saved.text()).toBe(200);
    }
    for (const file of files.filter((each) => there.has(each.path))) {
      const copied = await request.post('/api/workspace/copies', {
        data: { kind: 'model', folderId, path: file.path, timeZone: 'UTC' },
        ...LANDING,
      });
      expect(copied.status(), await copied.text()).toBeLessThan(300);
      const copy = (await copied.json()) as { folderId: string; created: boolean };
      placed.set(file.path, copy.folderId);
      // A copy the spec made itself before is its own, and kept.
      if (copy.created) {
        written.unshift({ folderId: copy.folderId, path: file.path });
        folders.push(copy.folderId);
      }
      const saved = await request.post('/api/model/publish', {
        data: { folderId: copy.folderId, files: [file] },
        ...LANDING,
      });
      expect(saved.status(), await saved.text()).toBe(200);
    }
  } catch (error) {
    await drop();
    throw error;
  }
  return {
    folderOf: (path) => {
      const folder = placed.get(path);
      if (folder === undefined) throw new Error(`${path} isn’t in this batch.`);
      return folder;
    },
    drop,
  };
}

/** A proposal approved by its author: the answer, refusal and all (T451). */
export const approvedBy = (request: APIRequestContext, proposalId: string) =>
  request.post(`/api/proposals/${proposalId}/approve`, { data: {}, ...LANDING });

/**
 * Model files put in the shared folder `folderId` as a shared model is
 * changed with sign-in on (T451; AC-278, `[R52]`): only through My
 * workspace and a proposal, approved here by its own author — a writer of
 * the folder, as a Super-Admin is.
 *
 * Each is written in My workspace (`inMyWorkspace`), proposed with the
 * workspace models it names, and approved, which lands it through xcube's
 * changeset; one the folder already has as it is sent is left. The
 * workspace's files are removed once landed: other specs share this user's
 * workspace, and its previews would read them (T347).
 *
 * The folder's files of those paths as they are then, for the spec to hold
 * to what it sent.
 */
export async function landed(
  request: APIRequestContext,
  folderId: string,
  files: readonly ModelFileText[],
): Promise<ModelFileText[]> {
  const after = async () => {
    const now = await modelFilesIn(request, folderId);
    return files.flatMap((file) => {
      const there = now.find((each) => each.path === file.path);
      return there === undefined ? [] : [{ path: there.path, content: there.content }];
    });
  };
  const before = await modelFilesIn(request, folderId);
  const changing = files.filter(
    (file) => before.find((each) => each.path === file.path)?.content !== file.content,
  );
  if (changing.length === 0) return after();
  const batch = await inMyWorkspace(request, folderId, changing);
  try {
    // Each proposed and approved, unless one before it took it along.
    for (const file of changing) {
      const now = await modelFilesIn(request, folderId);
      if (now.find((each) => each.path === file.path)?.content === file.content) continue;
      const proposed = await proposedModel(request, batch.folderOf(file.path), file.path);
      expect(proposed.status(), await proposed.text()).toBe(201);
      const approved = await approvedBy(request, ((await proposed.json()) as { id: string }).id);
      expect(approved.status(), await approved.text()).toBe(200);
    }
  } finally {
    await batch.drop();
  }
  return after();
}

/**
 * A cube file of this browser's own, published through the API (T142). The
 * browsers run at once, and each publish writes a whole file, so two editing
 * one file write over each other's change: a test that publishes uses its
 * own file, not the seed model's.
 */
export async function ownCubeFile(
  request: APIRequestContext,
  cube: string,
  /** The file's text, when the test needs more than a count on products. */
  content = `cubes:\n  - name: ${cube}\n    sql_table: public.products\n\n    measures:\n      - name: count\n        type: count\n`,
): Promise<string> {
  const path = `cubes/${cube}.yml`;
  const response = await request.post('/api/model/publish', {
    data: { files: [{ path, content }] },
  });
  expect(response.status()).toBe(200);
  return path;
}
