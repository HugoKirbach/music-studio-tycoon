const assert = require('assert');
const { run } = require('./tune.js');
const r = run({}, 12, false, 'active');
const G = r.G, S = r.S;
const miss = G.TROPHIES.filter(t => !S.trophies[t.id]).map(t => t.id + ' (' + (G.trophyProgress(S, t).f * 100).toFixed(0) + '%)');
console.log('Après 12 h de jeu parfait :', G.trophyCount(S) + '/' + G.TROPHIES.length, 'trophées | manquants:', miss.join(', '));
// Uniquement les trophées hors sorties de studio doivent être atteints par la simulation (qui ne joue pas les sorties)
const must = G.TROPHIES.filter(t => !['contacts', 'outings', 'fame', 'tours', 'mixes', 'perfect', 'orders', 'rep', 'chartBest'].includes(t.m)).filter(t => !S.trophies[t.id]);
assert.deepStrictEqual(must.map(t => t.id), [], 'trophées hors sorties jamais atteints');

// 1. Un état neuf n'a aucun trophée ; le premier beat en donne un et le bonus de gains suit
delete require.cache[require.resolve('../engine.js')];
const G2 = require('../engine.js');
const A = G2.newState(0);
assert(G2.trophyCount(A) === 0);
const got = [];
G2.hooks.trophy = t => got.push(t.id);
const act = G2.ACT_BY.beat;
const p0 = G2.payout(A, act);
G2.startAct(A, 'beat'); G2.advance(A, 10);
assert(A.acts.beat.done >= 1);
assert(got.includes('premier-beat'), 'premier beat débloqué : ' + got.join());
assert(got.includes('poche') === (A.lifetime >= 100));
const n = G2.trophyCount(A);
const p1 = G2.payout(A, act);
assert(Math.abs(p1 / p0 - (1 + 0.01 * n)) < 1e-9, 'bonus de gains = +1 % par trophée : ' + (p1 / p0));
console.log('OK: premier beat ->', got.join(', '), '| bonus ×' + (p1 / p0).toFixed(3));

// 2. Un trophée n'est débloqué qu'une fois
const before = got.length; G2.advance(A, 5); G2.advance(A, 5);
assert(!got.slice(before).includes('premier-beat'));

// 3. checkTrophies silencieux : pas de hook
const B = G2.newState(0); B.lifetime = 5e4; B.level = 6; B.owned.casque = 1;
const g0 = got.length;
const sil = G2.checkTrophies(B, true);
assert(got.length === g0 && sil.length >= 4, 'silencieux : ' + sil.map(t => t.id));
console.log('OK: migration silencieuse ->', sil.map(t => t.id).join(', '));

// 4. hydrate : ids inconnus ignorés, anciennes sauvegardes sans trophées
const H = G2.hydrate({ trophies: { poche: 1, nimportequoi: 1, salaire: 0 }, lifetime: 10 }, 0);
assert(Object.keys(H.trophies).join() === 'poche');
const H2 = G2.hydrate({ money: 5 }, 0); assert(H2.trophies && Object.keys(H2.trophies).length === 0);
const H3 = G2.hydrate('n’importe quoi', 0); assert(H3.trophies);
console.log('OK: hydrate');

// 5. progression : bornes et classement des prochains objectifs
const C = G2.newState(0); C.lifetime = 60; C.owned.casque = 1; C.level = 3;
G2.checkTrophies(C, true);
G2.TROPHIES.forEach(t => { const p = G2.trophyProgress(C, t); assert(p.f >= 0 && p.f <= 1 && p.v <= p.n); });
const goals = G2.nextGoals(C, 3);
assert(goals.length === 3 && goals[0].p.f >= goals[1].p.f && goals[1].p.f >= goals[2].p.f);
assert(goals.every(g => !C.trophies[g.t.id]));
console.log('OK: prochains objectifs ->', goals.map(g => g.t.id + ' ' + (g.p.f * 100).toFixed(0) + '%').join(' | '));

// 6. contacts et sorties comptent
const E = G2.newState(0); E.contacts.rappeur = 'x'; E.ev.seen.rappeur = 1; G2.touch(E);
const ids = G2.checkTrophies(E, true).map(t => t.id);
assert(ids.includes('carnet') && ids.includes('sortie'), ids.join());
console.log('OK: contacts et sorties');
