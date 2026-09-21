import { describe, expect, it, vi } from 'vitest';

import { CLICK_SLOP_PX, itemClicks, type ItemEvent } from './itemClick';

/**
 * T093 / AC-087, the delivery half: recognising that an item was clicked.
 *
 * **Not built on ECharts' own `click`**, and that is the single most important
 * thing here. `docs/research/echarts.md` reads zrender 6.1.0's `Handler.ts`
 * and finds that `click` is *dropped* when press and release land on different
 * zrender elements or the pointer moved more than 4 px — and a dropped click
 * fires nothing at all, not even at the instance level. On a surface that also
 * drags to select, that would silently lose marks. `mousedown` and `mouseup`
 * are dispatched unconditionally, so the pair is strictly more robust.
 *
 * The movement threshold is rule 47's, not zrender's: "A drag of 5 px or more
 * is never treated as a click." The *drag* that 5 px begins is AC-088's, and
 * T094 builds it; what is here is the half that keeps a drag from being
 * mistaken for a click in the meantime.
 */
const press = (over: string, x: number, y: number, modifier = false): ItemEvent => ({
  item: over,
  x,
  y,
  toggle: modifier,
});

describe('recognising a click on a chart item', () => {
  it('reports a press and release on the same item', () => {
    const onClick = vi.fn();
    const clicks = itemClicks(onClick);

    clicks.down(press('bar-1', 10, 10));
    clicks.up(press('bar-1', 10, 10));

    expect(onClick).toHaveBeenCalledWith({ item: 'bar-1', toggle: false });
  });

  it('carries the modifier that decides replace or toggle', () => {
    const onClick = vi.fn();
    const clicks = itemClicks(onClick);

    clicks.down(press('bar-1', 10, 10, true));
    clicks.up(press('bar-1', 10, 10, true));

    expect(onClick).toHaveBeenCalledWith({ item: 'bar-1', toggle: true });
  });

  it('tolerates the wobble of a real press', () => {
    // A press is never perfectly still. Anything under the threshold is the
    // hand, not an intention.
    const onClick = vi.fn();
    const clicks = itemClicks(onClick);

    clicks.down(press('bar-1', 10, 10));
    clicks.up(press('bar-1', 13, 12));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('is not a click once the pointer has moved 5 px', () => {
    // rule 47's threshold exactly: 5 px is already a drag, not a click.
    const onClick = vi.fn();
    const clicks = itemClicks(onClick);

    clicks.down(press('bar-1', 10, 10));
    clicks.up(press('bar-1', 10 + CLICK_SLOP_PX, 10));

    expect(onClick).not.toHaveBeenCalled();
  });

  it('is not a click when the release lands on a different item', () => {
    // Pressing one bar and releasing on another is not a decision about
    // either of them.
    const onClick = vi.fn();
    const clicks = itemClicks(onClick);

    clicks.down(press('bar-1', 10, 10));
    clicks.up(press('bar-2', 11, 10));

    expect(onClick).not.toHaveBeenCalled();
  });

  it('reports a release on empty space, so the marking can be cleared', () => {
    // rule 47: "Clicking an empty plot area unmarks that tile's marking." The
    // caller decides what that means; this only says where the click landed.
    const onClick = vi.fn();
    const clicks = itemClicks(onClick);

    clicks.down({ item: null, x: 10, y: 10, toggle: false });
    clicks.up({ item: null, x: 10, y: 10, toggle: false });

    expect(onClick).toHaveBeenCalledWith({ item: null, toggle: false });
  });

  it('ignores a release that was never pressed', () => {
    // A pointer released over the chart after being pressed outside it — a
    // drag that started on the page and ended here.
    const onClick = vi.fn();
    const clicks = itemClicks(onClick);

    clicks.up(press('bar-1', 10, 10));

    expect(onClick).not.toHaveBeenCalled();
  });

  it('forgets the press once it has been used, so one press is one click', () => {
    const onClick = vi.fn();
    const clicks = itemClicks(onClick);

    clicks.down(press('bar-1', 10, 10));
    clicks.up(press('bar-1', 10, 10));
    clicks.up(press('bar-1', 10, 10));

    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
