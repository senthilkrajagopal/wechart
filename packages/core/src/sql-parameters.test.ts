import { describe, expect, it } from 'vitest';

import { parameterNamesOn } from './sql-parameters';

/**
 * T811's review: the API names a bound run's placeholders again for the
 * audit by each `{{name}}`'s first place, as xcube numbers them with the
 * driver's own lexer. So it reads the SQL as that driver does, where
 * lang-sql has its dialect: PostgreSQL's `$$…$$` and `E'…'` hold no
 * parameter.
 */
describe('parameterNamesOn (T811)', () => {
  it('reads PostgreSQL and Redshift as PostgreSQL: none in a dollar quote', () => {
    const sql = 'SELECT $$ {{a}} $$ AS t, {{b}} AS u, {{c}}';
    for (const driver of ['postgres', 'redshift']) expect(parameterNamesOn(sql, driver), driver).toEqual(['b', 'c']);
  });

  it('reads SQL Server as SQL Server: none in a bracketed name', () => {
    expect(parameterNamesOn('SELECT [{{a}}], {{b}}', 'mssql')).toEqual(['b']);
  });

  it('reads any other as standard SQL', () => {
    expect(parameterNamesOn("SELECT '{{a}}', {{b}}, {{ a }}", 'oracle')).toEqual(['b', 'a']);
    expect(parameterNamesOn("SELECT '{{a}}', {{b}}", null)).toEqual(['b']);
  });
});
