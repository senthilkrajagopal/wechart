import { DRIVER_TYPES, DRIVERS, targetKeysOf, type DriverType } from './drivers';

/**
 * What a data source is, before wechart stores one (T335, AC-312, AC-164,
 * AC-298): the rules xcube checks a connection by (research
 * `xcube-overlay-data-sources.md`, "Connection checks"), so wechart never
 * stores a data source xcube would refuse to land (T442).
 *
 * A secret is never a field: it arrives sealed in the browser to xcube's key
 * (T441, AC-325), as an envelope wechart keeps and never opens (AC-298).
 */

export type FieldValue = string | number | boolean | null;

/** A secret sealed to xcube's key, scheme v1 (research `credential-sealing.md`). */
export interface SealedV1 {
  readonly v: 1;
  readonly kid: string;
  readonly enc: string;
  readonly ct: string;
}

export interface DataSourceShape {
  readonly driver: string;
  readonly authMethod: string;
  readonly fields: Readonly<Record<string, FieldValue | undefined>>;
  /** The secrets sent this time; those already stored are named apart. */
  readonly sealed: Readonly<Record<string, SealedV1>>;
}

/**
 * A data source's short name: lower-case letters and digits, words joined by
 * single underscores, as xcube takes it (`SHORT_NAME`, research). A name never
 * holds `__`, so a folder's `<folderId>__<name>` can't be forged.
 */
export const SHORT_NAME = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;

const BASE64URL = /^[A-Za-z0-9_-]+$/;
/** The bytes a base64url text holds, unpadded; -1 where no text of that length is one. */
const bytesOf = (text: unknown): number =>
  typeof text !== 'string' || !BASE64URL.test(text) || text.length % 4 === 1
    ? -1
    : Math.floor((text.length * 3) / 4);
/** A padded plaintext's bucket, and AES-GCM's tag (research credential-sealing.md, "Padding"). */
const BUCKET = 256;
const TAG = 16;
const MAX_CT = 64 * 1024 + TAG;

/**
 * An envelope as xcube takes one (xcube's `connections.ts`, `envelopeProblem`):
 * exactly `v`, `kid`, `enc` and `ct`; a kid of at most 128; `enc` an X25519
 * public key's 32 bytes; `ct` whole 256-byte buckets and a tag. A secret sent
 * as the ciphertext itself is none of these, and is refused (T335's review).
 */
const isEnvelope = (value: unknown): value is SealedV1 => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const envelope = value as Record<string, unknown>;
  if (Object.keys(envelope).sort().join() !== 'ct,enc,kid,v' || envelope['v'] !== 1) return false;
  const { kid, enc, ct } = envelope;
  const sealed = bytesOf(ct);
  return (
    typeof kid === 'string' &&
    kid !== '' &&
    kid.length <= 128 &&
    bytesOf(enc) === 32 &&
    sealed >= BUCKET + TAG &&
    sealed <= MAX_CT &&
    (sealed - TAG) % BUCKET === 0
  );
};

/** xcube's longest field value (`MAX_FIELD`). */
const MAX_FIELD = 64 * 1024;

/**
 * What xcube's driver configs refuse beyond the fields' own rules (xcube's
 * `drivers.ts`): a port that isn't one; Oracle with neither a connect string
 * nor a host and service; Dremio with neither a URL nor a host, or Cloud's
 * URL with a password.
 */
function configProblems(
  driver: DriverType,
  authMethod: string,
  fields: DataSourceShape['fields'],
): string[] {
  const problems: string[] = [];
  const port = fields['port'];
  if (!blank(port)) {
    const number = Number(port);
    if (!Number.isInteger(number) || number < 1 || number > 65535)
      problems.push('port must be a whole number from 1 to 65535.');
  }
  if (
    driver === 'oracle' &&
    blank(fields['connectString']) &&
    (blank(fields['host']) || blank(fields['database']))
  )
    problems.push('Oracle needs a connect string, or a host and a service name.');
  if (driver === 'dremio') {
    if (blank(fields['url']) && blank(fields['host']))
      problems.push('Dremio needs a Cloud project URL, or a Software host.');
    else if (!blank(fields['url']) && authMethod !== 'token')
      problems.push('Dremio Cloud takes a personal access token, not a password.');
  }
  return problems;
}

const blank = (value: unknown) => value === undefined || value === null || value === '';

/**
 * Why a data source can't be stored; none when it can. `stored` names the
 * secrets already held for it, which an update need not send again.
 */
export function dataSourceProblems(
  shape: DataSourceShape,
  stored: readonly string[] = [],
): string[] {
  if (!(DRIVER_TYPES as readonly string[]).includes(shape.driver))
    return [`${shape.driver} isn’t a driver wechart offers.`];
  const spec = DRIVERS[shape.driver as DriverType];
  const method = spec.auth.find((each) => each.id === shape.authMethod);
  if (method === undefined) return [`${shape.authMethod} isn’t a way to sign in to ${spec.label}.`];

  const offered = [...spec.connection, ...method.fields];
  const plain = new Map(
    offered.filter((field) => !field.secret).map((field) => [field.key, field]),
  );
  const secrets = new Map(
    offered.filter((field) => field.secret).map((field) => [field.key, field]),
  );
  const problems: string[] = [];
  const named = `${spec.label} with ${method.label}`;

  for (const [key, value] of Object.entries(shape.fields)) {
    if (secrets.has(key)) problems.push(`${key} is a secret: send it sealed, never as a field.`);
    else if (!plain.has(key)) problems.push(`${key} isn’t a field of ${named}.`);
    else if (typeof value === 'string' && value.length > MAX_FIELD)
      problems.push(`${key} is too long: at most ${String(MAX_FIELD)} characters.`);
  }
  for (const [key, value] of Object.entries(shape.sealed)) {
    if (!secrets.has(key)) problems.push(`${key} isn’t a secret of ${named}.`);
    else if (!isEnvelope(value))
      problems.push(`${key} isn’t a sealed secret: { v: 1, kid, enc, ct }.`);
  }
  for (const [key, field] of plain)
    if (field.required && blank(shape.fields[key])) problems.push(`${key} is required.`);
  for (const [key, field] of secrets)
    if (field.required && shape.sealed[key] === undefined && !stored.includes(key))
      problems.push(`${key} is required.`);
  return [
    ...problems,
    ...configProblems(shape.driver as DriverType, shape.authMethod, shape.fields),
  ];
}

/** A value as a sealed secret's binding reads it: `String(v)`, and `""` when absent. */
const asBound = (value: unknown) => (value === undefined || value === null ? '' : String(value));

/**
 * The target fields that differ between two versions of a data source's
 * fields (AC-312): a secret sealed for the one won't open for the other, so it
 * must be entered again.
 */
export function targetChanges(
  driver: DriverType,
  before: Readonly<Record<string, unknown>>,
  after: Readonly<Record<string, unknown>>,
): string[] {
  return targetKeysOf(driver).filter((key) => asBound(before[key]) !== asBound(after[key]));
}
