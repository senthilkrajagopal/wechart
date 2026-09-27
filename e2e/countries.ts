import { expect, type APIRequestContext, type Page } from '@playwright/test';

import { ownCubeFile, PUBLISHED } from './model-files';
import { wellPicker } from './wells';

/**
 * A cube of ISO-3 country codes, of a browser's own (T398): the sample model
 * has none — its customers' countries are names — and a country map needs
 * one. Sales by country, one of them French Guiana, which Natural Earth draws
 * within France; and the same codes marked "not a country code", and the
 * names marked as one, for AC-313.
 */
export const countryCubeFor = (project: string) => `country_sales_${project}`;

const model = (cube: string) =>
  [
    'cubes:',
    `  - name: ${cube}`,
    '    sql: >',
    '      SELECT * FROM (VALUES',
    "        ('FRA', 'France', 120), ('NOR', 'Norway', 80), ('SGP', 'Singapore', 40),",
    "        ('USA', 'United States', 300), ('GUF', 'French Guiana', 10)",
    '      ) AS t(iso3, country, amount)',
    '    dimensions:',
    '      - name: iso3',
    '        sql: iso3',
    '        type: string',
    '      - name: iso3_not_a_code',
    '        sql: iso3',
    '        type: string',
    '        meta:',
    '          wechart:',
    '            countryCode: false',
    '      - name: country',
    '        sql: country',
    '        type: string',
    '      - name: country_marked',
    '        sql: country',
    '        type: string',
    '        meta:',
    '          wechart:',
    '            countryCode: true',
    '    measures:',
    '      - name: total',
    '        sql: amount',
    '        type: sum',
    '',
  ].join('\n');

/** The cube published, and a new chart open in the editor on it with its measure. */
export async function newChartOnCountries(
  page: Page,
  request: APIRequestContext,
  project: string,
): Promise<string> {
  const cube = countryCubeFor(project);
  await ownCubeFile(request, cube, model(cube));
  await page.goto('/explore?folder=seed-folder-0');
  await page
    .getByTestId('explore-contents')
    .getByRole('button', { name: 'New', exact: true })
    .click();
  await page
    .getByRole('menu', { name: 'New' })
    .getByRole('menuitem', { name: /Chart$/ })
    .click();
  await expect(page).toHaveURL(/\/edit\?new=true$/);
  await expect(page.getByLabel('Cube or view').locator(`option[value="${cube}"]`)).toHaveCount(
    1,
    PUBLISHED,
  );
  await page.getByLabel('Cube or view').selectOption(cube);
  await wellPicker(page, 'measures').selectOption(`${cube}.total`);
  return cube;
}
