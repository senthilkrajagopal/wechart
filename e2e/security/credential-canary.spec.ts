import { execFileSync } from 'node:child_process';
import { createPrivateKey, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

import type { APIRequestContext, APIResponse, Page } from '@playwright/test';

import { BASE_URL, expect, signInThroughDex, test } from './fixtures';

/**
 * T368, AC-298: THE SYSTEM SHALL store data-source credentials in the
 * metadata database encrypted to xcube's public key, so neither the database
 * nor anything wechart holds can reveal them.
 * `Fails when: a credential can be read from a dump of the metadata database,
 * or from anything wechart holds, without xcube's private key.`
 *
 * The flows that keep a credential, driven as a person drives them, with a
 * canary for its password (T332's note; moved here from T352 and T356):
 * `writer` makes a data source in My workspace through the wizard, the
 * password typed and so sealed in the browser, tested and kept with its test
 * (T363, T362), proposes it to a folder, and `super` approves it from the
 * review view, which lands it there (T352) and records each step in the
 * audit trail (T368). Then the password is replaced in the workspace with a
 * second canary, sealed in the browser again, tested, saved (T335's edit),
 * proposed and approved, which lands it over the folder's. A plain
 * `pg_dump` of the suite's whole metadata database then holds neither
 * canary, nor the development private key, in any form: raw, hex, or base64
 * and base64url at each of the three alignments a longer encoded value could
 * hold it in. It does hold each source's sealed envelope.
 *
 * Part of research `credential-sealing.md`'s "AC-298 and AC-325 tests": its
 * items 1 (this driver's password, these flows) and 2. AC-298 isn't ticked
 * by it alone (T368's review).
 *
 * A canary that connects: a login made for this run in compose's sample
 * database, whose password is the canary, so xcube's test of it passes and
 * the source can be made and landed. It is dropped after.
 */
const RUN = Math.random().toString(36).slice(2, 8);
/** Only [a-z0-9-]: its JSON and URL forms are its raw form. */
const CANARY = `wcanary-${RUN}-${randomUUID()}`;
const CANARY_AGAIN = `wcanary-${RUN}-again-${randomUUID()}`;
const LOGIN = `canary_${RUN}`;
const NAME = `e2e_${RUN}_canary`;
const FOLDER = `Canary ${RUN}`;
const made = { folder: '', source: '', landed: '', proposal: '' };

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

/** A query of the suite's metadata database, as `prepare-stack.mjs` reaches it: its rows, `|`-separated. */
const inSuiteDb = (query: string) =>
  execFileSync(
    'docker',
    ['exec', 'wechart-meta', 'psql', '-U', 'wechart', '-d', 'wechart_security', '-Atc', query],
    { encoding: 'utf8' },
  )
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => line.split('|'));

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

/** The development key pair's private half, as xcube holds it (infra/xcube/README.md): its 32 bytes. */
const PRIVATE_KEY = Buffer.from(
  (
    createPrivateKey(
      readFileSync(new URL('../../infra/xcube/dev-credential-key.pem', import.meta.url), 'utf8'),
    ).export({ format: 'jwk' }) as { d: string }
  ).d,
  'base64url',
);

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
    texts.push(request.url(), JSON.stringify(request.headers()), request.postData() ?? '');
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

/** Holds no form of any of the canaries. */
function expectNoCanary(texts: readonly string[], canaries: readonly string[]) {
  expect(texts.length).toBeGreaterThan(0);
  for (const canary of canaries)
    for (const form of formsOf(canary))
      expect(
        texts.filter((text) => text.includes(form)),
        form,
      ).toEqual([]);
}

/** The bodies sent to these addresses carry the password sealed, an envelope and no more (AC-325). */
function expectSealedPassword(sent: readonly Sent[], method: string, url: RegExp) {
  const bodies = sent.filter((each) => each.method === method && url.test(each.url));
  expect(bodies.length, `${method} ${String(url)}`).toBeGreaterThan(0);
  for (const { body } of bodies) {
    const password = (JSON.parse(body) as { sealed?: { password?: Record<string, unknown> } })
      .sealed?.password;
    expect(Object.keys(password ?? {}).sort(), `${method} ${String(url)}`).toEqual([
      'ct',
      'enc',
      'kid',
      'v',
    ]);
  }
}

test.describe.configure({ mode: 'serial' });

