import { objectsOf } from './objects';
import { modelOf } from './sync';

/**
 * The members a save edits (T147, AC-141), across the whole model: each one
 * the save changes or takes away, by every name charts use for it — the
 * cube's own (`orders.count`), a view's that exposes it (by its alias, with
 * a prefix, through `"*"`), a cube's that extends it and doesn't redefine it
 * — so the charts and dashboards using them can be listed before it is
 * saved. One only added is used by nothing yet.
 *
 * Each member's definition is kept as text; a view's or an extending cube's
 * includes the definition of the member it takes, so a change to that shows
 * as a change to every name it goes by (T147's review).
 */
type Value = Record<string, unknown>;
type File = { readonly path: string; readonly content: string };

/** The lists whose members a chart can name. */
const LISTS = ['measures', 'dimensions', 'segments', 'hierarchies'] as const;

const objects = (list: unknown): Value[] =>
  (Array.isArray(list) ? (list as unknown[]) : []).filter(
    (each): each is Value => each !== null && typeof each === 'object' && !Array.isArray(each),
  );

const ownMembers = (object: Value): Map<string, string> => {
  const found = new Map<string, string>();
  for (const list of LISTS)
    for (const member of objects(object[list]))
      if (typeof member['name'] === 'string') found.set(member['name'], JSON.stringify(member));
  return found;
};

/** Each member of the model by the name charts use, and its definition as text; none if one doesn't parse. */
function modelMembers(files: readonly File[]): Map<string, string> | undefined {
  const cubes = new Map<string, { own: Map<string, string>; extends: string | undefined }>();
  const views: Value[] = [];
  for (const file of files) {
    // Code and templates are Cube's to run; what they define isn't read here.
    if (objectsOf(file.path, file.content).code !== undefined) continue;
    const { model } = modelOf(file.content);
    if (model === undefined) return undefined;
    for (const cube of objects(model.cubes)) {
      const name = cube['name'];
      if (typeof name !== 'string') continue;
      const parent = cube['extends'];
      cubes.set(name, {
        own: ownMembers(cube),
        extends: typeof parent === 'string' ? parent : undefined,
      });
    }
    views.push(...objects(model.views));
  }

  /** A cube's members: its parent's, then its own over them. */
  const resolved = new Map<string, Map<string, string>>();
  const membersOf = (name: string, seen: ReadonlySet<string> = new Set()): Map<string, string> => {
    const done = resolved.get(name);
    if (done !== undefined) return done;
    const cube = cubes.get(name);
    if (cube === undefined || seen.has(name)) return new Map();
    const members =
      cube.extends === undefined
        ? new Map<string, string>()
        : new Map(membersOf(cube.extends, new Set([...seen, name])));
    for (const [member, definition] of cube.own) members.set(member, definition);
    resolved.set(name, members);
    return members;
  };

  const found = new Map<string, string>();
  for (const name of cubes.keys())
    for (const [member, definition] of membersOf(name)) found.set(`${name}.${member}`, definition);

  for (const view of views) {
    const name = view['name'];
    if (typeof name !== 'string') continue;
    for (const [member, definition] of ownMembers(view)) found.set(`${name}.${member}`, definition);
    for (const entry of objects(view['cubes'])) {
      const path = entry['join_path'];
      if (typeof path !== 'string') continue;
      const cube = path.split('.').pop() ?? path;
      const source = membersOf(cube);
      const includes = entry['includes'];
      const excluded = new Set(
        (Array.isArray(entry['excludes']) ? (entry['excludes'] as unknown[]) : []).filter(
          (each): each is string => typeof each === 'string',
        ),
      );
      // research Y.10a: names, `{name, alias}` objects, or "*" for all but the excluded.
      const items: Value[] =
        includes === '*'
          ? [...source.keys()]
              .filter((member) => !excluded.has(member))
              .map((member) => ({ name: member }))
          : (Array.isArray(includes) ? (includes as unknown[]) : []).flatMap((each) =>
              typeof each === 'string' ? [{ name: each }] : objects([each]),
            );
      const prefix = entry['prefix'] === true;
      const cubeAlias = typeof entry['alias'] === 'string' ? entry['alias'] : cube;
      for (const item of items) {
        const member = item['name'];
        if (typeof member !== 'string') continue;
        const alias = item['alias'];
        // research Y.10a: an alias names it; with a prefix, `<cube or its alias>_<member>`.
        const exposed =
          typeof alias === 'string' ? alias : prefix ? `${cubeAlias}_${member}` : member;
        found.set(
          `${name}.${exposed}`,
          JSON.stringify({ join_path: path, item, source: source.get(member) ?? null }),
        );
      }
    }
  }
  return found;
}

/** The members `after` changes or no longer has, of those `before` has. */
export function editedMembersOf(before: readonly File[], after: readonly File[]): string[] {
  const was = modelMembers(before);
  const is = modelMembers(after);
  if (was === undefined || is === undefined) return [];
  return [...was].filter(([name, definition]) => is.get(name) !== definition).map(([name]) => name);
}
