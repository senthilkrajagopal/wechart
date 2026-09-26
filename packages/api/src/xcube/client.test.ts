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
  answering(status, body).snapshot({ baseRevision: null, files: [] });

describe('xcube’s answers (T419, AC-333)', () => {
  it('reads a path, a file type, a duplicate or a size xcube won’t take as a refusal', async () => {
    for (const [status, code] of [
      [400, 'invalid_path'],
      [400, 'invalid_file_type'],
      [400, 'duplicate_path'],
      [413, 'too_large'],
    ] as const) {
      expect(await send(status, { error: `${code}!`, code }), code).toMatchObject({
        kind: 'refused',
        errors: [{ path: null, message: `${code}!` }],
      });
    }
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

  it('fails, to be tried again, on a busy or unavailable xcube, its own error, or a bad request', async () => {
    for (const [status, code] of [
      [503, 'busy'],
      [503, 'unavailable'],
      [500, 'internal'],
      [400, 'bad_request'],
      [401, 'unauthorized'],
    ] as const) {
      const failed = await send(status, { error: 'no', code }).catch((error: unknown) => error);
      expect(failed, code).toBeInstanceOf(XcubeError);
      expect((failed as XcubeError).code).toBe(code);
      expect((failed as XcubeError).status).toBe(status);
    }
  });

  it('reads a model never imported as no base, and a 404 of anything else as a failure', async () => {
    expect(
      await answering(404, { error: 'Unknown model "dev"', code: 'unknown_model' }).revision(),
    ).toEqual({ generation: '', current: null });
    // The admin routes off (a refresh worker, or no token set): not "no base".
    await expect(answering(404, { error: 'Not found' }).revision()).rejects.toBeInstanceOf(
      XcubeError,
    );
  });
});
