// Absence: le Top 50 continue de payer, l'équipe se repose. node awaytest.js
const assert = require('assert');
require('../data.js');
const G = require('../engine.js');
const T = globalThis.GameData.TUNING;
let seed = 3; G.setRandom(() => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; });
function mid() {
  const S = G.newState(0); S.level = 10; S.money = 1e7; S.lifetime = 1e7;
  ['casque', 'daw', 'micro', 'clavier', 'interface'].forEach(i => { S.owned[i] = 1; }); G.touch(S);
  ['beat', 'mix', 'voix', 'single'].forEach(a => { S.acts[a].auto = true; S.acts[a].run = true; S.acts[a].lvl = 10; });
  G.tickCharts(S, 1);
  for (let i = 0; i < 3; i++) { G.release(S, 'free', true, 'single'); S.charts.free = 0; S.charts.freeW = -1; }
  return S;
}
// 1. jeu ouvert en arrière-plan: les semaines passent et rapportent
let S = mid(); const w0 = S.charts.week, n = S.charts.mine.length;
assert(n >= 1, 'titres classés');
let ch = 0; for (let i = 0; i < 900; i++) ch += G.advanceAway(S, 1);
assert(S.charts.week >= w0 + 4 && ch > 0, 'semaines et gains du Top 50 en arrière-plan: ' + (S.charts.week - w0) + ' / ' + ch);
// 2. jeu fermé: rendement réduit, et le gain compte dans le débrief
const A = mid(), B = mid(); A.savedAt = 0; B.savedAt = 0;
const oa = G.offline(A, 900 * 1000);
assert(oa.charts > 0 && oa.gain >= oa.charts, 'Top 50 dans le débrief: ' + oa.charts);
// 3. une longue absence ne boucle pas sans fin et les titres finissent par sortir du classement
const L = mid(); L.savedAt = 0; const ol = G.offline(L, 6 * 3600 * 1000);
assert(L.charts.left > 0 && L.charts.left <= T.weekLen && isFinite(ol.charts));
console.log('OK: Top 50 en absence', Math.round(ch), '| fermé', Math.round(oa.charts), '| 6 h', Math.round(ol.charts), 'titres restants', L.charts.mine.length);
