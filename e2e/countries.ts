import { expect, type APIRequestContext, type Page } from '@playwright/test';

import { cubePicker } from './cubePicker';
import { ownCubeFile, PUBLISHED } from './model-files';
import { wellPicker } from './wells';
import { newInMyWorkspace } from './workspace';

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
    "        ('FRA', 'France', 120, 48.8566, 2.3522), ('NOR', 'Norway', 80, 59.9139, 10.7522),",
    "        ('SGP', 'Singapore', 40, 1.3521, 103.8198), ('USA', 'United States', 300, 40.7128, -74.006),",
    "        ('GUF', 'French Guiana', 10, 4.9224, -52.3135)",
    '      ) AS t(iso3, country, amount, lat, lng)',
    '    dimensions:',
    // Where each sale was made, for the Map's Points layer (T976): Cube's
    // `geo` type, written "lat,lng" (research/cube-geo-values.md).
    '      - name: location',
    '        type: geo',
    '        latitude:',
    '          sql: lat',
    '        longitude:',
    '          sql: lng',
    // The same, with French Guiana's sale nowhere: a row with no location.
    '      - name: location_but_guf',
    '        type: geo',
    '        latitude:',
    "          sql: \"CASE WHEN iso3 = 'GUF' THEN NULL ELSE lat END\"",
    '        longitude:',
    '          sql: lng',
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
  // New in My workspace, to go to Finance, as the single user makes one (T359).
  await newInMyWorkspace(page, 'Chart', 'seed-folder-0');
  await expect(page).toHaveURL(/\/edit\?new=true$/);
  const picker = cubePicker(page);
  await picker.open();
  await expect(picker.optionOf(cube)).toHaveCount(1, PUBLISHED);
  await picker.selectOption(cube);
  await wellPicker(page, 'measures').selectOption(`${cube}.total`);
  return cube;
}