test.describe('a data source’s password, at rest (T368, AC-298)', () => {
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
      if (made.source !== '') {
        await signInThroughDex(page, 'writer');
        await removed(`/api/data-sources/${made.source}`);
        await context.clearCookies();
      }
      await signInThroughDex(page, 'super');
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

    test('makes it with the canary for its password, tested, and proposes it', async ({ page }) => {
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
      await wizard.getByLabel(/^Password/).fill(CANARY);
      await wizard.getByRole('button', { name: 'Next: Test' }).click();
      await wizard.getByRole('button', { name: 'Test connection' }).click();
      await expect(wizard.getByRole('list', { name: 'Checks' }).getByRole('listitem')).toHaveText(
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
      await page.getByRole('menuitem', { name: 'Propose…' }).click();
      const dialog = page.getByRole('dialog', { name: `Propose to ${FOLDER}` });
      await dialog.getByLabel('What changed').fill(`Canary ${RUN}, first.`);
      await dialog.getByRole('button', { name: 'Propose', exact: true }).click();
      await expect(dialog).toHaveCount(0);
      await expect(row.getByRole('cell').nth(1)).toHaveText('Waiting for review');
      made.proposal = await proposalOf(page.request, made.source);

      // The test and the save each carried the password, sealed (AC-325).
      expectSealedPassword(traffic.sent, 'POST', /\/api\/data-sources\/test$/);
      expectSealedPassword(traffic.sent, 'POST', /\/api\/data-sources$/);
      expectNoCanary(await traffic.all(), [CANARY]);
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
      expectNoCanary(await traffic.all([sources]), [CANARY]);
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
      const own = new RegExp(`/api/data-sources/${made.source}`);
      expectSealedPassword(traffic.sent, 'POST', new RegExp(`${own.source}/test$`));
      expectSealedPassword(traffic.sent, 'PUT', new RegExp(`${own.source}$`));
      expectNoCanary(await traffic.all([proposed]), [CANARY, CANARY_AGAIN]);
    });
  });

  test.describe('as super, at the end', () => {
    test.use({ role: 'super' });

    test('approves the change over the folder’s, and a dump of the database holds neither canary', async ({
      page,
    }) => {
      const approved = await page.request.post(`/api/proposals/${made.proposal}/approve`, {
        data: {},
        timeout: 90_000,
      });
      expect(approved.status(), await approved.text()).toBe(200);
      expect(
        ((await approved.json()) as { landed: { id: string; version: number }[] }).landed,
      ).toEqual([{ kind: 'data-source', id: made.landed, version: 2 }]);
      expectNoCanary([await approved.text()], [CANARY, CANARY_AGAIN]);

      // Each source holds its password as one envelope, sealed to the
      // development key: the folder's landed as the workspace's was sealed.
      const kid = (
        JSON.parse(
          readFileSync(
            new URL('../../infra/xcube/dev-credential-key.pub.jwk', import.meta.url),
            'utf8',
          ),
        ) as { kid: string }
      ).kid;
      const envelopes = inSuiteDb(
        `SELECT data_source_id, envelope ->> 'kid', envelope ->> 'ct' FROM data_source_secrets ` +
          `WHERE field = 'password' AND data_source_id IN ('${made.source}', '${made.landed}') ` +
          `ORDER BY data_source_id = '${made.landed}'`,
      );
      expect(envelopes.map(([id, kidOf]) => [id, kidOf])).toEqual([
        [made.source, kid],
        [made.landed, kid],
      ]);
      expect(envelopes[1]![2]).toBe(envelopes[0]![2]);

      const text = dump();
      expectNoCanary([text], [CANARY, CANARY_AGAIN]);
      // Nor the key that would open them (research `credential-sealing.md`, item 2).
      for (const form of encodingsOf(PRIVATE_KEY)) expect(text.includes(form), form).toBe(false);
      // Not a dump that passes by holding nothing: the envelope is in it, and
      // the source in the folder and in the workspace, with its login, its
      // proposals, and the audit trail's records of them.
      for (const held of [
        envelopes[0]![2]!,
        made.source,
        made.landed,
        LOGIN,
        `Canary ${RUN}, first.`,
        `Canary ${RUN}, again.`,
        `Approved “${NAME}”`,
      ])
        expect(text, held).toContain(held);
    });
  });
});
