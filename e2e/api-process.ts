import { spawn, type ChildProcess } from 'node:child_process';
import { readFileSync } from 'node:fs';

import { expect } from '@playwright/test';

/** The development values every API of this suite's holds (playwright.config.ts, compose). */
export const SECRET = 'dev-secret';
export const ADMIN_TOKEN = 'dev-xcube-admin-token-0123456789abcdef';
export const CUBE = 'http://localhost:54000/cubejs-api';

export interface ApiProcess {
  readonly url: string;
  readonly process: ChildProcess;
}

/**
 * Another API process: the suite's built API with its settings, on its own
 * port, serving `model` from `database` (T447). `settings` adds to them.
 */
export async function startApi(
  port: number,
  {
    database = 'wechart_meta',
    model,
    settings = {},
  }: { database?: string; model: string; settings?: Record<string, string> },
): Promise<ApiProcess> {
  const api = spawn('node', ['packages/api/dist/main.js'], {
    cwd: new URL('..', import.meta.url).pathname,
    // Its settings alone: a reset or another database from the shell
    // running the suite must never reach it (T447's review).
    env: {
      PATH: process.env['PATH'] ?? '',
      HOME: process.env['HOME'] ?? '',
      WECHART_DB_URL: `postgres://wechart:wechart@localhost:55432/${database}`,
      PORT: String(port),
      CUBE_API_SECRET: SECRET,
      CUBE_API_URL: CUBE,
      WECHART_XCUBE_PUBLIC_KEY: readFileSync(
        new URL('../infra/xcube/dev-credential-key.pub.jwk', import.meta.url),
        'utf8',
      ).trim(),
      WECHART_XCUBE_MODEL: model,
      WECHART_XCUBE_ADMIN_TOKEN: ADMIN_TOKEN,
      ...settings,
    },
    stdio: 'ignore',
  });
  const url = `http://localhost:${String(port)}`;
  try {
    await expect
      .poll(async () => (await fetch(`${url}/api/health`).catch(() => undefined))?.status, {
        timeout: 60_000,
        intervals: [500],
      })
      .toBe(200);
    // Its own answer, not an older process's still on the port.
    expect(api.exitCode, `the API on port ${String(port)} exited`).toBeNull();
  } catch (failure) {
    api.kill();
    throw failure;
  }
  return { url, process: api };
}

/** An API process stopped, and gone: its sends ended with it. */
export async function stopApi(api: ChildProcess | undefined): Promise<void> {
  if (api === undefined || api.exitCode !== null) return;
  const exited = new Promise((resolve) => api.once('exit', resolve));
  api.kill();
  await exited;
}
