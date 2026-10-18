/**
 * A Text tile's stored document (F45; T868, AC-513, AC-518; design 21,
 * direction.md §7h and rules 127–133).
 *
 * **ProseMirror's JSON, in wechart's own schema.** The editor (Tiptap 3)
 * writes `{ type, attrs?, content?, marks?, text? }` trees, and read mode
 * draws the same tree through Tiptap's JSON static renderer (research
 * `rich-tiles-and-combo-tech.md` §1, Storage). The node and mark names are
 * ours, so no Tiptap class defines the stored shape: it is wrapped in a
 * version of wechart's and checked here, on save and on load, rather than by
 * the editor.
 *
 * **Why the check is strict.** The JSON static renderer runs no `renderHTML`
 * and checks no link, and the `pm` one passes on any attribute it's given
 * (research, Gotchas: "Read-mode links are ours to check", "Stray
 * attributes"). So a document is accepted only when every node, mark,
 * attribute and field in it is one this schema declares, each attribute of
 * the shape it declares, each node where its parent may hold it, and each
 * link to an http(s) address or a wechart dashboard (rule 42). Anything else
 * is named: a typed, pasted, imported, MCP-written or tampered document that
 * fails is refused, never half-stored (AC-513).
 *
 * **Elements are references, never data.** A live element names its measure,
 * marking or filter; the values are fetched when it's drawn. Every element —
 * the eight live kinds, the three controls — counts toward the tile's 10
 * (AC-518, 21-Q4 (a)).
 */
import { GRANULARITY_NAMES } from './format';

/** Raised only when the stored shape changes in a way an older reader would get wrong. */
export const TEXT_DOCUMENT_VERSION = 1;

/** The most elements a Text tile holds (AC-518, R80 "10 elements"). */
export const TEXT_ELEMENT_LIMIT = 10;

/** A mark on a run of text, or on an element. */
export interface TextMark {
  readonly type: string;
  readonly attrs?: Readonly<Record<string, unknown>>;
}

/** One node of the document, as ProseMirror's JSON writes it. */
export interface TextNode {
  readonly type: string;
  readonly attrs?: Readonly<Record<string, unknown>>;
  readonly content?: readonly TextNode[];
  readonly marks?: readonly TextMark[];
  readonly text?: string;
}

/** A Text tile's document: wechart's version, and the editor's tree under its `doc`. */
export interface TextDocument {
  readonly version: typeof TEXT_DOCUMENT_VERSION;
  readonly doc: TextNode;
}

/** The live elements (rule 130), in the insert menu's order (AC-517). */
export const LIVE_ELEMENT_KINDS = [
  'value',
  'change',
  'sparkline',
  'icon',
  'bulletGraph',
  'marking',
  'filterValue',
  'asOf',
] as const;

/** The controls (AC-517's Controls group): a dashboard filter, a parameter, a button. */
export const CONTROL_KINDS = ['filterControl', 'parameterControl', 'actionButton'] as const;

/** Every element a Text tile can hold; each counts toward the 10. */
export const ELEMENT_KINDS: readonly ElementKind[] = [...LIVE_ELEMENT_KINDS, ...CONTROL_KINDS];

export type LiveElementKind = (typeof LIVE_ELEMENT_KINDS)[number];
export type ControlKind = (typeof CONTROL_KINDS)[number];
export type ElementKind = LiveElementKind | ControlKind;

/** A filter an element adds to its tile's (AC-520), as a chart's own filter is shaped (AC-216). */
export interface ElementFilter {
  readonly member: string;
  readonly operator: 'equals' | 'notEquals';
  readonly values: readonly string[];
}

/** One of an Icon's rules, first match wins (AC-522, design 21 C3). */
export interface IconRule {
  readonly op: '>=' | '>' | '<=' | '<' | '=' | 'otherwise';
  /** The threshold; absent only for `otherwise`. A ratio when the Icon compares two measures. */
  readonly value?: number;
  readonly state: 'success' | 'warning' | 'error' | 'neutral';
  readonly label: string;
}

