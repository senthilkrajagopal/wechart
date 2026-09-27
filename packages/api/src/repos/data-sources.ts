import { randomUUID } from 'node:crypto';

import {
  dataSourceProblems,
  DRIVER_TYPES,
  DRIVERS,
  SHORT_NAME,
  targetChanges,
  type DriverType,
  type FieldValue,
  type SealedV1,
} from '@wechart/core';
import type { Kysely } from 'kysely';

import type { Database } from '../db/schema';

/**
 * Data sources as folder items (T335; AC-269, AC-164, AC-298, AC-312, AC-161,
 * AC-270): each one's driver, how it signs in, its fields, and its secrets as
 * the envelopes the browser sealed to xcube's key (T441), which wechart keeps
 * and never opens (AC-298). What this gives back names a secret as stored and
 * never holds it out; the envelopes leave only for xcube (`sealedOf`, T442).
 *
 * It refuses what xcube would refuse to land (core's `dataSourceProblems`),
 * and, when where a data source connects changes, the secrets sealed for the
 * old target (AC-312): they would no longer open, so they are entered again.
 */
export interface DataSource {
  readonly id: string;
  readonly folderId: string;
  readonly name: string;
  readonly driver: DriverType;
  readonly authMethod: string;
  readonly fields: Readonly<Record<string, FieldValue>>;
  /** The secrets it holds, by field, in its sign-in method's order. */
  readonly secrets: readonly string[];
  readonly version: number;
  readonly updatedAt: Date;
}

export interface NewDataSource {
  readonly folderId: string;
  readonly name: string;
  readonly driver: string;
  readonly authMethod: string;
  readonly fields: Readonly<Record<string, FieldValue>>;
  readonly sealed: Readonly<Record<string, SealedV1>>;
}

export interface DataSourceChange {
  readonly name?: string;
  /** Refused unless it is the one stored (AC-161). */
  readonly driver?: string;
  readonly authMethod?: string;
  /** The whole set, replacing what is stored. */
  readonly fields?: Readonly<Record<string, FieldValue>>;
  /** Secrets sealed anew; the others stay, where the target hasn't changed. */
  readonly sealed?: Readonly<Record<string, SealedV1>>;
}

/** Why a data source wasn't stored: a status for the API to answer with, and each problem. */
export class DataSourceRefused extends Error {
  constructor(
    readonly status: 400 | 404 | 409 | 422,
    message: string,
    readonly problems: readonly string[] = [message],
  ) {
    super(message);
    this.name = 'DataSourceRefused';
  }
}

export interface DataSourceStore {
  inFolder(folderId: string): Promise<DataSource[]>;
  all(): Promise<DataSource[]>;
  get(id: string): Promise<DataSource | undefined>;
  create(input: NewDataSource): Promise<DataSource>;
  update(id: string, change: DataSourceChange): Promise<DataSource>;
  remove(id: string): Promise<boolean>;
  /** Its envelopes and their revisions: for xcube alone (T442), never the browser. */
  sealedOf(id: string): Promise<{
    readonly sealed: Readonly<Record<string, SealedV1>>;
    readonly revisions: Readonly<Record<string, string>>;
  }>;
}

const MAX_NAME = 64;

function checkName(name: string): void {
  if (name.length > MAX_NAME || !SHORT_NAME.test(name))
    throw new DataSourceRefused(
      400,
      `A data source’s name is lower-case letters and digits, words joined by single underscores, at most ${String(MAX_NAME)} characters: ${JSON.stringify(name)} isn’t.`,
    );
}

function checkShape(
  shape: {
    driver: string;
    authMethod: string;
    fields: NewDataSource['fields'];
    sealed: NewDataSource['sealed'];
  },
  stored: readonly string[] = [],
): void {
  const problems = dataSourceProblems(shape, stored);
  if (problems.length > 0) throw new DataSourceRefused(400, problems.join(' '), problems);
}

