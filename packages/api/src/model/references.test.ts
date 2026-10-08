import { describe, expect, it } from 'vitest';

import { buildServer } from '../server';
import { referencesOf, strandedRefusal, usersOfCubes } from './references';

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
// As stored: a chart's wells and filters; a dashboard's pages of tiles, a
// tile naming its chart, sections holding more (seed.ts; T147's review).
const DOCUMENTS = [
  {
    kind: 'chart',
    id: 'c-revenue',
    title: 'Revenue by status',
    body: {
      wells: {
        measures: ['orders.total_amount'],
        dimensions: ['orders.status'],
        timeDimensions: ['orders.ordered_at.month'],
      },
    },
    localToDashboardId: null,
  },
  {
    kind: 'chart',
    id: 'c-count',
    title: 'Orders',
    body: {
      wells: { measures: ['orders.count'], dimensions: [], timeDimensions: [] },
      filters: [{ member: 'orders.status', operator: 'set' }],
    },
    localToDashboardId: null,
  },
  {
    kind: 'chart',
    id: 'c-local',
    title: 'Customers here',
    body: { wells: { measures: ['customers.count'], dimensions: [], timeDimensions: [] } },
    localToDashboardId: 'd-ops',
  },
  {
    kind: 'dashboard',
    id: 'd-sales',
    title: 'Sales',
    body: {
      pages: [
        {
          id: 'p1',
          items: [
            {
              id: 'sec',
              kind: 'section',
              items: [{ id: 't1', kind: 'chart', chartId: 'c-revenue' }],
            },
          ],
        },
      ],
      filters: [],
    },
    localToDashboardId: null,
  },
  {
    kind: 'dashboard',
    id: 'd-ops',
    title: 'Operations',
    body: {
      pages: [{ id: 'p1', items: [{ id: 't1', kind: 'chart', chartId: 'c-local' }] }],
      filters: [{ member: 'orders.status', values: ['shipped'] }],
    },
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

    // In the body: a wide cube's names would outgrow a URL (T147's review).
    const response = await app.inject({
      method: 'POST',
      url: '/api/model/references',
      payload: { members: ['orders.count', 'customers.count'] },
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

    const response = await app.inject({
      method: 'POST',
      url: '/api/model/references',
      payload: { members: [] },
    });

    expect(response.json()).toEqual({ charts: [], dashboards: [] });
    await app.close();
  });
});

/**
 * T428, AC-275: what a delete or rename of a cube would leave bound to
 * nothing — the charts whose query names it, and the dashboards whose own
 * filters do, read where they keep references. Words that happen to spell
 * it, a title or a text, are not uses (T428's review).
 */
describe('the items that use a cube (T428)', () => {
  const doc = (kind: string, id: string, title: string, body: unknown) => ({
    kind,
    id,
    title,
    body,
    localToDashboardId: null,
  });

  it('names the charts whose query names the cube, and the dashboards whose filters do', () => {
    const documents = [
      doc('chart', 'c1', 'By month', {
        chart: {
          source: { cube: 'sales' },
          wells: { measures: ['orders.count'], dimensions: [], timeDimensions: [] },
        },
      }),
      doc('chart', 'c2', 'Sales', {
        chart: {
          source: { cube: 'sales' },
          wells: { measures: ['sales.count'], dimensions: [], timeDimensions: [] },
        },
      }),
      doc('dashboard', 'd1', 'Board', { filters: [{ member: 'orders.status' }] }),
      doc('dashboard', 'd2', 'orders', { pages: [{ items: [{ text: 'orders.count' }] }] }),
    ];

    expect(usersOfCubes(documents, ['orders'])).toEqual({
      charts: [{ id: 'c1', title: 'By month' }],
      dashboards: [{ id: 'd1', title: 'Board' }],
    });
  });

  /**
   * T389's review, AC-275: a text tile's measure token uses its cube as a
   * filter does, so deleting or renaming the cube is refused while it does.
   */
  it('names the dashboards whose text tiles’ tokens name the cube, in a section too', () => {
    const tile = (text: string) => ({ id: 't', kind: 'markdown', text });
    const documents = [
      doc('dashboard', 'd1', 'Top', {
        pages: [{ items: [tile('{{measure:orders.count}} in all')] }],
      }),
      doc('dashboard', 'd2', 'Nested', {
        pages: [
          { items: [{ kind: 'section', items: [tile('{{measure:orders.count | marking:A}}')] }] },
        ],
      }),
      doc('dashboard', 'd3', 'Words', { pages: [{ items: [tile('orders.count, {{x}}')] }] }),
    ];

    expect(usersOfCubes(documents, ['orders']).dashboards).toEqual([
      { id: 'd1', title: 'Top' },
      { id: 'd2', title: 'Nested' },
    ]);
  });
});

