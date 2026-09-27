import type { ReactNode } from 'react';

import { firstTokenIn, textPartsOf, type TextToken } from '@wechart/core';

/**
 * A markdown tile's text (AC-208, direction.md §8's Markdown tile): headings,
 * emphasis, lists and line breaks — the prototype's subset — rendered as React
 * elements and nothing else.
 *
 * **Never as HTML.** The text is split into elements here and every run of
 * characters is a React text node, which React escapes; nothing reaches
 * `innerHTML`. So a tag typed into a tile is shown as the text it is — AC-208's
 * "no raw HTML" holds by construction, with no sanitiser to get wrong.
 *
 * Headings sit at the tiles' level of the page's outline and below: the
 * dashboard is h1 and a section h2, so the tile's shallowest heading is h3
 * and each deeper one of its own a level down, to h6 — ranked among the
 * tile's own levels, so none is skipped (T247's review). Each is drawn at the
 * size its own marks ask for, as `data-level`.
 */
export function Markdown({
  text,
  tokens,
}: {
  readonly text: string;
  /**
   * Draws a live value where the text has a token (T389, AC-116): a
   * dashboard's markings and measures. Without it the text is only text.
   */
  readonly tokens?: TokenRender | undefined;
}) {
  return <div className="markdown">{blocksOf(text, tokens)}</div>;
}

/** A token's live value, drawn in place of its `{{…}}`. */
export type TokenRender = (token: TextToken, key: string) => ReactNode;

const HEADING = /^(#{1,6})\s+(.*)$/;
const BULLET = /^[-*]\s+(.*)$/;
const NUMBERED = /^(\d+)[.)]\s+(.*)$/;
const HEADINGS = ['h3', 'h4', 'h5', 'h6'] as const;

function linesOf(text: string): string[] {
  return text.replace(/\r\n?/g, '\n').split('\n');
}

/**
 * A line as the tile reads it, with its block and inline marks taken off by
 * the very rules that draw it — "## Notes" is "Notes", "- **Count**" is
 * "Count" — for naming the tile (AC-209, T247's review): an unpaired mark,
 * which the tile shows, is kept.
 */
export function readingOfLine(line: string): string {
  const block = HEADING.exec(line) ?? BULLET.exec(line) ?? NUMBERED.exec(line);
  const content = block === null ? line : (block[block.length - 1] ?? '');
  return plainOf(content).trim();
}

/** The first line of a tile's text that reads as anything, or '' for none. */
export function firstReadingOf(text: string): string {
  for (const line of linesOf(text)) {
    const read = readingOfLine(line);
    if (read !== '') return read;
  }
  return '';
}

function blocksOf(text: string, tokens?: TokenRender): ReactNode[] {
  const inline = (run: string, key: string) => inlineOf(run, key, tokens);
  const lines = linesOf(text);
  // The tile's own heading levels, shallowest first: each heading's rank
  // among them is its place in the outline, from h3.
  const ranks = [
    ...new Set(
      lines.flatMap((line) => {
        const heading = HEADING.exec(line);
        return heading === null ? [] : [(heading[1] ?? '#').length];
      }),
    ),
  ].sort((a, b) => a - b);
  const blocks: ReactNode[] = [];
  let paragraph: string[] = [];
  let list: { ordered: boolean; start: number; items: string[] } | null = null;

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    // Parsed whole, its line breaks as <br>, so emphasis may span one
    // (T221's review).
    blocks.push(<p key={blocks.length}>{inline(paragraph.join('\n'), 'p')}</p>);
    paragraph = [];
  };
  const flushList = () => {
    if (list === null) return;
    const items = list.items.map((item, index) => (
      <li key={index}>{inline(item, `${String(index)}`)}</li>
    ));
    blocks.push(
      list.ordered ? (
        // Numbered from its first item, not always from 1 (T221's review).
        <ol key={blocks.length} {...(list.start === 1 ? {} : { start: list.start })}>
          {items}
        </ol>
      ) : (
        <ul key={blocks.length}>{items}</ul>
      ),
    );
    list = null;
  };

  for (const line of lines) {
    if (line.trim() === '') {
      flushParagraph();
      flushList();
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading !== null) {
      flushParagraph();
      flushList();
      const marks = (heading[1] ?? '#').length;
      const Heading = HEADINGS[Math.min(ranks.indexOf(marks), HEADINGS.length - 1)] ?? 'h3';
      // Drawn at the size its own marks ask for (T247, the prototype's .md h2
      // for "##"), whatever level it takes in the page's outline.
      blocks.push(
        <Heading key={blocks.length} data-level={marks}>
          {inline(heading[2] ?? '', 'h')}
        </Heading>,
      );
      continue;
    }
    const bullet = BULLET.exec(line);
    const numbered = bullet === null ? NUMBERED.exec(line) : null;
    const item = bullet ?? numbered;
    if (item !== null) {
      flushParagraph();
      const ordered = numbered !== null;
      if (list !== null && list.ordered !== ordered) flushList();
      list ??= { ordered, start: ordered ? Number(numbered?.[1] ?? '1') : 1, items: [] };
      list.items.push((ordered ? numbered?.[2] : bullet?.[1]) ?? '');
      continue;
    }
    flushList();
    paragraph.push(line);
  }
  flushParagraph();
  flushList();
  return blocks;
}

