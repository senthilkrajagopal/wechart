import {
  elementsOf,
  TEXT_DOCUMENT_VERSION,
  type TextDocument,
  type TextNode,
  type TextToken,
} from '@wechart/core';

/**
 * A new Text tile's document: one empty paragraph, where the cursor goes
 * (T874, AC-058). It passes the schema (T868) and holds no element.
 */
export function emptyTextDocument(): TextDocument {
  return { version: TEXT_DOCUMENT_VERSION, doc: { type: 'doc', content: [{ type: 'paragraph' }] } };
}

/**
 * What the document reads as, as plain text, block by block: for naming the
 * tile (AC-209) by its first line, and for telling an empty tile (design 21
 * G6). Elements are left out, since they are values, not words.
 */
export function blocksTextOf(document: TextDocument | undefined): string[] {
  const blocks: string[] = [];
  const textOf = (node: TextNode): string =>
    node.type === 'text'
      ? (node.text ?? '')
      : node.type === 'hardBreak'
        ? ' '
        : (node.content ?? []).map(textOf).join('');
  const walk = (nodes: readonly TextNode[] | undefined) => {
    for (const node of nodes ?? []) {
      if (node.type === 'bulletList' || node.type === 'orderedList' || node.type === 'listItem')
        walk(node.content);
      else blocks.push(textOf(node));
    }
  };
  walk(document?.doc.content);
  return blocks;
}

/** Whether a Text tile holds nothing at all: no words and no element (design 21 G6). */
export function isEmptyTextDocument(document: TextDocument | undefined): boolean {
  return (
    blocksTextOf(document).every((text) => text.trim() === '') &&
    (document === undefined || elementsOf(document).length === 0)
  );
}

/**
 * The markdown tile's token an element is (T869's `elementOfToken` read
 * back): a Value is a measure token, limited by its marking where it names
 * one, and a Marking a marking token; other elements have none. So a Text
 * tile draws these as the markdown tile drew its tokens (AC-512, AC-116)
 * until each element kind has its own drawing (T884–T886).
 */
export function tokenOfElement(node: TextNode): TextToken | undefined {
  const attrs = node.attrs ?? {};
  if (node.type === 'value' && typeof attrs['measure'] === 'string')
    return {
      kind: 'measure',
      member: attrs['measure'],
      ...(typeof attrs['marking'] === 'string' ? { marking: attrs['marking'] } : {}),
    };
  if (node.type === 'marking' && typeof attrs['marking'] === 'string')
    return {
      kind: 'marking',
      name: attrs['marking'],
      show: attrs['show'] === 'summary' ? 'summary' : 'count',
    };
  return undefined;
}

/** The first line of a Text tile that reads as anything, or '' for none. */
export function firstReadingOfDocument(document: TextDocument | undefined): string {
  const first = blocksTextOf(document).find((text) => text.trim() !== '');
  return first?.trim() ?? '';
}
