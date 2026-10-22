// Extract the webpack chunk map from web.js, then pull every lazy chunk and hunt age-verification UI.
import fs from 'node:fs';
import path from 'node:path';

const DIR = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const WEB = path.join(DIR, 'hits', 'web.31d1cd3e6e440749.js');
const web = fs.readFileSync(WEB, 'utf8');

// webpack chunk-id -> filename hash map lives in the runtime: {"123":"abc", ...}[e]+".js"
const map = new Map();
const re = /(\d{1,6}):"([0-9a-f]{8,32})"/g;
let m;
while ((m = re.exec(web)) !== null) map.set(m[1], m[2]);
console.log('chunk map entries:', map.size);

// named chunks: {"name":"id"} style also appears as 123:"hash"
const ids = [...map.keys()];
console.log('sample:', ids.slice(0, 12).map((i) => i + '->' + map.get(i)).join(', '));

const NEEDLES = [
  'age_verification', 'ageVerification', 'AGE_VERIFICATION', 'age-verification',
  'date_of_birth', 'AGE_GATE', 'ageGate', 'age_gate',
  'verification_webview_url', 'verification_request_id', 'verification_vendor_name',
  'age_assurance', 'AGE_ASSURANCE', 'AgeAssurance',
  'age_verification_status', 'CLIENT_ONLY_PENDING',
  'age_restricted', 'AGE_RESTRICTED', 'ageRestricted',
  'INFERRED_ADULT', 'VERIFIED_TEEN',
];

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const hits = [];
let bytes = 0, ok = 0, fail = 0, done = 0;
const queue = ids.map((i) => ({ id: i, file: '/assets/' + map.get(i) + '.js' }));

async function grab(item) {
  try {
    const r = await fetch('https://discord.com' + item.file, { headers: { 'user-agent': UA } });
    if (!r.ok) { fail++; return; }
    const buf = Buffer.from(await r.arrayBuffer());
    bytes += buf.length; ok++;
    const text = buf.toString('utf8');
    const found = NEEDLES.filter((n) => text.includes(n));
    if (found.length) {
      const outDir = path.join(DIR, 'lazy-hits');
      fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(path.join(outDir, item.id + '.js'), buf);
      hits.push({ id: item.id, file: item.file, bytes: buf.length, needles: found, text });
    }
  } catch { fail++; }
  done++;
  if (done % 100 === 0) process.stderr.write(`\r${done}/${queue.length} ${(bytes / 1048576).toFixed(1)}MB hits=${hits.length}   `);
}

await Promise.all(Array.from({ length: 16 }, async () => {
  while (queue.length) { const it = queue.shift(); if (!it) break; await grab(it); }
}));

console.log(`\nchunks=${ids.length} ok=${ok} fail=${fail} bytes=${(bytes / 1048576).toFixed(1)}MB hitChunks=${hits.length}`);
for (const h of hits) console.log(`  ${h.file}  ${(h.bytes / 1024).toFixed(0)}KB  [${h.needles.join(', ')}]`);

// dump endpoint-ish strings from hits
const api = new Set();
for (const h of hits) {
  for (const mm of h.text.matchAll(/["'`](\/[a-z0-9_\-]+(?:\/[a-z0-9_\-{}.]+){1,6})["'`]/gi)) {
    if (/age|verif|assurance|underage|adult|gate/i.test(mm[1])) api.add(h.id + '  ' + mm[1]);
  }
}
console.log('\n--- candidate endpoints ---');
for (const a of [...api].sort()) console.log('  ' + a);
