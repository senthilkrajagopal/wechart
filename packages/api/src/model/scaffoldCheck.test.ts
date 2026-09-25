import { describe, expect, it } from 'vitest';

import { checkScaffold } from './scaffoldCheck';

/**
 * T145 / AC-139 `Fails when: … a column is dropped without saying so.` Cube's
 * scaffold merges members by their generated name, while its
 * `unmappedColumns` compares column names, so some columns vanish from a cube
 * unreported (research/cube/introspection-api.md, "Silent losses"). What Cube
 * does not say, wechart finds by reading the file against the table.
 */
const column = (name: string, rawType = 'integer') => ({ name, rawType });

describe('what a generated cube lost without saying so', () => {
  it('names a column whose member another column’s took, as Cube leaves it unsaid', () => {
    const checked = checkScaffold(
      [column('id'), column('Amount', 'numeric'), column('amount', 'numeric')],
      {
        content: [
          'cubes:',
          '  - name: sales',
          '    sql_table: public.sales',
          '    dimensions:',
          '      - name: id',
          '        sql: id',
          '        type: number',
          '        primary_key: true',
          '    measures:',
          '      - name: count',
          '        type: count',
          '      - name: amount',
          '        sql: amount',
          '        type: sum',
        ].join('\n'),
        unmappedColumns: [],
      },
    );
    expect(checked).toEqual({
      unmappedColumns: [{ name: 'Amount', rawType: 'numeric', reason: 'member_name_taken' }],
      countMeasure: true,
    });
  });

  it('reads a member’s column when Cube quotes it, as it does any name not in lower case', () => {
    const checked = checkScaffold([column('id'), column('Visit Count')], {
      content: [
        'cubes:',
        '  - name: visits',
        '    dimensions:',
        '      - name: id',
        '        sql: id',
        '        type: number',
        '        primary_key: true',
        '    measures:',
        '      - name: count',
        '        type: count',
        '      - name: visit_count',
        '        sql: "{CUBE}.\\"Visit Count\\""',
        '        type: sum',
      ].join('\n'),
      unmappedColumns: [],
    });
    expect(checked).toEqual({ unmappedColumns: [], countMeasure: true });
  });

  it('keeps Cube’s own reasons, and says when a column’s sum took the count’s name', () => {
    const checked = checkScaffold([column('id'), column('count'), column('_loaded_at', 'date')], {
      content: [
        'cubes:',
        '  - name: tallies',
        '    dimensions:',
        '      - name: id',
        '        sql: id',
        '        type: number',
        '        primary_key: true',
        '    measures:',
        '      - name: count',
        '        sql: count',
        '        type: sum',
      ].join('\n'),
      unmappedColumns: [{ name: '_loaded_at', rawType: 'date', reason: 'underscore_prefix' }],
    });
    expect(checked).toEqual({
      unmappedColumns: [{ name: '_loaded_at', rawType: 'date', reason: 'underscore_prefix' }],
      countMeasure: false,
    });
  });

  it('leaves a file it cannot read as Cube said it', () => {
    const unmappedColumns = [
      { name: 'store_id', rawType: 'integer', reason: 'numeric_not_measure' },
    ];
    expect(checkScaffold([column('store_id')], { content: ': : :', unmappedColumns })).toEqual({
      unmappedColumns,
      countMeasure: true,
    });
  });
});
