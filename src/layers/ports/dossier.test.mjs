import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';
import {
  LINKED_SYSTEM_TAGS,
  PORT_DOSSIER_SCHEMA_VERSION,
  PortDossierError,
  buildPortDossierIndex,
  buildPortDossierRecord,
  normalizePortDossier,
  normalizePortDossierIndex,
  normalizePortWatchRegistryRow,
  normalizeWikipediaSummary,
  resolveLinkedSystem,
  validateSeed,
  validateSeedEntry,
} from './dossier.js';

const BUNDLE_URL = new URL(
  '../../data/local_data/port_dossiers/',
  import.meta.url,
);
const SEED_URL = new URL(
  '../../../config/port_dossiers.seed.json',
  import.meta.url,
);

/** The launch set of docs/COMMODITIES-PLAN.md §9.6.1, in table order. */
const LAUNCH_PORTS = [
  'port1091',
  'port570',
  'port362',
  'port1090',
  'port2164',
  'port481',
  'port264',
  'port2388',
  'port933',
  'port1114',
  'port57',
  'port45',
  'port740',
  'port833',
  'port1020',
  'port1201',
  'port824',
  'port1338',
  'port239',
  'port1199',
];

function seedFixture(overrides = {}) {
  return {
    portid: 'port1201',
    slug: 'singapore',
    aliases: ['Port of Singapore', 'Singapore port'],
    role: 'Bunkering, refining and trading hub',
    roleNotes:
      'Largest bunkering port and a refining and product trading hub on the Malacca Strait.',
    linkedSystems: ['chokepoint5', 'ara'],
    authority: {
      name: 'Maritime and Port Authority of Singapore',
      url: 'https://www.mpa.gov.sg/',
    },
    terminals: [
      { name: 'Jurong Island', operator: 'JTC', product: 'products' },
    ],
    wikipediaTitle: 'Port of Singapore',
    cameraIds: ['port-singapore-1'],
    satelliteZoom: 8,
    ...overrides,
  };
}

function registryFixture(overrides = {}) {
  return {
    portid: 'port1201',
    portname: 'Singapore',
    fullname: 'Singapore, Singapore',
    country: 'Singapore',
    ISO3: 'SGP',
    continent: 'Asia',
    lat: 1.271989257,
    lon: 103.7074816,
    LOCODE: 'SG SIN',
    vessel_count_total: 40000,
    vessel_count_tanker: 26277,
    vessel_count_container: 9000,
    vessel_count_dry_bulk: 1000,
    vessel_count_general_cargo: 3000,
    vessel_count_RoRo: 700,
    industry_top1: 'Mineral Products',
    industry_top2: null,
    industry_top3: 'Metals',
    share_country_maritime_import: 99.5,
    share_country_maritime_export: 99.1,
    pageid: '0123456789abcdef0123456789abcdef',
    ...overrides,
  };
}

function summaryFixture(overrides = {}) {
  return {
    type: 'standard',
    title: 'Port of Singapore',
    description: 'Port in Singapore',
    extract:
      'The Port of Singapore is a collection of facilities and terminals.',
    thumbnail: {
      source:
        'https://upload.wikimedia.org/wikipedia/commons/thumb/9/90/Port.jpg/330px-Port.jpg?utm_source=en.wikipedia.org',
      width: 330,
      height: 220,
    },
    content_urls: {
      desktop: { page: 'https://en.wikipedia.org/wiki/Port_of_Singapore' },
    },
    revision: '1300000000',
    timestamp: '2026-08-01T10:20:30Z',
    ...overrides,
  };
}

function buildFixture() {
  return buildPortDossierRecord({
    seed: validateSeedEntry(seedFixture()),
    registry: normalizePortWatchRegistryRow(registryFixture()),
    wikipedia: normalizeWikipediaSummary(summaryFixture(), 'Port of Singapore'),
  });
}

