
(function () {
  'use strict';

  if (window.__AGEGATE__) return;

  const version = '1.0.2';
  const statusCodes = { UNVERIFIED: 1, VERIFIED_TEEN: 2, VERIFIED_ADULT: 3, INFERRED_ADULT: 4, INFERRED_TEEN: 5 };

  const defaults = {
    enabled: true,
    status: statusCodes.VERIFIED_ADULT,
    forceNsfw: true,
    hideUi: true,
    autoDob: true,
    keepAlive: true,
    dob: '1995-06-15',
    forceJsonGateway: true,
  };

  let config = Object.assign({}, defaults);
  let currentUserId = null;
  let lastUserSnapshot = null;

  let lastServerStatus = null;

  const sixHoursMs = 6 * 60 * 60 * 1000;
  const oneDayMs = 24 * 60 * 60 * 1000;

  const stats = {
    patched: 0, frames: 0, urls: {},
    wsMessages: 0, wsText: 0, wsBinary: 0,
    dobAttempts: 0, started: Date.now(),
  };
  const logRing = [];

  window.__AGEGATE__ = { version: version, stats: stats, config: config };

  function loadConfig() {
    try {
      const raw = localStorage.getItem('agegate_config');
      if (raw) config = Object.assign({}, defaults, JSON.parse(raw));
    } catch (e) {  }
  }
  loadConfig();

  window.addEventListener('message', function (e) {
    const d = e && e.data;
    if (!d || typeof d !== 'object') return;
    if (d.__agegate_cfg__) {
      config = Object.assign({}, config, d.__agegate_cfg__);
      window.__AGEGATE__.config = config;
    }
  });

  function pushLog(kind, detail) {
    const entry = { t: Date.now(), kind: kind, detail: detail };
    logRing.push(entry);
    if (logRing.length > 200) logRing.shift();
    window.postMessage({ __agegate_log__: entry }, '*');
  }

  function stampKey(key, value) {
    try { localStorage.setItem(key, String(value)); } catch (e) {  }
  }
  function readStamp(key) {
    try {
      const v = Number(localStorage.getItem(key));
      return Number.isFinite(v) ? v : 0;
    } catch (e) { return 0; }
  }

  let pendingKeepAlive = false;
  function scheduleKeepAliveCheck() {
    if (pendingKeepAlive) return;
    pendingKeepAlive = true;
    setTimeout(function () {
      pendingKeepAlive = false;
      keepAlive();
    }, 750);
  }

  function captureStatus(node, depth) {
    if (!node || typeof node !== 'object' || depth > 12) return;
    if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i++) captureStatus(node[i], depth + 1);
      return;
    }
    const raw = typeof node.age_verification_status === 'number' ? node.age_verification_status :
      (typeof node.ageVerificationStatus === 'number' ? node.ageVerificationStatus : null);
    if (raw !== null && typeof node.id === 'string' && typeof node.username === 'string') {
      if (currentUserId && node.id === currentUserId) {
        lastServerStatus = raw;
        stats.serverStatus = raw;
        if (raw !== config.status) scheduleKeepAliveCheck();
        return;
      }
      if (typeof lastServerStatus !== 'number') {
        lastServerStatus = raw;
        stats.serverStatus = raw;
        if (raw !== config.status) scheduleKeepAliveCheck();
      }
    }
    for (const k in node) {
      if (Object.prototype.hasOwnProperty.call(node, k)) captureStatus(node[k], depth + 1);
    }
  }

  function markTouched(o) {
    try {
      if (o && typeof o === 'object') Object.defineProperty(o, '__agegate_touched', { value: true, configurable: true });
    } catch (e) {  }
  }

  function isApiUrl(url) {
    if (!url) return false;
    if (/(^|\/\/)([a-z0-9-]+\.)*discord(app)?\.com/i.test(url)) return true;
    if (/^\/api\/v\d+\//.test(url)) return true;
    if (/^https?:\/\/[^/]+\/api\/v\d+\//i.test(url)) return true;
    return false;
  }

  function patchExisting(o) {
    let changed = false;
    if ('age_verification_status' in o) { o.age_verification_status = config.status; changed = true; }
    if ('ageVerificationStatus' in o) { o.ageVerificationStatus = config.status; changed = true; }
    if (config.forceNsfw) {
      if ('nsfw_allowed' in o) { o.nsfw_allowed = true; changed = true; }
      if ('nsfwAllowed' in o) { o.nsfwAllowed = true; changed = true; }
    }
    if (o.nsfw_level === 1 || o.nsfw_level === 3) { o.nsfw_level = 2; changed = true; }
    if (o.nsfwLevel === 1 || o.nsfwLevel === 3) { o.nsfwLevel = 2; changed = true; }
    if (o.owner_configured_content_level === 1 || o.owner_configured_content_level === 3) { o.owner_configured_content_level = null; changed = true; }
    if (o.ownerConfiguredContentLevel === 1 || o.ownerConfiguredContentLevel === 3) { o.ownerConfiguredContentLevel = null; changed = true; }
    if (o.nsfw === true && (o.type !== undefined || o.features !== undefined)) { o.nsfw = false; changed = true; }
    return changed;
  }

  function patchCurrentUser(u) {
    if (!u || typeof u !== 'object') return false;
    if (typeof u.id === 'string') currentUserId = u.id;
    u.age_verification_status = config.status;
    if (config.forceNsfw || 'nsfw_allowed' in u) u.nsfw_allowed = true;
    if ('ageVerificationStatus' in u) u.ageVerificationStatus = config.status;
    if (config.forceNsfw && 'nsfwAllowed' in u) u.nsfwAllowed = true;

    if (typeof u.flags === 'number') {
      const cleared = u.flags & ~64;
      if (cleared !== u.flags) u.flags = cleared;
    }
    lastUserSnapshot = { id: u.id, username: u.username, status: config.status };
    window.__AGEGATE__.lastUser = {
      id: u.id,
      username: u.username,
      age_verification_status: u.age_verification_status,
      nsfw_allowed: u.nsfw_allowed,
      flags: u.flags,
      at: Date.now(),
    };
    return true;
  }

  function walk(node, depth) {
    if (!node || typeof node !== 'object' || depth > 14) return false;
    let changed = false;
    if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i++) changed = walk(node[i], depth + 1) || changed;
      return changed;
    }
    changed = patchExisting(node) || changed;
    for (const k in node) {
      if (Object.prototype.hasOwnProperty.call(node, k)) {
        const v = node[k];
        if (v && typeof v === 'object') changed = walk(v, depth + 1) || changed;
      }
    }
    return changed;
  }

  function noteUrl(url) {
    if (!url) return;
    const key = url.replace(/^https?:\/\/[^/]+/, '').split('?')[0];
    stats.urls[key] = (stats.urls[key] || 0) + 1;
  }

  let activeNotified = false;
  function notifyActive(what) {
    if (activeNotified) return;
    activeNotified = true;

    window.postMessage({ __agegate_active__: { at: Date.now(), what: what } }, '*');
  }

  function isDobError(body) {
    if (!body || typeof body !== 'object') return false;
    if (body.date_of_birth !== undefined) return true;
    if (body.data && typeof body.data === 'object' && body.data.date_of_birth !== undefined) return true;
    return false;
  }

  function extractDob(body) {
    if (!body) return null;
    if (body.date_of_birth) return body.date_of_birth;
    if (body.data && body.data.date_of_birth) return body.data.date_of_birth;
    return null;
  }

  function fakeUserBody(original, dob) {
    const base = original && typeof original === 'object' ? original : (lastUserSnapshot || {});
    return Object.assign({}, base, {
      id: base.id || currentUserId || '0',
      username: base.username || 'unknown',
      date_of_birth: dob || config.dob,
      age_verification_status: config.status,
      nsfw_allowed: true,
    });
  }

  function getStoredToken() {
    try {
      for (const k of ['token', 'tokens', 'discord_token']) {
        const v = localStorage.getItem(k);
        if (v && v.length > 30) {
          try { const p = JSON.parse(v); return typeof p === 'string' ? p : v; } catch (e) { return v; }
        }
      }
    } catch (e) {  }
    return null;
  }

  function getSuperProperties() {
    try {
      const raw = localStorage.getItem('deviceProperties');
      if (!raw) return null;
      return btoa(JSON.stringify(JSON.parse(raw)));
    } catch (e) { return null; }
  }

  function authHeaders() {
    const token = getStoredToken();
    if (!token) return null;
    const headers = { 'Content-Type': 'application/json', Authorization: token };
    const sp = getSuperProperties();
    if (sp) headers['X-Super-Properties'] = sp;
    return headers;
  }

  function submitRealDob(reason, forced) {
    return Promise.resolve(false);
  }

  function accountAgeMs() {
    if (!currentUserId || !/^\d+$/.test(currentUserId)) return Number.POSITIVE_INFINITY;
    try {
      const created = Number((BigInt(currentUserId) >> 22n) + 1420070400000n);
      return Date.now() - created;
    } catch (e) {
      return Number.POSITIVE_INFINITY;
    }
  }

  function keepAlive() {
    return Promise.resolve(false);
  }

  function applyApiPatch(url, status, data) {
    const result = { changed: false, doctored: false, doctoredStatus: 0 };

    if (!data || typeof data !== 'object') return result;

    if (typeof data.age_verification_status === 'number' && !(data && data.__agegate_touched)) {
      lastServerStatus = data.age_verification_status;
      stats.serverStatus = lastServerStatus;
      if (lastServerStatus !== config.status) scheduleKeepAliveCheck();
    }

    const isMe = /\/api\/v\d+\/users\/@me(\?|$)/.test(url) && !/\/users\/@me\//.test(url);
    const isLogin = /\/api\/v\d+\/auth\/login/.test(url);
    const isGateway = /\/api\/v\d+\/gateway(\?|$)/.test(url);

    if (isGateway && config.forceJsonGateway) {
      if (data.encoding && data.encoding !== 'json') { data.encoding = 'json'; result.changed = true; }
      if (!data.encoding) { data.encoding = 'json'; result.changed = true; }
    }

    if (isMe && !Array.isArray(data)) {
      if (patchCurrentUser(data)) { result.changed = true; notifyActive('rest'); }
    } else {
      if (walk(data, 0)) result.changed = true;
    }

    if (isDobError(data)) {
      const dob = extractDob(data) || config.dob;
      pushLog('gate:dob-error', { url: url, status: status, dob: dob });
      submitRealDob(url, true);

      if (isMe) {

        const ok = fakeUserBody(data.user || lastUserSnapshot, config.dob);
        for (const k of Object.keys(data)) delete data[k];
        Object.assign(data, ok);
        result.changed = true;
        result.doctored = true;
        result.doctoredStatus = 200;
      } else if (isLogin) {
        pushLog('gate:login-blocked', { url: url });
      }
    }

    return result;
  }

  const nativeText = Response.prototype.text;
  Response.prototype.text = async function () {
    const t = await nativeText.call(this);
    if (!config.enabled) return t;
    const url = this.url || '';
    if (!isApiUrl(url)) return t;
    let data;
    try { data = JSON.parse(t); } catch (e) { return t; }
    const res = applyApiPatch(url, this.status, data);
    if (!res.changed) return t;
    stats.patched++;
    noteUrl(url);
    if (res.doctored) {
      pushLog('patch:doctored', { url: url, status: res.doctoredStatus });
      doctoredStatus(this, res.doctoredStatus);
    }
    return JSON.stringify(data);
  };

  const nativeJson = Response.prototype.json;
  Response.prototype.json = async function () {
    const data = await nativeJson.call(this);
    if (!config.enabled) return data;
    const url = this.url || '';
    if (!isApiUrl(url)) return data;
    const res = applyApiPatch(url, this.status, data);
    if (!res.changed) return data;
    stats.patched++;
    noteUrl(url);
    if (res.doctored) {
      pushLog('patch:doctored', { url: url, status: res.doctoredStatus });
      doctoredStatus(this, res.doctoredStatus);
    }
    return data;
  };

  function doctoredStatus(response, status) {
    try {
      Object.defineProperty(response, 'status', { configurable: true, get: function () { return status; } });
      Object.defineProperty(response, 'ok', { configurable: true, get: function () { return true; } });
      Object.defineProperty(response, 'statusText', { configurable: true, get: function () { return 'OK'; } });
    } catch (e) {  }
  }

  const nativeFetch = window.fetch;
  window.fetch = function (input, init) {
    let url = '';
    try {
      if (typeof input === 'string') url = input;
      else if (input && input.url) url = input.url;
    } catch (e) {  }
    const p = nativeFetch.call(this, input, init);
    if (!config.enabled || !isApiUrl(url)) return p;
    return p.then(async function (res) {
      try {
        if (res.status === 204 || res.status === 205 || res.status === 304) return res;
        const ct = (res.headers.get('content-type') || '').toLowerCase();
        if (ct.indexOf('json') === -1) return res;
        const text = await res.clone().text();
        if (!text || text.length < 2) return res;
        let data;
        try { data = JSON.parse(text); } catch (e) { return res; }
        const r = applyApiPatch(url, res.status, data);
        if (!r.changed) return res;
        stats.patched++;
        noteUrl(url);
        if (r.doctored) pushLog('patch:doctored', { url: url, status: r.doctoredStatus });
        const headers = new Headers(res.headers);
        headers.delete('content-length');
        headers.set('content-type', 'application/json; charset=utf-8');
        return new Response(JSON.stringify(data), {
          status: r.doctoredStatus || res.status,
          statusText: res.statusText,
          headers: headers,
        });
      } catch (e) {
        return res;
      }
    }).catch(function (err) { throw err; });
  };

  const xhrOpen = XMLHttpRequest.prototype.open;
  const xhrSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url) {
    this.__agegateUrl = String(url || '');
    return xhrOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function () {
    const self = this;
    const url = self.__agegateUrl || '';
    if (config.enabled && isApiUrl(url)) {
      self.addEventListener('load', function () {
        try {
          if (self.responseType && self.responseType !== 'text' && self.responseType !== 'json') return;
          const raw = self.responseType === 'json' ? JSON.stringify(self.response) : self.responseText;
          if (!raw || raw.length < 2) return;
          let data;
          try { data = JSON.parse(raw); } catch (e) { return; }
          const res = applyApiPatch(url, self.status, data);
          if (!res.changed) return;
          stats.patched++;
          noteUrl(url);
          const out = JSON.stringify(data);
          if (res.doctored) {
            try {
              Object.defineProperty(self, 'status', { configurable: true, get: function () { return res.doctoredStatus; } });
              Object.defineProperty(self, 'statusText', { configurable: true, get: function () { return 'OK'; } });
            } catch (e) {  }
          }
          if (self.responseType === 'json') {
            Object.defineProperty(self, 'response', { configurable: true, get: function () { return data; } });
          } else {
            Object.defineProperty(self, 'responseText', { configurable: true, get: function () { return out; } });
            Object.defineProperty(self, 'response', { configurable: true, get: function () { return out; } });
          }
        } catch (e) {  }
      });
    }
    return xhrSend.apply(this, arguments);
  };

  function patchGatewayFrame(data) {
    let obj;
    try { obj = JSON.parse(data); } catch (e) { return data; }
    stats.frames++;
    let changed = false;
    const gUser = obj && obj.d && obj.d.user ? obj.d.user : (obj && obj.user);
    if (obj && obj.t === 'READY' && gUser) changed = patchCurrentUser(gUser) || changed;
    else if (obj && obj.t === 'USER_UPDATE' && gUser) {
      if (!currentUserId || gUser.id === currentUserId) changed = patchCurrentUser(gUser) || changed;
      else changed = walk(obj, 0) || changed;
    } else {
      changed = walk(obj, 0) || changed;
    }
    if (!changed) return data;
    stats.patched++;
    return JSON.stringify(obj);
  }

  (function patchWebSocket() {
    const Native = window.WebSocket;
    if (!Native || Native.__agegate) return;
    const proto = Native.prototype;
    const origAdd = proto.addEventListener;
    const desc = Object.getOwnPropertyDescriptor(proto, 'onmessage');

    function patchEvent(ev) {
      stats.wsMessages++;
      const d = ev && ev.data;
      if (typeof d !== 'string') { stats.wsBinary++; return ev; }
      stats.wsText++;
      const patched = patchGatewayFrame(d);
      if (patched === d) return ev;
      try {
        return new MessageEvent('message', { data: patched, origin: ev.origin, lastEventId: ev.lastEventId });
      } catch (e) { return ev; }
    }

    proto.addEventListener = function (type, fn, opts) {
      if (type === 'message' && typeof fn === 'function') {
        return origAdd.call(this, type, function (ev) { fn(patchEvent(ev)); }, opts);
      }
      return origAdd.call(this, type, fn, opts);
    };

    if (desc && desc.get && desc.set) {
      Object.defineProperty(proto, 'onmessage', {
        configurable: true,
        enumerable: desc.enumerable,
        get: function () { return desc.get.call(this); },
        set: function (fn) {
          desc.set.call(this, typeof fn === 'function' ? function (ev) { fn(patchEvent(ev)); } : fn);
        },
      });
    }

    Object.defineProperty(Native, '__agegate', { value: true });
  })();

  pushLog('boot', { version: version, status: config.status });

  try { document.documentElement.setAttribute('data-agegate', version); } catch (e) {  }

  const origParse = JSON.parse;
  JSON.parse = function (text, reviver) {
    const data = origParse(text, reviver);
    if (!config.enabled) return data;
    try {
      if (typeof text !== 'string') return data;
      const mentionsUser = text.indexOf('age_verification_status') !== -1 || text.indexOf('ageVerificationStatus') !== -1;
      const mentionsNsfw = text.indexOf('nsfw_allowed') !== -1 || text.indexOf('nsfwAllowed') !== -1 ||
        text.indexOf('nsfw_level') !== -1 || text.indexOf('nsfwLevel') !== -1 ||
        text.indexOf('owner_configured_content_level') !== -1 || text.indexOf('ownerConfiguredContentLevel') !== -1;
      if (!mentionsUser && !mentionsNsfw) return data;
      markTouched(data);
      if (mentionsUser) captureStatus(data, 0);
      const isFrame = data && typeof data === 'object' && !Array.isArray(data) &&
        typeof data.t === 'string' && data.d !== undefined;
      let changed = false;
      if (isFrame) {
        const gUser = data.d && typeof data.d === 'object' ? data.d.user : null;
        if (gUser && typeof gUser === 'object') {
          if (data.t === 'READY' || data.t === 'USER_UPDATE') {
            if (!currentUserId || gUser.id === currentUserId) changed = patchCurrentUser(gUser) || changed;
          } else {
            changed = patchExisting(gUser) || changed;
          }
        }
      }
      if (walk(data, 0)) changed = true;
      if (changed) {
        stats.patched++;
        if (isFrame) stats.jsonFrames = (stats.jsonFrames || 0) + 1;
        else stats.jsonPatched = (stats.jsonPatched || 0) + 1;
        notifyActive('gateway');
      }
    } catch (e) {  }
    return data;
  };

  window.postMessage({ __agegate_ready__: { version: version } }, '*');

  let lastKeepAlive = 0;
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState !== 'visible') return;
    const now = Date.now();
    if (now - lastKeepAlive < 300000) return;
    lastKeepAlive = now;
    keepAlive();
  });
})();
