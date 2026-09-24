import { expect, type Locator, type Page } from '@playwright/test';

/**
 * A chart type chosen as a person chooses one (AC-217): Change on the type
 * card, "All charts" in the gallery, and the type's card — which closes it.
 * `scope` is the page, or the editor overlay it sits in.
 */
export async function chooseChartType(scope: Page | Locator, type: string): Promise<void> {
  await scope.getByTestId('chart-type-change').click();
  const page = typeof (scope as Locator).page === 'function' ? (scope as Locator).page() : scope;
  const gallery = (page as Page).getByRole('dialog', { name: 'Choose chart type' });
  await gallery.getByRole('button', { name: 'All charts' }).click();
  await gallery.getByTestId(`type-card-${type}`).click();
  await expect(gallery).toHaveCount(0);
}

/**
 * The type the editor draws: the card writes it by name ("Auto · Bar",
 * "Stacked bar") and carries its id for a test to compare.
 */
export async function expectChartType(scope: Page | Locator, type: string): Promise<void> {
  await expect(scope.getByTestId('chart-type')).toHaveAttribute('data-chart-type', type);
}
