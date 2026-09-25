import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import {
  applyLicenceEnv,
  licenceEnvOverrides,
  licencePlugin,
  licenceProfile,
  licencesOnFile,
  withheldIds,
  withheldModuleMap,
  withheldPublicPaths,
  withheldSources,
} from '../../server/hosting/licences.js';
import { HOSTED_WITHHELD } from '../../server/hosting/licencePolicy.js';
import { isWithheld } from './withheld.js';
import { makeFixtureRoot } from '../tooling/fixtureRoot.mjs';

const REPO = fileURLToPath(new URL('../../', import.meta.url));
const HOSTED = { GEV_LICENCE_PROFILE: 'hosted' };

const FIXTURE_POLICY = [
  {
    id: 'restricted-bundle',
    modules: { 'src/restricted.js': 'src/stub.js' },
    publicPaths: ['events/pack'],
  },
  { id: 'switched-feed', env: { FEED_ENABLED: '0' } },
  { id: 'keyed-feed', env: { OTHER_ENABLED: '0' }, unlessEnv: 'FEED_KEY' },
];

test('the hosted profile is opt-in and exact', () => {
  assert.equal(licenceProfile({}), 'full');
  assert.equal(licenceProfile({ GEV_LICENCE_PROFILE: '' }), 'full');
  assert.equal(licenceProfile({ GEV_LICENCE_PROFILE: 'HOSTED' }), 'full');
  assert.equal(licenceProfile({ GEV_LICENCE_PROFILE: ' hosted ' }), 'hosted');
  assert.equal(licenceProfile(HOSTED), 'hosted');
});

test('withheld rows apply only under the hosted profile', () => {
  assert.deepEqual(withheldSources({}, FIXTURE_POLICY), []);
  assert.equal(withheldSources(HOSTED, FIXTURE_POLICY).length, 3);
  assert.deepEqual(licenceEnvOverrides({}, FIXTURE_POLICY), {});
  assert.deepEqual(licenceEnvOverrides(HOSTED, FIXTURE_POLICY), {
    FEED_ENABLED: '0',
    OTHER_ENABLED: '0',
  });
  assert.deepEqual(withheldIds({}, FIXTURE_POLICY), []);
  assert.deepEqual(withheldIds(HOSTED, FIXTURE_POLICY), [
    'restricted-bundle',
    'switched-feed',
    'keyed-feed',
  ]);
  assert.deepEqual(
    withheldIds({ ...HOSTED, FEED_KEY: 'k' }, FIXTURE_POLICY),
    ['restricted-bundle', 'switched-feed'],
    'a set key lapses its row',
  );
  assert.deepEqual(withheldPublicPaths(HOSTED, FIXTURE_POLICY), [
    '/events/pack/',
  ]);
  const map = withheldModuleMap(HOSTED, { root: '/r', policy: FIXTURE_POLICY });
  assert.equal(map.size, 1);
  assert.equal(
    path.resolve([...map.values()][0]),
    path.resolve('/r/src/stub.js'),
  );
  assert.equal(withheldModuleMap({}, { policy: FIXTURE_POLICY }).size, 0);
});

test('isWithheld reads the build-time list; empty in development', () => {
  assert.equal(isWithheld('open-meteo'), false);
  assert.equal(isWithheld('open-meteo', new Set(['open-meteo'])), true);
});

function fakeServer() {
  const stack = [];
  return { stack, middlewares: { use: (fn) => stack.push(fn) } };
}

function call(middleware, url) {
  return new Promise((resolve) => {
    const res = {
      status: null,
      body: '',
      writeHead(status) {
        this.status = status;
      },
      end(text = '') {
        this.body = text;
        resolve(res);
      },
    };
    middleware({ url }, res, () => resolve({ status: 'next' }));
  });
}

test('applyLicenceEnv forces the switches over the env file, only when hosted', () => {
  const target = { FEED_ENABLED: '1', KEEP: 'x' };
  const ids = 'restricted-bundle,switched-feed,keyed-feed';
  assert.deepEqual(
    applyLicenceEnv(HOSTED, { target, policy: FIXTURE_POLICY }),
    {
      FEED_ENABLED: '0',
      OTHER_ENABLED: '0',
      GEV_WITHHELD: ids,
    },
  );
  assert.deepEqual(target, {
    FEED_ENABLED: '0',
    KEEP: 'x',
    OTHER_ENABLED: '0',
    GEV_WITHHELD: ids,
  });
  const untouched = { FEED_ENABLED: '1' };
  assert.deepEqual(
    applyLicenceEnv({}, { target: untouched, policy: FIXTURE_POLICY }),
    {},
  );
  assert.deepEqual(untouched, { FEED_ENABLED: '1' });
});

