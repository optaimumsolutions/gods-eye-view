/**
 * Portable records for the `commodity-lng` layer: normalize and freeze the
 * four bundle files, derive the twelve-month readings, and format them
 * (docs/COMMODITIES-PLAN.md §12.6.2 item 9). No Cesium, no DOM, no browser
 * globals — this module runs in unit tests and in the build alike.
 *
 * Every derived number is arithmetic on published figures and is labelled
 * so on the card (R11): utilization is twelve-month MMcf ÷ baseload Bcf/d × 365 ×
 * 1,000, and nothing here infers a position, a cargo or a rate.
 */

export const LNG_LAYER_ID = 'commodity-lng';
export const LNG_LAYER_NAME = 'LNG · Terminals & Cargoes';

/** The two arc grades, visibly distinct and named on every card (§12.4 goal 2). */
export const LNG_GRADES = Object.freeze({
  doe: Object.freeze({
    id: 'doe',
    label: 'DOE cargo-level',
    period: 'trailing 12 months',
    dashed: false,
    unit: 'MMcf',
  }),
  giignl: Object.freeze({
    id: 'giignl',
    label: 'GIIGNL annual',
    period: 'annual 2025',
    dashed: true,
    unit: 'MT',
  }),
});

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

const num = (value) => {
  const n =
    typeof value === 'number'
      ? value
      : value == null || value === ''
        ? NaN
        : Number(value);
  return Number.isFinite(n) ? n : null;
};
const text = (value) => {
  if (value == null) return null;
  const s = String(value).trim();
  return s === '' ? null : s;
};
const list = (value) =>
  Array.isArray(value)
    ? Object.freeze(
        value.map((v) =>
          v && typeof v === 'object' ? Object.freeze({ ...v }) : v,
        ),
      )
    : Object.freeze([]);

/** `2026-06` → `Jun 2026`. */
export function formatMonth(month) {
  const m = /^(\d{4})-(\d{2})/.exec(String(month ?? ''));
  if (!m) return null;
  return `${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
}

/** Whole months from `from` to `to` (both `YYYY-MM`), or null. */
export function monthsBetween(from, to) {
  const a = /^(\d{4})-(\d{2})/.exec(String(from ?? ''));
  const b = /^(\d{4})-(\d{2})/.exec(String(to ?? ''));
  if (!a || !b) return null;
  return (Number(b[1]) - Number(a[1])) * 12 + (Number(b[2]) - Number(a[2]));
}

export function formatMtpa(value) {
  const n = num(value);
  return n === null
    ? null
    : `${n >= 10 ? n.toFixed(1) : n.toFixed(2).replace(/0$/, '')} Mtpa`;
}

export function formatMt(value) {
  const n = num(value);
  return n === null ? null : `${n.toFixed(1)} MT`;
}

export function formatBcfd(value) {
  const n = num(value);
  return n === null ? null : `${n.toFixed(2)} Bcf/d`;
}

export function formatMmcf(value) {
  const n = num(value);
  if (n === null) return null;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)} Tcf`;
  if (n >= 10_000) return `${(n / 1000).toFixed(1)} Bcf`;
  return `${Math.round(n).toLocaleString('en-US')} MMcf`;
}

export function formatNm(value) {
  const n = num(value);
  return n === null ? null : `${Math.round(n).toLocaleString('en-US')} nm`;
}

export function formatCount(value) {
  const n = num(value);
  return n === null ? null : Math.round(n).toLocaleString('en-US');
}

/**
 * Utilization as labelled arithmetic: MMcf shipped over the twelve months against
 * the baseload nameplate over the same span. Null, not NaN and not a throw,
 * when either side is missing or zero (the row 8 dossier once threw here).
 */
export function utilizationPct(spanMmcf, baseloadBcfd, { days = 365 } = {}) {
  const mmcf = num(spanMmcf);
  const bcfd = num(baseloadBcfd);
  if (mmcf === null || bcfd === null || bcfd <= 0 || mmcf < 0) return null;
  return (mmcf / (bcfd * 1000 * days)) * 100;
}

