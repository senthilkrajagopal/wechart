import { describe, expect, it } from 'vitest';

import { XcubeError, xcubeAdmin } from './client';

/**
 * T419, AC-333: xcube's admin answers, read as the research records them
 * (`docs/research/xcube-slice-2.md`, "Error body"): what is a refusal of the
 * files, which xcube gives every time for the same set, and what is a failure
 * to be tried again later.
 */
const answering = (status: number, body: Record<string, unknown>) =>
  xcubeAdmin({
    cubeApiUrl: 'http://cube.invalid/cubejs-api',
    model: 'dev',
    token: 'x'.repeat(40),
    fetch: async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
  });
const send = (status: number, body: Record<string, unknown>) =>
  answering(status, body).itemsSnapshot({ baseRevision: null, folders: [], items: [] });

/**
 * T420 / AC-326, AC-333: xcube's admin routes are called with the service
 * credential (slice 4), a token minted for each call, never the static admin
 * token nor a user's.
 */
describe('the credential xcube’s admin routes are called with', () => {
  it('sends the token its source mints, for each call', async () => {
    const sent: (string | null)[] = [];
    let minted = 0;
    const admin = xcubeAdmin({
      cubeApiUrl: 'http://cube.invalid/cubejs-api',
      model: 'dev',
      token: async () => `service-token-${String((minted += 1))}`,
      fetch: async (_url, init) => {
        sent.push(new Headers(init?.headers).get('authorization'));
        return new Response(JSON.stringify({ items: [] }), { status: 200 });
      },
    });

    await admin.items();
    await admin.items();

    expect(sent).toEqual(['Bearer service-token-1', 'Bearer service-token-2']);
  });
});

