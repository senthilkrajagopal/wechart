import { hiddenLabelShare, type Canvas } from '@wechart/charts';
import { compile, type ChartDocument, type MemberFormats } from '@wechart/core';

/**
 * The share of a chart's category labels a vertical bar of its fields would
 * hide at the tile's size (T516; UX-117's second half; R67, the user): what
 * the recommender reads to offer the horizontal bar second when it is more
 * than half. Reckoned for a bar whatever type is drawn, since it is a bar's
 * labels the horizontal one would write across. None with no size to reckon
 * at, or no field across.
 */
export function hiddenLabelsAt(
  document: ChartDocument,
  rows: readonly Record<string, unknown>[],
  canvas: Canvas | undefined,
  formats?: MemberFormats,
): number {
  if (canvas === undefined || rows.length === 0) return 0;
  const bar = compile(document, {
    rows,
    chartType: 'bar',
    ...(formats === undefined ? {} : { formats }),
  });
  return hiddenLabelShare(bar, canvas);
}

/**
 * The size the editor's preview draws its chart at, to reckon the share at
 * (T516's review: the canvas, not the tile's outer box). Opened from a tile,
 * the tile's width less its frame's padding and border, whichever preview
 * size is shown, at the chart's height; else the canvas as laid out. None
 * before there is one.
 */
export function drawnSizeIn(
  pane: HTMLElement | null,
  tileWidth: number | undefined,
  tileHeight: number | undefined,
): Canvas | undefined {
  if (pane === null) return undefined;
  if (tileWidth !== undefined && tileHeight !== undefined) {
    const frame = pane.querySelector<HTMLElement>('.preview-frame__tile');
    const style = frame === null ? undefined : getComputedStyle(frame);
    const chrome =
      style === undefined
        ? 0
        : [style.paddingLeft, style.paddingRight, style.borderLeftWidth, style.borderRightWidth]
            .map((side) => Number.parseFloat(side) || 0)
            .reduce((sum, each) => sum + each, 0);
    return { width: tileWidth - chrome, height: tileHeight };
  }
  const canvas = pane.querySelector<HTMLElement>('[data-testid="chart-canvas"]');
  return canvas === null || canvas.clientWidth === 0
    ? undefined
    : { width: canvas.clientWidth, height: canvas.clientHeight };
}
