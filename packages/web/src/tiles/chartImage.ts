import { echarts } from '@wechart/charts';

/**
 * A chart tile's image, as ECharts drew it (T272, AC-244): the SVG it renders
 * of its own display list, and a PNG rasterised from that SVG by the browser.
 * The recipe is research/clipboard-and-image-export.md's, "Rasterising the
 * SVG to PNG": under the SVG renderer `getDataURL({ type: 'png' })` returns
 * an SVG whatever it is asked, so a PNG is drawn from the SVG on a canvas.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

/** What an image is made from: the parts of an ECharts instance it reads. */
export interface DrawnChart {
  getWidth(): number;
  getHeight(): number;
  renderToSVGString(): string;
  /** ECharts' own, to clear a hover before the picture is taken (T272's review). */
  dispatchAction?: (action: { type: string }) => void;
}

/** The ECharts instance drawing a tile's chart, or none for a tile drawn in DOM. */
export function drawnChartIn(tile: Element | null | undefined): DrawnChart | undefined {
  const canvas = tile?.querySelector<HTMLElement>('[data-testid="chart-canvas"]');
  return canvas === null || canvas === undefined ? undefined : echarts.getInstanceByDom(canvas);
}

/**
 * The surface a chart lies on: the first background behind it that is not
 * transparent. An image carries it (a decision of T272's, research open
 * question 1): ECharts draws on nothing, and a chart's inks for a light or a
 * dark tile would otherwise sit on whatever the image is pasted onto.
 */
export function surfaceOf(element: Element | null | undefined): string | undefined {
  for (let at = element ?? null; at !== null; at = at.parentElement) {
    const colour = getComputedStyle(at).backgroundColor;
    if (colour !== '' && colour !== 'transparent' && colour !== 'rgba(0, 0, 0, 0)') return colour;
  }
  return undefined;
}

/**
 * The chart as drawn, as an SVG that stands alone: its natural size the
 * image's (the chart's times `pixelRatio`), drawn in the chart's own CSS
 * pixels, with the tile's tabular figures — page CSS does not reach an image
 * — and the surface behind it.
 */
export function chartSvg(
  chart: DrawnChart,
  { pixelRatio = 1, surface }: { pixelRatio?: number; surface?: string | undefined } = {},
): { svg: string; width: number; height: number } {
  const cssWidth = chart.getWidth();
  const cssHeight = chart.getHeight();
  /**
   * The display list holds whatever the pointer is resting on (the research's
   * "Hover and emphasis state"): a menu opened by its keys leaves the pointer
   * where it was. `downplay` puts hover emphasis away (research/
   * cross-highlight.md, "Drive states from code"); the marking is drawn in
   * item styles, not emphasis, so it stays. The axis pointer's line has no
   * action researched to clear it, and may be in the picture.
   */
  chart.dispatchAction?.({ type: 'downplay' });
  const doc = new DOMParser().parseFromString(chart.renderToSVGString(), 'image/svg+xml');
  if (doc.querySelector('parsererror') !== null) throw new Error('The chart’s SVG did not parse.');
  const root = doc.documentElement;
  const width = Math.round(cssWidth * pixelRatio);
  const height = Math.round(cssHeight * pixelRatio);
  root.setAttribute('width', String(width));
  root.setAttribute('height', String(height));
  root.setAttribute('viewBox', `0 0 ${String(cssWidth)} ${String(cssHeight)}`);
  const style = doc.createElementNS(SVG_NS, 'style');
  // `!important`, as the page's rule is: a text zrender writes with the `font:`
  // shorthand resets the property inline (echarts-text-and-grid.md, Q2).
  style.textContent = 'text{font-variant-numeric:tabular-nums !important}';
  root.insertBefore(style, root.firstChild);
  if (surface !== undefined) {
    const back = doc.createElementNS(SVG_NS, 'rect');
    back.setAttribute('width', String(cssWidth));
    back.setAttribute('height', String(cssHeight));
    back.setAttribute('fill', surface);
    root.insertBefore(back, style.nextSibling);
  }
  return { svg: new XMLSerializer().serializeToString(doc), width, height };
}

/**
 * The SVG drawn 1:1 onto a canvas of its natural size, encoded as PNG. From a
 * `data:` URL, which no engine taints a canvas for (the research's
 * "Tainting").
 */
export function svgToPng({
  svg,
  width,
  height,
}: {
  svg: string;
  width: number;
  height: number;
}): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      // A throw in here is outside the executor, so caught here, or the
      // promise never settles and the note waits for ever (T272's review).
      try {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        if (context === null) {
          reject(new Error('This browser gave no canvas to draw the image on.'));
          return;
        }
        context.drawImage(image, 0, 0, width, height);
        canvas.toBlob((png) => {
          if (png === null) reject(new Error('The browser could not make the PNG.'));
          else resolve(png);
        }, 'image/png');
      } catch (error) {
        reject(error instanceof Error ? error : new Error('The browser could not make the PNG.'));
      }
    };
    image.onerror = () => {
      reject(new Error('The chart’s SVG did not load as an image.'));
    };
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

/** A file name from a chart's title and an extension, as `csvFileName` makes one. */
export function imageFileName(title: string, extension: 'svg' | 'png'): string {
  const name = title.replace(/[/\\?%*:|"<>]/g, '-').trim();
  return `${name === '' ? 'chart' : name}.${extension}`;
}
