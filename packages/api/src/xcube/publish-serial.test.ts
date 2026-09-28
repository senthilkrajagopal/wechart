import { describe, expect, it, vi } from 'vitest';

import type { Config } from '../config';
import { buildServer, type ModelFile, type ModelFileStore } from '../server';
import { xcubeAdmin } from './client';
import { fakeXcube, FAKE_ADMIN_TOKEN } from './fake';
import { memoryPublications } from './publications';
import { modelSync } from './snapshot';

/**
 * T460 (AC-273): a model's publishes one at a time. A publish checked while
 * another's change is committed to wechart but not yet in xcube found the
 * two apart and sent the whole model, and a whole send, before xcube
 * 4754c2c960, bound every cube afresh: published cubes moved to a nearer data
 * source without being published again. So a publish is checked only once
 * the one before it is in xcube, and each goes as its own changeset. (From
 * 4754c2c960 a whole send keeps what it sends unchanged as bound: research
 * xcube-4754c2c960.md, Gotcha 3.)
 */
const config: Config = {
  port: 0,
  cubeApiUrl: 'http://cube.invalid/cubejs-api',
  cubeApiSecret: 'secret',
  securityContext: {},
  modelDir: '',
};
const cube = (name: string, title?: string): ModelFile => ({
  path: `cubes/${name}.yml`,
  content: `cubes:\n  - name: ${name}\n${title === undefined ? '' : `    title: ${title}\n`}    sql_table: t\n`,
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

describe('a model’s publishes, one at a time (T460, AC-273)', () => {
  it('sends each as a changeset, never the whole model, however close together', async () => {
    const files = store([cube('orders'), cube('customers')]);
    const stub = fakeXcube();
    // Each change reaches xcube a moment after it is committed, as over a network.
    const slow: typeof globalThis.fetch = async (input, init) => {
      const url = String(input);
      if (url.endsWith('/changesets') && init?.method === 'POST')
        await new Promise((resolve) => setTimeout(resolve, 40));
      return stub.fetch(input, init);
    };
    const admin = xcubeAdmin({
      cubeApiUrl: config.cubeApiUrl,
      model: 'dev',
      token: FAKE_ADMIN_TOKEN,
      fetch: slow,
    });
    const sync = modelSync({
      model: 'dev',
      admin,
      files: () => files.list(),
      tree: async () => [{ id: 'froot', parentId: null }],
      publications: memoryPublications(),
      log: { warn: vi.fn(), info: vi.fn() },
    });
    await sync.sync('start');
    const app = buildServer({
      config,
      modelFiles: files,
      xcube: admin,
      afterPublish: (changeset) => sync.publish(changeset),
    });
    const sentBefore = stub.calls.length;

    const answers = await Promise.all(
      ['orders', 'customers'].map((name) =>
        app.inject({
          method: 'POST',
          url: '/api/model/publish',
          payload: { files: [cube(name, `${name} again`)] },
        }),
      ),
    );

    expect(answers.map((answer) => answer.statusCode)).toEqual([200, 200]);
    const whole = stub.calls
      .slice(sentBefore)
      .filter((call) => call.method === 'PUT' && call.path.endsWith('/snapshot'));
    expect(whole).toEqual([]);
    const changesets = stub.calls
      .slice(sentBefore)
      .filter((call) => call.method === 'POST' && call.path.endsWith('/changesets'));
    expect(changesets).toHaveLength(2);
    await app.close();
  });
});
