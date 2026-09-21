/**
 * Extract the GIIGNL "LNG Quantities (in MT) received in <year>" matrix from
 * the public annual-report PDF into a CSV committed beside the LNG bundle
 * (docs/COMMODITIES-PLAN.md §12.6.1 item 4).
 *
 * Run once per report edition; the CSV, not the PDF, is what the bundle build
 * reads. Needs `pdftotext` (xpdf or poppler) on PATH: its `-table` mode keeps
 * every cell at a stable character column, which is the position-aware pass
 * the PRD asks for — blank cells shift nothing because we cluster the
 * horizontal positions of every numeric token in the block, expect exactly one
 * cluster per column, and assign tokens to the nearest cluster.
 *
 *   node scripts/extract-giignl-matrix.mjs .gev-cache/lng/giignl-2026-annual-report.pdf
 *   node scripts/extract-giignl-matrix.mjs <pdf> --year 2025 --out src/data/local_data/lng/giignl-2025-matrix.csv
 */

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/** The 30 columns of the 2026-edition matrix, left to right, as printed. */
export const GIIGNL_COLUMNS = Object.freeze([
  'Algeria',
  'Angola',
  'Cameroon',
  'Congo',
  'Egypt',
  'Equatorial Guinea',
  'Mauritania',
  'Mexico',
  'Nigeria',
  'Norway',
  'Russia Europe',
  'Trinidad & Tobago',
  'USA',
  'Atlantic Basin',
  'Oman',
  'Qatar',
  'UAE',
  'Middle East',
  'Australia',
  'Brunei',
  'Canada',
  'Indonesia',
  'Malaysia',
  'Mozambique',
  'Papua New Guinea',
  'Peru',
  'Russia Asia',
  'Pacific Basin',
  'Net Reloads Received',
  'Grand Total',
]);

/** Subtotal columns: the sum of the member columns, printed by the report. */
export const GIIGNL_BASINS = Object.freeze({
  'Atlantic Basin': GIIGNL_COLUMNS.slice(0, 13),
  'Middle East': ['Oman', 'Qatar', 'UAE'],
  'Pacific Basin': GIIGNL_COLUMNS.slice(18, 27),
});

/** Region subtotal rows are printed in capitals. */
const REGION_ROWS = new Set([
  'ASIA',
  'EUROPE',
  'AMERICAS',
  'MIDDLE EAST & AFRICA',
]);

const NUMBER = /-?\d+\.\d/g;

function readArgs(argv) {
  const out = { pdf: null, year: 2025, out: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--year') out.year = Number(argv[(i += 1)]);
    else if (arg === '--out') out.out = argv[(i += 1)];
    else if (!arg.startsWith('--')) out.pdf = arg;
  }
  if (!out.pdf)
    throw new Error(
      'usage: extract-giignl-matrix.mjs <report.pdf> [--year 2025] [--out file.csv]',
    );
  out.out ||= path.join(
    root,
    'src',
    'data',
    'local_data',
    'lng',
    `giignl-${out.year}-matrix.csv`,
  );
  return out;
}

/** The lines of the matrix block: title line through the GRAND TOTAL line. */
export function sliceMatrixBlock(text, year) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) =>
    line.includes(`LNG Quantities (in MT) received in ${year}`),
  );
  if (start < 0)
    throw new Error(
      `GIIGNL: no "LNG Quantities (in MT) received in ${year}" title in the text`,
    );
  const end = lines.findIndex(
    (line, i) => i > start && /^\s*GRAND TOTAL\b/.test(line),
  );
  if (end < 0) throw new Error('GIIGNL: no GRAND TOTAL line after the title');
  return lines.slice(start + 1, end + 1).filter((line) => line.trim() !== '');
}

function tokensOf(line) {
  const tokens = [];
  for (const match of line.matchAll(NUMBER))
    tokens.push({ value: Number(match[0]), start: match.index });
  return tokens;
}

function labelOf(line) {
  const first = line.match(/^\s*([^\d-][^\d]*?)(?=\s{2,}|\s*-?\d|\s*$)/);
  return first ? first[1].trim() : '';
}

/** Cluster token start positions into columns; every column must be hit. */
export function clusterColumns(rows, expected = GIIGNL_COLUMNS.length) {
  const starts = rows
    .flatMap((row) => row.tokens.map((t) => t.start))
    .sort((a, b) => a - b);
  const clusters = [];
  for (const s of starts) {
    const last = clusters[clusters.length - 1];
    if (last && s - last.max <= 2) {
      last.max = s;
      last.members.push(s);
    } else clusters.push({ min: s, max: s, members: [s] });
  }
  if (clusters.length !== expected) {
    throw new Error(
      `GIIGNL: expected ${expected} numeric columns, found ${clusters.length} at ${clusters.map((c) => c.min).join(',')}`,
    );
  }
  return clusters.map((c) => ({
    min: c.min,
    max: c.max,
    centre: (c.min + c.max) / 2,
  }));
}

