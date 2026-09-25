/**
 * Treemap (AC-037).
 *
 * One rectangle per category, its **area** the category's share of the total.
 * Channels follow pie's: `x` names the category, `y` the measure. Both are
 * "one category, one quantity" charts and there is no reason for them to read
 * differently.
 */
import { memberOn, type RenderSpec } from '@wechart/core';

import { colourFor } from '../colours';
import { DEFAULT_SURFACE, MARK, type EChartsOption } from '../theme';

export function isTreemapType(chartType: string): boolean {
  return chartType === 'treemap';
}

/**
 * The rectangles a treemap draws, each named by its category's value — the
 * name it is coloured by, and so the one the dashboard's assignment claims
 * (T301).
 */
export function treemapNodesOf(spec: RenderSpec): { name: string; value: number }[] {
  const category = memberOn(spec.encoding, 'x');
  const measure = memberOn(spec.encoding, 'y');

  return category === undefined || measure === undefined
    ? []
    : spec.rows
        .map((row) => {
          const raw = row[measure];
          if (raw === null || raw === undefined || raw === '') return null;
          const value = Number(raw);
          // A treemap's area cannot express a negative, and zero would be a
          // rectangle with no size that still takes a legend entry.
          if (!Number.isFinite(value) || value <= 0) return null;
          return { name: String(row[category] ?? ''), value };
        })
        .filter((node) => node !== null);
}

export function treemapOption(spec: RenderSpec): EChartsOption {
  if (!isTreemapType(spec.chartType)) {
    throw new Error(`${spec.chartType} is not a treemap`);
  }

  const surface = spec.surface ?? DEFAULT_SURFACE;
  const nodes = treemapNodesOf(spec);

  return {
    animation: false,
    series: [
      {
        type: 'treemap' as const,
        // Nothing here navigates yet: a breadcrumb and drill-down are a
        // different behaviour from drawing, and no criterion asks for them.
        roam: false,
        breadcrumb: { show: false },
        nodeClick: false,
        label: { show: false },
        data: nodes.map((node, index) => ({
          ...node,
          itemStyle: {
            color: colourFor(spec, node.name, index),
            borderColor: surface,
            borderWidth: MARK.gapPx,
          },
        })),
      },
    ],
  };
}
