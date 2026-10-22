import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const OUT = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', 'extension', 'icons', 'icon128.png');
const S = 128;
const SS = 4;
const BIG = S * SS;

const bgTop = [24, 26, 31, 255];
const bgBot = [14, 16, 19, 255];
const shackle = [88, 214, 141, 255];
const body = [235, 238, 242, 255];
const cut = [14, 16, 19, 255];

function lerp(a, b, t) { return a + (b - a) * t; }

function inRoundedRect(x, y, x0, y0, x1, y1, r) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.min(Math.max(x, x0 + r), x1 - r);
  const cy = Math.min(Math.max(y, y0 + r), y1 - r);
  return (x - cx) * (x - cx) + (y - cy) * (y - cy) <= r * r;
}

function inRingArc(x, y, cx, cy, rOuter, rInner, a0, a1) {
  const d = Math.hypot(x - cx, y - cy);
  if (d > rOuter || d < rInner) return false;
  let a = Math.atan2(y - cy, x - cx) * 180 / Math.PI;
  if (a < 0) a += 360;
  const lo = a0, hi = a1;
  if (a >= lo && a <= hi) return true;
  return false;
}

function paintAt(x, y) {
  const rad = 26;
  const inx = x >= rad && x < BIG - rad;
  const iny = y >= rad && y < BIG - rad;
  let inside = true;
  if (!inx && !iny) {
    const cx = x < rad ? rad : BIG - 1 - rad;
    const cy = y < rad ? rad : BIG - 1 - rad;
    inside = (x - cx) * (x - cx) + (y - cy) * (y - cy) <= rad * rad;
  }
  if (!inside) return [0, 0, 0, 0];

  const t = y / (BIG - 1);
  const c = [
    Math.round(lerp(bgTop[0], bgBot[0], t)),
    Math.round(lerp(bgTop[1], bgBot[1], t)),
    Math.round(lerp(bgTop[2], bgBot[2], t)),
    255,
  ];

  const sh = (r_out, r_in, cx, cy, a0, a1) => inRingArc(x, y, cx, cy, r_out, r_in, a0, a1);

  const s = (v) => v * SS;

  if (sh(s(25), s(15.5), s(63), s(58), 110, 335)) return shackle;
  const capX = s(63) + s(25) * Math.cos(335 * Math.PI / 180);
  const capY = s(58) + s(25) * Math.sin(335 * Math.PI / 180);
  if ((x - capX) * (x - capX) + (y - capY) * (y - capY) <= s(4.75) * s(4.75)) return shackle;

  if (inRoundedRect(x, y, s(36), s(63), s(90), s(101), s(9))) {
    const keyhole = (x - s(64)) * (x - s(64)) + (y - s(78.5)) * (y - s(78.5)) <= s(4.25) * s(4.25) ||
      inRoundedRect(x, y, s(61.5), s(79), s(66.5), s(93), s(2.5));
    if (keyhole) return cut;
    return body;
  }

  return c;
}

const hi = new Uint8Array(BIG * BIG * 4);
for (let y = 0; y < BIG; y++) {
  for (let x = 0; x < BIG; x++) {
    const c = paintAt(x, y);
    const i = (y * BIG + x) * 4;
    hi[i] = c[0]; hi[i + 1] = c[1]; hi[i + 2] = c[2]; hi[i + 3] = c[3];
  }
}

const out = new Uint8Array(S * S * 4);
for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    let r = 0, g = 0, b = 0, w = 0;
    for (let sy = 0; sy < SS; sy++) {
      for (let sx = 0; sx < SS; sx++) {
        const i = ((y * SS + sy) * BIG + (x * SS + sx)) * 4;
        const a = hi[i + 3] / 255;
        r += hi[i] * a; g += hi[i + 1] * a; b += hi[i + 2] * a; w += a;
      }
    }
    const o = (y * S + x) * 4;
    if (w <= 0.0001) { out[o] = 0; out[o + 1] = 0; out[o + 2] = 0; out[o + 3] = 0; continue; }
    out[o] = Math.round(r / w); out[o + 1] = Math.round(g / w); out[o + 2] = Math.round(b / w);
    out[o + 3] = Math.round(w / (SS * SS) * 255);
  }
}

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = c ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(S, 0); ihdr.writeUInt32BE(S, 4);
ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
const raw = Buffer.alloc((S * 4 + 1) * S);
for (let y = 0; y < S; y++) {
  raw[y * (S * 4 + 1)] = 0;
  out.copy ? null : out.copy;
  raw.set(Buffer.from(out.buffer, y * S * 4, S * 4), y * (S * 4 + 1) + 1);
}
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, png);
console.log('wrote', OUT, png.length, 'bytes');
