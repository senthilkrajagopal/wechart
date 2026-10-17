import { describe, expect, it } from 'vitest';

import { CubeClient } from '../cube/client';
import { buildServer } from '../server';

/**
 * T689 (AC-352; 2026-09-24 design 01 pin 6; chart-editor-Q6): a measure's
 * tag offers the aggregations the model allows, meaning the sibling measures
 * the model declares on the same cube over the same `sql`. Which those are is
 * in Cube's extended metadata alone, each measure's `sql` (research
 * `cube/meta-extended-joins.md`, item 4). The browser is told which measures
 * are siblings, never the SQL they share.
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
      joins: [],
      measures: [
        { name: 'orders.count', type: 'number', aggType: 'count' },
        { name: 'orders.total_amount', type: 'number', aggType: 'sum', sql: '`amount`' },
        { name: 'orders.average_amount', type: 'number', aggType: 'avg', sql: '`amount`' },
        { name: 'orders.largest_fee', type: 'number', aggType: 'max', sql: '`fee`' },
      ],
      dimensions: [],
    },
    {
      name: 'monthly_orders',
      type: 'cube',
      joins: [],
      measures: [
        { name: 'monthly_orders.count', type: 'number', aggType: 'count' },
        { name: 'monthly_orders.total_amount', type: 'number', aggType: 'sum', sql: '`amount`' },
      ],
      dimensions: [],
    },
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

describe('each measure’s siblings, for its aggregation menu (T689, chart-editor-Q6)', () => {
  it('answers the measures of one cube over the same SQL, each naming the others, and no SQL', async () => {
    const app = buildServer({ config, cube: stubCube(EXTENDED) });
    const response = await app.inject({ method: 'GET', url: '/api/meta/siblings' });
    expect(response.statusCode).toBe(200);
    // Another cube's measure over the same words is no sibling; a count with
    // no SQL, or a measure alone over its own, has none.
    expect(response.json()).toEqual({
      siblings: {
        'orders.total_amount': ['orders.average_amount'],
        'orders.average_amount': ['orders.total_amount'],
      },
    });
    expect(response.body).not.toContain('amount`');
    await app.close();
  });

  it('answers none for a model with no cubes, or an answer it can’t read', async () => {
    for (const extended of [
      { cubes: [] },
      null,
      { cubes: [{ name: 'orders', measures: [{ name: 1, sql: 'x' }, { sql: 'x' }] }] },
    ]) {
      const app = buildServer({ config, cube: stubCube(extended) });
      const response = await app.inject({ method: 'GET', url: '/api/meta/siblings' });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ siblings: {} });
      await app.close();
    }
  });
});