function normalizeTerminal(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = text(raw.id);
  const name = text(raw.name);
  const lat = num(raw.lat);
  const lon = num(raw.lon);
  if (
    !id ||
    !name ||
    lat === null ||
    lon === null ||
    Math.abs(lat) > 90 ||
    Math.abs(lon) > 180
  )
    return null;
  const kind =
    raw.kind === 'export' ? 'export' : raw.kind === 'import' ? 'import' : null;
  const status =
    raw.status === 'operating'
      ? 'operating'
      : raw.status === 'construction'
        ? 'construction'
        : null;
  if (!kind || !status) return null;
  const us = raw.us && typeof raw.us === 'object' ? raw.us : null;
  return Object.freeze({
    id,
    name,
    country: text(raw.country),
    subnational: text(raw.subnational),
    region: text(raw.region),
    kind,
    status,
    operator: text(raw.operator) ?? text(us?.operator),
    owners: list(raw.owners),
    parents: list(raw.parents),
    capacityMtpa: Math.max(0, num(raw.capacityMtpa) ?? 0),
    underConstructionMtpa: Math.max(0, num(raw.underConstructionMtpa) ?? 0),
    regasMtpa: num(raw.regasMtpa),
    startYear: num(raw.startYear),
    expectedYear: num(raw.expectedYear),
    lat,
    lon,
    url: text(raw.url),
    units: list(raw.units),
    otherUnits: list(raw.otherUnits),
    source: Object.freeze({
      name: text(raw.source?.name) ?? 'Global Energy Monitor',
      release: text(raw.source?.release),
      license: text(raw.source?.license),
      retrieved: text(raw.source?.retrieved),
    }),
    us: us
      ? Object.freeze({
          eiaProjects: list(us.eiaProjects),
          doeNames: list(us.doeNames),
          eiaApiTerminal: text(us.eiaApiTerminal),
          smallScale: Boolean(us.smallScale),
          operator: text(us.operator),
          trains: list(us.trains),
          trainsOperating: num(us.trainsOperating) ?? 0,
          trainsCommissioning: num(us.trainsCommissioning) ?? 0,
          trainsBuilding: num(us.trainsBuilding) ?? 0,
          baseloadBcfd: num(us.baseloadBcfd),
          baseloadMtpa: num(us.baseloadMtpa),
          peakBcfd: num(us.peakBcfd),
          peakMtpa: num(us.peakMtpa),
          dockets: Object.freeze({
            fta: list(us.dockets?.fta),
            nonFta: list(us.dockets?.nonFta),
            ferc: list(us.dockets?.ferc),
          }),
          states: list(us.states),
        })
      : null,
  });
}

export function normalizeTerminals(payload) {
  if (
    !payload ||
    typeof payload !== 'object' ||
    !Array.isArray(payload.terminals)
  )
    return null;
  const rows = payload.terminals.map(normalizeTerminal).filter(Boolean);
  if (!rows.length) return null;
  return Object.freeze({
    gem: Object.freeze({
      release: text(payload.gem?.release),
      retrieved: text(payload.gem?.retrieved),
      license: text(payload.gem?.license),
      file: text(payload.gem?.file),
    }),
    eia: Object.freeze({
      release: text(payload.eia?.release),
      retrieved: text(payload.eia?.retrieved),
    }),
    rows: Object.freeze(rows),
  });
}

export function normalizeCargoes(payload) {
  if (
    !payload ||
    typeof payload !== 'object' ||
    !Array.isArray(payload.pairs) ||
    !Array.isArray(payload.monthly)
  )
    return null;
  const latestMonth = text(payload.latestMonth);
  const from = text(payload.span?.from);
  if (!latestMonth || !from) return null;
  return Object.freeze({
    latestMonth,
    published: text(payload.published),
    span: Object.freeze({
      from,
      to: text(payload.span?.to) ?? latestMonth,
    }),
    source: Object.freeze({
      name: text(payload.source?.name) ?? 'DOE',
      retrieved: text(payload.source?.retrieved),
    }),
    pairs: list(payload.pairs),
    monthly: list(payload.monthly),
    cargoes: list(payload.cargoes),
    destinations: list(payload.destinations),
  });
}

