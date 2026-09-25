import { refreshEveryRefusal } from '@wechart/core';
import { parseDocument, type Document, type Node } from 'yaml';

import { dimensionShape, MEASURE_TYPES, SCHEMA, type Field, type SectionId } from './form/schema';
import { CUBE_PARSE, objectsOf } from './objects';
import { placeOf, type Problem } from './problems';

/**
 * What Cube's validator would refuse in a file that parses (T237, AC-227;
 * direction.md rule 26): every value outside an enumeration's set — the
 * form's own, from the research's Y-tables — every required key that is
 * missing, and every key written with one it may not be, each at its line.
 *
 * Errors, since Cube would refuse them; listed, not enforced — unlike a file
 * that does not parse, they leave the form open to put them right, and the
 * publish to Cube, whose word is final (AC-136).
 */
type Value = Record<string, unknown>;
type Path = readonly (string | number)[];

const isPlain = (value: unknown): value is Value =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/** Cube camelizes keys (research/cube/data-modeling.md, Y.1 step 6): `sqlTable` is `sql_table`. */
const camel = (key: string) =>
  key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());

/** The key as the file writes it — snake_case or camelCase — if it does. */
function writtenKey(value: Value, key: string): string | undefined {
  if (value[key] !== undefined && value[key] !== null) return key;
  const other = camel(key);
  return value[other] !== undefined && value[other] !== null ? other : undefined;
}

/** A key's value, a dotted key (`row_level.filters`) reaching into its object; and where it is. */
function lookUp(value: Value, key: string): { at: string[]; own: unknown } | undefined {
  const at: string[] = [];
  let here: unknown = value;
  for (const part of key.split('.')) {
    if (!isPlain(here)) return undefined;
    const written = writtenKey(here, part);
    if (written === undefined) return undefined;
    at.push(written);
    here = here[written];
  }
  return { at, own: here };
}

const has = (value: Value, key: string) => lookUp(value, key) !== undefined;
const valueOf = (value: Value, key: string) => lookUp(value, key)?.own;

/** `type` and `relationship` values are camelized too: `countDistinct` is `count_distinct` (Y.1). */
const snake = (text: string) => text.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);

const required = (key: string) => `"${key}" is required.`;
const missing = (value: Value, keys: readonly string[]) =>
  keys.filter((key) => !has(value, key)).map(required);

/** The measure types Cube takes only with `multi_stage: true` (§Y.17). */
const STAGED = new Set(
  Object.keys(SCHEMA['Y.7'].fields.find((field) => field.key === 'type')?.onlyWith ?? {}),
);
const DIMENSION_TYPES = SCHEMA['Y.6'].fields.find((field) => field.key === 'type')?.options ?? [];
const isMeasureType = (type: unknown) =>
  typeof type === 'string' && (MEASURE_TYPES as readonly string[]).includes(snake(type));

/** Y.6 / Y.10b: the formats a string, boolean or geo dimension, or an included member, may have. */
const BASE_FORMATS = ['imageUrl', 'link', 'currency', 'percent', 'number', 'id'];
const isBaseFormat = (format: unknown) =>
  (typeof format === 'string' && BASE_FORMATS.includes(format)) ||
  (isPlain(format) && format['type'] === 'link');

/** Where the operator is `set` or `notSet`, a filter has no values (Y.10c, Y.14). */
const needsValues = (filter: Value) =>
  !['set', 'notSet'].includes(String(valueOf(filter, 'operator')));

interface Context {
  /** How many items the list it is in holds: a measure's `time_shift` asks for more of each of two. */
  readonly siblings: number;
}

/**
 * Each object's rules from its table's "Req." column and its conflicts
 * (research/cube/data-modeling.md, Y.3–Y.14), as sentences; a key a
 * pre-aggregation type the spec leaves out needs (rollup joins and lambdas,
 * `original_sql`) is not asked for.
 */
