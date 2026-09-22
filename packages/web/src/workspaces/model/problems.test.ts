import { describe, expect, it } from 'vitest';

import { problemsOf } from './problems';

/**
 * T141 / AC-135: IF the YAML fails to parse, THEN THE SYSTEM SHALL name the
 * file and line in a problems list and keep the form read-only until it
 * parses (direction.md rule 28).
 * Fails when: the form stays editable on unparseable YAML, or the problem
 * names no line.
 */
describe('a file’s problems', () => {
  it('are none for a file that parses', () => {
    expect(problemsOf('cubes/orders.yml', 'cubes:\n  - name: orders\n')).toEqual([]);
  });

  it('each name the file, the line and the column, and say what is wrong', () => {
    const problems = problemsOf('cubes/orders.yml', 'cubes:\n  - name: orders\n    sql: [\n');

    expect(problems.length).toBeGreaterThan(0);
    for (const problem of problems) {
      expect(problem.path).toBe('cubes/orders.yml');
      expect(problem.line).toBeGreaterThanOrEqual(1);
      expect(problem.column).toBeGreaterThanOrEqual(1);
      expect(problem.message).not.toBe('');
      // Where in the text, for the editor to mark it.
      expect(problem.to).toBeGreaterThanOrEqual(problem.from);
    }
  });

  it('are found on the line they are on', () => {
    const [problem] = problemsOf('cubes/x.yml', 'cubes:\n  - name: a\n  - name: b\n   bad: 1\n');

    expect(problem?.line).toBe(4);
  });

  it('include an alias to no anchor, on its line — `yaml` finds it only in reading the values', () => {
    const text = 'cubes:\n  - name: a\n    sql_table: *ba\n';
    const [problem, ...more] = problemsOf('cubes/x.yml', text);

    expect(more).toEqual([]);
    expect(problem?.line).toBe(3);
    expect(problem?.message).toBe('Unresolved alias (the anchor must be set before the alias): ba');
    expect(text.slice(problem?.from, problem?.to)).toBe('*ba');
  });

  it('include a merge of an alias to no anchor — typed as far as `*ba` — on its line', () => {
    const text = 'cubes:\n  - name: a\n    <<: *ba\n';
    const [problem, ...more] = problemsOf('cubes/x.yml', text);

    expect(more).toEqual([]);
    expect(problem?.line).toBe(3);
    expect(problem?.message).toBe('Merge sources must be maps or map aliases');
    expect(text.slice(problem?.from, problem?.to)).toBe('*ba');
  });

  it('say what is wrong once, the place being given beside it', () => {
    const [problem] = problemsOf('cubes/x.yml', 'cubes:\n  - name: a\n    sql_table: t: x\n');

    expect(problem?.line).toBe(3);
    expect(problem?.message).toBe('Nested mappings are not allowed in compact mappings');
  });
});
