import type { JSONNodeType, NodeProps } from '@tiptap/static-renderer/json/react';
import { createContext, useContext, type ReactNode } from 'react';

import { ELEMENT_KINDS, type ElementKind, type TextMark, type TextNode } from '@wechart/core';

import { SafeLink } from './SafeLink';

/**
 * How a Text tile's stored tree becomes React elements in view mode (T873,
 * AC-208, AC-513), through Tiptap's JSON static renderer, which "Requires
 * custom mappings for all nodes and marks" (research
 * `rich-tiles-and-combo-tech.md` §1, read mode).
 *
 * **Never HTML.** Each mapping returns elements whose props it chooses; no
 * attribute of the stored tree is ever spread onto the DOM, and text is a
 * React text node. So a tag in the text is that text, and nothing in a
 * tampered tree — an `onclick`, a `style`, a `src` — reaches the page.
 */

/** Draws one element — a live value or a control — in place, by its node. */
export type ElementRender = (node: TextNode, key: string) => ReactNode;

/**
 * The tile's way of drawing its elements, reaching each element's mapping
 * through context, since the renderer's mappings are made once.
 */
export const TextElementsContext = createContext<ElementRender | undefined>(undefined);

/** What the renderer gives each node's mapping: the node and its drawn children. */
type Props = NodeProps<JSONNodeType, ReactNode | ReactNode[]>;

/**
 * §3's type for each block style (direction.md §7h: Paragraph `text-sm`,
 * Heading small `text-md`, medium `text-lg`, large `text-xl`, Large value
 * `text-kpi`), named on the element so its CSS — and a test — reads it.
 *
 * Heading levels 1, 2 and 3 are Heading large, medium and small; a tile's
 * headings sit below the dashboard's h1 and a section's h2, so they are h3,
 * h4 and h5 (decision T869-1).
 */
const HEADINGS = {
  1: { Tag: 'h3', type: 'text-xl' },
  2: { Tag: 'h4', type: 'text-lg' },
  3: { Tag: 'h5', type: 'text-md' },
} as const;

function Heading({ node, children }: Props) {
  const level: unknown = node.attrs?.['level'];
  const { Tag, type } = HEADINGS[level === 2 || level === 3 ? level : 1];
  return <Tag data-type={type}>{children}</Tag>;
}

function OrderedList({ node, children }: Props) {
  const start = node.attrs?.['start'];
  return (
    <ol
      {...(typeof start === 'number' && Number.isSafeInteger(start) && start !== 1
        ? { start }
        : {})}
    >
      {children}
    </ol>
  );
}

function Element({ node }: Props) {
  const draw = useContext(TextElementsContext);
  return <>{draw?.(node as TextNode, String(node.type))}</>;
}

const elementMapping = Object.fromEntries(ELEMENT_KINDS.map((kind) => [kind, Element]));

export const nodeMapping = {
  doc: ({ children }: Props) => <>{children}</>,
  paragraph: ({ children }: Props) => <p>{children}</p>,
  heading: Heading,
  largeValue: ({ children }: Props) => (
    <p className="text-tile__large" data-type="text-kpi">
      {children}
    </p>
  ),
  bulletList: ({ children }: Props) => <ul>{children}</ul>,
  orderedList: OrderedList,
  listItem: ({ children }: Props) => <li>{children}</li>,
  text: ({ node }: Props) => <>{node.text}</>,
  hardBreak: () => <br />,
  ...elementMapping,
};

export const markMapping = {
  bold: ({ children }: { readonly children?: ReactNode }) => <strong>{children}</strong>,
  italic: ({ children }: { readonly children?: ReactNode }) => <em>{children}</em>,
  link: SafeLink,
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Deeper than any list an author nests; past it, a tampered tree is cut. */
const MOST_DEPTH = 32;

const KNOWN = new Set<string>(Object.keys(nodeMapping));
const ELEMENTS = new Set<string>(ELEMENT_KINDS);
const MARKS = new Set<string>(Object.keys(markMapping));

/**
 * The tree as view mode reads it: only the nodes and marks the schema has,
 * each with only the fields its mapping reads (AC-513). The API refuses a
 * document that fails the schema (T871), so this is for a tree altered in
 * storage: what the schema doesn't know is dropped, never drawn.
 */
export function readableNode(input: unknown, depth = 0): TextNode | undefined {
  if (!isRecord(input) || typeof input['type'] !== 'string' || !KNOWN.has(input['type']))
    return undefined;
  const type = input['type'];
  if (depth > MOST_DEPTH) return undefined;
  if (type === 'text')
    return typeof input['text'] === 'string' && input['text'] !== ''
      ? { type, text: input['text'], ...marksOf(input['marks']) }
      : undefined;
  const attrs = isRecord(input['attrs']) ? { attrs: input['attrs'] } : {};
  if (ELEMENTS.has(type as ElementKind)) return { type, ...attrs, ...marksOf(input['marks']) };
  const content = Array.isArray(input['content'])
    ? (input['content'] as unknown[]).flatMap((child) => readableNode(child, depth + 1) ?? [])
    : [];
  return {
    type,
    ...(type === 'heading' || type === 'orderedList' ? attrs : {}),
    ...(type === 'hardBreak' ? marksOf(input['marks']) : { content }),
  };
}

function marksOf(input: unknown): { marks?: TextMark[] } {
  if (!Array.isArray(input)) return {};
  const marks = (input as unknown[]).flatMap((mark): TextMark[] =>
    isRecord(mark) && typeof mark['type'] === 'string' && MARKS.has(mark['type'])
      ? [
          {
            type: mark['type'],
            ...(mark['type'] === 'link' && isRecord(mark['attrs'])
              ? { attrs: { href: mark['attrs']['href'] } }
              : {}),
          },
        ]
      : [],
  );
  return marks.length === 0 ? {} : { marks };
}
