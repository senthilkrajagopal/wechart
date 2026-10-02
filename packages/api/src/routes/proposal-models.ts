import type { ChartDefinition } from '@wechart/core';
import { parse } from 'yaml';

import { cubesOfChart, cubesOfDashboard } from '../model/bind';
import { declaredIn } from '../model/split';
import type { StoredModelFile } from '../repos/model-files';
import type { ProposedItem } from '../repos/proposals';
import { XCUBE_ROOT, xcubeIdOf } from '../xcube/folders';

/**
 * The workspace models a proposal holds (T350, AC-285; design 05, states A
 * and G).
 *
 * A workspace's previews read its models through its overlay, each placed in
 * its target folder (a copy's is its origin's folder), where it makes the
 * cube `<folder>__<name>` (the root's, `<name>`) in place of any published
 * one of that name (T347). A dashboard or chart naming such a cube was drawn
 * through the workspace, so its proposal holds the model too, and the two are
 * approved or rejected together: landed apart, one would land naming a cube
 * its folder doesn't have, or not as it was drawn.
 *
 * By the full name the item holds, not its short name: the workspace's
 * previews rebind a stored name to the workspace's own cube of its short name
 * wherever that one goes (T542, AC-281), but an approval binds the item where
 * it lands (T502), so a model placed off the name's folder is never what the
 * landed item uses, and doesn't go with it (T542's review).
 *
 * A small decision, overturnable: a model goes with the item where the item
 * names the cube the model makes, whether or not the folder already has a
 * cube of that name. A copy changed in the workspace (a measure added, say)
 * is what the item was drawn against; the folder's own may lack what it uses.
 * A copy left exactly as its folder's file is doesn't go: the item resolves
 * the same without it (T350's review).
 *
 * Those models' own names resolve in the overlay first, by short name,
 * whatever its folder (research `xcube-slice-5.md`, Gotcha 5), so each
 * workspace model one of them names — a join, `extends`, a view's join path,
 * a `{name.member}` reference — goes too, and so on. Nothing else of the
 * workspace does. A model proposed by itself goes with the models it names.
 *
 * Each lands in its own target, replacing the file there that declares its
 * name, as a dashboard replaces the folder's of its title (AC-288).
 */

/** A workspace model as its overlay places it. */
interface Placed {
  readonly file: StoredModelFile;
  /** The cube or view it declares. */
  readonly name: string;
  /** Its cube's name where it is placed: `<xcube folder id>__<name>`, the root's `<name>`. */
  readonly fullName: string;
}

export interface ProposalModelDeps {
  readonly files: {
    inFolders(folderIds: readonly string[]): Promise<readonly StoredModelFile[]>;
    byId(id: string): Promise<StoredModelFile | undefined>;
  };
  /** A workspace's folders: its root and every folder in it. */
  readonly foldersOf: (workspaceId: string) => Promise<readonly string[]>;
  /** Each shared folder xcube serves, by wechart's id: its xcube id. */
  readonly xcubeIds: () => Promise<ReadonlyMap<string, string>>;
}

const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
/** A `{name}` or `{name.member}` reference in an expression. */
const BRACED = /\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*[.}]/g;
/** A member path standing alone, as rollups and references list them: `orders.count`. */
const MEMBER_PATH = /^([A-Za-z_][A-Za-z0-9_]*)(\.[A-Za-z_][A-Za-z0-9_]*)+$/;

/**
 * The names a model file's YAML may resolve to another item: its joins',
 * what it `extends`, each step of a view's join paths, and the cube of every
 * `{…}` reference and every member path standing alone. It reads more than
 * xcube binds (a `public.orders` table is read as `public`), which can only
 * bring a model of that name along, never leave one behind.
 */
export function namesUsedIn(content: string): ReadonlySet<string> {
  let parsed: unknown;
  try {
    parsed = parse(content);
  } catch {
    return new Set();
  }
  const names = new Set<string>();
  const add = (name: string) => {
    if (NAME.test(name)) names.add(name);
  };
  const walk = (value: unknown, key: string | undefined, inJoins: boolean): void => {
    if (typeof value === 'string') {
      for (const match of value.matchAll(BRACED)) add(match[1]!);
      if (key === 'extends') add(value.replace(/[{}\s]/g, ''));
      if (key === 'join_path') for (const step of value.split('.')) add(step.trim());
      const path = MEMBER_PATH.exec(value.trim());
      if (path !== null) add(path[1]!);
      return;
    }
    if (Array.isArray(value)) {
      for (const each of value) walk(each, key, inJoins);
      return;
    }
    if (value !== null && typeof value === 'object')
      for (const [field, each] of Object.entries(value)) {
        if (inJoins && field === 'name' && typeof each === 'string') add(each);
        walk(each, field, field === 'joins');
      }
  };
  walk(parsed, undefined, false);
  return names;
}

/** The cubes a proposed dashboard or chart names: its filters', its chart's. */
function cubesNamedBy(item: ProposedItem): string[] {
  if (item.kind === 'dashboard') return cubesOfDashboard(item.snapshot);
  if (item.kind !== 'chart') return [];
  const chart = item.snapshot['chart'] as ChartDefinition | undefined;
  if (typeof chart?.source?.cube !== 'string' || chart.source.cube === '') return [];
  const { source, others } = cubesOfChart(chart);
  return [source, ...others];
}

