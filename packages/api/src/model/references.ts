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
