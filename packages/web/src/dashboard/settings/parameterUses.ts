import {
  elementsOf,
  parameterIdOf,
  type ChartDocument,
  type DashboardParameter,
  type TextNode,
} from '@wechart/core';

import { cubesFrom, membersOf } from '../../editor/fields';
import { reachFrom } from '../../filters/coverage';
import {
  isSection,
  isTabGroup,
  type DashboardDocument,
  type Element_,
  type ParameterFixed,
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

const WELL_WORDS: Readonly<Record<'metrics' | 'dimensions' | 'time', string>> = {
  metrics: 'Metrics',
  dimensions: 'Dimensions',
  time: 'Time',
};

/**
 * Where in its tile a use is, in words (design 21 S3 pin 7): "chart · its
 * Metrics well", "Text · a parameter control", "Text · the Value “‹name›”".
 */
export function whereWords(use: ParameterUse, parameterName: string): string {
  switch (use.where) {
    case 'control':
      return 'Text · a parameter control';
    case 'value':
      return `Text · the Value “${parameterName}”`;
    default:
      return `chart · its ${WELL_WORDS[use.where]} well`;
  }
}

/** The charts the dashboard shows that follow the parameter, each once, in its order. */
function boundCharts(
  document: DashboardDocument,
  parameterId: string,
  chartOf: (chartId: string) => ChartDocument | undefined,
): { readonly chartId: string; readonly chart: ChartDocument }[] {
  const seen = new Set<string>();
  return parameterUsesOf(document, parameterId, chartOf).flatMap((use) => {
    if (use.chartId === undefined || seen.has(use.chartId)) return [];
    seen.add(use.chartId);
    const chart = chartOf(use.chartId);
    return chart === undefined ? [] : [{ chartId: use.chartId, chart }];
  });
}

/**
 * Each choice a chart bound to the parameter can't query (AC-532; design 21
 * S3 pin 8; rule 137): one whose member the chart's cube can't reach in the
 * model — on a cube it doesn't join, or not in its view — as
 * "‹chart› can’t query ‹cube› › ‹member›". Where the model can't say (the
 * same join component, the model not read yet), the choice is left to Cube,
 * as a dashboard filter is (`reachFrom`).
 */
export function choiceProblems(
  document: DashboardDocument,
  parameter: DashboardParameter,
  chartOf: (chartId: string) => ChartDocument | undefined,
  model: unknown,
): string[] {
  const reach = reachFrom(model);
  const cubes = new Map(cubesFrom(model).map((cube) => [cube.name, cube]));
  const nameOf = (member: string) => {
    for (const cube of cubes.values()) {
      const found = membersOf(model, cube.name).find((each) => each.name === member);
      if (found !== undefined) return `${cube.title} › ${found.shortTitle}`;
    }
    return member;
  };
  return boundCharts(document, parameter.id, chartOf).flatMap(({ chart }) =>
    parameter.choices
      .filter((choice) => reach(choice.member, chart.chart.source.cube) === false)
      .map((choice) => `${chart.title} can’t query ${nameOf(choice.member)}`),
  );
}

/** "Fixed at Orders: the parameter Metric to show was deleted." — said in the tile (AC-532). */
export function parameterFixedNote(fixed: readonly ParameterFixed[]): string {
  return fixed
    .map((each) => `Fixed at ${each.label}: the parameter ${each.parameter} was deleted.`)
    .join(' ');
}

/** The chart with every `parameter:‹id›` it holds the member in its place. */
function chartFixed(chart: ChartDocument, parameterId: string, member: string): ChartDocument {
  const entry = (each: string) => (parameterIdOf(each) === parameterId ? member : each);
  const list = (entries: readonly string[]) => [...new Set(entries.map(entry))];
  const keyed = <T>(record: Readonly<Record<string, T>> | undefined) =>
    record === undefined
      ? undefined
      : Object.fromEntries(Object.entries(record).map(([key, value]) => [entry(key), value]));
  const { chart: spec } = chart;
  const encoding =
    spec.encoding === undefined
      ? undefined
      : Object.fromEntries(
          Object.entries(spec.encoding).map(([channel, members]) => [
            channel,
            members === undefined ? members : list(members),
          ]),
        );
  const calculations = keyed(spec.calculations);
  const granularities = keyed(spec.granularities);
  return {
    ...chart,
    chart: {
      ...spec,
      wells: {
        ...spec.wells,
        measures: list(spec.wells.measures),
        dimensions: list(spec.wells.dimensions),
        timeDimensions: list(spec.wells.timeDimensions),
      },
      ...(encoding === undefined ? {} : { encoding }),
      ...(calculations === undefined ? {} : { calculations }),
      ...(granularities === undefined ? {} : { granularities }),
    },
  };
}

/**
 * A Text tile's text with the parameter's uses fixed: a Value takes the
 * member as its measure, and a parameter control — which has no field of its
 * own to keep — becomes the choice's label as plain text, so its sentence
 * still reads what it showed.
 */
function textFixed(node: TextNode, parameterId: string, member: string, label: string): TextNode {
  if (node.attrs?.['parameter'] === parameterId) {
    if (node.type === 'parameterControl') return { type: 'text', text: label };
    if (node.type === 'value') {
      const attrs: Record<string, unknown> = { ...node.attrs };
      delete attrs['parameter'];
      return { ...node, attrs: { ...attrs, measure: member } };
    }
  }
  return node.content === undefined
    ? node
    : {
        ...node,
        content: node.content.map((child) => textFixed(child, parameterId, member, label)),
      };
}

/** The document with each tile as `change` makes it, everywhere it sits. */
function mapTiles(document: DashboardDocument, change: (tile: Tile) => Tile): DashboardDocument {
  const walk = (items: readonly Element_[]): Element_[] =>
    items.map((element) =>
      isSection(element)
        ? { ...element, items: walk(element.items) }
        : isTabGroup(element)
          ? { ...element, tabs: element.tabs.map((tab) => ({ ...tab, items: walk(tab.items) })) }
          : change(element),
    );
  return {
    ...document,
    pages: document.pages.map((page) => ({ ...page, items: walk(page.items) })),
  };
}

/**
 * The parameter deleted (AC-532; design 21 S3 pin 7): each use keeps the
 * member it stands for now as a fixed field — a chart's well, a Value's
 * measure, a control's words — and each tile it was used in says so
 * (`parameterFixed`). The charts changed are handed back, to be written
 * with the dashboard; a parameter used nowhere leaves everything else as
 * it was.
 */
export function withoutParameter(
  document: DashboardDocument,
  parameterId: string,
  member: string,
  chartOf: (chartId: string) => ChartDocument | undefined,
): { document: DashboardDocument; charts: Record<string, ChartDocument> } {
  const parameter = (document.parameters ?? []).find((each) => each.id === parameterId);
  const parameters = (document.parameters ?? []).filter((each) => each.id !== parameterId);
  const without = { ...document, parameters };
  if (parameter === undefined) return { document: without, charts: {} };
  const uses = parameterUsesOf(document, parameterId, chartOf);
  if (uses.length === 0) return { document: without, charts: {} };

  const label = parameter.choices.find((choice) => choice.member === member)?.label ?? member;
  const fixed: ParameterFixed = { parameter: parameter.name, label };
  const usedIn = new Set(uses.map((use) => use.tileId));
  const charts = Object.fromEntries(
    boundCharts(document, parameterId, chartOf).map(({ chartId, chart }) => [
      chartId,
      chartFixed(chart, parameterId, member),
    ]),
  );
  return {
    document: mapTiles(without, (tile) => {
      if (!usedIn.has(tile.id)) return tile;
      const text =
        tile.kind === 'text' && tile.document !== undefined
          ? {
              document: {
                ...tile.document,
                doc: textFixed(tile.document.doc, parameterId, member, label),
              },
            }
          : {};
      return { ...tile, ...text, parameterFixed: [...(tile.parameterFixed ?? []), fixed] };
    }),
    charts,
  };
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
