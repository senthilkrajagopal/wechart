import { createHash, randomUUID } from 'node:crypto';

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
import { sql, type Kysely } from 'kysely';

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
  /**
   * Its connection settings as stored, as one print: its sign-in method, its
   * fields and each secret's revision. A test of the stored settings keeps
   * it, so a save that changes them — a rename doesn't — leaves that test no
   * longer its health (T364's review).
   */
  readonly settingsPrint: string;
  /** Where one made in a workspace is to go (T345, AC-282); null in a shared folder. */
  readonly targetFolderId: string | null;
  /** What a copy was copied from (T346, AC-280); null for any other. */
  readonly origin: {
    readonly id: string;
    readonly version: number;
    readonly folderId: string;
  } | null;
  /** What it is for, in its own words (T499); null for none. */
  readonly description: string | null;
  readonly version: number;
  readonly updatedAt: Date;
}

/** Sorted by key, so the order they came in changes no print. */
const byKey = <T>(record: Readonly<Record<string, T>>) =>
  Object.entries(record).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

export const settingsPrintOf = (
  driver: string,
  authMethod: string,
  fields: Readonly<Record<string, FieldValue>>,
  revisions: Readonly<Record<string, string>>,
): string =>
  createHash('sha256')
    .update(JSON.stringify([driver, authMethod, byKey(fields), byKey(revisions)]))
    .digest('base64url');

export interface NewDataSource {
  readonly folderId: string;
  readonly name: string;
  readonly driver: string;
  readonly authMethod: string;
  readonly fields: Readonly<Record<string, FieldValue>>;
  readonly sealed: Readonly<Record<string, SealedV1>>;
  /** Where one made in a workspace is to go (T345, AC-282). */
  readonly targetFolderId?: string;
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
  /** What it is for (T499): no part of the connection. Empty is none. */
  readonly description?: string | null;
}

export interface PlannedChange {
  readonly current: DataSource;
  readonly name: string;
  readonly authMethod: string;
  readonly fields: Readonly<Record<string, FieldValue>>;
  /** Secrets sealed anew. */
  readonly sealed: Readonly<Record<string, SealedV1>>;
  /** Stored secrets that still open where it would connect. */
  readonly kept: readonly string[];
}

/** Why a data source wasn't stored: a status for the API to answer with, and each problem. */
export class DataSourceRefused extends Error {
  constructor(
    readonly status: 400 | 404 | 409 | 422 | 502 | 503,
    message: string,
    readonly problems: readonly string[] = [message],
  ) {
    super(message);
    this.name = 'DataSourceRefused';
  }
}

/** A save made over a version since changed (T461's review): read it again. */
const changedSince = () =>
  new DataSourceRefused(
    409,
    'This data source changed since you opened it: open it again, and test your change on what it is now.',
  );

/** A data source's envelopes and their revisions, as stored: for xcube alone, never the browser. */
export interface Landed {
  readonly sealed: Readonly<Record<string, SealedV1>>;
  readonly revisions: Readonly<Record<string, string>>;
}

/**
 * Where a save lands before it is committed (T442): xcube, which checks every
 * envelope opens and stores the connection whole. Throwing refuses the save,
 * and nothing is stored. Called inside the save's transaction, so neither
 * asks the database anything (T442's review).
 */
export interface Landing {
  readonly land?: (source: DataSource, landed: Landed) => Promise<void>;
  /**
   * On a rename, the old name's connection, removed before the save: its
   * refusal (cubes use it) keeps the old name (T442's review).
   */
  readonly unland?: (source: DataSource) => Promise<void>;
}

