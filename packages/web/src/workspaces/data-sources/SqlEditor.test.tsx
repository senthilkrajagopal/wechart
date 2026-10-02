import { runScopeHandlers } from '@codemirror/view';
import { EditorView } from '@codemirror/view';
import { act, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SqlEditor } from './SqlEditor';

/**
 * T535 (AC-387; design 15's P2 and Q1): the SQL tab's editor, the app's
 * CodeMirror in SQL mode. ⌘/Ctrl+Enter runs the selection where there is
 * one, else the whole text; what is selected is said as it changes, so Run
 * can read "Run selection". A name chosen in the schema browser goes in at
 * the cursor (T539).
 */
const TEXT = 'SELECT 1;\nSELECT 2';

function setUp(props: Partial<Parameters<typeof SqlEditor>[0]> = {}) {
  const onRun = vi.fn();
  const onSelection = vi.fn();
  const onChange = vi.fn();
  const rendered = render(
    <SqlEditor
      value={TEXT}
      onChange={onChange}
      onRun={onRun}
      onSelection={onSelection}
      label="SQL for warehouse"
      {...props}
    />,
  );
  const view = EditorView.findFromDOM(
    rendered.container.querySelector<HTMLElement>('.cm-editor')!,
  )!;
  return { ...rendered, view, onRun, onSelection, onChange };
}
/** ⌘/Ctrl+Enter, as CodeMirror reads `Mod-Enter`: Ctrl off a Mac, as jsdom is. */
const modEnter = (view: EditorView) =>
  runScopeHandlers(
    view,
    new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, metaKey: false }),
    'editor',
  );

describe('the SQL editor (T535, AC-387)', () => {
  it('is labelled, in the app’s CodeMirror, with line numbers', () => {
    const { container } = setUp();
    expect(container.querySelector('.cm-content')?.getAttribute('aria-label')).toBe(
      'SQL for warehouse',
    );
    expect(container.querySelector('.cm-lineNumbers')).not.toBeNull();
  });

  it('runs the whole text with ⌘/Ctrl+Enter when nothing is selected', () => {
    const { view, onRun } = setUp();
    expect(modEnter(view)).toBe(true);
    expect(onRun).toHaveBeenCalledWith(TEXT);
  });

  it('runs only the selection with ⌘/Ctrl+Enter, and says what is selected as it changes', () => {
    const { view, onRun, onSelection } = setUp();
    act(() => {
      view.dispatch({ selection: { anchor: 10, head: 18 } });
    });
    expect(onSelection).toHaveBeenLastCalledWith('SELECT 2');
    modEnter(view);
    expect(onRun).toHaveBeenLastCalledWith('SELECT 2');
    act(() => {
      view.dispatch({ selection: { anchor: 3 } });
    });
    expect(onSelection).toHaveBeenLastCalledWith('');
  });

  it('puts a name chosen elsewhere in at the cursor (T539)', () => {
    const { view, rerender, onChange } = setUp();
    act(() => {
      view.dispatch({ selection: { anchor: 7 } });
    });
    rerender(
      <SqlEditor
        value={TEXT}
        onChange={onChange}
        onRun={vi.fn()}
        onSelection={vi.fn()}
        label="SQL for warehouse"
        insertion={{ text: 'public.orders' }}
      />,
    );
    expect(onChange).toHaveBeenLastCalledWith('SELECT public.orders1;\nSELECT 2');
  });
});