const RULES: Readonly<Record<string, (value: Value, context: Context) => string[]>> = {
  'Y.3': (cube) => {
    const table = has(cube, 'sql_table');
    const sql = has(cube, 'sql');
    return [
      ...missing(cube, ['name']),
      // Joi's xor: exactly one — unless it extends a cube that has one.
      ...(!table && !sql && !has(cube, 'extends') ? ['"sql_table" or "sql" is required.'] : []),
      ...(table && sql ? ['only one of "sql_table" and "sql" may be written.'] : []),
    ];
  },
  'Y.4': (key) =>
    ['every', 'sql', 'immutable'].some((each) => has(key, each))
      ? []
      : ['"every", "sql" or "immutable" is required.'],
  'Y.5': (join) => missing(join, ['name', 'relationship', 'sql']),
  'Y.6': (dimension) => {
    const type = valueOf(dimension, 'type');
    const known = typeof type === 'string' && DIMENSION_TYPES.includes(type);
    const format = valueOf(dimension, 'format');
    return [
      ...missing(dimension, ['name', 'type']),
      // Shapes A, D and E are defined by SQL; C by a point; F by its values.
      ...(known && dimensionShape(dimension) === 'sql' ? missing(dimension, ['sql']) : []),
      ...(type === 'geo' ? missing(dimension, ['latitude', 'longitude']) : []),
      ...(type === 'switch' ? missing(dimension, ['values']) : []),
      ...(format !== undefined &&
      ['string', 'boolean', 'geo'].includes(String(type)) &&
      !isBaseFormat(format)
        ? [
            `format ${JSON.stringify(format)} is not one a ${String(type)} takes (${BASE_FORMATS.join(', ')}, or a link).`,
          ]
        : []),
      ...(format !== undefined &&
      type === 'time' &&
      !isBaseFormat(format) &&
      !(typeof format === 'string' && format.includes('%'))
        ? [
            `format ${JSON.stringify(format)} is not one a time takes (${BASE_FORMATS.join(', ')}, a link, or a pattern with a % specifier).`,
          ]
        : []),
    ];
  },
  'Y.6a': (granularity) => [
    ...missing(granularity, ['name']),
    ...(has(granularity, 'sql') ? [] : missing(granularity, ['interval'])),
  ],
  'Y.6b': (shift) =>
    has(shift, 'sql')
      ? has(shift, 'type') || has(shift, 'interval')
        ? missing(shift, ['type', 'interval'])
        : missing(shift, ['name'])
      : missing(shift, ['name', 'type', 'interval']),
  'Y.6c': (branches) => missing(branches, ['when']),
  'Y.6d': (link) => missing(link, ['name', 'label']),
  'Y.7': (measure) => {
    const type = valueOf(measure, 'type');
    const format = valueOf(measure, 'format');
    return [
      ...missing(measure, ['name', 'type']),
      // "yes, except for `count` and multi-stage" — and asked only of a type
      // Cube knows, since the type is what to put right first.
      ...(isMeasureType(type) &&
      !STAGED.has(snake(String(type))) &&
      type !== 'count' &&
      valueOf(measure, 'multi_stage') !== true
        ? missing(measure, ['sql'])
        : []),
      ...(format === 'imageUrl' || format === 'link'
        ? [`format "${format}" is not one a measure takes.`]
        : []),
    ];
  },
  'Y.7.order_by': (order) => missing(order, ['sql']),
  'Y.7a': (window) =>
    valueOf(window, 'type') === 'to_date' ? missing(window, ['granularity']) : [],
  // One shift: a name or an interval, an interval with its type; several:
  // each its time dimension, interval and type.
  'Y.7b': (shift, { siblings }) =>
    siblings > 1
      ? missing(shift, ['time_dimension', 'interval', 'type'])
      : has(shift, 'interval')
        ? missing(shift, ['type'])
        : has(shift, 'name')
          ? []
          : ['"name" or "interval" is required.'],
  'Y.8': (segment) => missing(segment, ['name', 'sql']),
  'Y.9': (hierarchy) => missing(hierarchy, ['name']),
  'Y.10': (view) => missing(view, ['name']),
  'Y.10a': (entry) => missing(entry, ['join_path']),
  'Y.10b': (member) => [
    ...missing(member, ['name']),
    ...(has(member, 'format') && !isBaseFormat(valueOf(member, 'format'))
      ? [
          `format ${JSON.stringify(valueOf(member, 'format'))} is not a base format (${BASE_FORMATS.join(', ')}, or a link).`,
        ]
      : []),
  ],
  'Y.10c': (filter) => [
    ...missing(filter, ['member', 'operator']),
    ...(needsValues(filter) ? missing(filter, ['values']) : []),
  ],
  'Y.11': (folder) => missing(folder, ['name', 'includes']),
  'Y.12': (group) => missing(group, ['name']),
  'Y.13': (rollup) => [
    ...missing(rollup, ['name']),
    // "yes when the key is present", for the types that take one.
    ...(has(rollup, 'time_dimension') &&
    snake(String(valueOf(rollup, 'type') ?? 'rollup')) === 'rollup'
      ? missing(rollup, ['granularity'])
      : []),
  ],
  'Y.14': (policy) => {
    const one = (a: string, b: string) =>
      has(policy, a) === has(policy, b) ? [`exactly one of "${a}" and "${b}" is required.`] : [];
    return [
      ...one('group', 'groups'),
      ...(has(policy, 'row_level') ? one('row_level.filters', 'row_level.allow_all') : []),
    ];
  },
  'Y.14.row_level.filters': (filter) =>
    has(filter, 'or') || has(filter, 'and')
      ? []
      : [
          ...missing(filter, ['member', 'operator']),
          ...(needsValues(filter) ? missing(filter, ['values']) : []),
        ],
};

/** What a `list` or `object` field holds, and the rules it answers to. */
function inner(section: string, field: Field): { section: string; fields: readonly Field[] } {
  return field.of !== undefined
    ? { section: field.of, fields: SCHEMA[field.of].fields }
    : { section: `${section}.${field.key}`, fields: field.fields ?? [] };
}

