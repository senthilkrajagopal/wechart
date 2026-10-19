import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { TextDocument, TextNode } from '@wechart/core';

import './editorTestDom';
import TextEditor from './TextEditor';

/**
 * T878 / AC-515: WHILE the author edits a Text tile's text, THE SYSTEM SHALL
 * show above it a toolbar (`role="toolbar"`, one Tab stop, ← and → along it)
 * holding, in order: a block-style menu button offering Paragraph
 * (`text-sm`), Heading small (`text-md`), Heading medium (`text-lg`), Heading
 * large (`text-xl`) and Large value (`text-kpi` 32/40, tabular numerals),
 * each shown in its own type; bold; italic; bulleted list; numbered list;
 * link; Insert; and the count "‹n› / 10 elements"; and no control for colour,
 * font or size.
 * `Fails when: a control is missing, out of order, or one for colour, font or
 * size is present; a block style renders at another size …`
 *
 * The toolbar as the editor shows it, over a text of three elements.
 */
const value = (measure: string): TextNode => ({ type: 'value', attrs: { measure } });
const THREE: TextDocument = {
  version: 1,
  doc: {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Revenue ' },
          value('orders.revenue'),
          { type: 'text', text: ', margin ' },
          value('orders.margin'),
          { type: 'text', text: ' and ' },
          value('orders.count'),
        ],
      },
    ],
  },
};

async function opened(document: TextDocument = THREE) {
  const onLeave = vi.fn();
  render(<TextEditor document={document} name="EMEA summary" onLeave={onLeave} />);
  const textbox = screen.getByRole('textbox', { name: 'EMEA summary' });
  await waitFor(() => {
    expect(textbox.contains(window.document.activeElement)).toBe(true);
  });
  return { onLeave, textbox, toolbar: screen.getByRole('toolbar', { name: 'Text formatting' }) };
}

