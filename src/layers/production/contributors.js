import { daysInMonth } from './records.js';

/**
 * Main contributors to a production region (docs/COMMODITIES-PLAN.md §16,
 * R14.4 to R14.7, R14.14): who produces the region's gas, with shares, and
 * who drove its change against last month and last year.
 *
 * The region builders (`scripts/build-onshore.mjs`,
 * `scripts/build-gulf-platforms.mjs`) fold their per-facility monthly
 * volumes through `buildContributors` into two committed files: a small
 * contributors file the layer reads for the region card and the dossier, and
 * an aggregates file (operator × county or area × month) the Oil Oracle store
 * ingests. One parse, the same numbers on both sides.
 *
 * The operator of a facility is the one filed for each month, never the
 * newest one carried back: a well sold in March is the buyer's from March.
 * A committed alias table merges spellings of one company only, never a
 * parent and its subsidiaries (R14.7), and every merged row keeps the names
 * that were filed. Portable: no Cesium, no browser globals.
 */

export const CONTRIBUTORS_VERSION = 1;
export const CONTRIBUTOR_CHART_MONTHS = 24;
export const CONTRIBUTOR_FIELDS_PER_OPERATOR = 3;
export const UNFILED_OPERATOR = '(operator not filed)';

/** Parts must sum to the whole within this share of the base (G14.2: 0.1 %). */
export const RECONCILE_TOLERANCE = 0.001;

const LEGAL_FORMS = new Set([
  'INC',
  'INCORPORATED',
  'LLC',
  'LLP',
  'LP',
  'LTD',
  'LIMITED',
  'CORP',
  'CORPORATION',
  'CO',
  'COMPANY',
  'PLC',
]);

const byText = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

function positive(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : 0;
}

function round(value, places) {
  const f = 10 ** places;
  return Math.round(value * f) / f;
}

/* ------------------------------------------------------------------ *
 * Operator names
 * ------------------------------------------------------------------ */

