/**
 * Upgrading a saved chart written in an earlier format (AC-181).
 *
 * Forward-only, one step per version, run on read. Grafana's
 * `DashboardMigrator` and Metabase's `upgrade-card-schema-to` both work this
 * way, and both also show the two properties that matter most here:
 *
 * - **The chain is append-only.** Metabase has two upgrade steps it can never
 *   delete — one that "caused performance problems" and one whose own comment
 *   reads "This fix was a failure … now it's just a no-op" — because older
 *   rows still have to traverse them. A step is therefore written once and, if
 *   it turns out wrong, neutered rather than removed.
 * - **Migrating does not save.** Grafana's plugin migrations are "not
 *   automatically persisted", so they re-run on every load until someone
 *   saves. That is the behaviour here too, and it is the safe one: reading a
 *   chart never writes to the database.
 *
 * What is deliberately not copied is Superset's approach, which has no version
 * on the payload at all, rewrites every row in place, keeps the whole
 * pre-migration document inside the document as `form_data_bak` for ever, and
 * swallows per-row failures so a partial migration surfaces nothing.
 */

import { CHART_DOCUMENT_VERSION, ChartDocumentError } from './chart-document';

/**
 * A chart saved in Auto before R81's recommender rules (T970, AC-562) is read
 * as such, by the absence of its rules version, rather than upgraded: no step
 * here writes one in, so it is drawn by the rules it was saved under until
 * its fields next change.
 */
export { recommenderRulesOf } from './chart-spec';

/** One step: take a body at `from`, return it at `from + 1`. */
type Upgrade = (body: Record<string, unknown>) => Record<string, unknown>;

/**
 * Version 0 is the body charts had before they carried a definition: catalog
 * metadata only (`title`, `owner`, `folderId`, `localToDashboardId`). Those
 * rows exist, so they have to open — as a chart with no members, which is what
 * they in fact described. Nothing is invented: no cube is named, so the empty
 * string stands for "none chosen yet", exactly as a newly opened editor does.
 */
const toVersion1: Upgrade = (body) => ({
  ...body,
  schemaVersion: 1,
  chart: {
    source: { cube: '' },
    wells: { measures: [], dimensions: [], timeDimensions: [] },
  },
});

/**
 * Version 2 adds a chart's own filters and the grain chosen for each time
 * field (AC-216). A version-1 body has neither, which reads as none chosen,
 * so the step only raises the marker. The raise is what stops a version-1
 * reader opening a filtered chart unfiltered (T229's review).
 */
const toVersion2: Upgrade = (body) => ({ ...body, schemaVersion: 2 });

/**
 * Indexed by the version being left behind: `UPGRADES[0]` takes a version-0
 * body to version 1. Add a step here and raise `CHART_DOCUMENT_VERSION`
 * together; never renumber or remove one.
 */
const UPGRADES: readonly Upgrade[] = [toVersion1, toVersion2];

/** What version a stored body is, treating an absent marker as the oldest. */
export function versionOf(body: Record<string, unknown>): number {
  const version = body['schemaVersion'];
  // The pre-definition body carries no marker at all, and that absence is
  // itself the identifying feature of version 0.
  return typeof version === 'number' ? version : 0;
}

/**
 * Bring a stored body up to the current format.
 *
 * Idempotent: a body already at the current version is returned untouched, so
 * this is safe to run on every read.
 */
export function migrateChartDocument(body: unknown): unknown {
  if (typeof body !== 'object' || body === null) return body;

  const raw = body as Record<string, unknown>;
  let version = versionOf(raw);

  if (version > CHART_DOCUMENT_VERSION) {
    throw new ChartDocumentError(
      `The stored chart is version ${String(version)}, but this wechart understands only up to ${String(
        CHART_DOCUMENT_VERSION,
      )}. It was saved by a newer version.`,
    );
  }

  let current = raw;
  while (version < CHART_DOCUMENT_VERSION) {
    const upgrade = UPGRADES[version];
    if (upgrade === undefined) {
      throw new ChartDocumentError(
        `No upgrade is registered from chart version ${String(version)}.`,
      );
    }
    current = upgrade(current);
    version += 1;
  }

  return current;
}

/**
 * A frozen stored body per past version, with what the chart was.
 *
 * These are the regression net: a later step that quietly drops a member or
 * resets a chart type fails here rather than in someone's dashboard. They are
 * fixtures of *stored data*, so they are never edited to match new code — if a
 * fixture stops passing, the migration is wrong, not the fixture.
 */
export interface LegacyFixture {
  readonly version: number;
  readonly body: Record<string, unknown>;
  readonly expects: {
    readonly title: string;
    readonly cube: string;
    readonly measures: readonly string[];
    readonly dimensions: readonly string[];
    readonly timeDimensions: readonly string[];
    readonly chartType: string | undefined;
  };
}

export const LEGACY_FIXTURES: readonly LegacyFixture[] = [
  {
    version: 0,
    body: {
      title: 'Seeded local chart',
      localToDashboardId: 'seed-root-dashboard-1',
      owner: 'admin',
    },
    expects: {
      title: 'Seeded local chart',
      cube: '',
      measures: [],
      dimensions: [],
      timeDimensions: [],
      chartType: undefined,
    },
  },
  {
    // A chart as T229's predecessors stored it: before a chart's own filters
    // and chosen grains existed.
    version: 1,
    body: {
      schemaVersion: 1,
      title: 'Orders by status',
      owner: 'admin',
      folderId: 'seed-folder-0',
      chart: {
        source: { cube: 'orders' },
        wells: {
          measures: ['orders.count'],
          dimensions: ['orders.status'],
          timeDimensions: ['orders.ordered_at'],
        },
        chartType: 'bar',
        options: { axes: { y: { title: 'Orders' } } },
      },
    },
    expects: {
      title: 'Orders by status',
      cube: 'orders',
      measures: ['orders.count'],
      dimensions: ['orders.status'],
      timeDimensions: ['orders.ordered_at'],
      chartType: 'bar',
    },
  },
];
