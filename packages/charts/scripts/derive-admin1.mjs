#!/usr/bin/env node
/* global process, console */
/**
 * Derives the Map's Admin-1 boundary set (T975, AC-622, AC-624; R83) into
 * `src/geo/admin1/`: one GeoJSON file per country, `‹ISO-3›.geo.json`, and
 * `index.json`, every country's regions by key and English name, which the
 * map reads before it loads a country's file (research/admin1-boundaries.md).
 *
 * From Natural Earth v5.1.2 (public domain), checked by git blob:
 *
 *   geojson/ne_10m_admin_1_states_provinces.geojson  40,726,851 bytes, 4a8438f98ac7dfec7dc1739b1eaf91398ad33f22
 *   geojson/ne_50m_admin_0_countries.geojson           3,083,490 bytes, 9d99f26dc470fcdbd08b062c813005acbdf73ccb
 *
 *   node scripts/derive-admin1.mjs <admin-1 file> <admin-0 file>
 *
 * Each feature's country is its `adm0_a3` read through the admin-0 rule
 * (`ISO_A3`, else `ISO_A3_EH`), as `derive-countries.mjs` keys countries; a
 * country with no ISO-3 code gets no file. Natural Earth's point of view is
 * kept as shipped (R83): Crimea and Sevastopol are in Russia's file.
 *
 * Its regions are each country's ISO 3166-2 top tier (R83): where Natural
 * Earth's units are a lower tier, they are dissolved by the field the
 * research names (`DISSOLVE` below); elsewhere a unit is its own region. A
 * region's key is its ISO 3166-2 code where that is a code unique in its
 * country, else `~` and Natural Earth's `adm1_code`, drawn and placed only by
 * its name; a code several units share is kept as an alias of each, so a
 * value of it matches more than one region and is never placed (R83). Its
 * name is the English one.
 *
 * mapshaper 0.7.90 (MPL-2.0, run as a dev-time CLI, research "Source files")
 * simplifies the whole world once, before splitting, so shared borders stay
 * gap-free, and dissolves; coordinates are kept to 3 decimal places (about
 * 110 m), as the Countries set's are.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ADMIN1_BLOB = '4a8438f98ac7dfec7dc1739b1eaf91398ad33f22';
const ADMIN0_BLOB = '9d99f26dc470fcdbd08b062c813005acbdf73ccb';
const OUT = join(dirname(fileURLToPath(import.meta.url)), '../src/geo/admin1');
const ISO3 = /^[A-Z]{3}$/;
const ISO2 = /^[A-Z]{2}-[A-Z0-9]{1,3}$/;
/** The share of removable vertices mapshaper keeps. */
const SIMPLIFY = '15%';

const [admin1Path, admin0Path] = process.argv.slice(2);
if (admin1Path === undefined || admin0Path === undefined) {
  console.error('usage: node scripts/derive-admin1.mjs <admin-1 geojson> <admin-0 50m geojson>');
  process.exit(2);
}

function checked(path, expected) {
  const bytes = readFileSync(path);
  const blob = createHash('sha1')
    .update(`blob ${String(bytes.length)}\0`)
    .update(bytes)
    .digest('hex');
  if (blob !== expected) {
    console.error(`${path} is not Natural Earth v5.1.2's: git blob ${blob}, expected ${expected}`);
    process.exit(1);
  }
  return JSON.parse(bytes.toString('utf8'));
}

const trim = (value) => (typeof value === 'string' ? value.trim() : '');

/** Natural Earth's admin-0 code → ISO-3, by the admin-0 rule. */
const isoOf = new Map(
  checked(admin0Path, ADMIN0_BLOB).features.map(({ properties: p }) => [
    p.ADM0_A3,
    ISO3.test(p.ISO_A3) ? p.ISO_A3 : ISO3.test(p.ISO_A3_EH) ? p.ISO_A3_EH : undefined,
  ]),
);

const by = (table) => (value) => table[value];

/**
 * The ISO top tier where Natural Earth's units are below it
 * (research/admin1-boundaries.md, "ISO top tier"): a feature's region, as
 * [code, English name], or none where the unit is its own region.
 */
