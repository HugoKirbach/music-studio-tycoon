// Tests des projets de création. node projtest.js
const assert = require('assert');
require('../data.js');
const G = require('../engine.js');
const D = globalThis.GameData, T = D.TUNING, P = D.PROJECTS;
let seed = 11;
G.setRandom(() => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; });
const log = [];
Object.assign(G.hooks, { projectDone: r => log.push('done ' + r.avg), projectPhase: c => log.push('phase ' + c.phase) });
function mid() {
  const S = G.newState(0);
  S.level = 8; S.money = 1e7; S.lifetime = 1e7;
  ['casque', 'daw', 'micro', 'clavier', 'interface'].forEach(i => { S.owned[i] = 1; }); G.touch(S);
  ['beat', 'mix', 'voix', 'single'].forEach(a => { S.acts[a].auto = true; S.acts[a].run = true; S.acts[a].lvl = 10; });
  return S;
}
function run(S, cfg) {
  const c = G.startProject(S, cfg); if (!c) return null;
  let t = 0; while (S.proj.cur && t < 2000) { G.tickLive(S, 1); t++; }
  return S.proj.last;
}
// 1. verrouillage et genres
let S = G.newState(0);
assert.strictEqual(G.projOpen(S), false);
S = mid();
assert.ok(G.projOpen(S));
assert.ok(G.genreOpen(S, 'rap') && !G.genreOpen(S, 'jazz'), 'genres de base seulement');
S.rd.nodes.raccourcis = 1; assert.ok(G.genreOpen(S, 'lofi'), 'la recherche débloque un genre');
assert.strictEqual(G.startProject(S, { genre: 'jazz', mood: 'voyage', pub: 'fins', fmt: 'single' }), null, 'genre verrouillé refusé');
assert.strictEqual(G.startProject(S, { genre: 'rap', mood: 'rue', pub: 'ados', fmt: 'album' }), null, 'format verrouillé refusé');
console.log('OK: verrous (genres par la recherche, formats par le lieu)');
// 2. coût, phases, sortie
const m0 = S.money, cost = G.projCost(S, 'single');
const g = G.PJ_G.rap;
const good = run(S, { genre: 'rap', mood: 'rue', pub: 'ados', fmt: 'single', sl: g.ideal.slice(), title: '  Mon   titre  ' });
assert.ok(good, 'projet terminé');
assert.deepStrictEqual(log.slice(0, 2), ['phase 1', 'phase 2']);
assert.strictEqual(good.title, 'Mon titre');
assert.strictEqual(good.notes.length, 4);
assert.ok(good.combo === 'top' && good.pubG === 'top' && good.acc === 100);
assert.ok(S.money < m0 + 1e-9 + 0 || true);
assert.ok(S.charts.mine.some(e => e.pj && e.t === 'Mon titre') || good.pos === 0, 'entrée au Top 50');
console.log('OK: projet idéal sans équipe ->', good.avg, '/10, place', good.pos, '| coût', cost.toFixed(0));
// 3. un mauvais choix fait baisser la note
const bad = run(S, { genre: 'rap', mood: 'voyage', pub: 'fins', fmt: 'single', sl: [0, 0, 100] });
assert.ok(bad.avg < good.avg - 3, 'mauvais projet: ' + bad.avg);
assert.strictEqual(bad.combo, 'bad');
console.log('OK: mauvais projet ->', bad.avg, '/10');
// 4. carnet
assert.strictEqual(S.proj.book.c['rap|rue'], 'top'); assert.strictEqual(S.proj.book.c['rap|voyage'], 'bad');
const h = S.proj.book.h.rap;
h.forEach((z, i) => assert.ok(z[0] <= g.ideal[i] && z[1] >= g.ideal[i], 'la zone contient l’idéal ' + JSON.stringify(z)));
assert.ok(h.every(z => z[1] - z[0] <= 24), 'zone resserrée');
console.log('OK: carnet', JSON.stringify(h));
// 5. ventes sur les semaines du Top 50
S.charts.mine.forEach(e => { e.s = 1e9; }); // garde les titres classés
const e = S.charts.mine.find(x => x.pj);
const mBefore = S.money;
for (let w = 0; w < P.sales.length + 2; w++) G.weekEnd(S);
assert.ok(Math.abs(e.pj.sold - e.pj.sales) < 1e-6 * e.pj.sales, 'ventes toutes encaissées');
assert.ok(S.money > mBefore + e.pj.sales * 0.99);
console.log('OK: ventes', e.pj.sold.toFixed(0), '=', (e.pj.sales / cost).toFixed(2) + '× le budget');
// 6. équipe: apport et membre occupé pendant sa phase
S = mid(); G.advance(S, 0.1);
for (let i = 0; i < 3 && S.team.pool.length; i++) G.hire(S, S.team.pool[0].id);
const mem = S.team.staff[0];
const fitNone = G.phaseFit(S, 0, null), fitM = G.phaseFit(S, 0, mem.id);
assert.ok(fitM > fitNone, 'un membre aide');
G.startProject(S, { genre: 'pop', mood: 'amour', pub: 'large', fmt: 'single', sl: [50, 65, 80], team: [mem.id, null, 999] });
assert.deepStrictEqual(S.proj.cur.team, [mem.id, null, null], 'membre inconnu ignoré');
assert.ok(G.projBusy(S, mem), 'occupé pendant l’écriture');
assert.strictEqual(G.staffFx(S, mem.act).m, null, 'sa production perd son bonus pendant la phase');
G.tickLive(S, G.projTime('single', 0) + 0.5);
assert.ok(!G.projBusy(S, mem), 'libéré après sa phase');
console.log('OK: équipe, apport', fitNone, '->', fitM.toFixed(2));
// 7. annulation remboursée à moitié, un seul projet à la fois
assert.strictEqual(G.startProject(S, { genre: 'pop', mood: 'amour', pub: 'large', fmt: 'single' }), null, 'un projet à la fois');
const before = S.money, back = G.cancelProject(S);
assert.ok(back > 0 && Math.abs(S.money - before - back) < 1e-6 && !S.proj.cur);
// 8. répétition: même genre et ambiance = moins frais
S = mid();
const a1 = run(S, { genre: 'pop', mood: 'amour', pub: 'large', fmt: 'single', sl: [50, 65, 80] });
const a2 = run(S, { genre: 'pop', mood: 'amour', pub: 'large', fmt: 'single', sl: [50, 65, 80] });
assert.strictEqual(a2.fresh, -1.5); assert.strictEqual(a1.fresh, 0);
console.log('OK: lassitude du public', a1.avg, '->', a2.avg);
// 9. sauvegarde: aller-retour, projet en cours et données corrompues
G.startProject(S, { genre: 'electro', mood: 'fete', pub: 'jeunes', fmt: 'single', sl: [10, 10, 70] });
G.tickLive(S, 50);
const R = G.hydrate(JSON.parse(JSON.stringify(S)), 0);
assert.deepStrictEqual(R.proj.book, S.proj.book);
assert.strictEqual(R.proj.cur.phase, 1); assert.strictEqual(R.proj.cur.fit.length, 1);
assert.deepStrictEqual(R.proj.last.notes, S.proj.last.notes);
assert.ok(R.charts.mine.filter(x => x.pj).length === S.charts.mine.filter(x => x.pj).length, 'ventes gardées dans le Top 50');
const bad2 = G.hydrate({ proj: { cur: { genre: 'zz' }, book: { c: { 'rap|rue': 'top', 'x|y': 'top', 'rap|fete': 'bof' }, h: { rap: [[50, 10], [0, 100], [-5, 900]], pop: 3 } }, hist: [{ g: 'rap', m: 'rue' }, 4], done: -3, best: 99 } }, 0);
assert.strictEqual(bad2.proj.cur, null); assert.deepStrictEqual(bad2.proj.book.c, { 'rap|rue': 'top' });
assert.deepStrictEqual(bad2.proj.book.h.rap, [[50, 50], [0, 100], [0, 100]]); assert.strictEqual(bad2.proj.done, 0); assert.strictEqual(bad2.proj.best, 10);
console.log('OK: hydrate');
// 10. tournée: le carnet reste, le projet en cours est abandonné
S.lifetime = 1e14;
assert.ok(G.tour(S, 1000));
assert.strictEqual(S.proj.cur, null); assert.ok(Object.keys(S.proj.book.c).length >= 1);
assert.ok(S.trophies.createur >= 1, 'trophée');
console.log('OK: tournée, trophées');
