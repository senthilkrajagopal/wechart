import type { ChartDocument } from './chart-document';
import type { TimeGranularity } from './format';

/**
 * Drill by (T270, AC-236, AC-237): what a tile's marked items can be
 * regrouped by, and the tile's chart regrouped.
 *
 * The options come from Cube's `/v1/meta` (research/cube/data-apis.md; the
 * context-menu analysis §2.4): a hierarchy's next level, where the tile's
 * grouping is a level of one; the time dimensions of the tile's own cube or
 * view, at the standard grains (only finer ones for the time the tile is
 * grouped by); then the other dimensions of its cube or view, and of the
 * cubes Cube puts in the same join component. The component rules a cube out
 * but not in (research/cube/markings-query-support.md Q4): a cube offered may
 * still not join, and Cube's refusal of the drilled query says so. A view
 * reports no component, so it offers its own dimensions alone. Never a
 * primary key, a hidden member, the marked member, or what the tile already
 * groups by.
 */

/** One thing a tile can be drilled by (T270, AC-237). */
export interface DrillOption {
  readonly member: string;
  readonly title: string;
  /** A time dimension's grain; absent for any other dimension. */
  readonly granularity?: TimeGranularity;
  readonly kind: 'level' | 'time' | 'dimension';
  /** The cube or view it's from, and whether the tile reaches it through a join. */
  readonly from: { readonly cube: string; readonly title: string; readonly joined: boolean };
}

/** The grains offered, coarse to fine: a day's hours and minutes are rows, not a drill. */
const GRAINS: readonly TimeGranularity[] = ['year', 'quarter', 'month', 'week', 'day'];

interface MetaDimension {
  readonly name: string;
  readonly title: string;
  readonly type: string;
  readonly hidden: boolean;
  readonly primaryKey: boolean;
}

interface MetaCube {
  readonly name: string;
  readonly title: string;
  readonly component: number | undefined;
  readonly dimensions: readonly MetaDimension[];
  readonly hierarchies: readonly (readonly string[])[];
}

const text = (value: unknown, fallback: string) => (typeof value === 'string' ? value : fallback);

function cubesOf(meta: unknown): MetaCube[] {
  const cubes = (meta as { cubes?: unknown } | null | undefined)?.cubes;
  if (!Array.isArray(cubes)) return [];
  return cubes.flatMap((raw: unknown) => {
    const cube = (raw ?? {}) as Record<string, unknown>;
    if (typeof cube['name'] !== 'string') return [];
    const list = (value: unknown) => (Array.isArray(value) ? (value as unknown[]) : []);
    return [
      {
        name: cube['name'],
        title: text(cube['title'], cube['name']),
        component:
          typeof cube['connectedComponent'] === 'number' ? cube['connectedComponent'] : undefined,
        dimensions: list(cube['dimensions']).flatMap((each) => {
          const dimension = (each ?? {}) as Record<string, unknown>;
          if (typeof dimension['name'] !== 'string') return [];
          return [
            {
              name: dimension['name'],
              title: text(dimension['shortTitle'], text(dimension['title'], dimension['name'])),
              type: text(dimension['type'], 'string'),
              hidden: dimension['public'] === false || dimension['isVisible'] === false,
              primaryKey: dimension['primaryKey'] === true,
            },
          ];
        }),
        hierarchies: list(cube['hierarchies']).flatMap((each) => {
          const hierarchy = (each ?? {}) as Record<string, unknown>;
          const levels = list(hierarchy['levels']).filter(
            (level): level is string => typeof level === 'string',
          );
          return hierarchy['public'] === false || levels.length === 0 ? [] : [levels];
        }),
      },
    ];
  });
}

