import { parse } from 'yaml';

/**
 * What a cube Cube scaffolded lost without saying so (T145, AC-139).
 *
 * Cube's renderer keeps one member per generated name, so of two columns whose
 * names become the same member (`Amount`, `amount`) only the last is in the
 * file; a column whose sum is named `count` replaces the count measure; and a
 * time-typed primary key, written as a key and again as a time, is kept as
 * the time alone. `unmappedColumns` lists none of these, since it compares
 * column names (research/cube/introspection-api.md, "Silent losses"). Read
 * against the table's columns, the file says which:
 *
 * - a column no member's `sql` reads and Cube did not list is added as
 *   `member_name_taken`;
 * - `countMeasure` says whether a `type: count` measure is left;
 * - `unmarkedKeys` names the table's key columns no dimension marks
 *   `primary_key` (T145's review).
 *
 * A file it can't read as one cube is `unchecked`, with Cube's list as it was.
 */

export interface UnmappedColumn {
  readonly name: string;
  readonly rawType: string;
  readonly reason: string;
}

export type Checked =
  | {
      readonly unmappedColumns: UnmappedColumn[];
      readonly countMeasure: boolean;
      readonly unmarkedKeys: string[];
    }
  | { readonly unmappedColumns: UnmappedColumn[]; readonly unchecked: true };

interface Member {
  readonly sql?: unknown;
  readonly type?: unknown;
  readonly primary_key?: unknown;
  readonly primaryKey?: unknown;
}

/**
 * A member's column, as the formatter writes it: bare, or `{CUBE}.` and the
 * driver's quoteIdentifier — "x" (Postgres), `x` (MySQL), [x] (MSSQL). The
 * base driver's doesn't double a mark inside a name (T145's review), so the
 * outer marks alone are taken off.
 */
function columnOf(sql: unknown): string | undefined {
  if (typeof sql !== 'string') return undefined;
  const bare = sql.startsWith('{CUBE}.') ? sql.slice('{CUBE}.'.length) : sql;
  for (const [open, close] of [
    ['"', '"'],
    ['`', '`'],
    ['[', ']'],
  ] as const)
    if (bare.length >= 2 && bare.startsWith(open) && bare.endsWith(close)) return bare.slice(1, -1);
  return bare;
}

function membersOf(content: string): { dimensions: Member[]; measures: Member[] } | undefined {
  let file: unknown;
  try {
    file = parse(content);
  } catch {
    return undefined;
  }
  const cubes = (file as { cubes?: unknown } | null)?.cubes;
  if (!Array.isArray(cubes) || cubes.length !== 1) return undefined;
  const { dimensions, measures } = (cubes[0] ?? {}) as { dimensions?: unknown; measures?: unknown };
  const list = (value: unknown): Member[] =>
    Array.isArray(value)
      ? value.filter((each): each is Member => typeof each === 'object' && each !== null)
      : [];
  return { dimensions: list(dimensions), measures: list(measures) };
}

export function checkScaffold(
  columns: readonly {
    readonly name: string;
    readonly rawType: string;
    readonly primaryKey?: boolean;
  }[],
  cube: { readonly content: string; readonly unmappedColumns: readonly UnmappedColumn[] },
): Checked {
  const read = membersOf(cube.content);
  if (read === undefined) return { unmappedColumns: [...cube.unmappedColumns], unchecked: true };
  const said = new Set(cube.unmappedColumns.map((column) => column.name));
  const inCube = new Set(
    [...read.dimensions, ...read.measures].map((member) => columnOf(member.sql)),
  );
  const lost = columns
    .filter((column) => !said.has(column.name) && !inCube.has(column.name))
    .map(({ name, rawType }) => ({ name, rawType, reason: 'member_name_taken' }));
  const keys = new Set(
    read.dimensions
      .filter((dimension) => dimension.primary_key === true || dimension.primaryKey === true)
      .map((dimension) => columnOf(dimension.sql)),
  );
  return {
    unmappedColumns: [...cube.unmappedColumns, ...lost],
    countMeasure: read.measures.some((measure) => measure.type === 'count'),
    unmarkedKeys: columns
      .filter((column) => column.primaryKey === true && !keys.has(column.name))
      .map((column) => column.name),
  };
}
