import { parse } from 'yaml';

import type { HeldItem } from './client';
import { connectionNameOf } from './connections';
import type { PublishedFolders } from './folders';

/**
 * The cubes bound to each data source (T459, AC-157; research
 * xcube-e53cf2a8b8.md, "Mapping `dataSource` to wechart's data sources").
 *
 * xcube binds a cube at publish, nearest first from its folder, and never
 * rebinds it (AC-273), so only its items say which data source a cube uses:
 * `dataSource` is the connection's full name, which is `connectionNameOf` a
 * wechart data source's folder and name. A cube that `extends` another has
 * none of its own (`null`) and queries its parent's current one: the parent
 * is the name it extends, as wechart's YAML writes it, bound to a full name
 * in its bindings. One whose data source can't be told — from an image that
 * doesn't say, or a parent that isn't there — is counted as using none.
 */
export interface CubeUsing {
  readonly name: string;
  /** Its folder, by wechart's id. */
  readonly folderId: string;
  /** Its model file's path, where wechart holds it (T499; design 03, state F). */
  readonly file?: string;
}

export function cubesUsing({
  held,
  published,
  sources,
  extendsOf,
  fileOf = () => undefined,
}: {
  readonly held: readonly HeldItem[];
  readonly published: PublishedFolders;
  readonly sources: readonly {
    readonly id: string;
    readonly folderId: string;
    readonly name: string;
  }[];
  /** The short name a cube extends, as wechart's YAML writes it, by xcube's folder id. */
  readonly extendsOf: (xcubeFolderId: string, name: string) => string | undefined;
  /** The model file declaring a cube, by xcube's folder id: a file declares one (AC-337). */
  readonly fileOf?: (xcubeFolderId: string, name: string) => string | undefined;
}): Map<string, CubeUsing[]> {
  const byConnection = new Map<string, string>();
  for (const source of sources) {
    const xcubeId = published.ids.get(source.folderId);
    if (xcubeId !== undefined) byConnection.set(connectionNameOf(xcubeId, source.name), source.id);
  }
  const wechartIdOf = new Map([...published.ids].map(([id, xcubeId]) => [xcubeId, id]));
  const byFullName = new Map(held.map((item) => [item.fullName, item]));

  const boundOf = (item: HeldItem, seen: Set<string>): string | undefined => {
    if (typeof item.dataSource === 'string') return item.dataSource;
    if (item.dataSource !== null || seen.has(item.fullName)) return undefined;
    seen.add(item.fullName);
    const parentName = extendsOf(item.folderId, item.name);
    const parent =
      parentName === undefined ? undefined : byFullName.get(item.bindings[parentName] ?? '');
    return parent === undefined ? undefined : boundOf(parent, seen);
  };

  const using = new Map<string, CubeUsing[]>();
  for (const item of held) {
    if (item.kind !== 'cube') continue;
    const bound = boundOf(item, new Set());
    const sourceId = bound === undefined ? undefined : byConnection.get(bound);
    const folderId = wechartIdOf.get(item.folderId);
    if (sourceId === undefined || folderId === undefined) continue;
    const file = fileOf(item.folderId, item.name);
    const one = { name: item.name, folderId, ...(file === undefined ? {} : { file }) };
    const cubes = using.get(sourceId);
    if (cubes === undefined) using.set(sourceId, [one]);
    else cubes.push(one);
  }
  return using;
}

/**
 * What a model file's cube extends, as it writes it: a file declares one
 * cube or one view (AC-337). None for a view, a cube extending nothing, or
 * YAML that doesn't parse.
 */
export function extendsIn(content: string): { name: string; extends: string } | undefined {
  let doc: unknown;
  try {
    doc = parse(content);
  } catch {
    return undefined;
  }
  const cubes = (doc as { cubes?: unknown } | null)?.cubes;
  const cube: unknown = Array.isArray(cubes) ? cubes[0] : undefined;
  if (cube === null || typeof cube !== 'object') return undefined;
  const { name, extends: parent } = cube as { name?: unknown; extends?: unknown };
  return typeof name === 'string' && typeof parent === 'string'
    ? { name, extends: parent }
    : undefined;
}
