import { createHash } from 'node:crypto';

import { declaredIn } from '../model/split';
import type { ModelFile } from '../server';
import { XCUBE_ROOT } from './folders';
import { plainYamlOf } from './snapshot';

/**
 * wechart's published model as xcube's items (T449, AC-333; research
 * `xcube-slice-3a.md`, "PUT …/snapshot with items", "The items hash").
 *
 * An item is one cube or one view, in one folder, as YAML (AC-337). Models
 * don't live in folders yet, so every file is a root item, named for what it
 * declares, its YAML exactly as stored. What is never sent stays out: a
 * template or a file that isn't YAML (AC-335), and a file declaring nothing.
 */

export interface Item {
  readonly folderId: string;
  readonly name: string;
  readonly kind: 'cube' | 'view';
  readonly yaml: string;
}

export function itemsOf(files: readonly ModelFile[]): Item[] {
  return plainYamlOf(files).flatMap((file) => {
    const [declared] = declaredIn(file.content);
    return declared === undefined
      ? []
      : [{ folderId: XCUBE_ROOT, name: declared.name, kind: declared.kind, yaml: file.content }];
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
