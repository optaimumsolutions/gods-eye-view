/**
 * Bundled United States data center records: normalization, derived
 * readings and the formatters every card shares. Portable: no Cesium, no
 * browser globals, so the panel, the overlay cards and the tests all read
 * the same numbers the same way.
 */

export const DATACENTER_LAYER_ID = 'energy-datacenters';

/** Illustrative gas arithmetic only; the dataset carries the same numbers. */
export const DEFAULT_GAS_ASSUMPTIONS = Object.freeze({
  heatRateMmbtuPerMwh: 7.0,
  gasEnergyMmbtuPerMcf: 1.037,
});

function num(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function text(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function list(value) {
  return Array.isArray(value)
    ? value.map((v) => (typeof v === 'string' ? v.trim() : v)).filter(Boolean)
    : [];
}

/**
 * Gas a facility load would burn if it were served entirely by gas-fired
 * generation around the clock, in million cubic feet per day. Descriptive
 * arithmetic with stated assumptions, never a statement of actual supply.
 */
export function gasEquivalentMmcfd(
  facilityMw,
  assumptions = DEFAULT_GAS_ASSUMPTIONS,
) {
  const mw = num(facilityMw);
  if (mw === null || mw <= 0) return null;
  const heatRate = num(assumptions?.heatRateMmbtuPerMwh);
  const gasEnergy = num(assumptions?.gasEnergyMmbtuPerMcf);
  if (!heatRate || !gasEnergy) return null;
  const mmbtuPerDay = mw * 24 * heatRate;
  return mmbtuPerDay / gasEnergy / 1000;
}

function normalizeTimeline(entries) {
  return list(entries)
    .map((entry) => {
      const date = text(entry?.date);
      if (!date) return null;
      return Object.freeze({
        date,
        milestone: text(entry.milestone) ?? '',
        buildingsOperational: num(entry.buildingsOperational),
        itPowerMw: num(entry.itPowerMw),
        facilityPowerMw: num(entry.facilityPowerMw),
        projected: entry.projected === true,
      });
    })
    .filter(Boolean)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function normalizeChips(entries) {
  return list(entries)
    .map((chip) => {
      const type = text(chip?.type);
      if (!type) return null;
      return Object.freeze({
        type,
        count: num(chip.count),
        date: text(chip.date),
      });
    })
    .filter(Boolean);
}

function normalizeOnSite(raw) {
  const site = raw && typeof raw === 'object' ? raw : {};
  return Object.freeze({
    type: text(site.type),
    capacityMw: num(site.capacityMw),
    capacityNote: text(site.capacityNote),
    plannedCapacityMw: num(site.plannedCapacityMw),
    plannedNote: text(site.plannedNote),
    units: text(site.units),
    permitStatus: text(site.permitStatus),
  });
}

function normalizePower(raw) {
  const power = raw && typeof raw === 'object' ? raw : {};
  return Object.freeze({
    gridUtility: text(power.gridUtility),
    gridOperator: text(power.gridOperator),
    interconnectionMw: num(power.interconnectionMw),
    interconnectionNote: text(power.interconnectionNote),
    substationMw: num(power.substationMw),
    substationNote: text(power.substationNote),
    onSiteGeneration: normalizeOnSite(power.onSiteGeneration),
    batteries: text(power.batteries),
    backupGenerators: text(power.backupGenerators),
  });
}

function normalizeCooling(raw) {
  const cooling = raw && typeof raw === 'object' ? raw : {};
  return Object.freeze({
    method: text(cooling.method),
    chillers: num(cooling.chillers),
    chillerCapacityMw: num(cooling.chillerCapacityMw),
    condensers: num(cooling.condensers),
    plannedChillers: num(cooling.plannedChillers),
    plannedChillerCapacityMw: num(cooling.plannedChillerCapacityMw),
  });
}

/** A campus outline as [lon, lat] pairs; fewer than three points is no footprint. */
function normalizeFootprint(ring) {
  if (!Array.isArray(ring)) return null;
  const points = ring
    .map((p) => (Array.isArray(p) ? [num(p[0]), num(p[1])] : null))
    .filter(
      (p) =>
        p &&
        p[0] !== null &&
        p[1] !== null &&
        Math.abs(p[0]) <= 180 &&
        Math.abs(p[1]) <= 90,
    );
  return points.length >= 3 ? Object.freeze(points.map(Object.freeze)) : null;
}

/** On-site plants and substations that get their own marker at the local tier. */
function normalizeAssets(entries) {
  return list(entries)
    .map((asset) => {
      const id = text(asset?.id);
      const name = text(asset?.name);
      const lat = num(asset?.lat);
      const lon = num(asset?.lon);
      if (!id || !name || lat === null || lon === null) return null;
      return Object.freeze({
        id,
        name,
        kind: text(asset.kind) ?? 'asset',
        lat,
        lon,
        capacityMw: num(asset.capacityMw),
        plannedCapacityMw: num(asset.plannedCapacityMw),
        note: text(asset.note),
      });
    })
    .filter(Boolean);
}

function normalizeSources(entries) {
  return list(entries)
    .map((s) => {
      const url = text(s?.url);
      if (!url) return null;
      return Object.freeze({ title: text(s.title) ?? url, url });
    })
    .filter(Boolean);
}

/**
 * One site record. Returns null when the essentials (id, name, position,
 * current IT power) are missing, so a broken row cannot reach the map.
 */
export function normalizeDatacenterSite(site, assumptions) {
  if (!site || typeof site !== 'object') return null;
  const id = text(site.id);
  const name = text(site.name);
  const lat = num(site.lat);
  const lon = num(site.lon);
  const itPowerMw = num(site.itPowerMw);
  if (!id || !name || lat === null || lon === null) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  if (itPowerMw === null || itPowerMw < 0) return null;

  const facilityPowerMw = num(site.facilityPowerMw);
  const plannedItPowerMw = num(site.plannedItPowerMw);
  const plannedFacilityPowerMw = num(site.plannedFacilityPowerMw);
  const capexUsdB = num(site.capexUsdB);
  const timeline = normalizeTimeline(site.timeline);
  const chips = normalizeChips(site.chips);
  const chipCount = chips.reduce((sum, c) => sum + (c.count ?? 0), 0) || null;
  const declaredStatus = text(site.status);
  const status =
    declaredStatus ??
    (plannedItPowerMw !== null && plannedItPowerMw > itPowerMw
      ? 'expanding'
      : 'operating');
  const latestMilestone =
    [...timeline].reverse().find((t) => !t.projected) ?? null;
  const nextMilestone = timeline.find((t) => t.projected) ?? null;

  return Object.freeze({
    id,
    name,
    owner: text(site.owner),
    operator: text(site.operator),
    users: list(site.users),
    investors: list(site.investors),
    builders: list(site.builders),
    energyCompanies: list(site.energyCompanies),
    project: text(site.project),
    address: text(site.address),
    city: text(site.city),
    county: text(site.county),
    state: text(site.state),
    lat,
    lon,
    positionSource: text(site.positionSource),
    status,
    asOf: text(site.asOf),
    itPowerMw,
    facilityPowerMw,
    plannedItPowerMw,
    plannedFacilityPowerMw,
    plannedDate: text(site.plannedDate),
    plannedNote: text(site.plannedNote),
    h100e: num(site.h100e),
    plannedH100e: num(site.plannedH100e),
    capexUsdB,
    plannedCapexUsdB: num(site.plannedCapexUsdB),
    computeCostUsdB: num(site.computeCostUsdB),
    constructionCostUsdB: num(site.constructionCostUsdB),
    annualOpexUsdB: num(site.annualOpexUsdB),
    chips,
    plannedChips: normalizeChips(site.plannedChips),
    chipCount,
    buildingsOperational: num(site.buildingsOperational),
    buildingsPlanned: num(site.buildingsPlanned),
    campusAcres: num(site.campusAcres),
    campusNote: text(site.campusNote),
    buildingSqFt: num(site.buildingSqFt),
    buildingSqFtNote: text(site.buildingSqFtNote),
    cooling: normalizeCooling(site.cooling),
    power: normalizePower(site.power),
    // EIA balancing authority the campus draws from, so the layer can join
    // the live grid feed onto the site without geocoding it again.
    balancingAuthority: text(site.balancingAuthority),
    balancingAuthorityNote: text(site.balancingAuthorityNote),
    waterUseMgd: num(site.waterUseMgd),
    waterNote: text(site.waterNote),
    firstOperational: text(site.firstOperational),
    timeline,
    latestMilestone,
    nextMilestone,
    sources: normalizeSources(site.sources),
    notes: list(site.notes),
    footprint: normalizeFootprint(site.footprint),
    assets: normalizeAssets(site.assets),
    // Derived readings, all null-safe.
    facilityToItRatio:
      facilityPowerMw !== null && itPowerMw > 0
        ? Math.round((facilityPowerMw / itPowerMw) * 100) / 100
        : null,
    capexPerItMwUsdM:
      capexUsdB !== null && itPowerMw > 0
        ? Math.round((capexUsdB * 1000) / itPowerMw)
        : null,
    plannedGrowthMw:
      plannedItPowerMw !== null
        ? Math.max(0, plannedItPowerMw - itPowerMw)
        : null,
    gasEquivalentMmcfd: gasEquivalentMmcfd(facilityPowerMw, assumptions),
    plannedGasEquivalentMmcfd: gasEquivalentMmcfd(
      plannedFacilityPowerMw,
      assumptions,
    ),
  });
}

/**
 * The whole bundled dataset: vintage, provenance and the ranked rows,
 * largest current IT power first. Returns null when the payload is not the
 * shape the bundle promises.
 */
export function normalizeDatacenterDataset(payload) {
  if (!payload || typeof payload !== 'object') return null;
  if (!Array.isArray(payload.sites)) return null;
  const vintage = text(payload.vintage);
  if (!vintage) return null;
  const assumptions = Object.freeze({
    heatRateMmbtuPerMwh:
      num(payload.assumptions?.gasHeatRateMmbtuPerMwh) ??
      DEFAULT_GAS_ASSUMPTIONS.heatRateMmbtuPerMwh,
    gasEnergyMmbtuPerMcf:
      num(payload.assumptions?.gasEnergyMmbtuPerMcf) ??
      DEFAULT_GAS_ASSUMPTIONS.gasEnergyMmbtuPerMcf,
  });
  const rows = payload.sites
    .map((site) => normalizeDatacenterSite(site, assumptions))
    .filter(Boolean)
    .sort((a, b) => b.itPowerMw - a.itPowerMw || a.id.localeCompare(b.id))
    .map((row, index) => Object.freeze({ ...row, rank: index + 1 }));
  const source =
    payload.source && typeof payload.source === 'object'
      ? Object.freeze({
          name: text(payload.source.name) ?? 'Epoch AI',
          url: text(payload.source.url),
          license: text(payload.source.license),
          retrieved: text(payload.source.retrieved),
        })
      : Object.freeze({
          name: 'Epoch AI',
          url: null,
          license: null,
          retrieved: null,
        });
  return Object.freeze({
    vintage,
    source,
    assumptions,
    selection: text(payload.selection),
    rows,
    asOf: datacenterAsOf(
      vintage,
      text(payload.source?.shortName) ?? 'Epoch AI',
    ),
  });
}

/** The one "as of" stamp the panel, the ambient card and the full card share. */
export function datacenterAsOf(vintage, sourceName = 'Epoch AI') {
  return `as of ${vintage} · ${sourceName}`;
}

/* ------------------------------------------------------------------ *
 * Formatting
 * ------------------------------------------------------------------ */

const INT = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

export function formatMw(value) {
  const n = num(value);
  return n === null ? 'n/a' : `${INT.format(Math.round(n))} MW`;
}

export function formatUsdB(value) {
  const n = num(value);
  if (n === null) return 'n/a';
  return n >= 10 ? `$${n.toFixed(1)}B` : `$${n.toFixed(2)}B`;
}

/** 440k, 1.04M, 985 */
export function formatCount(value) {
  const n = num(value);
  if (n === null) return 'n/a';
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `${Math.round(n / 1_000)}k`;
  return INT.format(Math.round(n));
}

export function formatMmcfd(value) {
  const n = num(value);
  return n === null ? 'n/a' : `${INT.format(Math.round(n))} MMcf/d`;
}

export function formatInt(value) {
  const n = num(value);
  return n === null ? 'n/a' : INT.format(Math.round(n));
}

/** JSON-safe record for the analyst query engine; missing values are null. */
export function mapAnalystRecord(row) {
  return {
    id: String(row.id),
    name: String(row.name),
    rank: row.rank ?? null,
    owner: row.owner ?? null,
    operator: row.operator ?? null,
    users: [...row.users],
    project: row.project ?? null,
    city: row.city ?? null,
    state: row.state ?? null,
    lat: row.lat,
    lon: row.lon,
    status: row.status,
    asOf: row.asOf ?? null,
    itPowerMw: row.itPowerMw,
    facilityPowerMw: row.facilityPowerMw,
    plannedItPowerMw: row.plannedItPowerMw,
    plannedFacilityPowerMw: row.plannedFacilityPowerMw,
    plannedDate: row.plannedDate ?? null,
    h100e: row.h100e,
    chipCount: row.chipCount,
    capexUsdB: row.capexUsdB,
    annualOpexUsdB: row.annualOpexUsdB,
    buildingsOperational: row.buildingsOperational,
    buildingsPlanned: row.buildingsPlanned,
    campusAcres: row.campusAcres,
    gridUtility: row.power.gridUtility,
    gridOperator: row.power.gridOperator,
    onSiteGenerationMw: row.power.onSiteGeneration.capacityMw,
    waterUseMgd: row.waterUseMgd,
    gasEquivalentMmcfd: row.gasEquivalentMmcfd,
    facilityToItRatio: row.facilityToItRatio,
    capexPerItMwUsdM: row.capexPerItMwUsdM,
  };
}
