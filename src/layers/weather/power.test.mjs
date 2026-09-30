import assert from 'node:assert/strict';
import { test } from 'node:test';
import { powerLine } from './model.js';
import { attachPower, readPower, regionsOf } from './power.js';

const rows = () => [
  { id: 'middle-atlantic', kind: 'division', eia930: ['NY', 'MIDA'] },
  { id: 'west-south-central', kind: 'division', eia930: ['TEX'] },
  { id: 'permian', kind: 'basin' },
];

/** The 930 series shape, as the datacenters' normalizer expects it. */
const payload = () => [
  {
    data: [
      {
        RESPONDENT_ID: 'TEX',
        RESPONDENT_NAME: 'Texas',
        TYPE_ID: 'D',
        VALUES: {
          DATES: ['09/30/2026 17:00:00', '09/30/2026 18:00:00'],
          DATA: [70000, 74392],
        },
      },
      {
        RESPONDENT_ID: 'TEX',
        TYPE_ID: 'DF',
        VALUES: {
          DATES: ['09/30/2026 19:00:00', '10/01/2026 05:00:00'],
          DATA: [72000, 63440],
        },
      },
      {
        RESPONDENT_ID: 'NY',
        RESPONDENT_NAME: 'New York',
        TYPE_ID: 'D',
        VALUES: { DATES: ['09/30/2026 18:00:00'], DATA: [17000] },
      },
    ],
  },
];

test('regionsOf lists every division region once, sorted; basins add nothing', () => {
  assert.deepEqual(regionsOf(rows()), ['MIDA', 'NY', 'TEX']);
  assert.deepEqual(regionsOf([]), []);
});

test('attachPower gives each division its regions by name and never sums them', () => {
  const r = rows();
  const n = attachPower(r, payload(), {
    fetchedAt: Date.UTC(2026, 8, 30, 18, 30),
  });
  assert.equal(n, 2, 'TEX and NY answered; MIDA is absent from the payload');
  const tex = r[1].power[0];
  assert.equal(tex.id, 'TEX');
  assert.equal(tex.demandMw, 74392);
  assert.equal(tex.forecastMw, 63440);
  assert.equal(tex.observedAt, '2026-09-30T18:00:00.000Z');
  assert.deepEqual(
    r[0].power.map((p) => p.id),
    ['NY'],
  );
  assert.equal(r[2].power, undefined, 'basins carry no power line');
  // D7.3: the card line names the region it quotes
  assert.equal(
    powerLine(r[1]),
    'power demand · TEX 74,392 MW at 18Z · day-ahead 63,440 · EIA-930',
  );
  assert.equal(powerLine(r[0]), 'power demand · NY 17,000 MW at 18Z · EIA-930');
  assert.equal(
    powerLine({ eia930: ['SW', 'NW'] }),
    'power demand · EIA-930 SW + NW · no reading yet',
  );
});

test('readPower makes one request for every region and tolerates a failure', async () => {
  const urls = [];
  const ok = await readPower(rows(), {
    fetchImpl: async (u) => {
      urls.push(u);
      return { ok: true, json: async () => payload() };
    },
    now: Date.UTC(2026, 8, 30, 18, 30),
  });
  assert.equal(urls.length, 1);
  assert.match(
    urls[0],
    /respondent%5B%5D=MIDA&respondent%5B%5D=NY&respondent%5B%5D=TEX/,
  );
  assert.match(urls[0], /type%5B%5D=D&type%5B%5D=DF/);
  assert.equal(ok.attached, 2);
  assert.equal(ok.error, null);
  const bad = await readPower(rows(), {
    fetchImpl: async () => ({ ok: false, status: 503 }),
  });
  assert.equal(bad.attached, 0);
  assert.match(bad.error, /503/);
  const none = await readPower([{ kind: 'basin' }], {
    fetchImpl: async () => {},
  });
  assert.equal(none.requests, 0);
});
