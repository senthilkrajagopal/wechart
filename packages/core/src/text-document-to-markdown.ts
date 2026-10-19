/**
 * A Text tile's document written as markdown (T870, AC-527; design 21 state
 * I: "Text exported for MCP and AC-443 keeps the markdown form, elements as
 * their tokens").
 *
 * The markdown is the subset T869 reads (`text-document-from-markdown.ts`):
 * `#`, `##` and `###` headings, `**bold**`, `*italic*`, `[links](…)`, `-` and
 * `1.` lists, a newline for a line break and a blank line between blocks.
 * Each element is a `{{…}}` token naming its kind and its source:
 *
 * - `{{measure:orders.revenue}}`, with ` | marking:‹name›` when limited by a
 *   marking, and `{{marking:‹name›.count}}` or `.summary`: the markdown
 *   tile's own tokens (AC-116), which read back as the same elements;
 * - `{{change:orders.revenue | vs:previous_period}}`, `{{sparkline:…}}`,
 *   `{{icon:…}}`, `{{bullet-graph:…}}` and `{{as-of:…}}` by their measure;
 * - `{{filter-value:‹filter›}}` and `{{filter-control:‹filter›}}` by the
 *   dashboard filter's id, `{{parameter-control:‹parameter›}}` by the
 *   parameter's, and `{{button:‹label›}}` by its label.
 *
 * Their other settings have no markdown form. Text that would read as
 * markdown is escaped with a backslash, which T869 takes off again, so a
 * typed `**` or `{{…}}` reads back as typed.
 */
import type { TextDocument, TextMark, TextNode } from './text-document';

/**
 * A token's words — a label, a filter's or a parameter's id, a marking's
 * name — with every character that could end the token or read as markdown
 * escaped (checkpoint 3: a `}` in a Button's label broke its token). T869
 * reads a backslash before punctuation as that character, inside a token as
 * elsewhere. A member's name is written as it is: it holds none of them.
 */
