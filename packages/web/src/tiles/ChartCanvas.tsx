import {
  bucketRangeAt,
  bucketStripeFor,
  CLICK_SLOP_PX,
  dragGesture,
  echarts,
  edgeBetween,
  focusedItemOf,
  itemClicks,
  itemsInShape,
  optionFor,
  themed,
  type Canvas,
  type EChartsOption,
  type Point,
} from '@wechart/charts';
import { seriesOf, type MarkingSlot, type RenderSpec } from '@wechart/core';
import { COLORS } from '@wechart/ui';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { clickedName, type ClickedItem } from '../dashboard/crossfilter/clicked';
import { useThemeName } from '../shell/ThemeProvider';

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
  /**
   * A rectangle dragged, or a lasso Alt-dragged, over the chart, where the
   * tile marks (AC-088): every item the shape touches, named as a click
   * names one, and whether Ctrl or ⌘ was held (AC-089). Absent, a drag does
   * nothing.
   */
  readonly onShapeMark?: ((items: readonly ClickedItem[], toggle: boolean) => void) | undefined;
  /**
   * A drag along the x axis, where the tile's marking is in range mode (T386,
   * AC-093): the buckets under its two ends, and whether Ctrl or ⌘ was held,
   * which adds a range rather than replacing the marking. In place of
   * `onShapeMark`: in range mode a drag marks a span of the axis, not a shape.
   */
  readonly onAxisRange?: ((range: { from: string; to: string }, add: boolean) => void) | undefined;
  /**
   * The marked ranges to show as coloured stripes along the x axis (AC-093),
   * each in its marking's colour, placed from their stored bounds alone.
   */
  readonly rangeStripes?:
    | readonly {
        readonly from: string | number;
        readonly to: string | number;
        readonly slot: MarkingSlot;
      }[]
    | undefined;
  /**
   * A right-click on the chart (T266, AC-246): the tile's menu opens at the
   * pointer, and the browser's own menu does not. Absent, the browser's does.
   */
  readonly onContextMenuAt?: ((x: number, y: number) => void) | undefined;
}

const DEFAULT_HEIGHT = 320;
const SVG_NS = 'http://www.w3.org/2000/svg';
/** How thick a marked range's stripe is drawn over the x axis (T386). */
const STRIPE_PX = 6;

/** The x axis's categories, where it is a category axis: the buckets a range spans. */
function xCategoriesOf(option: EChartsOption): readonly string[] | undefined {
  const axes = option.xAxis;
  const first = (Array.isArray(axes) ? axes[0] : axes) as
    { type?: unknown; data?: unknown } | undefined;
  if (first?.type !== 'category' || !Array.isArray(first.data)) return undefined;
  return first.data.map(String);
}

