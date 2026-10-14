// Label: artistes signés et cycle d'album. node labeltest.js
const assert = require('assert');
require('../data.js');
const G = require('../engine.js');
const T = globalThis.GameData.TUNING;
let seed = 9; G.setRandom(() => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; });
const log = []; Object.assign(G.hooks, { artistAsk: a => log.push('ask ' + a.id), artistSign: a => log.push('sign ' + a.id), artistIgnored: a => log.push('ignored ' + a.id) });
function mid() {
  const S = G.newState(0); S.level = 9; S.money = 1e8; S.lifetime = 1e8;
  ['casque', 'daw', 'micro', 'clavier', 'interface'].forEach(i => { S.owned[i] = 1; }); G.touch(S);
  ['beat', 'mix', 'voix', 'single'].forEach(a => { S.acts[a].auto = true; S.acts[a].run = true; S.acts[a].lvl = 10; });
  return S;
}
function album(S, cfg) { const c = G.startProject(S, cfg); assert(c, 'projet lancé ' + JSON.stringify(cfg)); while (S.proj.cur) G.tickProject(S, 5); return S.proj.last; }
// 1. disponibilité: contacts rencontrés ou studio assez grand, capacité selon le lieu
let S = G.newState(0); assert(!G.labelOpen(S));
S = mid();
assert(G.labelOpen(S) && G.labelCap(S) === 1);
assert(!G.artistAvailable(S, G.ART_BY.kais) && !G.artistAvailable(S, G.ART_BY.zoe), 'personne au départ dans la chambre');
S.contacts.rappeur = 'Kaïs'; S.contacts.openmic = 'Inès';
assert(G.artistAvailable(S, G.ART_BY.kais));
const m0 = S.money, cost = G.artistCost(S), r = G.signArtist(S, 'kais');
assert(r && S.money === m0 - cost && log.includes('sign kais'));
assert.strictEqual(G.signArtist(S, 'ines'), null, 'capacité atteinte');
assert(!G.artistAvailable(S, G.ART_BY.kais), 'déjà signé');
console.log('OK: signature, coût', cost.toFixed(0));
// 2. demande d'album après askFirst secondes de jeu, et oubli sans drame
G.tickLive(S, T.askFirst + 1); assert(r.ask && log.includes('ask kais'));
G.tickLive(S, T.askLife + 1); assert(!r.ask && r.mood === 65 - 8 && log.includes('ignored kais'));
console.log('OK: demande et oubli (humeur', r.mood + ')');
// 3. album réussi dans son genre: notoriété, humeur, bonus de gains
r.cd = 0; G.tickLabel(S, 1); assert(r.ask);
const g0 = G.labelMult(S), p0 = G.payout(S, G.ACT_BY.beat);
const res = album(S, { genre: 'rap', mood: 'rue', pub: 'ados', fmt: 'single', sl: [80, 75, 40], artist: 'kais' });
assert(res.artist && res.artist.match && res.artist.likes && res.artist.ask && res.artist.dFame > 0 && res.artist.dMood > 0, JSON.stringify(res.artist));
assert(!r.ask && r.albums === 1 && S.label.albums === 1 && r.disco[0].t === res.title);
assert(G.labelMult(S) > g0 && G.payout(S, G.ACT_BY.beat) > p0, 'la notoriété augmente les gains');
assert(S.charts.mine.some(e => e.pj && e.pj.ar === 'kais') || !res.pos);
console.log('OK: album de Kaïs', res.avg + '/10 · notoriété', r.fame, '(' + res.artist.dFame + ') · humeur', r.mood);
// 4. genre de l'artiste ouvert même sans la recherche, hors de son genre: humeur en baisse
S.money = 1e9; S.trophies = {}; S.contacts.pirate = 'Nox'; S.label.roster[0].mood = 60;
assert(!G.genreOpen(S, 'jazz'));
assert.strictEqual(G.startProject(S, { genre: 'jazz', mood: 'voyage', pub: 'fins', fmt: 'single', artist: 'kais' }), null, 'pas le genre de Kaïs');
const bad = album(S, { genre: 'pop', mood: 'fete', pub: 'large', fmt: 'single', sl: [50, 65, 80], artist: 'kais' });
assert(!bad.artist.match && bad.artist.dMood < 0);
S.owned.distrib = 1; S.owned.traitement = 1; G.touch(S);
console.log('OK: hors genre -> humeur', bad.artist.dMood);
// 5. projet sans artiste inchangé, artiste inconnu refusé
assert.strictEqual(G.startProject(S, { genre: 'rap', mood: 'rue', pub: 'ados', fmt: 'single', artist: 'maya' }), null);
const free = album(S, { genre: 'rap', mood: 'rue', pub: 'ados', fmt: 'single' }); assert(!free.artist);
// 6. tournée: les artistes restent; sauvegarde
S.lifetime = 1e15; r.ask = { left: 10 };
assert(G.tour(S, 5));
assert(S.label.roster.length === 1 && !r.ask && r.cd === T.askEvery && r.fame > 0, 'artistes conservés');
const R = G.hydrate(JSON.parse(JSON.stringify(S)), 0);
assert.deepStrictEqual(R.label, S.label);
const H = G.hydrate({ label: { roster: [{ id: 'kais', fame: 500, mood: -3 }, { id: 'kais' }, { id: 'pirate-x' }], albums: 'x' } }, 0);
assert(H.label.roster.length === 1 && H.label.roster[0].fame === 100 && H.label.roster[0].mood === 0 && H.label.albums === 0);
assert(S.trophies.label >= 1 && S.trophies.albums >= 1, 'trophées du label');
console.log('OK: tournée, sauvegarde, trophées');
// 7. Concerts
{
  const S2 = mid(); S2.contacts.rappeur = 'K'; S2.contacts.openmic = 'I'; S2.owned.distrib = 1; S2.owned.traitement = 1; G.touch(S2);
  const k = G.signArtist(S2, 'kais');
  const cfg = G.startConcert(S2, 'kais');
  assert(cfg && cfg.concert.venue === 0 && cfg.bpm === globalThis.GameData.GENRE_BPM.rap && cfg.notes.length > 20);
  const m0 = S2.money, res = G.finishConcert(S2, 'kais', 0, { score: 0.9, combo: 30 });
  assert(res.grade === 3 && S2.money > m0 && res.dFame > 0 && k.ccd === T.concertEvery && S2.label.concerts === 1 && S2.label.bestVenue === 1);
  assert.strictEqual(G.startConcert(S2, 'kais'), null, 'repos entre deux concerts');
  G.tickLive(S2, T.concertEvery + 1); assert(G.startConcert(S2, 'kais'));
  k.fame = 70; assert.strictEqual(G.venueIndex(k), 3, 'Zénith à 65 de notoriété');
  const bad = G.finishConcert(S2, 'kais', 9, { score: 0.2, combo: 2 }); assert(bad.venue === 3 && bad.grade === 0 && bad.dMood < 0, 'salle bornée à la notoriété');
  console.log('OK: concerts, bar ->', res.cash.toFixed(0), '€, notoriété +' + res.dFame);
  // 8. Histoires
  k.scd = 0; k.ask = null; k.story = null; G.tickLabel(S2, 1);
  assert(k.story && G.STORY_BY[k.story.id] && k.story.id !== 'duo', 'pas de duo sans autre artiste: ' + (k.story && k.story.id));
  k.story = { id: 'style', left: 100, genre: 'jazz', other: null };
  const st = G.resolveStory(S2, 'kais', 0);
  assert(st.text.includes('Jazz') && k.style === 'jazz' && !k.story);
  assert(G.startProject(S2, { genre: 'jazz', mood: 'voyage', pub: 'fins', fmt: 'single', artist: 'kais' }), 'style ouvert pour son album');
  while (S2.proj.cur) G.tickProject(S2, 5);
  assert(S2.proj.last.artist.match && S2.proj.last.artist.style && k.style === null, 'le style compte comme son genre une fois');
  S2.label.roster.push({ id: 'ines', fame: 10, mood: 60, albums: 0, cd: 999, ask: null, disco: [], ccd: 0, scd: 999, story: null, style: null, duo: null });
  k.story = { id: 'duo', left: 100, other: 'ines', genre: 'pop' };
  G.resolveStory(S2, 'kais', 0); assert(k.duo === 'ines');
  const ines = S2.label.roster[1], f0 = ines.fame;
  G.startProject(S2, { genre: 'rap', mood: 'rue', pub: 'ados', fmt: 'single', sl: [80, 75, 40], artist: 'kais' }); while (S2.proj.cur) G.tickProject(S2, 5);
  assert(S2.proj.last.artist.duo === 'ines' && ines.fame > f0 && !k.duo, 'duo: les deux en profitent');
  k.story = { id: 'tele', left: 100 }; const w = G.resolveStory(S2, 'kais', 1, () => 0.1), l0 = k.fame;
  k.story = { id: 'tele', left: 100 }; const lo = G.resolveStory(S2, 'kais', 1, () => 0.9);
  assert(w.win === true && lo.win === false && k.fame < l0);
  k.story = { id: 'panne', left: 100 }; S2.money = 0; assert.strictEqual(G.resolveStory(S2, 'kais', 0), null, 'pas assez d’argent'); assert(k.story);
  k.story = { id: 'tele', left: 5 }; G.tickLabel(S2, 6); assert(!k.story, 'histoire oubliée');
  const R2 = G.hydrate(JSON.parse(JSON.stringify(S2)), 0); assert.deepStrictEqual(R2.label, S2.label);
  console.log('OK: histoires (style, duo, pari, coût, oubli), sauvegarde');
}
