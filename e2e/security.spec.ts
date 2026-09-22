import { expect, test } from '@playwright/test';

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
  // The rest of the sample model has no policies: open, and said to be.
  await expect(page.getByTestId('policies-open')).toContainText('orders');
});
