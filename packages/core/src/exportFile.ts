import { ChartDocumentError, readChartDocument } from './chart-document';
import { migrateChartDocument } from './chart-migrations';
import { DRIVER_TYPES, DRIVERS, type DriverType } from './data-sources/drivers';
import { SHORT_NAME, type FieldValue } from './data-sources/validate';
import { CHART_TYPES } from './render-spec';

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

/**
 * Reading an export file (T512; AC-359; design 13, states I, J and K).
 *
 * Every part is checked before anything is taken from it: a file this
 * wechart can't read is refused saying where and why (state J), and one that
 * holds a kind, a chart type or a driver it doesn't have is refused naming
 * each such part and why (state K). There is no version gate beyond the
 * file's own format: a file from another wechart reads whenever every part is
 * known here (design 13, the Metabase row). Reading is a function of the text
 * alone, so a refusal changes nothing.
 */
export interface ExportRefusal {
  /** Which part: `Chart “Order flow”, on the dashboard Q3 board pack`, `Item 12, “Late orders”`. */
  readonly part: string;
  readonly why: string;
}

export type ReadExport =
  | { readonly ok: true; readonly file: ExportFile }
  /** Not a wechart export at all, or not one this wechart can read (state J). */
  | { readonly ok: false; readonly unreadable: string }
  /** Parts this wechart doesn't have, or that don't fit together (state K). */
  | { readonly ok: false; readonly parts: readonly ExportRefusal[] };

/** The kinds an export file holds, as the refusal says them. */
const KINDS = ['dashboard', 'chart', 'model', 'data-source'] as const;

/**
 * Where a text stops being JSON (RFC 8259), found the same in every engine:
 * `JSON.parse`'s messages differ between V8, SpiderMonkey and JavaScriptCore,
 * and some name no place. `undefined` where the text is JSON, or so deep the
 * search gives up.
 */
function jsonStopsAt(text: string): number | undefined {
  let at = 0;
  const STOP = Symbol('stop');
  // A marker, caught below: not an error anyone sees.
  const fail = (): never => {
    throw STOP;
  };
  const space = () => {
    while (at < text.length && ' \t\n\r'.includes(text[at]!)) at += 1;
  };
  const word = (expected: string) => {
    for (const char of expected) {
      if (text[at] !== char) fail();
      at += 1;
    }
  };
  const string = () => {
    at += 1;
    for (;;) {
      const char = text[at];
      if (char === undefined || char < ' ') fail();
      if (char === '"') {
        at += 1;
        return;
      }
      if (char !== '\\') {
        at += 1;
        continue;
      }
      at += 1;
      const escaped = text[at];
      if (escaped === 'u') {
        for (let digit = 1; digit <= 4; digit += 1)
          if (!/[0-9a-fA-F]/.test(text[at + digit] ?? '')) {
            at += digit;
            fail();
          }
        at += 5;
      } else if (escaped !== undefined && '"\\/bfnrt'.includes(escaped)) at += 1;
      else fail();
    }
  };
  const digits = () => {
    const from = at;
    while (/[0-9]/.test(text[at] ?? '')) at += 1;
    if (at === from) fail();
  };
  const number = () => {
    if (text[at] === '-') at += 1;
    if (text[at] === '0') at += 1;
    else digits();
    if (text[at] === '.') {
      at += 1;
      digits();
    }
    if (text[at] === 'e' || text[at] === 'E') {
      at += 1;
      if (text[at] === '+' || text[at] === '-') at += 1;
      digits();
    }
  };
  const list = (close: string, member: () => void) => {
    at += 1;
    space();
    if (text[at] === close) {
      at += 1;
      return;
    }
    for (;;) {
      member();
      space();
      if (text[at] === ',') {
        at += 1;
        continue;
      }
      if (text[at] !== close) fail();
      at += 1;
      return;
    }
  };
  const value = (): void => {
    space();
    const char = text[at];
    if (char === '{')
      list('}', () => {
        space();
        if (text[at] !== '"') fail();
        string();
        space();
        if (text[at] !== ':') fail();
        at += 1;
        value();
      });
    else if (char === '[') list(']', value);
    else if (char === '"') string();
    else if (char === 't') word('true');
    else if (char === 'f') word('false');
    else if (char === 'n') word('null');
    else if (char === '-' || /[0-9]/.test(char ?? '')) number();
    else fail();
  };
  try {
    value();
    space();
    if (at < text.length) fail();
    return undefined;
  } catch (stop) {
    // Anything else is the engine giving up — nested past its stack, said as
    // a RangeError in one engine and otherwise in another: no place to name.
    return stop === STOP ? at : undefined;
  }
}

