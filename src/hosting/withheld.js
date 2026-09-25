/**
 * Sources the hosted build withholds (plan §15.7 R13.12; docs/LICENCES.md).
 * In the browser the list is `import.meta.env.GEV_WITHHELD`, defined at build
 * time by server/hosting/licences.js (empty in development). On the server
 * the same ids are in `process.env.GEV_WITHHELD`, set by applyLicenceEnv()
 * when the config loads; it is read at call time, because provider modules
 * are imported before the config runs. Portable: no Cesium, no DOM.
 */
const BUILD_LIST = Array.isArray(import.meta.env?.GEV_WITHHELD)
  ? Object.freeze([...import.meta.env.GEV_WITHHELD])
  : null;

/** The withheld ids in force here. */
export function withheldIds() {
  if (BUILD_LIST) return BUILD_LIST;
  const raw = globalThis.process?.env?.GEV_WITHHELD;
  return raw
    ? String(raw)
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)
    : [];
}

/** Whether the hosted build switched this source off. */
export function isWithheld(id, ids = withheldIds()) {
  return (ids instanceof Set ? ids : new Set(ids)).has(id);
}

/**
 * A layer source that never fetches and reports why: the layer shows the
 * message as its error, the way it shows an upstream outage.
 */
export function createWithheldSource(label, message) {
  return Object.freeze({
    label,
    withheld: true,
    async getSnapshot({ signal } = {}) {
      signal?.throwIfAborted?.();
      throw new Error(message);
    },
  });
}
