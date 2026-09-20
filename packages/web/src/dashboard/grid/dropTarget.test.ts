import { describe, expect, it } from 'vitest';

import { dropTargetAt, type DropCandidate } from './dropTarget';

/**
 * T062 / AC-056: WHEN the user drags a tile by its grip, THE SYSTEM SHALL show
 * a drop marker and move the tile to the marked position, including onto a
 * page tab or a tab-group label, which moves it into that tab.
 * `Fails when: no drop marker appears, or a drop on a tab label leaves the
 * tile in its original container.`
 *
 * The decision is taken against rectangles rather than against the DOM, so it
 * can be tested without a layout engine — jsdom measures everything as zero,
 * which would make every geometric answer here vacuously the same. The
 * component collects the rectangles and asks this.
 *
 * `docs/research/dashboard-grid.md` settles why this is ours to write: a tile
 * inside a tab group and a page-tab label outside it have to be able to see
 * each other, which dnd-kit's nested contexts cannot do, and react-grid-layout
 * has no notion of a drop target outside its own grid at all.
 */
const box = (x: number, y: number, width: number, height: number) => ({ x, y, width, height });

/** A page with two tiles side by side, and a tab-group label above it. */
const CANDIDATES: readonly DropCandidate[] = [
  {
    kind: 'tab-label',
    key: 'tabs:group-1:b',
    box: box(400, 0, 80, 24),
  },
  {
    kind: 'container',
    key: 'page:overview',
    box: box(0, 40, 1000, 400),
    tiles: [
      { id: 'left', box: box(0, 40, 400, 400) },
      { id: 'right', box: box(420, 40, 400, 400) },
    ],
  },
];

describe('what is under the pointer', () => {
  it('finds nothing outside every candidate', () => {
    expect(dropTargetAt({ x: 2000, y: 2000 }, CANDIDATES, 'left')).toBeNull();
  });

  it('finds the container the pointer is over', () => {
    const target = dropTargetAt({ x: 200, y: 200 }, CANDIDATES, 'right');

    expect(target?.key).toBe('page:overview');
  });

  it('finds a tab label, which is the case the criterion singles out', () => {
    const target = dropTargetAt({ x: 440, y: 12 }, CANDIDATES, 'left');

    expect(target?.key).toBe('tabs:group-1:b');
    // A tab label has no position inside it to aim at — the tile goes to the
    // end of that tab, which is what direction.md says a drop on a label does.
    expect(target?.index).toBeNull();
  });

  it('prefers a tab label to a container underneath it', () => {
    const overlapping: readonly DropCandidate[] = [
      { kind: 'container', key: 'page:overview', box: box(0, 0, 1000, 400), tiles: [] },
      { kind: 'tab-label', key: 'tabs:group-1:b', box: box(400, 0, 80, 24) },
    ];

    // The label sits inside the canvas, so whichever is checked first decides.
    // Getting this the wrong way round is exactly the criterion's failing
    // state: the drop lands in the container and the tile never moves tab.
    expect(dropTargetAt({ x: 440, y: 12 }, overlapping, 'left')?.key).toBe('tabs:group-1:b');
  });

  it('prefers the innermost container when they are nested', () => {
    const nested: readonly DropCandidate[] = [
      { kind: 'container', key: 'page:overview', box: box(0, 0, 1000, 400), tiles: [] },
      { kind: 'container', key: 'sec:detail', box: box(100, 100, 300, 200), tiles: [] },
    ];

    expect(dropTargetAt({ x: 200, y: 150 }, nested, 'left')?.key).toBe('sec:detail');
  });
});

