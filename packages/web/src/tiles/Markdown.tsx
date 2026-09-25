import type { ReactNode } from 'react';

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
 * Headings sit below the tile's own level: the dashboard is h1, a section h2
 * and a tile's title h3, so `#` and `##` are h3 and anything deeper h4.
 */
export function Markdown({ text }: { readonly text: string }) {
  return <div className="markdown">{blocksOf(text)}</div>;
}

const HEADING = /^(#{1,6})\s+(.*)$/;
const BULLET = /^[-*]\s+(.*)$/;
const NUMBERED = /^(\d+)[.)]\s+(.*)$/;

function blocksOf(text: string): ReactNode[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
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
      const level = marks <= 2 ? 3 : 4;
      const content = inline(heading[2] ?? '', 'h');
      // Drawn at the size its own marks ask for (T247, the prototype's .md h2
      // for "##"), whatever level it takes in the page's outline.
      blocks.push(
        level === 3 ? (
          <h3 key={blocks.length} data-level={marks}>
            {content}
          </h3>
        ) : (
          <h4 key={blocks.length} data-level={marks}>
            {content}
          </h4>
        ),
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

function inline(text: string, key: string): ReactNode[] {
  let earliest: { match: RegExpExecArray; kind: (typeof MARKS)[number]['kind'] } | undefined;
  for (const { pattern, kind } of MARKS) {
    const match = pattern.exec(text);
    if (match !== null && (earliest === undefined || match.index < earliest.match.index))
      earliest = { match, kind };
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

/** Text as it is, a line break within it as <br>. */
function withBreaks(text: string, key: string): ReactNode[] {
  if (text === '') return [];
  return text
    .split('\n')
    .flatMap((part, index) =>
      index === 0 ? [part] : [<br key={`${key}-br${String(index)}`} />, part],
    )
    .filter((part) => part !== '');
}
