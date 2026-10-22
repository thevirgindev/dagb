const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const r = await fetch('https://discord.com/login', { headers: { 'user-agent': UA } });
const t = await r.text();
const hits = t.match(/<script[^>]+discord-2022[^>]+>/g) || [];
console.log(hits.join('\n'));
const all = t.match(/<script[^>]+>/g) || [];
console.log('\ntotal script tags:', all.length);
console.log(all.filter((s) => s.includes('src=')).slice(0, 8).join('\n'));
