import { expect, test, type APIRequestContext } from '@playwright/test';

const API = 'http://localhost:4100/api';

/** A dashboard of its own, with one table chart of the secured view's count by status. */
async function securedDashboard(request: APIRequestContext) {
  const unique = `${String(Date.now())}-${String(Math.round(Math.random() * 1e6))}`;
  const title = `Secured ${unique}`;
  const dashboard = (await (
    await request.post(`${API}/documents`, { data: { kind: 'dashboard', title, folderId: 'root' } })
  ).json()) as { id: string };
  const chart = (await (
    await request.post(`${API}/documents`, {
      data: { kind: 'chart', title: 'Secured by status', folderId: 'root' },
    })
  ).json()) as { id: string };
  await request.put(`${API}/documents/chart/${chart.id}`, {
    data: {
      version: 1,
      body: {
        schemaVersion: 1,
        title: 'Secured by status',
        owner: 'admin',
        localToDashboardId: dashboard.id,
        chart: {
          source: { cube: 'secured_orders' },
          wells: {
            measures: ['secured_orders.count'],
            dimensions: ['secured_orders.status'],
            timeDimensions: [],
          },
          chartType: 'table',
        },
      },
    },
  });
  await request.put(`${API}/documents/dashboard/${dashboard.id}`, {
    data: {
      version: 1,
      body: {
        schemaVersion: 1,
        title,
        folderId: 'root',
        owner: 'admin',
        settings: { width: 'fixed' },
        pages: [
          {
            id: 'only',
            title: 'Only',
            // Taller than the window, so the canvas scrolls under the banner.
            items: [{ id: 'tile-secured', kind: 'chart', w: 6, h: 200, chartId: chart.id }],
          },
        ],
      },
    },
  });
  return { id: dashboard.id, title };
}

/**
 * F19 — security: policies and context preview.
 *
 * T171 / AC-165: THE SYSTEM SHALL list every access policy in the model with
 * its role, member-level rules, row-level filters, conditions and masking, as
 * declared.
 * Fails when: a declared policy or rule is missing from the listing.
 *
 * On the real service, from the sample model's secured view
 * (`infra/cube/model/views/secured_orders.yml`), which declares three
 * policies between them using every part the criterion names.
 */
test('the Security workspace lists every access policy the model declares, as declared', async ({
  page,
}) => {
  await page.goto('/security');
  await expect(page.getByRole('heading', { name: 'Access policies', level: 1 })).toBeVisible();

  const rows = page
    .getByRole('table', { name: 'Access policies' })
    .getByRole('row')
    .filter({ hasText: 'secured_orders' });
  await expect(rows).toHaveCount(3);
  const cells = async (index: number) => rows.nth(index).getByRole('cell').allTextContents();
  expect(await cells(0)).toEqual([
    'secured_orders',
    'managers',
    'all',
    'all rows',
    'none',
    'none',
    'views/secured_orders.yml',
  ]);
  expect(await cells(1)).toEqual([
    'secured_orders',
    'sales',
    'all except total_amount',
    'status equals shipped',
    '{ securityContext.is_employee }',
    'none',
    'views/secured_orders.yml',
  ]);
  expect(await cells(2)).toEqual([
    'secured_orders',
    'auditors, finance',
    'count, status, ordered_at',
    'all rows (none declared)',
    'none',
    'total_amount',
    'views/secured_orders.yml',
  ]);
  // The rest of the sample model has no policies: open, and said to be — the
  // cube `orders` among them, and not the secured view (T171's review).
  const open = (await page.getByTestId('policies-open').textContent()) ?? '';
  const named = (open.split(': ')[1] ?? '').replace(/\.$/, '').split(', ');
  expect(named).toContain('orders');
  expect(named).not.toContain('secured_orders');
});

/**
 * T172 / AC-166: WHEN the user edits a security context and previews a
 * dashboard, THE SYSTEM SHALL run that dashboard's queries with the edited
 * context and show a persistent banner naming the context in effect
 * (direction.md rule 21).
 * Fails when: the queries use the default context, or no banner is shown.
 *
 * Against the real Cube, whose policies on the secured view give the sales
 * group shipped orders only while it is employed (research/cube/
 * access-control.md, "Observed locally").
 */
