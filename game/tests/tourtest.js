const assert = require('assert');
require('../data.js');
const G = require('../engine.js');
const T = require('../data.js').TUNING;

// 1. Formule de renommée
assert(G.fameFor(0) === 0 && G.fameFor(T.fameBase) === 1);
let prev = -1; for (let e = 0; e < 14; e += 0.25) { const f = G.fameFor(Math.pow(10, e)); assert(f >= prev); prev = f; }
const A = G.newState(0);
assert(G.fameAvailable(A) === 0 && !G.canTour(A) && G.tour(A, 5) === null, 'rien à faire au départ');
A.lifetime = G.fameUnlockAt(A) - 1; assert(!G.canTour(A), 'juste sous le seuil');
A.lifetime = G.fameUnlockAt(A); assert(G.canTour(A) && G.fameAvailable(A) === T.fameMin, 'seuil exact : ' + G.fameAvailable(A));
assert(G.fameNextAt(A) > A.lifetime);
console.log('OK: formule ; seuil de départ', G.fameUnlockAt(G.newState(0)).toExponential(2), '€ cumulés pour', T.fameMin, 'points');

// 2. Partir en tournée : ce qui est gardé, ce qui est remis à zéro
const S = G.newState(0);
S.money = 5e9; S.xp = 77; S.level = 22; S.lifetime = 2.3e10; S.owned = { laptop: 1, casque: 1, daw: 1, console: 1 };
S.acts.beat = { lvl: 14, auto: true, prog: 1.2, run: true, done: 321 }; S.acts.mix = { lvl: 3, auto: false, prog: 0, run: false, done: 12 };
S.tracks = { beat: 321, mix: 12 }; S.boost = { m: 3, left: 40, t: 60 };
S.contacts = { rappeur: 'Kaïs' }; S.trophies = { gains: 2 }; S.ev.seen = { rappeur: 2 }; S.ev.cd = 1; S.ev.pending = { id: 'rappeur', left: 50 }; S.ev.hold = true;
S.sound = true; S.created = 123; S.epoch = 0;
const pts = G.fameAvailable(S); assert(pts >= T.fameMin);
const p0 = G.payout(S, G.ACT_BY.beat);
const r = G.tour(S, 99999);
assert(r.points === pts && r.fame === pts && r.tours === 1);
assert(S.money === 0 && S.xp === 0 && S.level === 1, 'budget et expertise remis à zéro');
assert(Object.keys(S.owned).join() === 'laptop', 'matériel perdu, portable gardé');
assert(S.acts.beat.lvl === 0 && !S.acts.beat.auto && !S.acts.beat.run && S.acts.beat.prog === 0, 'productions remises à zéro');
assert(S.acts.beat.done === 321 && S.acts.mix.done === 12, 'compteurs de productions gardés');
assert(Object.keys(S.tracks).length === 0 && S.boost.left === 0 && S.boost.m === 1, 'catalogue et boost remis à zéro');
assert(S.lifetime === 2.3e10, 'cumul des gains conservé');
assert(S.contacts.rappeur && S.trophies.gains === 2 && S.ev.seen.rappeur === 2, 'contacts, trophées et sorties conservés');
assert(S.ev.pending === null && !S.ev.hold && S.ev.cd === T.eventFirst, 'invitation en cours annulée');
assert(S.epoch === 99999 && S.savedAt === 99999 && S.sound === true && S.created === 123, 'epoch posé pour la synchro');
assert(!G.canTour(S) && G.tour(S, 1) === null, 'pas de deuxième départ immédiat');
// les gains repartent avec le bonus de renommée (et contacts + trophées)
const p1 = G.payout(S, G.ACT_BY.beat);
const expect = (1 + T.fameBonus * pts) * (1 + T.contactBonus * 1) * (1 + T.trophyBonus * 2);
assert(Math.abs(p1 / G.payout(G.hydrate({}, 0), G.ACT_BY.beat) - expect) < 1e-9, 'bonus de renommée appliqué : ' + (p1 / p0));
const xpBase = G.xpGain(G.newState(0), G.ACT_BY.beat);
assert(Math.abs(G.xpGain(S, G.ACT_BY.beat) / xpBase - (1 + T.fameXp * pts)) < 1e-9, 'bonus d’expertise appliqué');
console.log('OK: tournée ->', pts, 'points, gains ×' + (1 + T.fameBonus * pts).toFixed(2), 'expertise ×' + (1 + T.fameXp * pts).toFixed(2));

// 3. Deuxième tournée : il faut un nouveau cumul
S.lifetime = G.fameUnlockAt(S) - 1; assert(!G.canTour(S));
S.lifetime = G.fameUnlockAt(S); assert(G.canTour(S));
const r2 = G.tour(S, 5); assert(r2.tours === 2 && r2.fame === pts + r2.points && r2.points >= T.fameMin);
console.log('OK: deuxième tournée, renommée', r2.fame);

// 4. Sauvegarde / chargement
const H = G.hydrate(JSON.parse(JSON.stringify(S)), 0); assert(H.fame === S.fame && H.tours === 2);
const Hb = G.hydrate({ fame: -4, tours: 'x' }, 0); assert(Hb.fame === 0 && Hb.tours === 0);
const Hc = G.hydrate({ fame: 3.9 }, 0); assert(Hc.fame === 3);
const Hd = G.hydrate({ money: 5 }, 0); assert(Hd.fame === 0 && Hd.tours === 0, 'ancienne sauvegarde');
console.log('OK: hydrate');

// 5. Trophées liés
const C = G.newState(0); C.tours = 1; C.fame = 25; const ids = G.checkTrophies(C, true).map(t => t.id);
assert(ids.includes('monde') && ids.includes('renommee') && C.trophies.monde === 1 && C.trophies.renommee === 1, ids.join());
console.log('OK: trophées de tournée');