describe('xcube’s answers (T419, AC-333)', () => {
  /**
   * An items snapshot (T449; research `xcube-slice-3a.md`, "PUT …/snapshot
   * with items"): a tree or a size xcube won't take is refused as surely as
   * items that don't compile, every time for the same set.
   */
  it('reads a tree or a size xcube won’t take, or items it refuses, as a refusal', async () => {
    for (const [status, code] of [
      [400, 'invalid_folders'],
      [413, 'too_large'],
      // Joi's refusal of the same body, every time (T449's review): a name
      // past its 64 characters, say. Not sent again every 60 s.
      [400, 'bad_request'],
    ] as const) {
      expect(await send(status, { error: `${code}!`, code }), code).toMatchObject({
        kind: 'refused',
        errors: [{ folderId: null, name: null, message: `${code}!` }],
      });
    }
    expect(
      await send(422, {
        error: 'The items do not compile',
        code: 'invalid_items',
        errors: [{ folderId: 'froot', name: 'orders', kind: 'compile', message: 'no' }],
        cubeMessage: 'Cube said no',
      }),
    ).toEqual({
      kind: 'refused',
      errors: [{ folderId: 'froot', name: 'orders', kind: 'compile', message: 'no' }],
      cubeMessage: 'Cube said no',
    });
  });

  it('reads a stored items snapshot, and a conflict with the head’s revision', async () => {
    expect(
      await send(201, {
        model: 'dev',
        generation: 'g1',
        revision: 4,
        created: true,
        contentHash: 'c'.repeat(64),
        itemsHash: 'i'.repeat(64),
        items: [],
      }),
    ).toEqual({
      kind: 'stored',
      generation: 'g1',
      revision: 4,
      itemsHash: 'i'.repeat(64),
      created: true,
    });
    expect(await send(409, { error: 'stale', code: 'conflict', currentRevision: 5 })).toEqual({
      kind: 'conflict',
      currentRevision: 5,
    });
  });

  /**
   * A check's refusal of a file it names (T445's review): xcube's
   * `invalid_file_type` message leads with the path (research, "Path rules").
   */
  it('places a check’s refusal on the file xcube names, and on none where it names none', async () => {
    const files = [
      { path: 'cubes/a.yml', content: 'cubes: []\n' },
      { path: 'cubes/b.yml', content: 'cubes: []\n' },
    ];
    const check = (body: Record<string, unknown>, status = 400) =>
      answering(status, body).check({ files, securityContext: {}, probes: [] });

    expect(
      await check({
        error: 'cubes/b.yml: only plain YAML models are taken (no JavaScript, Python or Jinja)',
        code: 'invalid_file_type',
      }),
    ).toEqual({
      valid: false,
      errors: [
        {
          path: 'cubes/b.yml',
          kind: 'compile',
          message: 'cubes/b.yml: only plain YAML models are taken (no JavaScript, Python or Jinja)',
        },
      ],
      cubeMessage: null,
      probes: [],
    });
    expect(await check({ error: 'Too many files', code: 'too_large' }, 413)).toMatchObject({
      valid: false,
      errors: [{ path: null, message: 'Too many files' }],
    });
    await expect(check({ error: 'Bad JSON', code: 'bad_request' })).rejects.toThrow(XcubeError);
  });

  it('fails, to be tried again, on a busy or unavailable xcube, its own error, or a mode it won’t take', async () => {
    for (const [status, code] of [
      [503, 'busy'],
      [503, 'unavailable'],
      [500, 'internal'],
      [401, 'unauthorized'],
      // Never a conflict to read again and retry (T449's review).
      [409, 'mode'],
    ] as const) {
      const failed = await send(status, { error: 'no', code }).catch((error: unknown) => error);
      expect(failed, code).toBeInstanceOf(XcubeError);
      expect((failed as XcubeError).code).toBe(code);
      expect((failed as XcubeError).status).toBe(status);
    }
  });

  /**
   * T426: a publish as a changeset (research `xcube-slice-3a.md`, "POST
   * …/changesets" and "?dryRun=true"): checked by its dry run, then applied.
   */
  it('checks a changeset by its dry run, with its errors on items', async () => {
    const calls: { url: string; body: unknown }[] = [];
    const admin = xcubeAdmin({
      cubeApiUrl: 'http://cube.invalid/cubejs-api',
      model: 'dev',
      token: 'x'.repeat(40),
      fetch: async (input, init) => {
        calls.push({ url: String(input), body: JSON.parse(String(init?.body)) });
        return new Response(
          JSON.stringify({
            model: 'dev',
            valid: false,
            errors: [{ folderId: 'froot', name: 'orders', kind: 'yaml', line: 3, message: 'bad' }],
            cubeMessage: null,
            probes: [],
            itemsHash: null,
            currentRevision: 7,
            items: [],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      },
    });
    const upserts = [{ folderId: 'froot', name: 'orders', kind: 'cube' as const, yaml: 'x' }];

    expect(
      await admin.checkChangeset({ upserts, deletes: [], securityContext: {}, probes: [] }),
    ).toEqual({
      valid: false,
      errors: [{ folderId: 'froot', name: 'orders', kind: 'yaml', line: 3, message: 'bad' }],
      cubeMessage: null,
      probes: [],
      currentRevision: 7,
      items: [],
    });
    expect(calls[0]?.url).toBe(
      'http://cube.invalid/cubejs-api/v1/semantic/models/dev/changesets?dryRun=true',
    );
    expect(calls[0]?.body).toEqual({
      baseRevision: null,
      upserts,
      deletes: [],
      securityContext: {},
      probes: [],
    });
  });

  /**
   * T456 (AC-321; research `xcube-meta-revision-and-bindings.md`, `ItemRef`):
   * a dry run's items, each bound as it would land, a cube with its data
   * source, a view with none; an entry not shaped so is left out.
   */
  it('gives each item a dry run would make, with what it would bind to', async () => {
    // A cube extending another, its data source its parent's; a view, with none.
    const child = { folderId: 'fsales', name: 'child', fullName: 'fsales__child', bindings: {} };
    const summary = {
      folderId: 'froot',
      name: 'summary',
      fullName: 'summary',
      bindings: { lines: 'fsales__lines' },
    };
    const admin = answering(200, {
      model: 'dev',
      valid: true,
      errors: [],
      cubeMessage: null,
      probes: [],
      itemsHash: 'i'.repeat(64),
      currentRevision: 8,
      items: [
        {
          folderId: 'fsales',
          name: 'lines',
          fullName: 'fsales__lines',
          bindings: { orders: 'orders', odd: 3 },
          dataSource: 'fsales__warehouse',
        },
        { ...child, dataSource: null },
        summary,
        { folderId: 'froot', name: 'broken' },
      ],
    });
    const answer = await admin.checkChangeset({
      upserts: [],
      deletes: [],
      securityContext: {},
      probes: [],
    });
    expect(answer.items).toEqual([
      {
        folderId: 'fsales',
        name: 'lines',
        fullName: 'fsales__lines',
        bindings: { orders: 'orders' },
        dataSource: 'fsales__warehouse',
      },
      { ...child, dataSource: null },
      summary,
    ]);
  });

  it('applies a changeset: stored, already in, a stale base, or refused', async () => {
    const apply = (status: number, body: Record<string, unknown>) =>
      answering(status, body).applyChangeset({ baseRevision: 3, upserts: [], deletes: [] });

    expect(
      await apply(201, {
        generation: 'g1',
        revision: 4,
        created: true,
        itemsHash: 'i'.repeat(64),
        contentHash: 'c'.repeat(64),
        items: [],
      }),
    ).toEqual({
      kind: 'stored',
      generation: 'g1',
      revision: 4,
      itemsHash: 'i'.repeat(64),
      created: true,
    });
    // A retry xcube already holds: done, whatever its base.
    expect(
      await apply(200, {
        generation: 'g1',
        revision: 4,
        created: false,
        itemsHash: 'i'.repeat(64),
      }),
    ).toMatchObject({ kind: 'stored', created: false });
    expect(await apply(409, { code: 'conflict', currentRevision: 5 })).toEqual({
      kind: 'conflict',
      currentRevision: 5,
    });
    expect(
      await apply(422, { code: 'invalid_items', errors: [{ message: 'no' }], cubeMessage: null }),
    ).toEqual({ kind: 'refused', errors: [{ message: 'no' }], cubeMessage: null });
    // A model still holding a file set: a failure, never a conflict to retry.
    await expect(apply(409, { code: 'mode', error: 'files' })).rejects.toBeInstanceOf(XcubeError);
  });

  it('reads the head’s mode and items hash, null for a files-mode revision (T449)', async () => {
    const head = (current: Record<string, unknown> | null, mode = 'items') =>
      answering(200, { model: 'dev', generation: 'g1', mode, current }).revision();

    expect(
      await head({ revision: 3, contentHash: 'c'.repeat(64), itemsHash: 'i'.repeat(64) }),
    ).toEqual({
      generation: 'g1',
      mode: 'items',
      current: { revision: 3, itemsHash: 'i'.repeat(64) },
    });
    expect(
      await head({ revision: 2, contentHash: 'c'.repeat(64), itemsHash: null }, 'files'),
    ).toEqual({ generation: 'g1', mode: 'files', current: { revision: 2, itemsHash: null } });
    // A model whose tree was put but holds no revision yet.
    expect(await head(null, 'files')).toEqual({ generation: 'g1', mode: 'files', current: null });
  });

  it('puts the folder tree, and reads the tree hash xcube answers (T449)', async () => {
    const tree = [{ id: 'froot', parentId: null }];
    expect(await answering(200, { model: 'dev', hash: 'h'.repeat(64) }).folders(tree)).toEqual({
      hash: 'h'.repeat(64),
    });
    await expect(
      answering(400, {
        error: 'The tree has no root folder froot',
        code: 'invalid_folders',
      }).folders([]),
    ).rejects.toBeInstanceOf(XcubeError);
  });

  it('reads a model never imported as no base, and a 404 of anything else as a failure', async () => {
    expect(
      await answering(404, { error: 'Unknown model "dev"', code: 'unknown_model' }).revision(),
    ).toEqual({ generation: '', mode: 'files', current: null });
    // The admin routes off (a refresh worker, or no token set): not "no base".
    await expect(answering(404, { error: 'Not found' }).revision()).rejects.toBeInstanceOf(
      XcubeError,
    );
  });

  /**
   * T429, AC-272 (research 3a, "POST …/resolve", "GET …/items"). T701
   * (AC-421): from `256d632371` a name means the one item holding it, in any
   * case and any folder, answered by its own stored name; the folder asked
   * from is only checked to be in the tree (research `xcube-256d632371.md`,
   * 3.3).
   */
  it('resolves each name to the item holding it, in any case and any folder, by its own name, or none', async () => {
    const asked: unknown[] = [];
    const admin = xcubeAdmin({
      cubeApiUrl: 'http://cube.invalid/cubejs-api',
      model: 'dev',
      token: 'x'.repeat(40),
      fetch: async (_input, init) => {
        asked.push(JSON.parse(String(init?.body)));
        return new Response(
          JSON.stringify({
            model: 'dev',
            revision: 4,
            folderId: 'fsales',
            names: { Sales: 'sales', orders: 'orders', nothing: null },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      },
    });

    expect(await admin.resolve('fsales', ['Sales', 'orders', 'nothing'])).toEqual(
      new Map([
        ['Sales', 'sales'],
        ['orders', 'orders'],
        ['nothing', null],
      ]),
    );
    expect(asked).toEqual([{ folderId: 'fsales', names: ['Sales', 'orders', 'nothing'] }]);
    await expect(
      answering(400, {
        error: 'Folder fnope is not in the folder tree',
        code: 'invalid_folders',
      }).resolve('fnope', ['sales']),
    ).rejects.toBeInstanceOf(XcubeError);
  });

  it('reads each item with its full name and the bindings it was published with', async () => {
    // As `256d632371` answers: every name bare, `fullName` the name (T701).
    const items = await answering(200, {
      model: 'dev',
      revision: 4,
      mode: 'items',
      items: [
        {
          folderId: 'fsales',
          name: 'sales',
          kind: 'cube',
          fullName: 'sales',
          bindings: { sales: 'sales', customers: 'customers' },
          dataSource: 'warehouse',
        },
        // An answer without `fullName`: the item is known by its own name, in
        // any folder, never by a folder-prefixed one.
        { folderId: 'fops', name: 'stock', kind: 'view', bindings: {} },
      ],
    }).items();

    expect(items).toEqual([
      {
        folderId: 'fsales',
        name: 'sales',
        kind: 'cube',
        fullName: 'sales',
        bindings: { sales: 'sales', customers: 'customers' },
        dataSource: 'warehouse',
      },
      { folderId: 'fops', name: 'stock', kind: 'view', fullName: 'stock', bindings: {} },
    ]);
  });

  /**
   * T459 (AC-157; research xcube-e53cf2a8b8.md, "GET …/items"): a cube's
   * data source as bound at publish — a full name, `default`, or `null` for
   * one that `extends` another — and none on a view. An older image sends
   * none on a cube either: unknown, never taken for `default`.
   */
  it('gives up on a read of the items at the wait it is asked for, not a publish’s (T459’s review)', async () => {
    const hung = xcubeAdmin({
      cubeApiUrl: 'http://cube.invalid/cubejs-api',
      model: 'dev',
      token: 'x'.repeat(40),
      fetch: (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
        }),
    });
    const started = Date.now();
    await expect(hung.items({ timeoutMs: 50 })).rejects.toThrow();
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it('reads each cube’s bound data source, none on a view, and none known from an older image', async () => {
    const items = await answering(200, {
      model: 'dev',
      revision: 5,
      mode: 'items',
      items: [
        { folderId: 'froot', name: 'orders', kind: 'cube', bindings: {}, dataSource: 'default' },
        { folderId: 'fa', name: 'child', kind: 'cube', bindings: {}, dataSource: null },
        { folderId: 'fa', name: 'summary', kind: 'view', bindings: {} },
        { folderId: 'fa', name: 'old', kind: 'cube', bindings: {} },
      ],
    }).items();

    expect(items.map(({ name, kind, dataSource }) => ({ name, kind, dataSource }))).toEqual([
      { name: 'orders', kind: 'cube', dataSource: 'default' },
      { name: 'child', kind: 'cube', dataSource: null },
      { name: 'summary', kind: 'view', dataSource: undefined },
      { name: 'old', kind: 'cube', dataSource: undefined },
    ]);
  });
});

/**
 * T347 (AC-323, AC-280): a workspace's overlay, and a proposal's (T440),
 * through xcube's slice 5 (research `xcube-slice-5.md`, "PUT …/overlays/{id}",
 * "GET", "DELETE"; `xcube-overlay-data-sources.md`, its `connections`).
 */
describe('overlays (T347)', () => {
  const recording = (status: number, body: Record<string, unknown>) => {
    const asked: { method: string; url: string; body: unknown }[] = [];
    const admin = xcubeAdmin({
      cubeApiUrl: 'http://cube.invalid/cubejs-api',
      model: 'dev',
      token: 'x'.repeat(40),
      fetch: async (input, init) => {
        asked.push({
          method: String(init?.method),
          url: String(input),
          body: init?.body === undefined ? undefined : JSON.parse(String(init.body)),
        });
        return status === 204
          ? new Response(null, { status })
          : new Response(JSON.stringify(body), {
              status,
              headers: { 'content-type': 'application/json' },
            });
      },
    });
    return { admin, asked };
  };
  const pushed = {
    upserts: [{ folderId: 'fsales', name: 'orders', kind: 'cube' as const, yaml: 'cubes: []\n' }],
    deletes: [],
    connections: [
      {
        folderId: 'froot',
        name: 'default',
        driver: 'postgres',
        authMethod: 'password',
        fields: { host: 'db', port: 5432 },
        sealed: { password: { v: 1 as const, kid: 'k', enc: 'e', ct: 'c' } },
      },
    ],
    baseVersion: null,
  };

  it('pushes the whole overlay, its items and its data sources, by id, and reads what it stored', async () => {
    const { admin, asked } = recording(201, {
      model: 'dev',
      id: 'ws-1',
      version: 7,
      created: true,
      revision: 12,
      expiresAt: '2026-10-02T10:00:00.000Z',
      items: [{ folderId: 'fsales', name: 'orders', fullName: 'fsales__orders' }],
    });

    expect(await admin.putOverlay('ws-1', pushed)).toEqual({
      kind: 'stored',
      version: 7,
      created: true,
      revision: 12,
      expiresAt: '2026-10-02T10:00:00.000Z',
    });
    expect(asked).toEqual([
      {
        method: 'PUT',
        url: 'http://cube.invalid/cubejs-api/v1/semantic/models/dev/overlays/ws-1',
        // Exactly the six keys a data source takes (research, Gotcha 4).
        body: pushed,
      },
    ]);
  });

  it('reads a stale base, items that don’t apply, a secret that won’t open, a bad data source and an older xcube', async () => {
    expect(
      await recording(409, {
        code: 'conflict',
        error: 'stale',
        currentVersion: 9,
      }).admin.putOverlay('ws-1', pushed),
    ).toEqual({ kind: 'conflict', currentVersion: 9 });
    expect(
      await recording(422, {
        code: 'invalid_items',
        error: 'The overlay does not apply',
        errors: [{ folderId: 'fsales', name: 'orders', kind: 'compile', message: 'bad' }],
        cubeMessage: 'Cube: bad',
      }).admin.putOverlay('ws-1', pushed),
    ).toEqual({
      kind: 'refused',
      errors: [{ folderId: 'fsales', name: 'orders', kind: 'compile', message: 'bad' }],
      cubeMessage: 'Cube: bad',
    });
    expect(
      await recording(422, {
        code: 'invalid_secret',
        error:
          'Data source froot/default: password: the stored secret can’t be used for this connection target; enter it again',
      }).admin.putOverlay('ws-1', pushed),
    ).toEqual({
      kind: 'secret',
      error:
        'Data source froot/default: password: the stored secret can’t be used for this connection target; enter it again',
    });
    expect(
      await recording(400, {
        code: 'invalid_connection',
        error: 'Data source froot/default: host is required',
        problems: ['host'],
      }).admin.putOverlay('ws-1', pushed),
    ).toEqual({
      kind: 'connection',
      error: 'Data source froot/default: host is required',
    });
    expect(
      await recording(409, {
        code: 'older_instances',
        error: 'older',
        instances: ['xcube:v6:abc'],
      }).admin.putOverlay('ws-1', pushed),
    ).toEqual({ kind: 'older', instances: ['xcube:v6:abc'] });
    // T701 (AC-421): from `256d632371`, two of its data sources of one name,
    // in any case, and a `default` anywhere but the root are its data
    // sources' refusals (research `xcube-256d632371.md`, 2.6).
    expect(
      await recording(409, {
        code: 'name_in_use',
        error: 'The overlay brings two data sources named "Lake"; names are one per model',
        problems: [],
      }).admin.putOverlay('ws-1', pushed),
    ).toEqual({
      kind: 'connection',
      error: 'The name “Lake” is already in use.',
    });
    expect(
      await recording(400, {
        code: 'default_outside_root',
        error: 'Only the root folder (froot) holds the data source "default"',
        problems: ['name any other data source explicitly'],
      }).admin.putOverlay('ws-1', pushed),
    ).toEqual({
      kind: 'connection',
      error: 'Only the shared root may have a data source named default.',
    });
    await expect(
      recording(409, { code: 'too_many_overlays', error: 'too many' }).admin.putOverlay(
        'ws-1',
        pushed,
      ),
    ).rejects.toBeInstanceOf(XcubeError);
  });

  it('drops an overlay, reads one that is gone as none, and resolves names through it', async () => {
    const dropped = recording(204, {});
    await dropped.admin.dropOverlay('ws-1');
    expect(dropped.asked).toEqual([
      {
        method: 'DELETE',
        url: 'http://cube.invalid/cubejs-api/v1/semantic/models/dev/overlays/ws-1',
        body: undefined,
      },
    ]);
    expect(
      await recording(404, { code: 'unknown_overlay', error: 'gone' }).admin.overlay('ws-1'),
    ).toBeUndefined();
    const status = {
      model: 'dev',
      id: 'ws-1',
      version: 7,
      expiresAt: '2026-10-02T10:00:00.000Z',
      validatedRevision: 12,
      upserts: [{ folderId: 'fsales', name: 'orders', kind: 'cube' }],
      deletes: [],
      instance: { revision: 12, state: 'broken', errors: [], cubeMessage: null },
    };
    expect(await recording(200, status).admin.overlay('ws-1')).toEqual(status);

    const resolving = recording(200, {
      model: 'dev',
      revision: 12,
      folderId: 'fsales',
      overlay: 'ws-1',
      names: { orders: 'fsales__orders', widgets: 'fops__widgets' },
    });
    expect(await resolving.admin.resolve('fsales', ['orders', 'widgets'], 'ws-1')).toEqual(
      new Map([
        ['orders', 'fsales__orders'],
        ['widgets', 'fops__widgets'],
      ]),
    );
    expect(resolving.asked[0]?.body).toEqual({
      folderId: 'fsales',
      names: ['orders', 'widgets'],
      overlay: 'ws-1',
    });
  });
});
