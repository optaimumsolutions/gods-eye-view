/**
 * The GIIGNL annual import matrix (docs/COMMODITIES-PLAN.md §12.6.1 item 4)
 * from the committed CSV that `scripts/extract-giignl-matrix.mjs` wrote. The
 * printed subtotals are re-verified here, so the build refuses a hand-edited
 * CSV that no longer adds up, and every exporter column and importer row is
 * resolved to a GEM terminal through the endpoint rules.
 */

import {
  GIIGNL_BASINS,
  GIIGNL_COLUMNS,
  verifyMatrix,
} from '../extract-giignl-matrix.mjs';
import { resolveExportEndpoint, resolveImportEndpoint } from './endpoints.mjs';

const NON_EXPORTER_COLUMNS = new Set([
  ...Object.keys(GIIGNL_BASINS),
  'Net Reloads Received',
  'Grand Total',
]);

export function readMatrixCsv(csvText) {
  const lines = csvText.split(/\r?\n/).filter((l) => l !== '');
  const comment = lines[0].startsWith('#') ? lines.shift() : '';
  const pdfSha256 = comment.match(/pdf sha256 ([0-9a-f]{64})/)?.[1] ?? null;
  const header = lines.shift().split(',');
  if (header[0] !== 'market' || header[1] !== 'kind')
    throw new Error('GIIGNL CSV: header must start market,kind');
  const columns = header.slice(2);
  if (
    columns.length !== GIIGNL_COLUMNS.length ||
    columns.some((c, i) => c !== GIIGNL_COLUMNS[i])
  )
    throw new Error(
      `GIIGNL CSV: columns differ from the extractor's list: ${columns.join(' | ')}`,
    );
  const rows = lines.map((line) => {
    const parts = line
      .match(/("[^"]*"|[^,]*)(,|$)/g)
      .map((p) => p.replace(/,$/, '').replace(/^"|"$/g, ''));
    return {
      label: parts[0],
      kind: parts[1],
      cells: parts
        .slice(2, 2 + columns.length)
        .map((c) => (c === '' ? null : Number(c))),
    };
  });
  return { columns, rows, pdfSha256 };
}

/** Country-to-country cells resolved to terminal endpoints. */
export function buildMatrix(csvText, { terminals, crosswalk, year = 2025 }) {
  const { columns, rows, pdfSha256 } = readMatrixCsv(csvText);
  const summary = verifyMatrix({ columns, rows });
  const col = (name) => columns.indexOf(name);
  const grand = rows.find((r) => r.label === 'GRAND TOTAL');

  const exporters = columns
    .filter((c) => !NON_EXPORTER_COLUMNS.has(c))
    .map((column) => ({
      column,
      ...resolveExportEndpoint(column, terminals, crosswalk),
      totalMt: grand.cells[col(column)] ?? 0,
    }));
  const importers = rows
    .filter((r) => r.kind === 'country')
    .map((r) => ({
      market: r.label,
      ...resolveImportEndpoint(r.label, terminals, crosswalk),
      totalMt: r.cells[col('Grand Total')] ?? 0,
      netReloadsMt: r.cells[col('Net Reloads Received')] ?? 0,
    }));
  const problems = [];
  for (const e of exporters)
    if (!e.terminalId)
      problems.push(
        `exporter column ${e.column} (${e.country}) has no GEM export terminal`,
      );
  if (problems.length)
    throw new Error(
      `GIIGNL exporters do not resolve:\n  ${problems.join('\n  ')}`,
    );

  const cells = [];
  for (const r of rows.filter((row) => row.kind === 'country')) {
    for (const e of exporters) {
      const mt = r.cells[col(e.column)];
      if (mt !== null && mt > 0)
        cells.push({ exporter: e.column, importer: r.label, mt });
    }
  }
  cells.sort(
    (a, b) =>
      a.exporter.localeCompare(b.exporter) ||
      a.importer.localeCompare(b.importer),
  );

  return {
    schema: 'lng-matrix/1',
    year,
    unit: 'MT',
    period: `annual ${year}`,
    pdfSha256,
    world: summary.world,
    exporters,
    importers,
    cells,
    counts: {
      exporters: exporters.length,
      importers: importers.length,
      cells: cells.length,
      unroutedImporters: importers.filter((i) => !i.terminalId).length,
      mtRouted:
        Math.round(
          cells
            .filter(
              (c) => importers.find((i) => i.market === c.importer)?.terminalId,
            )
            .reduce((s, c) => s + c.mt, 0) * 10,
        ) / 10,
    },
  };
}