function rejects(fn, pathFragment) {
  assert.throws(fn, (error) => {
    assert.ok(
      error instanceof PortDossierError,
      `expected PortDossierError, got ${error}`,
    );
    assert.ok(
      error.message.includes(pathFragment),
      `${error.message} should name ${pathFragment}`,
    );
    return true;
  });
}

test('validateSeedEntry accepts a complete entry and freezes it', () => {
  const entry = validateSeedEntry(seedFixture());
  assert.equal(entry.portid, 'port1201');
  assert.deepEqual(entry.linkedSystems, ['chokepoint5', 'ara']);
  assert.ok(Object.isFrozen(entry));
  assert.ok(Object.isFrozen(entry.terminals[0]));
});

test('validateSeedEntry names the field that is missing or malformed', () => {
  const cases = [
    [{ portid: 'p1' }, 'portid'],
    [{ slug: 'Not A Slug' }, 'slug'],
    [{ aliases: [] }, 'aliases'],
    [{ aliases: ['a', 'a'] }, 'aliases'],
    [{ role: ' padded' }, 'role'],
    [{ roleNotes: '' }, 'roleNotes'],
    [{ linkedSystems: [] }, 'linkedSystems'],
    [{ linkedSystems: ['chokepoint99'] }, 'linkedSystems[0]'],
    [{ linkedSystems: ['not-a-system'] }, 'linkedSystems[0]'],
    [
      { authority: { name: 'x', url: 'http://insecure.example/' } },
      'authority.url',
    ],
    [
      {
        terminals: new Array(7).fill({
          name: 't',
          operator: 'o',
          product: 'p',
        }),
      },
      'terminals',
    ],
    [{ terminals: [{ name: 't', operator: 'o' }] }, 'terminals[0].product'],
    [{ wikipediaTitle: 42 }, 'wikipediaTitle'],
    [{ cameraIds: ['warendorf-marktplatz'] }, 'cameraIds[0]'],
    [{ satelliteZoom: 12 }, 'satelliteZoom'],
    [{ satelliteZoom: 7.5 }, 'satelliteZoom'],
    [{ extra: true }, 'extra'],
  ];
  for (const [overrides, fragment] of cases) {
    rejects(() => validateSeedEntry(seedFixture(overrides)), fragment);
  }
});

test('validateSeed rejects duplicate ids, slugs and camera ids across entries', () => {
  rejects(() => validateSeed([]), 'seed');
  rejects(
    () =>
      validateSeed([
        seedFixture(),
        seedFixture({ slug: 'other', cameraIds: [] }),
      ]),
    'seed.portid',
  );
  rejects(
    () =>
      validateSeed([
        seedFixture(),
        seedFixture({ portid: 'port2', cameraIds: [] }),
      ]),
    'seed.slug',
  );
  rejects(
    () =>
      validateSeed([
        seedFixture(),
        seedFixture({ portid: 'port2', slug: 'other' }),
      ]),
    'seed.cameraIds',
  );
  assert.equal(validateSeed([seedFixture()]).length, 1);
});

test('resolveLinkedSystem maps chokepoints from the gazetteer and tags from the vocabulary', () => {
  assert.deepEqual(resolveLinkedSystem('chokepoint6'), {
    id: 'chokepoint6',
    name: 'Strait of Hormuz',
    kind: 'chokepoint',
  });
  for (const [id, name] of Object.entries(LINKED_SYSTEM_TAGS)) {
    assert.deepEqual(resolveLinkedSystem(id), { id, name, kind: 'tag' });
  }
  rejects(() => resolveLinkedSystem('chokepoint0'), 'linkedSystems');
});

