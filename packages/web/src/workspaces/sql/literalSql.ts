import { DRIVERS, type DriverType } from '@wechart/core';

import type { ParamType } from './parameterNames';
import { dialectFor } from './statementAt';

/**
 * A run's parameter values written into Make a cube's SQL as literals (T822,
 * AC-462; decision T822-1), in each driver's own escaping as research
 * `docs/research/sql-literals.md` sets it out, since Cube 1.7.45 has no
 * escaper for these drivers. Only the rules that research verified are
 * written: Redshift, Oracle's and PostgreSQL's Booleans, and any other
 * driver are refused, as is a NUL in Text on every driver.
 *
 * Every literal is written with a space either side, so a sign never makes
 * `--` with what is before it (sql-literals.md, Summary 4); a `$` is never
 * left before digits and another `$`, which Cube would take for one of its
 * own parameters (Summary 3); and braces are left to `MakeCubePane`, which
 * escapes every brace of the cube's SQL for Cube's YAML.
 */

export interface RunValue {
  readonly type: ParamType;
  readonly value: string;
}

/** Why a value isn't written: a driver or type not verified, a NUL, a value not of its type, too long. */
export type Refusal = 'driver' | 'nul' | 'value' | 'long';

/** sql-literals.md, Summary 5 (xcube's own check): a plain decimal, at most 38 digits, 30 after the point. */
const DECIMAL = /^-?(\d+)(?:\.(\d+))?$/;
const isDate = (value: string) => {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (parts === null) return false;
  const [year, month, day] = [Number(parts[1]), Number(parts[2]), Number(parts[3])];
  const at = new Date(Date.UTC(year, month - 1, day));
  return at.getUTCFullYear() === year && at.getUTCMonth() === month - 1 && at.getUTCDate() === day;
};
const hex2 = (code: number) => code.toString(16).padStart(2, '0');
const utf8 = (text: string) => new TextEncoder().encode(text);

/** Pieces split after each `$`, so none holds `$<digits>$` across its end (sql-literals.md, Gotcha 2). */
const splitAfterDollars = (value: string) => value.split(/(?<=\$)/);

/** Text, per driver (sql-literals.md, "Per driver"). */
function textOf(driver: DriverType, value: string): { literal: string } | { refused: Refusal } {
  switch (driver) {
    case 'postgres':
      // [pg-lex] §4.1.2.2: an escape string reads the same whatever standard_conforming_strings is.
      return {
        literal: `E'${value
          .replace(/\\/g, '\\\\')
          .replace(/'/g, "''")
          .replace(/\n/g, '\\n')
          .replace(/\r/g, '\\r')
          .replace(/\$/g, '\\x24')}'`,
      };
    case 'mysql': {
      // [my-hex]: a hex literal with an introducer; no quote, backslash or $ in it.
      if (value === '') return { literal: "''" };
      const hex = [...utf8(value)].map((byte) => hex2(byte).toUpperCase()).join('');
      return { literal: `_utf8mb4 X'${hex}'` };
    }
    case 'snowflake':
      // [sf-text]: a backslash always escapes; an unknown escape drops it, so each is doubled.
      return {
        literal: `'${value
          .replace(/\\/g, '\\\\')
          .replace(/'/g, "''")
          .replace(/\n/g, '\\n')
          .replace(/\r/g, '\\r')
          .replace(/\$/g, '\\x24')}'`,
      };
    case 'bigquery':
      // [gsql-lex]: `''` isn't an escape; no unescaped new line in a quoted literal.
      return {
        literal: `'${value
          .replace(/\\/g, '\\\\')
          .replace(/'/g, "\\'")
          .replace(/\n/g, '\\n')
          .replace(/\r/g, '\\r')
          // eslint-disable-next-line no-control-regex
          .replace(/[\u0001-\u001f]/g, (control) => `\\x${hex2(control.charCodeAt(0))}`)
          .replace(/\$/g, '\\x24')}'`,
      };
    case 'mssql': {
      // [ms-const] N'…' with '' ; [ms-bs] a backslash before a new line continues the line,
      // so the two are split apart; [ms-concat] the first piece (max), so `+` doesn't cut at 8000 bytes.
      const pieces = splitAfterDollars(value).flatMap((piece) => piece.split(/(?<=\\)(?=\r?\n)/));
      const quoted = pieces.map((piece) => `N'${piece.replace(/'/g, "''")}'`);
      return quoted.length === 1
        ? { literal: quoted[0]! }
        : { literal: `(CAST(${quoted[0]!} AS nvarchar(max)) + ${quoted.slice(1).join(' + ')})` };
    }
    case 'oracle': {
      // [ora-lit]: '' doubled, no backslash escapes, at most 4,000 bytes (STANDARD); [ora-concat] ||.
      if (utf8(value).length > 4000) return { refused: 'long' };
      const quoted = splitAfterDollars(value).map((piece) => `'${piece.replace(/'/g, "''")}'`);
      return { literal: quoted.length === 1 ? quoted[0]! : `(${quoted.join(' || ')})` };
    }
    default:
      return { refused: 'driver' };
  }
}

