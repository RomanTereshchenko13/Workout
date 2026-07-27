/**
 * Генерує PNG-іконки застосунку без зовнішніх залежностей (Node + zlib).
 * Малюємо гантель: темний фон, помаранчевий гриф, дві «блини».
 *
 * Запуск:  node scripts/make-icons.mjs
 */

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'icons');
mkdirSync(OUT, { recursive: true });

const BG = [14, 17, 22];
const BG_EDGE = [24, 30, 39];
const ACCENT = [255, 107, 74];
const STEEL = [206, 214, 224];
const STEEL_DARK = [138, 148, 162];

/* ─────────── PNG-кодер ─────────── */

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePNG(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // truecolor + alpha
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ─────────── Малювання ─────────── */

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/**
 * @param {number} size
 * @param {boolean} maskable  повний фон без відступів (для Android-масок)
 */
function drawIcon(size, maskable) {
  const px = Buffer.alloc(size * size * 4);
  const S = size;
  // Для звичайної іконки лишаємо скруглення й трохи менший малюнок,
  // для maskable — фон на весь квадрат і малюнок у «безпечній зоні» 80%.
  const radius = maskable ? 0 : S * 0.22;
  const scale = maskable ? 0.62 : 0.78;

  const cx = S / 2;
  const cy = S / 2;

  // Геометрія гантелі (у частках розміру).
  const barH = S * 0.085 * scale;
  const barW = S * 0.52 * scale;
  const plateInnerW = S * 0.085 * scale;
  const plateInnerH = S * 0.42 * scale;
  const plateOuterW = S * 0.075 * scale;
  const plateOuterH = S * 0.30 * scale;
  const gap = S * 0.012 * scale;

  const put = (i, color, alpha = 1) => {
    px[i] = Math.round(color[0]);
    px[i + 1] = Math.round(color[1]);
    px[i + 2] = Math.round(color[2]);
    px[i + 3] = Math.round(alpha * 255);
  };

  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4;

      // Фон: радіальний градієнт + скруглені кути.
      const dx = (x - cx) / S;
      const dy = (y - cy) / S;
      const dist = Math.sqrt(dx * dx + dy * dy);
      let bg = mix(BG_EDGE, BG, Math.min(1, dist * 1.7));
      let alpha = 1;

      if (radius > 0) {
        const rx = Math.max(radius - x, x - (S - radius), 0);
        const ry = Math.max(radius - y, y - (S - radius), 0);
        const corner = Math.sqrt(rx * rx + ry * ry);
        if (corner > radius) alpha = 0;
        else if (corner > radius - 1.5) alpha = (radius - corner) / 1.5;
      }
      put(i, bg, alpha);
      if (alpha === 0) continue;

      const ax = Math.abs(x - cx);
      const ay = Math.abs(y - cy);

      // Гриф.
      if (ax <= barW / 2 && ay <= barH / 2) {
        const t = (y - (cy - barH / 2)) / barH; // 0 — верх, 1 — низ
        const light = mix(ACCENT, [255, 255, 255], 0.3);
        const dark = mix(ACCENT, [0, 0, 0], 0.35);
        put(i, mix(light, dark, t), alpha);
        continue;
      }

      // Внутрішні блини.
      const innerFrom = barW / 2 + gap;
      if (ax >= innerFrom && ax <= innerFrom + plateInnerW && ay <= plateInnerH / 2) {
        const t = (ay / (plateInnerH / 2)) * 0.5;
        put(i, mix(STEEL, STEEL_DARK, t), alpha);
        continue;
      }

      // Зовнішні блини.
      const outerFrom = innerFrom + plateInnerW + gap;
      if (ax >= outerFrom && ax <= outerFrom + plateOuterW && ay <= plateOuterH / 2) {
        const t = (ay / (plateOuterH / 2)) * 0.5 + 0.15;
        put(i, mix(STEEL, STEEL_DARK, t), alpha);
        continue;
      }
    }
  }
  return encodePNG(S, S, px);
}

const targets = [
  ['icon-192.png', 192, false],
  ['icon-512.png', 512, false],
  ['icon-maskable-512.png', 512, true],
  ['apple-touch-icon.png', 180, true],
];

for (const [name, size, maskable] of targets) {
  const png = drawIcon(size, maskable);
  writeFileSync(join(OUT, name), png);
  console.log(`✓ icons/${name} (${size}×${size}, ${(png.length / 1024).toFixed(1)} KB)`);
}
