/**
 * US LNG cargoes from the DOE monthly "U.S. LNG Exports and Re-Exports
 * Details" workbook (docs/COMMODITIES-PLAN.md §12.6.1 item 3): vessel exports
 * only, one row per cargo. The bundle carries the per-cargo rows for the
 * trailing 24 months and the full monthly terminal-by-country aggregate
 * since 2016; the layer's span is the trailing twelve months.
 */

import { resolveImportEndpoint } from './endpoints.mjs';

export const DOE_SHEET = 'By Vessel and ISO Container';
export const DOE_COLUMNS = Object.freeze([
  'Arrival/Departure Date',
  'Companies',
  'Docket Number',
  'Docket Term',
  'Activity',
  'Gas Type',
  'Supplier',
  'Mode of Transport',
  'Tanker',
  'Point of Entry or Exit',
  'Country',
  'Volume (MMCF)',
  'U.S. Contiguous',
]);

const text = (v) =>
  v === null || v === undefined || String(v).trim() === ''
    ? null
    : String(v).trim();

/** Every vessel export cargo with a departure date, oldest first. */
export function readDoeCargoes(rows) {
  const header = rows[0]?.map((h) => text(h));
  DOE_COLUMNS.forEach((name, i) => {
    if (header?.[i] !== name)
      throw new Error(
        `DOE workbook: column ${i} is "${header?.[i]}", expected "${name}"`,
      );
  });
  const col = (name) => DOE_COLUMNS.indexOf(name);
  const cargoes = [];
  let vesselExportsWithoutDate = 0;
  for (const row of rows.slice(1)) {
    if (
      row[col('Mode of Transport')] !== 'Vessel' ||
      row[col('Activity')] !== 'Exports'
    )
      continue;
    const date = row[col('Arrival/Departure Date')];
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
      vesselExportsWithoutDate += 1;
      continue;
    }
    const mmcf = Number(row[col('Volume (MMCF)')]);
    if (!Number.isFinite(mmcf))
      throw new Error(
        `DOE workbook: non-numeric volume on ${date.toISOString().slice(0, 10)} ${row[col('Point of Entry or Exit')]}`,
      );
    const iso = date.toISOString().slice(0, 10);
    cargoes.push({
      date: iso,
      month: iso.slice(0, 7),
      company: text(row[col('Companies')]),
      docket: text(row[col('Docket Number')]),
      docketTerm: text(row[col('Docket Term')]),
      supplier: text(row[col('Supplier')]),
      tanker: text(row[col('Tanker')]),
      exit: text(row[col('Point of Entry or Exit')]),
      country: text(row[col('Country')]),
      mmcf: Math.round(mmcf * 100) / 100,
    });
  }
  if (vesselExportsWithoutDate)
    throw new Error(
      `DOE workbook: ${vesselExportsWithoutDate} vessel export rows without a date`,
    );
  return cargoes.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      (a.exit ?? '').localeCompare(b.exit ?? '') ||
      (a.country ?? '').localeCompare(b.country ?? '') ||
      (a.tanker ?? '').localeCompare(b.tanker ?? '') ||
      a.mmcf - b.mmcf,
  );
}

function monthsBack(month, n) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 - n, 1));
  return d.toISOString().slice(0, 7);
}

