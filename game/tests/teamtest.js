// Tests du moteur de l'équipe. node teamtest.js
const assert = require('assert');
require('../data.js');
const G = require('../engine.js');
const T = globalThis.GameData.TUNING;
let seed = 7;
G.setRandom(() => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; });
const log = [];
Object.assign(G.hooks, { hire: m => log.push('hire ' + m.name), staffLeave: m => log.push('leave ' + m.name), staffWarn: m => log.push('warn ' + m.name),
  staffLevel: (m, how) => log.push('lvl ' + m.name + ' ' + m.lvl + ' ' + how) });

function midState() {
  const S = G.newState(0);
  S.level = 8; S.money = 1e6; S.lifetime = 1e6;
  ['casque', 'daw', 'micro', 'clavier', 'interface'].forEach(i => { S.owned[i] = 1; });
  G.touch(S);
  ['beat', 'mix', 'voix', 'single'].forEach(a => { S.acts[a].auto = true; S.acts[a].run = true; S.acts[a].lvl = 10; });
  return S;
}

// 1. fermé avant le niveau requis, puis candidats générés
let S = G.newState(0);
assert.strictEqual(G.teamOpen(S), false);
G.advance(S, 1);
assert.strictEqual(S.team.pool.length, 0, 'pas de candidats avant le niveau ' + T.teamLevel);
S = midState();
G.advance(S, 0.1);
assert.strictEqual(S.team.pool.length, T.poolSize, 'candidats proposés');
S.team.pool.forEach(c => assert.ok(c.salary >= T.salaryMin && c.stars >= 1 && c.stars <= 5 && G.ROLE_BY[c.role]));
console.log('OK: candidats', S.team.pool.map(c => c.name + ' ' + c.role + ' *' + c.stars + ' ' + c.salary.toFixed(2) + '€/s').join(' | '));

// 2. capacité selon le palier, prime d'embauche, affectation automatique
const cap = G.teamCap(S);
const c0 = S.team.pool[0], m0 = S.money;
const m = G.hire(S, c0.id);
assert.ok(m, 'embauche');
assert.ok(Math.abs(S.money - (m0 - c0.salary * T.signSec)) < 1e-6, 'prime payée');
assert.ok(m.act && G.isUnlocked(S, G.ACT_BY[m.act]), 'affecté à une production débloquée');
while (S.team.staff.length < cap && S.team.pool.length) G.hire(S, S.team.pool[0].id);
G.refreshPool(S);
assert.strictEqual(G.hire(S, S.team.pool[0].id), null, 'capacité respectée (' + cap + ')');
console.log('OK: capacité', cap, 'au palier', G.tierIndex(S));

// 3. effet: plus rapide et plus rentable sur sa production
const act = G.ACT_BY[m.act];
const fx = G.staffFx(S, act.id);
assert.ok(fx.sp > 1 && fx.gn > 1, 'bonus actif');
const p1 = G.payout(S, act); m.act = null; const p0 = G.payout(S, act); m.act = act.id;
assert.ok(p1 > p0 * 1.05, 'gain supérieur avec le membre');
console.log('OK: effet sur', act.id, 'vitesse ×' + fx.sp.toFixed(2), 'gains ×' + fx.gn.toFixed(2));

// 4. échange d'affectation
if (S.team.staff.length >= 2) {
  const [a, b] = S.team.staff; const pa = a.act, pb = b.act;
  G.assign(S, a.id, pb);
  assert.strictEqual(a.act, pb); assert.strictEqual(b.act, pa, 'échange des postes');
  console.log('OK: échange de postes');
}
assert.strictEqual(G.assign(S, m.id, 'hit'), false, 'production verrouillée refusée');

// 5. salaires, moral et démission quand on ne paie plus
S.money = 0; S.acts.beat.auto = false; ['mix', 'voix', 'single', 'beat'].forEach(a => { S.acts[a].auto = false; S.acts[a].run = false; });
S.tracks = {};
log.length = 0;
for (let i = 0; i < 400; i++) G.advance(S, 1);
assert.ok(log.some(l => l.startsWith('warn')), 'alerte de moral');
assert.ok(log.some(l => l.startsWith('leave')), 'démission après moral nul');
assert.strictEqual(S.money, 0, 'jamais de budget négatif');
console.log('OK: impayés ->', log.filter(l => !l.startsWith('lvl')).join(', '));

// 6. absence: le moral ne descend pas sous le plancher, personne ne part
S = midState(); G.advance(S, 0.1); G.hire(S, S.team.pool[0].id);
const mm = S.team.staff[0]; mm.morale = 60;
S.savedAt = 0; const off = G.offline(S, 20 * 3600 * 1000);
assert.ok(off && off.wages > 0);
assert.strictEqual(S.team.staff.length, 1, 'pas de départ pendant l’absence');
assert.ok(mm.morale >= T.moraleOffline - 1e-9, 'plancher hors ligne: ' + mm.morale);
console.log('OK: absence, moral', mm.morale.toFixed(0), '| salaires versés', off.wages.toExponential(2));

// 7. formation, prime, vacances
S.money = 1e9; mm.morale = 50;
assert.ok(G.giveBonus(S, mm.id) && mm.morale === 85, 'prime');
const lv = mm.lvl;
assert.ok(G.train(S, mm.id), 'formation lancée');
assert.strictEqual(G.staffFx(S, mm.act).m, null, 'pas de bonus pendant la formation');
G.advance(S, T.trainTime * (lv + 1) + 1);
assert.ok(mm.lvl >= lv + 1, 'niveau gagné');
mm.morale = 30;
assert.ok(G.sendRest(S, mm.id));
G.advance(S, T.restTime + 1);
assert.strictEqual(mm.morale, 100, 'retour de vacances');
console.log('OK: prime, formation (niv ' + mm.lvl + '), vacances');

// 8. tournée: l'équipe devient anciens membres, revient sans prime
S.lifetime = 1e12; S.money = 1e9;
const names = S.team.staff.map(x => x.name);
assert.ok(G.tour(S, 5000));
assert.strictEqual(S.team.staff.length, 0);
assert.deepStrictEqual(S.team.alumni.map(x => x.name).slice(0, names.length), names);
S.level = 5; G.advance(S, 0.1);
const back = S.team.pool.find(c => c.back);
assert.ok(back && G.signCost(S, back) === 0, 'ancien membre gratuit');
assert.ok(back.lvl >= 2, 'garde son niveau');
console.log('OK: tournée, retour de', back.name, 'niv', back.lvl);

// 9. sauvegarde: aller-retour JSON et données corrompues
const R = G.hydrate(JSON.parse(JSON.stringify(S)), 0);
assert.deepStrictEqual(R.team.alumni, S.team.alumni);
const bad = G.hydrate({ acts: {}, team: { staff: [{ role: 'pirate' }, { role: 'mixeur', act: 'beat', stars: 99, morale: -5 }, { role: 'vocal', act: 'beat' }], pool: 'x', nextId: -3 } }, 0);
assert.strictEqual(bad.team.staff.length, 2);
assert.strictEqual(bad.team.staff[0].stars, 5); assert.strictEqual(bad.team.staff[0].morale, 0);
assert.strictEqual(bad.team.staff[1].act, null, 'pas deux membres sur une même production');
assert.ok(bad.team.nextId > Math.max(...bad.team.staff.map(x => x.id)) - 1);
console.log('OK: hydrate');

// 10. trophées d'équipe
S = midState(); G.advance(S, 0.1); G.hire(S, S.team.pool[0].id); G.advance(S, 0.1);
assert.ok(S.trophies.chef >= 1, 'trophée Chef d’équipe');
console.log('OK: trophées');
