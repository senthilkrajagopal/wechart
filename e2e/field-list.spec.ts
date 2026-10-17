import { createPrivateKey } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { expect, test } from '@playwright/test';

import { cubePicker } from './cubePicker';
import { kidOf } from './tokens';

/**
 * AC-025: WHEN the user opens the chart editor, THE SYSTEM SHALL list the cubes
 * and views available from `/v1/meta` and, once one is chosen, its measures,
 * dimensions, segments and time dimensions grouped by type.
 *
 * AC-007: WHEN the browser needs data or metadata, THE SYSTEM SHALL obtain it
 * through the wechart API, and the browser SHALL make no request to the Cube
 * API host.
 *
 * AC-007 has waited since T004 for this: until the browser genuinely needed
 * metadata, "no request went to Cube" was true of a page that made no requests
 * at all. Here the page must fetch, so the assertion can fail.
 */
const CUBE_HOST_PORT = '54000';

test('lists the cubes and views from the model', async ({ page }) => {
  await page.goto('/explore/charts/seed-chart-empty/edit');

  const picker = cubePicker(page);
  await expect(picker.button).toBeVisible();

  const options = await picker.titles();
  expect(options).toContain('Orders');
  expect(options).toContain('Customers');
  expect(options).toContain('Products');

  /**
   * AC-176 (T405's audit): the option the keys are on is seen, as the search
   * palette's is, in the soft accent and the accent's ink, not a hover's
   * shade a keyboard user can't tell from the list's own.
   */
  await page.keyboard.press('ArrowDown');
  const active = picker.list.locator('.cube-picker__option[aria-selected="true"]');
  await expect(active).toHaveCount(1);
  const accent = await page.evaluate(() => {
    const probe = document.createElement('span');
    probe.style.background = 'var(--wc-bg-accent-soft)';
    probe.style.color = 'var(--wc-accent)';
    probe.style.boxShadow = 'inset 3px 0 0 var(--wc-accent)';
    document.body.append(probe);
    const said = getComputedStyle(probe);
    const all = { background: said.backgroundColor, color: said.color, bar: said.boxShadow };
    probe.remove();
    return all;
  });
  await expect(active).toHaveCSS('background-color', accent.background);
  await expect(active.locator('.cube-picker__title')).toHaveCSS('color', accent.color);
  // And a bar in the accent at its start: the shade and ink alone are under
  // 3:1 against the list (T405's review).
  await expect(active).toHaveCSS('box-shadow', accent.bar);
});

/**
 * T742 (AC-329, AC-343; design 10, state D; D10-01, D10-02; design-10-Q7): a
 * chart made in Shared, as New › Chart makes one, stores its folder, so its
 * picker lists the cubes on that path under "Shared", each with "Shared" at
 * the right, as Filter on's already does. And the search's text starts after
 * its icon and a 6 px gap, as design 10's `.input` (padding 0 8, gap 6) has it.
 */
test('a Shared chart’s picker lists its cubes under “Shared”, each with its path, and the search text clears its icon (T742)', async ({
  page,
}) => {
  const made = await page.request.post('/api/documents', {
    data: {
      kind: 'chart',
      title: `Picker path ${Math.random().toString(36).slice(2, 8)}`,
      folderId: 'root',
    },
  });
  expect(made.status()).toBe(201);
  const { id } = (await made.json()) as { id: string };
  try {
    await page.goto(`/explore/charts/${encodeURIComponent(id)}/edit`);
    const picker = cubePicker(page);
    const list = await picker.open();
    await expect(list.locator('.cube-picker__option').first()).toBeVisible();

    await expect(list.locator('.cube-picker__group')).toHaveText(['Shared']);
    const paths = await list.locator('.cube-picker__option .cube-picker__path').allTextContents();
    expect(paths.length).toBeGreaterThan(0);
    expect(new Set(paths)).toEqual(new Set(['Shared']));
    // The C / V chip at 12/600, not design 10's 11 (D10-03; components-Q5).
    const chip = list.locator('.cube-picker__option .cube-picker__kind').first();
    await expect(chip).toHaveCSS('font-size', '12px');
    await expect(chip).toHaveCSS('font-weight', '600');

    const measured = await page.evaluate(() => {
      const glyph = document.querySelector('.cube-picker__glyph')!.getBoundingClientRect();
      const input = document.querySelector<HTMLInputElement>('.cube-picker__search')!;
      const box = input.getBoundingClientRect();
      const said = getComputedStyle(input);
      return {
        glyphInset: glyph.left - box.left,
        textStart:
          box.left + Number.parseFloat(said.borderLeftWidth) + Number.parseFloat(said.paddingLeft),
        glyphEnd: glyph.right,
      };
    });
    // The icon where `.input`'s padding puts it: its 1 px border and 8 px.
    expect(measured.glyphInset).toBe(9);
    expect(measured.textStart - measured.glyphEnd).toBe(6);
  } finally {
    await page.request.delete(`/api/documents/chart/${encodeURIComponent(id)}`);
  }
});

test('shows a chosen cube’s members grouped by type', async ({ page }) => {
  await page.goto('/explore/charts/seed-chart-empty/edit');
  await expect(page.getByTestId('no-cube-chosen')).toBeVisible();

  await cubePicker(page).selectOption({ label: 'Orders' });

  // Measures, dimensions and time dimensions are separate groups.
  await expect(page.getByTestId('group-measure')).toBeVisible();
  await expect(page.getByTestId('group-dimension')).toBeVisible();
  await expect(page.getByTestId('group-timeDimension')).toBeVisible();

  // Every member the model declares is present.
  await expect(page.getByTestId('member-orders.count')).toBeVisible();
  await expect(page.getByTestId('member-orders.total_amount')).toBeVisible();
  await expect(page.getByTestId('member-orders.average_amount')).toBeVisible();
  await expect(page.getByTestId('member-orders.status')).toBeVisible();

  // The time dimension is in the time group, not among the plain dimensions.
  await expect(
    page.getByTestId('group-timeDimension').getByTestId('member-orders.ordered_at'),
  ).toBeVisible();
});

