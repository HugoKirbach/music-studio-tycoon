// Tests du mixage, des commandes clients et du Top 50. node featuretest.js
const assert = require('assert');
require('../data.js');
const G = require('../engine.js');
const T = globalThis.GameData.TUNING;
let seed = 11;
G.setRandom(() => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; });
const ev = [];
Object.assign(G.hooks, { orderDone: x => ev.push('done ' + x.id), orderFail: x => ev.push('fail ' + x.id), chartWeek: w => ev.push('week ' + w.week), release: e => ev.push('rel ' + e.pos) });
function mid() {
  const S = G.newState(0);
  S.level = 8; S.money = 1e7; S.lifetime = 1e7;
  ['casque', 'daw', 'micro', 'clavier', 'interface', 'samples', 'formation', 'moniteurs', 'distrib'].forEach(i => { S.owned[i] = 1; });
  G.touch(S);
  ['beat', 'mix', 'voix', 'single'].forEach(a => { S.acts[a].auto = true; S.acts[a].run = true; S.acts[a].lvl = 10; });
  return S;
}

// 1. Mixage: la production attend pendant le mix, puis rapporte plus une fois
let S = mid();
const act = G.ACT_BY.single;
assert.ok(G.canMix(S, 'single'));
assert.ok(G.startMix(S, 'single'));
const p0 = S.acts.single.prog; G.advance(S, 5);
assert.strictEqual(S.acts.single.prog, p0, 'production en pause pendant le mix');
assert.ok(!G.canMix(S, 'single'), 'pas deux mix à la fois');
const unit = G.payout(S, act);
const mx = G.finishMix(S, 'single', 1);
assert.strictEqual(mx.q, 5); assert.strictEqual(S.perfect, 1); assert.strictEqual(S.masters.length, 1);
const m0 = S.money; S.acts.single.prog = G.duration(S, act) - 0.01; G.advance(S, 0.02);
const gain = S.money - m0;
assert.ok(gain > unit * 1.9 && gain < unit * 2.2 + G.royRate(S), 'bonus x2 sur la production mixée: ' + (gain / unit).toFixed(2));
assert.strictEqual(S.acts.single.mix, null, 'bonus consommé');
G.startMix(S, 'beat'); G.cancelMix(S, 'beat'); assert.ok(!S.acts.beat.hold && !S.acts.beat.mix, 'annulation');
assert.strictEqual(G.mixStars(0), 1); assert.strictEqual(G.mixStars(0.5), 3);
console.log('OK: mixage (x' + (gain / unit).toFixed(2) + ', 5 étoiles, titre prêt à sortir)');

// 2. Commandes: offres, acceptation, livraison, réputation
S = mid();
G.tickOrders(S, T.orderFirst + 1);
assert.strictEqual(S.orders.offers.length, 1, 'première offre');
const off = S.orders.offers[0];
assert.ok(off.n >= 2 && off.reward > 0 && off.q >= 1 && off.q <= 5 && G.ACT_BY[off.act], JSON.stringify(off));
console.log('   offre:', off.client, '(' + off.kind + ')', off.n + ' x ' + off.act, off.q + '★', 'délai ' + off.time + ' s', 'prime ' + off.reward.toFixed(0));
// une commande à qualité atteignable sans mix
off.q = 1; assert.ok(G.acceptOrder(S, off.id));
assert.strictEqual(S.orders.active.length, 1);
const money0 = S.money;
for (let i = 0; i < 400 && S.orders.active.length; i++) { G.advance(S, 1); G.tickOrders(S, 1); }
assert.strictEqual(S.orders.done, 1, 'commande livrée ' + ev.join(','));
assert.strictEqual(S.orders.rep, T.repWin, 'réputation +');
// commande impossible (5★ sans mix) -> échec au délai
S.orders.offers = []; S.orders.cd = 0; G.tickOrders(S, 0.01);
const o2 = S.orders.offers[0]; o2.q = 5; G.acceptOrder(S, o2.id);
const rep0 = S.orders.rep;
for (let i = 0; i < o2.time + 5; i++) { G.advance(S, 1); G.tickOrders(S, 1); }
assert.strictEqual(S.orders.failed, 1, 'échec au délai');
assert.strictEqual(S.orders.rep, Math.max(0, rep0 - T.repLose));
// avec un mix 5★, une unité compte
S.orders.offers = []; S.orders.cd = 0; G.tickOrders(S, 0.01);
const o3 = S.orders.offers[0]; o3.q = 5; o3.n = 1; G.acceptOrder(S, o3.id);
G.startMix(S, o3.act); G.finishMix(S, o3.act, 1);
for (let i = 0; i < 200 && S.orders.active.length; i++) { G.advance(S, 0.5); }
assert.strictEqual(S.orders.done, 2, 'le mix 5★ remplit une commande exigeante');
// les offres expirent
S.orders.offers = []; S.orders.cd = 0; G.tickOrders(S, 0.01); G.tickOrders(S, T.orderOfferLife + 1);
assert.ok(S.orders.offers.every(x => x.life > 0));
console.log('OK: commandes (livraison, échec, mix exigé, expiration) | réputation', S.orders.rep);

