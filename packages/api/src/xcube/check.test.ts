import { describe, expect, it, vi } from 'vitest';

import { CubeClient } from '../cube/client';
import type { Config } from '../config';
import { buildServer, type ModelFile, type ModelFileStore } from '../server';
import { xcubeAdmin } from './client';
import { fakeXcube, FAKE_ADMIN_TOKEN } from './fake';
import { itemsOf } from './items';

/**
 * T445: a publish is checked by xcube's dry run (`docs/research/xcube-slice-2.md`,
 * §"`PUT …/snapshot?dryRun=true`"), in place of the draft Cube read back and
 * the rollup probes asked of Cube under it.
 *
 * AC-136: WHEN the user saves model changes, THE SYSTEM SHALL validate them
 * against Cube before publishing and refuse to publish a model Cube rejects,
 * showing Cube's error per file.
 * `Fails when: an invalid model is published, or the error is not attributed
 * to a file.`
 *
 * AC-235: WHEN the user publishes a model change in which a rollup names
 * members of cubes Cube cannot join, THE SYSTEM SHALL refuse the publish, name
 * the rollup and its file, and give Cube's reason. That includes a rollup in a
 * file the change leaves alone that Cube already refused before it (R29).
 * `Fails when: such a change is published, or the refusal names no rollup or
 * gives no reason.`
 */
const config: Config = {
  port: 0,
  cubeApiUrl: 'http://cube.invalid/cubejs-api',
  cubeApiSecret: 'secret',
  securityContext: { tenant: 'acme' },
  modelDir: '',
};

const REASON = "Can't find join path to join 'user', 'base'";
const USER: ModelFile = {
  path: 'cubes/user.yml',
  content:
    'cubes:\n  - name: user\n    sql_table: public.users\n    dimensions:\n      - name: city\n        sql: city\n        type: string\n',
};
const rollupOn = (joined: boolean): ModelFile => ({
  path: 'cubes/base.yml',
  content: [
    'cubes:',
    '  - name: base',
    '    sql_table: public.base',
    ...(joined
      ? [
          '    joins:',
          '      - name: user',
          '        sql: "{CUBE}.user_id = {user}.id"',
          '        relationship: many_to_one',
        ]
      : []),
    '    measures:',
    '      - name: count',
    '        type: count',
    '    pre_aggregations:',
    '      - name: by_city',
    '        measures: [count]',
    '        dimensions: [user.city]',
  ].join('\n'),
});

function store(initial: readonly ModelFile[]): ModelFileStore & { files: ModelFile[] } {
  const held = {
    files: [...initial],
    list: async () => held.files,
    seed: async () => undefined,
    write: async (files: readonly ModelFile[]) => {
      for (const file of files)
        held.files = [...held.files.filter((each) => each.path !== file.path), file];
    },
  };
  return held;
}

/** A Cube wechart must not ask: xcube checks the change now. */
function cubeNotAsked() {
  const client = new CubeClient({
    apiUrl: config.cubeApiUrl,
    apiSecret: 'secret',
    securityContext: {},
  });
  const asked = vi.fn();
  const cube = Object.create(client, {
    meta: { value: async (...args: unknown[]) => asked('meta', ...args) },
    sql: { value: async (...args: unknown[]) => asked('sql', ...args) },
  }) as CubeClient;
  return { cube, asked };
}

function serving(files: ModelFileStore) {
  const stub = fakeXcube();
  const { cube, asked } = cubeNotAsked();
  const afterPublish = vi.fn(async () => undefined);
  const app = buildServer({
    config,
    modelFiles: files,
    cube,
    xcube: xcubeAdmin({
      cubeApiUrl: config.cubeApiUrl,
      model: 'dev',
      token: FAKE_ADMIN_TOKEN,
      fetch: stub.fetch,
    }),
    afterPublish,
  });
  return { app, stub, asked, afterPublish };
}

const publish = (app: ReturnType<typeof buildServer>, files: readonly ModelFile[]) =>
  app.inject({ method: 'POST', url: '/api/model/publish', payload: { files } });