/** One of an action button's declared actions, run in order (rule 136, design 21 E). */
export type ButtonAction =
  | { readonly kind: 'page'; readonly page: string }
  | { readonly kind: 'bookmark'; readonly bookmark: string }
  | { readonly kind: 'resetFilters' }
  | { readonly kind: 'export'; readonly tiles: readonly string[] };

/* ------------------------------------------------------------------ links */

const LINK_PROBLEM = (href: string) =>
  `The link "${href}" isn’t an http(s) address or a wechart dashboard.`;

/**
 * An absolute http(s) address: a host, then nothing that's whitespace or a
 * control character. `http:evil.example`, which a URL parser reads as
 * http://evil.example/, is refused: its href would resolve against wechart's
 * own page.
 */
const WEB_ADDRESS = /^https?:\/\/[^\s/?#\\\p{Cc}]+(?:[/?#][^\s\p{Cc}]*)?$/iu;
/** A wechart dashboard, as the Link/button tile addresses one (AC-064). */
const DASHBOARD = /^\/explore\/dashboards\/[A-Za-z0-9_-]+(?:[?#][^\s\p{Cc}]*)?$/u;

/**
 * Why an address can't be a Text tile's link, or undefined when it can: only
 * an http(s) address or a wechart dashboard (rule 42, AC-513). `javascript:`,
 * `data:`, `vbscript:` and every other scheme are refused by being none of
 * these; so is a protocol-relative `//host`, and any other path of wechart's.
 */
export function textLinkProblem(href: string): string | undefined {
  return WEB_ADDRESS.test(href) || DASHBOARD.test(href) ? undefined : LINK_PROBLEM(href);
}

/* ----------------------------------------------------------------- schema */

interface AttrSpec {
  readonly required?: boolean;
  readonly check: (value: unknown) => boolean;
  /** What a value of the wrong shape must be, completing "A ‹node›’s "‹attr›" must be …". */
  readonly mustBe: string;
}

interface NodeSpec {
  /** The node types it may hold; none for a leaf. */
  readonly content: readonly string[];
  readonly attrs: Readonly<Record<string, AttrSpec>>;
  /** The marks it may carry; none for a block. */
  readonly marks: readonly string[];
}

const MEMBER = /^[A-Za-z_][A-Za-z0-9_]*\.[A-Za-z_][A-Za-z0-9_]*$/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const hasOnly = (value: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(value).every((key) => keys.includes(key));
const isName = (value: unknown): value is string =>
  typeof value === 'string' && value.trim() !== '';
const isMember = (value: unknown): value is string =>
  typeof value === 'string' && MEMBER.test(value);
const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 1;
const oneOf =
  (...values: readonly unknown[]) =>
  (value: unknown) =>
    values.includes(value);

const member: AttrSpec = { check: isMember, mustBe: 'a member, cube.member' };
const requiredMember: AttrSpec = { ...member, required: true };
const name = (required: boolean): AttrSpec => ({
  required,
  check: isName,
  mustBe: 'a name',
});

const isFilter = (value: unknown) =>
  isRecord(value) &&
  hasOnly(value, ['member', 'operator', 'values']) &&
  isMember(value.member) &&
  (value.operator === 'equals' || value.operator === 'notEquals') &&
  Array.isArray(value.values) &&
  value.values.every((one) => typeof one === 'string');

const isIconRule = (value: unknown) =>
  isRecord(value) &&
  hasOnly(value, ['op', 'value', 'state', 'label']) &&
  (value.op === 'otherwise'
    ? value.value === undefined
    : oneOf('>=', '>', '<=', '<', '=')(value.op) && isNumber(value.value)) &&
  oneOf('success', 'warning', 'error', 'neutral')(value.state) &&
  isName(value.label);

const isTarget = (value: unknown) =>
  isRecord(value) &&
  ((value.kind === 'fixed' && hasOnly(value, ['kind', 'value']) && isNumber(value.value)) ||
    (value.kind === 'measure' && hasOnly(value, ['kind', 'measure']) && isMember(value.measure)));

const isAction = (value: unknown) => {
  if (!isRecord(value)) return false;
  switch (value.kind) {
    case 'page':
      return hasOnly(value, ['kind', 'page']) && isName(value.page);
    case 'bookmark':
      return hasOnly(value, ['kind', 'bookmark']) && isName(value.bookmark);
    case 'resetFilters':
      return hasOnly(value, ['kind']);
    case 'export':
      return (
        hasOnly(value, ['kind', 'tiles']) && Array.isArray(value.tiles) && value.tiles.every(isName)
      );
    default:
      return false;
  }
};

const listOf = (each: (value: unknown) => boolean) => (value: unknown) =>
  Array.isArray(value) && value.every(each);

/** Every live element's: its own filter, added to the tile's (AC-520), and a marking it follows (AC-116). */
const followed: Readonly<Record<string, AttrSpec>> = {
  filters: { check: listOf(isFilter), mustBe: 'a list of filters on members' },
  marking: name(false),
};

const BLOCKS = ['paragraph', 'heading', 'largeValue', 'bulletList', 'orderedList'];
const INLINE = ['text', 'hardBreak', ...ELEMENT_KINDS];
const TEXT_MARKS = ['bold', 'italic', 'link'];
/** An element may sit inside emphasis (`**{{measure:…}}**`), never inside a link. */
const ELEMENT_MARKS = ['bold', 'italic'];

const block = (attrs: Readonly<Record<string, AttrSpec>> = {}): NodeSpec => ({
  content: INLINE,
  attrs,
  marks: [],
});
const element = (attrs: Readonly<Record<string, AttrSpec>>): NodeSpec => ({
  content: [],
  attrs,
  marks: ELEMENT_MARKS,
});

const NODES: Readonly<Record<string, NodeSpec>> = {
  doc: { content: BLOCKS, attrs: {}, marks: [] },
  paragraph: block(),
  /** Heading large, medium and small: `#`, `##` and `###` (AC-516), drawn as h3, h4 and h5. */
  heading: block({
    level: { required: true, check: oneOf(1, 2, 3), mustBe: '1, 2 or 3' },
  }),
  /** `text-kpi`, for a lone Value or Change (design 21 pin 2). */
  largeValue: block(),
  bulletList: { content: ['listItem'], attrs: {}, marks: [] },
  orderedList: {
    content: ['listItem'],
    attrs: { start: { check: isCount, mustBe: 'a whole number from 1' } },
    marks: [],
  },
  listItem: { content: ['paragraph', 'bulletList', 'orderedList'], attrs: {}, marks: [] },
  text: { content: [], attrs: {}, marks: TEXT_MARKS },
  hardBreak: { content: [], attrs: {}, marks: [] },

  value: element({
    measure: requiredMember,
    ...followed,
    /** With a marking and nothing marked: all data (AC-116's default), or "—". */
    whenUnmarked: { check: oneOf('all', 'none'), mustBe: '"all" or "none"' },
  }),
  change: element({
    measure: requiredMember,
    ...followed,
    time: member,
    compare: { check: oneOf('previous_period'), mustBe: '"previous_period"' },
    period: {
      check: oneOf('day', 'week', 'month', 'quarter', 'year'),
      mustBe: 'day, week, month, quarter or year',
    },
    show: { check: oneOf('percent', 'amount'), mustBe: '"percent" or "amount"' },
    direction: {
      check: oneOf('higher', 'lower', 'neutral'),
      mustBe: '"higher", "lower" or "neutral"',
    },
  }),
  sparkline: element({
    measure: requiredMember,
    ...followed,
    time: member,
    granularity: {
      check: (value) => typeof value === 'string' && GRANULARITY_NAMES.includes(value),
      mustBe: 'one of Cube’s granularities',
    },
    last: { check: isCount, mustBe: 'a whole number from 1' },
    lastPoint: { check: (value) => typeof value === 'boolean', mustBe: 'true or false' },
  }),
  icon: element({
    measure: requiredMember,
    ...followed,
    /** Compare the measure as a percentage of this one (design 21 C3). */
    of: member,
    rules: {
      check: listOf(isIconRule),
      mustBe: 'a list of rules, each a condition, a state and a label',
    },
  }),
  bulletGraph: element({
    measure: requiredMember,
    ...followed,
    target: { check: isTarget, mustBe: 'a fixed value or a measure' },
    ranges: {
      check: (value) =>
        Array.isArray(value) &&
        value.length <= 3 &&
        value.every(isNumber) &&
        value.every((one, at) => at === 0 || (value[at - 1] as number) < one),
      mustBe: 'up to 3 numbers, low to high',
    },
    min: { check: isNumber, mustBe: 'a number' },
    max: { check: isNumber, mustBe: 'a number' },
  }),
  marking: element({
    marking: name(true),
    show: { check: oneOf('count', 'summary'), mustBe: '"count" or "summary"' },
  }),
  /** A dashboard filter, by its id. */
  filterValue: element({ filter: name(true) }),
  asOf: element({ measure: requiredMember }),
  filterControl: element({ filter: name(true) }),
  /** A dashboard parameter, by its id (rule 137). */
  parameterControl: element({ parameter: name(true) }),
  actionButton: element({
    label: name(true),
    /** The Link/button tile's styles (rule 136). */
    style: { check: oneOf('button', 'primary', 'text'), mustBe: '"button", "primary" or "text"' },
    actions: {
      check: listOf(isAction),
      mustBe: 'a list of actions, each go to a page, apply a bookmark, reset filters or export',
    },
  }),
};

const MARKS: Readonly<Record<string, Readonly<Record<string, AttrSpec>>>> = {
  bold: {},
  italic: {},
  link: { href: { required: true, check: (value) => typeof value === 'string', mustBe: 'text' } },
};

/** "A paragraph", "An icon". */
const a = (word: string) => `${/^[aeiou]/i.test(word) ? 'An' : 'A'} ${word}`;

/** The problems with one node's or mark's attributes. */
function attrProblems(
  type: string,
  attrs: unknown,
  specs: Readonly<Record<string, AttrSpec>>,
): string[] {
  if (attrs === undefined) attrs = {};
  if (!isRecord(attrs)) return [`${a(type)}’s attributes must be an object.`];
  const problems: string[] = [];
  for (const [key, value] of Object.entries(attrs)) {
    const spec = specs[key];
    if (spec === undefined) problems.push(`${a(type)} has no attribute "${key}".`);
    else if (value !== undefined && !spec.check(value))
      problems.push(`${a(type)}’s "${key}" must be ${spec.mustBe}.`);
  }
  for (const [key, spec] of Object.entries(specs))
    if (spec.required === true && attrs[key] === undefined)
      problems.push(`${a(type)} needs its "${key}".`);
  return problems;
}

function markProblems(type: string, marks: unknown, allowed: readonly string[]): string[] {
  if (!Array.isArray(marks)) return [`${a(type)}’s marks must be a list.`];
  const problems: string[] = [];
  for (const mark of marks as unknown[]) {
    if (!isRecord(mark) || typeof mark.type !== 'string') {
      problems.push(`${a(type)} has a mark with no type.`);
      continue;
    }
    const specs = MARKS[mark.type];
    if (specs === undefined) {
      problems.push(`Unknown mark "${mark.type}".`);
      continue;
    }
    if (!allowed.includes(mark.type)) {
      problems.push(`${a(type)} can’t be ${mark.type === 'link' ? 'a link' : mark.type}.`);
      continue;
    }
    const fields = Object.keys(mark).filter((key) => key !== 'type' && key !== 'attrs');
    for (const key of fields) problems.push(`${a(mark.type)} has no field "${key}".`);
    const attrs = attrProblems(mark.type, mark.attrs, specs);
    problems.push(...attrs);
    if (attrs.length === 0 && mark.type === 'link') {
      const link = textLinkProblem((mark.attrs as { href: string }).href);
      if (link !== undefined) problems.push(link);
    }
  }
  return problems;
}

/**
 * Every node of the document in text order, each with its parent's type —
 * walked with a stack of our own rather than by recursion, so no depth of
 * nesting in a stored or posted document can overflow the call stack.
 */
function* walk(root: unknown): Generator<{ node: unknown; parent: string | undefined }> {
  const stack: { node: unknown; parent: string | undefined }[] = [
    { node: root, parent: undefined },
  ];
  while (stack.length > 0) {
    const next = stack.pop();
    if (next === undefined) break;
    yield next;
    const { node } = next;
    if (!isRecord(node) || typeof node.type !== 'string' || NODES[node.type] === undefined)
      continue;
    if (!Array.isArray(node.content)) continue;
    const children = node.content as unknown[];
    for (let at = children.length - 1; at >= 0; at -= 1)
      stack.push({ node: children[at], parent: node.type });
  }
}

/** The problems with one node itself, its children's places aside. */
function nodeProblems(node: unknown, parent: string | undefined): string[] {
  if (!isRecord(node) || typeof node.type !== 'string')
    return [`${parent === undefined ? 'The document' : a(parent)} holds a node with no type.`];
  const { type } = node;
  const spec = NODES[type];
  if (spec === undefined) return [`Unknown node "${type}".`];
  if (parent === undefined && type !== 'doc')
    return [`The document must start with "doc", not "${type}".`];
  if (parent !== undefined && !(NODES[parent]?.content ?? []).includes(type))
    return [`${a(parent)} can’t hold ${a(type).toLowerCase()}.`];

  const problems: string[] = [];
  const fields = ['type', 'attrs', 'content', 'marks', 'text'].filter(
    (field) =>
      field === 'type' ||
      (field === 'attrs' && type !== 'text') ||
      (field === 'content' && spec.content.length > 0) ||
      (field === 'marks' && spec.marks.length > 0) ||
      (field === 'text' && type === 'text'),
  );
  for (const key of Object.keys(node))
    if (!fields.includes(key)) problems.push(`${a(type)} has no field "${key}".`);

  if (type === 'text' && (typeof node.text !== 'string' || node.text === ''))
    problems.push('A text needs its "text".');
  if (node.content !== undefined && !Array.isArray(node.content))
    problems.push(`${a(type)}’s content must be a list.`);
  if (type !== 'text') problems.push(...attrProblems(type, node.attrs, spec.attrs));
  if (node.marks !== undefined && spec.marks.length > 0)
    problems.push(...markProblems(type, node.marks, spec.marks));
  return problems;
}

/**
 * What's wrong with a Text tile's document, each problem named, or none
 * (AC-513, AC-518). Takes anything — a posted body, a stored row — since
 * it's the check that makes it a document.
 */
export function textDocumentProblems(input: unknown): readonly string[] {
  if (!isRecord(input) || !('version' in input) || !('doc' in input))
    return ['A Text document must be an object with its version and doc.'];
  if (input.version !== TEXT_DOCUMENT_VERSION)
    return [`Unknown Text document version ${String(input.version)}.`];
  const problems: string[] = [];
  for (const key of Object.keys(input))
    if (key !== 'version' && key !== 'doc') problems.push(`A Text document has no field "${key}".`);
  let elements = 0;
  for (const { node, parent } of walk(input.doc)) {
    problems.push(...nodeProblems(node, parent));
    if (isRecord(node) && ELEMENT_KINDS.includes(node.type as ElementKind)) elements += 1;
  }
  if (elements > TEXT_ELEMENT_LIMIT)
    problems.push(
      `The text holds ${String(elements)} elements; a Text tile holds at most ${String(TEXT_ELEMENT_LIMIT)}.`,
    );
  return problems;
}

/**
 * The document's elements — live elements, controls and buttons — in text
 * order, wherever they sit: what counts toward the 10 (AC-518).
 */
export function elementsOf(document: TextDocument): TextNode[] {
  const found: TextNode[] = [];
  for (const { node } of walk(document.doc))
    if (isRecord(node) && ELEMENT_KINDS.includes(node.type as ElementKind))
      found.push(node as unknown as TextNode);
  return found;
}
