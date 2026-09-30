/**
 * Row 3 source (docs/COMMODITIES-PLAN.md §11.8.3): the Open-Meteo ensemble
 * read as one snapshot, with the refresh rule that keeps the layer cheap.
 *
 * On every `getSnapshot` the source reads the model's metadata file; it
 * fetches the ensemble (and marine) payloads only when
 * `last_run_availability_time` differs from the cached run's, or when there
 * is no cache. A failed fetch keeps the previous run and records the error
 * per feed — the layer never blanks a marker it was already showing.
 *
 * Portable by rule: no Cesium, no DOM, no browser globals. Bundles
 * (gazetteer, normals, skill) are static assets fetched once and cached.
 */
import {
  blocksByEntry,
  ensembleUrl,
  flattenPoints,
  marineUrl,
  metaUrl,
  normalizeMarine,
  normalizeMeta,
} from './live.js';
import { DEFAULT_MODEL, buildWeatherSnapshot } from './records.js';

/** Static bundles; Vite rewrites each literal URL for production base paths. */
export const WEATHER_GAZETTEER_URL = new URL(
  '../../data/local_data/weather/gazetteer.json',
  import.meta.url,
).href;
export const WEATHER_NORMALS_URL = new URL(
  '../../data/local_data/weather/normals.json',
  import.meta.url,
).href;
export const WEATHER_SKILL_URL = new URL(
  '../../data/local_data/weather/skill.json',
  import.meta.url,
).href;

/** The three static bundles, read once; shared by every weather source. */
export async function loadWeatherBundles({
  fetchImpl = (...args) => globalThis.fetch(...args),
  urls = {},
  signal,
} = {}) {
  const read = async (url, label) => {
    signal?.throwIfAborted();
    const response = await fetchImpl(url, { signal });
    if (!response.ok) throw new Error(`${label} HTTP ${response.status}`);
    return response.json();
  };
  const [gazetteer, normals, skill] = await Promise.all([
    read(urls.gazetteer || WEATHER_GAZETTEER_URL, 'weather gazetteer'),
    read(urls.normals || WEATHER_NORMALS_URL, 'weather normals'),
    read(urls.skill || WEATHER_SKILL_URL, 'weather skill'),
  ]);
  if (!Array.isArray(gazetteer?.entries))
    throw new Error('Malformed weather gazetteer');
  return { entries: gazetteer.entries, normals, skill };
}

export function createOpenMeteoEnsembleSource({
  fetchImpl = (...args) => globalThis.fetch(...args),
  now = () => Date.now(),
  model = DEFAULT_MODEL,
  urls = {},
} = {}) {
  const gazetteerUrl = urls.gazetteer || WEATHER_GAZETTEER_URL;
  const normalsUrl = urls.normals || WEATHER_NORMALS_URL;
  const skillUrl = urls.skill || WEATHER_SKILL_URL;
  let _bundles = null;
  /** The cached run: `{ meta, blocks: Map, marine, snapshot }`. */
  let _run = null;
  const _errors = {};
  let _requests = 0;

  async function readJson(url, signal, label) {
    signal?.throwIfAborted();
    _requests += 1;
    const response = await fetchImpl(url, { signal });
    if (!response.ok) throw new Error(`${label} HTTP ${response.status}`);
    const payload = await response.json();
    signal?.throwIfAborted();
    return payload;
  }

  async function bundles(signal) {
    if (_bundles) return _bundles;
    _bundles = await loadWeatherBundles({ fetchImpl, urls, signal });
    return _bundles;
  }

  async function readMeta(signal) {
    const meta = normalizeMeta(
      await readJson(metaUrl(model), signal, 'ensemble metadata'),
    );
    if (!meta) throw new Error('Malformed ensemble metadata');
    return meta;
  }

  async function readRun(entries, meta, signal) {
    const { points, slices } = flattenPoints(entries);
    const payload = await readJson(
      ensembleUrl(points, { model }),
      signal,
      'ensemble forecast',
    );
    const blocks = blocksByEntry(payload, slices, points.length);
    if (!blocks) throw new Error('Malformed ensemble forecast response');
    let marine = null;
    const gulf = entries.filter((e) => e.kind === 'gulf');
    if (gulf.length) {
      try {
        const gulfPoints = gulf.flatMap((e) => e.points);
        marine = normalizeMarine(
          await readJson(marineUrl(gulfPoints), signal, 'marine forecast'),
        );
        delete _errors.marine;
      } catch (e) {
        if (signal?.aborted) throw e;
        _errors.marine = e?.message || 'marine unavailable';
      }
    }
    return { meta, blocks, marine };
  }

  return {
    label: 'ECMWF AIFS ENS via Open-Meteo',
    model,
    async getSnapshot({ signal } = {}) {
      const { entries, normals, skill } = await bundles(signal);
      let meta;
      try {
        meta = await readMeta(signal);
        delete _errors.meta;
      } catch (e) {
        if (signal?.aborted) throw e;
        _errors.meta = e?.message || 'metadata unavailable';
        if (_run) return _run.snapshot;
        throw e;
      }
      if (_run && _run.meta.availableAt === meta.availableAt)
        return _run.snapshot;
      let run;
      try {
        run = await readRun(entries, meta, signal);
        delete _errors.ensemble;
      } catch (e) {
        if (signal?.aborted) throw e;
        _errors.ensemble = e?.message || 'ensemble unavailable';
        if (_run) return _run.snapshot;
        throw e;
      }
      const snapshot = buildWeatherSnapshot({
        entries,
        blocksByEntry: run.blocks,
        meta,
        model,
        normals,
        skill,
        fetchedAt: now(),
      });
      // marine readings ride on the Gulf rows with the marine model's own stamp
      if (run.marine) {
        let k = 0;
        for (const row of snapshot.rows) {
          if (row.kind !== 'gulf') continue;
          const block = run.marine[k++];
          row.marine = block?.days || [];
        }
      }
      snapshot.errors = { ..._errors };
      _run = { ...run, snapshot };
      return snapshot;
    },
    /** Test hook: request count and per-feed errors. */
    getStats() {
      return {
        requests: _requests,
        errors: { ..._errors },
        run: _run?.meta ?? null,
      };
    },
  };
}
