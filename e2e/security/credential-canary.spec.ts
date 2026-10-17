import { execFileSync } from 'node:child_process';
import { createPrivateKey, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

import type { APIRequestContext, APIResponse, Page } from '@playwright/test';
import { DRIVERS, INFO_V1, secretAadV1, type DriverType } from '@wechart/core';
import * as HPKE from 'hpke';

import {
  BASE_URL,
  expect,
  projectFolderOf,
  removeProjectFolder,
  signInThroughDex,
  test,
} from './fixtures';

/**
 * T368, T581; AC-298: THE SYSTEM SHALL store data-source credentials in the
 * metadata database encrypted to xcube's public key, so neither the database
 * nor anything wechart holds can reveal them.
 * `Fails when: a credential can be read from a dump of the metadata database,
 * or from anything wechart holds, without xcube's private key.`
 *
 * AC-325: WHEN a user types a data source's secret, THE SYSTEM SHALL encrypt
 * it in the browser, to xcube's public key, before sending it. No request to
 * wechart, nothing wechart stores, and no log line SHALL hold the typed
 * secret, the connection test included. (Logs aren't read: requests suffice,
 * the user's R61.)
 *
 * Research `credential-sealing.md`, "AC-298 and AC-325 tests", items 1–3:
 *
 * 1. Every flow that persists a data source's data, driven as a person drives
 *    it, with a canary for its password (a login made for this run in
 *    compose's sample database, whose password is the canary, so xcube's test
 *    passes; dropped after):
 *    - `writer` types a wrong canary into the wizard, which fails xcube's
 *      test, then the right one, which passes, and makes the source in My
 *      workspace;
 *    - proposes it, and `super` approves it from the review view;
 *    - replaces its password with a second canary, tests and saves; proposes
 *      it; `super` rejects it from the review view; it is proposed again and
 *      approved, landing over the folder's;
 *    - changes a field that isn't a secret's target, tests, saves;
 *    - restores the folder's version 1 into a draft;
 *    - changes the draft's host, so its password is asked for again
 *      (AC-312), types a third canary, tests, saves;
 *    - `super` copies the folder's into their workspace with "Edit in my
 *      workspace".
 *
 *    Then a canary is typed into every secret field of every driver's form,
 *    each way it signs in. No database in compose takes those, so each test
 *    fails. The test is marked passed in the database, as `data-sources.spec.ts`
 *    marks one for T506, and the source is made from what the browser sealed.
 *
 *    No request to wechart's API, by address, headers or body, holds any form
 *    of any canary, and each test, create and save carries its secrets as
 *    envelopes.
 * 2. A plain `pg_dump` of the suite's whole metadata database holds no form
 *    of any canary, nor of the development private key; it holds the
 *    envelopes.
 * 3. Every envelope stored for this run's data sources opens with the
 *    development private key, giving back exactly what was typed into its
 *    field, and with a random key opens none: each source's own, each version
 *    of the folder's, and each proposal's snapshot. So does the restored
 *    draft's, before its host changes. Each driver's trial passes xcube's
 *    "Open the secrets" check: xcube opened what the browser sealed.
 */
const RUN = Math.random().toString(36).slice(2, 8);
/** A canary: only [a-z0-9-], so its JSON and URL forms are its raw form. */
const canary = (what: string) => `wcanary-${RUN}-${what}-${randomUUID()}`;
const WRONG = canary('wrong');
const CANARY = canary('first');
const CANARY_AGAIN = canary('again');
const CANARY_TARGET = canary('target');
const LOGIN = `canary_${RUN}`;
const NAME = `e2e_${RUN}_canary`;
const FOLDER = `Canary ${RUN}`;
/** Every canary typed, the flows' and the drivers'. */
const TYPED: string[] = [WRONG, CANARY, CANARY_AGAIN, CANARY_TARGET];
/** What each data source of this run holds sealed, by its id: each field's secret as typed. */
const STORED = new Map<string, Readonly<Record<string, string>>>();
const made = {
  folder: '',
  source: '',
  landed: '',
  proposal: '',
  copy: '',
  copyFolder: '',
  drivers: [] as string[],
};

/** A statement in compose's sample database, as its superuser `sample`. */
const inSampleDb = (statement: string) =>
  execFileSync(
    'docker',
    [
      'exec',
      'wechart-sample-db',
      'psql',
      '-U',
      'sample',
      '-d',
      'sample',
      '-v',
      'ON_ERROR_STOP=1',
      '-Atc',
      statement,
    ],
    { encoding: 'utf8' },
  );

/**
 * A query of the suite's metadata database, as `prepare-stack.mjs` reaches
 * it: its rows, tab-separated, and no command tag (`-q`), so an `UPDATE …
 * RETURNING` gives its rows alone.
 */
const inSuiteDb = (query: string) =>
  execFileSync(
    'docker',
    [
      'exec',
      'wechart-meta',
      'psql',
      '-U',
      'wechart',
      '-d',
      'wechart_security',
      '-Atq',
      '-F',
      '\t',
      '-c',
      query,
    ],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  )
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => line.split('\t'));

/**
 * Marks a trial connection test passed, for a driver no database in compose
 * takes (as `data-sources.spec.ts` does for T506): the test was run and kept
 * by the API as any other, and only its outcome is changed.
 */
