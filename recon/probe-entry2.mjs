const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
for (const path of ['/login', '/channels/@me', '/app']) {
  const r = await fetch('https://discord.com' + path, { headers: { 'user-agent': UA } });
  const t = await r.text();
  const scripts = [...new Set([...t.matchAll(/\/assets\/([\w~.-]+\.js)/g)].map((x) => x[1]))];
  console.log('===', path, 'status', r.status, 'len', t.length, 'scripts', scripts.length);
  console.log(scripts.slice(0, 12).join('\n') || '(none: ' + t.slice(0, 120).replace(/\s+/g, ' ') + ')');
}