describe('where in the container', () => {
  it('goes before a tile when the pointer is on its leading half', () => {
    expect(dropTargetAt({ x: 100, y: 200 }, CANDIDATES, 'dragged')?.index).toBe(0);
  });

  it('goes after a tile when the pointer is past its middle', () => {
    expect(dropTargetAt({ x: 300, y: 200 }, CANDIDATES, 'dragged')?.index).toBe(1);
  });

  it('goes to the end when the pointer is past every tile', () => {
    expect(dropTargetAt({ x: 900, y: 200 }, CANDIDATES, 'dragged')?.index).toBe(2);
  });

  it('puts a later row after an earlier one, whatever the x says', () => {
    // The grid wraps as soon as a container holds more than twelve columns.
    // A full-width row beneath has its midpoint near the left edge, so a
    // pointer over on the right of the row above looks "past" it if only x is
    // compared — and the drop falls to the end of the container instead of
    // where the marker was. Found by the browser, pinned here.
    const rows: readonly DropCandidate[] = [
      {
        kind: 'container',
        key: 'page:overview',
        box: box(0, 0, 1000, 800),
        tiles: [
          { id: 'top-left', box: box(0, 0, 480, 300) },
          { id: 'top-right', box: box(520, 0, 480, 300) },
          { id: 'full-width-below', box: box(0, 320, 1000, 300) },
        ],
      },
    ];

    // Four fifths of the way across the top-right tile: after both of the top
    // row, and before the row beneath.
    expect(dropTargetAt({ x: 900, y: 150 }, rows, 'dragged')?.index).toBe(2);
    // And on the bottom row, past its middle, it goes last.
    expect(dropTargetAt({ x: 900, y: 450 }, rows, 'dragged')?.index).toBe(3);
  });

  it('reads a row of unequal heights by where the items start', () => {
    // Grid items carry explicit heights, so two in one row share a top but not
    // a bottom. A pointer over the short tile but below its lower edge is
    // inside no item's band — and asking "does this box contain the pointer's
    // y" then skips it and the drop lands one place too far along. Since T061
    // shipped resize, a row of mixed heights is one drag away.
    const uneven: readonly DropCandidate[] = [
      {
        kind: 'container',
        key: 'page:overview',
        box: box(0, 0, 1000, 400),
        tiles: [
          { id: 'tall', box: box(0, 0, 480, 320) },
          { id: 'short', box: box(520, 0, 480, 64) },
        ],
      },
    ];

    // On the short tile's leading half, but 100px down — past its bottom.
    expect(dropTargetAt({ x: 600, y: 100 }, uneven, 'dragged')?.index).toBe(1);
    // And past its middle, still below it: after both.
    expect(dropTargetAt({ x: 900, y: 100 }, uneven, 'dragged')?.index).toBe(2);
  });

  it('ignores the tile being dragged when counting the position', () => {
    // 'right' is the one in hand, so it is not among the tiles the pointer can
    // land before or after. Counting it would make a tile dropped just past
    // itself land one place further along than the marker showed.
    const target = dropTargetAt({ x: 900, y: 200 }, CANDIDATES, 'right');

    expect(target?.index).toBe(1);
  });
});

describe('the marker', () => {
  it('is a bar at the insertion point, tall as the tiles beside it', () => {
    const target = dropTargetAt({ x: 300, y: 200 }, CANDIDATES, 'dragged');

    // Between the two tiles: in the gutter, spanning their height.
    expect(target?.marker.x).toBeGreaterThanOrEqual(400);
    expect(target?.marker.x).toBeLessThanOrEqual(420);
    expect(target?.marker.height).toBe(400);
    expect(target?.marker.width).toBeGreaterThan(0);
  });

  it('is the label itself when the target is a tab', () => {
    const target = dropTargetAt({ x: 440, y: 12 }, CANDIDATES, 'left');

    // Nothing to insert between, so the marker outlines what will receive it.
    expect(target?.marker).toEqual(box(400, 0, 80, 24));
  });

  it('is somewhere even in an empty container, which is where it matters most', () => {
    const empty: readonly DropCandidate[] = [
      { kind: 'container', key: 'sec:new', box: box(0, 0, 600, 200), tiles: [] },
    ];
    const target = dropTargetAt({ x: 300, y: 100 }, empty, 'dragged');

    // An empty section gives the pointer no tile to aim at, and a marker that
    // vanished there would say the drop was illegal when it is the one place
    // the user most needs to be told it is not.
    expect(target?.index).toBe(0);
    expect(target?.marker.height).toBeGreaterThan(0);
  });
});
