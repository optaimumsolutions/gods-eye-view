/**
 * Read one entry out of a zip file as a stream, without a dependency and
 * without inflating the whole archive into memory. BSEE's production bulk
 * file is a 20 MB zip around a 218 MB text file, which is why this exists:
 * the build walks that text line by line and never holds it whole.
 *
 * Only what the BSEE archives use is supported — a single-disk zip whose
 * entries are stored or deflated and smaller than 4 GB. Anything else throws
 * by name rather than producing a short read.
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
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const ZIP64_MARKER = 0xffffffff;

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
    const entryCount = tail.readUInt16LE(eocd + 10);
    const directorySize = tail.readUInt32LE(eocd + 12);
    const directoryOffset = tail.readUInt32LE(eocd + 16);
    if (directoryOffset === ZIP64_MARKER || directorySize === ZIP64_MARKER) {
      throw new Error(`${path}: zip64 archives are not supported`);
    }
    const directory = readBytes(fd, directoryOffset, directorySize);
    const entries = new Map();
    let cursor = 0;
    for (let i = 0; i < entryCount; i += 1) {
      if (directory.readUInt32LE(cursor) !== CENTRAL_SIGNATURE) {
        throw new Error(`${path}: central directory entry ${i} is malformed`);
      }
      const method = directory.readUInt16LE(cursor + 10);
      const compressedSize = directory.readUInt32LE(cursor + 20);
      const size = directory.readUInt32LE(cursor + 24);
      const nameLength = directory.readUInt16LE(cursor + 28);
      const extraLength = directory.readUInt16LE(cursor + 30);
      const commentLength = directory.readUInt16LE(cursor + 32);
      const localOffset = directory.readUInt32LE(cursor + 42);
      const name = directory
        .subarray(cursor + 46, cursor + 46 + nameLength)
        .toString('utf8');
      if (
        compressedSize === ZIP64_MARKER ||
        size === ZIP64_MARKER ||
        localOffset === ZIP64_MARKER
      ) {
        throw new Error(`${path}: entry ${name} needs zip64, unsupported`);
      }
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
