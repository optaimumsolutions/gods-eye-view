/** Where the shared strip module is served from (the globe's public directory). */
export const STRIP_MODULE_PATH = '/gev-shell/strip.mjs';

/** Whether the hosted product strip is on: `GEV_NAV_STRIP=1`. Off by default. */
export function navStripEnabled(env = process.env) {
  return env.GEV_NAV_STRIP === '1';
}

/**
 * Vite plugin: add the strip to the globe page when enabled. Off by default,
 * so local development and the headless QA scripts (which pick at canvas
 * coordinates) see the upstream layout unchanged. The tag goes in after
 * Vite's own HTML processing, so the public module is served as is.
 */
export function navStripPlugin({ env = process.env } = {}) {
  const enabled = navStripEnabled(env);
  return {
    name: 'gev-nav-strip',
    transformIndexHtml: {
      order: 'post',
      handler() {
        if (!enabled) return [];
        return [
          {
            tag: 'script',
            attrs: { type: 'module', src: STRIP_MODULE_PATH },
            injectTo: 'head',
          },
        ];
      },
    },
  };
}