describe('the Text tile’s toolbar (T878, AC-515)', () => {
  it('holds, in order, block style, Bold, Italic, both lists, Link, Insert and the count, above the text', async () => {
    const { toolbar, textbox } = await opened();
    const controls = within(toolbar).getAllByRole('button');
    expect(
      controls.map((control) => control.getAttribute('aria-label') ?? control.textContent),
    ).toEqual([
      'Block style: Paragraph',
      'Bold',
      'Italic',
      'Bulleted list',
      'Numbered list',
      'Link',
      'Insert',
    ]);
    expect(toolbar.lastElementChild?.textContent).toBe('3 / 10 elements');
    // Above the text.
    expect(
      toolbar.compareDocumentPosition(textbox) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    // Nothing for colour, font or size.
    expect(within(toolbar).queryByRole('button', { name: /colou?r|font|size/i })).toBeNull();
    expect(within(toolbar).queryByRole('combobox')).toBeNull();
  });

  it('is one Tab stop, ← and → moving along it', async () => {
    const { toolbar } = await opened();
    const controls = within(toolbar).getAllByRole('button');
    expect(controls.filter((control) => control.tabIndex === 0)).toHaveLength(1);
    // Shift+Tab from the text reaches it, on its first control.
    await userEvent.tab({ shift: true });
    expect(window.document.activeElement).toBe(controls[0]);
    await userEvent.keyboard('{ArrowRight}');
    expect(window.document.activeElement).toBe(controls[1]);
    await userEvent.keyboard('{ArrowLeft}{ArrowLeft}');
    expect(window.document.activeElement).toBe(controls[controls.length - 1]);
    expect(controls.filter((control) => control.tabIndex === 0)).toEqual([
      controls[controls.length - 1],
    ]);
  });

  it('offers the five block styles, each in its own type, and Heading medium makes the line an h4 at text-lg', async () => {
    const { toolbar, textbox } = await opened();
    await userEvent.click(within(toolbar).getByRole('button', { name: 'Block style: Paragraph' }));
    const menu = screen.getByRole('menu', { name: 'Block style' });
    const styles = within(menu).getAllByRole('menuitemradio');
    expect(styles.map((style) => [style.textContent, style.getAttribute('data-type')])).toEqual([
      ['Paragraph', 'text-sm'],
      ['Heading small', 'text-md'],
      ['Heading medium', 'text-lg'],
      ['Heading large', 'text-xl'],
      ['Large value', 'text-kpi'],
    ]);
    expect(styles[0]?.getAttribute('aria-checked')).toBe('true');

    await userEvent.click(within(menu).getByRole('menuitemradio', { name: 'Heading medium' }));
    const line = textbox.querySelector('h4');
    expect(line?.getAttribute('data-type')).toBe('text-lg');
    // The whole line, its three elements with it.
    expect(line?.textContent).toMatch(/^Revenue /);
    expect(line?.querySelectorAll('[data-element="value"]')).toHaveLength(3);
    expect(screen.queryByRole('menu')).toBeNull();
    expect(
      within(toolbar).getByRole('button', { name: 'Block style: Heading medium' }),
    ).toBeTruthy();
  });

  it('chooses a block style by keyboard: ↓ to it, Enter; Esc closes the menu on its button', async () => {
    const { toolbar, textbox } = await opened();
    const button = within(toolbar).getByRole('button', { name: 'Block style: Paragraph' });
    button.focus();
    await userEvent.keyboard('{Enter}');
    expect(window.document.activeElement?.textContent).toBe('Paragraph');
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}{Enter}');
    expect(textbox.querySelector('[data-type="text-kpi"]')).not.toBeNull();

    // Choosing a style puts focus back in the text.
    await waitFor(() => {
      expect(textbox.contains(window.document.activeElement)).toBe(true);
    });
    within(toolbar).getByRole('button', { name: 'Block style: Large value' }).focus();
    await userEvent.keyboard('{Enter}{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(window.document.activeElement).toBe(
      within(toolbar).getByRole('button', { name: 'Block style: Large value' }),
    );
  });

  it('makes the selection bold and italic, and says which are on', async () => {
    const { toolbar, textbox, onLeave } = await opened({
      version: 1,
      doc: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Up' }] }],
      },
    });
    // Everything selected (the editor's select-all; jsdom moves no selection by Shift+arrows).
    await userEvent.keyboard('{Control>}a{/Control}');
    const bold = within(toolbar).getByRole('button', { name: 'Bold' });
    expect(bold.getAttribute('aria-pressed')).toBe('false');
    await userEvent.click(bold);
    await userEvent.click(within(toolbar).getByRole('button', { name: 'Italic' }));
    expect(bold.getAttribute('aria-pressed')).toBe('true');
    expect(textbox.querySelector('strong em, em strong')?.textContent).toBe('Up');
    // The buttons keep focus in the text, which is still being edited.
    expect(onLeave).not.toHaveBeenCalled();
  });

  it('makes a bulleted and a numbered list', async () => {
    const { toolbar, textbox } = await opened();
    await userEvent.click(within(toolbar).getByRole('button', { name: 'Bulleted list' }));
    expect(textbox.querySelector('ul > li')).not.toBeNull();
    await userEvent.click(within(toolbar).getByRole('button', { name: 'Numbered list' }));
    expect(textbox.querySelector('ol > li')).not.toBeNull();
    expect(textbox.querySelector('ul')).toBeNull();
  });

  it('links the selection to an http(s) address, and refuses any other with its reason', async () => {
    const { toolbar, textbox, onLeave } = await opened({
      version: 1,
      doc: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'See detail' }] }],
      },
    });
    await userEvent.keyboard('{Control>}a{/Control}');
    await userEvent.click(within(toolbar).getByRole('button', { name: 'Link' }));
    const address = screen.getByRole('textbox', { name: 'Link address' });
    await userEvent.type(address, 'javascript:alert(1){Enter}');
    expect(screen.getByRole('alert').textContent).toContain('isn’t an http(s) address');
    expect(textbox.querySelector('a')).toBeNull();

    await userEvent.clear(address);
    await userEvent.type(address, 'https://example.com/detail{Enter}');
    expect(textbox.querySelector('a')?.textContent).toBe('See detail');
    expect(screen.queryByRole('textbox', { name: 'Link address' })).toBeNull();
    expect(onLeave).not.toHaveBeenCalled();
    // Linked, focus is back in the text, which Esc then leaves.
    await waitFor(() => {
      expect(textbox.contains(window.document.activeElement)).toBe(true);
    });
    await userEvent.keyboard('{Escape}');
    const left = onLeave.mock.calls[0]?.[0] as TextDocument;
    expect(left.doc.content?.[0]?.content?.[0]).toEqual({
      type: 'text',
      text: 'See detail',
      marks: [{ type: 'link', attrs: { href: 'https://example.com/detail' } }],
    });
  });

  it('closes the block-style menu and the link field by their own buttons, focus on the button (T878’s review)', async () => {
    const { toolbar, onLeave } = await opened();
    const block = within(toolbar).getByRole('button', { name: 'Block style: Paragraph' });
    await userEvent.click(block);
    expect(block.getAttribute('aria-controls')).toBe(screen.getByRole('menu').id);
    await userEvent.click(block);
    expect(screen.queryByRole('menu')).toBeNull();
    expect(window.document.activeElement).toBe(block);

    const link = within(toolbar).getByRole('button', { name: 'Link' });
    await userEvent.click(link);
    expect(window.document.activeElement).toBe(
      screen.getByRole('textbox', { name: 'Link address' }),
    );
    await userEvent.click(link);
    expect(screen.queryByRole('textbox', { name: 'Link address' })).toBeNull();
    expect(window.document.activeElement).toBe(link);
    expect(onLeave).not.toHaveBeenCalled();
  });

  it('opens the block-style menu by ↓ on its button, as an APG menu button does', async () => {
    const { toolbar } = await opened();
    within(toolbar).getByRole('button', { name: 'Block style: Paragraph' }).focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(window.document.activeElement?.getAttribute('role')).toBe('menuitemradio');
  });

  it('closes the link field once focus leaves it', async () => {
    const { toolbar, textbox } = await opened();
    await userEvent.click(within(toolbar).getByRole('button', { name: 'Link' }));
    await userEvent.click(within(toolbar).getByRole('button', { name: 'Bold' }));
    expect(screen.queryByRole('textbox', { name: 'Link address' })).toBeNull();
    await waitFor(() => {
      expect(textbox.contains(window.document.activeElement)).toBe(true);
    });
  });

  it('stays open for a click on its own parts that take no focus, inside a focusable tile', async () => {
    const onLeave = vi.fn();
    render(
      // A tile, as the canvas draws one in edit mode: a group that takes focus
      // (`grid/Canvas.tsx` weighs the rule below for the real one).
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
      <div tabIndex={0} role="group" aria-label="Tile" data-testid="tile">
        <TextEditor document={THREE} name="EMEA summary" onLeave={onLeave} />
      </div>,
    );
    const textbox = screen.getByRole('textbox', { name: 'EMEA summary' });
    await waitFor(() => {
      expect(textbox.contains(window.document.activeElement)).toBe(true);
    });
    await userEvent.click(screen.getByText('3 / 10 elements'));
    await userEvent.click(screen.getByRole('toolbar'));
    expect(onLeave).not.toHaveBeenCalled();
    expect(textbox.contains(window.document.activeElement)).toBe(true);
  });

  it('counts past 10 in the warning state', async () => {
    const many: TextDocument = {
      version: 1,
      doc: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: Array.from({ length: 12 }, () => value('orders.count')),
          },
        ],
      },
    };
    const { toolbar } = await opened(many);
    const count = within(toolbar).getByText('12 / 10 elements');
    expect(count.getAttribute('data-state')).toBe('warning');
  });
});

