'use strict';

/**
 * Kleiner ZIP-Entpacker ohne externe Pakete.
 *
 * Liest das zentrale Verzeichnis am Dateiende und streamt jeden Eintrag
 * einzeln durch zlib - so bleibt der Speicherbedarf auch bei mehreren
 * Gigabyte klein. Unterstützt werden "gespeichert" (0) und "deflate" (8).
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const ZIP64_MARKER = 0xffffffff;

class ZipError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ZipError';
  }
}

/** Sucht das "End of Central Directory" am Dateiende. */
function readEndRecord(fd, fileSize) {
  const maxComment = 0xffff;
  const length = Math.min(fileSize, maxComment + 22);
  const buffer = Buffer.alloc(length);
  fs.readSync(fd, buffer, 0, length, fileSize - length);

  for (let i = buffer.length - 22; i >= 0; i--) {
    if (buffer.readUInt32LE(i) === EOCD_SIGNATURE) {
      const entries = buffer.readUInt16LE(i + 10);
      const size = buffer.readUInt32LE(i + 12);
      const offset = buffer.readUInt32LE(i + 16);
      if (offset === ZIP64_MARKER || entries === 0xffff) {
        throw new ZipError('Zip64-Archive werden nicht unterstützt.');
      }
      return { entries, size, offset };
    }
  }
  throw new ZipError('Keine gültige ZIP-Datei (Ende nicht gefunden).');
}

/** Liest alle Einträge aus dem zentralen Verzeichnis. */
function readCentralDirectory(fd, end) {
  const buffer = Buffer.alloc(end.size);
  fs.readSync(fd, buffer, 0, end.size, end.offset);

  const entries = [];
  let pos = 0;
  for (let i = 0; i < end.entries; i++) {
    if (pos + 46 > buffer.length || buffer.readUInt32LE(pos) !== CENTRAL_SIGNATURE) {
      throw new ZipError('Das ZIP-Verzeichnis ist beschädigt.');
    }
    const versionMade = buffer.readUInt16LE(pos + 4);
    const method = buffer.readUInt16LE(pos + 10);
    const compressedSize = buffer.readUInt32LE(pos + 20);
    const uncompressedSize = buffer.readUInt32LE(pos + 24);
    const nameLength = buffer.readUInt16LE(pos + 28);
    const extraLength = buffer.readUInt16LE(pos + 30);
    const commentLength = buffer.readUInt16LE(pos + 32);
    const externalAttrs = buffer.readUInt32LE(pos + 38);
    const localOffset = buffer.readUInt32LE(pos + 42);
    const name = buffer.toString('utf8', pos + 46, pos + 46 + nameLength);

    if (compressedSize === ZIP64_MARKER || uncompressedSize === ZIP64_MARKER) {
      throw new ZipError('Zip64-Archive werden nicht unterstützt.');
    }

    entries.push({
      name,
      method,
      compressedSize,
      uncompressedSize,
      localOffset,
      // Unix-Rechte stecken in den oberen 16 Bit (nur wenn unter Unix gepackt).
      mode: (versionMade >> 8) === 3 ? (externalAttrs >>> 16) & 0o777 : 0,
      isDirectory: name.endsWith('/'),
    });

    pos += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

/** Wo im Archiv beginnen die eigentlichen Daten eines Eintrags? */
function readDataOffset(fd, entry) {
  const header = Buffer.alloc(30);
  fs.readSync(fd, header, 0, 30, entry.localOffset);
  if (header.readUInt32LE(0) !== LOCAL_SIGNATURE) {
    throw new ZipError(`Beschädigter Eintrag: ${entry.name}`);
  }
  const nameLength = header.readUInt16LE(26);
  const extraLength = header.readUInt16LE(28);
  return entry.localOffset + 30 + nameLength + extraLength;
}

/** Verhindert, dass Einträge aus dem Zielordner ausbrechen ("zip slip"). */
function safeTarget(targetDir, name) {
  const clean = name.replace(/\\/g, '/').replace(/^\/+/, '');
  if (!clean || clean.split('/').includes('..')) return null;
  const abs = path.resolve(targetDir, ...clean.split('/'));
  const root = path.resolve(targetDir);
  if (abs !== root && !abs.startsWith(root + path.sep)) return null;
  return abs;
}

function extractOne(zipPath, entry, dataOffset, target) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(target), { recursive: true });

    if (entry.compressedSize === 0 && entry.uncompressedSize === 0) {
      fs.writeFileSync(target, '');
      resolve();
      return;
    }

    const read = fs.createReadStream(zipPath, {
      start: dataOffset,
      end: dataOffset + entry.compressedSize - 1,
    });
    const write = fs.createWriteStream(target);

    const done = (err) => (err ? reject(err) : resolve());
    write.on('error', done);
    read.on('error', done);
    write.on('finish', () => done());

    if (entry.method === 0) {
      read.pipe(write);
    } else if (entry.method === 8) {
      const inflate = zlib.createInflateRaw();
      inflate.on('error', done);
      read.pipe(inflate).pipe(write);
    } else {
      done(new ZipError(`Nicht unterstützte Komprimierung (${entry.method}) bei ${entry.name}`));
    }
  });
}

/**
 * Entpackt ein Archiv nach targetDir.
 * @param {(p: {done:number, total:number, percent:number, file:string}) => void} onProgress
 */
async function extract(zipPath, targetDir, onProgress = () => {}) {
  const fd = fs.openSync(zipPath, 'r');
  try {
    const fileSize = fs.fstatSync(fd).size;
    const end = readEndRecord(fd, fileSize);
    const entries = readCentralDirectory(fd, end);

    const total = entries.reduce((sum, e) => sum + (e.isDirectory ? 0 : e.uncompressedSize), 0);
    let done = 0;
    let files = 0;

    for (const entry of entries) {
      const target = safeTarget(targetDir, entry.name);
      if (!target) continue; // verdächtige Pfade überspringen

      if (entry.isDirectory) {
        fs.mkdirSync(target, { recursive: true });
        continue;
      }

      const dataOffset = readDataOffset(fd, entry);
      await extractOne(zipPath, entry, dataOffset, target);
      if (entry.mode) {
        try {
          fs.chmodSync(target, entry.mode);
        } catch {
          /* unter Windows nicht nötig */
        }
      }

      files++;
      done += entry.uncompressedSize;
      onProgress({
        done,
        total,
        percent: total ? Math.min(100, Math.round((done / total) * 100)) : 100,
        file: entry.name,
      });
    }

    return { files, bytes: total };
  } finally {
    fs.closeSync(fd);
  }
}

module.exports = { ZipError, extract };
