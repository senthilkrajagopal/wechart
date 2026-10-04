import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { pgSessionStore } from '../auth/session-store';
import { PUBLIC_URL, signIn, USERS } from '../auth/sign-in.fixture';
import { closeDb, getDb } from '../db/client';
import { catalog } from '../repos/catalog';
import { documents } from '../repos/documents';
import { folderAccessStore } from '../repos/folder-access';
import { buildServer } from '../server';
import { xcubeRefreshWorker } from '../xcube/refresh-worker';

/**
 * T553 (AC-393; design 16, state F and Q4): the refresh worker's state for
 * Jobs' header, from xcube's refresh-worker route (stubbed here as compose's
 * answered it, research `xcube-jobs-schedules-routes.md` §3), for those who
 * may use Jobs (T371). Each worker with its revision and last run; each
 * module by its latest run, with its state. A module's error, which can name
 * cubes of folders a member can't see, only in a Super-Admin's answer.
 */
const secured = {
  cubeApiUrl: 'http://cube.invalid/cubejs-api',
  cubeApiSecret: 'secret',
  securityContext: {},
  port: 4100,
  modelDir: '',
  security: 'oidc' as const,
  publicUrl: PUBLIC_URL,
  sessionSecret: 'a-test-session-secret-at-least-32-characters',
  superAdminGroup: 'wechart-super-admins',
  oidc: {
    issuer: 'http://localhost:5556/dex',
    clientId: 'wechart',
    clientSecret: 'dev-oidc-secret',
    groupsClaim: 'groups',
    scopes: 'openid profile email groups',
    allowHttp: true,
  },
};

const MARK = `worker${randomUUID().slice(0, 8)}`;
const docs = () => documents(getDb());
const ERROR = 'Refresh Scheduler Error: connect ETIMEDOUT 10.20.4.17:5432';
const REPORT = {
  model: 'dev',
  revision: 12,
  workers: [
    {
      instance: 'cube-refresh-0',
      revision: 12,
      servedKey: 'xcube:dev:12:a^b',
      lastTickAt: '2026-10-04T14:39:52.000Z',
      modules: [
        {
          module: 'commons',
          revision: 12,
          lastTickAt: '2026-10-04T14:39:52.000Z',
          finished: true,
          lastOkAt: '2026-10-04T14:39:52.000Z',
          lastError: null,
        },
        {
          module: 'm8be41d07a2',
          revision: 12,
          lastTickAt: '2026-10-04T14:39:50.000Z',
          finished: true,
          lastOkAt: '2026-10-04T13:52:00.000Z',
          lastError: { message: ERROR, at: '2026-10-04T14:39:50.000Z' },
        },
      ],
    },
    // Stopped at an older revision, listed for a day.
    {
      instance: 'cube-refresh-old',
      revision: 11,
      servedKey: 'xcube:dev:11:a^b',
      lastTickAt: '2026-10-04T09:00:00.000Z',
      modules: [
        {
          module: 'commons',
          revision: 11,
          lastTickAt: '2026-10-04T09:00:00.000Z',
          finished: false,
          lastOkAt: '2026-10-04T09:00:00.000Z',
          lastError: null,
        },
      ],
    },
  ],
};
let answer: () => Response = () => Response.json(REPORT);
const cookies: Record<string, string> = {};
let folderId = '';
let app: FastifyInstance;

beforeAll(async () => {
  folderId = randomUUID();
  await docs().create({
    kind: 'folder',
    id: folderId,
    body: {
      owner: 'admin',
      title: `Workers ${MARK}`,
      folderId: 'root',
      access: { readOnly: ['sales-ro'], readWrite: ['sales-rw'] },
    },
  });
  app = buildServer({
    config: secured,
    sessions: pgSessionStore(getDb()),
    documents: docs(),
    catalog: catalog(getDb()),
    folderAccess: folderAccessStore(getDb()),
    refreshWorker: xcubeRefreshWorker({
      cubeApiUrl: secured.cubeApiUrl,
      model: 'dev',
      token: async () => 'service-token',
      fetch: (async () => answer()) as typeof fetch,
    }),
  });
  for (const who of ['super', 'writer', 'reader']) cookies[who] = await signIn(app, USERS[who]!);
});

