import { describe, expect, it, vi } from 'vitest';

import type { ModelFile } from '../server';
import { xcubeAdmin } from './client';
import { fakeXcube, FAKE_ADMIN_TOKEN } from './fake';
import { memoryPublications } from './publications';
import { contentHashOf, modelSync } from './snapshot';

/**
 * T419, AC-333: WHEN wechart's API starts, a publish is committed, and every
 * 60 seconds, THE SYSTEM SHALL compare xcube's current revision of the
 * deployment's model (named by its configured model id) with wechart's
 * published files and, when their content hashes differ, send the whole set as
 * the model's next revision, recording the generation, revision and content
 * hash xcube acknowledges. It SHALL commit a publish to its own store before
 * sending it, and SHALL call xcube's admin routes with xcube's static admin
 * token.
 * `Fails when: 60 seconds after a publish, or after a send lost between
 * wechart's commit and xcube (the API stopped, or xcube unreachable), xcube's
 * current content hash differs from wechart's published files'; xcube serves a
 * revision whose files wechart's store doesn't hold; a publish through one
 * deployment changes another deployment's model; or an admin call is made
 * without the admin token, or with a user's token.`
 *
 * Against a stub xcube that answers as `docs/research/xcube-slice-2.md`
 * records the fork's routes (§"API surface we will use").
 */
const CUBE_API_URL = 'http://cube.invalid/cubejs-api';
const ORDERS: ModelFile = { path: 'cubes/orders.yml', content: 'cubes:\n  - name: orders\n' };
const VIEWS: ModelFile = { path: 'views/sales.yml', content: 'views: []\n' };

function deployment(
  stub: ReturnType<typeof fakeXcube>,
  model = 'dev',
  { token = FAKE_ADMIN_TOKEN, start = 0 } = {},
) {
  let files: readonly ModelFile[] = [ORDERS];
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
    publications,
    log: { warn, info: vi.fn() },
    now: () => now,
  });
  return {
    sync,
    publications,
    warn,
    readAt,
    setFiles: (next: readonly ModelFile[]) => {
      files = next;
    },
    later: (ms: number) => {
      now += ms;
    },
  };
}

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

