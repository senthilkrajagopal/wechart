import { describe, expect, it, vi } from 'vitest';

import {
  chartRefusal,
  folderRefusal,
  modelRefusal,
  sourceRefusal,
  type ChartDependents,
} from './deleteChecks';

/**
 * What design 14's state A says of a library chart the shared folders'
 * dashboards use (T517, AC-362): those the user may see, each with its
 * folder; the rest counted; and how to free it.
 */
const SEEN: ChartDependents['dashboards'][number] = {
  id: 'd1',
  title: 'Revenue overview',
  folderId: 'f-emea',
  folderPath: [
    { id: 'f-sales', title: 'Sales' },
    { id: 'f-emea', title: 'EMEA' },
  ],
};

describe('a chart’s refusal (T517, AC-362; design 14, state A)', () => {
  it('is none where nothing uses it', () => {
    expect(chartRefusal({ dashboards: [], hidden: 0 }, { signedIn: true })).toBeUndefined();
  });

  it('names the dashboards the user may see, with their folders, counting the rest', () => {
    const refusal = chartRefusal(
      {
        dashboards: [SEEN, { id: 'd2', title: 'Weekly', folderId: 'root', folderPath: [] }],
        hidden: 2,
      },
      { signedIn: true },
    );
    expect(refusal).toEqual({
      kind: 'refused',
      lead: '4 dashboards use it. Remove it from each of them, then delete it.',
      groups: [
        {
          heading: 'Dashboards that use it',
          rows: [
            {
              key: 'd1',
              icon: 'dashboard',
              name: 'Revenue overview',
              href: '/explore/dashboards/d1',
              where: 'Sales / EMEA',
            },
            {
              key: 'd2',
              icon: 'dashboard',
              name: 'Weekly',
              href: '/explore/dashboards/d2',
              where: 'Shared',
            },
          ],
        },
      ],
      hidden: 2,
      help: 'A shared dashboard changes through Edit in my workspace and a proposal.',
    });
  });

  it('says only how many, and when it can go, where every one is out of sight (A2)', () => {
    expect(chartRefusal({ dashboards: [], hidden: 2 }, { signedIn: true })).toEqual({
      kind: 'refused',
      lead: '2 dashboards use it, in folders you can’t see. It can be deleted once no dashboard uses it.',
    });
  });

  it('leaves the proposal line out with sign-in off, where dashboards change in place', () => {
    expect(
      chartRefusal({ dashboards: [SEEN], hidden: 0 }, { signedIn: false })?.help,
    ).toBeUndefined();
    expect(chartRefusal({ dashboards: [SEEN], hidden: 0 }, { signedIn: false })?.lead).toBe(
      '1 dashboard uses it. Remove it from the dashboard, then delete it.',
    );
  });

  it('says a dashboard took it up just now, where the delete itself was refused (A4)', () => {
    expect(
      chartRefusal({ dashboards: [SEEN], hidden: 0 }, { signedIn: true, justNow: true })?.lead,
    ).toBe('A dashboard started using it just now. Nothing was deleted.');
  });
});

