// Paliers de maîtrise des productions. node perktest.js
const assert = require('assert');
require('../data.js');
const G = require('../engine.js');
const D = globalThis.GameData, T = D.TUNING;
let seed = 7; G.setRandom(() => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; });
// 1. effets cumulés et comparaison avec l'ancien ×2 par palier
const old = l => [10, 25, 50, 100, 200].filter(x => l >= x).length;
const rows = [9, 10, 25, 50, 75, 100, 150, 200].map(l => { const f = G.perkFx(l); return [l, Math.pow(2, old(l)), +(f.gain * f.speed * (1 + f.tube * (D.TUBE - 1))).toFixed(1)]; });
console.log('rang | ancien | nouveau (gains × vitesse × tubes)'); rows.forEach(r => console.log(' ', r.join(' | ')));
rows.forEach(r => assert(r[2] <= r[1] * 1.35 && r[2] >= r[1] * 0.7, 'équilibre proche de l’ancien système au rang ' + r[0]));
assert.strictEqual(G.perkFx(9).n, 0); assert.strictEqual(G.perkFx(200).n, 7);
assert.strictEqual(G.nextPerk(10).name, 'Signature'); assert.deepStrictEqual(G.perksBetween(9, 50).map(p => p.id), ['rode', 'signature', 'hit']);
// 2. vitesse, royalties, synergie
const S = G.newState(0); S.level = 20; ['casque', 'daw', 'micro', 'clavier', 'interface'].forEach(i => { S.owned[i] = 1; }); G.touch(S);
const beat = G.ACT_BY.beat, d0 = G.duration(S, beat); S.acts.beat.lvl = 10; assert(Math.abs(G.duration(S, beat) - d0 / 1.5) < 1e-9, 'Rodé: 50 % plus rapide');
S.tracks.beat = 1000; S.acts.beat.lvl = 74; const r0 = G.royRate(S); S.acts.beat.lvl = 75; assert(Math.abs(G.royRate(S) / r0 - 3) < 1e-9, 'Catalogue culte: royalties ×3');
const p0 = G.payout(S, G.ACT_BY.mix); S.acts.beat.lvl = 100; assert(Math.abs(G.payout(S, G.ACT_BY.mix) / p0 - 1.05) < 1e-9, 'Locomotive: +5 % pour les autres productions');
// 3. tubes: environ 12 % des productions rapportent ×10, comptés et sauvegardés
S.acts.beat.lvl = 50; const u = G.payout(S, beat); let tot = 0, n = 0;
for (let i = 0; i < 4000; i++) { const m = S.money; G.startAct(S, 'beat'); S.acts.beat.prog = 1e9; G.advance(S, 0.001); n++; }
const rate = S.acts.beat.tubes / n; assert(rate > 0.09 && rate < 0.15, 'taux de tubes ' + rate);
const R = G.hydrate(JSON.parse(JSON.stringify(S)), 0); assert.strictEqual(R.acts.beat.tubes, S.acts.beat.tubes);
assert(S.trophies.tubes >= 2, 'palmarès Faiseur de tubes');
// grand lot hors ligne: moyenne
const B = G.newState(0); B.acts.beat.lvl = 50; B.acts.beat.auto = true; B.acts.beat.run = true; G.advanceAway(B, 3600);
assert(B.acts.beat.tubes > 0);
console.log('OK: tubes', (rate * 100).toFixed(1) + ' %, ', S.acts.beat.tubes, 'sur', n);
