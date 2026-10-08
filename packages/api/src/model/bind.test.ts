import type { ChartDefinition } from '@wechart/core';
import { describe, expect, it } from 'vitest';

import { xcubeAdmin } from '../xcube/client';
import { fakeXcube, FAKE_ADMIN_TOKEN } from '../xcube/fake';
import type { Item } from '../xcube/items';
import { bindChart, bindNames, chartRenamed, cubesOfChart, dashboardRenamed } from './bind';

/**
 * T429, T711, AC-272: WHEN a dashboard or chart is published into a folder,
 * THE SYSTEM SHALL bind each cube or view it names to the one item of that
 * name, where that folder or one above it keeps it. xcube's resolver answers
 * the item in any folder (research `xcube-256d632371.md`, 3.3); the path is
 * wechart's rule. A cube only in a descendant or a sibling folder is refused,
 * as is a name no item holds, naming it.
 *
 * With one name per item (R71; T709), every name is one item's and is
 * stored as it is, with no folder prefix. Against the stub xcube: the root
 * holds `sales` (joining `customers`), `customers` (joining `regions`) and
 * `regions`; /A (`fa`) `a_orders`; /A/B (`fab`) `ab_lines`, joining the
 * root's `customers`; /A/B/C (`fabc`), beneath /A/B, `deep`; /A/D (`fad`),
 * /A/B's sibling, `widgets`.
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
  stub.holdItems('dev', [
    cube('froot', 'sales', ['customers']),
    cube('froot', 'customers', ['regions']),
    cube('froot', 'regions'),
    cube('fa', 'a_orders'),
    cube('fab', 'ab_lines', ['customers']),
    cube('fabc', 'deep'),
    cube('fad', 'widgets'),
  ]);
  return admin;
}

/** Each folder's path, nearest first, as xcube ids: where its items may bind (T711). */
const ROOT = ['froot'];
const A = ['fa', 'froot'];
const AB = ['fab', 'fa', 'froot'];

const chart = (source: string, ...members: string[]): ChartDefinition => ({
  source: { cube: source },
  wells: { measures: [`${source}.count`], dimensions: members, timeDimensions: [] },
});

describe('binding a chart’s cubes at publish (T429, AC-272)', () => {
  it('binds the cube it starts from by its own name, from its folder or one above, storing it as it is', async () => {
    const admin = await xcube();

    // /A's and the root's, from /A/B; the root's in the root: nothing to store differently.
    expect(await bindChart(admin, AB, chart('a_orders'))).toEqual({
      kind: 'bound',
      renames: new Map(),
    });
    expect(await bindChart(admin, AB, chart('sales'))).toEqual({
      kind: 'bound',
      renames: new Map(),
    });
    expect(await bindChart(admin, ROOT, chart('sales'))).toEqual({
      kind: 'bound',
      renames: new Map(),
    });
  });

  // Names compare in any case (R71 6): stored as the one item holds it
  // (research `xcube-256d632371.md`, 3.3). This replaces T429's "a full name
  // taken as its short name", there being no full names any more.
  it('stores a name asked in another case as the item holds it', async () => {
    const admin = await xcube();

    expect(await bindChart(admin, AB, chart('Sales'))).toEqual({
      kind: 'bound',
      renames: new Map([['Sales', 'sales']]),
    });
  });

  it('never binds a descendant’s or a sibling’s, and refuses a name no folder on the path holds, naming it', async () => {
    const admin = await xcube();

    // /A/B/C's `deep` is beneath /A.
    expect(await bindChart(admin, A, chart('deep'))).toEqual({
      kind: 'refused',
      names: ['deep'],
    });
    // `widgets` is only /A/D's, /A/B's sibling.
    expect(await bindChart(admin, AB, chart('widgets'))).toEqual({
      kind: 'refused',
      names: ['widgets'],
    });
    expect(await bindChart(admin, AB, chart('sales', 'nowhere.name'))).toEqual({
      kind: 'refused',
      names: ['nowhere'],
    });
  });

  it('binds each other cube the chart uses by its own name too, held to the path', async () => {
    const admin = await xcube();

    // /A/B's `ab_lines` joins the root's `customers`, which joins `regions`.
    expect(await bindChart(admin, AB, chart('ab_lines', 'customers.name', 'regions.name'))).toEqual(
      { kind: 'bound', renames: new Map() },
    );
    // A second cube kept off the path is refused, though the first binds (T711).
    expect(await bindChart(admin, AB, chart('ab_lines', 'widgets.name'))).toEqual({
      kind: 'refused',
      names: ['widgets'],
    });
    expect(await bindChart(admin, AB, chart('ab_lines', 'Regions.name'))).toEqual({
      kind: 'bound',
      renames: new Map([['Regions', 'regions']]),
    });
  });

  it('refuses a name only a folder beneath holds', async () => {
    const admin = await xcube();

    // `deep` is only /A/B/C's, beneath /A/B.
    expect(await bindChart(admin, AB, chart('deep'))).toEqual({
      kind: 'refused',
      names: ['deep'],
    });
  });

  it('refuses every name on a path holding no folder', async () => {
    const admin = await xcube();

    expect(await bindNames(admin, [], ['sales', 'regions'])).toEqual({
      kind: 'refused',
      names: ['sales', 'regions'],
    });
  });

  it('binds a dashboard’s own names by the resolver, and refuses one no folder on its path holds', async () => {
    const admin = await xcube();

    expect(await bindNames(admin, AB, ['ab_lines', 'a_orders', 'regions'])).toEqual({
      kind: 'bound',
      renames: new Map(),
    });
    expect(await bindNames(admin, AB, ['sales', 'widgets'])).toEqual({
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

  /**
   * T389's review, AC-272: a text tile's measure token names a member as a
   * filter does, so it is bound with the dashboard, wherever the tile is.
   */
  it('renames the members a text tile’s tokens name, in a section or a tab too', () => {
    const renames = new Map([['sales', 'fab__sales']]);
    const text = (inner: string) => `Sales: {{measure:${inner}.count | marking:A}} of {{x}}`;
    const body = {
      pages: [
        {
          id: 'p',
          items: [
            { id: 't1', kind: 'markdown', text: text('sales') },
            {
              id: 's',
              kind: 'section',
              items: [
                {
                  id: 'g',
                  kind: 'tabs',
                  tabs: [
                    { id: 'tab', items: [{ id: 't2', kind: 'markdown', text: text('orders') }] },
                  ],
                },
              ],
            },
            { id: 'h', kind: 'header', text: '{{measure:sales.count}}' },
          ],
        },
      ],
    };

    const renamed = dashboardRenamed(body, renames) as typeof body;
    const [t1, section, header] = renamed.pages[0]!.items as Record<string, unknown>[];
    expect(t1?.['text']).toBe(text('fab__sales'));
    expect(JSON.stringify(section)).toContain(text('orders'));
    // A header's text is words, not a text tile's: no token is read there.
    expect(header?.['text']).toBe('{{measure:sales.count}}');
  });
});
