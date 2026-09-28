import Papa from 'papaparse';

import { formatterFor } from '../format';
import type { RenderSpec } from '../render-spec';

/**
 * The columns a tile's table heads (AC-178, T177): every key its rows carry,
 * in the order they carry them — encoded members and the rest alike, a second
 * dimension or a time member's bucket among them — but a time member's bare
 * key where its bucket is there too (T467, UX-023). One definition for the
 * table and its CSV, so the two cannot head different columns.
 */
export function tableColumnsOf(
  rows: readonly Record<string, unknown>[],
  fields: readonly string[] = [],
): string[] {
  const all = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  /**
   * A time member asked at a grain comes back twice, as `member.month` and as
   * the bare `member`, both holding the bucket (T467, UX-023): the bucket is
   * the column, and the bare key only its repeat. A member name is
   * `cube.member`, so a key under another is its grain. Alone — ungrouped
   * rows' raw time — the bare key stays.
   */
  const keys = all.filter((key) => !all.some((other) => other.startsWith(`${key}.`)));
  /**
   * In the wells' order (T393, AC-301): each key by the field it is — a time
   * dimension's `member.granularity` by its member — and a key no field names
   * after those, each group as the rows carried it.
   */
  const rank = (key: string) => {
    const at = fields.findIndex((field) => key === field || key.startsWith(`${field}.`));
    return at === -1 ? fields.length : at;
  };
  return keys
    .map((key, at) => ({ key, at }))
    .sort((a, b) => rank(a.key) - rank(b.key) || a.at - b.at)
    .map(({ key }) => key);
}

/**
 * A column as a reader knows it (AC-220): its member's title from the model —
 * for a time column Cube names `member.granularity`, the member's title with
 * its grain — and its name only where the model gives no title. One
 * definition for the table's headers and its CSV's (AC-171).
 */
export function columnTitleOf(
  column: string,
  titles: Readonly<Record<string, string>> = {},
): string {
  const own = titles[column];
  if (own !== undefined) return own;
  const parts = column.split('.');
  if (parts.length === 3) {
    const member = titles[`${parts[0] ?? ''}.${parts[1] ?? ''}`];
    if (member !== undefined) return `${member} (${parts[2] ?? ''})`;
  }
  return column;
}

/** A plain number as Cube sends one (a JSON string, research/cube/data-apis.md), signed or not. */
const NUMBER = /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i;

/**
 * Text a spreadsheet would run as a formula — beginning `=`, `+`, `-`, `@`, a
 * tab or a carriage return — is prefixed with `'` so it is read as text, as
 * papaparse's `escapeFormulae` does (research/supporting-utilities.md §3).
 * Judged on the value Cube gave, not the text written: a number, and what the
 * formatter makes of one ("-$1,234.50"), is data, not a formula, and is left
 * as it is. So the guard is applied here, per value, rather than as
 * papaparse's one pattern over every written field.
 */
function guarded(raw: unknown, written: string): string {
  if (typeof raw === 'number' || (typeof raw === 'string' && NUMBER.test(raw))) return written;
  return /^[=+\-@\t\r]/.test(written) ? `'${written}` : written;
}

/**
 * A chart as CSV (T177, AC-171): its tile's table — every row it holds,
 * already filtered, folded to its top N and sorted by `compile`; a column for
 * every key the rows carry (`tableColumnsOf`), headed as the table heads it
 * (`columnTitleOf`); each value
 * written as the table writes it (`formatValue`'s formatter) — as RFC 4180
 * text by papaparse's `unparse` (research/supporting-utilities.md §3): CRLF
 * between records, a field quoted when it holds a comma, a quote or a line
 * break, its quotes doubled.
 */
export function csvOf(spec: RenderSpec): string {
  return rowsCsvOf(spec.rows, {
    ...(spec.fields === undefined ? {} : { fields: spec.fields }),
    ...(spec.measures === undefined ? {} : { measures: spec.measures }),
    ...(spec.formats === undefined ? {} : { formats: spec.formats }),
    ...(spec.granularities === undefined ? {} : { granularities: spec.granularities }),
    ...(spec.titles === undefined ? {} : { titles: spec.titles }),
  });
}

