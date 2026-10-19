import { Editor, type JSONContent } from '@tiptap/core';
import { afterEach, describe, expect, it } from 'vitest';

import './editorTestDom';
import { storedDocumentOf, textEditorExtensions } from './editorExtensions';

/**
 * T879 / AC-516: WHILE the author types in a Text tile, THE SYSTEM SHALL
 * convert as typed `#`, `##` or `###` then a space into Heading large,
 * medium or small; `-` or `*` then a space into a bulleted list; `1.` then a
 * space into a numbered list; `**text**` into bold and `*text*` into italic;
 * and `[text](address)` into a link, checked as AC-513; the next Undo SHALL
 * reverse a conversion; and only ⌘B / Ctrl+B, ⌘I / Ctrl+I and ⌘Z / Ctrl+Z
 * SHALL act as keys inside the text, the editor's other key bindings being
 * off, and none of the three SHALL do anything new with focus outside the
 * text.
 *
 * jsdom isn't a Mac, so the editor's `Mod` is Ctrl here.
 */
let editor: Editor | undefined;

afterEach(() => {
  editor?.destroy();
  editor = undefined;
  document.body.innerHTML = '';
});

function opened(content: JSONContent[] = [{ type: 'paragraph' }]): Editor {
  const element = document.createElement('div');
  document.body.append(element);
  editor = new Editor({
    element,
    extensions: textEditorExtensions(),
    content: { type: 'doc', content },
  });
  editor.commands.focus('end');
  return editor;
}

/** Types as the browser does: each character through the editor's text input. */
function type(on: Editor, text: string) {
  for (const character of text) {
    const { view } = on;
    const { from, to } = view.state.selection;
    const handled = view.someProp('handleTextInput', (handle) =>
      handle(view, from, to, character, () => view.state.tr.insertText(character, from, to)),
    );
    if (handled !== true) view.dispatch(view.state.tr.insertText(character, from, to));
  }
}

/** A key pressed in the text; true when the editor took it (its default prevented). */
function press(on: Editor, key: string, modifiers: KeyboardEventInit = {}): boolean {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    ...modifiers,
  });
  // A browser's key code, which ProseMirror's keymap reads for a shifted letter or digit.
  const code = key.length === 1 ? key.toUpperCase().charCodeAt(0) : key === 'Enter' ? 13 : 0;
  Object.defineProperty(event, 'keyCode', { value: code });
  on.view.dom.dispatchEvent(event);
  return event.defaultPrevented;
}

const ctrl = { ctrlKey: true };
const stored = (on: Editor) => storedDocumentOf(on.getJSON()).doc.content;
const paragraph = (text: string): JSONContent => ({
  type: 'paragraph',
  content: [{ type: 'text', text }],
});

describe('markdown patterns convert as typed, and the next Undo reverses each (T879, AC-516)', () => {
  it.each([
    ['# ', 1],
    ['## ', 2],
    ['### ', 3],
  ])('“%s” makes a heading of level %i (large, medium, small)', (pattern, level) => {
    const on = opened();
    type(on, pattern);
    expect(stored(on)).toEqual([{ type: 'heading', attrs: { level } }]);
    expect(press(on, 'z', ctrl)).toBe(true);
    expect(stored(on)).toEqual([paragraph(pattern)]);
  });

  it.each([
    ['- ', 'bulletList'],
    ['* ', 'bulletList'],
    ['1. ', 'orderedList'],
  ])('“%s” makes a %s', (pattern, list) => {
    const on = opened();
    type(on, pattern);
    expect(stored(on)?.[0]?.type).toBe(list);
    press(on, 'z', ctrl);
    expect(stored(on)).toEqual([paragraph(pattern)]);
  });

  it.each([
    ['**a**', 'bold'],
    ['*a*', 'italic'],
  ])('“%s” makes %s', (pattern, mark) => {
    const on = opened();
    type(on, pattern);
    expect(stored(on)).toEqual([
      { type: 'paragraph', content: [{ type: 'text', text: 'a', marks: [{ type: mark }] }] },
    ]);
    press(on, 'z', ctrl);
    expect(stored(on)).toEqual([paragraph(pattern)]);
  });

  it('“[a](https://x.example)” makes a link, and Undo gives back the typed text', () => {
    const on = opened();
    type(on, 'see [a](https://x.example)');
    expect(stored(on)).toEqual([
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'see ' },
          {
            type: 'text',
            text: 'a',
            marks: [{ type: 'link', attrs: { href: 'https://x.example' } }],
          },
        ],
      },
    ]);
    press(on, 'z', ctrl);
    expect(stored(on)).toEqual([paragraph('see [a](https://x.example)')]);
  });

  it('leaves a link to an unsafe address as the text typed (AC-513)', () => {
    const on = opened();
    type(on, '[a](javascript:alert(1))');
    expect(stored(on)).toEqual([paragraph('[a](javascript:alert(1))')]);
  });
});

