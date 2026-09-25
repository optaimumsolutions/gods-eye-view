import test from 'node:test';
import assert from 'node:assert/strict';
import { createEventHub } from '../../server/hosting/eventHub.js';
import {
  EVENT_VERSION,
  parsePublishBody,
  parseUtc,
  sourceRecord,
} from '../../server/hosting/eventContract.js';

const T0 = Date.parse('2026-09-25T15:00:00Z');
const HOUR = 3_600_000;

/** A stand-in oracle: freshness through the console, askd health, the relay. */
function fakeOracle() {
  const oracle = {
    consoleUp: true,
    askdUp: true,
    relayUp: true,
    pages: [],
    freshnessReads: 0,
    sources: [
      {
        source: 'quotes',
        observedAt: null,
        fetchedAt: '2026-09-25 14:30:00',
        lastRunAt: '2026-09-25 14:30:00',
        lastRunRows: 4,
        toleranceHours: 2,
        graceHours: 2,
        critical: true,
        state: 'live',
      },
      {
        source: 'portwatch',
        observedAt: '2026-09-20',
        fetchedAt: '2026-09-24 02:10:00',
        lastRunAt: '2026-09-24 02:10:00',
        lastRunRows: 28,
        toleranceHours: 192,
        graceHours: 192,
        critical: false,
        state: 'live',
      },
    ],
  };
  oracle.fetch = async (url, options = {}) => {
    const target = String(url);
    if (target.endsWith('/api/oracle/freshness')) {
      oracle.freshnessReads += 1;
      if (!oracle.consoleUp) throw new TypeError('fetch failed');
      return Response.json({ sources: oracle.sources });
    }
    if (target.endsWith('/health')) {
      if (!oracle.askdUp) throw new TypeError('fetch failed');
      return Response.json({ ok: true, running: null });
    }
    if (target.endsWith('/relay/slack')) {
      if (!oracle.askdUp || !oracle.relayUp)
        throw new TypeError('fetch failed');
      assert.equal(options.headers['x-oracle-proxy-key'], 'key-fixture');
      oracle.pages.push(JSON.parse(options.body).text);
      return Response.json({ ok: true }, { status: 202 });
    }
    throw new Error(`unexpected ${target}`);
  };
  return oracle;
}

function harness({ pagesPerHour } = {}) {
  const oracle = fakeOracle();
  let now = T0;
  const intervals = [];
  const hub = createEventHub({
    consoleUrl: 'http://console.test',
    askdUrl: 'http://askd.test',
    proxyKey: 'key-fixture',
    fetchImpl: oracle.fetch,
    now: () => now,
    setIntervalImpl: (fn, ms) => {
      intervals.push({ fn, ms });
      return intervals.length;
    },
    clearIntervalImpl: () => {},
    ...(pagesPerHour ? { pagesPerHour } : {}),
    log: { warn() {}, error() {} },
  });
  const frames = [];
  const client = { send: (text) => frames.push(JSON.parse(text)) };
  const settle = () => new Promise((resolve) => setTimeout(resolve, 5));
  const tick = async (ms) => {
    now += ms;
    await hub.refreshFreshness();
    await hub.probeAskd();
    await settle();
  };
  return {
    oracle,
    hub,
    frames,
    client,
    intervals,
    settle,
    tick,
    setNow: (value) => (now = value),
  };
}

const of = (frames, type) => frames.filter((frame) => frame.type === type);

