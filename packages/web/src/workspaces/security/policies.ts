import { parseDocument } from 'yaml';

import { CUBE_PARSE, objectsOf } from '../model/objects';

/**
 * The access policies the model declares (T171, AC-165), read from its
 * files: Cube's metadata does not return them (research/cube/
 * access-control.md, "`/v1/meta?extended`"). Each is listed as written — its
 * groups (the AC's "role": Cube renamed roles groups in 1.7.0), member-level
 * rules, masking, row-level filters and conditions — in the shape the
 * research gives ("Data model: `access_policy` on cubes and views").
 */
type Members = '*' | readonly string[];

export interface MemberRules {
  readonly includes?: Members;
  readonly excludes?: Members;
}

export type RowLevel = { readonly allowAll: true } | { readonly filters: readonly unknown[] };

export interface Policy {
  readonly object: string;
  readonly kind: 'cube' | 'view';
  /** `group`, or `groups`; `*` is any group. */
  readonly groups: readonly string[];
  readonly memberLevel?: MemberRules;
  readonly memberMasking?: MemberRules;
  readonly rowLevel?: RowLevel;
  /** Each condition's `if`, all of which must hold for the policy to apply. */
  readonly conditions: readonly string[];
}

export interface FilePolicies {
  readonly policies: readonly Policy[];
  /** Cubes and views with no policy: "fully open" (research, "Default deny"). */
  readonly open: readonly { readonly kind: 'cube' | 'view'; readonly name: string }[];
  /** A file whose policies cannot be read from its text: code, or a template. */
  readonly code?: 'JavaScript' | 'Python' | 'Jinja';
  readonly problem?: string;
}

type Value = Record<string, unknown>;

const isPlain = (value: unknown): value is Value =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * A key as written in snake_case or camelCase: Cube reads both alike
 * (research/cube/data-modeling.md, "Formatting and aliases").
 */
function key(value: Value, snake: string): unknown {
  return (
    value[snake] ?? value[snake.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase())]
  );
}

/** `'*'`, a list, or one member written on its own. */
function members(value: unknown): Members | undefined {
  if (value === '*') return '*';
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.filter((each): each is string => typeof each === 'string');
  return undefined;
}

function rules(value: unknown): MemberRules | undefined {
  if (!isPlain(value)) return undefined;
  const includes = members(value['includes']);
  const excludes = members(value['excludes']);
  return {
    ...(includes === undefined ? {} : { includes }),
    ...(excludes === undefined ? {} : { excludes }),
  };
}

function rowLevelOf(value: unknown): RowLevel | undefined {
  if (!isPlain(value)) return undefined;
  if (key(value, 'allow_all') === true) return { allowAll: true };
  return Array.isArray(value['filters']) ? { filters: value['filters'] } : undefined;
}

function policyOf(object: string, kind: 'cube' | 'view', policy: Value): Policy {
  const group = policy['group'];
  const groups = Array.isArray(policy['groups'])
    ? policy['groups'].filter((each): each is string => typeof each === 'string')
    : typeof group === 'string'
      ? [group]
      : [];
  const memberLevel = rules(key(policy, 'member_level'));
  const memberMasking = rules(key(policy, 'member_masking'));
  const rowLevel = rowLevelOf(key(policy, 'row_level'));
  return {
    object,
    kind,
    groups,
    ...(memberLevel === undefined ? {} : { memberLevel }),
    ...(memberMasking === undefined ? {} : { memberMasking }),
    ...(rowLevel === undefined ? {} : { rowLevel }),
    // Each `if` as written, text or not: one left out would read as a policy
    // with fewer conditions than it has.
    conditions: (Array.isArray(policy['conditions']) ? policy['conditions'] : [])
      .map((condition) => (isPlain(condition) ? condition['if'] : undefined))
      .filter((each) => each !== undefined && each !== null)
      .map((each) => (typeof each === 'string' ? each : JSON.stringify(each))),
  };
}

