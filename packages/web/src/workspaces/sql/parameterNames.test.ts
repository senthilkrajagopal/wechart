import { describe, expect, it } from 'vitest';

import { parameterNames } from './parameterNames';
import { dialectFor } from './statementAt';

/**
 * T809 (AC-453): each `{{ name }}` outside string literals and comments,
 * with or without spaces inside the braces and a name matching
 * `[A-Za-z_][A-Za-z0-9_]*`, is listed once, case-sensitively.
 * Fails when: one inside a string literal or a comment is listed; a name is
 * listed twice; `{{region}}` and `{{ region }}` are listed as two;
 * `{{Region}}` and `{{region}}` as one; or `{{1x}}` or `{{a-b}}` is listed.
 */
const PG = dialectFor('postgres');

describe('the parameters in a tab’s SQL (T809, AC-453)', () => {
  it('lists {{region}} and {{ region }} once', () => {
    expect(parameterNames('SELECT {{region}}, {{ region }}, {{  region}}', PG)).toEqual(['region']);
  });

  it('lists {{Region}} and {{region}} as two, in the order they come', () => {
    expect(parameterNames('SELECT {{Region}} WHERE x = {{region}}', PG)).toEqual(['Region', 'region']);
  });

  it('lists a name of letters, digits and underscores that starts with a letter or an underscore', () => {
    expect(parameterNames('SELECT {{_a1}}, {{since_2}}, {{X}}', PG)).toEqual(['_a1', 'since_2', 'X']);
  });

  it('doesn’t list {{1x}}, {{a-b}}, an empty one or one with a space inside its name', () => {
    expect(parameterNames('SELECT {{1x}}, {{a-b}}, {{}}, {{ a b }}, {{a.b}}', PG)).toEqual([]);
  });

  it('doesn’t list one in a string, a -- comment, a block comment or a quoted name', () => {
    const sql = [
      '-- filter by {{region}} later',
      "SELECT '{{not_a_param}}' AS label, /* {{block}} */ \"{{quoted}}\"",
      'FROM orders WHERE region = {{kept}}',
    ].join('\n');
    expect(parameterNames(sql, PG)).toEqual(['kept']);
  });

  it('on PostgreSQL, not in a $$…$$ string', () => {
    expect(parameterNames('SELECT $${{x}}$$, {{y}}', PG)).toEqual(['y']);
  });

  it('on MySQL, where backslashes escape, \'it\\\'s {{x}}\' lists nothing', () => {
    expect(parameterNames("SELECT 'it\\'s {{x}}'", dialectFor('mysql'))).toEqual([]);
    // Standard SQL ends that string at its second quote: there, {{x}} is outside it.
    expect(parameterNames("SELECT 'it\\'s {{x}}'", dialectFor('postgres'))).toEqual(['x']);
  });

  it('lists none in SQL without any', () => {
    expect(parameterNames('SELECT 1', PG)).toEqual([]);
    expect(parameterNames('', PG)).toEqual([]);
  });
});