function markPassed(testId: string) {
  expect(testId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  expect(
    inSuiteDb(
      `UPDATE connection_tests SET ok = true WHERE id = '${testId}' AND data_source_id IS NULL RETURNING id`,
    ),
  ).toEqual([[testId]]);
}

/**
 * The suite's whole metadata database, schema and rows, as its admin dumps
 * it (plain format, uncompressed: research/credential-encryption.md §
 * Testing), from compose's metadata Postgres.
 */
const dump = () =>
  execFileSync(
    'docker',
    ['exec', 'wechart-meta', 'pg_dump', '-U', 'wechart', '--format=plain', 'wechart_security'],
    { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 },
  );

/**
 * Every form a dump could show these bytes in: hex in either case, and
 * base64 and base64url at each of the three byte alignments a longer value
 * could hold them at — only the characters their own bytes decide, so none is
 * matched by chance.
 */
function encodingsOf(bytes: Buffer): string[] {
  const forms = [bytes.toString('hex'), bytes.toString('hex').toUpperCase()];
  for (const alphabet of ['base64', 'base64url'] as const)
    for (let shift = 0; shift < 3; shift += 1) {
      const encoded = Buffer.concat([Buffer.alloc(shift), bytes]).toString(alphabet);
      forms.push(encoded.slice(shift === 0 ? 0 : 4, Math.floor((shift + bytes.length) / 3) * 4));
    }
  return forms;
}
/** A secret's every form: itself, and its encodings. */
const formsOf = (secret: string) => [secret, ...encodingsOf(Buffer.from(secret))];

/** The development key pair (infra/xcube/README.md), as xcube holds its private half. */
const DEV_KEY = createPrivateKey(
  readFileSync(new URL('../../infra/xcube/dev-credential-key.pem', import.meta.url), 'utf8'),
).export({ format: 'jwk' }) as { d: string; x: string };
const DEV_KID = (
  JSON.parse(
    readFileSync(new URL('../../infra/xcube/dev-credential-key.pub.jwk', import.meta.url), 'utf8'),
  ) as { kid: string }
).kid;
const PRIVATE_KEY = Buffer.from(DEV_KEY.d, 'base64url');

/** Opening as xcube opens (research `credential-sealing.md`; core's `seal.test.ts`). */
const suite = new HPKE.CipherSuite(
  HPKE.KEM_DHKEM_X25519_HKDF_SHA256,
  HPKE.KDF_HKDF_SHA256,
  HPKE.AEAD_AES_128_GCM,
);
type Pair = Awaited<ReturnType<typeof suite.GenerateKeyPair>>;
interface Envelope {
  readonly v: number;
  readonly kid: string;
  readonly enc: string;
  readonly ct: string;
}
async function open(
  pair: Pair,
  envelope: Envelope,
  driver: DriverType,
  field: string,
  fields: Readonly<Record<string, unknown>>,
): Promise<string> {
  const padded = new Uint8Array(
    await suite.Open(
      pair,
      Buffer.from(envelope.enc, 'base64url'),
      Buffer.from(envelope.ct, 'base64url'),
      { info: INFO_V1, aad: secretAadV1(driver, field, fields) },
    ),
  );
  const length = new DataView(padded.buffer, padded.byteOffset).getUint32(1);
  return new TextDecoder().decode(padded.subarray(5, 5 + length));
}
/** The development key pair, as xcube holds it, to open with. */
const devPair = async (): Promise<Pair> => ({
  privateKey: await suite.DeserializePrivateKey(PRIVATE_KEY, false),
  publicKey: await suite.DeserializePublicKey(Buffer.from(DEV_KEY.x, 'base64url')),
});
/** A data source's envelopes as stored now, each opened with the development key: by field. */
async function openedNow(id: string): Promise<Record<string, string>> {
  const pair = await devPair();
  const opened: Record<string, string> = {};
  for (const [driver, field, envelope, settings] of inSuiteDb(
    `SELECT ds.type, s.field, s.envelope::text, ds.settings::text FROM data_sources ds ` +
      `JOIN data_source_secrets s ON s.data_source_id = ds.id WHERE ds.id = '${id}'`,
  ))
    opened[field!] = await open(
      pair,
      JSON.parse(envelope!) as Envelope,
      driver as DriverType,
      field!,
      JSON.parse(settings!) as Record<string, unknown>,
    );
  return opened;
}

/** The proposal waiting on an item of the asker's own workspace, by its id: its author's to ask. */
async function proposalOf(request: APIRequestContext, itemId: string): Promise<string> {
  const answer = await request.get(`/api/proposals?kind=data-source&itemId=${itemId}`);
  expect(answer.status(), await answer.text()).toBe(200);
  return ((await answer.json()) as { id: string }).id;
}

interface Sent {
  readonly method: string;
  readonly url: string;
  readonly body: string;
}

/**
 * Everything the page sends wechart's API, by its address, headers and body,
 * and every answer it reads, each answer read in full before it is looked
 * at. A secret no request carries is one wechart never has, to keep or give
 * back.
 */
function trafficOn(page: Page) {
  const sent: Sent[] = [];
  const texts: string[] = [];
  const reading: Promise<void>[] = [];
  page.on('request', (request) => {
    if (!request.url().startsWith(`${BASE_URL}/api/`)) return;
    sent.push({ method: request.method(), url: request.url(), body: request.postData() ?? '' });
    texts.push(request.url(), request.postData() ?? '');
    // Every header, cookies included (`headers()` leaves those out).
    reading.push(
      request.allHeaders().then(
        (headers) => {
          texts.push(JSON.stringify(headers));
        },
        () => undefined,
      ),
    );
  });
  page.on('response', (response) => {
    if (!response.url().startsWith(`${BASE_URL}/api/`)) return;
    reading.push(
      response.text().then(
        (text) => {
          texts.push(text);
        },
        // An answer the page never had (a redirect, one cut off) has no body to hold anything.
        () => undefined,
      ),
    );
  });
  return {
    sent,
    /** Every text sent or read, once every answer is read; and those of `alsoRead`, read outside the page. */
    async all(alsoRead: readonly APIResponse[] = []): Promise<string[]> {
      await Promise.all(reading);
      return [...texts, ...(await Promise.all(alsoRead.map((each) => each.text())))];
    },
  };
}

/** Holds no form of any canary typed. */
function expectNoCanary(texts: readonly string[]) {
  expect(texts.length).toBeGreaterThan(0);
  for (const typed of TYPED)
    for (const form of formsOf(typed))
      expect(
        texts.filter((text) => text.includes(form)),
        form,
      ).toEqual([]);
}

/** The bodies sent to these addresses carry these secrets sealed, each an envelope and no more (AC-325). */
function expectSealed(sent: readonly Sent[], method: string, url: RegExp, keys: readonly string[]) {
  const bodies = sent.filter((each) => each.method === method && url.test(each.url));
  expect(bodies.length, `${method} ${String(url)}`).toBeGreaterThan(0);
  for (const { body } of bodies) {
    const sealed = (JSON.parse(body) as { sealed?: Record<string, Record<string, unknown>> })
      .sealed;
    expect(Object.keys(sealed ?? {}).sort(), `${method} ${String(url)}`).toEqual([...keys].sort());
    for (const key of keys)
      expect(Object.keys(sealed?.[key] ?? {}).sort(), `${method} ${String(url)} ${key}`).toEqual([
        'ct',
        'enc',
        'kid',
        'v',
      ]);
  }
}

/** A PEM block around a canary, as a key is pasted. */
const pem = (kind: string, body: string) =>
  `-----BEGIN ${kind}-----\n${body}\n-----END ${kind}-----\n`;

/**
 * One way a driver signs in, as its form asks it: what to choose, what to
 * type where it connects and how it signs in, and the secret fields, each
 * typed with a canary of its own. Every connection is to 127.0.0.1, where
 * nothing listens in Cube's container, or to a cloud account that isn't
 * there, so every test fails (T506's precedent).
 */
interface SignIn {
  readonly driver: DriverType;
  /** The driver's tile. */
  readonly tile: string;
  /** The shape, where its form asks one first (design 02). */
  readonly shape?: RegExp;
  /** The way it signs in, by core's id (`DRIVERS`). */
  readonly methodId: string;
  /** Its "Sign in with" option, where its form offers more than one. */
  readonly method?: string;
  readonly fields: readonly (readonly [RegExp, string])[];
  readonly secrets: readonly (readonly [RegExp, string, (canary: string) => string])[];
}
const plain = (value: string) => value;
const CERT = pem('CERTIFICATE', 'MIIBe2e');
const host = [/^Host/, '127.0.0.1'] as const;
const user = [/^User/, 'e2e'] as const;
const database = [/^Database/, 'e2e'] as const;
const password = [/^Password/, 'password', plain] as const;
const snowflake = [[/^Account/, `e2e${RUN}`], [/^Warehouse/, 'e2e'], database] as const;
const mssql = [[/^Server/, '127.0.0.1'], database] as const;
const clientCertificate = [
  [/^Client key \(PEM\)/, 'sslKey', (value: string) => pem('PRIVATE KEY', value)],
  [/^Key passphrase/, 'sslPassphrase', plain],
] as const;
const SIGN_INS: readonly SignIn[] = [
  {
    driver: 'postgres',
    tile: 'PostgreSQL',
    methodId: 'password',
    method: 'Password',
    fields: [host, database, user],
    secrets: [password],
  },
  {
    driver: 'postgres',
    tile: 'PostgreSQL',
    methodId: 'client-certificate',
    method: 'Client certificate',
    fields: [host, database, user, [/^Client certificate \(PEM\)/, CERT]],
    secrets: clientCertificate,
  },
  {
    driver: 'redshift',
    tile: 'Amazon Redshift',
    methodId: 'password',
    fields: [host, database, user],
    secrets: [password],
  },
  {
    driver: 'mysql',
    tile: 'MySQL',
    methodId: 'password',
    method: 'Password',
    fields: [host, database, user],
    secrets: [password],
  },
  {
    driver: 'mysql',
    tile: 'MySQL',
    methodId: 'client-certificate',
    method: 'Client certificate',
    fields: [host, database, user, [/^Client certificate \(PEM\)/, CERT]],
    secrets: clientCertificate,
  },
  {
    driver: 'snowflake',
    tile: 'Snowflake',
    methodId: 'key-pair',
    method: 'Key pair',
    fields: [...snowflake, user],
    secrets: [
      [/^Private key \(PEM\)/, 'privateKey', (value) => pem('PRIVATE KEY', value)],
      [/^Key passphrase/, 'privateKeyPass', plain],
    ],
  },
  {
    driver: 'snowflake',
    tile: 'Snowflake',
    methodId: 'oauth',
    method: 'OAuth token',
    fields: snowflake,
    secrets: [[/^OAuth token/, 'oauthToken', plain]],
  },
  {
    driver: 'snowflake',
    tile: 'Snowflake',
    methodId: 'password',
    method: 'Password',
    fields: [...snowflake, user],
    secrets: [password],
  },
  {
    driver: 'bigquery',
    tile: 'BigQuery',
    methodId: 'service-account',
    fields: [[/^Project ID/, `e2e-${RUN}`]],
    secrets: [
      [
        /^Key \(JSON\)/,
        'credentials',
        (value) =>
          JSON.stringify({
            type: 'service_account',
            project_id: `e2e-${RUN}`,
            client_email: `e2e-${RUN}@e2e.iam.gserviceaccount.com`,
            private_key: pem('PRIVATE KEY', value),
          }),
      ],
    ],
  },
  {
    driver: 'mssql',
    tile: 'SQL Server',
    methodId: 'sql-login',
    method: 'SQL login',
    fields: [...mssql, user],
    secrets: [password],
  },
  {
    driver: 'mssql',
    tile: 'SQL Server',
    methodId: 'ntlm',
    method: 'Windows (NTLM)',
    fields: [...mssql, [/^Domain/, 'e2e'], user],
    secrets: [password],
  },
  {
    driver: 'mssql',
    tile: 'SQL Server',
    methodId: 'entra-service-principal',
    method: 'Microsoft Entra ID service principal',
    fields: [...mssql, [/^Tenant ID/, 'e2e'], [/^Client ID/, 'e2e']],
    secrets: [[/^Client secret/, 'clientSecret', plain]],
  },
  {
    driver: 'oracle',
    tile: 'Oracle',
    methodId: 'password',
    fields: [[/^Connect string/, '127.0.0.1:1521/e2e'], user],
    secrets: [password],
  },
  {
    driver: 'dremio',
    tile: 'Dremio',
    methodId: 'token',
    fields: [[/^Project URL/, 'https://127.0.0.1:9/v0/projects/e2e']],
    secrets: [[/^Token/, 'token', plain]],
  },
  {
    driver: 'dremio',
    tile: 'Dremio',
    shape: /^Dremio Software/,
    methodId: 'token',
    method: 'Personal access token',
    fields: [host],
    secrets: [[/^Token/, 'token', plain]],
  },
  {
    driver: 'dremio',
    tile: 'Dremio',
    shape: /^Dremio Software/,
    methodId: 'password',
    method: 'User and password',
    fields: [host, user],
    secrets: [password],
  },
];

// Each step can wait on xcube's connection test, which gives its connect check 30 s.
test.describe.configure({ mode: 'serial', timeout: 150_000 });

test.describe('a data source’s secrets, at rest and in flight (T368, T581; AC-298, AC-325)', () => {
  test.beforeAll(() => {
    inSampleDb(
      `CREATE ROLE ${LOGIN} LOGIN PASSWORD '${CANARY}'; ` +
        `GRANT CONNECT ON DATABASE sample TO ${LOGIN}; ` +
        `GRANT USAGE ON SCHEMA public TO ${LOGIN}; ` +
        `GRANT SELECT ON ALL TABLES IN SCHEMA public TO ${LOGIN};`,
    );
  });

  test.afterAll(async ({ browser }) => {
    const context = await browser.newContext({
      baseURL: BASE_URL,
      storageState: { cookies: [], origins: [] },
    });
    const page = await context.newPage();
    // Each removal said if it fails, so nothing is left behind unnoticed.
    const removed = async (url: string) => {
      const answer = await context.request.delete(url);
      expect([204, 404], `${url}: ${await answer.text()}`).toContain(answer.status());
    };
    try {
      await signInThroughDex(page, 'writer');
      for (const id of [made.source, ...made.drivers].filter((each) => each !== ''))
        await removed(`/api/data-sources/${id}`);
      await context.clearCookies();
      await signInThroughDex(page, 'super');
      if (made.copy !== '') await removed(`/api/data-sources/${made.copy}`);
      await removeProjectFolder(context.request, made.copyFolder);
      if (made.landed !== '') await removed(`/api/data-sources/${made.landed}`);
      if (made.folder !== '') await removed(`/api/documents/folder/${made.folder}`);
    } finally {
      await context.close();
      inSampleDb(`DROP OWNED BY ${LOGIN}; DROP ROLE ${LOGIN};`);
    }
  });

  test.describe('as super', () => {
    test.use({ role: 'super' });

    test('makes the folder writer proposes to', async ({ page }) => {
      const folder = await page.request.post('/api/documents', {
        data: { kind: 'folder', title: FOLDER, folderId: 'root' },
      });
      expect(folder.status()).toBe(201);
      made.folder = ((await folder.json()) as { id: string }).id;
      const granted = await page.request.put(`/api/folders/${made.folder}/access`, {
        data: { readOnly: [], readWrite: ['sales-rw'] },
      });
      expect(granted.status()).toBe(200);
    });
  });

  test.describe('as writer', () => {
    test.use({ role: 'writer' });

    test('tests a wrong canary, which fails, then makes it with the right one, and proposes it', async ({
      page,
    }) => {
      const traffic = trafficOn(page);
      await page.goto('/explore');
      await page
        .getByRole('complementary', { name: 'Folders' })
        .getByRole('tree')
        .getByRole('treeitem', { name: 'My workspace', exact: true })
        .getByRole('button')
        .first()
        .click();
      const contents = page.getByTestId('explore-contents');
      await contents.getByRole('button', { name: 'New', exact: true }).click();
      await page
        .getByRole('menu', { name: 'New' })
        .getByRole('menuitem', { name: 'Data source' })
        .click();

      const wizard = page.getByRole('dialog', { name: 'New data source' });
      await wizard.getByRole('radio', { name: 'PostgreSQL' }).click();
      await wizard.getByRole('button', { name: 'Next: Connection' }).click();
      await wizard.getByLabel(/^Host/).fill('sample-db');
      await wizard.getByLabel(/^Database/).fill('sample');
      await wizard.getByRole('switch', { name: 'Use TLS' }).uncheck();
      await wizard.getByLabel(/^User/).fill(LOGIN);
      // A failing test first: the wrong canary, which xcube's connect refuses.
      await wizard.getByLabel(/^Password/).fill(WRONG);
      await wizard.getByRole('button', { name: 'Next: Test' }).click();
      const checks = wizard.getByRole('list', { name: 'Checks' });
      await wizard.getByRole('button', { name: 'Test connection' }).click();
      await expect(checks.getByRole('listitem')).toHaveText(
        [
          /^Open the secrets\d+ ms$/,
          /^Build the connection’s configuration\d+ ms$/,
          /^Connect\d+ ms.*password authentication failed/s,
          'Read the catalogSkipped',
        ],
        { timeout: 90_000 },
      );
      await checks.getByRole('button', { name: 'Change sign-in' }).click();
      await wizard.getByLabel(/^Password/).fill(CANARY);
      await wizard.getByRole('button', { name: 'Next: Test' }).click();
      await wizard.getByRole('button', { name: 'Test connection' }).click();
      await expect(checks.getByRole('listitem')).toHaveText(
        [
          /^Open the secrets\d+ ms$/,
          /^Build the connection’s configuration\d+ ms$/,
          /^Connect\d+ ms$/,
          /^Read the catalog\d+ ms$/,
        ],
        { timeout: 90_000 },
      );
      await wizard.getByRole('button', { name: 'Next: Name and target' }).click();
      await wizard.getByRole('textbox', { name: /^Name/ }).fill(NAME);
      await wizard
        .getByRole('tree', { name: 'Target folder' })
        .getByRole('treeitem', { name: FOLDER })
        .click();
      const created = page.waitForResponse(
        (response) =>
          response.url() === `${BASE_URL}/api/data-sources` &&
          response.request().method() === 'POST',
      );
      await wizard.getByRole('button', { name: 'Create in My workspace' }).click();
      const answer = await created;
      expect(answer.status(), await answer.text()).toBe(201);
      made.source = ((await answer.json()) as { id: string }).id;
      await expect(wizard).toHaveCount(0);

      // Proposed from its row, to the folder it is to go to.
      const row = contents.getByRole('row').filter({ hasText: NAME });
      await row.getByRole('button', { name: `Actions for ${NAME}` }).click();
      // Named for its target (T694; design 04, pin 7).
      await page.getByRole('menuitem', { name: /^Propose to .+…$/ }).click();
      const dialog = page.getByRole('dialog', { name: `Propose to ${FOLDER}` });
      await dialog.getByLabel('What changed').fill(`Canary ${RUN}, first.`);
      await dialog.getByRole('button', { name: 'Propose', exact: true }).click();
      await expect(dialog).toHaveCount(0);
      await expect(row.getByRole('cell').nth(1)).toHaveText('Waiting for review');
      made.proposal = await proposalOf(page.request, made.source);

      // Both tests and the save each carried the password, sealed (AC-325).
      const tests = traffic.sent.filter((each) => /\/api\/data-sources\/test$/.test(each.url));
      expect(tests.length).toBe(2);
      expectSealed(traffic.sent, 'POST', /\/api\/data-sources\/test$/, ['password']);
      expectSealed(traffic.sent, 'POST', /\/api\/data-sources$/, ['password']);
      expectNoCanary(await traffic.all());
    });
  });

  test.describe('as super, deciding', () => {
    test.use({ role: 'super' });

    test('approves it from the review view, which lands it in the folder', async ({ page }) => {
      const traffic = trafficOn(page);
      await page.goto(`/reviews/${made.proposal}`);
      const inspector = page.getByRole('complementary', { name: 'About this proposal' });
      await inspector.getByRole('button', { name: 'Approve', exact: true }).click();
      await page
        .getByRole('dialog', { name: `Publish to ${FOLDER}?` })
        .getByRole('button', { name: 'Approve and publish' })
        .click();
      await expect(inspector.getByTestId('review-decision')).toHaveText(
        /^Approved by Super Admin/,
        { timeout: 90_000 },
      );

      const sources = await page.request.get('/api/data-sources');
      const listed = (await sources.json()) as { id: string; name: string; folderId: string }[];
      const landed = listed.find((each) => each.name === NAME && each.folderId === made.folder);
      expect(landed?.name, 'landed in the folder').toBe(NAME);
      made.landed = landed!.id;
      expectNoCanary(await traffic.all([sources]));
    });
  });

  test.describe('as writer, again', () => {
    test.use({ role: 'writer' });

    test('replaces its password with a second canary, tested and saved, and proposes it', async ({
      page,
    }) => {
      inSampleDb(`ALTER ROLE ${LOGIN} PASSWORD '${CANARY_AGAIN}';`);
      const traffic = trafficOn(page);
      await page.goto(`/explore/data-sources/${made.source}`);
      const main = page.getByRole('main');
      await main
        .getByRole('tablist', { name: 'Data source' })
        .getByRole('tab', { name: 'Connection' })
        .click();
      const panel = main.getByRole('tabpanel');
      await panel.getByRole('button', { name: 'Replace the password' }).click();
      await panel.getByLabel(/^Password/).fill(CANARY_AGAIN);
      await main.getByRole('button', { name: 'Test connection' }).click();
      await expect(main.getByRole('region', { name: 'Test to save' })).toContainText(
        'Every check passed',
        { timeout: 90_000 },
      );
      await main.getByRole('button', { name: 'Save', exact: true }).click();
      await expect(main.locator('.source-settings__foot')).toContainText('Saved 1 change.');

      const proposed = await page.request.post('/api/proposals', {
        data: { kind: 'data-source', id: made.source, description: `Canary ${RUN}, again.` },
      });
      expect(proposed.status(), await proposed.text()).toBe(201);
      made.proposal = ((await proposed.json()) as { id: string }).id;
      // The test and the save each carried the new password, sealed (AC-325).
      const own = `/api/data-sources/${made.source}`;
      expectSealed(traffic.sent, 'POST', new RegExp(`${own}/test$`), ['password']);
      expectSealed(traffic.sent, 'PUT', new RegExp(`${own}$`), ['password']);
      expectNoCanary(await traffic.all([proposed]));
    });
  });

  test.describe('as super, rejecting', () => {
    test.use({ role: 'super' });

    test('rejects it from the review view', async ({ page }) => {
      const traffic = trafficOn(page);
      await page.goto(`/reviews/${made.proposal}`);
      const inspector = page.getByRole('complementary', { name: 'About this proposal' });
      await inspector.getByRole('button', { name: 'Reject…' }).click();
      await inspector.getByLabel(/Reason/).fill(`Canary ${RUN}, not yet.`);
      await inspector.getByRole('button', { name: 'Reject', exact: true }).click();
      await expect(page.getByTestId('review-said')).toHaveText(
        'Rejected. Wren Writer’s workspace keeps the work.',
      );
      expectNoCanary(await traffic.all());
    });
  });

  test.describe('as writer, after the rejection', () => {
    test.use({ role: 'writer' });

    test('proposes it again', async ({ page }) => {
      const proposed = await page.request.post('/api/proposals', {
        data: { kind: 'data-source', id: made.source, description: `Canary ${RUN}, again.` },
      });
      expect(proposed.status(), await proposed.text()).toBe(201);
      made.proposal = ((await proposed.json()) as { id: string }).id;
      expectNoCanary([await proposed.text()]);
    });
  });

  test.describe('as super, approving again', () => {
    test.use({ role: 'super' });

    test('approves the change over the folder’s', async ({ page }) => {
      const approved = await page.request.post(`/api/proposals/${made.proposal}/approve`, {
        data: {},
        timeout: 90_000,
      });
      expect(approved.status(), await approved.text()).toBe(200);
      expect(
        ((await approved.json()) as { landed: { id: string; version: number }[] }).landed,
      ).toEqual([{ kind: 'data-source', id: made.landed, version: 2 }]);
      expectNoCanary([await approved.text()]);
      STORED.set(made.landed, { password: CANARY_AGAIN });
    });
  });

  test.describe('as writer, editing', () => {
    test.use({ role: 'writer' });

    test('changes a field no secret is bound to, keeping the password, tested and saved', async ({
      page,
    }) => {
      const traffic = trafficOn(page);
      await page.goto(`/explore/data-sources/${made.source}`);
      const main = page.getByRole('main');
      await main
        .getByRole('tablist', { name: 'Data source' })
        .getByRole('tab', { name: 'Connection' })
        .click();
      const panel = main.getByRole('tabpanel');
      // The database isn't the password's target (AC-312): it stays kept,
      // from the folder its proposals landed in, and isn't asked for.
      await panel.getByLabel(/^Database/).fill('postgres');
      await expect(panel.getByText(`Kept from ${FOLDER} · encrypted`)).toBeVisible();
      await expect(panel.locator('input[type="password"]')).toHaveCount(0);
      await main.getByRole('button', { name: 'Test connection' }).click();
      await expect(main.getByRole('region', { name: 'Test to save' })).toContainText(
        'Every check passed',
        { timeout: 90_000 },
      );
      await main.getByRole('button', { name: 'Save', exact: true }).click();
      await expect(main.locator('.source-settings__foot')).toContainText('Saved 1 change.');
      // Nothing sealed went: the stored password was kept, not sent again.
      const own = `/api/data-sources/${made.source}`;
      expectSealed(traffic.sent, 'PUT', new RegExp(`${own}$`), []);
      expectNoCanary(await traffic.all());
    });

    test('restores the folder’s version 1 into a draft, then changes its host, so its password is asked for again', async ({
      page,
    }) => {
      // Version 1's settings and envelope, as sealed (T515): in place of the copy.
      const restored = await page.request.post(`/api/history/data-source/${made.landed}/restore`, {
        data: { version: 1, replaceCopy: true },
      });
      expect(restored.status(), await restored.text()).toBe(201);
      made.source = ((await restored.json()) as { id: string }).id;
      expectNoCanary([await restored.text()]);
      // Version 1's envelope, as sealed then: the first canary (T581's review).
      expect(await openedNow(made.source)).toEqual({ password: CANARY });

      inSampleDb(`ALTER ROLE ${LOGIN} PASSWORD '${CANARY_TARGET}';`);
      const traffic = trafficOn(page);
      await page.goto(`/explore/data-sources/${made.source}`);
      const main = page.getByRole('main');
      await main
        .getByRole('tablist', { name: 'Data source' })
        .getByRole('tab', { name: 'Connection' })
        .click();
      const panel = main.getByRole('tabpanel');
      // Its host, the same database by its container's name: a new target (AC-312).
      await panel.getByLabel('Host').fill('wechart-sample-db');
      await expect(panel).toContainText('no longer applies');
      await expect(main.getByRole('button', { name: 'Test connection' })).toBeDisabled();
      await panel.getByLabel(/^Password/).fill(CANARY_TARGET);
      await main.getByRole('button', { name: 'Test connection' }).click();
      await expect(main.getByRole('region', { name: 'Test to save' })).toContainText(
        'Every check passed',
        { timeout: 90_000 },
      );
      // Its host and its password: "Save 2 changes".
      await main.getByRole('button', { name: 'Save 2 changes', exact: true }).click();
      await expect(main.locator('.source-settings__foot')).toContainText('Saved 2 changes.');
      const own = `/api/data-sources/${made.source}`;
      expectSealed(traffic.sent, 'POST', new RegExp(`${own}/test$`), ['password']);
      expectSealed(traffic.sent, 'PUT', new RegExp(`${own}$`), ['password']);
      expectNoCanary(await traffic.all());
      STORED.set(made.source, { password: CANARY_TARGET });
    });
  });

  test.describe('as super, copying', () => {
    test.use({ role: 'super' });

    test('copies the folder’s into their workspace, with “Edit in my workspace”', async ({
      page,
    }) => {
      const traffic = trafficOn(page);
      await page.goto(`/explore/data-sources/${made.landed}`);
      const main = page.getByRole('main');
      const original = page.url();
      await main.getByRole('button', { name: 'Edit in my workspace' }).click();
      await expect(page).not.toHaveURL(original);
      await expect(main.locator('.source-settings__status')).toHaveText('Draft');
      made.copy = decodeURIComponent(page.url().split('/').pop() ?? '');
      made.copyFolder = await projectFolderOf(page.request, 'data-source', made.copy);
      expectNoCanary(await traffic.all());
      STORED.set(made.copy, { password: CANARY_AGAIN });
    });
  });

  /**
   * Every secret field of every driver's form, each way it signs in: each
   * typed with a canary of its own, sealed in the browser as it is tested,
   * and kept as the data source made from that test.
   */
  test.describe('as writer, every driver', () => {
    test.use({ role: 'writer' });

    test('covers every way every driver signs in, and every secret field of each', () => {
      const ways = (
        list: readonly { driver: string; methodId: string; secrets: readonly string[] }[],
      ) =>
        new Set(
          list.map(
            (each) => `${each.driver}:${each.methodId}:${[...each.secrets].sort().join(',')}`,
          ),
        );
      expect(
        ways(
          SIGN_INS.map((each) => ({
            driver: each.driver,
            methodId: each.methodId,
            secrets: each.secrets.map(([, key]) => key),
          })),
        ),
      ).toEqual(
        ways(
          Object.values(DRIVERS).flatMap((spec) =>
            spec.auth.map((method) => ({
              driver: spec.type,
              methodId: method.id,
              secrets: method.fields.filter((field) => field.secret).map((field) => field.key),
            })),
          ),
        ),
      );
    });

    for (const [index, signIn] of SIGN_INS.entries())
      test(`${signIn.tile}${signIn.shape === undefined ? '' : `, ${String(signIn.shape.source.slice(1))}`}${signIn.method === undefined ? '' : `, ${signIn.method}`}`, async ({
        page,
      }) => {
        test.setTimeout(150_000);
        const traffic = trafficOn(page);
        await page.goto('/data-sources');
        await page.getByRole('button', { name: '+ Data source' }).click();
        const wizard = page.getByRole('dialog', { name: 'New data source' });
        await wizard.getByRole('radio', { name: signIn.tile }).click();
        await wizard.getByRole('button', { name: 'Next: Connection' }).click();
        if (signIn.shape !== undefined)
          await wizard.getByRole('radio', { name: signIn.shape }).click();
        if (signIn.method !== undefined)
          await wizard
            .getByRole('radiogroup', { name: 'Sign in with' })
            .getByRole('radio', { name: signIn.method, exact: true })
            .click();
        for (const [label, value] of signIn.fields) await wizard.getByLabel(label).fill(value);
        const typed: Record<string, string> = {};
        for (const [label, key, wrap] of signIn.secrets) {
          const secret = canary(`${index}-${key}`);
          TYPED.push(secret);
          typed[key] = wrap(secret);
          await wizard.getByLabel(label).fill(typed[key]);
        }
        await wizard.getByRole('button', { name: 'Next: Test' }).click();
        const tested = page.waitForResponse(
          (response) =>
            response.url() === `${BASE_URL}/api/data-sources/test` &&
            response.request().method() === 'POST',
          { timeout: 120_000 },
        );
        await wizard.getByRole('button', { name: 'Test connection' }).click();
        const answer = await tested;
        expect(answer.status(), await answer.text()).toBe(200);
        const trial = (await answer.json()) as {
          ok: boolean;
          testId: string;
          checks: { id: string; status: string }[];
        };
        // No database in compose takes it; but xcube opened what the browser
        // sealed, every secret of it (T581's review).
        expect(trial.ok).toBe(false);
        expect(trial.checks.find((check) => check.id === 'secrets')?.status).toBe('passed');
        const settings = JSON.parse(answer.request().postData() ?? '{}') as Record<string, unknown>;
        expectSealed(traffic.sent, 'POST', /\/api\/data-sources\/test$/, Object.keys(typed));

        // Made from that test, marked passed, with what the browser sealed.
        markPassed(trial.testId);
        const created = await page.request.post('/api/data-sources', {
          data: {
            ...settings,
            name: `e2e_${RUN}_${String(index)}_${signIn.driver}`,
            targetFolderId: made.folder,
            testId: trial.testId,
          },
        });
        expect(created.status(), await created.text()).toBe(201);
        const id = ((await created.json()) as { id: string }).id;
        made.drivers.push(id);
        STORED.set(id, typed);
        expectNoCanary(await traffic.all([created]));
      });
  });

  test.describe('as super, at the end', () => {
    test.use({ role: 'super' });

    test('a dump of the database holds no canary, nor the key that opens them, but the envelopes', () => {
      const text = dump();
      expectNoCanary([text]);
      // Nor the key that would open them (research `credential-sealing.md`, item 2).
      for (const form of encodingsOf(PRIVATE_KEY)) expect(text.includes(form), form).toBe(false);
      // Not a dump that passes by holding nothing: every source's envelopes,
      // sealed to the development key, its login, its proposals, and the
      // audit trail's line of its approval.
      const envelopes = inSuiteDb(
        `SELECT s.data_source_id, s.envelope ->> 'kid', s.envelope ->> 'ct' FROM data_source_secrets s ` +
          `WHERE s.data_source_id IN (${[...STORED.keys()].map((id) => `'${id}'`).join(', ')})`,
      );
      expect(envelopes.length).toBe(
        [...STORED.values()].reduce((sum, secrets) => sum + Object.keys(secrets).length, 0),
      );
      for (const [, kid, ct] of envelopes) {
        expect(kid).toBe(DEV_KID);
        expect(text).toContain(ct!);
      }
      for (const held of [
        LOGIN,
        `Canary ${RUN}, first.`,
        `Canary ${RUN}, again.`,
        `Canary ${RUN}, not yet.`,
        `Approved “${NAME}”`,
      ])
        expect(text, held).toContain(held);
    });

    test('every envelope opens with the development private key to what was typed, and with no other key', async () => {
      const rows = inSuiteDb(
        `SELECT ds.id, ds.type, s.field, s.envelope::text, ds.settings::text FROM data_sources ds ` +
          `JOIN data_source_secrets s ON s.data_source_id = ds.id WHERE ds.name LIKE 'e2e_${RUN}_%'`,
      );
      // This run's sources, all and only those it made, each with every secret it was given.
      expect(new Set(rows.map(([id]) => id))).toEqual(new Set(STORED.keys()));
      const pair = await devPair();
      const stranger = await suite.GenerateKeyPair();
      /** Opened with the development key; and refused with a random one. */
      const opens = async (
        what: string,
        envelope: Envelope,
        driver: string,
        field: string,
        fields: Record<string, unknown>,
      ) => {
        const args = [envelope, driver as DriverType, field, fields] as const;
        await expect(open(stranger, ...args), `${what} with another key`).rejects.toThrow();
        return open(pair, ...args);
      };
      const opened = new Map<string, Record<string, string>>();
      for (const [id, driver, field, envelope, settings] of rows)
        opened.set(id!, {
          ...opened.get(id!),
          [field!]: await opens(
            `${id!} ${field!}`,
            JSON.parse(envelope!) as Envelope,
            driver!,
            field!,
            JSON.parse(settings!) as Record<string, unknown>,
          ),
        });
      expect(Object.fromEntries(opened)).toEqual(Object.fromEntries(STORED));

      // And those kept beside them (T581's review): each version of the
      // folder's, and each proposal's snapshot, sealed as they were then.
      /** Each envelope of a kept body `{ driver, fields, sealed }`, opened, by field. */
      const openedIn = async (what: string, kept: string) => {
        const body = JSON.parse(kept) as {
          driver: string;
          fields: Record<string, unknown>;
          sealed: Record<string, Envelope>;
        };
        const out: Record<string, string> = {};
        for (const [field, envelope] of Object.entries(body.sealed))
          out[field] = await opens(`${what} ${field}`, envelope, body.driver, field, body.fields);
        return out;
      };
      const versions = inSuiteDb(
        `SELECT version, content -> 'body' FROM item_versions ` +
          `WHERE kind = 'data-source' AND item_id = '${made.landed}' ORDER BY version`,
      );
      const versionsOpened: [string, Record<string, string>][] = [];
      for (const [version, body] of versions)
        versionsOpened.push([version!, await openedIn(`version ${version!}`, body!)]);
      expect(versionsOpened).toEqual([
        ['1', { password: CANARY }],
        ['2', { password: CANARY_AGAIN }],
      ]);
      const snapshots = inSuiteDb(
        `SELECT p.status, i.snapshot FROM proposals p JOIN proposal_items i ON i.proposal_id = p.id ` +
          `WHERE i.kind = 'data-source' AND p.description LIKE 'Canary ${RUN},%' ORDER BY p.proposed_at`,
      );
      const snapshotsOpened: [string, Record<string, string>][] = [];
      for (const [status, snapshot] of snapshots)
        snapshotsOpened.push([status!, await openedIn(`a ${status!} proposal`, snapshot!)]);
      expect(snapshotsOpened).toEqual([
        ['approved', { password: CANARY }],
        ['rejected', { password: CANARY_AGAIN }],
        ['approved', { password: CANARY_AGAIN }],
      ]);
    });
  });
});
