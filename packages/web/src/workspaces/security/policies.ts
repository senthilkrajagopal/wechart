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
  /**
   * The cubes each view reaches — the cube at the end of each `join_path` —
   * whose row filters also apply to it (research/cube/
   * access-policy-evaluation.md, "Through a view").
   */
  readonly reaches: Readonly<Record<string, readonly string[]>>;
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
  if (read.code !== undefined) return { policies: [], open: [], reaches: {}, code: read.code };
  if (read.problem !== undefined)
    return { policies: [], open: [], reaches: {}, problem: read.problem };

  const model = (parseDocument(content, CUBE_PARSE).toJS() ?? {}) as Value;
  const policies: Policy[] = [];
  const open: { kind: 'cube' | 'view'; name: string }[] = [];
  const reaches: Record<string, string[]> = {};
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
      if (kind === 'view') {
        const joins = Array.isArray(object['cubes']) ? (object['cubes'] as unknown[]) : [];
        const cubes = joins
          .map((join) => (isPlain(join) ? key(join, 'join_path') : undefined))
          .filter((path): path is string => typeof path === 'string')
          .map((path) => path.split('.').at(-1) ?? path);
        reaches[name] = [...new Set(cubes)];
      }
    }
  }
  return { policies, open, reaches };
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

/**
 * A condition wechart cannot read — a form YAML's `if` does not have, or one
 * Cube's own evaluation would throw on — and so leaves to Cube.
 */
export const UNREAD: unique symbol = Symbol('unread');

type Expression =
  | { readonly kind: 'path'; readonly parts: readonly string[] }
  | { readonly kind: 'literal'; readonly value: string | number }
  | { readonly kind: 'includes'; readonly target: Expression; readonly value: Expression }
  | { readonly kind: 'not'; readonly operand: Expression }
  | { readonly kind: 'and' | 'or'; readonly left: Expression; readonly right: Expression };