/** Parse the block into labelled rows of 30 cells (null for blank). */
export function parseMatrixBlock(lines) {
  // Merge wrapped labels: the report prints "Dominican" / "Republic" and
  // "MIDDLE EAST" / "& AFRICA" on two lines with the numbers on the first, so
  // a label-only line continues the row above it. Header lines precede the
  // first numeric row and are skipped.
  const raw = [];
  for (const line of lines) {
    const tokens = tokensOf(line);
    const label = labelOf(line);
    if (tokens.length === 0) {
      if (label && raw.length > 0) raw[raw.length - 1].label += ` ${label}`;
      continue;
    }
    raw.push({ label, tokens });
  }
  const columns = clusterColumns(raw);
  const rows = raw.map((row) => {
    const cells = new Array(columns.length).fill(null);
    for (const token of row.tokens) {
      let best = 0;
      let bestDistance = Infinity;
      columns.forEach((c, i) => {
        const d = Math.abs(token.start - c.centre);
        if (d < bestDistance) {
          bestDistance = d;
          best = i;
        }
      });
      if (cells[best] !== null)
        throw new Error(
          `GIIGNL: two values landed in column ${GIIGNL_COLUMNS[best]} of row ${row.label}`,
        );
      cells[best] = token.value;
    }
    const label = row.label.replace(/^T.rkiye$/u, 'Türkiye');
    return {
      label,
      kind:
        REGION_ROWS.has(label) || label === 'GRAND TOTAL'
          ? 'region'
          : 'country',
      cells,
    };
  });
  return { columns: GIIGNL_COLUMNS, rows };
}

const round1 = (n) => Math.round(n * 10) / 10;

/**
 * Check every printed subtotal against the cells it summarises. Tolerance is
 * one rounding unit per contributing cell: the report prints one decimal.
 */
export function verifyMatrix({ columns, rows }) {
  const col = (name) => columns.indexOf(name);
  const problems = [];
  const sumOf = (cells, names) =>
    names.reduce((s, n) => s + (cells[col(n)] ?? 0), 0);
  const nonBlank = (cells, names) =>
    names.filter((n) => cells[col(n)] !== null).length;
  for (const row of rows) {
    for (const [basin, members] of Object.entries(GIIGNL_BASINS)) {
      const printed = row.cells[col(basin)];
      const sum = sumOf(row.cells, members);
      const tolerance = 0.05 * (nonBlank(row.cells, members) + 1) + 0.05;
      if (printed === null && sum === 0) continue;
      if (Math.abs((printed ?? 0) - sum) > tolerance)
        problems.push(
          `${row.label}: ${basin} printed ${printed} but members sum to ${round1(sum)}`,
        );
    }
    const basins = Object.keys(GIIGNL_BASINS);
    const total =
      sumOf(row.cells, basins) + (row.cells[col('Net Reloads Received')] ?? 0);
    const printed = row.cells[col('Grand Total')];
    if (Math.abs((printed ?? 0) - total) > 0.25)
      problems.push(
        `${row.label}: Grand Total printed ${printed} but basins plus reloads sum to ${round1(total)}`,
      );
  }
  const grand = rows.find((r) => r.label === 'GRAND TOTAL');
  const countries = rows.filter((r) => r.kind === 'country');
  columns.forEach((name, i) => {
    if (name === 'Net Reloads Received') return;
    const sum = countries.reduce((s, r) => s + (r.cells[i] ?? 0), 0);
    const printed = grand.cells[i] ?? 0;
    const tolerance =
      0.05 * (countries.filter((r) => r.cells[i] !== null).length + 1) + 0.05;
    if (Math.abs(printed - sum) > tolerance)
      problems.push(
        `column ${name}: GRAND TOTAL ${printed} but countries sum to ${round1(sum)}`,
      );
  });
  if (problems.length)
    throw new Error(
      `GIIGNL matrix does not reconcile:\n  ${problems.join('\n  ')}`,
    );
  return {
    world: grand.cells[col('Grand Total')],
    countries: countries.length,
  };
}

export function toCsv({ columns, rows }) {
  const header = ['market', 'kind', ...columns].join(',');
  const body = rows.map((row) =>
    [
      row.label.includes(',') ? `"${row.label}"` : row.label,
      row.kind,
      ...row.cells.map((c) => (c === null ? '' : String(c))),
    ].join(','),
  );
  return `${[header, ...body].join('\n')}\n`;
}

export function extractMatrix(pdfPath, { year = 2025 } = {}) {
  const text = execFileSync(
    'pdftotext',
    ['-table', '-enc', 'UTF-8', pdfPath, '-'],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  const block = sliceMatrixBlock(text, year);
  const matrix = parseMatrixBlock(block);
  const summary = verifyMatrix(matrix);
  const sha256 = createHash('sha256')
    .update(readFileSync(pdfPath))
    .digest('hex');
  return { matrix, summary, sha256 };
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const args = readArgs(process.argv.slice(2));
  const { matrix, summary, sha256 } = extractMatrix(args.pdf, {
    year: args.year,
  });
  const csv =
    `# GIIGNL Annual Report ${args.year + 1} edition, "LNG Quantities (in MT) received in ${args.year}"; ` +
    `pdf sha256 ${sha256}; extracted by scripts/extract-giignl-matrix.mjs\n${toCsv(matrix)}`;
  mkdirSync(path.dirname(args.out), { recursive: true });
  writeFileSync(args.out, csv);
  console.log(
    `wrote ${path.relative(root, args.out)}: ${summary.countries} importing markets, world total ${summary.world} MT, pdf sha256 ${sha256.slice(0, 12)}…`,
  );
}
