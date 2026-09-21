import { describe, expect, it, vi } from 'vitest';

import { CLICK_SLOP_PX, itemClicks } from './itemClick';
import { dragGesture } from './dragOverlay';
import { BAR_SAMPLES, insideShape, touchesSpan, type Shape } from './hitTest';

/**
 * T094 / AC-088: WHEN the user drags a rectangle, or Alt-drags a lasso, over a
 * tile that marks, THE SYSTEM SHALL mark every item the shape touches, and a
 * press-and-release without movement SHALL be treated as a click, not a
 * selection.
 * `Fails when: a drag of at least 5 pixels is treated as a click, or a click
 * is treated as an empty selection.`
 *
 * Two separable halves, tested separately: the geometry of "touches", and the
 * gesture that decides drag from click.
 *
 * The gesture half matters more than it looks. A click misread as a selection
 * marks whatever a zero-area shape encloses — nothing — so the user's marking
 * silently empties instead of moving to what they clicked. That is why the
 * last group asserts the two gestures are **complementary**: for any movement,
 * exactly one of them fires. Tested independently they could both fire, or
 * neither, at the boundary.
 */
const rect: Shape = { kind: 'rect', x0: 10, y0: 10, x1: 50, y1: 30 };

/** A diamond around (30, 30), so edges are not axis-aligned. */
const lasso: Shape = {
  kind: 'lasso',
  points: [
    [30, 10],
    [50, 30],
    [30, 50],
    [10, 30],
  ],
};

describe('what a shape touches', () => {
  describe('a rectangle', () => {
    it('takes a point inside it', () => {
      expect(insideShape(rect, 30, 20)).toBe(true);
    });

    it('leaves a point outside it', () => {
      expect(insideShape(rect, 60, 20)).toBe(false);
      expect(insideShape(rect, 30, 40)).toBe(false);
    });

    it('takes a point on its edge, because touching is touching', () => {
      expect(insideShape(rect, 10, 10)).toBe(true);
      expect(insideShape(rect, 50, 30)).toBe(true);
    });

    it('is the same rectangle dragged in any direction', () => {
      // A drag up and to the left produces x1 < x0. Normalising at the edge
      // rather than in every caller keeps "did it touch" one question.
      const backwards: Shape = { kind: 'rect', x0: 50, y0: 30, x1: 10, y1: 10 };

      expect(insideShape(backwards, 30, 20)).toBe(true);
      expect(insideShape(backwards, 60, 20)).toBe(false);
    });
  });

  describe('a lasso', () => {
    it('takes a point inside the shape', () => {
      expect(insideShape(lasso, 30, 30)).toBe(true);
    });

    it('leaves a point outside the shape but inside its bounding box', () => {
      // The corner of the box the diamond does not reach. A lasso that marked
      // this would just be a rectangle with extra steps.
      expect(insideShape(lasso, 12, 12)).toBe(false);
    });

    it('leaves a point well outside', () => {
      expect(insideShape(lasso, 100, 100)).toBe(false);
    });

    it('handles a concave shape, which is most of why anyone lassos', () => {
      // A C-shape: the gap is outside even though it sits between two parts
      // of the polygon.
      const c: Shape = {
        kind: 'lasso',
        points: [
          [0, 0],
          [40, 0],
          [40, 10],
          [10, 10],
          [10, 30],
          [40, 30],
          [40, 40],
          [0, 40],
        ],
      };

      expect(insideShape(c, 5, 20)).toBe(true);
      expect(insideShape(c, 25, 20)).toBe(false);
    });
  });

  describe('an item with length, such as a bar', () => {
    it('is touched when the shape covers only part of it', () => {
      /**
       * A bar runs from its base to its value, and a rectangle dragged across
       * the top of a tall bar touches it without containing either end. Tested
       * as the prototype does it — sampling along the length — because a bar
       * is not a point and marking it only when its tip is enclosed would miss
       * the ordinary case of dragging across a chart.
       */
      const tall = touchesSpan(rect, [30, 0], [30, 100]);

      expect(tall).toBe(true);
    });

    it('is left alone when the shape misses its length entirely', () => {
      expect(touchesSpan(rect, [80, 0], [80, 100])).toBe(false);
    });

    it('is touched at either end', () => {
      expect(touchesSpan(rect, [30, 20], [30, 200])).toBe(true);
      expect(touchesSpan(rect, [30, -200], [30, 20])).toBe(true);
    });

    it('samples enough of the length to catch a thin shape crossing it', () => {
      // The sampling is an approximation, and its resolution is the promise:
      // a shape thinner than the gap between samples can slip through. Stated
      // here so the number is a decision rather than an accident.
      expect(BAR_SAMPLES).toBeGreaterThanOrEqual(8);
    });
  });
});

