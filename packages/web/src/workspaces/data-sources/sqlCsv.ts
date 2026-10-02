/**
 * A SQL run's rows as a CSV (T535, AC-380; R50-11; design 15's B2): written
 * from the result in hand, so the query isn't run again. The column names
 * first, then each row as it came: a value as text, an object as JSON, NULL
 * an empty field. Fields holding a comma, a quote or a line break are quoted,
 * a quote doubled, and lines end in CRLF (RFC 4180).
 *
 * Text a spreadsheet would run as a formula — beginning `=`, `+`, `-`, `@`, a
 * tab or a carriage return — is prefixed with `'`, as the app's chart export
 * does (`@wechart/core`'s csv, research/supporting-utilities.md §3); a number,
 * and a number the database sent as text, is data and left as it came (T535's
 * review).
 */

/** A plain number as text, signed or not, as databases send numerics. */
const NUMBER = /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i;

const fieldOf = (value: unknown): string => {
  const raw =
    value === null || value === undefined
      ? ''
      : typeof value === 'object'
        ? JSON.stringify(value)
        : String(value as string | number | boolean | bigint);
  const text =
    typeof value !== 'number' && !NUMBER.test(raw) && /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

export function csvOf(
  columns: readonly { readonly name: string; readonly type?: string | null }[],
  rows: readonly (readonly unknown[])[],
): string {
  return [columns.map((column) => fieldOf(column.name)), ...rows.map((row) => row.map(fieldOf))]
    .map((fields) => `${fields.join(',')}\r\n`)
    .join('');
}

const two = (n: number) => String(n).padStart(2, '0');

/** Its file's name: the data source's, and the run's start in the user's own time. */
export function csvFileName(source: string, startedAt: Date): string {
  const day = `${String(startedAt.getFullYear())}-${two(startedAt.getMonth() + 1)}-${two(startedAt.getDate())}`;
  const time = `${two(startedAt.getHours())}${two(startedAt.getMinutes())}${two(startedAt.getSeconds())}`;
  return `${source}-${day}-${time}.csv`;
}
