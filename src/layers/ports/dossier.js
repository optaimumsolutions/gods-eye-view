/**
 * Port dossier records: pure validation and assembly for the bundled
 * dossiers of docs/COMMODITIES-PLAN.md §9.
 *
 * `scripts/build-port-dossiers.mjs` reads `config/port_dossiers.seed.json`,
 * joins each seed entry onto its IMF PortWatch registry row and its Wikipedia
 * summary through the functions here, and writes
 * `src/data/local_data/port_dossiers/`. The schema test validates the
 * committed bundle with the same functions, so the script, the test and the
 * panel agree on one shape. No Cesium, no DOM, no Node built-ins.
 */
import { CHOKEPOINT_GAZETTEER } from '../chokepoints/gazetteer.js';

export const PORT_DOSSIER_SCHEMA_VERSION = 1;
export const PORT_DOSSIER_MAX_TERMINALS = 6;
export const PORT_DOSSIER_MAX_ALIASES = 8;
export const PORT_DOSSIER_MAX_CAMERAS = 6;
export const PORT_DOSSIER_MAX_LINKED_SYSTEMS = 8;
/** NASA GIBS serves its true-colour layers on GoogleMapsCompatible_Level9. */
export const PORT_SATELLITE_ZOOM = Object.freeze({ min: 5, max: 9 });
/** The PortWatch port page is keyed by the registry row's `pageid`. */
export const PORTWATCH_PORT_PAGE_URL = 'https://portwatch.imf.org/datasets/';
export const WIKIPEDIA_LICENCE = 'CC BY-SA 4.0';

/** Named systems a port can be linked to besides the PortWatch chokepoints. */
export const LINKED_SYSTEM_TAGS = Object.freeze({
  'hormuz-bypass': 'Hormuz bypass',
  sanctions: 'Sanctions',
  'us-gulf': 'US Gulf Coast',
  'padd-3': 'PADD 3',
  'henry-hub': 'Henry Hub',
  ara: 'ARA hub',
  atlantic: 'Atlantic',
});

const CHOKEPOINT_NAMES = new Map(
  CHOKEPOINT_GAZETTEER.map((row) => [row.id, row.name]),
);
const PORTID_RE = /^port[0-9]+$/;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CHOKEPOINT_RE = /^chokepoint[0-9]+$/;
const CAMERA_ID_RE = /^port-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ISO_DATE_RE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;
const ISO_TIME_RE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$/;
const TEXT_LIMITS = Object.freeze({
  role: 120,
  roleNotes: 420,
  alias: 60,
  name: 120,
  terminal: 80,
  product: 60,
  title: 160,
  description: 200,
  extract: 4000,
});

export class PortDossierError extends Error {
  constructor(path, message) {
    super(`${path}: ${message}`);
    this.name = 'PortDossierError';
    this.path = path;
  }
}

function fail(path, message) {
  throw new PortDossierError(path, message);
}

