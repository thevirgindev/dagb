import { connect } from './cdp.mjs';
import fs from 'node:fs';

const cdp = await connect(9222, { timeout: 20000 });
const targets = await cdp.targets();
const pages = targets.filter((t) => t.type === 'page' && /discord\.com/.test(t.url || ''));
console.log('discord tabs:', pages.length, pages.map((p) => p.title).join(' | '));
if (!pages.length) { cdp.close(); process.exit(1); }

const EXPR = `(() => {
  let mods = null;
  try {
    window.webpackChunkdiscord_app.push([[Math.random()], {}, (r) => { mods = r.m; }]);
  } catch (e) { return JSON.stringify({ err: 'push ' + e.message }); }
  if (!mods) return JSON.stringify({ err: 'no module table' });
  const out = { count: Object.keys(mods).length, mod323073: null, hits: {}, hasNsfwLevelMods: [] };
  try {
    const f = mods[323073];
    out.mod323073 = typeof f === 'function' ? String(f).slice(0, 30000) : 'missing/' + typeof f;
  } catch (e) { out.mod323073 = 'ERR ' + e.message; }
  const needles = {
    nsfwAgree: 'nsfwAgree',
    ownerConfigured: 'ownerConfiguredContentLevel',
    gateType: 'GUILD_LARGE_SERVER',
    nsfwLevel: 'nsfwLevel',
    isNSFW: 'isNSFW',
    channelGate: 'NSFW_CHANNEL_AGE_VERIFY',
    inviteGate: 'NSFW_SERVER_INVITE',
  };
  for (const id of Object.keys(mods)) {
    let s;
    try { s = String(mods[id]); } catch { continue; }
    if (s.length < 40) continue;
    if (s.includes('nsfwLevel')) out.hasNsfwLevelMods.push(Number(id));
    for (const k in needles) {
      if (!s.includes(needles[k])) continue;
      (out.hits[k] = out.hits[k] || []).push(Number(id));
    }
  }
  return JSON.stringify(out);
})()`;

let saved = false;
for (const p of pages) {
  console.log('\n=== ' + p.title + ' ' + p.url + ' ===');
  try {
    const a = await cdp.send('Target.attachToTarget', { targetId: p.targetId, flatten: true });
    const sessionId = a.sessionId;
    await cdp.send('Page.enable', {}, sessionId);
    try { await cdp.send('Page.setWebLifecycleState', { state: 'active' }, sessionId); } catch {}
    await cdp.send('Runtime.enable', {}, sessionId);
    const raw = await cdp.evaluate(sessionId, EXPR);
    if (typeof raw !== 'string' || !raw.length) { console.log('empty/typeof', typeof raw); continue; }
    console.log('result bytes:', raw.length);
    fs.writeFileSync('recon/modtable.json', raw);
    const j = JSON.parse(raw);
    console.log('count:', j.count, 'mod323073 present:', !!j.mod323073 && !String(j.mod323073).startsWith('missing'));
    console.log('hits:', JSON.stringify(j.hits));
    console.log('nsfwLevel mods:', (j.hasNsfwLevelMods || []).slice(0, 40).join(','));
    if (j.mod323073 && !String(j.mod323073).startsWith('missing')) {
      console.log('\n===== module 323073 head =====\n' + String(j.mod323073).slice(0, 2600));
    }
    saved = true;
    break;
  } catch (e) { console.log('probe failed:', e.message.slice(0, 300)); }
}
if (!saved) console.log('NO TAB SAVED');
cdp.close();