export function policiesOf(path: string, content: string): FilePolicies {
  // Read as the Model workspace reads a file, so the two agree on what is code.
  const read = objectsOf(path, content);
  if (read.code !== undefined) return { policies: [], open: [], code: read.code };
  if (read.problem !== undefined) return { policies: [], open: [], problem: read.problem };

  const model = (parseDocument(content, CUBE_PARSE).toJS() ?? {}) as Value;
  const policies: Policy[] = [];
  const open: { kind: 'cube' | 'view'; name: string }[] = [];
  for (const [list, kind] of [
    ['views', 'view'],
    ['cubes', 'cube'],
  ] as const) {
    const objects = Array.isArray(model[list]) ? (model[list] as unknown[]).filter(isPlain) : [];
    for (const object of objects) {
      const name = object['name'];
      if (typeof name !== 'string') continue;
      const written = key(object, 'access_policy');
      const declared = Array.isArray(written) ? (written as unknown[]).filter(isPlain) : [];
      if (declared.length === 0) open.push({ kind, name });
      else for (const policy of declared) policies.push(policyOf(name, kind, policy));
    }
  }
  return { policies, open };
}

/** The groups a policy is for, in words; `*` is any group. */
export function groupsText(policy: Pick<Policy, 'groups'>): string {
  return policy.groups.map((group) => (group === '*' ? 'any group' : group)).join(', ') || 'none';
}

const listText = (value: Members) => (value === '*' ? 'all' : value.join(', '));

/**
 * Member-level rules in words: "all", "all except x", "a, b". Includes left
 * out are all members, as Cube reads them: "`member_level: {}` is treated as
 * `includes: '*'`" (research/cube/access-control.md).
 */
export function membersText(level: MemberRules | undefined): string {
  if (level === undefined) return 'none declared';
  const includes = level.includes ?? '*';
  if (level.excludes === undefined) return listText(includes);
  return includes === '*'
    ? `all except ${listText(level.excludes)}`
    : `${listText(includes)}, except ${listText(level.excludes)}`;
}

/** A filter in words — a member, its operator, its values — through `and` and `or`. */
function filterText(filter: unknown, nested: boolean): string {
  if (!isPlain(filter)) return String(filter);
  for (const joiner of ['and', 'or'] as const) {
    const parts = filter[joiner];
    if (Array.isArray(parts)) {
      const text = parts.map((part) => filterText(part, true)).join(` ${joiner} `);
      return nested ? `(${text})` : text;
    }
  }
  const member = filter['member'] ?? filter['dimension'];
  // A value holding the separator is quoted, so it reads as one value.
  const values = Array.isArray(filter['values'])
    ? filter['values']
        .map((value) => String(value))
        .map((value) => (/[,"]/.test(value) ? JSON.stringify(value) : value))
        .join(', ')
    : '';
  return [member, filter['operator'], values]
    .filter((part) => typeof part === 'string' && part !== '')
    .join(' ');
}

/** Row-level rules in words; none declared means every row (research). */
export function rowsText(rowLevel: RowLevel | undefined): string {
  if (rowLevel === undefined) return 'all rows (none declared)';
  if ('allowAll' in rowLevel) return 'all rows';
  if (rowLevel.filters.length === 0) return 'no filters listed';
  return rowLevel.filters.map((filter) => filterText(filter, true)).join(' and ');
}

export function conditionsText(conditions: readonly string[]): string {
  return conditions.length === 0 ? 'none' : conditions.join('; ');
}

/**
 * The members a policy masks rather than shows, as written: no source says
 * what masking that only excludes means, so it is not read as "all except".
 */
export function maskingText(masking: MemberRules | undefined): string {
  if (masking === undefined) return 'none';
  const { includes, excludes } = masking;
  if (includes === undefined)
    return excludes === undefined ? 'none declared' : `excludes ${listText(excludes)}`;
  if (excludes === undefined) return listText(includes);
  return includes === '*'
    ? `all except ${listText(excludes)}`
    : `${listText(includes)}, except ${listText(excludes)}`;
}
