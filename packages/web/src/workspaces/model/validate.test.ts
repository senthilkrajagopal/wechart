import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { validationProblems } from './validate';

/**
 * T237 / AC-227: WHEN the model's code parses, THE SYSTEM SHALL list in
 * Problems, with the line, every value outside the set Cube's validator
 * allows and every required key that is missing, before the user publishes
 * (direction.md rule 26).
 * `Fails when: a measure of type "summ" leaves Problems empty.`
 *
 * The sets and the required keys are the research's (data-modeling.md,
 * Y.3–Y.13), read from Cube 1.7.42's Joi validator.
 */
const ORDERS = `cubes:
  - name: orders
    sql_table: public.orders
    joins:
      - name: customers
        relationship: many_to_one
        sql: "{CUBE}.customer_id = {customers}.id"
    dimensions:
      - name: id
        sql: id
        type: number
        primary_key: true
    measures:
      - name: count
        type: count
`;

const lineOf = (text: string, needle: string) =>
  text.split('\n').findIndex((line) => line.includes(needle)) + 1;

describe('what Cube’s validator would refuse (AC-227)', () => {
  it('finds nothing in a model it accepts', () => {
    expect(validationProblems('cubes/orders.yml', ORDERS)).toEqual([]);
  });

  it('lists a measure of type "summ" at its line, naming what is allowed', () => {
    const text = ORDERS.replace('type: count', 'type: summ');
    const [problem, ...rest] = validationProblems('cubes/orders.yml', text);
    expect(rest).toEqual([]);
    expect(problem?.line).toBe(lineOf(text, 'type: summ'));
    expect(problem?.message).toMatch(
      /^Measure count: type "summ" is not one Cube accepts \(count, number, /,
    );
    expect(problem?.severity).toBe('error');
    expect(text.slice(problem?.from, problem?.to)).toBe('summ');
  });

  it('takes a value the validator also accepts, and refuses one it takes only with another key', () => {
    expect(
      validationProblems('cubes/orders.yml', ORDERS.replace('many_to_one', 'belongsTo')),
    ).toEqual([]);
    const ranked = ORDERS.replace('type: count', 'type: rank');
    expect(validationProblems('cubes/orders.yml', ranked)[0]?.message).toContain(
      'only with multi_stage: true',
    );
  });

  it('lists a missing required key at the member it belongs to', () => {
    const typeless = ORDERS.replace('        type: number\n', '');
    const [problem] = validationProblems('cubes/orders.yml', typeless);
    expect(problem?.message).toBe('Dimension id: "type" is required.');
    expect(problem?.line).toBe(lineOf(typeless, '- name: id'));
  });

  it('asks a cube for its table or its SQL, and a measure other than a count for its SQL', () => {
    const tableless = ORDERS.replace('    sql_table: public.orders\n', '');
    expect(validationProblems('cubes/orders.yml', tableless)[0]?.message).toBe(
      'Cube orders: "sql_table" or "sql" is required.',
    );
    const summed = ORDERS.replace('type: count', 'type: sum');
    expect(validationProblems('cubes/orders.yml', summed)[0]?.message).toBe(
      'Measure count: "sql" is required.',
    );
  });

  it('finds nothing in the sample model, which Cube compiles', () => {
    const model = join(__dirname, '../../../../../infra/cube/model');
    const files = ['cubes', 'views'].flatMap((folder) =>
      readdirSync(join(model, folder)).map((name) => `${folder}/${name}`),
    );
    expect(files.length).toBeGreaterThan(5);
    for (const path of files)
      expect(validationProblems(path, readFileSync(join(model, path), 'utf8'))).toEqual([]);
  });

  it('reads keys and types written camelCase, as Cube does', () => {
    const camel = `cubes:
  - name: orders
    sqlTable: public.orders
    measures:
      - name: buyers
        sql: customer_id
        type: countDistinct
      - name: ranked
        type: rank
        multiStage: true
    pre_aggregations:
      - name: main
        type: rollup
`;
    expect(validationProblems('cubes/orders.yml', camel)).toEqual([]);
  });

  it('asks each nested object for its own required keys', () => {
    const text = `cubes:
  - name: orders
    sql_table: public.orders
    refresh_key:
      timezone: UTC
    joins:
      - name: customers
        relationship: many_to_one
    dimensions:
      - name: at
        sql: at
        type: time
        granularities:
          - name: fiscal_year
      - name: place
        type: geo
        latitude:
          sql: lat
      - name: status
        sql: status
        type: string
        links:
          - name: open
    measures:
      - name: to_date
        sql: amount
        type: sum
        rolling_window:
          type: to_date
    pre_aggregations:
      - name: main
        measures: [to_date]
        time_dimension: at
    access_policy:
      - group: sales
        groups: [a]
        row_level:
          filters:
            - member: status
`;
    expect(validationProblems('cubes/orders.yml', text).map((problem) => problem.message)).toEqual([
      'Refresh key #1: "every", "sql" or "immutable" is required.',
      'Join customers: "sql" is required.',
      'Granularity fiscal_year: "interval" is required.',
      'Dimension place: "longitude" is required.',
      'Link open: "label" is required.',
      'Rolling window #1: "granularity" is required.',
      'Pre-aggregation main: "granularity" is required.',
      'Access policy #1: exactly one of "group" and "groups" is required.',
      'filters #1: "operator" is required.',
      'filters #1: "values" is required.',
    ]);
  });

  it('refuses a format a string does not take, a boolean written as text, and both table and SQL', () => {
    const text = `cubes:
  - name: orders
    sql_table: public.orders
    sql: SELECT 1
    dimensions:
      - name: status
        sql: status
        type: string
        format: "%Y"
    measures:
      - name: count
        type: count
        multi_stage: "yes"
`;
    expect(validationProblems('cubes/orders.yml', text).map((problem) => problem.message)).toEqual([
      'Cube orders: only one of "sql_table" and "sql" may be written.',
      'Dimension status: format "%Y" is not one a string takes (imageUrl, link, currency, percent, number, id, or a link).',
      'Measure count: multi_stage must be true or false.',
    ]);
  });

  it('asks a view’s cubes for their join path, and a view group for its name', () => {
    const text = `views:
  - name: summary
    cubes:
      - includes: "*"
view_groups:
  - title: Sales
`;
    expect(validationProblems('views/summary.yml', text).map((problem) => problem.message)).toEqual(
      ['Cube in the view #1: "join_path" is required.', 'View group #1: "name" is required.'],
    );
  });

  it('reads nothing into a file that does not parse, or is not YAML', () => {
    expect(validationProblems('cubes/orders.yml', 'cubes: [')).toEqual([]);
    expect(validationProblems('cubes/orders.js', 'cube(`orders`, {})')).toEqual([]);
  });
});

/**
 * T258 / AC-153: a refresh key's cron Cube's refresh worker can't run is
 * listed in Problems at its line, before the publish that would refuse it —
 * on a rollup, and on a cube's own key (research/cube/refresh-key-schedule.md).
 */
describe('a refresh key Cube can’t run (AC-153)', () => {
  const withKeys = (cubeEvery: string, rollupEvery: string) => `${ORDERS}    refresh_key:
      every: "${cubeEvery}"
    pre_aggregations:
      - name: main
        measures: [CUBE.count]
        refresh_key:
          every: "${rollupEvery}"
`;

  it('lists each cron Cube can’t run, or would run otherwise, at its line', () => {
    const text = withKeys('0 * * * 1', '55 7 * * 1-5');
    const problems = validationProblems('cubes/orders.yml', text);
    expect(problems.map(({ line, message }) => ({ line, message }))).toEqual([
      {
        line: lineOf(text, 'every: "0 * * * 1"'),
        message: expect.stringMatching(
          /^Cube orders: Cube would run "0 \* \* \* 1" every hour, every day, not as it reads/,
        ) as unknown as string,
      },
      {
        line: lineOf(text, 'every: "55 7 * * 1-5"'),
        message: expect.stringMatching(
          /^Pre-aggregation main: Cube’s refresh worker can’t run "55 7 \* \* 1-5"/,
        ) as unknown as string,
      },
    ]);
  });

  it('lists nothing for crons Cube runs as written, or intervals', () => {
    expect(validationProblems('cubes/orders.yml', withKeys('1 hour', '0 8 * * *'))).toEqual([]);
  });

  it('lists a tab around a cron, and an interval of 0, as Cube refuses them (T377)', () => {
    const text = withKeys('0 hour', '\\t0 8 * * *');
    expect(
      validationProblems('cubes/orders.yml', text).map(({ line, message }) => ({ line, message })),
    ).toEqual([
      {
        line: lineOf(text, 'every: "0 hour"'),
        message: expect.stringMatching(/^Cube orders: "0 hour" has no length/) as unknown as string,
      },
      {
        line: lineOf(text, 'every: "\\t0 8 * * *"'),
        message: expect.stringMatching(
          /^Pre-aggregation main: Cube’s refresh worker can’t run "\t0 8 \* \* \*"/,
        ) as unknown as string,
      },
    ]);
  });
});
