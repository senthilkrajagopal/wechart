import { useId } from 'react';

import { DRIVERS, type DriverField, type DriverType, type FieldValue } from '@wechart/core';

/**
 * A data source's connection, for one driver (T363, AC-160): where it
 * connects, then how it signs in, each method with exactly the fields xcube's
 * driver takes (core's `DRIVERS`). A secret is typed here and held only in
 * the form: it is sealed to xcube's key when the form is submitted, never
 * before and never sent as typed (AC-325; `credential-sealing.md` Gotcha 9).
 */
export interface ConnectionValues {
  readonly authMethod: string;
  readonly fields: Readonly<Record<string, FieldValue>>;
  /** As typed, in this form only. */
  readonly secrets: Readonly<Record<string, string>>;
}

/** A new connection's values: each field's default, the first way to sign in. */
export function initialValues(driver: DriverType): ConnectionValues {
  const spec = DRIVERS[driver];
  return {
    authMethod: spec.auth[0]!.id,
    fields: Object.fromEntries(
      spec.connection
        .filter((field) => field.defaultValue !== undefined)
        .map((field) => [field.key, field.defaultValue!]),
    ),
    secrets: {},
  };
}

/** Settings that matter only over TLS: shown, and sent, only with it on. */
const TLS_ONLY = new Set(['sslRejectUnauthorized', 'sslCa']);

/** The connection's fields as the form shows them for these values. */
function connectionShown(driver: DriverType, values: ConnectionValues) {
  const { connection } = DRIVERS[driver];
  const tlsOff = connection.some((field) => field.key === 'ssl') && values.fields['ssl'] !== true;
  return connection.filter((field) => !(tlsOff && TLS_ONLY.has(field.key)));
}

/**
 * The fields sent for these values: those shown, the connection's and the
 * method's own, none blank, and never a secret.
 */
export function fieldsToSend(
  driver: DriverType,
  values: ConnectionValues,
): Record<string, FieldValue> {
  const spec = DRIVERS[driver];
  const method = spec.auth.find((each) => each.id === values.authMethod);
  const offered = [...connectionShown(driver, values), ...(method?.fields ?? [])].filter(
    (field) => !field.secret,
  );
  return Object.fromEntries(
    offered
      .map((field) => [field.key, values.fields[field.key]] as const)
      .filter(([, value]) => value !== undefined && value !== null && value !== ''),
  ) as Record<string, FieldValue>;
}

/** The secrets typed for the chosen method, none blank. */
export function secretsToSeal(driver: DriverType, values: ConnectionValues): [string, string][] {
  const method = DRIVERS[driver].auth.find((each) => each.id === values.authMethod);
  return (method?.fields ?? [])
    .filter((field) => field.secret && (values.secrets[field.key] ?? '') !== '')
    .map((field) => [field.key, values.secrets[field.key]!]);
}

