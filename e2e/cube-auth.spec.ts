import { expect, test } from '@playwright/test';

/**
 * T175 / AC-169: IF Cube would accept unauthenticated requests, because
 * authentication checks are not enforced, THEN THE SYSTEM SHALL show a
 * persistent warning in the Security workspace.
 * Fails when: no warning is shown while Cube accepts an unauthenticated
 * request.
 *
 * The compose Cube runs in production mode and refuses unsigned requests
 * (research/cube/access-control.md, "Observed locally"): the API's probe of
 * it, end to end, reads as refused. A Cube that accepts them is not one the
 * suite can start beside it, so that answer is given to the page as the API
 * gives it (`/api/cube-auth`, whose probe of an accepting Cube is tested in
 * `packages/api/src/cube/authCheck.test.ts`).
 */
test('the Security workspace says Cube refuses unsigned requests, probing the real Cube', async ({
  page,
}) => {
  await page.goto('/security');
  const said = page.getByTestId('cube-auth');
  await expect(said).toContainText('Cube refuses requests without a valid token.', {
    timeout: 15_000,
  });
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('the Security workspace warns, and keeps warning, while Cube accepts unsigned requests', async ({
  page,
}) => {
  await page.route('**/api/cube-auth', (route) =>
    route.fulfill({ json: { auth: 'open', accepted: ['no token', 'an invalid token'] } }),
  );
  await page.goto('/security');

  const warning = page.getByRole('alert').filter({ hasText: 'Cube lets in requests' });
  await expect(warning).toContainText(
    'Cube lets in requests with no token and with an invalid token.',
  );
  await expect(warning).toContainText('It answers them as an empty security context');
  await expect(warning).toContainText('NODE_ENV=production');
  // Persistent: nothing dismisses it, and it is there on the next visit.
  await expect(warning.getByRole('button')).toHaveCount(0);
  await page.reload();
  await expect(warning).toBeVisible();
});
