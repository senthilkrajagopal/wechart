import type { ModelFile } from '../server';
import { itemsOf, type Item } from './items';

/**
 * A publish as xcube's changeset (T426; research `xcube-slice-3a.md`,
 * "POST …/changesets"): the items it changes, on the base revision wechart
 * last recorded. An item is new or edited when its YAML isn't what the live
 * model holds under its folder and name; a name the change no longer
 * declares is deleted. Items are compared as they are sent: plain YAML only
 * (AC-335), each file one item (AC-337).
 */
export interface Changeset {
  readonly upserts: readonly Item[];
  readonly deletes: readonly { readonly folderId: string; readonly name: string }[];
}

const keyOf = (item: Pick<Item, 'folderId' | 'name'>) => `${item.folderId}/${item.name}`;

export function changesetOf(live: readonly ModelFile[], draft: readonly ModelFile[]): Changeset {
  const before = new Map(itemsOf(live).map((item) => [keyOf(item), item]));
  const after = itemsOf(draft);
  const kept = new Set(after.map(keyOf));
  return {
    upserts: after.filter((item) => {
      const was = before.get(keyOf(item));
      return was === undefined || was.yaml !== item.yaml || was.kind !== item.kind;
    }),
    deletes: [...before.values()]
      .filter((item) => !kept.has(keyOf(item)))
      .map(({ folderId, name }) => ({ folderId, name })),
  };
}
