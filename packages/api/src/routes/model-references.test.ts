import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Config } from '../config';
import { closeDb, getDb } from '../db/client';
import { catalog } from '../repos/catalog';
import { documents, type DocumentKind } from '../repos/documents';
import { buildServer } from '../server';

/**
 * T728's follow-up (AC-141, as amended by R55; T546): what a model change
 * would change is the shared charts and dashboards that use its members. A
 * chart or dashboard kept in My workspace is a draft of the user's own: it
 * is not listed, nor counted, even where it names the same member as a
 * shared one, as it does now that every cube is named once (R71).
 *
 * With sign-in off, the single user's workspace being `mine`.
 */
const config: Config = {
  port: 0,
  cubeApiUrl: 'http://cube.invalid/cubejs-api',
  cubeApiSecret: 'secret',
  securityContext: {},
  modelDir: '',
};
const MARK = `mr${randomUUID().replaceAll('-', '').slice(0, 8)}`;
const CUBE = `orders_${MARK}`;
const docs = () => documents(getDb());
const made: { kind: DocumentKind; id: string }[] = [];
const ids = { shared: '', draft: '', board: '', project: '' };
let app: FastifyInstance;

const chartBody = (title: string, folderId: string) => ({
  title,
  folderId,
  chart: {
    source: { cube: CUBE },
    wells: { measures: [`${CUBE}.count`], dimensions: [], timeDimensions: [] },
  },
});

beforeAll(async () => {
  ids.project = randomUUID();
  ids.shared = randomUUID();
  ids.draft = randomUUID();
  ids.board = randomUUID();
  await docs().create({
    kind: 'folder',
    id: ids.project,
    body: { owner: 'admin', title: `Project ${MARK}`, folderId: 'mine' },
  });
  await docs().create({
    kind: 'chart',
    id: ids.shared,
    body: chartBody(`Shared ${MARK}`, 'root'),
  });
  // The user's draft, in a project folder of My workspace, and a draft
  // dashboard showing it.
  await docs().create({
    kind: 'chart',
    id: ids.draft,
    body: chartBody(`Draft ${MARK}`, ids.project),
  });
  await docs().create({
    kind: 'dashboard',
    id: ids.board,
    body: {
      title: `Draft board ${MARK}`,
      folderId: 'mine',
      pages: [
        { id: 'p1', title: 'Page 1', items: [{ id: 't1', kind: 'chart', chartId: ids.draft }] },
      ],
    },
  });
  made.push(
    { kind: 'dashboard', id: ids.board },
    { kind: 'chart', id: ids.draft },
    { kind: 'chart', id: ids.shared },
    { kind: 'folder', id: ids.project },
  );
  app = buildServer({ config, documents: docs(), catalog: catalog(getDb()) });
});

afterAll(async () => {
  if (app !== undefined) await app.close();
  for (const { kind, id } of made) await docs().remove(kind, id);
  await closeDb();
});

describe('what a model change would change (T728’s follow-up, AC-141)', () => {
  it('lists the shared charts using a member, and none of My workspace’s drafts', async () => {
    const answer = await app.inject({
      method: 'POST',
      url: '/api/model/references',
      payload: { members: [`${CUBE}.count`] },
    });
    expect(answer.statusCode, answer.body).toBe(200);
    const found = answer.json<{ charts: { id: string }[]; dashboards: { id: string }[] }>();
    expect(found.charts.map((each) => each.id)).toEqual([ids.shared]);
    expect(found.dashboards).toEqual([]);
  });
});
