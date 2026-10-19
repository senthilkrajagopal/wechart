import { expect, type APIRequestContext, type Page } from '@playwright/test';

import { cubePicker } from './cubePicker';
import { ownCubeFile, PUBLISHED } from './model-files';
import { wellPicker } from './wells';
import { newInMyWorkspace } from './workspace';

/**
 * A cube of German states, of a browser's own (T975): the sample model has
 * no first-level subdivisions. Revenue by state, by ISO 3166-2 code and, for
 * Bavaria and Berlin, by English name; Bremen has no row; "Online" is no
 * state at all.
 */
export const stateCubeFor = (project: string) => `state_sales_${project}`;

const STATES: readonly [string, number][] = [
  ['DE-BW', 900],
  ['Bavaria', 1400],
  ['Berlin', 300],
  ['DE-BB', 120],
  ['DE-HH', 260],
  ['DE-HE', 610],
  ['DE-MV', 80],
  ['DE-NI', 500],
  ['DE-NW', 1200],
  ['DE-RP', 330],
  ['DE-SL', 60],
  ['DE-SN', 270],
  ['DE-ST', 140],
  ['DE-SH', 190],
  ['DE-TH', 150],
  ['Online', 75],
];

const model = (cube: string) =>
  [
    'cubes:',
    `  - name: ${cube}`,
    '    sql: >',
    '      SELECT * FROM (VALUES',
    STATES.map(([state, amount]) => `        ('${state}', ${String(amount)})`).join(',\n'),
    '      ) AS t(state, amount)',
    '    dimensions:',
    '      - name: state',
    '        sql: state',
    '        type: string',
    '    measures:',
    '      - name: total',
    '        sql: amount',
    '        type: sum',
    '',
  ].join('\n');

/** The cube published, and a new chart open in the editor on it, by state. */
export async function newChartOnStates(
  page: Page,
  request: APIRequestContext,
  project: string,
): Promise<string> {
  const cube = stateCubeFor(project);
  await ownCubeFile(request, cube, model(cube));
  await newInMyWorkspace(page, 'Chart', 'seed-folder-0');
  await expect(page).toHaveURL(/\/edit\?new=true$/);
  const picker = cubePicker(page);
  await picker.open();
  await expect(picker.optionOf(cube)).toHaveCount(1, PUBLISHED);
  await picker.selectOption(cube);
  await wellPicker(page, 'measures').selectOption(`${cube}.total`);
  await wellPicker(page, 'dimensions').selectOption(`${cube}.state`);
  return cube;
}