/**
 * T883 / AC-518, in the editor: at 10 elements Insert is disabled with the
 * reason and opens nothing, the menu `{{` opens has every row disabled and
 * says why, and a paste that would pass 10 is refused with the reason and
 * changes nothing.
 */
describe('a Text tile held to 10 elements in the editor (T883, AC-518)', () => {
  const REASON =
    'This tile holds 10 elements, the most a Text tile can. Remove one, or add another Text tile.';
  const holding = (n: number): TextDocument => ({
    version: 1,
    doc: {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Values ' },
            ...Array.from({ length: n }, () => value('orders.count')),
          ],
        },
      ],
    },
  });

  it('disables Insert at 10 with the reason, and Insert opens no menu', async () => {
    const { toolbar } = await opened(holding(10));
    const insert = within(toolbar).getByRole('button', { name: 'Insert' });
    expect(insert.getAttribute('aria-disabled')).toBe('true');
    const described = insert.getAttribute('aria-describedby') ?? '';
    expect(window.document.getElementById(described)?.textContent).toBe(REASON);
    await userEvent.click(insert);
    expect(screen.queryByRole('listbox', { name: 'Insert' })).toBeNull();
  });

  it('leaves Insert enabled at 9', async () => {
    const { toolbar } = await opened(holding(9));
    const insert = within(toolbar).getByRole('button', { name: 'Insert' });
    expect(insert.getAttribute('aria-disabled')).toBeNull();
    await userEvent.click(insert);
    expect(screen.getByRole('listbox', { name: 'Insert' }).getAttribute('aria-label')).toBe(
      'Insert',
    );
  });

  it('disables every row of the menu {{ opens at 10, saying why, and Enter inserts nothing', async () => {
    const { textbox } = await opened(holding(10));
    await userEvent.keyboard('{{{{');
    const menu = screen.getByRole('listbox', { name: 'Insert' });
    const rows = within(menu).getAllByRole('option');
    expect(rows.map((row) => row.getAttribute('aria-disabled'))).toEqual(rows.map(() => 'true'));
    expect(within(menu).getByText(REASON).textContent).toBe(REASON);
    await userEvent.keyboard('{Enter}');
    expect(textbox.querySelectorAll('.text-element-view')).toHaveLength(10);
  });

  it('refuses a paste of 2 elements into a tile of 9, with the reason, changing nothing', async () => {
    const { textbox, onLeave } = await opened(holding(9));
    const html =
      '<p>two <span data-element="value" data-attrs=\'{"measure":"orders.count"}\'>a</span>' +
      '<span data-element="value" data-attrs=\'{"measure":"orders.count"}\'>b</span></p>';
    const paste = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(paste, 'clipboardData', {
      value: {
        types: ['text/html', 'text/plain'],
        getData: (type: string) => (type === 'text/html' ? html : 'two a b'),
      },
    });
    textbox.dispatchEvent(paste);
    expect(paste.defaultPrevented).toBe(true);
    expect((await screen.findByRole('alert')).textContent).toBe(REASON);
    expect(textbox.querySelectorAll('.text-element-view')).toHaveLength(9);
    await userEvent.keyboard('{Escape}');
    // Nothing changed: the text hands back no document.
    expect(onLeave).toHaveBeenCalledWith(undefined, 'escape');
  });
});
