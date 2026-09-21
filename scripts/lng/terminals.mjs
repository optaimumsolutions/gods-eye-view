/**
 * LNG terminals: GEM's Global Gas Infrastructure Tracker units rolled up to
 * one record per terminal, with the EIA train table joined onto the US export
 * plants through the hand-kept crosswalk (docs/COMMODITIES-PLAN.md §12.6.1
 * items 1 and 2).
 *
 * Two GEM inputs are accepted. The form-gated xlsx is the primary; until it is
 * on disk the build reads the LNG units of GEM's own public tracker-map feed
 * (same September 2025 release, CC BY 4.0, no operator column). Either way the
 * column names are asserted, so a rename is a build failure that names the
 * column rather than a silently emptier map.
 */

import { readFileSync } from 'node:fs';

/** GEM feed properties the build depends on. Asserted on every feature. */
export const GEM_FEED_COLUMNS = Object.freeze([
  'name',
  'unit-name',
  'url',
  'project-id',
  'status',
  'country-area1',
  'owner',
  'parent',
  'start-year',
  'capacity',
  'subnational',
  'region',
  'units-of-m',
  'facility-type',
  'Latitude',
  'Longitude',
]);

/** GEM xlsx columns (PRD list plus the identity columns), asserted when the xlsx is used. */
export const GEM_XLSX_COLUMNS = Object.freeze({
  terminal: 'TerminalName',
  unit: 'UnitName',
  projectId: 'ProjectID',
  country: 'Country',
  facilityType: 'Facility Type',
  owner: 'Owner',
  parent: 'Parent',
  operator: 'Operator',
  capacity: 'Capacity (Mtpa)',
  status: 'Status',
  startYear: 'Start Year',
  lat: 'Latitude',
  lon: 'Longitude',
  accuracy: 'Location accuracy',
  subnational: 'State/Province',
  region: 'Region',
  wiki: 'Wiki',
});

const KEPT_STATUSES = new Set(['operating', 'construction']);

const num = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const n =
    typeof value === 'number'
      ? value
      : Number(String(value).replace(/[^\d.-]+$/u, ''));
  return Number.isFinite(n) ? n : null;
};

const text = (value) => {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s === '' ? null : s;
};

/** "Cheniere Energy Partners LP [100.0%]; Other Co [0%]" → [{ name, pct }]. */
export function parseOwners(value) {
  const s = text(value);
  if (!s || /^unknown/i.test(s)) return [];
  return s
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const m = part.match(/^(.*?)\s*\[([^\]]*)\]\s*$/);
      const name = (m ? m[1] : part).trim();
      const pct = m ? num(m[2].replace('%', '')) : null;
      return {
        name,
        pct: pct === null || /unknown/i.test(m?.[2] ?? '') ? null : pct,
      };
    })
    .filter((o) => o.name && !/^unknown$/i.test(o.name));
}

function unitFromFeedFeature(feature, index) {
  const p = feature.properties ?? {};
  for (const column of GEM_FEED_COLUMNS) {
    if (!(column in p))
      throw new Error(
        `GEM feed feature ${index} lacks property "${column}" (has ${Object.keys(p).join(', ')})`,
      );
  }
  if (!/mtpa/i.test(p['units-of-m'] ?? ''))
    throw new Error(
      `GEM feed feature ${index} (${p.name}) is not in Mtpa: ${p['units-of-m']}`,
    );
  return {
    projectId: text(p['project-id']),
    terminal: text(p.name),
    unit: text(p['unit-name']),
    url: text(p.url),
    status: text(p.status)?.toLowerCase() ?? null,
    country: text(p['country-area1']),
    subnational: text(p.subnational),
    region: text(p.region),
    kind: text(p['facility-type'])?.toLowerCase() ?? null,
    owner: text(p.owner),
    parent: text(p.parent),
    operator: null,
    capacityMtpa: num(p.capacity),
    startYear: num(p['start-year']),
    lat: num(p.Latitude),
    lon: num(p.Longitude),
    accuracy: null,
  };
}

