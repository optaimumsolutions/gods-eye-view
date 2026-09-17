import {
  DISRUPTION_RECENT_DAYS,
  PORT_BASELINE_DAYS,
  PORT_RECENT_DAYS,
  buildPortSnapshot,
  latestPublishedDate,
  normalizeDisruptionFeatures,
  normalizePortRows,
  normalizePortStatRows,
  shiftIsoDate,
} from './records.js';

/**
 * IMF PortWatch ArcGIS feature services, read browser-direct like the
 * chokepoints layer: keyless and CORS-enabled, so no server proxy or
 * credential is involved. Terms: https://www.imf.org/external/terms.htm
 */
export const PORTWATCH_SERVICES_URL =
  'https://services9.arcgis.com/weJ1QsnbMYJlCHdG/arcgis/rest/services';
const PORTS_URL = `${PORTWATCH_SERVICES_URL}/PortWatch_ports_database/FeatureServer/0/query`;
const DAILY_URL = `${PORTWATCH_SERVICES_URL}/Daily_Ports_Data/FeatureServer/0/query`;
const DISRUPTIONS_URL = `${PORTWATCH_SERVICES_URL}/portwatch_disruptions_database/FeatureServer/0/query`;
/**
 * ArcGIS Online serves 1,000 rows per page here; this factor lifts one page
 * to 3,000 so the 2,065-port registry and the grouped statistics each fit in
 * one response. If the server ignores it, the transfer-limit flag still pages.
 */
const MAX_RECORD_COUNT_FACTOR = 3;
const DEFAULT_PAGE_SIZE = 3000;
const MAX_PAGES = 12;
const PORT_FIELDS = [
  'portid',
  'portname',
  'country',
  'ISO3',
  'lat',
  'lon',
  'LOCODE',
  'industry_top1',
  'vessel_count_total',
  'vessel_count_tanker',
  'vessel_count_container',
  'share_country_maritime_import',
  'share_country_maritime_export',
].join(',');
const DISRUPTION_FIELDS = [
  'eventid',
  'eventtype',
  'eventname',
  'alertlevel',
  'severitytext',
  'fromdate',
  'todate',
  'lat',
  'long',
  'n_affectedports',
  'affectedports',
  'country',
].join(',');
const WINDOW_STATISTICS = JSON.stringify([
  {
    statisticType: 'avg',
    onStatisticField: 'portcalls_tanker',
    outStatisticFieldName: 'avg_tanker',
  },
  {
    statisticType: 'avg',
    onStatisticField: 'portcalls_container',
    outStatisticFieldName: 'avg_container',
  },
  {
    statisticType: 'count',
    onStatisticField: 'portcalls_tanker',
    outStatisticFieldName: 'days',
  },
]);
const LATEST_STATISTICS = JSON.stringify([
  {
    statisticType: 'max',
    onStatisticField: 'date',
    outStatisticFieldName: 'latest',
  },
]);

/** Read the PortWatch port registry, windowed port-call means, and recent disruptions as one snapshot. */
export function createPortWatchPortSource({
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

  /**
   * Follow the server transfer-limit flag: ArcGIS may cap a page below the
   * requested size, so the next offset is the number of rows received.
   */
  async function readPages(url, params, normalize, label, signal) {
    const rows = [];
    let offset = 0;
    for (let page = 0; page < MAX_PAGES; page++) {
      const query = new URLSearchParams({
        ...params,
        resultOffset: String(offset),
        resultRecordCount: String(pageSize),
        maxRecordCountFactor: String(MAX_RECORD_COUNT_FACTOR),
        f: 'json',
      });
      const payload = await readJson(`${url}?${query}`, signal, label);
      const normalized = normalize(payload);
      if (!normalized) throw new Error(`Malformed ${label} response`);
      rows.push(...normalized);
      offset += normalized.length;
      if (!payload.exceededTransferLimit || normalized.length === 0) break;
    }
    return rows;
  }

  function readPorts(signal) {
    return readPages(
      PORTS_URL,
      {
        where: '1=1',
        outFields: PORT_FIELDS,
        returnGeometry: 'false',
        orderByFields: 'portid',
      },
      normalizePortRows,
      'PortWatch ports',
      signal,
    );
  }

  async function readLatestDate(signal) {
    const query = new URLSearchParams({
      where: '1=1',
      outStatistics: LATEST_STATISTICS,
      f: 'json',
    });
    const payload = await readJson(
      `${DAILY_URL}?${query}`,
      signal,
      'PortWatch latest day',
    );
    const latest = latestPublishedDate(payload);
    if (!latest) throw new Error('Malformed PortWatch latest day response');
    return latest;
  }

  function readWindowStats(since, signal) {
    return readPages(
      DAILY_URL,
      {
        where: `date >= DATE '${since}'`,
        groupByFieldsForStatistics: 'portid',
        outStatistics: WINDOW_STATISTICS,
        orderByFields: 'portid',
      },
      normalizePortStatRows,
      'PortWatch port calls',
      signal,
    );
  }

  async function readDisruptions(signal) {
    const since = new Date(now() - DISRUPTION_RECENT_DAYS * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const query = new URLSearchParams({
      where: `todate IS NULL OR todate >= DATE '${since}'`,
      outFields: DISRUPTION_FIELDS,
      returnGeometry: 'true',
      geometryPrecision: '3',
      f: 'geojson',
    });
    const payload = await readJson(
      `${DISRUPTIONS_URL}?${query}`,
      signal,
      'PortWatch disruptions',
    );
    const rows = normalizeDisruptionFeatures(payload);
    if (!rows) throw new Error('Malformed PortWatch disruptions response');
    return rows;
  }

  return {
    label: 'IMF PortWatch',
    async getSnapshot({ signal } = {}) {
      const [ports, latestDate, disruptions] = await Promise.all([
        readPorts(signal),
        readLatestDate(signal),
        readDisruptions(signal),
      ]);
      // Both windows end on the newest published day, so the 7-day window is
      // the last seven published days regardless of the publication lag.
      const [recentStats, baselineStats] = await Promise.all([
        readWindowStats(
          shiftIsoDate(latestDate, -(PORT_RECENT_DAYS - 1)),
          signal,
        ),
        readWindowStats(
          shiftIsoDate(latestDate, -(PORT_BASELINE_DAYS - 1)),
          signal,
        ),
      ]);
      return buildPortSnapshot({
        ports,
        recentStats,
        baselineStats,
        latestDate,
        disruptions,
      });
    },
  };
}
