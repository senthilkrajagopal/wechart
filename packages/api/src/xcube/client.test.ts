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
});
