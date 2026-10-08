import { describe, expect, it, vi } from 'vitest';

import type { ModelFile } from '../server';
import { xcubeAdmin } from './client';
import { fakeXcube, FAKE_ADMIN_TOKEN } from './fake';
import { treeHashOf, type TreeFolder } from './folders';
import { itemsHashOf, itemsOf } from './items';
import { memoryPublications } from './publications';
import { contentHashOf, modelSync } from './snapshot';

/**
 * T449, AC-333 as amended (R30): WHEN wechart's API starts, a publish is
 * committed, and every 60 seconds, THE SYSTEM SHALL compare xcube's current
 * revision of the deployment's model with wechart's published files, their
 * plain YAML alone (AC-335), and, when the items hash xcube reports differs
 * from wechart's (each file one item, AC-337), send the whole item set as the
 * model's next revision, recording the generation, revision and items hash
 * xcube acknowledges. It SHALL push its folder tree when it starts and after
 * every folder change, and compare the tree's hash with the one xcube
 * answers. It SHALL commit a publish to its own store before sending it, and
 * SHALL call xcube's admin routes with xcube's static admin token.
 * `Fails when: 60 seconds after a publish, or after a send lost between
 * wechart's commit and xcube …, xcube's current items hash differs from that
 * of wechart's published items; after a folder change, the tree hash xcube
 * answers differs from wechart's tree's; …; a publish through one deployment
 * changes another deployment's model; or an admin call is made without the
 * admin token, or with a user's token.`
 *
 * Against a stub xcube that answers as `docs/research/xcube-slice-3a.md`
 * records the fork's routes. The switch from slice 2's file set is one items
 * snapshot; no file set is sent again (research 3a, "Switch once", Gotcha 4).
 */
const CUBE_API_URL = 'http://cube.invalid/cubejs-api';
const ORDERS: ModelFile = { path: 'cubes/orders.yml', content: 'cubes:\n  - name: orders\n' };
const VIEWS: ModelFile = { path: 'views/sales.yml', content: 'views:\n  - name: sales\n' };
const ROOT_ONLY: readonly TreeFolder[] = [{ id: 'froot', parentId: null }];

function deployment(
  stub: ReturnType<typeof fakeXcube>,
  model = 'dev',
  {
    token = FAKE_ADMIN_TOKEN,
    start = 0,
    security,
  }: { token?: string; start?: number; security?: boolean } = {},
) {
  let files: readonly ModelFile[] = [ORDERS];
  let tree: readonly TreeFolder[] = ROOT_ONLY;
  let now = start;
  const publications = memoryPublications();
  const warn = vi.fn();
  /** When the files were read, among xcube's calls (T419's review). */
  const readAt: number[] = [];
  const sync = modelSync({
    model,
    admin: xcubeAdmin({ cubeApiUrl: CUBE_API_URL, model, token, fetch: stub.fetch }),
    files: async () => {
      readAt.push(stub.calls.length);
      return files;
    },
    tree: async () => tree,
    publications,
    log: { warn, info: vi.fn() },
    now: () => now,
    ...(security === undefined ? {} : { security }),
  });
  return {
    sync,
    publications,
    warn,
    readAt,
    setFiles: (next: readonly ModelFile[]) => {
      files = next;
    },
    setTree: (next: readonly TreeFolder[]) => {
      tree = next;
    },
    later: (ms: number) => {
      now += ms;
    },
  };
}

const snapshots = (stub: ReturnType<typeof fakeXcube>) =>
  stub.calls.filter((call) => call.method === 'PUT' && call.path.endsWith('/snapshot'));
const hashOf = (files: readonly ModelFile[]) => itemsHashOf(itemsOf(files));

describe('the content hash, as xcube computes it (T419)', () => {
  it('is the SHA-256 of the files sorted by path, as [{fileName, content}]', () => {
    // xcube's own test vector (research §"Input claims checked", row 29).
    expect(
      contentHashOf([
        { path: 'b/c.yml', content: 'views: []\n' },
        { path: 'a.yml', content: 'cubes: []\n' },
      ]),
    ).toBe('43efbceb5daf2a138cb1e7d88413bf03473b63bb62c1c3466b94ac3cc3a15045');
  });
});

