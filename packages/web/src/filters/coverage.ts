import type { DashboardDocument } from '../dashboard/model/document';
import type { ActiveFilter } from './apply';
import { chartTilesOf, inScope } from './scope';

/**
 * Whether a filter can reach a tile (AC-079): whether its field can be asked
 * of Cube in the same query as the tile's chart, and by what name.
 *
 * From Cube's `/v1/meta` (docs/research/cube/data-apis.md):
 * - a member of the chart's own cube or view reaches it;
 * - between two cubes, the same `connectedComponent` means "there is at least
 *   one join path between them";
 * - a view reaches a cube's member through its own member whose `aliasMember`
 *   is that member — `order_summary.status` for `orders.status` (observed
 *   against Cube v1.7.42) — and nothing else: nothing in the research says a
 *   view's query may take a cube's member.
 *
 * The answer is the member to filter that chart's query by; `false` when
 * there is none; `undefined` when the model cannot say — it has not arrived,
 * it has no such cube or view, or it gives no join components — so the filter
 * is neither applied nor marked, rather than sent to fail or marked on a guess.
 */
export type Reach = (member: string, source: string) => string | false | undefined;

interface MetaCube {
  readonly name: string;
  readonly type?: string;
  readonly connectedComponent?: number;
  readonly members: ReadonlySet<string>;
  /** Each cube member this view exposes, and its name for it. */
  readonly aliases: ReadonlyMap<string, string>;
}

function cubesOf(meta: unknown): MetaCube[] | undefined {
  const cubes = (meta as { cubes?: unknown } | undefined)?.cubes;
  if (!Array.isArray(cubes)) return undefined;
  return cubes.flatMap((raw: unknown) => {
    if (typeof raw !== 'object' || raw === null) return [];
    const cube = raw as Record<string, unknown>;
    if (typeof cube['name'] !== 'string') return [];
    const members = new Set<string>();
    const aliases = new Map<string, string>();
    for (const kind of ['measures', 'dimensions', 'segments']) {
      const list = cube[kind];
      if (!Array.isArray(list)) continue;
      for (const each of list as unknown[]) {
        const { name, aliasMember } = (each ?? {}) as { name?: unknown; aliasMember?: unknown };
        if (typeof name !== 'string') continue;
        members.add(name);
        if (typeof aliasMember === 'string') aliases.set(aliasMember, name);
      }
    }
    const component = cube['connectedComponent'];
    return [
      {
        name: cube['name'],
        ...(typeof cube['type'] === 'string' ? { type: cube['type'] } : {}),
        ...(typeof component === 'number' ? { connectedComponent: component } : {}),
        members,
        aliases,
      },
    ];
  });
}

export function reachFrom(meta: unknown): Reach {
  const cubes = cubesOf(meta);
  return (member, source) => {
    if (cubes === undefined) return undefined;
    const target = cubes.find((cube) => cube.name === source);
    if (target === undefined) return undefined;
    if (target.members.has(member)) return member;
    if (target.type === 'view') return target.aliases.get(member) ?? false;
    const owner = cubes.find((cube) => cube.members.has(member));
    // A field the model no longer has reaches nothing; a view's member is
    // not asked of a cube.
    if (owner === undefined || owner.type === 'view') return false;
    if (owner.connectedComponent === undefined || target.connectedComponent === undefined)
      return undefined;
    return owner.connectedComponent === target.connectedComponent ? member : false;
  };
}

/**
 * The charts each filter in effect reaches and can filter — each filter as
 * that chart's query names its field — and the ones in its scope that it
 * cannot reach, left unfiltered and marked so (AC-079). A chart the model
 * cannot yet say about is in neither.
 *
 * By chart, as the dashboard's charts are drawn; a chart shown by two tiles
 * takes the first tile's scope (see `filteredCharts`).
 */
export function coverageOf(
  document: DashboardDocument,
  active: readonly ActiveFilter[],
  reaches: (member: string, chartId: string) => string | false | undefined,
): {
  reached: Record<string, ActiveFilter[]>;
  notCovered: Record<string, ActiveFilter[]>;
} {
  const reached: Record<string, ActiveFilter[]> = {};
  const notCovered: Record<string, ActiveFilter[]> = {};
  if (active.length === 0) return { reached, notCovered };
  const seen = new Set<string>();
  for (const tile of chartTilesOf(document)) {
    const chartId = tile.chartId;
    if (chartId === undefined || seen.has(chartId)) continue;
    seen.add(chartId);
    for (const each of active) {
      if (!inScope(each.filter, tile)) continue;
      const field = each.filter.member ?? '';
      const as = reaches(field, chartId);
      if (typeof as === 'string')
        (reached[chartId] ??= []).push(
          as === field ? each : { ...each, filter: { ...each.filter, member: as } },
        );
      else if (as === false) (notCovered[chartId] ??= []).push(each);
    }
  }
  return { reached, notCovered };
}
