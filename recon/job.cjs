const fs = require('node:fs');
const path = require('node:path');
const j = JSON.parse(fs.readFileSync(path.join('recon', 'labels3.json'), 'utf8'));
const web = fs.readFileSync(path.join('recon', 'hits', 'web.31d1cd3e6e440749.js'), 'utf8');
const map = new Map();
let m;
const re = /(\d{1,6}):"([0-9a-f]{8,32})"/g;
while ((m = re.exec(web)) !== null) map.set(m[1], m[2]);
for (const id of Object.keys(j)) console.log(id, map.get(id), j[id].markers.slice(0, 6).join(','));
