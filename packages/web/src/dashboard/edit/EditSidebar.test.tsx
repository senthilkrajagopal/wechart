import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { EditSidebar, openSidebarPanel } from './EditSidebar';

/**
 * T182 / AC-176: a tile's Enter opens its Properties with focus there
 * (direction.md: "Enter focuses its Properties"). The key is handled on the
 * tile, far from the sidebar, so it asks the sidebar for the panel.
 */
const panels = { add: <p>Palette</p>, properties: <p>This tile’s properties</p> };

describe('asking the sidebar for a panel', () => {
  it('opens the panel asked for and moves focus into it', () => {
    render(<EditSidebar panels={panels} />);

    act(() => {
      openSidebarPanel('Properties');
    });

    const panel = screen.getByRole('tabpanel');
    expect(panel.textContent).toBe('This tile’s properties');
    expect(screen.getByRole('tab', { name: 'Properties' }).getAttribute('aria-selected')).toBe(
      'true',
    );
    expect(document.activeElement).toBe(panel);
  });

  it('moves focus to the control the panel names first, where it names one (T876, AC-302)', () => {
    render(
      <EditSidebar
        panels={{
          ...panels,
          properties: (
            <button type="button" data-panel-first="">
              Edit text on the canvas
            </button>
          ),
        }}
      />,
    );

    act(() => {
      openSidebarPanel('Properties');
    });

    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Edit text on the canvas' }),
    );
  });

  it('moves focus into it when it is the panel already open', () => {
    // A second tile's Enter, with Properties still open from the first:
    // nothing about the panel changes, and focus must move all the same.
    render(
      <>
        <button type="button">A tile</button>
        <EditSidebar panels={panels} />
      </>,
    );
    act(() => {
      openSidebarPanel('Properties');
    });
    screen.getByRole('button', { name: 'A tile' }).focus();

    act(() => {
      openSidebarPanel('Properties');
    });

    expect(document.activeElement).toBe(screen.getByRole('tabpanel'));
  });

  /**
   * T222 / AC-203: a tile chosen by a click shows its Properties while the
   * tile keeps focus — its keys still move and resize it.
   */
  it('shows the panel asked for without focus, leaving focus where it was', () => {
    render(
      <>
        <button type="button">A tile</button>
        <EditSidebar panels={panels} />
      </>,
    );
    screen.getByRole('button', { name: 'A tile' }).focus();

    act(() => {
      openSidebarPanel('Properties', { focus: false });
    });

    expect(screen.getByRole('tab', { name: 'Properties' }).getAttribute('aria-selected')).toBe(
      'true',
    );
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'A tile' }));
  });
});
