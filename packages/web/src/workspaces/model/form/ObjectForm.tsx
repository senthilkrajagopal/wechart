import { useContext, useId, useState, type ReactNode } from 'react';
import { parse, stringify } from 'yaml';

import { StatusIcon } from '../../../shell/StatusIcon';
import { CUBE_PARSE } from '../objects';
import { IndexColumns } from '../preagg/IndexEditor';
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
}: {
  id: string;
  value: unknown;
  onChange: (next: unknown) => void;
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
      placeholder="member, member"
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
}: {
  field: Field;
  value: unknown;
  /** The object the field is a key of: some options depend on its other keys. */
  owner: Value;
  onChange: (next: unknown) => void;
  id: string;
  /** The field's label: it names a picker's group, which a `for` can't. */
  labelId: string;
}) {
  const scope = useContext(PickerScopeContext);
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
  switch (field.kind) {
    case 'sql':
      return (
        <textarea
          id={id}
          className="model-field__sql"
          rows={2}
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
      return <ReferencesControl id={id} value={value} onChange={onChange} />;
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
    case 'yaml':
    case 'list':
    case 'object':
      return <YamlControl id={id} value={value} onChange={onChange} />;
    case 'identifier':
    case 'text':
    case 'reference':
    case 'format':
      return (
        <input
          id={id}
          type="text"
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
}: {
  id: string;
  value: unknown;
  onChange: (next: unknown) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const problemId = useId();
  return (
    <>
      <textarea
        id={id}
        className="model-field__yaml"
        rows={2}
        value={draft ?? yamlOf(value)}
        aria-invalid={problem === null ? undefined : true}
        aria-describedby={problem === null ? undefined : problemId}
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

  // A list or object the schema describes is its own set of fields.
  if (shaped && field.kind === 'object' && field.of !== undefined) {
    const inner = (own ?? {}) as Value;
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

  return (
    <div className="field model-field" data-key={field.key}>
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
        />
      ) : (
        <YamlControl id={id} value={own} onChange={change} />
      )}
    </div>
  );
}

/** Every field of an object, its legacy keys set apart in a group of their own. */
export function ObjectForm({
  schema,
  value,
  onChange,
  only,
}: {
  schema: ObjectSchema;
  value: Value;
  onChange: (next: Value) => void;
  /** Which fields to show; all by default. */
  only?: (field: Field) => boolean;
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
  const id = useId();
  return (
    <div className="model-form__fields">
      {ungrouped.map((field) => (
        <FieldRow key={field.key} field={field} value={value} onChange={onChange} />
      ))}
      {[...groups.entries()].map(([name, inside]) => (
        // Named by its title, said once; not a heading, in a pane headed by the file.
        <section
          key={name}
          role="group"
          aria-labelledby={`${id}-${name}`}
          className="model-form__group"
        >
          <p id={`${id}-${name}`} className="model-form__group-title">
            {name}
          </p>
          <div className="model-form__fields">
            {inside.map((field) => (
              <FieldRow key={field.key} field={field} value={value} onChange={onChange} />
            ))}
          </div>
        </section>
      ))}
      {legacy.length === 0 ? null : (
        <details className="model-form__legacy">
          <summary>Legacy and undocumented keys</summary>
          {legacy.map((field) => (
            <FieldRow key={field.key} field={field} value={value} onChange={onChange} />
          ))}
        </details>
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

/** A member's badges (AC-225): primary key, hidden from the API, its format. */
function badgesOf(item: Value): string[] {
  return [
    item['primary_key'] === true ? 'PK' : undefined,
    // A primary key is hidden unless it says otherwise (Y.6, `public`).
    item['public'] === false || (item['primary_key'] === true && item['public'] === undefined)
      ? 'hidden'
      : undefined,
    typeof item['format'] === 'string' ? item['format'] : undefined,
  ].filter((badge): badge is string => badge !== undefined);
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
}: {
  schema: ObjectSchema;
  items: readonly Value[];
  onChange: (next: Value[] | undefined) => void;
  /**
   * What a member holds, listed with it rather than only in its closed form —
   * a pre-aggregation's attributes (T148, AC-142).
   */
  describe?: ((item: Value) => ReactNode) | undefined;
}) {
  const { title } = schema;
  const noun = title.charAt(0).toLowerCase() + title.slice(1);
  return (
    <div className="model-members-block">
      <ul className="model-members" aria-label={pluralOf(schema)}>
        {items.map((entry, index) => {
          // A `-` with nothing after it yet is a member with no keys, not a crash.
          const item = isPlain(entry) ? entry : {};
          const name =
            typeof item['name'] === 'string' ? item['name'] : `${title} ${String(index + 1)}`;
          const type = typeof item['type'] === 'string' ? item['type'] : undefined;
          const preview = previewOf(item);
          const badges = badgesOf(item);
          return (
            // Positions, not names: a member's name is one of the fields it edits.
            <li key={index} className="model-members__item">
              <details className="model-member">
                {/* Collapsed, still read (AC-225): its type, its SQL, its badges. */}
                <summary>
                  <span className="model-member__name">{name}</span>
                  {badges.map((badge) => (
                    <span key={badge} className="model-member__badge">
                      {badge}
                    </span>
                  ))}
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
              </details>
              {describe?.(item)}
              <button
                type="button"
                className="btn-sm model-members__remove"
                aria-label={`Remove ${noun} ${name}`}
                title={`Remove ${noun} ${name}`}
                onClick={() => {
                  const rest = items.filter((_, at) => at !== index);
                  onChange(rest.length === 0 ? undefined : rest);
                }}
              >
                Remove
              </button>
            </li>
          );
        })}
      </ul>
      {/* The prototype's "+ measure" (model.js, `data-addroot`). */}
      <button
        type="button"
        className="btn-sm model-members__add"
        aria-label={`Add ${noun}`}
        onClick={() => {
          onChange([...items, newItem(schema, items)]);
        }}
      >
        + {noun}
      </button>
    </div>
  );
}