/**
 * The inline marks, earliest first in the text and, where two start at one
 * place, in this order: `***bold italic***`, `**strong**`, `*em*`, `_em_` and
 * `` `code` ``. Emphasis is parsed again inside, so `**a *b* c**` nests
 * (T221's review). A marker with no partner is left as text, so "2 * 3" stays
 * arithmetic; an underscore inside a word is a character, so a member's name
 * such as `order_line_items` keeps its underscores.
 */
const MARKS: readonly {
  readonly pattern: RegExp;
  readonly kind: 'both' | 'strong' | 'em' | 'code';
}[] = [
  { pattern: /\*\*\*(?=\S)([\s\S]+?)(?<=\S)\*\*\*/, kind: 'both' },
  { pattern: /\*\*(?=\S)([\s\S]+?)(?<=\S)\*\*/, kind: 'strong' },
  { pattern: /(?<!\*)\*(?=[^\s*])([\s\S]+?)(?<=[^\s*])\*(?!\*)/, kind: 'em' },
  { pattern: /(?<![\w_])_(?=\S)([\s\S]+?)(?<=\S)_(?![\w_])/, kind: 'em' },
  { pattern: /`([^`]+)`/, kind: 'code' },
];

function inlineOf(text: string, key: string, tokens?: TokenRender): ReactNode[] {
  const inline = (run: string, at: string) => inlineOf(run, at, tokens);
  const withBreaks = (run: string, at: string) => withBreaksOf(run, at, tokens);
  let earliest: { match: RegExpExecArray; kind: (typeof MARKS)[number]['kind'] } | undefined;
  for (const { pattern, kind } of MARKS) {
    const match = pattern.exec(text);
    if (match !== null && (earliest === undefined || match.index < earliest.match.index))
      earliest = { match, kind };
  }
  /**
   * A token is whole, whatever marks its words hold: one before the first
   * mark is drawn first, so a `*` in a marking's name never splits it into
   * text (T389's review). A mark before it — code, or emphasis around it —
   * is drawn first, and a code span keeps its braces.
   */
  const token = tokens === undefined ? undefined : firstTokenIn(text);
  if (token !== undefined && (earliest === undefined || token.index < earliest.match.index)) {
    const end = token.index + token.length;
    return [
      ...inline(text.slice(0, token.index), `${key}b`),
      ...withBreaks(text.slice(token.index, end), `${key}t`),
      ...inline(text.slice(end), `${key}a`),
    ];
  }
  if (earliest === undefined) return withBreaks(text, key);

  const { match, kind } = earliest;
  const inner = match[1] ?? '';
  const id = `${key}-${String(match.index)}`;
  const marked =
    kind === 'code' ? (
      <code key={id}>{inner}</code>
    ) : kind === 'both' ? (
      <strong key={id}>
        <em>{inline(inner, `${id}i`)}</em>
      </strong>
    ) : kind === 'strong' ? (
      <strong key={id}>{inline(inner, `${id}i`)}</strong>
    ) : (
      <em key={id}>{inline(inner, `${id}i`)}</em>
    );
  return [
    ...withBreaks(text.slice(0, match.index), `${key}b`),
    marked,
    ...inline(text.slice(match.index + match[0].length), `${key}a`),
  ];
}

/** The text `inline` would draw, as plain text: each paired mark taken off. */
function plainOf(text: string): string {
  let earliest: RegExpExecArray | undefined;
  for (const { pattern } of MARKS) {
    const match = pattern.exec(text);
    if (match !== null && (earliest === undefined || match.index < earliest.index))
      earliest = match;
  }
  if (earliest === undefined) return text;
  return (
    text.slice(0, earliest.index) +
    plainOf(earliest[1] ?? '') +
    plainOf(text.slice(earliest.index + earliest[0].length))
  );
}

/**
 * Text as it is, a line break within it as <br>, and each token as its live
 * value where there is a way to draw one. Tokens are read here, in the runs
 * the inline marks leave, so a code span keeps its braces as text.
 */
function withBreaksOf(text: string, key: string, tokens?: TokenRender): ReactNode[] {
  if (text === '') return [];
  return text
    .split('\n')
    .flatMap((line, index) => {
      const parts: ReactNode[] =
        tokens === undefined
          ? [line]
          : textPartsOf(line).map((part, at) =>
              typeof part === 'string'
                ? part
                : tokens(part, `${key}-${String(index)}-t${String(at)}`),
            );
      return index === 0 ? parts : [<br key={`${key}-br${String(index)}`} />, ...parts];
    })
    .filter((part) => part !== '');
}
