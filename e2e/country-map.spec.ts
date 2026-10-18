import { expect, test, type Page } from '@playwright/test';

import { chooseChartType, expectChartType } from './chartType';
import { newChartOnCountries } from './countries';
import { wellPicker } from './wells';

/**
 * T398 / AC-305: WHEN a chart has one measure and a dimension holding ISO-3
 * country codes, THE SYSTEM SHALL offer a country map that colours each
 * country by the measure on a sequential scale with a legend, and names any
 * codes it can't place. Its boundaries are Natural Earth's 1:50m admin-0
 * units, so small states such as Singapore (SGP) are placed.
 * `Fails when: a country code in the data isn't coloured (SGP included), the
 * map has no legend, or an unplaced code isn't named.`
 *
 * AC-313: a dimension holds ISO-3 codes when every non-empty value is one,
 * unless the model marks it otherwise.
 * `Fails when: the map is offered for a dimension marked "not a country
 * code", withheld from one marked as a country code, or withheld from an
 * unmarked dimension whose values are all ISO-3 codes.`
 *
 * On the real Cube, with a cube of this browser's own (`countries.ts`).
 */

/** The gallery's card for the map: whether it can be drawn, and what it says. */
async function mapCard(page: Page) {
  await page.getByTestId('chart-type-change').click();
  const gallery = page.getByRole('dialog', { name: 'Choose chart type' });
  await gallery.getByRole('button', { name: 'All charts' }).click();
  const card = gallery.getByTestId('type-card-map');
  const found = {
    drawable: await card.getAttribute('data-drawable'),
    text: (await card.textContent()) ?? '',
  };
  // Its Close: in Safari a clicked button takes no focus, and the gallery
  // hears Escape only while focus is in it.
  await gallery.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(gallery).toHaveCount(0);
  return found;
}

test('a measure by ISO-3 codes is offered as a country map, coloured, with a legend, naming what it can’t place', async ({
  page,
  request,
}, testInfo) => {
  const cube = await newChartOnCountries(page, request, testInfo.project.name);
  await wellPicker(page, 'dimensions').selectOption(`${cube}.iso3`);
  const result = page.getByTestId('editor-result');
  // The fields' rows in: what the gallery offers is read from them.
  await expect(result.locator('svg').first()).toContainText('FRA');

  // Offered: drawable, and suggested for these fields.
  const offered = await mapCard(page);
  expect(offered.drawable).toBe('true');
  expect(offered.text).toContain('Suggested');

  await chooseChartType(page, 'map');
  await expectChartType(page, 'map');

  // Every placeable code coloured from the ramp: FRA, NOR, SGP and USA, four
  // values, four fills — so SGP too — and the rest of the world in the null
  // neutral.
  const map = result.locator('svg').first();
  await expect
    .poll(() =>
      map
        .locator('path[fill^="rgb"]')
        .evaluateAll((paths) => new Set(paths.map((path) => path.getAttribute('fill'))).size),
    )
    .toBeGreaterThanOrEqual(4);
  // The legend: the bar's two ends, and a "No data" swatch.
  await expect(map).toContainText('No data');
  await expect(map).toContainText('300');
  await expect(map).toContainText('40');
  // And French Guiana, drawn within France, named under the map.
  await expect(result.getByTestId('unplaced-codes')).toHaveText('Not on the map: GUF');
});

test('the map is offered for a dimension the model marks a country code only as the model says', async ({
  page,
  request,
}, testInfo) => {
  const cube = await newChartOnCountries(page, request, testInfo.project.name);

  // Every value an ISO-3 code, but marked "not a country code": not offered.
  await wellPicker(page, 'dimensions').selectOption(`${cube}.iso3_not_a_code`);
  await expect(page.getByTestId('editor-result').locator('svg').first()).toContainText('FRA');
  const marked = await mapCard(page);
  expect(marked.drawable).toBe('false');
  expect(marked.text).toContain(
    // "Map", in place of Country map (T934, AC-559).
    'Map needs a dimension of ISO-3 country codes in Dimensions; add 1 more.',
  );

  // Country names, marked a country code: offered, whatever the values.
  await page
    .getByTestId('well-dimensions')
    .getByRole('button', { name: /^Remove .* from Dimensions$/ })
    .click();
  await wellPicker(page, 'dimensions').selectOption(`${cube}.country_marked`);
  await expect(page.getByTestId('editor-result').locator('svg').first()).toContainText(
    'United States',
  );
  expect((await mapCard(page)).drawable).toBe('true');
});
