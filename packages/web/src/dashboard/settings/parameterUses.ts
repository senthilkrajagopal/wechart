import { elementsOf, parameterIdOf, type ChartDocument } from '@wechart/core';

import {
  isSection,
  isTabGroup,
  type DashboardDocument,
  type Element_,
  type Tile,
} from '../model/document';

/** Where in a tile a parameter is used (design 21 S3 pin 7). */
export type ParameterUseWhere = 'metrics' | 'dimensions' | 'time' | 'control' | 'value';

export interface ParameterUse {
  readonly tileId: string;
  readonly tileKind: 'chart' | 'text';
  readonly where: ParameterUseWhere;
  /** A chart's, for its title. */
  readonly chartId?: string | undefined;
}

/** Every tile of the dashboard, on every page, in every section and tab. */
export function everyTile(document: DashboardDocument): Tile[] {
  const found: Tile[] = [];
  const walk = (items: readonly Element_[]) => {
    for (const element of items) {
      if (isSection(element)) walk(element.items);
      else if (isTabGroup(element)) for (const tab of element.tabs) walk(tab.items);
      else found.push(element);
    }
  };
  for (const page of document.pages) walk(page.items);
  return found;
}

const WELLS = [
  ['measures', 'metrics'],
  ['dimensions', 'dimensions'],
  ['timeDimensions', 'time'],
] as const;

/**
 * What uses a parameter (AC-531's "what uses it", AC-532): a local chart's
 * well that holds it, a Text tile's parameter control of it, a Value that
 * takes it as its measure — each with its tile, in the dashboard's order.
 */
export function parameterUsesOf(
  document: DashboardDocument,
  parameterId: string,
  chartOf: (chartId: string) => ChartDocument | undefined,
): ParameterUse[] {
  const uses: ParameterUse[] = [];
  for (const tile of everyTile(document)) {
    if (tile.kind === 'chart' && tile.chartId !== undefined) {
      const chart = chartOf(tile.chartId);
      if (chart === undefined) continue;
      for (const [well, where] of WELLS)
        if (chart.chart.wells[well].some((entry) => parameterIdOf(entry) === parameterId))
          uses.push({ tileId: tile.id, tileKind: 'chart', where, chartId: tile.chartId });
    }
    if (tile.kind === 'text' && tile.document !== undefined)
      for (const element of elementsOf(tile.document)) {
        if (element.attrs?.['parameter'] !== parameterId) continue;
        if (element.type === 'parameterControl')
          uses.push({ tileId: tile.id, tileKind: 'text', where: 'control' });
        else if (element.type === 'value')
          uses.push({ tileId: tile.id, tileKind: 'text', where: 'value' });
      }
  }
  return uses;
}

const counted = (n: number, one: string, many: string) =>
  `${n.toLocaleString('en-GB')} ${n === 1 ? one : many}`;

/**
 * The list's "Used by" (design 21 S3 pin 3): the uses, then the tiles they
 * are in by kind — "3 · 1 chart, 2 Text tiles" — or "Not used yet".
 */
export function usedBySummary(uses: readonly ParameterUse[]): string {
  if (uses.length === 0) return 'Not used yet';
  const charts = new Set(uses.filter((use) => use.tileKind === 'chart').map((use) => use.tileId));
  const texts = new Set(uses.filter((use) => use.tileKind === 'text').map((use) => use.tileId));
  const tiles = [
    charts.size === 0 ? undefined : counted(charts.size, 'chart', 'charts'),
    texts.size === 0 ? undefined : counted(texts.size, 'Text tile', 'Text tiles'),
  ].filter((part) => part !== undefined);
  return `${uses.length.toLocaleString('en-GB')} · ${tiles.join(', ')}`;
}
