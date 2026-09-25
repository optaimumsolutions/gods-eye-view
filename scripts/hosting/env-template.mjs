import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * Generate deploy/globe.env.example: every environment variable the server and
 * build code read, grouped for the production env file (plan §15.13 V2).
 *   node scripts/hosting/env-template.mjs          # write
 *   node scripts/hosting/env-template.mjs --check  # exit 1 on drift
 */

export const TEMPLATE_PATH = 'deploy/globe.env.example';
const SCAN_ROOTS = ['server', 'build'];
const SCAN_FILES = ['scripts/google-server-key.mjs'];
const PATTERNS = [
  /\b(?:process\.env|env)\.([A-Z][A-Z0-9_]*)\b/g,
  /\benv\[['"]([A-Z][A-Z0-9_]*)['"]\]/g,
  /\bvalue\(['"]([A-Z][A-Z0-9_]*)['"]\)/g,
];

/** Curated production entries; every other name lands in the optional tuning block. */
export const GROUPS = [
  {
    title: 'Hosting (row 13). Required in production.',
    entries: [
      [
        'GEV_REQUIRE_ACCESS',
        '1',
        'Fail closed: every request is refused unless Access is fully configured.',
      ],
      [
        'GEV_ACCESS_TEAM',
        '',
        'Cloudflare Zero Trust team name or <team>.cloudflareaccess.com.',
      ],
      [
        'GEV_ACCESS_AUD',
        '',
        'Audience (AUD) tag of the "Commodities" Access application.',
      ],
      [
        'GEV_ALLOWED_HOSTS',
        'commodities.optaimum.com',
        'Hostnames the server answers for, comma-separated.',
      ],
      [
        'GEV_NAV_STRIP',
        '1',
        'Adds the product strip to the globe page at build time.',
      ],
      [
        'GEV_PROXY_KEY',
        '',
        'Random secret shared with the console; `openssl rand -hex 32`.',
      ],
      [
        'GEV_CONSOLE_URL',
        'http://127.0.0.1:8011',
        'The Oil Oracle console the globe proxies.',
      ],
      ['GEV_CONSOLE_PROXY', '', 'Set to 0 to switch the console proxy off.'],
      [
        'GEV_LICENCE_PROFILE',
        'hosted',
        'Switches off the sources docs/LICENCES.md marks OFF, at build and run time. The deploy refuses to build without it.',
      ],
      [
        'GEV_LICENCE_ON_FILE',
        '',
        'Comma-separated licencePolicy.js ids whose licence or permission is on file (recorded in docs/LICENCES.md).',
      ],
    ],
  },
  {
    title:
      'Keys. Browser-baked keys reach every signed-in browser: lock them down.',
    entries: [
      [
        'GOOGLE_MAPS_API_KEY',
        '',
        'BROWSER-BAKED at build. HTTP-referrer-lock to https://commodities.optaimum.com/*; Map Tiles + Geocoding only.',
      ],
      [
        'GOOGLE_MAPS_SERVER_API_KEY',
        '',
        'Server-only Google key. Lock to the VPS IP; Places + Street View Static.',
      ],
      [
        'CESIUM_ION_TOKEN',
        '',
        'BROWSER-BAKED at build. Scope to this site; set a usage alert.',
      ],
      [
        'OPENAI_API_KEY',
        '',
        'Voice and HUD summaries. Set a monthly budget cap.',
      ],
      ['AISSTREAM_API_KEY', '', 'Live vessels (row 2).'],
      ['FIRMS_MAP_KEY', '', 'NASA FIRMS fires.'],
      ['TOMTOM_API_KEY', '', 'Traffic tiles.'],
      ['TFL_APP_KEY', '', 'Transport for London cameras.'],
      ['LL2_API_TOKEN', '', 'Launch Library 2.'],
      ['OPENSKY_AUTH_MODE', '', 'anon | oauth | basic.'],
      ['OPENSKY_CLIENT_ID', '', ''],
      ['OPENSKY_CLIENT_SECRET', '', ''],
      ['OPENSKY_USERNAME', '', ''],
      ['OPENSKY_PASSWORD', '', ''],
    ],
  },
  {
    title: 'Cost caps for signed-in users (invitees have founder parity, H5).',
    entries: [
      [
        'GEV_RATELIMIT_OPENAI_PER_MIN',
        '',
        'Requests per minute to OpenAI through the server.',
      ],
      [
        'GEV_RATELIMIT_GOOGLE_PER_MIN',
        '',
        'Requests per minute to Google through the server.',
      ],
      ['TOMTOM_DAILY_TILE_BUDGET', '', 'TomTom tiles per day.'],
    ],
  },
  {
    title: 'Event hub (milestone 4). Setting the port switches the hub on.',
    entries: [
      [
        'GEV_EVENTS_PUBLISH_PORT',
        '8021',
        'Localhost-only publish listener; never tunnelled.',
      ],
      [
        'GEV_ASKD_URL',
        'http://127.0.0.1:8014',
        'askd: probed by the hub, and its /relay/slack pages health transitions.',
      ],
    ],
  },
];

/** Development-only names: listed so the coverage check passes, never set in production. */
export const DEVELOPMENT_ONLY = new Set([
  'HOST',
  'PORT',
  'GEV_LAUNCHER',
  'GEV_KEY_SETUP_EXTERNAL_KEYS',
  // Computed from GEV_LICENCE_PROFILE at start-up (server/hosting/licences.js).
  'GEV_WITHHELD',
]);

function* files(root, directory) {
  for (const entry of readdirSync(path.join(root, directory), {
    withFileTypes: true,
  })) {
    const relative = `${directory}/${entry.name}`;
    if (entry.isDirectory()) yield* files(root, relative);
    else if (
      /\.(?:js|mjs)$/.test(entry.name) &&
      !/\.test\.mjs$/.test(entry.name)
    )
      yield relative;
  }
}

/** Every environment variable name the server and build code read. */
export function scanEnvNames(root) {
  const names = new Set();
  const sources = [
    ...SCAN_ROOTS.flatMap((dir) => [...files(root, dir)]),
    ...SCAN_FILES,
  ];
  for (const file of sources) {
    const text = readFileSync(path.join(root, file), 'utf8');
    for (const pattern of PATTERNS)
      for (const match of text.matchAll(pattern)) names.add(match[1]);
  }
  return [...names].sort();
}

/** The template text for a set of scanned names. */
export function renderTemplate(scanned) {
  const curated = new Set(
    GROUPS.flatMap((group) => group.entries.map(([name]) => name)),
  );
  const lines = [
    "# God's Eye View — production environment (row 13, plan §15).",
    '# GENERATED by `node scripts/hosting/env-template.mjs`; edit that script, not this file.',
    '# Install as /etc/gods-eye-view/globe.env, owner root:globe, mode 0640.',
    '# Never commit real values. Keys are entered on the VPS over ssh, never in chat.',
  ];
  for (const group of GROUPS) {
    lines.push('', `# ── ${group.title}`);
    for (const [name, value, note] of group.entries) {
      if (note) lines.push(`# ${note}`);
      lines.push(`${name}=${value}`);
    }
  }
  const tuning = scanned.filter(
    (name) => !curated.has(name) && !DEVELOPMENT_ONLY.has(name),
  );
  lines.push(
    '',
    '# ── Optional tuning. Defaults are fine; uncomment to override.',
  );
  for (const name of tuning) lines.push(`# ${name}=`);
  const devOnly = scanned.filter((name) => DEVELOPMENT_ONLY.has(name));
  lines.push(
    '',
    '# ── Development only. Leave unset (the service passes --host/--port).',
  );
  for (const name of devOnly) lines.push(`# ${name}=`);
  return `${lines.join('\n')}\n`;
}

const invoked = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : '';
if (import.meta.url === invoked) {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const text = renderTemplate(scanEnvNames(root));
  const target = path.join(root, TEMPLATE_PATH);
  if (process.argv.includes('--check')) {
    let current = '';
    try {
      current = readFileSync(target, 'utf8');
    } catch {}
    if (current !== text) {
      console.error(
        `${TEMPLATE_PATH} is out of date: run node scripts/hosting/env-template.mjs`,
      );
      process.exit(1);
    }
    console.log(`${TEMPLATE_PATH} is current.`);
  } else {
    writeFileSync(target, text);
    console.log(`Wrote ${TEMPLATE_PATH}.`);
  }
}