/** Build the cargo bundle payload; every exit name and destination must resolve. */
export function buildCargoes(
  cargoes,
  { terminals, crosswalk, detailMonths = 24, windowMonths = 12 },
) {
  const latestMonth = cargoes[cargoes.length - 1].month;
  const span = {
    from: monthsBack(latestMonth, windowMonths - 1),
    to: latestMonth,
  };
  const detailFrom = monthsBack(latestMonth, detailMonths - 1);

  const exits = new Map();
  for (const row of crosswalk.usExportTerminals)
    for (const name of row.doeNames) exits.set(name, row.gemId);
  for (const row of crosswalk.doeExitsOutsideUs)
    exits.set(row.doeName, row.gemId);
  const terminalIds = new Set(terminals.map((t) => t.id));
  const problems = [];
  for (const [name, id] of exits)
    if (!terminalIds.has(id))
      problems.push(
        `DOE exit "${name}" maps to ${id}, which is not in the terminal set`,
      );
  const unmappedInWindow = new Set();
  const unmappedEver = new Set();
  for (const c of cargoes) {
    if (exits.has(c.exit)) continue;
    (c.month >= span.from ? unmappedInWindow : unmappedEver).add(c.exit);
  }
  if (unmappedInWindow.size)
    problems.push(
      `DOE exits in the span without a crosswalk row: ${[...unmappedInWindow].join('; ')}`,
    );
  if (problems.length)
    throw new Error(`DOE cargoes do not resolve:\n  ${problems.join('\n  ')}`);

  const destinations = new Map();
  for (const country of new Set(cargoes.map((c) => c.country)))
    destinations.set(
      country,
      resolveImportEndpoint(country, terminals, crosswalk),
    );

  const monthly = new Map();
  for (const c of cargoes) {
    const terminalId = exits.get(c.exit) ?? null;
    if (!terminalId) continue;
    const key = `${c.month}|${terminalId}|${c.country}`;
    const agg = monthly.get(key) ?? {
      month: c.month,
      terminalId,
      country: c.country,
      cargoes: 0,
      mmcf: 0,
    };
    agg.cargoes += 1;
    agg.mmcf = Math.round((agg.mmcf + c.mmcf) * 100) / 100;
    monthly.set(key, agg);
  }

  const detail = cargoes
    .filter((c) => c.month >= detailFrom && exits.has(c.exit))
    .map((c) => ({
      date: c.date,
      terminalId: exits.get(c.exit),
      exit: c.exit,
      country: c.country,
      tanker: c.tanker,
      mmcf: c.mmcf,
      docketTerm: c.docketTerm,
      supplier: c.supplier,
      company: c.company,
    }));

  const pairs = new Map();
  for (const agg of monthly.values()) {
    if (agg.month < span.from) continue;
    const key = `${agg.terminalId}|${agg.country}`;
    const pair = pairs.get(key) ?? {
      terminalId: agg.terminalId,
      country: agg.country,
      cargoes: 0,
      mmcf: 0,
      months: 0,
    };
    pair.cargoes += agg.cargoes;
    pair.mmcf = Math.round((pair.mmcf + agg.mmcf) * 100) / 100;
    pair.months += 1;
    pairs.set(key, pair);
  }

  const inWindow = cargoes.filter((c) => c.month >= span.from);
  return {
    schema: 'lng-cargoes/1',
    latestMonth,
    firstMonth: cargoes[0].month,
    span,
    detailFrom,
    exits: [...exits]
      .map(([exit, terminalId]) => ({ exit, terminalId }))
      .sort((a, b) => a.exit.localeCompare(b.exit)),
    unmappedExitsBeforeWindow: [...unmappedEver].sort(),
    destinations: [...destinations]
      .map(([raw, endpoint]) => ({ doeCountry: raw, ...endpoint }))
      .sort((a, b) => a.doeCountry.localeCompare(b.doeCountry)),
    pairs: [...pairs.values()].sort(
      (a, b) =>
        a.terminalId.localeCompare(b.terminalId) ||
        a.country.localeCompare(b.country),
    ),
    monthly: [...monthly.values()].sort(
      (a, b) =>
        a.month.localeCompare(b.month) ||
        a.terminalId.localeCompare(b.terminalId) ||
        a.country.localeCompare(b.country),
    ),
    cargoes: detail,
    counts: {
      vesselExportsSince2016: cargoes.length,
      cargoesInWindow: inWindow.length,
      mmcfInWindow: Math.round(inWindow.reduce((s, c) => s + c.mmcf, 0)),
      countriesInWindow: new Set(inWindow.map((c) => c.country)).size,
      pairsInWindow: pairs.size,
      detailRows: detail.length,
      monthlyRows: monthly.size,
    },
  };
}
