// Outil de calibrage: applique des courbes de coût et simule un joueur attentif.
// Usage: node tune.js '{"p":0.5,"valueExp":0.2}' [heures] [verbose]
const path = require('path');
function load(over) {
  delete require.cache[require.resolve('../data.js')];
  delete require.cache[require.resolve('../engine.js')];
  delete globalThis.GameData;
  const D = require('../data.js');
  const p = over.p || 0, ref = over.ref || 600;
  const f = x => Math.max(1, Math.pow(x / ref, p));
  if (p) {
    D.ITEMS.forEach(i => { if (i.cost > 0) i.cost = Math.round(i.cost * f(i.cost)); });
    D.ACTS.forEach(a => { a.autoCost = Math.round(a.autoCost * f(a.autoCost)); a.upCost = Math.round(a.upCost * f(a.upCost)); });
  }
  Object.keys(over).forEach(k => { if (k in D.TUNING) D.TUNING[k] = over[k]; });
  if (over.reqLvls) D.ACTS.forEach((a, i) => { a.reqLvl = over.reqLvls[i]; });
  if (over.autoMul) D.ACTS.forEach(a => { a.autoCost = Math.round(a.autoCost * over.autoMul); });
  if (over.upMul) D.ACTS.forEach(a => { a.upCost = Math.round(a.upCost * over.upMul); });
  return { D, G: require('../engine.js') };
}

// Joueur attentif côté équipe: recrute, forme, motive et place chacun sur la meilleure production.
function teamPolicy(G, S) {
  if (!G.teamOpen(S)) return;
  const tm = S.team;
  if (tm.staff.length < G.teamCap(S)) {
    const c = tm.pool.slice().sort((a, b) => b.stars - a.stars)[0];
    if (c && (c.stars >= 2 || c.back) && G.signCost(S, c) <= S.money * 0.3) G.hire(S, c.id);
  }
  tm.staff.forEach(m => {
    if (m.morale < 40 && m.rest <= 0 && m.train <= 0) { if (G.bonusCost(S, m) <= S.money * 0.05) G.giveBonus(S, m.id); else G.sendRest(S, m.id); }
    if (m.train <= 0 && m.rest <= 0 && G.trainCost(S, m) <= S.money * 0.08) G.train(S, m.id);
  });
  // placement: les productions les plus rentables d'abord, au meilleur candidat
  const acts = G.ACTS.filter(a => G.isUnlocked(S, a)).sort((a, b) => b.pay - a.pay);
  const free = tm.staff.slice();
  acts.forEach(a => {
    if (!free.length) return;
    free.sort((x, y) => (G.roleFits(y, a.id) - G.roleFits(x, a.id)) || (y.stars + y.lvl - x.stars - x.lvl));
    const m = free.shift();
    if (m.act !== a.id) G.assign(S, m.id, a.id);
  });
}

function run(over, hours, verbose, mode) {
  const { D, G } = load(over);
  const S = G.newState(0);
  const unlocks = {}; const buys = [];
  let t = 0;
  G.hooks.buy = it => buys.push([t / 60, it.name, it.cost, S.level]);
  const step = over.step || 1;
  const manualEvery = mode === 'idle' ? 120 : 0;
  let nextManual = 0;
  while (t < hours * 3600) {
    if (mode !== 'idle') D.ACTS.forEach(a => G.startAct(S, a.id));
    else if (t >= nextManual) { D.ACTS.forEach(a => G.startAct(S, a.id)); nextManual = t + manualEvery; }
    // achats
    let bought = true;
    while (bought) {
      bought = false;
      const items = D.ITEMS.filter(i => !S.owned[i.id]).sort((a, b) => a.cost - b.cost);
      const next = items[0];
      if (next && S.money >= next.cost) { G.buy(S, next.id); bought = true; continue; }
      for (const a of D.ACTS) {
        if (G.isUnlocked(S, a) && !S.acts[a.id].auto && S.money >= a.autoCost && a.autoCost <= (next ? next.cost * 1.2 : 1e18)) {
          if (G.buyAuto(S, a.id)) { bought = true; break; }
        }
      }
      if (bought) continue;
      for (const a of D.ACTS) {
        if (G.isUnlocked(S, a) && G.upCost(S, a) <= S.money * 0.15 && G.upCost(S, a) < (next ? next.cost * 0.4 : 1e18)) {
          if (G.upgradeAct(S, a.id)) { bought = true; break; }
        }
      }
    }
    if (over.team !== false && G.teamOpen) teamPolicy(G, S);
    G.advance(S, step);
    t += step;
    D.ACTS.forEach(a => { if (unlocks[a.id] == null && G.isUnlocked(S, a)) unlocks[a.id] = t / 60; });
  }
  return { S, G, D, unlocks, buys };
}

if (require.main === module) {
  const over = JSON.parse(process.argv[2] || '{}');
  const hours = Number(process.argv[3] || 12);
  const mode = process.argv[4] || 'active';
  const r = run(over, hours, false, mode);
  const fmtT = m => m == null ? '   --   ' : (m < 120 ? m.toFixed(0) + ' min' : (m / 60).toFixed(1) + ' h');
  console.log(r.D.ACTS.map(a => a.id.padEnd(10) + fmtT(r.unlocks[a.id])).join('\n'));
  const last = r.buys[r.buys.length - 1];
  console.log('dernier achat:', last ? fmtT(last[0]) + ' ' + last[1] : '-', '| items', r.buys.length + '/' + (r.D.ITEMS.length - 1));
  console.log('niveau', r.S.level, '| budget', r.S.money.toExponential(2), '| valeur', r.G.studioValue(r.S).toExponential(2));
}
module.exports = { run, load };
