import { MSSQL, MySQL, PostgreSQL, SQLDialect, StandardSQL } from '@codemirror/lang-sql';

/**
 * The dialect a source's strings and quoted names are read in (T803's
 * review): PostgreSQL's `$$…$$`, MySQL's backticks and backslash escapes
 * (lang-sql's MySQL leaves `backslashEscapes` off, but xcube's session lets
 * backslashes escape: research/sql-parameter-binding.md §4), and the rest
 * as standard SQL, where lang-sql has no dialect of theirs.
 */
const MYSQL = SQLDialect.define({ ...MySQL.spec, backslashEscapes: true });
export function dialectFor(driver: string | null | undefined): SQLDialect {
  switch (driver) {
    case 'postgres':
    case 'redshift':
      return PostgreSQL;
    case 'mysql':
      return MYSQL;
    case 'mssql':
      return MSSQL;
    // PLSQL reads "…" as a string (research §4), so Oracle stays standard.
    default:
      return StandardSQL;
  }
}

/**
 * The statement at the cursor (T803, AC-387; design 17, pin 11): bounded by
 * semicolons outside string literals, comments and quoted names, as
 * `@codemirror/lang-sql` 6.10.0's parser reads them (its `String`,
 * `LineComment`, `BlockComment` and `QuotedIdentifier` nodes, walked with
 * `Tree.iterate`: research/sql-parameter-binding.md §4). The text sent is
 * trimmed of the space around it; its comments stay in it.
 *
 * A cursor just after a semicolon is in the statement that semicolon ends,
 * and one in a stretch holding only space or comments is in the statement
 * before it, where there is one (lane SQL's call).
 */
const SKIP = new Set(['String', 'LineComment', 'BlockComment', 'QuotedIdentifier']);
const COMMENTS = new Set(['LineComment', 'BlockComment']);

export interface Statement {
  readonly from: number;
  readonly to: number;
  readonly text: string;
}

export function statementAt(
  sql: string,
  cursor: number,
  dialect: SQLDialect = StandardSQL,
): Statement | null {
  const skipped: [number, number][] = [];
  const comments: [number, number][] = [];
  dialect.language.parser.parse(sql).iterate({
    enter: (node) => {
      if (!SKIP.has(node.name)) return undefined;
      skipped.push([node.from, node.to]);
      if (COMMENTS.has(node.name)) comments.push([node.from, node.to]);
      return false;
    },
  });
  const within = (ranges: [number, number][], at: number) =>
    ranges.some(([from, to]) => at >= from && at < to);

  // Each stretch between bounding semicolons, the semicolon left out.
  const stretches: [number, number][] = [];
  let start = 0;
  for (let at = 0; at < sql.length; at += 1)
    if (sql[at] === ';' && !within(skipped, at)) {
      stretches.push([start, at]);
      start = at + 1;
    }
  stretches.push([start, sql.length]);

  /** Whether a stretch holds anything but space and comments. */
  const holdsSql = ([from, to]: [number, number]) => {
    for (let at = from; at < to; at += 1)
      if (!/\s/.test(sql[at]!) && !within(comments, at)) return true;
    return false;
  };
  const trimmed = ([from, to]: [number, number]): Statement => {
    let first = from;
    let last = to;
    while (first < last && /\s/.test(sql[first]!)) first += 1;
    while (last > first && /\s/.test(sql[last - 1]!)) last -= 1;
    return { from: first, to: last, text: sql.slice(first, last) };
  };

  const clamped = Math.max(0, Math.min(cursor, sql.length));
  // Its stretch: the first that ends at or after it; just after a
  // semicolon, the one that semicolon ends.
  let index = stretches.findIndex(([, to]) => clamped <= to);
  if (index > 0 && clamped === stretches[index - 1]![1] + 1) index -= 1;
  for (let at = index; at >= 0; at -= 1) if (holdsSql(stretches[at]!)) return trimmed(stretches[at]!);
  return null;
}