/**
 * How deep a dashboard's or chart's body may nest: a dashboard's pages,
 * sections, tab groups and tiles, and a chart's settings, come to a small
 * fraction of it; a body deeper than it would overflow what walks it later.
 */
const MAX_DEPTH = 100;

/** Whether a value nests deeper than `MAX_DEPTH`, walked with a stack of its own. */
function tooDeep(value: unknown): boolean {
  const pending: { value: unknown; depth: number }[] = [{ value, depth: 1 }];
  while (pending.length > 0) {
    const { value: each, depth } = pending.pop()!;
    if (each === null || typeof each !== 'object') continue;
    if (depth > MAX_DEPTH) return true;
    for (const inner of Object.values(each)) pending.push({ value: inner, depth: depth + 1 });
  }
  return false;
}

/** JSON's own whitespace (RFC 8259): what may follow a whole value. */
const trimJsonEnd = (text: string) => text.replace(/[ \t\n\r]+$/, '');

/** A model file's path as xcube takes one (`publish.ts`'s MODEL_PATH, 512 characters at most). */
const MODEL_PATH = /^(?:[A-Za-z0-9_][A-Za-z0-9_.-]*\/)*[A-Za-z0-9_][A-Za-z0-9_.-]*\.ya?ml$/;

/** A place in a text, as an editor counts it: line and column from 1. */
const placeOf = (text: string, offset: number) => {
  const before = text.slice(0, offset);
  return { line: before.split('\n').length, column: offset - before.lastIndexOf('\n') };
};

