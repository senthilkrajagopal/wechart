import Papa from 'papaparse';

import { formatterFor } from '../format';
import type { RenderSpec } from '../render-spec';

/**
 * The columns a tile's table heads (AC-178, T177): every key its rows carry,
 * in the order they carry them — encoded members and the rest alike, a second
 * dimension or a time member's bucket among them. One definition for the
 * table and its CSV, so the two cannot head different columns.
 */
export function tableColumnsOf(rows: readonly Record<string, unknown>[]): string[] {
  return [...new Set(rows.flatMap((row) => Object.keys(row)))];
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
 * every key the rows carry (`tableColumnsOf`), headed by member; each value
 * written as the table writes it (`formatValue`'s formatter) — as RFC 4180
 * text by papaparse's `unparse` (research/supporting-utilities.md §3): CRLF
 * between records, a field quoted when it holds a comma, a quote or a line
 * break, its quotes doubled.
 */
export function csvOf(spec: RenderSpec): string {
  const columns = tableColumnsOf(spec.rows);
  const measures = new Set(spec.measures ?? []);
  const write = columns.map((member) =>
    formatterFor(member, spec.formats ?? {}, spec.granularities ?? {}),
  );
  // A measure's raw number beside its formatted value (T179, AC-173).
  const heads = columns.flatMap((member) =>
    measures.has(member) ? [member, `${member} (raw)`] : [member],
  );
  const records = spec.rows.map((row) =>
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
