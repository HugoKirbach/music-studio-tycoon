/* Premier Mix: moteur de jeu (données + logique pure, sans DOM). */
(function (root) {
  'use strict';

  var ROY = 0.0008;          // royalties par seconde et par titre, en fraction du gain de base
  var OFFLINE_CAP = 6 * 3600; // secondes d'absence prises en compte
  var OFFLINE_EFF = 0.5;      // rendement hors ligne
  var TAP = 0.4;              // secondes gagnées par clic sur une production en cours
  var MILESTONES = [10, 25, 50, 100, 200];

  // ---------- Données (voir data.js) ----------
  var D = root.GameData;
  var ACTS = D.ACTS, ITEMS = D.ITEMS, TIERS = D.TIERS, EVENTS = D.EVENTS, TROPHIES = D.TROPHIES, T = D.TUNING;
  ROY = T.roy; OFFLINE_CAP = T.offlineCap; OFFLINE_EFF = T.offlineEff; TAP = T.tap;

  var ROLES = D.ROLES || [], NAMES = D.NAMES || [];
  var ACT_BY = {}, ITEM_BY = {}, EVENT_BY = {}, TROPHY_BY = {}, ROLE_BY = {};
  ROLES.forEach(function (r) { ROLE_BY[r.id] = r; });
  var rand = Math.random;
  ACTS.forEach(function (a) { ACT_BY[a.id] = a; });
  ITEMS.forEach(function (i) { ITEM_BY[i.id] = i; });
  EVENTS.forEach(function (x) { EVENT_BY[x.id] = x; });
  TROPHIES.forEach(function (t) { TROPHY_BY[t.id] = t; });

  var hooks = {};
  var cache = typeof WeakMap !== 'undefined' ? new WeakMap() : null;

  // ---------- Calculs ----------
  function xpNeeded(level) { return Math.round(T.xpBase * Math.pow(T.xpGrowth, level - 1)); }

  function newState(now) {
    now = now || Date.now();
    var acts = {};
    ACTS.forEach(function (a) { acts[a.id] = { lvl: 0, auto: false, prog: 0, run: false, done: 0 }; });
    return { v: 1, money: 0, xp: 0, level: 1, lifetime: 0, owned: { laptop: 1 }, acts: acts, tracks: {},
      savedAt: now, created: now, sound: false, legend: false, epoch: 0,
      boost: { m: 1, left: 0, t: 0 }, contacts: {}, trophies: {}, fame: 0, tours: 0, ev: { cd: T.eventFirst, seen: {}, pending: null, hold: false },
      team: newTeam() };
  }
  function newTeam() { return { staff: [], pool: [], poolCd: 0, alumni: [], nextId: 1, hired: 0 }; }

  function num(x, d) { return typeof x === 'number' && isFinite(x) ? x : d; }

  // Reconstruit un état propre à partir de données importées ou stockées.
  function hydrate(o, now) {
    var S = newState(now);
    if (!o || typeof o !== 'object') return S;
    S.money = Math.max(0, num(o.money, 0));
    S.xp = Math.max(0, num(o.xp, 0));
    S.level = Math.max(1, Math.floor(num(o.level, 1)));
    S.lifetime = Math.max(S.money, num(o.lifetime, 0));
    S.savedAt = num(o.savedAt, S.savedAt);
    S.created = num(o.created, S.created);
    S.sound = !!o.sound;
    S.legend = !!o.legend;
    S.epoch = Math.max(0, num(o.epoch, 0));
    S.fame = Math.max(0, Math.floor(num(o.fame, 0)));
    S.tours = Math.max(0, Math.floor(num(o.tours, 0)));
    if (o.owned && typeof o.owned === 'object') {
      Object.keys(o.owned).forEach(function (k) { if (ITEM_BY[k] && o.owned[k]) S.owned[k] = 1; });
    }
    ACTS.forEach(function (a) {
      var s = o.acts && o.acts[a.id];
      if (!s) return;
      S.acts[a.id] = { lvl: Math.max(0, Math.floor(num(s.lvl, 0))), auto: !!s.auto, prog: Math.max(0, num(s.prog, 0)),
        run: !!s.run, done: Math.max(0, num(s.done, 0)) };
    });
    if (o.tracks && typeof o.tracks === 'object') {
      ACTS.forEach(function (a) { S.tracks[a.id] = Math.max(0, num(o.tracks[a.id], 0)); });
    }
    if (o.boost && typeof o.boost === 'object') {
      var bl = Math.max(0, num(o.boost.left, 0));
      S.boost = { m: Math.max(1, num(o.boost.m, 1)), left: bl, t: bl > 0 ? Math.max(bl, num(o.boost.t, bl)) : 0 };
    }
    if (o.contacts && typeof o.contacts === 'object') EVENTS.forEach(function (x) { if (o.contacts[x.id]) S.contacts[x.id] = x.contact; });
    if (o.trophies && typeof o.trophies === 'object') TROPHIES.forEach(function (t) { if (o.trophies[t.id]) S.trophies[t.id] = 1; });
    if (o.ev && typeof o.ev === 'object') {
      S.ev.cd = Math.max(0, num(o.ev.cd, T.eventFirst));
      EVENTS.forEach(function (x) { S.ev.seen[x.id] = Math.max(0, Math.floor(num(o.ev.seen && o.ev.seen[x.id], 0))); });
      var p = o.ev.pending;
      if (p && EVENT_BY[p.id] && num(p.left, 0) > 0) S.ev.pending = { id: p.id, left: Math.min(num(p.left, 0), T.eventWindow) };
    }
    if (o.team && typeof o.team === 'object') hydrateTeam(S, o.team);
    return S;
  }

  function cleanMember(m, pool) {
    if (!m || typeof m !== 'object' || !ROLE_BY[m.role]) return null;
    var lk = m.look && typeof m.look === 'object' ? m.look : {};
    var x = {
      id: Math.max(1, Math.floor(num(m.id, 1))),
      name: String(m.name || 'Anonyme').slice(0, 24), role: m.role,
      stars: Math.max(1, Math.min(5, Math.floor(num(m.stars, 1)))),
      lvl: Math.max(1, Math.min(T.staffMaxLvl, Math.floor(num(m.lvl, 1)))),
      xp: Math.max(0, num(m.xp, 0)),
      salary: Math.max(T.salaryMin, num(m.salary, T.salaryMin)),
      look: { s: Math.floor(num(lk.s, 0)) & 7, h: Math.floor(num(lk.h, 0)) & 7, c: Math.floor(num(lk.c, 0)) & 15, y: Math.floor(num(lk.y, 0)) & 3 }
    };
    if (pool) { x.back = !!m.back; return x; }
    x.morale = Math.max(0, Math.min(100, num(m.morale, 100)));
    x.act = typeof m.act === 'string' && ACT_BY[m.act] ? m.act : null;
    x.zero = Math.max(0, num(m.zero, 0));
    x.rest = Math.max(0, num(m.rest, 0));
    x.train = Math.max(0, num(m.train, 0));
    x.low = !!m.low;
    return x;
  }
  function hydrateTeam(S, t) {
    var tm = S.team, used = {}, maxId = 0;
    tm.hired = Math.max(0, Math.floor(num(t.hired, 0)));
    tm.poolCd = Math.max(0, num(t.poolCd, 0));
    (Array.isArray(t.staff) ? t.staff : []).forEach(function (m) {
      var x = cleanMember(m, false);
      if (!x || tm.staff.length >= 12) return;
      if (x.act && used[x.act]) x.act = null;
      if (x.act) used[x.act] = 1;
      tm.staff.push(x);
    });
    (Array.isArray(t.pool) ? t.pool : []).forEach(function (m) { var x = cleanMember(m, true); if (x && tm.pool.length < 6) tm.pool.push(x); });
    (Array.isArray(t.alumni) ? t.alumni : []).forEach(function (m) { var x = cleanMember(m, true); if (x && tm.alumni.length < 16) { delete x.back; tm.alumni.push(x); } });
    tm.staff.concat(tm.pool, tm.alumni).forEach(function (m) { maxId = Math.max(maxId, m.id); });
    tm.nextId = Math.max(maxId + 1, Math.floor(num(t.nextId, 1)));
  }

  function touch(S) { if (cache) cache.delete(S); }

  function stats(S) {
    var c = cache && cache.get(S);
    if (c) return c;
    var g = { gain: 1, speed: 1, xp: 1, roy: 1, act: {} }, v = 0;
    ITEMS.forEach(function (it) {
      if (!S.owned[it.id]) return;
      v += it.value != null ? it.value : it.cost;
      var f = it.fx;
      if (!f) return;
      if (f.gain) g.gain *= f.gain;
      if (f.speed) g.speed *= f.speed;
      if (f.xp) g.xp *= f.xp;
      if (f.roy) g.roy *= f.roy;
      if (f.act) Object.keys(f.act).forEach(function (k) { g.act[k] = (g.act[k] || 1) * f.act[k]; });
    });
    g.gain *= 1 + T.contactBonus * Object.keys(S.contacts || {}).length;
    g.gain *= 1 + T.trophyBonus * Object.keys(S.trophies || {}).length;
    g.gain *= 1 + T.fameBonus * (S.fame || 0);
    g.xp *= 1 + T.fameXp * (S.fame || 0);
    c = { g: g, v: v, vm: Math.pow(Math.max(v, 400) / 400, T.valueExp) };
    if (cache) cache.set(S, c);
    return c;
  }

  function boostMult(S) { return S.boost && S.boost.left > 0 ? S.boost.m : 1; }
  function contactCount(S) { return Object.keys(S.contacts || {}).length; }
  function levelMult(S) { return 1 + T.levelBonus * (S.level - 1); }
  function studioValue(S) { return stats(S).v; }
  function valueMult(S) { return stats(S).vm; }

  function milestoneMult(lvl) {
    var m = 1;
    for (var i = 0; i < MILESTONES.length; i++) if (lvl >= MILESTONES[i]) m *= 2;
    return m;
  }
  function nextMilestone(lvl) {
    for (var i = 0; i < MILESTONES.length; i++) if (lvl < MILESTONES[i]) return MILESTONES[i];
    return null;
  }

  function duration(S, act) { return act.dur / stats(S).g.speed / staffFx(S, act.id).sp; }
  function payout(S, act) {
    var a = S.acts[act.id], st = stats(S);
    return act.pay * (1 + T.upGain * a.lvl) * milestoneMult(a.lvl) * st.g.gain * (st.g.act[act.id] || 1) * st.vm * levelMult(S) * boostMult(S) * staffFx(S, act.id).gn;
  }
  function xpGain(S, act) { return act.xp * stats(S).g.xp; }
  function upCost(S, act) { return Math.ceil(act.upCost * Math.pow(T.upGrowth, S.acts[act.id].lvl)); }

  function trackCount(S) {
    var n = 0;
    ACTS.forEach(function (a) { n += S.tracks[a.id] || 0; });
    return n;
  }
  function royRate(S) {
    var st = stats(S), r = 0;
    ACTS.forEach(function (a) {
      var t = S.tracks[a.id] || 0;
      if (t > 0) r += Math.pow(t, T.trackExp) * a.pay * ROY;
    });
    return r * st.g.roy * st.vm * levelMult(S) * boostMult(S);
  }
  function activeRate(S) {
    var r = 0;
    ACTS.forEach(function (a) {
      var s = S.acts[a.id];
      if (s.auto && isUnlocked(S, a)) r += payout(S, a) / duration(S, a);
    });
    return r;
  }

  function isUnlocked(S, act) {
    return S.level >= act.reqLvl && (!act.reqItem || !!S.owned[act.reqItem]);
  }
  function lockReason(S, act) {
    var out = [];
    if (act.reqItem && !S.owned[act.reqItem]) out.push(ITEM_BY[act.reqItem].name);
    if (S.level < act.reqLvl) out.push('expertise niveau ' + act.reqLvl);
    return out;
  }

  function tierIndex(S) {
    var v = studioValue(S), t = 0;
    for (var i = 0; i < TIERS.length; i++) if (v >= TIERS[i].min) t = i;
    return t;
  }

  // ---------- Actions ----------
  function addXp(S, x) {
    S.xp += x;
    var up = 0;
    while (S.xp >= xpNeeded(S.level)) { S.xp -= xpNeeded(S.level); S.level++; up++; }
    if (up && hooks.levelUp) hooks.levelUp(S.level);
  }

  function complete(S, act, n) {
    var p = payout(S, act) * n;
    S.money += p; S.lifetime += p;
    S.tracks[act.id] = (S.tracks[act.id] || 0) + n;
    S.acts[act.id].done += n;
    addXp(S, xpGain(S, act) * n);
    if (hooks.complete) hooks.complete(act, n, p);
  }

  function startAct(S, id) {
    var act = ACT_BY[id], a = S.acts[id];
    if (!act || !isUnlocked(S, act) || a.run) return false;
    a.run = true; a.prog = 0;
    return true;
  }
  function tapAct(S, id) {
    var a = S.acts[id];
    if (a && a.run) { a.prog += TAP; return true; }
    return false;
  }

  function buy(S, id) {
    var it = ITEM_BY[id];
    if (!it || S.owned[it.id] || S.money < it.cost) return false;
    S.money -= it.cost; S.owned[it.id] = 1; touch(S);
    if (hooks.buy) hooks.buy(it);
    return true;
  }
  function upgradeAct(S, id) {
    var act = ACT_BY[id], c = act && upCost(S, act);
    if (!act || !isUnlocked(S, act) || S.money < c) return false;
    S.money -= c; S.acts[id].lvl++;
    if (hooks.upgrade) hooks.upgrade(act, S.acts[id].lvl);
    return true;
  }
  function buyAuto(S, id) {
    var act = ACT_BY[id], a = S.acts[id];
    if (!act || a.auto || !isUnlocked(S, act) || S.money < act.autoCost) return false;
    S.money -= act.autoCost; a.auto = true;
    if (!a.run) { a.run = true; a.prog = 0; }
    if (hooks.auto) hooks.auto(act);
    return true;
  }

  // Fait avancer le jeu de dt secondes, en arrêtant le boost à l'instant où il se termine.
  function advance(S, dt) {
    if (dt <= 0) return;
    advanceCore(S, dt);
    checkTrophies(S);
  }
  function advanceCore(S, dt) {
    var b = S.boost;
    if (b && b.left > 0) {
      if (dt > b.left) {
        var l = b.left;
        step(S, l);
        b.left = 0; b.m = 1; b.t = 0;
        step(S, dt - l);
      } else {
        step(S, dt);
        b.left = Math.max(0, b.left - dt);
        if (b.left <= 0) { b.m = 1; b.t = 0; }
      }
      return;
    }
    step(S, dt);
  }
  function step(S, dt) {
    var roy = royRate(S) * dt;
    S.money += roy; S.lifetime += roy;
    for (var i = 0; i < ACTS.length; i++) {
      var act = ACTS[i], a = S.acts[act.id];
      if (a.auto && !a.run && isUnlocked(S, act)) { a.run = true; a.prog = 0; }
      if (!a.run) continue;
      var d = duration(S, act), t = dt, remain = d - a.prog;
      if (t < remain) { a.prog += t; continue; }
      t -= remain;
      complete(S, act, 1);
      a.prog = 0;
      if (a.auto) {
        var n = Math.floor(t / d);
        if (n > 0) complete(S, act, n);
        a.prog = t - n * d;
      } else {
        a.run = false;
      }
    }
    teamStep(S, dt);
  }





  // ---------- Équipe du studio ----------
  var NOFX = { sp: 1, gn: 1, m: null };
  function teamOpen(S) { return S.level >= T.teamLevel; }
  function teamCap(S) { return T.teamCap[Math.min(T.teamCap.length - 1, tierIndex(S))]; }
  function staffXpNeed(lvl) { return Math.round(T.staffXpBase * Math.pow(T.staffXpGrowth, lvl - 1)); }
  function roleFits(m, actId) { return ROLE_BY[m.role].acts.indexOf(actId) >= 0; }
  function working(m) { return !!m.act && m.rest <= 0 && m.train <= 0; }
  // Effet du membre affecté à une production: multiplicateurs de vitesse et de gains.
  function staffFx(S, actId) {
    var st = S.team && S.team.staff;
    if (!st || !st.length) return NOFX;
    for (var i = 0; i < st.length; i++) {
      var m = st[i];
      if (m.act !== actId || !working(m)) continue;
      var eff = (0.5 + m.morale / 200) * (roleFits(m, actId) ? 1 : T.offRole);
      return { sp: 1 + (T.staffSpeedStar * m.stars + T.staffSpeedLvl * m.lvl) * eff, gn: 1 + (T.staffGainStar * m.stars + T.staffGainLvl * m.lvl) * eff, m: m };
    }
    return NOFX;
  }
  function memberFx(S, m, actId) {
    var eff = (0.5 + m.morale / 200) * (roleFits(m, actId) ? 1 : T.offRole);
    return { sp: 1 + (T.staffSpeedStar * m.stars + T.staffSpeedLvl * m.lvl) * eff, gn: 1 + (T.staffGainStar * m.stars + T.staffGainLvl * m.lvl) * eff };
  }
  // Revenu de référence (sans boost) pour fixer les salaires et les prix.
  function incomeRef(S) {
    var b = boostMult(S), a = bestAct(S);
    return Math.max((royRate(S) + activeRate(S)) / b, payout(S, a) / b / duration(S, a), 0.05);
  }
  function payroll(S) { var t = 0; (S.team ? S.team.staff : []).forEach(function (m) { t += m.salary; }); return t; }
  function salaryFor(S, stars, lvl) { return Math.max(T.salaryMin, incomeRef(S) * T.salaryShare * stars * (1 + 0.08 * (lvl - 1))); }
  function pickName(S) {
    var tm = S.team, used = {};
    tm.staff.concat(tm.pool).forEach(function (m) { used[m.name] = 1; });
    var free = NAMES.filter(function (n) { return !used[n]; });
    return free.length ? free[Math.floor(rand() * free.length)] : NAMES[Math.floor(rand() * NAMES.length)];
  }
  function makeCandidate(S) {
    var open = ROLES.filter(function (r) { return r.acts.some(function (id) { return isUnlocked(S, ACT_BY[id]); }); });
    var role = (open.length ? open : ROLES)[Math.floor(rand() * (open.length || ROLES.length))];
    var r = rand(), ti = tierIndex(S), lim = [0.34, 0.64, 0.84, 0.95].map(function (x) { return x - ti * 0.035; }), stars = 1;
    while (stars < 5 && r >= lim[stars - 1]) stars++;
    var c = { id: S.team.nextId++, name: pickName(S), role: role.id, stars: stars, lvl: 1, xp: 0,
      look: { s: Math.floor(rand() * 8), h: Math.floor(rand() * 8), c: Math.floor(rand() * 16), y: Math.floor(rand() * 4) } };
    c.salary = salaryFor(S, stars, 1);
    return c;
  }
  // Renouvelle les candidats: d'anciens membres (après une tournée) reviennent d'abord, sans prime d'embauche.
  function refreshPool(S) {
    var tm = S.team, out = [], inTeam = {};
    tm.staff.forEach(function (m) { inTeam[m.id] = 1; });
    tm.alumni.filter(function (a) { return !inTeam[a.id]; }).slice(0, 2).forEach(function (a) {
      var c = JSON.parse(JSON.stringify(a)); c.back = true; c.xp = 0; c.salary = salaryFor(S, c.stars, c.lvl); out.push(c);
    });
    while (out.length < T.poolSize) out.push(makeCandidate(S));
    tm.pool = out; tm.poolCd = T.poolEvery;
    if (hooks.poolNew) hooks.poolNew(out);
  }
  function poolRefreshCost(S) { return incomeRef(S) * T.poolRefreshSec; }
  function buyRefresh(S) {
    if (!teamOpen(S)) return false;
    var c = poolRefreshCost(S);
    if (S.money < c) return false;
    S.money -= c; refreshPool(S);
    return true;
  }
  function signCost(S, c) { return c.back ? 0 : c.salary * T.signSec; }
  function findMember(S, id) { var st = S.team.staff; for (var i = 0; i < st.length; i++) if (st[i].id === id) return st[i]; return null; }
  function freeActFor(S, m) {
    var taken = {};
    S.team.staff.forEach(function (x) { if (x.act) taken[x.act] = 1; });
    var fit = ROLE_BY[m.role].acts.filter(function (id) { return !taken[id] && isUnlocked(S, ACT_BY[id]); });
    if (fit.length) return fit.sort(function (a, b) { return ACT_BY[b].pay - ACT_BY[a].pay; })[0];
    var any = ACTS.filter(function (a) { return !taken[a.id] && isUnlocked(S, a); }).sort(function (a, b) { return b.pay - a.pay; });
    return any.length ? any[0].id : null;
  }
  function hire(S, cid) {
    var tm = S.team, i = -1;
    for (var k = 0; k < tm.pool.length; k++) if (tm.pool[k].id === cid) i = k;
    if (i < 0 || !teamOpen(S) || tm.staff.length >= teamCap(S)) return null;
    var c = tm.pool[i], cost = signCost(S, c);
    if (S.money < cost) return null;
    S.money -= cost;
    tm.pool.splice(i, 1);
    var m = { id: c.id, name: c.name, role: c.role, stars: c.stars, lvl: c.lvl, xp: 0, salary: c.salary, look: c.look, morale: 100, act: null, zero: 0, rest: 0, train: 0, low: false };
    m.act = freeActFor(S, m);
    tm.staff.push(m); tm.hired++;
    tm.alumni = tm.alumni.filter(function (a) { return a.id !== m.id; });
    touch(S);
    if (hooks.hire) hooks.hire(m, !!c.back);
    return m;
  }
  function fire(S, id) {
    var tm = S.team, m = findMember(S, id);
    if (!m) return false;
    tm.staff = tm.staff.filter(function (x) { return x !== m; });
    return true;
  }
  // Affecte un membre à une production (null: sans affectation). Échange les postes si un autre membre l'occupait.
  function assign(S, id, actId) {
    var m = findMember(S, id);
    if (!m) return false;
    if (actId) {
      var act = ACT_BY[actId];
      if (!act || !isUnlocked(S, act)) return false;
      var other = null;
      S.team.staff.forEach(function (x) { if (x !== m && x.act === actId) other = x; });
      if (other) other.act = m.act;
    }
    m.act = actId || null;
    return true;
  }
  function trainCost(S, m) { return m.salary * T.trainSec * m.lvl; }
  function train(S, id) {
    var m = findMember(S, id);
    if (!m || m.lvl >= T.staffMaxLvl || m.train > 0 || m.rest > 0) return false;
    var c = trainCost(S, m);
    if (S.money < c) return false;
    S.money -= c; m.train = T.trainTime * (m.lvl + 1);
    return true;
  }
  function bonusCost(S, m) { return m.salary * T.bonusSec; }
  function giveBonus(S, id) {
    var m = findMember(S, id);
    if (!m || m.morale >= 100) return false;
    var c = bonusCost(S, m);
    if (S.money < c) return false;
    S.money -= c; m.morale = Math.min(100, m.morale + T.bonusMorale); m.zero = 0; m.low = m.morale < 25;
    return true;
  }
  function sendRest(S, id) {
    var m = findMember(S, id);
    if (!m || m.rest > 0 || m.train > 0 || m.morale >= 100) return false;
    m.rest = T.restTime;
    return true;
  }
  function levelUp(S, m, how) {
    m.lvl++; m.xp = 0; m.salary = Math.max(m.salary * T.raise, salaryFor(S, m.stars, m.lvl)); // le salaire suit aussi la réussite du studio
    if (hooks.staffLevel) hooks.staffLevel(m, how);
  }
  function teamStep(S, dt) {
    var tm = S.team;
    if (!tm) return;
    if (teamOpen(S)) {
      tm.poolCd -= dt;
      if (tm.poolCd <= 0 || (!tm.pool.length && tm.staff.length < teamCap(S) && tm.poolCd <= T.poolEvery - 30)) refreshPool(S);
    }
    if (!tm.staff.length) return;
    var cost = payroll(S) * dt, unpaid = false;
    if (S.money >= cost) S.money -= cost; else { S.money = 0; unpaid = true; }
    var gone = [];
    tm.staff.forEach(function (m) {
      var m0 = m.morale, floor = S._off ? Math.min(T.moraleOffline, m0) : 0;
      if (m.train > 0) {
        m.train -= dt;
        if (m.train <= 0) { m.train = 0; levelUp(S, m, 'train'); }
      } else if (m.rest > 0) {
        m.morale = Math.min(100, m.morale + dt * 100 / T.restTime);
        m.rest -= dt;
        if (m.rest <= 0) { m.rest = 0; m.morale = 100; if (hooks.staffBack) hooks.staffBack(m); }
      } else if (m.act && isUnlocked(S, ACT_BY[m.act])) {
        m.xp += dt;
        m.morale -= T.moraleDecay * dt;
        while (m.lvl < T.staffMaxLvl && m.xp >= staffXpNeed(m.lvl)) { var r = m.xp - staffXpNeed(m.lvl); levelUp(S, m, 'work'); m.xp = r; }
        if (m.lvl >= T.staffMaxLvl) m.xp = 0;
      } else {
        m.morale = Math.min(100, m.morale + T.moraleRest * dt);
      }
      if (unpaid) m.morale -= T.moraleUnpaid * dt;
      m.morale = Math.max(floor, Math.min(100, m.morale));
      if (m.morale < 25 && !m.low) { m.low = true; if (!S._off && hooks.staffWarn) hooks.staffWarn(m); }
      if (m.morale >= 35) m.low = false;
      if (m.morale <= 0 && !S._off) {
        m.zero += dt;
        if (m.zero >= T.leaveAfter) gone.push(m);
      } else m.zero = 0;
    });
    if (unpaid && !S._off && hooks.unpaid) hooks.unpaid();
    if (gone.length) {
      tm.staff = tm.staff.filter(function (m) { return gone.indexOf(m) < 0; });
      gone.forEach(function (m) { if (hooks.staffLeave) hooks.staffLeave(m); });
    }
  }

  // ---------- Tournée mondiale (prestige) ----------
  // Points de renommée au total pour un cumul de gains donné.
  function fameAt(n) { return Math.pow(n, 1 / T.fameExp) * T.fameBase; } // cumul de gains qui donne n points
  function fameFor(total) {
    var n = Math.floor(Math.pow(Math.max(0, total) / T.fameBase, T.fameExp));
    while (fameAt(n + 1) <= total) n++;
    while (n > 0 && fameAt(n) > total) n--;
    return n;
  }
  // Points qu'on gagnerait en partant maintenant.
  function fameAvailable(S) { return Math.max(0, fameFor(S.lifetime) - (S.fame || 0)); }
  function canTour(S) { return fameAvailable(S) >= T.fameMin; }
  // Gains cumulés à atteindre pour obtenir le point suivant.
  function fameNextAt(S) { return fameAt(fameFor(S.lifetime) + 1); }
  // Gains cumulés à atteindre pour pouvoir partir en tournée.
  function fameUnlockAt(S) { return fameAt((S.fame || 0) + T.fameMin); }
  // Remet la carrière à zéro: garde la renommée, les contacts, les trophées et le cumul des gains.
  function tour(S, now) {
    var n = fameAvailable(S);
    if (n < T.fameMin) return null;
    var f = newState(now);
    S.money = 0; S.xp = 0; S.level = 1; S.owned = f.owned; S.tracks = {}; S.boost = f.boost;
    ACTS.forEach(function (a) {
      var s = S.acts[a.id];
      S.acts[a.id] = { lvl: 0, auto: false, prog: 0, run: false, done: s ? s.done : 0 };
    });
    S.ev.cd = T.eventFirst; S.ev.pending = null; S.ev.hold = false;
    // L'équipe part aussi en tournée: ses membres pourront revenir sans prime d'embauche.
    var tm = S.team || newTeam(), al = tm.staff.map(function (m) { return { id: m.id, name: m.name, role: m.role, stars: m.stars, lvl: m.lvl, xp: 0, salary: m.salary, look: m.look }; });
    tm.alumni = al.concat(tm.alumni.filter(function (a) { return !al.some(function (b) { return b.id === a.id; }); })).slice(0, 16);
    tm.staff = []; tm.pool = []; tm.poolCd = 0; S.team = tm;
    S.fame = (S.fame || 0) + n; S.tours = (S.tours || 0) + 1;
    S.savedAt = now; S.epoch = now;
    touch(S);
    return { points: n, fame: S.fame, tours: S.tours };
  }

  // ---------- Palmarès ----------
  function trophyCount(S) { return Object.keys(S.trophies || {}).length; }
  function trophyMetric(S, key, memo) {
    if (memo && memo[key] !== undefined) return memo[key];
    var p = key.indexOf(':'), k = p < 0 ? key : key.slice(0, p), a = p < 0 ? null : key.slice(p + 1), n = 0, v;
    switch (k) {
      case 'done':
        if (a) { n = S.acts[a] ? S.acts[a].done : 0; break; }
        ACTS.forEach(function (x) { n += S.acts[x.id].done; });
        break;
      case 'lifetime': n = S.lifetime; break;
      case 'level': n = S.level; break;
      case 'items': n = Object.keys(S.owned).length - (S.owned.laptop ? 1 : 0); break;
      case 'own': n = S.owned[a] ? 1 : 0; break;
      case 'tier': n = tierIndex(S); break;
      case 'income': n = (royRate(S) + activeRate(S)) / boostMult(S); break;
      case 'autos': ACTS.forEach(function (x) { if (S.acts[x.id].auto) n++; }); break;
      case 'rank': ACTS.forEach(function (x) { n = Math.max(n, S.acts[x.id].lvl); }); break;
      case 'contacts': n = contactCount(S); break;
      case 'fame': n = S.fame || 0; break;
      case 'tours': n = S.tours || 0; break;
      case 'staff': n = S.team ? S.team.staff.length : 0; break;
      case 'staffLvl': (S.team ? S.team.staff : []).forEach(function (m) { n = Math.max(n, m.lvl); }); break;
      case 'outings': Object.keys(S.ev.seen || {}).forEach(function (id) { n += S.ev.seen[id] || 0; }); break;
    }
    if (memo) memo[key] = n;
    return n;
  }
  function trophyProgress(S, t) {
    var v = trophyMetric(S, t.m), base = t.m === 'level' ? 1 : 0; // le niveau d'expertise commence à 1
    return { v: Math.min(v, t.n), n: t.n, f: Math.max(0, Math.min(1, (v - base) / (t.n - base))) };
  }
  // Débloque les trophées dont le seuil est atteint. Renvoie ceux qui viennent de l'être.
  function checkTrophies(S, silent) {
    if (!S.trophies) S.trophies = {};
    var got = [], memo = {};
    for (var i = 0; i < TROPHIES.length; i++) {
      var t = TROPHIES[i];
      if (S.trophies[t.id]) continue;
      if (trophyMetric(S, t.m, memo) >= t.n) { S.trophies[t.id] = 1; got.push(t); }
    }
    if (got.length) {
      touch(S);
      if (!silent && hooks.trophy) got.forEach(function (t) { hooks.trophy(t); });
    }
    return got;
  }
  // Les trophées les plus proches d'être décrochés, du plus avancé au moins avancé.
  function nextGoals(S, k) {
    var out = [];
    TROPHIES.forEach(function (t, i) {
      if (S.trophies && S.trophies[t.id]) return;
      var p = trophyProgress(S, t); out.push({ t: t, p: p, i: i });
    });
    out.sort(function (a, b) { return b.p.f - a.p.f || a.i - b.i; });
    return out.slice(0, k);
  }

  // ---------- Sorties de studio ----------
  function nextCd(rnd) { return T.eventMin + (rnd || Math.random)() * (T.eventMax - T.eventMin); }
  function bestAct(S) {
    var best = null;
    ACTS.forEach(function (a) { if (isUnlocked(S, a) && (!best || a.pay > best.pay)) best = a; });
    return best || ACTS[0];
  }
  // Référence des récompenses: une minute de revenu continu, avec un plancher de quelques productions.
  function eventRef(S) {
    return Math.max((royRate(S) + activeRate(S)) * 60, payout(S, bestAct(S)) * T.eventFloor);
  }
  function pickEvent(S, rnd) {
    var ti = tierIndex(S), min = Infinity;
    var pool = EVENTS.filter(function (x) { return ti >= x.tiers[0] && ti <= x.tiers[1]; });
    if (!pool.length) return null;
    pool.forEach(function (x) { min = Math.min(min, S.ev.seen[x.id] || 0); });
    var fresh = pool.filter(function (x) { return (S.ev.seen[x.id] || 0) === min; });
    return fresh[Math.floor((rnd || Math.random)() * fresh.length)];
  }
  // À appeler uniquement quand le joueur est présent: le compte à rebours ne tourne pas hors ligne.
  function tickEvents(S, dt, rnd) {
    var ev = S.ev;
    if (ev.pending) {
      if (ev.hold) return;
      ev.pending.left -= dt;
      if (ev.pending.left <= 0) {
        var gone = EVENT_BY[ev.pending.id];
        ev.pending = null; ev.cd = nextCd(rnd);
        if (hooks.eventExpire) hooks.eventExpire(gone);
      }
      return;
    }
    ev.cd -= dt;
    if (ev.cd <= 0) {
      var x = pickEvent(S, rnd);
      if (x) { ev.pending = { id: x.id, left: T.eventWindow }; if (hooks.eventSpawn) hooks.eventSpawn(x); }
      else ev.cd = 60;
    }
  }
  function dismissEvent(S, rnd) {
    S.ev.pending = null; S.ev.hold = false; S.ev.cd = nextCd(rnd);
  }
  function applyReward(S, x, r, ref) {
    var m, a;
    switch (r.k) {
      case 'cash':
        m = ref * r.x; S.money += m; S.lifetime += m;
        return { k: 'cash', v: m };
      case 'xp':
        m = xpNeeded(S.level) * r.x; addXp(S, m);
        return { k: 'xp', v: m };
      case 'boost':
        // Un nouveau boost plus long repart avec une jauge pleine ; un boost plus court ne raccourcit pas l'actuel.
        S.boost = { m: Math.max(boostMult(S), r.m), left: Math.max(S.boost.left, r.s),
          t: r.s >= S.boost.left ? r.s : Math.max(S.boost.t || 0, S.boost.left) };
        return { k: 'boost', m: S.boost.m, s: S.boost.left };
      case 'rank':
        a = bestAct(S); S.acts[a.id].lvl++;
        return { k: 'rank', act: a.id, lvl: S.acts[a.id].lvl };
      case 'tracks':
        a = bestAct(S); S.tracks[a.id] = (S.tracks[a.id] || 0) + r.n;
        return { k: 'tracks', n: r.n, act: a.id };
      case 'contact':
        if (S.contacts[x.id]) { m = ref * 3; S.money += m; S.lifetime += m; return { k: 'cash', v: m, again: true }; }
        S.contacts[x.id] = x.contact; touch(S);
        return { k: 'contact', name: x.contact };
    }
    return null;
  }
  // Applique le choix i de l'invitation en cours. Renvoie le résultat à afficher.
  function resolveEvent(S, i, rnd) {
    var p = S.ev.pending, x = p && EVENT_BY[p.id], c = x && x.choices[i];
    if (!c) return null;
    var ref = eventRef(S), out = [];
    c.rw.forEach(function (r) { var g = applyReward(S, x, r, ref); if (g) out.push(g); });
    S.ev.seen[x.id] = (S.ev.seen[x.id] || 0) + 1;
    S.ev.pending = null; S.ev.hold = false; S.ev.cd = nextCd(rnd);
    return { event: x, choice: c, rewards: out };
  }

  // Progression pendant l'absence. Renvoie un résumé.
  function offline(S, now) {
    var gap = Math.max(0, (now - S.savedAt) / 1000);
    if (gap < 30) return null;
    var eff = Math.min(gap, OFFLINE_CAP) * OFFLINE_EFF;
    var m0 = S.money, x0 = S.level, tr0 = trackCount(S), pay = payroll(S);
    S._off = true;
    try { advance(S, eff); } finally { delete S._off; }
    var gain = S.money - m0;
    if (gain <= 0) return null;
    return { gap: gap, capped: gap > OFFLINE_CAP, gain: gain, levels: S.level - x0, tracks: trackCount(S) - tr0, wages: pay * eff };
  }

  var Game = {
    ACTS: ACTS, ITEMS: ITEMS, TIERS: TIERS, EVENTS: EVENTS, TROPHIES: TROPHIES, TROPHY_BY: TROPHY_BY, ACT_BY: ACT_BY, ITEM_BY: ITEM_BY, EVENT_BY: EVENT_BY, hooks: hooks,
    OFFLINE_CAP: OFFLINE_CAP, OFFLINE_EFF: OFFLINE_EFF, TAP: TAP,
    newState: newState, hydrate: hydrate, xpNeeded: xpNeeded, studioValue: studioValue, valueMult: valueMult,
    levelMult: levelMult, duration: duration, payout: payout, xpGain: xpGain, upCost: upCost, royRate: royRate,
    activeRate: activeRate, trackCount: trackCount, isUnlocked: isUnlocked, lockReason: lockReason,
    tierIndex: tierIndex, milestoneMult: milestoneMult, nextMilestone: nextMilestone, startAct: startAct,
    tapAct: tapAct, buy: buy, upgradeAct: upgradeAct, buyAuto: buyAuto, advance: advance, offline: offline, touch: touch,
    boostMult: boostMult, contactCount: contactCount, eventRef: eventRef, tickEvents: tickEvents, dismissEvent: dismissEvent,
    resolveEvent: resolveEvent, pickEvent: pickEvent, trophyCount: trophyCount, trophyProgress: trophyProgress,
    checkTrophies: checkTrophies, nextGoals: nextGoals, fameFor: fameFor, fameAvailable: fameAvailable, canTour: canTour,
    fameNextAt: fameNextAt, fameUnlockAt: fameUnlockAt, fameAt: fameAt, tour: tour,
    ROLES: ROLES, ROLE_BY: ROLE_BY, teamOpen: teamOpen, teamCap: teamCap, staffXpNeed: staffXpNeed, roleFits: roleFits, staffFx: staffFx, memberFx: memberFx,
    incomeRef: incomeRef, payroll: payroll, refreshPool: refreshPool, poolRefreshCost: poolRefreshCost, buyRefresh: buyRefresh, signCost: signCost,
    hire: hire, fire: fire, assign: assign, trainCost: trainCost, train: train, bonusCost: bonusCost, giveBonus: giveBonus, sendRest: sendRest,
    findMember: findMember, working: working, setRandom: function (f) { rand = f || Math.random; }
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Game;
  root.Game = Game;
})(typeof window !== 'undefined' ? window : globalThis);