test('contract helpers: timestamps, deadlines, publish validation', () => {
  assert.equal(
    parseUtc('2026-09-25 14:30:00'),
    Date.parse('2026-09-25T14:30:00Z'),
  );
  assert.equal(
    parseUtc('2026-09-25T14:30:00+00:00'),
    Date.parse('2026-09-25T14:30:00Z'),
  );
  assert.equal(parseUtc(''), null);
  const record = sourceRecord({
    source: 'quotes',
    fetchedAt: '2026-09-25 14:30:00',
    toleranceHours: 2,
    graceHours: 2,
    critical: true,
    state: 'live',
  });
  assert.equal(record.deadline, '2026-09-25T18:30:00.000Z');
  assert.equal(record.critical, true);
  assert.equal(sourceRecord({ source: 'x' }).deadline, null);
  assert.deepEqual(
    parsePublishBody({
      items: [{ source: 'quotes', runAt: '2026-09-25 15:00:02', rows: 4 }],
    }),
    [{ source: 'quotes', runAt: '2026-09-25T15:00:02.000Z', rows: 4 }],
  );
  assert.throws(() => parsePublishBody({}), /items/);
  assert.throws(
    () => parsePublishBody({ items: [{ source: 'Bad Name' }] }),
    /source/,
  );
  assert.throws(
    () => parsePublishBody({ items: [{ source: 'q', rows: 1.5 }] }),
    /rows/,
  );
  assert.throws(
    () =>
      parsePublishBody({
        items: Array.from({ length: 201 }, () => ({ source: 'q' })),
      }),
    /at most/,
  );
});

test('a new client gets a snapshot of every source and component', async () => {
  const h = harness();
  h.hub.start();
  await h.settle();
  h.hub.addClient(h.client);
  const [snapshot] = h.frames;
  assert.equal(snapshot.type, 'snapshot');
  assert.equal(snapshot.v, EVENT_VERSION);
  assert.deepEqual(snapshot.sources.map((source) => source.source).sort(), [
    'portwatch',
    'quotes',
  ]);
  const quotes = snapshot.sources.find((source) => source.source === 'quotes');
  assert.equal(quotes.deadline, '2026-09-25T18:30:00.000Z');
  const states = Object.fromEntries(
    snapshot.health.map((entry) => [entry.component, entry.state]),
  );
  assert.equal(states.globe, 'live');
  assert.equal(states.console, 'live');
  assert.equal(states.askd, 'live');
  assert.equal(states['ingest:quotes'], 'live');
  assert.deepEqual(h.oracle.pages, [], 'start-up never pages');
});

test('heartbeat every 30 s, probes every 20 s', async () => {
  const h = harness();
  h.hub.start();
  await h.settle();
  assert.deepEqual(
    h.intervals.map((entry) => entry.ms).sort((a, b) => a - b),
    [20_000, 30_000],
  );
  h.hub.addClient(h.client);
  h.intervals.find((entry) => entry.ms === 30_000).fn();
  const beat = of(h.frames, 'heartbeat')[0];
  assert.equal(beat.v, EVENT_VERSION);
  assert.equal(beat.at, new Date(T0).toISOString());
});

test('publish emits one source.updated per item with the store observedAt', async () => {
  const h = harness();
  h.hub.start();
  await h.settle();
  h.hub.addClient(h.client);
  const reads = h.oracle.freshnessReads;
  const accepted = await h.hub.publish([
    { source: 'portwatch', runAt: '2026-09-25T15:00:01.000Z', rows: 28 },
    { source: 'gdelt_news', runAt: '2026-09-25T15:00:02.000Z', rows: 0 },
  ]);
  assert.equal(accepted, 2);
  assert.equal(
    h.oracle.freshnessReads,
    reads + 1,
    'freshness re-read once per publish',
  );
  const updates = of(h.frames, 'source.updated');
  assert.equal(updates.length, 2);
  assert.deepEqual(
    updates.map(({ source, observedAt, rows, runAt }) => ({
      source,
      observedAt,
      rows,
      runAt,
    })),
    [
      {
        source: 'portwatch',
        observedAt: '2026-09-20',
        rows: 28,
        runAt: '2026-09-25T15:00:01.000Z',
      },
      {
        source: 'gdelt_news',
        observedAt: null,
        rows: 0,
        runAt: '2026-09-25T15:00:02.000Z',
      },
    ],
  );
  assert.equal(h.hub.stats().published, 2);
});

