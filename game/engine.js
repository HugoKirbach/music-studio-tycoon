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

  var RESEARCH = D.RESEARCH || { branches: [], nodes: [], specs: [], costs: [] }, RD_BY = {}, SPEC_BY = {};
  RESEARCH.nodes.forEach(function (n) { RD_BY[n.id] = n; });
  var PJ = D.PROJECTS || { genres: [], moods: [], pubs: [], formats: [], phases: [], critics: [], sales: [] }, PJ_G = {}, PJ_M = {}, PJ_P = {}, PJ_F = {};
  PJ.genres.forEach(function (x) { PJ_G[x.id] = x; }); PJ.moods.forEach(function (x) { PJ_M[x.id] = x; });
  PJ.pubs.forEach(function (x) { PJ_P[x.id] = x; }); PJ.formats.forEach(function (x) { PJ_F[x.id] = x; });
  RESEARCH.specs.forEach(function (t) { t.options.forEach(function (o) { SPEC_BY[o.id] = { o: o, tier: t.tier }; }); });
  var ROLES = D.ROLES || [], NAMES = D.NAMES || [], CLIENTS = D.CLIENTS || {}, CHART = D.CHART || { words: ['Titre'], tails: [''], artists: ['Artiste'] };
  var ACT_BY = {}, ITEM_BY = {}, EVENT_BY = {}, TROPHY_BY = {}, ROLE_BY = {};
  ROLES.forEach(function (r) { ROLE_BY[r.id] = r; });
  var rand = Math.random;
  ACTS.forEach(function (a) { ACT_BY[a.id] = a; });
  ITEMS.forEach(function (i) { ITEM_BY[i.id] = i; });
  EVENTS.forEach(function (x) { EVENT_BY[x.id] = x; });
  var OLD_TROPHY = {}; // ancien trophée à niveau unique -> [famille, niveau]
  TROPHIES.forEach(function (t) { TROPHY_BY[t.id] = t; (t.old || []).forEach(function (o, i) { if (o) OLD_TROPHY[o] = [t.id, i + 1]; }); });
  var DECO = D.DECO || { slots: [] }, DECO_BY = {};
  DECO.slots.forEach(function (s) { DECO_BY[s.id] = {}; s.options.forEach(function (o) { DECO_BY[s.id][o.id] = o; }); });
  var RULES = ['rapide', 'sans-clap', 'prime'];
  var TLV = D.TROPHY_LEVELS || ['Bronze', 'Argent', 'Or', 'Platine', 'Diamant', 'Légende'];
  var BT = D.BATTLE || { leagues: [{ name: 'Quartier', bpm: 90, target: 0.5, dens: 0 }], lanes: [], rivals: ['Rival'] };

  var hooks = {};
  var cache = typeof WeakMap !== 'undefined' ? new WeakMap() : null;

  // ---------- Calculs ----------
  function xpNeeded(level) { return Math.round(T.xpBase * Math.pow(T.xpGrowth, level - 1)); }

  function newState(now) {
    now = now || Date.now();
    var acts = {};
    ACTS.forEach(function (a) { acts[a.id] = { lvl: 0, auto: false, prog: 0, run: false, done: 0, hold: false, mix: null }; });
    return { v: 1, money: 0, xp: 0, level: 1, lifetime: 0, owned: { laptop: 1 }, acts: acts, tracks: {},
      savedAt: now, created: now, sound: false, legend: false, epoch: 0,
      boost: { m: 1, left: 0, t: 0 }, contacts: {}, trophies: {}, fame: 0, tours: 0, ev: { cd: T.eventFirst, seen: {}, pending: null, hold: false, won: 0 },
      team: newTeam(), masters: [], mixes: 0, perfect: 0, orders: newOrders(), charts: newCharts(), rd: newRd(), proj: newProj(), battle: newBattle(), piano: { best: 0, cd: 0, plays: 0 }, deco: newDeco() };
  }
  function newProj() { return { cur: null, book: { c: {}, p: {}, h: {} }, hist: [], done: 0, best: 0, last: null }; }
  function newBattle() { return { league: 1, pts: 0, wins: 0, losses: 0, best: 0, cd: T.battleFirst, rival: null }; }
  function newDeco() { var d = { seen: {} }; DECO.slots.forEach(function (s) { d[s.id] = s.options[0].id; }); return d; }
  function newRd() { return { pts: 0, total: 0, nodes: {}, spec: {} }; }
  function newOrders() { return { offers: [], active: [], cd: T.orderFirst, rep: 0, done: 0, failed: 0, nextId: 1 }; }
  function newCharts() { return { week: 1, left: T.weekLen, rivals: [], mine: [], free: 0, best: 0, num1: 0, releases: 0, nextId: 1 }; }
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
      var mx = s.mix && typeof s.mix === 'object' ? { m: Math.max(1, Math.min(1 + T.mixMax, num(s.mix.m, 1))), q: Math.max(1, Math.min(5, Math.floor(num(s.mix.q, 1)))), x: Math.max(0, Math.min(T.mixXp, num(s.mix.x, 0))) } : null;
      S.acts[a.id] = { lvl: Math.max(0, Math.floor(num(s.lvl, 0))), auto: !!s.auto, prog: Math.max(0, num(s.prog, 0)),
        run: !!s.run, done: Math.max(0, num(s.done, 0)), hold: false, mix: mx };
    });
    if (o.tracks && typeof o.tracks === 'object') {
      ACTS.forEach(function (a) { S.tracks[a.id] = Math.max(0, num(o.tracks[a.id], 0)); });
    }
    if (o.boost && typeof o.boost === 'object') {
      var bl = Math.max(0, num(o.boost.left, 0));
      S.boost = { m: Math.max(1, num(o.boost.m, 1)), left: bl, t: bl > 0 ? Math.max(bl, num(o.boost.t, bl)) : 0 };
    }
    if (o.contacts && typeof o.contacts === 'object') EVENTS.forEach(function (x) { if (o.contacts[x.id]) S.contacts[x.id] = x.contact; });
    if (o.trophies && typeof o.trophies === 'object') hydrateTrophies(S, o.trophies);
    if (o.ev && typeof o.ev === 'object') {
      S.ev.cd = Math.max(0, num(o.ev.cd, T.eventFirst));
      EVENTS.forEach(function (x) { S.ev.seen[x.id] = Math.max(0, Math.floor(num(o.ev.seen && o.ev.seen[x.id], 0))); });
      S.ev.won = Math.max(0, Math.floor(num(o.ev.won, 0)));
      var p = o.ev.pending;
      if (p && EVENT_BY[p.id] && num(p.left, 0) > 0) S.ev.pending = { id: p.id, left: Math.min(num(p.left, 0), T.eventWindow) };
    }
    if (o.team && typeof o.team === 'object') hydrateTeam(S, o.team);
    S.mixes = Math.max(0, Math.floor(num(o.mixes, 0)));
    S.perfect = Math.max(0, Math.floor(num(o.perfect, 0)));
    (Array.isArray(o.masters) ? o.masters : []).forEach(function (m) {
      if (m && ACT_BY[m.act] && S.masters.length < T.mastersMax) S.masters.push({ id: Math.max(1, Math.floor(num(m.id, 1))), act: m.act, q: Math.max(1, Math.min(5, Math.floor(num(m.q, 1)))) });
    });
    if (o.orders && typeof o.orders === 'object') hydrateOrders(S, o.orders);
    if (o.charts && typeof o.charts === 'object') hydrateCharts(S, o.charts);
    if (o.rd && typeof o.rd === 'object') {
      S.rd.pts = Math.max(0, num(o.rd.pts, 0)); S.rd.total = Math.max(S.rd.pts, num(o.rd.total, 0));
      if (o.rd.nodes && typeof o.rd.nodes === 'object') RESEARCH.nodes.forEach(function (n) { if (o.rd.nodes[n.id]) S.rd.nodes[n.id] = 1; });
      // une recherche n'est valable que si la précédente de sa branche l'est aussi
      RESEARCH.branches.forEach(function (b) { var ok = true; branchNodes(b.id).forEach(function (n) { if (!ok) delete S.rd.nodes[n.id]; else if (!S.rd.nodes[n.id]) ok = false; }); });
      if (o.rd.spec && typeof o.rd.spec === 'object') RESEARCH.specs.forEach(function (t) { var id = o.rd.spec[t.tier]; if (SPEC_BY[id] && SPEC_BY[id].tier === t.tier) S.rd.spec[t.tier] = id; });
    }
    if (o.proj && typeof o.proj === 'object') hydrateProj(S, o.proj);
    if (o.deco && typeof o.deco === 'object') {
      DECO.slots.forEach(function (s) { if (DECO_BY[s.id][o.deco[s.id]]) S.deco[s.id] = o.deco[s.id]; });
      if (o.deco.seen && typeof o.deco.seen === 'object') Object.keys(o.deco.seen).forEach(function (k) { var p = k.split(':'); if (DECO_BY[p[0]] && DECO_BY[p[0]][p[1]]) S.deco.seen[k] = 1; });
    }
    if (o.piano && typeof o.piano === 'object') {
      S.piano.best = Math.max(0, Math.min(60, Math.floor(num(o.piano.best, 0)))); S.piano.plays = Math.max(0, Math.floor(num(o.piano.plays, 0)));
      S.piano.cd = Math.max(0, Math.min(T.pianoEvery, num(o.piano.cd, 0)));
    }
    if (o.battle && typeof o.battle === 'object') {
      var b = o.battle, B = S.battle, L = BT.leagues.length;
      B.league = Math.max(1, Math.min(L, Math.floor(num(b.league, 1)))); B.pts = Math.max(0, Math.min(T.battleUp - 1, Math.floor(num(b.pts, 0))));
      B.wins = Math.max(0, Math.floor(num(b.wins, 0))); B.losses = Math.max(0, Math.floor(num(b.losses, 0))); B.best = Math.max(0, Math.floor(num(b.best, 0)));
      B.cd = Math.max(0, num(b.cd, T.battleFirst));
      var r = b.rival;
      if (r && typeof r === 'object') B.rival = { name: String(r.name || 'Rival').slice(0, 30), league: Math.max(1, Math.min(L, Math.floor(num(r.league, B.league)))),
        target: Math.max(0.3, Math.min(0.95, num(r.target, 0.5))), seed: Math.floor(num(r.seed, 1)) >>> 0, rule: RULES.indexOf(r.rule) >= 0 ? r.rule : null };
    }
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
  function cleanOrder(x) {
    if (!x || typeof x !== 'object' || !ACT_BY[x.act]) return null;
    var n = Math.max(1, Math.min(200, Math.floor(num(x.n, 1))));
    return { id: Math.max(1, Math.floor(num(x.id, 1))), act: x.act, n: n, q: Math.max(1, Math.min(5, Math.floor(num(x.q, 1)))),
      got: Math.max(0, Math.min(n, Math.floor(num(x.got, 0)))), time: Math.max(1, num(x.time, 60)), left: Math.max(0, num(x.left, 60)),
      life: Math.max(0, num(x.life, T.orderOfferLife)), reward: Math.max(0, num(x.reward, 0)), xp: Math.max(0, num(x.xp, 0)),
      client: String(x.client || 'Client').slice(0, 30), kind: String(x.kind || '').slice(0, 30), trend: !!x.trend };
  }
  function hydrateOrders(S, o) {
    var r = S.orders;
    r.cd = Math.max(0, num(o.cd, T.orderFirst)); r.rep = Math.max(0, Math.min(T.repMax, num(o.rep, 0)));
    r.done = Math.max(0, Math.floor(num(o.done, 0))); r.failed = Math.max(0, Math.floor(num(o.failed, 0)));
    (Array.isArray(o.offers) ? o.offers : []).forEach(function (x) { var c = cleanOrder(x); if (c && r.offers.length < T.orderMaxOffers) r.offers.push(c); });
    (Array.isArray(o.active) ? o.active : []).forEach(function (x) { var c = cleanOrder(x); if (c && r.active.length < T.orderMaxActive + 2) r.active.push(c); });
    var mx = 0; r.offers.concat(r.active).forEach(function (x) { mx = Math.max(mx, x.id); });
    r.nextId = Math.max(mx + 1, Math.floor(num(o.nextId, 1)));
  }
  function hydrateCharts(S, o) {
    var c = S.charts;
    c.week = Math.max(1, Math.floor(num(o.week, 1))); c.left = Math.max(0, Math.min(T.weekLen, num(o.left, T.weekLen)));
    c.free = Math.max(0, Math.floor(num(o.free, 0))); c.best = Math.max(0, Math.min(T.chartSize, Math.floor(num(o.best, 0))));
    c.num1 = Math.max(0, Math.floor(num(o.num1, 0))); c.releases = Math.max(0, Math.floor(num(o.releases, 0)));
    (Array.isArray(o.rivals) ? o.rivals : []).forEach(function (r) {
      if (r && c.rivals.length < T.chartSize) c.rivals.push({ t: String(r.t || 'Titre').slice(0, 40), a: String(r.a || 'Artiste').slice(0, 30), f: Math.max(0.1, Math.min(3, num(r.f, 1))), p: Math.max(0, Math.floor(num(r.p, 0))) });
    });
    var mx = 0;
    (Array.isArray(o.mine) ? o.mine : []).forEach(function (m) {
      if (!m || !ACT_BY[m.act] || c.mine.length >= 12) return;
      var e = { id: Math.max(1, Math.floor(num(m.id, 1))), t: String(m.t || 'Titre').slice(0, 40), act: m.act, q: Math.max(1, Math.min(5, Math.floor(num(m.q, 1)))),
        s: Math.max(0, num(m.s, 0)), weeks: Math.max(0, Math.floor(num(m.weeks, 0))), pos: Math.max(0, Math.floor(num(m.pos, 0))), p: Math.max(0, Math.floor(num(m.p, 0))),
        best: Math.max(0, Math.floor(num(m.best, 0))), promo: !!m.promo, earned: Math.max(0, num(m.earned, 0)) };
      if (m.pj && typeof m.pj === 'object' && PJ_G[m.pj.g] && PJ_F[m.pj.f]) e.pj = { g: m.pj.g, f: m.pj.f, sales: Math.max(0, num(m.pj.sales, 0)), sold: Math.max(0, num(m.pj.sold, 0)), w: Math.max(0, Math.floor(num(m.pj.w, 0))), avg: Math.max(0, Math.min(10, num(m.pj.avg, 0))) };
      mx = Math.max(mx, e.id); c.mine.push(e);
    });
    c.nextId = Math.max(mx + 1, Math.floor(num(o.nextId, 1)));
    var tr = o.trend;
    if (tr && typeof tr === 'object' && PJ_G[tr.g] && PJ_M[tr.m] && ACT_BY[tr.act] && RULES.indexOf(tr.rule) >= 0) c.trend = { w: Math.max(1, Math.floor(num(tr.w, 1))), g: tr.g, m: tr.m, act: tr.act, rule: tr.rule };
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
    g.gain *= 1 + T.trophyBonus * trophyCount(S);
    g.gain *= 1 + T.fameBonus * (S.fame || 0);
    g.xp *= 1 + T.fameXp * (S.fame || 0);
    var rf = computeRd(S);
    g.gain *= rf.gain; g.speed *= rf.speed; g.xp *= rf.xp; g.roy *= rf.roy;
    c = { g: g, v: v, vm: Math.pow(Math.max(v, 400) / 400, T.valueExp), rd: rf };
    if (cache) cache.set(S, c);
    return c;
  }

  // ---------- Recherche ----------
  var MULT = ['gain', 'speed', 'xp', 'roy', 'mixZone', 'mixMul', 'chartScore', 'chartPay', 'promoCost', 'event', 'orderReward', 'orderEvery', 'rep', 'salary', 'trainCost', 'trainTime'];
  var ADD = ['quality', 'mixMax', 'mixStar', 'promoAdd', 'orderSlots', 'cap', 'autoQ4'];
  function computeRd(S) {
    var f = { chartDecay: 0 };
    MULT.forEach(function (k) { f[k] = 1; }); ADD.forEach(function (k) { f[k] = 0; });
    function addFx(x) {
      Object.keys(x).forEach(function (k) {
        if (k === 'chartDecay') f.chartDecay = Math.max(f.chartDecay, x[k]);
        else if (MULT.indexOf(k) >= 0) f[k] *= x[k];
        else if (ADD.indexOf(k) >= 0) f[k] += x[k];
      });
    }
    var rd = S.rd || {};
    RESEARCH.nodes.forEach(function (n) { if (rd.nodes && rd.nodes[n.id]) addFx(n.fx); });
    Object.keys(rd.spec || {}).forEach(function (t) { var sp = SPEC_BY[rd.spec[t]]; if (sp) addFx(sp.o.fx); });
    return f;
  }
  function rdFx(S) { return stats(S).rd; }
  function branchNodes(b) { return RESEARCH.nodes.filter(function (n) { return n.b === b; }); }
  function nodeTier(id) { var n = RD_BY[id], list = branchNodes(n.b); return list.indexOf(n); }
  function researchCost(id) { return RESEARCH.costs[Math.min(RESEARCH.costs.length - 1, nodeTier(id))]; }
  function rdCount(S) { return Object.keys((S.rd && S.rd.nodes) || {}).length; }
  function canResearch(S, id) {
    var n = RD_BY[id];
    if (!n || S.rd.nodes[id]) return false;
    var list = branchNodes(n.b), i = list.indexOf(n);
    if (i > 0 && !S.rd.nodes[list[i - 1].id]) return false;
    return S.rd.pts >= researchCost(id);
  }
  function research(S, id) {
    if (!canResearch(S, id)) return false;
    S.rd.pts -= researchCost(id); S.rd.nodes[id] = 1; touch(S);
    if (hooks.research) hooks.research(RD_BY[id]);
    return true;
  }
  function specOpen(S, tier) { var t = RESEARCH.specs.filter(function (x) { return x.tier === tier; })[0]; return !!t && rdCount(S) >= t.need; }
  function chooseSpec(S, tier, id) {
    var sp = SPEC_BY[id];
    if (!sp || sp.tier !== tier || S.rd.spec[tier] || !specOpen(S, tier)) return false;
    S.rd.spec[tier] = id; touch(S);
    if (hooks.spec) hooks.spec(sp.o, tier);
    return true;
  }
  function addRp(S, x) { if (x > 0 && S.rd) { S.rd.pts += x; S.rd.total += x; } }
  // Points de recherche par seconde avec les productions qui tournent en continu (pour l'affichage).
  function rdRate(S) {
    var r = 0;
    ACTS.forEach(function (a, i) { var s = S.acts[a.id]; if (s.auto && isUnlocked(S, a)) r += (i + 1) * T.rpPer / duration(S, a); });
    return r;
  }
  function orderMax(S) { return T.orderMaxActive + rdFx(S).orderSlots; }

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
    return act.pay * (1 + T.upGain * a.lvl) * milestoneMult(a.lvl) * st.g.gain * (st.g.act[act.id] || 1) * st.vm * levelMult(S) * boostMult(S) * staffFx(S, act.id).gn * trendAct(S, act.id);
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
    var a = S.acts[act.id], unit = payout(S, act), p = unit * n, x = xpGain(S, act) * n, mixed = a.mix;
    if (mixed) { a.mix = null; p += unit * (mixed.m - 1); x += xpGain(S, act) * mixed.x; }
    S.money += p; S.lifetime += p;
    S.tracks[act.id] = (S.tracks[act.id] || 0) + n;
    a.done += n;
    addXp(S, x);
    var qb = baseQuality(S, act.id), rf = rdFx(S);
    if (rf.autoQ4 && a.auto && rand() < rf.autoQ4) qb = Math.max(qb, 4);
    orderProgress(S, act.id, n, qb, mixed ? mixed.q : null);
    addRp(S, n * (ACTS.indexOf(act) + 1) * T.rpPer);
    if (hooks.complete) hooks.complete(act, n, p, mixed);
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
  // Achat groupé de rangs: n = 1, 10, 25 ou 'max' (autant que le budget le permet).
  // Renvoie le nombre de rangs et le coût total; en 'max' sans budget, le prix du rang suivant (ok: false).
  function upPlan(S, act, n) {
    var lvl = S.acts[act.id].lvl, k = 0, cost = 0, lim = n === 'max' ? 5000 : Math.max(1, Math.floor(n) || 1);
    while (k < lim) {
      var c = Math.ceil(act.upCost * Math.pow(T.upGrowth, lvl + k));
      if (n === 'max' && cost + c > S.money) break;
      cost += c; k++;
    }
    if (k === 0) return { n: 1, cost: upCost(S, act), ok: false };
    return { n: k, cost: cost, ok: S.money >= cost };
  }
  function upgradeActN(S, id, n) {
    var act = ACT_BY[id];
    if (!act || !isUnlocked(S, act)) return 0;
    var p = upPlan(S, act, n);
    if (!p.ok) return 0;
    var a = S.acts[id], from = a.lvl;
    S.money -= p.cost; a.lvl += p.n;
    if (hooks.upgrade) hooks.upgrade(act, a.lvl, from);
    return p.n;
  }
  function upgradeAct(S, id) { return upgradeActN(S, id, 1) > 0; }

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
      if (!a.run || a.hold) continue; // en cours de mixage: la production attend
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
  function teamCap(S) { return T.teamCap[Math.min(T.teamCap.length - 1, tierIndex(S))] + rdFx(S).cap; }
  function staffXpNeed(lvl) { return Math.round(T.staffXpBase * Math.pow(T.staffXpGrowth, lvl - 1)); }
  function roleFits(m, actId) { return ROLE_BY[m.role].acts.indexOf(actId) >= 0; }
  function working(m) { return !!m.act && m.rest <= 0 && m.train <= 0; }
  // Effet du membre affecté à une production: multiplicateurs de vitesse et de gains.
  function staffFx(S, actId) {
    var st = S.team && S.team.staff;
    if (!st || !st.length) return NOFX;
    for (var i = 0; i < st.length; i++) {
      var m = st[i];
      if (m.act !== actId || !working(m) || projBusy(S, m)) continue;
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
  function payroll(S) { var t = 0; (S.team ? S.team.staff : []).forEach(function (m) { t += m.salary; }); return t * rdFx(S).salary; }
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
  function trainCost(S, m) { return m.salary * T.trainSec * m.lvl * rdFx(S).trainCost; }
  function train(S, id) {
    var m = findMember(S, id);
    if (!m || m.lvl >= T.staffMaxLvl || m.train > 0 || m.rest > 0) return false;
    var c = trainCost(S, m);
    if (S.money < c) return false;
    S.money -= c; m.train = T.trainTime * (m.lvl + 1) * rdFx(S).trainTime;
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


  // ---------- Qualité et mixage ----------
  // Qualité (1 à 5 étoiles) d'une production sans mixage: le lieu et le membre de l'équipe affecté comptent.
  function baseQuality(S, actId) {
    var q = 1 + Math.floor(tierIndex(S) / 2), fx = staffFx(S, actId);
    if (fx.m) q += fx.m.stars >= 4 ? 2 : 1;
    q += rdFx(S).quality;
    return Math.max(1, Math.min(5, q));
  }
  function canMix(S, id) {
    var act = ACT_BY[id], a = act && S.acts[id];
    return !!a && isUnlocked(S, act) && a.run && !a.mix && !a.hold;
  }
  function startMix(S, id) { if (!canMix(S, id)) return false; S.acts[id].hold = true; return true; }
  function cancelMix(S, id) { if (S.acts[id]) S.acts[id].hold = false; }
  function mixStars(score) { return Math.max(1, Math.min(5, 1 + Math.round(score * 4))); }
  // score de 0 à 1. Le bonus s'applique à la prochaine production terminée; le titre mixé peut sortir dans le Top 50.
  function finishMix(S, id, score) {
    var a = S.acts[id];
    if (!a || !a.hold) return null;
    score = Math.max(0, Math.min(1, +score || 0));
    var rf = rdFx(S), q = Math.min(5, mixStars(score) + rf.mixStar);
    a.hold = false;
    a.mix = { m: 1 + (T.mixMax + rf.mixMax) * score * rf.mixMul, q: q, x: T.mixXp * score };
    addRp(S, T.rpMix * q);
    S.mixes = (S.mixes || 0) + 1;
    if (q === 5) S.perfect = (S.perfect || 0) + 1;
    var ch = S.charts;
    S.masters.push({ id: ch.nextId++, act: id, q: q });
    while (S.masters.length > T.mastersMax) S.masters.shift();
    if (hooks.mix) hooks.mix(ACT_BY[id], q, score);
    return a.mix;
  }

  // ---------- Commandes clients ----------
  function ordersOpen(S) { return S.level >= T.orderLevel; }
  function rawPayout(S, act) { return payout(S, act) / boostMult(S); }
  function makeOrder(S) {
    var open = ACTS.filter(function (a) { return isUnlocked(S, a); });
    if (!open.length) return null;
    // les productions les plus récentes sont plus demandées
    var w = open.map(function (a, i) { return Math.pow(i + 1, 1.5); }), tot = w.reduce(function (x, y) { return x + y; }, 0), r = rand() * tot, k = 0;
    while (k < open.length - 1 && r > w[k]) { r -= w[k]; k++; }
    var act = open[k], tr = trendFor(S), hot = false;
    if (tr && ACT_BY[tr.act] && isUnlocked(S, ACT_BY[tr.act]) && rand() < T.trendOrder) act = ACT_BY[tr.act];
    hot = !!tr && tr.act === act.id;
    var d = duration(S, act);
    var span = T.orderTimeMin + rand() * (T.orderTimeMax - T.orderTimeMin);
    var n = Math.max(2, Math.min(40, Math.round(span / d)));
    var bq = baseQuality(S, act.id), q = Math.max(1, Math.min(5, bq - 1 + Math.floor(rand() * 3)));
    var cl = CLIENTS[act.id] || ['Client', ['Un client']], names = cl[1];
    if (q > bq) n = Math.min(n, 1 + Math.floor(rand() * 3)); // chaque unité exigeante demande un mix: peu d'unités
    var time = Math.round(Math.max(n * d * T.orderDeadlineK + 30, q > bq ? n * (d + 45) + 60 : 0));
    var o = S.orders;
    return { id: o.nextId++, act: act.id, n: n, q: q, got: 0, time: time, left: time, life: T.orderOfferLife,
      reward: rawPayout(S, act) / trendAct(S, act.id) * n * (T.orderRewardBase + T.orderRewardQ * q) * (1 + o.rep / 100) * rdFx(S).orderReward * (hot ? T.trendOrderReward : 1), xp: xpGain(S, act) * n * 0.5,
      client: names[Math.floor(rand() * names.length)], kind: cl[0], trend: hot };
  }
  function acceptOrder(S, id) {
    var o = S.orders, i = -1;
    o.offers.forEach(function (x, k) { if (x.id === id) i = k; });
    if (i < 0 || o.active.length >= orderMax(S)) return false;
    var x = o.offers.splice(i, 1)[0];
    x.left = x.time; x.got = 0;
    o.active.push(x);
    return true;
  }
  function declineOrder(S, id) { var o = S.orders, n = o.offers.length; o.offers = o.offers.filter(function (x) { return x.id !== id; }); return o.offers.length < n; }
  function orderProgress(S, actId, n, qBase, qMix) {
    var o = S.orders;
    if (!o || !o.active.length) return;
    var done = [];
    o.active.forEach(function (x) {
      if (x.act !== actId) return;
      var c = (qMix != null ? (qMix >= x.q ? 1 : 0) + (qBase >= x.q ? n - 1 : 0) : (qBase >= x.q ? n : 0));
      x.got = Math.min(x.n, x.got + c);
      if (x.got >= x.n) done.push(x);
    });
    done.forEach(function (x) {
      o.active = o.active.filter(function (y) { return y !== x; });
      S.money += x.reward; S.lifetime += x.reward;
      addXp(S, x.xp);
      o.rep = Math.min(T.repMax, o.rep + T.repWin * rdFx(S).rep);
      o.done++;
      addRp(S, T.rpOrder * x.q);
      if (hooks.orderDone) hooks.orderDone(x);
    });
  }
  // Uniquement quand le joueur est présent (comme les sorties de studio): pas de commande ratée pendant l'absence.
  function tickOrders(S, dt) {
    if (!ordersOpen(S)) return;
    var o = S.orders;
    o.cd -= dt;
    if (o.cd <= 0) {
      o.cd = T.orderEvery * rdFx(S).orderEvery;
      if (o.offers.length < T.orderMaxOffers) { var x = makeOrder(S); if (x) { o.offers.push(x); if (hooks.orderNew) hooks.orderNew(x); } }
    }
    o.offers = o.offers.filter(function (x) { x.life -= dt; return x.life > 0; });
    var failed = [];
    o.active.forEach(function (x) { x.left -= dt; if (x.left <= 0) failed.push(x); });
    failed.forEach(function (x) {
      o.active = o.active.filter(function (y) { return y !== x; });
      o.rep = Math.max(0, o.rep - T.repLose); o.failed++;
      if (hooks.orderFail) hooks.orderFail(x);
    });
  }

  // ---------- Top 50 ----------
  function chartsOpen(S) { return S.level >= T.chartLevel; }
  function songTitle() { var w = CHART.words, t = CHART.tails; return w[Math.floor(rand() * w.length)] + ' ' + t[Math.floor(rand() * t.length)]; }
  function newRival(f) { return { t: songTitle(), a: CHART.artists[Math.floor(rand() * CHART.artists.length)], f: f, p: 0 }; }
  function potential(S) { return Math.log10(rawPayout(S, bestAct(S)) + 10); }
  function releaseScore(S, actId, q, promo) {
    return Math.log10(rawPayout(S, ACT_BY[actId]) + 10) * (0.55 + 0.2 * q) * (promo ? T.promoMult + rdFx(S).promoAdd : 1) * (1 + S.orders.rep / 200) * rdFx(S).chartScore * (0.9 + rand() * 0.2);
  }
  function initRivals(S) {
    var c = S.charts; c.rivals = [];
    for (var i = 0; i < T.chartSize; i++) c.rivals.push(newRival(0.55 + 1.5 * Math.pow(rand(), 1.8)));
    rankCharts(S, true);
  }
  // Classe rivaux et titres du joueur. Renvoie le Top 50 (meilleur en premier).
  function rankCharts(S, first) {
    var c = S.charts, P = potential(S), all = [];
    c.rivals.forEach(function (r) { all.push({ r: r, s: r.f * P }); });
    c.mine.forEach(function (m) { all.push({ m: m, s: m.s }); });
    all.sort(function (x, y) { return y.s - x.s; });
    all.forEach(function (e, i) {
      var pos = i + 1, o = e.r || e.m;
      o.p = first ? pos : (o.pos || 0);
      o.pos = pos;
      if (e.m) { if (pos <= T.chartSize && (!o.best || pos < o.best)) o.best = pos; }
    });
    c.mine.forEach(function (m) { if (m.pos <= T.chartSize && (!c.best || m.pos < c.best)) c.best = m.pos; });
    return all.slice(0, T.chartSize).map(function (e) { var o = e.r || e.m; return { t: o.t, a: e.r ? o.a : null, mine: !!e.m, id: e.m ? o.id : null, act: e.m ? o.act : null, q: e.m ? o.q : null, pos: o.pos, prev: o.p, weeks: e.m ? o.weeks : null, pj: e.m && o.pj ? o.pj : null }; });
  }
  function chartTop(S) {
    var c = S.charts, P = potential(S), all = [];
    c.rivals.forEach(function (r) { all.push({ o: r, s: r.f * P }); });
    c.mine.forEach(function (m) { all.push({ o: m, s: m.s, mine: true }); });
    all.sort(function (x, y) { return y.s - x.s; });
    return all.slice(0, T.chartSize).map(function (e, i) { return { t: e.o.t, a: e.mine ? null : e.o.a, mine: !!e.mine, id: e.mine ? e.o.id : null, act: e.mine ? e.o.act : null, q: e.mine ? e.o.q : null, pos: i + 1, prev: e.o.p || 0, weeks: e.mine ? e.o.weeks : null, pj: e.mine && e.o.pj ? e.o.pj : null }; });
  }
  function promoCost(S) { return incomeRef(S) * T.promoSec * rdFx(S).promoCost; }
  function canFreeRelease(S) { return chartsOpen(S) && S.charts.free !== S.charts.week; }
  // src: identifiant d'un titre mixé, ou 'free' pour un titre du catalogue (une fois par semaine, qualité de base, production choisie).
  function release(S, src, promo, actId) {
    if (!chartsOpen(S)) return null;
    var c = S.charts, act, q;
    if (!c.rivals.length) initRivals(S);
    if (src === 'free') {
      act = actId && ACT_BY[actId] && isUnlocked(S, ACT_BY[actId]) ? actId : bestAct(S).id;
      if (!canFreeRelease(S)) return null;
      q = baseQuality(S, act);
    } else {
      var m = null;
      S.masters.forEach(function (x) { if (x.id === src) m = x; });
      if (!m) return null;
      act = m.act; q = m.q;
    }
    var cost = promo ? promoCost(S) : 0;
    if (S.money < cost) return null;
    S.money -= cost;
    if (src === 'free') c.free = c.week; else S.masters = S.masters.filter(function (x) { return x.id !== src; });
    var e = { id: c.nextId++, t: songTitle(), act: act, q: q, s: releaseScore(S, act, q, promo), weeks: 0, pos: 0, p: 0, best: 0, promo: !!promo, earned: 0 };
    c.mine.push(e); c.releases++;
    rankCharts(S, false);
    e.p = 0;
    if (e.pos > T.chartSize) c.mine = c.mine.filter(function (x) { return x !== e; });
    if (hooks.release) hooks.release(e);
    return e;
  }
  function chartPay(S, pos) { return incomeRef(S) * T.chartPaySec * (T.chartSize + 1 - pos) / T.chartSize * rdFx(S).chartPay; }
  function weekEnd(S) {
    var c = S.charts, pay = 0, entries = [];
    rankCharts(S, false);
    c.mine.forEach(function (m) {
      if (m.pos > T.chartSize) return;
      var g = chartPay(S, m.pos);
      if (m.pj && m.pj.w < PJ.sales.length) { var sl = m.pj.sales * PJ.sales[m.pj.w]; m.pj.w++; m.pj.sold += sl; g += sl; }
      pay += g; m.earned += g; m.weeks++;
      entries.push({ t: m.t, pos: m.pos, gain: g });
      if (m.pos === 1) { c.num1++; S.orders.rep = Math.min(T.repMax, S.orders.rep + 3); }
      addRp(S, T.rpChart * (T.chartSize + 1 - m.pos));
    });
    S.money += pay; S.lifetime += pay;
    // la semaine suivante: les titres vieillissent, de nouveaux rivaux entrent
    var dec = Math.max(T.chartDecay, rdFx(S).chartDecay);
    c.mine.forEach(function (m) { m.s *= dec * (0.95 + rand() * 0.1); });
    c.rivals.forEach(function (r) { r.f *= 0.93 + rand() * 0.12; });
    c.rivals.sort(function (x, y) { return y.f - x.f; });
    for (var i = 0; i < 5; i++) c.rivals.splice(Math.floor(rand() * c.rivals.length), 1);
    while (c.rivals.length < T.chartSize) c.rivals.push(newRival(0.75 + 1.1 * Math.pow(rand(), 1.5)));
    c.rivals.forEach(function (r) { r.f = Math.max(0.4, Math.min(2.1, r.f)); });
    c.week++; c.left = T.weekLen;
    rankCharts(S, false);
    c.mine = c.mine.filter(function (m) { return m.pos <= T.chartSize; });
    if (hooks.chartWeek) hooks.chartWeek({ week: c.week - 1, pay: pay, entries: entries });
    return { pay: pay, entries: entries };
  }
  function tickCharts(S, dt) {
    if (!chartsOpen(S)) return;
    var c = S.charts;
    if (!c.rivals.length) initRivals(S);
    if (!c.trend || c.trend.w !== c.week) { c.trend = makeTrend(S); if (hooks.trend) hooks.trend(c.trend); }
    c.left -= dt;
    if (c.left <= 0) weekEnd(S);
  }
  function tickLive(S, dt) { tickOrders(S, dt); tickCharts(S, dt); tickProject(S, dt); tickBattle(S, dt); if (S.piano.cd > 0) S.piano.cd = Math.max(0, S.piano.cd - dt); }


  // ---------- Projets de création (bonus facultatif) ----------
  function projOpen(S) { return S.level >= T.projLevel && chartsOpen(S); }
  function genreOpen(S, id) { var g = PJ_G[id]; return !!g && (!g.rd || !!(S.rd && S.rd.nodes[g.rd])); }
  function formatOpen(S, id) { var f = PJ_F[id]; return !!f && tierIndex(S) >= f.tier; }
  function projCost(S, fmt) { var f = PJ_F[fmt] || PJ.formats[0]; return incomeRef(S) * T.projCostSec * f.cost; }
  function projTime(fmt, i) { var f = PJ_F[fmt] || PJ.formats[0]; return PJ.phases[i].dur * f.time; }
  function comboGrade(g, mood) { return g.good.indexOf(mood) >= 0 ? 'top' : g.bad.indexOf(mood) >= 0 ? 'bad' : 'ok'; }
  function pubGrade(g, pub) { return g.pub === pub ? 'top' : g.badPub === pub ? 'bad' : 'ok'; }
  function projBusy(S, m) { var c = S.proj && S.proj.cur; return !!c && c.team[c.phase] === m.id; }
  // Apport d'un membre de l'équipe à une phase (0,35 sans personne, jusqu'à 1).
  function phaseFit(S, i, id) {
    var m = id ? findMember(S, id) : null;
    if (!m || m.rest > 0 || m.train > 0) return 0.35;
    var fits = PJ.phases[i].roles.indexOf(m.role) >= 0;
    return Math.min(1, (0.45 + 0.07 * m.stars + 0.015 * m.lvl) * (fits ? 1 : 0.75) * (0.7 + 0.3 * m.morale / 100));
  }
  function sliderAcc(v, ideal) { return Math.max(0, Math.min(1, 1 - Math.max(0, Math.abs(v - ideal) - 8) / 50)); }
  function cleanCfg(S, c) {
    if (!c || typeof c !== 'object' || !genreOpen(S, c.genre) || !PJ_M[c.mood] || !PJ_P[c.pub] || !formatOpen(S, c.fmt)) return null;
    var sl = [0, 1, 2].map(function (i) { return Math.max(0, Math.min(100, Math.round(num(c.sl && c.sl[i], 50)))); });
    var team = [0, 1, 2].map(function (i) { var id = c.team && c.team[i]; return id && findMember(S, id) ? id : null; });
    var title = String(c.title || '').replace(/\s+/g, ' ').trim().slice(0, 40) || songTitle();
    return { title: title, genre: c.genre, mood: c.mood, pub: c.pub, fmt: c.fmt, sl: sl, team: team };
  }
  function startProject(S, cfg) {
    if (!projOpen(S) || S.proj.cur) return null;
    var c = cleanCfg(S, cfg);
    if (!c) return null;
    var cost = projCost(S, c.fmt);
    if (S.money < cost) return null;
    S.money -= cost;
    c.cost = cost; c.phase = 0; c.t = 0; c.fit = [];
    var tr = trendFor(S); c.tg = !!tr && tr.g === c.genre; c.tm = !!tr && tr.m === c.mood;
    S.proj.cur = c;
    if (hooks.projectStart) hooks.projectStart(c);
    return c;
  }
  function cancelProject(S) {
    var c = S.proj && S.proj.cur;
    if (!c) return 0;
    var back = c.cost * T.projRefund;
    S.money += back; S.proj.cur = null;
    return back;
  }
  function tickProject(S, dt) {
    var c = S.proj && S.proj.cur;
    if (!c) return;
    c.t += dt;
    while (c && c.t >= projTime(c.fmt, c.phase)) {
      c.t -= projTime(c.fmt, c.phase);
      c.fit[c.phase] = phaseFit(S, c.phase, c.team[c.phase]);
      c.phase++;
      if (c.phase >= PJ.phases.length) { finishProject(S); c = null; }
      else if (hooks.projectPhase) hooks.projectPhase(c);
    }
  }
  // Note de 0 à 10 et détail, à partir des choix et de l'équipe.
  function projScore(S, c) {
    var g = PJ_G[c.genre], cg = comboGrade(g, c.mood), pg = pubGrade(g, c.pub), acc = 0, fit = 0;
    c.sl.forEach(function (v, i) { acc += sliderAcc(v, g.ideal[i]) / 3; });
    (c.fit || []).forEach(function (f) { fit += f / 3; });
    var h = S.proj.hist, same = h.some(function (x) { return x.g === c.genre && x.m === c.mood; }), again = h.length && h[0].g === c.genre;
    var crea = 0; RESEARCH.nodes.forEach(function (n) { if (n.b === 'crea' && S.rd.nodes[n.id]) crea += 0.1; });
    var parts = { base: 1, combo: cg === 'top' ? 1.5 : cg === 'bad' ? -2 : 0, pub: pg === 'top' ? 1 : pg === 'bad' ? -1.5 : 0, sliders: 3.5 * acc, team: 3 * fit,
      studio: Math.min(1, 0.25 * tierIndex(S)) + crea, fresh: same ? -1.5 : again ? -0.5 : 0, trend: (c.tg ? T.trendGenre : 0) + (c.tm ? T.trendMood : 0) };
    var s = 0; Object.keys(parts).forEach(function (k) { s += parts[k]; });
    return { score: Math.max(0, Math.min(10, s + (rand() - 0.5) * 0.8)), parts: parts, combo: cg, pubG: pg, acc: acc, fit: fit };
  }
  function finishProject(S) {
    var P = S.proj, c = P.cur, g = PJ_G[c.genre], f = PJ_F[c.fmt], r = projScore(S, c);
    P.cur = null;
    var notes = PJ.critics.map(function (name) { return { name: name, n: Math.max(0, Math.min(10, Math.round((r.score + (rand() - 0.5) * 1.6) * 2) / 2)) }; });
    var avg = 0; notes.forEach(function (x) { avg += x.n / notes.length; });
    avg = Math.round(avg * 10) / 10;
    // carnet du studio: associations découvertes et zone probable de chaque curseur
    var key = c.genre + '|' + c.mood;
    P.book.c[key] = r.combo; P.book.p[c.genre + '|' + c.pub] = r.pubG;
    var h = P.book.h[c.genre] || [[0, 100], [0, 100], [0, 100]];
    c.sl.forEach(function (v, i) {
      var d = g.ideal[i] - v, z = h[i];
      if (Math.abs(d) <= 12) { z[0] = Math.max(z[0], v - 12); z[1] = Math.min(z[1], v + 12); }
      else if (d > 0) z[0] = Math.max(z[0], Math.min(v + 12, 100));
      else z[1] = Math.min(z[1], Math.max(v - 12, 0));
      if (z[0] > z[1]) { var mid = (z[0] + z[1]) / 2; z[0] = mid; z[1] = mid; }
    });
    P.book.h[c.genre] = h;
    P.hist.unshift({ g: c.genre, m: c.mood }); P.hist = P.hist.slice(0, 4);
    P.done++; P.best = Math.max(P.best, avg);
    // sortie dans le Top 50 et ventes réparties sur les semaines de classement
    var sales = c.cost * (0.15 + 0.02 * avg * avg) * f.roi * (c.tg ? T.trendSales : 1);
    var c2 = S.charts; if (!c2.rivals.length) initRivals(S);
    var e = { id: c2.nextId++, t: c.title, act: bestAct(S).id, q: Math.max(1, Math.min(5, Math.round(avg / 2))),
      s: potential(S) * (0.25 + 0.18 * avg) * f.chart * (1 + S.orders.rep / 200) * rdFx(S).chartScore,
      weeks: 0, pos: 0, p: 0, best: 0, promo: false, earned: 0, pj: { g: c.genre, f: c.fmt, sales: sales, sold: 0, w: 0, avg: avg } };
    c2.mine.push(e); c2.releases++;
    rankCharts(S, false); e.p = 0;
    var inChart = e.pos <= T.chartSize;
    if (!inChart) c2.mine = c2.mine.filter(function (x) { return x !== e; });
    addXp(S, xpGain(S, bestAct(S)) * T.projXp * f.time * (0.5 + avg / 10));
    addRp(S, T.rpProj * avg * f.time);
    if (avg >= 8) S.orders.rep = Math.min(T.repMax, S.orders.rep + Math.round(avg - 6));
    var res = { title: c.title, genre: c.genre, mood: c.mood, pub: c.pub, fmt: c.fmt, sl: c.sl.slice(), avg: avg, notes: notes, combo: r.combo, pubG: r.pubG,
      acc: Math.round(r.acc * 100), fit: Math.round(r.fit * 100), fresh: r.parts.fresh, pos: inChart ? e.pos : 0, sales: sales, cost: c.cost, tg: !!c.tg, tm: !!c.tm };
    P.last = res;
    checkTrophies(S);
    if (hooks.projectDone) hooks.projectDone(res);
    return res;
  }
  function hydrateProj(S, o) {
    var P = S.proj;
    P.done = Math.max(0, Math.floor(num(o.done, 0))); P.best = Math.max(0, Math.min(10, num(o.best, 0)));
    var b = o.book && typeof o.book === 'object' ? o.book : {}, G3 = ['top', 'ok', 'bad'];
    if (b.c && typeof b.c === 'object') Object.keys(b.c).forEach(function (k) { var p = k.split('|'); if (PJ_G[p[0]] && PJ_M[p[1]] && G3.indexOf(b.c[k]) >= 0) P.book.c[k] = b.c[k]; });
    if (b.p && typeof b.p === 'object') Object.keys(b.p).forEach(function (k) { var p = k.split('|'); if (PJ_G[p[0]] && PJ_P[p[1]] && G3.indexOf(b.p[k]) >= 0) P.book.p[k] = b.p[k]; });
    if (b.h && typeof b.h === 'object') Object.keys(b.h).forEach(function (k) {
      var h = b.h[k];
      if (!PJ_G[k] || !Array.isArray(h) || h.length !== 3) return;
      P.book.h[k] = h.map(function (z) { var lo = Math.max(0, Math.min(100, num(z && z[0], 0))), hi = Math.max(lo, Math.min(100, num(z && z[1], 100))); return [lo, hi]; });
    });
    (Array.isArray(o.hist) ? o.hist : []).forEach(function (x) { if (x && PJ_G[x.g] && PJ_M[x.m] && P.hist.length < 4) P.hist.push({ g: x.g, m: x.m }); });
    var l = o.last;
    if (l && typeof l === 'object' && PJ_G[l.genre] && PJ_M[l.mood] && PJ_P[l.pub] && PJ_F[l.fmt] && Array.isArray(l.notes)) {
      P.last = { title: String(l.title || 'Projet').slice(0, 40), genre: l.genre, mood: l.mood, pub: l.pub, fmt: l.fmt,
        sl: [0, 1, 2].map(function (i) { return Math.max(0, Math.min(100, num(l.sl && l.sl[i], 50))); }), avg: Math.max(0, Math.min(10, num(l.avg, 0))),
        notes: l.notes.slice(0, PJ.critics.length).map(function (x) { return { name: String((x && x.name) || 'Critique').slice(0, 30), n: Math.max(0, Math.min(10, num(x && x.n, 0))) }; }),
        combo: G3.indexOf(l.combo) >= 0 ? l.combo : 'ok', pubG: G3.indexOf(l.pubG) >= 0 ? l.pubG : 'ok', acc: Math.max(0, Math.min(100, num(l.acc, 0))), fit: Math.max(0, Math.min(100, num(l.fit, 0))),
        fresh: Math.min(0, num(l.fresh, 0)), pos: Math.max(0, Math.floor(num(l.pos, 0))), sales: Math.max(0, num(l.sales, 0)), cost: Math.max(0, num(l.cost, 0)), tg: !!l.tg, tm: !!l.tm };
    }
    var c = o.cur;
    if (c && typeof c === 'object' && PJ_G[c.genre] && PJ_M[c.mood] && PJ_P[c.pub] && PJ_F[c.fmt]) {
      var ids = {}; S.team.staff.forEach(function (m) { ids[m.id] = 1; });
      var ph = Math.max(0, Math.min(PJ.phases.length - 1, Math.floor(num(c.phase, 0))));
      P.cur = { title: String(c.title || 'Projet').slice(0, 40), genre: c.genre, mood: c.mood, pub: c.pub, fmt: c.fmt,
        sl: [0, 1, 2].map(function (i) { return Math.max(0, Math.min(100, Math.round(num(c.sl && c.sl[i], 50)))); }),
        team: [0, 1, 2].map(function (i) { var id = c.team && c.team[i]; return id && ids[id] ? id : null; }),
        cost: Math.max(0, num(c.cost, 0)), phase: ph, t: Math.max(0, Math.min(projTime(c.fmt, ph), num(c.t, 0))), tg: !!c.tg, tm: !!c.tm,
        fit: [0, 1, 2].slice(0, ph).map(function (i) { return Math.max(0, Math.min(1, num(c.fit && c.fit[i], 0.35))); }) };
    }
  }
  function dismissProject(S) { if (S.proj) S.proj.last = null; }



  // ---------- Tendances de la semaine ----------
  function trendFor(S) { var c = S.charts; return c && c.trend && c.trend.w === c.week && S.level >= T.chartLevel ? c.trend : null; }
  function trendAct(S, id) { var c = S.charts, t = c && c.trend; return t && t.act === id && t.w === c.week && S.level >= T.chartLevel ? T.trendAct : 1; }
  function pickNot(list, prev) { var l = list.length > 1 ? list.filter(function (x) { return x !== prev; }) : list; return l[Math.floor(rand() * l.length)]; }
  function makeTrend(S) {
    var p = S.charts.trend || {};
    var gs = PJ.genres.filter(function (g) { return genreOpen(S, g.id); }).map(function (g) { return g.id; });
    var acts = ACTS.filter(function (a) { return isUnlocked(S, a); }).map(function (a) { return a.id; });
    return { w: S.charts.week, g: pickNot(gs.length ? gs : [PJ.genres[0].id], p.g), m: pickNot(PJ.moods.map(function (m) { return m.id; }), p.m),
      act: pickNot(acts.length ? acts : [ACTS[0].id], p.act), rule: pickNot(RULES, p.rule) };
  }

  // ---------- Décoration du studio ----------
  function decoOpt(slot, id) { return DECO_BY[slot] && DECO_BY[slot][id]; }
  function decoUnlocked(S, slot, id) { var o = decoOpt(slot, id); return !!o && (!o.need || trophyMetric(S, o.need.m) >= o.need.n); }
  function decoProgress(S, slot, id) { var o = decoOpt(slot, id); if (!o || !o.need) return null; return { v: Math.min(o.need.n, trophyMetric(S, o.need.m)), n: o.need.n }; }
  function setDeco(S, slot, id) {
    if (!decoUnlocked(S, slot, id)) return false;
    S.deco[slot] = id; S.deco.seen[slot + ':' + id] = 1;
    return true;
  }
  // Options débloquées par un exploit et pas encore vues dans l'atelier de décoration.
  function decoNew(S) {
    var out = [];
    DECO.slots.forEach(function (s) { s.options.forEach(function (o) { if (o.need && !S.deco.seen[s.id + ':' + o.id] && decoUnlocked(S, s.id, o.id)) out.push(s.id + ':' + o.id); }); });
    return out;
  }
  function seeDeco(S) { decoNew(S).forEach(function (k) { S.deco.seen[k] = 1; }); }

  // ---------- Atelier piano ----------
  function pianoOpen(S) { return !!S.owned.clavier; }
  function pianoReward(len) { return { m: Math.round(Math.min(2.5, 1 + 0.12 * len) * 100) / 100, s: Math.min(240, 60 + 12 * len) }; }
  // len: longueur de la plus longue mélodie rejouée sans faute. L'inspiration n'est versée que hors délai d'attente.
  function finishPiano(S, len) {
    if (!pianoOpen(S)) return null;
    var P = S.piano; len = Math.max(0, Math.min(60, Math.floor(num(len, 0))));
    P.plays++; P.best = Math.max(P.best, len);
    var out = { len: len, best: P.best, reward: null };
    if (P.cd <= 0 && len >= 3) {
      var r = pianoReward(len), xp = xpNeeded(S.level) * 0.012 * len;
      grantBoost(S, r.m, r.s); addXp(S, xp);
      P.cd = T.pianoEvery;
      out.reward = { m: r.m, s: r.s, xp: xp };
    }
    out.cd = P.cd;
    checkTrophies(S);
    return out;
  }

  // ---------- Clash de beatmakers ----------
  function battleOpen(S) { return S.level >= T.battleLevel; }
  function league(S) { return BT.leagues[S.battle.league - 1]; }
  function makeRival(S) {
    var L = league(S), used = S.battle.rival ? S.battle.rival.name : '';
    var names = BT.rivals.filter(function (n) { return n !== used; });
    var tr = trendFor(S);
    return { name: names[Math.floor(rand() * names.length)], league: S.battle.league, target: Math.min(0.95, L.target + (rand() - 0.5) * 0.08), seed: Math.floor(rand() * 4294967295) >>> 0, rule: tr ? tr.rule : null };
  }
  function tickBattle(S, dt) {
    if (!battleOpen(S)) return;
    var B = S.battle;
    if (B.rival) return;
    B.cd -= dt;
    if (B.cd <= 0) { B.rival = makeRival(S); B.cd = 0; if (hooks.battleNew) hooks.battleNew(B.rival); }
  }
  function declineBattle(S) { var B = S.battle; if (!B.rival) return false; B.rival = null; B.cd = T.battleEvery / 2; return true; }
  // Générateur pseudo-aléatoire déterministe: une même graine donne toujours le même beat.
  function seeded(seed) { var a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  // Partition du clash en doubles-croches: [{ s: pas (16 par mesure), l: piste 0 kick, 1 caisse claire, 2 charleston, 3 clap }].
  function battlePattern(seed, dens, bars) {
    var r = seeded(seed), out = [], has = {};
    function add(s, l) { var k = s + ':' + l; if (!has[k]) { has[k] = 1; out.push({ s: s, l: l }); } }
    for (var b = 0; b < bars; b++) {
      var o = b * 16, intro = b === 0, last = b === bars - 1, hits = {};
      var kicks = [0, 8], snares = [4, 12], hats = [];
      if (!intro) {
        var extra = [3, 6, 10, 11, 14];
        for (var i = 0; i < dens; i++) if (r() < 0.55) kicks.push(extra[Math.floor(r() * extra.length)]);
        if (dens >= 3 && r() < 0.5) snares.push(r() < 0.5 ? 7 : 15);
        if (dens === 0) hats = [2, 6, 10, 14];
        else if (dens <= 2) hats = [0, 2, 4, 6, 8, 10, 12, 14];
        else { hats = [0, 2, 4, 6, 8, 10, 12, 14]; for (var h = 1; h < 16; h += 2) if (r() < (dens === 3 ? 0.12 : 0.28)) hats.push(h); }
      }
      kicks.forEach(function (s) { hits[s] = 1; add(o + s, 0); });
      snares.forEach(function (s) { hits[s] = 1; add(o + s, 1); });
      // sans accords dans la première ligue: pas de charleston sur un kick ou une caisse claire
      hats.forEach(function (s) { if (dens > 0 && dens < 2 && hits[s]) return; if (dens === 0 && hits[s]) return; add(o + s, 2); });
      if (dens >= 1 && !intro && b % 2 === 1) add(o + 12, 3);
      if (dens >= 2 && last) [13, 14, 15].forEach(function (s) { add(o + s, 3); });
    }
    out.sort(function (x, y) { return x.s - y.s || x.l - y.l; });
    return out;
  }
  function startBattle(S) {
    var B = S.battle, R = B.rival;
    if (!battleOpen(S) || !R) return null;
    var L = BT.leagues[R.league - 1];
    var notes = battlePattern(R.seed, L.dens, T.battleBars);
    if (R.rule === 'sans-clap') notes = notes.filter(function (n) { return n.l !== 3; });
    return { rival: R, league: R.league, leagueName: L.name, bpm: Math.round(L.bpm * (R.rule === 'rapide' ? 1.1 : 1)), bars: T.battleBars, notes: notes, rule: R.rule || null };
  }
  // res: { score 0 à 1, combo }. Renvoie le résultat et applique les récompenses.
  function finishBattle(S, res) {
    var B = S.battle, R = B.rival;
    if (!R || !res) return null;
    var score = Math.max(0, Math.min(1, num(res.score, 0))), combo = Math.max(0, Math.floor(num(res.combo, 0)));
    var win = score >= R.target, L = BT.leagues.length, ref = eventRef(S), promo = false, demo = false, out = { win: win, score: score, target: R.target, rival: R.name, league: R.league };
    B.best = Math.max(B.best, combo);
    if (win) {
      B.wins++;
      var cash = ref * (0.8 + 0.4 * R.league) * (0.75 + score * 0.5) * rdFx(S).event * (R.rule === 'prime' ? 1.5 : R.rule === 'rapide' ? 1.25 : 1), xp = xpNeeded(S.level) * 0.08 * R.league;
      S.money += cash; S.lifetime += cash; addXp(S, xp); addRp(S, Math.max(30, rdRate(S) * 120) * R.league);
      S.orders.rep = Math.min(T.repMax, S.orders.rep + 1 + Math.floor(R.league / 2));
      out.cash = cash; out.xp = xp;
      if (B.league < L && R.league === B.league) { B.pts++; if (B.pts >= T.battleUp) { B.league++; B.pts = 0; promo = true; } }
    } else {
      B.losses++;
      var x2 = xpNeeded(S.level) * 0.02; addXp(S, x2); out.xp = x2;
      if (B.pts > 0) B.pts--;
    }
    out.promo = promo; out.demo = demo; out.newLeague = B.league; out.pts = B.pts;
    B.rival = null; B.cd = T.battleEvery;
    checkTrophies(S);
    if (hooks.battleDone) hooks.battleDone(out);
    return out;
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
    if (S.proj) { S.proj.cur = null; S.proj.last = null; } // un projet en cours est abandonné, le carnet reste
    S.rd.spec = {}; // les recherches restent, les spécialisations se choisissent à nouveau
    // L'équipe part aussi en tournée: ses membres pourront revenir sans prime d'embauche.
    var tm = S.team || newTeam(), al = tm.staff.map(function (m) { return { id: m.id, name: m.name, role: m.role, stars: m.stars, lvl: m.lvl, xp: 0, salary: m.salary, look: m.look }; });
    tm.alumni = al.concat(tm.alumni.filter(function (a) { return !al.some(function (b) { return b.id === a.id; }); })).slice(0, 16);
    tm.staff = []; tm.pool = []; tm.poolCd = 0; S.team = tm;
    S.masters = []; S.orders.offers = []; S.orders.active = []; S.orders.cd = T.orderFirst; // la réputation et le Top 50 restent
    S.fame = (S.fame || 0) + n; S.tours = (S.tours || 0) + 1;
    S.savedAt = now; S.epoch = now;
    touch(S);
    return { points: n, fame: S.fame, tours: S.tours };
  }

  // ---------- Palmarès ----------
  // Nombre total de niveaux décrochés (chaque niveau compte pour le bonus).
  function trophyCount(S) { var n = 0, t = S.trophies || {}; Object.keys(t).forEach(function (k) { n += t[k] || 0; }); return n; }
  function trophyTotal() { var n = 0; TROPHIES.forEach(function (t) { n += t.levels.length; }); return n; }
  function trophyLevel(S, id) { return (S.trophies && S.trophies[id]) || 0; }
  function levelName(t, lvl) { return t.levels.length === 1 ? 'Décroché' : TLV[Math.min(TLV.length - 1, lvl - 1)]; }
  // Accepte le nouveau format { famille: niveau } et les anciens trophées { id: 1 }.
  function hydrateTrophies(S, o) {
    Object.keys(o).forEach(function (k) {
      var v = o[k];
      if (TROPHY_BY[k] && typeof v === 'number' && isFinite(v) && v > 0) S.trophies[k] = Math.max(S.trophies[k] || 0, Math.min(TROPHY_BY[k].levels.length, Math.floor(v)));
      else if (OLD_TROPHY[k] && v) { var m = OLD_TROPHY[k]; S.trophies[m[0]] = Math.max(S.trophies[m[0]] || 0, m[1]); }
    });
  }
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
      case 'mixes': n = S.mixes || 0; break;
      case 'perfect': n = S.perfect || 0; break;
      case 'orders': n = S.orders ? S.orders.done : 0; break;
      case 'rep': n = S.orders ? S.orders.rep : 0; break;
      case 'chartBest': n = S.charts && S.charts.best ? T.chartSize + 1 - S.charts.best : 0; break;
      case 'rdNodes': n = rdCount(S); break;
      case 'projects': n = S.proj ? S.proj.done : 0; break;
      case 'projBest': n = S.proj ? S.proj.best : 0; break;
      case 'book': n = S.proj ? Object.keys(S.proj.book.c).length : 0; break;
      case 'num1': n = S.charts ? S.charts.num1 : 0; break;
      case 'chains': EVENTS.forEach(function (x) { if (x.need && x.need.contact && S.ev.seen[x.id]) n++; }); break;
      case 'gambles': n = S.ev.won || 0; break;
      case 'battles': n = S.battle ? S.battle.wins : 0; break;
      case 'league': n = S.battle ? S.battle.league : 1; break;
      case 'combo': n = S.battle ? S.battle.best : 0; break;
      case 'pianoBest': n = S.piano ? S.piano.best : 0; break;
      case 'specs': n = Object.keys((S.rd && S.rd.spec) || {}).length; break;
      case 'staffLvl': (S.team ? S.team.staff : []).forEach(function (m) { n = Math.max(n, m.lvl); }); break;
      case 'outings': Object.keys(S.ev.seen || {}).forEach(function (id) { n += S.ev.seen[id] || 0; }); break;
    }
    if (memo) memo[key] = n;
    return n;
  }
  // Progression vers le prochain niveau d'une famille (ou le dernier si tout est décroché).
  function trophyProgress(S, t) {
    var lvl = trophyLevel(S, t.id), max = t.levels.length, k = Math.min(lvl, max - 1), n = t.levels[k];
    var v = trophyMetric(S, t.m), base = k > 0 ? t.levels[k - 1] : (t.m === 'level' ? 1 : t.m === 'league' ? 1 : 0);
    return { v: Math.min(v, n), n: n, f: lvl >= max ? 1 : Math.max(0, Math.min(1, (v - base) / (n - base))), lvl: lvl, max: max, done: lvl >= max };
  }

  // Débloque les trophées dont le seuil est atteint. Renvoie ceux qui viennent de l'être.
  function checkTrophies(S, silent) {
    if (!S.trophies) S.trophies = {};
    var got = [], memo = {};
    for (var i = 0; i < TROPHIES.length; i++) {
      var t = TROPHIES[i], lvl = S.trophies[t.id] || 0, v = null;
      while (lvl < t.levels.length) {
        if (v === null) v = trophyMetric(S, t.m, memo);
        if (v < t.levels[lvl]) break;
        lvl++;
        S.trophies[t.id] = lvl;
        got.push({ id: t.id, fam: t, lvl: lvl, name: t.name, level: levelName(t, lvl) });
      }
    }
    if (got.length) {
      touch(S);
      if (!silent && hooks.trophy) got.forEach(function (g) { hooks.trophy(g); });
    }
    return got;
  }
  // Prochains niveaux les plus proches d'être décrochés. g.t décrit le niveau visé (nom, seuil, famille).
  function nextGoals(S, k) {
    var out = [];
    TROPHIES.forEach(function (t, i) {
      var p = trophyProgress(S, t);
      if (p.done) return;
      out.push({ t: { id: t.id, fam: t, name: t.name + ' · ' + levelName(t, p.lvl + 1), m: t.m, n: p.n, lvl: p.lvl + 1 }, p: p, i: i });
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
    var pool = EVENTS.filter(function (x) { return ti >= x.tiers[0] && ti <= x.tiers[1] && (!x.need || !x.need.contact || !!S.contacts[x.need.contact]); });
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
  // Une option de sortie est-elle accessible ? Renvoie { ok, need (texte), cost }.
  function choiceInfo(S, c) {
    var n = c.need, ok = true, label = null, cost = c.cost ? eventRef(S) * c.cost : 0;
    if (n) {
      if (n.item) { ok = !!S.owned[n.item]; label = ITEM_BY[n.item].name; }
      else if (n.role) { ok = S.team.staff.some(function (m) { return m.role === n.role && m.rest <= 0 && m.train <= 0; }); label = 'un membre ' + ROLE_BY[n.role].name.toLowerCase(); }
      else if (n.staff) { ok = S.team.staff.length >= n.staff; label = n.staff > 1 ? n.staff + ' membres dans l’équipe' : 'un membre dans l’équipe'; }
      else if (n.rd) { ok = !!S.rd.nodes[n.rd]; label = 'recherche ' + RD_BY[n.rd].name; }
      else if (n.contact) { ok = !!S.contacts[n.contact]; label = EVENT_BY[n.contact].contact; }
      else if (n.level) { ok = S.level >= n.level; label = 'expertise niveau ' + n.level; }
    }
    return { ok: ok && S.money >= cost, need: label, needOk: ok, cost: cost, risk: c.risk ? c.risk.p : null };
  }
  // Un nouveau boost plus long repart avec une jauge pleine ; un boost plus court ne raccourcit pas l'actuel.
  function grantBoost(S, m, s) {
    S.boost = { m: Math.max(boostMult(S), m), left: Math.max(S.boost.left, s), t: s >= S.boost.left ? s : Math.max(S.boost.t || 0, S.boost.left) };
  }
  function applyReward(S, x, r, ref) {
    var m, a;
    switch (r.k) {
      case 'rp':
        m = r.x * Math.max(60, rdRate(S) * 300); addRp(S, m);
        return { k: 'rp', v: m };
      case 'rep':
        m = Math.min(T.repMax - S.orders.rep, r.n); S.orders.rep = Math.min(T.repMax, S.orders.rep + r.n);
        return { k: 'rep', v: Math.max(0, m) };
      case 'morale':
        if (!S.team.staff.length) return null;
        S.team.staff.forEach(function (s) { s.morale = Math.min(100, s.morale + r.n); });
        return { k: 'morale', v: r.n };
      case 'master':
        a = bestAct(S);
        if (S.masters.length >= T.mastersMax) { m = ref; S.money += m; S.lifetime += m; return { k: 'cash', v: m }; }
        S.masters.push({ id: S.charts.nextId++, act: a.id, q: r.q });
        return { k: 'master', q: r.q, act: a.id };
      case 'cash':
        m = ref * r.x * rdFx(S).event; S.money += m; S.lifetime += m;
        return { k: 'cash', v: m };
      case 'xp':
        m = xpNeeded(S.level) * r.x * rdFx(S).event; addXp(S, m);
        return { k: 'xp', v: m };
      case 'boost':
        grantBoost(S, r.m, r.s);
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
    var info = choiceInfo(S, c);
    if (!info.ok) return null;
    var ref = eventRef(S), out = [], rw = c.rw, outcome = c.outcome, win = null;
    if (info.cost) { S.money -= info.cost; out.push({ k: 'spent', v: info.cost }); }
    if (c.risk) {
      win = (rnd || rand)() < c.risk.p;
      if (win) S.ev.won = (S.ev.won || 0) + 1;
      else { rw = c.risk.rw; outcome = c.risk.outcome; }
    }
    rw.forEach(function (r) { var g = applyReward(S, x, r, ref); if (g) out.push(g); });
    S.ev.seen[x.id] = (S.ev.seen[x.id] || 0) + 1;
    S.ev.pending = null; S.ev.hold = false; S.ev.cd = nextCd(rnd);
    return { event: x, choice: c, rewards: out, outcome: outcome, win: win };
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
    tapAct: tapAct, buy: buy, upgradeAct: upgradeAct, upgradeActN: upgradeActN, upPlan: upPlan, buyAuto: buyAuto, advance: advance, offline: offline, touch: touch,
    boostMult: boostMult, contactCount: contactCount, eventRef: eventRef, tickEvents: tickEvents, dismissEvent: dismissEvent,
    resolveEvent: resolveEvent, pickEvent: pickEvent, trophyCount: trophyCount, trophyProgress: trophyProgress,
    checkTrophies: checkTrophies, nextGoals: nextGoals, fameFor: fameFor, fameAvailable: fameAvailable, canTour: canTour,
    fameNextAt: fameNextAt, fameUnlockAt: fameUnlockAt, fameAt: fameAt, tour: tour,
    ROLES: ROLES, ROLE_BY: ROLE_BY, teamOpen: teamOpen, teamCap: teamCap, staffXpNeed: staffXpNeed, roleFits: roleFits, staffFx: staffFx, memberFx: memberFx,
    incomeRef: incomeRef, payroll: payroll, refreshPool: refreshPool, poolRefreshCost: poolRefreshCost, buyRefresh: buyRefresh, signCost: signCost,
    hire: hire, fire: fire, assign: assign, trainCost: trainCost, train: train, bonusCost: bonusCost, giveBonus: giveBonus, sendRest: sendRest,
    findMember: findMember, working: working, setRandom: function (f) { rand = f || Math.random; },
    baseQuality: baseQuality, canMix: canMix, startMix: startMix, cancelMix: cancelMix, finishMix: finishMix, mixStars: mixStars,
    ordersOpen: ordersOpen, makeOrder: makeOrder, acceptOrder: acceptOrder, declineOrder: declineOrder, tickOrders: tickOrders,
    chartsOpen: chartsOpen, chartTop: chartTop, rankCharts: rankCharts, release: release, canFreeRelease: canFreeRelease, promoCost: promoCost,
    chartPay: chartPay, weekEnd: weekEnd, tickCharts: tickCharts, tickLive: tickLive, potential: potential,
    RESEARCH: RESEARCH, RD_BY: RD_BY, SPEC_BY: SPEC_BY, rdFx: rdFx, researchCost: researchCost, canResearch: canResearch, research: research,
    specOpen: specOpen, chooseSpec: chooseSpec, rdCount: rdCount, rdRate: rdRate, orderMax: orderMax, branchNodes: branchNodes, addRp: addRp,
    PROJECTS: PJ, PJ_G: PJ_G, PJ_M: PJ_M, PJ_P: PJ_P, PJ_F: PJ_F, projOpen: projOpen, genreOpen: genreOpen, formatOpen: formatOpen, projCost: projCost,
    projTime: projTime, phaseFit: phaseFit, projBusy: projBusy, startProject: startProject, cancelProject: cancelProject, tickProject: tickProject,
    finishProject: finishProject, dismissProject: dismissProject, comboGrade: comboGrade, pubGrade: pubGrade,
    TROPHY_LEVELS: TLV, trophyTotal: trophyTotal, trophyLevel: trophyLevel, levelName: levelName, choiceInfo: choiceInfo,
    BATTLE: BT, DECO: DECO, decoOpt: decoOpt, decoUnlocked: decoUnlocked, decoProgress: decoProgress, setDeco: setDeco, decoNew: decoNew, seeDeco: seeDeco,
    trendFor: trendFor, trendAct: trendAct, makeTrend: makeTrend, RULES: RULES, pianoOpen: pianoOpen, pianoReward: pianoReward, finishPiano: finishPiano, battleOpen: battleOpen, tickBattle: tickBattle, declineBattle: declineBattle, battlePattern: battlePattern, startBattle: startBattle, finishBattle: finishBattle
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Game;
  root.Game = Game;
})(typeof window !== 'undefined' ? window : globalThis);
