import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CROSSING_PIXEL_SIZE,
  CROSSING_UNKNOWN_CSS,
  GAS_LOCAL_HEIGHT_M,
  GAS_REGIONAL_HEIGHT_M,
  GAS_TIER_GLOBAL,
  GAS_TIER_LOCAL,
  GAS_TIER_REGIONAL,
  NETWORK_COLOR_CSS,
  NETWORK_DRAW_COST_MEASURED,
  NETWORK_DRAW_COST_MIB,
  NETWORK_WIDTH_PX,
  detailTierForHeight,
  networkAlphaFor,
  networkStampFor,
  networkVisibleAtTier,
  pencilMetaLine,
} from './model.js';

test('detailTierForHeight splits at the datacenters thresholds', () => {
  assert.equal(GAS_LOCAL_HEIGHT_M, 300_000);
  assert.equal(GAS_REGIONAL_HEIGHT_M, 2_500_000);
  assert.equal(detailTierForHeight(1_000), GAS_TIER_LOCAL);
  assert.equal(detailTierForHeight(299_999), GAS_TIER_LOCAL);
  assert.equal(detailTierForHeight(300_000), GAS_TIER_REGIONAL);
  assert.equal(detailTierForHeight(2_499_999), GAS_TIER_REGIONAL);
  assert.equal(detailTierForHeight(2_500_000), GAS_TIER_GLOBAL);
  assert.equal(detailTierForHeight(20_000_000), GAS_TIER_GLOBAL);
  // An unknown camera height must not invent a close-up.
  assert.equal(detailTierForHeight(undefined), GAS_TIER_GLOBAL);
  assert.equal(detailTierForHeight(Number.NaN), GAS_TIER_GLOBAL);
});

test('the network is withheld entirely at global', () => {
  // 32,885 hairlines at that altitude is a continental smear whose density is
  // a digitizing artifact, not a fact about gas.
  assert.equal(networkAlphaFor('Interstate', GAS_TIER_GLOBAL), null);
  assert.equal(networkAlphaFor('Intrastate', GAS_TIER_GLOBAL), null);
  assert.equal(networkVisibleAtTier(GAS_TIER_GLOBAL), false);
});

test('one alpha step, from the only field with distinct values', () => {
  assert.equal(networkAlphaFor('Interstate', GAS_TIER_REGIONAL), 0.18);
  assert.equal(networkAlphaFor('Intrastate', GAS_TIER_REGIONAL), null);
  assert.equal(networkAlphaFor('Interstate', GAS_TIER_LOCAL), 0.3);
  assert.equal(networkAlphaFor('Intrastate', GAS_TIER_LOCAL), 0.2);
  assert.equal(networkVisibleAtTier(GAS_TIER_REGIONAL), true);
  assert.equal(networkVisibleAtTier(GAS_TIER_LOCAL), true);
});

test('an unknown pipe class draws nothing rather than guessing an alpha', () => {
  assert.equal(networkAlphaFor('Gathering', GAS_TIER_LOCAL), null);
  assert.equal(networkAlphaFor(undefined, GAS_TIER_LOCAL), null);
  assert.equal(networkAlphaFor('Interstate', 'nonsense'), null);
});

test('nothing in the PENCIL grade varies with a quantity', () => {
  // Every size in this module is a constant. There is no function here that
  // takes a magnitude, because the bundle contains no magnitude.
  assert.equal(typeof CROSSING_PIXEL_SIZE, 'number');
  assert.equal(CROSSING_PIXEL_SIZE, 6);
  assert.equal(NETWORK_WIDTH_PX, 1);
  assert.equal(NETWORK_COLOR_CSS, '#6f7a88');
  assert.equal(CROSSING_UNKNOWN_CSS, '#9aa4b2');
});

test('the network stamp names the vintage and refuses to imply flow', () => {
  assert.equal(
    networkStampFor('JAN-2020'),
    'NETWORK · EIA TRANSMISSION · JAN-2020 · GEOMETRY ONLY · NO FLOW',
  );
});

test('the meta line says it has no numbers instead of printing a zero', () => {
  const line = pencilMetaLine({
    crossings: 60,
    systems: 234,
    networkVintage: 'JAN-2020',
    crossingVintage: 'NACEI 2017',
    keyRequired: true,
  });
  assert.equal(
    line,
    '60 PTS · 234 SYSTEMS · GEOMETRY ONLY · CROSSINGS NACEI 2017 · GRID JAN-2020 · NO EIA KEY · VOLUMES UNAVAILABLE',
  );
  // It must never claim a volume, in either state.
  for (const keyRequired of [true, false]) {
    const text = pencilMetaLine({ crossings: 60, systems: 234, keyRequired });
    assert.ok(!/MMcf/.test(text));
    assert.ok(/UNAVAILABLE|NO VOLUMES/.test(text));
  }
});

test('a dark grid says why it is dark, rather than going silent', () => {
  // Omitting the grid entirely would read as "no pipelines here", which is the
  // opposite of true. The measured cost is the reason, so it is the caption.
  const off = pencilMetaLine({
    crossings: 60,
    systems: 234,
    networkVintage: 'JAN-2020',
    networkOff: true,
  });
  // The figure is the dated constant, never a literal that drifts from it.
  assert.ok(Number.isInteger(NETWORK_DRAW_COST_MIB));
  assert.match(NETWORK_DRAW_COST_MEASURED, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(
    off.includes(`GRID JAN-2020 OFF · ${NETWORK_DRAW_COST_MIB} MiB TO DRAW`),
    off,
  );
  const on = pencilMetaLine({
    crossings: 60,
    systems: 234,
    networkVintage: 'JAN-2020',
  });
  assert.match(on, /GRID JAN-2020/);
  assert.ok(!/OFF/.test(on));
});

test('the meta line degrades without inventing counts', () => {
  const line = pencilMetaLine();
  assert.equal(
    line,
    '0 PTS · 0 SYSTEMS · GEOMETRY ONLY · GRID · NO VOLUMES LOADED',
  );
  assert.ok(!line.includes('undefined'));
  assert.ok(!line.includes('NaN'));
});
