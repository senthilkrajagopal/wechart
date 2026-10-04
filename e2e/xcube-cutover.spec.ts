import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

import { expect, test, type APIRequestContext } from '@playwright/test';

import { CUBE, serviceToken, startApi, stopApi, type ApiProcess } from './api-process';
import { queryToken } from './tokens';
import { ownCubeFile } from './model-files';

/**
 * T447: the cut-over. xcube serves wechart's model from its own schema in the
 * metadata database; each API pushes its published files there (T419) and
 * signs every token with its model and revision (T421).
 *
 * AC-330 (its model part): Cube SHALL answer queries on published items with
 * every API replica stopped. `Fails when: … a query on a published item fails
 * while every API replica is stopped.` Shown on a second Cube process, started
 * after the publish on the same image, settings and database, with no route
 * to any API: its host name for the API is itself.
 *
 * AC-334: WHEN a change is published through any API replica, THE SYSTEM
 * SHALL answer every later query for that model, through any replica and on
 * any Cube instance, from that revision or a newer one. `Fails when: after a
 * publish is acknowledged, a query or the field list, through the other
 * replica or on the other Cube instance, answers from the previous revision
 * (a new member missing, or a removed one still listed); …` Shown with a
 * second API process on this suite's database, and the second Cube process.
 *
 * AC-335: only plain YAML is sent. `Fails when: a snapshot or a check sent to
 * xcube holds such a file, or xcube refuses a snapshot as holding one; …`
 * Shown on xcube's own record of the model: its content hash is the store's
 * plain YAML's, the seed's Jinja template kept out.
 */
const MODEL = 'e2e';

const docker = (...args: string[]) =>
  execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

/**
 * A token as wechart's API signs one (research, "Query tokens"): RS256 under
 * the pushed development key (T437, `e2e/tokens.ts`).
 */
function tokenFor(claims: {
  wechartModel?: string;
  wechartRevision?: number;
  groups?: string[];
}): string {
  return queryToken(claims);
}

/**
 * SQL in the metadata Postgres, as its admin. `psql -v` variables (`:'name'`)
 * keep text out of the statement; psql substitutes them only in SQL it reads,
 * not in `-c`, so the statement goes on stdin.
 */
const psql = (database: string, sql: string, variables: Record<string, string> = {}) =>
  execFileSync(
    'docker',
    [
      'exec',
      '-i',
      'wechart-meta',
      'psql',
      '-U',
      'wechart',
      '-d',
      database,
      '-v',
      'ON_ERROR_STOP=1',
      ...Object.entries(variables).flatMap(([name, value]) => ['-v', `${name}=${value}`]),
      '-At',
      '-f',
      '-',
    ],
    { encoding: 'utf8', input: sql, stdio: ['pipe', 'pipe', 'pipe'] },
  ).trim();

/** The revision this suite's API last recorded as xcube's (T419's `model_publications`). */
const recordedRevision = () =>
  Number(
    psql(
      'wechart_meta',
      `SELECT xcube_revision FROM model_publications WHERE model_id = '${MODEL}'`,
    ),
  );

/** A second Cube process: the running one's image, settings and mounts, with no admin routes and no route to an API. */
async function startCube(name: string): Promise<string> {
  docker('rm', '-f', name);
  const image = docker('inspect', '-f', '{{.Config.Image}}', 'wechart-cube');
  const env = (
    JSON.parse(docker('inspect', '-f', '{{json .Config.Env}}', 'wechart-cube')) as string[]
  )
    // Not an admin: this process only answers. With no service key (T420),
    // nor the admin token that preceded it, it serves no admin route.
    .filter(
      (entry) =>
        !entry.startsWith('XCUBE_ADMIN_TOKENS=') && !entry.startsWith('XCUBE_SERVICE_KEYS'),
    );
  docker(
    'run',
    '-d',
    '--name',
    name,
    '--network',
    'wechart_default',
    '--volumes-from',
    'wechart-cube:ro',
    // No API reachable from it, even were it to call one: its name for the
    // host, where the APIs run, is itself (D1's isolation).
    '--add-host',
    'host.docker.internal:127.0.0.1',
    '-p',
    '127.0.0.1::4000',
    ...env.flatMap((entry) => ['-e', entry]),
    image,
  );
  const port = docker('port', name, '4000/tcp').split(':').at(-1) ?? '';
  const url = `http://127.0.0.1:${port}`;
  await expect
    .poll(
      async () => {
        const ready = await fetch(`${url}/readyz`).catch(() => undefined);
        return ready?.status;
      },
      { timeout: 180_000, intervals: [1000] },
    )
    .toBe(200);
  return `${url}/cubejs-api`;
}