/** Cube's `/v1/sql` over the candidate: a rollup naming user.city with no join declared is refused. */
const unjoined = (probe: { query: Record<string, unknown> }, files: readonly ModelFile[]) => {
  const cube = String((probe.query['measures'] as string[] | undefined)?.[0] ?? '').split('.')[0];
  const file = files.find((each) => each.content.includes(`name: ${cube}\n`));
  return file !== undefined &&
    file.content.includes('user.city') &&
    !file.content.includes('joins:')
    ? { status: 400, error: REASON }
    : undefined;
};

describe('a publish checked by xcube’s dry run (T445)', () => {
  it('asks xcube once: the merged files, wechart’s context, and a probe for each cube with rollups, with no compare', async () => {
    const files = store([USER]);
    const { app, stub, asked } = serving(files);

    const published = await publish(app, [rollupOn(true)]);

    expect(published.statusCode).toBe(200);
    const checks = stub.calls.filter((call) => call.path.endsWith('/snapshot?dryRun=true'));
    expect(checks).toHaveLength(1);
    const body = checks[0]?.body as {
      files: ModelFile[];
      securityContext: unknown;
      probes: { id: string; query: unknown; compare?: unknown }[];
    };
    expect(body.files).toEqual([rollupOn(true), USER]);
    expect(body.securityContext).toEqual({ tenant: 'acme' });
    expect(body.probes).toEqual([{ id: expect.any(String), query: { measures: ['base.count'] } }]);
    expect(body.probes[0]).not.toHaveProperty('compare');
    // Cube isn't asked to read a draft, or to plan under one.
    expect(asked).not.toHaveBeenCalled();
    expect(files.files).toEqual([USER, rollupOn(true)]);
    await app.close();
  });

  it('refuses a model xcube says doesn’t compile, each error on its file, and one it places on none by what it names', async () => {
    const files = store([USER]);
    const { app, stub, afterPublish, asked } = serving(files);
    stub.refuse([
      {
        path: 'cubes/base.yml',
        line: 3,
        column: 5,
        kind: 'compile',
        message: 'base cube: sql_table is bad',
      },
      { path: null, kind: 'compile', message: 'no_such_member is not defined' },
    ]);
    const naming = {
      path: 'cubes/other.yml',
      content: 'cubes:\n  - name: other\n    sql: no_such_member\n',
    };

    const published = await publish(app, [rollupOn(true), naming]);

    expect([published.statusCode, published.json()]).toEqual([
      422,
      {
        errors: [
          // Its column kept, where xcube gives one (T445's review).
          { path: 'cubes/base.yml', line: 3, column: 5, message: 'base cube: sql_table is bad' },
          { path: 'cubes/other.yml', message: 'no_such_member is not defined' },
        ],
      },
    ]);
    // Nothing published, and nothing sent to xcube as the model; and Cube
    // asked nothing, a draft to read included (T445's review, T431).
    expect(files.files).toEqual([USER]);
    expect(afterPublish).not.toHaveBeenCalled();
    expect(asked).not.toHaveBeenCalled();
    await app.close();
  });

  it('refuses a rollup xcube’s probe refuses, naming it, its file and Cube’s reason', async () => {
    const files = store([USER]);
    const { app, stub } = serving(files);
    stub.answerProbes(unjoined);

    const published = await publish(app, [rollupOn(false)]);

    expect([published.statusCode, published.json()]).toEqual([
      422,
      {
        errors: [
          {
            path: 'cubes/base.yml',
            line: 8,
            message: `Pre-aggregation by_city can't be built: Cube cannot join its cubes. ${REASON}.`,
            preAggregation: { cube: 'base', name: 'by_city' },
          },
        ],
      },
    ]);
    expect(files.files).toEqual([USER]);
    await app.close();
  });

  it('refuses one in a file the change leaves alone, already refused before it (R29)', async () => {
    const files = store([USER, rollupOn(false)]);
    const { app, stub } = serving(files);
    stub.answerProbes(unjoined);
    const cities = {
      ...USER,
      content: `${USER.content}      - name: region\n        sql: region\n        type: string\n`,
    };

    const published = await publish(app, [cities]);

    expect(published.statusCode).toBe(422);
    expect(published.json()).toEqual({
      errors: [
        expect.objectContaining({
          path: 'cubes/base.yml',
          preAggregation: { cube: 'base', name: 'by_city' },
        }),
      ],
    });
    expect(files.files).toEqual([USER, rollupOn(false)]);
    await app.close();
  });

  it('says xcube could not be asked, and publishes nothing, when a probe couldn’t run or xcube can’t be reached', async () => {
    const files = store([USER]);
    const { app, stub } = serving(files);
    stub.answerProbes(() => ({ status: 403, error: 'API scope is missing: sql' }));

    const unasked = await publish(app, [rollupOn(true)]);
    expect([unasked.statusCode, unasked.json()]).toEqual([
      502,
      {
        error:
          'xcube could not check the rollups of base (API scope is missing: sql), so nothing was published.',
      },
    ]);

    stub.answerProbes(undefined);
    stub.down(true);
    const unreached = await publish(app, [rollupOn(true)]);
    expect([unreached.statusCode, unreached.json()]).toEqual([
      502,
      { error: 'xcube could not be asked to check the model, so nothing was published.' },
    ]);
    expect(files.files).toEqual([USER]);
    await app.close();
  });

  /**
   * T445's review: in the draft path's order. A rollup naming a member the
   * model lacks makes Cube's planning fail with a 500 (research
   * `cube/pre-aggregations.md`, "Observed locally"); it is said by its
   * rollup and the name it lacks (AC-189), not as xcube failing.
   */
  it('names a rollup’s unknown member before what its probe said', async () => {
    const files = store([USER]);
    const { app, stub } = serving(files);
    stub.answerProbes(() => ({ status: 500, error: 'Error in CUBE.nope: Cannot resolve' }));
    const unknown = {
      ...rollupOn(true),
      content: rollupOn(true).content.replace('dimensions: [user.city]', 'dimensions: [CUBE.nope]'),
    };

    const published = await publish(app, [unknown]);

    expect(published.statusCode).toBe(422);
    expect(published.json()).toEqual({
      errors: [
        expect.objectContaining({
          path: 'cubes/base.yml',
          preAggregation: expect.objectContaining({
            cube: 'base',
            name: 'by_city',
            unknown: expect.any(Array),
          }),
        }),
      ],
    });
    await app.close();
  });

  it('says a probe that failed, with names and crons in order, as xcube not checking it', async () => {
    const files = store([USER]);
    const { app, stub } = serving(files);
    stub.answerProbes(() => ({ status: 500, error: 'No answer' }));

    const published = await publish(app, [rollupOn(true)]);

    expect([published.statusCode, published.json()]).toEqual([
      502,
      { error: 'xcube could not check the rollups of base (No answer), so nothing was published.' },
    ]);
    expect(files.files).toEqual([USER]);
    await app.close();
  });

  it('takes a probe with no answer as no check, never a pass', async () => {
    const files = store([USER]);
    const { app, stub } = serving(files);
    stub.dropProbes(true);

    const published = await publish(app, [rollupOn(true)]);

    expect([published.statusCode, published.json()]).toEqual([
      502,
      { error: 'xcube gave no answer for the rollups of base, so nothing was published.' },
    ]);
    expect(files.files).toEqual([USER]);
    await app.close();
  });

  it('gives a refusal without Cube’s words a reason of its own', async () => {
    const files = store([USER]);
    const { app, stub } = serving(files);
    stub.answerProbes(() => ({ status: 400 }));

    const published = await publish(app, [rollupOn(true)]);

    expect(published.statusCode).toBe(422);
    expect(published.json<{ errors: { message: string }[] }>().errors[0]?.message).toBe(
      "Pre-aggregation by_city can't be built: Cube refused it.",
    );
    await app.close();
  });

  /**
   * T446, AC-335: only plain YAML is sent. A JavaScript, Python or Jinja file
   * already in wechart's store stays there and is never sent, so it can't
   * refuse a publish either (with it, xcube answered `400 invalid_file_type`
   * on that file, and nothing could be published).
   */
  it('checks only the plain YAML in the store, so a template kept there refuses nothing', async () => {
    const kept: ModelFile[] = [
      { path: 'cubes/templated.yml', content: 'cubes: {{ x }}\n' },
      { path: 'cubes/closing.yml', content: '# %}\ncubes: []\n' },
      { path: 'cubes/dynamic.js', content: 'cube(`dynamic`, { sql_table: `t` });\n' },
      { path: 'cubes/generated.py', content: 'from cube import TemplateContext\n' },
      { path: 'cubes/macros.jinja', content: '{% macro m() %}{% endmacro %}\n' },
    ];
    const files = store([USER, ...kept]);
    const { app, stub } = serving(files);

    const published = await publish(app, [rollupOn(true)]);

    expect(published.statusCode).toBe(200);
    const checks = stub.calls.filter((call) => call.path.endsWith('/snapshot?dryRun=true'));
    expect(checks.map((call) => (call.body as { files: ModelFile[] }).files)).toEqual([
      [rollupOn(true), USER],
    ]);
    // Kept in wechart's store as they were, beside the publish.
    expect(files.files).toEqual(expect.arrayContaining([...kept, USER, rollupOn(true)]));
    expect(files.files).toHaveLength(kept.length + 2);
    await app.close();
  });

  it('falls back on Cube’s own text when xcube places no error', async () => {
    const files = store([USER]);
    const { app, stub } = serving(files);
    stub.refuse([], 'Error: Compile errors:\ncubes/base.yml Errors:\nbase cube: sql_table is bad');

    const published = await publish(app, [rollupOn(true)]);

    expect(published.statusCode).toBe(422);
    expect(
      published.json<{ errors: { path: string }[] }>().errors.map((error) => error.path),
    ).toEqual(['cubes/base.yml']);
    await app.close();
  });
});

