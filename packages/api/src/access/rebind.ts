import { shortOf } from '../model/bind';
import { XCUBE_ROOT } from '../xcube/folders';

/**
 * Rebinding in a workspace's previews (T542, AC-281; the user's answer
 * "Rebind in the workspace", R53).
 *
 * An item holds the full names its cubes were bound to: a path's
 * `fsales__orders`, say. In the previews of a workspace, and of a proposal,
 * each such name is resolved again by its short name through the overlay:
 * where the overlay holds a cube or view of that short name, wherever it
 * places it, that one answers, as xcube resolves an overlay item's names
 * (research `xcube-slice-5.md`, "POST …/resolve with overlay": "an overlay
 * upsert of that short name wins, whatever its folder"). It holds at most one
 * of a short name (Gotcha: "No two upserts share a short name"). A name it
 * doesn't hold is left as stored. Approval binds the names where the item
 * lands, as it always has.
 *
 * The query Cube is asked names the overlay's cubes; its answer comes back
 * under the names the item holds, so its tiles read it as they always did.
 */

/** An overlay's own cubes and views by short name: each one's full name where it places it. */
export function rebindsOf(
  upserts: readonly { readonly folderId: string; readonly name: string }[],
): ReadonlyMap<string, string> {
  return new Map(
    upserts.map((each) => [
      each.name,
      each.folderId === XCUBE_ROOT ? each.name : `${each.folderId}__${each.name}`,
    ]),
  );
}

const isPlain = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/** A member of a renamed cube or view, renamed (`a.count` → `fb__a.count`); anything else as it is. */
const memberIn =
  (renames: ReadonlyMap<string, string>) =>
  (member: unknown): unknown => {
    if (typeof member !== 'string') return member;
    const dot = member.indexOf('.');
    const cube = dot > 0 ? member.slice(0, dot) : member;
    const to = renames.get(cube);
    return to === undefined ? member : `${to}${member.slice(cube.length)}`;
  };

/** The cubes and views a query names, where Cube's query keeps names (as `cubesQueried`). */
function namedIn(query: Record<string, unknown>): Set<string> {
  const cubes = new Set<string>();
  const add = (member: unknown) => {
    if (typeof member !== 'string') return;
    const dot = member.indexOf('.');
    cubes.add(dot > 0 ? member.slice(0, dot) : member);
  };
  withNames(query, (member) => {
    add(member);
    return member;
  });
  return cubes;
}

/**
 * A query with each name it holds put through `rename`, where Cube's query
 * keeps names: its measures, dimensions, segments, time dimensions, filters
 * (nested `and` and `or` too), order in either shape, and join hints. A
 * filter's values are data, never names, and are left as they are.
 */
function withNames(
  query: Record<string, unknown>,
  rename: (member: unknown) => unknown,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...query };
  const list = (value: unknown) => (Array.isArray(value) ? value.map(rename) : value);
  for (const key of ['measures', 'dimensions', 'segments'])
    if (key in query) out[key] = list(query[key]);
  if (Array.isArray(query['timeDimensions']))
    out['timeDimensions'] = query['timeDimensions'].map((each: unknown) =>
      isPlain(each) && 'dimension' in each
        ? { ...each, dimension: rename(each['dimension']) }
        : each,
    );
  const filter = (value: unknown): unknown => {
    if (!isPlain(value)) return value;
    const next: Record<string, unknown> = { ...value };
    if ('member' in value) next['member'] = rename(value['member']);
    if ('dimension' in value) next['dimension'] = rename(value['dimension']);
    if (Array.isArray(value['and'])) next['and'] = value['and'].map(filter);
    if (Array.isArray(value['or'])) next['or'] = value['or'].map(filter);
    return next;
  };
  if (Array.isArray(query['filters'])) out['filters'] = query['filters'].map(filter);
  const order = query['order'];
  if (Array.isArray(order))
    out['order'] = order.map((each: unknown) =>
      Array.isArray(each) ? [rename(each[0]), ...each.slice(1)] : each,
    );
  else if (isPlain(order))
    out['order'] = Object.fromEntries(
      Object.entries(order).map(([member, direction]) => [String(rename(member)), direction]),
    );
  if (Array.isArray(query['joinHints']))
    out['joinHints'] = query['joinHints'].map((hint: unknown) => list(hint));
  // A quick calculation names its measure (AC-048; research `xcube-quick-calcs.md`).
  if (Array.isArray(query['calculations']))
    out['calculations'] = query['calculations'].map((each: unknown) =>
      isPlain(each) && 'measure' in each ? { ...each, measure: rename(each['measure']) } : each,
    );
  return out;
}

