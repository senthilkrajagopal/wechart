/**
 * A text tile's live values (T389, AC-116; direction.md, "Markdown tokens"):
 *
 * - `{{marking:Name.count}}` and `{{marking:Name.summary}}` print a marking's
 *   state: how many items it holds, or what it holds;
 * - `{{measure:id}}` prints a measure, and `{{measure:id | marking:Name}}`
 *   the measure over the rows that marking holds — over all rows while it
 *   holds nothing, as Spotfire's calculated values do.
 *
 * Braces that match none of these stay the text they are: a tile about
 * templates can still write `{{name}}`.
 *
 * Here, in core, because a measure token names a member as a chart does:
 * the API binds it at publish and counts it among what uses a cube (T389's
 * review, AC-272, AC-275), and the tile draws it.
 */
import type { TextNode } from './text-document';

export type TextToken =
  | { readonly kind: 'marking'; readonly name: string; readonly show: 'count' | 'summary' }
  | { readonly kind: 'measure'; readonly member: string; readonly marking?: string };

const TOKEN = /\{\{([^{}]*)\}\}/g;
const MARKING = /^marking:\s*(.*\S)\s*\.(count|summary)$/;
/** A member as Cube names one: `cube.member`, the cube's name possibly folder-prefixed. */
const MEASURE =
  /^measure:\s*([A-Za-z_][A-Za-z0-9_]*\.[A-Za-z_][A-Za-z0-9_]*)(?:\s*\|\s*marking:\s*(\S(?:.*\S)?))?$/;

/** The token a `{{…}}` holds, or none. */
function tokenOf(inside: string): TextToken | undefined {
  const text = inside.trim();
  const marking = MARKING.exec(text);
  if (marking !== null)
    return {
      kind: 'marking',
      name: marking[1] ?? '',
      show: marking[2] === 'count' ? 'count' : 'summary',
    };
  const measure = MEASURE.exec(text);
  if (measure === null) return undefined;
  const limitedBy = measure[2];
  return {
    kind: 'measure',
    member: measure[1] ?? '',
    ...(limitedBy === undefined ? {} : { marking: limitedBy }),
  };
}

/** A run of text, split into its plain text and its tokens, in order. */
export function textPartsOf(text: string): (string | TextToken)[] {
  const parts: (string | TextToken)[] = [];
  let plain = '';
  let at = 0;
  for (const found of text.matchAll(TOKEN)) {
    const token = tokenOf(found[1] ?? '');
    const end = found.index + found[0].length;
    if (token === undefined) {
      plain += text.slice(at, end);
    } else {
      plain += text.slice(at, found.index);
      if (plain !== '') parts.push(plain);
      plain = '';
      parts.push(token);
    }
    at = end;
  }
  plain += text.slice(at);
  if (plain !== '') parts.push(plain);
  return parts;
}

/** Where the text's first token is, and how long: for keeping it whole among the inline marks. */
export function firstTokenIn(
  text: string,
): { readonly index: number; readonly length: number } | undefined {
  for (const found of text.matchAll(TOKEN))
    if (tokenOf(found[1] ?? '') !== undefined)
      return { index: found.index, length: found[0].length };
  return undefined;
}

/**
 * The Text tile's element a markdown tile's token names (AC-512, AC-116): a
 * measure token is a Value, limited by its marking where it names one; a
 * marking token a Marking showing its count or summary.
 */
export function elementOfToken(token: TextToken): TextNode {
  return token.kind === 'marking'
    ? { type: 'marking', attrs: { marking: token.name, show: token.show } }
    : {
        type: 'value',
        attrs: {
          measure: token.member,
          ...(token.marking === undefined ? {} : { marking: token.marking }),
        },
      };
}

/** The members a text's measure tokens name, each once. */
export function tokenMembersOf(text: string): string[] {
  return [
    ...new Set(
      textPartsOf(text).flatMap((part) =>
        typeof part !== 'string' && part.kind === 'measure' ? [part.member] : [],
      ),
    ),
  ];
}

/**
 * The text with each measure token's member renamed — a cube bound at
 * publish (AC-272) — and every other character as it was.
 */
export function textRenamed(text: string, rename: (member: string) => string): string {
  return text.replace(TOKEN, (whole, inside: string) => {
    const token = tokenOf(inside);
    if (token === undefined || token.kind !== 'measure') return whole;
    const renamed = rename(token.member);
    return renamed === token.member ? whole : whole.replace(token.member, renamed);
  });
}