const FRA = {
  'FR-ARA': ['FR-ARA', 'Auvergne-Rhône-Alpes'],
  'FR-BFC': ['FR-BFC', 'Bourgogne-Franche-Comté'],
  'FR-BRE': ['FR-BRE', 'Brittany'],
  'FR-CVL': ['FR-CVL', 'Centre-Val de Loire'],
  'FR-COR': ['FR-20R', 'Corsica'],
  'FR-GES': ['FR-GES', 'Grand Est'],
  'FR-HDF': ['FR-HDF', 'Hauts-de-France'],
  'FR-IDF': ['FR-IDF', 'Île-de-France'],
  'FR-NOR': ['FR-NOR', 'Normandy'],
  'FR-NAQ': ['FR-NAQ', 'Nouvelle-Aquitaine'],
  'FR-OCC': ['FR-OCC', 'Occitania'],
  'FR-PDL': ['FR-PDL', 'Pays de la Loire'],
  'FR-PAC': ['FR-PAC', "Provence-Alpes-Côte d'Azur"],
  'FR-GUA': ['FR-971', 'Guadeloupe'],
  'FR-MTQ': ['FR-972', 'Martinique'],
  'FR-GUF': ['FR-973', 'French Guiana'],
  'FR-LRE': ['FR-974', 'Réunion'],
  'FR-MAY': ['FR-976', 'Mayotte'],
};
const ITA = {
  'IT-21': 'Piedmont',
  'IT-23': 'Aosta Valley',
  'IT-25': 'Lombardy',
  'IT-32': 'Trentino-South Tyrol',
  'IT-34': 'Veneto',
  'IT-36': 'Friuli Venezia Giulia',
  'IT-42': 'Liguria',
  'IT-45': 'Emilia-Romagna',
  'IT-52': 'Tuscany',
  'IT-55': 'Umbria',
  'IT-57': 'Marche',
  'IT-62': 'Lazio',
  'IT-65': 'Abruzzo',
  'IT-67': 'Molise',
  'IT-72': 'Campania',
  'IT-75': 'Apulia',
  'IT-77': 'Basilicata',
  'IT-78': 'Calabria',
  'IT-82': 'Sicily',
  'IT-88': 'Sardinia',
};
const ESP = {
  'ES.AN': ['ES-AN', 'Andalusia'],
  'ES.AR': ['ES-AR', 'Aragon'],
  'ES.AS': ['ES-AS', 'Asturias'],
  'ES.CB': ['ES-CB', 'Cantabria'],
  'ES.CL': ['ES-CL', 'Castile and León'],
  'ES.CM': ['ES-CM', 'Castilla–La Mancha'],
  'ES.CN': ['ES-CN', 'Canary Islands'],
  'ES.CT': ['ES-CT', 'Catalonia'],
  'ES.EX': ['ES-EX', 'Extremadura'],
  'ES.GA': ['ES-GA', 'Galicia'],
  'ES.LO': ['ES-RI', 'La Rioja'],
  'ES.MD': ['ES-MD', 'Community of Madrid'],
  'ES.MU': ['ES-MC', 'Region of Murcia'],
  'ES.NA': ['ES-NC', 'Navarre'],
  'ES.PM': ['ES-IB', 'Balearic Islands'],
  'ES.PV': ['ES-PV', 'Basque Country'],
  'ES.VC': ['ES-VC', 'Valencian Community'],
};
const PHL = {
  'PH-00': 'National Capital Region',
  'PH-01': 'Ilocos',
  'PH-02': 'Cagayan Valley',
  'PH-03': 'Central Luzon',
  'PH-05': 'Bicol',
  'PH-06': 'Western Visayas',
  'PH-07': 'Central Visayas',
  'PH-08': 'Eastern Visayas',
  'PH-09': 'Zamboanga Peninsula',
  'PH-10': 'Northern Mindanao',
  'PH-11': 'Davao',
  'PH-12': 'Soccsksargen',
  'PH-13': 'Caraga',
  'PH-14': 'Autonomous Region in Muslim Mindanao',
  'PH-15': 'Cordillera Administrative Region',
  'PH-40': 'Calabarzon',
  'PH-41': 'Mimaropa',
};
const LKA = {
  'LK-1': 'Western Province',
  'LK-2': 'Central Province',
  'LK-3': 'Southern Province',
  'LK-4': 'Northern Province',
  'LK-5': 'Eastern Province',
  'LK-6': 'North Western Province',
  'LK-7': 'North Central Province',
  'LK-8': 'Uva Province',
  'LK-9': 'Sabaragamuwa Province',
};
const GIN = {
  'GN.B': ['GN-B', 'Boké'],
  'GN.C': ['GN-C', 'Conakry'],
  'GN.D': ['GN-D', 'Kindia'],
  'GN.F': ['GN-F', 'Faranah'],
  'GN.K': ['GN-K', 'Kankan'],
  'GN.L': ['GN-L', 'Labé'],
  'GN.M': ['GN-M', 'Mamou'],
  'GN.N': ['GN-N', 'Nzérékoré'],
};
const BFA = [
  'Boucle du Mouhoun',
  'Cascades',
  'Centre',
  'Centre-Est',
  'Centre-Nord',
  'Centre-Ouest',
  'Centre-Sud',
  'Est',
  'Hauts-Bassins',
  'Nord',
  'Plateau-Central',
  'Sahel',
  'Sud-Ouest',
];
const MWI = {
  C: ['DE', 'DO', 'KS', 'LI', 'MC', 'NI', 'NK', 'NU', 'SA'],
  N: ['CT', 'LK', 'MZ', 'NB', 'RU'],
  S: ['BA', 'BL', 'CK', 'CR', 'MG', 'MH', 'MU', 'MW', 'NE', 'NS', 'PH', 'TH', 'ZO'],
};
const MWI_NAMES = { C: 'Central Region', N: 'Northern Region', S: 'Southern Region' };

