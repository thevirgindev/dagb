const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const r = await fetch('https://discord.com/', { headers: { 'user-agent': UA } });
const t = await r.text();
console.log('status', r.status, 'len', t.length);
const m = [...t.matchAll(/[\w~.-]+\.js/g)].slice(0, 30).map((x) => x[0]);
console.log([...new Set(m)].join('\n'));
