import { accessGuardPlugin } from './accessGuard.js';
import { consoleProxyPlugin } from './consoleProxy.js';
import { licencePlugin } from './licences.js';
import { navStripPlugin } from './navStrip.js';

/**
 * The hosted-site plugins (plan §15, row 13), in the order they must run:
 * the Access guard first, then the licence switch (M2), then the console
 * proxy, then the strip injection. With no hosting variables set they change
 * nothing but the console proxy.
 */
export function hostingPlugins({ env = process.env, fetchImpl } = {}) {
  return [
    accessGuardPlugin({ env, fetchImpl }),
    licencePlugin({ env }),
    consoleProxyPlugin({ env }),
    navStripPlugin({ env }),
  ];
}

/** Extra hostnames the server answers for: `GEV_ALLOWED_HOSTS=a.example,b.example`. */
export function allowedHostsFromEnv(env = process.env) {
  return String(env.GEV_ALLOWED_HOSTS ?? '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}
