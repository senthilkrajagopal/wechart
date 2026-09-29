import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { pgSessionStore } from '../auth/session-store';
import { PUBLIC_URL, signIn, USERS } from '../auth/sign-in.fixture';
import { closeDb, getDb } from '../db/client';
import { buildServer } from '../server';
import { catalog } from './catalog';
import { documents, type DocumentKind } from './documents';
import { folderAccessStore } from './folder-access';

/**
 * T325:
 *
 * AC-264: IF no AD group gives a user access to a folder, THEN THE SYSTEM SHALL
 * neither list it nor open it for them.
 *
 * AC-194: the tree's and the listings' counts count what the user may see,
 * subfolders included.
 *
 * AC-261: a grant reaches every descendant, whatever groups it sets.
 *
 * The listings' half: `/api/folders`, `/api/folder-roots`,
 * `/api/folders/:id/contents` and `/api/search` never name a folder or item
 * the user may not see, and every count counts only visible items. Opening
 * items and writing are T326's and T327's.
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
const { security: _on, ...off } = secured;
void _on;

const docs = () => documents(getDb());
/** In every title here, so a search finds this test's items and no other's. */
const TOKEN = `ca${randomUUID().slice(0, 8)}`;
const made: { kind: DocumentKind; id: string }[] = [];
const servers: FastifyInstance[] = [];

async function make(
  kind: 'folder' | 'dashboard' | 'chart',
  title: string,
  folderId: string,
  access?: { readOnly: string[] | null; readWrite: string[] | null },
): Promise<string> {
  const id = randomUUID();
  made.push({ kind, id });
  await docs().create({
    kind,
    id,
    body: { title: `${TOKEN} ${title}`, folderId, owner: 'admin', ...(access ? { access } : {}) },
  });
  return id;
}

function serving(config: typeof secured | typeof off): FastifyInstance {
  const app = buildServer({
    config,
    sessions: pgSessionStore(getDb()),
    documents: docs(),
    catalog: catalog(getDb()),
    folderAccess: folderAccessStore(getDb()),
  });
  servers.push(app);
  return app;
}

/**
 * The tree: A (read-write `sales-rw`) holds B (read-only `sales-ro`) and D (no
 * groups); C (no groups) sits beside A. The reader sees A only through B,
 * upward and view-only, so D, beside B, is hidden from them: a hidden folder
 * inside a visible one (T325's review).
 */
const tree = { a: '', b: '', c: '', d: '' };
const items: Record<string, string> = {};
let app: FastifyInstance;
const cookies: Record<string, string> = {};

beforeAll(async () => {
  tree.a = await make('folder', 'A', 'root', { readOnly: null, readWrite: ['sales-rw'] });
  tree.b = await make('folder', 'B', tree.a, { readOnly: ['sales-ro'], readWrite: null });
  tree.c = await make('folder', 'C', 'root');
  tree.d = await make('folder', 'D', tree.a);
  items['aDashboard'] = await make('dashboard', 'A dashboard', tree.a);
  items['aChart'] = await make('chart', 'A chart', tree.a);
  items['bDashboard'] = await make('dashboard', 'B dashboard', tree.b);
  items['bChart'] = await make('chart', 'B chart', tree.b);
  items['cDashboard'] = await make('dashboard', 'C dashboard', tree.c);
  items['dDashboard'] = await make('dashboard', 'D dashboard', tree.d);
  items['dChart'] = await make('chart', 'D chart', tree.d);
  app = serving(secured);
  for (const who of ['super', 'writer', 'reader', 'nobody']) {
    cookies[who] = await signIn(app, USERS[who]!);
  }
});

afterAll(async () => {
  await Promise.all(servers.map((server) => server.close()));
  for (const { kind, id } of made) await docs().remove(kind, id);
  await closeDb();
});

const ask = async (url: string, who?: string, on: FastifyInstance = app) =>
  on.inject({ method: 'GET', url, headers: who === undefined ? {} : { cookie: cookies[who]! } });

/** This test's folders in the tree, by name, with their counts. */
async function treeOf(who: string, on: FastifyInstance = app) {
  const folders = (await ask('/api/folders', who, on)).json<{ id: string; itemCount: number }[]>();
  const name = new Map([
    [tree.a, 'A'],
    [tree.b, 'B'],
    [tree.c, 'C'],
    [tree.d, 'D'],
  ]);
  return Object.fromEntries(
    folders
      .filter((folder) => name.has(folder.id))
      .map((folder) => [name.get(folder.id), folder.itemCount]),
  );
}

