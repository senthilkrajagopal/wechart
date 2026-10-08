import { randomUUID } from 'node:crypto';

import type { FastifyInstance, InjectOptions } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { pgSessionStore } from '../auth/session-store';
import { PUBLIC_URL, signIn, USERS } from '../auth/sign-in.fixture';
import { closeDb, getDb } from '../db/client';
import { auditStore } from '../repos/audit';
import { catalog } from '../repos/catalog';
import { deletedFolderStore } from '../repos/deleted-folders';
import { documents, type DocumentKind } from '../repos/documents';
import { folderAccessStore } from '../repos/folder-access';
import { proposalStore } from '../repos/proposals';
import { versionStore } from '../repos/versions';
import { buildServer } from '../server';

/**
 * T540 (AC-389; `[R52]`, the user's answer: "Dont block.. when approved
 * create the folder again and land the files"): an empty shared folder may
 * be deleted while a proposal still goes to it. wechart keeps a record of
 * each shared folder it deletes: its id, name, parent, description and
 * groups. An approval into a deleted folder makes it again from that record,
 * with the same id, and its deleted parents likewise, then lands its items
 * there. A folder of the same name made in that parent since leaves the
 * recreated one a numbered name (Claude's call, overturnable).
 *
 *   /Q <run>       sales-rw read-write; "Quarterly"
 *   /Q <run>/T     sales-ro read-only, read-write as Q; "Targets"
 *   /R <run>       sales-rw read-write
 *
 * Its author approves it, a read-write member of the folder as its groups
 * were when it was deleted.
 */
const secured = {
  cubeApiUrl: 'http://cube.invalid/cubejs-api',
  cubeApiSecret: 'secret',
  securityContext: {},
  port: 4100,
  modelDir: '',
  security: 'oidc' as const,
  publicUrl: PUBLIC_URL,
  sessionSecret: 'a-test-session-secret-at-least-32-characters',
  superAdminGroup: 'wechart-super-admins',
  oidc: {
    issuer: 'http://localhost:5556/dex',
    clientId: 'wechart',
    clientSecret: 'dev-oidc-secret',
    groupsClaim: 'groups',
    scopes: 'openid profile email groups',
    allowHttp: true,
  },
};

const MARK = `rec${randomUUID().slice(0, 8)}`;
const docs = () => documents(getDb());
const made: { kind: DocumentKind; id: string }[] = [];
const cookies: Record<string, string> = {};
let app: FastifyInstance;

async function doc(kind: DocumentKind, body: Record<string, unknown>, id: string = randomUUID()) {
  made.push({ kind, id });
  await docs().create({ kind, id, body: { owner: 'admin', ...body } });
  return id;
}

beforeAll(async () => {
  app = buildServer({
    config: secured,
    sessions: pgSessionStore(getDb()),
    documents: docs(),
    catalog: catalog(getDb()),
    folderAccess: folderAccessStore(getDb()),
    deletedFolders: deletedFolderStore(getDb()),
    audit: auditStore(getDb()),
    proposals: proposalStore(getDb()),
    versions: versionStore(getDb()),
  });
  for (const who of ['writer', 'super', 'reader']) cookies[who] = await signIn(app, USERS[who]!);
});

afterAll(async () => {
  if (app !== undefined) await app.close();
  const db = getDb();
  const folders = made.filter((each) => each.kind === 'folder').map((each) => each.id);
  if (folders.length > 0) {
    await db.deleteFrom('proposals').where('target_folder_id', 'in', folders).execute();
    await db.deleteFrom('audit_records').where('folder_id', 'in', folders).execute();
    await db.deleteFrom('item_versions').where('folder_id', 'in', folders).execute();
    // Their records, had any been left.
    await db
      .deleteFrom('documents')
      .where('kind', '=', 'deleted-folder')
      .where('id', 'in', folders)
      .execute();
    const landed = await db
      .selectFrom('documents')
      .select(['kind', 'id'])
      .where('kind', 'in', ['dashboard', 'chart'])
      .where('folder_id', 'in', folders)
      .execute();
    for (const { kind, id } of landed) made.push({ kind: kind as DocumentKind, id });
  }
  for (const { kind, id } of made.reverse())
    await docs()
      .remove(kind, id)
      .catch(() => undefined);
  await closeDb();
});

const as = (options: InjectOptions, who = 'writer') =>
  app.inject({ ...options, headers: { ...options.headers, cookie: cookies[who]! } });

