/**
 * A markdown tile's text as a Text tile's document (T869, AC-512, AC-116;
 * design 21 state I; rule 127).
 *
 * The Text tile replaces the markdown tile in place: each markdown tile is
 * read into a document once, and what its readers saw they see still. So
 * this reads exactly the subset the markdown tile drew
 * (`packages/web/src/tiles/Markdown.tsx`, AC-208), by the same rules, plus
 * links, which the Text tile has:
 *
 * - `#`, `##` and `###` are Heading large, medium and small, as AC-516 types
 *   them; a deeper heading is the smallest there is;
 * - `-` or `*`, and `1.` or `1)`, are bulleted and numbered lists, numbered
 *   from the first item;
 * - a blank line ends a paragraph, and a single newline is a line break;
 * - `***…***`, `**…**`, `*…*` and `_…_` are bold and italic, nesting, an
 *   unpaired marker left as text and an underscore inside a word a
 *   character;
 * - `[text](address)` is a link where the address is one a Text tile may
 *   link to (AC-513), and its literal text where it isn't;
 * - each `{{…}}` token is the element it names (AC-116), kept whole whatever
 *   marks its words hold.
 *
 * **Everything else is the literal text it was** (AC-512): an HTML tag is
 * text, never markup, and a code span — not among the Text tile's marks —
 * keeps its backticks, and any braces inside them stay braces.
 *
 * wechart's own conversion, not `@tiptap/markdown`, which is beta with open
 * round-trip defects (research `rich-tiles-and-combo-tech.md`, Gotchas).
 */
import {
  TEXT_DOCUMENT_VERSION,
  textLinkProblem,
  type TextDocument,
  type TextMark,
  type TextNode,
} from './text-document';
import { elementOfToken, firstTokenIn, textPartsOf } from './text-tokens';

const HEADING = /^(#{1,6})\s+(.*)$/;
const BULLET = /^[-*]\s+(.*)$/;
/** Up to nine digits, so a list's start is always a whole number the schema holds. */
const NUMBERED = /^(\d{1,9})[.)]\s+(.*)$/;

type Kind = 'both' | 'strong' | 'em' | 'code' | 'link';

/**
 * The inline marks, earliest first in the text and, where two start at one
 * place, in this order — the markdown tile's, then links.
 */
