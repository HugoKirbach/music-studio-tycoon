// Tests de la recherche. node rdtest.js
const assert = require('assert');
require('../data.js');
const G = require('../engine.js');
const T = globalThis.GameData.TUNING;
let S = G.newState(0);
S.level = 8; S.money = 1e6; S.lifetime = 1e6;
['casque', 'daw', 'micro', 'interface'].forEach(i => { S.owned[i] = 1; }); G.touch(S);
// 1. points gagnés en produisant (rang de la production x rpPer)
S.acts.single.auto = true; S.acts.single.run = true;
const p0 = S.rd.pts; G.advance(S, 60);
assert.ok(S.rd.pts > p0, 'points de recherche gagnés');
const idx = G.ACTS.findIndex(a => a.id === 'single') + 1;
assert.ok(Math.abs((S.rd.pts - p0) / (idx * T.rpPer) - S.acts.single.done) < 1e-6, 'points = productions x rang x rpPer');
assert.ok(G.rdRate(S) > 0);
console.log('OK: points', (S.rd.pts - p0).toFixed(1), 'en 60 s | rythme', (G.rdRate(S) * 60).toFixed(0), '/min');
// 2. ordre dans la branche et coût
S.rd.pts = 1e6;
assert.strictEqual(G.canResearch(S, 'gain-staging'), false, 'il faut la précédente');
const d0 = G.duration(S, G.ACT_BY.single);
assert.ok(G.research(S, 'raccourcis'));
assert.ok(G.duration(S, G.ACT_BY.single) < d0 * 0.95, 'vitesse appliquée');
assert.strictEqual(S.rd.pts, 1e6 - G.researchCost('raccourcis'));
assert.ok(G.research(S, 'gain-staging') && !G.research(S, 'gain-staging'), 'pas deux fois');
// 3. qualité, salaires, commandes simultanées
const q0 = G.baseQuality(S, 'single');
['autotune', 'mastering-ia'].forEach(id => assert.ok(G.research(S, id)));
assert.strictEqual(G.baseQuality(S, 'single'), Math.min(5, q0 + 1), '+1 étoile');
const om = G.orderMax(S);
['reseau-pro', 'negociation', 'presse', 'cadres'].forEach(id => assert.ok(G.research(S, id), id));
assert.strictEqual(G.orderMax(S), om + 1);
console.log('OK: arbre (prérequis, coûts, effets)');
// 4. spécialisations: palier débloqué selon le nombre de recherches, choix unique
assert.ok(G.rdCount(S) >= 5 && G.specOpen(S, 1));
assert.ok(!G.specOpen(S, 2));
const gp = G.payout(S, G.ACT_BY.single);
assert.ok(G.chooseSpec(S, 1, 'prestige'));
assert.ok(G.payout(S, G.ACT_BY.single) > gp * 1.25, 'bonus de spécialisation');
assert.ok(!G.chooseSpec(S, 1, 'usine'), 'choix définitif');
assert.ok(!G.chooseSpec(S, 2, 'stars'), 'palier 2 verrouillé');
console.log('OK: spécialisations');
// 5. mix amélioré par la recherche (Atmos + Génie)
['atmos', 'hybride', 'carnet-idees', 'ecoute', 'signature', 'residence', 'instinct', 'genie'].forEach(id => { if (!S.rd.nodes[id]) assert.ok(G.research(S, id), id); });
S.acts.single.run = true; G.startMix(S, 'single'); const mx = G.finishMix(S, 'single', 0.5);
assert.strictEqual(mx.q, 4, '3 étoiles + Génie créatif = 4');
assert.ok(Math.abs(mx.m - (1 + 1.5 * 0.5)) < 1e-9, 'Dolby Atmos');
// 6. tournée: recherches gardées, spécialisations à rechoisir
S.lifetime = 1e12;
const n0 = G.rdCount(S), pts = S.rd.pts;
assert.ok(G.tour(S, 1000));
assert.strictEqual(G.rdCount(S), n0); assert.strictEqual(S.rd.pts, pts);
assert.deepStrictEqual(S.rd.spec, {});
console.log('OK: tournée (', n0, 'recherches gardées )');
// 7. sauvegarde: branche incohérente nettoyée
const H = G.hydrate({ acts: {}, rd: { pts: 50, nodes: { 'raccourcis': 1, 'autotune': 1, 'zzz': 1 }, spec: { 1: 'stars', 2: 'stars' } } }, 0);
assert.deepStrictEqual(Object.keys(H.rd.nodes), ['raccourcis'], 'autotune sans gain-staging retiré');
assert.deepStrictEqual(H.rd.spec, { 2: 'stars' });
console.log('OK: hydrate');