/** An object's name in a sentence: `Measure count`, or its place when it has none. */
function calledOf(section: string, value: Value, index: number): string {
  const title =
    section in SCHEMA ? SCHEMA[section as SectionId].title : (section.split('.').pop() ?? section);
  const name = valueOf(value, 'name');
  return `${title} ${typeof name === 'string' ? name : `#${String(index + 1)}`}`;
}

export function validationProblems(path: string, text: string): Problem[] {
  if (objectsOf(path, text).code !== undefined) return [];
  let document: Document;
  try {
    document = parseDocument(text, CUBE_PARSE);
  } catch {
    return [];
  }
  if (document.errors.length > 0) return [];
  let model: unknown;
  try {
    model = document.toJS();
  } catch {
    return [];
  }
  if (!isPlain(model)) return [];

  const problems: Problem[] = [];
  const at = (where: Path, message: string) => {
    const node = document.getIn(where, true) as Node | undefined;
    const [from = 0, to = from] = node?.range ?? [];
    problems.push({ path, ...placeOf(text, from), message, from, to, severity: 'error' });
  };

  const visit = (
    section: string,
    fields: readonly Field[],
    value: Value,
    where: Path,
    index: number,
    context: Context,
  ) => {
    const called = calledOf(section, value, index);
    for (const said of RULES[section]?.(value, context) ?? []) at(where, `${called}: ${said}`);

    for (const field of fields) {
      const found = lookUp(value, field.key);
      if (found === undefined) continue;
      const { own } = found;
      const here = [...where, ...found.at];
      if (field.kind === 'enum' && typeof own === 'string') {
        const options = field.options ?? [];
        // A `type` or `relationship` may be written camelCase (Y.1).
        const read = ['type', 'relationship'].includes(field.key) ? snake(own) : own;
        if (
          ![own, read].some(
            (each) => options.includes(each) || (field.aliases ?? []).includes(each),
          )
        )
          at(
            here,
            `${called}: ${field.key} "${own}" is not one Cube accepts (${options.join(', ')}).`,
          );
        const needs = field.onlyWith?.[read];
        if (needs !== undefined && valueOf(value, needs.key) !== needs.value)
          at(
            here,
            `${called}: ${field.key} "${own}" is accepted only with ${needs.key}: ${String(needs.value)}.`,
          );
      }
      // Strict booleans (Y.6d `primary`, `multi_stage`, …); some take only `true`.
      if (field.kind === 'boolean') {
        const offered = field.options ?? ['true', 'false'];
        if (typeof own !== 'boolean' || !offered.includes(String(own)))
          at(here, `${called}: ${field.key} must be ${offered.join(' or ')}.`);
      }
      const shaped = field.of !== undefined || field.fields !== undefined;
      if (!shaped) continue;
      const { section: of, fields: its } = inner(section, field);
      if (field.kind === 'list' && Array.isArray(own))
        own.forEach((item, at) => {
          if (isPlain(item)) visit(of, its, item, [...here, at], at, { siblings: own.length });
        });
      if (field.kind === 'object' && isPlain(own)) visit(of, its, own, here, 0, { siblings: 1 });
    }
  };

  for (const [list, section] of [
    ['cubes', 'Y.3'],
    ['views', 'Y.10'],
    ['view_groups', 'Y.12'],
  ] as const) {
    const found = lookUp(model, list);
    if (found === undefined || !Array.isArray(found.own)) continue;
    const objects = found.own as unknown[];
    objects.forEach((object, index) => {
      if (isPlain(object))
        visit(section, SCHEMA[section].fields, object, [...found.at, index], index, {
          siblings: objects.length,
        });
    });
  }

  /**
   * A refresh key's cron Cube's refresh worker can't run (T258, AC-153), at
   * its "every": Cube compiles it, then fails the queries it serves
   * (research/cube/refresh-key-schedule.md). A cube's own key, and each
   * pre-aggregation's; said as the publish that would refuse it says it.
   */
  const cubes = lookUp(model, 'cubes');
  if (cubes !== undefined && Array.isArray(cubes.own))
    (cubes.own as unknown[]).forEach((cube, index) => {
      if (!isPlain(cube)) return;
      const here: Path = [...cubes.at, index];
      const check = (owner: string, where: Path, holder: Value) => {
        const key = lookUp(holder, 'refresh_key.every');
        if (key === undefined || typeof key.own !== 'string') return;
        const refusal = refreshEveryRefusal(key.own);
        if (refusal !== undefined) at([...where, ...key.at], `${owner}: ${refusal}`);
      };
      const name = valueOf(cube, 'name');
      check(`Cube ${typeof name === 'string' ? name : `#${String(index + 1)}`}`, here, cube);
      const rollups = lookUp(cube, 'pre_aggregations');
      if (rollups === undefined || !Array.isArray(rollups.own)) return;
      (rollups.own as unknown[]).forEach((rollup, at) => {
        if (!isPlain(rollup)) return;
        const called = valueOf(rollup, 'name');
        check(
          `Pre-aggregation ${typeof called === 'string' ? called : `#${String(at + 1)}`}`,
          [...here, ...rollups.at, at],
          rollup,
        );
      });
    });
  return problems.sort((a, b) => a.from - b.from);
}
