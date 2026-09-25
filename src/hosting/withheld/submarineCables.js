// The hosted build's stand-in for layers/submarineCables/bundledSource.js
// (server/hosting/licencePolicy.js). TeleGeography's data is CC BY-NC-SA 3.0:
// not for a company's product, so the hosted bundle never carries it.

export const WITHHELD_CABLES_MESSAGE =
  'Withheld on the hosted site: TeleGeography data is CC BY-NC-SA 3.0 (non-commercial); see docs/LICENCES.md';

/** Same shape as createBundledCableSource(); every read fails with the reason. */
export function createBundledCableSource() {
  return {
    label: 'TeleGeography',
    async fetch(signal) {
      signal?.throwIfAborted();
      throw new Error(WITHHELD_CABLES_MESSAGE);
    },
  };
}