describe('moving the model to items mode (T449, AC-333)', () => {
  it('sends a model xcube holds as a file set one items snapshot, with the tree, each file a root item', async () => {
    const stub = fakeXcube();
    stub.holdFiles('dev', [ORDERS, VIEWS]);
    const dev = deployment(stub);
    dev.setFiles([ORDERS, VIEWS]);

    expect(await dev.sync.sync('start')).toEqual({ kind: 'sent', revision: 2 });

    const sent = snapshots(stub);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.body).toEqual({
      baseRevision: 1,
      folders: ROOT_ONLY,
      items: [
        { folderId: 'froot', name: 'orders', kind: 'cube', yaml: ORDERS.content },
        { folderId: 'froot', name: 'sales', kind: 'view', yaml: VIEWS.content },
      ],
      source: { reason: 'start' },
    });
    expect(stub.head('dev')?.mode).toBe('items');
    expect(stub.head('dev')?.itemsHash).toBe(hashOf([ORDERS, VIEWS]));
    expect(await dev.publications.get('dev')).toEqual({
      generation: stub.head('dev')?.generation,
      revision: 2,
      contentHash: hashOf([ORDERS, VIEWS]),
    });
  });

  it('never sends a file set, so never meets xcube’s 409 mode', async () => {
    const stub = fakeXcube();
    stub.holdFiles('dev', [ORDERS]);
    const dev = deployment(stub);
    await dev.sync.sync('start');
    dev.setFiles([ORDERS, VIEWS]);
    await dev.sync.sync('publish');
    await dev.sync.sync('reconcile');

    for (const call of snapshots(stub)) {
      expect(call.body).not.toHaveProperty('files');
      expect(call.answered).not.toBe(409);
    }
    expect(stub.head('dev')?.itemsHash).toBe(hashOf([ORDERS, VIEWS]));
  });

  it('sends a model xcube doesn’t know yet as items, from no base', async () => {
    const stub = fakeXcube();
    const dev = deployment(stub);

    expect(await dev.sync.sync('start')).toEqual({ kind: 'sent', revision: 1 });
    expect(snapshots(stub)[0]?.body).toHaveProperty('baseRevision', null);
    expect(stub.head('dev')?.mode).toBe('items');
  });
});