/** A folder's contents as this test names them; only this test's items, in the root. */
async function contentsOf(folder: string, who: string) {
  const response = await ask(`/api/folders/${folder}/contents`, who);
  if (response.statusCode !== 200) return response.statusCode;
  return response
    .json<{ kind: string; title: string; itemCount: number | null }[]>()
    .filter((item) => item.title.startsWith(`${TOKEN} `))
    .map(
      (item) =>
        `${item.kind} ${item.title.replace(`${TOKEN} `, '')}${item.itemCount === null ? '' : ` (${String(item.itemCount)})`}`,
    )
    .sort();
}

async function searchOf(who: string, on: FastifyInstance = app, more = '') {
  const found = (await ask(`/api/search?q=${TOKEN}${more}`, who, on)).json<{ title: string }[]>();
  return found.map((item) => item.title.replace(`${TOKEN} `, '')).sort();
}

const EVERYTHING = [
  'A chart',
  'A dashboard',
  'B chart',
  'B dashboard',
  'C dashboard',
  'D chart',
  'D dashboard',
];

describe('the tree lists and counts only what the user may see (T325, AC-264, AC-194, AC-261)', () => {
  it('gives a Super-Admin every folder, each counting everything beneath it', async () => {
    expect(await treeOf('super')).toEqual({ A: 6, B: 2, C: 1, D: 2 });
  });

  it('gives a read-write member of A the folder and all beneath it, and nothing beside it', async () => {
    // A's grant reaches B and D, whatever they set (AC-261): all their items count.
    expect(await treeOf('writer')).toEqual({ A: 6, B: 2, D: 2 });
  });

  it('gives a read-only member of A/B the dashboards there and above, and counts only those', async () => {
    // A is B's ancestor: seen, view-only, for its dashboards (AC-263). D, beside
    // B, is hidden, and what it holds counts nowhere.
    expect(await treeOf('reader')).toEqual({ A: 2, B: 1 });
  });

  it('gives someone in no group none of them, and no root at all', async () => {
    expect(await treeOf('nobody')).toEqual({});
    // Not the shared root, which no grant lets them see (T331, AC-194; design
    // 09, state G), and no My workspace: in no group, they write nowhere
    // (T343, AC-277).
    expect((await ask('/api/folder-roots', 'nobody')).json()).toEqual({});
    // The root a grant beneath it lets them see, view-only, is theirs (AC-262, AC-263).
    expect(Object.keys((await ask('/api/folder-roots', 'reader')).json())).toEqual(['root']);
    expect(Object.keys((await ask('/api/folder-roots', 'writer')).json()).sort()).toEqual([
      'mine',
      'root',
    ]);
  });
});

describe('a folder’s contents (T325, AC-264, AC-194)', () => {
  it('lists what the user may see there, counted as they may see it', async () => {
    expect(await contentsOf(tree.a, 'writer')).toEqual([
      'chart A chart',
      'dashboard A dashboard',
      'folder B (2)',
      'folder D (2)',
    ]);
    // Neither D, hidden inside the visible A, nor A's chart.
    expect(await contentsOf(tree.a, 'reader')).toEqual(['dashboard A dashboard', 'folder B (1)']);
    expect(await contentsOf(tree.b, 'reader')).toEqual(['dashboard B dashboard']);
  });

  it('lists the root’s visible folders beside hidden ones, and an empty root to someone in no group', async () => {
    expect(await contentsOf('root', 'writer')).toEqual(['folder A (6)']);
    expect(await contentsOf('root', 'reader')).toEqual(['folder A (2)']);
    // Explore opens on the root: nothing there for them, not an error (T325's review).
    expect(await contentsOf('root', 'nobody')).toEqual([]);
    // My workspace: each read-write member's own (T343), and empty here.
    expect(await contentsOf('mine', 'writer')).toEqual([]);
    expect((await ask('/api/folder-roots', 'writer')).json<{ mine: number }>().mine).toBe(0);
  });

  it('answers 404 for a folder the user may not see, as for one that isn’t there', async () => {
    const missing = await ask(`/api/folders/${randomUUID()}/contents`, 'writer');
    expect(missing.statusCode).toBe(404);
    for (const [folder, who] of [
      [tree.a, 'nobody'],
      [tree.c, 'writer'],
      [tree.c, 'reader'],
      [tree.d, 'reader'],
    ] as const) {
      const hidden = await ask(`/api/folders/${folder}/contents`, who);
      expect(hidden.statusCode, `${who} in ${folder}`).toBe(404);
      expect(hidden.json(), `${who} in ${folder}`).toEqual(missing.json());
    }
  });
});

