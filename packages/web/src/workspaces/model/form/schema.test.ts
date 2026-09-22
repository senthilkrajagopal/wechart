import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { MEASURE_TYPES, SCHEMA, type SectionId } from './schema';

/**
 * T138 / AC-132: THE SYSTEM SHALL offer a form for every key Cube's validator
 * accepts on a cube or a view, with enumerations offering exactly the
 * validator's allowed values (direction.md rule 26).
 * Fails when: a key the validator accepts has no form field, or an
 * enumeration offers a value the validator rejects.
 *
 * The authority is the research's YAML schema inventory, read from Cube
 * v1.7.42's validator (`docs/research/cube/data-modeling.md`, Y.3–Y.14). It
 * is read back here, table by table, rather than copied a second time: a key
 * it lists and the form lacks fails, whichever of the two is edited.
 */
// From the package, where its tests run (under jsdom `import.meta.url` is
// not a file URL).
const research = readFileSync(
  resolve(process.cwd(), '../../docs/research/cube/data-modeling.md'),
  'utf8',
);
const inventory = research.slice(
  research.indexOf('## YAML schema inventory'),
  research.indexOf('### Y.15'),
);

interface Row {
  readonly section: string;
  readonly keys: readonly string[];
  readonly options?: readonly string[];
}

/** Every table row of the inventory: the keys it names, and its enumeration if it has one. */
function rows(): Row[] {
  const found: Row[] = [];
  let section: string | undefined;
  for (const line of inventory.split('\n')) {
    section =
      /^### (Y\.\d+)\b/.exec(line)?.[1] ?? /^\*\*(Y\.\d+[a-z])\b/.exec(line)?.[1] ?? section;
    if (section === undefined || !line.startsWith('| `')) continue;
    const cells = line
      .split('|')
      .slice(1, -1)
      .map((cell) => cell.trim());
    // Not accepted: a key the table lists only to say Joi refuses it.
    if (cells.some((cell) => /not allowed|rejected by Joi/i.test(cell))) continue;
    const named = [...(cells[0] ?? '').replace(/\([^)]*\)/g, '').matchAll(/`([^`]+)`/g)]
      .map((match) => match[1] ?? '')
      .filter((token) => /^\.?[a-z_][a-z_.]*$/.test(token));
    // "`member_masking.includes` / `.excludes`": the second shares the first's parent.
    const keys = named.map((key, index) =>
      key.startsWith('.') ? `${(named[index - 1] ?? '').split('.')[0] ?? ''}${key}` : key,
    );
    // Every value the cell names after "enum:", its legacy and camelCase
    // forms too ("…; legacy `belongs_to`, …"): each is one Joi accepts.
    const enumeration = cells.map((cell) => /enum: ([^|]+)/.exec(cell)?.[1]).find(Boolean);
    found.push({
      section,
      keys,
      ...(enumeration === undefined
        ? {}
        : { options: [...enumeration.matchAll(/`([^`]+)`/g)].map((match) => match[1] ?? '') }),
    });
  }
  return found;
}

