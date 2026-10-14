// Stage 4 storage and sync tests. Run: node test-store.js
const S = require('./store.js');
let pass = 0, fail = 0; const fails = [];
const ok = (c, m) => { c ? pass++ : (fail++, fails.push(m)); };
const P = (id, nick, t, extra = {}) => Object.assign({ id, nick, date: '1990-05-17', time: '14:30', gender: 'F', place: { name: 'Kuala Lumpur', zone: 'Asia/Kuala_Lumpur', lon: 101.69 }, notes: '', createdAt: 1, updatedAt: t }, extra);

// ---- normalisation keeps only allowed fields ----
{
  const p = S.normProfile(Object.assign(P('p1', 'Mei', 5), { fullName: 'Secret Name', ic: '900517-14-1234' }));
  ok(!('fullName' in p) && !('ic' in p), 'unknown fields are dropped');
  ok(S.normProfile({ id: 'x', date: 'bad', updatedAt: 1 }) === null, 'bad date rejected');
  ok(S.normProfile({ id: '../evil', date: '1990-01-01' }) === null, 'odd ids rejected');
  ok(S.normProfile(P('p2', '', 1)).nick === 'Unnamed', 'empty nickname gets a placeholder');
}
// ---- merge ----
{
  const a = { profiles: [P('p1', 'Mei old', 10), P('p2', 'Only A', 10)] };
  const b = { profiles: [P('p1', 'Mei new', 20), P('p3', 'Only B', 10)] };
  const m = S.merge(a, b);
  ok(S.live(m).length === 3, 'merge keeps profiles that exist on only one side');
  ok(m.profiles.find(p => p.id === 'p1').nick === 'Mei new', 'newer edit wins');
  ok(S.sameDb(S.merge(a, b), S.merge(b, a)), 'merge is order-independent');
  const del = S.remove(b, 'p3', 30);
  const m2 = S.merge(a, del);
  ok(!S.live(m2).some(p => p.id === 'p3'), 'deletion propagates as a tombstone');
  const revived = S.merge(m2, { profiles: [P('p3', 'Edited later', 40)] });
  ok(S.live(revived).some(p => p.id === 'p3'), 'an edit after the deletion wins');
  ok(S.sameDb(S.merge(m, m), m), 'merging with itself changes nothing');
}
// ---- upsert / remove / removeAll ----
{
  let db = S.emptyDb();
  let r = S.upsert(db, { nick: 'Ah Boy', date: '1985-01-02', time: null, gender: 'M' }, 100); db = r.db;
  ok(S.live(db).length === 1 && db.profiles[0].time === null, 'add profile with unknown time');
  r = S.upsert(db, { id: r.id, notes: '朋友 friend' }, 100); db = r.db;
  ok(db.profiles[0].notes === '朋友 friend' && db.profiles[0].updatedAt === 101, 'edit bumps updatedAt even within the same millisecond');
  ok(db.profiles[0].date === '1985-01-02', 'edit keeps other fields');
  db = S.removeAll(db, 200);
  ok(S.live(db).length === 0 && db.profiles.length === 1, 'delete all leaves tombstones');
  let threw = false; try { S.upsert(S.emptyDb(), { nick: 'x' }); } catch (e) { threw = true; } ok(threw, 'profile without a date is refused');
}
// ---- export / import ----
{
  const db = S.normDb({ profiles: [P('p1', '美玲', 5, { notes: '生日快乐 🎂' })] });
  const txt = S.exportText(db);
  const imp = S.parseImport(txt);
  ok(imp.count === 1 && imp.db.profiles[0].notes === '生日快乐 🎂', 'export → import round trip keeps Chinese and emoji');
  ok(/^bazi-profiles-2026-10-14\.json$/.test(S.exportName(new Date(2026, 9, 14))), 'dated export file name');
  let e1 = ''; try { S.parseImport('{oops'); } catch (e) { e1 = e.message; } ok(/not valid JSON/.test(e1), 'bad JSON explained');
  let e2 = ''; try { S.parseImport('{"a":1}'); } catch (e) { e2 = e.message; } ok(/no profiles list/.test(e2), 'wrong file explained');
  const local = S.normDb({ profiles: [P('p9', 'Local only', 5)] });
  ok(S.live(S.importInto(local, imp.db, 'merge')).length === 2, 'import merge keeps local-only profiles');
  ok(S.live(S.importInto(local, imp.db, 'replace')).length === 1, 'import replace removes local-only profiles');
}
// ---- base64 UTF-8 ----
{
  const s = '{"n":"梁美玲 · 庚午"}';
  ok(S.b64decode(S.b64encode(s)) === s, 'base64 round trip with Chinese');
}

