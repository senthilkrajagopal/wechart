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
      for (const member of members)
        if (value === member || value.startsWith(`${member}.`)) found.add(member);
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
      const held = (document.body as { charts?: unknown } | null)?.charts;
      const through = [
        ...(Array.isArray(held) ? held : []),
        ...charts.filter((chart) => chart.dashboardId === document.id).map((chart) => chart.id),
      ].filter(
        (id, at, all): id is string =>
          typeof id === 'string' && byId.has(id) && all.indexOf(id) === at,
      );
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