function isRecord(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function deepFreeze(value) {
  if (Array.isArray(value)) {
    for (const item of value) deepFreeze(item);
    return Object.freeze(value);
  }
  if (isRecord(value)) {
    for (const item of Object.values(value)) deepFreeze(item);
    return Object.freeze(value);
  }
  return value;
}

function requireRecord(value, path) {
  if (!isRecord(value)) fail(path, 'expected an object');
  return value;
}

function requireText(value, path, max = TEXT_LIMITS.name) {
  if (typeof value !== 'string') fail(path, 'expected a string');
  const trimmed = value.trim();
  if (!trimmed) fail(path, 'must not be empty');
  if (trimmed !== value) fail(path, 'has surrounding whitespace');
  if (trimmed.length > max) fail(path, `longer than ${max} characters`);
  return trimmed;
}

function optionalText(value, path, max) {
  if (value == null) return null;
  return requireText(value, path, max);
}

function requireHttpsUrl(value, path) {
  const text = requireText(value, path, 400);
  let parsed;
  try {
    parsed = new URL(text);
  } catch {
    fail(path, 'is not a URL');
  }
  if (parsed.protocol !== 'https:') fail(path, 'must use https');
  if (parsed.href !== text) fail(path, 'must be a normalized URL');
  return text;
}

function requireArray(value, path, { min = 0, max = Infinity } = {}) {
  if (!Array.isArray(value)) fail(path, 'expected an array');
  if (value.length < min) fail(path, `needs at least ${min} entries`);
  if (value.length > max) fail(path, `has more than ${max} entries`);
  return value;
}

function requireUnique(values, path) {
  const seen = new Set();
  for (const value of values) {
    if (seen.has(value)) fail(path, `duplicate entry ${JSON.stringify(value)}`);
    seen.add(value);
  }
  return values;
}

function requireMatch(value, re, path, what) {
  const text = requireText(value, path, 80);
  if (!re.test(text)) fail(path, `is not ${what}`);
  return text;
}

function requireInteger(value, path, { min = -Infinity, max = Infinity } = {}) {
  if (!Number.isInteger(value)) fail(path, 'expected an integer');
  if (value < min || value > max) fail(path, `outside ${min} to ${max}`);
  return value;
}

function requireCoordinate(value, path, limit) {
  if (typeof value !== 'number' || !Number.isFinite(value))
    fail(path, 'expected a finite number');
  if (Math.abs(value) > limit) fail(path, `outside ±${limit}`);
  return value;
}

/** A count or share from PortWatch: a finite non-negative number, or null when unpublished. */
function optionalCount(value, path) {
  if (value == null || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0)
    fail(path, 'expected a non-negative number or null');
  return number;
}

function requireTextList(value, path, { min, max, item }) {
  const list = requireArray(value, path, { min, max });
  return requireUnique(
    list.map((entry, index) => requireText(entry, `${path}[${index}]`, item)),
    path,
  );
}

function requireCameraIds(value, path) {
  const list = requireArray(value, path, { max: PORT_DOSSIER_MAX_CAMERAS });
  return requireUnique(
    list.map((entry, index) =>
      requireMatch(
        entry,
        CAMERA_ID_RE,
        `${path}[${index}]`,
        'a port camera id',
      ),
    ),
    path,
  );
}

function requireAuthority(value, path) {
  const record = requireRecord(value, path);
  return {
    name: requireText(record.name, `${path}.name`),
    url: requireHttpsUrl(record.url, `${path}.url`),
  };
}

function requireTerminals(value, path) {
  const list = requireArray(value, path, { max: PORT_DOSSIER_MAX_TERMINALS });
  const terminals = list.map((entry, index) => {
    const record = requireRecord(entry, `${path}[${index}]`);
    return {
      name: requireText(
        record.name,
        `${path}[${index}].name`,
        TEXT_LIMITS.terminal,
      ),
      operator: requireText(
        record.operator,
        `${path}[${index}].operator`,
        TEXT_LIMITS.terminal,
      ),
      product: requireText(
        record.product,
        `${path}[${index}].product`,
        TEXT_LIMITS.product,
      ),
    };
  });
  requireUnique(
    terminals.map((terminal) => terminal.name),
    path,
  );
  return terminals;
}

/** Resolve a linked-system id to its display record: a PortWatch chokepoint or a named tag. */
export function resolveLinkedSystem(id, path = 'linkedSystems') {
  const text = requireText(id, path, 40);
  if (CHOKEPOINT_RE.test(text)) {
    const name = CHOKEPOINT_NAMES.get(text);
    if (!name) fail(path, `unknown chokepoint ${text}`);
    return { id: text, name, kind: 'chokepoint' };
  }
  const name = LINKED_SYSTEM_TAGS[text];
  if (!name) fail(path, `unknown linked system ${JSON.stringify(text)}`);
  return { id: text, name, kind: 'tag' };
}

function requireLinkedSystems(value, path) {
  const list = requireArray(value, path, {
    min: 1,
    max: PORT_DOSSIER_MAX_LINKED_SYSTEMS,
  });
  const resolved = list.map((entry, index) =>
    resolveLinkedSystem(entry, `${path}[${index}]`),
  );
  requireUnique(
    resolved.map((system) => system.id),
    path,
  );
  return resolved;
}

/**
 * Validate one hand-written seed entry (PRD §9.6.2). Every field is required
 * so that adding a port is data entry that fails loudly, never a partial
 * dossier.
 */
export function validateSeedEntry(entry, path = 'seed') {
  const record = requireRecord(entry, path);
  const known = new Set([
    'portid',
    'slug',
    'aliases',
    'role',
    'roleNotes',
    'linkedSystems',
    'authority',
    'terminals',
    'wikipediaTitle',
    'cameraIds',
    'satelliteZoom',
  ]);
  for (const key of Object.keys(record)) {
    if (!known.has(key)) fail(`${path}.${key}`, 'is not a seed field');
  }
  return deepFreeze({
    portid: requireMatch(
      record.portid,
      PORTID_RE,
      `${path}.portid`,
      'a PortWatch port id',
    ),
    slug: requireMatch(
      record.slug,
      SLUG_RE,
      `${path}.slug`,
      'a kebab-case slug',
    ),
    aliases: requireTextList(record.aliases, `${path}.aliases`, {
      min: 1,
      max: PORT_DOSSIER_MAX_ALIASES,
      item: TEXT_LIMITS.alias,
    }),
    role: requireText(record.role, `${path}.role`, TEXT_LIMITS.role),
    roleNotes: requireText(
      record.roleNotes,
      `${path}.roleNotes`,
      TEXT_LIMITS.roleNotes,
    ),
    linkedSystems: requireLinkedSystems(
      record.linkedSystems,
      `${path}.linkedSystems`,
    ).map((system) => system.id),
    authority: requireAuthority(record.authority, `${path}.authority`),
    terminals: requireTerminals(record.terminals, `${path}.terminals`),
    wikipediaTitle: requireText(
      record.wikipediaTitle,
      `${path}.wikipediaTitle`,
      TEXT_LIMITS.title,
    ),
    cameraIds: requireCameraIds(record.cameraIds, `${path}.cameraIds`),
    satelliteZoom: requireInteger(
      record.satelliteZoom,
      `${path}.satelliteZoom`,
      PORT_SATELLITE_ZOOM,
    ),
  });
}

/** Validate the whole seed: at least one entry, ids, slugs and camera ids unique across entries. */
export function validateSeed(seed) {
  const list = requireArray(seed, 'seed', { min: 1 });
  const entries = list.map((entry, index) =>
    validateSeedEntry(entry, `seed[${index}]`),
  );
  requireUnique(
    entries.map((entry) => entry.portid),
    'seed.portid',
  );
  requireUnique(
    entries.map((entry) => entry.slug),
    'seed.slug',
  );
  requireUnique(
    entries.flatMap((entry) => entry.cameraIds),
    'seed.cameraIds',
  );
  return Object.freeze(entries);
}

/** The PortWatch ports-database fields the build script requests. */
export const PORTWATCH_REGISTRY_FIELDS = Object.freeze([
  'portid',
  'portname',
  'fullname',
  'country',
  'ISO3',
  'continent',
  'lat',
  'lon',
  'LOCODE',
  'vessel_count_total',
  'vessel_count_tanker',
  'vessel_count_container',
  'vessel_count_dry_bulk',
  'vessel_count_general_cargo',
  'vessel_count_RoRo',
  'industry_top1',
  'industry_top2',
  'industry_top3',
  'share_country_maritime_import',
  'share_country_maritime_export',
  'pageid',
]);

/** Normalize one registry row (ArcGIS `attributes`) into the identity and annual-count facts a dossier keeps. */
export function normalizePortWatchRegistryRow(attributes, path = 'registry') {
  const row = requireRecord(attributes, path);
  const industries = [row.industry_top1, row.industry_top2, row.industry_top3]
    .map((value, index) =>
      optionalText(value, `${path}.industry_top${index + 1}`, 80),
    )
    .filter(Boolean);
  return deepFreeze({
    portid: requireMatch(
      row.portid,
      PORTID_RE,
      `${path}.portid`,
      'a PortWatch port id',
    ),
    name: requireText(row.portname, `${path}.portname`),
    fullname: optionalText(row.fullname, `${path}.fullname`, 160),
    country: requireText(row.country, `${path}.country`, 80),
    iso3: optionalText(row.ISO3, `${path}.ISO3`, 3),
    continent: optionalText(row.continent, `${path}.continent`, 40),
    lat: requireCoordinate(row.lat, `${path}.lat`, 90),
    lon: requireCoordinate(row.lon, `${path}.lon`, 180),
    locode: optionalText(row.LOCODE, `${path}.LOCODE`, 12),
    annualCalls: {
      total: optionalCount(
        row.vessel_count_total,
        `${path}.vessel_count_total`,
      ),
      tanker: optionalCount(
        row.vessel_count_tanker,
        `${path}.vessel_count_tanker`,
      ),
      container: optionalCount(
        row.vessel_count_container,
        `${path}.vessel_count_container`,
      ),
      dryBulk: optionalCount(
        row.vessel_count_dry_bulk,
        `${path}.vessel_count_dry_bulk`,
      ),
      generalCargo: optionalCount(
        row.vessel_count_general_cargo,
        `${path}.vessel_count_general_cargo`,
      ),
      roro: optionalCount(row.vessel_count_RoRo, `${path}.vessel_count_RoRo`),
    },
    industries,
    countryShare: {
      importPct: optionalCount(
        row.share_country_maritime_import,
        `${path}.share_country_maritime_import`,
      ),
      exportPct: optionalCount(
        row.share_country_maritime_export,
        `${path}.share_country_maritime_export`,
      ),
    },
    pageid: requireMatch(
      row.pageid,
      /^[a-f0-9]{32}$/,
      `${path}.pageid`,
      'a PortWatch page id',
    ),
  });
}

function stripQuery(url) {
  const parsed = new URL(url);
  parsed.search = '';
  return parsed.href;
}

/**
 * Normalize a Wikipedia REST `page/summary` payload. Only a standard article
 * is accepted: a disambiguation page or a redirect that lands on another
 * title means the seed's `wikipediaTitle` needs correcting, not silencing.
 */
export function normalizeWikipediaSummary(
  payload,
  expectedTitle,
  path = 'wikipedia',
) {
  const record = requireRecord(payload, path);
  if (record.type !== 'standard')
    fail(
      `${path}.type`,
      `expected a standard article, got ${JSON.stringify(record.type)}`,
    );
  const title = requireText(record.title, `${path}.title`, TEXT_LIMITS.title);
  if (expectedTitle != null && title !== expectedTitle)
    fail(
      `${path}.title`,
      `resolved to ${JSON.stringify(title)}, not ${JSON.stringify(expectedTitle)}`,
    );
  const page = requireHttpsUrl(
    record.content_urls?.desktop?.page,
    `${path}.content_urls.desktop.page`,
  );
  let thumbnail = null;
  if (record.thumbnail != null) {
    const thumb = requireRecord(record.thumbnail, `${path}.thumbnail`);
    thumbnail = {
      url: stripQuery(
        requireHttpsUrl(thumb.source, `${path}.thumbnail.source`),
      ),
      width: requireInteger(thumb.width, `${path}.thumbnail.width`, { min: 1 }),
      height: requireInteger(thumb.height, `${path}.thumbnail.height`, {
        min: 1,
      }),
    };
  }
  return deepFreeze({
    title,
    url: page,
    description: optionalText(
      record.description,
      `${path}.description`,
      TEXT_LIMITS.description,
    ),
    extract: requireText(
      record.extract,
      `${path}.extract`,
      TEXT_LIMITS.extract,
    ),
    thumbnail,
    revision: requireMatch(
      record.revision,
      /^[0-9]+$/,
      `${path}.revision`,
      'a revision id',
    ),
    timestamp: requireMatch(
      record.timestamp,
      ISO_TIME_RE,
      `${path}.timestamp`,
      'an ISO timestamp',
    ),
    licence: WIKIPEDIA_LICENCE,
  });
}

/**
 * Join one validated seed entry, its registry row and its Wikipedia summary
 * into the dossier record the bundle stores. Key order is fixed so a rebuild
 * on unchanged sources reproduces the committed JSON byte for byte.
 */
export function buildPortDossierRecord({ seed, registry, wikipedia }) {
  if (!seed || !registry || !wikipedia)
    fail('dossier', 'seed, registry and wikipedia are all required');
  if (registry.portid !== seed.portid)
    fail(
      'dossier.portid',
      `registry row ${registry.portid} does not match seed ${seed.portid}`,
    );
  if (wikipedia.title !== seed.wikipediaTitle)
    fail(
      'dossier.wikipedia',
      `summary ${wikipedia.title} does not match seed ${seed.wikipediaTitle}`,
    );
  return normalizePortDossier({
    schemaVersion: PORT_DOSSIER_SCHEMA_VERSION,
    portid: seed.portid,
    slug: seed.slug,
    name: registry.name,
    fullname: registry.fullname,
    country: registry.country,
    iso3: registry.iso3,
    continent: registry.continent,
    locode: registry.locode,
    lat: registry.lat,
    lon: registry.lon,
    role: seed.role,
    roleNotes: seed.roleNotes,
    linkedSystems: seed.linkedSystems.map((id) => resolveLinkedSystem(id)),
    aliases: seed.aliases,
    authority: seed.authority,
    terminals: seed.terminals,
    annualCalls: registry.annualCalls,
    industries: registry.industries,
    countryShare: registry.countryShare,
    wikipedia,
    links: {
      authority: seed.authority.url,
      portwatch: `${PORTWATCH_PORT_PAGE_URL}${registry.pageid}`,
      wikipedia: wikipedia.url,
    },
    cameraIds: seed.cameraIds,
    satelliteZoom: seed.satelliteZoom,
  });
}

/** Validate a built dossier record (as read back from the bundle) and freeze it. */
export function normalizePortDossier(raw, path = 'dossier') {
  const record = requireRecord(raw, path);
  if (record.schemaVersion !== PORT_DOSSIER_SCHEMA_VERSION)
    fail(`${path}.schemaVersion`, `expected ${PORT_DOSSIER_SCHEMA_VERSION}`);
  const linkedSystems = requireArray(
    record.linkedSystems,
    `${path}.linkedSystems`,
    {
      min: 1,
      max: PORT_DOSSIER_MAX_LINKED_SYSTEMS,
    },
  ).map((entry, index) => {
    const system = requireRecord(entry, `${path}.linkedSystems[${index}]`);
    const resolved = resolveLinkedSystem(
      system.id,
      `${path}.linkedSystems[${index}].id`,
    );
    if (system.name !== resolved.name || system.kind !== resolved.kind)
      fail(`${path}.linkedSystems[${index}]`, 'does not match its id');
    return resolved;
  });
  requireUnique(
    linkedSystems.map((system) => system.id),
    `${path}.linkedSystems`,
  );
  const annual = requireRecord(record.annualCalls, `${path}.annualCalls`);
  const share = requireRecord(record.countryShare, `${path}.countryShare`);
  const wiki = requireRecord(record.wikipedia, `${path}.wikipedia`);
  const links = requireRecord(record.links, `${path}.links`);
  const authority = requireAuthority(record.authority, `${path}.authority`);
  const wikipedia = normalizeWikipediaSummary(
    {
      type: 'standard',
      title: wiki.title,
      content_urls: { desktop: { page: wiki.url } },
      description: wiki.description,
      extract: wiki.extract,
      thumbnail:
        wiki.thumbnail == null
          ? null
          : {
              source: wiki.thumbnail.url,
              width: wiki.thumbnail.width,
              height: wiki.thumbnail.height,
            },
      revision: wiki.revision,
      timestamp: wiki.timestamp,
    },
    null,
    `${path}.wikipedia`,
  );
  if (wiki.licence !== WIKIPEDIA_LICENCE)
    fail(`${path}.wikipedia.licence`, `expected ${WIKIPEDIA_LICENCE}`);
  if (links.authority !== authority.url)
    fail(`${path}.links.authority`, 'does not match authority.url');
  if (links.wikipedia !== wikipedia.url)
    fail(`${path}.links.wikipedia`, 'does not match wikipedia.url');
  const portwatch = requireHttpsUrl(links.portwatch, `${path}.links.portwatch`);
  if (!portwatch.startsWith(PORTWATCH_PORT_PAGE_URL))
    fail(
      `${path}.links.portwatch`,
      `must start with ${PORTWATCH_PORT_PAGE_URL}`,
    );
  return deepFreeze({
    schemaVersion: PORT_DOSSIER_SCHEMA_VERSION,
    portid: requireMatch(
      record.portid,
      PORTID_RE,
      `${path}.portid`,
      'a PortWatch port id',
    ),
    slug: requireMatch(
      record.slug,
      SLUG_RE,
      `${path}.slug`,
      'a kebab-case slug',
    ),
    name: requireText(record.name, `${path}.name`),
    fullname: optionalText(record.fullname, `${path}.fullname`, 160),
    country: requireText(record.country, `${path}.country`, 80),
    iso3: optionalText(record.iso3, `${path}.iso3`, 3),
    continent: optionalText(record.continent, `${path}.continent`, 40),
    locode: optionalText(record.locode, `${path}.locode`, 12),
    lat: requireCoordinate(record.lat, `${path}.lat`, 90),
    lon: requireCoordinate(record.lon, `${path}.lon`, 180),
    role: requireText(record.role, `${path}.role`, TEXT_LIMITS.role),
    roleNotes: requireText(
      record.roleNotes,
      `${path}.roleNotes`,
      TEXT_LIMITS.roleNotes,
    ),
    linkedSystems,
    aliases: requireTextList(record.aliases, `${path}.aliases`, {
      min: 1,
      max: PORT_DOSSIER_MAX_ALIASES,
      item: TEXT_LIMITS.alias,
    }),
    authority,
    terminals: requireTerminals(record.terminals, `${path}.terminals`),
    annualCalls: {
      total: optionalCount(annual.total, `${path}.annualCalls.total`),
      tanker: optionalCount(annual.tanker, `${path}.annualCalls.tanker`),
      container: optionalCount(
        annual.container,
        `${path}.annualCalls.container`,
      ),
      dryBulk: optionalCount(annual.dryBulk, `${path}.annualCalls.dryBulk`),
      generalCargo: optionalCount(
        annual.generalCargo,
        `${path}.annualCalls.generalCargo`,
      ),
      roro: optionalCount(annual.roro, `${path}.annualCalls.roro`),
    },
    industries: requireTextList(record.industries, `${path}.industries`, {
      min: 0,
      max: 3,
      item: 80,
    }),
    countryShare: {
      importPct: optionalCount(
        share.importPct,
        `${path}.countryShare.importPct`,
      ),
      exportPct: optionalCount(
        share.exportPct,
        `${path}.countryShare.exportPct`,
      ),
    },
    wikipedia,
    links: { authority: authority.url, portwatch, wikipedia: wikipedia.url },
    cameraIds: requireCameraIds(record.cameraIds, `${path}.cameraIds`),
    satelliteZoom: requireInteger(
      record.satelliteZoom,
      `${path}.satelliteZoom`,
      PORT_SATELLITE_ZOOM,
    ),
  });
}

/** The compact index the panel imports statically: one row per bundled dossier. */
export function buildPortDossierIndex(records, { vintage }) {
  const list = requireArray(records, 'records', { min: 1 });
  requireUnique(
    list.map((record) => record.portid),
    'records.portid',
  );
  return deepFreeze({
    schemaVersion: PORT_DOSSIER_SCHEMA_VERSION,
    vintage: requireMatch(vintage, ISO_DATE_RE, 'vintage', 'an ISO date'),
    count: list.length,
    ports: list.map((record) => ({
      portid: record.portid,
      slug: record.slug,
      name: record.name,
      country: record.country,
      lat: record.lat,
      lon: record.lon,
      cameraIds: record.cameraIds,
      satelliteZoom: record.satelliteZoom,
      file: `${record.portid}.json`,
    })),
  });
}

/** Validate the bundle index as read back from disk. */
export function normalizePortDossierIndex(raw, path = 'index') {
  const record = requireRecord(raw, path);
  if (record.schemaVersion !== PORT_DOSSIER_SCHEMA_VERSION)
    fail(`${path}.schemaVersion`, `expected ${PORT_DOSSIER_SCHEMA_VERSION}`);
  const ports = requireArray(record.ports, `${path}.ports`, { min: 1 }).map(
    (entry, index) => {
      const row = requireRecord(entry, `${path}.ports[${index}]`);
      const portid = requireMatch(
        row.portid,
        PORTID_RE,
        `${path}.ports[${index}].portid`,
        'a PortWatch port id',
      );
      if (row.file !== `${portid}.json`)
        fail(`${path}.ports[${index}].file`, `expected ${portid}.json`);
      return {
        portid,
        slug: requireMatch(
          row.slug,
          SLUG_RE,
          `${path}.ports[${index}].slug`,
          'a kebab-case slug',
        ),
        name: requireText(row.name, `${path}.ports[${index}].name`),
        country: requireText(
          row.country,
          `${path}.ports[${index}].country`,
          80,
        ),
        lat: requireCoordinate(row.lat, `${path}.ports[${index}].lat`, 90),
        lon: requireCoordinate(row.lon, `${path}.ports[${index}].lon`, 180),
        cameraIds: requireCameraIds(
          row.cameraIds,
          `${path}.ports[${index}].cameraIds`,
        ),
        satelliteZoom: requireInteger(
          row.satelliteZoom,
          `${path}.ports[${index}].satelliteZoom`,
          PORT_SATELLITE_ZOOM,
        ),
        file: row.file,
      };
    },
  );
  requireUnique(
    ports.map((row) => row.portid),
    `${path}.ports`,
  );
  if (record.count !== ports.length)
    fail(`${path}.count`, `expected ${ports.length}`);
  return deepFreeze({
    schemaVersion: PORT_DOSSIER_SCHEMA_VERSION,
    vintage: requireMatch(
      record.vintage,
      ISO_DATE_RE,
      `${path}.vintage`,
      'an ISO date',
    ),
    count: ports.length,
    ports,
  });
}

export * from './dossierSections.js';