export function ConnectionForm({
  driver,
  values,
  onChange,
  stored = [],
}: {
  driver: DriverType;
  values: ConnectionValues;
  onChange: (values: ConnectionValues) => void;
  /** The secrets already stored for it: said as stored, and not asked for again. */
  stored?: readonly string[];
}) {
  const spec = DRIVERS[driver];
  const method = spec.auth.find((each) => each.id === values.authMethod) ?? spec.auth[0]!;
  const methodId = useId();
  const connection = connectionShown(driver, values);

  const setField = (key: string, value: FieldValue) => {
    onChange({ ...values, fields: { ...values.fields, [key]: value } });
  };
  const setSecret = (key: string, value: string) => {
    onChange({ ...values, secrets: { ...values.secrets, [key]: value } });
  };

  return (
    <div className="connection-form">
      <fieldset className="connection-form__group">
        <legend>Connection</legend>
        {connection.map((field, at) => (
          <Field
            key={field.key}
            field={field}
            value={values.fields[field.key]}
            onField={setField}
            // A host and its port share a row.
            className={
              connection[at + 1]?.kind === 'number' && field.kind === 'text'
                ? 'is-paired'
                : field.kind === 'number' && connection[at - 1]?.kind === 'text'
                  ? 'is-short'
                  : undefined
            }
          />
        ))}
      </fieldset>
      <fieldset className="connection-form__group">
        <legend>Sign in</legend>
        {spec.auth.length > 1 ? (
          <div className="field">
            <label htmlFor={methodId}>Sign in with</label>
            <select
              id={methodId}
              value={method.id}
              onChange={(event) => {
                const authMethod = event.target.value;
                // A client certificate is sent only over TLS (xcube's drivers;
                // T363's hand-on): choosing one turns TLS on.
                const tls =
                  authMethod === 'client-certificate' &&
                  spec.connection.some((field) => field.key === 'ssl');
                onChange({
                  ...values,
                  authMethod,
                  ...(tls ? { fields: { ...values.fields, ssl: true } } : {}),
                });
              }}
            >
              {spec.auth.map((each) => (
                <option key={each.id} value={each.id}>
                  {each.label}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <p className="connection-form__method">{method.label}</p>
        )}
        {method.note === undefined ? null : <p className="connection-form__note">{method.note}</p>}
        {method.fields.map((field) =>
          field.secret ? (
            <SecretField
              key={field.key}
              field={field}
              value={values.secrets[field.key] ?? ''}
              stored={stored.includes(field.key)}
              onSecret={setSecret}
            />
          ) : (
            <Field
              key={field.key}
              field={field}
              value={values.fields[field.key]}
              onField={setField}
            />
          ),
        )}
      </fieldset>
    </div>
  );
}

function Field({
  field,
  value,
  onField,
  className,
}: {
  field: DriverField;
  value: FieldValue | undefined;
  onField: (key: string, value: FieldValue) => void;
  className?: string | undefined;
}) {
  const id = useId();
  const note = field.note === undefined ? undefined : `${id}-note`;
  if (field.kind === 'boolean')
    return (
      <div className="field connection-form__check">
        <label>
          <input
            type="checkbox"
            checked={value === true}
            onChange={(event) => {
              onField(field.key, event.target.checked);
            }}
          />
          {field.label}
        </label>
      </div>
    );
  return (
    <div className={className === undefined ? 'field' : `field ${className}`}>
      <label htmlFor={id}>{field.label}</label>
      {field.kind === 'multiline' ? (
        <textarea
          id={id}
          rows={4}
          spellCheck={false}
          required={field.required}
          value={value === undefined || value === null ? '' : String(value)}
          placeholder={field.placeholder}
          aria-describedby={note}
          onChange={(event) => {
            onField(field.key, event.target.value);
          }}
        />
      ) : (
        <input
          id={id}
          type={field.kind === 'number' ? 'number' : 'text'}
          spellCheck={false}
          autoComplete="off"
          required={field.required}
          value={value === undefined || value === null ? '' : String(value)}
          placeholder={field.placeholder}
          aria-describedby={note}
          onChange={(event) => {
            const typed = event.target.value;
            onField(
              field.key,
              field.kind === 'number' && typed !== '' && Number.isFinite(Number(typed))
                ? Number(typed)
                : typed,
            );
          }}
        />
      )}
      {note === undefined ? null : (
        <span id={note} className="connection-form__note">
          {field.note}
        </span>
      )}
    </div>
  );
}

function SecretField({
  field,
  value,
  stored,
  onSecret,
}: {
  field: DriverField;
  value: string;
  stored: boolean;
  onSecret: (key: string, value: string) => void;
}) {
  const id = useId();
  const hint = `${id}-hint`;
  // A stored one isn't asked for again (AC-164).
  const required = field.required && !stored;
  return (
    <div className="field">
      <label htmlFor={id}>{field.label}</label>
      {field.kind === 'multiline' ? (
        <textarea
          id={id}
          rows={4}
          spellCheck={false}
          autoComplete="off"
          required={required}
          value={value}
          aria-describedby={hint}
          onChange={(event) => {
            onSecret(field.key, event.target.value);
          }}
        />
      ) : (
        <input
          id={id}
          type="password"
          autoComplete="new-password"
          required={required}
          value={value}
          aria-describedby={hint}
          onChange={(event) => {
            onSecret(field.key, event.target.value);
          }}
        />
      )}
      <span id={hint} className="connection-form__note">
        {stored
          ? 'Stored · encrypted. Type it again only to replace it.'
          : 'Encrypted in your browser before it is sent, and never shown again.'}
      </span>
    </div>
  );
}
