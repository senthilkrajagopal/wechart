import type { FolderNode } from '../explore/FolderTree';
import { folderChain } from '../explore/folders';
import { isMyWorkspace, SHARED_ROOT } from '../explore/roots';
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
 *
 * With models in folders (T342): every item is published under its own name
 * in every folder (T710, AC-328), and the names a folder's view or extending
 * cube uses are found along its path (AC-272). So each member is named as
 * charts are bound to it, by its one name.
 */
type Value = Record<string, unknown>;
type File = {
  readonly path: string;
  readonly content: string;
  /** The folder holding it; none is the shared root's. */
  readonly folderId?: string | undefined;
};

/** Where each folder's items are named and found (T342). */
export interface Places {
  /** A folder and each folder above it, itself first, the root last: where its names are found. */
  readonly pathOf: (folderId: string) => readonly string[];
  /**
   * What its items' published names start with: nothing, in every published
   * folder (T710), and none at all for a folder not yet published to, whose
   * items no chart names.
   */
  readonly prefixOf: (folderId: string) => string | undefined;
}

const ROOT = SHARED_ROOT.id;

/** Every file the root's, as a model was before folders held any. */
const ROOT_ONLY: Places = { pathOf: () => [ROOT], prefixOf: () => '' };

/** The folders as `/api/folders` lists them, each named by its stored xcube id (T429). */
export function placesOf(folders: readonly FolderNode[]): Places {
  return {
    pathOf: (folderId) =>
      folderId === ROOT
        ? [ROOT]
        : folderChain(folders, folderId)
            .map((crumb) => crumb.id)
            .reverse(),
    // Every published folder's items under their own names (T710, AC-328).
    // Never a folder in My workspace, though it holds an xcube id once a save
    // in it is pushed: a copy there keeps its original's name (R71), and
    // would stand in for the folder's file (T738).
    prefixOf: (folderId) => {
      if (folderId === ROOT) return '';
      const xcubeId = folders.find((folder) => folder.id === folderId)?.xcubeId;
      if (typeof xcubeId !== 'string' || xcubeId === '') return undefined;
      return isMyWorkspace(folderChain(folders, folderId)[0]?.id ?? '') ? undefined : '';
    },
  };
}

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

const folderOf = (file: File) => file.folderId ?? ROOT;
/** A file by where it is: the same path in two folders is two files. */
const keyOf = (file: File) => `${folderOf(file)}\n${file.path}`;

/** Whether a file is read as YAML here and doesn't parse. */
const unparsed = (file: File) =>
  objectsOf(file.path, file.content).code === undefined &&
  modelOf(file.content).model === undefined;

/**
 * Each member of the model by the name charts use, and its definition as
 * text; none if a file doesn't parse. `skipped` are files left out of both
 * sides of the comparison.
 */
function modelMembers(
  files: readonly File[],
  places: Places,
  skipped: ReadonlySet<string>,
): Map<string, string> | undefined {
  type Cube = { own: Map<string, string>; extends: string | undefined };
  /** Each folder's cubes, by name. */
  const cubes = new Map<string, Map<string, Cube>>();
  const views: { folder: string; view: Value }[] = [];
  for (const file of files) {
    if (skipped.has(keyOf(file))) continue;
    // Code and templates are Cube's to run; what they define isn't read here.
    if (objectsOf(file.path, file.content).code !== undefined) continue;
    const { model } = modelOf(file.content);
    if (model === undefined) return undefined;
    const folder = folderOf(file);
    const here = cubes.get(folder) ?? new Map<string, Cube>();
    cubes.set(folder, here);
    for (const cube of objects(model.cubes)) {
      const name = cube['name'];
      if (typeof name !== 'string') continue;
      const parent = cube['extends'];
      here.set(name, {
        own: ownMembers(cube),
        extends: typeof parent === 'string' ? parent : undefined,
      });
    }
    views.push(...objects(model.views).map((view) => ({ folder, view })));
  }

  /**
   * The folder on a folder's path keeping the cube of a name (AC-272): one
   * item holds a name (R71), so at most one does; never `not`.
   */
  const find = (from: string, name: string, not?: string) => {
    for (const at of places.pathOf(from)) {
      if (`${at}/${name}` === not) continue;
      if (cubes.get(at)?.has(name) === true) return at;
    }
    return undefined;
  };

  /** A cube's members: its parent's, then its own over them. */
  const resolved = new Map<string, Map<string, string>>();
  const membersOf = (
    at: string,
    name: string,
    seen: ReadonlySet<string> = new Set(),
  ): Map<string, string> => {
    const key = `${at}/${name}`;
    const done = resolved.get(key);
    if (done !== undefined) return done;
    const cube = cubes.get(at)?.get(name);
    if (cube === undefined || seen.has(key)) return new Map();
    // Its parent as its own folder finds it, never itself.
    const parentAt = cube.extends === undefined ? undefined : find(at, cube.extends, key);
    const members =
      cube.extends === undefined || parentAt === undefined
        ? new Map<string, string>()
        : new Map(membersOf(parentAt, cube.extends, new Set([...seen, key])));
    for (const [member, definition] of cube.own) members.set(member, definition);
    resolved.set(key, members);
    return members;
  };

  const found = new Map<string, string>();
  for (const [at, here] of cubes) {
    const prefix = places.prefixOf(at);
    if (prefix === undefined) continue;
    for (const name of here.keys())
      for (const [member, definition] of membersOf(at, name))
        found.set(`${prefix}${name}.${member}`, definition);
  }

  for (const { folder, view } of views) {
    const name = view['name'];
    const prefix = places.prefixOf(folder);
    if (typeof name !== 'string' || prefix === undefined) continue;
    for (const [member, definition] of ownMembers(view))
      found.set(`${prefix}${name}.${member}`, definition);
    for (const entry of objects(view['cubes'])) {
      const path = entry['join_path'];
      if (typeof path !== 'string') continue;
      const cube = path.split('.').pop() ?? path;
      const sourceAt = find(folder, cube);
      const source = sourceAt === undefined ? new Map<string, string>() : membersOf(sourceAt, cube);
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
      const prefixed = entry['prefix'] === true;
      const cubeAlias = typeof entry['alias'] === 'string' ? entry['alias'] : cube;
      for (const item of items) {
        const member = item['name'];
        if (typeof member !== 'string') continue;
        const alias = item['alias'];
        // research Y.10a: an alias names it; with a prefix, `<cube or its alias>_<member>`.
        const exposed =
          typeof alias === 'string' ? alias : prefixed ? `${cubeAlias}_${member}` : member;
        found.set(
          `${prefix}${name}.${exposed}`,
          JSON.stringify({ join_path: path, item, source: source.get(member) ?? null }),
        );
      }
    }
  }
  return found;
}