test('normalizePortWatchRegistryRow keeps identity, counts and shares, dropping empty industries', () => {
  const row = normalizePortWatchRegistryRow(registryFixture());
  assert.equal(row.locode, 'SG SIN');
  assert.deepEqual(row.industries, ['Mineral Products', 'Metals']);
  assert.equal(row.annualCalls.tanker, 26277);
  assert.equal(row.countryShare.exportPct, 99.1);
  assert.equal(
    normalizePortWatchRegistryRow(registryFixture({ LOCODE: null })).locode,
    null,
  );
  assert.equal(
    normalizePortWatchRegistryRow(
      registryFixture({ vessel_count_tanker: null }),
    ).annualCalls.tanker,
    null,
  );
  rejects(
    () => normalizePortWatchRegistryRow(registryFixture({ lat: 91 })),
    'lat',
  );
  rejects(
    () => normalizePortWatchRegistryRow(registryFixture({ portname: '' })),
    'portname',
  );
  rejects(
    () => normalizePortWatchRegistryRow(registryFixture({ pageid: 'nope' })),
    'pageid',
  );
  rejects(
    () =>
      normalizePortWatchRegistryRow(
        registryFixture({ vessel_count_total: -1 }),
      ),
    'vessel_count_total',
  );
});

test('normalizeWikipediaSummary accepts a standard article and strips thumbnail tracking parameters', () => {
  const summary = normalizeWikipediaSummary(
    summaryFixture(),
    'Port of Singapore',
  );
  assert.equal(
    summary.thumbnail.url,
    'https://upload.wikimedia.org/wikipedia/commons/thumb/9/90/Port.jpg/330px-Port.jpg',
  );
  assert.equal(summary.licence, 'CC BY-SA 4.0');
  assert.equal(
    normalizeWikipediaSummary(summaryFixture({ thumbnail: undefined }))
      .thumbnail,
    null,
  );
  rejects(
    () => normalizeWikipediaSummary(summaryFixture({ type: 'disambiguation' })),
    'type',
  );
  rejects(
    () => normalizeWikipediaSummary(summaryFixture(), 'Singapore'),
    'title',
  );
  rejects(
    () => normalizeWikipediaSummary(summaryFixture({ extract: '' })),
    'extract',
  );
  rejects(
    () => normalizeWikipediaSummary(summaryFixture({ timestamp: 'yesterday' })),
    'timestamp',
  );
});

test('buildPortDossierRecord joins seed, registry and summary in a fixed key order', () => {
  const record = buildFixture();
  assert.deepEqual(Object.keys(record), [
    'schemaVersion',
    'portid',
    'slug',
    'name',
    'fullname',
    'country',
    'iso3',
    'continent',
    'locode',
    'lat',
    'lon',
    'role',
    'roleNotes',
    'linkedSystems',
    'aliases',
    'authority',
    'terminals',
    'annualCalls',
    'industries',
    'countryShare',
    'wikipedia',
    'links',
    'cameraIds',
    'satelliteZoom',
  ]);
  assert.equal(record.schemaVersion, PORT_DOSSIER_SCHEMA_VERSION);
  assert.deepEqual(record.linkedSystems[0], {
    id: 'chokepoint5',
    name: 'Malacca Strait',
    kind: 'chokepoint',
  });
  assert.equal(
    record.links.portwatch,
    'https://portwatch.imf.org/datasets/0123456789abcdef0123456789abcdef',
  );
  assert.equal(
    record.links.wikipedia,
    'https://en.wikipedia.org/wiki/Port_of_Singapore',
  );
  assert.ok(Object.isFrozen(record.wikipedia));
  rejects(
    () =>
      buildPortDossierRecord({
        seed: validateSeedEntry(seedFixture()),
        registry: normalizePortWatchRegistryRow(
          registryFixture({ portid: 'port2' }),
        ),
        wikipedia: normalizeWikipediaSummary(summaryFixture()),
      }),
    'dossier.portid',
  );
  rejects(
    () =>
      buildPortDossierRecord({
        seed: validateSeedEntry(seedFixture({ wikipediaTitle: 'Singapore' })),
        registry: normalizePortWatchRegistryRow(registryFixture()),
        wikipedia: normalizeWikipediaSummary(summaryFixture()),
      }),
    'dossier.wikipedia',
  );
});

