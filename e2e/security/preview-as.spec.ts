import { expect, test } from './fixtures';

/**
 * T438 (AC-166; design 08 of 2026-09-27, state E): a Super-Admin previews a
 * dashboard as two AD groups. The groups are chosen as chips. The page says
 * what they reach, each folder by its path and how. The dashboard, opened
 * from there, runs every query as exactly those groups, under a banner
 * naming them. "Stop preview" leaves it.
 *
 *   /Previewed <run>        read-only  sales-ro
 *   /Previewed <run>/EMEA   read-only  emea-viewers-<run>
 */
const RUN = Math.random().toString(36).slice(2, 8);
const EMEA = `emea-viewers-${RUN}`;

test.describe('Preview as groups (T438, AC-166)', () => {
  test.use({ role: 'super' });

  test('previews a dashboard as two groups, every query carrying exactly those, under a banner naming them', async ({
    page,
  }) => {
    const request = page.request;
    const made = async (data: Record<string, unknown>) => {
      const answer = await request.post('/api/documents', { data });
      expect(answer.status(), await answer.text()).toBe(201);
      return ((await answer.json()) as { id: string }).id;
    };
    const top = await made({ kind: 'folder', title: `Previewed ${RUN}`, folderId: 'root' });
    const emea = await made({ kind: 'folder', title: 'EMEA', folderId: top });
    const board = await made({ kind: 'dashboard', title: `Preview board ${RUN}`, folderId: top });
    // One tile, so the preview asks Cube something: a chart on the seeded `orders`.
    const chart = await made({ kind: 'chart', title: `Orders ${RUN}`, folderId: top });
    const saved = await request.put(`/api/documents/chart/${chart}`, {
      data: {
        version: 1,
        body: {
          schemaVersion: 1,
          title: `Orders ${RUN}`,
          folderId: top,
          chart: {
            source: { cube: 'orders' },
            wells: { measures: ['orders.count'], dimensions: [], timeDimensions: [] },
          },
        },
      },
    });
    expect(saved.status(), await saved.text()).toBe(200);
    const shown = await request.put(`/api/documents/dashboard/${board}`, {
      data: {
        version: 1,
        body: {
          schemaVersion: 1,
          title: `Preview board ${RUN}`,
          folderId: top,
          pages: [
            { id: 'p1', title: 'Page 1', items: [{ id: 't1', kind: 'chart', chartId: chart }] },
          ],
        },
      },
    });
    expect(shown.status(), await shown.text()).toBe(200);
    try {
      for (const [id, access] of [
        [top, { readOnly: ['sales-ro'], readWrite: null }],
        [emea, { readOnly: [EMEA], readWrite: null }],
      ] as const)
        expect((await request.put(`/api/folders/${id}/access`, { data: access })).status()).toBe(
          200,
        );

      await page.goto('/security/preview');
      const main = page.getByRole('main');
      const pane = main.getByRole('region', { name: 'Preview as groups' });
      await expect(pane).toContainText('Choose one or more AD groups to preview as.');
      const picker = pane.getByRole('combobox', { name: 'AD group' });
      for (const group of ['sales-ro', EMEA]) {
        await picker.fill(group);
        await picker.press('Enter');
      }
      await expect(pane.getByRole('list', { name: 'Groups' }).getByRole('listitem')).toHaveText([
        'sales-ro',
        EMEA,
      ]);
      // What they reach, by path and how: this run's folders among them.
      const reach = pane.getByRole('list', { name: 'What these groups reach' });
      await expect(reach.getByRole('listitem').filter({ hasText: `Previewed ${RUN}` })).toHaveText([
        `Shared / Previewed ${RUN} · view only`,
        `Shared / Previewed ${RUN} / EMEA · view only`,
      ]);

      // Every query the previewed dashboard makes carries exactly those groups.
      const contexts: unknown[] = [];
      page.on('request', (sent) => {
        if (sent.url().endsWith('/api/load') && sent.method() === 'POST')
          contexts.push((sent.postDataJSON() as { context?: unknown }).context);
      });
      await pane
        .getByRole('searchbox', { name: 'Dashboard to preview' })
        .fill(`Preview board ${RUN}`);
      await pane.getByRole('link', { name: `Preview Preview board ${RUN}` }).click();
      await expect(page).toHaveURL(new RegExp(`/dashboards/${board}`));
      const banner = page.getByTestId('preview-banner');
      await expect(banner).toContainText(`Previewing as sales-ro and ${EMEA}.`);
      // Its tile asked, and every ask carried the groups and nothing else.
      await expect.poll(() => contexts.length).toBeGreaterThan(0);
      for (const context of contexts) expect(context).toEqual({ groups: ['sales-ro', EMEA] });

      // Stopped, the dashboard is the Super-Admin's own again.
      await banner.getByRole('link', { name: 'Stop preview' }).click();
      await expect(page.getByTestId('preview-banner')).toHaveCount(0);
    } finally {
      await request.delete(`/api/documents/dashboard/${board}`);
      await request.delete(`/api/documents/chart/${chart}`);
      await request.delete(`/api/documents/folder/${emea}`);
      await request.delete(`/api/documents/folder/${top}`);
    }
  });
});
