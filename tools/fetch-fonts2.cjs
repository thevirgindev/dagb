const fs = require('node:fs');
const https = require('node:https');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

function get(url, binary) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'user-agent': UA } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return get(res.headers.location, binary).then(resolve, reject);
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error('http ' + res.statusCode + ' ' + url)); }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(binary ? Buffer.concat(chunks) : Buffer.concat(chunks).toString('utf8')));
    }).on('error', reject);
  });
}

async function latinBlock(css, family) {
  const blocks = css.split('@font-face').slice(1);
  let best = null;
  for (const b of blocks) {
    const range = (b.match(/unicode-range:\s*([^;]+);/) || [])[1] || '';
    if (range.indexOf('U+0000-00FF') === -1) continue;
    const weight = (b.match(/font-weight:\s*([^;]+);/) || [])[1].trim();
    best = { b, weight };
    break;
  }
  if (!best) throw new Error('no latin block for ' + family);
  const url = (best.b.match(/url\((https:[^)]+\.woff2)\)/) || [])[1];
  return { url, weight: best.weight };
}

(async () => {
  const wants = [
    { family: 'Outfit', axis: 'wght@400..900', role: 'display' },
    { family: 'Quicksand', axis: 'wght@400..700', role: 'ui' },
  ];
  const out = [];
  for (const w of wants) {
    const css = await get('https://fonts.googleapis.com/css2?family=' + w.family + ':' + w.axis + '&display=swap', false);
    const block = await latinBlock(css, w.family);
    const buf = await get(block.url, true);
    out.push(
      '@font-face {\n' +
      "  font-family: '" + w.family + "';\n" +
      '  font-style: normal;\n' +
      '  font-weight: ' + block.weight + ';\n' +
      '  font-display: swap;\n' +
      "  src: url(data:font/woff2;base64," + buf.toString('base64') + ") format('woff2');\n" +
      '}\n'
    );
    console.log(w.family, block.weight, buf.length, 'bytes');
  }
  const file = 'C:/Users/user/Documents/smth-new/discord-agegate/extension/src/fonts.css';
  fs.writeFileSync(file, '\n' + out.join('\n'), 'utf8');
  console.log('wrote', file, fs.statSync(file).size, 'bytes');
})().catch((e) => { console.error('font fetch failed:', e.message); process.exit(1); });
