import { memberOn, type RenderSpec } from '@wechart/core';

import { optionFor } from '../optionFor';
import type { Canvas } from '../series/bar';
import { labelRoom } from './categoryLabels';

/**
 * The share of a vertical bar's category labels ECharts would hide at a
 * canvas's size, turned as `fitCategoryLabels` turns them (T516; UX-117's
 * second half; R67, the user): 0 where every label is drawn, and above 0.5
 * where fewer than half are, which is when the horizontal bar is offered
 * second.
 *
 * Reckoned for a vertical bar of the spec's own fields, whatever type it is
 * drawn as, since it is a bar's labels the horizontal one would save. ECharts
 * keeps one label in every `interval + 1`, its interval the floor of the
 * label's box over the category's span, along the turned label's sides
 * (`calculateCategoryInterval`; research `echarts-category-labels.md`).
 */
export function hiddenLabelShare(spec: RenderSpec, canvas: Canvas): number {
  if (memberOn(spec.encoding, 'x') === undefined) return 0;
  const option = optionFor({ ...spec, chartType: 'bar' }, canvas);
  const room = labelRoom(option, spec, canvas);
  if (room === undefined) return 0;
  const { axis, count, width, height, span } = room;
  const turn = (Number(axis.axisLabel?.rotate ?? 0) / 180) * Math.PI;
  const along = Math.abs(Math.cos(turn));
  const across = Math.abs(Math.sin(turn));
  const ratio = Math.min(
    along === 0 ? Infinity : width / (span * along),
    across === 0 ? Infinity : height / (span * across),
  );
  const interval = Math.max(0, Math.floor(ratio));
  const shown = Math.ceil(count / (interval + 1));
  return 1 - shown / count;
}
