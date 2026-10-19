/**
 * The assets the news layer pins headlines to (docs/COMMODITIES-PLAN.md §4
 * row 5). Milestone 1: ten market-salient maritime chokepoints and the twenty
 * dossier ports (§9.6.1). Positions are public geographic facts, hand-placed
 * from public charts and rounded to two decimals (about 1 km) — deliberately
 * NOT read from the IMF PortWatch databases, so the layer carries no
 * PortWatch data and stays on in the hosted build (docs/LICENCES.md: GDELT is
 * the only upstream). Port ids are the dossier slugs so the server can join
 * each port's committed alias list (config/port_dossiers.seed.json); strait
 * keywords live here because no seed carries them.
 */
export const NEWS_GAZETTEER = Object.freeze(
  [
    // Straits and canals (group 'strait'): name + the phrases wire copy uses.
    {
      id: 'strait-hormuz',
      name: 'Strait of Hormuz',
      group: 'strait',
      lon: 56.5,
      lat: 26.6,
      keywords: ['Strait of Hormuz', 'Hormuz'],
    },
    {
      id: 'suez-canal',
      name: 'Suez Canal',
      group: 'strait',
      lon: 32.35,
      lat: 30.46,
      keywords: ['Suez Canal'],
    },
    {
      id: 'bab-el-mandeb',
      name: 'Bab el-Mandeb Strait',
      group: 'strait',
      lon: 43.35,
      lat: 12.79,
      keywords: ['Bab el-Mandeb', 'Bab al-Mandab'],
    },
    {
      id: 'panama-canal',
      name: 'Panama Canal',
      group: 'strait',
      lon: -79.77,
      lat: 9.12,
      keywords: ['Panama Canal'],
    },
    {
      id: 'malacca-strait',
      name: 'Malacca Strait',
      group: 'strait',
      lon: 102.67,
      lat: 1.52,
      keywords: ['Strait of Malacca', 'Malacca Strait'],
    },
    {
      id: 'bosporus',
      name: 'Bosporus Strait',
      group: 'strait',
      lon: 29.09,
      lat: 41.17,
      keywords: ['Bosphorus', 'Bosporus', 'Turkish Straits'],
    },
    {
      id: 'gibraltar',
      name: 'Gibraltar Strait',
      group: 'strait',
      lon: -5.75,
      lat: 35.94,
      keywords: ['Strait of Gibraltar'],
    },
    {
      id: 'taiwan-strait',
      name: 'Taiwan Strait',
      group: 'strait',
      lon: 119.83,
      lat: 24.72,
      keywords: ['Taiwan Strait'],
    },
    {
      id: 'kerch-strait',
      name: 'Kerch Strait',
      group: 'strait',
      lon: 36.54,
      lat: 45.27,
      keywords: ['Kerch Strait', 'Kerch bridge'],
    },
    {
      id: 'cape-good-hope',
      name: 'Cape of Good Hope',
      group: 'strait',
      lon: 20.88,
      lat: -34.93,
      keywords: ['Cape of Good Hope'],
    },
    // The twenty dossier ports (group 'port'): ids are the §9.6.1 slugs; the
    // server joins aliases from the committed seed, the name is the fallback.
    {
      id: 'ras-tanura',
      name: 'Ras Tanura',
      group: 'port',
      lon: 50.16,
      lat: 26.64,
    },
    { id: 'yanbu', name: 'Yanbu', group: 'port', lon: 38.03, lat: 24.08 },
    { id: 'fujairah', name: 'Fujairah', group: 'port', lon: 56.37, lat: 25.17 },
    {
      id: 'ras-laffan',
      name: 'Ras Laffan',
      group: 'port',
      lon: 51.57,
      lat: 25.91,
    },
    {
      id: 'kharg-island',
      name: 'Kharg Island',
      group: 'port',
      lon: 50.32,
      lat: 29.23,
    },
    { id: 'houston', name: 'Houston', group: 'port', lon: -95.02, lat: 29.72 },
    {
      id: 'corpus-christi',
      name: 'Corpus Christi',
      group: 'port',
      lon: -97.35,
      lat: 27.82,
    },
    {
      id: 'sabine-pass',
      name: 'Sabine Pass',
      group: 'port',
      lon: -93.87,
      lat: 29.74,
    },
    {
      id: 'port-arthur',
      name: 'Port Arthur',
      group: 'port',
      lon: -93.93,
      lat: 29.87,
    },
    {
      id: 'rotterdam',
      name: 'Rotterdam',
      group: 'port',
      lon: 4.12,
      lat: 51.95,
    },
    { id: 'antwerp', name: 'Antwerp', group: 'port', lon: 4.3, lat: 51.28 },
    {
      id: 'amsterdam',
      name: 'Amsterdam',
      group: 'port',
      lon: 4.8,
      lat: 52.41,
    },
    {
      id: 'milford-haven',
      name: 'Milford Haven',
      group: 'port',
      lon: -5.04,
      lat: 51.7,
    },
    {
      id: 'novorossiysk',
      name: 'Novorossiysk',
      group: 'port',
      lon: 37.79,
      lat: 44.72,
    },
    { id: 'primorsk', name: 'Primorsk', group: 'port', lon: 28.72, lat: 60.34 },
    {
      id: 'singapore',
      name: 'Singapore',
      group: 'port',
      lon: 103.72,
      lat: 1.26,
    },
    { id: 'ningbo', name: 'Ningbo', group: 'port', lon: 121.84, lat: 29.94 },
    { id: 'ulsan', name: 'Ulsan', group: 'port', lon: 129.38, lat: 35.5 },
    { id: 'chiba', name: 'Chiba', group: 'port', lon: 140.05, lat: 35.57 },
    { id: 'sikka', name: 'Sikka', group: 'port', lon: 69.84, lat: 22.43 },
  ].map((row) => Object.freeze(row)),
);
