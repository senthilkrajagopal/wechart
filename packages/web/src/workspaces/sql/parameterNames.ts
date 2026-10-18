import type { SQLDialect } from '@codemirror/lang-sql';

/**
 * The parameters in a tab's SQL (T809, AC-453; design 17, pin 13 and state
 * F): each `{{ name }}` outside string literals, comments and quoted names,
 * with or without spaces inside the braces, its name matching
 * `[A-Za-z_][A-Za-z0-9_]*`, listed once, case-sensitively, in the order
 * they first come.
 *
 * Strings and comments are as the tab's source's dialect reads them, with
 * `@codemirror/lang-sql` 6.10.0's parser (`dialectFor`, which gives MySQL
 * backslash escapes: research/sql-parameter-binding.md §4). This only lists
 * them; xcube's own lexer decides what is bound (§4's recommendation).
 */
/** A parameter's type (AC-453): Text, the default, Number, Date or Boolean. */
export type ParamType = 'text' | 'number' | 'date' | 'boolean';

const SKIP = new Set(['String', 'LineComment', 'BlockComment', 'QuotedIdentifier']);
const PARAMETER = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g;

export function parameterNames(sql: string, dialect: SQLDialect): string[] {
  if (!sql.includes('{{')) return [];
  const skipped: [number, number][] = [];
  dialect.language.parser.parse(sql).iterate({
    enter: (node) => {
      if (!SKIP.has(node.name)) return undefined;
      skipped.push([node.from, node.to]);
      return false;
    },
  });
  const names = new Set<string>();
  for (const found of sql.matchAll(PARAMETER)) {
    const at = found.index;
    if (!skipped.some(([from, to]) => at >= from && at < to)) names.add(found[1]!);
  }
  return [...names];
}
