import { describe, expect, it } from 'vitest';

import { literalOf, writeValuesIn } from './literalSql';

/**
 * T822 (AC-462): a run's parameter values written into Make a cube's SQL as
 * literals, in each driver's own escaping (research `sql-literals.md`), and
 * refused where research hasn't verified the driver's rule (decision T822-1).
 * Fails when: the draft's SQL differs from what ran other than the
 * parameters written in as literals.
 */
const text = (value: string) => ({ type: 'text' as const, value });
const number = (value: string) => ({ type: 'number' as const, value });
const date = (value: string) => ({ type: 'date' as const, value });
const boolean = (value: string) => ({ type: 'boolean' as const, value });

describe('literalOf, Text (T822, AC-462)', () => {
  it('PostgreSQL: an escape string, its quote doubled, backslash, new lines and $ escaped', () => {
    expect(literalOf('postgres', text("O'Brien"))).toEqual({ literal: "E'O''Brien'" });
    expect(literalOf('postgres', text('a\\b\nc\rd$1$'))).toEqual({ literal: "E'a\\\\b\\nc\\rd\\x241\\x24'" });
  });

  it('MySQL: a hex literal of its UTF-8 bytes, so no sql_mode matters; empty as an empty string', () => {
    expect(literalOf('mysql', text("O'Brien"))).toEqual({ literal: "_utf8mb4 X'4F27427269656E'" });
    expect(literalOf('mysql', text('é'))).toEqual({ literal: "_utf8mb4 X'C3A9'" });
    expect(literalOf('mysql', text(''))).toEqual({ literal: "''" });
  });

  it('Snowflake: backslash and quote escaped, new lines and $ as escapes', () => {
    expect(literalOf('snowflake', text("O'Brien\\x\n$"))).toEqual({ literal: "'O''Brien\\\\x\\n\\x24'" });
  });

  it('BigQuery: quote and backslash with a backslash, control characters and $ as \\x', () => {
    expect(literalOf('bigquery', text("O'Brien\\\n\t$"))).toEqual({ literal: "'O\\'Brien\\\\\\n\\x09\\x24'" });
  });

  it('SQL Server: N-quoted, its quote doubled; split after a $ and between a backslash and its new line', () => {
    expect(literalOf('mssql', text("O'Brien"))).toEqual({ literal: "N'O''Brien'" });
    expect(literalOf('mssql', text('a$1$b'))).toEqual({
      literal: "(CAST(N'a$' AS nvarchar(max)) + N'1$' + N'b')",
    });
    expect(literalOf('mssql', text('end\\\nnext'))).toEqual({
      literal: "(CAST(N'end\\' AS nvarchar(max)) + N'\nnext')",
    });
  });

  it('Oracle: its quote doubled, split after a $; longer than 4,000 bytes refused', () => {
    expect(literalOf('oracle', text("O'Brien"))).toEqual({ literal: "'O''Brien'" });
    expect(literalOf('oracle', text('a$1$b'))).toEqual({ literal: "('a$' || '1$' || 'b')" });
    expect(literalOf('oracle', text('x'.repeat(4001)))).toEqual({ refused: 'long' });
    // By bytes, not characters: 2,001 two-byte characters are 4,002 bytes (T822's review).
    expect(literalOf('oracle', text('é'.repeat(2001)))).toEqual({ refused: 'long' });
    expect(literalOf('oracle', text('é'.repeat(2000)))).toEqual({ literal: `'${'é'.repeat(2000)}'` });
  });

  it('refuses a NUL in Text on every driver', () => {
    for (const driver of ['postgres', 'mysql', 'snowflake', 'bigquery', 'mssql', 'oracle'])
      expect(literalOf(driver, text('a\u0000b'))).toEqual({ refused: 'nul' });
  });
});

