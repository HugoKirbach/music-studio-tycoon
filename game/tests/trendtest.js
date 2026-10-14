// Tendances de la semaine et décoration. node trendtest.js
const assert = require('assert');
require('../data.js');
const G = require('../engine.js');
const T = globalThis.GameData.TUNING;
let seed = 3; G.setRandom(() => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; });
const seen = []; G.hooks.trend = t => seen.push(t);
function mid() {
  const S = G.newState(0); S.level = 9; S.money = 1e7; S.lifetime = 1e7;
  ['casque', 'daw', 'micro', 'clavier', 'interface'].forEach(i => { S.owned[i] = 1; }); G.touch(S);
  ['beat', 'mix', 'voix', 'single'].forEach(a => { S.acts[a].auto = true; S.acts[a].run = true; S.acts[a].lvl = 10; });
  return S;
}
// 1. tirage à l'ouverture du Top 50 puis à chaque semaine, sans répéter la précédente
let S = G.newState(0); G.tickLive(S, 1); assert(!S.charts.trend, 'rien avant le niveau ' + T.chartLevel);
S = mid(); G.tickLive(S, 1);
const t1 = G.trendFor(S); assert(t1 && seen.length === 1 && G.isUnlocked(S, G.ACT_BY[t1.act]) && G.genreOpen(S, t1.g) && G.RULES.includes(t1.rule));
G.tickLive(S, T.weekLen + 1); G.tickLive(S, 1);
const t2 = G.trendFor(S); assert(t2 && t2.w === t1.w + 1 && seen.length === 2);
assert(t2.m !== t1.m && t2.rule !== t1.rule, 'la tendance change d’une semaine à l’autre');
console.log('OK: tendances', JSON.stringify(t1), '->', JSON.stringify(t2));
// 2. production en vogue
const a = G.ACT_BY[t2.act], p1 = G.payout(S, a);
S.charts.trend.act = t2.act === 'beat' ? 'mix' : 'beat';
assert(Math.abs(p1 / G.payout(S, a) - T.trendAct) < 1e-9, 'gains ×' + T.trendAct);
S.charts.trend.act = t2.act;
// 3. commandes: plus fréquentes et mieux payées pour la production en vogue
let hot = 0; const N = 400; for (let i = 0; i < N; i++) { const o = G.makeOrder(S); if (o.trend) { hot++; assert.strictEqual(o.act, t2.act); } }
assert(hot / N > T.trendOrder * 0.8, 'commandes en vogue: ' + hot);
console.log('OK: commandes tendance', (hot / N * 100).toFixed(0) + ' %');
// 4. projets: genre et ambiance à la mode
S.charts.trend.g = 'pop'; S.charts.trend.m = 'amour';
const c = G.startProject(S, { genre: 'pop', mood: 'amour', pub: 'large', fmt: 'single', sl: [50, 65, 80] });
assert(c.tg && c.tm);
while (S.proj.cur) G.tickProject(S, 5);
assert(S.proj.last.tg && S.proj.last.tm);
const R0 = G.hydrate(JSON.parse(JSON.stringify(S)), 0); assert.deepStrictEqual(R0.charts.trend, S.charts.trend); assert(R0.proj.last.tg);
console.log('OK: projet tendance', S.proj.last.avg + '/10');
// 5. règle du clash
S.battle.rival = null; S.battle.cd = 0; S.charts.trend.rule = 'sans-clap'; G.tickBattle(S, 1);
S.battle.rival.kind = 'drums'; S.battle.rival.rule = 'sans-clap'; const b = G.startBattle(S); assert(b.rule === 'sans-clap' && b.notes.every(n => n.l !== 3));
S.battle.rival.rule = 'rapide'; assert.strictEqual(G.startBattle(S).bpm, Math.round(G.BATTLE.leagues[0].bpm * 1.1));
S.battle.rival.rule = 'prime'; const m0 = S.money; const w1 = G.finishBattle(S, { score: 1, combo: 1 });
S.battle.rival = { name: 'x', league: 1, target: 0.5, seed: 1, rule: null }; const w2 = G.finishBattle(S, { score: 1, combo: 1 });
assert(w1.cash / w2.cash > 1.4, 'prime ×1,5');
console.log('OK: règles du clash');
// 6. décoration
const P = G.newState(0);
assert(G.decoUnlocked(P, 'wall', 'craie') && !G.decoUnlocked(P, 'wall', 'nuit'));
assert(!G.setDeco(P, 'wall', 'nuit') && P.deco.wall === 'origine');
assert(G.setDeco(P, 'wall', 'craie') && P.deco.wall === 'craie');
P.battle.league = 2; assert(G.decoUnlocked(P, 'wall', 'nuit') && G.decoNew(P).includes('wall:nuit'));
G.seeDeco(P); assert.strictEqual(G.decoNew(P).length, 0);
assert.deepStrictEqual(G.decoProgress(P, 'floor', 'beton'), { v: 0, n: 5 });
P.lifetime = 1e14; G.tour(P, 1); assert(P.deco.wall === 'craie', 'la déco survit à la tournée');
const H = G.hydrate({ deco: { wall: 'zz', floor: 'marbre', neon: 'coeur', seen: { 'wall:nuit': 1, 'x:y': 1 } } }, 0);
assert(H.deco.wall === 'origine' && H.deco.floor === 'marbre' && H.deco.neon === 'coeur' && H.deco.seen['wall:nuit'] && !H.deco.seen['x:y']);
console.log('OK: décoration');
