import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Canvas, EMPTY_CANVAS_ROWS, type GridTile } from './Canvas';
import { COLUMNS, GUTTER_PX, ROW_UNIT_PX } from './geometry';

/**
 * T060 / AC-054: WHILE editing, THE SYSTEM SHALL show a 12-column grid on the
 * canvas and snap every tile to whole columns and to 8-pixel row units.
 *
 * `geometry.test.ts` proves the arithmetic. This proves the canvas actually
 * applies it — the failure the criterion describes is a *tile* that is not on
 * the grid, not a function that could have put it there.
 *
 * So the sizes fed in here are deliberately off-grid. A canvas that trusted
 * its input would pass every assertion about gridlines and fail these, which
 * is the point: a saved document can carry a fractional width (an older
 * format, a hand-edited body, a resize that rounded the wrong way), and the
 * criterion says the tile lands on whole columns regardless.
 */
const OFF_GRID: readonly GridTile[] = [
  { id: 'a', w: 4.7, h: 12.4 },
  { id: 'b', w: 0, h: 0 },
  { id: 'c', w: 99, h: 3.5 },
  { id: 'd', w: 6, h: 20 },
];

const render_ = (editing: boolean) =>
  render(
    <Canvas tiles={OFF_GRID} editing={editing}>
      {(tile) => <span>{tile.id}</span>}
    </Canvas>,
  );

const spanOf = (element: HTMLElement) =>
  Number(/span\s+(\d+)/.exec(element.style.gridColumn ?? '')?.[1] ?? NaN);

const heightOf = (element: HTMLElement) => Number(/([\d.]+)px/.exec(element.style.height)?.[1]);

describe('every tile lands on the grid', () => {
  it('spans a whole number of columns, inside the twelve', () => {
    render_(true);

    const tiles = screen.getAllByTestId('grid-tile');
    expect(tiles).toHaveLength(OFF_GRID.length);

    for (const tile of tiles) {
      const span = spanOf(tile);
      expect(Number.isInteger(span)).toBe(true);
      expect(span).toBeGreaterThanOrEqual(1);
      expect(span).toBeLessThanOrEqual(COLUMNS);
    }
  });

  it('is a whole number of 8-pixel row units tall', () => {
    render_(true);

    for (const tile of screen.getAllByTestId('grid-tile')) {
      const height = heightOf(tile);
      expect(height % ROW_UNIT_PX).toBe(0);
      expect(height).toBeGreaterThan(0);
    }
  });

  it('snaps rather than truncates, so a tile keeps the size it was dragged to', () => {
    render_(true);
    const [a] = screen.getAllByTestId('grid-tile');

    // 4.7 columns is a tile being pulled towards 5, and 12.4 row units towards
    // 12 — which is 96px, not 99.2px and not 96.0000001.
    expect(spanOf(a as HTMLElement)).toBe(5);
    expect(heightOf(a as HTMLElement)).toBe(96);
  });

  it('holds a tile inside the grid however wide the document claims it is', () => {
    render_(true);
    const tiles = screen.getAllByTestId('grid-tile');

    expect(spanOf(tiles[1] as HTMLElement)).toBe(1); // w: 0
    expect(spanOf(tiles[2] as HTMLElement)).toBe(COLUMNS); // w: 99
  });

  it('lays the tiles out on twelve columns', () => {
    render_(true);

    // The tiles' spans are meaningless unless the track count matches them.
    const canvas = screen.getByTestId('grid-canvas');
    expect(canvas.style.gridTemplateColumns).toBe(`repeat(${String(COLUMNS)}, minmax(0, 1fr))`);
    // The painted gridlines are a background whose period is computed from
    // this gap. If the canvas and the geometry disagree about the gutter, the
    // grid the user sees stops matching the grid the tiles sit on — silently,
    // because every other assertion here is about spans.
    expect(canvas.style.gap).toBe(`${String(GUTTER_PX)}px`);
  });
});