test('a licence on file keeps its row on under the hosted profile', () => {
  const env = { ...HOSTED, GEV_LICENCE_ON_FILE: ' switched-feed , nope ' };
  assert.deepEqual([...licencesOnFile(env)], ['switched-feed', 'nope']);
  assert.deepEqual(
    withheldSources(env, FIXTURE_POLICY).map((row) => row.id),
    ['restricted-bundle', 'keyed-feed'],
  );
  assert.deepEqual(licenceEnvOverrides(env, FIXTURE_POLICY), {
    OTHER_ENABLED: '0',
  });
  assert.deepEqual(licencesOnFile({}), new Set());
});

test('the preview server refuses withheld public paths', async () => {
  const plugin = licencePlugin({
    env: HOSTED,
    root: '/r',
    policy: FIXTURE_POLICY,
  });
  const server = fakeServer();
  plugin.configurePreviewServer.handler(server);
  const [guard] = server.stack;
  assert.equal((await call(guard, '/events/pack/a.jpg')).status, 451);
  assert.equal((await call(guard, '/events/pack')).status, 451);
  assert.equal((await call(guard, '/events/pack%2Fa.jpg')).status, 451);
  assert.equal((await call(guard, '/events/packed/a.jpg')).status, 'next');
  assert.equal((await call(guard, '/')).status, 'next');

  const idle = fakeServer();
  licencePlugin({ env: {}, policy: FIXTURE_POLICY }).configureServer.handler(
    idle,
  );
  assert.equal(idle.stack.length, 0);
});

async function writeFixture(root) {
  await mkdir(path.join(root, 'src'), { recursive: true });
  await mkdir(path.join(root, 'public', 'events', 'pack'), { recursive: true });
  await writeFile(
    path.join(root, 'index.html'),
    '<!doctype html><title>Licence fixture</title><script type="module" src="/src/main.js"></script>',
  );
  await writeFile(
    path.join(root, 'src', 'main.js'),
    "import { source } from './restricted.js';\n" +
      'globalThis.__fixture = [source(), import.meta.env.GEV_WITHHELD];\n',
  );
  await writeFile(
    path.join(root, 'src', 'restricted.js'),
    "const url = new URL('./secret-data.json', import.meta.url).href;\n" +
      "export const source = () => 'restricted-marker ' + url;\n",
  );
  await writeFile(path.join(root, 'src', 'secret-data.json'), '{"secret":1}');
  await writeFile(
    path.join(root, 'src', 'stub.js'),
    "export const source = () => 'withheld-marker';\n",
  );
  await writeFile(path.join(root, 'public', 'events', 'pack', 'crop.jpg'), 'x');
  await writeFile(path.join(root, 'public', 'keep.txt'), 'keep');
}

async function listFiles(directory) {
  const out = [];
  for (const entry of await readdir(directory, {
    withFileTypes: true,
    recursive: true,
  }))
    if (entry.isFile())
      out.push(
        path
          .relative(
            directory,
            path.join(entry.parentPath ?? entry.path, entry.name),
          )
          .split(path.sep)
          .join('/'),
      );
  return out.sort();
}

async function buildFixture(root, env) {
  const outDir = path.join(
    root,
    env.GEV_LICENCE_PROFILE ? 'dist-hosted' : 'dist-full',
  );
  await build({
    root,
    configFile: false,
    envFile: false,
    logLevel: 'silent',
    publicDir: path.join(root, 'public'),
    // No inlining: the restricted asset must show up as a file when it ships.
    build: { outDir, emptyOutDir: true, minify: false, assetsInlineLimit: 0 },
    plugins: [licencePlugin({ env, root, policy: FIXTURE_POLICY })],
  });
  const files = await listFiles(outDir);
  const js = await Promise.all(
    files
      .filter((file) => file.endsWith('.js'))
      .map((file) => readFile(path.join(outDir, file), 'utf8')),
  );
  return { files, js: js.join('\n') };
}

