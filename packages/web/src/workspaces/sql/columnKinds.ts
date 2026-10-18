import { MAX_NAME, nameProblem } from '@wechart/core';

import type { SqlColumn } from '../data-sources/SqlResult';

/**
 * Make a cube's columns (T820, AC-462; design 17 §6, "Numbers as sum
 * measures (Recommended)"): each result column as a member, kind and Cube
 * type proposed from the database's own type name (research
 * `xcube-sql-runner.md`, "Column types": `int4`, `VAR_STRING`, `NUMBER`,
 * `nvarchar`, and `null` on Cube Store), and one primary key.
 */

/** A dimension's Cube type (research `cube/data-modeling.md` §4). */
export type DimensionType = 'string' | 'number' | 'time' | 'boolean';
/**
 * A measure's Cube type over one column (research `cube/data-modeling.md`
 * §5): those taking a non-aggregated expression. `count` is the cube's own
 * measure; `number`, `string`, `time` and `boolean` take an aggregate.
 */
export const MEASURE_TYPES = [
  'sum',
  'avg',
  'min',
  'max',
  'count_distinct',
  'count_distinct_approx',
] as const;
export type MeasureType = (typeof MEASURE_TYPES)[number];
export const DIMENSION_TYPES: readonly DimensionType[] = ['string', 'number', 'time', 'boolean'];

export type ColumnRow = {
  /** The column as the result names it. */
  readonly column: string;
  readonly include: boolean;
  readonly member: string;
  readonly key: boolean;
} & (
  | { readonly kind: 'dimension'; readonly type: DimensionType }
  | { readonly kind: 'measure'; readonly type: MeasureType }
);

/**
 * The database's numbers, by the names their drivers give them: the SQL
 * names and PostgreSQL's (`int4`, `float8`, `numeric`, `money`), SQL
 * Server's (`smallmoney`), MySQL's protocol names (`LONGLONG`, `NEWDECIMAL`,
 * `INT24`, `TINY`), Oracle's and Snowflake's (`NUMBER`, `FIXED`) and
 * BigQuery's (`INT64`, `FLOAT64`, `BIGNUMERIC`).
 */
const NUMBER =
  /^(int\d*|integer|bigint|smallint|tinyint|mediumint|serial\d*|bigserial|numeric|bignumeric|decimal|newdecimal|dec|number|fixed|float\d*|double|double precision|real|money|smallmoney|long|longlong|short|tiny|int24)\b/i;
/** A date, or a date and time: Cube's time; a time of day alone isn't one. */
const TIME = /^(date|datetime\d*|datetimeoffset|smalldatetime|timestamp\w*)\b/i;
const BOOLEAN = /^(bool|boolean|bit)$/i;

/** A column's Cube type, from its database type; string where it isn't known. */
export function cubeTypeOf(type: string | null): DimensionType {
  if (type === null) return 'string';
  const named = type.trim();
  if (BOOLEAN.test(named)) return 'boolean';
  if (TIME.test(named)) return 'time';
  if (NUMBER.test(named)) return 'number';
  return 'string';
}

/**
 * A member name the grammar takes (R73, AC-426), made of a column's: lower
 * case, its other characters as single underscores, a leading digit given a
 * `c_`, and a reserved word or `count` (the cube's own measure) given
 * `_column`; then the first not yet taken.
 */
export function memberNameOf(column: string, taken: ReadonlySet<string>): string {
  let name = column
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (name === '') name = 'column';
  if (/^[0-9]/.test(name)) name = `c_${name}`;
  if (name === 'count' || nameProblem(name, 'cube') !== undefined) name = `${name}_column`;
  name = name.slice(0, MAX_NAME).replace(/_+$/, '');
  if (!taken.has(name)) return name;
  for (let n = 2; ; n += 1) {
    const suffix = `_${String(n)}`;
    const next = `${name.slice(0, MAX_NAME - suffix.length).replace(/_+$/, '')}${suffix}`;
    if (!taken.has(next)) return next;
  }
}

/**
 * The key: a column named `id`, in any case; else the first ending in
 * `_id`; else the first that isn't a number; else the first.
 */
function keyOf(columns: readonly SqlColumn[]): number {
  const named = columns.findIndex((column) => column.name.toLowerCase() === 'id');
  if (named >= 0) return named;
  const ending = columns.findIndex((column) => /_id$/i.test(column.name));
  if (ending >= 0) return ending;
  const other = columns.findIndex((column) => cubeTypeOf(column.type) !== 'number');
  return other >= 0 ? other : 0;
}

/** Each column as Make a cube starts it: a number a `sum` measure, the key and the rest dimensions. */
export function columnKinds(columns: readonly SqlColumn[]): ColumnRow[] {
  const key = keyOf(columns);
  const taken = new Set<string>(['count']);
  return columns.map((column, at) => {
    const member = memberNameOf(column.name, taken);
    taken.add(member);
    const type = cubeTypeOf(column.type);
    const base = { column: column.name, include: true, member, key: at === key };
    return type === 'number' && at !== key
      ? { ...base, kind: 'measure', type: 'sum' }
      : { ...base, kind: 'dimension', type };
  });
}
