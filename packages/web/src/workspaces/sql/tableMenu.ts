import type { DriverType } from '@wechart/core';

/**
 * A table's ⋯ in the schema browser (T807, AC-449; design 17 pin 6, C1, C2):
 * Insert SELECT writes `SELECT <its columns> FROM <schema>.<table>` limited
 * to 100 rows in the driver's own syntax (research sql-row-limits.md), at
 * the cursor, and runs nothing. Preview 100 rows runs the same statement in
 * a new tab, as an ordinary run.
 *
 * Names go in as the catalog lists them, unquoted, as the tree's names do
 * (T539's call): one its dialect must quote is quoted by hand.
 */
export const PREVIEW_ROWS = 100;

export function selectOf(
  driver: DriverType,
  table: { readonly schema: string; readonly name: string },
  columns: readonly string[],
): string {
  const list = columns.length === 0 ? '*' : columns.join(', ');
  const from = `FROM ${table.schema}.${table.name}`;
  switch (driver) {
    case 'mssql':
      // TOP, with the parentheses Microsoft recommends (research [T1]).
      return `SELECT TOP (${String(PREVIEW_ROWS)}) ${list}\n${from}`;
    case 'oracle':
      // 12c and later (research [O2]); an older server says so in its own error.
      return `SELECT ${list}\n${from}\nFETCH FIRST ${String(PREVIEW_ROWS)} ROWS ONLY`;
    default:
      // PostgreSQL, Redshift, MySQL, Snowflake, BigQuery and Dremio.
      return `SELECT ${list}\n${from}\nLIMIT ${String(PREVIEW_ROWS)}`;
  }
}