describe('literalOf, Number, Date and Boolean (T822, AC-462)', () => {
  it('writes a number in parentheses, typed as the run bound it', () => {
    expect(literalOf('postgres', number('-12.5'))).toEqual({ literal: '( -12.5 )::numeric' });
    expect(literalOf('mysql', number('12.50'))).toEqual({ literal: 'CAST( ( 12.50 ) AS DECIMAL(65,2))' });
    expect(literalOf('snowflake', number('3'))).toEqual({ literal: '( 3 )::NUMBER(38,0)' });
    expect(literalOf('mssql', number('-1.25'))).toEqual({ literal: 'CAST( ( -1.25 ) AS DECIMAL(38,2))' });
    expect(literalOf('oracle', number('7'))).toEqual({ literal: '( 7 )' });
    expect(literalOf('bigquery', number('-12.5'))).toEqual({ literal: "NUMERIC '-12.5'" });
    expect(literalOf('bigquery', number('1.0123456789'))).toEqual({ literal: "BIGNUMERIC '1.0123456789'" });
  });

  it('refuses a number that isn’t a plain decimal', () => {
    for (const value of ['1e5', 'NaN', '', '1.', '--1', '1 OR 1=1'])
      expect(literalOf('postgres', number(value))).toEqual({ refused: 'value' });
  });

  it('writes a date in its dialect’s form', () => {
    expect(literalOf('postgres', date('2024-01-31'))).toEqual({ literal: "DATE '2024-01-31'" });
    expect(literalOf('mysql', date('2024-01-31'))).toEqual({ literal: "DATE '2024-01-31'" });
    expect(literalOf('bigquery', date('2024-01-31'))).toEqual({ literal: "DATE '2024-01-31'" });
    expect(literalOf('oracle', date('2024-01-31'))).toEqual({ literal: "DATE '2024-01-31'" });
    expect(literalOf('snowflake', date('2024-01-31'))).toEqual({ literal: "TO_DATE('2024-01-31', 'YYYY-MM-DD')" });
    expect(literalOf('mssql', date('2024-01-31'))).toEqual({ literal: "CONVERT(DATE, '20240131', 112)" });
    expect(literalOf('postgres', date('2024-02-30'))).toEqual({ refused: 'value' });
  });

  it('writes a Boolean as TRUE/FALSE, or a bit on SQL Server', () => {
    expect(literalOf('mysql', boolean('true'))).toEqual({ literal: 'TRUE' });
    expect(literalOf('snowflake', boolean('false'))).toEqual({ literal: 'FALSE' });
    expect(literalOf('bigquery', boolean('true'))).toEqual({ literal: 'TRUE' });
    expect(literalOf('mssql', boolean('true'))).toEqual({ literal: 'CAST(1 AS BIT)' });
    expect(literalOf('mssql', boolean('false'))).toEqual({ literal: 'CAST(0 AS BIT)' });
  });

  it('refuses what research hasn’t verified: Redshift, Oracle’s and PostgreSQL’s Booleans, and other drivers', () => {
    expect(literalOf('redshift', text('a'))).toEqual({ refused: 'driver' });
    expect(literalOf('oracle', boolean('true'))).toEqual({ refused: 'driver' });
    expect(literalOf('postgres', boolean('true'))).toEqual({ refused: 'driver' });
    expect(literalOf('dremio', text('a'))).toEqual({ refused: 'driver' });
    expect(literalOf(null, text('a'))).toEqual({ refused: 'driver' });
  });
});

describe('writeValuesIn (T822, AC-462)', () => {
  it('writes each value in where its parameter is code, leaving strings and comments as they are', () => {
    const sql = "SELECT * FROM orders WHERE name = {{who}} AND note <> '{{who}}' -- {{who}}\nAND total > {{ least }}";
    expect(
      writeValuesIn(sql, 'postgres', [
        { name: 'who', type: 'text', value: "O'Brien" },
        { name: 'least', type: 'number', value: '10' },
      ]),
    ).toEqual({
      sql: "SELECT * FROM orders WHERE name =  E'O''Brien'  AND note <> '{{who}}' -- {{who}}\nAND total >  ( 10 )::numeric ",
      written: true,
    });
  });

  it('leaves SQL with no parameters as it ran', () => {
    expect(writeValuesIn('SELECT 1', 'redshift', [])).toEqual({ sql: 'SELECT 1', written: false });
  });

  it('refuses a driver whose rule isn’t verified, naming it', () => {
    expect(writeValuesIn('SELECT {{a}}', 'redshift', [{ name: 'a', type: 'text', value: 'x' }])).toEqual({
      refused: 'Parameter values can’t be written into SQL for Amazon Redshift yet: replace them with literals, then Make a cube.',
    });
  });

  it('refuses a NUL in a Text value, naming the parameter', () => {
    expect(writeValuesIn('SELECT {{a}}', 'postgres', [{ name: 'a', type: 'text', value: 'x\u0000' }])).toEqual({
      refused: 'The value of a holds a NUL character, which no SQL literal can hold: remove it, run it again, then Make a cube.',
    });
  });

  it('refuses a value that isn’t its type’s, and a parameter with no value', () => {
    expect(writeValuesIn('SELECT {{n}}', 'postgres', [{ name: 'n', type: 'number', value: '1e9' }])).toEqual({
      refused: 'The value of n isn’t a number as the run sent it: run it again, then Make a cube.',
    });
    expect(writeValuesIn('SELECT {{n}}', 'postgres', [])).toEqual({
      refused: 'The value of n isn’t known: run it again, then Make a cube.',
    });
  });
});
