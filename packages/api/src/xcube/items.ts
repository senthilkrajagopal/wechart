import { createHash } from 'node:crypto';

import { declaredIn } from '../model/split';
import { ROOT_FOLDER_ID } from '../repos/catalog';
import type { ModelFile } from '../server';
import { ROOT_ONLY } from './folders';
import { plainYamlOf } from './snapshot';

/**
 * wechart's published model as xcube's items (T449, AC-333; research
 * `xcube-slice-3a.md`, "PUT …/snapshot with items", "The items hash").
 *
 * An item is one cube or one view, in one folder, as YAML (AC-337): each
 * file is an item of its folder (T452), named for what it declares, its YAML
 * exactly as stored. What is never sent stays out: a template or a file that
 * isn't YAML (AC-335), and a file declaring nothing.
 */

export interface Item {
  readonly folderId: string;
  readonly name: string;
  readonly kind: 'cube' | 'view';
  readonly yaml: string;
}

export function itemsOf(
  files: readonly ModelFile[],
  /**
   * Each served folder's xcube id, by wechart's id (T452, AC-328): a file is
   * its folder's item, and one in a folder not listed is left out, as xcube
   * would refuse it. The root alone where none are given.
   */
  folders: ReadonlyMap<string, string> = ROOT_ONLY.ids,
): Item[] {
  return plainYamlOf(files).flatMap((file) => {
    const [declared] = declaredIn(file.content);
    const folderId = folders.get(file.folderId ?? ROOT_FOLDER_ID);
    return declared === undefined || folderId === undefined
      ? []
      : [{ folderId, name: declared.name, kind: declared.kind, yaml: file.content }];
  });
}

/**
 * xcube's items hash: SHA-256, in hex, of the items sorted by
 * `${folderId}/${name}` (compared with `<`, not `localeCompare`), each as
 * `{ folderId, name, kind, yaml }` in that order, as UTF-8.
 */
export function itemsHashOf(items: readonly Item[]): string {
  const sorted = [...items]
    .sort((a, b) => (`${a.folderId}/${a.name}` < `${b.folderId}/${b.name}` ? -1 : 1))
    .map(({ folderId, name, kind, yaml }) => ({ folderId, name, kind, yaml }));
  return createHash('sha256').update(JSON.stringify(sorted), 'utf8').digest('hex');
}