describe('pushing the published files to xcube (T419, AC-333)', () => {
  it('sends a model xcube doesn’t know yet whole, from no base, and records what xcube acknowledged', async () => {
    const stub = fakeXcube();
    const dev = deployment(stub);

    expect(await dev.sync.sync('start')).toMatchObject({ kind: 'sent', revision: 1 });

    const puts = stub.calls.filter((call) => call.method === 'PUT');
    expect(puts).toHaveLength(1);
    expect(puts[0]?.body).toMatchObject({ baseRevision: null, files: [ORDERS] });
    const head = stub.head('dev');
    expect(await dev.publications.get('dev')).toEqual({
      generation: head?.generation,
      revision: 1,
      contentHash: contentHashOf([ORDERS]),
    });
  });

  it('sends nothing when xcube already holds the same content', async () => {
    const stub = fakeXcube();
    const dev = deployment(stub);
    await dev.sync.sync('start');
    stub.calls.length = 0;

    dev.readAt.length = 0;
    expect(await dev.sync.sync('reconcile')).toMatchObject({ kind: 'same', revision: 1 });
    expect(stub.calls.filter((call) => call.method === 'PUT')).toEqual([]);
    // xcube's revision is read before the files are (T419's review): read the
    // other way round, older files could go out on a newer base.
    expect(stub.calls.map((call) => call.method)).toEqual(['GET']);
    expect(dev.readAt).toEqual([1]);
  });

  it('sends a changed set on xcube’s current revision', async () => {
    const stub = fakeXcube();
    const dev = deployment(stub);
    await dev.sync.sync('start');
    dev.setFiles([ORDERS, VIEWS]);

    expect(await dev.sync.sync('publish')).toMatchObject({ kind: 'sent', revision: 2 });
    const last = stub.calls.filter((call) => call.method === 'PUT').at(-1);
    expect(last?.body).toMatchObject({ baseRevision: 1, files: [ORDERS, VIEWS] });
    expect(stub.head('dev')?.contentHash).toBe(contentHashOf([ORDERS, VIEWS]));
  });

  /**
   * T446, AC-335: WHEN wechart sends its files to xcube (a snapshot, or a
   * publish's check), THE SYSTEM SHALL send only plain YAML files. A
   * JavaScript, Python or Jinja file already in wechart's store SHALL stay
   * there, viewable read-only with its reason (AC-140), and SHALL never be
   * sent (`[R29]`).
   * `Fails when: a snapshot or a check sent to xcube holds such a file, or
   * xcube refuses a snapshot as holding one; or such a file can no longer be
   * opened read-only.` xcube refuses the whole snapshot over one such file
   * (research, "Path rules": `{{`, `}}`, `{%` or `%}` anywhere).
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

    expect(await dev.sync.sync('start')).toMatchObject({ kind: 'sent', revision: 1 });

    const puts = stub.calls.filter((call) => call.method === 'PUT');
    expect(puts.map((call) => (call.body as { files: ModelFile[] }).files)).toEqual([
      [ORDERS, VIEWS],
    ]);
    // What's recorded is what xcube holds: the plain YAML's hash.
    expect((await dev.publications.get('dev'))?.contentHash).toBe(contentHashOf([ORDERS, VIEWS]));
    // And the next reconcile holds it the same: nothing to send.
    expect(await dev.sync.sync('reconcile')).toMatchObject({ kind: 'same', revision: 1 });
  });

  it('reads again and sends again on a conflict, three times at most', async () => {
    const stub = fakeXcube();
    const dev = deployment(stub);
    await dev.sync.sync('start');
    dev.setFiles([ORDERS, VIEWS]);

    // Another replica imports between this one's read and its send, once.
    stub.conflictNext(1);
    expect(await dev.sync.sync('publish')).toMatchObject({ kind: 'sent' });

    // And every time: it gives up after three tries more, and says so.
    dev.setFiles([VIEWS]);
    stub.calls.length = 0;
    stub.conflictNext(99);
    expect(await dev.sync.sync('publish')).toMatchObject({ kind: 'failed' });
    expect(stub.calls.filter((call) => call.method === 'PUT' && call.answered === 409).length).toBe(
      4,
    );
    expect(dev.warn).toHaveBeenCalled();
  });

  it('logs a refusal, and doesn’t send the same content again for 10 minutes', async () => {
    const stub = fakeXcube();
    const dev = deployment(stub);
    stub.refuse([{ path: 'cubes/orders.yml', kind: 'compile', message: 'orders: bad' }]);

    expect(await dev.sync.sync('start')).toMatchObject({ kind: 'refused' });
    expect(dev.warn).toHaveBeenCalledWith(
      expect.objectContaining({ errors: [expect.objectContaining({ message: 'orders: bad' })] }),
      expect.any(String),
    );
    const sends = () => stub.calls.filter((call) => call.method === 'PUT').length;
    expect(sends()).toBe(1);

    dev.later(9 * 60_000);
    expect(await dev.sync.sync('reconcile')).toMatchObject({ kind: 'skipped' });
    expect(sends()).toBe(1);

    dev.later(60_001);
    stub.refuse(undefined);
    expect(await dev.sync.sync('reconcile')).toMatchObject({ kind: 'sent' });
    expect(sends()).toBe(2);
  });

  // T419's review: the memory is of the content refused, not a pause.
  it('sends different content at once after a refusal: a fix isn’t held back', async () => {
    const stub = fakeXcube();
    const dev = deployment(stub);
    stub.refuse([{ path: 'cubes/orders.yml', kind: 'compile', message: 'orders: bad' }]);
    expect(await dev.sync.sync('start')).toMatchObject({ kind: 'refused' });

    stub.refuse(undefined);
    dev.setFiles([VIEWS]);
    dev.later(1_000);
    expect(await dev.sync.sync('publish')).toMatchObject({ kind: 'sent', revision: 1 });
  });

  // T419's review: a file xcube will never take is refused as surely as a
  // model that doesn't compile, and isn't sent again every 60 s either.
  it('remembers a file xcube refuses to take, as it does a model that doesn’t compile', async () => {
    const stub = fakeXcube();
    const dev = deployment(stub);
    // A path xcube won't take (a segment starting with `-`: research, "Path
    // rules"), seeded from a directory before wechart's rule matched xcube's.
    // A template is no longer sent at all (T446).
    dev.setFiles([ORDERS, { path: 'cubes/-legacy.yml', content: 'cubes: []\n' }]);

    expect(await dev.sync.sync('start')).toMatchObject({ kind: 'refused' });
    dev.later(60_000);
    expect(await dev.sync.sync('reconcile')).toMatchObject({ kind: 'skipped' });
    expect(stub.calls.filter((call) => call.method === 'PUT')).toHaveLength(1);
  });

  it('starts over when xcube’s store is new: the recorded revision goes with its generation', async () => {
    const stub = fakeXcube();
    const dev = deployment(stub);
    dev.setFiles([ORDERS, VIEWS]);
    await dev.sync.sync('start');
    await dev.sync.sync('publish');
    dev.setFiles([ORDERS]);
    await dev.sync.sync('publish');
    expect((await dev.publications.get('dev'))?.revision).toBe(2);

    // xcube's schema emptied and made again: a new generation, from nothing.
    stub.recreate();
    expect(await dev.sync.sync('reconcile')).toMatchObject({ kind: 'sent', revision: 1 });
    expect(await dev.publications.get('dev')).toEqual({
      generation: stub.head('dev')?.generation,
      revision: 1,
      contentHash: contentHashOf([ORDERS]),
    });
  });

  it('sends a publish lost on its way (xcube unreachable) at the next reconcile', async () => {
    const stub = fakeXcube();
    const dev = deployment(stub);
    await dev.sync.sync('start');

    // Committed in wechart's store, then xcube can't be reached.
    dev.setFiles([ORDERS, VIEWS]);
    stub.down(true);
    expect(await dev.sync.sync('publish')).toMatchObject({ kind: 'failed' });
    expect(dev.warn).toHaveBeenCalled();
    expect(stub.head('dev')?.contentHash).toBe(contentHashOf([ORDERS]));

    stub.down(false);
    dev.later(60_000);
    expect(await dev.sync.sync('reconcile')).toMatchObject({ kind: 'sent', revision: 2 });
    expect(stub.head('dev')?.contentHash).toBe(contentHashOf([ORDERS, VIEWS]));
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

    expect(stub.head('demo')).toMatchObject({ revision: 1, contentHash: contentHashOf([VIEWS]) });
    expect(stub.head('dev')).toMatchObject({ revision: 2 });
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
    expect(await dev.sync.sync('reconcile')).toMatchObject({ kind: 'refused' });
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
      publications: memoryPublications(),
      log: { warn, info: vi.fn() },
    });

    expect(await sync.sync('publish')).toMatchObject({ kind: 'failed' });
    expect(warn).toHaveBeenCalled();
  });

  it('calls xcube with its admin token, and nothing else, on every call', async () => {
    const stub = fakeXcube();
    const dev = deployment(stub);
    await dev.sync.sync('start');
    expect(stub.calls.length).toBeGreaterThan(0);
    for (const call of stub.calls) expect(call.authorization).toBe(`Bearer ${FAKE_ADMIN_TOKEN}`);

    // A wrong token is refused (401): nothing is stored, and it is said.
    const other = deployment(stub, 'dev', { token: 'x'.repeat(40) });
    other.setFiles([VIEWS]);
    expect(await other.sync.sync('publish')).toMatchObject({ kind: 'failed' });
    expect(stub.head('dev')?.contentHash).toBe(contentHashOf([ORDERS]));
    expect(other.warn).toHaveBeenCalled();
  });
});