type Row = {
  id: string;
  folder_id: string;
  name: string;
  type: string;
  auth_method: string;
  settings: Record<string, unknown>;
  version: number;
  updated_at: Date;
};

export function dataSourceStore(
  db: Kysely<Database>,
  {
    kid,
  }: {
    /**
     * The id of xcube's key wechart gives the browser (T333): an envelope
     * sealed to any other would never open for xcube (research
     * credential-sealing.md, "Input checks"). Unset in tests that don't care.
     */
    readonly kid?: string;
  } = {},
): DataSourceStore {
  /** Envelopes sealed to another key, refused. */
  const checkKeys = (sealed: Readonly<Record<string, SealedV1>>) => {
    if (kid === undefined) return;
    const problems = Object.entries(sealed)
      .filter(([, envelope]) => envelope.kid !== kid)
      .map(
        ([field, envelope]) =>
          `${field} is sealed to key ${envelope.kid}, not xcube’s ${kid}: seal it again.`,
      );
    if (problems.length > 0) throw new DataSourceRefused(400, problems.join(' '), problems);
  };
  const secretsOf = async (ids: readonly string[]) => {
    if (ids.length === 0) return new Map<string, string[]>();
    const rows = await db
      .selectFrom('data_source_secrets')
      .select(['data_source_id', 'field'])
      .where('data_source_id', 'in', [...ids])
      .execute();
    const byId = new Map<string, string[]>();
    for (const row of rows)
      byId.set(row.data_source_id, [...(byId.get(row.data_source_id) ?? []), row.field]);
    return byId;
  };
  /** In its sign-in method's order, so a listing reads as its form does. */
  const ordered = (row: Row, fields: readonly string[]) => {
    const method = DRIVERS[row.type as DriverType]?.auth.find(
      (each) => each.id === row.auth_method,
    );
    const order = method?.fields.map((field) => field.key) ?? [];
    return [...fields].sort((a, b) => order.indexOf(a) - order.indexOf(b));
  };
  const toSource = (row: Row, secrets: readonly string[]): DataSource => ({
    id: row.id,
    folderId: row.folder_id,
    name: row.name,
    driver: row.type as DriverType,
    authMethod: row.auth_method,
    fields: row.settings as Record<string, FieldValue>,
    secrets: ordered(row, secrets),
    version: row.version,
    updatedAt: row.updated_at,
  });
  const select = () =>
    db
      .selectFrom('data_sources')
      .select([
        'id',
        'folder_id',
        'name',
        'type',
        'auth_method',
        'settings',
        'version',
        'updated_at',
      ]);
  const withSecrets = async (rows: Row[]) => {
    const secrets = await secretsOf(rows.map((row) => row.id));
    return rows.map((row) => toSource(row, secrets.get(row.id) ?? []));
  };
  /** A name the folder already holds, said as AC-270 has it. */
  const taken = (error: unknown, name: string) =>
    (error as { code?: string } | null)?.code === '23505'
      ? new DataSourceRefused(409, `This folder already has a data source named ${name}.`)
      : error;

  const store: DataSourceStore = {
    async inFolder(folderId) {
      return withSecrets(
        (await select().where('folder_id', '=', folderId).orderBy('name').execute()) as Row[],
      );
    },

    async all() {
      return withSecrets((await select().orderBy('folder_id').orderBy('name').execute()) as Row[]);
    },

    async get(id) {
      const row = (await select().where('id', '=', id).executeTakeFirst()) as Row | undefined;
      return row === undefined ? undefined : (await withSecrets([row]))[0];
    },

    async create(input) {
      checkName(input.name);
      checkShape(input);
      checkKeys(input.sealed);
      const id = `ds-${randomUUID()}`;
      try {
        await db.transaction().execute(async (tx) => {
          await tx
            .insertInto('data_sources')
            .values({
              id,
              folder_id: input.folderId,
              name: input.name,
              type: input.driver,
              auth_method: input.authMethod,
              settings: JSON.stringify(input.fields),
            })
            .execute();
          await putSecrets(tx, id, input.sealed);
        });
      } catch (error) {
        throw taken(error, input.name);
      }
      return (await store.get(id))!;
    },

    async update(id, change) {
      const current = await store.get(id);
      if (current === undefined) throw new DataSourceRefused(404, 'There’s no such data source.');
      if (change.driver !== undefined && change.driver !== current.driver) {
        const named = (DRIVER_TYPES as readonly string[]).includes(change.driver)
          ? DRIVERS[change.driver as DriverType].label
          : change.driver;
        throw new DataSourceRefused(
          409,
          `A data source’s type never changes: make a new data source for ${named}.`,
        );
      }
      const name = change.name ?? current.name;
      if (change.name !== undefined) checkName(name);
      const authMethod = change.authMethod ?? current.authMethod;
      const fields = change.fields ?? current.fields;
      const sealed = change.sealed ?? {};
      checkKeys(sealed);
      // Kept only while they would still open: the same way to sign in, and
      // the same target (AC-312).
      const moved = targetChanges(current.driver, current.fields, fields);
      const sameSignIn = authMethod === current.authMethod;
      // Every stored secret, an optional one too, is asked for again after a
      // move (AC-312): none is dropped unsaid (T335's review).
      const missing = sameSignIn
        ? current.secrets.filter((field) => sealed[field] === undefined)
        : [];
      if (moved.length > 0 && missing.length > 0)
        throw new DataSourceRefused(
          422,
          `Enter ${missing.join(' and ')} again: ${moved.join(', ')} changed where it connects.`,
        );
      // A new way to sign in takes its own secrets; the old way's go.
      const kept = sameSignIn && moved.length === 0 ? current.secrets : [];
      const problems = dataSourceProblems(
        { driver: current.driver, authMethod, fields, sealed },
        kept,
      );
      if (problems.length > 0) throw new DataSourceRefused(400, problems.join(' '), problems);
      try {
        await db.transaction().execute(async (tx) => {
          await tx
            .updateTable('data_sources')
            .set((eb) => ({
              name,
              auth_method: authMethod,
              settings: JSON.stringify(fields),
              version: eb('version', '+', 1),
              updated_at: new Date(),
            }))
            .where('id', '=', id)
            .execute();
          const stale = current.secrets.filter((field) => !kept.includes(field));
          if (stale.length > 0)
            await tx
              .deleteFrom('data_source_secrets')
              .where('data_source_id', '=', id)
              .where('field', 'in', stale)
              .execute();
          await putSecrets(tx, id, sealed);
        });
      } catch (error) {
        throw taken(error, name);
      }
      return (await store.get(id))!;
    },

    async remove(id) {
      const removed = await db.deleteFrom('data_sources').where('id', '=', id).executeTakeFirst();
      return Number(removed.numDeletedRows) > 0;
    },

    async sealedOf(id) {
      const rows = await db
        .selectFrom('data_source_secrets')
        .select(['field', 'envelope', 'revision'])
        .where('data_source_id', '=', id)
        .execute();
      return {
        sealed: Object.fromEntries(
          rows.map((row) => [row.field, row.envelope as unknown as SealedV1]),
        ),
        revisions: Object.fromEntries(rows.map((row) => [row.field, row.revision])),
      };
    },
  };
  return store;
}

/** Each envelope stored as sealed, with a revision of its own: new whenever it is. */
async function putSecrets(
  tx: Kysely<Database>,
  id: string,
  sealed: Readonly<Record<string, SealedV1>>,
): Promise<void> {
  for (const [field, envelope] of Object.entries(sealed)) {
    const row = {
      envelope: JSON.stringify({ v: 1, kid: envelope.kid, enc: envelope.enc, ct: envelope.ct }),
      revision: randomUUID(),
      updated_at: new Date(),
    };
    await tx
      .insertInto('data_source_secrets')
      .values({ data_source_id: id, field, ...row })
      .onConflict((conflict) => conflict.columns(['data_source_id', 'field']).doUpdateSet(row))
      .execute();
  }
}
