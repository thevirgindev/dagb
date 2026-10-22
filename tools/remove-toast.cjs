const fs = require('node:fs');
const p = 'C:/Users/user/Documents/smth-new/discord-agegate/extension/src/content.js';
let s = fs.readFileSync(p, 'utf8');

const lines = s.split('\n');
const out = [];
let i = 0;
let removed = 0;
while (i < lines.length) {
  const line = lines[i];
  if (line.trim() === 'let toastEl = null;') {
    // skip the toast element holder and the whole function
    i++;
    while (i < lines.length && !/^  function publishVersion\(\)/.test(lines[i])) i++;
    removed++;
    continue;
  }
  if (/showToast\(\);/.test(line)) {
    // drop the whole call block (the "if (active) showToast();" style lines)
    if (/if \(active\) showToast\(\);/.test(line)) { i++; continue; }
    if (/else if \(v\) showToast\(\);/.test(line)) { i++; continue; }
    i++;
    continue;
  }
  if (line.indexOf("getAttribute('data-agegate-active')") !== -1) { i++; continue; }
  out.push(line);
  i++;
}

s = out.join('\n');
s = s.replace(/\n{3,}/g, '\n\n');
fs.writeFileSync(p, s, 'utf8');
console.log('toast blocks removed:', removed);
console.log('showToast refs left:', (s.match(/showToast/g) || []).length);
console.log('toast id refs left:', (s.match(/__agegate_toast/g) || []).length);
console.log('active marker refs left:', (s.match(/data-agegate-active/g) || []).length);
