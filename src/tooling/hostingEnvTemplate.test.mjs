import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  TEMPLATE_PATH,
  renderTemplate,
  scanEnvNames,
} from '../../scripts/hosting/env-template.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

test('the production env template is current and names every variable the server reads', () => {
  const scanned = scanEnvNames(ROOT);
  const committed = readFileSync(
    new URL(`../../${TEMPLATE_PATH}`, import.meta.url),
    'utf8',
  );
  assert.equal(
    committed.replace(/\r\n/g, '\n'),
    renderTemplate(scanned),
    'run: node scripts/hosting/env-template.mjs',
  );
  for (const name of scanned)
    assert.match(committed, new RegExp(`^(?:# )?${name}=`, 'm'), name);
});

test('the scan finds the hosting switches and the indirectly read Google server key', () => {
  const scanned = scanEnvNames(ROOT);
  for (const name of [
    'GEV_ACCESS_TEAM',
    'GEV_ACCESS_AUD',
    'GEV_REQUIRE_ACCESS',
    'GEV_ALLOWED_HOSTS',
    'GEV_PROXY_KEY',
    'GEV_NAV_STRIP',
    'GOOGLE_MAPS_SERVER_API_KEY',
    'CESIUM_ION_TOKEN',
  ])
    assert.ok(scanned.includes(name), name);
});

test('the template holds no values for secrets', () => {
  const text = renderTemplate(scanEnvNames(ROOT));
  for (const line of text.split('\n')) {
    if (line.startsWith('#') || !line.includes('=')) continue;
    const [name, value] = line.split('=');
    if (
      /KEY|TOKEN|SECRET|PASSWORD|AUD/.test(name) &&
      name !== 'GEV_RATELIMIT_OPENAI_PER_MIN'
    )
      assert.equal(value, '', `${name} must ship empty`);
  }
});