export function normalizeMatrix(payload) {
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.cells))
    return null;
  const year = num(payload.year);
  if (year === null) return null;
  return Object.freeze({
    year,
    period: text(payload.period) ?? `annual ${year}`,
    world: num(payload.world),
    exporters: list(payload.exporters),
    importers: list(payload.importers),
    cells: list(payload.cells),
  });
}

function normalizeVariant(raw) {
  if (!raw || !Array.isArray(raw.coords) || raw.coords.length < 2) return null;
  return Object.freeze({
    nm: num(raw.nm),
    passages: list(raw.passages),
    via: list(raw.via),
    coords: Object.freeze(
      raw.coords.map(([lon, lat]) => Object.freeze([num(lon), num(lat)])),
    ),
  });
}

export function normalizeRoutes(payload) {
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.routes))
    return null;
  const rows = [];
  for (const raw of payload.routes) {
    const open = normalizeVariant(raw?.variants?.open);
    if (
      !open ||
      !text(raw.id) ||
      !text(raw.originId) ||
      !text(raw.destinationId)
    )
      continue;
    const grade = LNG_GRADES[raw.grade] ? raw.grade : null;
    if (!grade) continue;
    const redSeaClosed = normalizeVariant(raw.variants?.redSeaClosed);
    rows.push(
      Object.freeze({
        id: raw.id,
        grade,
        period: text(raw.period),
        originId: raw.originId,
        destinationId: raw.destinationId,
        originCountry: text(raw.originCountry),
        destinationCountry: text(raw.destinationCountry),
        doeCountry: text(raw.doeCountry),
        endpointRule: Object.freeze({
          origin: text(raw.endpointRule?.origin),
          destination: text(raw.endpointRule?.destination),
        }),
        redSeaExposed: Boolean(raw.redSeaExposed) && redSeaClosed !== null,
        variantInUse:
          raw.variantInUse === 'redSeaClosed' && redSeaClosed
            ? 'redSeaClosed'
            : 'open',
        variants: Object.freeze({ open, redSeaClosed }),
        volume: Object.freeze({
          cargoes: num(raw.volume?.cargoes),
          mmcf: num(raw.volume?.mmcf),
          months: num(raw.volume?.months),
          mt: num(raw.volume?.mt),
        }),
      }),
    );
  }
  if (!rows.length) return null;
  return Object.freeze({
    engine: Object.freeze({
      name: text(payload.engine?.name),
      version: text(payload.engine?.version),
      network: text(payload.engine?.network),
    }),
    policy: Object.freeze({
      redSeaClosedFrom: text(payload.policy?.redSeaClosedFrom),
      viaRadiusKm: num(payload.policy?.viaRadiusKm),
    }),
    unrouted: list(payload.unrouted),
    rows: Object.freeze(rows),
  });
}

/** The line drawn for a route: its variant in use. */
export function routeLine(route) {
  return route.variantInUse === 'redSeaClosed' && route.variants.redSeaClosed
    ? route.variants.redSeaClosed
    : route.variants.open;
}

/** Log-scaled width within a grade, 1.5 to 8 px (§12.6.2 item 13). */
export function arcWidthPx(
  volume,
  { min, max },
  { floor = 1.5, ceil = 8 } = {},
) {
  const v = num(volume);
  if (v === null || v <= 0 || !(max > 0)) return floor;
  const lo = Math.log10(Math.max(min, 1e-6));
  const hi = Math.log10(max);
  if (hi <= lo) return ceil;
  const t = Math.max(0, Math.min(1, (Math.log10(v) - lo) / (hi - lo)));
  return floor + t * (ceil - floor);
}