/** One value as its driver's literal, or why it isn't written. */
export function literalOf(
  driver: string | null,
  { type, value }: RunValue,
): { literal: string } | { refused: Refusal } {
  // Redshift's rules are unverified, Dremio and Cube Store take no values (sql-literals.md).
  const verified = ['postgres', 'mysql', 'snowflake', 'bigquery', 'mssql', 'oracle'];
  if (driver === null || !verified.includes(driver)) return { refused: 'driver' };
  const on = driver as DriverType;
  if (type === 'text') return value.includes('\u0000') ? { refused: 'nul' } : textOf(on, value);
  if (type === 'number') {
    const parts = DECIMAL.exec(value);
    const whole = parts?.[1] ?? '';
    const scale = parts?.[2]?.length ?? 0;
    if (parts === null || whole.length + scale > 38 || scale > 30) return { refused: 'value' };
    const wrapped = `( ${value} )`;
    switch (on) {
      case 'postgres':
        return { literal: `${wrapped}::numeric` }; // [pg-lex] §4.1.2.6
      case 'mysql':
        return { literal: `CAST( ${wrapped} AS DECIMAL(65,${String(scale)}))` }; // [my-num]
      case 'snowflake':
        return { literal: `${wrapped}::NUMBER(38,${String(scale)})` }; // [sf-num]
      case 'mssql':
        return { literal: `CAST( ${wrapped} AS DECIMAL(38,${String(scale)}))` }; // [ms-const]
      case 'oracle':
        return { literal: wrapped }; // [ora-lit]
      default:
        // [gsql-lex], [gsql-types]: NUMERIC is precision 38, scale 9; else BIGNUMERIC.
        return {
          literal: `${whole.length <= 29 && scale <= 9 ? 'NUMERIC' : 'BIGNUMERIC'} '${value}'`,
        };
    }
  }
  if (type === 'date') {
    if (!isDate(value)) return { refused: 'value' };
    if (on === 'snowflake') return { literal: `TO_DATE('${value}', 'YYYY-MM-DD')` }; // [sf-todate]
    if (on === 'mssql') return { literal: `CONVERT(DATE, '${value.replace(/-/g, '')}', 112)` }; // [ms-nondet]
    return { literal: `DATE '${value}'` }; // [pg-lex], [my-date], [gsql-lex], [ora-lit]
  }
  // Boolean: PostgreSQL's is unverified in its own docs, Oracle's is 23ai's alone.
  if (on === 'postgres' || on === 'oracle') return { refused: 'driver' };
  if (value !== 'true' && value !== 'false') return { refused: 'value' };
  if (on === 'mssql') return { literal: `CAST(${value === 'true' ? '1' : '0'} AS BIT)` }; // [ms-const]
  return { literal: value === 'true' ? 'TRUE' : 'FALSE' }; // [my-bool], [sf-bool], [gsql-types]
}

const SKIP = new Set(['String', 'LineComment', 'BlockComment', 'QuotedIdentifier']);
const PARAMETER = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g;

/** Where each `{{ name }}` is code, as the run's own lexer reads it (sql-literals.md, Gotcha 4). */
function placesOf(sql: string, driver: string | null) {
  const skipped: [number, number][] = [];
  dialectFor(driver).language.parser.parse(sql).iterate({
    enter: (node) => {
      if (!SKIP.has(node.name)) return undefined;
      skipped.push([node.from, node.to]);
      return false;
    },
  });
  return [...sql.matchAll(PARAMETER)]
    .filter((found) => !skipped.some(([from, to]) => found.index >= from && found.index < to))
    .map((found) => ({ at: found.index, length: found[0].length, name: found[1]! }));
}

/**
 * The SQL that ran with each parameter's value written in as its literal,
 * and whether any was; or why it can't be, in the pane's words.
 */
export function writeValuesIn(
  sql: string,
  driver: string | null,
  values: readonly ({ readonly name: string } & RunValue)[],
): { readonly sql: string; readonly written: boolean } | { readonly refused: string } {
  const places = placesOf(sql, driver);
  if (places.length === 0) return { sql, written: false };
  const label = DRIVERS[driver as DriverType]?.label ?? driver ?? 'this data source';
  let written = sql;
  for (const place of [...places].reverse()) {
    const value = values.find((each) => each.name === place.name);
    if (value === undefined)
      return { refused: `The value of ${place.name} isn’t known: run it again, then Make a cube.` };
    const literal = literalOf(driver, value);
    if ('refused' in literal) {
      switch (literal.refused) {
        case 'driver':
          return {
            refused: `Parameter values can’t be written into SQL for ${label} yet: replace them with literals, then Make a cube.`,
          };
        case 'nul':
          return {
            refused: `The value of ${place.name} holds a NUL character, which no SQL literal can hold: remove it, run it again, then Make a cube.`,
          };
        case 'long':
          return {
            refused: `The value of ${place.name} is longer than ${label} takes in a literal: shorten it, run it again, then Make a cube.`,
          };
        default:
          return {
            refused: `The value of ${place.name} isn’t ${value.type === 'number' ? 'a number' : value.type === 'date' ? 'a date' : 'true or false'} as the run sent it: run it again, then Make a cube.`,
          };
      }
    }
    written = `${written.slice(0, place.at)} ${literal.literal} ${written.slice(place.at + place.length)}`;
  }
  return { sql: written, written: true };
}
