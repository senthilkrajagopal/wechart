import { describe, expect, it } from 'vitest';

import { buildServer } from '../server';
import { referencesOf } from './references';

/**
 * T147 / AC-141: WHEN the user edits a member that charts use, THE SYSTEM
 * SHALL list the charts and dashboards that reference it before saving.
 * Fails when: a referencing chart is missing from that list.
 *
 * A member is named wherever a chart or dashboard keeps it — a query's
 * measures and dimensions, a time dimension, a filter, a dashboard's own
 * filters — so every string in a body is read, rather than one shape of it;
 * and a dashboard uses what its charts use.
 */
const DOCUMENTS = [
  {
    kind: 'chart',
    id: 'c-revenue',
    title: 'Revenue by status',
    body: {
      query: {
        measures: ['orders.total_amount'],
        dimensions: ['orders.status'],
        timeDimensions: [{ dimension: 'orders.ordered_at', granularity: 'month' }],
      },
    },
    localToDashboardId: null,
  },
  {
    kind: 'chart',
    id: 'c-count',
    title: 'Orders',
    body: {
      query: {
        measures: ['orders.count'],
        filters: [{ member: 'orders.status', operator: 'set' }],
      },
    },
    localToDashboardId: null,
  },
  {
    kind: 'chart',
    id: 'c-local',
    title: 'Customers here',
    body: { query: { measures: ['customers.count'] } },
    localToDashboardId: 'd-ops',
  },
  {
    kind: 'dashboard',
    id: 'd-sales',
    title: 'Sales',
    body: { charts: ['c-revenue'], filters: [] },
    localToDashboardId: null,
  },
  {
    kind: 'dashboard',
    id: 'd-ops',
    title: 'Operations',
    body: { charts: ['c-local'], filters: [{ member: 'orders.status', values: ['shipped'] }] },
    localToDashboardId: null,
  },
  { kind: 'folder', id: 'f', title: 'orders.status', body: {}, localToDashboardId: null },
];

describe('what uses a member', () => {
  it('lists every chart naming it, however it is kept', () => {
    const found = referencesOf(DOCUMENTS, ['orders.status']);

    expect(found.charts).toEqual([
      {
        id: 'c-revenue',
        title: 'Revenue by status',
        dashboardId: null,
        members: ['orders.status'],
      },
      { id: 'c-count', title: 'Orders', dashboardId: null, members: ['orders.status'] },
    ]);
  });

  it('lists every dashboard naming it, or holding a chart that does', () => {
    const found = referencesOf(DOCUMENTS, ['orders.status']);

    expect(found.dashboards).toEqual([
      { id: 'd-sales', title: 'Sales', members: ['orders.status'], through: ['c-revenue'] },
      { id: 'd-ops', title: 'Operations', members: ['orders.status'], through: [] },
    ]);
  });

  it('finds a time dimension at a granularity, and a chart kept on its dashboard', () => {
    const found = referencesOf(DOCUMENTS, ['orders.ordered_at', 'customers.count']);

    expect(found.charts.map((chart) => [chart.id, chart.dashboardId, chart.members])).toEqual([
      ['c-revenue', null, ['orders.ordered_at']],
      ['c-local', 'd-ops', ['customers.count']],
    ]);
    expect(found.dashboards.map((dashboard) => [dashboard.id, dashboard.through])).toEqual([
      ['d-sales', ['c-revenue']],
      ['d-ops', ['c-local']],
    ]);
  });

  it('matches whole member names, not a longer name that starts with one', () => {
    const found = referencesOf(DOCUMENTS, ['orders.total']);

    expect(found).toEqual({ charts: [], dashboards: [] });
  });
});

describe('the route', () => {
  const config = {
    port: 0,
    cubeApiUrl: 'http://cube.invalid/cubejs-api',
    cubeApiSecret: 'secret',
    securityContext: {},
    modelDir: '',
  };
  const catalog = {
    folders: async () => [],
    contents: async () => [],
    search: async () => [],
    referenceDocuments: async () => DOCUMENTS,
  };

  it('answers for the members asked about, from every chart and dashboard', async () => {
    const app = buildServer({ config, catalog });

    const response = await app.inject({
      method: 'GET',
      url: '/api/model/references?members=orders.count,customers.count',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      charts: [
        { id: 'c-count', title: 'Orders', dashboardId: null, members: ['orders.count'] },
        {
          id: 'c-local',
          title: 'Customers here',
          dashboardId: 'd-ops',
          members: ['customers.count'],
        },
      ],
      dashboards: [
        { id: 'd-ops', title: 'Operations', members: ['customers.count'], through: ['c-local'] },
      ],
    });
    await app.close();
  });

  it('answers nothing for no members', async () => {
    const app = buildServer({ config, catalog });

    const response = await app.inject({ method: 'GET', url: '/api/model/references' });

    expect(response.json()).toEqual({ charts: [], dashboards: [] });
    await app.close();
  });
});
