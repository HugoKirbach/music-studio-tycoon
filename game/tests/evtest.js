const { run } = require('./tune.js');
const assert = require('assert');
require('../data.js');
const G = require('../engine.js');

// 1. Tous les scénarios et tous les choix se résolvent sans erreur, à plusieurs étapes de progression
for (const stage of [0, 0.5, 2, 6]) {
  const r = stage ? run({}, stage, false, 'active') : null;
  const base = r ? r.S : G.newState(0);
  const Gm = r ? r.G : G;
  const ref = Gm.eventRef(base);
  console.log(`--- progression ${stage} h | niv ${base.level} | budget ${base.money.toExponential(2)} | réf. 1 min ${ref.toExponential(2)} | revenu continu/s ${(Gm.royRate(base) + Gm.activeRate(base)).toExponential(2)}`);
  if (stage === 0 || stage === 2) {
    const ev = Gm.EVENTS[0];
    ev.choices.forEach((c, i) => {
      const S = JSON.parse(JSON.stringify(base)); const H = Gm.hydrate(S, 0);
      H.ev.pending = { id: ev.id, left: 100 };
      const m0 = H.money, xp0 = H.xp, lv0 = H.level;
      const res = Gm.resolveEvent(H, i);
      console.log(`   ${ev.id} choix ${'ABC'[i]} -> ${res.rewards.map(w => w.k + (w.v ? ':' + w.v.toExponential(1) : '')).join(', ')} | gain argent ${(H.money - m0).toExponential(2)}`);
    });
  }
}

// 2. Tous les scénarios x choix
function ready() {
  const S = G.hydrate({ level: 12, money: 1e12, lifetime: 1e12, owned: Object.fromEntries(G.ITEMS.map(i => [i.id, 1])),
    rd: { nodes: Object.fromEntries(G.RESEARCH.nodes.map(n => [n.id, 1])) }, contacts: Object.fromEntries(G.EVENTS.map(x => [x.id, 1])),
    team: { staff: G.ROLES.map((r, k) => ({ id: k + 1, role: r.id, stars: 3, lvl: 2, morale: 50, salary: 1 })) } }, 0);
  return S;
}
let locked = 0, paid = 0, risky = 0;
for (const x of G.EVENTS) for (let i = 0; i < x.choices.length; i++) {
  const c = x.choices[i];
  // sans les conditions: refus propre
  const N = G.newState(0); N.level = 5; N.ev.pending = { id: x.id, left: 50 };
  if (!G.choiceInfo(N, c).ok) { locked++; assert.strictEqual(G.resolveEvent(N, i), null, 'option verrouillée refusée ' + x.id + i); assert(N.ev.pending); }
  for (const roll of c.risk ? [0, 0.999] : [0.5]) {
    const S = ready(); S.ev.pending = { id: x.id, left: 50 };
    const m0 = S.money, mo0 = S.team.staff[0].morale;
    const res = G.resolveEvent(S, i, () => roll);
    assert(res && res.rewards.length > 0, x.id + i);
    assert(S.ev.pending === null && S.ev.cd >= 300 && S.ev.cd <= 660);
    if (c.cost) { paid++; assert(res.rewards[0].k === 'spent' && Math.abs(res.rewards[0].v - G.eventRef(S) * c.cost) / res.rewards[0].v < 0.5); }
    if (c.risk) { risky++; assert.strictEqual(res.win, roll < c.risk.p); assert.strictEqual(res.outcome, res.win ? c.outcome : c.risk.outcome); }
    res.rewards.forEach(w => { if (w.k === 'morale') assert(S.team.staff[0].morale === Math.min(100, mo0 + w.v)); if (w.k === 'master') assert(S.masters.length >= 1); });
  }
}
console.log('OK:', G.EVENTS.length, 'scénarios résolus |', locked, 'options sous condition refusées |', paid, 'paiements |', risky, 'tirages risqués');
// suites d'histoires: seulement après avoir rencontré le contact
const P = G.newState(0); P.owned = { laptop: 1 }; P.level = 30;
const avail = () => G.EVENTS.filter(x => x.need && x.need.contact).filter(x => { for (let k = 0; k < 200; k++) { const e = G.pickEvent(P, Math.random); if (e && e.id === x.id) return true; } return false; });
assert.strictEqual(avail().length, 0, 'aucune suite sans contact');
console.log('OK: suites d’histoires réservées aux contacts rencontrés');

// 3. Contact une seule fois
let S = G.newState(0); S.ev.pending = { id: 'rappeur', left: 50 };
G.resolveEvent(S, 0); assert(S.contacts.rappeur);
const bonus1 = G.payout(S, G.ACTS[0]);
S.ev.pending = { id: 'rappeur', left: 50 }; const again = G.resolveEvent(S, 0);
assert(again.rewards.some(r => r.again), 'deuxième rencontre: argent à la place');
assert(G.contactCount(S) === 1);
console.log('OK: contact unique, bonus de gains x', (bonus1 / G.ACTS[0].pay / G.levelMult(S) / G.valueMult(S)).toFixed(3));

