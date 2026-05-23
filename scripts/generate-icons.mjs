// Generate favicons + PWA icons from a single source SVG.
//
//   node scripts/generate-icons.mjs <source.svg> [outDir] [--bg "#fff"] [--color "#hex"]
//   pnpm icons <source.svg> [outDir]
//
// Defaults: outDir = apps/web/static, bg = #ffffff (behind opaque/maskable icons),
// color = unchanged. Pass --color to substitute `currentColor` in the source.
//
// Writes: favicon.ico (16/32/48), favicon.svg, apple-touch-icon.png (180),
// web-app-manifest-192x192.png + web-app-manifest-512x512.png (maskable).
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { Resvg } from '@resvg/resvg-js';
import pngToIco from 'png-to-ico';

// --- args -------------------------------------------------------------------
const argv = process.argv.slice(2);
const positionals = [];
const opts = {};
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith('--')) opts[a.slice(2)] = argv[++i];
  else positionals.push(a);
}
const src = positionals[0];
if (!src) {
  console.error(
    'Usage: node scripts/generate-icons.mjs <source.svg> [outDir] [--bg "#fff"] [--color "#hex"]',
  );
  process.exit(1);
}
const outDir = positionals[1] ?? 'apps/web/static';
const bg = opts.bg ?? '#ffffff';
const color = opts.color;

// --- load + normalize source ------------------------------------------------
let source = await readFile(src, 'utf8');
if (color) source = source.replaceAll('currentColor', color);
const inner = source
  .replace(/<\?xml[\s\S]*?\?>/g, '')
  .replace(/<!DOCTYPE[\s\S]*?>/gi, '')
  .trim();

// Nest the source <svg> inside a square canvas at `pad` ratio inset. Its own
// viewBox + default preserveAspectRatio center it without distortion. `background`
// is optional (transparent when omitted).
function square(size, padRatio, background) {
  const box = Math.round(size * (1 - padRatio * 2));
  const off = Math.round((size - box) / 2);
  const openTag = inner.match(/<svg\b[^>]*>/i)?.[0] ?? '<svg>';
  const positionedTag = openTag
    .replace(/\swidth=("[^"]*"|'[^']*')/i, '')
    .replace(/\sheight=("[^"]*"|'[^']*')/i, '')
    .replace(/<svg\b/i, `<svg x="${off}" y="${off}" width="${box}" height="${box}"`);
  const positioned = inner.replace(openTag, positionedTag);
  const rect = background ? `<rect width="${size}" height="${size}" fill="${background}"/>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${rect}${positioned}</svg>`;
}

function png(svg, size) {
  return Buffer.from(
    new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng(),
  );
}

// --- generate ---------------------------------------------------------------
await mkdir(outDir, { recursive: true });
const written = [];
async function emit(name, buf) {
  await writeFile(join(outDir, name), buf);
  written.push(`${name} (${buf.length.toLocaleString()} B)`);
}

// favicon.svg — the (color-applied) source, served as-is for crisp scaling.
await emit('favicon.svg', Buffer.from(color ? source : inner, 'utf8'));

// favicon.ico — transparent 16/32/48 packed into one .ico.
const icoSizes = [16, 32, 48].map((s) => png(square(s, 0, null), s));
await emit('favicon.ico', await pngToIco(icoSizes));

// apple-touch-icon — opaque bg (iOS dislikes transparency), small inset.
await emit('apple-touch-icon.png', png(square(180, 0.06, bg), 180));

// PWA maskable icons — opaque bg + 10% safe-zone inset on each side.
for (const size of [192, 512]) {
  await emit(`web-app-manifest-${size}x${size}.png`, png(square(size, 0.1, bg), size));
}

console.log(`Icons written to ${outDir}:\n  ${written.join('\n  ')}`);
