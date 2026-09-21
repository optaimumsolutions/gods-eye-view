import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PAIR_RADIUS_M,
  cellIdFor,
  countryPairKey,
  groupNaceiByCell,
  haversineMetres,
  normaliseCountry,
  normaliseFiling,
  pairCrossBorderFilings,
  spreadMetres,
} from './naceiCells.js';

/**
 * Verbatim NACEI layer-2 records, fetched 2026-09-18. Four crossings, seven
 * filings, chosen because each one carries a different fault:
 *   Naco / El Paso        — the canonical double filing, 75 m apart
 *   Aguaprieta / El Paso  — a second double filing, 151 m apart
 *   ANG / GTN             — 15 m apart with the two countries filing OPPOSITE directions
 *   Nogales               — a genuine singleton that must not be merged into anything
 */
const NACO_MX = {
  OBJECTID: 2,
  Country: 'Mexico',
  Pipeline: 'Naco',
  Owner: 'PEMEX',
  Latitude: 31.3338721,
  Longitude: -109.81938,
  City: 'Naco',
  County: '',
  StateProv: 'Sonora',
  FrmCountry: 'Mexico',
  FrmState: 'Sonora',
  ToCountry: 'United States',
  ToState: 'Arizona',
  NumPipes: 1,
  Diam_Inch: '16',
  MaxOP_psi: '1170',
  Vol_MMcfd: '109.926',
  Source: 'CRE',
  Period: 2017,
};
const NACO_US = {
  OBJECTID: 50,
  Country: 'United States',
  Pipeline: 'El Paso Natural Gas Pipeline',
  Owner: 'Kinder Morgan',
  Latitude: 31.3343022,
  Longitude: -109.8187661,
  City: 'Naco',
  County: '',
  StateProv: 'Arizona',
  FrmCountry: 'United States',
  FrmState: 'Arizona',
  ToCountry: 'Mexico',
  ToState: 'Sonora',
  NumPipes: 0,
  Diam_Inch: '',
  MaxOP_psi: '',
  Vol_MMcfd: '57',
  Source: 'DOE Fossil Energy & FERC; public websites and press releases',
  Period: 2017,
};
const AGUAPRIETA_MX = {
  OBJECTID: 1,
  Country: 'Mexico',
  Pipeline: 'Gasoducto de Aguaprieta',
  Owner:
    'Sempra Gasoductos México, S. de R.L. de C.V. \nSempra Compresión México, S. de R.L. de C.V.',
  Latitude: 31.334044,
  Longitude: -109.596442,
  City: 'Agua prieta',
  County: '',
  StateProv: 'Sonora',
  FrmCountry: 'Mexico',
  FrmState: 'Sonora',
  ToCountry: 'United States',
  ToState: 'Arizona',
  NumPipes: 1,
  Diam_Inch: '20',
  MaxOP_psi: '1000',
  Vol_MMcfd: '215.066',
  Source: 'CRE',
  Period: 2017,
};
const DOUGLAS_US = {
  OBJECTID: 49,
  Country: 'United States',
  Pipeline: 'El Paso Natural Gas Pipeline',
  Owner: 'Kinder Morgan',
  Latitude: 31.3354039,
  Longitude: -109.5963925,
  City: 'Douglas',
  County: '',
  StateProv: 'Arizona',
  FrmCountry: 'United States',
  FrmState: 'Arizona',
  ToCountry: 'Mexico',
  ToState: 'Sonora',
  NumPipes: 0,
  Diam_Inch: '',
  MaxOP_psi: '',
  Vol_MMcfd: '185',
  Source: 'DOE Fossil Energy & FERC; public websites and press releases',
  Period: 2017,
};
const ANG_CA = {
  OBJECTID: 22,
  Country: 'Canada',
  Pipeline: 'ANG Mainline',
  Owner: 'Foothills Pipe Lines Ltd.',
  Latitude: 49.00059,
  Longitude: -116.186,
  City: 'Kingsgate',
  County: '',
  StateProv: 'British Columbia',
  FrmCountry: 'United States',
  FrmState: 'Idaho',
  ToCountry: 'Canada',
  ToState: 'British Columbia',
  NumPipes: 1,
  Diam_Inch: '24',
  MaxOP_psi: '1440',
  Vol_MMcfd: '',
  Source: 'NEB/ONÉ',
  Period: 201706,
};
const GTN_US = {
  OBJECTID: 57,
  Country: 'United States',
  Pipeline: 'Gas Transmission Northwest LLC',
  Owner: 'TransCanada',
  Latitude: 49.000465,
  Longitude: -116.186092,
  City: 'Eastport',
  County: '',
  StateProv: 'Idaho',
  FrmCountry: 'Canada',
  FrmState: 'British Columbia',
  ToCountry: 'United States',
  ToState: 'Idaho',
  NumPipes: 0,
  Diam_Inch: '',
  MaxOP_psi: '',
  Vol_MMcfd: '2967',
  Source: 'DOE Fossil Energy & FERC; public websites and press releases',
  Period: 2017,
};
const NOGALES_US = {
  OBJECTID: 51,
  Country: 'United States',
  Pipeline: 'El Paso Natural Gas Pipeline',
  Owner: 'Kinder Morgan',
  Latitude: 31.336738,
  Longitude: -110.968082,
  City: 'Nogales',
  County: '',
  StateProv: 'Arizona',
  FrmCountry: 'United States',
  FrmState: 'Arizona',
  ToCountry: 'Mexico',
  ToState: 'Sonora',
  NumPipes: 0,
  Diam_Inch: '',
  MaxOP_psi: '',
  Vol_MMcfd: '261',
  Source: 'DOE Fossil Energy & FERC; public websites and press releases',
  Period: 2017,
};