// 4. Le boost ne couvre que sa durée, même pendant une longue absence
S = G.newState(0); S.level = 4; S.owned.casque = 1; G.touch(S);
S.acts.beat.auto = true; S.acts.beat.run = true;
let ref = G.hydrate(JSON.parse(JSON.stringify(S)), 0);
G.advance(ref, 3600);
S.boost = { m: 3, left: 60, t: 60 };
G.advance(S, 3600);
const surplus = S.money - ref.money;
console.log('OK: boost x3 pendant 60 s sur 1 h -> surplus', surplus.toFixed(1), '€ (attendu ≈ 2 x gain de 60 s =', (2 * ref.money / 60).toFixed(1) + ')', '| boost restant', S.boost.left, S.boost.m);
assert(S.boost.left === 0 && S.boost.m === 1);

// 5. Cycle d'invitation: apparition, attente, expiration, pause quand le dialogue est ouvert
S = G.newState(0); S.ev.cd = 1;
let spawned = 0, expired = 0; G.hooks.eventSpawn = () => spawned++; G.hooks.eventExpire = () => expired++;
G.tickEvents(S, 0.5); assert(!S.ev.pending);
G.tickEvents(S, 0.6); assert(S.ev.pending && spawned === 1);
S.ev.hold = true; G.tickEvents(S, 500); assert(S.ev.pending, 'hold bloque l’expiration');
S.ev.hold = false; G.tickEvents(S, 119); assert(S.ev.pending);
G.tickEvents(S, 2); assert(!S.ev.pending && expired === 1);
console.log('OK: apparition, pause, expiration');

// 6. Rotation: pas de répétition tant que d'autres scénarios n'ont pas été vus
S = G.newState(0); S.owned.casque = 1;
const seen = [];
for (let k = 0; k < 6; k++) { const x = G.pickEvent(S, Math.random); seen.push(x.id); S.ev.seen[x.id] = (S.ev.seen[x.id] || 0) + 1; }
console.log('palier 0, 6 tirages:', seen.join(', '));
assert(new Set(seen.slice(0, 3)).size === 3, 'trois scénarios différents de suite');

// 7. Anciennes sauvegardes et données corrompues
const old = { money: 50, level: 3, acts: {}, tracks: {}, owned: { laptop: 1 } };
const H = G.hydrate(old, 0); assert(H.ev && H.boost && H.contacts); assert(H.ev.cd === 180);
const bad = G.hydrate({ ev: { cd: 'x', pending: { id: 'inconnu', left: 5 }, seen: { rappeur: -3 } }, boost: { m: 'a', left: -4 }, contacts: { rappeur: 1, faux: 1 } }, 0);
assert(bad.ev.pending === null && bad.boost.left === 0 && Object.keys(bad.contacts).join() === 'rappeur');
console.log('OK: anciennes sauvegardes et données invalides');

// 7. Jauge du boost : t suit la durée de départ, est recalée par un boost plus long, jamais sous left
{
  const A = G.newState(0);
  assert(A.boost.t === 0);
  // applyReward n'est pas exporté : on passe par resolveEvent avec une scène qui donne un boost
  const sc = G.EVENTS.find(e => e.choices.some(c => c.rw.some(r => r.k === 'boost')));
  const ci = sc.choices.findIndex(c => c.rw.some(r => r.k === 'boost'));
  const bs = sc.choices[ci].rw.find(r => r.k === 'boost');
  A.ev.pending = { id: sc.id, left: 100 };
  G.resolveEvent(A, ci, () => 0.5);
  assert(A.boost.left === bs.s && A.boost.t === bs.s, 'boost: t = durée de départ');
  G.advance(A, 10);
  assert(Math.abs(A.boost.left - (bs.s - 10)) < 1e-9 && A.boost.t === bs.s, 'boost: t constant pendant la décrue');
  G.advance(A, 1000);
  assert(A.boost.left === 0 && A.boost.t === 0 && A.boost.m === 1, 'boost: remis à zéro');
  const H = G.hydrate({ boost: { m: 2, left: 30, t: 5 } }, 0); assert(H.boost.t === 30, 'hydrate: t >= left');
  const H2 = G.hydrate({ boost: { m: 2, left: 30 } }, 0); assert(H2.boost.t === 30);
  const H3 = G.hydrate({ boost: { m: 2, left: 0, t: 99 } }, 0); assert(H3.boost.t === 0);
  console.log('OK: jauge de boost (t) cohérente');
}