/**
 * Cube asked as wechart asks it: a Cube instance catching up to the revision
 * named answers 503 with `Retry-After: 2`, and a query Cube is still working
 * on answers "Continue wait"; both are asked again, as wechart does (T421,
 * T447's review). What comes back is the first real answer.
 */
async function askCube(
  url: string,
  claims: Record<string, unknown>,
): Promise<{ status: number; body: Record<string, unknown> }> {
  for (let ask = 0; ; ask += 1) {
    const response = await fetch(url, { headers: { authorization: `Bearer ${tokenFor(claims)}` } });
    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    const again =
      response.status === 503 || (response.status === 200 && body['error'] === 'Continue wait');
    if (!again || ask >= 20) return { status: response.status, body };
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}

const namesIn = (meta: unknown) =>
  ((meta as { cubes?: { name: string; measures?: { name: string }[] }[] }).cubes ?? []).flatMap(
    (cube) => [cube.name, ...(cube.measures ?? []).map((measure) => measure.name)],
  );

async function cubeMeta(cube: string, claims: Record<string, unknown>) {
  const { status, body } = await askCube(`${cube}/v1/meta`, claims);
  return { status, names: namesIn(body) };
}

async function cubeCount(cube: string, member: string, claims: Record<string, unknown>) {
  const query = encodeURIComponent(JSON.stringify({ measures: [`${member}.count`] }));
  const { status, body } = await askCube(`${cube}/v1/load?query=${query}`, claims);
  const data = body['data'] as Record<string, unknown>[] | undefined;
  return { status, count: Number(data?.[0]?.[`${member}.count`]) };
}

test.describe.serial('xcube serves the model (T447)', () => {
  test.setTimeout(300_000);
  let cube2 = '';
  let cubeName = '';
  let api2: ApiProcess | undefined;

  test.beforeAll(async () => {
    const testInfo = test.info();
    testInfo.setTimeout(300_000);
    cubeName = `wechart-cube-cutover-${testInfo.project.name}`;
    api2 = await startApi(4460 + testInfo.parallelIndex, { model: MODEL });
  });

  test.afterAll(async () => {
    await stopApi(api2?.process);
    if (cubeName !== '') docker('rm', '-f', cubeName);
  });

  test('a published cube is queried and listed on a Cube that no API can reach (D1, AC-330)', async ({
    request,
  }, testInfo) => {
    const cube = `e2e_cutover_${testInfo.project.name}`;
    await ownCubeFile(request, cube);
    // A Cube process started after the publish, which no API can reach.
    cube2 = await startCube(cubeName);

    // Asked as wechart asks, at the revision just recorded: it has it from
    // the database alone.
    const at = { wechartModel: MODEL, wechartRevision: recordedRevision() };
    const meta = await cubeMeta(cube2, at);
    expect(meta.status).toBe(200);
    expect(meta.names).toContain(cube);
    const counted = await cubeCount(cube2, cube, at);
    expect(counted.status).toBe(200);
    expect(counted.count).toBeGreaterThan(0);
  });

  test('a publish through one API process is in the field list at once through another (D2, AC-334)', async ({
    request,
  }, testInfo) => {
    const other = api2!.url;
    // Its field list cached before the publish.
    await (await fetch(`${other}/api/meta`)).json();
    const cube = `e2e_cutover_d2_${testInfo.project.name}_${String(Date.now())}`;

    await ownCubeFile(request, cube);

    // Sent as its changeset, not the whole model (T426): the revision that
    // holds it says so in its source.
    const revision = recordedRevision();
    const sources = JSON.parse(
      psql(
        'wechart_meta',
        `SELECT coalesce(json_agg(source), '[]') FROM xcube.revisions WHERE model = '${MODEL}' AND rev = ${String(revision)}`,
      ),
    ) as { reason?: string; via?: string }[];
    expect(sources).toEqual([{ reason: 'publish', via: 'changeset' }]);

    // At once: no wait, and not 60 s later.
    expect(namesIn(await (await fetch(`${other}/api/meta`)).json())).toContain(cube);
    const loaded = await fetch(`${other}/api/load`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: { measures: [`${cube}.count`] } }),
    });
    expect(loaded.status).toBe(200);
    // And on the other Cube instance, at the revision recorded: a 503 while
    // it catches up is waited out; an answer is never the older revision's.
    const at = { wechartModel: MODEL, wechartRevision: recordedRevision() };
    const meta = await cubeMeta(cube2, at);
    expect(meta.status).toBe(200);
    expect(meta.names).toContain(cube);
  });

  test('xcube holds the store’s plain YAML, and the template stays in wechart (AC-335)', async ({
    request,
  }) => {
    const stored = await filesOf(request);
    // The seed's template is in wechart's store, read-only (AC-140)…
    expect(stored.map((file) => file.path)).toContain('cubes/templated_example.yml');
    // …and never in xcube's: its hash is the plain YAML's, and nothing refused.
    // Every folder's, which xcube holds too (T452). A quiet moment between
    // the suite's other publishes.
    await expect
      .poll(async () => (await xcubeHead()) === hashOf(plainYaml(everyFolderIn('wechart_meta'))), {
        timeout: 60_000,
      })
      .toBe(true);
    const names = namesIn(await (await request.get('/api/meta')).json());
    expect(names).toContain('product_catalog');
    expect(names).not.toContain('templated_example');
  });

  /**
   * T449, AC-333: "It SHALL push its folder tree … when it starts and after
   * every folder change". Against the image itself: a folder made through the
   * API is in xcube's tree, so xcube resolves names from it (nearest first,
   * up to the root, `xcube-slice-3a.md`, "POST …/resolve"); once removed, it
   * isn't (`400 invalid_folders`).
   */
  test('a folder made or removed through the API is in xcube’s tree, or out of it, at once (AC-333)', async ({
    request,
  }) => {
    const made = await request.post('/api/documents', {
      data: { kind: 'folder', title: `Tree ${String(Date.now())}`, folderId: 'root' },
    });
    expect(made.status()).toBe(201);
    const { id } = (await made.json()) as { id: string };
    // A UUID folder's xcube id is `f` and its hex digits (T425).
    const folderId = `f${id.replaceAll('-', '').toLowerCase()}`;
    const resolve = async () => {
      const answer = await fetch(`${CUBE}/v1/semantic/models/${MODEL}/resolve`, {
        method: 'POST',
        headers: { authorization: `Bearer ${serviceToken()}`, 'content-type': 'application/json' },
        body: JSON.stringify({ folderId, names: ['orders'] }),
      });
      const body = (await answer.json()) as { names?: Record<string, string | null> };
      return { status: answer.status, orders: body.names?.['orders'] ?? null };
    };

    // In the tree: a root cube resolves from it by its bare name.
    await expect.poll(resolve, { timeout: 30_000 }).toEqual({ status: 200, orders: 'orders' });

    const removed = await request.delete(`/api/documents/folder/${id}`);
    expect(removed.status()).toBeLessThan(300);
    await expect.poll(async () => (await resolve()).status, { timeout: 30_000 }).toBe(400);
  });
});