const tokenWords = (words: string) => words.replace(/[\\{}|*_`[\]]/g, '\\$&');

/** An element's token: its kind and its source. */
function tokenOf(node: TextNode): string {
  const attrs = node.attrs ?? {};
  const said = (key: string) => {
    const value = attrs[key];
    if (typeof value !== 'string') return '';
    return key === 'measure' ? value : tokenWords(value);
  };
  switch (node.type) {
    case 'value':
      // A Value of a dashboard parameter (T898, AC-533), by the parameter's id.
      if (attrs.parameter !== undefined)
        return attrs.marking === undefined
          ? `{{measure-parameter:${said('parameter')}}}`
          : `{{measure-parameter:${said('parameter')} | marking:${said('marking')}}}`;
      return attrs.marking === undefined
        ? `{{measure:${said('measure')}}}`
        : `{{measure:${said('measure')} | marking:${said('marking')}}}`;
    case 'marking':
      return `{{marking:${said('marking')}.${attrs.show === 'summary' ? 'summary' : 'count'}}}`;
    case 'change':
      return `{{change:${said('measure')} | vs:previous_period}}`;
    case 'sparkline':
      return `{{sparkline:${said('measure')}}}`;
    case 'icon':
      return `{{icon:${said('measure')}}}`;
    case 'bulletGraph':
      return `{{bullet-graph:${said('measure')}}}`;
    case 'asOf':
      return `{{as-of:${said('measure')}}}`;
    case 'filterValue':
      return `{{filter-value:${said('filter')}}}`;
    case 'filterControl':
      return `{{filter-control:${said('filter')}}}`;
    case 'parameterControl':
      return `{{parameter-control:${said('parameter')}}}`;
    case 'actionButton':
      return `{{button:${said('label')}}}`;
    default:
      return '';
  }
}

/**
 * Text escaped where T869 would read it as markdown: a backslash, `*`, a
 * backtick, a bracket, the first brace of `{{`, and an underscore unless it
 * sits inside a word (as in `order_line_items`, which reads as it is).
 */
function escaped(text: string): string {
  return text
    .replace(/[\\*`[\]]/g, '\\$&')
    .replace(/\{(?=\{)/g, '\\{')
    .replace(/_/g, (underscore, at: number, whole: string) =>
      /[A-Za-z0-9]/.test(whole[at - 1] ?? '') && /[A-Za-z0-9]/.test(whole[at + 1] ?? '')
        ? underscore
        : '\\_',
    );
}

/** A line escaped where it would start a heading or a list. */
function lineEscaped(line: string): string {
  if (/^#{1,6}\s/.test(line)) return `\\${line}`;
  if (/^[-+]\s/.test(line)) return `\\${line}`;
  return line.replace(/^(\d{1,9})([.)])(?=\s)/, '$1\\$2');
}

/**
 * A line break as markdown's own: a backslash ending the line, which T869
 * reads (exported) as a break within the block, so a break in a heading or a
 * list item, or two in a row, keeps the block's shape (T870's review).
 */
const BREAK = '\\\n';

function leafOf(node: TextNode): string {
  if (node.type === 'text') return escaped(node.text ?? '');
  if (node.type === 'hardBreak') return BREAK;
  return tokenOf(node);
}

/** The character a node starts or ends with, as written: for choosing italic's marker. */
function edgeOf(node: TextNode | undefined, end: 'first' | 'last'): string {
  if (node === undefined) return '';
  if (node.type !== 'text') return node.type === 'hardBreak' ? '\n' : '{';
  const text = node.text ?? '';
  return (end === 'first' ? text[0] : text[text.length - 1]) ?? '';
}

/** Bold outermost, then italic, then a link: the order T869 reads them. */
const LEVELS = ['bold', 'italic', 'link'] as const;

const markAt = (node: TextNode, level: (typeof LEVELS)[number]): TextMark | undefined =>
  node.marks?.find((mark) => mark.type === level);
/** A line break is never inside a marker pair: each side of it is marked apart. */
const keyAt = (node: TextNode, level: (typeof LEVELS)[number]) => {
  const mark = node.type === 'hardBreak' ? undefined : markAt(node, level);
  if (mark === undefined) return '';
  return level === 'link' ? `link:${String(mark.attrs?.href)}` : level;
};

/**
 * An href as a markdown link holds it: whatever would end it, mark it, or
 * read as an escape — whitespace, parentheses, brackets, braces, a
 * backslash, a star, a backtick, angle brackets — percent-encoded, the same
 * address (T870's review).
 */
const hrefOf = (href: string) =>
  href.replace(
    /[\s()[\]{}\\*`<>]/g,
    (one) => `%${one.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`,
  );

const WORDY = /[A-Za-z0-9]/;

/**
 * Runs grouped by one mark at a time, each run's own spaces kept outside its
 * markers. `before` and `after` are the characters just outside the nodes.
 *
 * Italic is `_…_`, which can sit against bold's `**` on either side and
 * still read back (T870's review: `**a *b***` closed bold early); `*…*` only
 * inside a word, where `_` would read as text.
 */
function inlineAt(nodes: readonly TextNode[], depth: number, before = '', after = ''): string {
  const level = LEVELS[depth];
  if (level === undefined) return nodes.map(leafOf).join('');
  let out = '';
  let at = 0;
  while (at < nodes.length) {
    const first = nodes[at];
    if (first === undefined) break;
    const key = keyAt(first, level);
    let end = at + 1;
    while (end < nodes.length && keyAt(nodes[end] as TextNode, level) === key) end += 1;
    // A neighbour marked at this level is written inside its own markers.
    const neighbour = (node: TextNode | undefined, edge: 'first' | 'last') =>
      node !== undefined && keyAt(node, level) !== '' ? '*' : edgeOf(node, edge);
    const prior = at === 0 ? before : neighbour(nodes[at - 1], 'last');
    const next = end === nodes.length ? after : neighbour(nodes[end], 'first');
    const slice = nodes.slice(at, end);
    if (key === '') out += inlineAt(slice, depth + 1, prior, next);
    else {
      const inner = inlineAt(slice, depth + 1, '*', '*');
      const [, lead = '', core = '', trail = ''] = /^(\s*)([\s\S]*?)(\s*)$/.exec(inner) ?? [];
      if (core === '') out += inner;
      else if (level === 'link')
        out += `${lead}[${core}](${hrefOf(String(markAt(first, 'link')?.attrs?.href ?? ''))})${trail}`;
      else {
        const inWord = (lead === '' && WORDY.test(prior)) || (trail === '' && WORDY.test(next));
        const marker = level === 'bold' ? '**' : inWord ? '*' : '_';
        out += `${lead}${marker}${core}${marker}${trail}`;
      }
    }
    at = end;
  }
  return out;
}

const sameMarks = (a: TextNode, b: TextNode) =>
  JSON.stringify(a.marks ?? []) === JSON.stringify(b.marks ?? []);

/**
 * Adjacent text under the same marks as one run, so it's escaped as one: a
 * `{` and a `{measure:…}}` in two nodes never write a token (T870's review).
 * A line break ending the block has no markdown form, and is left out.
 */
function runsOf(nodes: readonly TextNode[]): TextNode[] {
  const out: TextNode[] = [];
  for (const node of nodes) {
    const last = out[out.length - 1];
    if (last?.type === 'text' && node.type === 'text' && sameMarks(last, node))
      out[out.length - 1] = { ...last, text: `${last.text ?? ''}${node.text ?? ''}` };
    else out.push(node);
  }
  while (out[out.length - 1]?.type === 'hardBreak') out.pop();
  return out;
}

function inlineOf(nodes: readonly TextNode[] | undefined): string {
  return inlineAt(runsOf(nodes ?? []), 0)
    .split('\n')
    .map(lineEscaped)
    .join('\n');
}

const indented = (text: string) =>
  text
    .split('\n')
    .map((line) => (line === '' ? line : `  ${line}`))
    .join('\n');

function listItemOf(item: TextNode, marker: string): string {
  const [first, ...rest] = item.content ?? [];
  const head = first?.type === 'paragraph' ? inlineOf(first.content) : '';
  const others = (first?.type === 'paragraph' ? rest : (item.content ?? []))
    .map(blockOf)
    .map(indented);
  return [`${marker} ${head}`, ...others].join('\n');
}

function blockOf(node: TextNode): string {
  switch (node.type) {
    case 'heading': {
      const level = node.attrs?.level;
      const marks = level === 1 ? '#' : level === 2 ? '##' : '###';
      return `${marks} ${inlineOf(node.content)}`;
    }
    case 'bulletList':
      return (node.content ?? []).map((item) => listItemOf(item, '-')).join('\n');
    case 'orderedList': {
      const start = typeof node.attrs?.start === 'number' ? node.attrs.start : 1;
      return (node.content ?? [])
        .map((item, index) => listItemOf(item, `${String(start + index)}.`))
        .join('\n');
    }
    case 'largeValue':
      // `####`, which exported markdown reads back as a Large value; its own
      // headings stop at `###` (checkpoint 3: a Large value written as a
      // paragraph was demoted by every MCP write).
      return `#### ${inlineOf(node.content)}`;
    default:
      return inlineOf(node.content);
  }
}

/** A Text tile's document as markdown, each element as its token (AC-527). */
export function textDocumentToMarkdown(document: TextDocument): string {
  return (document.doc.content ?? []).map(blockOf).join('\n\n');
}
