import { describe, expect, it } from 'vitest';

import type { HeldItem } from './client';
import type { PublishedFolders } from './folders';
import { cubesUsing, extendsIn } from './used-by';

/**
 * T459 (AC-157): the cubes bound to each data source, from xcube's items
 * (research xcube-e53cf2a8b8.md, "Mapping `dataSource` to wechart's data
 * sources"). A cube's `dataSource` is the connection it was bound to at
 * publish, never rebound; a cube that `extends` another takes its parent's,
 * found through wechart's own YAML and the child's bindings.
 */
const published: PublishedFolders = {
  ids: new Map([
    ['root', 'froot'],
    ['a', 'fa'],
    ['b', 'fb'],
  ]),
  parents: new Map([
    ['root', null],
    ['a', 'root'],
    ['b', 'a'],
  ]),
};
/**
 * T701 (AC-421): from xcube `256d632371` a data source's name is one per
 * model and its connection is that name; every item is named bare (research
 * `xcube-256d632371.md`, 1.1).
 */
const sources = [
  { id: 'ds-root-default', folderId: 'root', name: 'default' },
  { id: 'ds-a-warehouse', folderId: 'a', name: 'warehouse' },
  { id: 'ds-b-lake', folderId: 'b', name: 'lake' },
  { id: 'ds-unpublished', folderId: 'elsewhere', name: 'stray' },
];
const cube = (
  folderId: string,
  name: string,
  dataSource: string | null | undefined,
  bindings: Record<string, string> = {},
): HeldItem => ({
  folderId,
  name,
  kind: 'cube',
  fullName: name,
  bindings,
  ...(dataSource === undefined ? {} : { dataSource }),
});

describe('the cubes bound to each data source (T459, AC-157)', () => {
  it('matches each cube’s bound connection to its data source, by its name', () => {
    const using = cubesUsing({
      held: [
        cube('fb', 'sales', 'warehouse'),
        cube('fb', 'returns', 'lake'),
        cube('froot', 'orders', 'default'),
        cube('fb', 'strays', 'stray'),
        { folderId: 'fb', name: 'summary', kind: 'view', fullName: 'summary', bindings: {} },
      ],
      published,
      sources,
      extendsOf: () => undefined,
    });

    expect(using.get('ds-a-warehouse')).toEqual([{ name: 'sales', folderId: 'b' }]);
    expect(using.get('ds-b-lake')).toEqual([{ name: 'returns', folderId: 'b' }]);
    expect(using.get('ds-root-default')).toEqual([{ name: 'orders', folderId: 'root' }]);
    expect(using.has('ds-unpublished')).toBe(false);
  });

  it('gives a cube that extends another its parent’s, through its own YAML and bindings', () => {
    const using = cubesUsing({
      held: [
        cube('fa', 'base', 'warehouse'),
        cube('fb', 'child', null, { base: 'base', customers: 'customers' }),
        cube('fb', 'grandchild', null, { child: 'child' }),
        // Its parent isn't there: it's said to use none rather than a guess.
        cube('fb', 'orphan', null, { gone: 'gone' }),
      ],
      published,
      sources,
      extendsOf: (folderId, name) =>
        new Map([
          ['fb/child', 'base'],
          ['fb/grandchild', 'child'],
          ['fb/orphan', 'gone'],
        ]).get(`${folderId}/${name}`),
    });

    expect(using.get('ds-a-warehouse')).toEqual([
      { name: 'base', folderId: 'a' },
      { name: 'child', folderId: 'b' },
      { name: 'grandchild', folderId: 'b' },
    ]);
    // The orphan is beside none, the root's `default` included.
    expect([...using.values()].flat()).toHaveLength(3);
  });

  it('never loops on cubes that extend each other', () => {
    const using = cubesUsing({
      held: [cube('fb', 'x', null, { y: 'y' }), cube('fb', 'y', null, { x: 'x' })],
      published,
      sources,
      extendsOf: (_folderId, name) => (name === 'x' ? 'y' : 'x'),
    });

    expect([...using.values()].flat()).toEqual([]);
  });

  it('reads what a file’s cube extends, as written, and nothing from a view or broken YAML', () => {
    expect(extendsIn('cubes:\n  - name: child\n    extends: base\n    sql_table: t\n')).toEqual({
      name: 'child',
      extends: 'base',
    });
    expect(extendsIn('cubes:\n  - name: plain\n    sql_table: t\n')).toBeUndefined();
    expect(extendsIn('views:\n  - name: v\n    extends: base\n')).toBeUndefined();
    expect(extendsIn('cubes: [\n')).toBeUndefined();
  });

  it('names each cube’s model file, where wechart holds it (T499; design 03, state F)', () => {
    const using = cubesUsing({
      held: [cube('fb', 'sales', 'lake'), cube('fb', 'returns', 'lake')],
      published,
      sources,
      extendsOf: () => undefined,
      fileOf: (folderId, name) =>
        folderId === 'fb' && name === 'sales' ? 'cubes/sales.yml' : undefined,
    });

    expect(using.get('ds-b-lake')).toEqual([
      { name: 'sales', folderId: 'b', file: 'cubes/sales.yml' },
      // One whose file isn't known is listed without one, never a guess.
      { name: 'returns', folderId: 'b' },
    ]);
  });

  // T701's review: a name two of wechart's data sources hold, which nothing
  // landed can be under R71, is said of neither rather than of either.
  it('says the cubes on a name two data sources hold of neither', () => {
    const using = cubesUsing({
      held: [cube('fb', 'sales', 'warehouse')],
      published,
      sources: [...sources, { id: 'ds-b-warehouse', folderId: 'b', name: 'warehouse' }],
      extendsOf: () => undefined,
    });

    expect([...using.values()].flat()).toEqual([]);
  });

  it('counts none from an older image, which says no cube’s data source', () => {
    const using = cubesUsing({
      held: [cube('fb', 'sales', undefined)],
      published,
      sources,
      extendsOf: () => undefined,
    });

    expect([...using.values()].flat()).toEqual([]);
  });
});
