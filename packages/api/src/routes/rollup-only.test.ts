import { describe, expect, it } from 'vitest';

import { CubeClient } from '../cube/client';
import { buildServer } from '../server';
import type { XcubeAdmin } from '../xcube/client';

/**
 * T690 (AC-147 as amended by R76, chart-editor-Q4): a banner shows only where
 * wechart knows Cube runs the model in rollup-only mode. Cube 1.7.45 reports
 * it nowhere; xcube 407622a6b8 says it on `GET …/revision` as `rollupOnly`
 * (research `xcube-407622a6b8.md`). wechart's API passes it on as it is:
 * true, false, or null where it can't know.
 */
const config = {
  cubeApiUrl: 'http://cube.invalid/cubejs-api',
  cubeApiSecret: 'secret',
  securityContext: {},
  port: 4100,
  modelDir: '',
};
const cube = new CubeClient({
  apiUrl: config.cubeApiUrl,
  apiSecret: 'secret',
  securityContext: {},
});

const xcubeSaying = (rollupOnly: boolean | undefined, fails = false) =>
  ({
    revision: async () => {
      if (fails) throw new Error('xcube answered 503');
      return {
        generation: 'g1',
        mode: 'items',
        current: null,
        ...(rollupOnly === undefined ? {} : { rollupOnly }),
      };
    },
  }) as unknown as XcubeAdmin;

const ask = async (xcube: XcubeAdmin | undefined) => {
  const app = buildServer({ config, cube, ...(xcube === undefined ? {} : { xcube }) });
  const response = await app.inject({ method: 'GET', url: '/api/rollup-only' });
  await app.close();
  return response;
};

describe('whether Cube runs the model in rollup-only mode (T690, AC-147)', () => {
  it('says what xcube says, true or false', async () => {
    const on = await ask(xcubeSaying(true));
    expect(on.statusCode).toBe(200);
    expect(on.json()).toEqual({ rollupOnly: true });
    expect((await ask(xcubeSaying(false))).json()).toEqual({ rollupOnly: false });
  });

  it('says null where it can’t know: no xcube, an image before 407622a6b8, or xcube failing', async () => {
    expect((await ask(undefined)).json()).toEqual({ rollupOnly: null });
    expect((await ask(xcubeSaying(undefined))).json()).toEqual({ rollupOnly: null });
    const failing = await ask(xcubeSaying(true, true));
    expect(failing.statusCode).toBe(200);
    expect(failing.json()).toEqual({ rollupOnly: null });
  });
});
