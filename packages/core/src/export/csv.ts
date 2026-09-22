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
  const write = columns.map((member) =>
    formatterFor(member, spec.formats ?? {}, spec.granularities ?? {}),
  );
  const records = spec.rows.map((row) =>
    columns.map((member, index) => {
      const raw = row[member];
      const written = write[index]?.(raw) ?? '';
      return guarded(raw, written);
    }),
  );
  return Papa.unparse([columns, ...records], { newline: '\r\n', escapeFormulae: false });
}
