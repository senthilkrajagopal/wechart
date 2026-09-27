#!/usr/bin/env node
/* global process, console */
/**
 * Derives `src/geo/countries-50m.geo.json`, the country map's boundaries (T398,
 * AC-305), from Natural Earth's admin-0 countries at 1:50m, tag v5.1.2:
 *
 *   https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_50m_admin_0_countries.geojson
 *   3,083,490 bytes, git blob 9d99f26dc470fcdbd08b062c813005acbdf73ccb (checked below)
 *
 * Natural Earth is public domain (research/country-map.md, "Boundary data").
 *
 *   node scripts/derive-countries.mjs <downloaded file>
 *
 * Each feature keeps only what the map reads:
 * - `iso_a3`, its key: `ISO_A3` where that is a code, else `ISO_A3_EH` (France
 *   and Norway are `-99` in `ISO_A3`), else `~` and Natural Earth's own
 *   `ADM0_A3`, which can't be an ISO code, so it is drawn and never placed;
 * - `name`, its English name, for the tooltip;
 * - `cp`, Natural Earth's label point, where the tooltip anchors;
 * - its polygons, to 3 decimal places (about 110 m).
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE_BLOB = '9d99f26dc470fcdbd08b062c813005acbdf73ccb';
const OUT = join(dirname(fileURLToPath(import.meta.url)), '../src/geo/countries-50m.geo.json');
const ISO = /^[A-Z]{3}$/;
const PLACES = 1_000;

const [source] = process.argv.slice(2);
if (source === undefined) {
  console.error('usage: node scripts/derive-countries.mjs <ne_50m_admin_0_countries.geojson>');
  process.exit(2);
}
const bytes = readFileSync(source);
const blob = createHash('sha1')
  .update(`blob ${String(bytes.length)}\0`)
  .update(bytes)
  .digest('hex');
if (blob !== SOURCE_BLOB) {
  console.error(`not Natural Earth v5.1.2's file: git blob ${blob}, expected ${SOURCE_BLOB}`);
  process.exit(1);
}

const round = (value) => Math.round(value * PLACES) / PLACES;

/** A ring rounded, with the points rounding made the same dropped; none when too few are left. */
function ringOf(ring) {
  const out = [];
  for (const [x, y] of ring) {
    const point = [round(x), round(y)];
    const last = out.at(-1);
    if (last === undefined || last[0] !== point[0] || last[1] !== point[1]) out.push(point);
  }
  const first = out[0];
  const last = out.at(-1);
  if (first !== undefined && (first[0] !== last[0] || first[1] !== last[1])) out.push([...first]);
  return out.length >= 4 ? out : undefined;
}

/** A polygon rounded: none when its outer ring is too small to draw. */
function polygonOf(rings) {
  const [outer, ...holes] = rings.map(ringOf);
  return outer === undefined ? undefined : [outer, ...holes.filter((hole) => hole !== undefined)];
}

const { features } = JSON.parse(bytes.toString('utf8'));
const derived = features.map(({ properties: p, geometry }) => {
  const key = ISO.test(p.ISO_A3) ? p.ISO_A3 : ISO.test(p.ISO_A3_EH) ? p.ISO_A3_EH : `~${p.ADM0_A3}`;
  const polygons = (geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates)
    .map(polygonOf)
    .filter((polygon) => polygon !== undefined);
  if (polygons.length === 0) throw new Error(`${p.NAME_EN}: nothing left to draw at ${PLACES}`);
  return {
    type: 'Feature',
    properties: {
      iso_a3: key,
      name: p.NAME_EN ?? p.ADMIN,
      cp: [round(p.LABEL_X), round(p.LABEL_Y)],
    },
    geometry:
      polygons.length === 1
        ? { type: 'Polygon', coordinates: polygons[0] }
        : { type: 'MultiPolygon', coordinates: polygons },
  };
});

writeFileSync(OUT, `${JSON.stringify({ type: 'FeatureCollection', features: derived })}\n`);
console.log(
  `${String(derived.length)} features, ${String(readFileSync(OUT).length)} bytes: ${OUT}`,
);