const DISSOLVE = {
  FRA: (p) => FRA[trim(p.region_cod)],
  ITA: (p) => (ITA[trim(p.region_cod)] ? [trim(p.region_cod), ITA[trim(p.region_cod)]] : undefined),
  ESP: (p) =>
    trim(p.region_cod) === 'ES.CE'
      ? trim(p.region) === 'Melilla'
        ? ['ES-ML', 'Melilla']
        : ['ES-CE', 'Ceuta']
      : ESP[trim(p.region_cod)],
  GBR: (p) =>
    by({
      ENG: ['GB-ENG', 'England'],
      SCT: ['GB-SCT', 'Scotland'],
      WLS: ['GB-WLS', 'Wales'],
      NIR: ['GB-NIR', 'Northern Ireland'],
    })(trim(p.gu_a3)),
  BEL: (p) =>
    by({
      'Flemish Region': ['BE-VLG', 'Flanders'],
      'Walloon Region': ['BE-WAL', 'Wallonia'],
      'Brussels Capital Region': ['BE-BRU', 'Brussels'],
    })(trim(p.geonunit)),
  PHL: (p) => (PHL[trim(p.region_cod)] ? [trim(p.region_cod), PHL[trim(p.region_cod)]] : undefined),
  LKA: (p) => (LKA[trim(p.region_cod)] ? [trim(p.region_cod), LKA[trim(p.region_cod)]] : undefined),
  GNB: (p) =>
    by({
      'GW-L': ['GW-L', 'East'],
      'GW-N': ['GW-N', 'North'],
      'GW-S': ['GW-S', 'South'],
      'GW-B': ['GW-BS', 'Bissau'],
    })(trim(p.region_cod)),
  KNA: (p) =>
    by({ 'KN-K': ['KN-K', 'Saint Kitts'], 'KN-N': ['KN-N', 'Nevis'] })(trim(p.region_cod)),
  GIN: (p) => GIN[trim(p.region_cod)],
  BFA: (p) => {
    const at = BFA.indexOf(trim(p.region));
    return at < 0 ? undefined : [`BF-${String(at + 1).padStart(2, '0')}`, BFA[at]];
  },
  MWI: (p) => {
    const code = trim(p.iso_3166_2).replace(/^MW-/, '');
    const region = Object.keys(MWI).find((key) => MWI[key].includes(code));
    return region === undefined ? undefined : [`MW-${region}`, MWI_NAMES[region]];
  },
  BIH: (p) =>
    trim(p.iso_3166_2) === 'BA-BRC'
      ? ['BA-BRC', 'Brčko District']
      : by({
          'Bosnia and Herzegovina': ['BA-BIH', 'Federation of Bosnia and Herzegovina'],
          'Republic Srpska': ['BA-SRP', 'Republika Srpska'],
        })(trim(p.geonunit)),
  AZE: (p) => (trim(p.region_cod) === 'AZ-10' ? ['AZ-NX', 'Nakhchivan'] : undefined),
  IRQ: (p) => (trim(p.geonunit) === 'Iraqi Kurdistan' ? ['IQ-KR', 'Kurdistan'] : undefined),
  SRB: (p) => (trim(p.geonunit) === 'Vojvodina' ? ['RS-VO', 'Vojvodina'] : undefined),
};