/**
 * Each member a rebound query asks, by the names the item asked it by: one
 * asked both as a stored name and as the overlay's own (a chart drawn before
 * the workspace's cube, given a member after) is asked once and answered
 * under both (T542's review).
 */
export type Back = ReadonlyMap<string, readonly string[]>;

/** The same names, each once, in their order. */
const once = (value: unknown) =>
  Array.isArray(value) ? value.filter((each, at) => value.indexOf(each) === at) : value;

/**
 * A query rebound through an overlay's own cubes (`rebinds`, by short name):
 * the query to ask Cube, and `back`, to put its answer under the names the
 * item asked. A query naming none of them comes back as it is.
 */
export function reboundQuery(
  query: Record<string, unknown>,
  rebinds: ReadonlyMap<string, string>,
): { query: Record<string, unknown>; back: Back } {
  const renames = new Map<string, string>();
  for (const cube of namedIn(query)) {
    const own = rebinds.get(shortOf(cube));
    if (own !== undefined && own !== cube) renames.set(cube, own);
  }
  if (renames.size === 0) return { query, back: new Map() };
  const rename = memberIn(renames);
  const back = new Map<string, string[]>();
  withNames(query, (member) => {
    if (typeof member !== 'string') return member;
    const asked = rename(member) as string;
    const names = back.get(asked) ?? [];
    if (!names.includes(member)) names.push(member);
    back.set(asked, names);
    return member;
  });
  const rebound = withNames(query, rename);
  for (const key of ['measures', 'dimensions', 'segments'])
    if (key in rebound) rebound[key] = once(rebound[key]);
  return { query: rebound, back };
}

/**
 * The suffix of a quick calculation's column, `<measure>__xc_<calculation>`,
 * which no authored member may hold (research `xcube-quick-calcs.md`).
 */
const CALCULATION = '__xc_';

/**
 * The names the item asked an answer's key by: the member asked, one of its
 * time dimensions at a grain (`….ordered_at.month`), or a quick calculation of
 * it (`….count__xc_rank`, AC-048). A key it didn't ask as another name, as it
 * is.
 */
const namesOf = (key: string, back: Back): readonly string[] => {
  const exact = back.get(key);
  if (exact !== undefined) return exact;
  const calculated = key.indexOf(CALCULATION);
  if (calculated > 0) {
    const asked = back.get(key.slice(0, calculated));
    if (asked !== undefined) return asked.map((name) => `${name}${key.slice(calculated)}`);
  }
  let found: string | undefined;
  for (const asked of back.keys())
    if (key.startsWith(`${asked}.`) && (found === undefined || asked.length > found.length))
      found = asked;
  return found === undefined
    ? [key]
    : back.get(found)!.map((name) => `${name}${key.slice(found.length)}`);
};

/** One member of a rebound query's answer under the name the item asked it by. */
export const memberBack = (member: string, back: Back): string => namesOf(member, back)[0]!;

/**
 * Cube's answer to a rebound query under the names the item asked: each
 * row's members, its annotation's, and the query it echoes, and each of a
 * query Cube runs as several. Nothing to rename, the answer itself.
 */
export function answerRebound(answer: unknown, back: Back): unknown {
  if (back.size === 0 || !isPlain(answer)) return answer;
  const rename = (member: unknown) =>
    typeof member === 'string' ? memberBack(member, back) : member;
  const keysOf = (value: unknown) =>
    isPlain(value)
      ? Object.fromEntries(
          Object.entries(value).flatMap(([key, each]) =>
            namesOf(key, back).map((name) => [name, each] as const),
          ),
        )
      : value;
  const out: Record<string, unknown> = { ...answer };
  if (Array.isArray(answer['results']))
    out['results'] = answer['results'].map((each: unknown) => answerRebound(each, back));
  if (Array.isArray(answer['data'])) out['data'] = answer['data'].map(keysOf);
  if (isPlain(answer['annotation']))
    out['annotation'] = Object.fromEntries(
      Object.entries(answer['annotation']).map(([section, members]) => [section, keysOf(members)]),
    );
  for (const key of ['query', 'pivotQuery'])
    if (isPlain(answer[key])) out[key] = withNames(answer[key], rename);
  return out;
}