/** The words of a filed name without its trailing legal form (`, INC.`, `LLC`, `COMPANY LP`). */
export function nameWords(name) {
  const words = String(name ?? '')
    .replace(/,/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  while (
    words.length > 1 &&
    LEGAL_FORMS.has(words.at(-1).replace(/\./g, '').toUpperCase())
  )
    words.pop();
  return words;
}

/** Case- and punctuation-blind key for spotting two spellings of one name. */
export function spellingKey(name) {
  return nameWords(name)
    .map((word) => word.replace(/[.&'-]/g, '').toUpperCase())
    .filter(Boolean)
    .join(' ');
}

/**
 * The shortest leading words that tell each name apart from every other name
 * in the set: `CONTINENTAL`, `DEVON`, `PETRO-HUNT` beside `PETRO-HUNT
 * DAKOTA`. A display abbreviation for the card; the dossier shows the names
 * as filed. Two names that cannot be told apart keep their full filed names.
 * @param {string[]} names
 * @returns {Map<string, string>}
 */
export function shortOperatorNames(names) {
  const unique = [...new Set(names)];
  const words = new Map(unique.map((name) => [name, nameWords(name)]));
  const key = (list, k) =>
    list
      .slice(0, k)
      .map((word) => word.toUpperCase())
      .join(' ');
  const out = new Map();
  for (const name of unique) {
    const mine = words.get(name);
    let k = 1;
    for (; k < mine.length; k += 1) {
      const prefix = key(mine, k);
      const clash = unique.some(
        (other) =>
          other !== name &&
          words.get(other).length >= k &&
          key(words.get(other), k) === prefix,
      );
      if (!clash) break;
    }
    out.set(name, mine.slice(0, k).join(' ') || name);
  }
  const seen = new Map();
  for (const short of out.values()) seen.set(short, (seen.get(short) ?? 0) + 1);
  for (const [name, short] of out) if (seen.get(short) > 1) out.set(name, name);
  return out;
}

/**
 * Filed names whose spellings collide but are not yet in the alias table: a
 * list for a human to judge (merge a spelling, never a parent and a
 * subsidiary), printed by the builders and kept out of the bundle.
 */
export function aliasCandidates(names, aliases = {}) {
  const groups = new Map();
  for (const name of new Set(names)) {
    const canonical = aliases[name] ?? name;
    const k = spellingKey(name);
    if (!k) continue;
    let group = groups.get(k);
    if (!group) {
      group = new Map();
      groups.set(k, group);
    }
    group.set(name, canonical);
  }
  const out = [];
  for (const group of groups.values()) {
    const canonicals = new Set(group.values());
    if (canonicals.size > 1) out.push([...group.keys()].sort(byText));
  }
  return out.sort((a, b) => byText(a[0], b[0]));
}

/* ------------------------------------------------------------------ *
 * Change attribution
 * ------------------------------------------------------------------ */

function emptyParts() {
  return {
    continuing: 0,
    newWells: 0,
    stopped: 0,
    notFiled: 0,
    acquired: 0,
    divested: 0,
    counts: { newWells: 0, stopped: 0, notFiled: 0, transferred: 0 },
  };
}

/**
 * Split a region's change in gas per day between two months into operators
 * and into what happened to the facilities (R14.5):
 *
 * - continuing: produced in both months under one operator, the difference;
 * - newWells: produced now, not in the base month (new, returned, or first
 *   filed) — credited to the operator filed now;
 * - stopped: produced in the base month, filed now with no gas;
 * - notFiled: produced in the base month, absent from this month's file
 *   (late filings, plugged, confidential) — named so a light file is visible;
 * - acquired / divested: produced in both months under different operators;
 *   the buyer is credited with this month's gas, the seller debited with the
 *   base month's, so transfers net to the continuing change.
 *
 * Every facility lands in exactly one part, so the parts sum to the whole by
 * construction; `reconciles` checks that against the region totals anyway.
 * Rates are per calendar day (volume ÷ days in the month).
 */
export function attributeChange(
  facilities,
  { months, baseIndex, currentIndex, operatorOf },
) {
  const baseMonth = months[baseIndex];
  const currentMonth = months[currentIndex];
  const baseDays = daysInMonth(baseMonth);
  const currentDays = daysInMonth(currentMonth);
  const operators = new Map();
  const part = (name) => {
    let entry = operators.get(name);
    if (!entry) {
      entry = { name, base: 0, current: 0, ...emptyParts() };
      operators.set(name, entry);
    }
    return entry;
  };
  const region = { base: 0, current: 0, ...emptyParts() };
  for (const facility of facilities) {
    const b = facility.gas[baseIndex];
    const c = facility.gas[currentIndex];
    const bRate = positive(b) / baseDays;
    const cRate = positive(c) / currentDays;
    if (!bRate && !cRate) continue;
    const ob = operatorOf(facility.operators[baseIndex]);
    const oc = operatorOf(facility.operators[currentIndex]);
    region.base += bRate;
    region.current += cRate;
    if (bRate) part(ob).base += bRate;
    if (cRate) part(oc).current += cRate;
    if (!bRate) {
      part(oc).newWells += cRate;
      part(oc).counts.newWells += 1;
      region.newWells += cRate;
      region.counts.newWells += 1;
    } else if (!cRate) {
      const filedNow = facility.filed
        ? facility.filed[currentIndex]
        : c !== null && c !== undefined;
      const key = filedNow ? 'stopped' : 'notFiled';
      part(ob)[key] -= bRate;
      part(ob).counts[key] += 1;
      region[key] -= bRate;
      region.counts[key] += 1;
    } else if (ob === oc) {
      part(oc).continuing += cRate - bRate;
      region.continuing += cRate - bRate;
    } else {
      part(oc).acquired += cRate;
      part(oc).counts.transferred += 1;
      part(ob).divested -= bRate;
      region.acquired += cRate;
      region.divested -= bRate;
      region.counts.transferred += 1;
    }
  }
  const sumParts = (p) =>
    p.continuing +
    p.newWells +
    p.stopped +
    p.notFiled +
    p.acquired +
    p.divested;
  const delta = region.current - region.base;
  const parts = sumParts(region);
  const scale = Math.max(region.base, region.current, 1);
  const rows = [...operators.values()]
    .map((entry) => ({ ...entry, delta: entry.current - entry.base }))
    .sort(
      (a, b) => Math.abs(b.delta) - Math.abs(a.delta) || byText(a.name, b.name),
    );
  const operatorSum = rows.reduce((sum, row) => sum + row.delta, 0);
  return {
    baseMonth,
    currentMonth,
    region: { ...region, delta },
    operators: rows,
    reconciles:
      Math.abs(parts - delta) <= RECONCILE_TOLERANCE * scale &&
      Math.abs(operatorSum - delta) <= RECONCILE_TOLERANCE * scale,
  };
}

/* ------------------------------------------------------------------ *
 * The files
 * ------------------------------------------------------------------ */

function roundParts(p) {
  return {
    continuing: round(p.continuing, 1),
    newWells: round(p.newWells, 1),
    stopped: round(p.stopped, 1),
    notFiled: round(p.notFiled, 1),
    acquired: round(p.acquired, 1),
    divested: round(p.divested, 1),
    counts: { ...p.counts },
  };
}

function compactAttribution(result, keep) {
  return {
    baseMonth: result.baseMonth,
    currentMonth: result.currentMonth,
    reconciles: result.reconciles,
    region: {
      baseMcfd: round(result.region.base, 1),
      currentMcfd: round(result.region.current, 1),
      deltaMcfd: round(result.region.delta, 1),
      ...roundParts(result.region),
    },
    operators: result.operators
      .filter((row) => keep.has(row.name))
      .map((row) => ({
        id: row.name,
        baseMcfd: round(row.base, 1),
        currentMcfd: round(row.current, 1),
        deltaMcfd: round(row.delta, 1),
        ...roundParts(row),
      })),
  };
}

/**
 * Fold a region's facilities into its contributors and aggregates files.
 *
 * @param {object} input
 * @param {Iterable<{id: string, group: string|null, field: string|null,
 *   operators: Array<string|null>, gas: Array<number|null>,
 *   oil: Array<number|null>, filed?: boolean[]}>} input.facilities monthly
 *   volumes as filed (Mcf and bbl per month; null = not filed), the operator
 *   filed each month, and whether the facility is in each month's file at all
 *   (defaults to "gas was filed").
 * @param {string[]} input.months the window, oldest first.
 * @param {number} input.currentIndex the newest complete month.
 * @param {{id: string, name: string}} input.region
 * @param {{name: string, grain: string, license?: string}} input.source
 * @param {'county'|'area'} [input.groupLabel]
 * @param {'well'|'structure'} [input.facilityLabel]
 * @param {Record<string, string>} [input.aliases] filed spelling → canonical spelling.
 */
export function buildContributors({
  facilities,
  months,
  currentIndex,
  region,
  source,
  retrieved = null,
  groupLabel = 'county',
  facilityLabel = 'well',
  aliases = {},
  chartMonths = CONTRIBUTOR_CHART_MONTHS,
}) {
  const list = [...facilities];
  const n = months.length;
  const operatorOf = (filed) =>
    filed === null || filed === undefined || filed === ''
      ? UNFILED_OPERATOR
      : (aliases[filed] ?? filed);

  const ops = new Map();
  const op = (name) => {
    let entry = ops.get(name);
    if (!entry) {
      entry = {
        name,
        filed: new Set(),
        gas: new Array(n).fill(0),
        oil: new Array(n).fill(0),
        producing: new Array(n).fill(0),
        fields: new Map(),
      };
      ops.set(name, entry);
    }
    return entry;
  };
  const total = {
    gas: new Array(n).fill(0),
    oil: new Array(n).fill(0),
    producing: new Array(n).fill(0),
  };
  const cells = new Map();
  const groups = new Set();
  const filedNames = new Set();
  for (const facility of list) {
    for (let at = 0; at < n; at += 1) {
      const gas = positive(facility.gas[at]);
      const oil = positive(facility.oil[at]);
      const filed = facility.operators[at];
      if (filed) filedNames.add(filed);
      if (!gas && !oil) continue;
      const name = operatorOf(filed);
      const entry = op(name);
      if (filed) entry.filed.add(filed);
      entry.gas[at] += gas;
      entry.oil[at] += oil;
      entry.producing[at] += 1;
      total.gas[at] += gas;
      total.oil[at] += oil;
      total.producing[at] += 1;
      if (at === currentIndex && gas && facility.field) {
        const field = entry.fields.get(facility.field) ?? { gas: 0, n: 0 };
        field.gas += gas;
        field.n += 1;
        entry.fields.set(facility.field, field);
      }
      const group = facility.group ?? null;
      if (group) groups.add(group);
      const key = `${name}\u0000${group ?? ''}\u0000${at}`;
      const cell = cells.get(key) ?? {
        operator: name,
        group,
        at,
        gas: 0,
        oil: 0,
        producing: 0,
      };
      cell.gas += gas;
      cell.oil += oil;
      cell.producing += 1;
      cells.set(key, cell);
    }
  }

  const mom =
    currentIndex >= 1
      ? attributeChange(list, {
          months,
          baseIndex: currentIndex - 1,
          currentIndex,
          operatorOf,
        })
      : null;
  const yoy =
    currentIndex >= 12
      ? attributeChange(list, {
          months,
          baseIndex: currentIndex - 12,
          currentIndex,
          operatorOf,
        })
      : null;

  // The browser file: the chart window ending at the current month, every
  // operator with gas or oil in it, ranked by gas this month.
  const start = Math.max(0, currentIndex - chartMonths + 1);
  const window = months.slice(start, currentIndex + 1);
  const sliceOf = (values) => values.slice(start, currentIndex + 1);
  const inWindow = [...ops.values()].filter((entry) =>
    sliceOf(entry.producing).some((count) => count > 0),
  );
  inWindow.sort(
    (a, b) =>
      b.gas[currentIndex] - a.gas[currentIndex] ||
      b.oil[currentIndex] - a.oil[currentIndex] ||
      byText(a.name, b.name),
  );
  const shorts = shortOperatorNames(inWindow.map((entry) => entry.name));
  const keep = new Set(inWindow.map((entry) => entry.name));
  const operators = inWindow.map((entry) => {
    const fields = [...entry.fields]
      .sort((a, b) => b[1].gas - a[1].gas || byText(a[0], b[0]))
      .map(([name, value]) => ({ name, gas: value.gas, producing: value.n }));
    return {
      id: entry.name,
      name: entry.name,
      short: shorts.get(entry.name),
      filedNames: [...entry.filed].sort(byText),
      fieldCount: fields.length,
      fields: fields.slice(0, CONTRIBUTOR_FIELDS_PER_OPERATOR),
      gas: sliceOf(entry.gas),
      oil: sliceOf(entry.oil),
      producing: sliceOf(entry.producing),
    };
  });
  const appliedAliases = Object.entries(aliases)
    .filter(([filed]) => filedNames.has(filed))
    .sort((a, b) => byText(a[0], b[0]));

  const header = {
    region: { id: region.id, name: region.name },
    source: {
      name: source.name,
      grain: source.grain,
      license: source.license ?? null,
    },
    retrieved,
    facilityLabel,
    groupLabel,
    operatorRule:
      'the operator filed for each month; spellings of one company merge through a committed alias table, never a parent and its subsidiaries',
    aliases: appliedAliases,
  };
  const contributors = {
    id: `${region.id}-contributors`,
    version: CONTRIBUTORS_VERSION,
    ...header,
    units: {
      gas: 'Mcf per month',
      oil: 'bbl per month',
      producing: `${facilityLabel}s producing`,
      attribution: 'Mcf per calendar day',
    },
    months: window,
    current: { month: months[currentIndex], index: window.length - 1 },
    total: {
      gas: sliceOf(total.gas),
      oil: sliceOf(total.oil),
      producing: sliceOf(total.producing),
    },
    operators,
    attribution: {
      mom: mom ? compactAttribution(mom, keep) : null,
      yoy: yoy ? compactAttribution(yoy, keep) : null,
    },
  };

  const operatorNames = [...ops.keys()].sort(byText);
  const groupNames = [...groups].sort(byText);
  const operatorIndex = new Map(operatorNames.map((name, i) => [name, i]));
  const groupIndex = new Map(groupNames.map((name, i) => [name, i]));
  const rows = [...cells.values()]
    .map((cell) => [
      operatorIndex.get(cell.operator),
      cell.group === null ? -1 : groupIndex.get(cell.group),
      cell.at,
      cell.gas,
      cell.oil,
      cell.producing,
    ])
    .sort((a, b) => a[2] - b[2] || a[0] - b[0] || a[1] - b[1]);
  const aggregates = {
    id: `${region.id}-aggregates`,
    version: CONTRIBUTORS_VERSION,
    ...header,
    units: {
      gas: 'Mcf per month',
      oil: 'bbl per month',
      producing: `${facilityLabel}s producing`,
    },
    months,
    current: { month: months[currentIndex], index: currentIndex },
    columns: ['operator', groupLabel, 'month', 'gas', 'oil', 'producing'],
    operators: operatorNames,
    groups: groupNames,
    total,
    rows,
  };
  return {
    contributors,
    aggregates,
    candidates: aliasCandidates(filedNames, aliases),
    checks: {
      mom: mom?.reconciles ?? null,
      yoy: yoy?.reconciles ?? null,
    },
  };
}