/**
 * Rows as CSV, written as a chart's table writes them (`csvOf`): the rows
 * behind a tile — its marked rows, or all of them, ungrouped (T120, AC-114,
 * AC-171) — as well as a chart's own.
 */
export function rowsCsvOf(
  rows: readonly Record<string, unknown>[],
  {
    fields = [],
    measures: measured = [],
    formats = {},
    granularities = {},
    titles,
  }: {
    /** The wells' order, which the columns follow (T393, AC-301). */
    fields?: readonly string[];
    measures?: readonly string[];
    formats?: RenderSpec['formats'];
    granularities?: RenderSpec['granularities'];
    titles?: RenderSpec['titles'];
  },
): string {
  const columns = tableColumnsOf(rows, fields);
  const measures = new Set(measured);
  const write = columns.map((member) => formatterFor(member, formats ?? {}, granularities ?? {}));
  // A measure's raw number beside its formatted value (T179, AC-173).
  const heads = columns.flatMap((member) => {
    const title = columnTitleOf(member, titles);
    return measures.has(member) ? [title, `${title} (raw)`] : [title];
  });
  const records = rows.map((row) =>
    columns.flatMap((member, index) => {
      const raw = row[member];
      const written = guarded(raw, write[index]?.(raw) ?? '');
      return measures.has(member) ? [written, rawNumberOf(raw)] : [written];
    }),
  );
  return Papa.unparse([heads, ...records], { newline: '\r\n', escapeFormulae: false });
}

/**
 * A measure's value as the number Cube gave (a JSON string, research/cube/
 * data-apis.md) or folding made — written as it is, for a spreadsheet to read
 * as a number; anything else, nothing, since it is not one.
 */
function rawNumberOf(raw: unknown): string {
  // A sum folding made carries binary noise (0.1 + 0.2 is 0.30000000000000004):
  // fifteen significant digits, all a double holds exactly, write it as 0.3.
  if (typeof raw === 'number')
    return Number.isFinite(raw) ? String(Number(raw.toPrecision(15))) : '';
  return typeof raw === 'string' && NUMBER.test(raw) ? raw : '';
}

const count = (rows: number) => `${rows.toLocaleString('en-US')} ${rows === 1 ? 'row' : 'rows'}`;

/**
 * What a download says of its rows (T178, AC-172): how many were written,
 * and whether they are the whole result. Cube answers at most its row limit
 * and says nothing of what it left out; asked again with `total: true` it
 * answers the full count (research/cube/data-apis.md, "Observed locally").
 * More than it returned is truncated.
 *
 * - `written`: the rows the file holds — the tile's, "Other" folded.
 * - `returned`: the rows Cube returned for the tile's query.
 * - `total`: the query's full count.
 *
 * Without either count it cannot tell, and says so, so it never claims a
 * whole result it did not see.
 */
export function exportNoteOf({
  written,
  returned,
  total,
}: {
  written: number;
  returned: number | undefined;
  total: number | undefined;
}): { truncated: boolean | undefined; text: string } {
  // Fewer in the count than it returned: the data moved between the two, and
  // neither can be taken for the other.
  if (returned === undefined || total === undefined || total < returned)
    return {
      truncated: undefined,
      text: `Downloaded ${count(written)}. Could not tell whether Cube cut the result short.`,
    };
  if (total > returned)
    return {
      truncated: true,
      text: `Downloaded ${count(written)}. Truncated: the query has ${count(total)}, and Cube returned the first ${returned.toLocaleString('en-US')}.`,
    };
  // The query's own count, so rows folded into "Other" are not read as missing.
  return {
    truncated: false,
    text: `Downloaded ${count(written)}. Nothing was cut short: Cube returned all ${count(total)} of the query.`,
  };
}

/** How many rows, in words: "1 row", "10,000 rows". */
export { count as rowsText };
