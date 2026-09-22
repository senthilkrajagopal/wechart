import { describe, expect, it } from 'vitest';

import { modelOf, withObject } from './sync';

/**
 * T139 / AC-133: WHEN the user edits a field in the form, THE SYSTEM SHALL
 * update the YAML view within one render, and WHEN the user edits valid YAML,
 * THE SYSTEM SHALL update the form within 500 milliseconds.
 *
 * The file's text is the one truth: a form edit is written into it, and the
 * form reads back from it. Written into it in place — the file's comments and
 * the keys the edit did not touch stay exactly as they were.
 */
const FILE = `cubes:
  - name: orders
    # the warehouse table
    sql_table: public.orders

    # what is counted
    measures:
      - name: count
        type: count
      - name: total_amount
        sql: amount
        type: sum
`;

const orders = () => modelOf(FILE).model?.cubes?.[0] as Record<string, unknown>;

describe('a form edit, written into the file', () => {
  it('adds a key, keeping the comments and everything else as written', () => {
    const next = withObject(FILE, 'cubes', 0, { ...orders(), title: 'Orders' });

    expect(next).toContain('# the warehouse table');
    expect(next).toContain('    sql_table: public.orders\n');
    expect(modelOf(next).model?.cubes?.[0]).toEqual({ ...orders(), title: 'Orders' });
  });

  it('changes one member’s key and nothing around it', () => {
    const measures = orders()['measures'] as Record<string, unknown>[];
    const next = withObject(FILE, 'cubes', 0, {
      ...orders(),
      measures: [measures[0], { ...measures[1], type: 'avg' }],
    });

    expect(next).toBe(FILE.replace('type: sum', 'type: avg'));
  });

  it('removes a key the form cleared, and the comment on it, but no other', () => {
    const rest = { ...orders() };
    delete rest['sql_table'];
    const next = withObject(FILE, 'cubes', 0, rest);

    expect(next).not.toContain('sql_table');
    // A comment written on the key goes with it; one elsewhere stays.
    expect(next).not.toContain('# the warehouse table');
    expect(next).toContain('# what is counted');
    expect(modelOf(next).model?.cubes?.[0]).toEqual(rest);
  });

  it('writes a file in its own style: its indent, its lists, its long lines, as they were', () => {
    const long =
      'One row per order line in the sample warehouse, as the finance team reads it every week.';
    // Four spaces, with a line past 80 columns; and two, with lists level with their key.
    const four = `cubes:\n    - name: orders\n      description: ${long}\n      measures:\n          - name: count\n            type: count\n`;
    const flat = `cubes:\n- name: orders\n  description: ${long}\n  measures:\n  - name: count\n    type: count\n`;

    for (const [styled, added] of [
      [four, '      title: Orders\n'],
      [flat, '  title: Orders\n'],
    ] as const) {
      const cube = modelOf(styled).model?.cubes?.[0] as Record<string, unknown>;
      expect(withObject(styled, 'cubes', 0, { ...cube, title: 'Orders' })).toBe(
        `${styled}${added}`,
      );
    }
  });

  it('adds a member at the end of its list, keeping the comments in the list as written', () => {
    // A comment inside the list, which writing the list anew would drop.
    const commented = FILE.replace(
      '      - name: total_amount',
      '      # the money\n      - name: total_amount',
    );
    const cube = modelOf(commented).model?.cubes?.[0] as Record<string, unknown>;
    const measures = cube['measures'] as Record<string, unknown>[];

    const next = withObject(commented, 'cubes', 0, {
      ...cube,
      measures: [...measures, { name: 'measure_3' }],
    });

    expect(next).toBe(`${commented}      - name: measure_3\n`);
  });

  it('removes one member, keeping the others and the comments around them as written', () => {
    const commented = FILE.replace(
      '      - name: total_amount',
      '      # the money\n      - name: total_amount',
    );
    const cube = modelOf(commented).model?.cubes?.[0] as Record<string, unknown>;
    const [, amount] = cube['measures'] as Record<string, unknown>[];

    const next = withObject(commented, 'cubes', 0, { ...cube, measures: [amount] });

    expect(next).toBe(commented.replace('      - name: count\n        type: count\n', ''));
  });
});

describe('the file, read for the form', () => {
  it('replaces a list keeping its anchor and its own comment, so what refers to it still does', () => {
    // T140: a list that changes length is written anew; its anchor must go
    // with it, or the alias to it resolves to nothing and the file can't be written.
    const shared = `cubes:
  - name: orders
    dimensions: &shared # both cubes'
      - name: status
        sql: status
  - name: returns
    dimensions: *shared
`;
    const status = { name: 'status', sql: 'status' };
    const region = { name: 'region', sql: 'region' };

    const next = withObject(shared, 'cubes', 0, { name: 'orders', dimensions: [status, region] });

    // Kept, if not where they were: `yaml` writes an anchored list's trailing
    // comment and anchor on lines of their own, as it does for the file untouched.
    expect(next).toContain("# both cubes'\n");
    expect(next).toContain('&shared\n');
    expect(next).toContain('dimensions: *shared\n');
    expect(modelOf(next).model?.cubes?.[1]).toEqual({
      name: 'returns',
      dimensions: [status, region],
    });
  });

  it('gives the model when the text parses', () => {
    expect(modelOf(FILE)).toEqual({
      model: {
        cubes: [
          {
            name: 'orders',
            sql_table: 'public.orders',
            measures: [
              { name: 'count', type: 'count' },
              { name: 'total_amount', sql: 'amount', type: 'sum' },
            ],
          },
        ],
      },
    });
  });

  it('gives no model, and the problem with its line, when it does not', () => {
    const read = modelOf('cubes:\n  - name: [unclosed\n');

    expect(read.model).toBeUndefined();
    expect(read.problem).toMatch(/line \d+/);
  });

  it('gives no model, and does not throw, for an alias to no anchor (T141)', () => {
    const read = modelOf('cubes:\n  - name: a\n    sql_table: *ba\n');

    expect(read.model).toBeUndefined();
    expect(read.problem).toBe('Unresolved alias (the anchor must be set before the alias): ba');
  });
});
