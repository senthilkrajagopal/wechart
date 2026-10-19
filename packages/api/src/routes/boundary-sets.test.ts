import { randomUUID } from 'node:crypto';

import type { FastifyInstance, InjectOptions } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { pgSessionStore } from '../auth/session-store';
import { PUBLIC_URL, signIn, USERS } from '../auth/sign-in.fixture';
import { closeDb, getDb } from '../db/client';
import { auditStore } from '../repos/audit';
import { boundarySetStore } from '../repos/boundary-sets';
import { catalog } from '../repos/catalog';
import { documents, type DocumentKind } from '../repos/documents';
import { folderAccessStore } from '../repos/folder-access';
import { proposalStore } from '../repos/proposals';
import { versionStore } from '../repos/versions';
import { buildServer } from '../server';
import { removeProjectFolders } from './project-folder.fixture';

/**
 * T979 / AC-628: WHEN a read-write member of a folder uploads a custom
 * boundary set, THE SYSTEM SHALL take it into their My workspace, landing it
 * in the folder only through a proposal, as a model change lands (F29, F30),
 * and refuse the upload to a member without write on the folder; SHALL
 * accept only GeoJSON whose features are polygons or multipolygons, each
 * holding the key property named at upload with a value unique in the set,
 * refusing anything else and naming the first feature that fails; and SHALL
 * then offer the set in Boundary set under its name to charts in that folder
 * and the folders under it, found along the path as models are.
 * `Fails when: a member without write on the folder can upload; a set
 * reaches the folder without an approved proposal; a file with a point
 * feature, a feature without the key, or two features of one key is
 * accepted; a refusal doesn't name the failing feature; or an accepted set
 * isn't offered in its folder and those under it, or is offered outside
 * them.`
 *
 * `writer` (`sales-rw`) writes /Sales; `reader` (`sales-ro`) only reads it;
 * `super` approves. /Sales/EMEA is under /Sales; /Ops is beside it.
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

const MARK = `bset${randomUUID().slice(0, 8)}`;
const docs = () => documents(getDb());
const made: { kind: DocumentKind; id: string }[] = [];
const cookies: Record<string, string> = {};
const ids = { sales: '', emea: '', ops: '' };
let app: FastifyInstance;

async function folder(title: string, parent: string, access: Record<string, unknown>) {
  const id = randomUUID();
  made.push({ kind: 'folder', id });
  await docs().create({
    kind: 'folder',
    id,
    body: { owner: 'admin', title: `${title} ${MARK}`, folderId: parent, access },
  });
  return id;
}

const square = (key: string, at: number) => ({
  type: 'Feature',
  properties: { territory_id: key },
  geometry: {
    type: 'Polygon',
    coordinates: [
      [
        [at, 0],
        [at + 1, 0],
        [at + 1, 1],
        [at, 1],
        [at, 0],
      ],
    ],
  },
});
const TERRITORIES = {
  type: 'FeatureCollection',
  features: [square('Atlantic', 0), square('Gulf', 1), square('Islands', 2)],
};

beforeAll(async () => {
  const sales = { readOnly: ['sales-ro'], readWrite: ['sales-rw'] };
  ids.sales = await folder('Sales', 'root', sales);
  ids.emea = await folder('EMEA', ids.sales, sales);
  ids.ops = await folder('Ops', 'root', sales);
  app = buildServer({
    config: secured,
    sessions: pgSessionStore(getDb()),
    documents: docs(),
    catalog: catalog(getDb()),
    folderAccess: folderAccessStore(getDb()),
    audit: auditStore(getDb()),
    proposals: proposalStore(getDb()),
    versions: versionStore(getDb()),
    boundarySets: boundarySetStore(getDb()),
  });
  for (const who of ['writer', 'reader', 'super']) cookies[who] = await signIn(app, USERS[who]!);
});

afterAll(async () => {
  if (app !== undefined) await app.close();
  const db = getDb();
  await db.deleteFrom('proposals').where('target_folder_id', 'in', Object.values(ids)).execute();
  await db.deleteFrom('audit_records').where('folder_id', 'in', Object.values(ids)).execute();
  await db.deleteFrom('boundary_sets').where('name', 'like', `%${MARK}%`).execute();
  await removeProjectFolders();
  for (const { kind, id } of made.reverse()) await docs().remove(kind, id);
  await closeDb();
});

const as = (who: string, options: InjectOptions) =>
  app.inject({ ...options, headers: { ...options.headers, cookie: cookies[who]! } });

const upload = (who: string, payload: Record<string, unknown>) =>
  as(who, { method: 'POST', url: '/api/boundary-sets', payload });

const offered = async (who: string, folderId: string) =>
  (
    await as(who, { method: 'GET', url: `/api/boundary-sets?folder=${folderId}` })
  ).json<{ sets: { name: string; id: string }[] }>().sets.map((set) => set.name);

describe('uploading a custom boundary set (AC-628)', () => {
  it('refuses a read-only member, and refuses a file that fails, naming the feature', async () => {
    const name = `Territories ${MARK}`;
    const body = { name, keyProperty: 'territory_id', geojson: TERRITORIES, targetFolderId: ids.sales };
    expect((await upload('reader', body)).statusCode).toBe(403);

    const point = {
      type: 'Feature',
      properties: { territory_id: 'Pier' },
      geometry: { type: 'Point', coordinates: [0, 0] },
    };
    const refused = await upload('writer', {
      ...body,
      geojson: { ...TERRITORIES, features: [...TERRITORIES.features, point] },
    });
    expect(refused.statusCode).toBe(422);
    expect(refused.json<{ error: string }>().error).toBe(
      'Feature 4 ("Pier") is a Point: every feature must be a Polygon or MultiPolygon.',
    );
    const twice = await upload('writer', {
      ...body,
      geojson: { ...TERRITORIES, features: [...TERRITORIES.features, square('Gulf', 5)] },
    });
    expect(twice.statusCode).toBe(422);
    expect(twice.json<{ error: string }>().error).toContain('Feature 4 ("Gulf")');
    // Checkpoint 5's review: a Polygon's coordinates must be rings of positions.
    for (const coordinates of [null, [], [[[0, 0], ['a', 'b'], [1, 1], [0, 0]]]]) {
      const broken = await upload('writer', {
        ...body,
        geojson: {
          ...TERRITORIES,
          features: [
            ...TERRITORIES.features,
            { ...square('Reef', 9), geometry: { type: 'Polygon', coordinates } },
          ],
        },
      });
      expect(broken.statusCode, JSON.stringify(coordinates)).toBe(422);
      expect(broken.json<{ error: string }>().error).toBe(
        'Feature 4 ("Reef") has a Polygon that isn’t rings of at least 4 [longitude, latitude] positions.',
      );
    }
    const keyless = await upload('writer', { ...body, keyProperty: 'region' });
    expect(keyless.json<{ error: string }>().error).toBe(
      'Feature 1 has no "region": every feature must hold the key property.',
    );
  });

  it('takes it into My workspace, reaching the folder only through an approved proposal, then offered along the path', async () => {
    const name = `Territories ${MARK}`;
    const taken = await upload('writer', {
      name,
      keyProperty: 'territory_id',
      geojson: TERRITORIES,
      targetFolderId: ids.sales,
    });
    expect(taken.statusCode, taken.body).toBe(201);
    const set = taken.json<{ id: string; folderId: string; regions: number }>();
    // Their own workspace, as the client is shown it (`access/workspace-alias.ts`).
    expect(set.folderId, taken.body).toBe('mine');
    expect(set.regions).toBe(3);
    // Not in the folder yet: nothing is offered there.
    expect(await offered('writer', ids.sales)).not.toContain(name);

    const proposed = await as('writer', {
      method: 'POST',
      url: '/api/proposals',
      payload: { kind: 'boundary-set', id: set.id },
    });
    expect(proposed.statusCode, proposed.body).toBe(201);
    const proposal = proposed.json<{ id: string }>();
    // Waiting, still not in the folder.
    expect(await offered('reader', ids.sales)).not.toContain(name);

    const approved = await as('super', {
      method: 'POST',
      url: `/api/proposals/${proposal.id}/approve`,
      payload: {},
    });
    expect(approved.statusCode, approved.body).toBeLessThan(300);

    // In /Sales and /Sales/EMEA, for every member; not in /Ops beside it.
    expect(await offered('reader', ids.sales)).toContain(name);
    expect(await offered('reader', ids.emea)).toContain(name);
    expect(await offered('writer', ids.ops)).not.toContain(name);
    // Its regions, as uploaded, to those who see its folder.
    const landed = (
      await as('reader', { method: 'GET', url: `/api/boundary-sets?folder=${ids.emea}` })
    )
      .json<{ sets: { id: string; name: string }[] }>()
      .sets.find((each) => each.name === name)!;
    const geometry = await as('reader', {
      method: 'GET',
      url: `/api/boundary-sets/${landed.id}/geojson`,
    });
    expect(geometry.statusCode).toBe(200);
    expect(
      geometry.json<{ keyProperty: string; geojson: { features: unknown[] } }>().geojson.features,
    ).toHaveLength(3);
  });
});
