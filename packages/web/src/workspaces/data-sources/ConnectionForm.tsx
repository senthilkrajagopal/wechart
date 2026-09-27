import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';

import {
  DRIVERS,
  type AuthMethod,
  type DriverField,
  type DriverType,
  type FieldValue,
} from '@wechart/core';

import { StatusIcon } from '../../shell/StatusIcon';

/**
 * A data source's connection, for one driver (T363, T471; AC-160, AC-312;
 * design 02, "Driver forms"): the same three groups for every driver — where
 * it connects, how it signs in, TLS — with exactly the fields xcube's driver
 * takes (core's `DRIVERS`). Where a driver takes one shape of connection or
 * another — Dremio Cloud or Software, Oracle's connect string or host and
 * service name — the form asks which first and shows only that shape's
 * fields. A secret is typed here and held only in the form: it is sealed to
 * xcube's key when the form is submitted, never before and never sent as
 * typed (AC-325; `credential-sealing.md` Gotcha 9).
 */
export interface ConnectionValues {
  readonly authMethod: string;
  /** Which shape of connection, for a driver that takes one of two (design 02). */
  readonly shape?: string | undefined;
  readonly fields: Readonly<Record<string, FieldValue>>;
  /** As typed, in this form only. */
  readonly secrets: Readonly<Record<string, string>>;
}

/** One shape of a driver's connection: the fields it takes, and how it signs in. */
interface Shape {
  readonly id: string;
  readonly label: string;
  /** What the shape takes, said on its card. */
  readonly description?: string;
  readonly fields: readonly string[];
  /** Of the fields, those it can't go without (xcube needs one shape or the other). */
  readonly requires: readonly string[];
  /** Its ways to sign in, where it has fewer than the driver. */
  readonly methods?: readonly string[];
}

/**
 * The either/or shapes (research `xcube-slice-6.md`: "oracle needs
 * connectString, or host and database"; "dremio needs url or host, and a url
 * takes only token"), asked first — as cards where each needs saying, as a
 * segmented choice where the names say enough.
 */
const SHAPES: Partial<
  Record<
    DriverType,
    {
      readonly question: string;
      readonly as: 'cards' | 'segmented';
      readonly shapes: readonly Shape[];
    }
  >
> = {
  dremio: {
    question: 'Which Dremio?',
    as: 'cards',
    shapes: [
      {
        id: 'cloud',
        label: 'Dremio Cloud',
        description: 'A project’s API URL. Signs in with a personal access token.',
        fields: ['url', 'database'],
        requires: ['url'],
        methods: ['token'],
      },
      {
        id: 'software',
        label: 'Dremio Software',
        description: 'Your server’s host and port. A token, or a user and password.',
        fields: ['host', 'port', 'ssl', 'database'],
        requires: ['host'],
      },
    ],
  },
  oracle: {
    question: 'Connect with',
    as: 'segmented',
    shapes: [
      {
        id: 'connect-string',
        label: 'Connect string',
        fields: ['connectString'],
        requires: ['connectString'],
      },
      {
        id: 'host',
        label: 'Host and service name',
        fields: ['host', 'port', 'database'],
        requires: ['host', 'database'],
      },
    ],
  },
};

/** Labels the shapes make simpler: "Host (Dremio Software)" is "Host" once Software is chosen. */
const LABELS: Partial<Record<DriverType, Readonly<Record<string, string>>>> = {
  dremio: { url: 'Project URL', host: 'Host', ssl: 'Use HTTPS' },
  // Under "Service-account key", stated as its way to sign in (design 02, H).
  bigquery: { credentials: 'Key (JSON)' },
};

/** Said under a field whose shape needs saying (design 02, state L). */
const HINTS: Partial<Record<DriverType, Readonly<Record<string, string>>>> = {
  oracle: { connectString: 'host:1521/service, or a tcps:// descriptor.' },
};

/** A way to sign in named for what it asks, where its name alone would say less. */
const METHOD_LABELS: Partial<Record<DriverType, Readonly<Record<string, string>>>> = {
  redshift: { password: 'User and password' },
  oracle: { password: 'User and password' },
  dremio: { password: 'User and password' },
};