describe('the model form’s schema', () => {
  it('reads keys from the inventory, so a silent parse cannot pass', () => {
    // A guard on the reader: were the tables to go unread, every check below
    // would pass on nothing.
    expect(rows().length).toBeGreaterThan(100);
  });

  it('has a field for every key the validator accepts, in every object', () => {
    const missing = rows().flatMap(({ section, keys }) => {
      const fields = SCHEMA[section as SectionId]?.fields.map((field) => field.key) ?? [];
      return keys.filter((key) => !fields.includes(key)).map((key) => `${section} ${key}`);
    });

    expect(missing).toEqual([]);
  });

  it('offers exactly the validator’s values for every enumeration', () => {
    const wrong = rows().flatMap(({ section, keys, options }) =>
      options === undefined
        ? []
        : keys
            .map((key) => SCHEMA[section as SectionId]?.fields.find((field) => field.key === key))
            .map((field) => ({
              field,
              offered: [...(field?.options ?? []), ...(field?.aliases ?? [])],
            }))
            .filter(({ offered }) => JSON.stringify(offered) !== JSON.stringify(options))
            .map(
              ({ field, offered }) => `${section} ${field?.key ?? '?'}: ${JSON.stringify(offered)}`,
            ),
    );

    expect(wrong).toEqual([]);
  });

  it('reads every value of an enumeration, so a relationship’s legacy forms are checked too', () => {
    const relationship = rows().find(
      (row) => row.section === 'Y.5' && row.keys.includes('relationship'),
    );

    expect(relationship?.options).toHaveLength(12);
  });

  it('offers the multi-stage measure types only on a multi-stage measure (§Y.17)', () => {
    const type = SCHEMA['Y.7'].fields.find((field) => field.key === 'type');

    expect(type?.onlyWith).toEqual({
      number_agg: { key: 'multi_stage', value: true },
      rank: { key: 'multi_stage', value: true },
    });
  });

  it('offers only `true` for a row-level policy’s allow_all (Y.14)', () => {
    const allowAll = SCHEMA['Y.14'].fields.find((field) => field.key === 'row_level.allow_all');

    expect(allowAll?.options).toEqual(['true']);
  });

  it('gives the lists written inside a key’s type their own fields, enumerations as the research lists them', () => {
    const itemsOf = (section: SectionId, key: string) =>
      Object.fromEntries(
        (SCHEMA[section].fields.find((field) => field.key === key)?.fields ?? []).map((field) => [
          field.key,
          field.options ?? field.kind,
        ]),
      );
    const operators = [
      ...(/\*\*Filter operators:\*\* ([^.]+)\./.exec(research)?.[1] ?? '').matchAll(/`([^`]+)`/g),
    ].map((match) => match[1]);

    // Y.7: "list of `{sql (required), dir: asc or desc}`".
    expect(itemsOf('Y.7', 'order_by')).toEqual({ sql: 'sql', dir: ['asc', 'desc'] });
    // Y.13: "named list of `{columns (references), type: regular or aggregate}`".
    // References whose order is the index's sort order, edited as rows that
    // move (T152, AC-146).
    expect(itemsOf('Y.13', 'indexes')).toEqual({
      name: 'identifier',
      columns: 'ordered-references',
      type: ['regular', 'aggregate'],
    });
    // Y.13: "list of `{dimension (reference), granularity}`".
    expect(itemsOf('Y.13', 'time_dimensions')).toEqual({
      dimension: 'reference',
      granularity: 'text',
    });
    // Y.14: `conditions` is "list of `{if: expression}`", and the filter rows.
    expect(itemsOf('Y.14', 'conditions')).toEqual({ if: 'text' });
    expect(itemsOf('Y.14', 'row_level.filters')).toEqual({
      member: 'reference',
      operator: [...operators, 'measureFilter'],
      values: 'yaml',
      or: 'yaml',
      and: 'yaml',
    });
  });

  it('offers the filter operators Y.16 lists, and no other', () => {
    // Y.16, past the tables' end.
    const listed = /\*\*Filter operators:\*\* ([^.]+)\./.exec(research)?.[1] ?? '';
    const operators = [...listed.matchAll(/`([^`]+)`/g)].map((match) => match[1]);

    expect(operators.length).toBeGreaterThan(20);
    expect(SCHEMA['Y.10c'].fields.find((field) => field.key === 'operator')?.options).toEqual(
      operators,
    );
  });

  it('offers the measure types Y.7’s shapes allow, and no other', () => {
    const shapes = inventory.slice(
      inventory.indexOf('### Y.7 '),
      inventory.indexOf('| YAML key', inventory.indexOf('### Y.7 ')),
    );
    const types = new Set([
      ...[...shapes.matchAll(/`type: (\w+)`/g)].map((match) => match[1]),
      ...[...(/∈ \{([^}]+)\}/.exec(shapes)?.[1] ?? '').matchAll(/`(\w+)`/g)].map((m) => m[1]),
      ...[...(/plus `(\w+)` and `(\w+)`/.exec(shapes) ?? [])].slice(1),
    ]);

    expect(types.size).toBeGreaterThan(10);
    expect(new Set(MEASURE_TYPES)).toEqual(types);
  });
});