describe('only ⌘B, ⌘I and ⌘Z act inside the text (T879, AC-516)', () => {
  it('⌘B and ⌘I toggle bold and italic over the selection', () => {
    const on = opened([paragraph('word')]);
    on.commands.selectAll();
    expect(press(on, 'b', ctrl)).toBe(true);
    expect(stored(on)).toEqual([
      { type: 'paragraph', content: [{ type: 'text', text: 'word', marks: [{ type: 'bold' }] }] },
    ]);
    expect(press(on, 'i', ctrl)).toBe(true);
    expect(stored(on)).toEqual([
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'word', marks: [{ type: 'bold' }, { type: 'italic' }] }],
      },
    ]);
  });

  it('⌘Z undoes typing', () => {
    const on = opened([paragraph('Revenue')]);
    type(on, ' grew');
    expect(stored(on)).toEqual([paragraph('Revenue grew')]);
    press(on, 'z', ctrl);
    expect(stored(on)).toEqual([paragraph('Revenue')]);
  });

  it.each([
    ['⌘U', 'u', ctrl],
    ['⌘E', 'e', ctrl],
    ['⇧⌘X', 'X', { ctrlKey: true, shiftKey: true }],
    ['⌘⌥1', '1', { ctrlKey: true, altKey: true }],
    ['⌘⌥0', '0', { ctrlKey: true, altKey: true }],
    ['⇧⌘7', '7', { ctrlKey: true, shiftKey: true }],
    ['⇧⌘8', '8', { ctrlKey: true, shiftKey: true }],
    ['⌘Enter', 'Enter', ctrl],
    ['⇧Enter', 'Enter', { shiftKey: true }],
    ['⌘Y', 'y', ctrl],
  ] as const)('%s changes nothing', (_name, key, modifiers) => {
    const on = opened([paragraph('word')]);
    on.commands.selectAll();
    const before = stored(on);
    press(on, key, modifiers);
    expect(stored(on)).toEqual(before);
  });

  it('⇧⌘Z redoes nothing', () => {
    const on = opened([paragraph('Revenue')]);
    type(on, ' grew');
    press(on, 'z', ctrl);
    expect(stored(on)).toEqual([paragraph('Revenue')]);
    press(on, 'Z', { ctrlKey: true, shiftKey: true });
    expect(stored(on)).toEqual([paragraph('Revenue')]);
  });

  it('the browser’s own formatting and redo, asked by a key the editor leaves alone, change nothing', () => {
    const on = opened([paragraph('word')]);
    on.commands.selectAll();
    for (const inputType of ['formatUnderline', 'formatStrikeThrough', 'historyRedo']) {
      const event = new InputEvent('beforeinput', { inputType, bubbles: true, cancelable: true });
      on.view.dom.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
    }
    expect(stored(on)).toEqual([paragraph('word')]);
  });

  it('with focus outside the text, ⌘B does nothing', () => {
    const on = opened([paragraph('word')]);
    on.commands.selectAll();
    const outside = document.createElement('button');
    document.body.append(outside);
    outside.focus();
    const event = new KeyboardEvent('keydown', {
      key: 'b',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    outside.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(stored(on)).toEqual([paragraph('word')]);
  });
});