describe('search (T325, AC-264)', () => {
  it('finds only what the user may see', async () => {
    expect(await searchOf('super')).toEqual(EVERYTHING);
    expect(await searchOf('writer')).toEqual(EVERYTHING.filter((title) => !title.startsWith('C')));
    expect(await searchOf('reader')).toEqual(['A dashboard', 'B dashboard']);
    expect(await searchOf('nobody')).toEqual([]);
  });

  it('narrows before the limit, so hidden items crowd out nothing, and by kind too', async () => {
    // "A chart" sorts first, and is hidden from the reader.
    expect(await searchOf('reader', app, '&limit=1')).toEqual(['A dashboard']);
    expect(await searchOf('reader', app, '&kind=chart')).toEqual([]);
    expect(await searchOf('writer', app, '&kind=chart')).toEqual(['A chart', 'B chart', 'D chart']);
  });
});

describe('with security off (T325)', () => {
  it('lists, counts and finds everything, as phase 1 did', async () => {
    const single = serving(off);
    expect(await treeOf('super', single)).toEqual({ A: 6, B: 2, C: 1, D: 2 });
    expect(await searchOf('super', single)).toEqual(EVERYTHING);
  });
});

/**
 * T331 (AC-194; UX-239): models and data sources are folder items (T334,
 * T335), so a folder's count holds those the user may see too: every kind
 * for a read-write member, and for a read-only one, dashboards alone (AC-263).
 *
 * E (read-write `sales-rw`) holds a model and a data source, and F (read-only
 * `sales-ro`) inside it a dashboard, a model and a data source. Last in the
 * file: the listings and searches above expect none of it.
 */
describe('counts hold the models and data sources the user may see (T331, AC-194)', () => {
  const more = { e: '', f: '' };
  const paths: { folder: string; path: string }[] = [];
  const sources: string[] = [];
  const model = async (folderId: string, path: string) => {
    await getDb()
      .insertInto('model_files')
      .values({ folder_id: folderId, path, content: 'cubes: []\n' })
      .execute();
    paths.push({ folder: folderId, path });
  };
  const source = async (folderId: string, name: string) => {
    const id = randomUUID();
    await getDb()
      .insertInto('data_sources')
      .values({ id, folder_id: folderId, name, type: 'postgres', settings: '{}' })
      .execute();
    sources.push(id);
  };

  beforeAll(async () => {
    more.e = await make('folder', 'E', 'root', { readOnly: null, readWrite: ['sales-rw'] });
    more.f = await make('folder', 'F', more.e, { readOnly: ['sales-ro'], readWrite: null });
    await model(more.e, `${TOKEN}/e.yml`);
    await source(more.e, `${TOKEN}_e`);
    await make('dashboard', 'F dashboard', more.f);
    await model(more.f, `${TOKEN}/f.yml`);
    await source(more.f, `${TOKEN}_f`);
  });

  afterAll(async () => {
    for (const { folder, path } of paths)
      await getDb()
        .deleteFrom('model_files')
        .where('folder_id', '=', folder)
        .where('path', '=', path)
        .execute();
    if (sources.length > 0)
      await getDb().deleteFrom('data_sources').where('id', 'in', sources).execute();
  });

  const counted = async (who: string, on: FastifyInstance = app) => {
    const folders = (await ask('/api/folders', who, on)).json<
      { id: string; itemCount: number }[]
    >();
    const count = (id: string) => folders.find((folder) => folder.id === id)?.itemCount;
    return { E: count(more.e), F: count(more.f) };
  };

  it('counts every kind for a Super-Admin and a read-write member, subfolders included', async () => {
    expect(await counted('super')).toEqual({ E: 5, F: 3 });
    expect(await counted('writer')).toEqual({ E: 5, F: 3 });
    // And a subfolder's count in its folder's listing (AC-193).
    const listed = (await ask(`/api/folders/${more.e}/contents`, 'writer')).json<
      { id: string; itemCount: number | null }[]
    >();
    expect(listed.find((item) => item.id === more.f)?.itemCount).toBe(3);
  });

  it('counts only the dashboards for a read-only member, never a model or data source', async () => {
    expect(await counted('reader')).toEqual({ E: 1, F: 1 });
    expect(await counted('nobody')).toEqual({ E: undefined, F: undefined });
  });

  it('counts every kind with security off, as the one user sees them', async () => {
    expect(await counted('super', serving(off))).toEqual({ E: 5, F: 3 });
  });
});
