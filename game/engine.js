/* Premier Mix: moteur de jeu (données + logique pure, sans DOM). */
(function (root) {
  'use strict';

  var ROY = 0.0008;          // royalties par seconde et par titre, en fraction du gain de base
  var OFFLINE_CAP = 6 * 3600; // secondes d'absence prises en compte
  var OFFLINE_EFF = 0.5;      // rendement hors ligne
  var TAP = 0.4;              // secondes gagnées par clic sur une production en cours
  var MILESTONES = [10, 25, 50, 100, 200];
  var PERKS = null, TUBE = 10;

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
  var ARTISTS = D.ARTISTS || [], ART_BY = {}, RIVAL_LABELS = D.RIVAL_LABELS || ['Label rival'];
  var WORLD = D.WORLD || { countries: [{ id: 'fr', name: 'France', cities: ['Paris'] }], dates: [], pick: 0, fameDate: 0, fameSlam: 0, souvenir: 0, grow: 0 };
  var LTOUR = D.LTOUR || { sizes: [], transports: [], sets: [], incidents: [], cash: 0.6, rest: 600, incChance: 0, incLife: 300 };
  var COUNTRY_BY = {}, WDATE_BY = {}, LT_SIZE = {}, LT_TR = {}, LT_SET = {}, LT_INC = {};
  WORLD.countries.forEach(function (c) { COUNTRY_BY[c.id] = c; }); WORLD.dates.forEach(function (x) { WDATE_BY[x.id] = x; });
  LTOUR.sizes.forEach(function (x) { LT_SIZE[x.id] = x; }); LTOUR.transports.forEach(function (x) { LT_TR[x.id] = x; }); LTOUR.sets.forEach(function (x) { LT_SET[x.id] = x; }); LTOUR.incidents.forEach(function (x) { LT_INC[x.id] = x; });
  ARTISTS.forEach(function (a) { ART_BY[a.id] = a; });
  var VENUES = D.VENUES || [{ id: 'bar', name: 'Bar', fame: 0, mult: 1 }], GENRE_BPM = D.GENRE_BPM || {}, STORIES = D.STORIES || [], STORY_BY = {};
  STORIES.forEach(function (s) { STORY_BY[s.id] = s; });
  var TLV = D.TROPHY_LEVELS || ['Bronze', 'Argent', 'Or', 'Platine', 'Diamant', 'Légende'];
  var BT = D.BATTLE || { leagues: [{ name: 'Quartier', bpm: 90, target: 0.5, dens: 0 }], lanes: [], rivals: ['Rival'] };
  PERKS = D.PERKS || MILESTONES.map(function (l) { return { lvl: l, id: 'p' + l, name: 'Palier', gain: 2, desc: 'Gains ×2' }; }); TUBE = D.TUBE || 10;
  var CAL = D.CAL || { day: 180 / 7, tourDays: 14, tourPerDate: 7, awayDays: 3, months: ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'], weekdays: ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'],
    climate: { fr: { t: [12.5, 8, 200], vary: 4, snow: 0.6, sw: 0.84, ph: 0, hemi: 1, zone: 'tempere', rain: [0.3, 0.3, 0.3, 0.3, 0.3, 0.25, 0.2, 0.2, 0.25, 0.3, 0.35, 0.35], trees: ['platane'], flowers: [0xe85a7a], style: 'fr' } },
    fests: [], out: { mail: { every: 300, x: 0.6, lvl: 2 }, tree: { cd: 150, xp: 0.03 }, cat: { cd: 240, morale: 4, x: 0.15 }, snowman: { snow: 0.45, steps: 3, boost: 1.5, s: 90 } }, mail: ['« Merci ! »'] };
  var PIANO = D.PIANO || { songs: [{ id: 'gamme', name: 'Gamme', notes: [60, 62, 64, 65, 67, 69, 71, 72] }], min: 10 };

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
      boost: { m: 1, left: 0, t: 0 }, contacts: {}, trophies: {}, fame: 0, fameX: 0, tours: 0, ev: { cd: T.eventFirst, seen: {}, pending: null, hold: false, won: 0 },
      team: newTeam(), masters: [], mixes: 0, perfect: 0, orders: newOrders(), charts: newCharts(), rd: newRd(), proj: newProj(), battle: newBattle(), piano: { best: 0, cd: 0, plays: 0 }, deco: newDeco(), label: newLabel(), world: newWorld(0), cal: newCal() };
  }
  function newCal() { return { v: 2, d: 0, ad: 0, mail: 0, cd: { tree: 0, cat: 0 }, sm: 0, smW: -1, fest: '', hint: 0 }; }
  function newProj() { return { cur: null, book: { c: {}, p: {}, h: {} }, hist: [], done: 0, best: 0, last: null }; }
  function newLabel() { return { roster: [], albums: 0, concerts: 0, bestVenue: 0, kept: 0, ocd: T.offerFirst, gone: [], disco: [], ltours: 0, cities: {} }; }
  function newWorld(tours) { return { home: 'fr', done: {}, base: null, rec: { piano: 0, proj: 0 }, souv: {}, homes: ['fr'], picks: pickDates(tours || 0) }; }
  function cleanDisc(x) { return { a: ART_BY[x && x.a] ? x.a : null, t: String((x && x.t) || 'Album').slice(0, 40), avg: Math.max(0, Math.min(10, num(x && x.avg, 0))), pos: Math.max(0, Math.floor(num(x && x.pos, 0))), g: PJ_G[x && x.g] ? x.g : null, w: Math.max(0, Math.floor(num(x && x.w, 0))) }; }
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
    S.fameX = Math.max(0, Math.min(S.fame, Math.floor(num(o.fameX, 0))));
    if (o.owned && typeof o.owned === 'object') {
      Object.keys(o.owned).forEach(function (k) { if (ITEM_BY[k] && o.owned[k]) S.owned[k] = 1; });
    }
    ACTS.forEach(function (a) {
      var s = o.acts && o.acts[a.id];
      if (!s) return;
      var mx = s.mix && typeof s.mix === 'object' ? { m: Math.max(1, Math.min(1 + T.mixMax, num(s.mix.m, 1))), q: Math.max(1, Math.min(5, Math.floor(num(s.mix.q, 1)))), x: Math.max(0, Math.min(T.mixXp, num(s.mix.x, 0))) } : null;
      S.acts[a.id] = { lvl: Math.max(0, Math.floor(num(s.lvl, 0))), auto: !!s.auto, prog: Math.max(0, num(s.prog, 0)),
        run: !!s.run, done: Math.max(0, num(s.done, 0)), hold: false, mix: mx, tubes: Math.max(0, Math.floor(num(s.tubes, 0))) };
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
    if (o.label && typeof o.label === 'object') {
      S.label.albums = Math.max(0, Math.floor(num(o.label.albums, 0)));
      S.label.concerts = Math.max(0, Math.floor(num(o.label.concerts, 0))); S.label.bestVenue = Math.max(0, Math.min(VENUES.length, Math.floor(num(o.label.bestVenue, 0))));
      S.label.ltours = Math.max(0, Math.floor(num(o.label.ltours, 0)));
      if (o.label.cities && typeof o.label.cities === 'object') Object.keys(o.label.cities).slice(0, 200).forEach(function (k) { if (/^[a-z]{2}:/.test(k)) S.label.cities[k.slice(0, 40)] = 1; });
      S.label.kept = Math.max(0, Math.floor(num(o.label.kept, 0))); S.label.ocd = Math.max(0, Math.min(T.offerEvery, num(o.label.ocd, T.offerFirst)));
      (Array.isArray(o.label.gone) ? o.label.gone : []).forEach(function (g) { if (g && ART_BY[g.id] && !S.label.gone.some(function (x) { return x.id === g.id; })) S.label.gone.push({ id: g.id, lab: String(g.lab || RIVAL_LABELS[0]).slice(0, 30), left: Math.max(0, Math.min(T.goneFor, num(g.left, T.goneFor))) }); });
      var hadDisc = Array.isArray(o.label.disco);
      if (hadDisc) S.label.disco = o.label.disco.slice(0, 80).map(cleanDisc);
      (Array.isArray(o.label.roster) ? o.label.roster : []).forEach(function (r) {
        if (!r || !ART_BY[r.id] || S.label.roster.some(function (x) { return x.id === r.id; }) || S.label.roster.length >= 8) return;
        var ask = r.ask && typeof r.ask === 'object' ? { left: Math.max(0, Math.min(T.askLife, num(r.ask.left, T.askLife))) } : null;
        S.label.roster.push({ id: r.id, fame: Math.max(0, Math.min(100, num(r.fame, 5))), mood: Math.max(0, Math.min(100, num(r.mood, 60))),
          albums: Math.max(0, Math.floor(num(r.albums, 0))), cd: Math.max(0, num(r.cd, T.askEvery)), ask: ask,
          disco: (Array.isArray(r.disco) ? r.disco : []).slice(0, 10).map(function (x) { return { t: String((x && x.t) || 'Album').slice(0, 40), avg: Math.max(0, Math.min(10, num(x && x.avg, 0))), pos: Math.max(0, Math.floor(num(x && x.pos, 0))) }; }),
          ccd: Math.max(0, Math.min(T.concertEvery, num(r.ccd, 0))), scd: Math.max(0, num(r.scd, T.storyFirst)),
          story: r.story && STORY_BY[r.story.id] ? { id: r.story.id, left: Math.max(0, Math.min(T.storyLife, num(r.story.left, T.storyLife))), other: ART_BY[r.story.other] ? r.story.other : null, genre: PJ_G[r.story.genre] ? r.story.genre : null } : null,
          style: PJ_G[r.style] ? r.style : null, duo: ART_BY[r.duo] ? r.duo : null,
          offer: r.offer && typeof r.offer === 'object' ? { lab: String(r.offer.lab || RIVAL_LABELS[0]).slice(0, 30), left: Math.max(0, Math.min(T.offerLife, num(r.offer.left, T.offerLife))) } : null,
          tour: cleanLtour(r.tour), tcd: Math.max(0, Math.min(LTOUR.rest, num(r.tcd, 0))), tours: Math.max(0, Math.floor(num(r.tours, 0))), tourLast: cleanLast(r.tourLast) });
      });
      S.label.gone = S.label.gone.filter(function (g) { return !artistOf(S, g.id); });
      // anciennes sauvegardes: la discographie se reconstruit à partir des derniers albums de chaque artiste
      if (!hadDisc) S.label.roster.forEach(function (r) { r.disco.forEach(function (x) { S.label.disco.push(cleanDisc({ a: r.id, t: x.t, avg: x.avg, pos: x.pos })); }); });
    }
    S.world = newWorld(S.tours);
    if (o.world && typeof o.world === 'object') {
      var w = o.world, W = S.world;
      if (COUNTRY_BY[w.home]) W.home = w.home;
      if (Array.isArray(w.homes)) W.homes = w.homes.filter(function (k, i, a) { return COUNTRY_BY[k] && a.indexOf(k) === i; }).slice(0, 20);
      if (W.homes.indexOf(W.home) < 0) W.homes.push(W.home);
      if (w.done && typeof w.done === 'object') Object.keys(w.done).forEach(function (k) { if (WDATE_BY[k] && w.done[k]) W.done[k] = 1; });
      if (w.souv && typeof w.souv === 'object') Object.keys(w.souv).forEach(function (k) { if (WDATE_BY[k] && w.souv[k]) W.souv[k] = Math.max(1, Math.floor(num(w.souv[k], 1))); });
      if (w.rec && typeof w.rec === 'object') { W.rec.piano = Math.max(0, Math.floor(num(w.rec.piano, 0))); W.rec.proj = Math.max(0, Math.min(10, num(w.rec.proj, 0))); }
      if (Array.isArray(w.picks)) { var pk = w.picks.filter(function (k) { return WDATE_BY[k]; }); if (pk.length) W.picks = pk.slice(0, WORLD.dates.length); }
      if (w.base && typeof w.base === 'object') { W.base = {}; WBASE.forEach(function (k) { W.base[k] = Math.max(0, num(w.base[k], 0)); }); }
    }
    if (o.deco && typeof o.deco === 'object') {
      DECO.slots.forEach(function (s) { if (DECO_BY[s.id][o.deco[s.id]]) S.deco[s.id] = o.deco[s.id]; });
      if (o.deco.seen && typeof o.deco.seen === 'object') Object.keys(o.deco.seen).forEach(function (k) { var p = k.split(':'); if (DECO_BY[p[0]] && DECO_BY[p[0]][p[1]]) S.deco.seen[k] = 1; });
    }
    if (o.piano && typeof o.piano === 'object') {
      S.piano.best = Math.max(0, Math.min(999, Math.floor(num(o.piano.best, 0)))); S.piano.plays = Math.max(0, Math.floor(num(o.piano.plays, 0)));
      S.piano.cd = Math.max(0, Math.min(T.pianoEvery, num(o.piano.cd, 0)));
    }
    if (o.battle && typeof o.battle === 'object') {
      var b = o.battle, B = S.battle, L = BT.leagues.length;
      B.league = Math.max(1, Math.min(L, Math.floor(num(b.league, 1)))); B.pts = Math.max(0, Math.min(T.battleUp - 1, Math.floor(num(b.pts, 0))));
      B.wins = Math.max(0, Math.floor(num(b.wins, 0))); B.losses = Math.max(0, Math.floor(num(b.losses, 0))); B.best = Math.max(0, Math.floor(num(b.best, 0)));
      B.cd = Math.max(0, num(b.cd, T.battleFirst));
      var r = b.rival;
      if (r && typeof r === 'object') B.rival = { name: String(r.name || 'Rival').slice(0, 30), league: Math.max(1, Math.min(L, Math.floor(num(r.league, B.league)))),
        target: Math.max(0.3, Math.min(0.95, num(r.target, 0.5))), seed: Math.floor(num(r.seed, 1)) >>> 0, rule: RULES.indexOf(r.rule) >= 0 ? r.rule : null, kind: r.kind === 'piano' ? 'piano' : 'drums' };
    }
    if (o.cal && typeof o.cal === 'object') {
      var cl = o.cal, K = S.cal;
      K.d = Math.max(0, Math.min(3650000, num(cl.d, 0))); K.mail = Math.max(0, Math.min(1, num(cl.mail, 0)));
      K.cd = { tree: Math.max(0, num(cl.cd && cl.cd.tree, 0)), cat: Math.max(0, num(cl.cd && cl.cd.cat, 0)) };
      K.sm = Math.max(0, Math.min(CAL.out.snowman.steps, Math.floor(num(cl.sm, 0)))); K.smW = Math.floor(num(cl.smW, -1)); K.fest = String(cl.fest || '').slice(0, 60); K.hint = cl.hint ? 1 : 0; K.ad = Math.max(0, Math.min(CAL.awayDays || 3, num(cl.ad, 0)));
      if (cl.letter && typeof cl.letter === 'object' && typeof cl.letter.t === 'string') K.letter = { t: cl.letter.t.slice(0, 300), f: String(cl.letter.f || '').slice(0, 80), v: Math.max(0, num(cl.letter.v, 0)), d: Math.max(0, Math.floor(num(cl.letter.d, 0))) };
      // parties créées avant le plafond d'absence: la date ne dépasse pas le nombre de jours réels depuis le premier lancement
      if (!(cl.v >= 2)) K.d = Math.min(K.d, Math.max(0, ((now || Date.now()) - S.created) / 864e5));
    } else if (o.charts && typeof o.charts === 'object') {
      // anciennes sauvegardes: le temps écoulé se déduit des semaines du Top 50 déjà passées
      S.cal.d = Math.min(Math.max(0, (S.charts.week - 1) * 7 + (T.weekLen - S.charts.left) / CAL.day), Math.max(0, ((now || Date.now()) - S.created) / 864e5));
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
      if (m.pj && typeof m.pj === 'object' && PJ_G[m.pj.g] && PJ_F[m.pj.f]) e.pj = { g: m.pj.g, f: m.pj.f, sales: Math.max(0, num(m.pj.sales, 0)), sold: Math.max(0, num(m.pj.sold, 0)), w: Math.max(0, Math.floor(num(m.pj.w, 0))), avg: Math.max(0, Math.min(10, num(m.pj.avg, 0))), ar: ART_BY[m.pj.ar] ? m.pj.ar : null };
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
    g.gain *= 1 + WORLD.souvenir * souvenirs(S);
    g.xp *= 1 + T.fameXp * (S.fame || 0);
    g.gain *= labelMult(S);
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

  // Effets cumulés des paliers de maîtrise atteints à ce rang.
  var PFX = {};
  function perkFx(lvl) {
    var k = 0; while (k < PERKS.length && lvl >= PERKS[k].lvl) k++;
    if (PFX[k]) return PFX[k];
    var f = { gain: 1, speed: 1, tube: 0, roy: 1, syn: 0, n: k };
    for (var i = 0; i < k; i++) { var p = PERKS[i]; if (p.gain) f.gain *= p.gain; if (p.speed) f.speed *= p.speed; if (p.tube) f.tube = Math.max(f.tube, p.tube); if (p.roy) f.roy *= p.roy; if (p.syn) f.syn += p.syn; }
    return (PFX[k] = f);
  }
  function milestoneMult(lvl) { return perkFx(lvl).gain; }
  function nextPerk(lvl) { for (var i = 0; i < PERKS.length; i++) if (lvl < PERKS[i].lvl) return PERKS[i]; return null; }
  function perksBetween(from, to) { return PERKS.filter(function (p) { return p.lvl > from && p.lvl <= to; }); }
  function nextMilestone(lvl) { var p = nextPerk(lvl); return p ? p.lvl : null; }
  // Synergie: chaque production au palier Locomotive donne un bonus de gains à toutes les autres.
  function synergy(S) { var s = 0; ACTS.forEach(function (a) { var x = S.acts[a.id]; if (x) s += perkFx(x.lvl).syn; }); return 1 + s; }
  function tubeChance(S, act) { return perkFx(S.acts[act.id].lvl).tube; }

  function duration(S, act) { return act.dur / stats(S).g.speed / staffFx(S, act.id).sp / perkFx(S.acts[act.id].lvl).speed; }
  function payout(S, act) {
    var a = S.acts[act.id], st = stats(S);
    return act.pay * (1 + T.upGain * a.lvl) * milestoneMult(a.lvl) * synergy(S) * st.g.gain * (st.g.act[act.id] || 1) * st.vm * levelMult(S) * boostMult(S) * staffFx(S, act.id).gn * trendAct(S, act.id) * festMult(S);
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
      if (t > 0) r += Math.pow(t, T.trackExp) * a.pay * ROY * perkFx(S.acts[a.id].lvl).roy;
    });
    return r * st.g.roy * st.vm * levelMult(S) * boostMult(S) * festMult(S);
  }
  function activeRate(S) {
    var r = 0;
    ACTS.forEach(function (a) {
      var s = S.acts[a.id];
      if (s.auto && isUnlocked(S, a)) r += payout(S, a) * (1 + tubeChance(S, a) * (TUBE - 1)) / duration(S, a);
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
    var a = S.acts[act.id], unit = payout(S, act), p = unit * n, x = xpGain(S, act) * n, mixed = a.mix, tc = tubeChance(S, act), hits = 0;
    if (mixed) { a.mix = null; p += unit * (mixed.m - 1); x += xpGain(S, act) * mixed.x; }
    // tubes: une production sur quelques-unes rapporte ×TUBE (tirage individuel, ou moyenne sur un grand lot)
    if (tc > 0) {
      if (n <= 40) { for (var k = 0; k < n; k++) if (rand() < tc) hits++; }
      else hits = Math.round(n * tc * (0.9 + rand() * 0.2));
      p += unit * (TUBE - 1) * hits;
    }
    S.money += p; S.lifetime += p;
    S.tracks[act.id] = (S.tracks[act.id] || 0) + n;
    a.done += n;
    addXp(S, x);
    var qb = baseQuality(S, act.id), rf = rdFx(S);
    if (rf.autoQ4 && a.auto && rand() < rf.autoQ4) qb = Math.max(qb, 4);
    orderProgress(S, act.id, n, qb, mixed ? mixed.q : null);
    addRp(S, n * (ACTS.indexOf(act) + 1) * T.rpPer);
    if (hits) a.tubes = (a.tubes || 0) + hits;
    if (hooks.complete) hooks.complete(act, n, p, mixed, hits);
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
    // tournées locales: en temps réel, même absent (S._off: secondes réelles par seconde simulée)
    tickLtours(S, dt * (S._off || 1));
    tickCal(S, dt * (S._off || 1));
    checkWorld(S);
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
    var b = boostMult(S) * festMult(S), a = bestAct(S);
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
      var m0 = m.morale, floor = 0;
      if (S._off && m.train <= 0 && m.rest <= 0) {
        // joueur absent: l'équipe souffle, son moral remonte (S._off: secondes réelles par seconde simulée)
        m.morale = Math.min(100, m.morale + dt * S._off * 100 / (T.awayRest || 10800));
      } else if (m.train > 0) {
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
      if (unpaid && !S._off) m.morale -= T.moraleUnpaid * dt;
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
  function weekEnd(S, k) {
    k = k == null ? 1 : k;
    var c = S.charts, pay = 0, entries = [];
    rankCharts(S, false);
    c.mine.forEach(function (m) {
      if (m.pos > T.chartSize) return;
      var g = chartPay(S, m.pos) * k;
      if (m.pj && m.pj.w < PJ.sales.length) { var sl = m.pj.sales * PJ.sales[m.pj.w] * k; m.pj.w++; m.pj.sold += sl; g += sl; }
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
  // Absence: les semaines du Top 50 continuent de passer et tes titres classés rapportent (k: rendement). Renvoie les gains.
  function chartsAway(S, dt, k) {
    if (!chartsOpen(S) || dt <= 0) return 0;
    var c = S.charts, got = 0, n = 0;
    if (!c.rivals.length) initRivals(S);
    c.left -= dt;
    while (c.left <= 0 && n < 400) { got += weekEnd(S, k).pay; n++; }
    if (c.left <= 0) c.left = T.weekLen;
    return got;
  }
  function tickLive(S, dt) { tickOrders(S, dt); tickCharts(S, dt); tickProject(S, dt); tickBattle(S, dt); tickLabel(S, dt); if (S.piano.cd > 0) S.piano.cd = Math.max(0, S.piano.cd - dt); }


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
    var art = c && c.artist ? artistOf(S, c.artist) : null;
    if (c && c.artist && !art) return null;
    if (!c || typeof c !== 'object' || !(genreOpen(S, c.genre) || (art && (ART_BY[art.id].genre === c.genre || art.style === c.genre))) || !PJ_M[c.mood] || !PJ_P[c.pub] || !formatOpen(S, c.fmt)) return null;
    var sl = [0, 1, 2].map(function (i) { return Math.max(0, Math.min(100, Math.round(num(c.sl && c.sl[i], 50)))); });
    var team = [0, 1, 2].map(function (i) { var id = c.team && c.team[i]; return id && findMember(S, id) ? id : null; });
    var title = String(c.title || '').replace(/\s+/g, ' ').trim().slice(0, 40) || songTitle();
    return { title: title, genre: c.genre, mood: c.mood, pub: c.pub, fmt: c.fmt, sl: sl, team: team, artist: art ? art.id : null };
  }
  function startProject(S, cfg) {
    if (!projOpen(S) || S.proj.cur) return null;
    var c = cleanCfg(S, cfg);
    if (!c) return null;
    if (c.artist) { var ra = artistOf(S, c.artist); if (ra && ra.tour) return null; }
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
      studio: Math.min(1, 0.25 * tierIndex(S)) + crea, fresh: same ? -1.5 : again ? -0.5 : 0, trend: (c.tg ? T.trendGenre : 0) + (c.tm ? T.trendMood : 0), artist: artistParts(S, c) };
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
    if (S.world) S.world.rec.proj = Math.max(S.world.rec.proj, avg);
    // sortie dans le Top 50 et ventes réparties sur les semaines de classement
    var ar = c.artist ? artistOf(S, c.artist) : null, af = ar ? ar.fame : 0;
    var sales = c.cost * (0.15 + 0.02 * avg * avg) * f.roi * (c.tg ? T.trendSales : 1) * (1 + af / 100);
    var c2 = S.charts; if (!c2.rivals.length) initRivals(S);
    var e = { id: c2.nextId++, t: c.title, act: bestAct(S).id, q: Math.max(1, Math.min(5, Math.round(avg / 2))),
      s: potential(S) * (0.25 + 0.18 * avg) * f.chart * (1 + S.orders.rep / 200) * rdFx(S).chartScore * (1 + af / 250),
      weeks: 0, pos: 0, p: 0, best: 0, promo: false, earned: 0, pj: { g: c.genre, f: c.fmt, sales: sales, sold: 0, w: 0, avg: avg, ar: ar ? ar.id : null } };
    c2.mine.push(e); c2.releases++;
    rankCharts(S, false); e.p = 0;
    var inChart = e.pos <= T.chartSize;
    if (!inChart) c2.mine = c2.mine.filter(function (x) { return x !== e; });
    addXp(S, xpGain(S, bestAct(S)) * T.projXp * f.time * (0.5 + avg / 10));
    addRp(S, T.rpProj * avg * f.time);
    if (avg >= 8) S.orders.rep = Math.min(T.repMax, S.orders.rep + Math.round(avg - 6));
    var res = { title: c.title, genre: c.genre, mood: c.mood, pub: c.pub, fmt: c.fmt, sl: c.sl.slice(), avg: avg, notes: notes, combo: r.combo, pubG: r.pubG,
      acc: Math.round(r.acc * 100), fit: Math.round(r.fit * 100), fresh: r.parts.fresh, pos: inChart ? e.pos : 0, sales: sales, cost: c.cost, tg: !!c.tg, tm: !!c.tm };
    if (ar) res.artist = albumDone(S, ar, c, avg, inChart ? e.pos : 0);
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
      if (l.artist && typeof l.artist === 'object' && ART_BY[l.artist.id]) P.last.artist = { id: l.artist.id, fame: num(l.artist.fame, 0), dFame: num(l.artist.dFame, 0), dMood: num(l.artist.dMood, 0), mood: num(l.artist.mood, 50), ask: !!l.artist.ask, match: !!l.artist.match, likes: !!l.artist.likes, duo: ART_BY[l.artist.duo] ? l.artist.duo : null, style: !!l.artist.style };
    }
    var c = o.cur;
    if (c && typeof c === 'object' && PJ_G[c.genre] && PJ_M[c.mood] && PJ_P[c.pub] && PJ_F[c.fmt]) {
      var ids = {}; S.team.staff.forEach(function (m) { ids[m.id] = 1; });
      var ph = Math.max(0, Math.min(PJ.phases.length - 1, Math.floor(num(c.phase, 0))));
      P.cur = { title: String(c.title || 'Projet').slice(0, 40), genre: c.genre, mood: c.mood, pub: c.pub, fmt: c.fmt,
        sl: [0, 1, 2].map(function (i) { return Math.max(0, Math.min(100, Math.round(num(c.sl && c.sl[i], 50)))); }),
        team: [0, 1, 2].map(function (i) { var id = c.team && c.team[i]; return id && ids[id] ? id : null; }),
        cost: Math.max(0, num(c.cost, 0)), phase: ph, t: Math.max(0, Math.min(projTime(c.fmt, ph), num(c.t, 0))), tg: !!c.tg, tm: !!c.tm, artist: ART_BY[c.artist] ? c.artist : null,
        fit: [0, 1, 2].slice(0, ph).map(function (i) { return Math.max(0, Math.min(1, num(c.fit && c.fit[i], 0.35))); }) };
    }
  }
  function dismissProject(S) { if (S.proj) S.proj.last = null; }




  // ---------- Label: artistes signés ----------
  function labelOpen(S) { return S.level >= T.labelLevel && projOpen(S); }
  function labelCap(S) { return 1 + Math.floor(tierIndex(S) / 2); }
  function artistOf(S, id) { var r = S.label && S.label.roster; if (!r) return null; for (var i = 0; i < r.length; i++) if (r[i].id === id) return r[i]; return null; }
  function labelMult(S) { var f = 0; ((S.label && S.label.roster) || []).forEach(function (a) { f += a.fame; }); return 1 + T.labelFame * f; }
  // Artiste disponible à la signature: rencontré en sortie, ou repéré quand le studio atteint son lieu.
  function artistAvailable(S, a) {
    if (artistOf(S, a.id) || goneOf(S, a.id)) return false;
    return a.contact ? !!S.contacts[a.contact] : tierIndex(S) >= (a.tier || 0);
  }
  function goneOf(S, id) { var g = S.label && S.label.gone; if (!g) return null; for (var i = 0; i < g.length; i++) if (g[i].id === id) return g[i]; return null; }
  function artistCost(S) { return incomeRef(S) * T.artistSignSec * (1 + 0.5 * S.label.roster.length); }
  function signArtist(S, id) {
    var a = ART_BY[id];
    if (!labelOpen(S) || !a || !artistAvailable(S, a) || S.label.roster.length >= labelCap(S)) return null;
    var cost = artistCost(S);
    if (S.money < cost) return null;
    S.money -= cost;
    var r = { id: id, fame: a.contact ? 12 : 5, mood: 65, albums: 0, cd: T.askFirst, ask: null, disco: [], ccd: 0, scd: T.storyFirst, story: null, style: null, duo: null, offer: null, tour: null, tcd: 0, tours: 0, tourLast: null };
    S.label.roster.push(r); touch(S);
    checkTrophies(S);
    if (hooks.artistSign) hooks.artistSign(a, r);
    return r;
  }
  function offerTarget(S) {
    var ok = S.label.roster.filter(function (r) { return !r.offer && !r.tour && r.fame >= T.offerFame && !(S.proj.cur && S.proj.cur.artist === r.id); });
    if (!ok.length) return null;
    var tot = 0; ok.forEach(function (r) { tot += r.fame; });
    var x = rand() * tot; for (var i = 0; i < ok.length; i++) { x -= ok[i].fame; if (x <= 0) return ok[i]; }
    return ok[ok.length - 1];
  }
  function tickLabel(S, dt) {
    if (!labelOpen(S)) return;
    var L = S.label;
    L.gone = L.gone.filter(function (g) { g.left -= dt; return g.left > 0; });
    // offre sans réponse: l'artiste décide seul, selon son humeur
    L.roster.slice().forEach(function (r) {
      if (!r.offer) return;
      r.offer.left -= dt;
      if (r.offer.left <= 0) { var res = resolveOffer(S, r.id, 'trust'); if (res && hooks.offerAuto) hooks.offerAuto(res); }
    });
    // un label rival tente de débaucher un artiste connu
    if (!L.roster.some(function (r) { return r.offer; })) {
      if (L.roster.some(function (r) { return r.fame >= T.offerFame; })) L.ocd -= dt;
      if (L.ocd <= 0) {
        var tg = offerTarget(S);
        if (tg) { tg.offer = { lab: RIVAL_LABELS[Math.floor(rand() * RIVAL_LABELS.length)], left: T.offerLife }; if (hooks.artistOffer) hooks.artistOffer(ART_BY[tg.id], tg); }
        L.ocd = T.offerEvery;
      }
    }
    S.label.roster.forEach(function (r) {
      var a = ART_BY[r.id];
      if (r.ccd > 0) r.ccd = Math.max(0, r.ccd - dt);
      if (r.tour) return; // en tournée: pas de demande ni d'histoire
      if (r.story) { r.story.left -= dt; if (r.story.left <= 0) { r.story = null; r.scd = T.storyEvery; r.mood = Math.max(0, r.mood - 3); } }
      else if (!r.ask) { r.scd -= dt; if (r.scd <= 0) { r.story = makeStory(S, r); r.scd = T.storyEvery; if (r.story && hooks.artistStory) hooks.artistStory(a, r); } }
      if (r.ask) {
        if (S.proj.cur && S.proj.cur.artist === r.id) return; // l'album est en cours: la demande attend
        r.ask.left -= dt;
        if (r.ask.left <= 0) { r.ask = null; r.cd = T.askEvery; r.mood = Math.max(0, r.mood - 8); if (hooks.artistIgnored) hooks.artistIgnored(a, r); }
        return;
      }
      r.cd -= dt;
      if (r.cd <= 0) { r.ask = { left: T.askLife }; r.cd = 0; if (hooks.artistAsk) hooks.artistAsk(a, r); }
    });
  }
  // ---------- Label: offres des labels rivaux ----------
  function keepChance(r) { return Math.max(0.1, Math.min(0.95, 0.1 + r.mood / 100 * 0.85)); }
  function retainCost(S, r) { return eventRef(S) * (1 + r.fame / 25); }
  function transferFee(S, r) { return eventRef(S) * (0.6 + r.fame / 25); }
  // choice: 'pay' (prime de fidélité, l'artiste reste), 'trust' (pari sur son humeur), 'release' (indemnité de transfert)
  function resolveOffer(S, id, choice, rnd) {
    var r = artistOf(S, id), of = r && r.offer;
    if (!of) return null;
    var out = { id: id, lab: of.lab, choice: choice, kept: true, cost: 0, fee: 0, chance: keepChance(r) };
    if (choice === 'pay') {
      var cost = retainCost(S, r);
      if (S.money < cost) return null;
      S.money -= cost; out.cost = cost; r.mood = Math.min(100, r.mood + 10);
    } else if (choice === 'trust') {
      out.kept = (rnd || rand)() < out.chance;
      if (out.kept) r.mood = Math.min(100, r.mood + 5);
    } else if (choice === 'release') out.kept = false;
    else return null;
    r.offer = null;
    if (out.kept) { S.label.kept++; out.mood = r.mood; }
    else {
      out.fee = transferFee(S, r); S.money += out.fee; S.lifetime += out.fee;
      S.label.roster = S.label.roster.filter(function (x) { return x !== r; });
      S.label.roster.forEach(function (x) { if (x.duo === id) x.duo = null; if (x.story && x.story.other === id) { x.story = null; x.scd = T.storyEvery; } });
      S.label.gone.push({ id: id, lab: of.lab, left: T.goneFor });
    }
    touch(S); checkTrophies(S);
    if (hooks.offerDone) hooks.offerDone(out);
    return out;
  }
  // Discographie complète du label, du plus récent au plus ancien.
  function discography(S) {
    var L = S.label, list = L.disco, best = null, top10 = 0, n1 = 0;
    list.forEach(function (x) { if (!best || x.avg > best.avg) best = x; if (x.pos && x.pos <= 10) top10++; if (x.pos === 1) n1++; });
    return { list: list, count: L.albums, best: best, top10: top10, n1: n1 };
  }

  // Effet de l'artiste sur la note: son genre, ses ambiances préférées et son humeur.
  function artistParts(S, c) {
    var r = c.artist ? artistOf(S, c.artist) : null;
    if (!r) return 0;
    var a = ART_BY[r.id];
    return (c.genre === a.genre || c.genre === r.style ? 0.8 : -0.6) + (a.likes.indexOf(c.mood) >= 0 ? 0.4 : 0) + (r.mood - 50) / 100 + (r.duo && artistOf(S, r.duo) ? 0.7 : 0);
  }
  function albumDone(S, r, c, avg, pos) {
    var a = ART_BY[r.id], match = c.genre === a.genre || c.genre === r.style, likes = a.likes.indexOf(c.mood) >= 0, asked = !!r.ask;
    var duo = r.duo && artistOf(S, r.duo), style = !!r.style && c.genre === r.style;
    if (style) r.style = null;
    if (duo) { duo.fame = Math.min(100, duo.fame + 4); duo.mood = Math.min(100, duo.mood + 6); r.duo = null; }
    var dFame = Math.max(-5, Math.min(18, Math.round(avg * 2.2 - 8 + (pos && pos <= 10 ? 4 : 0))));
    var dMood = (avg >= 7 ? 12 : avg >= 5 ? 2 : -12) + (match ? 6 : -16) + (likes ? 5 : 0) + (asked ? 8 : 0);
    var f0 = r.fame, m0 = r.mood;
    r.fame = Math.max(0, Math.min(100, r.fame + dFame)); r.mood = Math.max(0, Math.min(100, r.mood + dMood));
    r.albums++; S.label.albums++;
    r.disco.unshift({ t: c.title, avg: avg, pos: pos }); r.disco = r.disco.slice(0, 10);
    S.label.disco.unshift({ a: r.id, t: c.title, avg: avg, pos: pos, g: c.genre, w: S.charts ? S.charts.week : 0 }); S.label.disco = S.label.disco.slice(0, 80);
    if (asked) { r.ask = null; r.cd = T.askEvery; }
    touch(S);
    return { id: r.id, fame: r.fame, dFame: r.fame - f0, mood: r.mood, dMood: r.mood - m0, ask: asked, match: match, likes: likes, duo: duo ? duo.id : null, style: style };
  }


  // ---------- Label: concerts ----------
  function venueIndex(r) { var k = 0; VENUES.forEach(function (v, i) { if (r.fame >= v.fame) k = i; }); return k; }
  function concertReady(S, r) { return labelOpen(S) && r && r.ccd <= 0 && !r.tour; }
  function startConcert(S, id) {
    var r = artistOf(S, id);
    if (!concertReady(S, r)) return null;
    var a = ART_BY[id], vi = venueIndex(r), v = VENUES[vi];
    var seed = (Math.floor(rand() * 4294967295) >>> 0);
    return { concert: { artist: id, venue: vi }, rival: { name: v.name, target: T.concertGood }, leagueName: v.name, bpm: GENRE_BPM[a.genre] || 100,
      bars: T.battleBars, notes: battlePattern(seed, Math.min(4, vi), T.battleBars), rule: null };
  }
  function finishConcert(S, id, vi, res) {
    var r = artistOf(S, id);
    if (!concertReady(S, r) || !res) return null;
    vi = Math.max(0, Math.min(venueIndex(r), Math.floor(num(vi, 0))));
    var v = VENUES[vi], score = Math.max(0, Math.min(1, num(res.score, 0))), combo = Math.max(0, Math.floor(num(res.combo, 0)));
    var cash = eventRef(S) * v.mult * (0.3 + score) * 0.8 * rdFx(S).event;
    var dFame = Math.max(-3, Math.min(12, Math.round((score - 0.5) * 12 + vi * 1.5)));
    var dMood = score >= T.concertGood ? 8 : score >= 0.45 ? 2 : -5;
    S.money += cash; S.lifetime += cash;
    var f0 = r.fame; r.fame = Math.max(0, Math.min(100, r.fame + dFame)); r.mood = Math.max(0, Math.min(100, r.mood + dMood));
    r.ccd = T.concertEvery; S.label.concerts++;
    if (score >= T.concertGood) S.label.bestVenue = Math.max(S.label.bestVenue, vi + 1);
    S.battle.best = Math.max(S.battle.best, combo);
    touch(S); checkTrophies(S);
    var out = { artist: id, venue: vi, score: score, cash: cash, dFame: r.fame - f0, fame: r.fame, dMood: dMood, mood: r.mood,
      grade: score >= 0.85 ? 3 : score >= T.concertGood ? 2 : score >= 0.45 ? 1 : 0 };
    if (hooks.concertDone) hooks.concertDone(out);
    return out;
  }

  // ---------- Label: histoires d'artistes ----------
  function makeStory(S, r) {
    var others = S.label.roster.filter(function (x) { return x.id !== r.id; });
    var pool = STORIES.filter(function (s) { return (s.need !== 'other' || others.length) && !(s.id === 'style' && r.style) && !(s.id === 'duo' && r.duo); });
    if (!pool.length) return null;
    var s = pool[Math.floor(rand() * pool.length)], a = ART_BY[r.id];
    var gs = PJ.genres.filter(function (g) { return g.id !== a.genre; });
    return { id: s.id, left: T.storyLife, other: others.length ? others[Math.floor(rand() * others.length)].id : null, genre: gs[Math.floor(rand() * gs.length)].id };
  }
  function storyText(S, r, str) {
    var st = r.story || {};
    return String(str).replace(/\{name\}/g, ART_BY[r.id].name).replace(/\{other\}/g, st.other ? ART_BY[st.other].name : '').replace(/\{genre\}/g, st.genre ? PJ_G[st.genre].name : '');
  }
  function storyCost(S, c) { return c.cost ? eventRef(S) * c.cost : 0; }
  function resolveStory(S, id, i, rnd) {
    var r = artistOf(S, id), st = r && r.story, s = st && STORY_BY[st.id], c = s && s.choices[i];
    if (!c) return null;
    var cost = storyCost(S, c);
    if (S.money < cost) return null;
    S.money -= cost;
    var win = c.risk ? (rnd || rand)() < c.risk : null, fx = win === false ? c.ffx : c.fx, out = [];
    var text = storyText(S, r, win === false ? c.fail : c.out);
    if (cost) out.push({ k: 'spent', v: cost });
    if (fx.mood) { var m0 = r.mood; r.mood = Math.max(0, Math.min(100, r.mood + fx.mood)); out.push({ k: 'amood', v: r.mood - m0 }); }
    if (fx.fame) { var f0 = r.fame; r.fame = Math.max(0, Math.min(100, r.fame + fx.fame)); out.push({ k: 'afame', v: r.fame - f0 }); }
    if (fx.cash) { var cc = eventRef(S) * fx.cash * rdFx(S).event; S.money += cc; S.lifetime += cc; out.push({ k: 'cash', v: cc }); }
    if (fx.rep) { S.orders.rep = Math.min(T.repMax, S.orders.rep + fx.rep); out.push({ k: 'rep', v: fx.rep }); }
    if (fx.style && st.genre) { r.style = st.genre; out.push({ k: 'style', g: st.genre }); }
    if (fx.duo && st.other && artistOf(S, st.other)) { r.duo = st.other; out.push({ k: 'duo', other: st.other }); }
    r.story = null; r.scd = T.storyEvery;
    touch(S);
    return { title: storyText(S, { id: r.id, story: st }, s.title), text: text, win: win, rewards: out };
  }

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
  function pianoReward(len) { return { m: Math.round(Math.min(2.5, 1 + 0.03 * len) * 100) / 100, s: Math.min(240, 60 + 3 * len) }; }
  // len: longueur de la plus longue mélodie rejouée sans faute. L'inspiration n'est versée que hors délai d'attente.
  function finishPiano(S, len) {
    if (!pianoOpen(S)) return null;
    var P = S.piano; len = Math.max(0, Math.min(999, Math.floor(num(len, 0))));
    P.plays++; P.best = Math.max(P.best, len);
    if (S.world) S.world.rec.piano = Math.max(S.world.rec.piano, len);
    var out = { len: len, best: P.best, reward: null };
    if (P.cd <= 0 && len >= PIANO.min) {
      var r = pianoReward(len), xp = xpNeeded(S.level) * 0.003 * len;
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
    // Un défi sur deux se joue au piano (tuiles) dès que le studio a un clavier.
    var kind = pianoOpen(S) && rand() < 0.5 ? 'piano' : 'drums';
    var names = (kind === 'piano' ? BT.pianists : BT.rivals).filter(function (n) { return n !== used; });
    var tr = trendFor(S), rule = tr ? tr.rule : null;
    if (kind === 'piano' && rule === 'sans-clap') rule = null;
    return { name: names[Math.floor(rand() * names.length)], kind: kind, league: S.battle.league, target: Math.min(0.95, L.target + (rand() - 0.5) * 0.08), seed: Math.floor(rand() * 4294967295) >>> 0, rule: rule };
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
  // Partition du clash sur une grille de croches (pas pairs sur 16 par mesure): pas de rafales, deux notes simultanées au plus,
  // et un écart minimal entre deux frappes sur une même piste. l: 0 kick, 1 caisse claire, 2 charleston, 3 clap.
  function battlePattern(seed, dens, bars) {
    var r = seeded(seed), out = [], at = {}, last = [-99, -99, -99, -99], gap = dens >= 3 ? 4 : dens >= 1 ? 4 : 8;
    function add(s, l) {
      if ((at[s] || 0) >= 2 || s - last[l] < gap) return false;
      if (out.some(function (n) { return n.s === s && n.l === l; })) return false;
      at[s] = (at[s] || 0) + 1; last[l] = s; out.push({ s: s, l: l }); return true;
    }
    for (var b = 0; b < bars; b++) {
      var o = b * 16, intro = b === 0, lastBar = b === bars - 1, ev = [];
      if (intro || dens === 0) {
        ev = [[0, 0], [8, 1]];
        if (!intro) { ev.push([4, 2]); ev.push([12, 2]); }
      } else {
        ev = [[0, 0], [4, 1], [8, 0], [12, 1]];
        var hp = [0, 0.35, 0.5, 0.65, 0.75][dens];
        [2, 6, 10, 14].forEach(function (s) { if (r() < hp) ev.push([s, 2]); });
        if (dens >= 2 && b % 2 === 1) ev.push([12, 3]);
        if (dens >= 3 && r() < 0.6) ev.push([r() < 0.5 ? 6 : 10, 0]);
        if (dens >= 4 && r() < 0.5) ev.push([0, 2]);
        if (dens >= 2 && lastBar) { ev.push([14, 3]); }
      }
      ev.sort(function (x, y) { return x[0] - y[0] || x[1] - y[1]; });
      ev.forEach(function (x) {
        // pas d'accord dans la première ligue
        if (dens === 0 && at[o + x[0]]) return;
        add(o + x[0], x[1]);
      });
    }
    out.sort(function (x, y) { return x.s - y.s || x.l - y.l; });
    return out;
  }
  // Partition « tuiles »: une tuile par rangée, la colonne suit le contour de la mélodie (plus aigu = plus à droite).
  function tilesPattern(seed, n) {
    var r = seeded(seed), song = PIANO.songs[Math.floor(r() * PIANO.songs.length)], cols = [], prev = Math.floor(r() * 4);
    for (var i = 0; i < n; i++) {
      var a = song.notes[(i - 1 + song.notes.length) % song.notes.length], b = song.notes[i % song.notes.length], c;
      if (i === 0) c = prev;
      else if (b > a) c = prev < 3 ? prev + 1 + (prev < 2 && b - a > 4 ? 1 : 0) : Math.floor(r() * 3);
      else if (b < a) c = prev > 0 ? prev - 1 - (prev > 1 && a - b > 4 ? 1 : 0) : 1 + Math.floor(r() * 3);
      else { c = Math.floor(r() * 3); if (c >= prev) c++; }
      cols.push(c); prev = c;
    }
    return { song: song.id, cols: cols };
  }
  function startBattle(S) {
    var B = S.battle, R = B.rival;
    if (!battleOpen(S) || !R) return null;
    var L = BT.leagues[R.league - 1];
    if (R.kind === 'piano') {
      var tp = tilesPattern(R.seed, L.tiles);
      return { kind: 'piano', rival: R, league: R.league, leagueName: L.name, song: tp.song, cols: tp.cols, tps: Math.round(L.tps * (R.rule === 'rapide' ? 1.1 : 1) * 100) / 100, rule: R.rule || null };
    }
    var notes = battlePattern(R.seed, L.dens, T.battleBars);
    if (R.rule === 'sans-clap') notes = notes.filter(function (n) { return n.l !== 3; });
    return { kind: 'drums', rival: R, league: R.league, leagueName: L.name, bpm: Math.round(L.bpm * (R.rule === 'rapide' ? 1.1 : 1)), bars: T.battleBars, notes: notes, rule: R.rule || null };
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

  // ---------- Préparation de la tournée mondiale ----------
  var WBASE = ['num1', 'orders', 'battles', 'concerts', 'ltours', 'tubes'];
  function pickDates(tours) {
    var r = seeded(9137 + tours * 7919), list = WORLD.dates.map(function (d) { return d.id; });
    for (var i = list.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)), t = list[i]; list[i] = list[j]; list[j] = t; }
    return list.slice(0, Math.min(WORLD.pick, list.length));
  }
  function worldSnap(S) { var b = {}; WBASE.forEach(function (k) { b[k] = trophyMetric(S, k); }); return b; }
  function worldNeed(S, d) { return d.abs != null ? d.abs : Math.ceil(d.d * (1 + WORLD.grow * Math.min(8, S.tours || 0))); }
  function worldValue(S, d) {
    var W = S.world;
    if (d.abs == null) { if (!W.base) W.base = worldSnap(S); return Math.max(0, trophyMetric(S, d.m) - (W.base[d.m] || 0)); }
    switch (d.m) {
      case 'pianoRun': return W.rec.piano;
      case 'projRun': return W.rec.proj;
      case 'top10': return (S.charts && S.charts.mine || []).filter(function (m) { return m.pos >= 1 && m.pos <= 10; }).length;
      case 'teamMood': var st = S.team ? S.team.staff : []; if (!st.length || st.length < teamCap(S)) return 0; var t = 0; st.forEach(function (m) { t += m.morale; }); return Math.floor(t / st.length);
      default: return trophyMetric(S, d.m);
    }
  }
  function worldDates(S) { return S.world.picks.map(function (k) { return WDATE_BY[k]; }).filter(Boolean); }
  function worldDone(S) { return worldDates(S).filter(function (d) { return S.world.done[d.id]; }); }
  function worldMult(S) { var n = worldDone(S).length, all = worldDates(S).length; return 1 + WORLD.fameDate * n + (all && n >= all ? WORLD.fameSlam : 0); }
  function souvenirs(S) { return S.world ? Object.keys(S.world.souv).length : 0; }
  function worldOpen(S) { return S.level >= T.labelLevel || (S.tours || 0) > 0; }
  // Une date se confirme dès que son défi est relevé, et le reste jusqu'au départ.
  function checkWorld(S) {
    if (!S.world || !worldOpen(S)) return;
    if (!S.world.base) S.world.base = worldSnap(S);
    worldDates(S).forEach(function (d) {
      if (S.world.done[d.id] || worldValue(S, d) < worldNeed(S, d)) return;
      S.world.done[d.id] = 1;
      if (hooks.worldDate) hooks.worldDate(d);
    });
  }
  // Pays parcourus: villes jouées en tournée locale, dates de la tournée mondiale, pays où le studio a été installé.
  function visited(S) {
    var out = {};
    function at(c) { return out[c] || (out[c] = { cities: [], dates: [], based: false }); }
    if (S.label) Object.keys(S.label.cities).forEach(function (k) { var c = k.slice(0, 2); if (COUNTRY_BY[c]) at(c).cities.push(k.slice(3)); });
    if (S.world) {
      Object.keys(S.world.souv).forEach(function (id) { var d = WDATE_BY[id]; if (d) at(d.c).dates.push(id); });
      (S.world.homes || []).forEach(function (c) { if (COUNTRY_BY[c]) at(c).based = true; });
    }
    return out;
  }
  // Pays où installer le studio pour la prochaine carrière: l'actuel, ou un pays dont une date a été jouée.
  function homeChoices(S) {
    var out = [S.world.home];
    worldDone(S).forEach(function (d) { if (out.indexOf(d.c) < 0) out.push(d.c); });
    return out;
  }

  // ---------- Tournées locales des artistes ----------
  function cleanLtour(t) {
    if (!t || typeof t !== 'object' || !LT_SIZE[t.size] || !LT_TR[t.tr] || !LT_SET[t.set] || !Array.isArray(t.cities)) return null;
    var cities = t.cities.slice(0, 12).map(function (c) { return String(c).slice(0, 30); });
    if (!cities.length) return null;
    return { size: t.size, tr: t.tr, set: t.set, cities: cities, c: String(t.c || 'fr').slice(0, 2), i: Math.max(0, Math.min(cities.length - 1, Math.floor(num(t.i, 0)))), t: num(t.t, 0),
      skip: !!t.skip, inc: t.inc && LT_INC[t.inc.id] ? { id: t.inc.id, left: Math.max(0, Math.min(LTOUR.incLife, num(t.inc.left, LTOUR.incLife))), city: String(t.inc.city || '').slice(0, 30) } : null,
      cash: Math.max(0, num(t.cash, 0)), fame: num(t.fame, 0), mood: num(t.mood, 0), ok: Math.max(0, Math.floor(num(t.ok, 0))),
      log: (Array.isArray(t.log) ? t.log : []).slice(0, 12).map(function (x) { return { city: String((x && x.city) || '').slice(0, 30), ok: x && x.ok ? 1 : 0, skip: x && x.skip ? 1 : 0, cash: Math.max(0, num(x && x.cash, 0)) }; }) };
  }
  function cleanLast(x) {
    if (!x || typeof x !== 'object') return null;
    return { n: Math.max(0, Math.floor(num(x.n, 0))), ok: Math.max(0, Math.floor(num(x.ok, 0))), cash: Math.max(0, num(x.cash, 0)), fame: num(x.fame, 0), mood: num(x.mood, 0), c: String(x.c || 'fr').slice(0, 2) };
  }
  // ---------- Calendrier, saisons et météo ----------
  // Jour 1 = date du premier lancement (S.created). Les jours avancent avec le temps du jeu, même pendant l'absence.
  function tickCal(S, rdt) {
    var K = S.cal; if (!K || rdt <= 0) return;
    // absence (S._off): le calendrier avance de quelques jours au plus, pour ne pas sauter les saisons et les fêtes
    var add = rdt / CAL.day;
    if (S._off) { add = Math.min(add, Math.max(0, (CAL.awayDays || 3) - (K.ad || 0))); K.ad = (K.ad || 0) + add; }
    else K.ad = 0;
    K.d += add;
    if (S.level >= CAL.out.mail.lvl) K.mail = Math.min(1, K.mail + rdt / CAL.out.mail.every);
    K.cd.tree = Math.max(0, K.cd.tree - rdt); K.cd.cat = Math.max(0, K.cd.cat - rdt);
  }
  function calStart(S) { var t = new Date(S.created || Date.now()); t.setHours(12, 0, 0, 0); return t; }
  function dateOf(S, day) { var t = calStart(S); t.setDate(t.getDate() + Math.floor(day)); return t; }
  function doyOf(t) { return Math.round((t - new Date(t.getFullYear(), 0, 1, 12)) / 864e5); }
  // Jour de l'année (0 à 365) éventuellement fractionnaire, date réelle, numéro du jour de carrière.
  function calendar(S, d) {
    d = d == null ? (S.cal ? S.cal.d : 0) : d;
    var t = dateOf(S, d), f = d - Math.floor(d);
    return { day: Math.floor(d) + 1, d: d, f: f, date: t, y: t.getFullYear(), m: t.getMonth() + 1, dom: t.getDate(), wd: t.getDay(), doy: doyOf(t) + f,
      text: t.getDate() + (t.getDate() === 1 ? 'er' : '') + ' ' + CAL.months[t.getMonth()] + ' ' + t.getFullYear(), wdName: CAL.weekdays[t.getDay()] };
  }
  function hash01(n) { n = n | 0; n = Math.imul(n ^ (n >>> 16), 0x45d9f3b); n = Math.imul(n ^ (n >>> 16), 0x45d9f3b); n ^= n >>> 16; return (n >>> 0) / 4294967296; }
  function sstep(a, b, x) { var t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
  function monthly(arr, doy) { // valeur mensuelle lissée (milieu de mois)
    if (!arr) return 0;
    var m = doy / 30.44 - 0.5, i = Math.floor(m), f = m - i, a = arr[(i % 12 + 12) % 12], b = arr[((i + 1) % 12 + 12) % 12];
    return a + (b - a) * f;
  }
  function climateOf(k) { return CAL.climate[k] || CAL.climate.fr; }
  function seasonTemp(cl, doy) { return cl.t[0] + cl.t[1] * Math.cos(2 * Math.PI * (doy - cl.t[2]) / 365); }
  // Météo d'un jour entier (déterministe: même jour, même pays, même temps).
  function weatherDay(S, k, i) {
    var cl = climateOf(k), t = dateOf(S, i), doy = doyOf(t), seed = (k.charCodeAt(0) * 131 + k.charCodeAt(1) * 7) * 100003 + i * 7919;
    var r1 = hash01(seed), r2 = hash01(seed + 1), r3 = hash01(seed + 2), r4 = hash01(seed + 3);
    var temp = seasonTemp(cl, doy) + (r2 - 0.5) * 2 * (cl.vary || 3), p = monthly(cl.rain, doy);
    var wet = r1 < p ? 0.35 + 0.65 * r3 : 0;
    return { temp: temp, wet: wet, snow: wet > 0 && temp < 1.5, cloud: wet ? 0.8 + 0.2 * r3 : Math.max(0, Math.min(0.75, p * 1.2 + (r4 - 0.55) * 0.8)), doy: doy };
  }
  function seasonName(cl, n, k) {
    if (k === 'ng') { var m = Math.floor(n / 30.44); return m >= 11 || m <= 1 ? { id: 'harmattan', name: 'Harmattan' } : m <= 2 || m === 10 ? { id: 'seche', name: 'Saison sèche' } : { id: 'pluies', name: 'Saison des pluies' }; }
    if (n >= 79 && n < 172) return { id: 'printemps', name: 'Printemps' };
    if (n >= 172 && n < 265) return { id: 'ete', name: 'Été' };
    if (n >= 265 && n < 355) return { id: 'automne', name: 'Automne' };
    return { id: 'hiver', name: 'Hiver' };
  }
  function festsAt(k, m, dd) {
    var v = m * 100 + dd;
    return (CAL.fests || []).filter(function (f) {
      if (f.c && f.c.indexOf(k) < 0) return false;
      var a = f.from[0] * 100 + f.from[1], b = f.to[0] * 100 + f.to[1];
      return a <= b ? v >= a && v <= b : v >= a || v <= b;
    });
  }
  // Environnement extérieur à l'instant présent: saison, végétation, neige, météo, fêtes (valeurs de 0 à 1 qui varient en douceur).
  function env(S, d) {
    var K = S.cal || newCal(), k = (S.world && S.world.home) || 'fr', cl = climateOf(k);
    d = d == null ? K.d : d;
    var c = calendar(S, d), i = Math.floor(d), f = d - i, doy = c.doy;
    var n = cl.hemi < 0 ? (doy + 182.5) % 365 : doy, ph = cl.ph || 0; // jour « nord » équivalent
    var w0 = weatherDay(S, k, i), w1 = weatherDay(S, k, i + 1), bl = sstep(0.55, 1, f);
    var cloud = w0.cloud + (w1.cloud - w0.cloud) * bl, temp = w0.temp + (w1.temp - w0.temp) * f;
    // la pluie ou la neige commencent et cessent progressivement
    var wet = w0.wet * (1 - bl) + w1.wet * bl, snowing = (bl < 0.5 ? w0.snow : w1.snow);
    var o = { day: c.day, cal: c, country: k, zone: cl.zone, style: cl.style || k, temp: temp, cloud: cloud, precip: wet > 0.02 ? { t: snowing ? 'snow' : 'rain', k: wet } : null };
    if (cl.zone === 'tropical') {
      o.leaf = 1; o.fall = 0; o.fresh = 0.5; o.blossom = 0; o.flowers = 1;
      o.dry = monthly(cl.dryM, doy); o.dormant = 0; o.snow = 0;
      o.bloom = 0; (cl.bloom || []).forEach(function (b) { o.bloom = Math.max(o.bloom, sstep(b[0], b[0] + 15, doy) * (1 - sstep(b[1] - 15, b[1], doy))); });
      o.haze = monthly(cl.haze, doy);
      if (o.precip && o.precip.t === 'snow') o.precip.t = 'rain';
    } else {
      o.leaf = Math.min(sstep(80 + ph, 132 + ph, n), 1 - sstep(288 + ph, 332 + ph, n));
      o.fall = sstep(252 + ph, 300 + ph, n) * (1 - sstep(340, 360, n));
      o.fresh = 1 - sstep(130 + ph, 185 + ph, n);
      o.blossom = sstep(80 + ph, 90 + ph, n) * (1 - sstep(100 + ph, 110 + ph, n)); // cerisiers en fleurs
      o.flowers = sstep(85 + ph, 125 + ph, n) * (1 - sstep(262 + ph, 300 + ph, n));
      o.dry = (cl.dry || 0) * sstep(190, 215, n) * (1 - sstep(245, 275, n));
      o.dormant = Math.max(1 - sstep(65 + ph, 110 + ph, n), sstep(300 + ph, 345, n));
      o.bloom = 0; o.haze = 0;
      // neige: au cœur de l'hiver selon le pays, renforcée par les jours de neige récents
      var cold = -Math.cos(2 * Math.PI * (doy - cl.t[2]) / 365), base = (cl.snow || 0) * sstep(cl.sw, Math.min(1, cl.sw + 0.12), cold), fresh = 0;
      // neige fraîche: monte pendant la journée de neige puis fond en deux ou trois jours (continu dans le temps)
      if (cl.snow) for (var j = 0; j < 4; j++) { var wj = j ? weatherDay(S, k, i - j) : w0, age = j + f; if (wj.snow) fresh += wj.wet * sstep(0, 0.6, age) * (1 - sstep(1.5, 3.5, age)); }
      var warm = sstep(4, 9, temp);
      o.snow = Math.max(0, Math.min(1, base * (0.7 + 0.3 * Math.min(1, fresh)) + fresh * 0.35 * (cl.snow || 0) - warm * 0.5));
    }
    o.season = seasonName(cl, n, k);
    o.fests = festsAt(k, c.m, c.dom).map(function (x) { return x.id; });
    o.wind = 0.3 + 0.7 * hash01(i * 31 + 7);
    return o;
  }
  var FEST_BY = {}; (CAL.fests || []).forEach(function (f) { FEST_BY[f.id] = f; });
  var fmCache = { k: '', v: 1 };
  function festMult(S) {
    if (!S.cal) return 1;
    var k = Math.floor(S.cal.d) + '|' + ((S.world && S.world.home) || 'fr') + '|' + (S.created || 0);
    if (fmCache.k !== k) {
      var c = calendar(S), v = 1;
      festsAt((S.world && S.world.home) || 'fr', c.m, c.dom).forEach(function (f) { if (f.gain) v *= f.gain; });
      fmCache.k = k; fmCache.v = v;
    }
    return fmCache.v;
  }
  // Ce qui attend dans le jardin: courrier des fans, arbre à secouer, chat à caresser, bonhomme de neige à finir.
  // Courrier des fans: ouvrir la lettre la garde de côté (texte, signature, gain), « Marquer comme lu » encaisse le gain.
  function openMail(S, rnd) {
    var K = S.cal, O = CAL.out, r = rnd || rand;
    if (K.letter) return K.letter;
    if (!(K.mail >= 1 && S.level >= O.mail.lvl)) return null;
    var city = homeCountry(S).cities;
    K.mail = 0;
    K.letter = { t: CAL.mail[Math.floor(r() * CAL.mail.length)], f: NAMES[Math.floor(r() * NAMES.length)] + ', ' + city[Math.floor(r() * city.length)], v: eventRef(S) * O.mail.x, d: Math.floor(K.d) };
    return K.letter;
  }
  function readMail(S) {
    var K = S.cal, L = K.letter;
    if (!L) return null;
    S.money += L.v; S.lifetime += L.v; K.letter = null; touch(S);
    return { letter: L, rewards: [{ k: 'cash', v: L.v }] };
  }
  function winterOf(S) { var c = calendar(S); return c.y - (c.m < 7 ? 1 : 0); }
  function outdoorState(S, e) {
    var K = S.cal, O = CAL.out, sn = e ? e.snow : env(S).snow, win = winterOf(S), sm = K.smW === win ? K.sm : 0;
    // un bonhomme de neige par hiver; il fond quand la neige disparaît
    return { mail: !!K.letter || K.mail >= 1 && S.level >= O.mail.lvl, mailP: K.mail, letter: K.letter || null, tree: K.cd.tree <= 0, treeCd: K.cd.tree, cat: K.cd.cat <= 0, catCd: K.cd.cat,
      snowman: sn >= O.snowman.snow ? (sm >= O.snowman.steps ? 'done' : 'build') : null, sm: sn >= 0.12 ? sm : 0, snow: sn };
  }
  function outdoor(S, id, rnd) {
    var K = S.cal, O = CAL.out, st = outdoorState(S), ref = eventRef(S), r = rnd || rand, out = null;
    if (id === 'mail') {
      var L0 = openMail(S, r); if (!L0) return null;
      var rd = readMail(S);
      out = { id: id, text: L0.t, from: L0.f, rewards: rd.rewards };
    } else if (id === 'tree') {
      if (!st.tree) return null;
      K.cd.tree = O.tree.cd;
      var x = xpNeeded(S.level) * O.tree.xp; addXp(S, x);
      out = { id: id, rewards: [{ k: 'xp', v: x }] };
    } else if (id === 'cat') {
      if (!st.cat) return null;
      K.cd.cat = O.cat.cd;
      if (S.team.staff.length) { S.team.staff.forEach(function (s) { s.morale = Math.min(100, s.morale + O.cat.morale); }); out = { id: id, rewards: [{ k: 'morale', v: O.cat.morale }] }; }
      else { var c = ref * O.cat.x; S.money += c; S.lifetime += c; out = { id: id, rewards: [{ k: 'cash', v: c }] }; }
    } else if (id === 'snowman') {
      if (st.snowman !== 'build') return null;
      var win = winterOf(S);
      if (K.smW !== win) { K.smW = win; K.sm = 0; }
      K.sm++;
      out = { id: id, step: K.sm, steps: O.snowman.steps, rewards: [] };
      if (K.sm >= O.snowman.steps) { grantBoost(S, O.snowman.boost, O.snowman.s); out.rewards.push({ k: 'boost', m: S.boost.m, s: S.boost.left }); out.done = true; }
    }
    if (out) touch(S);
    return out;
  }
  function homeCountry(S) { return COUNTRY_BY[(S.world && S.world.home) || 'fr'] || WORLD.countries[0]; }
  function legTime(t) { return LT_SIZE[t.size].leg * LT_TR[t.tr].speed; }
  function ltourReady(S, r) { return labelOpen(S) && !!r && !r.tour && r.tcd <= 0 && !r.offer && !(S.proj.cur && S.proj.cur.artist === r.id); }
  function ltourCost(S, size, tr, set) {
    var z = LT_SIZE[size], p = LT_TR[tr], s = LT_SET[set];
    if (!z || !p || !s) return 0;
    return eventRef(S) * z.cost * (p.cost + s.extra);
  }
  // Estimation affichée avant le départ.
  function ltourPreview(S, id, size, tr, set) {
    var r = artistOf(S, id), z = LT_SIZE[size], p = LT_TR[tr], s = LT_SET[set];
    if (!r || !z || !p || !s) return null;
    var ok = cityChance(r, s), per = cityCash(S, r, s);
    return { cost: ltourCost(S, size, tr, set), time: z.n * z.leg * p.speed, ok: ok, cash: z.n * per * (ok + (1 - ok) * 0.3), fame: z.n * (ok * s.fame - (1 - ok)), n: z.n };
  }
  function cityChance(r, s) { return Math.max(0.2, Math.min(0.97, s.ok + (r.mood - 50) / 250)); }
  function cityCash(S, r, s) { return eventRef(S) * LTOUR.cash * (1 + r.fame / 40) * s.cash * rdFx(S).event; }
  function startLtour(S, id, size, tr, set) {
    var r = artistOf(S, id), z = LT_SIZE[size];
    if (!ltourReady(S, r) || !z || !LT_TR[tr] || !LT_SET[set]) return null;
    var cost = ltourCost(S, size, tr, set);
    if (S.money < cost) return null;
    S.money -= cost;
    var C = homeCountry(S), pool = C.cities.slice(0, -1), cap = C.cities[C.cities.length - 1], cities = [];
    for (var i = pool.length - 1; i > 0; i--) { var j = Math.floor(rand() * (i + 1)), x = pool[i]; pool[i] = pool[j]; pool[j] = x; }
    cities = pool.slice(0, z.n - 1).sort(function (a, b) { return C.cities.indexOf(a) - C.cities.indexOf(b); });
    cities.push(cap); // la tournée finit toujours dans la capitale
    r.ask = null; r.story = null;
    r.tour = { size: size, tr: tr, set: set, cities: cities, c: C.id, i: 0, t: 0, skip: false, inc: null, cash: 0, fame: 0, mood: 0, ok: 0, log: [] };
    maybeIncident(S, r);
    touch(S);
    if (hooks.ltourStart) hooks.ltourStart(ART_BY[id], r);
    return r.tour;
  }
  function maybeIncident(S, r) {
    var t = r.tour;
    if (!t || t.inc || rand() >= LTOUR.incChance || !LTOUR.incidents.length) return;
    var x = LTOUR.incidents[Math.floor(rand() * LTOUR.incidents.length)];
    t.inc = { id: x.id, left: LTOUR.incLife, city: t.cities[t.i] };
    if (hooks.ltourIncident) hooks.ltourIncident(ART_BY[r.id], r, x);
  }
  function addMood(r, v) { var m0 = r.mood; r.mood = Math.max(0, Math.min(100, r.mood + v)); return r.mood - m0; }
  function addFame(r, v) { var f0 = r.fame; r.fame = Math.max(0, Math.min(100, r.fame + v)); return r.fame - f0; }
  function ltourText(S, r, str) { return String(str).replace(/\{name\}/g, ART_BY[r.id].name).replace(/\{city\}/g, r.tour && r.tour.inc ? r.tour.inc.city : ''); }
  // i: choix 0 ou 1. Renvoie les effets appliqués.
  function resolveIncident(S, id, i, rnd, auto) {
    var r = artistOf(S, id), t = r && r.tour, inc = t && t.inc, x = inc && LT_INC[inc.id], c = x && x.choices[i];
    if (!c) return null;
    var fx = c.fx, cost = fx.cost ? eventRef(S) * fx.cost : 0;
    if (cost && S.money < cost) { if (!auto) return null; cost = S.money; }
    S.money -= cost;
    var win = fx.risk ? (rnd || rand)() < fx.risk : null, out = { cost: cost, win: win, fame: 0, mood: 0, delay: fx.delay || 0, skip: !!fx.skip, text: c.text, title: ltourText(S, r, x.title) };
    out.fame = addFame(r, win === false ? (fx.ffame || 0) : (fx.fame || 0)); out.mood = addMood(r, win === false ? (fx.fmood || 0) : (fx.mood || 0));
    t.fame += out.fame; t.mood += out.mood;
    if (fx.delay) t.t -= fx.delay;
    if (fx.skip) t.skip = true;
    t.inc = null;
    touch(S);
    return out;
  }
  function tickLtours(S, dt) {
    if (!S.label || !labelOpen(S)) return;
    S.label.roster.slice().forEach(function (r) {
      if (!r.tour) { if (r.tcd > 0) r.tcd = Math.max(0, r.tcd - dt); return; }
      var t = r.tour;
      if (t.inc) { t.inc.left -= dt; if (t.inc.left <= 0) { var x = LT_INC[t.inc.id], res = resolveIncident(S, r.id, x.def, null, true); if (res && hooks.ltourAuto) hooks.ltourAuto(ART_BY[r.id], res); } }
      t.t += dt;
      var guard = 0;
      while (r.tour && t.t >= legTime(t) && guard++ < 20) { t.t -= legTime(t); cityDone(S, r); }
    });
  }
  function cityDone(S, r) {
    var t = r.tour, s = LT_SET[t.set], p = LT_TR[t.tr], city = t.cities[t.i], e = { city: city, ok: 0, skip: 0, cash: 0 };
    if (t.inc) { var x = LT_INC[t.inc.id]; resolveIncident(S, r.id, x.def, null, true); }
    if (t.skip) { e.skip = 1; t.skip = false; }
    else {
      var ok = rand() < cityChance(r, s), cash = cityCash(S, r, s) * (ok ? 1 : 0.3);
      S.money += cash; S.lifetime += cash; t.cash += cash; e.cash = cash; e.ok = ok ? 1 : 0;
      if (ok) t.ok++;
      t.fame += addFame(r, ok ? s.fame : -1);
      t.mood += addMood(r, p.mood + (ok ? 1 + s.mood : -3));
      S.label.cities[t.c + ':' + city] = 1;
    }
    t.log.push(e);
    if (hooks.ltourCity) hooks.ltourCity(ART_BY[r.id], r, e);
    t.i++;
    if (t.i >= t.cities.length) {
      r.tourLast = { n: t.cities.length, ok: t.ok, cash: t.cash, fame: t.fame, mood: t.mood, c: t.c };
      r.tour = null; r.tcd = LTOUR.rest; r.tours = (r.tours || 0) + 1; S.label.ltours++;
      touch(S);
      if (hooks.ltourDone) hooks.ltourDone(ART_BY[r.id], r, r.tourLast);
      return;
    }
    maybeIncident(S, r);
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
  // fameX: points gagnés en plus grâce aux dates de la tournée mondiale (ils ne sont pas « avancés » sur les gains futurs).
  function fameBase(S) { return Math.max(0, (S.fame || 0) - (S.fameX || 0)); }
  function fameAvailable(S) { return Math.max(0, fameFor(S.lifetime) - fameBase(S)); }
  function canTour(S) { return fameAvailable(S) >= T.fameMin; }
  // Gains cumulés à atteindre pour obtenir le point suivant.
  function fameNextAt(S) { return fameAt(fameFor(S.lifetime) + 1); }
  // Gains cumulés à atteindre pour pouvoir partir en tournée.
  function fameUnlockAt(S) { return fameAt(fameBase(S) + T.fameMin); }
  // Remet la carrière à zéro: garde la renommée, les contacts, les trophées et le cumul des gains.
  function tour(S, now, home) {
    var n = fameAvailable(S);
    if (n < T.fameMin) return null;
    var W = S.world, played = worldDone(S), extra = Math.round(n * (worldMult(S) - 1));
    played.forEach(function (d) { W.souv[d.id] = (W.souv[d.id] || 0) + 1; });
    var f = newState(now);
    S.money = 0; S.xp = 0; S.level = 1; S.owned = f.owned; S.tracks = {}; S.boost = f.boost;
    ACTS.forEach(function (a) {
      var s = S.acts[a.id];
      S.acts[a.id] = { lvl: 0, auto: false, prog: 0, run: false, done: s ? s.done : 0, tubes: s ? s.tubes || 0 : 0 };
    });
    S.ev.cd = T.eventFirst; S.ev.pending = null; S.ev.hold = false;
    if (S.proj) { S.proj.cur = null; S.proj.last = null; } // un projet en cours est abandonné, le carnet reste
    S.label.roster.forEach(function (a) { a.ask = null; a.cd = T.askEvery; a.story = null; a.scd = T.storyFirst; a.ccd = 0; a.offer = null; a.tour = null; a.tcd = 0; });
    S.label.ocd = T.offerFirst;
    S.rd.spec = {}; // les recherches restent, les spécialisations se choisissent à nouveau
    // L'équipe part aussi en tournée: ses membres pourront revenir sans prime d'embauche.
    var tm = S.team || newTeam(), al = tm.staff.map(function (m) { return { id: m.id, name: m.name, role: m.role, stars: m.stars, lvl: m.lvl, xp: 0, salary: m.salary, look: m.look }; });
    tm.alumni = al.concat(tm.alumni.filter(function (a) { return !al.some(function (b) { return b.id === a.id; }); })).slice(0, 16);
    tm.staff = []; tm.pool = []; tm.poolCd = 0; S.team = tm;
    S.masters = []; S.orders.offers = []; S.orders.active = []; S.orders.cd = T.orderFirst; // la réputation et le Top 50 restent
    S.fame = (S.fame || 0) + n + extra; S.fameX = (S.fameX || 0) + extra; S.tours = (S.tours || 0) + 1;
    var nh = homeChoices(S).indexOf(home) >= 0 ? home : W.home;
    var souv = W.souv, homes = W.homes.slice();
    if (homes.indexOf(nh) < 0) homes.push(nh);
    S.world = newWorld(S.tours); S.world.home = nh; S.world.souv = souv; S.world.homes = homes;
    S.savedAt = now; S.epoch = now;
    var tdays = CAL.tourDays + CAL.tourPerDate * played.length;
    if (S.cal) { S.cal.d += tdays; S.cal.sm = 0; }
    touch(S);
    S.world.base = worldSnap(S);
    return { points: n + extra, base: n, extra: extra, fame: S.fame, tours: S.tours, dates: played.map(function (d) { return d.id; }), home: nh, days: tdays };
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
      case 'tubes': ACTS.forEach(function (a) { n += (S.acts[a.id] && S.acts[a.id].tubes) || 0; }); break;
      case 'signed': n = S.label ? S.label.roster.length : 0; break;
      case 'concerts': n = S.label ? S.label.concerts : 0; break;
      case 'kept': n = S.label ? S.label.kept : 0; break;
      case 'cities': n = S.label ? Object.keys(S.label.cities).length : 0; break;
      case 'souvenirs': n = souvenirs(S); break;
      case 'ltours': n = S.label ? S.label.ltours : 0; break;
      case 'bestVenue': n = S.label ? S.label.bestVenue : 0; break;
      case 'artistAlbums': n = S.label ? S.label.albums : 0; break;
      case 'artistFame': (S.label ? S.label.roster : []).forEach(function (a) { n = Math.max(n, a.fame); }); break;
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
  // Temps passé avec le jeu ouvert mais en arrière-plan: le studio tourne, l'équipe garde un moral plancher et personne ne part.
  function advanceAway(S, dt) {
    if (dt <= 0) return;
    S._off = 1;
    var ch = 0;
    try { advance(S, dt); ch = chartsAway(S, dt, 1); } finally { delete S._off; }
    return ch;
  }
  function offline(S, now) {
    var gap = Math.max(0, (now - S.savedAt) / 1000);
    if (gap < 30) return null;
    var eff = Math.min(gap, OFFLINE_CAP) * OFFLINE_EFF;
    var m0 = S.money, l0 = S.lifetime, x0 = S.level, tr0 = trackCount(S), mo0 = avgMorale(S), ch = 0, d0 = S.cal ? S.cal.d : 0;
    S._off = Math.min(gap, OFFLINE_CAP) / Math.max(1, eff);
    try { advance(S, eff); ch = chartsAway(S, Math.min(gap, OFFLINE_CAP), OFFLINE_EFF); } finally { delete S._off; }
    // gain: revenus bruts; net: variation réelle du budget (salaires déduits)
    var gain = S.lifetime - l0, net = S.money - m0;
    if (gain <= 0) return null;
    return { gap: gap, capped: gap > OFFLINE_CAP, gain: gain, net: net, wages: Math.max(0, gain - net), levels: S.level - x0, tracks: trackCount(S) - tr0, charts: ch, mor0: mo0, mor1: avgMorale(S), days: S.cal ? S.cal.d - d0 : 0 };
  }
  function avgMorale(S) {
    var st = S.team ? S.team.staff : [];
    if (!st.length) return null;
    var t = 0; st.forEach(function (m) { t += m.morale; }); return t / st.length;
  }

  var Game = {
    ACTS: ACTS, ITEMS: ITEMS, TIERS: TIERS, EVENTS: EVENTS, TROPHIES: TROPHIES, TROPHY_BY: TROPHY_BY, ACT_BY: ACT_BY, ITEM_BY: ITEM_BY, EVENT_BY: EVENT_BY, hooks: hooks,
    OFFLINE_CAP: OFFLINE_CAP, OFFLINE_EFF: OFFLINE_EFF, TAP: TAP,
    newState: newState, hydrate: hydrate, xpNeeded: xpNeeded, studioValue: studioValue, valueMult: valueMult,
    levelMult: levelMult, duration: duration, payout: payout, xpGain: xpGain, upCost: upCost, royRate: royRate,
    activeRate: activeRate, trackCount: trackCount, isUnlocked: isUnlocked, lockReason: lockReason,
    tierIndex: tierIndex, milestoneMult: milestoneMult, nextMilestone: nextMilestone, PERKS: PERKS, perkFx: perkFx, nextPerk: nextPerk, perksBetween: perksBetween, synergy: synergy, tubeChance: tubeChance, startAct: startAct,
    tapAct: tapAct, advanceAway: advanceAway, chartsAway: chartsAway, avgMorale: avgMorale, buy: buy, upgradeAct: upgradeAct, upgradeActN: upgradeActN, upPlan: upPlan, buyAuto: buyAuto, advance: advance, offline: offline, touch: touch,
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
    ARTISTS: ARTISTS, ART_BY: ART_BY, labelOpen: labelOpen, labelCap: labelCap, artistOf: artistOf, labelMult: labelMult, artistAvailable: artistAvailable,
    artistCost: artistCost, signArtist: signArtist, tickLabel: tickLabel, artistParts: artistParts,
    WORLD: WORLD, COUNTRY_BY: COUNTRY_BY, WDATE_BY: WDATE_BY, LTOUR: LTOUR, LT_SIZE: LT_SIZE, LT_TR: LT_TR, LT_SET: LT_SET, LT_INC: LT_INC,
    worldOpen: worldOpen, worldDates: worldDates, worldDone: worldDone, worldNeed: worldNeed, worldValue: worldValue, worldMult: worldMult, checkWorld: checkWorld, homeChoices: homeChoices, souvenirs: souvenirs, visited: visited, fameBase: fameBase, pickDates: pickDates,
    homeCountry: homeCountry, ltourReady: ltourReady, ltourCost: ltourCost, ltourPreview: ltourPreview, startLtour: startLtour, resolveIncident: resolveIncident, tickLtours: tickLtours, legTime: legTime, ltourText: ltourText,
    RIVAL_LABELS: RIVAL_LABELS, goneOf: goneOf, keepChance: keepChance, retainCost: retainCost, transferFee: transferFee, resolveOffer: resolveOffer, discography: discography,
    VENUES: VENUES, STORIES: STORIES, STORY_BY: STORY_BY, venueIndex: venueIndex, concertReady: concertReady, startConcert: startConcert, finishConcert: finishConcert,
    makeStory: makeStory, storyText: storyText, storyCost: storyCost, resolveStory: resolveStory,
    CAL: CAL, FEST_BY: FEST_BY, calendar: calendar, env: env, weatherDay: weatherDay, festsAt: festsAt, festMult: festMult, outdoorState: outdoorState, outdoor: outdoor, openMail: openMail, readMail: readMail, tickCal: tickCal,
    trendFor: trendFor, trendAct: trendAct, makeTrend: makeTrend, RULES: RULES, pianoOpen: pianoOpen, pianoReward: pianoReward, finishPiano: finishPiano, battleOpen: battleOpen, tickBattle: tickBattle, declineBattle: declineBattle, battlePattern: battlePattern, tilesPattern: tilesPattern, startBattle: startBattle, finishBattle: finishBattle
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Game;
  root.Game = Game;
})(typeof window !== 'undefined' ? window : globalThis);
