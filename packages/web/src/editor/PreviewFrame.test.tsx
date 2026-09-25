import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { PreviewFrame } from './PreviewFrame';

/**
 * T032 / AC-034: WHEN the editor is opened from a dashboard tile, THE SYSTEM
 * SHALL offer a preview at the tile's own size and a preview that fills the
 * editor. `Fails when: the preview ignores the tile's width and height …`
 *
 * direction.md §2: "an Actual size / Fit preview at the tile's own size".
 * Layout is not computed here (jsdom), so this pins what the frame *asks
 * for*; `e2e/editor-preview.spec.ts` measures what the browser draws.
 */
const tile = { width: 612, height: 320, chartHeight: 320 };

function draw(height: number | undefined) {
  return <p data-testid="drawn-at">{height === undefined ? 'natural' : String(height)}</p>;
}

describe('opened on its own', () => {
  it('draws the preview in a tile filling the editor, with no size to choose', () => {
    // The editor reached from Explore has no tile, so there is no "actual
    // size" to offer. The chart is still drawn in a tile, as the prototype's
    // editor draws it (T257, recheck-chart-editor N3).
    render(<PreviewFrame>{draw}</PreviewFrame>);

    expect(screen.queryByRole('button', { name: 'Actual size' })).toBeNull();
    expect(screen.getByTestId('preview-frame').dataset['size']).toBe('fill');
    expect(screen.getByTestId('drawn-at').textContent).toBe('natural');
  });
});

describe('opened from a tile', () => {
  it('starts at the tile’s own size', () => {
    /**
     * The point of opening from a tile is seeing the chart as it will sit
     * there, so that is the first thing shown — not a larger preview in which
     * a crowded axis or a clipped legend would look fine.
     */
    render(<PreviewFrame tile={tile}>{draw}</PreviewFrame>);

    const frame = screen.getByTestId('preview-frame');
    expect(frame.style.width).toBe('612px');
    expect(frame.style.height).toBe('320px');
    expect(screen.getByRole('button', { name: 'Actual size' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
  });

  it('gives the chart the height the tile gives it', () => {
    // The dashboard hands a tile's chart `h × 8px`; the preview must draw it
    // the same, or "actual size" would be a different chart.
    render(<PreviewFrame tile={tile}>{draw}</PreviewFrame>);

    expect(screen.getByTestId('drawn-at').textContent).toBe('320');
  });

  it('fills the editor when Fit is chosen', async () => {
    render(<PreviewFrame tile={tile}>{draw}</PreviewFrame>);

    await userEvent.click(screen.getByRole('button', { name: 'Fit' }));

    const frame = screen.getByTestId('preview-frame');
    expect(frame.style.width).toBe('100%');
    expect(frame.dataset['size']).toBe('fit');
    expect(screen.getByRole('button', { name: 'Fit' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Actual size' }).getAttribute('aria-pressed')).toBe(
      'false',
    );
  });

  it('goes back to the tile’s size', async () => {
    render(<PreviewFrame tile={tile}>{draw}</PreviewFrame>);
    await userEvent.click(screen.getByRole('button', { name: 'Fit' }));

    await userEvent.click(screen.getByRole('button', { name: 'Actual size' }));

    expect(screen.getByTestId('preview-frame').style.width).toBe('612px');
  });
});
