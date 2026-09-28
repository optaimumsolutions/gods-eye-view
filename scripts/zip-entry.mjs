/**
 * Read one entry out of a zip file as a stream, without a dependency and
 * without inflating the whole archive into memory. BSEE's production bulk
 * file is a 20 MB zip around a 218 MB text file, which is why this exists:
 * the build walks that text line by line and never holds it whole.
 *
 * Supported: a single-disk zip whose entries are stored or deflated. Zip64
 * (entries or offsets past 4 GB, the zip64 end-of-central-directory record)
 * is read as well: the Texas RRC production dump is a 3.8 GB zip around
 * tables of 25 GB and more (row 14 M3). Anything else throws by name rather
 * than producing a short read.
 */

import {
  createReadStream,
  openSync,
  readSync,
  closeSync,
  statSync,
} from 'node:fs';
import { createInflateRaw } from 'node:zlib';

const EOCD_SIGNATURE = 0x06054b50;
const ZIP64_EOCD_SIGNATURE = 0x06064b50;
const ZIP64_LOCATOR_SIGNATURE = 0x07064b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const ZIP64_MARKER = 0xffffffff;
const ZIP64_COUNT_MARKER = 0xffff;
const ZIP64_EXTRA_ID = 0x0001;

function uint64(buffer, at) {
  const value = buffer.readBigUInt64LE(at);
  if (value > BigInt(Number.MAX_SAFE_INTEGER))
    throw new Error(`zip64 value ${value} is past 2^53`);
  return Number(value);
}

/**
 * The zip64 extended-information extra field replaces, in this order, each
 * of the uncompressed size, compressed size and local header offset whose
 * 32-bit slot holds the 0xFFFFFFFF marker.
 */
function applyZip64Extra(extra, fields, name) {
  const wanted = ['size', 'compressedSize', 'localOffset'].filter(
    (key) => fields[key] === ZIP64_MARKER,
  );
  if (!wanted.length) return fields;
  for (let at = 0; at + 4 <= extra.length;) {
    const id = extra.readUInt16LE(at);
    const length = extra.readUInt16LE(at + 2);
    if (id === ZIP64_EXTRA_ID) {
      if (length < wanted.length * 8)
        throw new Error(`entry ${name}: zip64 extra field is short`);
      const out = { ...fields };
      wanted.forEach((key, i) => {
        out[key] = uint64(extra, at + 4 + i * 8);
      });
      return out;
    }
    at += 4 + length;
  }
  throw new Error(`entry ${name}: 4 GB marker without a zip64 extra field`);
}

function readBytes(fd, position, length) {
  const buffer = Buffer.alloc(length);
  let done = 0;
  while (done < length) {
    const n = readSync(fd, buffer, done, length - done, position + done);
    if (n === 0) break;
    done += n;
  }
  return buffer.subarray(0, done);
}

/** The central directory: name → { method, compressedSize, size, localOffset }. */
export function listZipEntries(path) {
  const fd = openSync(path, 'r');
  try {
    const { size: fileSize } = statSync(path);
    // The end-of-central-directory record sits in the last 22 + 65,535 bytes.
    const tailLength = Math.min(fileSize, 22 + 65_535);
    const tail = readBytes(fd, fileSize - tailLength, tailLength);
    let eocd = -1;
    for (let i = tail.length - 22; i >= 0; i -= 1) {
      if (tail.readUInt32LE(i) === EOCD_SIGNATURE) {
        eocd = i;
        break;
      }
    }
    if (eocd < 0)
      throw new Error(`${path}: no end-of-central-directory record`);
    let entryCount = tail.readUInt16LE(eocd + 10);
    let directorySize = tail.readUInt32LE(eocd + 12);
    let directoryOffset = tail.readUInt32LE(eocd + 16);
    if (
      entryCount === ZIP64_COUNT_MARKER ||
      directorySize === ZIP64_MARKER ||
      directoryOffset === ZIP64_MARKER
    ) {
      // The zip64 locator sits just before the classic record and points at
      // the zip64 end-of-central-directory record.
      const locatorAt = eocd - 20;
      if (
        locatorAt < 0 ||
        tail.readUInt32LE(locatorAt) !== ZIP64_LOCATOR_SIGNATURE
      )
        throw new Error(`${path}: zip64 markers without a zip64 locator`);
      const recordOffset = uint64(tail, locatorAt + 8);
      const record = readBytes(fd, recordOffset, 56);
      if (record.readUInt32LE(0) !== ZIP64_EOCD_SIGNATURE)
        throw new Error(`${path}: zip64 end-of-central-directory is malformed`);
      entryCount = uint64(record, 32);
      directorySize = uint64(record, 40);
      directoryOffset = uint64(record, 48);
    }
    const directory = readBytes(fd, directoryOffset, directorySize);
    const entries = new Map();
    let cursor = 0;
    for (let i = 0; i < entryCount; i += 1) {
      if (directory.readUInt32LE(cursor) !== CENTRAL_SIGNATURE) {
        throw new Error(`${path}: central directory entry ${i} is malformed`);
      }
      const method = directory.readUInt16LE(cursor + 10);
      const nameLength = directory.readUInt16LE(cursor + 28);
      const extraLength = directory.readUInt16LE(cursor + 30);
      const commentLength = directory.readUInt16LE(cursor + 32);
      const name = directory
        .subarray(cursor + 46, cursor + 46 + nameLength)
        .toString('utf8');
      const extraStart = cursor + 46 + nameLength;
      const { compressedSize, size, localOffset } = applyZip64Extra(
        directory.subarray(extraStart, extraStart + extraLength),
        {
          compressedSize: directory.readUInt32LE(cursor + 20),
          size: directory.readUInt32LE(cursor + 24),
          localOffset: directory.readUInt32LE(cursor + 42),
        },
        name,
      );
      entries.set(name, { name, method, compressedSize, size, localOffset });
      cursor += 46 + nameLength + extraLength + commentLength;
    }
    return entries;
  } finally {
    closeSync(fd);
  }
}

/**
 * A readable stream of one entry's uncompressed bytes.
 *
 * The local header repeats the name and extra fields with its own lengths,
 * which can differ from the central directory's, so the data offset is read
 * from the local header rather than assumed.
 */
export function openZipEntry(path, name) {
  const entries = listZipEntries(path);
  const entry = entries.get(name);
  if (!entry) {
    throw new Error(
      `${path}: no entry ${name}; archive holds ${[...entries.keys()].join(', ')}`,
    );
  }
  const fd = openSync(path, 'r');
  let dataStart;
  try {
    const local = readBytes(fd, entry.localOffset, 30);
    if (local.readUInt32LE(0) !== LOCAL_SIGNATURE) {
      throw new Error(`${path}: local header for ${name} is malformed`);
    }
    const nameLength = local.readUInt16LE(26);
    const extraLength = local.readUInt16LE(28);
    dataStart = entry.localOffset + 30 + nameLength + extraLength;
  } finally {
    closeSync(fd);
  }
  const raw = createReadStream(path, {
    start: dataStart,
    end: dataStart + entry.compressedSize - 1,
  });
  if (entry.method === 0) return raw;
  if (entry.method === 8) return raw.pipe(createInflateRaw());
  throw new Error(
    `${path}: entry ${name} uses compression method ${entry.method}`,
  );
}