/** Said beside a method stated rather than offered. */
const METHOD_ASIDES: Partial<Record<DriverType, Readonly<Record<string, string>>>> = {
  redshift: { password: 'IAM sign-in can’t be set per data source' },
};

/**
 * Notes the form says otherwise: a client certificate's "sent only over TLS"
 * is the locked switch's reason, and Dremio's "Software only" is the shape.
 */
const NOTE_SAID_ELSEWHERE = new Set(['client-certificate', 'dremio:password']);

/** The fields of the TLS group; every other connection field says where it connects. */
const TLS_KEYS = new Set([
  'ssl',
  'sslRejectUnauthorized',
  'sslCa',
  'encrypt',
  'trustServerCertificate',
]);

/** Settings that matter only over TLS: shown, and sent, only with it on. */
const TLS_ONLY = new Set(['sslRejectUnauthorized', 'sslCa']);

/** Each driver's TLS default, said under its switch (xcube's config and each database's own). */
const TLS_HELP: Partial<Record<DriverType, Readonly<Record<string, string>>>> = {
  postgres: {
    ssl: 'On by default for PostgreSQL. Turn off only for a database that doesn’t offer TLS.',
  },
  redshift: { ssl: 'On by default for Redshift.' },
  mysql: { ssl: 'Off by default for MySQL. Turn on if the server offers TLS.' },
  mssql: { encrypt: 'Off by default, as Cube’s SQL Server driver has it.' },
  dremio: { ssl: 'Off by default, as in Cube’s Dremio driver. There are no certificate settings.' },
};
const VERIFY_HELP = 'Checked against the usual certificate authorities, or a CA you add.';
const LOCKED_HELP = 'On, because a client certificate is sent only over TLS.';

/** A shape with no TLS field of its own, where TLS still needs saying. */
const TLS_WITHOUT_SWITCH: Partial<Record<string, string>> = {
  'dremio:cloud':
    'Dremio Cloud uses TLS when the project URL starts with https://. Cube’s Dremio driver has no certificate settings.',
};

/** Fields that share a row: the first wide, the second short. */
const PAIRS: Readonly<Record<string, string>> = {
  host: 'port',
  account: 'region',
  warehouse: 'role',
  projectId: 'location',
};
const SECOND_OF_PAIR = new Set(Object.values(PAIRS));

export const SECRETS_SEALED =
  'Secrets are encrypted in your browser before they are sent, and are never shown again.';

const shapesOf = (driver: DriverType) => SHAPES[driver];

function shapeOf(driver: DriverType, values: ConnectionValues): Shape | undefined {
  const shapes = shapesOf(driver)?.shapes;
  return shapes?.find((shape) => shape.id === values.shape) ?? shapes?.[0];
}

/** The ways to sign in the chosen shape offers. */
export function methodsOf(driver: DriverType, values: ConnectionValues): readonly AuthMethod[] {
  const allowed = shapeOf(driver, values)?.methods;
  const all = DRIVERS[driver].auth;
  return allowed === undefined ? all : all.filter((method) => allowed.includes(method.id));
}

function methodOf(driver: DriverType, values: ConnectionValues): AuthMethod {
  const offered = methodsOf(driver, values);
  return offered.find((method) => method.id === values.authMethod) ?? offered[0]!;
}

/** A method's name, as the form says it. */
export function methodLabel(driver: DriverType, method: AuthMethod): string {
  return METHOD_LABELS[driver]?.[method.id] ?? method.label;
}

/** A field's name, as the form says it. */
export function fieldLabel(driver: DriverType, field: DriverField): string {
  return LABELS[driver]?.[field.key] ?? field.label;
}

