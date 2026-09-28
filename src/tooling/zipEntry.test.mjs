import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { deflateRawSync } from 'node:zlib';

import { listZipEntries, openZipEntry } from '../../scripts/zip-entry.mjs';

/**
 * A minimal zip writer for the fixtures: one local header + data per entry,
 * the central directory, and either the classic end record or (zip64) every
 * size and offset moved into zip64 extra fields and the zip64 end records,
 * as a writer does past 4 GB.
 */
function buildZip(files, { zip64 = false } = {}) {
  const parts = [];
  const central = [];
  let offset = 0;
  for (const { name, text, method } of files) {
    const raw = Buffer.from(text, 'utf8');
    const data = method === 8 ? deflateRawSync(raw) : raw;
    const nameBytes = Buffer.from(name, 'utf8');
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(zip64 ? 0xffffffff : data.length, 18);
    local.writeUInt32LE(zip64 ? 0xffffffff : raw.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    parts.push(local, nameBytes, data);
    const extra = Buffer.alloc(zip64 ? 28 : 0);
    if (zip64) {
      extra.writeUInt16LE(0x0001, 0);
      extra.writeUInt16LE(24, 2);
      extra.writeBigUInt64LE(BigInt(raw.length), 4);
      extra.writeBigUInt64LE(BigInt(data.length), 12);
      extra.writeBigUInt64LE(BigInt(offset), 20);
    }
    const header = Buffer.alloc(46);
    header.writeUInt32LE(0x02014b50, 0);
    header.writeUInt16LE(method, 10);
    header.writeUInt32LE(zip64 ? 0xffffffff : data.length, 20);
    header.writeUInt32LE(zip64 ? 0xffffffff : raw.length, 24);
    header.writeUInt16LE(nameBytes.length, 28);
    header.writeUInt16LE(extra.length, 30);
    header.writeUInt32LE(zip64 ? 0xffffffff : offset, 42);
    central.push(header, nameBytes, extra);
    offset += local.length + nameBytes.length + data.length;
  }
  const directory = Buffer.concat(central);
  const tail = [];
  if (zip64) {
    const record = Buffer.alloc(56);
    record.writeUInt32LE(0x06064b50, 0);
    record.writeBigUInt64LE(44n, 4);
    record.writeBigUInt64LE(BigInt(files.length), 24);
    record.writeBigUInt64LE(BigInt(files.length), 32);
    record.writeBigUInt64LE(BigInt(directory.length), 40);
    record.writeBigUInt64LE(BigInt(offset), 48);
    const locator = Buffer.alloc(20);
    locator.writeUInt32LE(0x07064b50, 0);
    locator.writeBigUInt64LE(BigInt(offset + directory.length), 8);
    locator.writeUInt32LE(1, 16);
    tail.push(record, locator);
  }
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(zip64 ? 0xffff : files.length, 8);
  end.writeUInt16LE(zip64 ? 0xffff : files.length, 10);
  end.writeUInt32LE(zip64 ? 0xffffffff : directory.length, 12);
  end.writeUInt32LE(zip64 ? 0xffffffff : offset, 16);
  return Buffer.concat([...parts, directory, ...tail, end]);
}

async function readAll(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

const FILES = [
  { name: 'a.dsv', text: 'A}B\n1}2\n', method: 0 },
  { name: 'dir/b.dsv', text: 'X}Y\n'.repeat(500), method: 8 },
];

for (const zip64 of [false, true]) {
  test(`reads stored and deflated entries (${zip64 ? 'zip64' : 'classic'} records)`, async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'zip-entry-'));
    try {
      const file = path.join(dir, 'fixture.zip');
      writeFileSync(file, buildZip(FILES, { zip64 }));
      const entries = listZipEntries(file);
      assert.deepEqual([...entries.keys()], ['a.dsv', 'dir/b.dsv']);
      assert.equal(entries.get('dir/b.dsv').size, 2000);
      assert.equal(await readAll(openZipEntry(file, 'a.dsv')), FILES[0].text);
      assert.equal(
        await readAll(openZipEntry(file, 'dir/b.dsv')),
        FILES[1].text,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}

test('a 4 GB marker without its zip64 extra field fails by name', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'zip-entry-'));
  try {
    const bytes = buildZip([FILES[0]]);
    // Mark the central entry's size as zip64 without adding the extra field.
    const at = bytes.lastIndexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    bytes.writeUInt32LE(0xffffffff, at + 24);
    const file = path.join(dir, 'broken.zip');
    writeFileSync(file, bytes);
    assert.throws(() => listZipEntries(file), /without a zip64 extra field/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
