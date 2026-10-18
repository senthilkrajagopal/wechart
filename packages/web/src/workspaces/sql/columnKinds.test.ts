import { describe, expect, it } from 'vitest';

import { columnKinds, cubeTypeOf, memberNameOf } from './columnKinds';

/**
 * AC-462: a numeric column other than the primary key SHALL start as a
 * Measure of type `sum`; every other column SHALL start as a Dimension typed
 * string, number, time or boolean from its database type. Types are the
 * database's own names (research `xcube-sql-runner.md`, "Column types":
 * `int4`, `VAR_STRING`, `NUMBER`, `nvarchar`; `null` on Cube Store).
 * Fails when: a numeric column other than the key doesn't start as a `sum`
 * measure, or another column doesn't start as a dimension of the type its
 * database type gives.
 */
describe('cubeTypeOf (T820, AC-462)', () => {
  it('reads PostgreSQL’s numbers, as its driver names them, and the SQL names', () => {
    for (const type of [
      'int2',
      'int4',
      'int8',
      'integer',
      'bigint',
      'smallint',
      'numeric',
      'decimal',
      'float4',
      'float8',
      'double precision',
      'real',
      'money',
    ])
      expect(cubeTypeOf(type), type).toBe('number');
  });

  it('reads SQL Server’s, MySQL’s, Oracle’s, Snowflake’s and BigQuery’s numbers', () => {
    for (const type of [
      'int',
      'tinyint',
      'decimal(10,2)',
      'smallmoney',
      'float',
      'LONGLONG',
      'LONG',
      'SHORT',
      'TINY',
      'INT24',
      'NEWDECIMAL',
      'DOUBLE',
      'NUMBER',
      'FIXED',
      'INT64',
      'FLOAT64',
      'BIGNUMERIC',
    ])
      expect(cubeTypeOf(type), type).toBe('number');
  });

  it('reads text as string', () => {
    for (const type of ['text', 'varchar', 'character varying', 'bpchar', 'nvarchar', 'VAR_STRING', 'VARCHAR2', 'STRING', 'uuid'])
      expect(cubeTypeOf(type), type).toBe('string');
  });

  it('reads dates and timestamps as time, and a time of day as string', () => {
    for (const type of ['date', 'timestamp', 'timestamptz', 'datetime', 'datetime2', 'datetimeoffset', 'TIMESTAMP_NTZ', 'DATETIME', 'DATE'])
      expect(cubeTypeOf(type), type).toBe('time');
    expect(cubeTypeOf('time')).toBe('string');
    expect(cubeTypeOf('timetz')).toBe('string');
  });

  it('reads booleans as boolean, SQL Server’s bit included', () => {
    for (const type of ['bool', 'boolean', 'BOOLEAN', 'BOOL', 'bit'])
      expect(cubeTypeOf(type), type).toBe('boolean');
  });

  it('reads a type it doesn’t know, or none, as string', () => {
    expect(cubeTypeOf(null)).toBe('string');
    expect(cubeTypeOf('jsonb')).toBe('string');
    expect(cubeTypeOf('interval')).toBe('string');
  });
});

describe('memberNameOf (T820, AC-462)', () => {
  it('keeps a name the grammar takes, in lower case', () => {
    expect(memberNameOf('customer_id', new Set())).toBe('customer_id');
    expect(memberNameOf('Total', new Set())).toBe('total');
  });

  it('makes one the grammar takes of any other', () => {
    expect(memberNameOf('Total Amount', new Set())).toBe('total_amount');
    expect(memberNameOf('sum(total)', new Set())).toBe('sum_total');
    expect(memberNameOf('__x__', new Set())).toBe('x');
    expect(memberNameOf('2024 sales', new Set())).toBe('c_2024_sales');
    expect(memberNameOf('???', new Set())).toBe('column');
    expect(memberNameOf('count', new Set())).toBe('count_column');
  });

  it('never takes a name already taken', () => {
    expect(memberNameOf('total', new Set(['total']))).toBe('total_2');
    expect(memberNameOf('total', new Set(['total', 'total_2']))).toBe('total_3');
  });
});

describe('columnKinds (T820, AC-462)', () => {
  const columns = [
    { name: 'id', type: 'int4' },
    { name: 'customer', type: 'text' },
    { name: 'total', type: 'numeric' },
    { name: 'ordered_at', type: 'timestamptz' },
    { name: 'paid', type: 'bool' },
    { name: 'items', type: 'int8' },
  ];

  it('starts a numeric column as a sum measure, and the rest as typed dimensions, the key excepted', () => {
    const rows = columnKinds(columns);
    expect(rows.map(({ column, member, kind, type, key, include }) => ({ column, member, kind, type, key, include }))).toEqual([
      { column: 'id', member: 'id', kind: 'dimension', type: 'number', key: true, include: true },
      { column: 'customer', member: 'customer', kind: 'dimension', type: 'string', key: false, include: true },
      { column: 'total', member: 'total', kind: 'measure', type: 'sum', key: false, include: true },
      { column: 'ordered_at', member: 'ordered_at', kind: 'dimension', type: 'time', key: false, include: true },
      { column: 'paid', member: 'paid', kind: 'dimension', type: 'boolean', key: false, include: true },
      { column: 'items', member: 'items', kind: 'measure', type: 'sum', key: false, include: true },
    ]);
  });

  it('chooses one key: a column named id, else one ending in _id, else the first that isn’t a number, else the first', () => {
    const key = (cols: readonly { name: string; type: string | null }[]) =>
      columnKinds(cols).find((row) => row.key)?.column;
    expect(key([{ name: 'total', type: 'numeric' }, { name: 'ID', type: 'int4' }])).toBe('ID');
    expect(key([{ name: 'total', type: 'numeric' }, { name: 'order_id', type: 'int4' }])).toBe('order_id');
    expect(key([{ name: 'total', type: 'numeric' }, { name: 'customer', type: 'text' }])).toBe('customer');
    expect(key([{ name: 'a', type: 'numeric' }, { name: 'b', type: 'numeric' }])).toBe('a');
    expect(columnKinds([]).filter((row) => row.key)).toEqual([]);
  });

  it('starts the numeric key as a number dimension, never a measure', () => {
    const rows = columnKinds([
      { name: 'order_id', type: 'int8' },
      { name: 'total', type: 'numeric' },
    ]);
    expect(rows[0]).toMatchObject({ kind: 'dimension', type: 'number', key: true });
    expect(rows[1]).toMatchObject({ kind: 'measure', type: 'sum', key: false });
  });

  it('names each member once, leaving count to the cube’s own measure', () => {
    const rows = columnKinds([
      { name: 'Total', type: 'text' },
      { name: 'total', type: 'numeric' },
      { name: 'count', type: 'int8' },
    ]);
    expect(rows.map((row) => row.member)).toEqual(['total', 'total_2', 'count_column']);
  });
});
