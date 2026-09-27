import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createBlankTileDiscardPolicy,
  createUsgsImagery,
  isBlankTileSample,
  USGS_IMAGERY_CREDIT,
  USGS_IMAGERY_MAX_LEVEL,
  USGS_IMAGERY_URL,
} from './imagery.js';
import { createKeylessTerrain } from './terrain.js';
import { createDefaultMapSources } from './defaultSources.js';

const pixels = (...rgba) => rgba.flat();

test('blank tiles: all transparent or all white; anything else is imagery', () => {
  // The placeholders USGS serves offshore (transparent) and abroad (white).
  assert.equal(isBlankTileSample(pixels([0, 0, 0, 0], [0, 0, 0, 0])), true);
  assert.equal(
    isBlankTileSample(pixels([255, 255, 255, 255], [252, 254, 255, 255])),
    true,
  );
  assert.equal(
    isBlankTileSample(pixels([255, 255, 255, 255], [31, 64, 22, 255])),
    false,
  );
  assert.equal(
    isBlankTileSample(pixels([0, 0, 0, 0], [255, 255, 255, 255])),
    false,
    'a half-transparent, half-white sample is not one placeholder',
  );
  assert.equal(isBlankTileSample(pixels([255, 255, 255, 128])), false);
  assert.equal(isBlankTileSample([]), false);
  assert.equal(isBlankTileSample(null), false);
});

test('the discard policy drops blank tiles, keeps imagery and never throws', () => {
  const samples = new Map([
    ['blank', pixels([0, 0, 0, 0], [0, 0, 0, 0])],
    ['imagery', pixels([90, 110, 70, 255], [80, 96, 60, 255])],
  ]);
  const policy = createBlankTileDiscardPolicy({
    readSample: (image) => {
      if (image === 'tainted') throw new Error('SecurityError');
      return samples.get(image);
    },
  });
  assert.equal(policy.isReady(), true);
  assert.equal(policy.shouldDiscardImage('blank'), true);
  assert.equal(policy.shouldDiscardImage('imagery'), false);
  assert.equal(policy.shouldDiscardImage('tainted'), false);
});

test('USGS imagery: public-domain template, level cap, credit, discard policy, quiet 404s', () => {
  const provider = createUsgsImagery();
  assert.equal(provider.url, USGS_IMAGERY_URL);
  assert.match(USGS_IMAGERY_URL, /^https:\/\/basemap\.nationalmap\.gov\//);
  assert.equal(provider.maximumLevel, USGS_IMAGERY_MAX_LEVEL);
  assert.equal(USGS_IMAGERY_MAX_LEVEL, 16);
  assert.equal(provider.credit.html, USGS_IMAGERY_CREDIT);
  assert.equal(
    typeof provider.tileDiscardPolicy.shouldDiscardImage,
    'function',
  );
  assert.equal(provider.errorEvent.numberOfListeners, 1);
});

test('the USGS stack is keyless everywhere and draws on the keyless terrain', () => {
  const registry = createDefaultMapSources();
  const usgs = registry.sources.find(
    ({ descriptor }) => descriptor.id === 'usgs-imagery',
  );
  assert.equal(usgs.available, true);
  assert.equal(usgs.descriptor.label, 'USGS Imagery');
  assert.equal(usgs.terrain.create, createKeylessTerrain);
  assert.equal(usgs.constructionFallback, undefined);
  assert.equal(
    usgs.tileFailureFallback,
    undefined,
    '404s must not flip the stack',
  );
  // Laptop development keeps Esri as its keyless default (R14.1).
  assert.equal(registry.defaultId, 'esri-imagery');
});