afterAll(async () => {
  if (app !== undefined) await app.close();
  await docs().remove('folder', folderId);
  await closeDb();
});

const read = (who: string) =>
  app.inject({
    method: 'GET',
    url: '/api/jobs/refresh-worker',
    headers: { cookie: cookies[who]! },
  });

const WORKERS = [
  {
    instance: 'cube-refresh-0',
    revision: 12,
    lastRunAt: '2026-10-04T14:39:52.000Z',
    finished: true,
  },
  {
    instance: 'cube-refresh-old',
    revision: 11,
    lastRunAt: '2026-10-04T09:00:00.000Z',
    finished: false,
  },
];

describe('the refresh worker’s state for Jobs (T553, AC-393)', () => {
  it('gives a Super-Admin its state, each worker and each module, with a module’s error', async () => {
    const answered = await read('super');

    expect(answered.statusCode, answered.body).toBe(200);
    expect(answered.json()).toEqual({
      status: { state: 'failing', lastRunAt: '2026-10-04T14:39:52.000Z', modules: 1 },
      modelRevision: 12,
      workers: WORKERS,
      modules: [
        {
          module: 'commons',
          lastRunAt: '2026-10-04T14:39:52.000Z',
          lastOkAt: '2026-10-04T14:39:52.000Z',
          failing: false,
        },
        {
          module: 'm8be41d07a2',
          lastRunAt: '2026-10-04T14:39:50.000Z',
          lastOkAt: '2026-10-04T13:52:00.000Z',
          failing: true,
          error: ERROR,
        },
      ],
      errorsShown: true,
    });
  });

  it('gives a read-write member the same, without a module’s error (Q4)', async () => {
    const answered = await read('writer');

    expect(answered.statusCode, answered.body).toBe(200);
    expect(answered.body).not.toContain('ETIMEDOUT');
    expect(answered.json()).toEqual({
      status: { state: 'failing', lastRunAt: '2026-10-04T14:39:52.000Z', modules: 1 },
      modelRevision: 12,
      workers: WORKERS,
      modules: [
        {
          module: 'commons',
          lastRunAt: '2026-10-04T14:39:52.000Z',
          lastOkAt: '2026-10-04T14:39:52.000Z',
          failing: false,
        },
        {
          module: 'm8be41d07a2',
          lastRunAt: '2026-10-04T14:39:50.000Z',
          lastOkAt: '2026-10-04T13:52:00.000Z',
          failing: true,
        },
      ],
      errorsShown: false,
    });
  });

  it('refuses one who may use neither Jobs nor Schedules', async () => {
    const answered = await read('reader');

    expect(answered.statusCode).toBe(403);
    expect(answered.json()).toEqual({
      error: 'Jobs and Schedules are for Super-Admins and read-write members of a folder.',
    });
  });

  it('says none for a model no worker has run', async () => {
    answer = () => Response.json({ model: 'dev', revision: 12, workers: [] });
    try {
      expect((await read('writer')).json()).toEqual({
        status: { state: 'none' },
        modelRevision: 12,
        workers: [],
        modules: [],
        errorsShown: false,
      });
    } finally {
      answer = () => Response.json(REPORT);
    }
  });

  it('says it couldn’t be read when xcube doesn’t answer, rather than guess', async () => {
    answer = () => Response.json({ error: 'busy' }, { status: 503 });
    try {
      const answered = await read('writer');
      expect(answered.statusCode).toBe(502);
      expect(answered.json()).toEqual({
        error: 'The refresh worker’s state couldn’t be read from xcube.',
      });
    } finally {
      answer = () => Response.json(REPORT);
    }
  });
});