test('console down: offline after two failed probes, one page each way', async () => {
  const h = harness();
  h.hub.start();
  await h.settle();
  h.hub.addClient(h.client);
  h.oracle.consoleUp = false;
  await h.tick(20_000);
  assert.equal(
    of(h.frames, 'health').filter((frame) => frame.component === 'console')
      .length,
    0,
    'one failure is not an outage',
  );
  await h.tick(20_000);
  const down = of(h.frames, 'health').filter(
    (frame) => frame.component === 'console',
  );
  assert.deepEqual(
    down.map((frame) => frame.state),
    ['offline'],
  );
  await h.tick(20_000);
  assert.equal(h.oracle.pages.length, 1);
  assert.match(h.oracle.pages[0], /console is OFFLINE/);
  h.oracle.consoleUp = true;
  await h.tick(20_000);
  const all = of(h.frames, 'health').filter(
    (frame) => frame.component === 'console',
  );
  assert.deepEqual(
    all.map((frame) => frame.state),
    ['offline', 'live'],
  );
  assert.equal(h.oracle.pages.length, 2);
  assert.match(h.oracle.pages[1], /console recovered/);
});

test('a missed deadline turns a source stale; only critical sources page', async () => {
  const h = harness();
  h.hub.start();
  await h.settle();
  h.hub.addClient(h.client);
  await h.tick(4 * HOUR); // quotes: written 14:30, deadline 18:30; now 19:00
  const quotes = of(h.frames, 'health').filter(
    (frame) => frame.component === 'ingest:quotes',
  );
  assert.deepEqual(
    quotes.map((frame) => frame.state),
    ['stale'],
  );
  assert.equal(h.oracle.pages.length, 1);
  assert.match(h.oracle.pages[0], /source quotes is STALE/);
  // A new write moves the deadline and pages the recovery once.
  h.oracle.sources[0] = {
    ...h.oracle.sources[0],
    fetchedAt: '2026-09-25 19:00:00',
  };
  await h.tick(60_000);
  assert.equal(h.oracle.pages.length, 2);
  assert.match(h.oracle.pages[1], /source quotes recovered/);
  // A non-critical source past its deadline emits health but never pages.
  h.setNow(Date.parse('2026-10-11T00:00:00Z')); // portwatch deadline: 09-24 02:10 + 384 h
  await h.tick(0);
  const portwatch = of(h.frames, 'health').filter(
    (frame) => frame.component === 'ingest:portwatch',
  );
  assert.deepEqual(
    portwatch.map((frame) => frame.state),
    ['stale'],
  );
  assert.ok(h.oracle.pages.every((text) => !text.includes('portwatch')));
});

test('askd cannot relay its own outage: the page waits for its recovery', async () => {
  const h = harness();
  h.hub.start();
  await h.settle();
  h.oracle.askdUp = false;
  await h.tick(20_000);
  await h.tick(20_000);
  assert.equal(h.hub.stats().health.askd, 'offline');
  assert.equal(h.oracle.pages.length, 0);
  assert.equal(h.hub.stats().queuedPages, 1);
  h.oracle.askdUp = true;
  await h.tick(20_000);
  await h.settle();
  assert.equal(h.oracle.pages.length, 2);
  assert.match(h.oracle.pages[0], /askd is OFFLINE/);
  assert.match(h.oracle.pages[1], /askd recovered/);
});

test('a component first seen offline pages neither the outage nor its end', async () => {
  const h = harness();
  h.oracle.consoleUp = false;
  h.hub.start();
  await h.settle();
  assert.equal(h.hub.stats().health.console, 'offline');
  h.oracle.consoleUp = true;
  await h.tick(20_000);
  assert.equal(h.hub.stats().health.console, 'live');
  assert.deepEqual(h.oracle.pages, []);
});

test('pages are capped per hour', async () => {
  const h = harness({ pagesPerHour: 2 });
  h.hub.start();
  await h.settle();
  for (let index = 0; index < 3; index += 1) {
    h.oracle.consoleUp = false;
    await h.tick(20_000);
    await h.tick(20_000);
    h.oracle.consoleUp = true;
    await h.tick(20_000);
  }
  await h.settle();
  assert.equal(h.oracle.pages.length, 2);
  assert.ok(h.hub.stats().pagesDropped >= 1);
});
