import { CUBE_PARSE, objectsOf, type AccessFolder } from '@wechart/core';
import { parseDocument } from 'yaml';

/**
 * The groups a signed-in user's token may carry (T437; AC-008, AC-326): the
 * user's own groups that some access policy in the model names, or that some
 * folder's allowed set holds (requirements "A token's groups"; research
 * `xcube-slice-4.md`, Gotcha 8). A folder's allowed set is the groups granted
 * on it, on an ancestor or on a descendant, and the Super-Admin group, so
 * together they are every group granted on some folder and the Super-Admin
 * group. Everything else of theirs stays out of Cube.
 */

type Value = Record<string, unknown>;

const isPlain = (value: unknown): value is Value =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** A key as written in snake_case or camelCase: Cube reads both alike. */
const keyOf = (value: Value, snake: string): unknown =>
  value[snake] ?? value[snake.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase())];

/**
 * The groups a model file's access policies name: each cube's and view's
 * `access_policy` entries' `group` or `groups` (research
 * `cube/access-control.md`, "Policy keys"). `*` is any group, so it names
 * none. A file that isn't YAML the Model workspace can read names none: only
 * YAML is published (AC-332).
 */
export function policyGroupsOf(path: string, content: string): string[] {
  const read = objectsOf(path, content);
  if (read.code !== undefined || read.problem !== undefined) return [];
  let model: unknown;
  try {
    model = parseDocument(content, CUBE_PARSE).toJS();
  } catch {
    return [];
  }
  if (!isPlain(model)) return [];
  const groups = new Set<string>();
  for (const list of ['cubes', 'views']) {
    const objects = model[list];
    if (!Array.isArray(objects)) continue;
    for (const object of objects) {
      if (!isPlain(object)) continue;
      const policies = keyOf(object, 'access_policy');
      if (!Array.isArray(policies)) continue;
      for (const policy of policies) {
        if (!isPlain(policy)) continue;
        const named = Array.isArray(policy['groups']) ? policy['groups'] : [policy['group']];
        for (const group of named)
          if (typeof group === 'string' && group !== '*') groups.add(group);
        // And a group a condition asks the context's groups for, as YAML's
        // `.includes` lets it (research `cube/access-control.md`, conditions;
        // T529): kept out of the token, the condition could never hold.
        const conditions = policy['conditions'];
        if (Array.isArray(conditions))
          for (const condition of conditions) {
            const test = isPlain(condition) ? condition['if'] : undefined;
            if (typeof test !== 'string') continue;
            for (const [, group] of test.matchAll(
              /securityContext\.groups\.includes\(\s*['"]([^'"]+)['"]\s*\)/g,
            ))
              if (group !== undefined) groups.add(group);
          }
      }
    }
  }
  return [...groups];
}

/** How long the model's policy groups are read from before being read again: AC-009's minute. */
const POLICY_GROUPS_TTL_MS = 60_000;

/**
 * The set, read for each token: the folder tree each time, as every access
 * check reads it, so a grant reaches Cube's tokens at once; the model's files
 * again when the revision xcube acknowledged moves (a publish, on any
 * replica) or a minute has passed.
 */
export function namedGroups({
  tree,
  files,
  revision,
  superAdminGroup,
  now = Date.now,
}: {
  readonly tree: () => Promise<readonly AccessFolder[]>;
  readonly files: () => Promise<readonly { readonly path: string; readonly content: string }[]>;
  /** The revision each token names, read as it is signed (T421). */
  readonly revision: () => Promise<number | undefined>;
  readonly superAdminGroup?: string;
  readonly now?: () => number;
}): () => Promise<ReadonlySet<string>> {
  let policies: { revision: number | undefined; at: number; groups: readonly string[] } | undefined;
  let reading: Promise<readonly string[]> | undefined;

  const policyGroups = async (): Promise<readonly string[]> => {
    const current = await revision();
    if (
      policies !== undefined &&
      policies.revision === current &&
      now() - policies.at <= POLICY_GROUPS_TTL_MS
    )
      return policies.groups;
    // One read at a time: a dashboard's tiles ask at once.
    reading ??= (async () => {
      const at = now();
      const groups = [
        ...new Set((await files()).flatMap((file) => policyGroupsOf(file.path, file.content))),
      ];
      policies = { revision: current, at, groups };
      return groups;
    })().finally(() => {
      reading = undefined;
    });
    return reading;
  };

  return async () => {
    const [folders, written] = await Promise.all([tree(), policyGroups()]);
    const named = new Set<string>(written);
    for (const { access } of folders) {
      for (const group of access?.readOnly ?? []) named.add(group);
      for (const group of access?.readWrite ?? []) named.add(group);
    }
    if (superAdminGroup !== undefined && superAdminGroup !== '') named.add(superAdminGroup);
    return named;
  };
}
