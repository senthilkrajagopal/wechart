import { countryCodeMarkingOf } from '@wechart/core';
import { useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { parse, stringify } from 'yaml';

import { StatusIcon } from '../../../shell/StatusIcon';
import { CUBE_PARSE } from '../objects';
import { IndexColumns } from '../preagg/IndexEditor';
import { isSchedule, RefreshSchedule, zones } from '../preagg/RefreshSchedule';
import { DataSourcesContext } from './dataSources';
import { MemberChips, MemberSelect } from './MemberPicker';
import { SCHEMA, type Field, type ObjectSchema } from './schema';
import { canonicalOf, optionsFor, PickerScopeContext } from './scopes';

/**
 * The model editor's form (T138, AC-132; direction.md §7b), generated from
 * the schema: every key Cube's validator accepts gets a field, enumerations a
 * select of the validator's own values. A value is the plain object parsed
 * from the file; `onChange` hands back the next one, which T139 writes to the
 * YAML.
 */
type Value = Record<string, unknown>;

/** A key's value; a dotted key (`member_level.includes`) reaches into its object. */
function read(value: Value, key: string): unknown {
  return key
    .split('.')
    .reduce<unknown>(
      (at, part) => (at !== null && typeof at === 'object' ? (at as Value)[part] : undefined),
      value,
    );
}

/** The value with one key set — `undefined` removes it — leaving everything else as it was. */
function write(value: Value, key: string, next: unknown): Value {
  const [head = '', ...rest] = key.split('.');
  if (rest.length > 0) {
    const inner = (value[head] ?? {}) as Value;
    return { ...value, [head]: write(inner, rest.join('.'), next) };
  }
  const copy = { ...value };
  if (next === undefined) delete copy[head];
  else copy[head] = next;
  return copy;
}

/** A YAML field's text: the value as YAML, or nothing for no value. */
const yamlOf = (value: unknown) => (value === undefined ? '' : stringify(value).trimEnd());

const isPlain = (value: unknown): value is Value =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/** The object a `list` or `object` field holds: its section, or the fields written inline. */
export function schemaOf(field: Field): ObjectSchema {
  if (field.of !== undefined) return SCHEMA[field.of];
  return { title: field.label, plural: field.label, fields: field.fields ?? [] };
}

/** A list's name: "Measures", "Access policies", "Cubes in the view". */
function pluralOf(schema: ObjectSchema): string {
  if (schema.plural !== undefined) return schema.plural;
  return /[^aeiou]y$/.test(schema.title) ? `${schema.title.slice(0, -1)}ies` : `${schema.title}s`;
}

/**
 * Whether a value is of the shape its field edits. One that isn't — a format
 * written as `{type: link, label}`, a date Cube reads as a timestamp — is
 * edited as YAML instead, rather than shown empty and written over.
 */
function fits(field: Field, value: unknown): boolean {
  if (value === undefined) return true;
  switch (field.kind) {
    case 'identifier':
    case 'text':
    case 'reference':
    case 'format':
      return typeof value === 'string' || typeof value === 'number';
    case 'sql':
    case 'enum':
    case 'data-source':
    case 'timezone':
      return typeof value === 'string';
    case 'boolean':
      return typeof value === 'boolean';
    case 'flag':
      return typeof value === 'boolean' || typeof value === 'string';
    case 'number':
      return typeof value === 'number';
    case 'references':
    case 'ordered-references':
      return (
        typeof value === 'string' ||
        (Array.isArray(value) && value.every((each) => typeof each === 'string'))
      );
    case 'list':
      return Array.isArray(value) && value.every(isPlain);
    case 'object':
      return isPlain(value);
    case 'refresh-schedule':
      return isSchedule(value);
    case 'yaml':
      return true;
  }
}

/** The names a references field's text holds. */
const namesOf = (text: string) =>
  text
    .split(',')
    .map((name) => name.trim())
    .filter((name) => name !== '');

/**
 * Member references, typed as `a, b`. What is typed is kept as typed while it
 * still reads as the value — so the comma of `a,` stays — and the value is
 * shown afresh when it changes from elsewhere.
 */
function ReferencesControl({
  id,
  value,
  onChange,
  placeholder = 'member, member',
}: {
  id: string;
  value: unknown;
  onChange: (next: unknown) => void;
  /** What it names, when not members: a view's groups (T481's review). */
  placeholder?: string | undefined;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const names = Array.isArray(value)
    ? (value as string[])
    : typeof value === 'string'
      ? [value]
      : [];
  const shown =
    draft !== null && JSON.stringify(namesOf(draft)) === JSON.stringify(names)
      ? draft
      : names.join(', ');
  return (
    <input
      id={id}
      type="text"
      placeholder={placeholder}
      value={shown}
      onChange={(event) => {
        setDraft(event.target.value);
        const next = namesOf(event.target.value);
        onChange(next.length === 0 ? undefined : next);
      }}
      onBlur={() => {
        setDraft(null);
      }}
    />
  );
}

function Control({
  field,
  value,
  owner,
  onChange,
  id,
  labelId,
  describedBy,
}: {
  field: Field;
  value: unknown;
  /** The object the field is a key of: some options depend on its other keys. */
  owner: Value;
  onChange: (next: unknown) => void;
  id: string;
  /** The field's label: it names a picker's group, which a `for` can't. */
  labelId: string;
  /** Its help line's id, if it has one (T481). */
  describedBy?: string | undefined;
}) {
  const scope = useContext(PickerScopeContext);
  const sources = useContext(DataSourcesContext);
  /** What every plain control of the field carries: its help, and whether it is required. */
  const said = {
    'aria-describedby': describedBy,
    'aria-required': field.required === true ? true : undefined,
  };
  const text = (next: string) => {
    onChange(next === '' ? undefined : next);
  };
  // A reference picked from what the model has, never typed (AC-224).
  if (field.scope !== undefined && field.kind === 'reference')
    return (
      <MemberSelect
        id={id}
        value={typeof value === 'string' || typeof value === 'number' ? String(value) : undefined}
        options={optionsFor(field.scope, scope, owner)}
        onChange={onChange}
        describedBy={describedBy}
        required={field.required === true}
      />
    );
  if (field.scope !== undefined && field.kind === 'references')
    return (
      <MemberChips
        labelId={labelId}
        value={
          value === '*' && field.star === true
            ? '*'
            : Array.isArray(value)
              ? (value as string[])
              : typeof value === 'string'
                ? [value]
                : undefined
        }
        options={optionsFor(field.scope, scope, owner)}
        ordered={field.ordered === true}
        star={field.star === true}
        canonical={(name) => canonicalOf(name, scope)}
        onChange={(next) => {
          onChange(typeof next === 'string' || next === undefined ? next : [...next]);
        }}
      />
    );
  // Picked from the data sources Cube has (T481): one it doesn't is kept, and said.
  // None listed is as good as unknown: typed, rather than a picker of nothing (T481's review).
  if (field.kind === 'data-source' && sources !== undefined && sources.length > 0) {
    const current = typeof value === 'string' ? value : '';
    return (
      <select
        id={id}
        className="is-code"
        {...said}
        value={current}
        onChange={(event) => {
          text(event.target.value);
        }}
      >
        <option value="">(not set · default)</option>
        {sources.map((source) => (
          <option key={source} value={source}>
            {source}
          </option>
        ))}
        {current !== '' && !sources.includes(current) ? (
          <option value={current}>{`${current} (not a data source Cube has)`}</option>
        ) : null}
      </select>
    );
  }
  switch (field.kind) {
    case 'sql':
      return (
        <textarea
          id={id}
          className="model-field__sql"
          rows={2}
          {...said}
          placeholder={field.placeholder}
          value={typeof value === 'string' ? value : ''}
          onChange={(event) => {
            text(event.target.value);
          }}
        />
      );
    case 'enum': {
      // Only what the validator takes here (`rank` only when multi-stage).
      const offered = (field.options ?? []).filter((option) => {
        const needs = field.onlyWith?.[option];
        return needs === undefined || read(owner, needs.key) === needs.value;
      });
      const aliases = field.aliases ?? [];
      const current = typeof value === 'string' ? value : '';
      const asWritten = current !== '' && !offered.includes(current) && !aliases.includes(current);
      return (
        <select
          id={id}
          {...said}
          value={current}
          onChange={(event) => {
            text(event.target.value);
          }}
        >
          <option value="">(not set)</option>
          {offered.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
          {aliases.length === 0 ? null : (
            <optgroup label="Also accepted">
              {aliases.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </optgroup>
          )}
          {/* Shown as the file has it, not as "(not set)"; not offered otherwise. */}
          {asWritten ? <option value={current}>{`${current} (as written)`}</option> : null}
        </select>
      );
    }
    case 'boolean': {
      // Some keys take only `true` (row_level.allow_all).
      const offered = field.options ?? ['true', 'false'];
      return (
        <select
          id={id}
          value={value === true ? 'true' : value === false ? 'false' : ''}
          onChange={(event) => {
            const chosen = event.target.value;
            onChange(chosen === '' ? undefined : chosen === 'true');
          }}
        >
          <option value="">(not set)</option>
          {offered.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
          {value === false && !offered.includes('false') ? (
            <option value="false">false (as written)</option>
          ) : null}
        </select>
      );
    }
    case 'flag': {
      // A boolean, or an expression Cube evaluates (J·EXPR).
      const expression = typeof value === 'string';
      return (
        <span className="model-field__flag">
          <select
            id={id}
            value={
              expression ? 'expression' : value === true ? 'true' : value === false ? 'false' : ''
            }
            onChange={(event) => {
              const chosen = event.target.value;
              onChange(
                chosen === ''
                  ? undefined
                  : chosen === 'expression'
                    ? expression
                      ? value
                      : ''
                    : chosen === 'true',
              );
            }}
          >
            <option value="">(not set)</option>
            <option value="true">true</option>
            <option value="false">false</option>
            <option value="expression">expression</option>
          </select>
          {expression ? (
            <input
              type="text"
              aria-label={`${field.label} expression`}
              value={value}
              onChange={(event) => {
                onChange(event.target.value);
              }}
            />
          ) : null}
        </span>
      );
    }
    case 'references':
      return (
        <ReferencesControl
          id={id}
          value={value}
          onChange={onChange}
          placeholder={field.placeholder}
        />
      );
    case 'timezone': {
      // Picked, as a pre-aggregation's zone is (T481's review; design 03 state B's select).
      const current = typeof value === 'string' ? value : '';
      const known = zones();
      return (
        <select
          id={id}
          {...said}
          value={current}
          onChange={(event) => {
            text(event.target.value);
          }}
        >
          <option value="">{field.placeholder ?? '(not set)'}</option>
          {known.map((zone) => (
            <option key={zone} value={zone}>
              {zone}
            </option>
          ))}
          {current !== '' && !known.includes(current) ? (
            <option value={current}>{`${current} (as written)`}</option>
          ) : null}
        </select>
      );
    }
    case 'ordered-references':
      return <IndexColumns id={id} value={value} onChange={onChange} />;
    case 'number':
      return (
        <input
          id={id}
          type="number"
          value={typeof value === 'number' ? String(value) : ''}
          onChange={(event) => {
            onChange(event.target.value === '' ? undefined : Number(event.target.value));
          }}
        />
      );
    case 'refresh-schedule':
      return (
        <RefreshSchedule
          id={id}
          value={value}
          onChange={onChange}
          // The worker never runs the key of a rollup that says so (T377).
          scheduled={owner['scheduled_refresh'] !== false && owner['scheduledRefresh'] !== false}
        />
      );
    case 'yaml':
    case 'list':
    case 'object':
      return <YamlControl id={id} value={value} onChange={onChange} />;
    case 'identifier':
    case 'text':
    case 'reference':
    case 'format':
    case 'data-source':
      return (
        <input
          id={id}
          type="text"
          {...said}
          placeholder={field.placeholder}
          value={typeof value === 'string' || typeof value === 'number' ? String(value) : ''}
          onChange={(event) => {
            text(event.target.value);
          }}
        />
      );
  }
}

/**
 * A value the form does not break into fields — `meta`, a list of filters —
 * edited as YAML, read as Cube reads it (`CUBE_PARSE`), and taken only once
 * it parses; until then the text stays as typed, the value as it was, and
 * the field says why.
 */
function YamlControl({
  id,
  value,
  onChange,
  describedBy,
  required = false,
}: {
  id: string;
  value: unknown;
  onChange: (next: unknown) => void;
  /** The field's help line, when it has one (T481's review). */
  describedBy?: string | undefined;
  required?: boolean;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const problemId = useId();
  const described = [describedBy, problem === null ? undefined : problemId]
    .filter((each) => each !== undefined)
    .join(' ');
  return (
    <>
      <textarea
        id={id}
        className="model-field__yaml"
        rows={2}
        value={draft ?? yamlOf(value)}
        aria-invalid={problem === null ? undefined : true}
        aria-required={required ? true : undefined}
        aria-describedby={described === '' ? undefined : described}
        onChange={(event) => {
          setDraft(event.target.value);
        }}
        onBlur={() => {
          if (draft === null) return;
          try {
            onChange(draft.trim() === '' ? undefined : (parse(draft, CUBE_PARSE) as unknown));
            setDraft(null);
            setProblem(null);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            setProblem(message.split('\n')[0] ?? message);
          }
        }}
      />
      {problem === null ? null : (
        <span id={problemId} role="alert" className="model-field__problem">
          <StatusIcon kind="err" />
          Not YAML yet: {problem}
        </span>
      )}
    </>
  );
}

/** A boolean's value when the file doesn't write it, where the research gives one. */
const defaultOf = (field: Field, owner: Value): boolean | undefined =>
  typeof field.default === 'function' ? field.default(owner) : field.default;

/**
 * A boolean as design 03's switch, its label and Cube's default beside it
 * ("Public · default on"; T480). Unwritten, it shows the default; put back to
 * the default, the key goes. A flag — a boolean or an expression Cube
 * evaluates — can still be made an expression.
 */
function SwitchRow({
  field,
  value,
  owner,
  onChange,
}: {
  field: Field;
  value: unknown;
  owner: Value;
  onChange: (next: unknown) => void;
}) {
  const id = useId();
  const fallback = defaultOf(field, owner) ?? false;
  const on = typeof value === 'boolean' ? value : fallback;
  // Its help too, as every field's (T481's review: calendar's was never drawn).
  const help = field.help === undefined ? undefined : `${id}-help`;
  return (
    <div className="field model-field model-field--switch" data-key={field.key}>
      <label htmlFor={id}>{field.label}</label>
      <span id={`${id}-default`} className="model-field__default">
        · default {fallback ? 'on' : 'off'}
      </span>
      {field.kind === 'flag' ? (
        <button
          type="button"
          className="model-field__expression"
          // Its visible "ƒx" in its name (WCAG 2.5.3; T480's review).
          aria-label={`ƒx: ${field.label} as an expression`}
          title="Use an expression Cube evaluates"
          onClick={(event) => {
            // The switch gives way to the expression's field: focus goes to it,
            // not to the page (T480's review).
            const fields = event.currentTarget.closest('.model-form__fields');
            onChange('');
            setTimeout(() => {
              fields
                ?.querySelector<HTMLInputElement>(
                  `[data-key="${field.key}"] input[aria-label="${field.label} expression"]`,
                )
                ?.focus();
            }, 0);
          }}
        >
          ƒx
        </button>
      ) : null}
      <input
        id={id}
        type="checkbox"
        role="switch"
        className="switch"
        checked={on}
        aria-describedby={help === undefined ? `${id}-default` : `${id}-default ${help}`}
        onChange={(event) => {
          const next = event.target.checked;
          onChange(next === fallback ? undefined : next);
        }}
      />
      {help === undefined ? null : (
        <span id={help} className="model-field__help">
          {field.help}
        </span>
      )}
    </div>
  );
}

function FieldRow({
  field,
  value,
  onChange,
}: {
  field: Field;
  value: Value;
  onChange: (next: Value) => void;
}) {
  const id = useId();
  const own = read(value, field.key);
  const change = (next: unknown) => {
    onChange(write(value, field.key, next));
  };
  const shaped = fits(field, own);

  // A boolean with a default the research gives, and not an expression: a switch.
  if (
    shaped &&
    (field.kind === 'flag' || field.kind === 'boolean') &&
    field.default !== undefined &&
    typeof own !== 'string'
  )
    return <SwitchRow field={field} value={own} owner={value} onChange={change} />;

  // A list or object the schema describes is its own set of fields.
  if (shaped && field.kind === 'object' && field.of !== undefined) {
    const inner = (own ?? {}) as Value;
    // Its own fields in its group, which names it (the refresh key, T481).
    if (field.flat === true)
      return (
        <div className="model-field--flat" data-key={field.key}>
          <ObjectForm
            schema={schemaOf(field)}
            value={inner}
            onChange={(next) => {
              change(Object.keys(next).length === 0 ? undefined : next);
            }}
          />
        </div>
      );
    return (
      <fieldset className="model-field model-field--object" data-key={field.key}>
        <legend>{field.label}</legend>
        <ObjectForm
          schema={schemaOf(field)}
          value={inner}
          onChange={(next) => {
            change(Object.keys(next).length === 0 ? undefined : next);
          }}
        />
      </fieldset>
    );
  }
  if (shaped && field.kind === 'list' && (field.of !== undefined || field.fields !== undefined)) {
    return (
      <fieldset className="model-field model-field--list" data-key={field.key}>
        <legend>{field.label}</legend>
        <MemberList
          schema={schemaOf(field)}
          items={Array.isArray(own) ? (own as Value[]) : []}
          onChange={change}
        />
      </fieldset>
    );
  }

  const help = field.help === undefined ? undefined : `${id}-help`;
  return (
    <div
      className={`field model-field${field.required === true ? ' is-required' : ''}`}
      data-key={field.key}
    >
      <label id={`${id}-label`} htmlFor={id}>
        {field.label}
      </label>
      {shaped ? (
        <Control
          field={field}
          value={own}
          owner={value}
          onChange={change}
          id={id}
          labelId={`${id}-label`}
          describedBy={help}
        />
      ) : (
        <YamlControl
          id={id}
          value={own}
          onChange={change}
          describedBy={help}
          required={field.required === true}
        />
      )}
      {help === undefined ? null : (
        <span id={help} className="model-field__help">
          {field.help}
        </span>
      )}
    </div>
  );
}

/** A key that can't change here, as written, with why (T722, AC-423). */
function FixedRow({ field, value, note }: { field: Field; value: Value; note: string }) {
  const id = useId();
  const own = read(value, field.key);
  return (
    <div
      className={`field model-field${field.required === true ? ' is-required' : ''}`}
      data-key={field.key}
    >
      <label id={`${id}-label`} htmlFor={id}>
        {field.label}
      </label>
      <input
        id={id}
        type="text"
        className="is-code"
        readOnly
        aria-required={field.required === true ? true : undefined}
        aria-describedby={`${id}-help`}
        value={typeof own === 'string' ? own : ''}
      />
      <span id={`${id}-help`} className="model-field__help">
        {note}
      </span>
    </div>
  );
}

/**
 * Two keys of which Cube takes exactly one, as one row: which, as a segmented
 * control, and its value (design 03 state B's "Reads from", T481). Switching
 * moves what is written to the other key, for the user to change; a file that
 * writes both shows both, for Problems to name.
 */
function OneOfRow({
  field,
  other,
  value,
  onChange,
}: {
  field: Field & { readonly oneOf: NonNullable<Field['oneOf']> };
  other: Field;
  value: Value;
  onChange: (next: Value) => void;
}) {
  const id = useId();
  const first = read(value, field.key);
  const second = read(value, other.key);
  const [chosen, setChosen] = useState<'first' | 'second'>('first');
  // The file says which, when it writes one; else the last one chosen.
  const shown =
    first !== undefined && second === undefined
      ? 'first'
      : second !== undefined && first === undefined
        ? 'second'
        : chosen;
  const both = first !== undefined && second !== undefined;
  const help = `${id}-help`;
  const choose = (next: 'first' | 'second') => {
    setChosen(next);
    if (next === shown || both) return;
    const [from, to] = next === 'second' ? [field, other] : [other, field];
    const moved = read(value, from.key);
    if (moved === undefined) return;
    onChange(write(write(value, from.key, undefined), to.key, moved));
  };
  const input = (which: Field, label: string, multiline: boolean) => {
    const own = read(value, which.key);
    const set = (next: string) => {
      onChange(write(value, which.key, next === '' ? undefined : next));
    };
    // Text over lines keeps its lines: a one-line input would drop them (T481's review).
    return multiline || (typeof own === 'string' && own.includes('\n')) ? (
      <textarea
        className="model-field__sql"
        rows={2}
        aria-label={label}
        aria-describedby={help}
        value={typeof own === 'string' ? own : ''}
        onChange={(event) => {
          set(event.target.value);
        }}
      />
    ) : (
      <input
        type="text"
        className="is-code"
        aria-label={label}
        aria-describedby={help}
        placeholder={field.placeholder}
        value={typeof own === 'string' ? own : ''}
        onChange={(event) => {
          set(event.target.value);
        }}
      />
    );
  };
  return (
    <div
      className="field model-field model-field--one-of"
      data-key={`${field.key} ${other.key}`}
      role="group"
      aria-labelledby={`${id}-title`}
    >
      <span id={`${id}-title`} className="model-field__title">
        {field.oneOf.title}
      </span>
      <div className="model-field__one-of">
        {both ? null : (
          <span className="seg">
            <button
              type="button"
              aria-pressed={shown === 'first'}
              onClick={() => {
                choose('first');
              }}
            >
              {field.label}
            </button>
            <button
              type="button"
              aria-pressed={shown === 'second'}
              onClick={() => {
                choose('second');
              }}
            >
              {field.oneOf.label}
            </button>
          </span>
        )}
        {both || shown === 'first' ? input(field, field.label, false) : null}
        {both || shown === 'second' ? input(other, field.oneOf.label, true) : null}
      </div>
      <span id={help} className="model-field__help">
        {field.help}
      </span>
    </div>
  );
}

/**
 * Whether a string dimension holds ISO-3 country codes (T397, AC-313): by its
 * values unless the model says, which it does in `meta.wechart.countryCode`,
 * a key of wechart's that Cube passes through untouched. Set here so the
 * author needn't write the YAML; everything else in `meta` is kept.
 */
function CountryCodeRow({ value, onChange }: { value: Value; onChange: (next: Value) => void }) {
  const id = useId();
  const marking = countryCodeMarkingOf(value['meta']);
  const mark = (next: boolean | undefined) => {
    const meta: Value = isPlain(value['meta']) ? { ...value['meta'] } : {};
    const wechart: Value = isPlain(meta['wechart']) ? { ...meta['wechart'] } : {};
    if (next === undefined) delete wechart['countryCode'];
    else wechart['countryCode'] = next;
    if (Object.keys(wechart).length === 0) delete meta['wechart'];
    else meta['wechart'] = wechart;
    onChange(write(value, 'meta', Object.keys(meta).length === 0 ? undefined : meta));
  };
  return (
    // wechart's own setting, not a key of Cube's: marked apart from `data-key`.
    <div className="field model-field" data-setting="country-code">
      <label htmlFor={id}>Country code</label>
      <select
        id={id}
        value={marking === undefined ? '' : String(marking)}
        onChange={(event) => {
          const chosen = event.target.value;
          mark(chosen === '' ? undefined : chosen === 'true');
        }}
      >
        <option value="">Decided by its values (ISO-3 codes)</option>
        <option value="true">A country code</option>
        <option value="false">Not a country code</option>
      </select>
    </div>
  );
}

/**
 * A fold that opens itself when what it holds is written, and never closes
 * on its own: clearing the last key a user set leaves it where they are
 * (T480's review). Opening and closing it otherwise is the user's.
 */
function Fold({
  className,
  opened,
  summary,
  children,
}: {
  className: string;
  opened: boolean;
  summary: ReactNode;
  children: ReactNode;
}) {
  const fold = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (opened && fold.current !== null) fold.current.open = true;
  }, [opened]);
  return (
    <details ref={fold} className={className}>
      <summary>{summary}</summary>
      {children}
    </details>
  );
}

/** Every field of an object, its legacy keys set apart in a group of their own. */
export function ObjectForm({
  schema,
  value,
  onChange,
  only,
  legacyInAdvanced = false,
  fixed,
}: {
  schema: ObjectSchema;
  value: Value;
  onChange: (next: Value) => void;
  /** Which fields to show; all by default. */
  only?: (field: Field) => boolean;
  /**
   * A key that can't change here, shown read-only with why: a landed cube's
   * or view's name (T722, AC-423).
   */
  fixed?: { readonly key: string; readonly note: string } | undefined;
  /**
   * The legacy keys under Advanced's caret, not a fold of their own: a cube's
   * or a view's General, as design 03 state B and MW-08 ask (T481's review).
   */
  legacyInAdvanced?: boolean;
}) {
  // Only what applies to this member (AC-225) — and whatever the file writes.
  const applies = (field: Field) =>
    field.applies === undefined || field.applies(value) || read(value, field.key) !== undefined;
  const fields = schema.fields.filter((field) => (only?.(field) ?? true) && applies(field));
  const current = fields.filter((field) => field.legacy !== true);
  const legacy = fields.filter((field) => field.legacy === true);
  // In their named groups, in the order the schema first names each (AC-225).
  const groups = new Map<string, Field[]>();
  for (const field of current)
    if (field.group !== undefined)
      groups.set(field.group, [...(groups.get(field.group) ?? []), field]);
  const ungrouped = current.filter((field) => field.group === undefined);
  // A string dimension's country-code marking sits in Geography (T397).
  const countryCode = schema === SCHEMA['Y.6'] && value['type'] === 'string' && only === undefined;
  // Groups in the order the schema names them, Geography included for that.
  const shown = [...new Set(schema.fields.map((field) => field.group))]
    .filter((name): name is string => name !== undefined)
    .filter((name) => groups.has(name) || (name === 'Geography' && countryCode))
    .map((name) => [name, groups.get(name) ?? []] as const);
  /**
   * Design 03 note 6 (T480, MW-12): Basics open, and the groups that say how
   * this member is defined — a CASE, switch values, a geographic point — beside
   * it; every other group folded under Advanced, named by the keys it holds.
   */
  const open = (name: string) =>
    name === 'Basics' ||
    // A cube's refresh, in view on General (design 03 state B, T481).
    name === 'Refresh' ||
    // A CASE is in view only on a dimension it defines; offered, it waits under Advanced.
    (name === 'CASE / WHEN' && value['case'] !== undefined) ||
    name === 'Switch' ||
    (name === 'Geography' && value['type'] === 'geo');
  const inView = shown.filter(([name]) => open(name));
  const folded = shown.filter(([name]) => !open(name));
  const foldsCountryCode = countryCode && folded.some(([name]) => name === 'Geography');
  const legacyFolded = legacyInAdvanced && legacy.length > 0;
  const foldedKeys = [
    ...folded.flatMap(([, inside]) => inside.map((field) => field.key)),
    // wechart's own setting, named with the keys it sits among (T480's review).
    ...(foldsCountryCode ? ['country code'] : []),
    ...(legacyFolded ? legacy.map((field) => field.key) : []),
  ];
  const legacyWritten = legacy.some((field) => read(value, field.key) !== undefined);
  // Opened by itself when the file writes one of its keys: nothing written is hidden (AC-225).
  const written =
    folded.some(([, inside]) => inside.some((field) => read(value, field.key) !== undefined)) ||
    (foldsCountryCode && countryCodeMarkingOf(value['meta']) !== undefined) ||
    (legacyFolded && legacyWritten);
  const id = useId();
  /** A group's title's id: its name has spaces and slashes, which an id can't (T480's review). */
  const titleId = (name: string) => `${id}-${name.replace(/[^A-Za-z0-9]+/g, '-')}`;
  /**
   * A field's row. Of two keys Cube takes one of (`oneOf`), the first draws
   * both as one row and the second none of its own (T481).
   */
  /**
   * Both of a pair are text, or unwritten; else each is its own row, edited
   * as YAML if it must be, as any value of another shape is (T481's review).
   */
  const textual = (field: Field) =>
    [field.key, field.oneOf?.key ?? field.key].every((key) => {
      const own = read(value, key);
      return own === undefined || typeof own === 'string';
    });
  const rowOf = (field: Field) => {
    if (fixed?.key === field.key)
      return <FixedRow key={field.key} field={field} value={value} note={fixed.note} />;
    const pair = fields.find((each) => each.oneOf?.key === field.key);
    if (pair !== undefined && textual(pair)) return null;
    const { oneOf } = field;
    const other = oneOf === undefined ? undefined : fields.find((each) => each.key === oneOf.key);
    if (oneOf !== undefined && other !== undefined && textual(field))
      return (
        <OneOfRow
          key={field.key}
          field={{ ...field, oneOf }}
          other={other}
          value={value}
          onChange={onChange}
        />
      );
    return <FieldRow key={field.key} field={field} value={value} onChange={onChange} />;
  };
  const group = ([name, inside]: readonly [string, readonly Field[]]) => {
    // A group of an object drawn flat says which key it is (design 03: "Refresh refresh_key").
    const keys = inside.every((field) => field.flat === true)
      ? inside.map((field) => field.key).join(', ')
      : '';
    return (
      // Named by its title, said once; not a heading, in a pane headed by the file.
      <section
        key={name}
        role="group"
        aria-labelledby={titleId(name)}
        className="model-form__group"
      >
        <p className="model-form__group-title">
          <span id={titleId(name)}>{name}</span>
          {keys === '' ? null : (
            <>
              {' '}
              <span className="model-form__advanced-keys">{keys}</span>
            </>
          )}
        </p>
        <div className="model-form__fields">
          {inside.map(rowOf)}
          {name === 'Geography' && countryCode ? (
            <CountryCodeRow value={value} onChange={onChange} />
          ) : null}
        </div>
      </section>
    );
  };
  return (
    <div className="model-form__fields">
      {ungrouped.map(rowOf)}
      {inView.map(group)}
      {folded.length === 0 && !legacyFolded ? null : (
        <Fold
          className="model-form__advanced"
          opened={written}
          summary={
            <>
              Advanced <span className="model-form__advanced-keys">{foldedKeys.join(', ')}</span>
            </>
          }
        >
          {/* One group alone needs no title of its own: Advanced names it (T481). */}
          {folded.length === 1 && !foldsCountryCode ? (
            <div className="model-form__fields">{folded[0]?.[1].map(rowOf)}</div>
          ) : (
            folded.map(group)
          )}
          {/* General's legacy keys under the same caret (MW-08), titled as a group. */}
          {legacyFolded ? group(['Legacy and undocumented', legacy]) : null}
        </Fold>
      )}
      {legacy.length === 0 || legacyFolded ? null : (
        <Fold
          className="model-form__legacy"
          opened={legacyWritten}
          summary="Legacy and undocumented keys"
        >
          {legacy.map((field) => (
            <FieldRow key={field.key} field={field} value={value} onChange={onChange} />
          ))}
        </Fold>
      )}
    </div>
  );
}

/**
 * What a member is defined by, in a line for its collapsed row (AC-225): its
 * SQL; or, defined some other way, what defines it — a CASE, a point, its
 * switch values.
 */
function previewOf(item: Value): string | undefined {
  if (typeof item['sql'] === 'string') return item['sql'];
  if (item['case'] !== undefined) return 'CASE …';
  const sqlOf = (key: string) => {
    const at = item[key];
    return isPlain(at) && typeof at['sql'] === 'string' ? at['sql'] : undefined;
  };
  const [latitude, longitude] = [sqlOf('latitude'), sqlOf('longitude')];
  if (latitude !== undefined || longitude !== undefined)
    return [latitude ?? '?', longitude ?? '?'].join(', ');
  if (Array.isArray(item['values'])) return (item['values'] as unknown[]).map(String).join(', ');
  return undefined;
}

/**
 * A member's badges (AC-225): primary key; hidden from the API, or a primary
 * key made public, as design 03 badges `id` (T480); its format.
 */
function badgesOf(item: Value): string[] {
  const key = item['primary_key'] === true;
  return [
    key ? 'PK' : undefined,
    // A primary key is hidden unless it says otherwise (Y.6, `public`).
    item['public'] === false || (key && item['public'] === undefined)
      ? 'hidden'
      : key && item['public'] === true
        ? 'public'
        : undefined,
    typeof item['format'] === 'string' ? item['format'] : undefined,
  ].filter((badge): badge is string => badge !== undefined);
}

/**
 * What goes where a member's type goes (design 03 note 5): its type, or a
 * join's relationship, in words — "many to one", as the join diagram says it
 * (T480, MW-11).
 */
function typeOf(item: Value): string | undefined {
  if (typeof item['type'] === 'string') return item['type'];
  if (typeof item['relationship'] === 'string')
    return item['relationship']
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/_/g, ' ')
      .toLowerCase();
  return undefined;
}

/** A new member's name, `segment_1`, the first not taken; none for an object without one. */
function newItem(schema: ObjectSchema, items: readonly Value[]): Value {
  if (!schema.fields.some((field) => field.key === 'name')) return {};
  const stem = schema.title.toLowerCase().replace(/[^a-z0-9]+/g, '_');
  const taken = new Set(items.map((item) => item['name']));
  let n = 1;
  while (taken.has(`${stem}_${String(n)}`)) n += 1;
  return { name: `${stem}_${String(n)}` };
}

/**
 * A list of members — each a row showing its name, type, SQL and badges,
 * which expands in place into the fields that apply to it (direction.md §7b,
 * "Rows"; AC-225) — with a member added at its end, or one removed.
 */
export function MemberList({
  schema,
  items,
  onChange,
  describe,
  onOpenMember,
  emptyNote,
  addOnOpen = false,
  openFirst,
}: {
  /**
   * The member, by name, to open as the list first shows, brought into view:
   * the one Jobs' "Open in Model" came from (T469, UX-080).
   */
  openFirst?: string | undefined;
  schema: ObjectSchema;
  items: readonly Value[];
  onChange: (next: Value[] | undefined) => void;
  /**
   * What a member holds, listed with it rather than only in its closed form —
   * a pre-aggregation's attributes (T148, AC-142).
   */
  describe?: ((item: Value) => ReactNode) | undefined;
  /**
   * Which member is open — the one opened last, or none — for the YAML to
   * tint its lines (T482, design 03 note 9).
   */
  onOpenMember?: ((index: number | null) => void) | undefined;
  /** Said while the list is empty: what an empty list means (a view's cubes, MW-19). */
  emptyNote?: string | undefined;
  /**
   * Opens with a new member ready, its first field focused, and written only
   * once something is set in it: nothing is chosen for the user (T493, MW-19).
   */
  addOnOpen?: boolean;
}) {
  const { title } = schema;
  const noun = title.charAt(0).toLowerCase() + title.slice(1);
  const [pending, setPending] = useState<Value | null>(() => (addOnOpen ? {} : null));
  const pendingBox = useRef<HTMLDivElement>(null);
  // The new member's first field takes focus as the list opens with it.
  useEffect(() => {
    if (!addOnOpen) return;
    pendingBox.current
      ?.querySelector<HTMLElement>('[data-key] select, [data-key] input, [data-key] textarea')
      ?.focus();
    // Once, as the list opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  /**
   * An add or a remove, then what it leaves once the owner has put it in the
   * list — which it may not: an edit held to ask about a comment (T480's
   * review). The owner's update is flushed first, so the list is read as it
   * now is: an added member opens with its name focused to type over (design
   * 03 note 7); after a remove, the member now in its place is closed and its
   * row focused, so a second press removes nothing unseen. A list other than
   * the one expected is left alone.
   */
  const rows = useRef<HTMLUListElement>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  // Once, as the list first shows: the member asked for, open and in view.
  useEffect(() => {
    if (openFirst === undefined) return;
    const at = items.findIndex((item) => isPlain(item) && item['name'] === openFirst);
    const details = rows.current?.children[at]?.querySelector('details');
    if (details === null || details === undefined) return;
    details.open = true;
    details.scrollIntoView?.({ block: 'nearest' });
    // Once, as the list opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const change = (next: Value[] | undefined, then: (list: HTMLUListElement) => void) => {
    const expected = next?.length ?? 0;
    flushSync(() => {
      onChange(next);
    });
    const list = rows.current;
    if (list !== null && list.children.length === expected) then(list);
  };
  const add = () => {
    change([...items, newItem(schema, items)], (list) => {
      const details = list.lastElementChild?.querySelector('details');
      if (details === null || details === undefined) return;
      details.open = true;
      const name = details.querySelector<HTMLInputElement>(
        ':scope > .model-form__fields [data-key="name"] input',
      );
      name?.focus();
      name?.select();
    });
  };
  /**
   * The new member's first key set: it is written, opened in the list, and
   * the field just set keeps the focus — its first control, a chip too.
   */
  const commit = (next: Value) => {
    const key = Object.keys(next).find((each) => pending?.[each] !== next[each]);
    setPending(null);
    change([...items, next], (list) => {
      const details = list.lastElementChild?.querySelector('details');
      if (details === null || details === undefined) return;
      details.open = true;
      const field = details.querySelector(`[data-key="${key ?? ''}"]`);
      (
        field?.querySelector<HTMLElement>('select, input, textarea, button') ??
        details.querySelector<HTMLElement>(':scope > summary')
      )?.focus();
    });
  };
  const remove = (index: number) => {
    const rest = items.filter((_, at) => at !== index);
    change(rest.length === 0 ? undefined : rest, (list) => {
      const details = list.children[index]?.querySelector('details');
      if (details === null || details === undefined) {
        addButton.current?.focus();
        return;
      }
      details.open = false;
      details.querySelector<HTMLElement>(':scope > summary')?.focus();
    });
  };
  return (
    <div className="model-members-block">
      {items.length === 0 && emptyNote !== undefined ? (
        <p className="model-members__note">{emptyNote}</p>
      ) : null}
      <ul ref={rows} className="model-members" aria-label={pluralOf(schema)}>
        {items.map((entry, index) => {
          // A `-` with nothing after it yet is a member with no keys, not a crash.
          const item = isPlain(entry) ? entry : {};
          const name =
            typeof item['name'] === 'string' ? item['name'] : `${title} ${String(index + 1)}`;
          const type = typeOf(item);
          const preview = previewOf(item);
          const badges = badgesOf(item);
          return (
            // Positions, not names: a member's name is one of the fields it edits.
            <li key={index} className="model-members__item">
              <details
                className="model-member"
                onToggle={(event) => {
                  if (onOpenMember === undefined) return;
                  if (event.currentTarget.open) {
                    onOpenMember(index);
                    return;
                  }
                  // Closed: the one still open, last in the list, else none.
                  const members = [...(rows.current?.children ?? [])].map(
                    (row) => row.querySelector(':scope > details')?.hasAttribute('open') === true,
                  );
                  const still = members.lastIndexOf(true);
                  onOpenMember(still === -1 ? null : still);
                }}
              >
                {/* Collapsed, still read (AC-225), as design 03's rows read like
                    the YAML: the name and its badges, the type on the right, the
                    SQL on its own line under the name. */}
                <summary>
                  <span className="model-member__names">
                    <span className="model-member__name">{name}</span>
                    {badges.map((badge) => (
                      <span key={badge} className="model-member__badge">
                        {badge}
                      </span>
                    ))}
                  </span>
                  {type === undefined ? null : <span className="model-member__type">{type}</span>}
                  {preview === undefined ? null : (
                    // Not read out as the row's name each time it is reached:
                    // the SQL is in its field when the row opens.
                    <span className="model-member__sql" aria-hidden="true">
                      {preview}
                    </span>
                  )}
                </summary>
                <ObjectForm
                  schema={schema}
                  value={item}
                  onChange={(next) => {
                    onChange(items.map((each, at) => (at === index ? next : each)));
                  }}
                />
                {/* Remove inside the open member, where it is deliberate (design 03 note 6). */}
                <div className="model-member__foot">
                  <button
                    type="button"
                    className="btn-sm model-member__remove"
                    aria-label={`Remove ${noun} ${name}`}
                    onClick={() => {
                      remove(index);
                    }}
                  >
                    Remove {noun}
                  </button>
                </div>
              </details>
              {describe?.(item)}
            </li>
          );
        })}
      </ul>
      {/* A new member, not yet written: open, as a member being edited is. */}
      {pending === null ? null : (
        <div
          ref={pendingBox}
          role="group"
          aria-label={`New ${noun}`}
          className="model-member model-member--new"
        >
          <p className="model-member__new-title">New {noun}</p>
          <ObjectForm
            schema={schema}
            value={pending}
            onChange={(next) => {
              if (Object.keys(next).length > 0) commit(next);
            }}
          />
          <div className="model-member__foot">
            <button
              type="button"
              className="btn-sm"
              onClick={() => {
                setPending(null);
                addButton.current?.focus();
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {/* The prototype's "+ measure" (model.js, `data-addroot`), and how many (design 03 note 7). */}
      <div className="model-members__foot">
        <button
          ref={addButton}
          type="button"
          className="btn-sm model-members__add"
          aria-label={`Add ${noun}`}
          onClick={add}
        >
          + {noun}
        </button>
        <span className="model-members__total">{items.length} total</span>
      </div>
    </div>
  );
}