describe('keeping xcube’s items up to date (T449, AC-333)', () => {
  it('sends nothing when xcube’s items hash is wechart’s', async () => {
    const stub = fakeXcube();
    const dev = deployment(stub);
    await dev.sync.sync('start');
    stub.calls.length = 0;

    dev.readAt.length = 0;
    expect(await dev.sync.sync('reconcile')).toEqual({ kind: 'same', revision: 1 });
    expect(snapshots(stub)).toEqual([]);
    // xcube's revision is read before the files are (T419's review): read the
    // other way round, older files could go out on a newer base.
    expect(stub.calls.map((call) => call.method)).toEqual(['GET']);
    expect(dev.readAt).toEqual([1]);
  });

  it('sends the changed items on xcube’s current revision after a publish', async () => {
    const stub = fakeXcube();
    const dev = deployment(stub);
    await dev.sync.sync('start');
    dev.setFiles([ORDERS, VIEWS]);

    expect(await dev.sync.sync('publish')).toEqual({ kind: 'sent', revision: 2 });
    expect(snapshots(stub).at(-1)?.body).toEqual({
      baseRevision: 1,
      folders: ROOT_ONLY,
      items: itemsOf([ORDERS, VIEWS]),
      source: { reason: 'publish' },
    });
    expect(stub.head('dev')?.itemsHash).toBe(hashOf([ORDERS, VIEWS]));
  });

  /**
   * T446, AC-335: only plain YAML is ever sent. A JavaScript, Python or
   * Jinja file already in wechart's store stays there, viewable read-only
   * with its reason (AC-140), and is never an item (T449).
   */
  it('sends only the plain YAML files, however many others the store holds', async () => {
    const stub = fakeXcube();
    const dev = deployment(stub);
    const others: ModelFile[] = [
      { path: 'cubes/dynamic.js', content: 'cube(`dynamic`, { sql_table: `t` });\n' },
      { path: 'cubes/generated.py', content: 'from cube import TemplateContext\n' },
      { path: 'cubes/macros.jinja', content: '{% macro m() %}{% endmacro %}\n' },
      { path: 'cubes/templated.yml', content: 'cubes:\n  - name: {{ name }}\n' },
      { path: 'cubes/opening.yaml', content: '# {%- set x = 1\ncubes: []\n' },
      { path: 'cubes/closing.yml', content: '# a comment }}\ncubes: []\n' },
    ];
    dev.setFiles([...others, ORDERS, VIEWS]);

    expect(await dev.sync.sync('start')).toEqual({ kind: 'sent', revision: 1 });
    const items = (snapshots(stub)[0]?.body as { items: { name: string }[] }).items;
    expect(items.map((item) => item.name)).toEqual(['orders', 'sales']);
    // What's recorded is what xcube holds: the plain YAML's items hash.
    expect((await dev.publications.get('dev'))?.contentHash).toBe(hashOf([ORDERS, VIEWS]));
    // And the next reconcile holds it the same: nothing to send.
    expect(await dev.sync.sync('reconcile')).toEqual({ kind: 'same', revision: 1 });
  });

  it('reads again and sends again on a conflict, three times at most', async () => {
    const stub = fakeXcube();
    const dev = deployment(stub);
    await dev.sync.sync('start');
    dev.setFiles([ORDERS, VIEWS]);

    // Another replica imports between this one's read and its send, once.
    stub.conflictNext(1);
    expect(await dev.sync.sync('publish')).toHaveProperty('kind', 'sent');

    // And every time: it gives up after three tries more, and says so.
    dev.setFiles([VIEWS]);
    stub.calls.length = 0;
    stub.conflictNext(99);
    expect(await dev.sync.sync('publish')).toEqual({ kind: 'failed' });
    expect(snapshots(stub).filter((call) => call.answered === 409).length).toBe(4);
    expect(dev.warn).toHaveBeenCalled();
  });

  it('logs a refusal, and doesn’t send the same items again for 10 minutes', async () => {
    const stub = fakeXcube();
    const dev = deployment(stub);
    stub.refuse([{ path: null, kind: 'compile', message: 'orders: bad' }]);

    expect(await dev.sync.sync('start')).toHaveProperty('kind', 'refused');
    expect(dev.warn).toHaveBeenCalledWith(
      expect.objectContaining({ errors: [expect.objectContaining({ message: 'orders: bad' })] }),
      expect.any(String),
    );
    expect(snapshots(stub)).toHaveLength(1);

    dev.later(9 * 60_000);
    expect(await dev.sync.sync('reconcile')).toEqual({ kind: 'skipped' });
    expect(snapshots(stub)).toHaveLength(1);

    dev.later(60_001);
    stub.refuse(undefined);
    expect(await dev.sync.sync('reconcile')).toHaveProperty('kind', 'sent');
    expect(snapshots(stub)).toHaveLength(2);
  });

  // T419's review: the memory is of the items refused, not a pause.
  it('sends different items at once after a refusal: a fix isn’t held back', async () => {
    const stub = fakeXcube();
    const dev = deployment(stub);
    stub.refuse([{ path: null, kind: 'compile', message: 'orders: bad' }]);
    expect(await dev.sync.sync('start')).toHaveProperty('kind', 'refused');

    stub.refuse(undefined);
    dev.setFiles([VIEWS]);
    dev.later(1_000);
    expect(await dev.sync.sync('publish')).toEqual({ kind: 'sent', revision: 1 });
  });

  it('starts over when xcube’s store is new: the recorded revision goes with its generation', async () => {
    const stub = fakeXcube();
    const dev = deployment(stub);
    dev.setFiles([ORDERS, VIEWS]);
    await dev.sync.sync('start');
    dev.setFiles([ORDERS]);
    await dev.sync.sync('publish');
    expect((await dev.publications.get('dev'))?.revision).toBe(2);

    // xcube's schema emptied and made again: a new generation, from nothing.
    stub.recreate();
    expect(await dev.sync.sync('reconcile')).toEqual({ kind: 'sent', revision: 1 });
    expect(await dev.publications.get('dev')).toEqual({
      generation: stub.head('dev')?.generation,
      revision: 1,
      contentHash: hashOf([ORDERS]),
    });
  });

  it('sends a publish lost on its way (xcube unreachable) at the next reconcile', async () => {
    const stub = fakeXcube();
    const dev = deployment(stub);
    await dev.sync.sync('start');

    // Committed in wechart's store, then xcube can't be reached.
    dev.setFiles([ORDERS, VIEWS]);
    stub.down(true);
    expect(await dev.sync.sync('publish')).toEqual({ kind: 'failed' });
    expect(dev.warn).toHaveBeenCalled();
    expect(stub.head('dev')?.itemsHash).toBe(hashOf([ORDERS]));

    stub.down(false);
    dev.later(60_000);
    expect(await dev.sync.sync('reconcile')).toEqual({ kind: 'sent', revision: 2 });
    expect(stub.head('dev')?.itemsHash).toBe(hashOf([ORDERS, VIEWS]));
  });

  it('keeps each deployment’s model to itself', async () => {
    const stub = fakeXcube();
    const dev = deployment(stub, 'dev');
    const demo = deployment(stub, 'demo');
    demo.setFiles([VIEWS]);
    await dev.sync.sync('start');
    await demo.sync.sync('start');

    dev.setFiles([ORDERS, VIEWS]);
    await dev.sync.sync('publish');

    expect(stub.head('demo')?.revision).toBe(1);
    expect(stub.head('demo')?.itemsHash).toBe(hashOf([VIEWS]));
    expect(stub.head('dev')?.revision).toBe(2);
  });

  // T419's review: what's recorded follows xcube's store even when a send fails.
  it('drops a revision of xcube’s old store from the record, even when the next send fails', async () => {
    const stub = fakeXcube();
    const dev = deployment(stub);
    await dev.sync.sync('start');
    dev.setFiles([ORDERS, VIEWS]);
    await dev.sync.sync('publish');
    expect((await dev.publications.get('dev'))?.revision).toBe(2);

    stub.recreate();
    stub.refuse([{ path: null, kind: 'compile', message: 'no' }]);
    expect(await dev.sync.sync('reconcile')).toHaveProperty('kind', 'refused');
    // xcube holds no revision of it now, and neither does the record.
    expect((await dev.publications.get('dev'))?.revision).toBe(0);
  });

  // T419's review: a reconcile asked for while one runs waits for it, merged.
  it('merges sends asked for while one runs into one more, never a queue', async () => {
    const stub = fakeXcube();
    const dev = deployment(stub);
    await dev.sync.sync('start');
    stub.calls.length = 0;

    await Promise.all([
      dev.sync.sync('reconcile'),
      dev.sync.sync('reconcile'),
      dev.sync.sync('reconcile'),
      dev.sync.sync('publish'),
    ]);
    expect(stub.calls.filter((call) => call.method === 'GET')).toHaveLength(2);
  });

  // T419's review: a publish waits for xcube's answer, but not for ever.
  it('gives up on an xcube that doesn’t answer, and says so', async () => {
    const stub = fakeXcube();
    stub.hang(true);
    const warn = vi.fn();
    const sync = modelSync({
      model: 'dev',
      admin: xcubeAdmin({
        cubeApiUrl: CUBE_API_URL,
        model: 'dev',
        token: FAKE_ADMIN_TOKEN,
        fetch: stub.fetch,
        timeoutMs: 50,
      }),
      files: async () => [ORDERS],
      tree: async () => ROOT_ONLY,
      publications: memoryPublications(),
      log: { warn, info: vi.fn() },
    });

    expect(await sync.sync('publish')).toEqual({ kind: 'failed' });
    expect(await sync.pushTree('start')).toEqual({ kind: 'failed' });
    expect(warn).toHaveBeenCalled();
  });

  it('calls xcube with its admin token, and nothing else, on every call', async () => {
    const stub = fakeXcube();
    const dev = deployment(stub);
    await dev.sync.sync('start');
    await dev.sync.pushTree('start');
    expect(stub.calls.length).toBeGreaterThan(0);
    for (const call of stub.calls) expect(call.authorization).toBe(`Bearer ${FAKE_ADMIN_TOKEN}`);

    // A wrong token is refused (401): nothing is stored, and it is said.
    const other = deployment(stub, 'dev', { token: 'x'.repeat(40) });
    other.setFiles([VIEWS]);
    expect(await other.sync.sync('publish')).toEqual({ kind: 'failed' });
    expect(stub.head('dev')?.itemsHash).toBe(hashOf([ORDERS]));
    expect(other.warn).toHaveBeenCalled();
  });
});

