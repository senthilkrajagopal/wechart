import { tokenMembersOf, type ChartDefinition } from '@wechart/core';

import { cubesOfChart, cubesOfDashboard } from './bind';

/**
 * What uses a member (T147, AC-141): the charts that name it, and the
 * dashboards that name it or hold a chart that does, listed before an edit
 * to it is saved.
 *
 * A member is named wherever a chart or dashboard keeps it — a query's
 * measures and dimensions, a time dimension, a filter, a dashboard's own
 * filters — so every string in a body is read rather than one shape of it:
 * a name listed once too often is a warning, a name missed is AC-141 failing.
 * A time dimension may carry its granularity (`orders.ordered_at.month`).
 */
export interface ReferenceDocument {
  readonly kind: string;
  readonly id: string;
  readonly title: string | null;
  readonly body: unknown;
  readonly localToDashboardId: string | null;
}

export interface ChartReference {
  readonly id: string;
  readonly title: string | null;
  /** The dashboard a chart belongs to, when it is kept on one rather than in a folder. */
  readonly dashboardId: string | null;
  readonly members: readonly string[];
}

export interface DashboardReference {
  readonly id: string;
  readonly title: string | null;
  readonly members: readonly string[];
  /** The dashboard's charts that name one. */
  readonly through: readonly string[];
}

/** The members, of those asked about, that a body names. */
function namedIn(body: unknown, members: readonly string[]): string[] {
  const found = new Set<string>();
  const read = (value: unknown): void => {
    if (typeof value === 'string') {
      // A text tile's words name a member only in a measure token (T389's review).
      const inTokens = value.includes('{{') ? tokenMembersOf(value) : [];
      for (const member of members)
        if (value === member || value.startsWith(`${member}.`) || inTokens.includes(member))
          found.add(member);
    } else if (Array.isArray(value)) {
      for (const each of value) read(each);
    } else if (value !== null && typeof value === 'object') {
      for (const each of Object.values(value)) read(each);
    }
  };
  read(body);
  return members.filter((member) => found.has(member));
}

export function referencesOf(
  documents: readonly ReferenceDocument[],
  members: readonly string[],
): { charts: ChartReference[]; dashboards: DashboardReference[] } {
  const charts = documents
    .filter((document) => document.kind === 'chart')
    .map((document) => ({
      id: document.id,
      title: document.title,
      dashboardId: document.localToDashboardId,
      members: namedIn(document.body, members),
    }))
    .filter((chart) => chart.members.length > 0);
  const byId = new Map(charts.map((chart) => [chart.id, chart]));

  const dashboards = documents
    .filter((document) => document.kind === 'dashboard')
    .map((document) => {
      // The charts it draws: every one its body names — a tile's `chartId`,
      // in a section or a tab, on any page, or its `charts` list — and its
      // own local charts (T147's review: tiles are what draw).
      const drawn = namedIn(document.body, [...byId.keys()]);
      const through = [
        ...drawn,
        ...charts.filter((chart) => chart.dashboardId === document.id).map((chart) => chart.id),
      ].filter((id, at, all) => all.indexOf(id) === at);
      const own = namedIn(document.body, members);
      const named = new Set([...own, ...through.flatMap((id) => byId.get(id)?.members ?? [])]);
      return {
        id: document.id,
        title: document.title,
        members: members.filter((member) => named.has(member)),
        through,
      };
    })
    .filter((dashboard) => dashboard.members.length > 0);

  return { charts, dashboards };
}

/**
 * A chart or a dashboard a move would leave using a cube or view kept off its
 * folder's path (T714, AC-425): the names its new path doesn't keep. A
 * dashboard's own chart is on its dashboard's path, and is named with it.
 */
export interface Stranded {
  readonly kind: 'chart' | 'dashboard';
  readonly id: string;
  readonly title: string;
  /** The dashboard an own chart is on. */
  readonly dashboard?: string;
  /** Where it is kept before the move: whether the mover sees it is asked of this. */
  readonly folderId: string | null;
  readonly names: readonly string[];
}

const quoted = (names: readonly string[]) => {
  const each = names.map((name) => `“${name}”`);
  return each.length < 2 ? each.join('') : `${each.slice(0, -1).join(', ')} and ${each.at(-1)!}`;
};

/**
 * A move refused for what it strands (T714, AC-425), said as AC-322 says a
 * break: each item in a folder the mover may see named, with the cubes it
 * would use off its path; the rest only counted, naming neither them nor
 * their cubes. A move rebinds nothing, so nothing was moved.
 */
export function strandedRefusal(
  stranded: readonly Stranded[],
  sees: (folderId: string | null) => boolean,
): {
  error: string;
  stranded: Omit<Stranded, 'folderId'>[];
  hidden?: number;
} {
  const named = stranded.filter((each) => sees(each.folderId));
  const hidden = stranded.length - named.length;
  const said = named.map(
    ({ title, dashboard, names }) =>
      `“${title}”${dashboard === undefined ? '' : ` on “${dashboard}”`} would use ${quoted(names)}, which ${names.length === 1 ? 'isn’t' : 'aren’t'} in its folder or one above it`,
  );
  const counted =
    hidden === 0
      ? ''
      : hidden === 1
        ? '1 chart or dashboard in a folder you can’t see would use a cube off its folder’s path.'
        : `${String(hidden)} charts or dashboards in folders you can’t see would use cubes off their folders’ paths.`;
  const error =
    said.length === 0
      ? `Moved, ${counted} Nothing was moved.`
      : `Moved, ${said.join('; ')}.${counted === '' ? '' : ` ${counted}`} Nothing was moved.`;
  return {
    error,
    stranded: named.map(({ folderId: _folder, ...rest }) => {
      void _folder;
      return { ...rest, names: [...rest.names] };
    }),
    ...(hidden === 0 ? {} : { hidden }),
  };
}

/**
 * The items that use any of these cubes, by full name (T428, AC-275): the
 * charts whose query names one, and the dashboards whose own filters do.
 * Read where each keeps references, not from every string in it: a refusal
 * mustn't rest on a title that spells a cube's name (T428's review).
 */
export function usersOfCubes(
  documents: readonly ReferenceDocument[],
  cubes: readonly string[],
): {
  charts: { id: string; title: string | null }[];
  dashboards: { id: string; title: string | null }[];
} {
  const wanted = new Set(cubes);
  const usesAny = (names: readonly string[]) => names.some((name) => wanted.has(name));
  return {
    charts: documents
      .filter((document) => {
        if (document.kind !== 'chart') return false;
        const chart = (document.body as { chart?: ChartDefinition } | null)?.chart;
        if (typeof chart?.source?.cube !== 'string' || chart.source.cube === '') return false;
        const { source, others } = cubesOfChart(chart);
        return usesAny([source, ...others]);
      })
      .map(({ id, title }) => ({ id, title })),
    // Its filters' cubes, and its text tiles' tokens' (T389's review).
    dashboards: documents
      .filter(
        (document) => document.kind === 'dashboard' && usesAny(cubesOfDashboard(document.body)),
      )
      .map(({ id, title }) => ({ id, title })),
  };
}
