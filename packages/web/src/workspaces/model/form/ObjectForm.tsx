import { useId, useState } from 'react';
import { parse, stringify } from 'yaml';

import { SCHEMA, type Field, type SectionId } from './schema';

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

function Control({
  field,
  value,
  onChange,
  id,
}: {
  field: Field;
  value: unknown;
  onChange: (next: unknown) => void;
  id: string;
}) {
  const text = (next: string) => {
    onChange(next === '' ? undefined : next);
  };
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
    case 'enum':
      return (
        <select
          id={id}
          value={typeof value === 'string' ? value : ''}
          onChange={(event) => {
            text(event.target.value);
          }}
        >
          <option value="">(not set)</option>
          {(field.options ?? []).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      );
    case 'boolean':
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
          <option value="true">true</option>
          <option value="false">false</option>
        </select>
      );
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
        <input
          id={id}
          type="text"
          placeholder="member, member"
          value={Array.isArray(value) ? value.join(', ') : typeof value === 'string' ? value : ''}
          onChange={(event) => {
            const names = event.target.value
              .split(',')
              .map((name) => name.trim())
              .filter((name) => name !== '');
            onChange(names.length === 0 ? undefined : names);
          }}
        />
      );
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
 * edited as YAML, and taken only once it parses; until then the text stays
 * as typed and the value as it was.
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
  return (
    <textarea
      id={id}
      className="model-field__yaml"
      rows={2}
      value={draft ?? yamlOf(value)}
      onChange={(event) => {
        setDraft(event.target.value);
      }}
      onBlur={() => {
        if (draft === null) return;
        try {
          onChange(draft.trim() === '' ? undefined : (parse(draft) as unknown));
          setDraft(null);
        } catch {
          // Kept as typed; the YAML view will say what is wrong (T141).
        }
      }}
    />
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

  // A list or object the schema describes is its own set of fields.
  if (field.of !== undefined && field.kind === 'object') {
    const inner = (own ?? {}) as Value;
    return (
      <fieldset className="model-field model-field--object">
        <legend>{field.label}</legend>
        <ObjectForm
          section={field.of}
          value={inner}
          onChange={(next) => {
            change(Object.keys(next).length === 0 ? undefined : next);
          }}
        />
      </fieldset>
    );
  }
  if (field.of !== undefined && field.kind === 'list') {
    return (
      <fieldset className="model-field model-field--list">
        <legend>{field.label}</legend>
        <MemberList
          section={field.of}
          items={Array.isArray(own) ? (own as Value[]) : []}
          onChange={change}
        />
      </fieldset>
    );
  }

  return (
    <div className="field model-field" data-key={field.key}>
      <label htmlFor={id}>{field.label}</label>
      <Control field={field} value={own} onChange={change} id={id} />
    </div>
  );
}

/** Every field of an object, its legacy keys set apart in a group of their own. */
export function ObjectForm({
  section,
  value,
  onChange,
  only,
}: {
  section: SectionId;
  value: Value;
  onChange: (next: Value) => void;
  /** Which fields to show; all by default. */
  only?: (field: Field) => boolean;
}) {
  const fields = SCHEMA[section].fields.filter((field) => only?.(field) ?? true);
  const current = fields.filter((field) => field.legacy !== true);
  const legacy = fields.filter((field) => field.legacy === true);
  return (
    <div className="model-form__fields">
      {current.map((field) => (
        <FieldRow key={field.key} field={field} value={value} onChange={onChange} />
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
 * A list of members — each a row showing its name and type, which expands in
 * place into every field it has (direction.md §7b, "Rows").
 */
export function MemberList({
  section,
  items,
  onChange,
}: {
  section: SectionId;
  items: readonly Value[];
  onChange: (next: Value[] | undefined) => void;
}) {
  const title = SCHEMA[section].title;
  return (
    <ul className="model-members" aria-label={`${title}s`}>
      {items.map((item, index) => {
        const name =
          typeof item['name'] === 'string' ? item['name'] : `${title} ${String(index + 1)}`;
        const type = typeof item['type'] === 'string' ? item['type'] : undefined;
        return (
          // Positions, not names: a member's name is one of the fields it edits.
          <li key={index}>
            <details className="model-member">
              <summary>
                <span className="model-member__name">{name}</span>
                {type === undefined ? null : <span className="model-member__type">{type}</span>}
              </summary>
              <ObjectForm
                section={section}
                value={item}
                onChange={(next) => {
                  onChange(items.map((each, at) => (at === index ? next : each)));
                }}
              />
            </details>
          </li>
        );
      })}
    </ul>
  );
}
