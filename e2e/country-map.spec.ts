import { expect, test, type Page } from '@playwright/test';

import { chooseChartType, expectChartType } from './chartType';
import { newChartOnCountries } from './countries';
import { newChartOnStates } from './regions';
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

/**
 * T973 / AC-622: one Map type, in place of the Country map, taking a Boundary
 * set (Countries; Admin-1, by country; or a custom set) and up to three
 * layers, Regions, Points and Density. The real surface: the chart editor's
 * Map wells, on the real Cube. Admin-1 is drawn from T975.
 */
test('the Map’s wells offer its boundary sets and three layers, Regions drawn from its fields', async ({
  page,
  request,
}, testInfo) => {
  const cube = await newChartOnCountries(page, request, testInfo.project.name);
  await wellPicker(page, 'dimensions').selectOption(`${cube}.iso3`);
  const result = page.getByTestId('editor-result');
  await expect(result.locator('svg').first()).toContainText('FRA');
  await chooseChartType(page, 'map');
  await expectChartType(page, 'map');

  const set = page.getByRole('combobox', { name: 'Boundary set' });
  await expect(set).toHaveValue('countries');
  // The built-in sets; a folder's custom sets follow in their own group (T979).
  await expect(set.locator(':scope > option')).toHaveText(['Countries', 'Admin-1, by country']);
  for (const layer of ['Regions layer', 'Points layer', 'Density layer'])
    await expect(page.getByRole('heading', { name: layer })).toBeVisible();
  await expect(page.getByTestId('map-layer-regions')).toContainText(/ coloured by /);
  await expect(result.getByTestId('unplaced-codes')).toHaveText('Not on the map: GUF');

  // On Admin-1 (drawn since T975), ISO-3 codes name no country's regions,
  // which it says; no country checked against it.
  await set.selectOption('admin1');
  await expect(result.locator('svg').first()).toContainText(
    /None of .*Iso3’s values match Admin-1\./,
  );
  await expect(result.getByTestId('unplaced-codes')).toHaveCount(0);

  // Back on Countries, the map is as it was.
  await set.selectOption('countries');
  await expect(result.getByTestId('unplaced-codes')).toHaveText('Not on the map: GUF');
  await expect(result.locator('svg').first()).toContainText('No data');
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

/**
 * T976 / AC-625: THE SYSTEM SHALL draw a Points layer from a geo dimension's
 * latitude and longitude as area-proportional circles 8–24 px across at 0.72
 * with a 1 px surface ring, in categorical slot 2 over a Regions layer …
 * `Fails when: a point is placed off its latitude and longitude; its size
 * isn't proportional by area within 1 %, or outside 8–24 px; points over
 * regions take slot 1; …`
 *
 * On the real Cube: the cube's `location` is a `geo` dimension, so its value
 * is Cube's own "lat,lng", asked by the layer's own query.
 */
test('a Points layer draws each place from a geo dimension over the regions, sized by area', async ({
  page,
  request,
}, testInfo) => {
  const cube = await newChartOnCountries(page, request, testInfo.project.name);
  await wellPicker(page, 'dimensions').selectOption(`${cube}.iso3`);
  const result = page.getByTestId('editor-result');
  await expect(result.locator('svg').first()).toContainText('FRA');
  await chooseChartType(page, 'map');
  await expectChartType(page, 'map');

  await page.getByTestId('add-mapPoints').click();
  await page.getByTestId(`pick-${cube}.location`).click();
  await page.getByTestId('add-mapPointsSize').click();
  await page.getByTestId(`pick-${cube}.total`).click();

  // Five places, in slot 2 (the ramp is slot 1's hue), never slot 1.
  const map = result.locator('svg').first();
  const points = map.locator('path[fill="#eb6834"]');
  await expect(points).toHaveCount(5);
  await expect(map.locator('path[fill="#2a78d6"]')).toHaveCount(0);
  // 8 px across for the least (French Guiana, 10), 24 px for the most (the
  // United States, 300), each with its 1 px ring.
  const across = await points.evaluateAll((paths) =>
    paths.map((path) => path.getBoundingClientRect().width),
  );
  expect(Math.min(...across)).toBeGreaterThan(8 - 0.5);
  expect(Math.min(...across)).toBeLessThan(9 + 0.5);
  expect(Math.max(...across)).toBeGreaterThan(24 - 0.5);
  expect(Math.max(...across)).toBeLessThan(25 + 0.5);

  // Each place where it is: told apart by size (GUF 10, SGP 40, NOR 80,
  // FRA 120, USA 300), they run west to east by longitude and north to
  // south by latitude — which a swapped "lat,lng" would not.
  const placed = await points.evaluateAll((paths) =>
    paths
      .map((path) => {
        const box = path.getBoundingClientRect();
        return { size: box.width, x: box.x + box.width / 2, y: box.y + box.height / 2 };
      })
      .sort((one, other) => one.size - other.size),
  );
  const [guf, sgp, nor, fra, usa] = placed as [
    (typeof placed)[0],
    (typeof placed)[0],
    (typeof placed)[0],
    (typeof placed)[0],
    (typeof placed)[0],
  ];
  const westToEast = [usa, guf, fra, nor, sgp].map((one) => one.x);
  expect(westToEast).toEqual([...westToEast].sort((one, other) => one - other));
  const northToSouth = [nor, fra, usa, guf, sgp].map((one) => one.y);
  expect(northToSouth).toEqual([...northToSouth].sort((one, other) => one - other));
  await expect(result.getByTestId('map-unlocated')).toHaveCount(0);

  // A location two rows have none of: three drawn, the two counted under the
  // map, though grouped by place they are one row (checkpoint 4's review).
  await page
    .getByTestId('map-layer-points')
    .getByRole('button', { name: /^Remove .* from Points layer$/ })
    .click();
  await page.getByTestId('add-mapPoints').click();
  await page.getByTestId(`pick-${cube}.location_some_unknown`).click();
  await expect(points).toHaveCount(3);
  await expect(result.getByTestId('map-unlocated')).toHaveText(
    /^2 country sales \S+ have no location\.$/,
  );
});

/**
 * T977 / AC-626: THE SYSTEM SHALL draw a Density layer from a geo dimension
 * on §5's sequential ramp fading to transparent, regions drawn as 1 px
 * `border-strong` outlines while it shows; and SHALL never mark from it, its
 * layer row and tooltip saying "Density can't be marked; it shows where
 * points gather".
 * `Fails when: density is drawn in another ramp; regions keep their fill
 * under it; a gesture on it marks anything; or the sentence is missing from
 * the layer row or the tooltip.`
 */
test('a Density layer draws where places gather, the regions as outlines, and says it can’t be marked', async ({
  page,
  request,
}, testInfo) => {
  const cube = await newChartOnCountries(page, request, testInfo.project.name);
  await wellPicker(page, 'dimensions').selectOption(`${cube}.iso3`);
  const result = page.getByTestId('editor-result');
  await expect(result.locator('svg').first()).toContainText('FRA');
  await chooseChartType(page, 'map');
  await expectChartType(page, 'map');
  const map = result.locator('svg').first();
  await expect(map.locator('path[fill^="rgb"]').first()).toBeAttached();

  await page.getByTestId('add-mapDensity').click();
  await page.getByTestId(`pick-${cube}.location`).click();
  // The layer's row says so.
  await expect(page.getByTestId('map-layer-density')).toContainText(
    "Density can't be marked; it shows where points gather",
  );
  // Drawn: the heatmap's picture over the map, the regions with no ramp
  // fill, outlined 1 px in border-strong, and no "No data" swatch.
  await expect(map.locator('image')).toHaveCount(1);
  await expect(map.locator('path[fill^="rgb"]')).toHaveCount(0);
  await expect(map.locator('path[stroke="#c9c7c1"]').first()).toBeAttached();
  await expect(map).not.toContainText('No data');
  // Its tooltip, over a region, says it too.
  const box = (await map.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.52, box.y + box.height * 0.3);
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.32);
  const tip = result.locator('.chart-canvas div').filter({ hasText: "Density can't be marked" });
  await expect(tip.first()).toBeVisible();
});

/**
 * T975 / AC-624: a Regions layer on §5's sequential ramp with a legend and
 * the "No data" swatch, a region with no row in the null neutral, and 0.5 px
 * surface boundaries, on every boundary set. AC-622 (R83): Admin-1 is each
 * country's ISO 3166-2 top tier. AC-623 (R83): placed by ISO 3166-2 code or
 * English name; what it can't place named under the map.
 *
 * On the real Cube, with a cube of German states of this browser's own
 * (`regions.ts`), Bavaria and Berlin by name, Bremen with no row.
 */
test('a Regions layer on Admin-1 colours German states by code or name, Bremen as no data, naming what it can’t place', async ({
  page,
  request,
}, testInfo) => {
  await newChartOnStates(page, request, testInfo.project.name);
  const result = page.getByTestId('editor-result');
  await chooseChartType(page, 'map');
  await expectChartType(page, 'map');
  await page.getByRole('combobox', { name: 'Boundary set' }).selectOption('admin1');

  const map = result.locator('svg').first();
  // The 15 states with a row, each its own ramp colour: the larger, darker.
  await expect
    .poll(() =>
      map
        .locator('path[fill^="rgb"]')
        .evaluateAll((paths) => new Set(paths.map((path) => path.getAttribute('fill'))).size),
    )
    .toBeGreaterThanOrEqual(12);
  // Bremen, with no row, in the null neutral; the legend's ends and "No data".
  await expect(map.locator('path[fill="#b3b1ab"]').first()).toBeAttached();
  await expect(map).toContainText('No data');
  await expect(map).toContainText('1,400');
  await expect(map).toContainText('60');
  // Boundaries 0.5 px in the surface colour.
  await expect(map.locator('path[stroke-width="0.5"]').first()).toBeAttached();
  // And "Online", no state, named under the map.
  await expect(result.getByTestId('unplaced-codes')).toHaveText(
    'Not on the map: "Online" (no region)',
  );

  /**
   * T980 / AC-629: a text alternative naming the measure, the set, the
   * regions, the extremes and those with no data, Natural Earth's point of
   * view said (R83); and a table view by region, "No data" where a region
   * has no row, never 0.
   */
  await expect(result.getByTestId('chart-text-alternative')).toHaveText(
    /^Map of .*Total by .*state, 15 regions: highest Bavaria 1\.40K, lowest Saarland 0\.06K; Free Hanseatic Bremen has no data\. Borders and disputed areas as Natural Earth draws them\.$/,
  );
  await page.getByTestId('toggle-table-view').click();
  const table = result.getByTestId('data-table');
  const bremen = table.getByRole('row').filter({ hasText: 'Free Hanseatic Bremen' });
  await expect(bremen).toHaveCount(1);
  await expect(bremen).toContainText('No data');
  await expect(table.getByRole('row').filter({ hasText: 'Bavaria' })).toContainText('1,400');
});

/**
 * T979 / AC-628: WHEN a read-write member of a folder uploads a custom
 * boundary set, THE SYSTEM SHALL take it into their My workspace, landing it
 * in the folder only through a proposal, … and SHALL then offer the set in
 * Boundary set under its name to charts in that folder …
 * AC-624: a Regions layer … on every boundary set.
 *
 * The single user uploads through the page, proposes, and approves it as a
 * folder's writer may; a chart going to the folder then draws on it.
 */
test('a custom boundary set uploaded and approved into a folder is offered and drawn there', async ({
  page,
  request,
}, testInfo) => {
  const name = `E2E territories ${String(Date.now())}`;
  const square = (key: string, lng: number, lat: number) => ({
    type: 'Feature',
    properties: { code: key },
    geometry: {
      type: 'Polygon',
      coordinates: [[[lng, lat], [lng + 20, lat], [lng + 20, lat + 20], [lng, lat + 20], [lng, lat]]],
    },
  });
  const geojson = {
    type: 'FeatureCollection',
    features: [square('FRA', -5, 40), square('NOR', 5, 58), square('USA', -100, 30)],
  };

  await page.goto('/explore/folders/seed-folder-0/boundary-sets/new');
  await page.getByRole('textbox', { name: 'Name' }).fill(name);
  await page.getByRole('textbox', { name: 'Key property' }).fill('code');
  await page.getByLabel('GeoJSON file').setInputFiles({
    name: 'territories.geojson',
    mimeType: 'application/geo+json',
    buffer: Buffer.from(JSON.stringify(geojson)),
  });
  await page.getByRole('button', { name: 'Upload to My workspace' }).click();
  await expect(page.getByTestId('boundary-set-uploaded')).toContainText(
    `${name} is in My workspace: 3 regions.`,
  );
  // Not in the folder before its proposal is approved.
  const offered = async () =>
    (
      (await (
        await request.get('/api/boundary-sets?folder=seed-folder-0')
      ).json()) as { sets: { name: string }[] }
    ).sets.map((set) => set.name);
  expect(await offered()).not.toContain(name);
  const proposing = page.waitForResponse(
    (response) => response.url().endsWith('/api/proposals') && response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Propose to the folder' }).click();
  const proposal = (await (await proposing).json()) as { id: string };
  await expect(page.getByTestId('boundary-set-proposed')).toBeVisible();
  expect(await offered()).not.toContain(name);
  const approved = await request.post(`/api/proposals/${proposal.id}/approve`, { data: {} });
  expect(approved.status(), await approved.text()).toBe(200);
  expect(await offered()).toContain(name);

  // A chart going to the folder offers it, and draws its regions by its key.
  const cube = await newChartOnCountries(page, request, testInfo.project.name);
  await wellPicker(page, 'dimensions').selectOption(`${cube}.iso3`);
  const result = page.getByTestId('editor-result');
  await expect(result.locator('svg').first()).toContainText('FRA');
  await chooseChartType(page, 'map');
  const set = page.getByRole('combobox', { name: 'Boundary set' });
  await set.selectOption({ label: name });
  const map = result.locator('svg').first();
  await expect
    .poll(() =>
      map
        .locator('path[fill^="rgb"]')
        .evaluateAll((paths) => new Set(paths.map((path) => path.getAttribute('fill'))).size),
    )
    // Its three regions, each its ramp colour (and the legend's own, as on Countries).
    .toBeGreaterThanOrEqual(3);
  await expect(map).toContainText('No data');
  await expect(result.getByTestId('unplaced-codes')).toHaveText(
    'Not on the map: "SGP" (no region), "GUF" (no region)',
  );
});