describe('reporting a resize (AC-055)', () => {
  const dragHandle = (testId: string, by: { x?: number; y?: number }) => {
    const handle = screen.getByTestId(testId);
    // jsdom has no layout, so the canvas measures zero and the column pitch
    // with it. The vertical axis is pure arithmetic on the 8px row unit, so
    // that is what these assert; the horizontal drag is covered in the
    // browser, where there is a real canvas to measure.
    fireEvent.pointerDown(handle, { clientX: 100, clientY: 100, pointerId: 1 });
    if (by.x !== undefined || by.y !== undefined) {
      fireEvent.pointerMove(handle, {
        clientX: 100 + (by.x ?? 0),
        clientY: 100 + (by.y ?? 0),
        pointerId: 1,
      });
    }
    return handle;
  };

  it('reports the new size when the drag ends', () => {
    const onResize = vi.fn();
    render(
      <Canvas tiles={[{ id: 'a', w: 6, h: 40 }]} editing onResize={onResize}>
        {() => null}
      </Canvas>,
    );

    const handle = dragHandle('resize-a-s', { y: ROW_UNIT_PX * 5 });
    fireEvent.pointerUp(handle, { pointerId: 1 });

    expect(onResize).toHaveBeenCalledWith('a', { w: 6, h: 45 });
  });

  it('reports nothing for a press and release that did not move', () => {
    const onResize = vi.fn();
    render(
      <Canvas tiles={[{ id: 'a', w: 6, h: 40 }]} editing onResize={onResize}>
        {() => null}
      </Canvas>,
    );

    const handle = dragHandle('resize-a-s', {});
    fireEvent.pointerUp(handle, { pointerId: 1 });

    // Otherwise a click on a handle puts a change on the edit history that
    // changed nothing, and Undo lights up for it.
    expect(onResize).not.toHaveBeenCalled();
  });

  it('abandons an interrupted gesture rather than committing it', () => {
    const onResize = vi.fn();
    render(
      <Canvas tiles={[{ id: 'a', w: 6, h: 40 }]} editing onResize={onResize}>
        {() => null}
      </Canvas>,
    );

    const handle = dragHandle('resize-a-s', { y: ROW_UNIT_PX * 5 });
    fireEvent.pointerCancel(handle, { pointerId: 1 });

    // The browser took the pointer away — a touch became a scroll, say. The
    // size under it at that moment is not a size anyone chose.
    expect(onResize).not.toHaveBeenCalled();
    expect(screen.queryByTestId('resize-readout')).toBeNull();
  });

  it('shows the readout while dragging and takes it away afterwards', () => {
    render(
      <Canvas tiles={[{ id: 'a', w: 6, h: 40 }]} editing onResize={vi.fn()}>
        {() => null}
      </Canvas>,
    );

    const handle = dragHandle('resize-a-s', { y: ROW_UNIT_PX * 5 });
    expect(screen.getByTestId('resize-readout').textContent).toBe('6 / 12 cols · 50% · 360 px');

    fireEvent.pointerUp(handle, { pointerId: 1 });
    expect(screen.queryByTestId('resize-readout')).toBeNull();
  });

  it('offers no handles at all without somewhere to report to', () => {
    render(
      <Canvas tiles={[{ id: 'a', w: 6, h: 40 }]} editing>
        {() => null}
      </Canvas>,
    );

    // A gesture that goes nowhere is worse than no gesture: the tile would
    // appear resizable and silently forget.
    expect(screen.queryByTestId('resize-a-s')).toBeNull();
  });

  it('offers no handles in view mode', () => {
    render(
      <Canvas tiles={[{ id: 'a', w: 6, h: 40 }]} editing={false} onResize={vi.fn()}>
        {() => null}
      </Canvas>,
    );

    expect(screen.queryByTestId('resize-a-s')).toBeNull();
  });
});

describe('the gridlines', () => {
  it('has somewhere to paint them when the dashboard is still empty', () => {
    render(
      <Canvas tiles={[]} editing>
        {() => null}
      </Canvas>,
    );

    // A display:grid box with no children is zero pixels tall, so the
    // gridlines would paint over nothing — and a brand-new dashboard is
    // exactly where "show a 12-column grid" earns its keep.
    const canvas = screen.getByTestId('grid-canvas');
    expect(canvas.dataset['gridlines']).toBe('true');
    expect(canvas.style.minHeight).toBe(`${String(EMPTY_CANVAS_ROWS * ROW_UNIT_PX)}px`);
  });

  it('are shown while editing', () => {
    render_(true);

    expect(screen.getByTestId('grid-canvas').dataset['gridlines']).toBe('true');
  });

  it('are not shown in view mode, where they would be chrome over the data', () => {
    render_(false);

    expect(screen.getByTestId('grid-canvas').dataset['gridlines']).toBeUndefined();
  });

  it('snaps the tiles in view mode too, because the grid is the layout either way', () => {
    render_(false);

    for (const tile of screen.getAllByTestId('grid-tile')) {
      expect(Number.isInteger(spanOf(tile))).toBe(true);
      expect(heightOf(tile) % ROW_UNIT_PX).toBe(0);
    }
  });
});