export function drillOptions(
  meta: unknown,
  tile: {
    /** The cube or view the tile's chart is built from. */
    readonly source: string;
    readonly dimensions: readonly string[];
    /** The time members the tile groups by, and at what grain. */
    readonly timeDimensions: Readonly<Record<string, TimeGranularity>>;
    /** The members the marking names, as the tile names them. */
    readonly marked: readonly string[];
  },
): DrillOption[] {
  const cubes = cubesOf(meta);
  const own = cubes.find((cube) => cube.name === tile.source);
  if (own === undefined) return [];
  const reached = [
    own,
    ...(own.component === undefined
      ? []
      : cubes.filter((cube) => cube !== own && cube.component === own.component)),
  ];
  const dimensionOf = new Map(
    reached.flatMap((cube) => cube.dimensions.map((each) => [each.name, { each, cube }] as const)),
  );
  const fromOf = (cube: MetaCube) => ({ cube: cube.name, title: cube.title, joined: cube !== own });
  const never = new Set([...tile.marked, ...tile.dimensions]);
  const offerable = (each: MetaDimension) =>
    !each.hidden && !each.primaryKey && !never.has(each.name);

  const options: DrillOption[] = [];
  const offered = new Set<string>();

  // A hierarchy's next level, where the tile groups by one of its levels.
  for (const grouped of [...tile.dimensions, ...Object.keys(tile.timeDimensions)])
    for (const cube of reached)
      for (const levels of cube.hierarchies) {
        const next = levels[levels.indexOf(grouped) + 1];
        const found =
          levels.includes(grouped) && next !== undefined ? dimensionOf.get(next) : undefined;
        if (found === undefined || !offerable(found.each) || offered.has(found.each.name)) continue;
        offered.add(found.each.name);
        options.push({
          member: found.each.name,
          title: found.each.title,
          kind: 'level',
          from: fromOf(found.cube),
        });
      }

  // The time of the tile's own cube or view, then of its component's cubes,
  // at the standard grains: only finer ones for a time the tile groups by —
  // none past a day's — and none of a time marked on another tile, which is
  // the marked member itself (T270's review).
  for (const cube of reached)
    for (const each of cube.dimensions) {
      if (each.type !== 'time' || each.hidden) continue;
      const at = tile.timeDimensions[each.name];
      if (at === undefined && tile.marked.includes(each.name)) continue;
      const finer =
        at === undefined ? GRAINS : GRAINS.includes(at) ? GRAINS.slice(GRAINS.indexOf(at) + 1) : [];
      for (const granularity of finer)
        options.push({
          member: each.name,
          title: each.title,
          granularity,
          kind: 'time',
          from: fromOf(cube),
        });
    }

  // The other dimensions: the tile's own cube's, then its component's.
  for (const cube of reached)
    for (const each of cube.dimensions) {
      if (each.type === 'time' || !offerable(each) || offered.has(each.name)) continue;
      offered.add(each.name);
      options.push({ member: each.name, title: each.title, kind: 'dimension', from: fromOf(cube) });
    }

  return options;
}

/**
 * The tile's chart grouped by what it's drilled by (AC-236): its measures,
 * filters and options kept; its grouping, chart type and pinned channels let
 * go, so the chart drawn is the one the recommender draws for the new
 * grouping — a KPI or a pivot can't be drawn by one category. The marking's
 * filter is the dashboard's to add, as it adds it to the marked rows.
 */
export function drilledDocument(
  document: ChartDocument,
  to: { readonly member: string; readonly granularity?: TimeGranularity },
): ChartDocument {
  const { source, options, filters } = document.chart;
  // A Top N would fold the drilled rows into N and "Other" (T270's review).
  const kept =
    options === undefined
      ? undefined
      : Object.fromEntries(Object.entries(options).filter(([key]) => key !== 'topN'));
  const time = to.granularity !== undefined;
  return {
    ...document,
    chart: {
      source,
      ...(kept === undefined ? {} : { options: kept }),
      ...(filters === undefined ? {} : { filters }),
      wells: {
        measures: document.chart.wells.measures,
        dimensions: time ? [] : [to.member],
        timeDimensions: time ? [to.member] : [],
      },
      ...(to.granularity === undefined ? {} : { granularities: { [to.member]: to.granularity } }),
    },
  };
}
