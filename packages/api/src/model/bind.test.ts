import type { ChartDefinition } from '@wechart/core';
import { describe, expect, it } from 'vitest';

import { xcubeAdmin } from '../xcube/client';
import { fakeXcube, FAKE_ADMIN_TOKEN } from '../xcube/fake';
import type { Item } from '../xcube/items';
import { bindChart, bindNames, chartRenamed, cubesOfChart, dashboardRenamed } from './bind';

/**
 * T429, AC-272: WHEN a dashboard or chart is published into a folder, THE
 * SYSTEM SHALL bind each cube it names nearest first from that folder up to
 * the root, and store the full published name of the nearest definition. It
 * asks xcube's resolver for the cube the chart starts from, and binds every
 * other cube the chart uses through the bindings that cube was published
 * with. A cube only in a descendant or a sibling folder is not available,
 * and a name found nowhere on the path is refused, naming it.
 *
 * Against the stub xcube: the root holds `sales`, `customers` and
 * `regions`; /A (`fa`) and /A/B (`fab`) each their own `sales`; /A/B/C
 * (`fabc`), beneath /A/B, a `sales` of its own; /A/D (`fad`), /A/B's
 * sibling, the only `widgets`. /A/B's `sales` was published bound to the
 * root's `customers`, and /A/B has since been given a `customers` of its
 * own: xcube never rebinds.
 */
const TREE = [
  { id: 'froot', parentId: null },
  { id: 'fa', parentId: 'froot' },
  { id: 'fab', parentId: 'fa' },
  { id: 'fabc', parentId: 'fab' },
  { id: 'fad', parentId: 'fa' },
];
const cube = (folderId: string, name: string, joins: readonly string[] = []): Item => ({
  folderId,
  name,
  kind: 'cube',
  yaml: [
    'cubes:',
    `  - name: ${name}`,
    `    sql_table: public.${name}`,
    ...(joins.length === 0 ? [] : ['    joins:', ...joins.map((join) => `      - name: ${join}`)]),
    '',
  ].join('\n'),
});

async function xcube() {
  const stub = fakeXcube();
  const admin = xcubeAdmin({
    cubeApiUrl: 'http://cube.invalid/cubejs-api',
    model: 'dev',
    token: FAKE_ADMIN_TOKEN,
    fetch: stub.fetch,
  });
  await admin.folders(TREE);
  stub.holdItems(
    'dev',
    [
      cube('froot', 'sales', ['customers']),
      cube('froot', 'customers', ['regions']),
      cube('froot', 'regions'),
      cube('fa', 'sales'),
      cube('fa', 'customers', ['regions']),
      cube('fa', 'regions'),
      cube('fab', 'sales', ['customers']),
      cube('fab', 'customers'),
      cube('fabc', 'sales'),
      cube('fabc', 'deep'),
      cube('fad', 'widgets'),
    ],
    {
      // Published before /A/B had a `customers`: bound to /A's.
      fab__sales: { sales: 'fab__sales', customers: 'fa__customers' },
      // Published before /A had a `regions`: bound to the root's.
      fa__customers: { customers: 'fa__customers', regions: 'regions' },
    },
  );
  return admin;
}

const chart = (source: string, ...members: string[]): ChartDefinition => ({
  source: { cube: source },
  wells: { measures: [`${source}.count`], dimensions: members, timeDimensions: [] },
});

