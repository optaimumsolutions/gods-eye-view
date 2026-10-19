/**
 * Flare records: pure payload validation and the site-bundle join
 * (docs/COMMODITIES-PLAN.md §17, FR-F6). `/api/flares` serves nightly
 * readings keyed by site id; the bundled gazetteer
 * (`src/data/local_data/flares/<region>/sites.json`, FR-F1) owns every
 * position, so a mark can never appear off a filed flare site and the
 * unmatched heat ships as positioned grey pips, never as sites.
 */

const NIGHT_RE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T/;

/** Nights lit are counted over this many of the newest clear nights (FR-F6). */
export const FLARES_NORM_WINDOW_NIGHTS = 30;

function isoStamp(value) {
  return typeof value === 'string' && ISO_RE.test(value) ? value : null;
}

function finiteOr(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

/** Validate one per-site night row; a malformed row is dropped. */
function normalizeSiteRow(item) {
  const id = String(item?.id || '').trim();
  if (!id) return null;
  return {
    id,
    detections: finiteOr(item.detections, 0),
    maxFrp: finiteOr(item.maxFrp, 0),
    satellites: Array.isArray(item.satellites)
      ? item.satellites.map(String)
      : [],
    cloud: typeof item.cloud === 'string' ? item.cloud : 'unknown',
  };
}

/** Validate one night; null drops the night, never the snapshot. */
function normalizeNight(item) {
  if (!item || typeof item !== 'object') return null;
  const night = String(item.night || '');
  if (!NIGHT_RE.test(night)) return null;
  return {
    night,
    final: item.final === true,
    cloud: {
      state: String(item.cloud?.state || 'unknown'),
      stations: finiteOr(item.cloud?.stations, 0),
      covered: finiteOr(item.cloud?.covered, 0),
    },
    suspect: item.suspect === true,
    counts: {
      site: finiteOr(item.counts?.site, 0),
      unlisted: finiteOr(item.counts?.unlisted, 0),
      other: finiteOr(item.counts?.other, 0),
    },
    litSites: finiteOr(item.litSites, 0),
    siteFrpMw: finiteOr(item.siteFrpMw, 0),
    satellites: Array.isArray(item.satellites)
      ? item.satellites.map(String)
      : [],
    sites: (Array.isArray(item.sites) ? item.sites : [])
      .map(normalizeSiteRow)
      .filter(Boolean),
    overpasses: (Array.isArray(item.overpasses) ? item.overpasses : [])
      .filter((o) => Number.isFinite(o?.ms))
      .map((o) => ({ satellite: String(o.satellite || ''), ms: o.ms })),
    pips: (Array.isArray(item.pips) ? item.pips : [])
      .filter((p) => Number.isFinite(p?.lat) && Number.isFinite(p?.lon))
      .map((p) => ({
        lat: p.lat,
        lon: p.lon,
        frp: finiteOr(p.frp, 0),
        kind: p.kind === 'unlisted' ? 'unlisted' : 'other',
      })),
  };
}

/** Validate the proxy payload; null rejects the whole snapshot. */
export function normalizeFlaresPayload(payload) {
  if (!payload || typeof payload !== 'object') return null;
  if (!Array.isArray(payload.nights)) return null;
  const nights = payload.nights.map(normalizeNight).filter(Boolean);
  // Newest first, the provider's order, re-asserted so the norm windows hold.
  nights.sort((a, b) => (a.night < b.night ? 1 : -1));
  return {
    region: String(payload.region || ''),
    name: String(payload.name || ''),
    retrievedAt: isoStamp(payload.retrievedAt),
    source: String(payload.source || ''),
    windowNights: finiteOr(payload.windowNights, null),
    nights,
    baseline:
      payload.baseline && typeof payload.baseline === 'object'
        ? {
            clearNights: finiteOr(payload.baseline.clearNights, 0),
            litMedian: finiteOr(payload.baseline.litMedian, null),
            litP10: finiteOr(payload.baseline.litP10, null),
            litP90: finiteOr(payload.baseline.litP90, null),
            frpMedian: finiteOr(payload.baseline.frpMedian, null),
            frpP10: finiteOr(payload.baseline.frpP10, null),
            frpP90: finiteOr(payload.baseline.frpP90, null),
          }
        : null,
  };
}

/** Validate the bundled site gazetteer (FR-F1); null rejects it. */
export function normalizeSitesBundle(bundle) {
  if (!bundle || typeof bundle !== 'object') return null;
  if (!Array.isArray(bundle.sites) || !bundle.region?.id) return null;
  const sites = [];
  for (const site of bundle.sites) {
    const id = String(site?.id || '').trim();
    if (!id || !Number.isFinite(site.lat) || !Number.isFinite(site.lon))
      continue;
    sites.push({
      id,
      lat: site.lat,
      lon: site.lon,
      field: String(site.field || ''),
      county: String(site.county || ''),
      operators: Array.isArray(site.operators)
        ? site.operators.map(String)
        : [],
      wells: Array.isArray(site.wells) ? site.wells.length : 0,
      wellIds: Array.isArray(site.wells) ? site.wells.map(String) : [],
      flaredMonthly: Array.isArray(site.flared) ? site.flared : [],
      flaredMcfCurrent: Array.isArray(site.flared)
        ? finiteOr(site.flared.at(-1), 0)
        : 0,
      lastFlaredMonth: String(site.lastFlaredMonth || ''),
      monthsFlared: finiteOr(site.monthsFlared, 0),
      gasMcfCurrent: finiteOr(site.gas, 0),
      oilBblCurrent: finiteOr(site.oil, 0),
    });
  }
  if (!sites.length) return null;
  return {
    region: {
      id: String(bundle.region.id),
      name: String(bundle.region.name || bundle.region.id),
      center: {
        lat: finiteOr(bundle.region.center?.lat, null),
        lon: finiteOr(bundle.region.center?.lon, null),
      },
    },
    currentMonth: String(bundle.source?.currentMonth || ''),
    sourceName: String(bundle.source?.name || ''),
    retrieved: String(bundle.source?.retrieved || ''),
    months: Array.isArray(bundle.months) ? bundle.months.map(String) : [],
    counts: {
      sitesFlaringCurrent: finiteOr(bundle.counts?.sitesFlaringCurrent, 0),
      flaredMmcfdCurrent: finiteOr(bundle.counts?.flaredMmcfdCurrent, 0),
    },
    sites,
  };
}

/**
 * The night the regional view draws (FR-F6): the newest clear night the
 * suspect backstop trusts, else the newest night at all (flagged `isClear:
 * false` so the card says why the marks are thin).
 */
export function displayNightOf(nights) {
  const clear = nights.find((n) => n.cloud.state === 'clear' && !n.suspect);
  const night = clear ?? nights[0] ?? null;
  return night ? { ...night, isClear: Boolean(clear) } : null;
}

/** The newest `window` clear, trusted nights — the norm the colours read. */
export function clearWindow(nights, windowNights = FLARES_NORM_WINDOW_NIGHTS) {
  return nights
    .filter((n) => n.cloud.state === 'clear' && !n.suspect)
    .slice(0, windowNights);
}

/** Nights lit per site id over the clear window (the colour ramp's input). */
export function litNightCounts(
  nights,
  windowNights = FLARES_NORM_WINDOW_NIGHTS,
) {
  const counts = new Map();
  for (const night of clearWindow(nights, windowNights))
    for (const row of night.sites)
      counts.set(row.id, (counts.get(row.id) ?? 0) + 1);
  return counts;
}

/** Newest lit night per site id, any sky state (the hover card's age line). */
export function lastLitBySite(nights) {
  const last = new Map();
  for (const night of nights)
    for (const row of night.sites)
      if (!last.has(row.id))
        last.set(row.id, { night: night.night, maxFrp: row.maxFrp });
  return last;
}

/**
 * One site's served nights, oldest first, for the dossier's night chart
 * (FR-F7): FRP 0 on a served night the site was dark; `hatched` marks the
 * nights the chart draws as untrusted (obscured, or the suspect backstop).
 */
export function siteNightSeries(nights, siteId) {
  return [...nights]
    .sort((a, b) => (a.night < b.night ? -1 : 1))
    .map((night) => {
      const reading = night.sites.find((row) => row.id === siteId) ?? null;
      return {
        night: night.night,
        frp: reading?.maxFrp ?? 0,
        lit: Boolean(reading),
        hatched: night.cloud.state === 'obscured' || night.suspect,
        cloud: night.cloud.state,
      };
    });
}

/** The region's served nights, oldest first, for the region dossier. */
export function regionNightSeries(nights) {
  return [...nights]
    .sort((a, b) => (a.night < b.night ? -1 : 1))
    .map((night) => ({
      night: night.night,
      litSites: night.litSites,
      siteFrpMw: night.siteFrpMw,
      hatched: night.cloud.state === 'obscured' || night.suspect,
      cloud: night.cloud.state,
    }));
}

/** The region's filed flared Mcf per bundle month: the sites summed. */
export function regionFlaredMonthly(sites, monthCount) {
  const totals = new Array(monthCount).fill(0);
  for (const site of sites) {
    const series = site.flaredMonthly ?? [];
    for (let i = 0; i < monthCount; i += 1)
      totals[i] += Number.isFinite(series[i]) ? series[i] : 0;
  }
  return totals;
}

/**
 * Join the nightly readings onto the bundled gazetteer: one row per site,
 * lit when the display night saw it.
 */
export function buildFlaresSnapshot(payload, bundle) {
  const displayNight = displayNightOf(payload.nights);
  const litCounts = litNightCounts(payload.nights);
  const lastLit = lastLitBySite(payload.nights);
  const clearNights = clearWindow(payload.nights).length;
  const byId = new Map((displayNight?.sites ?? []).map((row) => [row.id, row]));
  let frpMax = 0;
  const rows = bundle.sites.map((site) => {
    const reading = byId.get(site.id) ?? null;
    if (reading) frpMax = Math.max(frpMax, reading.maxFrp);
    return {
      ...site,
      lit: Boolean(reading),
      detections: reading?.detections ?? 0,
      maxFrp: reading?.maxFrp ?? 0,
      satellites: reading?.satellites ?? [],
      siteCloud: reading?.cloud ?? null,
      litNights: litCounts.get(site.id) ?? 0,
      lastLit: lastLit.get(site.id) ?? null,
    };
  });
  return {
    region: bundle.region,
    regionName: payload.name || bundle.region.name,
    retrievedAt: payload.retrievedAt,
    source: payload.source,
    sourceName: bundle.sourceName,
    currentMonth: bundle.currentMonth,
    bundleCounts: bundle.counts,
    months: bundle.months,
    regionFlaredMonthly: regionFlaredMonthly(
      bundle.sites,
      bundle.months.length,
    ),
    windowNights: payload.windowNights,
    nights: payload.nights,
    baseline: payload.baseline,
    displayNight,
    latestNight: payload.nights[0] ?? null,
    clearNights,
    frpMax,
    rows,
  };
}

/** Calendar days in a `YYYY-MM` month. */
export function daysInMonth(month) {
  const [y, m] = String(month).split('-').map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m)) return 30;
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** A monthly Mcf figure as Mcf per calendar day of its month. */
export function mcfPerDay(mcf, month) {
  return Number.isFinite(mcf) ? mcf / daysInMonth(month) : null;
}

/** JSON-safe record for the analyst query engine; missing values are null. */
export function mapAnalystRecord(row) {
  return {
    id: String(row.id),
    field: row.field || null,
    county: row.county || null,
    operator: row.operators[0] ?? null,
    lat: Number.isFinite(row.lat) ? row.lat : null,
    lon: Number.isFinite(row.lon) ? row.lon : null,
    lit: row.lit,
    detections: row.detections,
    maxFrpMw: row.maxFrp,
    litNights: row.litNights,
    lastLitNight: row.lastLit?.night ?? null,
    flaredMcfCurrent: row.flaredMcfCurrent,
    monthsFlared: row.monthsFlared,
  };
}
