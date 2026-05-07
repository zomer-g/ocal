/**
 * Produces a clean Chrome Web Store submission zip from extension/dist.
 *
 * Excludes:
 *   - .map source maps (CWS doesn't need them, just bloat)
 *   - .DS_Store, Thumbs.db, .gitkeep junk
 *
 * Output: extension/ocal-extension-v<version>.zip
 *
 * Run: `npm run zip` (which runs build first, then this).
 */
import { readFile, writeFile, readdir, stat, mkdir } from 'node:fs/promises';
import { resolve, dirname, relative, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateRawSync, crc32 } from 'node:zlib';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = resolve(__dirname, 'dist');
const outDir = __dirname;

const EXCLUDE_EXT = new Set(['.map']);
const EXCLUDE_NAMES = new Set(['.DS_Store', 'Thumbs.db', '.gitkeep']);

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const out = [];
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      out.push(...(await walk(full)));
    } else if (e.isFile()) {
      const ext = e.name.slice(e.name.lastIndexOf('.'));
      if (EXCLUDE_EXT.has(ext)) continue;
      if (EXCLUDE_NAMES.has(e.name)) continue;
      out.push(full);
    }
  }
  return out;
}

// Minimal ZIP writer (store + deflate, no encryption, ZIP64 not needed for tiny extension)
function buildZip(entries) {
  const localBuffers = [];
  const centralBuffers = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, 'utf8');
    const uncompressed = entry.data;
    const compressed = deflateRawSync(uncompressed);
    const useDeflate = compressed.length < uncompressed.length;
    const data = useDeflate ? compressed : uncompressed;
    const method = useDeflate ? 8 : 0;
    const crc = crc32(uncompressed) >>> 0;

    // Local file header
    const local = Buffer.alloc(30 + nameBuf.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);                 // version needed
    local.writeUInt16LE(0x0800, 6);             // gp flag (UTF-8)
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(0, 10);                 // mod time
    local.writeUInt16LE(0x21, 12);              // mod date (arbitrary valid: 2016-01-01)
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);       // compressed
    local.writeUInt32LE(uncompressed.length, 22); // uncompressed
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);                 // extra
    nameBuf.copy(local, 30);
    localBuffers.push(local, data);

    // Central directory header
    const central = Buffer.alloc(46 + nameBuf.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);               // version made by
    central.writeUInt16LE(20, 6);               // version needed
    central.writeUInt16LE(0x0800, 8);           // gp flag (UTF-8)
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(0, 12);               // mod time
    central.writeUInt16LE(0x21, 14);            // mod date
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(uncompressed.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30);               // extra
    central.writeUInt16LE(0, 32);               // comment
    central.writeUInt16LE(0, 34);               // disk
    central.writeUInt16LE(0, 36);               // internal attrs
    central.writeUInt32LE(0, 38);               // external attrs
    central.writeUInt32LE(offset, 42);
    nameBuf.copy(central, 46);
    centralBuffers.push(central);

    offset += local.length + data.length;
  }

  const centralStart = offset;
  const centralData = Buffer.concat(centralBuffers);
  const centralSize = centralData.length;

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);                     // disk
  eocd.writeUInt16LE(0, 6);                     // start disk
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralSize, 12);
  eocd.writeUInt32LE(centralStart, 16);
  eocd.writeUInt16LE(0, 20);                    // comment

  return Buffer.concat([...localBuffers, centralData, eocd]);
}

async function main() {
  const manifestPath = resolve(distDir, 'manifest.json');
  const manifestText = await readFile(manifestPath, 'utf8');
  const manifest = JSON.parse(manifestText);
  const version = manifest.version ?? '0.0.0';

  const files = (await walk(distDir)).sort();
  const entries = await Promise.all(
    files.map(async (f) => ({
      name: relative(distDir, f).split(sep).join('/'),
      data: await readFile(f),
    })),
  );

  const zip = buildZip(entries);
  const outPath = resolve(outDir, `ocal-extension-v${version}.zip`);
  await mkdir(outDir, { recursive: true });
  await writeFile(outPath, zip);

  const totalSize = entries.reduce((s, e) => s + e.data.length, 0);
  console.log(`[ocal-ext] zip → ${outPath}`);
  console.log(`[ocal-ext] ${entries.length} files, ${(totalSize / 1024).toFixed(1)} KB raw → ${(zip.length / 1024).toFixed(1)} KB compressed`);
  console.log('[ocal-ext] entries:');
  for (const e of entries) console.log(`           ${e.name}  (${e.data.length} B)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
