/* BaZi compatibility rules — Stage 3.
 * Fixed rules; the point values are MY weighting (basis 'own') and are the least certain part
 * of the tool. Each reason carries: text, pts (score effect), why [{who:'A'|'B', p, part}], basis.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./engine.js'), require('./rules.js'));
  else root.BaziCompat = factory(root.BaziEngine, root.BaziRules);
})(typeof self !== 'undefined' ? self : this, function (E, RL) {
  'use strict';
  const S = E.STEMS, B = E.BRANCHES, EL = E.ELEMENTS, EL_ZH = RL.EL_ZH, GOD_ZH = RL.GOD_ZH;
  const elTxt = i => `${EL[i]} ${EL_ZH[i]}`;
  const godTxt = k => `${E.TEN_GODS[k].name} (${GOD_ZH[k]})`;
  const PAL_LIFE = { year: 'social circle', month: 'work and career', day: 'intimacy and home', hour: 'children and long-term plans' };
  const W = {
    love: { day: 1.5, hour: 1.0, month: 0.8, year: 0.8 },
    work: { month: 1.5, year: 1.0, day: 0.8, hour: 0.6 },
  };
  const BASE = { combo: 2, half: 1.5, clash: -2.5, harm: -1.5, punish: -1.5, selfpunish: -0.8 };

  function positions(chart) { return chart.pillars.filter(Boolean).map(p => ({ p: p.palace, stem: p.stem, branch: p.branch })); }

  // all branch interactions between one pillar of A and one pillar of B
  function crossBranch(cA, cB) {
    const out = [];
    positions(cA).forEach(a => positions(cB).forEach(b => {
      RL.findInteractions([{ p: 'A', stem: a.stem, branch: a.branch }, { p: 'B', stem: b.stem, branch: b.branch }])
        .filter(x => x.part === 'branch')
        .forEach(x => out.push({ kind: x.kind, name: x.name, zh: x.zh, tone: x.tone, el: x.el, a: a.p, b: b.p, ab: B[a.branch].zh, bb: B[b.branch].zh }));
    }));
    return out;
  }

  // weighted element shares (stems 1, hidden 1 / 0.5 / 0.3)
  function elementShares(chart) {
    const w = [0, 0, 0, 0, 0];
    chart.pillars.forEach(p => { if (!p) return; w[S[p.stem].el] += 1; B[p.branch].hidden.forEach((s, i) => (w[S[s].el] += [1, 0.5, 0.3][i])); });
    const t = w.reduce((a, b) => a + b, 0);
    return w.map(x => x / t);
  }
  function supply(needStr, giverChart) {
    const sh = elementShares(giverChart);
    let good = 0, bad = 0;
    needStr.usefulEls.forEach(e => (good += sh[e]));
    needStr.unfavEls.forEach(e => (bad += sh[e]));
    return { score: good - bad, good, bad, top: sh.map((v, i) => [i, v]).sort((a, b) => b[1] - a[1])[0][0] };
  }

  const name = (who, nick) => nick[who];

  function compare(A, B_, now = new Date()) {
    // A, B_: { chart, reading, nick }
    const cA = A.chart, cB = B_.chart, rA = A.reading, rB = B_.reading;
    const nick = { A: A.nick || 'Person A', B: B_.nick || 'Person B' };
    const dA = cA.dayMaster, dB = cB.dayMaster;
    const elA = S[dA].el, elB = S[dB].el;
    const godBforA = E.tenGod(dA, dB); // what B's Day Master is to A
    const godAforB = E.tenGod(dB, dA);
    const roleBforA = RL.GROUP_OF[godBforA], roleAforB = RL.GROUP_OF[godAforB];
    const dmWhy = [{ who: 'A', p: 'day', part: 'stem' }, { who: 'B', p: 'day', part: 'stem' }];
    const love = [], work = [], shared = [];
    const add = (list, text, pts, why, basis = 'own', extra = {}) => list.push(Object.assign({ text, pts: Math.round(pts * 10) / 10, why, basis }, extra));

    // ---------- 1. Day Master relationship ----------
    let rel, relText;
    const d = (elB - elA + 5) % 5;
    if (d === 0) { rel = 'match'; relText = `Both Day Masters are ${elTxt(elA)}: you match. You understand each other's instincts, and can also compete for the same space.`; }
    else if (d === 1) { rel = 'AfeedsB'; relText = `${nick.A}'s ${elTxt(elA)} feeds ${nick.B}'s ${elTxt(elB)}: ${nick.A} naturally gives, encourages and invests in ${nick.B}.`; }
    else if (d === 4) { rel = 'BfeedsA'; relText = `${nick.B}'s ${elTxt(elB)} feeds ${nick.A}'s ${elTxt(elA)}: ${nick.B} naturally gives, encourages and invests in ${nick.A}.`; }
    else if (d === 2) { rel = 'ApressesB'; relText = `${nick.A}'s ${elTxt(elA)} controls ${nick.B}'s ${elTxt(elB)}: ${nick.A} tends to steer, and ${nick.B} can feel pressed.`; }
    else { rel = 'BpressesA'; relText = `${nick.B}'s ${elTxt(elB)} controls ${nick.A}'s ${elTxt(elA)}: ${nick.B} tends to steer, and ${nick.A} can feel pressed.`; }
    shared.push({ text: relText, why: dmWhy, basis: 'standard', rel });

    const stemX = RL.findInteractions([{ p: 'A', stem: dA, branch: 0 }, { p: 'B', stem: dB, branch: 1 }]).filter(x => x.part === 'stem');
    const dmCombo = stemX.some(x => x.kind === 'stemcombo'), dmClash = stemX.some(x => x.kind === 'stemclash');
    if (dmCombo) {
      add(love, `Day Masters combine (天干五合, ${S[dA].zh}${S[dB].zh}): a classic sign of natural attraction and feeling at ease together.`, 12, dmWhy, 'standard');
      add(work, `Day Masters combine (${S[dA].zh}${S[dB].zh}): easy rapport and quick agreement.`, 4, dmWhy, 'standard');
    }
    if (dmClash) {
      add(love, `Day Masters clash (天干相冲, ${S[dA].zh}${S[dB].zh}): strong opinions on both sides; disagreements are open.`, -8, dmWhy, 'standard');
      add(work, `Day Masters clash (${S[dA].zh}${S[dB].zh}): different instincts about how to do things; agree roles early.`, -5, dmWhy, 'standard');
    }
    // DM element flow
    const pressed = rel === 'ApressesB' ? 'B' : rel === 'BpressesA' ? 'A' : null;
    const pressedStrong = pressed && (pressed === 'A' ? rA : rB).strength.leanStrong;
    if (rel === 'AfeedsB' || rel === 'BfeedsA') { add(love, 'One Day Master feeds the other: care flows naturally in one direction.', 4, dmWhy, 'standard'); add(work, 'One Day Master feeds the other: a natural mentor-and-doer pairing.', 6, dmWhy, 'standard'); }
    if (rel === 'match') {
      const bothStrong = rA.strength.leanStrong && rB.strength.leanStrong;
      add(love, 'Matching Day Masters: you feel like equals.', 2, dmWhy, 'standard');
      add(work, bothStrong ? 'Matching Day Masters and both strong: two captains; split areas of ownership.' : 'Matching Day Masters: you work as peers and back each other up.', bothStrong ? -2 : 3, dmWhy, 'standard');
    }
    if (pressed) {
      const t = pressedStrong ? `${nick[pressed]} is a strong Day Master, so the other's control gives useful structure rather than strain.` : `${nick[pressed]} is a Day Master that needs support, so the other's control can feel heavy. Gentleness matters.`;
      add(love, t, pressedStrong ? 2 : -3, dmWhy, 'standard');
      add(work, t, pressedStrong ? 3 : -3, dmWhy, 'standard');
    }

    // ---------- 2. Spouse-star match (love) ----------
    [['A', godBforA, cA], ['B', godAforB, cB]].forEach(([who, g, c]) => {
      const male = c.input.gender === 'M';
      const pts = male ? { DW: 8, IW: 5 }[g] : { DO: 8, SK: 4 }[g];
      if (pts) add(love, `To ${nick[who]}, the other's Day Master is ${godTxt(g)}, the classic partner star for a ${male ? 'man' : 'woman'}.`, pts, dmWhy, 'standard');
    });

    // ---------- 3. Spouse palace (day branches) ----------
    const dayWhy = [{ who: 'A', p: 'day', part: 'branch' }, { who: 'B', p: 'day', part: 'branch' }];
    const cross = crossBranch(cA, cB);
    const dd = cross.filter(x => x.a === 'day' && x.b === 'day');
    const SP = { combo: [14, 'pull together strongly: closeness and loyalty at home'], half: [8, 'work as a team: shared goals for home life'], triple: [8, 'work as a team'], clash: [-14, 'clash: home life sees push-and-pull, moves and arguments; give each other space'], harm: [-8, 'have hidden friction: small hurts can build up unless talked through'], punish: [-8, 'test each other: high expectations and pressure at home'], selfpunish: [-4, 'are the same restless sign: you mirror each other\'s moods'] };
    dd.forEach(x => { const [pts, t] = SP[x.kind] || [0, '']; if (pts) add(love, `Spouse palaces ${x.ab} and ${x.bb} ${t} (${x.zh}).`, pts, dayWhy, 'standard', { tone: pts > 0 ? 'good' : 'bad' }); });
    if (cA.pillars[2].branch === cB.pillars[2].branch && !dd.some(x => x.kind === 'selfpunish')) add(love, `Both spouse palaces are ${B[cA.pillars[2].branch].zh}: you want the same things from home life.`, 3, dayWhy, 'standard', { tone: 'good' });
    if (!dd.length && cA.pillars[2].branch !== cB.pillars[2].branch) add(love, `Spouse palaces ${B[cA.pillars[2].branch].zh} and ${B[cB.pillars[2].branch].zh} neither combine nor clash: a neutral base that depends on the rest of the charts.`, 0, dayWhy, 'standard');

    // ---------- 4. Other cross-pillar branch interactions, weighted by pillar ----------
    function weighted(view, list, skip) {
      let sum = 0; const items = [];
      cross.filter(x => !skip(x)).forEach(x => {
        const base = BASE[x.kind === 'triple' ? 'half' : x.kind]; if (!base) return;
        const w = (W[view][x.a] + W[view][x.b]) / 2;
        items.push({ x, pts: base * w });
        sum += base * w;
      });
      const cap = 15, scale = Math.abs(sum) > cap ? cap / Math.abs(sum) : 1;
      items.sort((p, q) => Math.abs(q.pts) - Math.abs(p.pts)).forEach(({ x, pts }) => {
        const where = x.a === x.b ? `both ${x.a} pillars (${PAL_LIFE[x.a]})` : `${nick.A}'s ${x.a} and ${nick.B}'s ${x.b} pillars (${PAL_LIFE[x.a]} / ${PAL_LIFE[x.b]})`;
        add(list, `${x.name} ${x.zh} ${x.ab}–${x.bb} between ${where}.`, pts * scale, [{ who: 'A', p: x.a, part: 'branch' }, { who: 'B', p: x.b, part: 'branch' }], 'own', { tone: x.tone });
      });
    }
    weighted('love', love, x => x.a === 'day' && x.b === 'day');
    // work: month-month first, as the main signal
    const mm = cross.filter(x => x.a === 'month' && x.b === 'month');
    const MM = { combo: [12, 'combine: you click on how work should be done'], half: [8, 'form a team: shared direction at work'], triple: [8, 'form a team'], clash: [-12, 'clash: different working rhythms and priorities'], harm: [-6, 'have hidden friction: credit and expectations need to be spelled out'], punish: [-6, 'test each other: high standards and pressure at work'], selfpunish: [-3, 'are the same restless sign at work'] };
    const monthWhy = [{ who: 'A', p: 'month', part: 'branch' }, { who: 'B', p: 'month', part: 'branch' }];
    mm.forEach(x => { const [pts, t] = MM[x.kind] || [0, '']; if (pts) add(work, `Career pillars ${x.ab} and ${x.bb} ${t} (${x.zh}).`, pts, monthWhy, 'standard', { tone: pts > 0 ? 'good' : 'bad' }); });
    if (!mm.length) add(work, `Career pillars ${B[cA.pillars[1].branch].zh} and ${B[cB.pillars[1].branch].zh} neither combine nor clash: no strong pull either way at work.`, 0, monthWhy, 'standard');
    weighted('work', work, x => x.a === 'month' && x.b === 'month');

    // ---------- 5. Element balance ----------
    const sA = supply(rA.strength, cB), sB = supply(rB.strength, cA);
    const allWhy = who => (who === 'A' ? cA : cB).pillars.filter(Boolean).map(p => ({ who, p: p.palace, part: 'both' }));
    [['A', 'B', sA], ['B', 'A', sB]].forEach(([need, give, s]) => {
      const needR = need === 'A' ? rA : rB;
      const want = [...needR.strength.usefulEls].map(elTxt).join(', ');
      const t = s.score > 0.15 ? `${nick[give]}'s chart is rich in what ${nick[need]} needs (${want}).` : s.score < -0.15 ? `${nick[give]}'s chart leans towards elements ${nick[need]} should go easy on; ${nick[need]} may feel drained over time.` : `${nick[give]}'s chart is neutral for ${nick[need]}'s needs (${want}).`;
      add(love, t, s.score * 6, allWhy(give).concat([{ who: need, p: 'day', part: 'stem' }]), 'own', { tone: s.score > 0.15 ? 'good' : s.score < -0.15 ? 'bad' : undefined });
      add(work, t, s.score * 5, allWhy(give).concat([{ who: need, p: 'day', part: 'stem' }]), 'own', { tone: s.score > 0.15 ? 'good' : s.score < -0.15 ? 'bad' : undefined });
    });

    // ---------- 6. Ten gods between the two people (who leads / supports / feels pressure) ----------
    const ROLE_LINE = {
      Peer: (x, y) => `${y} sees ${x} as an equal (比劫): a partner, a friend, sometimes a rival.`,
      Resource: (x, y) => `${y} experiences ${x} as support: ${x} protects, teaches and backs ${y}.`,
      Output: (x, y) => `${y} expresses through ${x}: ${y} looks after, teaches or guides ${x}.`,
      Wealth: (x, y) => `${y} relates to ${x} as something to manage and look after: ${y} tends to lead and provide.`,
      Officer: (x, y) => `${y} feels ${x} as authority: ${x} tends to lead, and ${y} can feel pressure.`,
    };
    const dyn = [
      { text: `${ROLE_LINE[roleBforA](nick.B, nick.A)} (${nick.B} is ${godTxt(godBforA)} to ${nick.A}.)`, why: dmWhy, basis: 'standard' },
      { text: `${ROLE_LINE[roleAforB](nick.A, nick.B)} (${nick.A} is ${godTxt(godAforB)} to ${nick.B}.)`, why: dmWhy, basis: 'standard' },
    ];
    let leader = null;
    if (roleBforA === 'Officer' || roleAforB === 'Wealth') leader = 'B';
    if (roleAforB === 'Officer' || roleBforA === 'Wealth') leader = leader === 'B' ? null : 'A';
    if (roleBforA === 'Resource' && roleAforB === 'Output') leader = 'B';
    if (roleAforB === 'Resource' && roleBforA === 'Output') leader = 'A';
    // work: Output and Resource stars in each other's career pillar
    [['A', cA, cB], ['B', cB, cA]].forEach(([who, me, other]) => {
      const m = other.pillars[1];
      const gods = [E.tenGod(me.dayMaster, m.stem), E.tenGod(me.dayMaster, B[m.branch].hidden[0])];
      const otherWho = who === 'A' ? 'B' : 'A';
      const res = gods.filter(g => RL.GROUP_OF[g] === 'Resource').length, out = gods.filter(g => RL.GROUP_OF[g] === 'Output').length;
      const why = [{ who: otherWho, p: 'month', part: 'both' }, { who, p: 'day', part: 'stem' }];
      if (res) add(work, `${nick[otherWho]}'s career pillar carries Resource (印) for ${nick[who]}: ${nick[otherWho]} brings know-how, backing or credentials ${nick[who]} can lean on.`, 2 * res, why, 'own', { tone: 'good' });
      if (out) add(work, `${nick[otherWho]}'s career pillar carries Output (食伤) for ${nick[who]}: ${nick[who]}'s ideas find a channel through ${nick[otherWho]}.`, 2 * out, why, 'own', { tone: 'good' });
    });
    // working styles
    const sa = rA.strength.leanStrong, sb = rB.strength.leanStrong;
    const strWhy = [{ who: 'A', p: 'day', part: 'stem' }, { who: 'A', p: 'month', part: 'branch' }, { who: 'B', p: 'day', part: 'stem' }, { who: 'B', p: 'month', part: 'branch' }];
    if (sa !== sb) add(work, `${nick[sa ? 'A' : 'B']} is the stronger Day Master and ${nick[sa ? 'B' : 'A']} needs more support: a natural lead-and-support split.`, 4, strWhy, 'own', { tone: 'good' });
    else if (sa) add(work, 'Both Day Masters are strong: lots of drive, but both want the final say. Divide ownership clearly.', -2, strWhy, 'own', { tone: 'bad' });
    else add(work, 'Both Day Masters need support: you are considerate partners but may both wait for the other to decide. Agree who leads what.', -2, strWhy, 'own', { tone: 'bad' });

    // ---------- 7. Luck pillars now ----------
    const lr = [rA.current.luckRating, rB.current.luckRating];
    const luckWhy = [];
    if (rA.current.luck) luckWhy.push({ who: 'A', p: 'luck', part: 'both' });
    if (rB.current.luck) luckWhy.push({ who: 'B', p: 'luck', part: 'both' });
    if (lr.every(Boolean)) {
      const both = lr[0] === lr[1] ? lr[0] : null;
      const pts = both === 'supportive' ? 3 : both === 'challenging' ? -3 : 0;
      const t = both === 'supportive' ? 'Both of you are in supportive 10-year luck pillars: a good period to build something together.' : both === 'challenging' ? 'Both of you are in challenging 10-year luck pillars: be patient with each other; outside pressure is high.' : `Your 10-year luck pillars are ${lr[0]} for ${nick.A} and ${lr[1]} for ${nick.B}: one of you may need to carry more for now.`;
      add(love, t, pts, luckWhy, 'own'); add(work, t, pts, luckWhy, 'own');
    } else {
      const t = 'At least one of you has not started a 10-year luck pillar yet, so this factor is left out.';
      add(love, t, 0, luckWhy.length ? luckWhy : dmWhy, 'own'); add(work, t, 0, luckWhy.length ? luckWhy : dmWhy, 'own');
    }

    // ---------- scores ----------
    const score = list => { const raw = 50 + list.reduce((a, r) => a + r.pts, 0); return Math.max(5, Math.min(95, Math.round(raw))); };
    const label = s => s >= 80 ? ['Very good match', '上'] : s >= 65 ? ['Good match', '中上'] : s >= 50 ? ['Workable', '中'] : s >= 35 ? ['Needs effort', '中下'] : ['Challenging', '下'];
    const sortR = l => l.slice().sort((p, q) => Math.abs(q.pts) - Math.abs(p.pts));
    const caveat = [];
    ['A', 'B'].forEach(w => { if (!(w === 'A' ? cA : cB).pillars[3]) caveat.push(`${nick[w]}'s birth time is unknown, so their hour pillar is left out of both scores.`); });
    const lv = score(love), wk = score(work);
    return {
      nick, rel, godBforA, godAforB, leader, shared, dynamics: dyn, caveat,
      love: { score: lv, label: label(lv), reasons: sortR(love) },
      work: { score: wk, label: label(wk), reasons: sortR(work) },
      cross,
    };
  }

  // ---------------- relationship-specific guides ----------------
  // Spouse uses the love view and Colleague the work view. Family and Boss add their own signals on top of the
  // shared ones. Every point value here is my weighting; the interactions themselves are standard.
  const scoreOf = list => Math.max(5, Math.min(95, Math.round(50 + list.reduce((a, r) => a + r.pts, 0))));
  const labelOf = s => s >= 80 ? ['Very good match', '上'] : s >= 65 ? ['Good match', '中上'] : s >= 50 ? ['Workable', '中'] : s >= 35 ? ['Needs effort', '中下'] : ['Challenging', '下'];
  const R1 = x => Math.round(x * 10) / 10;
  const TYPES = {
    spouse: { name: 'Spouse or partner', zh: '夫妻', icon: 'heart', focus: 'day pillar (spouse palace), partner stars, Day Master attraction' },
    family: { name: 'Family', zh: '家人', icon: 'people', focus: 'year pillar (family palace), how the Day Masters feed each other, parent and child stars' },
    colleague: { name: 'Colleague', zh: '同事', icon: 'briefcase', focus: 'month pillar (career palace), Output and Resource, working styles' },
    boss: { name: 'Boss and report', zh: '上下级', icon: 'sliders', focus: 'who naturally leads, career palace, working styles' },
  };
  function relation(A, B_, type, opts = {}, now = new Date()) {
    const res = compare(A, B_, now), cA = A.chart, cB = B_.chart, rA = A.reading, rB = B_.reading, nick = res.nick;
    const dmWhy = [{ who: 'A', p: 'day', part: 'stem' }, { who: 'B', p: 'day', part: 'stem' }];
    const out = { type, ...TYPES[type], res };
    if (type === 'spouse') { out.reasons = res.love.reasons; }
    else if (type === 'colleague') { out.reasons = res.work.reasons; }
    else if (type === 'boss') {
      const boss = opts.boss === 'B' ? 'B' : 'A', rep = boss === 'A' ? 'B' : 'A';
      const C = { A: cA, B: cB }, Rr = { A: rA, B: rB };
      const bossToRep = RL.GROUP_OF[E.tenGod(C[rep].dayMaster, C[boss].dayMaster)];   // what the boss is to the report
      const repToBoss = RL.GROUP_OF[E.tenGod(C[boss].dayMaster, C[rep].dayMaster)];   // what the report is to the boss
      const L = [];
      const add = (pts, text, basis = 'own', tone) => L.push({ text, pts: R1(pts), why: dmWhy, basis, tone: tone || (pts > 0 ? 'good' : pts < 0 ? 'bad' : undefined) });
      const B2R = {
        Officer: [6, `To ${nick[rep]}, ${nick[boss]} is an Officer star 官杀: natural authority. ${nick[rep]} accepts direction from ${nick[boss]} without much friction.`],
        Resource: [6, `To ${nick[rep]}, ${nick[boss]} is a Resource star 印: a mentor who protects and teaches. A supportive boss.`],
        Peer: [-2, `${nick[boss]} and ${nick[rep]} are the same element 比劫: it feels like working with an equal. Set roles and decision rights clearly.`],
        Output: [-4, `To ${nick[rep]}, ${nick[boss]} is an Output star 食伤: ${nick[rep]} instinctively wants to guide or correct the boss. Can feel like the roles are reversed.`],
        Wealth: [-5, `To ${nick[rep]}, ${nick[boss]} is a Wealth star 财: ${nick[rep]} tends to try to manage the boss. Expect quiet tussles over control.`],
      }[bossToRep];
      add(B2R[0], B2R[1], 'standard');
      const R2B = {
        Output: [3, `To ${nick[boss]}, ${nick[rep]} is an Output star 食伤: the boss enjoys teaching and developing ${nick[rep]}.`],
        Wealth: [3, `To ${nick[boss]}, ${nick[rep]} is a Wealth star 财: the boss knows how to direct ${nick[rep]} and use their strengths.`],
        Resource: [2, `To ${nick[boss]}, ${nick[rep]} is a Resource star 印: ${nick[rep]} supports and steadies the boss.`],
        Peer: [0, `To ${nick[boss]}, ${nick[rep]} is a peer 比劫.`],
        Officer: [-4, `To ${nick[boss]}, ${nick[rep]} is an Officer star 官杀: the boss feels pressured or challenged by ${nick[rep]}.`],
      }[repToBoss];
      add(R2B[0], R2B[1], 'standard');
      const sb = Rr[boss].strength.leanStrong, sr = Rr[rep].strength.leanStrong;
      if (sb && !sr) add(2, `${nick[boss]} is the stronger Day Master: a clear lead-and-support split.`);
      if (!sb && sr) add(-2, `${nick[rep]} is the stronger Day Master: the report may outshine or push the boss.`);
      out.boss = boss; out.reasons = L.concat(res.work.reasons.filter(r => !/lead-and-support|two captains|Both Day Masters need support/.test(r.text)));
      out.extraTitle = `${nick[boss]} is the boss`;
    } else if (type === 'family') {
      const L = [];
      const add = (pts, text, why, basis = 'own') => L.push({ text, pts: R1(pts), why, basis, tone: pts > 0 ? 'good' : pts < 0 ? 'bad' : undefined });
      const FAM = { combo: 8, half: 5, triple: 5, clash: -8, harm: -4, punish: -4, selfpunish: -2, destroy: -2 };
      const PW = { year: 1, month: 0.6, day: 0.6, hour: 0.4 };
      res.cross.filter(x => FAM[x.kind] !== undefined).forEach(x => {
        const w = Math.min(PW[x.a], PW[x.b]) * (x.a === x.b ? 1 : 0.7);
        const where = x.a === x.b ? `both ${x.a} pillars` : `${nick.A}'s ${x.a} and ${nick.B}'s ${x.b} pillars`;
        add(FAM[x.kind] * w, `${x.name} ${x.zh} ${x.ab}–${x.bb} between ${where}${x.a === 'year' && x.b === 'year' ? ' (the family palaces)' : ''}.`, [{ who: 'A', p: x.a, part: 'branch' }, { who: 'B', p: x.b, part: 'branch' }]);
      });
      const rel = res.rel;
      if (rel === 'AfeedsB' || rel === 'BfeedsA') add(5, `${nick[rel === 'AfeedsB' ? 'A' : 'B']} naturally nurtures ${nick[rel === 'AfeedsB' ? 'B' : 'A']} (one Day Master feeds the other).`, dmWhy, 'standard');
      if (rel === 'match') add(3, 'Same Day Master element: you understand each other, though you can be stubborn in the same ways.', dmWhy, 'standard');
      if (rel === 'ApressesB' || rel === 'BpressesA') { const pr = rel === 'ApressesB' ? 'B' : 'A'; const strong = (pr === 'A' ? rA : rB).strength.leanStrong; add(strong ? 1 : -3, strong ? `${nick[pr]} is strong enough that the other's control feels like guidance.` : `${nick[pr]} can feel controlled or criticised by the other. Gentleness helps.`, dmWhy, 'standard'); }
      res.love.reasons.filter(r => /Day Masters (combine|clash)/.test(r.text)).forEach(r => add(r.pts > 0 ? 5 : -5, r.pts > 0 ? 'Day Masters combine: an easy, natural bond.' : 'Day Masters clash: strong opinions on both sides.', dmWhy, 'standard'));
      res.work.reasons.filter(r => /chart is rich in|leans towards elements|is neutral for/.test(r.text)).forEach(r => add(r.pts, r.text, r.why));
      // parent and child
      const parent = opts.parent === 'A' || opts.parent === 'B' ? opts.parent : null;
      if (parent) {
        const child = parent === 'A' ? 'B' : 'A', C = { A: cA, B: cB };
        const pc = C[parent], cc = C[child];
        // the parent's hour pillar is the children palace
        if (pc.pillars[3]) res.cross.filter(x => (parent === 'A' ? x.a : x.b) === 'hour' && (parent === 'A' ? x.b : x.a) === 'day' && FAM[x.kind] !== undefined)
          .forEach(x => add(FAM[x.kind] * 0.75, `${x.name} ${x.zh} between ${nick[parent]}'s children palace (hour) and ${nick[child]}'s day branch: ${FAM[x.kind] > 0 ? 'a close parent and child bond' : 'friction between parent and child'}.`, [{ who: parent, p: 'hour', part: 'branch' }, { who: child, p: 'day', part: 'branch' }], 'standard'));
        // child star: Officer for a father, Output for a mother
        const g = RL.GROUP_OF[E.tenGod(pc.dayMaster, cc.dayMaster)], want = pc.input.gender === 'M' ? 'Officer' : 'Output';
        if (g === want) add(4, `To ${nick[parent]}, ${nick[child]}'s Day Master is the classic child star (${want === 'Officer' ? '官杀 for a father' : '食伤 for a mother'}).`, dmWhy, 'standard');
        if (RL.GROUP_OF[E.tenGod(cc.dayMaster, pc.dayMaster)] === 'Resource') add(4, `To ${nick[child]}, ${nick[parent]} is a Resource star 印: a protective, supportive parent.`, dmWhy, 'standard');
        out.extraTitle = `${nick[parent]} is the parent`;
      }
      out.reasons = L.sort((a, b) => Math.abs(b.pts) - Math.abs(a.pts));
    }
    out.score = scoreOf(out.reasons); out.label = labelOf(out.score);
    return out;
  }

  // ---------------- plain-language layer for the guide ----------------
  // Turns each technical reason into: a theme, an everyday sentence and, for weak spots, a practical tip.
  const LIFE = { year: 'social life and family', month: 'work and daily routine', day: 'home life and closeness', hour: 'plans, children and the long term' };
  const VERB = { Combination: 'support each other in', 'Half harmony': 'pull in the same direction in', 'Full harmony': 'pull in the same direction in', Clash: 'clash over', Harm: 'quietly irritate each other around', Punishment: 'put pressure on each other around', 'Self-punishment': 'mirror each other\'s moods around', Destruction: 'have small breakages around', 'Arching combination': 'have a hidden pull around', 'Hidden combination': 'have a quiet, behind-the-scenes bond around' };
  const THEME = {
    spouse: { attraction: 'Attraction 吸引', home: 'Home life 家庭', dynamic: 'How you treat each other 相处', energy: 'Energy between you 能量', links: 'Other ties between your charts', timing: 'Timing 时运' },
    family: { bond: 'Family bond 亲情', care: 'Who looks after whom 照顾', energy: 'Energy between you 能量', links: 'Other ties between your charts', timing: 'Timing 时运' },
    colleague: { rhythm: 'Working rhythm 节奏', roles: 'Roles 分工', energy: 'Energy between you 能量', links: 'Other ties between your charts', timing: 'Timing 时运' },
    boss: { lead: 'Who leads 主导', rhythm: 'Working rhythm 节奏', roles: 'Roles 分工', energy: 'Energy between you 能量', links: 'Other ties between your charts', timing: 'Timing 时运' },
  };
  function explain(r, type, nick, useA, useB) {
    const t = r.text, neg = r.pts < 0;
    let cat = 'links', plain = t, tip = '';
    const m = (re) => t.match(re);
    let x;
    if (/Day Masters combine/.test(t)) { cat = type === 'spouse' ? 'attraction' : type === 'family' ? 'bond' : 'rhythm'; plain = 'You click naturally: being together feels easy and you often agree without trying.'; }
    else if (/Day Masters clash/.test(t)) { cat = type === 'spouse' ? 'attraction' : type === 'family' ? 'bond' : 'rhythm'; plain = 'You both have strong, different instincts, so disagreements come up openly and often.'; tip = 'Agree how you will decide things before big choices, and argue about the issue, not the person.'; }
    else if (/partner star/.test(t)) { cat = 'attraction'; x = m(/To (.+?), the other/); plain = `${x ? x[1] : 'One of you'} sees the other as the "right type" of partner.`; }
    else if (/^Spouse palaces/.test(t) || /^Both spouse palaces/.test(t)) {
      cat = 'home';
      if (/clash/.test(t)) { plain = 'Home life is where you rub against each other: routines, space, money at home, how the house is run.'; tip = 'Give each other personal space and agree house rules early. Avoid making big home decisions in a rush.'; }
      else if (/hidden friction/.test(t)) { plain = 'Small hurts at home can pile up without being said.'; tip = 'Have a regular, calm check-in so small things do not build up.'; }
      else if (/test each other/.test(t)) { plain = 'You expect a lot from each other at home.'; tip = 'Say what you expect out loud, and praise more than you correct.'; }
      else if (/mirror/.test(t)) { plain = 'You pick up each other\'s moods quickly, good or bad.'; tip = 'When one of you is low, let the other stay steady rather than follow.'; }
      else if (/neither combine nor clash/.test(t)) { plain = 'No strong pull or push at home; the rest of the chart decides how home life feels.'; }
      else plain = 'You want the same kind of home life and feel at home with each other.';
    }
    else if (/^Career pillars/.test(t)) {
      cat = 'rhythm';
      if (/clash/.test(t)) { plain = 'You work to different rhythms and priorities.'; tip = 'Write down who owns what and agree deadlines up front.'; }
      else if (/hidden friction/.test(t)) { plain = 'Credit and expectations at work can quietly go wrong.'; tip = 'Agree in writing who gets credit for what.'; }
      else if (/test each other/.test(t)) { plain = 'You push each other hard at work.'; tip = 'Keep the pressure on the work, not on each other.'; }
      else if (/neither/.test(t)) plain = 'No strong pull or push in how you each like to work.';
      else plain = 'You agree on how work should be done, so things move quickly.';
    }
    else if (/chart is rich in what/.test(t)) { cat = 'energy'; x = m(/^(.+?)'s chart is rich in what (.+?) needs/); plain = x ? `Being around ${x[1]} recharges ${x[2]}.` : t; }
    else if (/leans towards elements/.test(t)) { cat = 'energy'; x = m(/^(.+?)'s chart leans towards elements (.+?) should go easy on/); plain = x ? `Over time, ${x[1]}'s energy tires ${x[2]} out.` : t; const need = x && x[2] === nick.A ? useA : useB; tip = x ? `Plan time apart to recharge. ${x[2]} can also lean on ${need} in daily life.` : ''; }
    else if (/is neutral for/.test(t)) { cat = 'energy'; plain = 'Your charts neither drain nor boost each other much.'; }
    else if (/feeds the other|naturally nurtures/.test(t)) { cat = type === 'family' ? 'care' : type === 'spouse' ? 'dynamic' : 'roles'; plain = type === 'colleague' || type === 'boss' ? 'One of you naturally teaches or backs the other: a mentor-and-doer pair.' : 'One of you naturally gives and the other receives.'; tip = type === 'spouse' || type === 'family' ? 'Make sure the one who gives is looked after too.' : ''; }
    else if (/Matching Day Masters|Same Day Master element/.test(t)) { cat = type === 'spouse' ? 'dynamic' : type === 'family' ? 'bond' : 'roles'; plain = 'You see the world in a similar way, so you understand each other quickly.'; if (neg || /two captains|stubborn/.test(t)) tip = 'Split areas of ownership so you are not competing for the same ground.'; }
    else if (/control gives useful structure|strong enough that the other's control/.test(t)) { cat = type === 'family' ? 'care' : type === 'spouse' ? 'dynamic' : 'roles'; plain = 'One of you tends to steer, and the other takes it well.'; }
    else if (/control can feel heavy|can feel controlled/.test(t)) { cat = type === 'family' ? 'care' : type === 'spouse' ? 'dynamic' : 'roles'; plain = 'One of you tends to steer, and the other can feel bossed or criticised.'; tip = 'The one who steers should ask more and tell less.'; }
    else if (/stronger Day Master/.test(t)) { cat = type === 'boss' ? 'lead' : 'roles'; plain = neg ? 'The report has more drive than the boss and may push past them.' : 'One of you naturally leads and the other supports.'; if (neg) tip = 'Boss: give the report a stretch area to own. Report: push ideas through the boss, not around them.'; }
    else if (/Both Day Masters are strong/.test(t)) { cat = 'roles'; plain = 'Two captains: lots of drive, but both of you want the final say.'; tip = 'Divide ownership clearly and respect each other\'s area.'; }
    else if (/Both Day Masters need support/.test(t)) { cat = 'roles'; plain = 'You are considerate with each other, but may both wait for the other to decide.'; tip = 'Agree who leads which decisions.'; }
    else if (/career pillar carries Resource/.test(t)) { cat = 'roles'; x = m(/^(.+?)'s career pillar carries Resource \(印\) for (.+?):/); plain = x ? `${x[1]} brings know-how or backing that helps ${x[2]}.` : t; }
    else if (/career pillar carries Output/.test(t)) { cat = 'roles'; x = m(/carries Output \(食伤\) for (.+?): /); plain = x ? `${x[1]}'s ideas get put into action through the other.` : t; }
    else if (type === 'boss' && (x = m(/^To (.+?), (.+?) is an? (\w+) star|^To (.+?), (.+?) is a peer|^(.+?) and (.+?) are the same element/))) {
      cat = 'lead';
      const viewer = x[1] || x[4], other = x[2] || x[5], star = x[3] || 'Peer';
      const S = {
        Officer: [`${other} comes across to ${viewer} as a natural authority: instructions land well and ${viewer} respects the chain of command.`, ''],
        Resource: [`${other} feels like a mentor to ${viewer}: someone who protects, teaches and backs them.`, ''],
        Output: neg ? [`${viewer} keeps wanting to fix or improve how ${other} does things, which can feel like the roles are reversed.`, `${other}: invite ${viewer}'s input in private. ${viewer}: suggest rather than correct, especially in front of others.`]
          : [`${viewer} enjoys teaching and developing ${other}.`, ''],
        Wealth: neg ? [`${viewer} tends to try to steer or manage ${other}, which leads to quiet tussles over control.`, `${other}: set clear goals and give ${viewer} ownership inside them. ${viewer}: raise ideas privately rather than going around the boss.`]
          : [`${viewer} knows how to direct ${other} and get the best out of their strengths.`, ''],
        Peer: [`It feels more like working with an equal than with a boss, so it is not always clear who has the final say.`, 'Spell out who decides what, and stick to it.'],
      }[star];
      if (/the boss feels pressured/.test(t)) { plain = `${viewer} (the boss) feels challenged by ${other}, as if being watched or tested.`; tip = `${viewer}: don't take pushback personally; point ${other}'s drive at the work.`; }
      else if (/supports and steadies the boss/.test(t)) plain = `${other} is a steadying support for ${viewer}: reliable, and makes the boss's job easier.`;
      else if (S) { plain = S[0]; tip = S[1]; }
      if (star === 'Peer' && r.pts === 0) { plain = `${viewer} sees ${other} as an equal rather than a junior.`; tip = ''; }
    }
    else if (/child star/.test(t)) { cat = 'care'; x = m(/^To (.+?), (.+?)'s Day Master/); plain = x ? `${x[1]} feels a natural, instinctive parental pull towards ${x[2]}.` : t; }
    else if (/Resource star 印: a protective/.test(t)) { cat = 'care'; x = m(/^To (.+?), (.+?) is a Resource/); plain = x ? `${x[1]} experiences ${x[2]} as a protective, supportive parent.` : t; }
    else if (/children palace/.test(t)) { cat = 'care'; plain = neg ? 'Parent and child tend to rub each other the wrong way in daily life, especially over independence.' : 'A close, warm parent-and-child bond.'; if (neg) tip = 'Keep promises small and steady; consistency matters more than big gestures. Give room to grow.'; }
    else if (/luck pillars|10-year luck/.test(t)) {
      cat = 'timing';
      if (/^Both .* supportive/.test(t)) plain = 'You are both in a good decade right now, so this is a good time to build something together.';
      else if (/^Both .* challenging/.test(t)) { plain = 'You are both going through a harder decade, so outside pressure can spill into how you treat each other.'; tip = 'Blame the season, not each other. Keep big shared commitments small for now.'; }
      else if ((x = m(/are (\w+) for (.+?) and (\w+) for (.+?):/))) {
        const rank = { supportive: 2, mixed: 1, challenging: 0 }, [ , la, na, lb, nb] = x;
        if (rank[la] === rank[lb]) plain = 'You are in similar decades right now.';
        else { const up = rank[la] > rank[lb] ? na : nb, dn = up === na ? nb : na; plain = `Right now ${up} is in an easier decade than ${dn}. ${up} may need to carry more of the load for a while.`; tip = `${up}: be patient; ${dn}'s struggle is about timing, not effort.`; }
      }
    }
    else if ((x = m(/^(.+?) [^\s]+ (\S+)–(\S+) between (?:both (\w+) pillars|(.+?)'s (\w+) and (.+?)'s (\w+) pillars)/))) {
      cat = type === 'family' && (/family palaces/.test(t) || /both year/.test(t)) ? 'bond' : 'links';
      const kind = Object.keys(VERB).find(k => t.startsWith(k)) || 'Combination';
      const pa = x[4] || x[6], pb = x[4] || x[8];
      const areas = pa === pb ? LIFE[pa] : `${LIFE[pa]} and ${LIFE[pb]}`;
      plain = `You ${VERB[kind]} ${areas}.`;
      if (neg) tip = kind === 'Clash' ? `Expect friction around ${areas}; plan for it rather than be surprised.` : `Small misunderstandings around ${areas}; check in rather than assume.`;
    }
    return { cat, plain, tip };
  }
  function explainView(v, A, B_) {
    const rA = A.reading, rB = B_.reading, nick = v.res.nick;
    const use = r => [...r.strength.usefulEls].map(e => E.ELEMENTS[e]).join(' and ');
    const items = v.reasons.map(r => Object.assign({}, r, explain(r, v.type, nick, use(rA), use(rB))));
    const themes = THEME[v.type], order = Object.keys(themes);
    const groups = order.map(k => ({ key: k, title: themes[k], items: items.filter(i => i.cat === k) })).filter(g => g.items.length);
    const extra = items.filter(i => !order.includes(i.cat));
    if (extra.length) { const g = groups.find(x => x.key === 'links'); if (g) g.items.push(...extra); else groups.push({ key: 'links', title: 'Other ties between your charts', items: extra }); }
    const strengths = items.filter(i => i.pts > 0).sort((a, b) => b.pts - a.pts).slice(0, 3);
    const watch = items.filter(i => i.pts < 0).sort((a, b) => a.pts - b.pts).slice(0, 3);
    const who = `${nick.A} and ${nick.B}`;
    const LEAD = { spouse: 'as partners', family: 'as family', colleague: 'as colleagues', boss: 'as boss and report' }[v.type];
    const verdict = v.score >= 80 ? 'a very good fit' : v.score >= 65 ? 'a good fit' : v.score >= 50 ? 'a workable fit' : v.score >= 35 ? 'a fit that needs effort' : 'a challenging fit';
    const summary = `${who} are ${verdict} ${LEAD}.` + (strengths[0] ? ` The best part: ${strengths[0].plain.charAt(0).toLowerCase() + strengths[0].plain.slice(1)}` : '') + (watch[0] ? ` The main thing to watch: ${watch[0].plain.charAt(0).toLowerCase() + watch[0].plain.slice(1)}` : '');
    return { summary, strengths, watch, groups };
  }

  return { compare, crossBranch, elementShares, relation, explainView, TYPES, WEIGHTS: W };
});
