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
const sources = [
  { id: 'ds-root-default', folderId: 'root', name: 'default' },
  { id: 'ds-a-warehouse', folderId: 'a', name: 'warehouse' },
  { id: 'ds-b-warehouse', folderId: 'b', name: 'warehouse' },
  { id: 'ds-unpublished', folderId: 'elsewhere', name: 'warehouse' },
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
  fullName: folderId === 'froot' ? name : `${folderId}__${name}`,
  bindings,
  ...(dataSource === undefined ? {} : { dataSource }),
});

describe('the cubes bound to each data source (T459, AC-157)', () => {
  it('matches each cube’s bound connection to its data source, by folder and name', () => {
    const using = cubesUsing({
      held: [
        cube('fb', 'sales', 'fa__warehouse'),
        cube('fb', 'returns', 'fb__warehouse'),
        cube('froot', 'orders', 'default'),
        { folderId: 'fb', name: 'summary', kind: 'view', fullName: 'fb__summary', bindings: {} },
      ],
      published,
      sources,
      extendsOf: () => undefined,
    });

    expect(using.get('ds-a-warehouse')).toEqual([{ name: 'sales', folderId: 'b' }]);
    expect(using.get('ds-b-warehouse')).toEqual([{ name: 'returns', folderId: 'b' }]);
    expect(using.get('ds-root-default')).toEqual([{ name: 'orders', folderId: 'root' }]);
    expect(using.has('ds-unpublished')).toBe(false);
  });

  it('gives a cube that extends another its parent’s, through its own YAML and bindings', () => {
    const using = cubesUsing({
      held: [
        cube('fa', 'base', 'fa__warehouse'),
        cube('fb', 'child', null, { base: 'fa__base', customers: 'fb__customers' }),
        cube('fb', 'grandchild', null, { child: 'fb__child' }),
        // Its parent isn't there: it's said to use none rather than a guess.
        cube('fb', 'orphan', null, { gone: 'fa__gone' }),
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
      held: [cube('fb', 'x', null, { y: 'fb__y' }), cube('fb', 'y', null, { x: 'fb__x' })],
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
      held: [cube('fb', 'sales', 'fb__warehouse'), cube('fb', 'returns', 'fb__warehouse')],
      published,
      sources,
      extendsOf: () => undefined,
      fileOf: (folderId, name) =>
        folderId === 'fb' && name === 'sales' ? 'cubes/sales.yml' : undefined,
    });

    expect(using.get('ds-b-warehouse')).toEqual([
      { name: 'sales', folderId: 'b', file: 'cubes/sales.yml' },
      // One whose file isn't known is listed without one, never a guess.
      { name: 'returns', folderId: 'b' },
    ]);
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