test('a hosted build carries the stub, not the restricted module, its asset or its public files', async (t) => {
  const root = await makeFixtureRoot('gev-licences-');
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFixture(root);

  const full = await buildFixture(root, {});
  assert.ok(
    full.files.some((file) => /secret-data.*\.json$/.test(file)),
    full.files.join(', '),
  );
  assert.ok(full.files.includes('events/pack/crop.jpg'));
  assert.match(full.js, /restricted-marker/);
  assert.match(full.js, /\[\]/);

  const hosted = await buildFixture(root, HOSTED);
  assert.ok(
    !hosted.files.some((file) => /secret-data/.test(file)),
    hosted.files.join(', '),
  );
  assert.ok(!hosted.files.some((file) => file.startsWith('events/pack/')));
  assert.ok(hosted.files.includes('keep.txt'));
  assert.match(hosted.js, /withheld-marker/);
  assert.doesNotMatch(hosted.js, /restricted-marker/);
  assert.match(
    hosted.js,
    /\["restricted-bundle",\s*"switched-feed",\s*"keyed-feed"\]/,
  );
});

/** Every server and build source file, for the switch-name check. */
function serverSources() {
  const out = [];
  const visit = (directory) => {
    for (const entry of readdirSync(path.join(REPO, directory), {
      withFileTypes: true,
    })) {
      const relative = `${directory}/${entry.name}`;
      if (entry.isDirectory()) visit(relative);
      else if (entry.name.endsWith('.js'))
        out.push(readFileSync(path.join(REPO, relative), 'utf8'));
    }
  };
  visit('server');
  visit('build');
  return out.join('\n');
}

test('the real policy points at files, switches and checks that exist', () => {
  const sources = serverSources();
  const ids = new Set();
  for (const row of HOSTED_WITHHELD) {
    assert.ok(row.id && !ids.has(row.id), `unique id: ${row.id}`);
    ids.add(row.id);
    assert.ok(row.licence, `${row.id} names its licence`);
    assert.ok(row.permit, `${row.id} names what would switch it back on`);
    for (const [from, to] of Object.entries(row.modules ?? {})) {
      assert.ok(existsSync(path.join(REPO, from)), `${row.id}: ${from} exists`);
      assert.ok(
        existsSync(path.join(REPO, to)),
        `${row.id}: stub ${to} exists`,
      );
    }
    for (const entry of row.publicPaths ?? [])
      assert.ok(
        existsSync(path.join(REPO, 'public', entry)),
        `${row.id}: public/${entry} exists`,
      );
    for (const entry of row.routes ?? [])
      assert.match(
        entry,
        /^[a-z]/,
        `${row.id}: route ${entry} is written without a leading slash`,
      );
    for (const [name, value] of Object.entries(row.env ?? {})) {
      assert.ok(
        value === '0' || value === '',
        `${row.id}: ${name} switches off or blanks`,
      );
      assert.ok(
        sources.includes(`process.env.${name}`) ||
          sources.includes(`'${name}'`) ||
          sources.includes(`env.${name}`),
        `${row.id}: ${name} is read by the server`,
      );
    }
    if (row.code)
      assert.ok(
        readFileSync(path.join(REPO, row.code.file), 'utf8').includes(
          row.code.check,
        ),
        `${row.id}: ${row.code.file} calls ${row.code.check}`,
      );
    assert.ok(
      row.env || row.modules || row.publicPaths || row.routes || row.code,
      `${row.id} switches something off`,
    );
  }
});

test('on the server, isWithheld reads GEV_WITHHELD at call time', (t) => {
  const saved = { ...process.env };
  t.after(() => {
    for (const name of Object.keys(process.env))
      if (!(name in saved)) delete process.env[name];
    Object.assign(process.env, saved);
  });
  delete process.env.GEV_WITHHELD;
  assert.equal(isWithheld('portwatch'), false);
  const applied = applyLicenceEnv(HOSTED, { target: process.env });
  assert.equal(
    applied.GEV_WITHHELD,
    HOSTED_WITHHELD.map((row) => row.id).join(','),
  );
  assert.equal(isWithheld('portwatch'), true);
  assert.equal(isWithheld('transit:metrotransit-msp'), true);
  assert.equal(isWithheld('usgs'), false);
});

test('the licence table lists every withheld row as off', () => {
  const table = readFileSync(path.join(REPO, 'docs', 'LICENCES.md'), 'utf8');
  for (const row of HOSTED_WITHHELD)
    assert.match(
      table,
      new RegExp(`\\| \`${row.id}\` \\|[^\\n]*\\| \\*\\*OFF\\*\\* \\|`),
      `${row.id} is marked OFF in docs/LICENCES.md`,
    );
});
