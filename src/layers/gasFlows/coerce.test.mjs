import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatDesignAttributes,
  parseNumericField,
  repairMojibake,
  trimToNull,
} from './coerce.js';

test('parseNumericField never turns a blank into a zero', () => {
  // Number('') is 0. That is the trap: 29 of the 99 NACEI records carry the
  // empty string in Vol_MMcfd, and coercing them would invent 29
  // zero-capacity crossings out of absences.
  assert.equal(parseNumericField(''), null);
  assert.equal(parseNumericField('   '), null);
  assert.equal(parseNumericField(null), null);
  assert.equal(parseNumericField(undefined), null);
  // A real zero is still a zero.
  assert.equal(parseNumericField('0'), 0);
  assert.equal(parseNumericField(0), 0);
});

test('parseNumericField reads the plain numbers NACEI actually files', () => {
  assert.equal(parseNumericField('215.066'), 215.066);
  assert.equal(parseNumericField('57'), 57);
  assert.equal(parseNumericField(' 109.926 '), 109.926);
  assert.equal(parseNumericField('1,440'), 1440);
});

test('parseNumericField refuses a multi-pipe string rather than picking one', () => {
  // Measured values: a crossing with three pipes files "30/36/48", and one
  // with two identical pipes files "36(2)". A crossing with three diameters
  // has no one diameter, so there is no number to return.
  for (const value of [
    '24/36',
    '30/36/48',
    '12/24',
    '36(2)',
    '609/800',
    '1440/1740/1019',
  ]) {
    assert.equal(parseNumericField(value), null, `${value} should not coerce`);
  }
  assert.equal(parseNumericField('n/a'), null);
  assert.equal(parseNumericField('NaN'), null);
});

test('repairMojibake undoes a latin1 round trip and keeps the original', () => {
  const broken = 'Sempra Gasoductos MÃ©xico';
  const result = repairMojibake(broken);
  assert.equal(result.text, 'Sempra Gasoductos México');
  assert.equal(result.raw, broken);
  assert.equal(result.repaired, true);
});

test('repairMojibake leaves a correctly encoded string alone', () => {
  // Measured 2026-09-18: 0 of 99 records arrive mojibaked on the f=json route,
  // so on that route this is a no-op. It stays because a different route or a
  // re-host can reintroduce the fault, and a silent repair is worse than none.
  for (const clean of [
    'Compañía Nacional de Gas',
    'NEB/ONÉ',
    'Argüelles pipeline',
    'El Paso Natural Gas Pipeline',
  ]) {
    const result = repairMojibake(clean);
    assert.equal(result.text, clean);
    assert.equal(result.repaired, false);
  }
});

test('repairMojibake returns the original when the reinterpretation is not valid utf-8', () => {
  // A failed repair must look like no repair, never like a different name.
  const notActuallyMojibake = 'Ã';
  const result = repairMojibake(notActuallyMojibake);
  assert.equal(result.raw, notActuallyMojibake);
  assert.equal(typeof result.text, 'string');
  assert.ok(result.text.length > 0);
});

test('trimToNull collapses an empty field to null', () => {
  assert.equal(trimToNull(''), null);
  assert.equal(trimToNull('  '), null);
  assert.equal(trimToNull(null), null);
  assert.equal(trimToNull(' Sonora '), 'Sonora');
});

test('formatDesignAttributes emits strings only, each carrying its own vintage', () => {
  const formatted = formatDesignAttributes({
    Diam_Inch: '20',
    MaxOP_psi: '1000',
    Vol_MMcfd: '215.066',
  });
  assert.deepEqual(formatted, {
    diameter: '20 in design (2017)',
    maxPressure: '1000 psi design (2017)',
    capacity: '215.066 MMcf/d design (2017)',
  });
  // Every value is a string, and the vintage is inside the string rather than
  // beside it, so a bare capacity figure cannot be produced by dropping a label.
  for (const value of Object.values(formatted)) {
    assert.equal(typeof value, 'string');
    assert.match(value, /design \(2017\)$/);
  }
});

test('formatDesignAttributes demotes NumPipes too, and reads 0 as not filed', () => {
  // Pipe count is the fourth 2017 magnitude and correlates with crossing size.
  // Left as a number it would be the one variable a renderer could bind a
  // plausible-looking, eight-year-stale size to.
  assert.equal(
    formatDesignAttributes({ NumPipes: 1 }).pipes,
    '1 pipe filed (2017)',
  );
  assert.equal(
    formatDesignAttributes({ NumPipes: 3 }).pipes,
    '3 pipes filed (2017)',
  );
  // Every US-filed record carries 0, which means "not filed", not "no pipes".
  assert.equal(formatDesignAttributes({ NumPipes: 0 }).pipes, undefined);
  assert.equal(formatDesignAttributes({ NumPipes: null }).pipes, undefined);
});

test('formatDesignAttributes omits a blank field instead of emitting a zero', () => {
  assert.deepEqual(
    formatDesignAttributes({ Diam_Inch: '', MaxOP_psi: '', Vol_MMcfd: '' }),
    {},
  );
  assert.deepEqual(formatDesignAttributes({}), {});
  const partial = formatDesignAttributes({
    Diam_Inch: '24/36',
    MaxOP_psi: '',
    Vol_MMcfd: '140',
  });
  assert.deepEqual(partial, {
    diameter: '24/36 in design (2017)',
    capacity: '140 MMcf/d design (2017)',
  });
});