/** Every country's dissolve covers all its units (bar AZE, IRQ, SRB, which are partial). */
const PARTIAL = new Set(['AZE', 'IRQ', 'SRB']);

const admin1 = checked(admin1Path, ADMIN1_BLOB);

// Natural Earth's own codes, per country, to find those several units share.
const shared = new Map();
for (const { properties: p } of admin1.features) {
  const country = isoOf.get(p.adm0_a3);
  const code = trim(p.iso_3166_2);
  if (country === undefined || !ISO2.test(code)) continue;
  const id = `${country}|${code}`;
  shared.set(id, (shared.get(id) ?? 0) + 1);
}

const prepared = admin1.features.flatMap(({ properties: p, geometry }) => {
  const country = isoOf.get(p.adm0_a3);
  if (country === undefined || geometry === null) return [];
  const dissolved = DISSOLVE[country]?.(p);
  if (DISSOLVE[country] !== undefined && dissolved === undefined && !PARTIAL.has(country))
    throw new Error(`${country} ${p.adm1_code} ${p.name}: no region to dissolve into`);
  const code = trim(p.iso_3166_2);
  const name = trim(p.name_en) || trim(p.name);
  const own = ISO2.test(code) && shared.get(`${country}|${code}`) === 1;
  const properties =
    dissolved !== undefined
      ? { country, key: dissolved[0], name: dissolved[1], alias: '' }
      : {
          country,
          key: own ? code : `~${p.adm1_code}`,
          name,
          // A code several units share: each of them is named by it, so it
          // matches more than one region (R83).
          alias: !own && ISO2.test(code) ? code : '',
        };
  return [{ type: 'Feature', properties, geometry }];
});

const work = mkdtempSync(join(tmpdir(), 'derive-admin1-'));
try {
  const input = join(work, 'prepared.json');
  const output = join(work, 'derived.json');
  writeFileSync(input, JSON.stringify({ type: 'FeatureCollection', features: prepared }));
  execFileSync(
    'npx',
    [
      '-y',
      'mapshaper@0.7.90',
      '-i',
      input,
      '-simplify',
      SIMPLIFY,
      'keep-shapes',
      '-dissolve',
      'country,key',
      'copy-fields=name,alias',
      '-o',
      output,
      'format=geojson',
      'precision=0.001',
    ],
    { stdio: ['ignore', 'inherit', 'inherit'] },
  );
  const { features } = JSON.parse(readFileSync(output, 'utf8'));

  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  const countries = new Map();
  for (const { properties, geometry } of features) {
    if (geometry === null) continue;
    const list = countries.get(properties.country) ?? [];
    list.push({
      type: 'Feature',
      properties: { key: properties.key, name: properties.name },
      geometry,
    });
    countries.set(properties.country, list);
  }
  const index = {};
  for (const [country, list] of [...countries].sort(([one], [other]) => one.localeCompare(other))) {
    list.sort((one, other) => one.properties.key.localeCompare(other.properties.key));
    writeFileSync(
      join(OUT, `${country}.geo.json`),
      `${JSON.stringify({ type: 'FeatureCollection', features: list })}\n`,
    );
    const aliases = new Map(
      features
        .filter((one) => one.properties.country === country && one.properties.alias !== '')
        .map((one) => [one.properties.key, one.properties.alias]),
    );
    index[country] = list.map(({ properties: { key, name } }) =>
      aliases.has(key) ? [key, name, aliases.get(key)] : [key, name],
    );
  }
  writeFileSync(join(OUT, 'index.json'), `${JSON.stringify(index)}\n`);
  const sizes = readdirSync(OUT)
    .map((file) => [file, readFileSync(join(OUT, file)).length])
    .sort(([, one], [, other]) => other - one);
  const total = sizes.reduce((sum, [, size]) => sum + size, 0);
  console.log(
    `${String(countries.size)} countries, ${String(features.length)} regions, ${String(total)} bytes; largest: ${sizes
      .slice(0, 5)
      .map(([file, size]) => `${file} ${String(size)}`)
      .join(', ')}`,
  );
} finally {
  rmSync(work, { recursive: true, force: true });
}
