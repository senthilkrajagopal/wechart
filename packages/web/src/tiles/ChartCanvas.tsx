import { echarts, itemClicks, optionFor } from '@wechart/charts';
import type { RenderSpec } from '@wechart/core';
import { useEffect, useLayoutEffect, useRef } from 'react';

import type { ClickedItem } from '../dashboard/crossfilter/clicked';

/**
 * A drawn chart (AC-037).
 *
 * This is the half the headless tests cannot reach. They prove an option is
 * renderable; what happens on a real node — creating an instance, keeping it
 * sized, and disposing it — is a different set of failures, and this is the
 * only place in wechart that touches it.
 *
 * `useLayoutEffect` rather than `useEffect`: the instance has to exist before
 * the browser paints, or the tile flashes empty on every mount.
 */
export interface ChartCanvasProps {
  readonly spec: RenderSpec;
  readonly height?: number;
  /**
   * A click on one of its items, where the dashboard is cross-filtering
   * (AC-117). Absent, the chart takes no clicks at all.
   */
  readonly onItemClick?: ((item: ClickedItem, toggle: boolean) => void) | undefined;
}

const DEFAULT_HEIGHT = 320;

export function ChartCanvas({ spec, height = DEFAULT_HEIGHT, onItemClick }: ChartCanvasProps) {
  const node = useRef<HTMLDivElement | null>(null);
  const instance = useRef<ReturnType<typeof echarts.init> | null>(null);
  /** The latest, read by a click without rebinding the handlers each render. */
  const clicked = useRef(onItemClick);
  /**
   * Whether the release that is on its way landed on one of the chart's
   * items. A click on empty plot area reaches no series handler at all, and
   * unmarks the tile's marking instead (AC-094, direction.md rule 47) — so
   * "nothing was hit" has to be observed rather than waited for. Read on the
   * wrapper's own release, which bubbles up after ECharts has dispatched.
   */
  const onItem = useRef(false);
  useEffect(() => {
    clicked.current = onItemClick;
  }, [onItemClick]);

  useLayoutEffect(() => {
    const element = node.current;
    if (element === null) return undefined;

    // Reuse whatever is already attached to this node. Under StrictMode the
    // effect runs twice, and ECharts throws on a second init for one element.
    const chart = echarts.getInstanceByDom(element) ?? echarts.init(element, null, {});
    instance.current = chart;

    const observer = new ResizeObserver(() => {
      chart.resize();
    });
    observer.observe(element);

    /**
     * A click on an item, as a press and a release in the same place
     * (AC-117). Not ECharts' own `click`: `docs/research/echarts.md` reads
     * zrender 6.1.0 and finds it dropped when the pointer moved more than
     * 4 px or the two landed on different elements, with nothing dispatched
     * at all — a mark that sometimes does nothing, with nothing to debug.
     */
    const clicks = itemClicks(({ item, toggle }) => {
      const [name, seriesName] = (item ?? '').split('\u0000');
      // Ctrl or ⌘ held: a marking toggles the one item rather than replacing
      // itself with it (AC-087). Cross-filtering ignores it.
      clicked.current?.({ name, seriesName }, toggle);
    });
    const at = (params: {
      name?: string;
      seriesName?: string;
      event?: {
        offsetX?: number;
        offsetY?: number;
        event?: { ctrlKey?: boolean; metaKey?: boolean };
      };
    }) => ({
      // The pair carries both names; which one a click stands for is the
      // dashboard's to decide, by chart type (`crossfilter/clicked.ts`).
      item: `${params.name ?? ''}\u0000${params.seriesName ?? ''}`,
      x: params.event?.offsetX ?? 0,
      y: params.event?.offsetY ?? 0,
      // zrender carries the browser's own event under `event.event`.
      toggle: params.event?.event?.ctrlKey === true || params.event?.event?.metaKey === true,
    });
    const onDown = (params: unknown) => {
      clicks.down(at(params as Parameters<typeof at>[0]));
    };
    const onUp = (params: unknown) => {
      // So the release on the wrapper below knows an item took this click.
      onItem.current = true;
      clicks.up(at(params as Parameters<typeof at>[0]));
    };
    /**
     * On the marks alone. Bound without a query these also fire for the axis
     * labels, the legend and the title, none of which carries a member value
     * — and a click on an axis label would then take the tile's selection
     * away with nothing to show for it (T123's review).
     */
    chart.on('mousedown', 'series', onDown);
    chart.on('mouseup', 'series', onUp);

    return () => {
      chart.off('mousedown', onDown);
      chart.off('mouseup', onUp);
      observer.disconnect();
      // "Once disposed, the instance can not be used again" — so the ref goes
      // with it, or the next render would call setOption on a dead instance.
      chart.dispose();
      instance.current = null;
    };
  }, []);

  useLayoutEffect(() => {
    const chart = instance.current;
    if (chart === null || chart.isDisposed()) return;

    // notMerge: a chart type change replaces the option outright. Merging
    // would leave the previous type's series in place beside the new one.
    chart.setOption(optionFor(spec), true);
  }, [spec]);

  return (
    /**
     * `jsx-a11y/no-static-element-interactions` asks for a role and a
     * keyboard path on anything that takes a mouse. The role belongs to the
     * marks inside rather than to this box, and the keyboard path to the same
     * marking is AC-100's — arrow keys between a tile's items, Space to mark
     * the focused one — which the tile carries, because the tile is what
     * takes focus. Answered next door, not here.
     */
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div
      ref={node}
      data-testid="chart-canvas"
      data-chart-type={spec.chartType}
      // What it is highlighting, where a tile pair asks for one (AC-117).
      data-highlight={
        spec.highlight === undefined
          ? undefined
          : `${spec.highlight.kind}:${spec.highlight.member}=${spec.highlight.value}`
      }
      style={{ height: `${String(height)}px`, width: '100%' }}
      /**
       * Mouse events, not pointer events: `pointerup` fires *before*
       * `mouseup`, so on a pointer release the series handler would not yet
       * have said it took the click, and every click on a mark would look
       * like a click on nothing.
       *
       * `jsx-a11y/no-static-element-interactions` asks for a role and a
       * keyboard path on anything that takes a mouse. The role belongs to the
       * marks inside, not to this box, and the keyboard path to the same
       * marking is AC-100's: arrow keys move between a tile's items, Space
       * marks the focused one. It is the tile that takes focus and carries
       * those keys, not this element, so the rule is answered next door
       * rather than here.
       */

      onMouseDown={() => {
        onItem.current = false;
      }}
      onMouseUp={(event) => {
        // A release that no item took: empty plot area, which unmarks this
        // tile's marking (AC-094). Reported as a click with nothing in it.
        if (onItem.current) return;
        clicked.current?.({}, event.ctrlKey || event.metaKey);
      }}
    />
  );
}
