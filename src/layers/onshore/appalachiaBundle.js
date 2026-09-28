/**
 * The Appalachia bundle's coordinate-bearing files, in their own module so
 * the hosted build can swap it for a stub (server/hosting/licencePolicy.js):
 * DEP licenses its own well-location layers "not for commercial use or
 * resale", so Pennsylvania's well points stay off the hosted site until DEP
 * confirms in writing (docs/LICENCES.md, plan §16.4). The contributors file
 * (operators, counties, volumes; no coordinates) is not here and ships.
 */
export const APPALACHIA_BUNDLE = Object.freeze({
  index: new URL(
    '../../data/local_data/onshore/appalachia/index.json',
    import.meta.url,
  ).href,
  clusters: new URL(
    '../../data/local_data/onshore/appalachia/clusters.json',
    import.meta.url,
  ).href,
});
