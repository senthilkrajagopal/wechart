import { describe, expect, it } from 'vitest';

import { textDocumentFromMarkdown, textDocumentProblems } from '@wechart/core';

import { dashboardOf } from './stored';
import type { Element_, Tile } from './document';

/**
 * T875 / AC-512: a markdown tile saved before R80 opens as a Text tile that
 * reads the same — converted once, by T869's conversion, and written as a
 * document on the next save, after which its markdown is never read again.
 * Fails when: after a save the stored tile still holds markdown, or a later
 * open parses markdown.
 */
const NOTES =
  '## Marked share\n{{measure:orders.count}} orders, **{{marking:Marking.count}}** marked';

const stored = (items: unknown[]) => ({
  id: 'd1',
  body: {
    schemaVersion: 1,
    title: 'Board',
    pages: [
      {
        id: 'p1',
        title: 'P',
        items: [
          ...items,
          {
            id: 's1',
            kind: 'section',
            title: 'S',
            items: [
              {
                id: 'tg',
                kind: 'tabs',
                w: 12,
                tabs: [
                  {
                    id: 't',
                    title: 'T',
                    items: [{ id: 'deep', kind: 'markdown', w: 6, h: 10, text: '# Deep' }],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
});

const tileOf = (items: readonly Element_[], id: string): Tile | undefined => {
  for (const element of items) {
    if (element.kind === 'section') {
      const found = tileOf(element.items, id);
      if (found !== undefined) return found;
    } else if (element.kind === 'tabs') {
      for (const tab of element.tabs) {
        const found = tileOf(tab.items, id);
        if (found !== undefined) return found;
      }
    } else if (element.id === id) return element;
  }
  return undefined;
};

describe('a markdown tile read as a Text tile (AC-512)', () => {
  it('reads a stored markdown tile as a text tile whose document is T869’s conversion', () => {
    const document = dashboardOf(
      stored([{ id: 'notes', kind: 'markdown', w: 4, h: 20, text: NOTES }]),
    );
    const tile = tileOf(document.pages[0]?.items ?? [], 'notes');
    expect(tile).toEqual({
      id: 'notes',
      kind: 'text',
      w: 4,
      h: 20,
      document: textDocumentFromMarkdown(NOTES),
    });
    expect(textDocumentProblems(tile?.document)).toEqual([]);
  });

  it('converts one inside a section’s tab group too', () => {
    const document = dashboardOf(stored([]));
    const tile = tileOf(document.pages[0]?.items ?? [], 'deep');
    expect(tile?.kind).toBe('text');
    expect(tile?.document).toEqual(textDocumentFromMarkdown('# Deep'));
  });

  it('writes kind "text" and the document, and no markdown, when saved', () => {
    const document = dashboardOf(
      stored([{ id: 'notes', kind: 'markdown', w: 4, h: 20, text: NOTES }]),
    );
    // What a save sends is the document as read (AC-065).
    const sent = JSON.parse(JSON.stringify(document)) as {
      pages: { items: Record<string, unknown>[] }[];
    };
    const saved = sent.pages[0]?.items[0];
    expect(saved?.['kind']).toBe('text');
    expect(saved).not.toHaveProperty('text');
    expect(JSON.stringify(sent)).not.toContain('"kind":"markdown"');
    expect(JSON.stringify(sent)).not.toContain('## Marked share');
  });

  it('leaves a text tile’s stored document as it is, never reading markdown', () => {
    const doc = textDocumentFromMarkdown('Kept as stored');
    const document = dashboardOf(
      stored([{ id: 'done', kind: 'text', w: 4, h: 20, document: doc, text: '# ignored' }]),
    );
    const tile = tileOf(document.pages[0]?.items ?? [], 'done');
    expect(tile?.document).toBe(doc);
  });

  it('converts a tile of 12 tokens in full, all 12 live (decision T875-1)', () => {
    const text = Array.from({ length: 12 }, () => '{{measure:orders.count}}').join(' ');
    const document = dashboardOf(stored([{ id: 'many', kind: 'markdown', w: 4, h: 20, text }]));
    const tile = tileOf(document.pages[0]?.items ?? [], 'many');
    const values = JSON.stringify(tile?.document).match(/"type":"value"/g) ?? [];
    expect(values).toHaveLength(12);
  });
});