export function ChartCanvas({
  spec,
  height = DEFAULT_HEIGHT,
  onItemClick,
  onShapeMark,
  onAxisRange,
  rangeStripes,
  onContextMenuAt,
}: ChartCanvasProps) {
  /** The page's theme, which the chart is drawn in (AC-211). */
  const theme = useThemeName();
  const node = useRef<HTMLDivElement | null>(null);
  const instance = useRef<ReturnType<typeof echarts.init> | null>(null);
  /** Whether the tooltip up is the keyboard's (T306). */
  const tipShown = useRef(false);
  const [canvas, setCanvas] = useState<Canvas | null>(null);
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
  /**
   * What the legend lists, so a release on one of those words is read as a
   * legend click rather than as a click on empty plot area.
   */
  const seriesNames = useMemo<ReadonlySet<string>>(() => {
    try {
      return new Set(seriesOf(spec).series.map((one) => one.name));
    } catch {
      // A type `seriesOf` does not lay out has no legend of series names.
      return new Set<string>();
    }
  }, [spec]);
  useEffect(() => {
    clicked.current = onItemClick;
  }, [onItemClick]);
  /** The latest, read at the end of a drag. */
  const shaped = useRef(onShapeMark);
  useEffect(() => {
    shaped.current = onShapeMark;
  }, [onShapeMark]);
  /** The latest, read at the end of a drag along the axis (T386). */
  const ranged = useRef(onAxisRange);
  useEffect(() => {
    ranged.current = onAxisRange;
  }, [onAxisRange]);
  /**
   * Whether the press under way has become a drag (AC-088): its release is
   * then the end of a shape, never a click on empty plot area that would
   * unmark the tile's marking.
   */
  const dragging = useRef(false);
  /** Whether the primary button went down on this chart, so its release is this chart's. */
  const pressedHere = useRef(false);

  useLayoutEffect(() => {
    const element = node.current;
    if (element === null) return undefined;

    // Reuse whatever is already attached to this node. Under StrictMode the
    // effect runs twice, and ECharts throws on a second init for one element.
    const chart = echarts.getInstanceByDom(element) ?? echarts.init(element, null, {});
    instance.current = chart;

    /**
     * The box it is drawn in, which the option is laid out for (AC-210): a
     * bar keeps its surface gap only where it is wide enough to. Kept only
     * when it changes, so a resize that ends the same size draws nothing again.
     */
    const measure = () => {
      const next = { width: element.clientWidth, height: element.clientHeight };
      setCanvas((was) =>
        was !== null && was.width === next.width && was.height === next.height ? was : next,
      );
    };
    measure();

    const observer = new ResizeObserver(() => {
      chart.resize();
      measure();
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
      data?: unknown;
      event?: {
        offsetX?: number;
        offsetY?: number;
        event?: { ctrlKey?: boolean; metaKey?: boolean; button?: number };
      };
    }) => ({
      // The pair carries both names; which one a click stands for is the
      // dashboard's to decide, by chart type (`crossfilter/clicked.ts`). A
      // pie's slice by the category it carries, not its written name.
      item: `${clickedName(params)}\u0000${params.seriesName ?? ''}`,
      x: params.event?.offsetX ?? 0,
      y: params.event?.offsetY ?? 0,
      // zrender carries the browser's own event under `event.event`.
      toggle: params.event?.event?.ctrlKey === true || params.event?.event?.metaKey === true,
    });
    /**
     * Only the primary button marks (T190 stage 7's review): zrender reports
     * every button's press and release alike, so a right-click marked the
     * item under it, or unmarked the tile from empty plot area.
     */
    const primary = (params: unknown) =>
      ((params as Parameters<typeof at>[0]).event?.event?.button ?? 0) === 0;
    const onDown = (params: unknown) => {
      if (!primary(params)) return;
      clicks.down(at(params as Parameters<typeof at>[0]));
    };
    const onUp = (params: unknown) => {
      if (!primary(params)) return;
      // So the release on the wrapper below knows an item took this click.
      onItem.current = true;
      // A drag that came back to where it began is a shape, never a click too.
      if (dragging.current) {
        clicks.cancel();
        return;
      }
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

    /**
     * A click on a trellis panel's header marks every item in that panel
     * (AC-091). The titles carry `triggerEvent` for this; the panel is taken
     * by its index rather than by the words shown, because a panel of time
     * is titled by its granularity and the title is not the value.
     */
    const panelClicks = itemClicks(({ item, toggle }) => {
      if (item === null) return;
      onItem.current = true;
      clicked.current?.({ panelIndex: Number(item) }, toggle);
    });
    // Where on the header, so a drag along it is told from a click on it.
    const panelAt = (params: {
      componentIndex?: number;
      event?: { offsetX?: number; offsetY?: number };
    }) => ({
      item: String(params.componentIndex ?? 0),
      x: params.event?.offsetX ?? 0,
      y: params.event?.offsetY ?? 0,
      toggle: false,
    });
    const onTitleDown = (params: unknown) => {
      if (!primary(params)) return;
      panelClicks.down(panelAt(params as Parameters<typeof panelAt>[0]));
    };
    const onTitleUp = (params: unknown) => {
      if (!primary(params)) return;
      if (dragging.current) {
        onItem.current = true;
        panelClicks.cancel();
        return;
      }
      panelClicks.up(panelAt(params as Parameters<typeof panelAt>[0]));
    };
    chart.on('mousedown', 'title', onTitleDown);
    chart.on('mouseup', 'title', onTitleUp);

    /**
     * A rectangle, or a lasso with Alt held, dragged over the chart (AC-088,
     * direction.md rule 47). `dragGesture` decides drag from click on the
     * same 5 px as `itemClicks`, so exactly one of the two answers any press.
     * The shape is drawn as SVG over the chart while it is dragged, as the
     * prototype draws it, and taken away on release; what it touches is read
     * off the chart as drawn, through `convertToPixel` (`itemsInShape`).
     */
    let band: SVGSVGElement | null = null;
    let path: Point[] = [];
    let origin: { left: number; top: number } = { left: 0, top: 0 };
    let lasso = false;
    const local = (event: MouseEvent): Point => [
      event.clientX - origin.left,
      event.clientY - origin.top,
    ];
    /** Ctrl or ⌘ held at the release: add or toggle, not replace (AC-089). */
    let toggleOnRelease = false;
    const gesture = dragGesture((shape) => {
      /**
       * In range mode (T386, AC-093): the buckets under the drag's two ends,
       * read off the x axis as drawn (`convertFromPixel`, research/echarts.md).
       */
      const onRange = ranged.current;
      if (onRange !== undefined) {
        const categories = xCategoriesOf(chart.getOption() as EChartsOption);
        if (categories === undefined || shape.kind !== 'rect') return;
        const indexAt = (x: number) => Number(chart.convertFromPixel({ xAxisIndex: 0 }, x));
        const range = bucketRangeAt(categories, indexAt(shape.x0), indexAt(shape.x1));
        if (range !== undefined) onRange(range, toggleOnRelease);
        return;
      }
      const items = itemsInShape(chart, chart.getOption() as EChartsOption, shape);
      shaped.current?.(
        items.map(({ name, seriesName }) => ({ name, seriesName })),
        toggleOnRelease,
      );
    });
    const draw = () => {
      if (band === null) {
        band = window.document.createElementNS(SVG_NS, 'svg');
        band.setAttribute('class', 'mark-drag');
        band.setAttribute('aria-hidden', 'true');
        element.appendChild(band);
      }
      // The tooltip would sit over what is being drawn round, and comes back
      // as the pointer moves over marks.
      chart.dispatchAction({ type: 'hideTip' });
      const first = path[0] ?? [0, 0];
      const last = path[path.length - 1] ?? first;
      band.innerHTML = '';
      const outline = lasso
        ? window.document.createElementNS(SVG_NS, 'polygon')
        : window.document.createElementNS(SVG_NS, 'rect');
      if (lasso) outline.setAttribute('points', path.map((point) => point.join(',')).join(' '));
      else if (ranged.current !== undefined) {
        // A span of the axis, the whole height of the chart (T386).
        outline.setAttribute('x', String(Math.min(first[0], last[0])));
        outline.setAttribute('y', '0');
        outline.setAttribute('width', String(Math.abs(last[0] - first[0])));
        outline.setAttribute('height', String(element.clientHeight));
      } else {
        outline.setAttribute('x', String(Math.min(first[0], last[0])));
        outline.setAttribute('y', String(Math.min(first[1], last[1])));
        outline.setAttribute('width', String(Math.abs(last[0] - first[0])));
        outline.setAttribute('height', String(Math.abs(last[1] - first[1])));
      }
      band.appendChild(outline);
    };
    /**
     * A drag given up without a release: the button came up where the page
     * could not see it (another window, a context menu), or the window lost
     * focus. Nothing is marked, and nothing is left following the pointer.
     */
    const abandon = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onRelease);
      window.removeEventListener('blur', abandon);
      band?.remove();
      band = null;
      path = [];
      queueMicrotask(() => {
        dragging.current = false;
      });
    };
    const onMove = (event: MouseEvent) => {
      if ((event.buttons & 1) === 0) {
        abandon();
        return;
      }
      const [x, y] = local(event);
      gesture.move({ x, y, alt: lasso });
      const first = path[0] ?? [x, y];
      if (!dragging.current && Math.hypot(x - first[0], y - first[1]) < CLICK_SLOP_PX) return;
      dragging.current = true;
      path.push([x, y]);
      draw();
    };
    const onRelease = (event: MouseEvent) => {
      // Another button coming up mid-drag ends nothing: the drag is the primary's.
      if (event.button !== 0) return;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onRelease);
      window.removeEventListener('blur', abandon);
      band?.remove();
      band = null;
      toggleOnRelease = event.ctrlKey || event.metaKey;
      const [x, y] = local(event);
      gesture.up({ x, y, alt: lasso });
      path = [];
      // After the wrapper's own release has read it, so that release is
      // not taken for a click on empty plot area.
      queueMicrotask(() => {
        dragging.current = false;
      });
    };
    /**
     * A context menu opening — a right-click, or macOS's Ctrl+click, which
     * presses the primary button — ends every press under way: it is not a
     * click on anything, nor the start of a shape (T190 stage 7's review).
     */
    const onContextMenu = () => {
      clicks.cancel();
      panelClicks.cancel();
      // And the wrapper's own press, whose release would otherwise be a click
      // on empty plot and unmark the tile (T266's review).
      pressedHere.current = false;
      if (path.length > 0) abandon();
    };
    element.addEventListener('contextmenu', onContextMenu);
    const onPress = (event: MouseEvent) => {
      if (event.button !== 0 || (shaped.current === undefined && ranged.current === undefined))
        return;
      const box = element.getBoundingClientRect();
      origin = { left: box.left, top: box.top };
      // A range is a span, never a lasso.
      lasso = event.altKey && ranged.current === undefined;
      dragging.current = false;
      const [x, y] = local(event);
      path = [[x, y]];
      gesture.down({ x, y, alt: lasso });
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onRelease);
      window.addEventListener('blur', abandon);
    };
    element.addEventListener('mousedown', onPress);

    return () => {
      element.removeEventListener('mousedown', onPress);
      element.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onRelease);
      window.removeEventListener('blur', abandon);
      band?.remove();
      chart.off('mousedown', onDown);
      chart.off('mouseup', onUp);
      chart.off('mousedown', onTitleDown);
      chart.off('mouseup', onTitleUp);
      observer.disconnect();
      // "Once disposed, the instance can not be used again" — so the ref goes
      // with it, or the next render would call setOption on a dead instance.
      chart.dispose();
      instance.current = null;
    };
  }, []);

  useLayoutEffect(() => {
    const chart = instance.current;
    // Not before its box is known: the first option is drawn for it.
    if (chart === null || chart.isDisposed() || canvas === null) return;

    // notMerge: a chart type change replaces the option outright. Merging
    // would leave the previous type's series in place beside the new one.
    // In the theme the page is in (AC-211), and again when it switches.
    const option = themed(optionFor(spec, canvas), theme);
    chart.setOption(option, true);

    /**
     * The item the tile's keyboard is on, told as the prototype tells it: its
     * tooltip, shown as a hover would (T306, AC-176; research/echarts.md
     * "showTip"). Beside the ring `optionFor` draws, and in its place on a
     * marked item, which keeps its marking's outline. Put away once the
     * keyboard has gone, and only then: a tooltip the pointer brought is the
     * pointer's.
     */
    const item = focusedItemOf(option, spec);
    if (item !== undefined) {
      chart.dispatchAction({ type: 'showTip', ...item });
      tipShown.current = true;
    } else if (tipShown.current) {
      chart.dispatchAction({ type: 'hideTip' });
      tipShown.current = false;
    }
  }, [spec, theme, canvas]);

  /**
   * The marked ranges' stripes along the x axis (T386, AC-093; direction.md
   * rule 30 of §7a), drawn over the chart as DOM, as a shape being dragged is,
   * after the option above: each from its stored bounds (`bucketStripeFor`),
   * so a filter that takes buckets away shortens a stripe and never moves it.
   * The grid is found by the chart's own `containPixel` (research/echarts.md).
   */
  useLayoutEffect(() => {
    const element = node.current;
    const chart = instance.current;
    if (element === null) return undefined;
    const layer = window.document.createElement('div');
    layer.className = 'range-stripes';
    layer.setAttribute('aria-hidden', 'true');
    const drawn = () => {
      if (chart === null || chart.isDisposed() || canvas === null) return;
      if (rangeStripes === undefined || rangeStripes.length === 0) return;
      const categories = xCategoriesOf(chart.getOption() as EChartsOption);
      if (categories === undefined || categories.length === 0) return;
      const centreOf = (index: number) =>
        Number(chart.convertToPixel({ xAxisIndex: 0 }, categories[index] ?? ''));
      const [width, height] = [element.clientWidth, element.clientHeight];
      const midX = centreOf(Math.floor(categories.length / 2));
      const midY = height / 2;
      const inGrid = (x: number, y: number) => chart.containPixel({ gridIndex: 0 }, [x, y]);
      if (!Number.isFinite(midX) || !inGrid(midX, midY)) return;
      const bottom = edgeBetween((y) => inGrid(midX, y), midY, height);
      const extent = {
        from: edgeBetween((x) => inGrid(x, midY), midX, 0),
        to: edgeBetween((x) => inGrid(x, midY), midX, width),
      };
      for (const range of rangeStripes) {
        const stripe = bucketStripeFor(
          { member: '', from: range.from, to: range.to },
          { categories, centreOf, extent, orientation: 'horizontal' },
          range.slot,
        );
        if (stripe === null) continue;
        const bar = window.document.createElement('div');
        bar.className = 'range-stripe';
        bar.dataset['testid'] = 'range-stripe';
        bar.dataset['from'] = String(range.from);
        bar.dataset['to'] = String(range.to);
        Object.assign(bar.style, {
          left: `${String(stripe.start)}px`,
          width: `${String(stripe.end - stripe.start)}px`,
          top: `${String(bottom - STRIPE_PX / 2)}px`,
          height: `${String(STRIPE_PX)}px`,
          background: COLORS[theme][range.slot],
        });
        layer.appendChild(bar);
      }
    };
    drawn();
    element.appendChild(layer);
    return () => {
      layer.remove();
    };
  }, [spec, theme, canvas, rangeStripes]);

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
      className="chart-canvas"
      data-testid="chart-canvas"
      data-chart-type={spec.chartType}
      // What it is highlighting, where a tile pair asks for one (AC-117).
      data-highlight={
        spec.highlight === undefined
          ? undefined
          : `${spec.highlight.kind}:${spec.highlight.member}=${spec.highlight.value}`
      }
      // Positioned, so a shape being dragged is drawn over the chart (AC-088).
      style={{ height: `${String(height)}px`, width: '100%', position: 'relative' }}
      data-marks-shapes={onShapeMark === undefined ? undefined : 'true'}
      // A drag marks a span of the x axis, in a marking's range mode (T386).
      data-marks-range={onAxisRange === undefined ? undefined : 'true'}
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

      onContextMenu={
        onContextMenuAt === undefined
          ? undefined
          : (event) => {
              // The tile's menu in place of the browser's (research §3): a
              // press it began is cancelled below, so it marks nothing.
              event.preventDefault();
              onContextMenuAt(event.clientX, event.clientY);
            }
      }
      onMouseDown={(event) => {
        if (event.button !== 0) return;
        onItem.current = false;
        pressedHere.current = true;
      }}
      onMouseUp={(event) => {
        if (event.button !== 0) return;
        // A release this chart was not pressed in — a drag that began on
        // another tile and overshot onto this one — is nobody's click here
        // (T190 stage 7's review).
        const mine = pressedHere.current;
        pressedHere.current = false;
        // The end of a shape dragged over the chart, not a click (AC-088).
        if (!mine || onItem.current || dragging.current) return;
        /**
         * A release no mark took. Two things it can be: a legend entry,
         * which marks every item of that category (AC-090), or empty plot
         * area, which unmarks this tile's marking (AC-094).
         *
         * Read from the DOM rather than from ECharts' own legend events:
         * with `selectedMode: false` — which is what stops a legend click
         * hiding a series — those did not arrive, and a marking gesture that
         * sometimes does nothing is worse than none.
         */
        const under = window.document.elementFromPoint(event.clientX, event.clientY);
        const said = under?.textContent?.trim() ?? '';
        const toggle = event.ctrlKey || event.metaKey;
        clicked.current?.(said !== '' && seriesNames.has(said) ? { legend: said } : {}, toggle);
      }}
    />
  );
}
