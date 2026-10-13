// Clash de beatmakers. node battletest.js
const assert = require('assert');
require('../data.js');
const G = require('../engine.js');
const T = globalThis.GameData.TUNING, B = G.BATTLE;
let seed = 5; G.setRandom(() => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; });
const log = []; G.hooks.battleNew = r => log.push('new ' + r.name); G.hooks.battleDone = r => log.push((r.win ? 'win ' : 'loss ') + r.score);
// 1. partition: déterministe, dans les bornes, densité croissante, pas d'accords en ligue Quartier
const p1 = G.battlePattern(123, 0, 8), p1b = G.battlePattern(123, 0, 8);
assert.deepStrictEqual(p1, p1b, 'même graine, même beat');
const per = B.leagues.map(L => G.battlePattern(77, L.dens, 8).length);
for (let i = 1; i < per.length; i++) assert(per[i] >= per[i - 1], 'densité croissante ' + per);
const steps = {}; p1.forEach(n => { assert(n.s >= 0 && n.s < 128 && n.l >= 0 && n.l < 4); steps[n.s] = (steps[n.s] || 0) + 1; });
assert(Object.values(steps).every(c => c === 1), 'aucun accord en ligue Quartier');
assert(p1.filter(n => n.s < 16).every(n => n.l < 2), 'première mesure: kick et caisse claire seulement');
const secs = L => 8 * 4 * 60 / L.bpm;
console.log('OK: partitions', per.join(' / '), 'notes |', B.leagues.map(L => (G.battlePattern(77, L.dens, 8).length / secs(L)).toFixed(1) + '/s').join(' '));
// 2. apparition des défis
let S = G.newState(0);
G.tickLive(S, 999); assert(!S.battle.rival, 'fermé avant le niveau ' + T.battleLevel);
S.level = T.battleLevel; S.money = 1e5; S.lifetime = 1e5;
G.tickLive(S, T.battleFirst + 1); assert(S.battle.rival && log[0].startsWith('new'), 'défi proposé');
const r0 = S.battle.rival; G.tickLive(S, 999); assert.strictEqual(S.battle.rival, r0, 'le défi attend le joueur');
// 3. victoire, montée en ligue, défaite
const st = G.startBattle(S); assert(st && st.notes.length > 20 && st.bpm === B.leagues[0].bpm);
const m0 = S.money, res = G.finishBattle(S, { score: 0.99, combo: 40 });
assert(res.win && S.money > m0 && S.battle.wins === 1 && S.battle.pts === 1 && S.battle.best === 40 && !S.battle.rival && S.battle.cd === T.battleEvery);
for (let k = 0; k < T.battleUp - 1; k++) { S.battle.rival = { name: 'X', league: 1, target: 0.5, seed: k }; G.finishBattle(S, { score: 0.9, combo: 5 }); }
assert.strictEqual(S.battle.league, 2, 'montée en ligue Régionale'); assert.strictEqual(S.battle.pts, 0);
S.battle.rival = { name: 'Y', league: 2, target: 0.6, seed: 9 };
const lose = G.finishBattle(S, { score: 0.2, combo: 3 });
assert(!lose.win && S.battle.losses === 1 && S.battle.league === 2);
assert(S.trophies.clash >= 1 && S.trophies.ligue === 1 && S.trophies.combo >= 1, JSON.stringify(S.trophies));
assert.strictEqual(G.finishBattle(S, { score: 1 }), null, 'pas de clash sans rival');
S.battle.rival = { name: 'Z', league: 2, target: 0.6, seed: 1 }; assert(G.declineBattle(S) && !S.battle.rival && S.battle.cd === T.battleEvery / 2);
console.log('OK: défis, victoire, ligue', S.battle.league, '| défaite | refus');
// 4. score falsifié borné
S.battle.rival = { name: 'W', league: 2, target: 0.6, seed: 2 }; const w = G.finishBattle(S, { score: 9, combo: -3 }); assert(w.score === 1);
// 5. sauvegarde
const R = G.hydrate(JSON.parse(JSON.stringify(S)), 0);
assert.deepStrictEqual(R.battle, S.battle);
const bad = G.hydrate({ battle: { league: 99, pts: 50, wins: -1, rival: { target: 9, league: -2 } } }, 0);
assert(bad.battle.league === B.leagues.length && bad.battle.pts === T.battleUp - 1 && bad.battle.wins === 0 && bad.battle.rival.target === 0.95 && bad.battle.rival.league === 1);
console.log('OK: hydrate');