/**
 * T426: once a publish is committed, xcube is sent the changeset it was
 * checked as (research `xcube-slice-3a.md`, "POST …/changesets"), on xcube's
 * current revision, and what xcube acknowledges is recorded, as the tokens
 * name it (T421, AC-334). Unlike an items snapshot, a changeset leaves the
 * items it doesn't carry bound as they were (AC-275).
 */
describe('a publish sent as its changeset (T426)', () => {
  const changesetOf = (upserts: readonly ModelFile[]) => ({
    upserts: itemsOf(upserts),
    deletes: [],
  });
  const changesets = (stub: ReturnType<typeof fakeXcube>) =>
    stub.calls.filter((call) => call.path.endsWith('/changesets'));

  it('applies it on xcube’s current revision, and records what xcube acknowledged', async () => {
    const stub = fakeXcube();
    stub.holdItems('dev', itemsOf([ORDERS]));
    const dev = deployment(stub);
    dev.setFiles([ORDERS, VIEWS]);

    expect(await dev.sync.publish(changesetOf([VIEWS]))).toEqual({ kind: 'sent', revision: 2 });

    expect(changesets(stub).map((call) => call.body)).toEqual([
      {
        baseRevision: 1,
        upserts: itemsOf([VIEWS]),
        deletes: [],
        // Said in xcube's record of the revision, so a changeset is told from a snapshot.
        source: { reason: 'publish', via: 'changeset' },
      },
    ]);
    expect(snapshots(stub)).toEqual([]);
    expect(stub.head('dev')?.itemsHash).toBe(hashOf([ORDERS, VIEWS]));
    expect(await dev.publications.get('dev')).toEqual({
      generation: stub.head('dev')?.generation,
      revision: 2,
      contentHash: hashOf([ORDERS, VIEWS]),
    });
  });

  it('reads the head again and sends again on a stale base, and takes one xcube already holds as done', async () => {
    const stub = fakeXcube();
    stub.holdItems('dev', itemsOf([ORDERS]));
    const dev = deployment(stub);

    stub.conflictNext(1);
    expect(await dev.sync.publish(changesetOf([VIEWS]))).toHaveProperty('kind', 'sent');
    expect(changesets(stub).map((call) => call.answered)).toEqual([409, 201]);

    // The same changeset again: already in, whatever its base.
    expect(await dev.sync.publish(changesetOf([VIEWS]))).toHaveProperty('kind', 'same');
    expect(changesets(stub).at(-1)?.answered).toBe(200);
  });

  it('sends the whole model as items where there is no changeset, or xcube still holds a file set', async () => {
    const stub = fakeXcube();
    stub.holdFiles('dev', [ORDERS]);
    const dev = deployment(stub);
    dev.setFiles([ORDERS, VIEWS]);

    expect(await dev.sync.publish(changesetOf([VIEWS]))).toEqual({ kind: 'sent', revision: 2 });
    expect(changesets(stub)).toEqual([]);
    expect(snapshots(stub)).toHaveLength(1);
    expect(stub.head('dev')?.mode).toBe('items');

    dev.setFiles([VIEWS]);
    expect(await dev.sync.publish()).toEqual({ kind: 'sent', revision: 3 });
    expect(snapshots(stub)).toHaveLength(2);
  });

  it('logs a changeset xcube refuses, and gives up on one it can’t reach', async () => {
    const stub = fakeXcube();
    stub.holdItems('dev', itemsOf([ORDERS]));
    const dev = deployment(stub);
    stub.refuse([{ folderId: 'froot', name: 'sales', kind: 'compile', message: 'no' }]);

    expect(await dev.sync.publish(changesetOf([VIEWS]))).toHaveProperty('kind', 'refused');
    expect(dev.warn).toHaveBeenCalled();

    stub.refuse(undefined);
    stub.down(true);
    expect(await dev.sync.publish(changesetOf([VIEWS]))).toEqual({ kind: 'failed' });
  });
});

