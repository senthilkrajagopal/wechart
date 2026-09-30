import { spawn, type ChildProcess } from 'node:child_process';
import { createHash, createPrivateKey, createPublicKey, sign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { expect } from '@playwright/test';

/** The development values every API of this suite's holds (playwright.config.ts, compose). */
export const SECRET = 'dev-secret';
export const CUBE = 'http://localhost:54000/cubejs-api';
/** wechart's development service key (infra/xcube/README.md; T420). */
export const SERVICE_KEY_FILE = fileURLToPath(
  new URL('../infra/xcube/dev-service-key.pem', import.meta.url),
);
/** wechart's development query signing key (infra/xcube/README.md; T437). */
export const SIGNING_KEY_FILE = fileURLToPath(
  new URL('../infra/xcube/dev-signing-key.pem', import.meta.url),
);

/**
 * A service token for xcube's admin routes, as wechart's API signs its own
 * (T420; `docs/research/xcube-slice-4.md`, "The service token"): RS256 under
 * the development service key, its `kid` the RFC 7638 thumbprint xcube names
 * the key by. It names no model, so it serves every model's routes.
 */
export function serviceToken(): string {
  const pem = readFileSync(SERVICE_KEY_FILE, 'utf8');
  const { n, e } = createPublicKey(pem).export({ format: 'jwk' }) as { n: string; e: string };
  const kid = createHash('sha256')
    .update(JSON.stringify({ e, kty: 'RSA', n }))
    .digest('base64url');
  const at = Math.floor(Date.now() / 1000);
  const part = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const unsigned = `${part({ alg: 'RS256', kid })}.${part({ aud: 'xcube-admin', role: 'service', iat: at, exp: at + 300 })}`;
  return `${unsigned}.${sign('sha256', Buffer.from(unsigned), createPrivateKey(pem)).toString('base64url')}`;
}

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
    onLog,
  }: {
    database?: string;
    model: string;
    settings?: Record<string, string>;
    /** Each line the API logs, as it logs it (T458: every request it serves is one). */
    onLog?: (line: string) => void;
  },
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
      WECHART_SERVICE_KEY_FILE: SERVICE_KEY_FILE,
      WECHART_SIGNING_KEY_FILE: SIGNING_KEY_FILE,
      ...settings,
    },
    stdio: onLog === undefined ? 'ignore' : ['ignore', 'pipe', 'ignore'],
  });
  if (onLog !== undefined) {
    let pending = '';
    api.stdout?.setEncoding('utf8');
    api.stdout?.on('data', (chunk: string) => {
      const lines = (pending + chunk).split('\n');
      pending = lines.pop() ?? '';
      for (const line of lines) if (line.trim() !== '') onLog(line);
    });
  }
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