const FIXTURE = [
  NACO_MX,
  NACO_US,
  AGUAPRIETA_MX,
  DOUGLAS_US,
  ANG_CA,
  GTN_US,
  NOGALES_US,
].map((attributes) => ({
  attributes,
  geometry: { x: attributes.Longitude, y: attributes.Latitude },
}));

const cellFor = (cells, city) =>
  cells.find((cell) => cell.cities.includes(city));

test('haversineMetres reproduces the measured separations', () => {
  const near = (actual, expected) =>
    assert.ok(Math.abs(actual - expected) < 2, `${actual} ≉ ${expected}`);
  near(haversineMetres(normaliseFiling(NACO_MX), normaliseFiling(NACO_US)), 75);
  near(
    haversineMetres(
      normaliseFiling(AGUAPRIETA_MX),
      normaliseFiling(DOUGLAS_US),
    ),
    151,
  );
  near(haversineMetres(normaliseFiling(ANG_CA), normaliseFiling(GTN_US)), 15);
});

test('normaliseCountry and countryPairKey ignore the direction of filing', () => {
  assert.equal(normaliseCountry('United States'), 'US');
  assert.equal(normaliseCountry(' canada '), 'CA');
  assert.equal(normaliseCountry('Mexico'), 'MX');
  assert.equal(normaliseCountry(''), null);
  // The whole point: Mexico files MX→US and the US files US→MX for one pipe.
  assert.equal(
    countryPairKey('Mexico', 'United States'),
    countryPairKey('United States', 'Mexico'),
  );
  assert.equal(countryPairKey('Mexico', 'United States'), 'MX|US');
});

test('cellIdFor is stable and hemisphere-explicit', () => {
  assert.equal(cellIdFor(31.33409, -109.81907), 'gxn31.3341w109.8191');
  assert.equal(cellIdFor(49.0005, -116.186), 'gxn49.0005w116.1860');
  assert.notEqual(
    cellIdFor(31.3341, -109.8191),
    cellIdFor(-31.3341, -109.8191),
  );
});

test('normaliseFiling strips the 2017 magnitudes to display strings only', () => {
  const filing = normaliseFiling(NACO_MX);
  // R4.12: no numeric capacity, diameter or pressure may exist on the record.
  assert.equal(filing.Vol_MMcfd, undefined);
  assert.equal(filing.Diam_Inch, undefined);
  assert.equal(filing.MaxOP_psi, undefined);
  assert.equal(filing.design.capacity, '109.926 MMcf/d design (2017)');
  assert.equal(filing.design.diameter, '16 in design (2017)');
  for (const value of Object.values(filing.design))
    assert.equal(typeof value, 'string');
});

test('normaliseFiling reads NumPipes 0 as not-filed, and never as a number', () => {
  // NumPipes is the fourth 2017 magnitude and correlates with crossing size,
  // so it is demoted to a string like its three siblings. A number here would
  // be exactly the variable a renderer could bind a size to.
  const us = normaliseFiling(NACO_US);
  const mx = normaliseFiling(NACO_MX);
  assert.equal(us.numPipes, undefined);
  assert.equal(mx.numPipes, undefined);
  assert.equal(
    us.design.pipes,
    undefined,
    'NumPipes 0 means not filed, so no string either',
  );
  assert.equal(mx.design.pipes, '1 pipe filed (2017)');
});