/**
 * A workspace model a proposal needs, whose target xcube doesn't serve now
 * (a folder deleted since, say): there is nowhere to put it, so the item
 * naming its cube can't be proposed without it (T350's review).
 */
export class UnservedModel extends Error {
  constructor(readonly path: string) {
    super(
      `“${path}”, which goes with it, is to go to a folder xcube doesn’t serve now (it may have been deleted), so it can’t be proposed.`,
    );
    this.name = 'UnservedModel';
  }
}

const fullNameOf = (folder: string, name: string) =>
  folder === XCUBE_ROOT ? name : `${folder}__${name}`;

export function proposalModels(deps: ProposalModelDeps) {
  /**
   * The workspace's models, where its overlay places them; `unserved`, those
   * whose target xcube doesn't serve now, by the name they'd make there.
   */
  const placedIn = async (
    workspaceId: string,
  ): Promise<{ placed: Placed[]; unserved: Placed[] }> => {
    const ids = await deps.xcubeIds();
    const held = await deps.files.inFolders(await deps.foldersOf(workspaceId));
    const placed: Placed[] = [];
    const unserved: Placed[] = [];
    for (const file of held) {
      const [declared] = declaredIn(file.content);
      if (file.targetFolderId === null || declared === undefined || declared.name === '') continue;
      const served = ids.get(file.targetFolderId);
      const folder = served ?? xcubeIdOf(file.targetFolderId);
      if (folder === undefined) continue;
      (served === undefined ? unserved : placed).push({
        file,
        name: declared.name,
        fullName: fullNameOf(folder, declared.name),
      });
    }
    return { placed, unserved };
  };

  /** The file in a folder declaring this name, as its folder has it. */
  const replacedIn = async (folderId: string, name: string) =>
    (await deps.files.inFolders([folderId])).find(
      (file) => declaredIn(file.content)[0]?.name === name,
    );

  /**
   * Whether it is as the folder's own file of its name: a copy left as it
   * was, through which nothing resolves otherwise than without it.
   */
  const unchanged = async (model: Placed) =>
    (await replacedIn(model.file.targetFolderId!, model.name))?.content === model.file.content;

  /**
   * These, then each workspace model they name, by short name, and so on;
   * an unchanged copy left out, its names not followed, as the folder's own
   * file answers them the same. One that would go but has nowhere to is
   * refused.
   */
  const withWhatTheyName = async (
    start: readonly Placed[],
    { placed, unserved }: { placed: readonly Placed[]; unserved: readonly Placed[] },
    keepFirst = false,
  ): Promise<Placed[]> => {
    const found: Placed[] = [];
    const queue = [...start];
    const seen = new Set<Placed>(queue);
    while (queue.length > 0) {
      const model = queue.shift()!;
      if (!(keepFirst && found.length === 0 && model === start[0]) && (await unchanged(model)))
        continue;
      found.push(model);
      const names = namesUsedIn(model.file.content);
      const away = unserved.find((each) => names.has(each.name));
      if (away !== undefined) throw new UnservedModel(away.file.path);
      for (const other of placed)
        if (names.has(other.name) && !seen.has(other)) {
          seen.add(other);
          queue.push(other);
        }
    }
    return found;
  };

  /** A model as a proposal holds it: what it is now, where it lands, what it replaces there. */
  const itemOf = async (model: Placed): Promise<ProposedItem> => {
    const landsIn = model.file.targetFolderId!;
    const replaced = await replacedIn(landsIn, model.name);
    return {
      kind: 'model',
      id: model.file.id,
      title: model.file.path,
      version: model.file.version,
      snapshot: { path: model.file.path, content: model.file.content, origin: model.file.origin },
      landsIn,
      replaces: replaced === undefined ? null : { id: replaced.id, version: replaced.version },
    };
  };
  const itemsOf = async (models: readonly Placed[]) => {
    const items: ProposedItem[] = [];
    for (const model of models) items.push(await itemOf(model));
    return items;
  };

  return {
    /** A model file by its id, as stored. */
    file: (id: string) => deps.files.byId(id),

    /** The workspace models these proposed items name cubes through, and what those name. */
    /** By the full names the items hold: what they land bound to (above). */
    async needed(workspaceId: string, items: readonly ProposedItem[]): Promise<ProposedItem[]> {
      const used = new Set(items.flatMap(cubesNamedBy));
      if (used.size === 0) return [];
      const held = await placedIn(workspaceId);
      const away = held.unserved.find((model) => used.has(model.fullName));
      if (away !== undefined) throw new UnservedModel(away.file.path);
      return itemsOf(
        await withWhatTheyName(
          held.placed.filter((model) => used.has(model.fullName)),
          held,
        ),
      );
    },

    /**
     * A model proposed by itself: it, then the workspace models it names.
     * None where its overlay places it nowhere: no target xcube serves.
     */
    async alone(workspaceId: string, fileId: string): Promise<ProposedItem[] | undefined> {
      const held = await placedIn(workspaceId);
      const own = held.placed.find((model) => model.file.id === fileId);
      return own === undefined ? undefined : itemsOf(await withWhatTheyName([own], held, true));
    },

    /** The file a model item replaces, as its folder has it now; none once gone. */
    async current(id: string): Promise<{ content: string; version: number } | undefined> {
      const file = await deps.files.byId(id);
      return file === undefined ? undefined : { content: file.content, version: file.version };
    },
  };
}

export type ProposalModels = ReturnType<typeof proposalModels>;