test('normalizePortDossier round-trips a built record through JSON and rejects tampering', () => {
  const record = buildFixture();
  const parsed = JSON.parse(JSON.stringify(record));
  assert.deepEqual(normalizePortDossier(parsed), record);
  rejects(
    () => normalizePortDossier({ ...parsed, schemaVersion: 2 }),
    'schemaVersion',
  );
  rejects(
    () =>
      normalizePortDossier({
        ...parsed,
        links: { ...parsed.links, authority: 'https://other.example/' },
      }),
    'links.authority',
  );
  rejects(
    () =>
      normalizePortDossier({
        ...parsed,
        linkedSystems: [
          { id: 'chokepoint5', name: 'Wrong', kind: 'chokepoint' },
        ],
      }),
    'linkedSystems[0]',
  );
  rejects(
    () =>
      normalizePortDossier({
        ...parsed,
        wikipedia: { ...parsed.wikipedia, licence: 'CC0' },
      }),
    'licence',
  );
});

test('buildPortDossierIndex and normalizePortDossierIndex agree', () => {
  const record = buildFixture();
  const index = buildPortDossierIndex([record], { vintage: '2026-09-17' });
  assert.equal(index.count, 1);
  assert.equal(index.ports[0].file, 'port1201.json');
  assert.deepEqual(
    normalizePortDossierIndex(JSON.parse(JSON.stringify(index))),
    index,
  );
  rejects(
    () => buildPortDossierIndex([record, record], { vintage: '2026-09-17' }),
    'records.portid',
  );
  rejects(
    () => buildPortDossierIndex([record], { vintage: 'today' }),
    'vintage',
  );
  rejects(() => normalizePortDossierIndex({ ...index, count: 3 }), 'count');
});

test('the committed seed validates and lists exactly the launch ports in table order', () => {
  const seed = validateSeed(JSON.parse(readFileSync(SEED_URL, 'utf8')));
  assert.deepEqual(
    seed.map((entry) => entry.portid),
    LAUNCH_PORTS,
  );
});

test('the committed bundle holds one valid dossier per launch port, an index, a manifest and a README', () => {
  const index = normalizePortDossierIndex(
    JSON.parse(readFileSync(new URL('index.json', BUNDLE_URL), 'utf8')),
  );
  assert.deepEqual(
    index.ports.map((row) => row.portid),
    LAUNCH_PORTS,
  );
  const files = readdirSync(BUNDLE_URL).sort();
  assert.deepEqual(
    files,
    [
      ...LAUNCH_PORTS.map((id) => `${id}.json`),
      'README.md',
      'index.json',
      'source.json',
    ].sort(),
  );
  const manifest = JSON.parse(
    readFileSync(new URL('source.json', BUNDLE_URL), 'utf8'),
  );
  assert.equal(manifest.vintage, index.vintage);
  const sourceIds = new Set(manifest.sources.map((source) => source.id));
  assert.ok(sourceIds.has('portwatch-registry'));
  for (const row of index.ports) {
    const dossier = normalizePortDossier(
      JSON.parse(readFileSync(new URL(row.file, BUNDLE_URL), 'utf8')),
      row.file,
    );
    assert.equal(dossier.portid, row.portid);
    assert.equal(dossier.name, row.name);
    assert.equal(dossier.lat, row.lat);
    assert.deepEqual(dossier.cameraIds, row.cameraIds);
    assert.ok(
      sourceIds.has(`wikipedia:${row.portid}`),
      `${row.portid} has a Wikipedia source entry`,
    );
    assert.ok(
      dossier.terminals.length >= 1,
      `${row.portid} names at least one terminal`,
    );
  }
  assert.ok(existsSync(new URL('README.md', BUNDLE_URL)));
  const readme = readFileSync(new URL('README.md', BUNDLE_URL), 'utf8');
  assert.ok(readme.includes(`Count: ${index.count} ports`));
  assert.ok(readme.includes(`Vintage: ${index.vintage}`));
});