/**
 * T426, AC-136 as reworded (R28 Q9): on a model in items mode, a publish is
 * checked by the changeset's dry run (research `xcube-slice-3a.md`, "POST
 * …/changesets?dryRun=true"): the items it changes, wechart's context, and a
 * probe for each cube with rollups. Its errors land on the item's file, with
 * no line from xcube's resolved copy; a YAML error keeps the author's.
 */
describe('a publish checked by the changeset’s dry run (T426)', () => {
  const inItemsMode = (files: ModelFileStore) => {
    const served = serving(files);
    served.stub.holdItems('dev', itemsOf([USER]));
    return served;
  };
  const dryRuns = (stub: ReturnType<typeof fakeXcube>) =>
    stub.calls.filter((call) => call.path.endsWith('/changesets?dryRun=true'));

  it('asks xcube once: the changed items, wechart’s context, and a probe for each cube with rollups', async () => {
    const files = store([USER]);
    const { app, stub, asked } = inItemsMode(files);

    const published = await publish(app, [rollupOn(true)]);

    expect(published.statusCode).toBe(200);
    expect(dryRuns(stub)).toHaveLength(1);
    expect(dryRuns(stub)[0]?.body).toEqual({
      baseRevision: null,
      upserts: itemsOf([rollupOn(true)]),
      deletes: [],
      securityContext: { tenant: 'acme' },
      probes: [{ id: expect.any(String), query: { measures: ['base.count'] } }],
    });
    // No file set is checked any more, and Cube is asked nothing.
    expect(stub.calls.filter((call) => call.path.endsWith('/snapshot?dryRun=true'))).toEqual([]);
    expect(asked).not.toHaveBeenCalled();
    expect(files.files).toEqual([USER, rollupOn(true)]);
    await app.close();
  });

  // T426's review (T2): what was checked is what is sent.
  it('hands the changeset it checked to the send, once committed', async () => {
    const files = store([USER]);
    const { app, afterPublish } = inItemsMode(files);

    expect((await publish(app, [rollupOn(true)])).statusCode).toBe(200);
    expect(afterPublish).toHaveBeenCalledWith({ upserts: itemsOf([rollupOn(true)]), deletes: [] });
    await app.close();
  });

  /**
   * T426's review (M2, T1): where xcube's items aren't the store's, the
   * check is of the whole model: every item the store makes, and a delete of
   * each item xcube holds that the store doesn't (`GET …/items`). The publish
   * then sends the whole model, not a changeset.
   */
  it('checks the whole model where xcube’s items aren’t the store’s, and sends it whole', async () => {
    const gone = { path: 'cubes/gone.yml', content: 'cubes:\n  - name: gone\n' };
    const files = store([USER]);
    const { app, stub, afterPublish } = serving(files);
    stub.holdItems('dev', itemsOf([gone]));
    const other = { path: 'cubes/other.yml', content: 'cubes:\n  - name: other\n' };

    expect((await publish(app, [other])).statusCode).toBe(200);
    expect(dryRuns(stub)[0]?.body).toMatchObject({
      upserts: itemsOf([other, USER]),
      deletes: [{ folderId: 'froot', name: 'gone' }],
    });
    expect(afterPublish).toHaveBeenCalledWith(undefined);
    await app.close();
  });

  // T426's review (M3): a size or request xcube won't take lands on the change, as the files check's did.
  it('refuses a change xcube won’t take for its size, as it refused a file set', async () => {
    const files = store([USER]);
    const { app, stub } = inItemsMode(files);
    stub.refuseSize(true);

    const published = await publish(app, [rollupOn(true)]);

    expect(published.statusCode).toBe(422);
    expect(published.json<{ errors: { message: string }[] }>().errors[0]?.message).toBe(
      'The change is too large',
    );
    await app.close();
  });

  it('refuses items xcube says don’t compile, each error on its item’s file, a YAML error at its line', async () => {
    const files = store([USER]);
    const { app, stub, afterPublish } = inItemsMode(files);
    stub.refuse([
      // A line in xcube's resolved copy, not the author's: never shown (T426's review, T3).
      {
        folderId: 'froot',
        name: 'base',
        kind: 'compile',
        line: 9,
        column: 2,
        message: 'base cube: sql_table is bad',
      },
      { folderId: 'froot', name: 'base', kind: 'yaml', line: 3, column: 5, message: 'bad indent' },
      { folderId: null, name: null, kind: 'compile', message: 'no_such_member is not defined' },
    ]);
    const naming = {
      path: 'cubes/other.yml',
      content: 'cubes:\n  - name: other\n    sql: no_such_member\n',
    };

    const published = await publish(app, [rollupOn(true), naming]);

    expect([published.statusCode, published.json()]).toEqual([
      422,
      {
        errors: [
          { path: 'cubes/base.yml', message: 'base cube: sql_table is bad' },
          { path: 'cubes/base.yml', line: 3, column: 5, message: 'bad indent' },
          { path: 'cubes/other.yml', message: 'no_such_member is not defined' },
        ],
      },
    ]);
    expect(files.files).toEqual([USER]);
    expect(afterPublish).not.toHaveBeenCalled();
    await app.close();
  });

  /**
   * T426's e2e: a file in wechart's store that xcube doesn't hold (a send
   * lost, or a row written straight to the store) is checked too, so a
   * rollup it breaks refuses the publish (R29). Where xcube's items aren't
   * the store's, every item is sent, and the publish then sends the whole
   * model rather than a changeset.
   */
  it('checks every item where xcube doesn’t hold what wechart’s store does, and sends no changeset', async () => {
    const files = store([USER, rollupOn(false)]);
    const { app, stub, afterPublish } = serving(files);
    // xcube holds USER alone: the rollup's file never reached it.
    stub.holdItems('dev', itemsOf([USER]));
    stub.answerProbes(unjoined);
    const unrelated = { path: 'cubes/other.yml', content: 'cubes:\n  - name: other\n' };

    const published = await publish(app, [unrelated]);

    expect(published.statusCode).toBe(422);
    expect(dryRuns(stub)[0]?.body).toMatchObject({
      upserts: itemsOf([rollupOn(false), unrelated, USER]),
    });
    expect(published.json()).toEqual({
      errors: [
        expect.objectContaining({
          path: 'cubes/base.yml',
          preAggregation: { cube: 'base', name: 'by_city' },
        }),
      ],
    });
    expect(afterPublish).not.toHaveBeenCalled();
    await app.close();
  });

  it('refuses a rollup the dry run’s probe refuses, naming it, its file and Cube’s reason', async () => {
    const files = store([USER]);
    const { app, stub } = inItemsMode(files);
    stub.answerProbes(unjoined);

    const published = await publish(app, [rollupOn(false)]);

    expect([published.statusCode, published.json()]).toEqual([
      422,
      {
        errors: [
          {
            path: 'cubes/base.yml',
            line: 8,
            message: `Pre-aggregation by_city can't be built: Cube cannot join its cubes. ${REASON}.`,
            preAggregation: { cube: 'base', name: 'by_city' },
          },
        ],
      },
    ]);
    expect(files.files).toEqual([USER]);
    await app.close();
  });
});
