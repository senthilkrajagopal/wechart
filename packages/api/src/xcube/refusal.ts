import type { CompileError } from '../model/validate';
import { ROOT_FOLDER_ID } from '../repos/catalog';

/**
 * A publish the check refused, as its user may see it (T427, AC-322): each
 * break in a folder whose models they may see named, with its error, its
 * item's file and the line and column where xcube gives them; the rest only
 * counted. A Super-Admin sees every folder, so every break is named. The
 * audit trail keeps every break, named or counted, with what its user was
 * shown (design 08, state B).
 */
export interface Refusal {
  /**
   * The 422's body: its errors alone, as before T427, when every break is
   * named; with the count and its words when some aren't.
   */
  readonly answer: {
    readonly errors: readonly CompileError[];
    readonly hidden?: number;
    readonly error?: string;
  };
  /** Every break and what was shown, for the audit record's details. */
  readonly recorded: {
    readonly breaks: readonly {
      readonly path: string;
      readonly folderId: string;
      readonly message: string;
      readonly line?: number;
      readonly column?: number;
    }[];
    readonly shown: { readonly named: number; readonly counted: number };
  };
  /** The audit record's one line. */
  readonly summary: string;
}

const plural = (n: number, one: string, many: string) => `${String(n)} ${n === 1 ? one : many}`;

export function refusalOf(
  errors: readonly CompileError[],
  /** Whether the user may see a folder's models: every folder for a Super-Admin, or with sign-in off. */
  sees: (folderId: string) => boolean,
): Refusal {
  // A break says its folder, except the root's (CompileError, T452): every
  // source says it, one placed on a published file by what it names or a
  // cron's included (T427's review).
  const folderOf = (error: CompileError) => error.folderId ?? ROOT_FOLDER_ID;
  const named = errors.filter((error) => sees(folderOf(error)));
  const hidden = errors.length - named.length;
  return {
    answer: {
      errors: named,
      ...(hidden === 0
        ? {}
        : {
            hidden,
            error: `${plural(hidden, 'item', 'items')} in folders you can’t see would break.`,
          }),
    },
    recorded: {
      breaks: errors.map((error) => ({
        path: error.path,
        folderId: folderOf(error),
        message: error.message,
        ...(error.line === undefined ? {} : { line: error.line }),
        ...(error.column === undefined ? {} : { column: error.column }),
      })),
      shown: { named: named.length, counted: hidden },
    },
    summary: `${plural(errors.length, 'break', 'breaks')}: ${String(named.length)} named to its user, ${String(hidden)} counted`,
  };
}