export function readGemFeed(file) {
  const parsed = JSON.parse(readFileSync(file, 'utf8'));
  if (!Array.isArray(parsed.features))
    throw new Error('GEM feed: not a FeatureCollection');
  return parsed.features.map(unitFromFeedFeature);
}

export function readGemXlsxRows(rows) {
  const header = rows[0]?.map((h) => text(h));
  const missing = Object.values(GEM_XLSX_COLUMNS).filter(
    (c) => !header?.includes(c),
  );
  if (missing.length)
    throw new Error(
      `GEM xlsx: missing column(s) ${missing.join(', ')}; header is ${JSON.stringify(header)}`,
    );
  const col = (name) => header.indexOf(name);
  return rows.slice(1).map((row) => ({
    projectId: text(row[col(GEM_XLSX_COLUMNS.projectId)]),
    terminal: text(row[col(GEM_XLSX_COLUMNS.terminal)]),
    unit: text(row[col(GEM_XLSX_COLUMNS.unit)]),
    url: text(row[col(GEM_XLSX_COLUMNS.wiki)]),
    status: text(row[col(GEM_XLSX_COLUMNS.status)])?.toLowerCase() ?? null,
    country: text(row[col(GEM_XLSX_COLUMNS.country)]),
    subnational: text(row[col(GEM_XLSX_COLUMNS.subnational)]),
    region: text(row[col(GEM_XLSX_COLUMNS.region)]),
    kind: text(row[col(GEM_XLSX_COLUMNS.facilityType)])?.toLowerCase() ?? null,
    owner: text(row[col(GEM_XLSX_COLUMNS.owner)]),
    parent: text(row[col(GEM_XLSX_COLUMNS.parent)]),
    operator: text(row[col(GEM_XLSX_COLUMNS.operator)]),
    capacityMtpa: num(row[col(GEM_XLSX_COLUMNS.capacity)]),
    startYear: num(row[col(GEM_XLSX_COLUMNS.startYear)]),
    lat: num(row[col(GEM_XLSX_COLUMNS.lat)]),
    lon: num(row[col(GEM_XLSX_COLUMNS.lon)]),
    accuracy: text(row[col(GEM_XLSX_COLUMNS.accuracy)]),
  }));
}

const sum = (units) =>
  Math.round(units.reduce((s, u) => s + (u.capacityMtpa ?? 0), 0) * 100) / 100;
const minYear = (units) => {
  const years = units.map((u) => u.startYear).filter((y) => Number.isFinite(y));
  return years.length ? Math.min(...years) : null;
};

