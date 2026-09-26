import type { ModelFile } from '../server';

/**
 * Cube's reasons for refusing a model, each on the file it is about (T142,
 * AC-136).
 *
 * As Cube gives them (research/cube/spike-model-store-and-quick-calcs.md §1a):
 * a compile-errors list, whose groups name their file (`cubes/x.yml
 * Errors:`) or none (`Errors:`); or a YAML error with a line, a column and a
 * snippet, and no file. What names no file is placed on the changed file it
 * comes from: the live model compiled, so a draft's error is in what the
 * draft changed.
 */
export interface CompileError {
  readonly path: string;
  /**
   * The folder holding the file, where it isn't the shared root (T452): a
   * path can be one in each folder.
   */
  readonly folderId?: string;
  readonly message: string;
  /** The line, where Cube gives one. */
  readonly line?: number;
  /** The column, where xcube gives one (T445's review). */
  readonly column?: number;
  /**
   * A rollup refused: which. With the names, for its row in the cube's
   * Pre-aggregations tab, when it names what the model doesn't have (T207,
   * AC-189); without, when Cube can't join its cubes (T265, AC-235).
   */
  readonly preAggregation?: {
    readonly cube: string;
    readonly name: string;
    readonly unknown?: readonly { readonly list: string; readonly name: string }[];
  };
}

const COMPILE_ERRORS = /^Error: Compile errors:\n/;
const GROUP = /^(?:(.+) )?Errors:$/;
const YAML_ERROR = /^YAMLException: .*\((\d+):(\d+)\)$/;
/** "no_such_member is not defined": the name Cube could not resolve. */
const UNDEFINED = /^([A-Za-z_][\w.]*) is not defined$/;

/**
 * The changed files an error names no file for belong to: the one holding its
 * name, or all. xcube's check places its own on none this way too (T445).
 */
export function placeOf(message: string, changed: readonly ModelFile[]): readonly ModelFile[] {
  const name = UNDEFINED.exec(message)?.[1];
  if (name !== undefined) {
    const holding = changed.filter((file) => file.content.includes(name));
    if (holding.length > 0) return holding;
  }
  return changed;
}

export function compileErrorsOf(message: string, changed: readonly ModelFile[]): CompileError[] {
  const [first = '', ...snippet] = message.split('\n');

  const yaml = YAML_ERROR.exec(first);
  if (yaml !== null) {
    const line = Number(yaml[1]);
    // The snippet shows the line as ` 2 |   - name: products`: the file with that line is the one.
    const shown = snippet
      .map((text) => /^\s*(\d+) \| (.*)$/.exec(text))
      .find((match) => match !== null && Number(match[1]) === line)?.[2];
    const holding =
      shown === undefined
        ? []
        : changed.filter((file) => file.content.split('\n')[line - 1] === shown);
    return (holding.length > 0 ? holding : changed).map((file) => ({
      path: file.path,
      line,
      message: first,
    }));
  }

  if (!COMPILE_ERRORS.test(message)) {
    // Not a list Cube's compiler made: said as it is, on each changed file.
    return changed.map((file) => ({ path: file.path, message: message.trim() }));
  }

  const errors: CompileError[] = [];
  let group: string | null = null;
  for (const text of message.replace(COMPILE_ERRORS, '').split('\n')) {
    const heading = GROUP.exec(text);
    if (heading !== null) {
      group = heading[1] ?? null;
      continue;
    }
    if (text.trim() === '') continue;
    const places = group === null ? placeOf(text, changed) : [{ path: group }];
    for (const place of places) errors.push({ path: place.path, message: text.trim() });
  }
  return errors;
}