// ---- sync against a mock GitHub ----
function mockGitHub({ repoExists = true, token = 'good' } = {}) {
  const st = { file: null, sha: null, n: 0, puts: 0, failNextPut: false };
  const res = (status, obj) => ({ ok: status >= 200 && status < 300, status, json: async () => obj, text: async () => JSON.stringify(obj) });
  const f = async (url, opt = {}) => {
    if ((opt.headers || {}).Authorization !== `Bearer ${token}`) return res(401, { message: 'Bad credentials' });
    if (!repoExists) return res(404, {});
    if (!/\/contents\//.test(url)) return res(200, { name: 'repo' });
    if (!opt.method) return st.file === null ? res(404, {}) : res(200, { content: st.file, sha: st.sha });
    const body = JSON.parse(opt.body);
    if (st.failNextPut) { st.failNextPut = false; st.file = S.b64encode(S.exportText({ profiles: [P('px', 'Written by phone', 999)] })); st.sha = 's' + (++st.n); return res(409, {}); }
    if ((body.sha || null) !== st.sha) return res(409, {});
    st.file = body.content; st.sha = 's' + (++st.n); st.puts++;
    return res(200, { content: { sha: st.sha } });
  };
  return { st, f };
}
const cfg = { owner: 'me', repo: 'bazi-data', path: 'profiles.json', token: 'good' };
(async () => {
  {
    const gh = mockGitHub();
    const laptop = S.normDb({ profiles: [P('p1', 'Mei', 10)] });
    const r1 = await S.sync(laptop, cfg, gh.f, 'laptop');
    ok(r1.pushed && gh.st.puts === 1, 'first sync creates the file');
    const phone = S.normDb({ profiles: [P('p2', 'Ah Boy', 12)] });
    const r2 = await S.sync(phone, cfg, gh.f, 'phone');
    ok(S.live(r2.db).length === 2 && r2.pulled && r2.pushed, 'phone pulls laptop profile and pushes its own');
    const r3 = await S.sync(r1.db, cfg, gh.f, 'laptop');
    ok(S.live(r3.db).length === 2 && !r3.pushed, 'laptop then pulls without an extra write');
    const r4 = await S.sync(S.remove(r3.db, 'p2', 50), cfg, gh.f, 'laptop');
    const r5 = await S.sync(r2.db, cfg, gh.f, 'phone');
    ok(!S.live(r5.db).some(p => p.id === 'p2'), 'deletion on laptop reaches the phone');
    const remote = JSON.parse(S.b64decode(gh.st.file));
    ok(remote.profiles.every(p => p.deleted || !('fullName' in p)), 'remote file holds only allowed fields');
  }
  {
    const gh = mockGitHub(); gh.st.failNextPut = true;
    const r = await S.sync(S.normDb({ profiles: [P('p1', 'Mei', 10)] }), cfg, gh.f, 'laptop');
    ok(S.live(r.db).length === 2, 'write conflict: re-pulls, merges the other device, retries');
  }
  {
    let msg = ''; try { await S.sync(S.emptyDb(), Object.assign({}, cfg, { token: 'bad' }), mockGitHub().f); } catch (e) { msg = e.code; }
    ok(msg === 'auth', 'bad token gives a clear auth error');
    let m2 = ''; try { await S.sync(S.emptyDb(), cfg, mockGitHub({ repoExists: false }).f); } catch (e) { m2 = e.code; }
    ok(m2 === 'notfound', 'missing repo gives a clear not-found error');
    let m3 = ''; try { await S.sync(S.emptyDb(), cfg, async () => { throw new TypeError('offline'); }); } catch (e) { m3 = e.code; }
    ok(m3 === 'network', 'offline gives a network error');
  }
  console.log(`${pass} passed, ${fail} failed`);
  fails.forEach(f => console.log('  FAIL', f));
  process.exit(fail ? 1 : 0);
})();