/** Roll GEM units up to terminals: operating and under-construction units only. */
export function rollUpTerminals(units, { source }) {
  const byProject = new Map();
  const skipped = [];
  for (const unit of units) {
    if (!KEPT_STATUSES.has(unit.status)) continue;
    if (!unit.projectId || !unit.terminal || !unit.country)
      throw new Error(`GEM unit without identity: ${JSON.stringify(unit)}`);
    if (!Number.isFinite(unit.lat) || !Number.isFinite(unit.lon))
      throw new Error(
        `GEM unit ${unit.terminal} / ${unit.unit} has no coordinates`,
      );
    if (unit.kind !== 'export' && unit.kind !== 'import') {
      // A few small-scale reload and bunkering units carry no facility type;
      // they are neither producer nor regas end of a trade, so they are
      // recorded and left off the map rather than guessed at.
      skipped.push({
        terminal: unit.terminal,
        unit: unit.unit,
        country: unit.country,
        status: unit.status,
        facilityType: unit.kind,
      });
      continue;
    }
    if (!byProject.has(unit.projectId)) byProject.set(unit.projectId, []);
    byProject.get(unit.projectId).push(unit);
  }
  const terminals = [];
  for (const [projectId, projectUnits] of byProject) {
    const first = projectUnits[0];
    const exportUnits = projectUnits.filter((u) => u.kind === 'export');
    const importUnits = projectUnits.filter((u) => u.kind === 'import');
    const kind = exportUnits.length ? 'export' : 'import';
    const own = kind === 'export' ? exportUnits : importUnits;
    const operating = own.filter((u) => u.status === 'operating');
    const building = own.filter((u) => u.status === 'construction');
    const status = operating.length ? 'operating' : 'construction';
    const owners = parseOwners(first.owner);
    const parents = parseOwners(first.parent);
    terminals.push({
      id: projectId,
      name: first.terminal,
      country: first.country,
      subnational: first.subnational,
      region: first.region,
      kind,
      status,
      operator: first.operator,
      owners,
      parents,
      capacityMtpa: sum(operating),
      underConstructionMtpa: sum(building),
      regasMtpa:
        kind === 'export' && importUnits.some((u) => u.status === 'operating')
          ? sum(importUnits.filter((u) => u.status === 'operating'))
          : null,
      startYear: minYear(operating),
      expectedYear: minYear(building),
      lat: Math.round(first.lat * 1e5) / 1e5,
      lon: Math.round(first.lon * 1e5) / 1e5,
      positionSource: 'GEM',
      positionAccuracy: first.accuracy,
      url: first.url,
      units: [...own]
        .sort((a, b) => (a.unit ?? '').localeCompare(b.unit ?? ''))
        .map((u) => ({
          name: u.unit,
          status: u.status,
          capacityMtpa: u.capacityMtpa,
          startYear: u.startYear,
        })),
      otherUnits: (kind === 'export' ? importUnits : exportUnits).map((u) => ({
        name: u.unit,
        kind: u.kind,
        status: u.status,
        capacityMtpa: u.capacityMtpa,
        startYear: u.startYear,
      })),
      source,
    });
  }
  return {
    terminals: terminals.sort((a, b) => a.id.localeCompare(b.id)),
    skipped,
  };
}

const EIA_STATUS = Object.freeze({
  'commercial operation': 'operating',
  commissioning: 'commissioning',
  'under construction': 'construction',
});

const dateOf = (value) =>
  value instanceof Date && !Number.isNaN(value.getTime())
    ? value.toISOString().slice(0, 10)
    : null;

/** The `Existing & Under Construction` sheet as train records; footnote marks stripped. */
export function readEiaTrains(rows) {
  const header = rows[1];
  const expected = [
    'Project name',
    'Train',
    'Baseload nameplate capacity per Train',
    null,
    'Peak nameplate capacity',
  ];
  expected.forEach((name, i) => {
    if (name && !String(header?.[i] ?? '').startsWith(name))
      throw new Error(
        `EIA workbook: column ${i} is "${header?.[i]}", expected "${name}"`,
      );
  });
  if (!/^Operator/.test(String(header?.[20] ?? '')))
    throw new Error(
      `EIA workbook: column 20 is "${header?.[20]}", expected "Operator"`,
    );
  const trains = [];
  // The project name is printed once per project (a merged cell) and the
  // trains below it carry a blank; carry it forward until the Notes block.
  let project = null;
  for (const row of rows.slice(3)) {
    const label = text(row[0]);
    if (label && /^Notes/i.test(label)) break;
    if (label) project = label;
    if (!text(row[1])) continue;
    if (!project)
      throw new Error(
        `EIA workbook: train "${row[1]}" before any project name`,
      );
    // Footnote letters ride on the status ("Under constructionH"), so match
    // on the printed prefix rather than the whole string.
    const rawStatus = text(row[6]) ?? '';
    const statusKey = Object.keys(EIA_STATUS).find((k) =>
      rawStatus.toLowerCase().startsWith(k),
    );
    const status = statusKey ? EIA_STATUS[statusKey] : null;
    if (!status)
      throw new Error(
        `EIA workbook: unknown project status "${rawStatus}" on ${project} ${row[1]}`,
      );
    trains.push({
      project,
      train: text(row[1]),
      baseloadBcfd: num(row[2]),
      baseloadMtpa: num(row[3]),
      peakBcfd: num(row[4]),
      peakMtpa: num(row[5]),
      status,
      statusAsPrinted: rawStatus,
      inService: dateOf(row[7]),
      commercialStart: dateOf(row[8]),
      state: text(row[9]),
      ftaBcfd: num(row[10]),
      ftaMtpa: num(row[11]),
      ftaDocket: text(row[12]),
      nonFtaBcfd: num(row[13]),
      nonFtaMtpa: num(row[14]),
      nonFtaDocket: text(row[15]),
      fercBcfd: num(row[16]),
      fercMtpa: num(row[17]),
      fercDocket: text(row[18]),
      projectType: text(row[19]),
      operator: text(row[20]),
    });
  }
  return trains;
}

