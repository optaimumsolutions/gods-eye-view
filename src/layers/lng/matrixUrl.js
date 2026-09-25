/**
 * The GIIGNL import matrix, in its own module so the hosted build can swap
 * it for a stub (server/hosting/licencePolicy.js): GIIGNL asks for consent
 * before its report figures are used commercially (docs/LICENCES.md).
 */
export const LNG_MATRIX_URL = new URL(
  '../../data/local_data/lng/matrix.json',
  import.meta.url,
).href;
