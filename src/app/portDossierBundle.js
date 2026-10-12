/**
 * The bundled port dossiers as the browser sees them: the small index is
 * imported statically, each dossier is a lazy chunk fetched on first click
 * (§9.7, nothing before a click). Loaded by the ports wiring through a
 * dynamic import so Node tests that construct the catalog never touch the
 * JSON graph.
 */
import index from '../data/local_data/port_dossiers/index.json';
import {
  normalizePortDossier,
  normalizePortDossierIndex,
} from '../layers/ports/dossier.js';

const dossiers = import.meta.glob(
  '../data/local_data/port_dossiers/port*.json',
);

export const PORT_DOSSIER_INDEX = normalizePortDossierIndex(index);

/** Resolve one bundled dossier, validated, or null when the port is not in the launch set. */
export async function loadBundledPortDossier(portid) {
  const loader = dossiers[`../data/local_data/port_dossiers/${portid}.json`];
  if (!loader) return null;
  const module = await loader();
  return normalizePortDossier(module.default ?? module, `${portid}.json`);
}