export interface DataSourceStore {
  /**
   * A copy into the workspace folder `into` (T346, AC-280, AC-298): its
   * settings, its name and its sealed envelopes byte for byte, never opened;
   * targeting its original's folder, and naming its origin.
   */
  copy(id: string, into: string): Promise<DataSource>;
  /**
   * The copy of `originId` in one of the folders `into`, if there is one
   * (T346): a workspace's, wherever in it the copy is (T523).
   */
  copyIn(originId: string, into: readonly string[]): Promise<DataSource | undefined>;
  /**
   * Names what a workspace one is now a copy of: the data source its approval
   * landed as (T352's review), so "Edit in my workspace" finds it. Its
   * version is left, so the author's open edit still saves.
   */
  setOrigin(id: string, origin: NonNullable<DataSource['origin']>): Promise<void>;
  inFolder(folderId: string): Promise<DataSource[]>;
  all(): Promise<DataSource[]>;
  get(id: string): Promise<DataSource | undefined>;
  create(input: NewDataSource, landing?: Landing): Promise<DataSource>;
  /**
   * A change checked as a save checks it, and what it would store: the
   * secrets it keeps and those sealed anew. For a test of the change (T361)
   * as for its save, so neither tries what the other refuses (AC-312).
   */
  plan(id: string, change: DataSourceChange): Promise<PlannedChange>;
  /** A new one's driver, sign-in, fields and envelopes, checked as its save would (T361). */
  checkShape(shape: Omit<NewDataSource, 'folderId' | 'name'>): void;
  /**
   * Saves a change, over `expectedVersion` when given (its current one if
   * not), or refuses with 409 when the source has moved on (T461's review).
   */
  update(
    id: string,
    change: DataSourceChange,
    landing?: Landing,
    expectedVersion?: number,
  ): Promise<DataSource>;
  /** Removed from xcube first, where `unland` is given: its refusal keeps it. */
  remove(
    id: string,
    unlanding?: { readonly unland?: (source: DataSource) => Promise<void> },
  ): Promise<boolean>;
  sealedOf(id: string): Promise<Landed>;
  /**
   * Its settings and its envelopes as of one moment (T349's review): a save
   * between two reads would pair one target's fields with another's
   * envelopes, which would never open.
   */
  withSealed(id: string): Promise<{ source: DataSource; landed: Landed } | undefined>;
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
  target_folder_id: string | null;
  origin: DataSource['origin'];
  description: string | null;
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
  /** In the transaction a save runs in, or out of one. */
  type Reader = Kysely<Database>;
  /** Each one's secrets, by field, with their revisions: never their envelopes. */
  const secretsOf = async (ids: readonly string[], on: Reader = db) => {
    if (ids.length === 0) return new Map<string, Record<string, string>>();
    const rows = await on
      .selectFrom('data_source_secrets')
      .select(['data_source_id', 'field', 'revision'])
      .where('data_source_id', 'in', [...ids])
      .execute();
    const byId = new Map<string, Record<string, string>>();
    for (const row of rows)
      byId.set(row.data_source_id, {
        ...byId.get(row.data_source_id),
        [row.field]: row.revision,
      });
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
  const toSource = (row: Row, revisions: Readonly<Record<string, string>>): DataSource => ({
    id: row.id,
    folderId: row.folder_id,
    name: row.name,
    driver: row.type as DriverType,
    authMethod: row.auth_method,
    fields: row.settings as Record<string, FieldValue>,
    secrets: ordered(row, Object.keys(revisions)),
    settingsPrint: settingsPrintOf(
      row.type,
      row.auth_method,
      row.settings as Record<string, FieldValue>,
      revisions,
    ),
    targetFolderId: row.target_folder_id,
    origin: row.origin,
    description: row.description,
    version: row.version,
    updatedAt: row.updated_at,
  });
  const select = (on: Reader = db) =>
    on
      .selectFrom('data_sources')
      .select([
        'id',
        'folder_id',
        'name',
        'type',
        'auth_method',
        'settings',
        'target_folder_id',
        'origin',
        'description',
        'version',
        'updated_at',
      ]);
  const withSecrets = async (rows: Row[], on: Reader = db) => {
    const secrets = await secretsOf(
      rows.map((row) => row.id),
      on,
    );
    return rows.map((row) => toSource(row, secrets.get(row.id) ?? {}));
  };
  const getOn = async (id: string, on: Reader) => {
    const row = (await select(on).where('id', '=', id).executeTakeFirst()) as Row | undefined;
    return row === undefined ? undefined : (await withSecrets([row], on))[0];
  };
  const sealedOn = async (id: string, on: Reader): Promise<Landed> => {
    const rows = await on
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
  };
  /** As written, still in its transaction: landed, or the whole save undone (T442). */
  const landIn = async (tx: Reader, id: string, landing: Landing | undefined) => {
    if (landing?.land === undefined) return;
    await landing.land((await getOn(id, tx))!, await sealedOn(id, tx));
  };
  /** A name the folder already holds, said as AC-270 has it. */
  const taken = (error: unknown, name: string) =>
    (error as { code?: string } | null)?.code === '23505'
      ? new DataSourceRefused(409, `This folder already has a data source named ${name}.`)
      : error;

  const store: DataSourceStore = {
    async copy(id, into) {
      const copyId = `ds-${randomUUID()}`;
      let name = '';
      try {
        await db.transaction().execute(async (tx) => {
          // Its settings and its envelopes read together (T346's review): a
          // change between them would pair one target's fields with another's
          // envelopes, which would never open.
          const original = await getOn(id, tx);
          if (original === undefined)
            throw new DataSourceRefused(404, 'There’s no such data source.');
          name = original.name;
          await tx
            .insertInto('data_sources')
            .values({
              id: copyId,
              folder_id: into,
              name: original.name,
              type: original.driver,
              auth_method: original.authMethod,
              settings: JSON.stringify(original.fields),
              target_folder_id: original.folderId,
              origin: JSON.stringify({
                id: original.id,
                version: original.version,
                folderId: original.folderId,
              }),
              description: original.description,
            })
            .execute();
          // Each envelope as it was sealed: copied, never opened (AC-298).
          const envelopes = await tx
            .selectFrom('data_source_secrets')
            .select(['field', 'envelope'])
            .where('data_source_id', '=', id)
            .execute();
          for (const { field, envelope } of envelopes)
            await tx
              .insertInto('data_source_secrets')
              .values({
                data_source_id: copyId,
                field,
                envelope: JSON.stringify(envelope),
                revision: randomUUID(),
                updated_at: new Date(),
              })
              .execute();
        });
      } catch (error) {
        throw taken(error, name);
      }
      return (await store.get(copyId))!;
    },

    async copyIn(originId, into) {
      if (into.length === 0) return undefined;
      const row = (await select()
        .where('folder_id', 'in', [...into])
        .where(sql<boolean>`origin ->> 'id' = ${originId}`)
        .executeTakeFirst()) as Row | undefined;
      return row === undefined ? undefined : (await withSecrets([row]))[0];
    },

    async setOrigin(id, origin) {
      await db
        .updateTable('data_sources')
        .set({ origin: JSON.stringify(origin) })
        .where('id', '=', id)
        .execute();
    },

    async inFolder(folderId) {
      return withSecrets(
        (await select().where('folder_id', '=', folderId).orderBy('name').execute()) as Row[],
      );
    },

    async all() {
      return withSecrets((await select().orderBy('folder_id').orderBy('name').execute()) as Row[]);
    },

    async get(id) {
      return getOn(id, db);
    },

    async create(input, landing) {
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
              ...(input.targetFolderId === undefined
                ? {}
                : { target_folder_id: input.targetFolderId }),
            })
            .execute();
          await putSecrets(tx, id, input.sealed);
          await landIn(tx, id, landing);
        });
      } catch (error) {
        throw taken(error, input.name);
      }
      return (await store.get(id))!;
    },

    checkShape(shape) {
      checkShape(shape);
      checkKeys(shape.sealed);
    },

    async plan(id, change) {
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
      return { current, name, authMethod, fields, sealed, kept };
    },

    async update(id, change, landing, expectedVersion) {
      const { current, name, authMethod, fields, sealed, kept } = await store.plan(id, change);
      // Saved over the version it was checked against, or not at all (T461's
      // review): a change tested at one version must not land on another.
      const at = expectedVersion ?? current.version;
      if (current.version !== at) throw changedSince();
      // Renamed: the old name's connection goes first, refused while cubes
      // use it, and is put back should the save then fail (T442's review).
      const renamed = name !== current.name && landing?.unland !== undefined;
      const before = renamed ? await store.sealedOf(id) : undefined;
      if (renamed) await landing.unland!(current);
      try {
        await db.transaction().execute(async (tx) => {
          const written = await tx
            .updateTable('data_sources')
            .set((eb) => ({
              name,
              auth_method: authMethod,
              settings: JSON.stringify(fields),
              // Said or cleared; kept when not said (T499).
              ...(change.description === undefined
                ? {}
                : {
                    description:
                      change.description === null || change.description.trim() === ''
                        ? null
                        : change.description.trim(),
                  }),
              version: eb('version', '+', 1),
              updated_at: new Date(),
            }))
            .where('id', '=', id)
            .where('version', '=', at)
            .executeTakeFirst();
          if (written.numUpdatedRows !== 1n) throw changedSince();
          const stale = current.secrets.filter((field) => !kept.includes(field));
          if (stale.length > 0)
            await tx
              .deleteFrom('data_source_secrets')
              .where('data_source_id', '=', id)
              .where('field', 'in', stale)
              .execute();
          await putSecrets(tx, id, sealed);
          await landIn(tx, id, landing);
        });
      } catch (error) {
        if (renamed && landing.land !== undefined)
          // Best-effort: the start's reconcile puts it back if this fails too.
          await landing.land(current, before!).catch(() => undefined);
        throw taken(error, name);
      }
      return (await store.get(id))!;
    },

    async remove(id, unlanding) {
      if (unlanding?.unland !== undefined) {
        const source = await getOn(id, db);
        if (source === undefined) return false;
        // Out of xcube first: a connection left there with no data source
        // behind it is the start's reconcile's to remove; one removed here and
        // kept by wechart would break what uses it (T442).
        await unlanding.unland(source);
      }
      const removed = await db.deleteFrom('data_sources').where('id', '=', id).executeTakeFirst();
      return Number(removed.numDeletedRows) > 0;
    },

    async sealedOf(id) {
      return sealedOn(id, db);
    },

    async withSealed(id) {
      return db
        .transaction()
        .setIsolationLevel('repeatable read')
        .execute(async (tx) => {
          const source = await getOn(id, tx);
          return source === undefined ? undefined : { source, landed: await sealedOn(id, tx) };
        });
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
