import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { textDocumentFromMarkdown } from '@wechart/core';

import type { DashboardDocument } from '../model/document';
import { TileProperties } from './TileProperties';

/**
 * T876 / AC-302: … "Edit text on the canvas", the first control of its
 * Properties (reached by keyboard as Enter on the focused tile, then Enter)
 * … and Properties SHALL hold no markdown source.
 * `Fails when: … or Properties shows a markdown textarea.`
 *
 * A Text tile inside a section, as a dashboard nests one, and a markdown tile
 * saved before R80, which reads as the Text tile it now is (T875).
 */
const DOCUMENT: DashboardDocument = {
  schemaVersion: 1,
  title: 'Notes',
  settings: { width: 'fixed' },
  pages: [
    {
      id: 'only',
      title: 'Only',
      items: [
        {
          id: 'section',
          kind: 'section',
          title: 'Detail',
          items: [
            {
              id: 'note',
              kind: 'text',
              w: 6,
              h: 18,
              document: textDocumentFromMarkdown('## Old'),
            },
            { id: 'legacy', kind: 'markdown', w: 6, h: 18, text: '## Older' },
          ],
        },
      ],
    },
  ],
};

function opened(selected: string) {
  const onEditText = vi.fn();
  render(
    <TileProperties
      dashboardId="d1"
      document={DOCUMENT}
      selected={selected}
      onChange={() => undefined}
      onEditText={onEditText}
    />,
  );
  return onEditText;
}

describe('a Text tile’s Properties (T876, AC-302)', () => {
  it('starts with "Edit text on the canvas", which edits it there, and holds no markdown', async () => {
    const onEditText = opened('note');
    const edit = screen.getByRole('button', { name: 'Edit text on the canvas' });
    // The panel's first control: what Enter on the focused tile reaches.
    const controls = document.querySelectorAll('button, input, select, textarea, summary');
    expect(controls[0]).toBe(edit);
    expect(edit.hasAttribute('data-panel-first')).toBe(true);
    expect(screen.getByText('Or double-click the tile. Esc leaves the text.')).toBeTruthy();
    expect(document.querySelector('textarea')).toBeNull();
    expect(screen.queryByLabelText('Markdown text')).toBeNull();

    await userEvent.click(edit);
    expect(onEditText).toHaveBeenCalledWith('note');
  });

  it('is the same for a markdown tile saved before R80: no markdown source', async () => {
    const onEditText = opened('legacy');
    expect(document.querySelector('textarea')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Edit text on the canvas' }));
    expect(onEditText).toHaveBeenCalledWith('legacy');
  });
});
