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
  readonly onItemClick?: ((item: ClickedItem) => void) | undefined;
}

const DEFAULT_HEIGHT = 320;

export function ChartCanvas({ spec, height = DEFAULT_HEIGHT, onItemClick }: ChartCanvasProps) {
  const node = useRef<HTMLDivElement | null>(null);
  const instance = useRef<ReturnType<typeof echarts.init> | null>(null);
  /** The latest, read by a click without rebinding the handlers each render. */
  const clicked = useRef(onItemClick);
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
    const clicks = itemClicks(({ item }) => {
      const [name, seriesName] = (item ?? '').split('\u0000');
      clicked.current?.({ name, seriesName });
    });
    const at = (params: {
      name?: string;
      seriesName?: string;
      event?: { offsetX?: number; offsetY?: number };
    }) => ({
      // The pair carries both names; which one a click stands for is the
      // dashboard's to decide, by chart type (`crossfilter/clicked.ts`).
      item: `${params.name ?? ''}\u0000${params.seriesName ?? ''}`,
      x: params.event?.offsetX ?? 0,
      y: params.event?.offsetY ?? 0,
      toggle: false,
    });
    const onDown = (params: unknown) => {
      clicks.down(at(params as Parameters<typeof at>[0]));
    };
    const onUp = (params: unknown) => {
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
    />
  );
}