test('the browser asks wechart for metadata and never Cube (AC-007)', async ({ page }) => {
  const requested: string[] = [];
  page.on('request', (request) => requested.push(request.url()));

  await page.goto('/explore/charts/seed-chart-empty/edit');
  await cubePicker(page).selectOption({ label: 'Orders' });
  await expect(page.getByTestId('member-orders.count')).toBeVisible();

  // It really did fetch metadata -- otherwise the next assertion proves nothing.
  expect(requested.filter((url) => url.includes('/api/meta'))).not.toHaveLength(0);
  // ...and nothing went to the Cube host.
  expect(requested.filter((url) => url.includes(`:${CUBE_HOST_PORT}`))).toEqual([]);
  expect(requested.filter((url) => url.includes('/cubejs-api/'))).toEqual([]);
});

test('no response reaching the browser carries the Cube secret (AC-007)', async ({ page }) => {
  const bodies: string[] = [];
  page.on('response', async (response) => {
    if (!response.url().includes('/api/')) return;
    bodies.push(await response.text().catch(() => ''));
  });

  await page.goto('/explore/charts/seed-chart-empty/edit');
  await cubePicker(page).selectOption({ label: 'Orders' });
  await expect(page.getByTestId('member-orders.count')).toBeVisible();

  expect(bodies.some((body) => body.includes('dev-secret'))).toBe(false);
});

/**
 * AC-326: `Fails when: … a response to the browser contains the signing key
 * or the service credential.` The API holds the development query signing key
 * and service key (`infra/xcube/`); through a dashboard's queries, the
 * chart editor's field list and the Security page's scope probes, no response or header reaching the browser holds
 * either private key, in any form, nor a service token (one naming the
 * service key's id).
 */
test('no response reaching the browser carries the query signing key or the service credential (AC-326)', async ({
  page,
}) => {
  /** Each response's headers, and its body (`body`), as the browser got them. */
  const said: { url: string; body: boolean; text: string }[] = [];
  // Every response's reading, awaited before the checks, so none is missed.
  const reading: Promise<void>[] = [];
  page.on('response', (response) => {
    const url = response.url();
    if (!url.includes('/api/')) return;
    reading.push(
      (async () => {
        said.push({ url, body: false, text: JSON.stringify(await response.allHeaders()) });
        said.push({ url, body: true, text: await response.text().catch(() => '') });
      })(),
    );
  });
  const keys = ['dev-signing-key.pem', 'dev-service-key.pem'].map((file) =>
    readFileSync(new URL(`../infra/xcube/${file}`, import.meta.url), 'utf8'),
  );
  // Each key as PEM lines and as its private JWK members.
  const secrets = keys.flatMap((pem) => {
    const jwk = createPrivateKey(pem).export({ format: 'jwk' });
    return [
      ...pem.split('\n').filter((line) => line.length >= 40),
      ...(['d', 'p', 'q', 'dp', 'dq', 'qi'] as const).map((member) => String(jwk[member])),
    ];
  });
  const serviceKid = kidOf(keys[1]!);

  const loaded = page.waitForResponse(
    (response) => response.url().endsWith('/api/load') && response.status() === 200,
  );
  await page.goto('/explore/dashboards/seed-root-dashboard-1');
  await loaded;
  // Read before leaving the page, which would discard the bodies.
  await Promise.all(reading);
  await page.goto('/explore/charts/seed-chart-empty/edit');
  await cubePicker(page).selectOption({ label: 'Orders' });
  await expect(page.getByTestId('member-orders.count')).toBeVisible();
  await Promise.all(reading);
  // And the Security page, whose scope probes sign query tokens and use the
  // service credential (T437).
  await page.goto('/security');
  const scopes = page.getByRole('table', { name: 'Cube API scopes' });
  await expect(scopes.getByTestId('scope-jobs')).toHaveText('Granted', { timeout: 15_000 });

  await Promise.all(reading);

  // It really did query, read the field list and probe the scopes, and their
  // bodies were read: otherwise this proves nothing.
  for (const route of ['/api/load', '/api/meta', '/api/cube-scopes'])
    expect(
      said.some(({ url, body, text }) => url.includes(route) && body && text !== ''),
      route,
    ).toBe(true);
  const holding = (secret: string) =>
    said.filter(({ text }) => text.includes(secret)).map(({ url }) => url);
  for (const secret of secrets) expect(holding(secret)).toEqual([]);
  expect(holding(serviceKid)).toEqual([]);
  // A token's `kid` is in its base64url header, not in plain text: so each
  // JWT-shaped string is read, and none is a service token.
  const serviceTokens = said.flatMap(({ url, text }) =>
    [...text.matchAll(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g)].flatMap(([jwt]) => {
      try {
        const header = JSON.parse(
          Buffer.from(jwt.split('.')[0]!, 'base64url').toString('utf8'),
        ) as { kid?: unknown };
        return header.kid === serviceKid ? [url] : [];
      } catch {
        return [];
      }
    }),
  );
  expect(serviceTokens).toEqual([]);
});
