import { describe, expect, it } from 'vitest';

import { draftJoinsOf } from './draftJoins';

/**
 * T488 / AC-346: WHEN the user saves an unpublished file whose cubes join a
 * cube that only another unpublished file defines, THE SYSTEM SHALL publish
 * those files with it in one publish — Cube refuses a join to a cube it
 * doesn't have (R36; research/cube/rollup-join-paths.md, "Cube <B> doesn't
 * exist"). Which drafts go with a file: followed through their own joins.
 */
const cube = (name: string, joins: readonly string[] = []) =>
  `cubes:\n  - name: ${name}\n    sql_table: public.${name}\n${
    joins.length === 0
      ? ''
      : `    joins:\n${joins
          .map(
            (join) =>
              `      - name: ${join}\n        sql: "{CUBE}.${join}_id = {${join}}.id"\n        relationship: many_to_one\n`,
          )
          .join('')}`
  }`;

const STORED = [{ path: 'cubes/orders.yml', content: cube('orders') }];

describe('the drafts a file’s cubes join (AC-346)', () => {
  it('names the draft that alone defines a joined cube, and the drafts that one joins', () => {
    const drafts = [
      { path: 'cubes/stores.yml', content: cube('stores', ['regions']) },
      { path: 'cubes/regions.yml', content: cube('regions') },
      { path: 'cubes/unrelated.yml', content: cube('unrelated') },
    ];
    expect(
      draftJoinsOf(
        { path: 'cubes/visits.yml', content: cube('visits', ['stores']) },
        STORED,
        drafts,
      ),
    ).toEqual(['cubes/stores.yml', 'cubes/regions.yml']);
  });

  it('names none for a join to a published cube, to a cube the model lacks, or to its own file’s', () => {
    // A draft defining the file's own cube too is not the one it joins (T488's review).
    const drafts = [
      { path: 'cubes/other_orders.yml', content: cube('orders') },
      { path: 'cubes/other_lines.yml', content: cube('line_items') },
    ];
    const file = {
      path: 'cubes/lines.yml',
      content: `${cube('lines', ['orders', 'missing', 'line_items'])}  - name: line_items\n    sql_table: public.line_items\n`,
    };
    expect(draftJoinsOf(file, STORED, drafts)).toEqual([]);
  });

  it('follows joins round a cycle once, and never names the file itself', () => {
    const drafts = [
      { path: 'cubes/a.yml', content: cube('a', ['b']) },
      { path: 'cubes/b.yml', content: cube('b', ['a', 'c']) },
      { path: 'cubes/c.yml', content: cube('c', ['a']) },
    ];
    expect(
      draftJoinsOf({ path: 'cubes/a.yml', content: cube('a', ['b']) }, STORED, drafts),
    ).toEqual(['cubes/b.yml', 'cubes/c.yml']);
  });

  it('reads the file as it is now, and names nothing while it does not parse', () => {
    const drafts = [{ path: 'cubes/stores.yml', content: cube('stores') }];
    expect(draftJoinsOf({ path: 'cubes/v.yml', content: 'cubes: [' }, STORED, drafts)).toEqual([]);
  });
});
