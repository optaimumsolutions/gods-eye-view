import { CONTRIBUTORS_VERSION, UNFILED_OPERATOR } from './contributors.js';
import { monthAbbrev } from './completeness.js';
import { daysInMonth, formatInt } from './records.js';

/**
 * What the region card and the Contributors dossier say about a region's
 * main contributors (docs/COMMODITIES-PLAN.md §16, R14.6): the top operators
 * with their shares, the change against last month led by the operators that
 * moved most, and the dossier's ranked table, stacked chart and change
 * ledger. Descriptive only (R11): shares and differences of filed volumes,
 * never a forecast. Pure; the DOM lives in `contributorsDossier.js`.
 */

/** Operators drawn in the stacked chart; the rest fold into "Other". */
export const CONTRIBUTOR_CHART_SERIES = 5;
/** Operators listed in the dossier table before the "others" row. */
export const CONTRIBUTOR_TABLE_ROWS = 15;
/** A "not in the file" part this share of the base or more is named on the card. */
export const LATE_FILING_NOTE_SHARE = 0.01;

/**
 * Categorical slots 1 to 5 of the reference palette, stepped for a dark
 * surface and validated on the drawer's (#101018): worst adjacent CVD ΔE 8.4,
 * normal-vision ΔE 19.3, all at least 3:1. "Other" is a neutral grey.
 */
export const CONTRIBUTOR_SERIES_COLORS = Object.freeze([
  '#3987e5',
  '#d95926',
  '#199e70',
  '#c98500',
  '#d55181',
]);
export const CONTRIBUTOR_OTHER_COLOR = '#6f6e69';