/** A new connection's values: each field's default, the first shape, its first way to sign in. */
export function initialValues(driver: DriverType): ConnectionValues {
  const spec = DRIVERS[driver];
  const shape = shapesOf(driver)?.shapes[0];
  const start = { authMethod: spec.auth[0]!.id, shape: shape?.id, fields: {}, secrets: {} };
  return {
    ...start,
    authMethod: methodsOf(driver, start)[0]!.id,
    fields: Object.fromEntries(
      spec.connection
        .filter((field) => field.defaultValue !== undefined)
        .map((field) => [field.key, field.defaultValue!]),
    ),
  };
}

/** The connection's fields as the form shows them for these values: the shape's, TLS's with TLS on. */
function connectionShown(driver: DriverType, values: ConnectionValues): DriverField[] {
  const { connection } = DRIVERS[driver];
  const shape = shapeOf(driver, values);
  const tlsOff = connection.some((field) => field.key === 'ssl') && values.fields['ssl'] !== true;
  return connection
    .filter((field) => shape === undefined || shape.fields.includes(field.key))
    .filter((field) => !(tlsOff && TLS_ONLY.has(field.key)));
}

/** Whether a field must be filled: the driver's say, or the shape's. */
const isRequired = (driver: DriverType, values: ConnectionValues, field: DriverField) =>
  field.required || (shapeOf(driver, values)?.requires.includes(field.key) ?? false);

/**
 * The fields sent for these values: those shown, the connection's and the
 * method's own, none blank, and never a secret. A field typed for the other
 * shape is not sent (design 02, pin 2).
 */