test('no filing exposes any numeric magnitude at all', () => {
  const { cells } = groupNaceiByCell(FIXTURE);
  for (const cell of cells) {
    for (const filing of cell.filings) {
      for (const [key, value] of Object.entries(filing)) {
        if (key === 'latitude' || key === 'longitude' || key === 'objectId')
          continue;
        assert.notEqual(
          typeof value,
          'number',
          `${key} is a number on a 2017 filing`,
        );
      }
      for (const value of Object.values(filing.design))
        assert.equal(typeof value, 'string');
    }
  }
});

test('normaliseFiling flattens the embedded newlines in an Owner string', () => {
  const filing = normaliseFiling(AGUAPRIETA_MX);
  assert.ok(!filing.owner.includes('\n'));
  assert.match(
    filing.owner,
    /^Sempra Gasoductos México, S\. de R\.L\. de C\.V\. Sempra/,
  );
  // Correctly encoded upstream, so nothing to repair and no raw suffix to show.
  assert.equal(filing.ownerRaw, null);
});

test('normaliseFiling confirms the geometry agrees with the Latitude/Longitude fields', () => {
  assert.equal(
    normaliseFiling(NACO_MX, { x: NACO_MX.Longitude, y: NACO_MX.Latitude })
      .geometryAgrees,
    true,
  );
  assert.equal(normaliseFiling(NACO_MX, { x: 0, y: 0 }).geometryAgrees, false);
  assert.equal(normaliseFiling(NACO_MX).geometryAgrees, null);
});

test('groupNaceiByCell collapses the Naco double filing to one mark', () => {
  const { cells } = groupNaceiByCell(FIXTURE);
  const naco = cellFor(cells, 'Naco');
  assert.equal(naco.filingCount, 2);
  assert.deepEqual(naco.filedBy, ['MX', 'US']);
  assert.equal(naco.countryPair, 'MX|US');
  assert.ok(naco.spreadMetres > 70 && naco.spreadMetres < 80);
  const pipelines = naco.filings.map((f) => f.pipeline).sort();
  assert.deepEqual(pipelines, ['El Paso Natural Gas Pipeline', 'Naco']);
});

test('groupNaceiByCell never sums, averages or reconciles the two filings', () => {
  const { cells } = groupNaceiByCell(FIXTURE);
  const naco = cellFor(cells, 'Naco');
  // Summing 109.926 and 57 would invent a 167 MMcf/d crossing nobody filed.
  const serialised = JSON.stringify(naco);
  assert.ok(!serialised.includes('166.926'));
  assert.ok(!serialised.includes('167'));
  // Both survive verbatim, each carrying its own vintage.
  assert.ok(serialised.includes('109.926 MMcf/d design (2017)'));
  assert.ok(serialised.includes('57 MMcf/d design (2017)'));
  // And no aggregate field exists for a card to reach for by accident.
  for (const key of ['capacity', 'totalCapacity', 'volume', 'vol', 'mmcfd']) {
    assert.equal(naco[key], undefined, `cell must not expose ${key}`);
  }
});

test('groupNaceiByCell records a direction disagreement rather than resolving it', () => {
  const { cells } = groupNaceiByCell(FIXTURE);
  const kingsgate = cellFor(cells, 'Kingsgate');
  assert.equal(kingsgate.filingCount, 2);
  // 15 m apart, and the two governments file opposite directions for one pipe.
  assert.equal(kingsgate.directionsDisagree, true);
  assert.deepEqual(kingsgate.directionsFiled, ['CA->US', 'US->CA']);
  assert.equal(kingsgate.countryPair, 'CA|US');
});

test('groupNaceiByCell leaves a genuine singleton alone', () => {
  const { cells } = groupNaceiByCell(FIXTURE);
  const nogales = cellFor(cells, 'Nogales');
  assert.equal(nogales.filingCount, 1);
  assert.equal(nogales.directionsDisagree, false);
  assert.equal(cells.length, 4, 'seven filings describe four crossings');
});

test('groupNaceiByCell is independent of input order', () => {
  const forward = groupNaceiByCell(FIXTURE).cells;
  const reversed = groupNaceiByCell([...FIXTURE].reverse()).cells;
  const shuffled = groupNaceiByCell([
    FIXTURE[3],
    FIXTURE[6],
    FIXTURE[0],
    FIXTURE[5],
    FIXTURE[2],
    FIXTURE[4],
    FIXTURE[1],
  ]).cells;
  assert.deepEqual(JSON.stringify(reversed), JSON.stringify(forward));
  assert.deepEqual(JSON.stringify(shuffled), JSON.stringify(forward));
});

