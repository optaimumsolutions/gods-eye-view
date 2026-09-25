import { rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HOSTED_WITHHELD } from './licencePolicy.js';

/**
 * The licence switch for the hosted site (plan §15.7 R13.12, row 13 M2).
 * `docs/LICENCES.md` records, per source, whether viewers other than the
 * founder may see it and cites the terms; `licencePolicy.js` lists the rows
 * that must be off. They are off only when `GEV_LICENCE_PROFILE=hosted`
 * (set in globe.env, which the deploy reads both for the build and for the
 * service), so local development keeps every source.
 *
 * Each withheld source is switched off by the means that actually stops it:
 * - `env`: provider kill switches ('0') or keys ('') forced into process.env
 *   by `applyLicenceEnv()` when the server config loads, so both the build
 *   (browser-baked keys) and the providers (run time) see them;
 * - `modules`: a module swapped for a stub at build time, so the restricted
 *   data never enters the bundle;
 * - `publicPaths`: files under `public/` pruned from the build output and
 *   refused (451) if requested anyway; `routes`: paths refused (451), e.g. a
 *   console route that would hand over the same data;
 * - `code`: a call to `isWithheld(<id>)` (src/hosting/withheld.js), which
 *   reads the ids this module publishes as `import.meta.env.GEV_WITHHELD`
 *   (browser) and `process.env.GEV_WITHHELD` (server).
 * A row with `unlessEnv` applies only while that variable is empty (a
 * condition such as a registered key), and `GEV_LICENCE_ON_FILE` lists rows
 * whose licence or permission is on file.
 */

export const HOSTED_PROFILE = 'hosted';
const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));

/** `hosted` when `GEV_LICENCE_PROFILE=hosted`, else `full` (development). */
export function licenceProfile(env = process.env) {
  return String(env.GEV_LICENCE_PROFILE ?? '').trim() === HOSTED_PROFILE
    ? HOSTED_PROFILE
    : 'full';
}

/**
 * Ids whose licence or written permission is on file:
 * `GEV_LICENCE_ON_FILE=opensky,portwatch`. Each such row stays on even under
 * the hosted profile; add an id only with the document in hand (the row's
 * `permit` says which) and record it in docs/LICENCES.md.
 */
export function licencesOnFile(env = process.env) {
  return new Set(
    String(env.GEV_LICENCE_ON_FILE ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  );
}

const present = (env, name) => String(env[name] ?? '').trim() !== '';

/** The policy rows in force for this environment: none unless hosted. */
export function withheldSources(env = process.env, policy = HOSTED_WITHHELD) {
  if (licenceProfile(env) !== HOSTED_PROFILE) return [];
  const onFile = licencesOnFile(env);
  return policy.filter(
    (row) =>
      !onFile.has(row.id) && !(row.unlessEnv && present(env, row.unlessEnv)),
  );
}

/** Ids of the rows in force. */
export function withheldIds(env = process.env, policy) {
  return withheldSources(env, policy).map((row) => row.id);
}

/** Provider switches and keys the hosted profile forces, merged across rows. */
export function licenceEnvOverrides(env = process.env, policy) {
  const overrides = {};
  for (const row of withheldSources(env, policy))
    Object.assign(overrides, row.env ?? {});
  return overrides;
}

/**
 * Force the hosted profile into `target` (process.env) before the build reads
 * its browser keys and before any provider reads a switch. Called once from
 * the server config; returns what it set. Development is left untouched.
 */
export function applyLicenceEnv(
  env = process.env,
  { target = env, policy } = {},
) {
  if (licenceProfile(env) !== HOSTED_PROFILE) return {};
  const overrides = {
    ...licenceEnvOverrides(env, policy),
    GEV_WITHHELD: withheldIds(env, policy).join(','),
  };
  Object.assign(target, overrides);
  return overrides;
}

const toPosix = (value) => value.split(path.sep).join('/');

/** Absolute, case-folded (Windows) keys so a resolved id matches the policy. */
function moduleKey(file) {
  const absolute = toPosix(path.resolve(file));
  return process.platform === 'win32' ? absolute.toLowerCase() : absolute;
}

/** Map of restricted module (absolute) -> stub module (absolute). */
export function withheldModuleMap(env, { root = REPO_ROOT, policy } = {}) {
  const map = new Map();
  for (const row of withheldSources(env, policy)) {
    for (const [from, to] of Object.entries(row.modules ?? {}))
      map.set(moduleKey(path.join(root, from)), path.join(root, to));
  }
  return map;
}

const prefix = (entry) => `/${String(entry).replace(/^\/+|\/+$/g, '')}/`;

/** URL prefixes (with a trailing slash) for the withheld files under public/. */
export function withheldPublicPaths(env, policy) {
  return withheldSources(env, policy).flatMap((row) =>
    (row.publicPaths ?? []).map(prefix),
  );
}

/** Every refused URL prefix: the public paths plus the withheld routes. */
export function refusedPrefixes(env, policy) {
  return [
    ...withheldPublicPaths(env, policy),
    ...withheldSources(env, policy).flatMap((row) =>
      (row.routes ?? []).map(prefix),
    ),
  ];
}

function refuse(res, pathname) {
  res.writeHead(451, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(
    `Unavailable on the hosted site: ${pathname} is withheld under its licence (docs/LICENCES.md).\n`,
  );
}

/**
 * Vite plugin enforcing the hosted profile. With `GEV_LICENCE_PROFILE` unset
 * it only defines an empty `import.meta.env.GEV_WITHHELD`.
 */
export function licencePlugin({
  env = process.env,
  root = REPO_ROOT,
  policy,
} = {}) {
  const modules = withheldModuleMap(env, { root, policy });
  const pruned = withheldPublicPaths(env, policy);
  const refused = refusedPrefixes(env, policy);
  let outDir = null;

  const install = (server) => {
    if (!refused.length) return;
    server.middlewares.use((req, res, next) => {
      let pathname;
      try {
        pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      } catch {
        pathname = String(req.url);
      }
      const probe = `${pathname.replace(/\/+$/, '')}/`;
      if (refused.some((entry) => probe.startsWith(entry)))
        refuse(res, pathname);
      else next();
    });
  };

  return {
    name: 'gev-licences',
    enforce: 'pre',
    config() {
      return {
        define: {
          'import.meta.env.GEV_WITHHELD': JSON.stringify(
            withheldIds(env, policy),
          ),
        },
      };
    },
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    async resolveId(source, importer, options) {
      if (!modules.size || !importer) return null;
      const resolved = await this.resolve(source, importer, {
        ...options,
        skipSelf: true,
      });
      if (!resolved || resolved.external) return null;
      return modules.get(moduleKey(resolved.id.split('?')[0])) ?? null;
    },
    async writeBundle() {
      if (!outDir) return;
      for (const entry of pruned)
        await rm(path.join(outDir, entry), { recursive: true, force: true });
    },
    configureServer: { order: 'pre', handler: install },
    configurePreviewServer: { order: 'pre', handler: install },
  };
}
