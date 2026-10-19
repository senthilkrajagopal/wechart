import { generateJSON, getSchema, type JSONContent } from '@tiptap/core';
import { DOMSerializer, Node as PMNode } from '@tiptap/pm/model';
import { describe, expect, it } from 'vitest';

import { textDocumentProblems } from '@wechart/core';

import { storedDocumentOf, textEditorExtensions } from './editorExtensions';

/**
 * T876's review (AC-302, AC-513; decisions T868-3 and T876-1): what the
 * editor hands back always passes the stored schema, so Save is never
 * refused for something the editor let through; and an element copied or
 * cut keeps its kind and settings when it's pasted.
 */
const doc = (...content: JSONContent[]): JSONContent => ({ type: 'doc', content });
const value: JSONContent = {
  type: 'value',
  attrs: {
    measure: 'orders.revenue',
    filters: [{ member: 'orders.country', operator: 'equals', values: ['DE'] }],
    marking: 'Picks',
    whenUnmarked: null,
  },
};

describe('the editor’s document as stored (T876’s review)', () => {
  it('drops a link to anything but an http(s) address or a wechart dashboard, keeping its words', () => {
    const stored = storedDocumentOf(
      doc({
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: 'mail',
            marks: [{ type: 'link', attrs: { href: 'mailto:a@b.c' } }],
          },
          { type: 'text', text: ' and ' },
          {
            type: 'text',
            text: 'ok',
            marks: [{ type: 'link', attrs: { href: 'https://x.example' } }],
          },
        ],
      }),
    );
    expect(textDocumentProblems(stored)).toEqual([]);
    expect(stored.doc.content?.[0]?.content).toEqual([
      { type: 'text', text: 'mail' },
      { type: 'text', text: ' and ' },
      { type: 'text', text: 'ok', marks: [{ type: 'link', attrs: { href: 'https://x.example' } }] },
    ]);
  });

  it('drops a link from an element, which may be bold or italic but never a link', () => {
    const stored = storedDocumentOf(
      doc({
        type: 'paragraph',
        content: [
          {
            ...value,
            marks: [{ type: 'bold' }, { type: 'link', attrs: { href: 'https://x.example' } }],
          },
        ],
      }),
    );
    expect(textDocumentProblems(stored)).toEqual([]);
    expect(stored.doc.content?.[0]?.content?.[0]?.marks).toEqual([{ type: 'bold' }]);
  });

  it('reads a heading or Large value pasted into a list item as a paragraph there', () => {
    const stored = storedDocumentOf(
      doc({
        type: 'bulletList',
        content: [
          {
            type: 'listItem',
            content: [
              { type: 'paragraph', content: [{ type: 'text', text: 'a' }] },
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'b' }] },
              { type: 'largeValue', content: [{ type: 'text', text: 'c' }] },
            ],
          },
        ],
      }),
    );
    expect(textDocumentProblems(stored)).toEqual([]);
    expect(stored.doc.content?.[0]?.content?.[0]?.content?.map((node) => node.type)).toEqual([
      'paragraph',
      'paragraph',
      'paragraph',
    ]);
  });
});

describe('an element on the clipboard (T876’s review)', () => {
  it('is read back from the HTML it is copied as, with its kind and every setting', () => {
    const extensions = textEditorExtensions();
    const schema = getSchema(extensions);
    const node = PMNode.fromJSON(schema, doc({ type: 'paragraph', content: [value] }));
    const holder = document.createElement('div');
    holder.append(DOMSerializer.fromSchema(schema).serializeFragment(node.content));
    const pasted = storedDocumentOf(generateJSON(holder.innerHTML, extensions));
    expect(pasted.doc.content?.[0]?.content?.[0]).toEqual({
      type: 'value',
      attrs: {
        measure: 'orders.revenue',
        filters: [{ member: 'orders.country', operator: 'equals', values: ['DE'] }],
        marking: 'Picks',
      },
    });
  });

  it('keeps only what its kind declares, from pasted settings it was never given', () => {
    const pasted = storedDocumentOf(
      generateJSON(
        '<p><span data-element="value" data-attrs=\'{"measure":"orders.count","onclick":"x"}\'>x</span></p>',
        textEditorExtensions(),
      ),
    );
    expect(pasted.doc.content?.[0]?.content?.[0]).toEqual({
      type: 'value',
      attrs: { measure: 'orders.count' },
    });
  });
});
