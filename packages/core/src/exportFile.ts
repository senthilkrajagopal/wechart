import { DRIVERS, type DriverType } from './data-sources/drivers';
import type { FieldValue } from './data-sources/validate';

/**
 * A dashboard's export file (F38; AC-354, AC-355; R43, R46): one JSON file,
 * `<name>.wechart.json`, holding the dashboard, its own charts and the
 * dependencies its exporter chose, as a list of items each naming its kind
 * (design 13, state K refuses "Item 12" by its kind).
 *
 * Where each item was, and whose, stays behind: an import puts everything
 * into its importer's workspace with the one target they choose (AC-356). A
 * data source goes as its driver, its settings and its description, never a
 * secret, sealed or not, nor a secret's revision (AC-355).
 */
export const EXPORT_FORMAT = 'wechart-export';
export const EXPORT_VERSION = 1;
/** What an export file's name ends with (R46, Q4). */
export const EXPORT_EXTENSION = '.wechart.json';

/** The dashboard, as saved. */
export interface ExportedDashboard {
  readonly kind: 'dashboard';
  readonly id: string;
  readonly title: string;
  readonly body: Readonly<Record<string, unknown>>;
}

/**
 * A chart: one of a dashboard's own (`dashboardId`), or a library chart the
 * dashboard shows. Its id is the one its dashboard's tiles name it by.
 */
export interface ExportedChart {
  readonly kind: 'chart';
  readonly id: string;
  readonly title: string;
  readonly dashboardId?: string;
  readonly body: Readonly<Record<string, unknown>>;
}

/** A model file, by its path and its text. */
export interface ExportedModel {
  readonly kind: 'model';
  readonly path: string;
  readonly content: string;
}

/** A data source: everything but its secrets (AC-355). */
export interface ExportedDataSource {
  readonly kind: 'data-source';
  readonly name: string;
  readonly driver: string;
  readonly authMethod: string;
  readonly fields: Readonly<Record<string, FieldValue>>;
  readonly description: string | null;
}

export type ExportItem = ExportedDashboard | ExportedChart | ExportedModel | ExportedDataSource;

export interface ExportFile {
  readonly format: typeof EXPORT_FORMAT;
  readonly version: typeof EXPORT_VERSION;
  /** When it was made, as an ISO 8601 instant. */
  readonly exportedAt: string;
  readonly items: readonly ExportItem[];
}

/**
 * The file's name from the dashboard's: "Revenue overview" is
 * `revenue-overview.wechart.json` (design 13, pin 11). Letters and digits
 * are kept, in lower case; anything else between them becomes one hyphen.
 */
export function exportFileNameOf(title: string): string {
  const stem = title
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
  return `${stem === '' ? 'dashboard' : stem}${EXPORT_EXTENSION}`;
}

/** Where an item was, and whose it was: never in the file. */
const PLACE_KEYS = ['folderId', 'owner', 'targetFolderId', 'origin', 'localToDashboardId'] as const;

/** A stored body without its place (`PLACE_KEYS`). */
export function exportedBodyOf(
  body: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  return Object.fromEntries(
    Object.entries(body).filter(([key]) => !(PLACE_KEYS as readonly string[]).includes(key)),
  );
}

/**
 * The settings a driver's sign-in method takes that aren't secret: its
 * connection's fields and the method's own, as `drivers.ts` has them.
 */
export function settingKeysOf(driver: DriverType, authMethod: string): readonly string[] {
  const spec = DRIVERS[driver];
  const method = spec.auth.find((each) => each.id === authMethod);
  return [...spec.connection, ...(method?.fields ?? [])]
    .filter((field) => field.secret !== true)
    .map((field) => field.key);
}

/**
 * A data source as its file item (AC-355): its driver, sign-in method, the
 * settings its driver names that aren't secret, and its description. A key
 * its driver doesn't name, or names secret, is left behind, so nothing new in
 * a stored source can carry a secret out.
 */
export function exportedDataSourceOf(source: {
  readonly name: string;
  readonly driver: string;
  readonly authMethod: string;
  readonly fields: Readonly<Record<string, FieldValue>>;
  readonly description: string | null;
}): ExportedDataSource {
  const known = Object.hasOwn(DRIVERS, source.driver)
    ? settingKeysOf(source.driver as DriverType, source.authMethod)
    : [];
  return {
    kind: 'data-source',
    name: source.name,
    driver: source.driver,
    authMethod: source.authMethod,
    fields: Object.fromEntries(
      Object.entries(source.fields).filter(([key]) => known.includes(key)),
    ),
    description: source.description,
  };
}
