import type { ParamType } from './parameterNames';

export type { ParamType };

/*
 * The parameters strip under a tab's editor (T809, AC-453; design 17, pin
 * 13 and state F): each `{{ name }}` in the SQL once, with its type, Text
 * (the default), Number, Date or Boolean, and its value. Each field is named
 * for its parameter, "region, type" and "region, value" (design 17's
 * keyboard table). Run is held, naming those with no value, until each has
 * one (`heldFor`).
 *
 * Lane SQL's calls (T809-1, decisions-sql.md): a type changed clears the
 * value, which may not fit it; Boolean is two buttons, true and false,
 * neither pressed at first, as F2 draws it; a Text value is any text but
 * none. Run is held while any parameter the tab's SQL lists has no value,
 * not only those of the statement that would run.
 */

const TYPES: readonly { readonly type: ParamType; readonly label: string }[] = [
  { type: 'text', label: 'Text' },
  { type: 'number', label: 'Number' },
  { type: 'date', label: 'Date' },
  { type: 'boolean', label: 'Boolean' },
];

/** The names, in order, that have no value yet. */
export function missingValues(
  names: readonly string[],
  values: Readonly<Record<string, string>>,
): readonly string[] {
  return names.filter((name) => (values[name] ?? '') === '');
}

/**
 * Why a source can't take parameters, or null where it can (T810, AC-482;
 * design 17, F4): Dremio's driver and Cube Store write values into the SQL
 * text rather than binding them (research/sql-parameter-binding.md §1–2),
 * so there a run holding one is held, and the API refuses it too.
 */
export function unboundOn(source: { readonly driver?: string; readonly cubeStore?: boolean }): string | null {
  const where = source.cubeStore === true ? 'Cube Store' : source.driver === 'dremio' ? 'Dremio' : null;
  return where === null
    ? null
    : `Parameters aren’t available on ${where}. Write the value into the SQL to run it here.`;
}

/** "a", "a and b", "a, b and c". */
const listOf = (names: readonly string[]) =>
  names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)!}`;

/** What holds Run for want of values (design 17, F1), or null when each has one. */
export function heldFor(missing: readonly string[]): string | null {
  if (missing.length === 0) return null;
  return `Give ${listOf(missing)} ${missing.length === 1 ? 'a value' : 'values'} to run`;
}

function ValueField({
  name,
  type,
  value,
  onValue,
}: {
  readonly name: string;
  readonly type: ParamType;
  readonly value: string;
  readonly onValue: (value: string) => void;
}) {
  const label = `${name}, value`;
  if (type === 'boolean')
    return (
      <span className="seg sql-params__bool" role="group" aria-label={label}>
        {['true', 'false'].map((each) => (
          <button
            key={each}
            type="button"
            aria-pressed={value === each}
            onClick={() => {
              onValue(each);
            }}
          >
            {each}
          </button>
        ))}
      </span>
    );
  return (
    <input
      className="sql-params__input sql-params__value"
      type={type === 'text' ? 'text' : type}
      aria-label={label}
      placeholder="Value"
      aria-invalid={value === ''}
      value={value}
      onChange={(event) => {
        onValue(event.target.value);
      }}
    />
  );
}

export function ParameterStrip({
  names,
  types,
  values,
  onType,
  onValue,
}: {
  /** The SQL's parameters, once each, in order (`parameterNames`). */
  readonly names: readonly string[];
  readonly types: Readonly<Record<string, ParamType>>;
  readonly values: Readonly<Record<string, string>>;
  readonly onType: (name: string, type: ParamType) => void;
  readonly onValue: (name: string, value: string) => void;
}) {
  return (
    <div className="sql-params" role="group" aria-label="Parameters" data-testid="sql-params">
      <span className="sql-params__label">Parameters</span>
      {names.length === 0 ? (
        <span className="sql-params__none">No parameters</span>
      ) : (
        names.map((name) => {
          const type = types[name] ?? 'text';
          return (
            <span key={name} className="sql-params__field">
              <span className="sql-params__name">{name}</span>
              <select
                className="sql-params__input sql-params__type"
                aria-label={`${name}, type`}
                value={type}
                onChange={(event) => {
                  onValue(name, '');
                  onType(name, event.target.value as ParamType);
                }}
              >
                {TYPES.map((each) => (
                  <option key={each.type} value={each.type}>
                    {each.label}
                  </option>
                ))}
              </select>
              <ValueField
                name={name}
                type={type}
                value={values[name] ?? ''}
                onValue={(value) => {
                  onValue(name, value);
                }}
              />
            </span>
          );
        })
      )}
    </div>
  );
}