describe('a folder’s refusal (T521, AC-366; design 14, state E4)', () => {
  it('says what it holds, by kind in AC-366’s order, only the kinds it has, with a way to open it', () => {
    const open = vi.fn();
    const refusal = folderRefusal(
      { subfolders: 1, dashboards: 2, charts: 0, models: 1, dataSources: 0 },
      'Archive 2025',
      open,
    );
    expect(refusal.lead).toBe(
      'It isn’t empty any more. It holds 1 subfolder, 2 dashboards and 1 model. Only an empty folder can be deleted.',
    );
    expect(refusal.also?.label).toBe('Open Archive 2025');
    refusal.also?.onSelect();
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('names a lone kind alone', () => {
    expect(
      folderRefusal(
        { subfolders: 0, dashboards: 0, charts: 0, models: 0, dataSources: 1 },
        'X',
        () => undefined,
      ).lead,
    ).toBe('It isn’t empty any more. It holds 1 data source. Only an empty folder can be deleted.');
  });
});

describe('a data source’s refusal (T526, AC-364; design 14, state C)', () => {
  it('names the cubes bound to it, each with its model and folder, counts the rest, and says how to free it', () => {
    expect(
      sourceRefusal({
        cubes: [
          {
            name: 'orders',
            folderId: 'f-emea',
            file: 'cubes/sales.yml',
            folderPath: [
              { id: 'f-sales', title: 'Sales' },
              { id: 'f-emea', title: 'EMEA' },
            ],
          },
        ],
        hidden: 2,
      }),
    ).toEqual({
      kind: 'refused',
      lead: '3 published cubes are bound to it. A cube keeps the data source it was published with, so publish each with another data source, or delete it, first.',
      groups: [
        {
          heading: 'Cubes bound to it',
          rows: [
            {
              key: 'f-emea/orders',
              icon: 'cube',
              name: 'orders',
              code: true,
              // Model and Folder, each a link of its own (design 14, C2; T526's review).
              file: { text: 'sales.yml', href: '/explore/folders/f-emea/models/cubes%2Fsales.yml' },
              where: 'Sales / EMEA',
              whereHref: '/explore?folder=f-emea',
            },
          ],
        },
      ],
      hidden: 2,
    });
  });

  it('is none where no cube is bound to it, and only a count where each is out of sight', () => {
    expect(sourceRefusal({ cubes: [], hidden: 0 })).toBeUndefined();
    expect(sourceRefusal({ cubes: [], hidden: 1 })?.lead).toBe(
      '1 published cube is bound to it, in a folder you can’t see. It can be deleted once no published cube is bound to it.',
    );
  });
});

describe('a model file’s refusal (T526, AC-365; design 14, state D)', () => {
  const pathOf = (id: string) => ({ sales: 'Sales', 'f-emea': 'Sales / EMEA' })[id];

  it('groups what depends on its cube by kind, in AC-365’s order, each where it is', () => {
    const refusal = modelRefusal(
      {
        declares: [{ kind: 'cube', name: 'customers' }],
        views: [{ name: 'order_summary', folderId: 'sales', file: 'order_summary.yml' }],
        cubes: [{ name: 'orders', folderId: 'f-emea', file: 'sales.yml' }],
        charts: [{ id: 'c1', title: 'Top customers', folderId: 'f-emea' }],
        dashboards: [{ id: 'd1', title: 'Revenue overview', folderId: 'f-emea' }],
        hidden: 3,
      },
      pathOf,
    );
    expect(refusal?.lead).toBe(
      'Its cube customers is still in use. Remove what depends on it first.',
    );
    expect(refusal?.groups?.map((group) => group.heading)).toEqual([
      'Views that use it',
      'Cubes that join to it',
      'Charts bound to it',
      'Dashboards bound to it',
    ]);
    // Each a link, a view's and a cube's to its file (design 14, D2; T526's review).
    expect(refusal?.groups?.map((group) => group.rows[0])).toEqual([
      {
        key: 'view:sales/order_summary',
        icon: 'view',
        name: 'order_summary',
        code: true,
        href: '/explore/folders/sales/models/order_summary.yml',
        where: 'order_summary.yml · Sales',
      },
      {
        key: 'cube:f-emea/orders',
        icon: 'cube',
        name: 'orders',
        code: true,
        href: '/explore/folders/f-emea/models/sales.yml',
        where: 'sales.yml · Sales / EMEA',
      },
      {
        key: 'c1',
        icon: 'chart',
        name: 'Top customers',
        href: '/explore/charts/c1',
        where: 'Sales / EMEA',
      },
      {
        key: 'd1',
        icon: 'dashboard',
        name: 'Revenue overview',
        href: '/explore/dashboards/d1',
        where: 'Sales / EMEA',
      },
    ]);
    expect(refusal?.hidden).toBe(3);
  });

  it('is none where nothing depends on it', () => {
    expect(
      modelRefusal(
        {
          declares: [{ kind: 'cube', name: 'customers' }],
          views: [],
          cubes: [],
          charts: [],
          dashboards: [],
          hidden: 0,
        },
        pathOf,
      ),
    ).toBeUndefined();
  });

  it('names no one cube of a file declaring several, since each may not be the one in use', () => {
    expect(
      modelRefusal(
        {
          declares: [
            { kind: 'cube', name: 'a' },
            { kind: 'cube', name: 'b' },
          ],
          views: [{ name: 'over_b', folderId: 'sales' }],
          cubes: [],
          charts: [],
          dashboards: [],
          hidden: 0,
        },
        pathOf,
      )?.lead,
    ).toBe('Something still depends on what it declares. Remove what depends on it first.');
  });

  it('counts what took it up just now, where it may name none (A4)', () => {
    expect(
      modelRefusal(
        {
          declares: [{ kind: 'cube', name: 'customers' }],
          views: [],
          cubes: [],
          charts: [],
          dashboards: [],
          hidden: 2,
        },
        pathOf,
        { justNow: true },
      )?.lead,
    ).toBe(
      'Its cube customers started being used just now, by 2 items in folders you can’t see. Nothing was deleted.',
    );
  });
});
