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
    expect(next).toContain('# what is counted');
    expect(modelOf(next).model?.cubes?.[0]).toEqual(rest);
  });
});

describe('the file, read for the form', () => {
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