describe('drag or click', () => {
  const at = (x: number, y: number, alt = false) => ({ x, y, alt });

  it('makes a rectangle from an ordinary drag', () => {
    const onShape = vi.fn();
    const drag = dragGesture(onShape);

    drag.down(at(10, 10));
    drag.move(at(50, 30));
    drag.up(at(50, 30));

    expect(onShape).toHaveBeenCalledWith({ kind: 'rect', x0: 10, y0: 10, x1: 50, y1: 30 });
  });

  it('makes a lasso when Alt is held, as Spotfire does', () => {
    const onShape = vi.fn();
    const drag = dragGesture(onShape);

    drag.down(at(10, 10, true));
    drag.move(at(30, 20, true));
    drag.move(at(20, 40, true));
    drag.up(at(20, 40, true));

    const shape = onShape.mock.calls[0]?.[0] as Shape;
    expect(shape.kind).toBe('lasso');
    // Every point the pointer visited, so the shape is the path that was
    // drawn rather than a box around it.
    expect(shape.kind === 'lasso' && shape.points).toEqual([
      [10, 10],
      [30, 20],
      [20, 40],
    ]);
  });

  it('makes no shape at all from a press and release that did not move', () => {
    // The criterion's second failing state. A zero-area shape encloses
    // nothing, so this would silently empty the marking instead of moving it
    // to whatever was clicked.
    const onShape = vi.fn();
    const drag = dragGesture(onShape);

    drag.down(at(10, 10));
    drag.up(at(12, 11));

    expect(onShape).not.toHaveBeenCalled();
  });

  it('is a drag from exactly 5 px, which is where rule 47 puts the line', () => {
    const onShape = vi.fn();
    const drag = dragGesture(onShape);

    drag.down(at(10, 10));
    drag.move(at(10 + CLICK_SLOP_PX, 10));
    drag.up(at(10 + CLICK_SLOP_PX, 10));

    expect(onShape).toHaveBeenCalledTimes(1);
  });

  it('stays a drag once it has become one, even if the pointer comes back', () => {
    // Otherwise a drag out and back would end as a click and mark whatever
    // happened to be under the release.
    const onShape = vi.fn();
    const drag = dragGesture(onShape);

    drag.down(at(10, 10));
    drag.move(at(60, 60));
    drag.up(at(11, 10));

    expect(onShape).toHaveBeenCalledTimes(1);
  });

  describe('the two gestures together', () => {
    /**
     * For any movement, exactly one of a click and a drag happens. Tested
     * apart they could both fire or neither at the boundary, and both of those
     * are the criterion's failing states — one marks twice, the other empties
     * the marking.
     */
    const outcomes = (dx: number) => {
      const onClick = vi.fn();
      const onShape = vi.fn();
      const clicks = itemClicks(onClick);
      const drag = dragGesture(onShape);

      clicks.down({ item: 'bar-1', x: 0, y: 0, toggle: false });
      drag.down(at(0, 0));
      drag.move(at(dx, 0));
      clicks.up({ item: 'bar-1', x: dx, y: 0, toggle: false });
      drag.up(at(dx, 0));

      return { clicked: onClick.mock.calls.length, dragged: onShape.mock.calls.length };
    };

    it('treats no movement as a click and nothing else', () => {
      expect(outcomes(0)).toEqual({ clicked: 1, dragged: 0 });
    });

    it('treats a movement just under the line as a click and nothing else', () => {
      expect(outcomes(CLICK_SLOP_PX - 1)).toEqual({ clicked: 1, dragged: 0 });
    });

    it('treats the line itself as a drag and nothing else', () => {
      expect(outcomes(CLICK_SLOP_PX)).toEqual({ clicked: 0, dragged: 1 });
    });

    it('treats a long drag as a drag and nothing else', () => {
      expect(outcomes(200)).toEqual({ clicked: 0, dragged: 1 });
    });
  });
});
