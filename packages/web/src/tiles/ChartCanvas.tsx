import { echarts, optionFor } from '@wechart/charts';
import type { RenderSpec } from '@wechart/core';
import { useLayoutEffect, useRef } from 'react';

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
}

const DEFAULT_HEIGHT = 320;

export function ChartCanvas({ spec, height = DEFAULT_HEIGHT }: ChartCanvasProps) {
  const node = useRef<HTMLDivElement | null>(null);
  const instance = useRef<ReturnType<typeof echarts.init> | null>(null);

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

    return () => {
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
      style={{ height: `${String(height)}px`, width: '100%' }}
    />
  );
}
