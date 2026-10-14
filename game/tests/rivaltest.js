// Label, étape 3: labels rivaux, départs et discographie. node rivaltest.js
const assert = require('assert');
require('../data.js');
const G = require('../engine.js');
const T = globalThis.GameData.TUNING;
let seed = 11; G.setRandom(() => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; });
const log = []; Object.assign(G.hooks, { artistOffer: a => log.push('offer ' + a.id), offerAuto: r => log.push('auto ' + r.id + ' ' + r.kept), offerDone: r => log.push('done ' + r.id + ' ' + r.choice) });
function mid() {
  const S = G.newState(0); S.level = 9; S.money = 1e8; S.lifetime = 1e8;
  ['casque', 'daw', 'micro', 'clavier', 'interface'].forEach(i => { S.owned[i] = 1; }); G.touch(S);
  ['beat', 'mix', 'voix', 'single'].forEach(a => { S.acts[a].auto = true; S.acts[a].run = true; S.acts[a].lvl = 10; });
  S.contacts.rappeur = 'Kaïs'; S.contacts.openmic = 'Inès';
  S.owned.garage = 1; // tier: voir ci-dessous
  return S;
}
function quiet(S) { S.label.roster.forEach(r => { r.cd = 1e9; r.scd = 1e9; }); }
// 1. pas d'offre tant que l'artiste est peu connu
let S = mid(); const r = G.signArtist(S, 'kais'); quiet(S);
G.tickLive(S, T.offerFirst + 5); assert(!r.offer, 'artiste trop peu connu');
r.fame = 40; G.tickLive(S, T.offerFirst + 5);
assert(r.offer && G.RIVAL_LABELS.includes(r.offer.lab) && log.includes('offer kais'), 'offre d’un label rival');
assert.strictEqual(S.label.ocd, T.offerEvery);
console.log('OK: offre de', r.offer.lab);
// 2. prime de fidélité
const m0 = S.money, c = G.retainCost(S, r), mo0 = r.mood;
const p = G.resolveOffer(S, 'kais', 'pay');
assert(p.kept && !r.offer && S.money === m0 - c && r.mood === Math.min(100, mo0 + 10) && S.label.kept === 1 && S.trophies.fidele === 1);
assert.strictEqual(G.resolveOffer(S, 'kais', 'pay'), null, 'plus d’offre');
// 3. pari sur l'humeur: réussite et échec forcés
r.offer = { lab: 'Sonix Records', left: 100 };
const t1 = G.resolveOffer(S, 'kais', 'trust', () => 0.01); assert(t1.kept && S.label.kept === 2);
r.offer = { lab: 'Sonix Records', left: 100 }; r.duo = null;
const mm = S.money, fee = G.transferFee(S, r);
const t2 = G.resolveOffer(S, 'kais', 'trust', () => 0.999);
assert(!t2.kept && !G.artistOf(S, 'kais') && S.money === mm + fee && t2.fee === fee, 'départ avec indemnité');
assert(G.goneOf(S, 'kais') && G.goneOf(S, 'kais').lab === 'Sonix Records' && !G.artistAvailable(S, G.ART_BY.kais), 'parti chez le rival');
G.tickLive(S, T.goneFor + 1); assert(!G.goneOf(S, 'kais') && G.artistAvailable(S, G.ART_BY.kais), 'de retour sur le marché');
console.log('OK: prime, pari gagné, pari perdu, retour sur le marché');
// 4. laisser partir, nettoyage des duos; offre expirée = pari automatique
S = mid(); S.owned = Object.assign(S.owned, {}); S.lifetime = 1e12; S.money = 1e12;
G.touch(S);
const cap = G.labelCap(S);
const a1 = G.signArtist(S, 'kais'); quiet(S);
if (cap >= 2) {
  const a2 = G.signArtist(S, 'ines'); quiet(S); a2.duo = 'kais';
  a1.offer = { lab: 'Bulle Prod', left: 10 };
  const rel = G.resolveOffer(S, 'kais', 'release'); assert(!rel.kept && rel.fee > 0 && a2.duo === null, 'duo annulé');
} else {
  a1.offer = { lab: 'Bulle Prod', left: 10 };
  const rel = G.resolveOffer(S, 'kais', 'release'); assert(!rel.kept && rel.fee > 0);
}
S = mid(); const a3 = G.signArtist(S, 'kais'); quiet(S); a3.fame = 50; a3.mood = 100; a3.offer = { lab: 'Galaxie Music', left: 5 };
G.tickLive(S, 6); assert(!a3.offer && log.some(l => l.startsWith('auto kais')), 'offre expirée tranchée automatiquement');
assert.strictEqual(G.keepChance({ mood: 100 }), 0.95); assert.strictEqual(G.keepChance({ mood: 0 }), 0.1);
console.log('OK: laisser partir, expiration');
// 5. pas d'offre pendant l'album de l'artiste
S = mid(); const a4 = G.signArtist(S, 'kais'); quiet(S); a4.fame = 60;
const pc = G.startProject(S, { genre: 'rap', mood: 'rue', pub: 'ados', fmt: 'single', sl: [50, 50, 50], team: [null, null, null], artist: 'kais' });
assert(pc && S.proj.cur.artist === 'kais');
G.tickLabel(S, T.offerFirst + 5); assert(!a4.offer, 'pas d’offre pendant son album');
while (S.proj.cur) G.tickProject(S, 5);
// 6. discographie
const dg = G.discography(S);
assert(dg.list.length === 1 && dg.list[0].a === 'kais' && dg.list[0].g === 'rap' && dg.count === 1 && dg.best === dg.list[0]);
// 7. sauvegarde et anciennes sauvegardes
a4.offer = { lab: 'Néon Disques', left: 50 }; S.label.gone.push({ id: 'ines', lab: 'Bulle Prod', left: 99 });
const R = G.hydrate(JSON.parse(JSON.stringify(S)), 0);
assert.deepStrictEqual(R.label, S.label);
const old = JSON.parse(JSON.stringify(S)); delete old.label.disco; delete old.label.gone; delete old.label.kept; delete old.label.ocd; delete old.label.roster[0].offer;
const R2 = G.hydrate(old, 0);
assert(R2.label.disco.length === 1 && R2.label.disco[0].a === 'kais' && R2.label.gone.length === 0 && R2.label.ocd === T.offerFirst && R2.label.roster[0].offer === null, 'reprise des anciennes sauvegardes');
console.log('OK: discographie, sauvegarde');
