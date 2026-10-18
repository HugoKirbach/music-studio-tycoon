// Nom du studio personnalisable et légende KYRB. (rencontre puis suite de l'histoire).
const assert = require('assert');
require('../data.js');
const G = require('../engine.js');

// 1. Nom du studio: vide par défaut (nom du palier), nettoyé, limité, conservé à la sauvegarde et à la tournée mondiale
const S = G.newState(0);
assert.strictEqual(S.studio, '');
assert.strictEqual(G.studioName(S), G.TIERS[0].name);
assert.strictEqual(G.setStudioName(S, '   Les   Ateliers   Kyrb  '), 'Les Ateliers Kyrb');
assert.strictEqual(G.studioName(S), 'Les Ateliers Kyrb');
assert.strictEqual(G.setStudioName(S, 'x'.repeat(60)).length, G.STUDIO_MAX);
assert.strictEqual(G.setStudioName(S, 'Studio <script>\u0007'), 'Studio script');
assert.strictEqual(G.setStudioName(S, 42), '');
G.setStudioName(S, 'Le Hangar');
const H = G.hydrate(JSON.parse(JSON.stringify(S)), 0);
assert.strictEqual(H.studio, 'Le Hangar');
assert.strictEqual(G.hydrate({ money: 10 }, 0).studio, '');
assert.strictEqual(G.hydrate({ studio: { bad: 1 } }, 0).studio, '');
H.lifetime = 1e15; H.fame = 0; H.world.done = H.world.done || [];
if (G.tour(H, 1000, H.world.home)) assert.strictEqual(H.studio, 'Le Hangar', 'le nom reste après une tournée');
console.log('nom du studio: ok');

// 2. KYRB.: rencontre au studio pro et au-delà, contact ajouté au carnet, suite débloquée
const kyrb = G.EVENTS.find(x => x.id === 'kyrb'), kyrb2 = G.EVENTS.find(x => x.id === 'kyrb2');
assert(kyrb && kyrb2, 'les deux sorties existent');
assert.ok(/KYRB\./.test(kyrb.contact), 'contact au nom de KYRB.');
assert.deepStrictEqual(kyrb2.need, { contact: 'kyrb' });
function proStudio() {
  const P = G.hydrate({ level: 30, money: 1e12, lifetime: 1e12, owned: Object.fromEntries(G.ITEMS.map(i => [i.id, 1])) }, 0);
  assert(G.tierIndex(P) >= kyrb.tiers[0], 'palier assez haut');
  return P;
}
const P = proStudio();
// toutes les autres sorties déjà vues: la rencontre avec KYRB. sort la première, sa suite reste cachée
G.EVENTS.forEach(x => { if (x.id !== 'kyrb') P.ev.seen[x.id] = 3; });
assert.strictEqual(G.pickEvent(P, () => 0).id, 'kyrb');
P.ev.pending = { id: 'kyrb', left: 60 };
const res = G.resolveEvent(P, 0);
assert(res && res.rewards.some(r => r.k === 'contact' && /KYRB\./.test(r.name)), 'KYRB. rejoint les contacts');
assert(P.contacts.kyrb, 'contact enregistré');
assert(G.contactCount(P) >= 1);
P.ev.seen.kyrb = 3; P.ev.seen.kyrb2 = 0;
assert.strictEqual(G.pickEvent(P, () => 0).id, 'kyrb2', 'la suite est proposée une fois KYRB. rencontré');
// sans le contact, la suite ne sort jamais
const Q = proStudio(); G.EVENTS.forEach(x => { Q.ev.seen[x.id] = x.id === 'kyrb2' ? 0 : 3; });
assert.notStrictEqual(G.pickEvent(Q, () => 0).id, 'kyrb2');
// chaque choix se résout (risques gagnés et perdus)
[kyrb, kyrb2].forEach(x => x.choices.forEach((c, i) => [0, 0.999].forEach(roll => {
  const R = proStudio(); R.contacts.kyrb = kyrb.contact;
  R.team.staff = G.ROLES.map((r, k) => ({ id: k + 1, role: r.id, stars: 3, lvl: 2, morale: 50, salary: 1, rest: 0, train: 0 }));
  R.ev.pending = { id: x.id, left: 60 };
  const o = G.resolveEvent(R, i, () => roll);
  assert(o && o.rewards.length, x.id + ' choix ' + i);
})));
console.log('KYRB. : ok');
