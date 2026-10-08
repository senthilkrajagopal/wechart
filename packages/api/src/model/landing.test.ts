import { describe, expect, it } from 'vitest';

import type { StoredModelFile } from '../repos/model-files';
import { planLanding, type LandingModel } from './landing';

/**
 * T451 (AC-288, AC-275; T350's review): where a proposal's models land in
 * their folders. Files are stored by folder and path, a model is replaced by
 * the name it declares, and the two can disagree:
 * - a file of its name at another path is moved to its path, keeping its id,
 *   or the folder would declare the name twice;
 * - a file at its path declaring another name is refused, or it would be
 *   overwritten;
 * - a copy declaring a name other than the file it was copied from is
 *   refused: a landed name is fixed (T706, AC-423), where T451 renamed it.
 */
const cube = (name: string) => `cubes:\n  - name: ${name}\n    sql_table: public.${name}\n`;
const stored = (
  id: string,
  path: string,
  content: string,
  folderId = 'sales',
  version = 3,
): StoredModelFile => ({
  id,
  folderId,
  path,
  content,
  version,
  targetFolderId: null,
  origin: null,
});
const model = (
  fileId: string,
  path: string,
  content: string,
  originId: string | null = null,
  folderId = 'sales',
): LandingModel => ({ fileId, title: path, folderId, path, content, originId });

describe('where a proposal’s models land (T451)', () => {
  it('lands a new name as a new file, and one of its own path and name over that file', () => {
    const shared = [stored('s-orders', 'cubes/orders.yml', cube('orders'))];
    const plan = planLanding(shared, [
      model('w-orders', 'cubes/orders.yml', cube('orders') + '    description: Changed\n'),
      model('w-customers', 'cubes/customers.yml', cube('customers')),
    ]);
    expect(plan).toEqual({
      kind: 'planned',
      writes: [
        {
          fileId: 'w-orders',
          folderId: 'sales',
          path: 'cubes/orders.yml',
          content: cube('orders') + '    description: Changed\n',
          over: shared[0],
        },
        {
          fileId: 'w-customers',
          folderId: 'sales',
          path: 'cubes/customers.yml',
          content: cube('customers'),
          over: null,
        },
      ],
      resent: new Map([['sales', ['orders', 'customers']]]),
    });
  });

  it('moves the file of its name at another path to its own, so the folder declares it once', () => {
    const shared = [stored('s-orders', 'models/orders.yml', cube('orders'))];
    const plan = planLanding(shared, [model('w-orders', 'cubes/orders.yml', cube('orders'))]);
    expect(plan).toEqual({
      kind: 'planned',
      writes: [
        {
          fileId: 'w-orders',
          folderId: 'sales',
          path: 'cubes/orders.yml',
          content: cube('orders'),
          over: shared[0],
          from: 'models/orders.yml',
        },
      ],
      resent: new Map([['sales', ['orders']]]),
    });
  });

  it('refuses one whose path another name’s file holds, never writing over it', () => {
    const shared = [stored('s-other', 'cubes/orders.yml', cube('other'))];
    expect(planLanding(shared, [model('w-orders', 'cubes/orders.yml', cube('orders'))])).toEqual({
      kind: 'refused',
      error:
        '“cubes/orders.yml” can’t land: its folder’s file at that path declares “other”. Give yours another path in your workspace, and propose it again.',
    });
  });

  it('refuses a copy that renames the file it was copied from, at its path or another (T706, AC-423)', () => {
    const shared = [stored('s-orders', 'cubes/orders.yml', cube('orders'))];
    const refused = {
      kind: 'refused',
      error:
        '“cubes/orders.yml” can’t land: “orders” has landed, so its name is fixed: a copy of it keeps that name.',
    };
    expect(
      planLanding(shared, [
        model('w-orders', 'cubes/orders.yml', cube('sales_orders'), 's-orders'),
      ]),
    ).toEqual(refused);
    // Elsewhere, it would land beside its original as a second item.
    expect(
      planLanding(shared, [
        model('w-orders', 'models/sales_orders.yml', cube('sales_orders'), 's-orders'),
      ]),
    ).toEqual({
      ...refused,
      error: refused.error.replace('cubes/orders.yml', 'models/sales_orders.yml'),
    });
  });

  it('lands a copy that keeps its original’s name over it, its title changed', () => {
    const shared = [stored('s-orders', 'cubes/orders.yml', cube('orders'))];
    const titled = cube('orders') + '    title: Sales orders\n';
    const plan = planLanding(shared, [model('w-orders', 'cubes/orders.yml', titled, 's-orders')]);
    expect(plan).toEqual({
      kind: 'planned',
      writes: [
        {
          fileId: 'w-orders',
          folderId: 'sales',
          path: 'cubes/orders.yml',
          content: titled,
          over: shared[0],
        },
      ],
      resent: new Map([['sales', ['orders']]]),
    });
  });

  it('refuses a rename onto a name another file of its folder declares', () => {
    const shared = [
      stored('s-orders', 'cubes/orders.yml', cube('orders')),
      stored('s-sales', 'cubes/sales_orders.yml', cube('sales_orders')),
    ];
    expect(
      planLanding(shared, [
        model('w-orders', 'cubes/orders.yml', cube('sales_orders'), 's-orders'),
      ]),
    ).toEqual({
      kind: 'refused',
      error:
        '“cubes/orders.yml” can’t land: “orders” has landed, so its name is fixed: a copy of it keeps that name.',
    });
  });

  it('refuses two models that would land at one path, or as one name, in a folder', () => {
    expect(
      planLanding(
        [],
        [
          model('w-a', 'cubes/orders.yml', cube('orders')),
          model('w-b', 'cubes/orders.yml', cube('customers')),
        ],
      ),
    ).toEqual({
      kind: 'refused',
      error: 'Two of its models would land as “cubes/orders.yml” in one folder.',
    });
    expect(
      planLanding(
        [],
        [
          model('w-a', 'cubes/orders.yml', cube('orders')),
          model('w-b', 'models/orders.yml', cube('orders')),
        ],
      ),
    ).toEqual({
      kind: 'refused',
      error: 'Two of its models would land declaring “orders” in one folder.',
    });
  });

  it('refuses two models that would land over one file of their folder (T451’s review)', () => {
    // A renames its origin away from "orders"; B, new elsewhere, declares it.
    // A's rename is refused first now: a landed name is fixed (T706).
    const shared = [stored('s-orders', 'cubes/orders.yml', cube('orders'))];
    expect(
      planLanding(shared, [
        model('w-a', 'cubes/orders.yml', cube('orders_legacy'), 's-orders'),
        model('w-b', 'models/orders.yml', cube('orders')),
      ]),
    ).toEqual({
      kind: 'refused',
      error:
        '“cubes/orders.yml” can’t land: “orders” has landed, so its name is fixed: a copy of it keeps that name.',
    });
  });

  it('reads each folder’s files apart: the same path and name in another folder is no clash', () => {
    const shared = [stored('m-orders', 'cubes/orders.yml', cube('other'), 'marketing')];
    const plan = planLanding(shared, [model('w-orders', 'cubes/orders.yml', cube('orders'))]);
    expect(plan.kind).toBe('planned');
    expect(plan.kind === 'planned' ? plan.writes[0]?.over : undefined).toBeNull();
  });
});