/** T389's review, AC-141: an edited member a text tile's token names is one the dashboard uses. */
describe('a text tile’s tokens as references', () => {
  it('lists a dashboard whose text tile names the member in a token', () => {
    const found = referencesOf(
      [
        {
          kind: 'dashboard',
          id: 'd-text',
          title: 'Text',
          localToDashboardId: null,
          body: {
            pages: [{ items: [{ kind: 'markdown', text: 'Open: {{measure:orders.status}}' }] }],
          },
        },
      ],
      ['orders.status'],
    );

    expect(found.dashboards).toEqual([
      { id: 'd-text', title: 'Text', members: ['orders.status'], through: [] },
    ]);
  });
});

/**
 * T714 (AC-425, AC-322): a move that would leave a chart or a dashboard using
 * a cube off its folder's path is refused, naming each such item and its
 * cubes where the mover may see its folder, and only counting the rest.
 */
describe('a move’s stranded references, as the mover may see them (T714)', () => {
  const seen = new Set(['b']);
  const sees = (folderId: string | null) => folderId !== null && seen.has(folderId);

  it('names a chart, a dashboard’s own chart and a dashboard, each with its cubes', () => {
    expect(
      strandedRefusal(
        [
          { kind: 'chart', id: 'c1', title: 'Sales', folderId: 'b', names: ['a_sales'] },
          {
            kind: 'chart',
            id: 'c2',
            title: 'Margin',
            dashboard: 'Revenue',
            folderId: 'b',
            names: ['a_sales', 'a_costs'],
          },
          { kind: 'dashboard', id: 'd1', title: 'Revenue', folderId: 'b', names: ['a_sales'] },
        ],
        sees,
      ),
    ).toEqual({
      error:
        'Moved, “Sales” would use “a_sales”, which isn’t in its folder or one above it; “Margin” on “Revenue” would use “a_sales” and “a_costs”, which aren’t in its folder or one above it; “Revenue” would use “a_sales”, which isn’t in its folder or one above it. Nothing was moved.',
      stranded: [
        { kind: 'chart', id: 'c1', title: 'Sales', names: ['a_sales'] },
        {
          kind: 'chart',
          id: 'c2',
          title: 'Margin',
          dashboard: 'Revenue',
          names: ['a_sales', 'a_costs'],
        },
        { kind: 'dashboard', id: 'd1', title: 'Revenue', names: ['a_sales'] },
      ],
    });
  });

  it('counts those in folders the mover can’t see, naming neither them nor their cubes', () => {
    const refusal = strandedRefusal(
      [
        { kind: 'chart', id: 'c1', title: 'Sales', folderId: 'b', names: ['a_sales'] },
        { kind: 'chart', id: 'c3', title: 'Secret', folderId: 'h', names: ['h_cube'] },
        { kind: 'dashboard', id: 'd3', title: 'Hidden', folderId: 'h', names: ['h_cube'] },
      ],
      sees,
    );
    expect(refusal).toEqual({
      error:
        'Moved, “Sales” would use “a_sales”, which isn’t in its folder or one above it. 2 charts or dashboards in folders you can’t see would use cubes off their folders’ paths. Nothing was moved.',
      stranded: [{ kind: 'chart', id: 'c1', title: 'Sales', names: ['a_sales'] }],
      hidden: 2,
    });
    expect(JSON.stringify(refusal)).not.toMatch(/Secret|Hidden|h_cube/);
  });

  it('says one it can’t name alone', () => {
    expect(
      strandedRefusal(
        [{ kind: 'chart', id: 'c3', title: 'Secret', folderId: 'h', names: ['h_cube'] }],
        sees,
      ),
    ).toEqual({
      error:
        'Moved, 1 chart or dashboard in a folder you can’t see would use a cube off its folder’s path. Nothing was moved.',
      stranded: [],
      hidden: 1,
    });
  });
});