describe('binding a chart’s cubes at publish (T429, AC-272)', () => {
  it('binds the cube it starts from nearest first: /A/B’s own over /A’s, and the root’s in the root', async () => {
    const admin = await xcube();

    expect(await bindChart(admin, 'fab', chart('sales'))).toEqual({
      kind: 'bound',
      renames: new Map([['sales', 'fab__sales']]),
    });
    expect(await bindChart(admin, 'fa', chart('sales'))).toEqual({
      kind: 'bound',
      renames: new Map([['sales', 'fa__sales']]),
    });
    // The root's is its short name: nothing to store differently.
    expect(await bindChart(admin, 'froot', chart('sales'))).toEqual({
      kind: 'bound',
      renames: new Map(),
    });
  });

  it('takes a full name as its short name there: a chart brought into /A/B binds /A/B’s', async () => {
    const admin = await xcube();

    expect(await bindChart(admin, 'fab', chart('fa__sales'))).toEqual({
      kind: 'bound',
      renames: new Map([['fa__sales', 'fab__sales']]),
    });
  });

  it('never binds a descendant’s or a sibling’s, and refuses a name no folder on the path holds, naming it', async () => {
    const admin = await xcube();

    // /A/B/C's `sales` is beneath /A: /A binds its own, never its descendant's.
    expect(await bindChart(admin, 'fa', chart('sales'))).toEqual({
      kind: 'bound',
      renames: new Map([['sales', 'fa__sales']]),
    });
    // `widgets` is only /A/D's, /A/B's sibling.
    expect(await bindChart(admin, 'fab', chart('widgets'))).toEqual({
      kind: 'refused',
      names: ['widgets'],
    });
    expect(await bindChart(admin, 'fab', chart('sales', 'nowhere.name'))).toEqual({
      kind: 'refused',
      names: ['nowhere'],
    });
  });

  it('binds another cube the chart uses as its source cube’s bindings have it, along their joins', async () => {
    const admin = await xcube();

    // /A/B's `sales` was bound to /A's `customers`, which was bound to the
    // root's `regions`. Asked afresh, the resolver would give /A/B's own
    // `customers` and /A's `regions`: neither is what the chart joins.
    expect(await bindChart(admin, 'fab', chart('sales', 'customers.name', 'regions.name'))).toEqual(
      {
        kind: 'bound',
        renames: new Map([
          ['sales', 'fab__sales'],
          ['customers', 'fa__customers'],
        ]),
      },
    );
  });

  it('refuses a name only a folder beneath holds', async () => {
    const admin = await xcube();

    // `deep` is only /A/B/C's, beneath /A/B.
    expect(await bindChart(admin, 'fab', chart('deep'))).toEqual({
      kind: 'refused',
      names: ['deep'],
    });
  });

  it('binds a dashboard’s own names by the resolver, and refuses one no folder on its path holds', async () => {
    const admin = await xcube();

    expect(await bindNames(admin, 'fab', ['sales', 'regions'])).toEqual({
      kind: 'bound',
      renames: new Map([
        ['sales', 'fab__sales'],
        ['regions', 'fa__regions'],
      ]),
    });
    expect(await bindNames(admin, 'fab', ['sales', 'widgets'])).toEqual({
      kind: 'refused',
      names: ['widgets'],
    });
  });
});

describe('what a chart names (T429)', () => {
  it('names the cube it starts from, and each other its members are of, anywhere in it', () => {
    expect(
      cubesOfChart({
        source: { cube: 'sales' },
        wells: {
          measures: ['sales.count', 'returns.count'],
          dimensions: ['customers.name'],
          timeDimensions: ['sales.ordered_at'],
          eachPointIs: 'stores.id',
        },
        encoding: { color: ['regions.name'] },
        granularities: { 'calendars.day': 'month' },
        filters: [{ member: 'products.category', operator: 'equals', values: ['toys'] }],
      }),
    ).toEqual({
      source: 'sales',
      others: ['returns', 'customers', 'stores', 'regions', 'calendars', 'products'],
    });
  });

  // T429's review: only where a chart keeps references; its data never.
  it('renames a renamed cube where a chart keeps references, and leaves its data and words alone', () => {
    const renames = new Map([['sales', 'fab__sales']]);

    expect(
      chartRenamed(
        {
          source: { cube: 'sales' },
          wells: {
            measures: ['sales.count', 'sales.total'],
            dimensions: ['salesperson.name'],
            timeDimensions: ['sales.ordered_at'],
          },
          encoding: { y: ['sales.count'] },
          granularities: { 'sales.ordered_at': 'month' },
          filters: [
            { member: 'orders.channel', operator: 'equals', values: ['sales', 'sales.eu'] },
          ],
          options: {
            sort: { by: 'value', direction: 'desc' },
            // A series named by its measure, and one named by a value.
            series: { 'sales.total': { color: 'red' }, sales: { color: 'blue' } },
            seriesOrder: ['sales.count', 'sales'],
            axes: { y: { title: 'sales.count per month' } },
          },
        },
        renames,
      ),
    ).toEqual({
      source: { cube: 'fab__sales' },
      wells: {
        measures: ['fab__sales.count', 'fab__sales.total'],
        dimensions: ['salesperson.name'],
        timeDimensions: ['fab__sales.ordered_at'],
      },
      encoding: { y: ['fab__sales.count'] },
      granularities: { 'fab__sales.ordered_at': 'month' },
      filters: [{ member: 'orders.channel', operator: 'equals', values: ['sales', 'sales.eu'] }],
      options: {
        sort: { by: 'value', direction: 'desc' },
        series: { 'fab__sales.total': { color: 'red' }, sales: { color: 'blue' } },
        seriesOrder: ['fab__sales.count', 'sales'],
        axes: { y: { title: 'sales.count per month' } },
      },
    });
  });

  it('renames only a dashboard’s filters’ members', () => {
    const renames = new Map([['sales', 'fab__sales']]);
    const body = {
      title: 'sales',
      filters: [
        { id: 'f1', member: 'sales.region' },
        { id: 'f2', member: 'orders.status' },
      ],
      pages: [{ id: 'sales', title: 'Sales', items: [] }],
    };

    expect(dashboardRenamed(body, renames)).toEqual({
      ...body,
      filters: [
        { id: 'f1', member: 'fab__sales.region' },
        { id: 'f2', member: 'orders.status' },
      ],
    });
  });
});