describe('the folder tree (T449, AC-333)', () => {
  const TREE: readonly TreeFolder[] = [
    { id: 'froot', parentId: null },
    { id: 'fa1', parentId: 'froot' },
  ];

  it('puts the tree, and answers the hash xcube acknowledged', async () => {
    const stub = fakeXcube();
    const dev = deployment(stub);
    dev.setTree(TREE);

    expect(await dev.sync.pushTree('folder')).toEqual({ kind: 'sent', hash: treeHashOf(TREE) });
    expect(stub.tree('dev')).toEqual(TREE);
  });

  it('puts it again when xcube answers a hash that isn’t the tree’s, and says so if it stays wrong', async () => {
    const stub = fakeXcube();
    const dev = deployment(stub);
    dev.setTree(TREE);

    stub.wrongTreeHashNext(1);
    expect(await dev.sync.pushTree('folder')).toEqual({ kind: 'sent', hash: treeHashOf(TREE) });
    const puts = () => stub.calls.filter((call) => call.path.endsWith('/folders'));
    expect(puts()).toHaveLength(2);

    stub.wrongTreeHashNext(99);
    expect(await dev.sync.pushTree('folder')).toEqual({ kind: 'failed' });
    expect(dev.warn).toHaveBeenCalled();
  });

  // T449's review: two folder changes close together never leave the older tree last.
  it('merges pushes asked for while one runs into one more, which puts the tree as it is then', async () => {
    const stub = fakeXcube();
    const dev = deployment(stub);
    dev.setTree(ROOT_ONLY);

    const first = dev.sync.pushTree('folder');
    dev.setTree(TREE);
    const second = dev.sync.pushTree('folder');
    const third = dev.sync.pushTree('folder');

    await Promise.all([first, second, third]);
    expect(stub.calls.filter((call) => call.path.endsWith('/folders'))).toHaveLength(2);
    expect(stub.tree('dev')).toEqual(TREE);
  });

  /**
   * T436 (AC-320): every folder's allowed groups, and whether security is
   * on, with the tree when the API starts and after every permission or
   * folder change (research `xcube-slice-4.md`, "PUT …/folders").
   */
  const GROUPED: readonly TreeFolder[] = [
    { id: 'froot', parentId: null, allowedGroups: ['g-ro', 'super'] },
    { id: 'fa1', parentId: 'froot', allowedGroups: ['g-ro', 'super'] },
  ];
  const folderPuts = (stub: ReturnType<typeof fakeXcube>) =>
    stub.calls.filter((call) => call.method === 'PUT' && call.path.endsWith('/folders'));

  it('puts every folder’s allowed groups, and whether security is on (T436, AC-320)', async () => {
    for (const security of [true, false]) {
      const stub = fakeXcube();
      const dev = deployment(stub, 'dev', { security });
      dev.setTree(GROUPED);

      expect(await dev.sync.pushTree('folder')).toEqual({
        kind: 'sent',
        hash: treeHashOf(GROUPED),
      });
      expect(folderPuts(stub).map((call) => call.body)).toEqual([{ folders: GROUPED, security }]);
      expect(stub.security('dev')).toBe(security);
    }
  });

  it('sends each folder’s allowed groups with every items snapshot, and not security, which one refuses (T436)', async () => {
    const stub = fakeXcube();
    const dev = deployment(stub, 'dev', { security: true });
    dev.setTree(GROUPED);

    await dev.sync.sync('start');

    const body = snapshots(stub)[0]?.body as Record<string, unknown>;
    expect(body['folders']).toEqual(GROUPED);
    expect(body).not.toHaveProperty('security');
  });

  it('puts the groups while xcube answers 409 older_instances, and turns security on once it doesn’t (T436)', async () => {
    const stub = fakeXcube();
    const dev = deployment(stub, 'dev', { security: true });
    dev.setTree(GROUPED);

    // An older xcube is connected: turning security on is refused, so the
    // tree and its groups go without it, and it is said (T436's review).
    stub.olderInstancesNext(1);
    expect(await dev.sync.pushTree('start')).toEqual({ kind: 'sent', hash: treeHashOf(GROUPED) });
    expect(folderPuts(stub).map((call) => call.body)).toEqual([
      { folders: GROUPED, security: true },
      { folders: GROUPED },
    ]);
    expect(stub.tree('dev')).toEqual(GROUPED);
    expect(stub.security('dev')).toBe(false);
    expect(dev.warn).toHaveBeenCalledWith(
      expect.objectContaining({ instances: ['xcube-v3-old'] }),
      'xcube runs an older instance that can’t hold security: the folders’ groups are put, and security is turned on at the next push',
    );

    // Retried, not dropped: the next push turns it on.
    expect(await dev.sync.pushTree('reconcile')).toEqual({
      kind: 'sent',
      hash: treeHashOf(GROUPED),
    });
    expect(stub.security('dev')).toBe(true);
  });

  it('sends the tree with every items snapshot', async () => {
    const stub = fakeXcube();
    const dev = deployment(stub);
    dev.setTree(TREE);

    await dev.sync.sync('start');

    expect((snapshots(stub)[0]?.body as { folders: TreeFolder[] }).folders).toEqual(TREE);
  });

  // T452, AC-328: a folder's files are its items, under its xcube id.
  it('sends each folder’s files as that folder’s items, under its xcube id', async () => {
    const stub = fakeXcube();
    const tree = [
      { id: 'froot', parentId: null },
      { id: 'fsales', parentId: 'froot' },
    ];
    const ids = new Map([
      ['root', 'froot'],
      ['sales', 'fsales'],
    ]);
    // A name of its own: one name is one item's across the model (R71).
    const SALES = 'cubes:\n  - name: sales_orders\n    sql_table: sales.orders\n';
    const inSales = { path: 'cubes/sales_orders.yml', content: SALES, folderId: 'sales' };
    const sync = modelSync({
      model: 'dev',
      admin: xcubeAdmin({
        cubeApiUrl: CUBE_API_URL,
        model: 'dev',
        token: FAKE_ADMIN_TOKEN,
        fetch: stub.fetch,
      }),
      files: async () => [ORDERS, inSales],
      tree: async () => tree,
      folderIds: async () => ids,
      publications: memoryPublications(),
      log: { warn: vi.fn(), info: vi.fn() },
    });

    expect(await sync.sync('start')).toEqual({ kind: 'sent', revision: 1 });
    expect((snapshots(stub)[0]?.body as { items: unknown }).items).toEqual([
      { folderId: 'froot', name: 'orders', kind: 'cube', yaml: ORDERS.content },
      { folderId: 'fsales', name: 'sales_orders', kind: 'cube', yaml: SALES },
    ]);
    // And nothing more once xcube holds them: the hash is taken the same way.
    expect(await sync.sync('reconcile')).toEqual({ kind: 'same', revision: 1 });
  });
});