/** Reads an export file's text (state J's refusals), then what it holds. */
export function readExportFile(text: string): ReadExport {
  if (text.trim() === '') return { ok: false, unreadable: 'It’s empty.' };
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch {
    const stops = jsonStopsAt(text);
    if (stops === undefined) return { ok: false, unreadable: 'It isn’t JSON.' };
    const { line, column } = placeOf(text, stops);
    const where = `line ${String(line)}, column ${String(column)}`;
    return {
      ok: false,
      unreadable:
        stops >= trimJsonEnd(text).length
          ? `It ends part-way through, at ${where}.`
          : `It isn’t JSON: it stops being JSON at ${where}.`,
    };
  }
  return readExport(value);
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isText = (value: unknown): value is string => typeof value === 'string';
const isFieldValue = (value: unknown): value is FieldValue =>
  value === null || ['string', 'number', 'boolean'].includes(typeof value);
const quoted = (text: string) => `“${text}”`;

/** "A", "A and B", "A, B and C". */
const listed = (names: readonly string[]) =>
  names.length <= 1
    ? (names[0] ?? '')
    : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1] ?? ''}`;

/**
 * The chart types the tiles a dashboard means to fill are to become, each
 * with its tile's id: walked with a stack of its own, so no depth of nesting
 * JSON allows overflows the engine's.
 */
function tileTypesOf(value: unknown): { tile: string; type: string }[] {
  const found: { tile: string; type: string }[] = [];
  const pending: unknown[] = [value];
  while (pending.length > 0) {
    const each = pending.pop();
    if (Array.isArray(each)) {
      for (let at = each.length - 1; at >= 0; at -= 1) pending.push(each[at]);
    } else if (isRecord(each)) {
      if (each['kind'] === 'chart' && each['chartType'] !== undefined)
        found.push({ tile: String(each['id'] ?? '?'), type: String(each['chartType']) });
      for (const [key, inner] of Object.entries(each).reverse())
        if (key !== 'chartType') pending.push(inner);
    }
  }
  return found;
}

/** Reads what an export file holds (state K's refusals): every part, before any is taken. */
export function readExport(value: unknown): ReadExport {
  if (!isRecord(value) || value['format'] !== EXPORT_FORMAT)
    return { ok: false, unreadable: 'It isn’t a wechart export: it doesn’t say it is one.' };
  const version = value['version'];
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1)
    return { ok: false, unreadable: 'It names no export version this wechart knows.' };
  if (version > EXPORT_VERSION)
    return {
      ok: false,
      unreadable: `It was made by a newer wechart, as export version ${String(version)}; this one reads version ${String(EXPORT_VERSION)}.`,
    };
  const items = value['items'];
  if (!Array.isArray(items)) return { ok: false, unreadable: 'It holds no list of items.' };

  const refusals: ExportRefusal[] = [];
  const read: ExportItem[] = [];
  const dashboards = items.filter((item) => isRecord(item) && item['kind'] === 'dashboard');
  const board = dashboards.length === 1 ? dashboards[0] : undefined;
  const boardId = isRecord(board) && isText(board['id']) ? board['id'] : undefined;
  const boardTitle = isRecord(board) && isText(board['title']) ? board['title'] : '';
  if (dashboards.length !== 1)
    refusals.push({
      part: 'The file',
      why:
        dashboards.length === 0
          ? 'It holds no dashboard: an export holds exactly one.'
          : `It holds ${String(dashboards.length)} dashboards: an export holds exactly one.`,
    });

  const chartIds = new Set<string>();
  const modelPaths = new Set<string>();
  const sourceNames = new Set<string>();
  items.forEach((item: unknown, index) => {
    const refuse = (part: string, why: string) => {
      refusals.push({ part, why });
    };
    const named = isRecord(item)
      ? [item['title'], item['name'], item['path']].find(isText)
      : undefined;
    const itemPart = `Item ${String(index + 1)}${named === undefined ? '' : `, ${quoted(named)}`}`;
    if (!isRecord(item)) {
      refuse(itemPart, 'It isn’t an item: each item is an object naming its kind.');
      return;
    }
    const kind = item['kind'];
    if (!isText(kind)) {
      refuse(itemPart, 'It names no kind.');
      return;
    }
    if (!(KINDS as readonly string[]).includes(kind)) {
      refuse(
        itemPart,
        `Kind ${kind}: this wechart imports dashboards, charts, models and data sources.`,
      );
      return;
    }

    if (kind === 'dashboard') {
      const { id, title, body } = item;
      if (!isText(id) || !isText(title) || !isRecord(body)) {
        refuse(itemPart, 'A dashboard needs an id, a title and a body.');
        return;
      }
      const part = `Dashboard ${quoted(title)}`;
      if (tooDeep(body)) {
        refuse(part, `It can’t be read: it nests deeper than ${String(MAX_DEPTH)} levels.`);
        return;
      }
      // As the dashboard opens (`dashboardOf`): no pages is an empty one, as
      // one saved before pages is; pages that aren't a list, or a page with
      // no list of items, can't be read.
      const pages = body['pages'];
      if (pages !== undefined && !Array.isArray(pages)) {
        refuse(part, 'It can’t be read: its pages are not a list.');
        return;
      }
      const empty = (Array.isArray(pages) ? (pages as unknown[]) : []).find(
        (page) => !isRecord(page) || !Array.isArray(page['items']),
      );
      if (empty !== undefined) {
        refuse(part, 'It can’t be read: a page of it has no list of items.');
        return;
      }
      const unknown = tileTypesOf(pages).filter(
        ({ type }) => !(CHART_TYPES as readonly string[]).includes(type),
      );
      for (const { tile, type } of unknown)
        refuse(
          `Tile ${tile}, on the dashboard ${title}`,
          `Chart type ${type}: this wechart has no such chart type.`,
        );
      if (unknown.length === 0) read.push({ kind, id, title, body: exportedBodyOf(body) });
      return;
    }

    if (kind === 'chart') {
      const { id, title, body, dashboardId } = item;
      if (!isText(id) || id === '' || !isText(title) || !isRecord(body)) {
        refuse(itemPart, 'A chart needs an id, a title and a body.');
        return;
      }
      const own = isText(dashboardId);
      const part =
        own && dashboardId === boardId
          ? `Chart ${quoted(title)}, on the dashboard ${boardTitle}`
          : `Chart ${quoted(title)}`;
      // Its id taken first: a second chart of the id is refused, whatever else.
      if (chartIds.has(id)) {
        refuse(part, 'Another chart in the file has its id.');
        return;
      }
      chartIds.add(id);
      if (dashboardId !== undefined && (!own || dashboardId !== boardId)) {
        refuse(part, 'It is the own chart of a dashboard the file doesn’t hold.');
        return;
      }
      if (tooDeep(body)) {
        refuse(part, `It can’t be read: it nests deeper than ${String(MAX_DEPTH)} levels.`);
        return;
      }
      const definition = body['chart'];
      const type = isRecord(definition) ? definition['chartType'] : undefined;
      if (type !== undefined && !(CHART_TYPES as readonly string[]).includes(String(type))) {
        refuse(part, `Chart type ${String(type)}: this wechart has no such chart type.`);
        return;
      }
      let upgraded: Record<string, unknown>;
      try {
        upgraded = migrateChartDocument(body) as Record<string, unknown>;
        readChartDocument(upgraded);
      } catch (failure) {
        if (!(failure instanceof ChartDocumentError)) throw failure;
        refuse(part, `It can’t be read: ${failure.message}`);
        return;
      }
      // Where it was, and whose, stay behind (a file edited by hand may say).
      read.push({
        kind,
        id,
        title,
        ...(own ? { dashboardId } : {}),
        body: exportedBodyOf(upgraded),
      });
      return;
    }

    if (kind === 'model') {
      const { path, content } = item;
      if (!isText(path) || path === '' || !isText(content)) {
        refuse(itemPart, 'A model needs a path and its text.');
        return;
      }
      if (!MODEL_PATH.test(path) || path.length > 512) {
        refuse(
          `Model ${path}`,
          'Not a model file’s path: folders and a name of letters, digits, “_”, “.” and “-”, ending .yml or .yaml.',
        );
        return;
      }
      if (modelPaths.has(path)) {
        refuse(`Model ${path}`, 'Another model in the file has its path.');
        return;
      }
      modelPaths.add(path);
      read.push({ kind, path, content });
      return;
    }

    // A data source: its driver, sign-in and settings, as this wechart has them.
    const { name, driver, authMethod, fields, description } = item;
    if (!isText(name) || !isText(driver) || !isText(authMethod) || !isRecord(fields)) {
      refuse(itemPart, 'A data source needs a name, a driver, a way to sign in and its settings.');
      return;
    }
    const part = `Data source ${name}`;
    if (!(DRIVER_TYPES as readonly string[]).includes(driver)) {
      refuse(
        part,
        `Driver ${driver}: this wechart connects with ${listed(DRIVER_TYPES.map((type) => DRIVERS[type].label))}.`,
      );
      return;
    }
    const spec = DRIVERS[driver as DriverType];
    const method = spec.auth.find((each) => each.id === authMethod);
    if (method === undefined) {
      refuse(
        part,
        `Sign-in ${authMethod}: ${spec.label} signs in with ${listed(spec.auth.map((each) => each.label)).replace(/ and ([^,]*)$/, ' or $1')}.`,
      );
      return;
    }
    if (!SHORT_NAME.test(name) || name.length > 64) {
      refuse(
        part,
        'Not a name a data source takes: lower-case letters and digits, words joined by single underscores, at most 64 characters.',
      );
      return;
    }
    if (sourceNames.has(name)) {
      refuse(part, 'Another data source in the file has its name.');
      return;
    }
    sourceNames.add(name);
    // Any of its driver's secrets, whichever way of signing in keeps it.
    const secrets = [...spec.connection, ...spec.auth.flatMap((each) => each.fields)]
      .filter((field) => field.secret === true)
      .map((field) => field.key);
    const settings = settingKeysOf(spec.type, authMethod);
    for (const [key, setting] of Object.entries(fields)) {
      if (secrets.includes(key)) {
        refuse(part, `It holds ${key}, which ${spec.label} keeps secret: an export never holds a secret.`);
        return;
      }
      if (!settings.includes(key)) {
        refuse(part, `It holds a setting ${spec.label} has no field for: ${key}.`);
        return;
      }
      if (!isFieldValue(setting)) {
        refuse(part, `Its setting ${key} isn’t text, a number, true or false.`);
        return;
      }
    }
    if (description !== undefined && description !== null && !isText(description)) {
      refuse(part, 'Its description isn’t text.');
      return;
    }
    read.push({
      kind: 'data-source',
      name,
      driver,
      authMethod,
      fields: fields as Record<string, FieldValue>,
      description: isText(description) ? description : null,
    });
  });

  if (refusals.length > 0) return { ok: false, parts: refusals };
  return {
    ok: true,
    file: {
      format: EXPORT_FORMAT,
      version: EXPORT_VERSION,
      exportedAt: isText(value['exportedAt']) ? value['exportedAt'] : '',
      items: read,
    },
  };
}