/** The writer's own dashboard, proposed to `target`: the proposal's id. */
async function proposedTo(target: string, title: string) {
  const answer = await as({
    method: 'POST',
    url: '/api/documents',
    payload: {
      kind: 'dashboard',
      title: `${title} ${MARK}`,
      folderId: 'mine',
      targetFolderId: target,
    },
  });
  expect(answer.statusCode, answer.body).toBe(201);
  made.push({ kind: 'dashboard', id: answer.json<{ id: string }>().id });
  const proposed = await as({
    method: 'POST',
    url: '/api/proposals',
    payload: { kind: 'dashboard', id: answer.json<{ id: string }>().id },
  });
  expect(proposed.statusCode, proposed.body).toBe(201);
  return proposed.json<{ id: string }>().id;
}
/** Deleted by a Super-Admin: one in the root needs the root's write (AC-291). */
const removed = async (folderId: string) => {
  const answer = await as({ method: 'DELETE', url: `/api/documents/folder/${folderId}` }, 'super');
  expect(answer.statusCode, answer.body).toBe(204);
  expect(await docs().get('folder', folderId)).toBeNull();
};
const approve = (proposalId: string, who = 'writer') =>
  as({ method: 'POST', url: `/api/proposals/${proposalId}/approve`, payload: {} }, who);
/** A folder's body as stored. */
const folderOf = async (id: string) => (await docs().get('folder', id))?.body ?? null;

