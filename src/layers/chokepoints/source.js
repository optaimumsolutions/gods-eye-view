import {
  buildChokepointSnapshot,
  normalizeChokepointDailyRows,
  normalizeChokepointPoints,
} from './records.js';

/**
 * IMF PortWatch ArcGIS feature services. Keyless, CORS-enabled, so the
 * browser reads them directly like the USGS earthquake feed; no server proxy
 * or credential is involved. Terms: https://www.imf.org/external/terms.htm
 */
export const PORTWATCH_SERVICES_URL =
  'https://services9.arcgis.com/weJ1QsnbMYJlCHdG/arcgis/rest/services';
const POINTS_URL = `${PORTWATCH_SERVICES_URL}/PortWatch_chokepoints_database/FeatureServer/0/query`;
const DAILY_URL = `${PORTWATCH_SERVICES_URL}/Daily_Chokepoints_Data/FeatureServer/0/query`;
/** ArcGIS Online caps one query page at 2,000 features. */
const DEFAULT_PAGE_SIZE = 2000;
const MAX_PAGES = 12;
/**
 * Wider than the 90-day baseline so the publication lag and republished days
 * cannot starve the window; the record math anchors on the newest published day.
 */
const FETCH_WINDOW_DAYS = 120;

/** Read PortWatch chokepoint geometry plus daily tanker transits as one snapshot. */
export function createPortWatchChokepointSource({
  fetchImpl = (...args) => globalThis.fetch(...args),
  now = () => Date.now(),
  pageSize = DEFAULT_PAGE_SIZE,
} = {}) {
  async function readJson(url, signal, label) {
    signal?.throwIfAborted();
    const response = await fetchImpl(url, { signal });
    if (!response.ok) throw new Error(`${label} HTTP ${response.status}`);
    const payload = await response.json();
    signal?.throwIfAborted();
    // ArcGIS reports query failures as HTTP 200 with an error object.
    if (payload?.error)
      throw new Error(`${label} error ${payload.error.code ?? ''}`.trim());
    return payload;
  }

  async function readDailyRows(signal) {
    const since = new Date(now() - FETCH_WINDOW_DAYS * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const rows = [];
    // Follow the server transfer-limit flag: ArcGIS may cap a page below the
    // requested size, so the next offset is the number of rows received.
    let offset = 0;
    for (let page = 0; page < MAX_PAGES; page++) {
      const params = new URLSearchParams({
        where: `date >= DATE '${since}'`,
        outFields: 'portid,date,n_tanker,capacity_tanker,n_total',
        orderByFields: 'date,portid',
        returnGeometry: 'false',
        resultOffset: String(offset),
        resultRecordCount: String(pageSize),
        f: 'json',
      });
      const payload = await readJson(
        `${DAILY_URL}?${params}`,
        signal,
        'PortWatch daily transits',
      );
      const normalized = normalizeChokepointDailyRows(payload);
      if (!normalized)
        throw new Error('Malformed PortWatch daily transit response');
      rows.push(...normalized);
      offset += normalized.length;
      if (!payload.exceededTransferLimit || normalized.length === 0) break;
    }
    return rows;
  }

  return {
    label: 'IMF PortWatch',
    async getSnapshot({ signal } = {}) {
      const pointParams = new URLSearchParams({
        where: '1=1',
        outFields: 'portid,portname',
        returnGeometry: 'true',
        f: 'geojson',
      });
      const [pointPayload, dailyRows] = await Promise.all([
        readJson(
          `${POINTS_URL}?${pointParams}`,
          signal,
          'PortWatch chokepoints',
        ),
        readDailyRows(signal),
      ]);
      const points = normalizeChokepointPoints(pointPayload);
      if (!points) throw new Error('Malformed PortWatch chokepoint response');
      return buildChokepointSnapshot(points, dailyRows);
    },
  };
}