/** Join the EIA trains onto the US export terminals; every side must resolve. */
export function joinUsTrains(terminals, trains, crosswalk) {
  const byId = new Map(terminals.map((t) => [t.id, t]));
  const usExports = terminals.filter(
    (t) => t.country === 'United States' && t.kind === 'export',
  );
  const rows = crosswalk.usExportTerminals;
  const problems = [];
  for (const t of usExports)
    if (!rows.some((r) => r.gemId === t.id))
      problems.push(
        `GEM US export terminal ${t.id} ${t.name} has no crosswalk row`,
      );
  for (const r of rows)
    if (!byId.has(r.gemId))
      problems.push(
        `crosswalk row ${r.name} points at ${r.gemId}, which is not an operating or under-construction GEM terminal`,
      );
  const claimed = new Set(rows.flatMap((r) => r.eiaProjects));
  for (const project of new Set(trains.map((t) => t.project))) {
    if (
      !claimed.has(project) &&
      !(project in crosswalk.eiaProjectsOutsideGemSet)
    )
      problems.push(
        `EIA project "${project}" is neither in the crosswalk nor listed as outside the GEM set`,
      );
  }
  for (const r of rows) {
    if (r.smallScale) continue;
    if (!r.eiaProjects.length)
      problems.push(`crosswalk row ${r.name} names no EIA project`);
    for (const p of r.eiaProjects)
      if (!trains.some((t) => t.project === p))
        problems.push(
          `crosswalk row ${r.name} names EIA project "${p}", absent from the workbook`,
        );
  }
  if (problems.length)
    throw new Error(
      `US terminal crosswalk does not resolve:\n  ${problems.join('\n  ')}`,
    );

  for (const r of rows) {
    const terminal = byId.get(r.gemId);
    const own = trains.filter((t) => r.eiaProjects.includes(t.project));
    const operating = own.filter((t) => t.status === 'operating');
    const uniq = (values) => [...new Set(values.filter(Boolean))];
    terminal.us = {
      eiaProjects: r.eiaProjects,
      doeNames: r.doeNames,
      eiaApiTerminal: r.eiaApiTerminal ?? null,
      smallScale: Boolean(r.smallScale),
      operator: uniq(own.map((t) => t.operator)).join('; ') || null,
      trains: own,
      trainsOperating: operating.length,
      trainsCommissioning: own.filter((t) => t.status === 'commissioning')
        .length,
      trainsBuilding: own.filter((t) => t.status === 'construction').length,
      baseloadBcfd:
        Math.round(
          operating.reduce((s, t) => s + (t.baseloadBcfd ?? 0), 0) * 1000,
        ) / 1000,
      baseloadMtpa:
        Math.round(
          operating.reduce((s, t) => s + (t.baseloadMtpa ?? 0), 0) * 100,
        ) / 100,
      peakBcfd:
        Math.round(
          operating.reduce((s, t) => s + (t.peakBcfd ?? 0), 0) * 1000,
        ) / 1000,
      peakMtpa:
        Math.round(operating.reduce((s, t) => s + (t.peakMtpa ?? 0), 0) * 100) /
        100,
      dockets: {
        fta: uniq(own.map((t) => t.ftaDocket)),
        nonFta: uniq(own.map((t) => t.nonFtaDocket)),
        ferc: uniq(own.map((t) => t.fercDocket)),
      },
      states: uniq(own.map((t) => t.state)),
    };
  }
  return {
    usExports: usExports.length,
    trainsJoined: trains.filter((t) => claimed.has(t.project)).length,
    trainsTotal: trains.length,
  };
}
