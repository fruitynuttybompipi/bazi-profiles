/* BaZi profile storage and GitHub sync — Stage 4.
 * Stores only birth details and notes per profile; charts are recomputed on every view.
 * Sync: one JSON file in a PRIVATE GitHub repo via the Contents API, using a fine-grained token
 * the user enters on each device (kept only in that browser). Merge is per profile, newest edit wins;
 * deletions are kept as tombstones so they reach other devices.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BaziStore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const SCHEMA = 1;
  const KEY_DB = 'bazi.profiles.v1', KEY_SYNC = 'bazi.sync.v1', KEY_META = 'bazi.meta.v1';

  // ---------- browser storage, never throws ----------
  const mem = {};
  let storageOk = true;
  function lsGet(k) { try { const v = localStorage.getItem(k); return v === null ? (k in mem ? mem[k] : null) : v; } catch (e) { storageOk = false; return k in mem ? mem[k] : null; } }
  function lsSet(k, v) { mem[k] = v; try { localStorage.setItem(k, v); return true; } catch (e) { storageOk = false; return false; } }
  function lsDel(k) { delete mem[k]; try { localStorage.removeItem(k); } catch (e) { storageOk = false; } }
  const parse = (s, d) => { try { return s ? JSON.parse(s) : d; } catch (e) { return d; } };

  // ---------- data model ----------
  const emptyDb = () => ({ schema: SCHEMA, profiles: [], settings: { ziRule: 'split', useSolarTime: false, updatedAt: 0 } });
  const newId = () => 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const clean = s => String(s == null ? '' : s);
  // Normalise one profile; returns null if unusable. Only these fields are ever stored.
  function normProfile(p) {
    if (!p || typeof p !== 'object' || typeof p.id !== 'string' || !/^[\w-]{1,64}$/.test(p.id)) return null;
    const updatedAt = Number(p.updatedAt) || 0;
    if (p.deleted) return { id: p.id, deleted: true, updatedAt };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.date || '')) return null;
    const time = /^\d{2}:\d{2}$/.test(p.time || '') ? p.time : null;
    const place = p.place && typeof p.place === 'object' ? { name: clean(p.place.name).slice(0, 60), zone: clean(p.place.zone).slice(0, 60) || 'Asia/Kuala_Lumpur', lon: Number.isFinite(+p.place.lon) && p.place.lon !== null && p.place.lon !== '' ? +p.place.lon : null } : { name: 'Kuala Lumpur', zone: 'Asia/Kuala_Lumpur', lon: 101.69 };
    return { id: p.id, nick: clean(p.nick).trim().slice(0, 30) || 'Unnamed', date: p.date, time, gender: p.gender === 'F' ? 'F' : 'M', place, notes: clean(p.notes).slice(0, 2000), createdAt: Number(p.createdAt) || updatedAt, updatedAt };
  }
  function normDb(d) {
    const out = emptyDb();
    if (!d || typeof d !== 'object') return out;
    const seen = new Map();
    (Array.isArray(d.profiles) ? d.profiles : []).forEach(x => { const p = normProfile(x); if (p && (!seen.has(p.id) || seen.get(p.id).updatedAt < p.updatedAt)) seen.set(p.id, p); });
    out.profiles = [...seen.values()];
    if (d.settings && typeof d.settings === 'object') out.settings = { ziRule: d.settings.ziRule === 'early' ? 'early' : 'split', useSolarTime: !!d.settings.useSolarTime, updatedAt: Number(d.settings.updatedAt) || 0 };
    return out;
  }
  // Merge two databases: per profile id, the newer updatedAt wins (ties: deletion wins, then a).
  function merge(a, b) {
    a = normDb(a); b = normDb(b);
    const map = new Map();
    a.profiles.concat(b.profiles).forEach(p => {
      const cur = map.get(p.id);
      if (!cur || p.updatedAt > cur.updatedAt || (p.updatedAt === cur.updatedAt && p.deleted && !cur.deleted)) map.set(p.id, p);
    });
    const settings = b.settings.updatedAt > a.settings.updatedAt ? b.settings : a.settings;
    return { schema: SCHEMA, profiles: [...map.values()].sort((x, y) => (x.createdAt || 0) - (y.createdAt || 0) || (x.id < y.id ? -1 : 1)), settings };
  }
  const canon = d => JSON.stringify(normDb(d).profiles.slice().sort((x, y) => (x.id < y.id ? -1 : 1))) + JSON.stringify(normDb(d).settings);
  const sameDb = (a, b) => canon(a) === canon(b);
  const live = d => d.profiles.filter(p => !p.deleted);

  // ---------- local store ----------
  function loadDb() { return normDb(parse(lsGet(KEY_DB), null)); }
  function saveDb(d) { return lsSet(KEY_DB, JSON.stringify(normDb(d))); }
  function upsert(d, fields, now = Date.now()) {
    const db = normDb(d);
    const id = fields.id || newId();
    const old = db.profiles.find(p => p.id === id);
    const p = normProfile(Object.assign({}, old && !old.deleted ? old : {}, fields, { id, updatedAt: Math.max(now, old ? old.updatedAt + 1 : 0), createdAt: old && old.createdAt ? old.createdAt : now }));
    if (!p) throw new Error('Profile is missing a valid date.');
    db.profiles = db.profiles.filter(x => x.id !== id).concat([p]);
    return { db, id };
  }
  function remove(d, id, now = Date.now()) {
    const db = normDb(d);
    const old = db.profiles.find(p => p.id === id);
    db.profiles = db.profiles.filter(x => x.id !== id).concat([{ id, deleted: true, updatedAt: Math.max(now, old ? old.updatedAt + 1 : 0) }]);
    return db;
  }
  function removeAll(d, now = Date.now()) { const db = normDb(d); db.profiles = db.profiles.map(p => ({ id: p.id, deleted: true, updatedAt: Math.max(now, p.updatedAt + 1) })); return db; }
  function setSettings(d, s, now = Date.now()) { const db = normDb(d); db.settings = { ziRule: s.ziRule === 'early' ? 'early' : 'split', useSolarTime: !!s.useSolarTime, updatedAt: Math.max(now, db.settings.updatedAt + 1) }; return db; }
  function wipeLocal() { lsDel(KEY_DB); lsDel(KEY_META); }

  // ---------- export / import ----------
  function exportText(d) { const db = normDb(d); return JSON.stringify({ app: 'bazi-profiles', schema: SCHEMA, exportedAt: new Date().toISOString(), profiles: db.profiles, settings: db.settings }, null, 2); }
  function exportName(date = new Date()) { const p = n => String(n).padStart(2, '0'); return `bazi-profiles-${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}.json`; }
  function parseImport(text) {
    let raw; try { raw = JSON.parse(text); } catch (e) { throw new Error('That file is not valid JSON.'); }
    if (!raw || !Array.isArray(raw.profiles)) throw new Error('That file has no profiles list. Use a file exported from this app.');
    const db = normDb(raw);
    return { db, count: live(db).length, skipped: raw.profiles.length - db.profiles.length };
  }
  function importInto(local, incoming, mode) { return mode === 'replace' ? merge(removeAll(local), incoming) : merge(local, incoming); }

  // ---------- meta (per device) ----------
  function getMeta() { return parse(lsGet(KEY_META), {}) || {}; }
  function setMeta(m) { lsSet(KEY_META, JSON.stringify(Object.assign(getMeta(), m))); }

  // ---------- sync config (per device) ----------
  function getSyncConfig() {
    const c = parse(lsGet(KEY_SYNC), null);
    return c && typeof c === 'object' ? { owner: clean(c.owner), repo: clean(c.repo), path: clean(c.path) || 'profiles.json', branch: clean(c.branch), token: clean(c.token), remember: !!c.remember } : null;
  }
  function setSyncConfig(c) {
    if (!c) { lsDel(KEY_SYNC); return; }
    const save = { owner: c.owner, repo: c.repo, path: c.path || 'profiles.json', branch: c.branch || '', remember: !!c.remember };
    if (c.remember) save.token = c.token; // token stays on this device only, and only if the user ticks Remember
    lsSet(KEY_SYNC, JSON.stringify(save));
  }

  // ---------- UTF-8 safe base64 ----------
  function b64encode(str) {
    if (typeof Buffer !== 'undefined' && typeof window === 'undefined') return Buffer.from(str, 'utf8').toString('base64');
    const bytes = new TextEncoder().encode(str); let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(bin);
  }
  function b64decode(b64) {
    const s = b64.replace(/\s/g, '');
    if (typeof Buffer !== 'undefined' && typeof window === 'undefined') return Buffer.from(s, 'base64').toString('utf8');
    const bin = atob(s); const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i); return new TextDecoder().decode(bytes);
  }

  // ---------- GitHub client ----------
  class SyncError extends Error { constructor(code, message) { super(message); this.code = code; } }
  function explain(status, body) {
    if (status === 401) return new SyncError('auth', 'GitHub rejected the token. Check it has not expired and paste it again.');
    if (status === 403) return /rate limit/i.test(body) ? new SyncError('rate', 'GitHub rate limit reached. Try again in a few minutes.') : new SyncError('perm', 'The token cannot write to this repo. Give it "Contents: Read and write" on the data repo.');
    if (status === 404) return new SyncError('notfound', 'Repo not found. Check the owner and repo name, and that the token includes this repo.');
    return new SyncError('http', `GitHub answered ${status}. Try again later.`);
  }
  function client(cfg, fetchFn) {
    const f = fetchFn || (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : null);
    const base = `https://api.github.com/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}/contents/${cfg.path.split('/').map(encodeURIComponent).join('/')}`;
    const headers = { 'Accept': 'application/vnd.github+json', 'Authorization': `Bearer ${cfg.token}`, 'X-GitHub-Api-Version': '2022-11-28' };
    async function get() {
      let r;
      try { r = await f(base + (cfg.branch ? `?ref=${encodeURIComponent(cfg.branch)}` : '') + (cfg.branch ? '&' : '?') + 't=' + Date.now(), { headers, cache: 'no-store' }); }
      catch (e) { throw new SyncError('network', 'Could not reach GitHub. Check your connection.'); }
      if (r.status === 404) {
        // distinguish "file missing" (fine, first sync) from "repo missing"
        let repoOk = false;
        try { const rr = await f(`https://api.github.com/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}`, { headers }); repoOk = rr.ok; } catch (e) { }
        if (repoOk) return { db: null, sha: null };
        throw explain(404, '');
      }
      if (!r.ok) throw explain(r.status, await r.text().catch(() => ''));
      const j = await r.json();
      let data; try { data = JSON.parse(b64decode(j.content || '')); } catch (e) { throw new SyncError('corrupt', 'The profiles file on GitHub is not valid JSON. Fix or delete it in the repo.'); }
      return { db: normDb(data), sha: j.sha };
    }
    async function put(db, sha, message) {
      const body = { message, content: b64encode(exportText(db)) };
      if (sha) body.sha = sha; if (cfg.branch) body.branch = cfg.branch;
      let r;
      try { r = await f(base, { method: 'PUT', headers: Object.assign({ 'Content-Type': 'application/json' }, headers), body: JSON.stringify(body) }); }
      catch (e) { throw new SyncError('network', 'Could not reach GitHub. Check your connection.'); }
      if (r.status === 409 || r.status === 422) return { conflict: true };
      if (!r.ok) throw explain(r.status, await r.text().catch(() => ''));
      const j = await r.json();
      return { sha: j.content && j.content.sha };
    }
    return { get, put };
  }
  /** Pull, merge with local, push if needed. Retries on a write conflict. Returns { db, pushed, pulled }. */
  async function sync(local, cfg, fetchFn, deviceLabel = 'a device') {
    const gh = client(cfg, fetchFn);
    for (let attempt = 0; attempt < 3; attempt++) {
      const remote = await gh.get();
      const merged = remote.db ? merge(local, remote.db) : normDb(local);
      const pulled = remote.db ? !sameDb(merged, local) : false;
      if (remote.db && sameDb(merged, remote.db)) return { db: merged, pushed: false, pulled };
      const n = live(merged).length;
      const res = await gh.put(merged, remote.sha, `Update ${n} profile${n === 1 ? '' : 's'} from ${deviceLabel}`);
      if (!res.conflict) return { db: merged, pushed: true, pulled };
      local = merged; // someone else wrote meanwhile: pull again and re-merge
    }
    throw new SyncError('conflict', 'Another device kept saving at the same time. Tap Sync now to try again.');
  }

  return { SCHEMA, emptyDb, newId, normProfile, normDb, merge, sameDb, live, loadDb, saveDb, upsert, remove, removeAll, setSettings, wipeLocal,
    exportText, exportName, parseImport, importInto, getMeta, setMeta, getSyncConfig, setSyncConfig, b64encode, b64decode, client, sync, SyncError,
    storageWorks: () => { lsGet(KEY_DB); try { localStorage.setItem('bazi.t', '1'); localStorage.removeItem('bazi.t'); } catch (e) { storageOk = false; } return storageOk; } };
});