/**
 * What needs a row in the store that no publish could make: an API of its own,
 * on a database and a model of its own, so the suite's `e2e` model is never
 * broken or behind while other specs publish.
 *
 * AC-333: `Fails when: 60 seconds after a publish, or after a send lost between
 * wechart's commit and xcube (the API stopped, or xcube unreachable), xcube's
 * current content hash differs from that of wechart's published plain YAML
 * files; …` A row written to the store with no API running is a commit whose
 * send was lost: the next API to start sends it.
 *
 * AC-235 (R29): a rollup Cube can't join `includes a rollup in a file the
 * change leaves alone that Cube already refused before it`: every break
 * refuses. A row the old draft check let through, written straight to the
 * store, is such a file.
 */
test.describe.serial('xcube and an API of its own (T447)', () => {
  test.setTimeout(300_000);
  let database = '';
  let model = '';
  let port = 0;
  let api: ApiProcess | undefined;

  test.beforeAll(async () => {
    const testInfo = test.info();
    testInfo.setTimeout(300_000);
    database = `wechart_cutover_${testInfo.project.name}`;
    model = `e2e-cutover-${testInfo.project.name}`;
    port = 4480 + testInfo.parallelIndex;
    // A new database each run: migrated and seeded by the API's first start.
    psql('wechart_meta', `DROP DATABASE IF EXISTS ${database} WITH (FORCE)`);
    psql('wechart_meta', `CREATE DATABASE ${database}`);
    api = await startApi(port, { database, model });
  });

  test.afterAll(async () => {
    await stopApi(api?.process);
    if (database !== '') psql('wechart_meta', `DROP DATABASE IF EXISTS ${database} WITH (FORCE)`);
  });

  test('a commit whose send was lost is sent by the next API to start (AC-333)', async () => {
    const cube = 'e2e_lost_send';
    // Its first start sent the seed: xcube holds the store's plain YAML.
    const filesOf = async () =>
      rootFilesIn(await (await fetch(`${api!.url}/api/model/files`)).json());
    await expect
      .poll(async () => (await xcubeHead(model)) === hashOf(plainYaml(await filesOf())), {
        timeout: 60_000,
      })
      .toBe(true);

    // Stopped, gone, and a file committed that no API sent.
    await stopApi(api!.process);
    psql(
      database,
      `INSERT INTO model_files (path, content) VALUES ('cubes/${cube}.yml', :'content')`,
      {
        content: `cubes:\n  - name: ${cube}\n    sql_table: public.products\n    measures:\n      - name: count\n        type: count\n`,
      },
    );
    const behind = await xcubeHead(model);
    expect(behind).not.toBe(hashOf(plainYaml(await filesInStore(database))));

    // The next start sends it: xcube's hash is the store's again, and Cube serves the cube.
    api = await startApi(port, { database, model });
    await expect
      .poll(async () => (await xcubeHead(model)) === hashOf(plainYaml(await filesOf())), {
        timeout: 60_000,
      })
      .toBe(true);
    // Cube switches to an import after answering it (research, Gotcha 3).
    await expect
      .poll(async () => (await cubeMeta(CUBE, { wechartModel: model })).names, { timeout: 30_000 })
      .toContain(cube);
  });

  /**
   * AC-333's "60 seconds after … a send lost": a commit whose send failed
   * while the API ran on (xcube unreachable, say) is sent by its reconcile,
   * every 60 s, with no publish and no restart.
   */
  test('a commit the running API didn’t send is sent by its reconcile within 60 s (AC-333)', async () => {
    test.setTimeout(180_000);
    const cube = 'e2e_reconciled';
    const filesOf = async () =>
      rootFilesIn(await (await fetch(`${api!.url}/api/model/files`)).json());
    psql(
      database,
      `INSERT INTO model_files (path, content) VALUES ('cubes/${cube}.yml', :'content')`,
      {
        content: `cubes:\n  - name: ${cube}\n    sql_table: public.products\n    measures:\n      - name: count\n        type: count\n`,
      },
    );
    const committedAt = Date.now();
    expect(await xcubeHead(model)).not.toBe(hashOf(plainYaml(await filesOf())));

    await expect
      .poll(async () => (await xcubeHead(model)) === hashOf(plainYaml(await filesOf())), {
        timeout: 90_000,
        intervals: [2000],
      })
      .toBe(true);
    // Within the 60 s, plus the compile xcube finishes before it answers a
    // snapshot (research, Gotcha 10), plus the poll's step.
    expect(Date.now() - committedAt).toBeLessThan(70_000);
  });

  test('a rollup its cubes can’t be joined for, in a file the change leaves alone, refuses the publish (AC-235)', async () => {
    const legacy = 'cubes/e2e_legacy_unjoinable.yml';
    // A cube on customers whose rollup names products, which it doesn't
    // join: the draft check let such a file through once it was refused.
    psql(database, `INSERT INTO model_files (path, content) VALUES (:'path', :'content')`, {
      path: legacy,
      content: [
        'cubes:',
        '  - name: e2e_legacy_unjoinable',
        '    sql_table: public.customers',
        '    dimensions:',
        '      - name: id',
        '        sql: id',
        '        type: number',
        '        primary_key: true',
        '    measures:',
        '      - name: count',
        '        type: count',
        '    pre_aggregations:',
        '      - name: by_category',
        '        measures: [count]',
        '        dimensions: [products.category]',
        '',
      ].join('\n'),
    });

    // A change to another file altogether, made as a shared model is changed
    // with sign-in off now (T451's switch; AC-254, R52): saved in My
    // workspace, whose overlay runs no rollup's probe, then proposed — the
    // landing's dry run, which checks every rollup.
    const post = (path: string, body: unknown) =>
      fetch(`${api!.url}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
    const folder = await post('/api/documents', {
      kind: 'folder',
      title: 'Unrelated',
      folderId: 'mine',
    });
    expect(folder.status).toBe(201);
    const project = ((await folder.json()) as { id: string }).id;
    const saved = await post('/api/model/publish', {
      folderId: project,
      targetFolderId: 'root',
      files: [
        {
          path: 'cubes/e2e_unrelated.yml',
          content:
            'cubes:\n  - name: e2e_unrelated\n    sql_table: public.products\n    measures:\n      - name: count\n        type: count\n',
        },
      ],
    });
    expect(saved.status, await saved.clone().text()).toBe(200);
    const { fileId } = (await (
      await fetch(
        `${api!.url}/api/model/files/dependents?folder=${project}&path=${encodeURIComponent('cubes/e2e_unrelated.yml')}`,
      )
    ).json()) as { fileId?: string };
    const published = await post('/api/proposals', { kind: 'model', id: fileId });
    const { errors } = (await published.json()) as {
      errors?: { path: string; message: string; preAggregation?: { cube: string; name: string } }[];
    };
    expect(published.status).toBe(422);
    expect(errors).toEqual([
      expect.objectContaining({
        path: legacy,
        preAggregation: expect.objectContaining({
          cube: 'e2e_legacy_unjoinable',
          name: 'by_category',
        }),
        message: expect.stringMatching(
          /^Pre-aggregation by_category can't be built: Cube cannot join its cubes\. Can't find join path to join .*'products'.*\.$/,
        ),
      }),
    ]);
    // Nothing published: the change is My workspace's alone.
    expect(everyFolderIn(database).map((file) => file.path)).not.toContain(
      'cubes/e2e_unrelated.yml',
    );
  });
});

/** The model files in a database, read there rather than through an API. */
async function filesInStore(database: string): Promise<File[]> {
  return JSON.parse(
    psql(
      database,
      `SELECT coalesce(json_agg(json_build_object('path', path, 'content', content)), '[]') FROM model_files`,
    ),
  ) as File[];
}

/** A model file; `folderId` is its folder's xcube id, the root's (`froot`) where absent. */
type File = { path: string; content: string; folderId?: string };

/**
 * Every published folder's model files in a database, each with its folder's
 * xcube id: what wechart sends xcube from T452. Not My workspace's, which
 * reach xcube only as overlays (T347), and which the single user's models are
 * all made in now (T451's switch).
 */
function everyFolderIn(database: string): File[] {
  return JSON.parse(
    psql(
      database,
      // A folder's id outlives it: only the root's and existing folders' files,
      // each folder reaching the root.
      `WITH RECURSIVE served(id) AS (
         SELECT 'root'::text
         UNION SELECT d.id FROM documents d JOIN served s ON d.folder_id = s.id WHERE d.kind = 'folder'
       )
       SELECT coalesce(json_agg(json_build_object('path', m.path, 'content', m.content, 'folderId', f.xcube_id)), '[]')
         FROM model_files m JOIN folder_xcube_ids f ON f.folder_id = m.folder_id
        WHERE m.folder_id IN (SELECT id FROM served)`,
    ),
  ) as File[];
}

const filesOf = async (request: APIRequestContext) =>
  rootFilesIn(await (await request.get('/api/model/files')).json());

/**
 * The root's files as the API lists them, by path and text: the folder it
 * names is wechart's id (T334), where `File`'s is xcube's.
 */
const rootFilesIn = (answer: unknown): File[] =>
  (answer as { files: File[] }).files.map(({ path, content }) => ({ path, content }));

/** xcube's rule, as T446 applies it (research xcube-slice-2.md, "Path rules"). */
const plainYaml = (files: readonly File[]) =>
  files.filter((file) => /\.ya?ml$/.test(file.path) && !/{%|%}|{{|}}/.test(file.content));

/**
 * xcube's items hash of the files, as wechart sends them from T449: each file
 * one item of its folder (the root's where it names none, T452), named for
 * the one cube or view it declares (`xcube-slice-3a.md`, "The items hash";
 * `packages/api/src/xcube/items.ts`).
 */
const hashOf = (files: readonly File[]) =>
  createHash('sha256')
    .update(
      JSON.stringify(
        files
          .flatMap(({ content, folderId = 'froot' }) => {
            const found = /^(cubes|views):\s*\n(?:\s*#.*\n)*\s*- name:\s*(\S+)/m.exec(content);
            return found === null
              ? []
              : [
                  {
                    folderId,
                    name: found[2]!,
                    kind: found[1] === 'cubes' ? 'cube' : 'view',
                    yaml: content,
                  },
                ];
          })
          .sort((a, b) => (`${a.folderId}/${a.name}` < `${b.folderId}/${b.name}` ? -1 : 1)),
      ),
      'utf8',
    )
    .digest('hex');

/** xcube's head of a model: its items hash, and its mode (T449). */
async function xcubeHead(model = MODEL): Promise<string | undefined> {
  const response = await fetch(`${CUBE}/v1/semantic/models/${model}/revision`, {
    headers: { authorization: `Bearer ${serviceToken()}` },
  });
  const head = (await response.json()) as { mode?: string; current?: { itemsHash?: string } };
  // Only an items-mode head is wechart's from T449; a file set never is.
  return head.mode === 'items' ? head.current?.itemsHash : undefined;
}
