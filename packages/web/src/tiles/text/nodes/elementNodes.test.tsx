import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { TextDocument, TextNode } from '@wechart/core';

import { getSchema } from '@tiptap/core';
import { DOMSerializer, Node as PMNode } from '@tiptap/pm/model';

import '../editorTestDom';
import { textEditorExtensions } from '../editorExtensions';
import type { InsertSources } from '../InsertMenu';
import TextEditor from '../TextEditor';

/**
 * T882 / AC-519: WHILE a Text tile is edited, THE SYSTEM SHALL show each live
 * element as an atom …, which the arrow keys step over and select and
 * Backspace removes whole, named by its kind and source …; show each control
 * and action button as itself, inert …; and WHEN one is selected, by a click
 * or an arrow key, open its settings …
 * `Fails when: an element can be split or partly deleted; its accessible name
 * lacks its kind or source; a control in edit mode responds as it would for a
 * reader; selecting an element doesn't open its settings …`
 */
const SOURCES: InsertSources = {
  cubes: [
    { name: 'orders', title: 'Orders', measures: [{ name: 'orders.revenue', title: 'Revenue' }] },
  ],
  markings: [],
  filters: [{ id: 'f-country', name: 'Country' }],
};

const CHANGE: TextNode = {
  type: 'change',
  attrs: { measure: 'orders.revenue', period: 'quarter' },
};
const doc = (...content: TextNode[]): TextDocument => ({
  version: 1,
  doc: { type: 'doc', content: [{ type: 'paragraph', content }] },
});

async function opened(document: TextDocument) {
  const onLeave = vi.fn();
  const onElements = vi.fn();
  render(
    <TextEditor
      document={document}
      name="EMEA summary"
      onLeave={onLeave}
      sources={SOURCES}
      onElements={onElements}
    />,
  );
  const textbox = screen.getByRole('textbox', { name: 'EMEA summary' });
  await waitFor(() => {
    expect(textbox.contains(window.document.activeElement)).toBe(true);
  });
  return { onLeave, onElements, textbox };
}

const selectedElement = (textbox: HTMLElement) =>
  textbox.querySelector('.ProseMirror-selectednode [data-element]');

describe('an element in the text being edited (T882, AC-519)', () => {
  it('is an atom named by its kind and source', async () => {
    const { textbox } = await opened(doc({ type: 'text', text: 'a' }, CHANGE));
    const element = screen.getByRole('img', { name: 'Change, Revenue against previous quarter' });
    expect(textbox.contains(element)).toBe(true);
    // One node in the text, whatever it draws.
    expect(textbox.querySelectorAll('[data-element]')).toHaveLength(1);
  });

  /**
   * The arrow keys' stepping over it is ProseMirror's own, measured on the
   * page, which jsdom doesn't lay out: `e2e/text-tile.spec.ts` presses them.
   */
  it('is selected from the Elements list, and tells its place back', async () => {
    const onLeave = vi.fn();
    const onElements = vi.fn();
    const document = doc({ type: 'text', text: 'a' }, CHANGE, { type: 'text', text: 'b' });
    const props = { document, name: 'EMEA summary', onLeave, sources: SOURCES, onElements };
    const { rerender } = render(<TextEditor {...props} />);
    const textbox = screen.getByRole('textbox', { name: 'EMEA summary' });
    await waitFor(() => {
      expect(textbox.contains(window.document.activeElement)).toBe(true);
    });
    expect(selectedElement(textbox)).toBeNull();
    expect(onElements).toHaveBeenLastCalledWith([CHANGE], null);

    rerender(<TextEditor {...props} selectElement={{ index: 0, ask: 1 }} />);
    expect(selectedElement(textbox)?.getAttribute('data-element')).toBe('change');
    // Told once ProseMirror has finished with the selection.
    await waitFor(() => {
      expect(onElements).toHaveBeenLastCalledWith([CHANGE], 0);
    });
    // Selecting changed nothing in the text.
    await userEvent.keyboard('{Escape}');
    expect(onLeave).toHaveBeenCalledWith(undefined, 'escape');
  });

  it('opened by a row of the Elements list, is selected with focus in the text (T882’s review)', async () => {
    const onLeave = vi.fn();
    const document = doc({ type: 'text', text: 'a' }, CHANGE);
    render(
      <>
        <button type="button">Row</button>
        <TextEditor
          document={document}
          name="EMEA summary"
          onLeave={onLeave}
          sources={SOURCES}
          selectElement={{ index: 0, ask: 1 }}
        />
      </>,
    );
    const textbox = screen.getByRole('textbox', { name: 'EMEA summary' });
    await waitFor(() => {
      expect(textbox.contains(window.document.activeElement)).toBe(true);
    });
    expect(selectedElement(textbox)?.getAttribute('data-element')).toBe('change');
  });

  it('is copied as its kind and source in words, for wherever it’s pasted', () => {
    const extensions = textEditorExtensions();
    const schema = getSchema(extensions);
    const node = PMNode.fromJSON(schema, {
      type: 'paragraph',
      content: [CHANGE],
    });
    const holder = window.document.createElement('div');
    holder.append(DOMSerializer.fromSchema(schema).serializeFragment(node.content));
    expect(holder.textContent).toBe('Change, orders.revenue against previous quarter');
  });

  it('is removed whole by Backspace just after it', async () => {
    const { onLeave } = await opened(doc({ type: 'text', text: 'a' }, CHANGE));
    await userEvent.keyboard('{Backspace}{Escape}');
    expect(onLeave.mock.calls[0]?.[0]).toEqual(doc({ type: 'text', text: 'a' }));
  });

  it('is selected by a click', async () => {
    const { textbox, onElements } = await opened(doc(CHANGE, { type: 'text', text: ' rose' }));
    await userEvent.click(screen.getByRole('img', { name: /^Change/ }));
    expect(selectedElement(textbox)?.getAttribute('data-element')).toBe('change');
    expect(onElements).toHaveBeenLastCalledWith([CHANGE], 0);
  });

  it('draws a control as itself, inert: a click selects it and changes nothing', async () => {
    const control: TextNode = { type: 'filterControl', attrs: { filter: 'f-country' } };
    const button: TextNode = {
      type: 'actionButton',
      attrs: { label: 'Go to Detail', style: 'primary' },
    };
    const { textbox, onLeave } = await opened(doc(control, { type: 'text', text: ' ' }, button));
    const filter = screen.getByRole('img', { name: 'Filter control, Country' });
    expect(filter.textContent).toContain('Country');
    expect(filter.querySelector('[inert]')).not.toBeNull();
    await userEvent.click(filter);
    expect(selectedElement(textbox)?.getAttribute('data-element')).toBe('filterControl');
    expect(screen.getByRole('img', { name: 'Action button, Go to Detail' }).textContent).toBe(
      'Go to Detail',
    );
    await userEvent.keyboard('{Escape}');
    // Nothing changed.
    expect(onLeave).toHaveBeenCalledWith(undefined, 'escape');
  });
});
