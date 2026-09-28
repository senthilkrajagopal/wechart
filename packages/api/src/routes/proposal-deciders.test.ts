import { randomUUID } from 'node:crypto';

import type { FastifyInstance, InjectOptions } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { pgSessionStore } from '../auth/session-store';
import { PUBLIC_URL, signIn, USERS } from '../auth/sign-in.fixture';
import { closeDb, getDb } from '../db/client';
import { catalog } from '../repos/catalog';
import { documents, type DocumentKind } from '../repos/documents';
import { folderAccessStore } from '../repos/folder-access';
import { proposalStore } from '../repos/proposals';
import { buildServer } from '../server';

/**
 * T351 (AC-286; design 05 of 2026-09-27, states D, K): a proposal is decided
 * only by its author, a read-write member of its target folder, or a
 * Super-Admin. Each of them may open it, and it says they may decide it,
 * and whether it is their own. Anyone else — a read-only member of the
 * folder, or someone with no access to it — finds no such proposal.
 *
 * `writer` (`sales-rw`) proposes into /Sales; `many` (`g01`) also writes it;
 * `reader` (`sales-ro`) only reads it; `manager` (`managers`) has no access
 * to it.
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

const MARK = `dec${randomUUID().slice(0, 8)}`;
const docs = () => documents(getDb());
const made: { kind: DocumentKind; id: string }[] = [];
const cookies: Record<string, string> = {};
let app: FastifyInstance;
let sales = '';
let managersFolder = '';
let proposalId = '';
let chartId = '';

beforeAll(async () => {
  sales = randomUUID();
  made.push({ kind: 'folder', id: sales });
  await docs().create({
    kind: 'folder',
    id: sales,
    body: {
      owner: 'admin',
      title: `Sales ${MARK}`,
      folderId: 'root',
      access: { readOnly: ['sales-ro'], readWrite: ['sales-rw', 'g01'] },
    },
  });
  // A folder `manager` writes, so they have a workspace and access somewhere.
  const theirs = randomUUID();
  managersFolder = theirs;
  made.push({ kind: 'folder', id: theirs });
  await docs().create({
    kind: 'folder',
    id: theirs,
    body: {
      owner: 'admin',
      title: `Managers ${MARK}`,
      folderId: 'root',
      // `many` (`g01`) writes both /Sales and this.
      access: { readOnly: null, readWrite: ['managers', 'g01'] },
    },
  });

  app = buildServer({
    config: secured,
    sessions: pgSessionStore(getDb()),
    documents: docs(),
    catalog: catalog(getDb()),
    folderAccess: folderAccessStore(getDb()),
    proposals: proposalStore(getDb()),
  });
  for (const who of ['writer', 'many', 'reader', 'manager', 'super'])
    cookies[who] = await signIn(app, USERS[who]!);

  const chart = await as('writer', {
    method: 'POST',
    url: '/api/documents',
    payload: { kind: 'chart', title: `Margin ${MARK}`, folderId: 'mine', targetFolderId: sales },
  });
  chartId = chart.json<{ id: string }>().id;
  const proposed = await as('writer', {
    method: 'POST',
    url: '/api/proposals',
    payload: { kind: 'chart', id: chartId, description: 'Adds a margin chart.' },
  });
  expect(proposed.statusCode, proposed.body).toBe(201);
  proposalId = proposed.json<{ id: string }>().id;
});

afterAll(async () => {
  if (app !== undefined) await app.close();
  await getDb().deleteFrom('proposals').where('target_folder_id', '=', sales).execute();
  await getDb()
    .deleteFrom('documents')
    .where('kind', '=', 'chart')
    .where('id', '=', chartId)
    .execute();
  for (const { kind, id } of made.reverse()) await docs().remove(kind, id);
  await closeDb();
});

const as = (who: string, options: InjectOptions) =>
  app.inject({ ...options, headers: { ...options.headers, cookie: cookies[who]! } });
const read = (who: string, id = proposalId) =>
  as(who, { method: 'GET', url: `/api/proposals/${id}` });

describe('who may decide a proposal (T351, AC-286)', () => {
  it('opens it to its author, the target’s read-write members and Super-Admins, each told they may decide it', async () => {
    for (const [who, yours] of [
      ['writer', true],
      ['many', false],
      ['super', false],
    ] as const) {
      const answer = await read(who);
      expect(answer.statusCode, `${who}: ${answer.body}`).toBe(200);
      expect(answer.json(), who).toMatchObject({
        id: proposalId,
        kind: 'chart',
        itemId: chartId,
        title: `Margin ${MARK}`,
        targetFolderId: sales,
        description: 'Adds a margin chart.',
        status: 'open',
        mayApprove: true,
        mayReject: true,
        yours,
      });
      // What it holds is the review view's: never a data source's envelopes (AC-298).
      expect(answer.json<{ items: { snapshot?: unknown }[] }>().items[0]!.snapshot).toMatchObject({
        title: `Margin ${MARK}`,
      });
    }
  });

  it('is no one else’s to see: a read-only member, or someone without access to the folder', async () => {
    for (const who of ['reader', 'manager']) {
      const answer = await read(who);
      expect(answer.statusCode, who).toBe(404);
      expect(answer.body, who).not.toContain(`Margin ${MARK}`);
    }
  });

  it('needs a read-write member to write every folder it lands in (T349’s review)', async () => {
    // A dashboard for /Sales showing a chart bound for the managers' folder.
    const across = await proposalStore(getDb()).create({
      author: { key: `someone-${MARK}`, name: 'Someone Else' },
      targetFolderId: sales,
      description: null,
      items: [
        {
          kind: 'dashboard',
          id: `board-${MARK}`,
          title: `Across ${MARK}`,
          version: 1,
          snapshot: { title: `Across ${MARK}` },
          landsIn: sales,
          replaces: null,
        },
        {
          kind: 'chart',
          id: `chart-${MARK}`,
          title: `Managers’ chart ${MARK}`,
          version: 1,
          snapshot: { title: `Managers’ chart ${MARK}` },
          landsIn: managersFolder,
          replaces: null,
        },
      ],
    });
    // `writer` writes /Sales but not the managers' folder; `manager` the reverse.
    for (const who of ['manager', 'writer'])
      expect((await read(who, across.id)).statusCode, who).toBe(404);
    // `many` writes both, and a Super-Admin every folder.
    for (const who of ['many', 'super']) {
      const answer = await read(who, across.id);
      expect(answer.statusCode, who).toBe(200);
      expect(answer.json<{ mayApprove: boolean }>().mayApprove, who).toBe(true);
    }
  });

  it('lets its author open and withdraw their own, but approve only into folders they may still write', async () => {
    const writerKey = (await read('writer')).json<{ author: { key: string } }>().author.key;
    // The writer's own, bound for a folder they can't write (they lost the group, say).
    const theirs = await proposalStore(getDb()).create({
      author: { key: writerKey, name: 'Writer' },
      targetFolderId: sales,
      description: null,
      items: [
        {
          kind: 'chart',
          id: `lost-${MARK}`,
          title: `Lost ${MARK}`,
          version: 1,
          snapshot: { title: `Lost ${MARK}` },
          landsIn: managersFolder,
          replaces: null,
        },
      ],
    });
    const answer = await read('writer', theirs.id);
    expect(answer.statusCode, answer.body).toBe(200);
    const { mayApprove, mayReject, yours } = answer.json<{
      mayApprove: boolean;
      mayReject: boolean;
      yours: boolean;
    }>();
    expect({ mayApprove, mayReject, yours }).toEqual({
      mayApprove: false,
      mayReject: true,
      yours: true,
    });
  });

  it('offers nothing to decide once it is decided', async () => {
    const decided = await proposalStore(getDb()).create({
      author: { key: `someone-${MARK}`, name: 'Someone Else' },
      targetFolderId: sales,
      description: null,
      items: [
        {
          kind: 'chart',
          id: `decided-${MARK}`,
          title: `Decided ${MARK}`,
          version: 1,
          snapshot: { title: `Decided ${MARK}` },
          landsIn: sales,
          replaces: null,
        },
      ],
    });
    // Decided, as T353's rejection stores it.
    await getDb()
      .updateTable('proposals')
      .set({
        status: 'rejected',
        decided_by_key: `someone-${MARK}`,
        decided_by_name: 'Someone Else',
        decided_at: new Date(),
      })
      .where('id', '=', decided.id)
      .execute();
    const answer = await read('many', decided.id);
    expect(answer.statusCode).toBe(200);
    const { status, mayApprove, mayReject } = answer.json<{
      status: string;
      mayApprove: boolean;
      mayReject: boolean;
    }>();
    expect({ status, mayApprove, mayReject }).toEqual({
      status: 'rejected',
      mayApprove: false,
      mayReject: false,
    });
  });

  it('answers none for a proposal that isn’t there', async () => {
    expect((await read('super', randomUUID())).statusCode).toBe(404);
    expect((await read('super', 'not-an-id')).statusCode).toBe(404);
  });
});