describe('a deleted target folder, made again at approval (T540, AC-389)', () => {
  it('comes back with its deleted parent, each with its id, name, parent, description and groups, and the items land in it', async () => {
    const q = await doc('folder', {
      title: `Q ${MARK}`,
      folderId: 'root',
      description: 'Quarterly',
      access: { readOnly: null, readWrite: ['sales-rw'] },
    });
    const t = await doc('folder', {
      title: `T ${MARK}`,
      folderId: q,
      description: 'Targets',
      access: { readOnly: ['sales-ro'], readWrite: null },
    });
    const before = { q: await folderOf(q), t: await folderOf(t) };
    const proposalId = await proposedTo(t, 'Board');
    await removed(t);
    await removed(q);

    const approved = await approve(proposalId);
    expect(approved.statusCode, approved.body).toBe(200);
    expect(await folderOf(q)).toEqual(before.q);
    expect(await folderOf(t)).toEqual(before.t);
    const landed = approved
      .json<{ landed: { kind: string; id: string }[] }>()
      .landed.find((each) => each.kind === 'dashboard');
    expect(landed).toBeDefined();
    expect((await docs().get('dashboard', landed!.id))?.body['folderId']).toBe(t);
  });

  it('gives it a numbered name where its parent has a folder of its name since', async () => {
    const r = await doc('folder', {
      title: `R ${MARK}`,
      folderId: 'root',
      access: { readOnly: null, readWrite: ['sales-rw'] },
    });
    const proposalId = await proposedTo(r, 'Other');
    await removed(r);
    // Made since, in the root, under the deleted one's name.
    const since = await doc('folder', { title: `R ${MARK}`, folderId: 'root' });

    const approved = await approve(proposalId);
    expect(approved.statusCode, approved.body).toBe(200);
    expect(await folderOf(r)).toEqual({
      owner: 'admin',
      title: `R ${MARK} (2)`,
      folderId: 'root',
      access: { readOnly: null, readWrite: ['sales-rw'] },
    });
    // The one made since keeps its name.
    expect((await folderOf(since))?.['title']).toBe(`R ${MARK}`);
  });

  it('is listed nowhere while it is deleted, and only its deciders may approve it', async () => {
    const u = await doc('folder', {
      title: `U ${MARK}`,
      folderId: 'root',
      description: 'Unlisted',
      access: { readOnly: ['sales-ro'], readWrite: ['sales-rw'] },
    });
    const proposalId = await proposedTo(u, 'Hidden');
    await removed(u);

    // Its record is no item of its parent's (T540's review).
    const listed = await as({ method: 'GET', url: '/api/folders/root/contents' }, 'super');
    expect(listed.statusCode, listed.body).toBe(200);
    expect(listed.json<{ id: string }[]>().filter((item) => item.id === u)).toEqual([]);

    // A reader of it, as it was, is no decider of what lands in it.
    const read = await approve(proposalId, 'reader');
    expect(read.statusCode, read.body).toBe(404);
    expect(await folderOf(u)).toBeNull();
  });

  it('keeps no record of a folder no proposal goes to', async () => {
    const v = await doc('folder', {
      title: `V ${MARK}`,
      folderId: 'root',
      access: { readOnly: null, readWrite: ['sales-rw'] },
    });
    await removed(v);
    expect(await deletedFolderStore(getDb()).get(v)).toBeNull();
  });

  it('puts the tree to xcube once made again, and approves nothing if that fails', async () => {
    const pushes: string[] = [];
    let answer: { kind: string } = { kind: 'failed' };
    const pushing = buildServer({
      config: secured,
      sessions: pgSessionStore(getDb()),
      documents: docs(),
      catalog: catalog(getDb()),
      folderAccess: folderAccessStore(getDb()),
      deletedFolders: deletedFolderStore(getDb()),
      audit: auditStore(getDb()),
      proposals: proposalStore(getDb()),
      versions: versionStore(getDb()),
      afterFolderChange: () => {
        pushes.push(answer.kind);
        return Promise.resolve(answer);
      },
    });
    try {
      const writer = await signIn(pushing, USERS['writer']!);
      const w = await doc('folder', {
        title: `W ${MARK}`,
        folderId: 'root',
        access: { readOnly: null, readWrite: ['sales-rw'] },
      });
      const proposalId = await proposedTo(w, 'Pushed');
      await removed(w);
      const approving = () =>
        pushing.inject({
          method: 'POST',
          url: `/api/proposals/${proposalId}/approve`,
          payload: {},
          headers: { cookie: writer },
        });

      const failed = await approving();
      expect(failed.statusCode, failed.body).toBe(503);
      expect(failed.json<{ error: string }>().error).toBe(
        'Its folder was made again, but Cube’s folder tree could not be updated, so nothing was approved. Approve it again in a moment.',
      );
      expect(pushes).toEqual(['failed']);
      const open = await as({ method: 'GET', url: `/api/proposals/${proposalId}` });
      expect(open.json<{ status: string }>().status).toBe('open');

      // Made again already: approved now, with nothing more to put.
      answer = { kind: 'sent' };
      const approved = await approving();
      expect(approved.statusCode, approved.body).toBe(200);
      expect(pushes).toEqual(['failed']);
      expect((await folderOf(w))?.['title']).toBe(`W ${MARK}`);
    } finally {
      await pushing.close();
    }
  });

  it('approves nothing where xcube refuses the tree for folders it still holds things in (T765’s review)', async () => {
    const pushing = buildServer({
      config: secured,
      sessions: pgSessionStore(getDb()),
      documents: docs(),
      catalog: catalog(getDb()),
      folderAccess: folderAccessStore(getDb()),
      deletedFolders: deletedFolderStore(getDb()),
      audit: auditStore(getDb()),
      proposals: proposalStore(getDb()),
      versions: versionStore(getDb()),
      // As `pushTree` answers a tree refused `409 folder_in_use`: not put.
      afterFolderChange: () => Promise.resolve({ kind: 'in-use', folders: ['gone'] }),
    });
    try {
      const writer = await signIn(pushing, USERS['writer']!);
      const x = await doc('folder', {
        title: `X ${MARK}`,
        folderId: 'root',
        access: { readOnly: null, readWrite: ['sales-rw'] },
      });
      const proposalId = await proposedTo(x, 'Held');
      await removed(x);
      const refused = await pushing.inject({
        method: 'POST',
        url: `/api/proposals/${proposalId}/approve`,
        payload: {},
        headers: { cookie: writer },
      });
      expect(refused.statusCode, refused.body).toBe(503);
      const open = await as({ method: 'GET', url: `/api/proposals/${proposalId}` });
      expect(open.json<{ status: string }>().status).toBe('open');
    } finally {
      await pushing.close();
    }
  });

  it('is refused, and left open, where wechart has no record of the folder', async () => {
    const s = await doc('folder', {
      title: `S ${MARK}`,
      folderId: 'root',
      access: { readOnly: null, readWrite: ['sales-rw'] },
    });
    const proposalId = await proposedTo(s, 'Lost');
    // Gone without a record, as a folder deleted before T540 is.
    await removed(s);
    await getDb()
      .deleteFrom('documents')
      .where('kind', '=', 'deleted-folder')
      .where('id', '=', s)
      .execute();

    const approved = await approve(proposalId, 'super');
    expect(approved.statusCode, approved.body).toBe(409);
    expect(approved.json<{ error: string }>().error).toBe(
      'Its folder was deleted, and wechart has no record of it to make it again. Reject it, and propose it to another folder.',
    );
    expect(await folderOf(s)).toBeNull();
    const after = await as({ method: 'GET', url: `/api/proposals/${proposalId}` }, 'super');
    expect(after.json<{ status: string }>().status).toBe('open');
  });
});
