/** Synthetic Open-Meteo ensemble payloads for the weather tests (no network). */

export const FIXTURE_META = {
  last_run_initialisation_time: Date.UTC(2026, 8, 30, 0) / 1000,
  last_run_availability_time: Date.UTC(2026, 8, 30, 9, 36) / 1000,
  update_interval_seconds: 21600,
};

export const FIXTURE_ENTRIES = [
  {
    id: 'permian',
    kind: 'basin',
    name: 'Permian',
    lat: 32,
    lon: -103,
    points: [
      { name: 'A', lat: 32, lon: -103, w: 0.75 },
      { name: 'B', lat: 32.5, lon: -103.5, w: 0.25 },
    ],
    freezeF: 25,
    share: 0.22,
    commodities: ['natgas', 'oil'],
    country: 'US',
  },
  {
    id: 'texas',
    kind: 'region',
    name: 'Texas',
    lat: 31,
    lon: -96,
    points: [{ name: 'Houston', lat: 29.76, lon: -95.37, w: 1 }],
    commodities: ['natgas'],
    country: 'US',
  },
  {
    id: 'gulf-lng',
    kind: 'gulf',
    name: 'Gulf LNG coast',
    lat: 29.73,
    lon: -93.87,
    points: [{ name: 'Sabine Pass', lat: 29.73, lon: -93.87, w: 1 }],
    commodities: ['natgas', 'oil'],
    country: 'US',
  },
];

function days(n = 15, start = '2026-09-30') {
  const out = [];
  const t0 = Date.parse(`${start}T00:00:00Z`);
  for (let i = 0; i < n; i++)
    out.push(new Date(t0 + i * 86_400_000).toISOString().slice(0, 10));
  return out;
}

/**
 * One point block: member m on day d reads `base + trend*d + (m - 25) * spreadPerMember`
 * for TMIN, TMAX = TMIN + 20, wind = windBase + m/5, precip 0, snow 0.
 */
export function fixtureBlock({
  base = 30,
  trend = -1,
  spreadPerMember = 0.2,
  windBase = 20,
  members = 51,
  n = 15,
} = {}) {
  const time = days(n);
  const daily = { time };
  const col = (v, m) =>
    m === 0 ? v : `${v}_member${String(m).padStart(2, '0')}`;
  for (let m = 0; m < members; m++) {
    daily[col('temperature_2m_min', m)] = time.map(
      (_, d) => base + trend * d + (m - 25) * spreadPerMember * (1 + d / 7),
    );
    daily[col('temperature_2m_max', m)] = time.map(
      (_, d) => base + 20 + trend * d + (m - 25) * spreadPerMember,
    );
    daily[col('precipitation_sum', m)] = time.map(() => 0);
    daily[col('snowfall_sum', m)] = time.map(() => 0);
    daily[col('wind_speed_10m_max', m)] = time.map(() => windBase + m / 5);
  }
  return {
    latitude: 0,
    longitude: 0,
    daily_units: { temperature_2m_min: '°F' },
    daily,
  };
}

/** Payload in request order for FIXTURE_ENTRIES (2 + 1 + 1 points). */
export function fixturePayload() {
  return [
    fixtureBlock({ base: 30, trend: -1 }), // permian A: falls to 16°F by D+14
    fixtureBlock({ base: 34, trend: -1 }),
    fixtureBlock({ base: 60, trend: 0 }), // texas
    fixtureBlock({ base: 70, trend: 0, windBase: 34 }), // gulf: p90 wind > 39 on some days
  ];
}

export function fixtureMarine() {
  return {
    daily: {
      time: days(7),
      wave_height_max: [1.2, 1.4, 2.1, 2.6, 1.9, 1.1, 0.8],
      wind_wave_height_max: [1, 1, 1.5, 2, 1.5, 1, 0.5],
    },
  };
}

export function fixtureNormals(entries = FIXTURE_ENTRIES) {
  const out = { entries: {} };
  for (const e of entries)
    out.entries[e.id] = {
      tmin: new Array(366).fill(e.id === 'permian' ? 40 : 60),
      tmax: new Array(366).fill(80),
    };
  return out;
}

export function fixtureSkill() {
  const leads = [];
  for (let d = 0; d <= 16; d++)
    leads.push({
      lead: d,
      confidence: Number(Math.max(0.3, 1 - d * 0.05).toFixed(3)),
      n: 17,
    });
  return {
    vintage: '2026-09-30',
    gate: 30,
    models: {
      ecmwf_aifs025_ensemble: {
        inits: 17,
        gate: 30,
        provisional: true,
        label: 'provisional (17/30 inits)',
        leads,
      },
    },
  };
}

/** A fetch stub answering the meta, ensemble, marine and bundle URLs. */
export function fixtureFetch({ meta = FIXTURE_META, onRequest } = {}) {
  let currentMeta = { ...meta };
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(String(url));
    onRequest?.(String(url));
    const u = String(url);
    const json = (body) => ({ ok: true, status: 200, json: async () => body });
    if (u.includes('/static/meta.json')) return json(currentMeta);
    if (u.includes('/v1/ensemble')) return json(fixturePayload());
    if (u.includes('/v1/marine')) return json(fixtureMarine());
    if (u.endsWith('gazetteer.json')) return json({ entries: FIXTURE_ENTRIES });
    if (u.endsWith('normals.json')) return json(fixtureNormals());
    if (u.endsWith('skill.json')) return json(fixtureSkill());
    return { ok: false, status: 404, json: async () => ({}) };
  };
  return {
    fetchImpl,
    calls,
    /** Advance the published run by `hours`. */
    newRun(hours = 6) {
      currentMeta = {
        ...currentMeta,
        last_run_initialisation_time:
          currentMeta.last_run_initialisation_time + hours * 3600,
        last_run_availability_time:
          currentMeta.last_run_availability_time + hours * 3600,
      };
    },
  };
}