test('the pairing radius is the one the sweep chose', () => {
  assert.equal(PAIR_RADIUS_M, 1500);
  // Below the pair separation, Naco and Agua Prieta each split back into two.
  const tight = groupNaceiByCell(FIXTURE, { radiusMetres: 50 }).cells;
  assert.equal(tight.length, 6);
  assert.equal(cellFor(tight, 'Naco').filingCount, 1);
});

test('no radius can ever put three filings on one mark', () => {
  // Mutual nearest-neighbour pairing is 1:1 by construction, so there is no
  // chaining at any radius — this is the property a single-link cluster could
  // not give, and the reason it was replaced.
  for (const radiusMetres of [50, 300, 1500, 30000, 5_000_000]) {
    const { cells } = groupNaceiByCell(FIXTURE, { radiusMetres });
    for (const cell of cells) {
      assert.ok(
        cell.filingCount <= 2,
        `${cell.cellId} holds ${cell.filingCount} at ${radiusMetres} m`,
      );
    }
  }
});

test('filings from the same government never pair, at any distance', () => {
  // The 13 m Reynosa pair is two different Mexican pipelines, not one crossing
  // filed twice. A government does not file the same crossing twice.
  const reynosaA = {
    ...NACO_MX,
    OBJECTID: 800,
    Pipeline: 'Reynosa- TETCO',
    City: 'Reynosa',
    Latitude: 26.0867,
    Longitude: -98.2638,
  };
  const reynosaB = {
    ...NACO_MX,
    OBJECTID: 801,
    Pipeline: 'Reynosa - TENNESSE',
    City: 'Reynosa',
    Latitude: 26.08671,
    Longitude: -98.26369,
  };
  const { cells } = groupNaceiByCell(
    [reynosaA, reynosaB].map((attributes) => ({ attributes })),
    {
      radiusMetres: 30000,
    },
  );
  assert.equal(
    cells.length,
    2,
    'two Mexican filings 13 m apart stay two marks',
  );
  for (const cell of cells) assert.deepEqual(cell.filedBy, ['MX']);
});

test('pairing is mutual, so a third filing cannot steal a partner', () => {
  // GTN's nearest cross-border filing is ANG at 15 m and vice versa, so they
  // pair. A Mexican filing parked 400 m from GTN must not join them.
  const intruder = {
    ...NACO_MX,
    OBJECTID: 802,
    Pipeline: 'Intruder',
    City: 'Nowhere',
    Latitude: 49.0041,
    Longitude: -116.186,
  };
  const { cells } = groupNaceiByCell(
    [ANG_CA, GTN_US, intruder].map((attributes) => ({ attributes })),
    { radiusMetres: 1500 },
  );
  const kingsgate = cellFor(cells, 'Kingsgate');
  assert.equal(kingsgate.filingCount, 2);
  assert.deepEqual(kingsgate.filedBy, ['CA', 'US']);
  assert.equal(cellFor(cells, 'Nowhere').filingCount, 1);
});

test('a missing coordinate is dropped, never plotted at null island', () => {
  const blank = {
    attributes: { ...NACO_MX, OBJECTID: 900, Latitude: null, Longitude: null },
  };
  const empty = {
    attributes: { ...NACO_MX, OBJECTID: 901, Latitude: '', Longitude: '' },
  };
  const origin = {
    attributes: { ...NACO_MX, OBJECTID: 902, Latitude: 0, Longitude: 0 },
  };
  const { cells, dropped } = groupNaceiByCell([
    ...FIXTURE,
    blank,
    empty,
    origin,
  ]);
  assert.deepEqual(dropped, [900, 901, 902]);
  assert.equal(cells.length, 4);
  assert.ok(!cells.some((cell) => cell.latitude === 0 && cell.longitude === 0));
});

test('pairCrossBorderFilings and spreadMetres degrade cleanly on trivial input', () => {
  assert.deepEqual(pairCrossBorderFilings([]), []);
  assert.equal(spreadMetres([]), 0);
  assert.equal(spreadMetres([normaliseFiling(NACO_MX)]), 0);
  assert.equal(pairCrossBorderFilings([normaliseFiling(NACO_MX)]).length, 1);
});

test('groupNaceiByCell reports a record it could not place rather than dropping it', () => {
  const broken = {
    attributes: {
      OBJECTID: 999,
      Country: 'Mexico',
      Latitude: null,
      Longitude: null,
    },
  };
  const { cells, dropped } = groupNaceiByCell([...FIXTURE, broken]);
  assert.deepEqual(dropped, [999]);
  assert.equal(cells.length, 4);
});