/**
 * The members `after` changes or no longer has, of those `before` has. A
 * file that doesn't parse on either side is left out of both: unchanged, it
 * edits nothing (T342, where every folder's files are read); one the save
 * breaks or mends stops the comparison, and nothing is listed.
 */
export function editedMembersOf(
  before: readonly File[],
  after: readonly File[],
  places: Places = ROOT_ONLY,
): string[] {
  const brokenAfter = new Set(after.filter(unparsed).map(keyOf));
  const skipped = new Set(
    before
      .filter(unparsed)
      .map(keyOf)
      .filter((key) => brokenAfter.has(key)),
  );
  const was = modelMembers(before, places, skipped);
  const is = modelMembers(after, places, skipped);
  if (was === undefined || is === undefined) return [];
  return [...was].filter(([name, definition]) => is.get(name) !== definition).map(([name]) => name);
}

/** The cubes and views a file declares, by name; none from one that doesn't parse. */
const declaredIn = (content: string): string[] => {
  const { model } = modelOf(content);
  return model === undefined
    ? []
    : [...objects(model.cubes), ...objects(model.views)]
        .map((object) => object['name'])
        .filter((name): name is string => typeof name === 'string');
};

/**
 * The model with a file landed in `folderId` at `path`, as an approval lands
 * it (T451): over the folder's file of that path, and over each file there
 * declaring a name it declares.
 */
const landedIn = (
  every: readonly File[],
  folderId: string,
  path: string,
  content: string,
): File[] => {
  const names = new Set(declaredIn(content));
  return [
    ...every.filter(
      (file) =>
        folderOf(file) !== folderId ||
        (file.path !== path && !declaredIn(file.content).some((name) => names.has(name))),
    ),
    { folderId, path, content },
  ];
};

/**
 * The members landing a model saved in My workspace would edit (T546, AC-141
 * amended, R55): the folder it goes to as it is now, against that folder with
 * the model landed in it. Nothing of a workspace is published, so no chart is
 * bound to its own folder's items; the shared charts and dashboards its
 * landing would change are those using the folder's members, by their full
 * names there, and those its views and extending cubes along paths through
 * it expose.
 *
 * Every member the landing would change, not only this save's: until it
 * lands, a member an earlier save changed is still one it would change, and a
 * chart may have started using it since.
 */
export function landedEditsOf(
  /** Every folder's files the user may see, as they are now. */
  every: readonly File[],
  {
    landsIn,
    path,
    content,
  }: {
    /** The shared folder it goes to (T347, AC-282). */
    readonly landsIn: string;
    readonly path: string;
    /** The file as it is to be saved. */
    readonly content: string;
  },
  places: Places = ROOT_ONLY,
): string[] {
  return editedMembersOf(every, landedIn(every, landsIn, path, content), places);
}
