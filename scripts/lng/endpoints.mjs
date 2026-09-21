/**
 * Arc endpoints (docs/COMMODITIES-PLAN.md §12.6.1 item 5, grill Q4): one arc
 * per pair, ending at the importing country's largest operating regas
 * terminal and starting at the exporting terminal (US pairs) or the exporting
 * country's largest operating export terminal (GIIGNL pairs). The rule that
 * chose each endpoint is recorded on the pair so the card can say so.
 *
 * Fallbacks exist because GEM and the trade files disagree at the margins
 * (a market whose only regas terminal is mothballed, a country GEM files under
 * another). Each fallback is its own named rule, never silent; a country with
 * no GEM terminal at all yields `unrouted` and the volume is kept in the
 * manifest rather than drawn from open water.
 */

export function normalizeCountry(name, crosswalk) {
  const s = String(name ?? '').trim();
  return crosswalk.countryAliases?.[s] ?? s;
}

const byCapacity = (a, b) =>
  b.capacityMtpa - a.capacityMtpa ||
  b.underConstructionMtpa - a.underConstructionMtpa ||
  a.id.localeCompare(b.id);

export function largestTerminal(terminals, { country, kind, status = null }) {
  const candidates = terminals.filter(
    (t) =>
      t.country === country &&
      (kind === null || t.kind === kind) &&
      (status === null || t.status === status),
  );
  return candidates.sort(byCapacity)[0] ?? null;
}

function resolve(countryRaw, terminals, crosswalk, kind, overrides) {
  const country = normalizeCountry(countryRaw, crosswalk);
  const override = overrides?.[countryRaw] ?? overrides?.[country];
  if (override) {
    const terminal = terminals.find((t) => t.id === override.gemId);
    if (!terminal)
      throw new Error(
        `endpoint override for ${countryRaw} points at ${override.gemId}, which is not in the terminal set`,
      );
    return { country, terminalId: terminal.id, rule: 'override' };
  }
  const operating = largestTerminal(terminals, {
    country,
    kind,
    status: 'operating',
  });
  if (operating)
    return {
      country,
      terminalId: operating.id,
      rule: `largest-operating-${kind}`,
    };
  const building = largestTerminal(terminals, {
    country,
    kind,
    status: 'construction',
  });
  if (building)
    return {
      country,
      terminalId: building.id,
      rule: `largest-${kind}-under-construction`,
    };
  const any = largestTerminal(terminals, { country, kind: null });
  if (any) return { country, terminalId: any.id, rule: 'largest-any-terminal' };
  return { country, terminalId: null, rule: 'unrouted' };
}

/** Where an arc into `countryRaw` ends. */
export function resolveImportEndpoint(countryRaw, terminals, crosswalk) {
  return resolve(
    countryRaw,
    terminals,
    crosswalk,
    'import',
    crosswalk.importEndpointOverrides,
  );
}

/** Where a GIIGNL column's arcs start. */
export function resolveExportEndpoint(columnRaw, terminals, crosswalk) {
  return resolve(
    columnRaw,
    terminals,
    crosswalk,
    'export',
    crosswalk.exporterEndpoints,
  );
}