function derivedForExporter(terminal, cargoes, matrix, routes) {
  const pairs = cargoes.pairs.filter((p) => p.terminalId === terminal.id);
  const monthly = cargoes.monthly.filter((m) => m.terminalId === terminal.id);
  const inWindow = monthly.filter(
    (m) => m.month >= cargoes.span.from && m.month <= cargoes.span.to,
  );
  const detail = cargoes.cargoes.filter(
    (c) =>
      c.terminalId === terminal.id && c.date.slice(0, 7) >= cargoes.span.from,
  );
  const cargoCount = inWindow.reduce((s, m) => s + (m.cargoes ?? 0), 0);
  const mmcf = inWindow.reduce((s, m) => s + (m.mmcf ?? 0), 0);
  const byMonth = new Map();
  const series = [];
  const [y, mo] = cargoes.span.to.split('-').map(Number);
  for (let i = 23; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(y, mo - 1 - i, 1));
    const month = d.toISOString().slice(0, 7);
    byMonth.set(month, { month, cargoes: 0, mmcf: 0 });
    series.push(byMonth.get(month));
  }
  for (const m of monthly) {
    const slot = byMonth.get(m.month);
    if (!slot) continue;
    slot.cargoes += m.cargoes ?? 0;
    slot.mmcf += m.mmcf ?? 0;
  }
  const destinations = [...pairs]
    .sort((a, b) => b.mmcf - a.mmcf || a.country.localeCompare(b.country))
    .map((p) =>
      Object.freeze({
        country: p.country,
        cargoes: p.cargoes,
        mmcf: p.mmcf,
        months: p.months,
      }),
    );
  const tankers = new Set(detail.map((c) => c.tanker).filter(Boolean));
  const baseload = terminal.us?.baseloadBcfd ?? null;
  const months = monthsBetween(cargoes.span.from, cargoes.span.to) + 1;
  const matrixRow = matrix
    ? matrix.cells
        .filter(
          (c) =>
            matrix.exporters.find((e) => e.column === c.exporter)
              ?.terminalId === terminal.id,
        )
        .sort((a, b) => b.mt - a.mt || a.importer.localeCompare(b.importer))
        .map((c) => Object.freeze({ market: c.importer, mt: c.mt }))
    : [];
  return Object.freeze({
    span: cargoes.span,
    cargoes: cargoCount,
    mmcf: Math.round(mmcf * 100) / 100,
    months,
    destinations: Object.freeze(destinations),
    topDestination: destinations[0] ?? null,
    distinctTankers: tankers.size,
    meanCargoMmcf: cargoCount
      ? Math.round((mmcf / cargoCount) * 10) / 10
      : null,
    cargoesPerMonth: cargoCount
      ? Math.round((cargoCount / months) * 10) / 10
      : null,
    utilizationPct: utilizationPct(mmcf, baseload, {
      days: Math.round((months / 12) * 365),
    }),
    series: Object.freeze(
      series.map((s) =>
        Object.freeze({ ...s, mmcf: Math.round(s.mmcf * 100) / 100 }),
      ),
    ),
    matrixRow: Object.freeze(matrixRow),
    outboundRoutes: Object.freeze(
      routes.filter((r) => r.originId === terminal.id).map((r) => r.id),
    ),
  });
}

function derivedForImporter(terminal, routes, terminalsById) {
  const inbound = routes
    .filter((r) => r.destinationId === terminal.id)
    .map((r) => ({
      routeId: r.id,
      grade: r.grade,
      origin: terminalsById.get(r.originId)?.name ?? r.originId,
      originCountry: r.originCountry,
      volume: r.volume,
      period: r.period,
    }))
    .sort(
      (a, b) =>
        (b.volume.mmcf ?? b.volume.mt ?? 0) -
        (a.volume.mmcf ?? a.volume.mt ?? 0),
    );
  return Object.freeze({
    inbound: Object.freeze(inbound.map((i) => Object.freeze(i))),
  });
}

/**
 * The snapshot the layer holds: terminals with their derived readings, the
 * routes with names resolved, and one `asOf` line for the panel.
 */