function num(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function joinParts(parts, sep = ' · ') {
  return parts
    .filter((p) => p !== null && p !== undefined && p !== '')
    .join(sep);
}

const MINUS = '−';

/** `3.43 Bcf/d`, `412.6 MMcf/d`, `845 Mcf/d`. */
export function formatGasRate(mcfd) {
  const n = num(mcfd);
  if (n === null) return 'n/a';
  const a = Math.abs(n);
  if (a >= 1_000_000) return `${(n / 1e6).toFixed(2)} Bcf/d`;
  if (a >= 1000) return `${(n / 1000).toFixed(1)} MMcf/d`;
  return `${formatInt(n)} Mcf/d`;
}

/** The unit a set of changes is written in: Bcf/d from 0.1 Bcf/d, else MMcf/d. */
export function deltaUnit(mcfd) {
  return Math.abs(num(mcfd) ?? 0) >= 100_000 ? 'Bcf/d' : 'MMcf/d';
}

/** `+27.5`, `−0.12` in the given unit, with a true minus sign. */
export function formatSignedIn(mcfd, unit) {
  const n = num(mcfd);
  if (n === null) return 'n/a';
  const value = unit === 'Bcf/d' ? n / 1e6 : n / 1000;
  const text = Math.abs(value).toFixed(unit === 'Bcf/d' ? 2 : 1);
  if (Number(text) === 0) return `±${text}`;
  return `${n > 0 ? '+' : MINUS}${text}`;
}

/** `+27.5 MMcf/d`, `−0.12 Bcf/d`. */
export function formatGasDelta(mcfd) {
  const unit = deltaUnit(mcfd);
  return `${formatSignedIn(mcfd, unit)} ${unit}`;
}

function formatShare(share) {
  const n = num(share);
  if (n === null) return 'n/a';
  return n >= 0.1 || n === 0
    ? `${Math.round(n * 100)} %`
    : `${(n * 100).toFixed(1)} %`;
}

function rateSeries(values, months) {
  return months.map((month, i) => {
    const v = num(values?.[i]);
    return v === null ? null : v / daysInMonth(month);
  });
}

function normaliseSpan(raw) {
  if (!raw || typeof raw !== 'object' || !raw.region) return null;
  const r = raw.region;
  const counts = r.counts ?? {};
  return {
    baseMonth: String(raw.baseMonth ?? ''),
    currentMonth: String(raw.currentMonth ?? ''),
    reconciles: raw.reconciles === true,
    region: {
      baseMcfd: num(r.baseMcfd) ?? 0,
      currentMcfd: num(r.currentMcfd) ?? 0,
      deltaMcfd: num(r.deltaMcfd) ?? 0,
      continuing: num(r.continuing) ?? 0,
      newWells: num(r.newWells) ?? 0,
      stopped: num(r.stopped) ?? 0,
      notFiled: num(r.notFiled) ?? 0,
      acquired: num(r.acquired) ?? 0,
      divested: num(r.divested) ?? 0,
      counts: {
        newWells: num(counts.newWells) ?? 0,
        stopped: num(counts.stopped) ?? 0,
        notFiled: num(counts.notFiled) ?? 0,
        transferred: num(counts.transferred) ?? 0,
      },
    },
    byOperator: new Map(
      (Array.isArray(raw.operators) ? raw.operators : []).map((o) => [
        String(o.id),
        {
          deltaMcfd: num(o.deltaMcfd) ?? 0,
          newWells: num(o.newWells) ?? 0,
          acquired: num(o.acquired) ?? 0,
          divested: num(o.divested) ?? 0,
        },
      ]),
    ),
  };
}

/**
 * Validate a contributors file and derive the rates the surfaces print.
 * Returns null for anything malformed: the card then simply has no lines.
 */
export function normaliseContributors(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (raw.version !== CONTRIBUTORS_VERSION) return null;
  const months = Array.isArray(raw.months) ? raw.months.map(String) : null;
  const at = raw.current?.index;
  if (!months?.length || !Number.isInteger(at) || at < 0 || at >= months.length)
    return null;
  if (!Array.isArray(raw.operators) || !raw.total) return null;
  const currentMonth = months[at];
  const days = daysInMonth(currentMonth);
  const totalGas = rateSeries(raw.total.gas, months);
  const totalMcfd = totalGas[at] ?? 0;
  const totalOilBbld = (num(raw.total.oil?.[at]) ?? 0) / days;
  const mom = normaliseSpan(raw.attribution?.mom);
  const yoy = normaliseSpan(raw.attribution?.yoy);
  const operators = raw.operators.map((o) => {
    const gas = rateSeries(o.gas, months);
    const current = gas[at] ?? 0;
    const id = String(o.id);
    return {
      id,
      name: String(o.name ?? id),
      short: String(o.short ?? o.name ?? id),
      unfiled: id === UNFILED_OPERATOR,
      filedNames: Array.isArray(o.filedNames) ? o.filedNames.map(String) : [],
      fieldCount: num(o.fieldCount) ?? 0,
      fields: Array.isArray(o.fields)
        ? o.fields.map((f) => ({
            name: String(f.name),
            gasMcfd: (num(f.gas) ?? 0) / days,
          }))
        : [],
      gasMcfd: gas,
      currentMcfd: current,
      share: totalMcfd > 0 ? current / totalMcfd : null,
      producing: num(o.producing?.[at]) ?? 0,
      mom: mom?.byOperator.get(id) ?? null,
      yoy: yoy?.byOperator.get(id) ?? null,
    };
  });
  const producingOperators = operators.filter((o) => o.currentMcfd > 0);
  return {
    id: String(raw.id ?? ''),
    region: raw.region ?? null,
    source: raw.source ?? null,
    retrieved: raw.retrieved ?? null,
    facilityLabel: String(raw.facilityLabel ?? 'well'),
    groupLabel: String(raw.groupLabel ?? 'county'),
    operatorRule: raw.operatorRule ?? null,
    aliases: Array.isArray(raw.aliases) ? raw.aliases : [],
    months,
    currentIndex: at,
    currentMonth,
    totalMcfd,
    totalOilBbld,
    totalGasMcfd: totalGas,
    producing: num(raw.total.producing?.[at]) ?? 0,
    operators,
    producingOperators,
    mom,
    yoy,
  };
}

/* ------------------------------------------------------------------ *
 * The region card
 * ------------------------------------------------------------------ */

function topShares(contributors, count) {
  return contributors.producingOperators
    .filter((o) => !o.unfiled)
    .slice(0, count);
}

/** `Top operators: CONTINENTAL 18 % · BURLINGTON 12 % · DEVON 12 %`. */
export function topOperatorsLine(contributors, count = 3) {
  if (!contributors) return null;
  const top = topShares(contributors, count);
  if (!top.length) return null;
  return `Top operators: ${top.map((o) => `${o.short} ${formatShare(o.share)}`).join(' · ')}`;
}

/** Operators ranked by the size of their change over a span, largest first. */
export function movers(contributors, span, count = 3) {
  const attribution = contributors?.[span];
  if (!attribution) return [];
  return contributors.operators
    .filter((o) => o[span] && Math.abs(o[span].deltaMcfd) > 0)
    .sort(
      (a, b) =>
        Math.abs(b[span].deltaMcfd) - Math.abs(a[span].deltaMcfd) ||
        (a.short < b.short ? -1 : a.short > b.short ? 1 : 0),
    )
    .slice(0, count);
}

/**
 * `vs Jun: +27.5 MMcf/d, led by BURLINGTON +8.0 · Zavanna +7.5 · PETRO-HUNT +7.3`,
 * plus what did not file when that is material, or a plain statement when
 * the parts do not sum to the change.
 */
export function changeLine(contributors, span = 'mom', count = 3) {
  const attribution = contributors?.[span];
  if (!attribution) return null;
  const r = attribution.region;
  const unit = deltaUnit(
    Math.max(
      Math.abs(r.deltaMcfd),
      ...movers(contributors, span, count).map((o) =>
        Math.abs(o[span].deltaMcfd),
      ),
    ),
  );
  const label =
    span === 'mom'
      ? `vs ${monthAbbrev(attribution.baseMonth)}`
      : `vs ${monthAbbrev(attribution.baseMonth)} ${attribution.baseMonth.slice(0, 4)}`;
  const led = movers(contributors, span, count)
    .map((o) => `${o.short} ${formatSignedIn(o[span].deltaMcfd, unit)}`)
    .join(' · ');
  const late =
    r.baseMcfd > 0 &&
    Math.abs(r.notFiled) >= LATE_FILING_NOTE_SHARE * r.baseMcfd
      ? `${formatSignedIn(r.notFiled, unit)} not in the file`
      : null;
  return joinParts(
    [
      `${label}: ${formatSignedIn(r.deltaMcfd, unit)} ${unit}${led ? `, led by ${led}` : ''}`,
      late,
      attribution.reconciles ? null : 'parts do not sum (late filings)',
    ],
    ' · ',
  );
}

/** The contributor lines the global-tier region card carries (R14.6). */
export function contributorCardLines(contributors) {
  if (!contributors) return [];
  return [
    topOperatorsLine(contributors),
    changeLine(contributors, 'mom'),
  ].filter(Boolean);
}

/** What a layer's `getStats()` reports about its contributors (QA and tests). */
export function contributorStats(contributors, dossier = null) {
  if (!contributors) return null;
  return {
    month: contributors.currentMonth,
    totalMcfd: contributors.totalMcfd,
    operators: contributors.producingOperators.length,
    top: topShares(contributors, 5).map((o) => ({
      id: o.id,
      short: o.short,
      share: o.share,
      currentMcfd: o.currentMcfd,
    })),
    momDeltaMcfd: contributors.mom?.region.deltaMcfd ?? null,
    yoyDeltaMcfd: contributors.yoy?.region.deltaMcfd ?? null,
    reconciles: {
      mom: contributors.mom?.reconciles ?? null,
      yoy: contributors.yoy?.reconciles ?? null,
    },
    cardLines: contributorCardLines(contributors),
    open: Boolean(dossier?.isOpen?.()),
  };
}

/* ------------------------------------------------------------------ *
 * The dossier
 * ------------------------------------------------------------------ */

function partsRows(attribution, facilityLabel) {
  if (!attribution) return [];
  const r = attribution.region;
  const unit = deltaUnit(
    Math.max(
      Math.abs(r.deltaMcfd),
      Math.abs(r.continuing),
      Math.abs(r.newWells),
      Math.abs(r.notFiled),
    ),
  );
  const f = (v) => `${formatSignedIn(v, unit)} ${unit}`;
  const plural = (n) => `${formatInt(n)} ${facilityLabel}${n === 1 ? '' : 's'}`;
  const rows = [
    [
      'Change',
      `${f(r.deltaMcfd)} (${formatGasRate(r.baseMcfd)} → ${formatGasRate(r.currentMcfd)})`,
    ],
    [
      'Continuing',
      `${f(r.continuing)} from ${facilityLabel}s producing both months`,
    ],
    [
      'New',
      `${f(r.newWells)} from ${plural(r.counts.newWells)} not producing before`,
    ],
    [
      'Stopped',
      `${f(r.stopped)} from ${plural(r.counts.stopped)} filed with no gas`,
    ],
    [
      'Not filed',
      r.counts.notFiled
        ? `${f(r.notFiled)} from ${plural(r.counts.notFiled)} absent from the ${monthAbbrev(attribution.currentMonth)} file`
        : 'none: every producer filed',
    ],
    [
      'Operator changes',
      r.counts.transferred
        ? `${plural(r.counts.transferred)} changed operator: buyers ${f(r.acquired)}, sellers ${f(r.divested)}`
        : 'none',
    ],
    [
      'Parts',
      attribution.reconciles
        ? 'sum to the change'
        : 'do not sum to the change within 0.1 % (late or revised filings)',
    ],
  ];
  return rows;
}

/**
 * Pure: the Contributors dossier as data (R14.6): stats, a 24-month stacked
 * chart of the top operators and "Other", the ranked table, the change
 * ledger for both spans, the names behind merged rows, and the sources.
 */
export function buildContributorsDossierModel(
  contributors,
  { regionName = null, asOf = null } = {},
) {
  const c = contributors;
  const name = regionName ?? c.region?.name ?? 'Region';
  const unitLabel = c.facilityLabel;
  const top3 = topShares(c, 3).reduce((sum, o) => sum + (o.share ?? 0), 0);

  const chartOps = c.producingOperators.slice(0, CONTRIBUTOR_CHART_SERIES);
  const chartIds = new Set(chartOps.map((o) => o.id));
  const other = c.months.map((_, i) => {
    let rest = c.totalGasMcfd[i] ?? 0;
    for (const o of chartOps) rest -= o.gasMcfd[i] ?? 0;
    return Math.max(0, rest);
  });
  const series = [
    ...chartOps.map((o, i) => ({
      id: o.id,
      label: o.short,
      color: CONTRIBUTOR_SERIES_COLORS[i],
      values: o.gasMcfd.map((v) => v ?? 0),
    })),
    {
      id: 'other',
      label: `Other (${formatInt(c.operators.filter((o) => !chartIds.has(o.id)).length)})`,
      color: CONTRIBUTOR_OTHER_COLOR,
      values: other,
    },
  ];

  // One unit for the whole table, stated once in its header: an operator's
  // month-to-month change is MMcf/d-sized, and "±0.00 Bcf/d" says nothing.
  const tableOps = c.producingOperators.slice(0, CONTRIBUTOR_TABLE_ROWS);
  const unit = 'MMcf/d';
  const mmcfd = (mcfd) => (mcfd / 1000).toFixed(1);
  const rows = tableOps.map((o, i) => ({
    rank: i + 1,
    id: o.id,
    short: o.short,
    name: o.name,
    filedNames: o.filedNames,
    fields: formatInt(o.fieldCount),
    fieldTitle: o.fields
      .map((f) => `${f.name} ${formatGasRate(f.gasMcfd)}`)
      .join(', '),
    gas: mmcfd(o.currentMcfd),
    share: formatShare(o.share),
    mom: o.mom ? formatSignedIn(o.mom.deltaMcfd, unit) : 'n/a',
    yoy: o.yoy ? formatSignedIn(o.yoy.deltaMcfd, unit) : 'n/a',
    producing: formatInt(o.producing),
    color: chartIds.has(o.id)
      ? CONTRIBUTOR_SERIES_COLORS[chartOps.findIndex((x) => x.id === o.id)]
      : null,
  }));
  const rest = c.producingOperators.slice(CONTRIBUTOR_TABLE_ROWS);
  const restGas = rest.reduce((s, o) => s + o.currentMcfd, 0);

  const merged = c.operators
    .filter((o) => o.filedNames.length > 1)
    .map((o) => [o.short, `filed as ${o.filedNames.join(' / ')}`]);

  const priorLabel = c.mom ? monthAbbrev(c.mom.baseMonth) : null;
  const yearLabel = c.yoy
    ? `${monthAbbrev(c.yoy.baseMonth)} ${c.yoy.baseMonth.slice(0, 4)}`
    : null;
  const leadMom = movers(c, 'mom', 1)[0];
  const leadYoy = movers(c, 'yoy', 1)[0];

  const stats = [
    {
      label: 'Gas',
      value: formatGasRate(c.totalMcfd),
      note: `${formatInt(c.producing)} ${unitLabel}s with production · ${c.currentMonth}`,
    },
    {
      label: priorLabel ? `vs ${priorLabel}` : 'vs last month',
      value: c.mom ? formatGasDelta(c.mom.region.deltaMcfd) : 'n/a',
      note: leadMom ? `led by ${leadMom.short}` : '',
    },
    {
      label: yearLabel ? `vs ${yearLabel}` : 'vs last year',
      value: c.yoy ? formatGasDelta(c.yoy.region.deltaMcfd) : 'n/a',
      note: leadYoy ? `led by ${leadYoy.short}` : '',
    },
    {
      label: 'Top 3 share',
      value: formatShare(top3),
      note: `${formatInt(c.producingOperators.length)} operators with gas`,
    },
  ];

  const sections = [
    {
      title: priorLabel ? `Change vs ${priorLabel}` : 'Change vs last month',
      rows: partsRows(c.mom, unitLabel),
    },
    {
      title: yearLabel ? `Change vs ${yearLabel}` : 'Change vs last year',
      rows: partsRows(c.yoy, unitLabel),
    },
    {
      title: 'Names as filed',
      rows: merged.length ? merged : [['Merged', 'none']],
    },
    {
      title: 'Sources',
      rows: [
        [
          'Production',
          joinParts([
            c.source?.name ?? null,
            c.source?.grain ? `per ${c.source.grain}` : null,
            c.retrieved ? `retrieved ${c.retrieved}` : null,
          ]),
        ],
        ['Operator', c.operatorRule],
        [
          'Shares',
          `of the region's gas in ${c.currentMonth}, per calendar day; changes split by what each ${unitLabel} did`,
        ],
        ['Licence', c.source?.license ?? null],
      ],
    },
  ].map((section) => ({
    title: section.title,
    rows: section.rows.filter(([, value]) => value !== null && value !== ''),
  }));

  return {
    id: c.id,
    facilityLabel: unitLabel,
    kicker: joinParts(['main contributors', asOf]),
    title: name,
    subtitle: joinParts([
      `${formatInt(c.producingOperators.length)} operators`,
      `${formatInt(c.producing)} ${unitLabel}s with production`,
      c.currentMonth,
    ]),
    stats,
    chart: {
      months: c.months,
      series,
      unit: 'Mcf/d',
    },
    table: {
      unit,
      rows,
      rest: rest.length
        ? {
            label: `${formatInt(rest.length)} others`,
            gas: mmcfd(restGas),
            share: formatShare(c.totalMcfd > 0 ? restGas / c.totalMcfd : null),
          }
        : null,
    },
    sections,
    footer: joinParts([
      asOf ?? c.currentMonth,
      'filings as reported, descriptive only',
    ]),
  };
}
