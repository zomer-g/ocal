import { writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync, crc32 } from 'node:zlib';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(__dirname, 'public', 'icons');

// Ocal brand color
const BG = [37, 99, 235];      // #2563eb
const FG = [255, 255, 255];    // white

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])) >>> 0, 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

/**
 * Render an "O" ring on solid background with a tiny center dot.
 * Anti-aliased via simple alpha blending on the edges.
 */
function makePng(size) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 2;   // color type: RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const cx = size / 2 - 0.5;
  const cy = size / 2 - 0.5;
  const ringOuter = size * 0.42;
  const ringInner = size * 0.28;
  const dotRadius = Math.max(0.5, size * 0.05);

  // For tiny sizes (16), drop the center dot — it just looks like noise.
  const showDot = size >= 32;

  const raw = Buffer.alloc(size * (1 + size * 3));

  for (let y = 0; y < size; y++) {
    raw[y * (1 + size * 3)] = 0; // filter byte
    for (let x = 0; x < size; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // alpha: 1 = white (fg), 0 = blue (bg)
      let a = 0;

      // Ring band: AA at both edges
      const bandHalf = (ringOuter - ringInner) / 2;
      const bandCenter = (ringOuter + ringInner) / 2;
      const bandDist = Math.abs(dist - bandCenter);
      if (bandDist < bandHalf + 0.5) {
        a = Math.max(a, Math.min(1, bandHalf + 0.5 - bandDist));
      }

      // Center dot
      if (showDot) {
        const dotDist = dist - dotRadius;
        if (dotDist < 0.5) {
          a = Math.max(a, Math.min(1, 0.5 - dotDist));
        }
      }

      const r = Math.round(BG[0] * (1 - a) + FG[0] * a);
      const g = Math.round(BG[1] * (1 - a) + FG[1] * a);
      const b = Math.round(BG[2] * (1 - a) + FG[2] * a);

      const idx = y * (1 + size * 3) + 1 + x * 3;
      raw[idx + 0] = r;
      raw[idx + 1] = g;
      raw[idx + 2] = b;
    }
  }

  const idat = deflateSync(raw);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

await mkdir(outDir, { recursive: true });
for (const size of [16, 32, 48, 128]) {
  await writeFile(resolve(outDir, `${size}.png`), makePng(size));
}
console.log('[ocal-ext] icons written →', outDir);