const MARKS: readonly { readonly pattern: RegExp; readonly kind: Kind }[] = [
  { pattern: /\*\*\*(?=\S)([\s\S]+?)(?<=\S)\*\*\*/, kind: 'both' },
  { pattern: /\*\*(?=\S)([\s\S]+?)(?<=\S)\*\*/, kind: 'strong' },
  { pattern: /(?<!\*)\*(?=[^\s*])([\s\S]+?)(?<=[^\s*])\*(?!\*)/, kind: 'em' },
  { pattern: /(?<![\w_])_(?=\S)([\s\S]+?)(?<=\S)_(?![\w_])/, kind: 'em' },
  { pattern: /`([^`]+)`/, kind: 'code' },
  // No brace in the address, so a token there is a live value, as the tile
  // drew it, never text inside an href (T869's review).
  { pattern: /\[([^[\]]+)\]\(([^(){}\s]+)\)/, kind: 'link' },
];

/** Marks in one order, so equal runs compare equal: bold, italic, link. */
const MARK_ORDER = ['bold', 'italic', 'link'];
function withMark(marks: readonly TextMark[], mark: TextMark): TextMark[] {
  if (marks.some((one) => one.type === mark.type)) return [...marks];
  return [...marks, mark].sort((a, b) => MARK_ORDER.indexOf(a.type) - MARK_ORDER.indexOf(b.type));
}

/**
 * With escapes (markdown T870 wrote, given through MCP: AC-527), a backslash
 * before ASCII punctuation is that character as text, so a typed `**` or
 * `{{` reads back as typed. A markdown tile had no escapes, so its
 * backslashes are read as the text they were (AC-512, T869's review).
 *
 * While the marks are read, each escaped character stands in for itself as
 * one of Unicode's 32 noncharacters U+FDD0…U+FDEF, one per ASCII punctuation
 * character, which no pattern here matches; it's shown again in the text it
 * ends up in. Noncharacters aren't for interchange, so any already in the
 * text are read as U+FFFD first and never mistaken for a stand-in.
 */
const PUNCTUATION = '!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~';
const STAND_IN = 0xfdd0;
const ESCAPED = /\\([!-/:-@[-`{-~])/g;
const NONCHARACTER = /[﷐-﷯]/g;
const cleaned = (text: string) => text.replace(NONCHARACTER, '�');
const hidden = (text: string) =>
  text.replace(ESCAPED, (_, one: string) =>
    String.fromCharCode(STAND_IN + PUNCTUATION.indexOf(one)),
  );
const shown = (text: string) =>
  text.replace(NONCHARACTER, (one) => PUNCTUATION[one.charCodeAt(0) - STAND_IN] ?? one);

const textNode = (text: string, marks: readonly TextMark[]): TextNode => ({
  type: 'text',
  text: shown(text),
  ...(marks.length === 0 ? {} : { marks: [...marks] }),
});

/** Text with its line breaks, and any token in it as its element. */
function plainRun(text: string, marks: readonly TextMark[]): TextNode[] {
  const nodes: TextNode[] = [];
  text.split('\n').forEach((line, index) => {
    if (index > 0) nodes.push({ type: 'hardBreak' });
    for (const part of textPartsOf(line))
      if (typeof part === 'string') nodes.push(textNode(part, marks));
      else nodes.push(asElement(part, marks));
  });
  return nodes;
}

/** A token's element, carrying the emphasis around it; never a link (the schema's rule). */
function asElement(token: Parameters<typeof elementOfToken>[0], marks: readonly TextMark[]) {
  const kept = marks.filter((mark) => mark.type !== 'link');
  const read = elementOfToken(token);
  const element: TextNode = {
    ...read,
    attrs: Object.fromEntries(
      Object.entries(read.attrs ?? {}).map(([key, value]) => [
        key,
        typeof value === 'string' ? shown(value) : value,
      ]),
    ),
  };
  return kept.length === 0 ? element : { ...element, marks: kept };
}

/** Text as it is, a line break as a hard break, no token read: a code span's. */
function literalRun(text: string, marks: readonly TextMark[]): TextNode[] {
  const nodes: TextNode[] = [];
  text.split('\n').forEach((line, index) => {
    if (index > 0) nodes.push({ type: 'hardBreak' });
    if (line !== '') nodes.push(textNode(line, marks));
  });
  return nodes;
}

function inlineOf(text: string, marks: readonly TextMark[]): TextNode[] {
  if (text === '') return [];
  let earliest: { match: RegExpExecArray; kind: Kind } | undefined;
  for (const { pattern, kind } of MARKS) {
    const match = pattern.exec(text);
    if (match !== null && (earliest === undefined || match.index < earliest.match.index))
      earliest = { match, kind };
  }
  // A token before the first mark is read first, so a `*` in a marking's
  // name never splits it (T389's review); one inside a mark is read there.
  const token = firstTokenIn(text);
  if (token !== undefined && (earliest === undefined || token.index < earliest.match.index)) {
    const end = token.index + token.length;
    return [
      ...inlineOf(text.slice(0, token.index), marks),
      ...plainRun(text.slice(token.index, end), marks),
      ...inlineOf(text.slice(end), marks),
    ];
  }
  if (earliest === undefined) return plainRun(text, marks);

  const { match, kind } = earliest;
  const inner = match[1] ?? '';
  let marked: TextNode[];
  if (kind === 'code') marked = literalRun(match[0], marks);
  else if (kind === 'link') {
    const href = shown(match[2] ?? '');
    // A refused address leaves its brackets as text, and its words read as
    // the tile drew them, emphasis and tokens too (T869's review).
    marked =
      textLinkProblem(href) === undefined
        ? inlineOf(inner, withMark(marks, { type: 'link', attrs: { href } }))
        : [
            textNode('[', marks),
            ...inlineOf(inner, marks),
            textNode(`](${match[2] ?? ''})`, marks),
          ];
  } else {
    const added: TextMark[] =
      kind === 'both'
        ? [{ type: 'bold' }, { type: 'italic' }]
        : [{ type: kind === 'strong' ? 'bold' : 'italic' }];
    marked = inlineOf(inner, added.reduce(withMark, [...marks]));
  }
  return [
    ...plainRun(text.slice(0, match.index), marks),
    ...marked,
    ...inlineOf(text.slice(match.index + match[0].length), marks),
  ];
}

const sameMarks = (a: TextNode, b: TextNode) =>
  JSON.stringify(a.marks ?? []) === JSON.stringify(b.marks ?? []);

/** Adjacent runs of text under the same marks as one, as ProseMirror keeps them. */
function joined(nodes: readonly TextNode[]): TextNode[] {
  const out: TextNode[] = [];
  for (const node of nodes) {
    if (node.type === 'text' && node.text === '') continue;
    const last = out[out.length - 1];
    if (last?.type === 'text' && node.type === 'text' && sameMarks(last, node))
      out[out.length - 1] = { ...last, text: `${last.text ?? ''}${node.text ?? ''}` };
    else out.push(node);
  }
  return out;
}

const withContent = (node: TextNode, content: readonly TextNode[]): TextNode =>
  content.length === 0 ? node : { ...node, content: [...content] };

/**
 * A markdown tile's text as a Text tile's document, read as that tile drew it
 * (AC-512); with `escapes`, markdown as T870 writes it (AC-527).
 */
export function textDocumentFromMarkdown(
  markdown: string,
  { escapes = false }: { readonly escapes?: boolean } = {},
): TextDocument {
  const inline = (text: string) =>
    joined(inlineOf(escapes ? hidden(cleaned(text)) : cleaned(text), []));
  const blocks: TextNode[] = [];
  let paragraph: string[] = [];
  let list: { ordered: boolean; start: number; items: string[] } | null = null;

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    // Read whole, its newlines as breaks, so emphasis may span one (T221's review).
    blocks.push(withContent({ type: 'paragraph' }, inline(paragraph.join('\n'))));
    paragraph = [];
  };
  const flushList = () => {
    if (list === null) return;
    const items = list.items.map((item): TextNode => ({
      type: 'listItem',
      content: [withContent({ type: 'paragraph' }, inline(item))],
    }));
    blocks.push(
      list.ordered
        ? {
            type: 'orderedList',
            ...(list.start === 1 ? {} : { attrs: { start: list.start } }),
            content: items,
          }
        : { type: 'bulletList', content: items },
    );
    list = null;
  };

  for (const line of markdown.replace(/\r\n?/g, '\n').split('\n')) {
    if (line.trim() === '') {
      flushParagraph();
      flushList();
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading !== null) {
      flushParagraph();
      flushList();
      const level = Math.min((heading[1] ?? '#').length, 3);
      blocks.push(withContent({ type: 'heading', attrs: { level } }, inline(heading[2] ?? '')));
      continue;
    }
    const bullet = BULLET.exec(line);
    const numbered = bullet === null ? NUMBERED.exec(line) : null;
    if (bullet !== null || numbered !== null) {
      flushParagraph();
      const ordered = numbered !== null;
      if (list !== null && list.ordered !== ordered) flushList();
      // Numbered from its first item, not always from 1 (T221's review).
      list ??= { ordered, start: ordered ? Number(numbered?.[1] ?? '1') : 1, items: [] };
      list.items.push((ordered ? numbered?.[2] : bullet?.[1]) ?? '');
      continue;
    }
    flushList();
    paragraph.push(line);
  }
  flushParagraph();
  flushList();
  return { version: TEXT_DOCUMENT_VERSION, doc: { type: 'doc', content: blocks } };
}
