#!/usr/bin/env node
'use strict';

/**
 * Erzeugt build/icon.png (512x512) für electron-builder und das Fenster.
 * Bewusst ohne externe Abhängigkeiten: PNG wird hier direkt geschrieben.
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SIZE = 512;
const RADIUS = 112;

const BUILD_DIR = path.join(__dirname, '..', 'build');
const OUT = path.join(BUILD_DIR, 'icon.png');

/* ------------------------------ Hilfsmathe ------------------------------ */

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;

function mixColor(c1, c2, t) {
  return [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];
}

/** Abstand eines Punktes zu einer Strecke. */
function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? clamp(((px - x1) * dx + (py - y1) * dy) / len2) : 0;
  const cx = x1 + t * dx;
  const cy = y1 + t * dy;
  return Math.hypot(px - cx, py - cy);
}

/** Abstand zum Rand eines abgerundeten Quadrats (negativ = innen). */
function roundedBoxDistance(px, py, size, radius) {
  const half = size / 2;
  const qx = Math.abs(px - half) - (half - radius);
  const qy = Math.abs(py - half) - (half - radius);
  const ax = Math.max(qx, 0);
  const ay = Math.max(qy, 0);
  return Math.hypot(ax, ay) + Math.min(Math.max(qx, qy), 0) - radius;
}

const smoothCoverage = (dist) => clamp(0.5 - dist, 0, 1);

/* -------------------------------- Zeichnen ------------------------------- */

function renderPixels() {
  const violet = [139, 92, 246];
  const indigo = [99, 102, 241];
  const cyan = [34, 211, 238];

  const strokeW = SIZE * 0.105;
  const vLeft = [SIZE * 0.3, SIZE * 0.31];
  const vRight = [SIZE * 0.7, SIZE * 0.31];
  const vBottom = [SIZE * 0.5, SIZE * 0.72];

  const data = Buffer.alloc(SIZE * SIZE * 4);

  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const i = (y * SIZE + x) * 4;

      // Diagonaler Verlauf violett -> indigo -> cyan
      const t = clamp((x / SIZE) * 0.55 + (y / SIZE) * 0.45);
      const base = t < 0.5 ? mixColor(violet, indigo, t * 2) : mixColor(indigo, cyan, (t - 0.5) * 2);

      // Leichter Glanz oben links, dunklere Ecken unten rechts
      const glow = 1 + 0.18 * clamp(1 - Math.hypot(x - SIZE * 0.28, y - SIZE * 0.2) / (SIZE * 0.75));
      const shade = 1 - 0.22 * clamp(Math.hypot(x - SIZE * 0.85, y - SIZE * 0.9) / (SIZE * 0.9));

      let r = base[0] * glow * shade;
      let g = base[1] * glow * shade;
      let b = base[2] * glow * shade;

      // Das "V" in Weiss
      const dV = Math.min(
        distToSegment(x, y, vLeft[0], vLeft[1], vBottom[0], vBottom[1]),
        distToSegment(x, y, vRight[0], vRight[1], vBottom[0], vBottom[1])
      );
      const vCoverage = smoothCoverage(dV - strokeW / 2);
      if (vCoverage > 0) {
        r = lerp(r, 255, vCoverage);
        g = lerp(g, 255, vCoverage);
        b = lerp(b, 255, vCoverage);
      }

      // Abgerundete Ecken -> Alpha
      const alpha = smoothCoverage(roundedBoxDistance(x, y, SIZE, RADIUS)) * 255;

      data[i] = Math.round(clamp(r, 0, 255));
      data[i + 1] = Math.round(clamp(g, 0, 255));
      data[i + 2] = Math.round(clamp(b, 0, 255));
      data[i + 3] = Math.round(alpha);
    }
  }
  return data;
}

/* --------------------------------- PNG ---------------------------------- */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(pixels, size) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  // Jede Zeile bekommt ein Filter-Byte (0 = keine Filterung).
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    const rowStart = y * (size * 4 + 1);
    raw[rowStart] = 0;
    pixels.copy(raw, rowStart + 1, y * size * 4, (y + 1) * size * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* --------------------------------- Main --------------------------------- */

function main() {
  fs.mkdirSync(BUILD_DIR, { recursive: true });
  fs.writeFileSync(OUT, encodePng(renderPixels(), SIZE));
  console.log(`[icon] ${path.relative(process.cwd(), OUT)} (${SIZE}x${SIZE}) erzeugt.`);
}

main();