export function buildLngSnapshot({ terminals, cargoes, matrix, routes }) {
  if (!terminals || !cargoes || !routes) return null;
  const terminalsById = new Map(terminals.rows.map((t) => [t.id, t]));
  const routeRows = routes.rows.filter(
    (r) => terminalsById.has(r.originId) && terminalsById.has(r.destinationId),
  );
  const rows = terminals.rows.map((t) => {
    const derived =
      t.kind === 'export'
        ? derivedForExporter(t, cargoes, matrix, routeRows)
        : derivedForImporter(t, routeRows, terminalsById);
    return Object.freeze({ ...t, derived });
  });
  const byId = new Map(rows.map((t) => [t.id, t]));
  const resolvedRoutes = routeRows.map((r) =>
    Object.freeze({
      ...r,
      originName: byId.get(r.originId).name,
      destinationName: byId.get(r.destinationId).name,
      line: routeLine(r),
    }),
  );
  const volumes = (grade, key) => {
    const values = resolvedRoutes
      .filter((r) => r.grade === grade)
      .map((r) => r.volume[key])
      .filter((v) => v > 0);
    return {
      min: values.length ? Math.min(...values) : 0,
      max: values.length ? Math.max(...values) : 0,
    };
  };
  const lag = cargoes.published
    ? monthsBetween(cargoes.latestMonth, cargoes.published.slice(0, 7))
    : null;
  return Object.freeze({
    rows: Object.freeze(rows),
    routes: Object.freeze(resolvedRoutes),
    scales: Object.freeze({
      doe: Object.freeze(volumes('doe', 'mmcf')),
      giignl: Object.freeze(volumes('giignl', 'mt')),
    }),
    span: cargoes.span,
    latestMonth: cargoes.latestMonth,
    monthly: cargoes.monthly,
    published: cargoes.published,
    lagMonths: lag,
    matrixYear: matrix?.year ?? null,
    gemRelease: terminals.gem.release,
    eiaRelease: terminals.eia.release,
    engine: routes.engine,
    unrouted: routes.unrouted,
    asOf: lngAsOf({
      span: cargoes.span,
      lagMonths: lag,
      gemRelease: terminals.gem.release,
    }),
    counts: Object.freeze({
      terminals: rows.length,
      exportTerminals: rows.filter((t) => t.kind === 'export').length,
      importTerminals: rows.filter((t) => t.kind === 'import').length,
      routes: resolvedRoutes.length,
      doeRoutes: resolvedRoutes.filter((r) => r.grade === 'doe').length,
      giignlRoutes: resolvedRoutes.filter((r) => r.grade === 'giignl').length,
    }),
  });
}

/** The panel meta line (§12.6.1 item 6): `Jul 2025 to Jun 2026 · DOE · 2-month lag`. */
export function lngAsOf({ span, lagMonths, gemRelease }) {
  const parts = [
    `${formatMonth(span.from)} to ${formatMonth(span.to)}`,
    'DOE',
    lagMonths != null ? `${lagMonths}-month lag` : null,
    gemRelease ? `GEM ${gemRelease}` : null,
  ];
  return parts.filter(Boolean).join(' · ');
}

/** Sort key for the dossier stepper: US export plants by baseload, largest first. */
export function usDossierOrder(rows) {
  return rows
    .filter((t) => t.kind === 'export' && t.us && !t.us.smallScale)
    .sort(
      (a, b) =>
        (b.us.baseloadBcfd ?? 0) - (a.us.baseloadBcfd ?? 0) ||
        b.capacityMtpa - a.capacityMtpa ||
        a.name.localeCompare(b.name),
    );
}

/** Flat, JSON-safe properties for the entity context store. */
export function mapAnalystRecord(row) {
  const d = row.derived ?? {};
  return {
    id: row.id,
    name: row.name,
    country: row.country,
    kind: row.kind,
    status: row.status,
    operator: row.operator,
    owners: row.owners.map((o) => o.name).join('; ') || null,
    capacityMtpa: row.capacityMtpa,
    underConstructionMtpa: row.underConstructionMtpa,
    startYear: row.startYear,
    lat: row.lat,
    lon: row.lon,
    grade: row.us ? 'EIA · DOE · GEM' : 'GEM',
    gemRelease: row.source.release,
    cargoes12m: d.cargoes ?? null,
    mmcf12m: d.mmcf ?? null,
    utilizationPct:
      d.utilizationPct == null ? null : Math.round(d.utilizationPct * 10) / 10,
    topDestination: d.topDestination?.country ?? null,
    inboundPairs: d.inbound?.length ?? null,
  };
}
