import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import { textDocumentFromMarkdown } from '@wechart/core';

import { TextTile } from '../../tiles/text/TextTile';
import { elementAt, type DashboardDocument, type Tile } from '../model/document';
import { TileProperties } from './TileProperties';

/**
 * T394, AC-302: WHEN the user selects a markdown tile in edit mode, THE
 * SYSTEM SHALL let them edit its text, and render the change (gap 12).
 * `Fails when: a markdown tile's text can't be changed in the UI.`
 *
 * The Properties panel on a document it changes, the tile drawn beside it as
 * the dashboard draws it: a markdown tile inside a section, as a dashboard
 * nests one.
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
          items: [{ id: 'note', kind: 'markdown', w: 6, h: 18, text: '## Old' }],
        },
      ],
    },
  ],
};

function Editing() {
  const [document, setDocument] = useState(DOCUMENT);
  const tile = elementAt(document, 'note') as Tile;
  return (
    <>
      <TileProperties
        dashboardId="d1"
        document={document}
        selected="note"
        onChange={(apply) => {
          setDocument(apply);
        }}
      />
      <div data-testid="tile">
        {/* Drawn as the dashboard now draws a markdown tile: a Text tile (T875). */}
        <TextTile document={textDocumentFromMarkdown(tile.text ?? '')} />
      </div>
    </>
  );
}

describe('a markdown tile’s text in Properties (T394, AC-302)', () => {
  it('is edited there, typed key by key, and drawn as it changes', async () => {
    render(<Editing />);
    const text = screen.getByLabelText('Markdown text');
    expect((text as HTMLTextAreaElement).value).toBe('## Old');

    await userEvent.clear(text);
    await userEvent.type(text, '## Revenue{Enter}Up **12%**');

    expect((text as HTMLTextAreaElement).value).toBe('## Revenue\nUp **12%**');
    const tile = screen.getByTestId('tile');
    // The tile's own heading, ranked under the dashboard's and its section's.
    expect(within(tile).getByRole('heading', { name: 'Revenue' }).tagName).toBe('H3');
    expect(tile.querySelector('strong')?.textContent).toBe('12%');
  });
});
