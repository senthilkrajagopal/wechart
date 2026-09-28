/**
 * Which tiles a proposed dashboard changes or adds against its folder's
 * current version (T356, AC-341; design 05, pin 4; R33 proposal 4), by tile
 * id, which a copy keeps. A tile is changed when anything of it differs
 * but the id of the chart it shows, or when that chart differs, where it
 * is kept and whose it is aside: a copy's charts have ids and places of
 * their own. Sections and tab groups aren't marked; the tiles in them are.
 */
export type TileChange = 'new' | 'changed';

interface Drawn {
  readonly body: unknown;
  /** Chart documents' bodies by id. */
  readonly charts: Readonly<Record<string, unknown>>;
}

const record = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

/** Its tiles by id: every element holding no items or tabs of its own. */
function tilesOf(body: unknown): Map<string, Record<string, unknown>> {
  const tiles = new Map<string, Record<string, unknown>>();
  const walk = (items: unknown) => {
    if (!Array.isArray(items)) return;
    for (const each of items) {
      const element = record(each);
      if (element === undefined) continue;
      if (Array.isArray(element['items'])) walk(element['items']);
      else if (Array.isArray(element['tabs']))
        for (const tab of element['tabs']) walk(record(tab)?.['items']);
      else if (typeof element['id'] === 'string') tiles.set(element['id'], element);
    }
  };
  for (const page of (record(body)?.['pages'] as unknown[] | undefined) ?? [])
    walk(record(page)?.['items']);
  return tiles;
}

/** JSON with its keys in order, so two equal values print the same. */
function printed(value: unknown): string {
  return JSON.stringify(value, (_key, each: unknown) => {
    const object = record(each);
    return object === undefined
      ? each
      : Object.fromEntries(
          Object.keys(object)
            .toSorted()
            .map((key) => [key, object[key]]),
        );
  });
}

/** Where a chart is kept and whose it is: not what it draws. */
const PLACE = new Set(['folderId', 'targetFolderId', 'localToDashboardId', 'origin', 'owner']);

const chartOf = (drawn: Drawn, tile: Record<string, unknown>) => {
  const id = tile['chartId'];
  if (typeof id !== 'string') return undefined;
  const body = record(drawn.charts[id]);
  return body === undefined
    ? { missing: id }
    : Object.fromEntries(Object.entries(body).filter(([key]) => !PLACE.has(key)));
};

const tileAlone = (tile: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(tile).filter(([key]) => key !== 'chartId'));

export function tileChangesOf(
  proposed: Drawn,
  current: Drawn | undefined,
): Record<string, TileChange> {
  const now = current === undefined ? new Map() : tilesOf(current.body);
  const changes: Record<string, TileChange> = {};
  for (const [id, tile] of tilesOf(proposed.body)) {
    const was = now.get(id);
    if (was === undefined) changes[id] = 'new';
    else if (
      printed(tileAlone(tile)) !== printed(tileAlone(was)) ||
      printed(chartOf(proposed, tile)) !== printed(chartOf(current!, was))
    )
      changes[id] = 'changed';
  }
  return changes;
}
