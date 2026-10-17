import { describe, expect, it } from 'vitest';

import { CubeClient } from '../cube/client';
import { buildServer } from '../server';

/**
 * T688 (AC-352; 2026-09-24 design 01 pin 2, the chart editor critique's
 * EDI-03): the field list shows each cube a chosen cube joins to, "· via
 * join". Which cubes those are is in Cube's extended metadata alone, each
 * cube's `joins` as `{ name, sql, relationship }` (research
 * `cube/meta-extended-joins.md`). The browser is told each join's target and
 * relationship, never its SQL.
 */
const config = {
  cubeApiUrl: 'http://cube.invalid/cubejs-api',
  cubeApiSecret: 'secret',
  securityContext: {},
  port: 4100,
  modelDir: '',
};

/** Cube's extended metadata, as observed from the compose model (the research note). */
const EXTENDED = {
  cubes: [
    {
      name: 'orders',
      type: 'cube',
      sql: 'SELECT * FROM orders',
      joins: [
        {
          name: 'customers',
          sql: '`${CUBE}.customer_id = ${customers}.id`',
          relationship: 'belongsTo',
        },
        {
          name: 'products',
          sql: '`${CUBE}.product_id = ${products}.id`',
          relationship: 'belongsTo',
        },
      ],
      measures: [],
      dimensions: [],
    },
    { name: 'customers', type: 'cube', joins: [], measures: [], dimensions: [] },
    { name: 'products', type: 'cube', joins: [], measures: [], dimensions: [] },
    { name: 'order_summary', type: 'view', joins: [], measures: [], dimensions: [] },
  ],
};

function stubCube(extended: unknown): CubeClient {
  const client = new CubeClient({
    apiUrl: config.cubeApiUrl,
    apiSecret: 'secret',
    securityContext: {},
  });
  return Object.create(client, {
    metaExtended: { value: async () => extended },
  }) as CubeClient;
}

describe('each cube’s joins, for the field list (T688, EDI-03)', () => {
  it('answers each cube’s join targets and relationships, and no SQL', async () => {
    const app = buildServer({ config, cube: stubCube(EXTENDED) });
    const response = await app.inject({ method: 'GET', url: '/api/meta/joins' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      joins: {
        orders: [
          { name: 'customers', relationship: 'belongsTo' },
          { name: 'products', relationship: 'belongsTo' },
        ],
        customers: [],
        products: [],
        order_summary: [],
      },
    });
    expect(response.body).not.toContain('customer_id');
    await app.close();
  });

  it('names no joined cube the answer doesn’t hold, as the user’s token can’t see it', async () => {
    const app = buildServer({
      config,
      cube: stubCube({
        cubes: [
          {
            name: 'orders',
            joins: [
              { name: 'customers', sql: 'x', relationship: 'belongsTo' },
              { name: 'payroll', sql: 'y', relationship: 'belongsTo' },
            ],
          },
          { name: 'customers', joins: [] },
        ],
      }),
    });
    const response = await app.inject({ method: 'GET', url: '/api/meta/joins' });
    expect(response.json()).toEqual({
      joins: { orders: [{ name: 'customers', relationship: 'belongsTo' }], customers: [] },
    });
    await app.close();
  });

  it('answers none for a model with no cubes, or an answer it can’t read', async () => {
    for (const extended of [{ cubes: [] }, null, { cubes: [{ joins: [{ name: 1 }] }] }]) {
      const app = buildServer({ config, cube: stubCube(extended) });
      const response = await app.inject({ method: 'GET', url: '/api/meta/joins' });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ joins: {} });
      await app.close();
    }
  });
});