const TOKEN = /\s*(?:(\()|(\))|(\.)|('[^']*'|"[^"]*")|(\d+(?:\.\d+)?)|([A-Za-z_][A-Za-z0-9_]*))/y;

function tokensOf(text: string): string[] | undefined {
  const tokens: string[] = [];
  TOKEN.lastIndex = 0;
  while (TOKEN.lastIndex < text.length) {
    if (/^\s*$/.test(text.slice(TOKEN.lastIndex))) break;
    const match = TOKEN.exec(text);
    if (match === null) return undefined;
    tokens.push(match[0].trim());
  }
  return tokens;
}

/** `or` over `and` over `not` over a claim, a literal or a bracket — YAML's forms. */
function parse(tokens: readonly string[]): Expression | undefined {
  let at = 0;
  const peek = () => tokens[at];
  const primary = (): Expression | undefined => {
    const token = tokens[at++];
    if (token === undefined) return undefined;
    if (token === '(') {
      const inner = or();
      return tokens[at++] === ')' ? inner : undefined;
    }
    if (/^['"]/.test(token)) return { kind: 'literal', value: token.slice(1, -1) };
    if (/^\d/.test(token)) return { kind: 'literal', value: Number(token) };
    if (token !== 'securityContext') return undefined;
    const parts: string[] = [];
    while (peek() === '.') {
      at += 1;
      const part = tokens[at++];
      if (part === undefined || !/^[A-Za-z_]/.test(part)) return undefined;
      if (part === 'includes' && peek() === '(') {
        at += 1;
        const value = primary();
        if (value === undefined || tokens[at++] !== ')') return undefined;
        return { kind: 'includes', target: { kind: 'path', parts }, value };
      }
      parts.push(part);
    }
    return { kind: 'path', parts };
  };
  const not = (): Expression | undefined => {
    if (peek() !== 'not') return primary();
    at += 1;
    const operand = not();
    return operand === undefined ? undefined : { kind: 'not', operand };
  };
  const chain = (joiner: 'and' | 'or', next: () => Expression | undefined) => () => {
    let left = next();
    while (left !== undefined && peek() === joiner) {
      at += 1;
      const right = next();
      left = right === undefined ? undefined : { kind: joiner, left, right };
    }
    return left;
  };
  const and = chain('and', not);
  const or: () => Expression | undefined = chain('or', and);
  const whole = or();
  return at === tokens.length ? whole : undefined;
}

function evaluate(expression: Expression, context: Readonly<Record<string, unknown>>): unknown {
  switch (expression.kind) {
    case 'literal':
      return expression.value;
    case 'path':
      return expression.parts.reduce<unknown>(
        (value, part) => (isPlain(value) ? value[part] : undefined),
        context,
      );
    case 'includes': {
      const target = evaluate(expression.target, context);
      const value = evaluate(expression.value, context);
      if (Array.isArray(target)) return target.includes(value);
      if (typeof target === 'string' && typeof value === 'string') return target.includes(value);
      // `.includes` on anything else throws in Cube's evaluation.
      throw new TypeError('includes');
    }
    case 'not':
      return !evaluate(expression.operand, context);
    case 'and': {
      const left = evaluate(expression.left, context);
      return left ? evaluate(expression.right, context) : left;
    }
    case 'or': {
      const left = evaluate(expression.left, context);
      return left ? left : evaluate(expression.right, context);
    }
  }
}

/**
 * A YAML condition's value for this context (AC-232): `{ … }` over
 * `securityContext` claims, with `and`, `or`, `not`, `.` and `.includes(…)` —
 * all YAML's `if` supports (research/cube/access-control.md). Anything else —
 * a comparison, which YAML cannot compile either — is `UNREAD`, left to Cube.
 */
export function conditionHolds(
  condition: string,
  context: Readonly<Record<string, unknown>>,
): unknown {
  const inner = /^\s*\{(.*)\}\s*$/s.exec(condition)?.[1];
  const tokens = inner === undefined ? undefined : tokensOf(inner);
  const expression = tokens === undefined ? undefined : parse(tokens);
  if (expression === undefined) return UNREAD;
  try {
    return evaluate(expression, context);
  } catch {
    return UNREAD;
  }
}

/** What one cube or view gives a security context, and why (AC-232). */
export interface Access {
  readonly object: string;
  readonly kind: 'cube' | 'view';
  /**
   * `full`: every member and row; `limited`: some members or rows; `denied`:
   * nothing; `unknown`: it turns on a condition only Cube can read.
   */
  readonly access: 'full' | 'limited' | 'denied' | 'unknown';
  readonly why: string;
  /** The file each deciding policy is declared in, to open in Model. */
  readonly paths: readonly string[];
}

/** The model's policies, open objects and views' cubes, as the Security page reads them. */
export interface AccessModel {
  readonly declared: readonly { readonly policy: Policy; readonly path: string }[];
  readonly open: readonly { readonly kind: 'cube' | 'view'; readonly name: string }[];
  readonly reaches: Readonly<Record<string, readonly string[]>>;
}

type Entry = AccessModel['declared'][number];

/** Whether a policy applies to this context, as `getApplicablePolicies` decides. */
function applies(
  policy: Policy,
  groups: readonly string[],
  context: Readonly<Record<string, unknown>>,
): 'yes' | 'no' | 'unread' | 'refused' {
  if (!policy.groups.some((group) => group === '*' || groups.includes(group))) return 'no';
  const values = policy.conditions.map((condition) => conditionHolds(condition, context));
  if (values.includes(UNREAD)) return 'unread';
  // One condition is taken as it comes; with more, each must be a boolean,
  // or Cube throws (research/cube/access-policy-evaluation.md).
  if (values.length === 1) return values[0] ? 'yes' : 'no';
  if (values.some((value) => typeof value !== 'boolean')) return 'refused';
  return values.every(Boolean) ? 'yes' : 'no';
}

/** Every member: no `member_level`, or its includes '*' with nothing excluded (Cube's defaults). */
function grantsEveryMember(policy: Policy): boolean {
  const level = policy.memberLevel;
  if (level === undefined) return true;
  const excludes = level.excludes ?? [];
  return (level.includes ?? '*') === '*' && excludes !== '*' && excludes.length === 0;
}

/** A row filter, as `policyHasRowFilter` decides: filters, and at least one. */
function filtersRows(policy: Policy): boolean {
  return (
    policy.rowLevel !== undefined &&
    !('allowAll' in policy.rowLevel) &&
    policy.rowLevel.filters.length > 0
  );
}

interface Verdict {
  readonly access: Access['access'];
  readonly why: string;
  readonly paths: readonly string[];
}

const pathsOf = (entries: readonly Entry[]) => [...new Set(entries.map(({ path }) => path))];

/** One object's own policies, for this context. */
function verdictOf(
  entries: readonly Entry[],
  groups: readonly string[],
  context: Readonly<Record<string, unknown>>,
): Verdict {
  const judged = entries.map((entry) => ({
    entry,
    applies: applies(entry.policy, groups, context),
  }));
  const pending = judged.filter(({ applies: state }) => state === 'unread' || state === 'refused');
  if (pending.length > 0)
    return {
      access: 'unknown',
      why: pending
        .map(({ entry, applies: state }) =>
          state === 'refused'
            ? `Cube refuses the request: a condition of the ${groupsText(entry.policy)} policy is not true or false here (${conditionsText(entry.policy.conditions)}).`
            : `Cube decides: the ${groupsText(entry.policy)} policy applies only if ${conditionsText(entry.policy.conditions)}, which wechart cannot read.`,
        )
        .join(' '),
      paths: pathsOf(pending.map(({ entry }) => entry)),
    };

  const applying = judged.filter(({ applies: state }) => state === 'yes').map(({ entry }) => entry);
  if (applying.length === 0) {
    const unmet = judged.filter(
      ({ entry }) =>
        entry.policy.conditions.length > 0 &&
        entry.policy.groups.some((group) => group === '*' || groups.includes(group)),
    );
    const named = [...new Set(entries.flatMap(({ policy }) => policy.groups))];
    return {
      access: 'denied',
      why:
        unmet.length > 0
          ? unmet
              .map(
                ({ entry }) =>
                  `The ${groupsText(entry.policy)} policy applies only if ${conditionsText(entry.policy.conditions)}, which this context does not meet.`,
              )
              .join(' ')
          : `No policy names ${groups.length === 0 ? 'a context with no groups' : groups.join(', ')}; its policies are for ${named.join(', ')}.`,
      paths: pathsOf(entries),
    };
  }

  // Members are unioned; full access wins over masking (research).
  const full = applying.some(({ policy }) => grantsEveryMember(policy) && !filtersRows(policy));
  const reasons = applying.map(({ policy }) => {
    const masked =
      full || policy.memberMasking === undefined
        ? ''
        : `; masked: ${maskingText(policy.memberMasking)}`;
    const members = grantsEveryMember(policy) ? 'all' : membersText(policy.memberLevel);
    const condition =
      policy.conditions.length === 0 ? '' : ` (${conditionsText(policy.conditions)} holds)`;
    return `${groupsText(policy)}: ${members}; ${rowsText(policy.rowLevel)}${masked}${condition}`;
  });
  return { access: full ? 'full' : 'limited', why: reasons.join(' · '), paths: pathsOf(applying) };
}

/**
 * What a view's cubes add (research/cube/access-policy-evaluation.md,
 * "Through a view"): a cube with policies filters the view's rows by those
 * that apply — none, and Cube returns no rows; one with no row filter, and it
 * adds nothing.
 */
function throughCubes(
  cubes: readonly string[],
  byObject: ReadonlyMap<string, readonly Entry[]>,
  groups: readonly string[],
  context: Readonly<Record<string, unknown>>,
): Verdict | undefined {
  const verdicts: Verdict[] = [];
  for (const cube of cubes) {
    const entries = byObject.get(cube);
    if (entries === undefined) continue;
    const judged = entries.map((entry) => ({
      entry,
      applies: applies(entry.policy, groups, context),
    }));
    if (judged.some(({ applies: state }) => state === 'unread' || state === 'refused')) {
      verdicts.push({ ...verdictOf(entries, groups, context), access: 'unknown' });
      continue;
    }
    const applying = judged
      .filter(({ applies: state }) => state === 'yes')
      .map(({ entry }) => entry);
    if (applying.length === 0) {
      verdicts.push({
        access: 'denied',
        why: `Its cube ${cube} has policies, none of which apply to this context, so Cube returns no rows.`,
        paths: pathsOf(entries),
      });
      continue;
    }
    if (applying.some(({ policy }) => !filtersRows(policy))) continue;
    verdicts.push({
      access: 'limited',
      why: `Rows also filtered through ${cube}: ${applying.map(({ policy }) => rowsText(policy.rowLevel)).join(' or ')}.`,
      paths: pathsOf(applying),
    });
  }
  if (verdicts.length === 0) return undefined;
  const worst = (['unknown', 'denied', 'limited'] as const).find((access) =>
    verdicts.some((verdict) => verdict.access === access),
  );
  return {
    access: worst ?? 'limited',
    why: verdicts.map((verdict) => verdict.why).join(' '),
    paths: verdicts.flatMap((verdict) => verdict.paths),
  };
}

/**
 * Each cube and view's access for this security context (AC-232), as Cube
 * 1.7.42 evaluates it (research/cube/access-policy-evaluation.md): with no
 * policy, open; otherwise what the policies that apply — a group matching,
 * every condition holding — grant between them, members unioned; and for a
 * view, its cubes' row filters too. A condition wechart cannot read is said to
 * be Cube's to decide, never guessed.
 */
export function effectiveAccess(
  model: AccessModel,
  context: Readonly<Record<string, unknown>>,
): readonly Access[] {
  const claimed = context['groups'];
  const groups = Array.isArray(claimed)
    ? claimed.filter((group): group is string => typeof group === 'string')
    : [];
  const byObject = new Map<string, Entry[]>();
  const kinds = new Map<string, 'cube' | 'view'>();
  for (const entry of model.declared) {
    byObject.set(entry.policy.object, [...(byObject.get(entry.policy.object) ?? []), entry]);
    kinds.set(entry.policy.object, entry.policy.kind);
  }
  for (const object of model.open) if (!kinds.has(object.name)) kinds.set(object.name, object.kind);

  const OPEN: Verdict = {
    access: 'full',
    why: 'No access policy: open to every context.',
    paths: [],
  };
  const accessOf = (object: string, kind: 'cube' | 'view'): Access => {
    const entries = byObject.get(object);
    const own = entries === undefined ? OPEN : verdictOf(entries, groups, context);
    const cubes =
      kind === 'view'
        ? throughCubes(model.reaches[object] ?? [], byObject, groups, context)
        : undefined;
    if (cubes === undefined || own.access === 'denied' || own.access === 'unknown')
      return { object, kind, ...own };
    const combined: Access['access'] =
      cubes.access === 'unknown' || cubes.access === 'denied' ? cubes.access : 'limited';
    return {
      object,
      kind,
      access: combined,
      why: own === OPEN ? cubes.why : `${own.why} ${cubes.why}`,
      paths: [...new Set([...own.paths, ...cubes.paths])],
    };
  };

  return [...kinds.entries()]
    .map(([object, kind]) => accessOf(object, kind))
    .sort((a, b) => (a.object < b.object ? -1 : 1));
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