// 3. Top 50: sortie, classement, semaine, gains
S = mid(); S.level = 10;
G.tickCharts(S, 1);
assert.strictEqual(S.charts.rivals.length, T.chartSize);
let top = G.chartTop(S);
assert.strictEqual(top.length, 50); assert.ok(top.every((e, i) => e.pos === i + 1));
assert.ok(G.canFreeRelease(S));
const e1 = G.release(S, 'free', false, 'single');
assert.ok(e1 && e1.pos >= 1, 'sortie classée');
assert.ok(!G.canFreeRelease(S), 'une sortie gratuite par semaine');
console.log('   sortie catalogue', e1.q + '★ ->', '#' + e1.pos);
G.startMix(S, 'single'); G.finishMix(S, 'single', 1);
const mid5 = S.masters[S.masters.length - 1].id;
const cash = S.money, pc = G.promoCost(S);
const e2 = G.release(S, mid5, true);
assert.ok(e2 && Math.abs((cash - S.money) - pc) < 1e-6, 'promo payée');
console.log('   sortie mixée 5★ + promo ->', '#' + e2.pos, '| meilleur', S.charts.best);
assert.ok(e2.pos < e1.pos || e1.pos === 1, 'un titre mixé 5★ avec promo se classe mieux');
const m1 = S.money;
G.tickCharts(S, T.weekLen + 1);
assert.ok(S.money > m1, 'gains de la semaine');
assert.strictEqual(S.charts.week, 2);
assert.ok(G.canFreeRelease(S), 'nouvelle sortie gratuite');
console.log('   semaine 1 ->', (S.money - m1).toFixed(0), '€ pour', S.charts.mine.length, 'titre(s) classé(s)');
// les titres finissent par sortir du classement
for (let w = 0; w < 30; w++) G.weekEnd(S);
assert.ok(S.charts.mine.length === 0, 'les titres vieillissent et sortent du Top 50');
assert.ok(S.trophies !== undefined);
console.log('OK: Top 50 | meilleur classement #' + S.charts.best + ' | numéros un', S.charts.num1);

// 4. Trophées et sauvegarde
G.checkTrophies(S, true);
assert.ok(S.trophies.mixeur >= 1 && S.trophies['oreille-absolue'] >= 1, 'trophées de mix');
const R = G.hydrate(JSON.parse(JSON.stringify(S)), 0);
assert.deepStrictEqual(R.charts.rivals.map(r => r.t), S.charts.rivals.map(r => r.t));
assert.strictEqual(R.orders.rep, S.orders.rep); assert.strictEqual(R.masters.length, S.masters.length);
const bad = G.hydrate({ acts: { beat: { mix: { m: 99, q: 9 }, hold: true } }, orders: { offers: [{ act: 'zzz' }, { act: 'beat', n: 5, q: 9 }], rep: 500 }, charts: { mine: [{ act: 'beat', s: 3 }], rivals: 'x' }, masters: [{ act: 'nope' }] }, 0);
assert.strictEqual(bad.acts.beat.mix.m, 1 + T.mixMax); assert.strictEqual(bad.acts.beat.hold, false);
assert.strictEqual(bad.orders.offers.length, 1); assert.strictEqual(bad.orders.offers[0].q, 5); assert.strictEqual(bad.orders.rep, T.repMax);
assert.strictEqual(bad.charts.mine.length, 1); assert.strictEqual(bad.masters.length, 0);
console.log('OK: trophées et sauvegarde');
