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

/** An element's token: its kind and its source. */
function tokenOf(node: TextNode): string {
  const attrs = node.attrs ?? {};
  const said = (key: string) => {
    const value = attrs[key];
    return typeof value === 'string' ? value : '';
  };
  switch (node.type) {
    case 'value':
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

function leafOf(node: TextNode): string {
  if (node.type === 'text') return escaped(node.text ?? '');
  if (node.type === 'hardBreak') return '\n';
  return tokenOf(node);
}

/** Bold outermost, then italic, then a link: the order T869 reads them. */
const LEVELS = ['bold', 'italic', 'link'] as const;

const markAt = (node: TextNode, level: (typeof LEVELS)[number]): TextMark | undefined =>
  node.marks?.find((mark) => mark.type === level);
const keyAt = (node: TextNode, level: (typeof LEVELS)[number]) => {
  const mark = markAt(node, level);
  if (mark === undefined) return '';
  return level === 'link' ? `link:${String(mark.attrs?.href)}` : level;
};

/**
 * An href as a markdown link holds it: parentheses and whitespace, which
 * would end it, percent-encoded as the same address.
 */
const hrefOf = (href: string) =>
  href.replace(
    /[()\s]/g,
    (one) => `%${one.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`,
  );

/** Runs grouped by one mark at a time, each run's own spaces kept outside its markers. */
function inlineAt(nodes: readonly TextNode[], depth: number): string {
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
    const inner = inlineAt(nodes.slice(at, end), depth + 1);
    if (key === '') out += inner;
    else {
      const [, lead = '', core = '', trail = ''] = /^(\s*)([\s\S]*?)(\s*)$/.exec(inner) ?? [];
      if (core === '') out += inner;
      else if (level === 'link')
        out += `${lead}[${core}](${hrefOf(String(markAt(first, 'link')?.attrs?.href ?? ''))})${trail}`;
      else {
        const marker = level === 'bold' ? '**' : '*';
        out += `${lead}${marker}${core}${marker}${trail}`;
      }
    }
    at = end;
  }
  return out;
}

function inlineOf(nodes: readonly TextNode[] | undefined): string {
  return inlineAt(nodes ?? [], 0)
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
    default:
      // A paragraph, and a Large value, which has no markdown form of its own.
      return inlineOf(node.content);
  }
}

/** A Text tile's document as markdown, each element as its token (AC-527). */
export function textDocumentToMarkdown(document: TextDocument): string {
  return (document.doc.content ?? []).map(blockOf).join('\n\n');
}