test('a dashboard previewed as an edited security context runs as it, under a banner', async ({
  page,
  request,
}) => {
  const { title } = await securedDashboard(request);
  await page.goto('/security');
  const preview = page.getByRole('region', { name: 'Preview a security context' });
  const context = preview.getByLabel('Security context (JSON)');
  await context.fill('{"groups": ["sales"], "is_employee": true}');
  await preview.getByLabel('Find a dashboard').fill(title);

  const asked: { context?: unknown }[] = [];
  page.on('request', (sent) => {
    if (sent.url().endsWith('/api/load'))
      asked.push(JSON.parse(sent.postData() ?? '{}') as { context?: unknown });
  });
  await preview.getByRole('link', { name: `Preview ${title}` }).click();

  // Named, and staying named.
  const banner = page.getByTestId('preview-banner');
  await expect(banner).toContainText('Previewing as {"groups":["sales"],"is_employee":true}');
  // The sales group's rows: shipped only.
  const tile = page.locator('[data-tile="tile-secured"]');
  await expect(tile.getByRole('table')).toContainText('shipped', { timeout: 15_000 });
  await expect(tile.getByRole('table')).not.toContainText('completed');
  expect(asked.length).toBeGreaterThan(0);
  for (const body of asked) expect(body.context).toEqual({ groups: ['sales'], is_employee: true });
  // Persistent: still in view once the dashboard has scrolled.
  const canvas = page.locator('.dashboard__canvas');
  await tile.hover();
  await page.mouse.wheel(0, 600);
  await expect.poll(() => canvas.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await expect(banner).toBeInViewport();

  // Leaving the preview: wechart's own context again, which no policy grants.
  asked.length = 0;
  await banner.getByRole('link', { name: 'Exit preview' }).click();
  await expect(banner).toHaveCount(0);
  await expect(tile.getByRole('alert')).toBeVisible({ timeout: 15_000 });
  for (const body of asked) expect(body.context).toBeUndefined();
});

/**
 * T173 / AC-167: WHEN a preview context hides a member a chart uses, THE
 * SYSTEM SHALL show that tile as unavailable to the context rather than as an
 * error.
 * Fails when: the tile shows a raw Cube error.
 *
 * The sales group without `is_employee` fails the sales policy's condition,
 * so no policy grants it the secured view's members, and Cube answers the
 * tile's query as a hidden member (research/cube/access-control.md,
 * "Observed locally").
 */
test('a tile whose member the previewed context is not given reads as unavailable to it', async ({
  page,
  request,
}) => {
  const { id } = await securedDashboard(request);
  await page.goto(
    `/explore/dashboards/${id}?preview=${encodeURIComponent(JSON.stringify({ groups: ['sales'] }))}`,
  );

  const tile = page.locator('[data-tile="tile-secured"]');
  const unavailable = tile.getByTestId('tile-unavailable');
  await expect(unavailable).toContainText('Not available to this security context', {
    timeout: 15_000,
  });
  await expect(unavailable).toContainText('secured_orders.count');
  // Neither Cube's advice nor a failure.
  await expect(tile).not.toContainText('Please make it visible');
  await expect(tile.getByRole('alert')).toHaveCount(0);
});

/**
 * T174 / AC-168: THE SYSTEM SHALL show the generated SQL and the effective
 * filters for a chart under the previewed context.
 * Fails when: the SQL shown omits the row-level filters the policy adds.
 *
 * Against the real Cube: as the employed sales group, the secured view's
 * policy adds `status = shipped` (research/cube/access-control.md,
 * "Observed locally").
 */
test('a previewed tile shows Cube’s SQL as the context, with the row filter its policy adds', async ({
  page,
  request,
}) => {
  const { id } = await securedDashboard(request);
  const context = { groups: ['sales'], is_employee: true };
  await page.goto(
    `/explore/dashboards/${id}?preview=${encodeURIComponent(JSON.stringify(context))}`,
  );

  const tile = page.locator('[data-tile="tile-secured"]');
  await expect(tile.getByRole('table')).toContainText('shipped', { timeout: 15_000 });
  const opener = tile.getByRole('button', { name: 'SQL for Secured by status as this context' });
  // AC-004 (T233): its "SQL" is text at the floor — it was 10 px, on a state
  // the type audit's pages never opened.
  expect(
    Number.parseFloat(await opener.evaluate((node) => getComputedStyle(node).fontSize)),
  ).toBeGreaterThanOrEqual(12);
  await opener.click();

  const dialog = page.getByRole('dialog', { name: 'SQL for Secured by status as this context' });
  const sql = dialog.getByTestId('generated-sql');
  await expect(sql).toContainText('WHERE', { timeout: 15_000 });
  await expect(sql).toContainText('"orders".status = $1');
  await expect(dialog.getByTestId('generated-sql-params')).toHaveText(
    'Values bound, in order: 1 = shipped',
  );
  // Beside it, the row filter the policy declares for the context's group.
  const declared = dialog.getByRole('table', { name: 'Row filters declared for this context' });
  await expect(declared).toContainText('status equals shipped');
  await expect(declared).toContainText('{ securityContext.is_employee }');

  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
});

/**
 * T241 / AC-232: WHEN the user opens Security, THE SYSTEM SHALL offer a preset
 * context for each group the policies name, list every cube and view with the
 * access the current context gives it and why, start a dashboard preview from
 * a bounded list of dashboards that says when nothing matches, link each
 * policy to its file in Model, and keep the edited context for the session.
 * `Fails when: effective access is missing, a search with no match shows
 * nothing, a policy's source does not open Model, or the context is reset
 * after a preview.`
 *
 * With AC-228's Security half: the preview is a full-height pane beside the list.
 */
test('Security presets a group’s context, says what it can read and why, and keeps it', async ({
  page,
  request,
}) => {
  const { title } = await securedDashboard(request);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/security');
  const preview = page.getByRole('region', { name: 'Preview a security context' });
  const policies = page.getByRole('table', { name: 'Access policies' });
  await expect(policies).toBeVisible();

  // AC-228: a full-height pane beside the list — below the app bar, down to
  // the window's bottom and not past it, and to the right of the policies.
  const box = await preview.boundingBox();
  const table = await policies.boundingBox();
  expect(box?.y ?? 0).toBeGreaterThanOrEqual(48);
  const bottom = (box?.y ?? 0) + (box?.height ?? 0);
  expect(bottom).toBeGreaterThan(900 - 24);
  expect(bottom).toBeLessThanOrEqual(900);
  expect(box?.x ?? 0).toBeGreaterThanOrEqual((table?.x ?? 0) + (table?.width ?? 0));

  // The finance preset, and what finance can read from each cube and view.
  const presets = preview.getByRole('group', { name: 'Preset contexts' });
  await presets.getByRole('button', { name: 'finance' }).click();
  const context = preview.getByLabel('Security context (JSON)');
  await expect(context).toHaveValue(/"finance"/);
  const access = preview.getByRole('region', { name: 'Effective access' });
  const secured = access.getByTestId('access-secured_orders');
  await expect(secured).toContainText('Some members or rows');
  await expect(secured).toContainText('count, status, ordered_at');
  await expect(secured).toContainText('masked: total_amount');
  // Every cube and view the model reads, each with its verdict.
  for (const object of ['customers', 'monthly_orders', 'order_summary', 'orders', 'products'])
    await expect(access.getByTestId(`access-${object}`)).toContainText(
      'Everything No access policy: open to every context.',
    );
  // The sales preset alone: its condition is unmet, so Cube grants nothing
  // (AC-167's test sees the same) — and the pane says so, and why.
  await presets.getByRole('button', { name: 'sales' }).click();
  await expect(secured).toContainText('Nothing');
  await expect(secured).toContainText('only if { securityContext.is_employee }');
  // A group no policy names gets nothing from the secured view, and is told why.
  await context.fill('{"groups": ["marketing"]}');
  await expect(secured).toContainText('Nothing');
  await expect(secured).toContainText('managers');
  // Its policy's file, from the access list, opens in Model.
  await expect(secured.getByRole('link', { name: 'views/secured_orders.yml' })).toHaveAttribute(
    'href',
    '/model/files/views%2Fsecured_orders.yml',
  );

  // A search with no match says so.
  const find = preview.getByLabel('Find a dashboard');
  await find.fill('no dashboard is called this');
  await expect(preview.getByTestId('preview-no-match')).toContainText('No dashboard matches');

  // Kept through a preview: out to the dashboard and back.
  await context.fill('{"groups": ["sales"], "is_employee": true}');
  await find.fill(title);
  await preview.getByRole('link', { name: `Preview ${title}` }).click();
  await expect(page.getByTestId('preview-banner')).toBeVisible();
  await page.getByTestId('preview-banner').getByRole('link', { name: 'Exit preview' }).click();
  await page.goto('/security');
  await expect(
    page
      .getByRole('region', { name: 'Preview a security context' })
      .getByLabel('Security context (JSON)'),
  ).toHaveValue('{"groups": ["sales"], "is_employee": true}');

  // A policy's source opens its file in Model — the file itself, not only
  // its address.
  await page
    .getByRole('table', { name: 'Access policies' })
    .getByRole('link', { name: 'views/secured_orders.yml' })
    .first()
    .click();
  await expect(page).toHaveURL(/\/model\/files\/views%2Fsecured_orders\.yml$/);
  await expect(
    page.getByRole('textbox', { name: 'views/secured_orders.yml, as YAML' }),
  ).toContainText('name: secured_orders');
});
