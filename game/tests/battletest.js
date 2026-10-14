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
B.leagues.forEach(L => { for (let sd = 1; sd < 40; sd++) { const p = G.battlePattern(sd * 7919, L.dens, 8), by = {}; p.forEach(n => { by[n.s] = (by[n.s] || 0) + 1; });
  assert(Math.max(...Object.values(by)) <= 2, 'deux notes simultanées au plus');
  [0, 1, 2, 3].forEach(l => { const st = p.filter(n => n.l === l).map(n => n.s); for (let i = 1; i < st.length; i++) assert(st[i] - st[i - 1] >= 4, 'pas de rafale sur une piste'); });
  assert(p.every(n => n.s % 2 === 0), 'grille en croches'); } });
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
// 6. Atelier piano
const Pn = G.newState(0); Pn.level = 5;
assert.strictEqual(G.finishPiano(Pn, 5), null, 'il faut le clavier MIDI');
Pn.owned.clavier = 1;
const a1 = G.finishPiano(Pn, 30);
assert(a1.reward && Pn.boost.m === a1.reward.m && Pn.boost.left === a1.reward.s && Pn.piano.cd === T.pianoEvery, 'inspiration versée');
const a2 = G.finishPiano(Pn, 64);
assert(!a2.reward && Pn.piano.best === 64 && Pn.piano.plays === 2, 'pas de deuxième inspiration pendant l’attente');
G.tickLive(Pn, T.pianoEvery); assert.strictEqual(Pn.piano.cd, 0);
assert(!G.finishPiano(Pn, 9).reward, 'il faut au moins 10 tuiles');
assert(Pn.trophies.piano === 2, 'trophée Doigts de fée niveau Argent');
assert(G.decoUnlocked(Pn, 'wall', 'aubergine'), 'peinture aubergine débloquée à 60 tuiles');
assert.deepStrictEqual(G.hydrate(JSON.parse(JSON.stringify(Pn)), 0).piano, Pn.piano);
console.log('OK: piano, inspiration ×' + a1.reward.m + ' pendant ' + a1.reward.s + ' s');
// 7. Clashs au piano (tuiles)
const tp = G.tilesPattern(42, 40), tp2 = G.tilesPattern(42, 40);
assert.deepStrictEqual(tp, tp2, 'même graine, même partition');
assert(tp.cols.length === 40 && tp.cols.every(c => c >= 0 && c < 4) && GameData.PIANO.songs.some(x => x.id === tp.song));
for (let sd = 1; sd < 60; sd++) { const p = G.tilesPattern(sd * 104729, 44); assert(p.cols.every(c => c >= 0 && c <= 3 && Number.isInteger(c)), 'colonnes valides'); }
const K = G.newState(0); K.level = T.battleLevel; K.money = 1e5; K.lifetime = 1e5;
const kinds = { drums: 0, piano: 0 };
for (let i = 0; i < 60; i++) { K.battle.rival = null; K.battle.cd = 0; G.tickBattle(K, 1); kinds[K.battle.rival.kind]++; }
assert.strictEqual(kinds.piano, 0, 'pas de clash piano sans clavier');
K.owned.clavier = 1; kinds.drums = 0;
for (let i = 0; i < 60; i++) { K.battle.rival = null; K.battle.cd = 0; G.tickBattle(K, 1); kinds[K.battle.rival.kind]++; if (K.battle.rival.kind === 'piano') assert(GameData.BATTLE.pianists.includes(K.battle.rival.name)); }
assert(kinds.piano > 15 && kinds.drums > 15, 'environ un clash sur deux au piano ' + JSON.stringify(kinds));
K.battle.rival = { name: 'Lady Arpège', kind: 'piano', league: 3, target: 0.6, seed: 7, rule: 'rapide' };
const cp = G.startBattle(K);
assert(cp.kind === 'piano' && cp.cols.length === B.leagues[2].tiles && Math.abs(cp.tps - B.leagues[2].tps * 1.1) < 0.01 && !cp.notes);
const hk = G.hydrate(JSON.parse(JSON.stringify(K)), 0); assert.strictEqual(hk.battle.rival.kind, 'piano');
assert.strictEqual(G.hydrate({ battle: { rival: { name: 'a', target: 0.5 } } }, 0).battle.rival.kind, 'drums', 'anciennes sauvegardes: batterie');
const m1 = K.money, wp = G.finishBattle(K, { score: 0.9, combo: 30 }); assert(wp.win && K.money > m1);
console.log('OK: clash piano', kinds, cp.cols.length, 'tuiles à', cp.tps, 'tuiles/s');
