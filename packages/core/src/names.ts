/**
 * T703 (AC-426): one grammar for a cube's, view's and data source's name, as
 * R72 fixes it and xcube `256d632371` holds it (research
 * `docs/research/xcube-256d632371.md`, "The grammar"; xcube's
 * `src/names/items.ts`).
 *
 * An ASCII letter, then ASCII letters, digits and single underscores, not
 * ending in one: so never `__`, which Cube puts between a cube's name and a
 * member's in SQL. At most 40 characters. Upper case is allowed, and names
 * compare in any case (AC-421).
 */
export const NAME = /^[A-Za-z][A-Za-z0-9]*(?:_[A-Za-z0-9]+)*$/;

export const MAX_NAME = 40;

/**
 * The words a cube or view may not take, compared in any case: Python's
 * keywords, with `None`, `True` and `False`, since Cube's YAML compiler reads
 * `{…}` as Python; and the names Cube resolves before any cube's (research,
 * "The grammar"). A data source's name is exempt.
 */
const RESERVED = new Set(
  [
    'and as assert async await break class continue def del elif else except finally for from',
    'global if import in is lambda nonlocal not or pass raise return try while with yield',
    'none true false',
    'cube table security_context securitycontext filter_params filter_group sql_utils',
    'user_context compile_context',
  ]
    .join(' ')
    .split(' '),
);

export type NamedKind = 'cube' | 'view' | 'data-source';

/** A name as names compare: in any case (AC-421). */
export const nameKey = (name: string): string => name.toLowerCase();

/** Why a name isn't one this kind takes, or `undefined` where it is (AC-426). */
export function nameProblem(name: string, kind: NamedKind): string | undefined {
  if (name.length > MAX_NAME || !NAME.test(name))
    return `“${name}” isn’t a name: start with a letter, then use letters, digits and single underscores, not ending in one, at most ${String(MAX_NAME)} characters.`;
  if (kind !== 'data-source' && RESERVED.has(nameKey(name)))
    return `“${name}” is a reserved word, so a cube or view can’t take it.`;
  return undefined;
}