/**
 * T765 (AC-330): WHEN wechart's API starts, THE SYSTEM SHALL bring xcube's
 * copy up to what wechart has published, a copy behind it included. A folder
 * deleted in wechart while xcube missed it, still holding a cube and its data
 * source there, refuses wechart's tree (`409 folder_in_use`). The start then
 * catches up in xcube's six steps (research `xcube-c2602ac72a.md`): its tree
 * read; wechart's tree with the folders xcube still holds things in, under
 * their parents there; the data sources; the items with that tree; the data
 * sources again, the old ones now unused; and wechart's own tree.
 */
describe('catching up a folder deleted while xcube missed it (T765, AC-330)', () => {
  const OLD = 'cubes:\n  - name: old_sales\n    sql_table: public.old\n';
  const NEW = 'cubes:\n  - name: new_sales\n    sql_table: public.new\n';

  it('keeps the folders xcube holds things in until their items are gone, then puts wechart’s tree', async () => {
    const stub = fakeXcube();
    let files: readonly ModelFile[] = [
      { path: 'cubes/old_sales.yml', content: OLD, folderId: 'w-old' },
    ];
    let tree: readonly TreeFolder[] = [
      { id: 'froot', parentId: null },
      { id: 'fold', parentId: 'froot' },
    ];
    let folderIds = new Map([
      ['root', 'froot'],
      ['w-old', 'fold'],
    ]);
    const sync = modelSync({
      model: 'dev',
      admin: xcubeAdmin({
        cubeApiUrl: CUBE_API_URL,
        model: 'dev',
        token: FAKE_ADMIN_TOKEN,
        fetch: stub.fetch,
      }),
      files: async () => files,
      tree: async () => tree,
      folderIds: async () => folderIds,
      publications: memoryPublications(),
      log: { warn: vi.fn(), info: vi.fn() },
    });
    // xcube's copy as an earlier start left it: /old's cube on /old's own data source.
    expect(await sync.pushTree('start')).toEqual({ kind: 'sent', hash: treeHashOf(tree) });
    expect((await sync.sync('start')).kind).toBe('sent');
    stub.holdConnections('dev', [{ folderId: 'fold', name: 'old_wh' }]);

    // wechart since: /old deleted, /new holding new_sales on /new's own data source.
    files = [{ path: 'cubes/new_sales.yml', content: NEW, folderId: 'w-new' }];
    tree = [
      { id: 'froot', parentId: null },
      { id: 'fnew', parentId: 'froot' },
    ];
    folderIds = new Map([
      ['root', 'froot'],
      ['w-new', 'fnew'],
    ]);
    expect(await sync.pushTree('start')).toEqual({ kind: 'in-use', folders: ['fold'] });

    // The data sources, as wechart's landing puts them and drops those nothing uses.
    const treesAtConnections: string[][] = [];
    const connections = async () => {
      treesAtConnections.push((stub.tree('dev') ?? []).map((folder) => folder.id).sort());
      const used = new Set((stub.head('dev')?.items ?? []).map((item) => item.folderId));
      stub.holdConnections('dev', [
        ...(used.has('fold') ? [{ folderId: 'fold', name: 'old_wh' }] : []),
        { folderId: 'fnew', name: 'new_wh' },
      ]);
    };
    expect(await sync.catchUp('start', connections)).toEqual({
      kind: 'sent',
      hash: treeHashOf(tree),
    });

    // Steps 3 and 5: the data sources put with /old still kept, then again once its items had gone.
    expect(treesAtConnections).toEqual([
      ['fnew', 'fold', 'froot'],
      ['fnew', 'fold', 'froot'],
    ]);
    // Step 6: wechart's tree, and its items alone.
    expect(stub.tree('dev')).toEqual(tree);
    expect(stub.head('dev')?.items.map(({ folderId, name }) => ({ folderId, name }))).toEqual([
      { folderId: 'fnew', name: 'new_sales' },
    ]);
  });
});
