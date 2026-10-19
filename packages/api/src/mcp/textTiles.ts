import {
  ELEMENT_KINDS,
  textDocumentFromMarkdown,
  textDocumentProblems,
  textDocumentToMarkdown,
  type ElementKind,
  type TextDocument,
  type TextNode,
} from '@wechart/core';

/**
 * A dashboard's Text tiles through MCP (T891, AC-527; decision T891-1): read
 * as markdown, each element a `{{…}}` token naming its kind and source
 * (T870), and written back in markdown, converted as exported markdown
 * reads (T869), each element keeping the stored settings of the stored
 * element of its kind and source, matched in order of appearance.
 */

type Body = Record<string, unknown>;

const isRecord = (value: unknown): value is Body =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** A dashboard body with each tile changed by `change`: on its pages, in sections and in tabs. */
function withTiles(body: Body, change: (tile: Body) => Body): Body {
  const items = (list: unknown): unknown =>
    Array.isArray(list)
      ? list.map((element: unknown) => {
          if (!isRecord(element)) return element;
          if (element['kind'] === 'section') return { ...element, items: items(element['items']) };
          if (element['kind'] === 'tabs' && Array.isArray(element['tabs']))
            return {
              ...element,
              tabs: (element['tabs'] as unknown[]).map((tab) =>
                isRecord(tab) ? { ...tab, items: items(tab['items']) } : tab,
              ),
            };
          return change(element);
        })
      : list;
  const pages = body['pages'];
  return Array.isArray(pages)
    ? {
        ...body,
        pages: pages.map((page: unknown) =>
          isRecord(page) ? { ...page, items: items(page['items']) } : page,
        ),
      }
    : body;
}

/** A dashboard body as MCP reads it: each Text tile's document as its markdown. */
export function dashboardForMcp(body: Body): Body {
  return withTiles(body, (tile) => {
    if (tile['kind'] !== 'text' || !isRecord(tile['document'])) return tile;
    const { document, ...rest } = tile;
    return { ...rest, markdown: textDocumentToMarkdown(document as unknown as TextDocument) };
  });
}

const ELEMENTS = new Set<string>(ELEMENT_KINDS);

/** What names an element's source, by its kind (T870's tokens). */
const SOURCE: Readonly<Record<ElementKind, string>> = {
  value: 'measure',
  change: 'measure',
  sparkline: 'measure',
  icon: 'measure',
  bulletGraph: 'measure',
  asOf: 'measure',
  marking: 'marking',
  filterValue: 'filter',
  filterControl: 'filter',
  parameterControl: 'parameter',
  actionButton: 'label',
};

/**
 * What each kind's token can say (T870's tokens): these come from the token
 * alone, a setting it leaves out being unset; every other setting is kept
 * from the stored element (checkpoint 3: a dropped `| marking:…` kept the
 * stored marking).
 */
const SAID: Readonly<Record<ElementKind, readonly string[]>> = {
  value: ['measure', 'marking'],
  change: ['measure'],
  sparkline: ['measure'],
  icon: ['measure'],
  bulletGraph: ['measure'],
  asOf: ['measure'],
  marking: ['marking', 'show'],
  filterValue: ['filter'],
  filterControl: ['filter'],
  parameterControl: ['parameter'],
  actionButton: ['label'],
};

/** The stored settings no token can say, with what the token said. */
function mergedAttrs(stored: TextNode, read: TextNode): Record<string, unknown> {
  const said = SAID[read.type as ElementKind];
  const kept = Object.fromEntries(
    Object.entries(stored.attrs ?? {}).filter(([key]) => !said.includes(key)),
  );
  return { ...kept, ...read.attrs };
}

const keyOf = (node: TextNode) =>
  `${node.type}\u0000${String(node.attrs?.[SOURCE[node.type as ElementKind]] ?? '')}`;

/** The document's elements in text order. */
function elementsIn(node: TextNode, into: TextNode[] = []): TextNode[] {
  if (ELEMENTS.has(node.type)) into.push(node);
  for (const child of node.content ?? []) elementsIn(child, into);
  return into;
}

/**
 * A document read from markdown, each element given the stored settings of
 * the stored element of its kind and source, the first to the first, and so
 * on; what its token says (its source, a marking, a Marking's show) stands.
 * A token with no stored match keeps the conversion's defaults.
 */
function withStoredSettings(read: TextDocument, stored: TextDocument | undefined): TextDocument {
  if (stored === undefined) return read;
  const kept = new Map<string, TextNode[]>();
  for (const element of elementsIn(stored.doc)) {
    const list = kept.get(keyOf(element)) ?? [];
    list.push(element);
    kept.set(keyOf(element), list);
  }
  const merged = (node: TextNode): TextNode => {
    if (ELEMENTS.has(node.type)) {
      const match = kept.get(keyOf(node))?.shift();
      return match === undefined ? node : { ...node, attrs: mergedAttrs(match, node) };
    }
    return node.content === undefined ? node : { ...node, content: node.content.map(merged) };
  };
  return { ...read, doc: merged(read.doc) };
}

/**
 * A dashboard body an MCP client writes, its Text tiles in markdown made
 * documents (AC-527), or the first tile that fails the schema — named as
 * the API names it (decision T871-1) — so nothing is sent.
 */
export function dashboardFromMcp(
  body: Body,
  stored: Body | undefined,
): { readonly body: Body } | { readonly refused: string } {
  const storedDocuments = new Map<string, TextDocument>();
  if (stored !== undefined)
    withTiles(stored, (tile) => {
      if (tile['kind'] === 'text' && typeof tile['id'] === 'string' && isRecord(tile['document']))
        storedDocuments.set(tile['id'], tile['document'] as unknown as TextDocument);
      return tile;
    });
  let refused: string | undefined;
  const converted = withTiles(body, (tile) => {
    if (tile['kind'] !== 'text' || typeof tile['markdown'] !== 'string') return tile;
    const { markdown, ...rest } = tile;
    const id = typeof tile['id'] === 'string' ? tile['id'] : '';
    const before = storedDocuments.get(id);
    // A tile whose markdown is as read is stored as it was: nothing the
    // markdown can't say is lost by a write that never touched it.
    const document =
      before !== undefined && textDocumentToMarkdown(before) === markdown
        ? before
        : withStoredSettings(
            textDocumentFromMarkdown(markdown as string, { exported: true }),
            before,
          );
    const problems = textDocumentProblems(document);
    if (problems.length > 0)
      refused ??= `The Text tile "${id}" can't be saved: ${problems.join(' ')}`;
    return { ...rest, document };
  });
  return refused === undefined ? { body: converted } : { refused };
}
