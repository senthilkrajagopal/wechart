import { parse } from 'yaml';

/**
 * What a cube Cube scaffolded lost without saying so (T145, AC-139).
 *
 * Cube's renderer keeps one member per generated name, so of two columns whose
 * names become the same member (`Amount`, `amount`) only the last is in the
 * file, and a column whose sum is named `count` replaces the count measure;
 * yet `unmappedColumns` lists neither, since it compares column names
 * (research/cube/introspection-api.md, "Silent losses"). Read against the
 * table's columns, the file says which: a column no member's `sql` reads and
 * Cube did not list is added as `member_name_taken`, and `countMeasure` says
 * whether a `type: count` measure is left. A file that doesn't parse is
 * returned as Cube said it; publishing it would fail on Cube's own compile.
 */

export interface UnmappedColumn {
  readonly name: string;
  readonly rawType: string;
  readonly reason: string;
}

interface Member {
  readonly sql?: unknown;
  readonly type?: unknown;
}

/** A member's column, as the formatter writes it: bare, or `{CUBE}.` and quoted. */
function columnOf(sql: unknown): string | undefined {
  if (typeof sql !== 'string') return undefined;
  const bare = sql.startsWith('{CUBE}.') ? sql.slice('{CUBE}.'.length) : sql;
  // A driver's quoteIdentifier: "x" (Postgres), `x` (MySQL) or [x] (MSSQL),
  // each doubling its closing mark inside.
  for (const [open, close] of [
    ['"', '"'],
    ['`', '`'],
    ['[', ']'],
  ] as const)
    if (bare.length >= 2 && bare.startsWith(open) && bare.endsWith(close))
      return bare
        .slice(1, -1)
        .split(close + close)
        .join(close);
  return bare;
}

function membersOf(content: string): { members: Member[]; measures: Member[] } | undefined {
  let file: unknown;
  try {
    file = parse(content);
  } catch {
    return undefined;
  }
  const cube = (file as { cubes?: unknown } | null)?.cubes;
  if (!Array.isArray(cube) || cube.length !== 1) return undefined;
  const { dimensions, measures } = (cube[0] ?? {}) as { dimensions?: unknown; measures?: unknown };
  const list = (value: unknown): Member[] =>
    Array.isArray(value) ? value.filter((each): each is Member => typeof each === 'object') : [];
  return { members: [...list(dimensions), ...list(measures)], measures: list(measures) };
}

export function checkScaffold(
  columns: readonly { readonly name: string; readonly rawType: string }[],
  cube: { readonly content: string; readonly unmappedColumns: readonly UnmappedColumn[] },
): { unmappedColumns: UnmappedColumn[]; countMeasure: boolean } {
  const read = membersOf(cube.content);
  if (read === undefined) return { unmappedColumns: [...cube.unmappedColumns], countMeasure: true };
  const said = new Set(cube.unmappedColumns.map((column) => column.name));
  const inCube = new Set(read.members.map((member) => columnOf(member.sql)));
  const lost = columns
    .filter((column) => !said.has(column.name) && !inCube.has(column.name))
    .map(({ name, rawType }) => ({ name, rawType, reason: 'member_name_taken' }));
  return {
    unmappedColumns: [...cube.unmappedColumns, ...lost],
    countMeasure: read.measures.some((measure) => measure.type === 'count'),
  };
}
