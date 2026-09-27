import { MY_WORKSPACE_ID } from '../repos/catalog';

/**
 * My workspace, named `mine` both ways (T343, AC-276; its review): with
 * security on, a signed-in user's is stored as their own `ws:<key>`, and the
 * client names it `mine`, as with one user.
 */

/** The keys that name a folder: where an item is, and where it is to go (T345). */
const FOLDER_KEYS = new Set(['folderId', 'targetFolderId']);

/** Every folder a request names, at any depth, as `mine`: the user's own. */
export function aliasIn(value: unknown, own: string): void {
  if (Array.isArray(value)) {
    for (const each of value) aliasIn(each, own);
    return;
  }
  if (typeof value !== 'object' || value === null) return;
  const record = value as Record<string, unknown>;
  for (const [key, each] of Object.entries(record)) {
    if (FOLDER_KEYS.has(key) && each === MY_WORKSPACE_ID) record[key] = own;
    else aliasIn(each, own);
  }
}

/**
 * An answer's JSON with the user's own workspace named `mine`: a whole
 * string value only, so no text that merely contains it is touched.
 */
export function aliasOut(payload: string, own: string): string {
  return payload.replaceAll(JSON.stringify(own), JSON.stringify(MY_WORKSPACE_ID));
}
