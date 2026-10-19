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

/** A member as Cube names one, for exported tokens' sources. */
const MEMBER_NAME = /^[A-Za-z_][A-Za-z0-9_]*\.[A-Za-z_][A-Za-z0-9_]*$/;
/** The kinds whose exported token names a measure: T870's names, the schema's kinds. */
const BY_MEASURE: Readonly<Record<string, string>> = {
  sparkline: 'sparkline',
  icon: 'icon',
  'bullet-graph': 'bulletGraph',
  'as-of': 'asOf',
};

/**
 * The element an exported token names that a markdown tile never had (T870,
 * decision T891-1): a Change, a Sparkline, an Icon, a Bullet graph, an As
 * of, a Filter value, a Filter control, a Parameter control or a Button, by
 * its source; or none.
 */
function exportedElementOf(inside: string): TextNode | undefined {
  const text = inside.trim();
  const colon = text.indexOf(':');
  if (colon < 0) return undefined;
  const kind = text.slice(0, colon);
  const source = text.slice(colon + 1).trim();
  if (source === '') return undefined;
  if (kind === 'change') {
    const change = /^(\S+)\s*\|\s*vs:\s*previous_period$/.exec(source);
    const measure = change?.[1];
    return measure !== undefined && MEMBER_NAME.test(measure)
      ? { type: 'change', attrs: { measure } }
      : undefined;
  }
  if (kind === 'measure-parameter') {
    // A Value of a dashboard parameter (T898, AC-533), limited by a marking where it says so.
    const limited = /^(.*?\S)\s*\|\s*marking:\s*(\S(?:.*\S)?)$/.exec(source);
    return {
      type: 'value',
      attrs:
        limited === null
          ? { parameter: source }
          : { parameter: limited[1] ?? '', marking: limited[2] ?? '' },
    };
  }
  const byMeasure = BY_MEASURE[kind];
  if (byMeasure !== undefined)
    return MEMBER_NAME.test(source) ? { type: byMeasure, attrs: { measure: source } } : undefined;
  switch (kind) {
    case 'filter-value':
      return { type: 'filterValue', attrs: { filter: source } };
    case 'filter-control':
      return { type: 'filterControl', attrs: { filter: source } };
    case 'parameter-control':
      return { type: 'parameterControl', attrs: { parameter: source } };
    case 'button':
      return { type: 'actionButton', attrs: { label: source } };
    default:
      return undefined;
  }
}

/** The element a `{{…}}` names, every kind where `exported`, a markdown tile's two otherwise. */
function elementOf(inside: string, exported: boolean): TextNode | undefined {
  const token = tokenOf(inside);
  if (token !== undefined) return elementOfToken(token);
  return exported ? exportedElementOf(inside) : undefined;
}

/**
 * A run of text, split into its plain text and the elements its tokens name,
 * in order: a markdown tile's tokens, or, `exported`, every kind's (T891).
 */
export function elementPartsOf(text: string, exported = false): (string | TextNode)[] {
  const parts: (string | TextNode)[] = [];
  let plain = '';
  let at = 0;
  for (const found of text.matchAll(TOKEN)) {
    const element = elementOf(found[1] ?? '', exported);
    const end = found.index + found[0].length;
    if (element === undefined) {
      plain += text.slice(at, end);
    } else {
      plain += text.slice(at, found.index);
      if (plain !== '') parts.push(plain);
      plain = '';
      parts.push(element);
    }
    at = end;
  }
  plain += text.slice(at);
  if (plain !== '') parts.push(plain);
  return parts;
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
  /** Every kind's token, as exported markdown has them (T891). */
  exported = false,
): { readonly index: number; readonly length: number } | undefined {
  for (const found of text.matchAll(TOKEN))
    if (elementOf(found[1] ?? '', exported) !== undefined)
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