export function fieldsToSend(
  driver: DriverType,
  values: ConnectionValues,
): Record<string, FieldValue> {
  const method = methodOf(driver, values);
  const offered = [...connectionShown(driver, values), ...method.fields].filter(
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
  return methodOf(driver, values)
    .fields.filter((field) => field.secret && (values.secrets[field.key] ?? '') !== '')
    .map((field) => [field.key, values.secrets[field.key]!]);
}

/**
 * The required fields left empty, secrets included unless stored, of the
 * shape and method chosen, in the form's order (design 01, state B).
 */
export function missingOf(
  driver: DriverType,
  values: ConnectionValues,
  stored: readonly string[] = [],
): DriverField[] {
  const empty = (field: DriverField) =>
    field.secret
      ? !stored.includes(field.key) && (values.secrets[field.key] ?? '') === ''
      : field.kind !== 'boolean' &&
        (values.fields[field.key] === undefined || String(values.fields[field.key]) === '');
  return [...connectionShown(driver, values), ...methodOf(driver, values).fields].filter(
    (field) => isRequired(driver, values, field) && empty(field),
  );
}

/** The service account a pasted BigQuery key is for, read in the browser (AC-340). */
function clientEmailOf(key: string): string | undefined {
  try {
    const parsed = JSON.parse(key) as unknown;
    const email =
      typeof parsed === 'object' && parsed !== null
        ? (parsed as { client_email?: unknown }).client_email
        : undefined;
    return typeof email === 'string' && email !== '' ? email : undefined;
  } catch {
    return undefined;
  }
}

/** A Dremio Cloud URL the token would travel over unencrypted (AC-339). */
const plainHttp = (value: FieldValue | undefined) =>
  typeof value === 'string' && /^http:\/\//i.test(value.trim());

export function ConnectionForm({
  driver,
  values,
  onChange,
  stored = [],
  invalid = [],
}: {
  driver: DriverType;
  values: ConnectionValues;
  onChange: (values: ConnectionValues) => void;
  /** The secrets already stored for it: said as stored, and not asked for again. */
  stored?: readonly string[];
  /** Required fields found empty, marked and said (design 01, state B). */
  invalid?: readonly string[];
}) {
  const spec = DRIVERS[driver];
  const shapes = shapesOf(driver);
  const shape = shapeOf(driver, values);
  const methods = methodsOf(driver, values);
  const method = methodOf(driver, values);
  const connection = connectionShown(driver, values);
  const where = connection.filter((field) => !TLS_KEYS.has(field.key));
  const tls = connection.filter((field) => TLS_KEYS.has(field.key));
  const tlsNote = shape === undefined ? undefined : TLS_WITHOUT_SWITCH[`${driver}:${shape.id}`];
  const locked = method.id === 'client-certificate' && spec.connection.some((f) => f.key === 'ssl');
  const [caAsked, setCaAsked] = useState(false);
  const ids = useId();

  const setField = (key: string, value: FieldValue) => {
    onChange({ ...values, fields: { ...values.fields, [key]: value } });
  };
  const setSecret = (key: string, value: string) => {
    onChange({ ...values, secrets: { ...values.secrets, [key]: value } });
  };
  const chooseMethod = (authMethod: string) => {
    // The one chosen already changes nothing, and forgets no test (T471's review).
    if (authMethod === method.id) return;
    // A client certificate is sent only over TLS (xcube's drivers): choosing
    // one turns TLS on, and the switch stays on while it is chosen.
    const on = authMethod === 'client-certificate' && spec.connection.some((f) => f.key === 'ssl');
    onChange({ ...values, authMethod, ...(on ? { fields: { ...values.fields, ssl: true } } : {}) });
  };
  const chooseShape = (id: string) => {
    if (id === shape?.id) return;
    const next = { ...values, shape: id };
    // What was typed in fields both shapes share is kept; a way to sign in
    // the new shape doesn't offer gives way to its first.
    const offered = methodsOf(driver, next);
    onChange(
      offered.some((each) => each.id === values.authMethod)
        ? next
        : { ...next, authMethod: offered[0]!.id },
    );
  };

  const fieldProps = (field: DriverField) => ({
    driver,
    field,
    required: isRequired(driver, values, field),
    invalid: invalid.includes(field.key),
  });

  /** The fields of a group, a pair on one row. */
  const rows = (fields: readonly DriverField[], render: (field: DriverField) => ReactNode) =>
    fields.map((field) => {
      if (SECOND_OF_PAIR.has(field.key) && fields.some((each) => PAIRS[each.key] === field.key))
        return null;
      const second = fields.find((each) => each.key === PAIRS[field.key]);
      return second === undefined ? (
        render(field)
      ) : (
        <div key={field.key} className="connection-form__pair">
          {render(field)}
          {render(second)}
        </div>
      );
    });

  const plainField = (field: DriverField) => (
    <Field
      key={field.key}
      {...fieldProps(field)}
      short={SECOND_OF_PAIR.has(field.key)}
      value={values.fields[field.key]}
      onField={setField}
      warning={
        driver === 'dremio' && field.key === 'url' && plainHttp(values.fields['url'])
          ? 'This URL starts with http://, so the token would travel unencrypted. Use https://.'
          : undefined
      }
    />
  );

  return (
    <div className="connection-form">
      {shapes === undefined || shapes.as !== 'cards' ? null : (
        <div className="connection-form__group">
          <h3 id={`${ids}-shape`} className="connection-form__legend">
            {shapes.question}
          </h3>
          <Choice
            labelledBy={`${ids}-shape`}
            as="cards"
            options={shapes.shapes.map((each) => ({
              id: each.id,
              label: each.label,
              description: each.description,
            }))}
            chosen={shape?.id}
            onChoose={chooseShape}
          />
        </div>
      )}

      <fieldset className="connection-form__group" data-group="where">
        <legend className="connection-form__legend">Where it connects</legend>
        {shapes === undefined || shapes.as !== 'segmented' ? null : (
          <Choice
            label={shapes.question}
            as="segmented"
            options={shapes.shapes.map((each) => ({ id: each.id, label: each.label }))}
            chosen={shape?.id}
            onChoose={chooseShape}
          />
        )}
        {rows(where, plainField)}
      </fieldset>

      <fieldset className="connection-form__group" data-group="sign-in">
        <legend className="connection-form__legend">How it signs in</legend>
        {methods.length > 1 ? (
          <Choice
            label="Sign in with"
            as={methods.length === 2 ? 'segmented' : 'rows'}
            options={methods.map((each) => ({ id: each.id, label: methodLabel(driver, each) }))}
            chosen={method.id}
            onChoose={chooseMethod}
          />
        ) : (
          <p className="connection-form__method">
            <span>{methodLabel(driver, method)}</span>
            {METHOD_ASIDES[driver]?.[method.id] === undefined ? null : (
              <span className="connection-form__aside">
                {' · '}
                {METHOD_ASIDES[driver]?.[method.id]}
              </span>
            )}
            {shape?.methods?.length === 1 ? (
              <span className="connection-form__aside">
                {' · '}the only way {shape.label} signs in
              </span>
            ) : null}
          </p>
        )}
        {method.note === undefined ||
        NOTE_SAID_ELSEWHERE.has(method.id) ||
        NOTE_SAID_ELSEWHERE.has(`${driver}:${method.id}`) ? null : (
          <p className="connection-form__caution">
            <StatusIcon kind="warn" />
            {method.note}
          </p>
        )}
        {rows(method.fields, (field) =>
          field.secret ? (
            <SecretField
              key={field.key}
              {...fieldProps(field)}
              value={values.secrets[field.key] ?? ''}
              stored={stored.includes(field.key)}
              onSecret={setSecret}
            />
          ) : (
            plainField(field)
          ),
        )}
        {method.fields.some((field) => field.secret) ? (
          <p className="connection-form__sealed">{SECRETS_SEALED}</p>
        ) : null}
      </fieldset>

      {tls.length === 0 && tlsNote === undefined ? null : (
        <fieldset className="connection-form__group">
          <legend className="connection-form__legend">TLS</legend>
          {tlsNote === undefined ? null : <p className="connection-form__note">{tlsNote}</p>}
          {tls.map((field) =>
            field.kind === 'boolean' ? (
              <Switch
                key={field.key}
                label={fieldLabel(driver, field)}
                checked={field.key === 'ssl' && locked ? true : values.fields[field.key] === true}
                disabled={field.key === 'ssl' && locked}
                help={
                  field.key === 'ssl' && locked
                    ? LOCKED_HELP
                    : field.key === 'sslRejectUnauthorized'
                      ? VERIFY_HELP
                      : TLS_HELP[driver]?.[field.key]
                }
                onChange={(checked) => {
                  setField(field.key, checked);
                }}
              />
            ) : field.key === 'sslCa' && !caAsked && (values.fields['sslCa'] ?? '') === '' ? (
              <button
                key={field.key}
                type="button"
                className="link-button connection-form__add"
                onClick={() => {
                  setCaAsked(true);
                }}
              >
                <span aria-hidden="true">+ </span>Add a CA certificate (PEM)
              </button>
            ) : (
              plainField(field)
            ),
          )}
        </fieldset>
      )}
    </div>
  );
}

/** A field's label, saying in words whether it is required (design 01, pin 4). */
function Label({
  htmlFor,
  text,
  required,
  optional,
}: {
  htmlFor: string;
  text: string;
  required: boolean;
  optional: boolean;
}) {
  return (
    <label htmlFor={htmlFor}>
      <span>{text}</span>
      {required ? (
        <span className="field__req"> · required</span>
      ) : optional ? (
        <span className="field__req"> · optional</span>
      ) : null}
    </label>
  );
}

/** Said under a field that is required and empty. */
const missingText = (driver: DriverType, field: DriverField) =>
  `Enter the ${fieldLabel(driver, field)
    .replace(/ \(.*\)$/, '')
    .toLowerCase()}.`;

function Field({
  driver,
  field,
  value,
  onField,
  required,
  invalid,
  short,
  warning,
}: {
  driver: DriverType;
  field: DriverField;
  value: FieldValue | undefined;
  onField: (key: string, value: FieldValue) => void;
  required: boolean;
  invalid: boolean;
  short: boolean;
  warning?: string | undefined;
}) {
  const id = useId();
  const hint = field.note ?? HINTS[driver]?.[field.key];
  const described = [
    hint === undefined ? undefined : `${id}-note`,
    invalid ? `${id}-error` : undefined,
    warning === undefined ? undefined : `${id}-warning`,
  ]
    .filter((each) => each !== undefined)
    .join(' ');
  const shared = {
    id,
    spellCheck: false,
    required,
    // An example in the field, unless the hint under it says the same.
    placeholder: hint === undefined ? field.placeholder : undefined,
    'aria-invalid': invalid ? true : undefined,
    'aria-describedby': described === '' ? undefined : described,
    value: value === undefined || value === null ? '' : String(value),
  };
  return (
    <div className={short ? 'field is-short' : 'field'}>
      <Label
        htmlFor={id}
        text={fieldLabel(driver, field)}
        required={required}
        optional={!required && !short && field.defaultValue === undefined}
      />
      {field.kind === 'multiline' ? (
        <textarea
          {...shared}
          rows={4}
          className="is-code"
          onChange={(event) => {
            onField(field.key, event.target.value);
          }}
        />
      ) : (
        <input
          {...shared}
          type={field.kind === 'number' ? 'number' : 'text'}
          autoComplete="off"
          className={field.kind === 'number' ? undefined : 'is-code'}
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
      {invalid ? (
        <span id={`${id}-error`} className="field__error">
          <StatusIcon kind="err" />
          {missingText(driver, field)}
        </span>
      ) : null}
      {warning === undefined ? null : (
        <span id={`${id}-warning`} className="field__warning">
          <StatusIcon kind="warn" />
          {warning}
        </span>
      )}
      {hint === undefined ? null : (
        <span id={`${id}-note`} className="connection-form__note">
          {hint}
        </span>
      )}
    </div>
  );
}

function SecretField({
  driver,
  field,
  value,
  stored,
  onSecret,
  required,
  invalid,
}: {
  driver: DriverType;
  field: DriverField;
  value: string;
  stored: boolean;
  onSecret: (key: string, value: string) => void;
  required: boolean;
  invalid: boolean;
}) {
  const id = useId();
  // A pasted key is said by its length once pasted, never shown (design 02).
  const [pasting, setPasting] = useState(false);
  const pasted = useRef(false);
  const box = useRef<HTMLTextAreaElement>(null);
  const replace = useRef<HTMLButtonElement>(null);
  /** Where focus goes once the field has changed shape under it: never dropped to the page. */
  const focusNext = useRef<'box' | 'replace' | null>(null);
  useEffect(() => {
    const next = focusNext.current;
    if (next === null) return;
    focusNext.current = null;
    (next === 'box' ? box : replace).current?.focus();
  });
  // A stored one isn't asked for again (AC-164).
  const needed = required && !stored;
  const label = fieldLabel(driver, field);
  const email =
    driver === 'bigquery' && field.key === 'credentials' ? clientEmailOf(value) : undefined;
  const described = [stored ? `${id}-stored` : undefined, invalid ? `${id}-error` : undefined]
    .filter((each) => each !== undefined)
    .join(' ');
  const shared = {
    id,
    autoComplete: 'off',
    spellCheck: false,
    required: needed,
    'aria-invalid': invalid ? true : undefined,
    'aria-describedby': described === '' ? undefined : described,
  };
  return (
    <div className="field">
      <Label htmlFor={id} text={label} required={needed} optional={!field.required} />
      {field.kind === 'multiline' ? (
        value !== '' && !pasting ? (
          <div className="secret-pasted" id={id} aria-label={label}>
            <span className="secret-pasted__lock" aria-hidden="true" />
            <span>Pasted · {value.length.toLocaleString('en-US')} characters</span>
            <button
              ref={replace}
              type="button"
              className="link-button"
              aria-label={`Replace the ${label.charAt(0).toLowerCase()}${label.slice(1)}`}
              onClick={() => {
                onSecret(field.key, '');
                setPasting(true);
                focusNext.current = 'box';
              }}
            >
              Replace
            </button>
          </div>
        ) : (
          <textarea
            {...shared}
            ref={box}
            rows={4}
            className="is-code is-secret"
            value={value}
            onFocus={() => {
              setPasting(true);
            }}
            onBlur={() => {
              setPasting(false);
            }}
            onPaste={() => {
              pasted.current = true;
            }}
            onChange={(event) => {
              onSecret(field.key, event.target.value);
              // Pasted, it is said by its length at once, not left on screen
              // until the field is left (T471's review); focus stays on it.
              if (pasted.current && event.target.value !== '') {
                pasted.current = false;
                setPasting(false);
                focusNext.current = 'replace';
              }
            }}
          />
        )
      ) : (
        <span className="secret-input">
          <span className="secret-pasted__lock" aria-hidden="true" />
          <input
            {...shared}
            type="password"
            autoComplete="new-password"
            value={value}
            onChange={(event) => {
              onSecret(field.key, event.target.value);
            }}
          />
        </span>
      )}
      {invalid ? (
        <span id={`${id}-error`} className="field__error">
          <StatusIcon kind="err" />
          {missingText(driver, field)}
        </span>
      ) : null}
      {stored ? (
        <span id={`${id}-stored`} className="connection-form__note">
          Stored · encrypted. Type it again only to replace it.
        </span>
      ) : null}
      {driver === 'bigquery' && field.key === 'credentials' ? (
        <span className="connection-form__note">
          A service_account key file’s JSON, holding client_email and private_key.
        </span>
      ) : null}
      {email === undefined ? null : (
        <p className="connection-form__info" role="status">
          <StatusIcon kind="idle" />
          Key for {email}
        </p>
      )}
    </div>
  );
}

/** A boolean as the prototype's .switch: its words beside it, its default under. */
function Switch({
  label,
  checked,
  disabled = false,
  help,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  help?: string | undefined;
  onChange: (checked: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="switch-row">
      <input
        id={id}
        type="checkbox"
        role="switch"
        className="switch"
        checked={checked}
        disabled={disabled}
        aria-describedby={help === undefined ? undefined : `${id}-help`}
        onChange={(event) => {
          onChange(event.target.checked);
        }}
      />
      <label htmlFor={id}>{label}</label>
      {help === undefined ? null : (
        <span id={`${id}-help`} className="switch-row__help">
          {help}
        </span>
      )}
    </div>
  );
}

/**
 * One choice of two or three, each option seen at once (design 02, pins 1
 * and 3): a segmented control, rows, or cards that say what each means. A
 * radio group to assistive technology, its arrows moving the choice.
 */
function Choice({
  label,
  labelledBy,
  as,
  options,
  chosen,
  onChoose,
}: {
  label?: string;
  labelledBy?: string;
  as: 'segmented' | 'rows' | 'cards';
  options: readonly { id: string; label: string; description?: string | undefined }[];
  chosen: string | undefined;
  onChoose: (id: string) => void;
}) {
  /** The arrows move the choice, and focus with it, as a radio group's do. */
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const step =
      event.key === 'ArrowRight' || event.key === 'ArrowDown'
        ? 1
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
          ? -1
          : 0;
    if (step === 0) return;
    event.preventDefault();
    const at = options.findIndex((option) => option.id === chosen);
    const next = options[(at + step + options.length) % options.length]!;
    onChoose(next.id);
    event.currentTarget.parentElement
      ?.querySelector<HTMLElement>(`[data-choice="${CSS.escape(next.id)}"]`)
      ?.focus();
  };
  return (
    <div
      role="radiogroup"
      aria-label={label}
      aria-labelledby={labelledBy}
      className={`choice choice--${as}`}
    >
      {options.map((option) => {
        const on = option.id === chosen;
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on || (chosen === undefined && option === options[0]) ? 0 : -1}
            data-choice={option.id}
            className="choice__option"
            onKeyDown={onKeyDown}
            onClick={() => {
              onChoose(option.id);
            }}
          >
            {as === 'segmented' ? (
              option.label
            ) : (
              <>
                <span className="choice__mark" aria-hidden="true" />
                <span className="choice__text">
                  <span className="choice__label">{option.label}</span>
                  {option.description === undefined ? null : (
                    <span className="choice__description">{option.description}</span>
                  )}
                </span>
              </>
            )}
          </button>
        );
      })}
    </div>
  );
}
