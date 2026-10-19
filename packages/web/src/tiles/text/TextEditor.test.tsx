import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { textDocumentProblems, type TextDocument, type TextNode } from '@wechart/core';

import './editorTestDom';
import TextEditor from './TextEditor';

/**
 * T876 / AC-302: WHEN the author double-clicks a Text tile in edit mode, or
 * chooses "Edit text on the canvas", THE SYSTEM SHALL make its text editable
 * in place … focus in the text at its end; Esc or a click outside SHALL leave
 * the text …; Tab SHALL leave it for the next control; the dashboard's Undo
 * SHALL take the whole edit as one change once the text is left.
 * `Fails when: … after Esc, Tab or a click outside, focus is still in the
 * text; one Undo after leaving the text doesn't reverse the whole edit …`
 *
 * AC-515 (its last clause): the text SHALL be a `textbox` with
 * `aria-multiline="true"`, named after the tile.
 *
 * The editor on its own: what it hands back when the text is left, once, as
 * the stored schema has it (decision T868-3). The host's half — the tile
 * selected and focused, one Undo — is `e2e/text-tile.spec.ts`'s.
 */
const doc = (...content: TextNode[]): TextDocument => ({
  version: 1,
  doc: { type: 'doc', content },
});
const text = (value: string, marks?: TextNode['marks']): TextNode => ({
  type: 'text',
  text: value,
  ...(marks === undefined ? {} : { marks }),
});
const paragraph = (...content: TextNode[]): TextNode => ({ type: 'paragraph', content });

function opened(document: TextDocument, after = false) {
  const onLeave = vi.fn();
  render(
    <>
      <TextEditor document={document} name="EMEA summary" onLeave={onLeave} />
      {after ? <button type="button">Next control</button> : null}
    </>,
  );
  return { onLeave, textbox: screen.getByRole('textbox', { name: 'EMEA summary' }) };
}

describe('a Text tile’s text, edited in place (T876, AC-302)', () => {
  it('is a multi-line textbox named after the tile, focused at the text’s end', async () => {
    const { textbox, onLeave } = opened(doc(paragraph(text('Revenue grew'))));
    expect(textbox.getAttribute('aria-multiline')).toBe('true');
    await waitFor(() => {
      expect(textbox.contains(document.activeElement)).toBe(true);
    });
    await userEvent.keyboard('!');
    await userEvent.keyboard('{Escape}');
    expect(onLeave).toHaveBeenCalledTimes(1);
    expect(onLeave.mock.calls[0]?.[0]).toEqual(doc(paragraph(text('Revenue grew!'))));
  });

  it('leaves on Esc, saying so, once', async () => {
    const { textbox, onLeave } = opened(doc(paragraph(text('One'))));
    await waitFor(() => {
      expect(textbox.contains(document.activeElement)).toBe(true);
    });
    await userEvent.keyboard('{Escape}');
    expect(onLeave).toHaveBeenCalledTimes(1);
    expect(onLeave.mock.calls[0]?.[1]).toBe('escape');
  });

  it('stays while the window loses focus, to another app or tab (T876’s review)', async () => {
    const { textbox, onLeave } = opened(doc(paragraph(text('One'))));
    await waitFor(() => {
      expect(textbox.contains(document.activeElement)).toBe(true);
    });
    const hasFocus = vi.spyOn(document, 'hasFocus').mockReturnValue(false);
    fireEvent.blur(textbox, { relatedTarget: null });
    hasFocus.mockRestore();
    expect(onLeave).not.toHaveBeenCalled();
  });

  it('hands back nothing when the text is unchanged, so no change is recorded', async () => {
    const { textbox, onLeave } = opened(doc(paragraph(text('Same'))));
    await waitFor(() => {
      expect(textbox.contains(document.activeElement)).toBe(true);
    });
    await userEvent.keyboard('{Escape}');
    expect(onLeave).toHaveBeenCalledWith(undefined, 'escape');
  });

  it('leaves by Tab for the next control, even inside a list, where Tab would nest the item', async () => {
    const { textbox, onLeave } = opened(
      doc({
        type: 'bulletList',
        content: [
          { type: 'listItem', content: [paragraph(text('a'))] },
          { type: 'listItem', content: [paragraph(text('b'))] },
        ],
      }),
      true,
    );
    await waitFor(() => {
      expect(textbox.contains(document.activeElement)).toBe(true);
    });
    await userEvent.tab();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Next control' }));
    expect(onLeave).toHaveBeenCalledTimes(1);
    expect(onLeave.mock.calls[0]?.[0]).toBeUndefined();
    expect(onLeave.mock.calls[0]?.[1]).toBe('away');
  });

  it('keeps every block, mark and element it opens, and writes only the schema’s attributes', async () => {
    const opening = doc(
      { type: 'heading', attrs: { level: 1 }, content: [text('Large')] },
      { type: 'heading', attrs: { level: 2 }, content: [text('Medium')] },
      { type: 'heading', attrs: { level: 3 }, content: [text('Small')] },
      {
        type: 'largeValue',
        content: [{ type: 'value', attrs: { measure: 'orders.revenue' } }],
      },
      paragraph(
        text('Revenue is '),
        {
          type: 'change',
          attrs: {
            measure: 'orders.revenue',
            period: 'quarter',
            direction: 'higher',
            filters: [{ member: 'orders.country', operator: 'equals', values: ['DE'] }],
          },
          marks: [{ type: 'bold' }],
        },
        text(' and ', [{ type: 'italic' }]),
        text('a link', [{ type: 'link', attrs: { href: 'https://example.com/a' } }]),
        { type: 'hardBreak' },
        {
          type: 'actionButton',
          attrs: {
            label: 'Go to Detail',
            style: 'primary',
            actions: [{ kind: 'resetFilters' }, { kind: 'page', page: 'detail' }],
          },
        },
        { type: 'filterControl', attrs: { filter: 'f1' } },
        { type: 'marking', attrs: { marking: 'Picks', show: 'summary' } },
      ),
      {
        type: 'orderedList',
        attrs: { start: 3 },
        content: [{ type: 'listItem', content: [paragraph(text('third'))] }],
      },
    );
    const { textbox, onLeave } = opened(opening);
    await waitFor(() => {
      expect(textbox.contains(document.activeElement)).toBe(true);
    });
    await userEvent.keyboard('!');
    await userEvent.keyboard('{Escape}');
    const left = onLeave.mock.calls[0]?.[0] as TextDocument;
    expect(textDocumentProblems(left)).toEqual([]);
    const content = [...(opening.doc.content ?? [])];
    content[content.length - 1] = {
      type: 'orderedList',
      attrs: { start: 3 },
      content: [{ type: 'listItem', content: [paragraph(text('third!'))] }],
    };
    expect(left).toEqual(doc(...content));
  });

  it('shows the three heading styles as the tile draws them, h3, h4 and h5', () => {
    const { textbox } = opened(
      doc(
        { type: 'heading', attrs: { level: 1 }, content: [text('Large')] },
        { type: 'heading', attrs: { level: 2 }, content: [text('Medium')] },
        { type: 'heading', attrs: { level: 3 }, content: [text('Small')] },
      ),
    );
    expect(textbox.querySelector('h3')?.getAttribute('data-type')).toBe('text-xl');
    expect(textbox.querySelector('h4')?.getAttribute('data-type')).toBe('text-lg');
    expect(textbox.querySelector('h5')?.getAttribute('data-type')).toBe('text-md');
  });
});
