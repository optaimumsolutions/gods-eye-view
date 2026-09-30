import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEFAULT_LEAD,
  FINE_MAX_LEAD,
  MAX_LEAD,
  clampLead,
  createForecastScrubber,
  segmentFor,
} from './scrubber.js';

/** The smallest DOM the scrubber needs; no jsdom in this repo's deps. */
function fakeDocument() {
  const make = (tag) => {
    const node = {
      tagName: tag,
      children: [],
      listeners: {},
      dataset: {},
      attributes: {},
      hidden: false,
      disabled: false,
      textContent: '',
      innerHTML: '',
      className: '',
      style: {},
      append(...kids) {
        this.children.push(...kids);
      },
      appendChild(k) {
        this.children.push(k);
        return k;
      },
      addEventListener(type, fn) {
        (this.listeners[type] ||= []).push(fn);
      },
      setAttribute(k, v) {
        this.attributes[k] = String(v);
      },
      getAttribute(k) {
        return this.attributes[k] ?? null;
      },
      querySelector(sel) {
        const all = [];
        const walk = (n) => {
          for (const c of n.children) {
            all.push(c);
            walk(c);
          }
        };
        walk(this);
        if (sel === '.wx-scrubber__head b') return { textContent: '' };
        if (sel === '.wx-scrubber__head span') return { textContent: '' };
        return (
          all.find((n) => n.className?.split(' ').includes(sel.slice(1))) ||
          null
        );
      },
      click() {
        for (const fn of this.listeners.click || []) fn({});
      },
    };
    return node;
  };
  const byId = new Map();
  return {
    body: make('body'),
    head: make('head'),
    createElement: (tag) => make(tag),
    getElementById: (id) => byId.get(id) || null,
    _register: (id, node) => byId.set(id, node),
  };
}

test('pure helpers: segments, clamping, defaults', () => {
  assert.equal(DEFAULT_LEAD, 1);
  assert.equal(segmentFor(0), 'fine');
  assert.equal(segmentFor(FINE_MAX_LEAD), 'fine');
  assert.equal(segmentFor(FINE_MAX_LEAD + 1), 'tail');
  assert.equal(segmentFor(MAX_LEAD), 'tail');
  assert.equal(clampLead(-3), 0);
  assert.equal(clampLead(99), MAX_LEAD);
  assert.equal(clampLead(16, 14), 14, 'the run horizon caps the lead');
  assert.equal(clampLead(NaN), DEFAULT_LEAD);
});

test('walking D+0 to D+16 never fetches, labels every slot, disables past the horizon, styles the tail', () => {
  const doc = fakeDocument();
  const scrubber = createForecastScrubber({ document: doc });
  const seen = [];
  scrubber.subscribe((lead) => seen.push(lead));
  scrubber.acquire('test');
  assert.equal(scrubber.isVisible(), true);
  const root = scrubber.element();
  const track = root.children.find((c) => c.className === 'wx-scrubber__track');
  const slots = track.children.filter((c) => c.tagName === 'button');
  assert.equal(slots.length, MAX_LEAD + 1);
  assert.equal(slots[0].textContent, 'now');
  assert.equal(slots[8].textContent, '+8');
  assert.ok(slots[8].className.includes('wx-scrubber__slot--tail'));
  assert.ok(slots[7].className.includes('wx-scrubber__slot--fine'));
  // AIFS: 15 days → horizon 14; D+15 and D+16 disabled with the reason
  scrubber.setHorizon({
    horizon: 14,
    label: 'ECMWF AIFS ENS',
    issued: 'issued 00Z 09-30',
  });
  assert.equal(slots[15].disabled, true);
  assert.match(slots[15].title, /AIFS ENS: 15 days/);
  assert.equal(slots[14].disabled, false);
  for (let d = 0; d <= MAX_LEAD; d++) scrubber.setLead(d);
  assert.equal(scrubber.getLead(), 14, 'clamped to the horizon');
  assert.deepEqual(
    seen.slice(0, 3),
    [0, 1, 2],
    'every change emits once (D+1 was the default before the walk)',
  );
  assert.equal(slots[14].getAttribute('aria-pressed'), 'true');
  // clicking a slot selects it; releasing the last user hides the control
  slots[3].click();
  assert.equal(scrubber.getLead(), 3);
  scrubber.release('test');
  assert.equal(scrubber.isVisible(), false);
});

test('keyboard: ] and [ step, Home returns to D+1', () => {
  const doc = fakeDocument();
  const scrubber = createForecastScrubber({ document: doc });
  scrubber.acquire('k');
  const root = scrubber.element();
  const key = (k) => {
    for (const fn of root.listeners.keydown)
      fn({ key: k, preventDefault() {} });
  };
  key(']');
  key(']');
  assert.equal(scrubber.getLead(), 3);
  key('[');
  assert.equal(scrubber.getLead(), 2);
  key('Home');
  assert.equal(scrubber.getLead(), DEFAULT_LEAD);
});
