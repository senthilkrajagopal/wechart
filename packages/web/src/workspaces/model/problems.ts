import { parseDocument, visit, type Alias, type Document } from 'yaml';

import { CUBE_PARSE } from './objects';

/**
 * What stops a model file parsing (T141, AC-135), each named by file and
 * line for the problems list, and placed in the text for the editor to mark.
 */
export interface Problem {
  readonly path: string;
  readonly line: number;
  readonly column: number;
  readonly message: string;
  /** Where in the text: offsets the editor underlines. */
  readonly from: number;
  readonly to: number;
  /**
   * An error stops the file being read or published; a warning does not
   * (AC-223 counts each). Absent is an error, as every parse problem is.
   */
  readonly severity?: 'error' | 'warning';
}

/** An offset's line and column, from 1. */
function placeOf(text: string, offset: number): { line: number; column: number } {
  const before = text.slice(0, offset).split('\n');
  return { line: before.length, column: (before[before.length - 1]?.length ?? 0) + 1 };
}

export function problemsOf(path: string, text: string): Problem[] {
  const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));
  let document: Document;
  try {
    document = parseDocument(text, CUBE_PARSE);
  } catch (error) {
    // Not throw-free on every input (research/yaml.md): said at the start.
    return [{ path, line: 1, column: 1, message: messageOf(error), from: 0, to: 0 }];
  }
  if (document.errors.length === 0) {
    // Some problems `yaml` finds only in reading the values, as the form
    // does: an alias to no anchor, or too many aliases (research/yaml.md).
    try {
      document.toJS();
    } catch (error) {
      // Placed at the first alias that resolves to nothing, if that is it.
      let at: Alias | undefined;
      visit(document, {
        Alias(_key, alias) {
          if (alias.resolve(document) !== undefined) return undefined;
          at = alias;
          return visit.BREAK;
        },
      });
      const [from = 0, to = from] = at?.range ?? [];
      return [{ path, ...placeOf(text, from), message: messageOf(error), from, to }];
    }
  }
  return document.errors.map((error) => {
    const [from = 0, to = from] = error.pos;
    const at = error.linePos?.[0] ?? { line: 1, col: 1 };
    return {
      path,
      line: at.line,
      column: at.col,
      // The first line, less the place `prettyErrors` adds to it (the rest is
      // its copy of the source): the list gives the place beside it.
      message: (error.message.split('\n')[0] ?? error.message).replace(
        / at line \d+, column \d+:?$/,
        '',
      ),
      from,
      to: Math.max(to, from),
    };
  });
}
