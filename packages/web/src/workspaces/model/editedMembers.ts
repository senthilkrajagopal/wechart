import { modelOf } from './sync';

/**
 * The members a save edits (T147, AC-141): each one the new text changes or
 * no longer has, by the name charts use — `orders.count`, `summary.status` —
 * so the charts and dashboards using them can be listed before it is saved.
 * One only added is used by nothing yet.
 */
type Value = Record<string, unknown>;

/** The lists whose members a chart can name. */
const LISTS = ['measures', 'dimensions', 'segments', 'hierarchies'] as const;

const objects = (list: unknown): Value[] =>
  (Array.isArray(list) ? (list as unknown[]) : []).filter(
    (each): each is Value => each !== null && typeof each === 'object' && !Array.isArray(each),
  );

/** Each member's name, and its definition as text: a change to it is a change of the text. */
function membersOf(text: string): Map<string, string> | undefined {
  const { model } = modelOf(text);
  if (model === undefined) return undefined;
  const found = new Map<string, string>();
  const own = (object: Value, name: string) => {
    for (const list of LISTS)
      for (const member of objects(object[list]))
        if (typeof member['name'] === 'string')
          found.set(`${name}.${member['name']}`, JSON.stringify(member));
  };
  for (const cube of objects(model.cubes))
    if (typeof cube['name'] === 'string') own(cube, cube['name']);
  for (const view of objects(model.views)) {
    const name = view['name'];
    if (typeof name !== 'string') continue;
    own(view, name);
    // What it includes, by the name it takes in the view: its alias, or its own.
    for (const entry of objects(view['cubes'])) {
      const includes = entry['includes'];
      for (const each of Array.isArray(includes) ? (includes as unknown[]) : []) {
        const included = typeof each === 'string' ? { name: each } : (each as Value | null);
        const as = included?.['alias'] ?? included?.['name'];
        if (typeof as === 'string')
          found.set(
            `${name}.${as}`,
            JSON.stringify({ join_path: entry['join_path'], ...included }),
          );
      }
    }
  }
  return found;
}

export function editedMembersOf(before: string, after: string): string[] {
  const was = membersOf(before);
  const is = membersOf(after);
  if (was === undefined || is === undefined) return [];
  return [...was].filter(([name, definition]) => is.get(name) !== definition).map(([name]) => name);
}
