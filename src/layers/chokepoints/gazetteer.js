/**
 * The 28 maritime chokepoints IMF PortWatch publishes, pinned by longitude
 * and latitude. Geometry is a fixed reference, not a feed: the rings and
 * markers are created once from this table and the daily transit feed is
 * joined onto them by `id`, so a marker can never move, blink or wait on a
 * request. Retrieved from `PortWatch_chokepoints_database` (fields portid,
 * portname, geometry) on 2026-09-17; rounded to four decimals (about 11 m).
 * Re-verify against the service when PortWatch changes its list.
 */
export const CHOKEPOINT_GAZETTEER = Object.freeze(
  [
    { id: 'chokepoint1', name: 'Suez Canal', lon: 32.4369, lat: 30.5933 },
    { id: 'chokepoint2', name: 'Panama Canal', lon: -79.7672, lat: 9.1205 },
    { id: 'chokepoint3', name: 'Bosporus Strait', lon: 29.0915, lat: 41.1693 },
    {
      id: 'chokepoint4',
      name: 'Bab el-Mandeb Strait',
      lon: 43.3495,
      lat: 12.7886,
    },
    { id: 'chokepoint5', name: 'Malacca Strait', lon: 102.6651, lat: 1.517 },
    { id: 'chokepoint6', name: 'Strait of Hormuz', lon: 56.8598, lat: 26.2969 },
    {
      id: 'chokepoint7',
      name: 'Cape of Good Hope',
      lon: 20.8827,
      lat: -34.9273,
    },
    { id: 'chokepoint8', name: 'Gibraltar Strait', lon: -5.7549, lat: 35.9423 },
    { id: 'chokepoint9', name: 'Dover Strait', lon: 1.5058, lat: 51.0302 },
    { id: 'chokepoint10', name: 'Oresund Strait', lon: 12.8508, lat: 55.5078 },
    { id: 'chokepoint11', name: 'Taiwan Strait', lon: 119.8314, lat: 24.7235 },
    { id: 'chokepoint12', name: 'Korea Strait', lon: 129.2092, lat: 34.1308 },
    { id: 'chokepoint13', name: 'Tsugaru Strait', lon: 140.3533, lat: 41.328 },
    { id: 'chokepoint14', name: 'Luzon Strait', lon: 121.3523, lat: 20.4889 },
    { id: 'chokepoint15', name: 'Lombok Strait', lon: 115.8014, lat: -8.4191 },
    { id: 'chokepoint16', name: 'Ombai Strait', lon: 125.091, lat: -8.3985 },
    { id: 'chokepoint17', name: 'Bohai Strait', lon: 120.9, lat: 38.373 },
    { id: 'chokepoint18', name: 'Torres Strait', lon: 142.2475, lat: -9.8625 },
    { id: 'chokepoint19', name: 'Sunda Strait', lon: 105.7752, lat: -5.9668 },
    { id: 'chokepoint20', name: 'Makassar Strait', lon: 119.2571, lat: 0.3523 },
    {
      id: 'chokepoint21',
      name: 'Magellan Strait',
      lon: -69.5948,
      lat: -52.6403,
    },
    {
      id: 'chokepoint22',
      name: 'Yucatan Channel',
      lon: -85.6473,
      lat: 21.8153,
    },
    {
      id: 'chokepoint23',
      name: 'Windward Passage',
      lon: -73.6975,
      lat: 19.9862,
    },
    { id: 'chokepoint24', name: 'Mona Passage', lon: -67.7114, lat: 18.4487 },
    { id: 'chokepoint25', name: 'Balabac Strait', lon: 117.1146, lat: 7.4136 },
    { id: 'chokepoint26', name: 'Bering Strait', lon: -165.5498, lat: 65.9665 },
    { id: 'chokepoint27', name: 'Mindoro Strait', lon: 120.4034, lat: 12.4683 },
    { id: 'chokepoint28', name: 'Kerch Strait', lon: 36.5439, lat: 45.2668 },
  ].map((row) => Object.freeze(row)),
);
