// Tournée mondiale préparée et tournées locales des artistes. node worldtest.js
const assert = require('assert');
require('../data.js');
const G = require('../engine.js');
const D = globalThis.GameData, T = D.TUNING, W = D.WORLD, L = D.LTOUR;
let seed = 21; G.setRandom(() => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; });
const log = []; Object.assign(G.hooks, { worldDate: d => log.push('date ' + d.id), ltourDone: (a, r, x) => log.push('done ' + a.id), ltourIncident: (a, r, x) => log.push('inc ' + x.id), ltourCity: (a, r, e) => log.push('city ' + e.city) });
function mid() {
  const S = G.newState(0); S.level = 12; S.money = 1e9; S.lifetime = 1e9;
  ['casque', 'daw', 'micro', 'clavier', 'interface', 'samples', 'formation', 'moniteurs', 'distrib'].forEach(i => { S.owned[i] = 1; }); G.touch(S);
  ['beat', 'mix', 'voix', 'single'].forEach(a => { S.acts[a].auto = true; S.acts[a].run = true; S.acts[a].lvl = 30; });
  S.contacts.rappeur = 'K'; S.contacts.openmic = 'I';
  return S;
}
// 1. dates proposées: 8 parmi 12, stables pour une carrière, différentes à la suivante
assert.strictEqual(G.pickDates(0).length, W.pick); assert.deepStrictEqual(G.pickDates(0), G.pickDates(0)); assert.notDeepStrictEqual(G.pickDates(0), G.pickDates(1));
let S = mid(); assert.deepStrictEqual(S.world.picks, G.pickDates(0));
S.world.picks = ['olympia', 'velodrome', 'eko', 'budokan', 'allianz', 'berghain', 'msg', 'dome'];
G.advance(S, 0.1); assert(S.world.base, 'point de départ des défis');
// 2. défis: pendant la carrière (delta) et records
S.charts.num1 += 1; G.advance(S, 0.1); assert(S.world.done.olympia && log.includes('date olympia'), 'Olympia confirmée');
S.world.rec.proj = 9.2; G.advance(S, 0.1); assert(S.world.done.eko);
assert(!S.world.done.budokan); G.ACTS && (S.owned.clavier = 1); G.finishPiano(S, 61); G.advance(S, 0.1); assert(S.world.done.budokan, 'Budokan via le piano');
assert.strictEqual(G.worldNeed(S, D.WORLD.dates.find(d => d.id === 'velodrome')), 25);
const mult = G.worldMult(S); assert(Math.abs(mult - (1 + 3 * W.fameDate)) < 1e-9, 'multiplicateur ' + mult);
// 3. tournée locale: départ, villes, imprévus, retour, indisponibilité
const r = G.signArtist(S, 'kais'); r.fame = 30; r.mood = 70;
assert(G.ltourReady(S, r));
const pv = G.ltourPreview(S, 'kais', 'nationale', 'bus', 'classiques'); assert(pv.n === 5 && pv.cost > 0 && pv.cash > 0);
const m0 = S.money, t = G.startLtour(S, 'kais', 'nationale', 'bus', 'classiques');
assert(t && S.money < m0 && t.cities.length === 5 && t.cities[4] === 'Paris', 'finit dans la capitale ' + t.cities);
assert(!G.ltourReady(S, r) && !G.concertReady(S, r) && !G.startProject(S, { genre: 'rap', mood: 'rue', pub: 'ados', fmt: 'single', sl: [50, 50, 50], team: [null, null, null], artist: 'kais' }), 'artiste indisponible');
// répondre à un imprévu
let guard = 0; while (!r.tour.inc && guard++ < 50) { r.tour.inc = null; G.tickLtours(S, 1); if (!r.tour.inc && r.tour) { r.tour.inc = { id: 'radio', left: L.incLife, city: r.tour.cities[r.tour.i] }; } }
const f0 = r.fame, res = G.resolveIncident(S, 'kais', 0); assert(res && r.fame === f0 + 3 && !r.tour.inc, 'interview: +3 notoriété');
// la tournée avance même quand le joueur est absent (temps réel)
S.savedAt = 0; const off = G.offline(S, 5 * 480 * 1000 + 60000);
assert(!r.tour && r.tourLast && r.tourLast.n === 5 && S.label.ltours === 1 && r.tcd > 0, 'retour de tournée pendant l’absence');
assert(Object.keys(S.label.cities).length >= 4 && S.label.cities['fr:Paris']);
assert(log.includes('done kais'));
// 4. Allianz Parque (2 tournées locales) et sauvegarde
r.tcd = 0; G.startLtour(S, 'kais', 'petite', 'avion', 'show'); S.savedAt = 0; G.offline(S, 3 * 360 * 0.7 * 1000 + 60000);
G.advance(S, 0.1); assert(S.world.done.allianz, 'Allianz Parque confirmée');
r.tcd = 0; G.startLtour(S, 'kais', 'grande', 'van', 'nouveaux'); G.tickLtours(S, 500);
const R = G.hydrate(JSON.parse(JSON.stringify(S)), 0);
assert.deepStrictEqual(R.label.roster[0].tour, S.label.roster[0].tour); assert.deepStrictEqual(R.world, S.world); assert.deepStrictEqual(R.label.cities, S.label.cities);
// 5. départ en tournée mondiale: renommée en plus, souvenirs, nouveau pays
S.lifetime = 1e13; const base = G.fameAvailable(S), choices = G.homeChoices(S);
assert(choices.includes('fr') && choices.includes('jp') && choices.includes('br'));
const nd = G.worldDone(S).length, tr = G.tour(S, 1, 'jp');
assert.strictEqual(tr.base, base); assert.strictEqual(tr.extra, Math.round(base * (W.fameDate * nd)));
assert(S.fame === base + tr.extra && S.fameX === tr.extra && S.world.home === 'jp' && Object.keys(S.world.done).length === 0);
assert.strictEqual(G.souvenirs(S), nd); assert(!S.label.roster[0].tour, 'tournées locales arrêtées');
assert.strictEqual(G.fameAvailable(S), 0, 'les points bonus ne sont pas avancés sur les gains futurs');
S.lifetime = 8e13; assert(G.fameAvailable(S) === G.fameFor(8e13) - base);
assert.strictEqual(G.homeCountry(S).name, 'Japon');
S.money = 1e12; S.level = 12; Object.assign(S.owned, { casque: 1, daw: 1, micro: 1, interface: 1 }); S.label.roster[0].tcd = 0; G.touch(S); const t2 = G.startLtour(S, 'kais', 'petite', 'bus', 'classiques'); assert(t2 && t2.cities[2] === 'Tokyo', 'villes du Japon ' + t2.cities);
// défis plus durs à la tournée suivante
assert.strictEqual(G.worldNeed(S, D.WORLD.dates.find(d => d.id === 'velodrome')), Math.ceil(25 * 1.25));
console.log('OK: tournée mondiale (+' + tr.extra + ' points, ' + nd + ' dates) | tournées locales', S.label.ltours, '| villes', Object.keys(S.label.cities).length);
