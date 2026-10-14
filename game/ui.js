/* Premier Mix 3D: interface, sauvegarde, sons, équipe et pilotage de la scène 3D. */
(function () {
  'use strict';
  var G = window.Game, D = window.GameData;
  var KEY = 'premier-mix:v1';
  var NB = ' ';
  var S = null;
  var quiet = false, shopKey = '', lastSave = 0, lastCloud = 0, localLoadedAt = 0, firstRender = true;
  var cloud = { ref: null, ok: false, status: 'pending', me: null, dirty: false, busy: false, lastSeen: 0, lastWrite: 0 };
  var rows = {}, prevUnlocked = {}, lastFloat = {}, pendingCloud = null;
  var S3 = window.Scene3D || null, scene3d = false;

  // ---------- Utilitaires ----------
  function $(id) { return document.getElementById(id); }
  var nf0 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
  var nf1 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
  var nf2 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });
  var UNITS = ['', ' k', ' M', ' Md', ' Bn', ' Brd', ' Tn'];
  function short(n) {
    if (!isFinite(n)) return '∞';
    if (n < 1000) return n < 10 ? nf2.format(n) : n < 100 ? nf1.format(n) : nf0.format(n);
    var i = Math.min(Math.floor(Math.log10(n) / 3), UNITS.length - 1);
    var v = n / Math.pow(1000, i);
    return (v < 10 ? nf2.format(v) : v < 100 ? nf1.format(v) : nf0.format(v)) + UNITS[i];
  }
  function eur(n) { return short(n) + NB + '€'; }
  function dur(s) {
    if (s < 10) return nf1.format(Math.max(0, s)) + ' s';
    if (s < 60) return Math.round(s) + ' s';
    var m = Math.floor(s / 60), r = Math.round(s % 60);
    return m + ' min ' + (r < 10 ? '0' : '') + r;
  }
  function clock(s) {
    var n = Math.max(0, Math.ceil(s)), m = Math.floor(n / 60), r = n % 60;
    return m + ':' + (r < 10 ? '0' : '') + r;
  }
  function away(s) {
    var h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60);
    return h > 0 ? h + ' h ' + (m < 10 ? '0' : '') + m : m + ' min';
  }
  function setText(el, t) { if (el._t !== t) { el._t = t; el.textContent = t; } }
  function setClass(el, c, on) { var k = '_c' + c; if (el[k] !== on) { el[k] = on; el.classList.toggle(c, on); } }
  function setDisabled(el, on) { if (el._d !== on) { el._d = on; el.disabled = on; } }
  function setHidden(el, on) { if (el._h !== on) { el._h = on; el.hidden = on; } }
  function setWidth(el, pct) { var w = pct.toFixed(1) + '%'; if (el._w !== w) { el._w = w; el.style.width = w; } }

  function toast(msg, ms) {
    var box = $('toasts'), t = document.createElement('div');
    t.className = 'toast'; t.textContent = msg; box.appendChild(t);
    while (box.children.length > 3) box.removeChild(box.firstChild);
    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, ms || 3400);
  }

  // ---------- Sons ----------
  var ac = null, lastBlip = 0;
  // Volumes (0 à 100, propres à l'appareil). 70 = niveau d'origine; la courbe est quadratique pour suivre l'oreille.
  var VKEY = 'premier-mix:volumes', VDEF = 70, vol = { sfx: VDEF, game: VDEF, gameOn: true };
  // Sons des mini-jeux (clash, concerts, piano, métronome), réglables à part des sons du studio.
  function gameSnd() { return vol.gameOn && vol.game > 0; }
  function volMul(v) { return Math.pow(v / VDEF, 2); }
  function loadVol() {
    try { var o = JSON.parse(localStorage.getItem(VKEY) || 'null'); if (o) { ['sfx', 'game'].forEach(function (k) { var n = +o[k]; if (isFinite(n)) vol[k] = Math.max(0, Math.min(100, Math.round(n))); }); if (typeof o.gameOn === 'boolean') vol.gameOn = o.gameOn; } } catch (e) { /* valeurs par défaut */ }
  }
  function saveVol() { try { localStorage.setItem(VKEY, JSON.stringify(vol)); } catch (e) { /* stockage indisponible */ } }
  var SCALE = [0, 2, 4, 7, 9];
  function blip(idx, force) {
    if (!force && (!S || !S.sound)) return;
    if (vol.sfx <= 0) return;
    var t = performance.now();
    if (t - lastBlip < 160) return;
    lastBlip = t;
    try {
      ac = ac || new (window.AudioContext || window.webkitAudioContext)();
      if (ac.state === 'suspended') ac.resume();
      var semi = SCALE[(idx + Math.floor(Math.random() * 3)) % 5] + 12 * Math.floor(idx / 5);
      var o = ac.createOscillator(), g = ac.createGain(), n = ac.currentTime;
      o.type = 'triangle';
      o.frequency.value = 196 * Math.pow(2, semi / 12);
      g.gain.setValueAtTime(0.0001, n);
      g.gain.exponentialRampToValueAtTime(0.07 * volMul(vol.sfx), n + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, n + 0.4);
      o.connect(g); g.connect(ac.destination);
      o.start(n); o.stop(n + 0.45);
    } catch (e) { /* le son est facultatif */ }
  }


  // ---------- Qualité ----------
  function starsTxt(q) { return '★★★★★'.slice(0, q) + '☆☆☆☆☆'.slice(0, 5 - q); }
  function starsHtml(q) { return '<span class="qual" aria-label="' + q + ' étoile' + (q > 1 ? 's' : '') + ' sur 5">' + '★★★★★'.slice(0, q) + '<s>' + '★★★★★'.slice(q) + '</s></span>'; }

  // ---------- Mini-jeu de mixage ----------
  var CHANNELS = ['Voix', 'Batterie', 'Basse', 'Synthé'], ZH0 = 0.09, ZH = ZH0;
  var mix = { open: false, act: null, i: 0, acc: [], zones: [], speeds: [], phase: [], t0: 0, raf: 0, pos: 0, done: false, opener: null, faders: [] };
  function knobPos(k, t) { var x = (t * mix.speeds[k] + mix.phase[k]) % 2; x = x < 1 ? x : 2 - x; return 0.04 + 0.92 * x; }
  function openMix(id) {
    if (mix.open || !G.startMix(S, id)) return;
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    mix.open = true; mix.done = false; mix.act = id; mix.i = 0; mix.acc = []; mix.opener = document.activeElement;
    ZH = Math.min(0.2, ZH0 * (G.rdFx(S).mixZone || 1));
    mix.zones = []; mix.speeds = []; mix.phase = [];
    for (var k = 0; k < 4; k++) { mix.zones.push(0.2 + Math.random() * 0.6); mix.speeds.push((0.55 + k * 0.15) * (reduce ? 0.7 : 1)); mix.phase.push(Math.random() * 2); }
    $('mixTitle').textContent = 'Mixer « ' + G.ACT_BY[id].name + ' »';
    var box = $('mixer'); box.innerHTML = ''; mix.faders = [];
    CHANNELS.forEach(function (ch, k) {
      var f = document.createElement('div');
      f.className = 'fader' + (k === 0 ? ' cur' : '');
      f.innerHTML = '<div class="track"><i class="zone"></i><b class="knob"></b></div><span class="ch"></span><span class="acc"></span>';
      f.querySelector('.ch').textContent = ch;
      var z = f.querySelector('.zone'); z.style.bottom = ((mix.zones[k] - ZH) * 100).toFixed(1) + '%'; z.style.height = (ZH * 200).toFixed(1) + '%';
      box.appendChild(f);
      mix.faders.push({ el: f, knob: f.querySelector('.knob'), acc: f.querySelector('.acc') });
    });
    $('mixPlay').hidden = false; $('mixResult').hidden = true;
    setText($('mixStep'), 'Fader 1 sur 4 : ' + CHANNELS[0]);
    $('mixScrim').hidden = false; $('app').inert = true;
    $('mixStop').focus();
    mix.t0 = performance.now();
    cancelAnimationFrame(mix.raf); mix.raf = requestAnimationFrame(mixLoop);
    render();
  }
  function mixLoop(now) {
    if (!mix.open || mix.done) return;
    var k = mix.i, p = knobPos(k, (now - mix.t0) / 1000);
    mix.pos = p;
    mix.faders[k].knob.style.bottom = (p * 100).toFixed(2) + '%';
    mix.raf = requestAnimationFrame(mixLoop);
  }
  function mixStop() {
    if (!mix.open || mix.done) return;
    var k = mix.i, d = Math.abs(mix.pos - mix.zones[k]);
    var acc = d <= ZH ? 1 - 0.3 * d / ZH : Math.max(0, 0.7 - (d - ZH) * 2.5);
    mix.acc.push(acc);
    var f = mix.faders[k];
    f.el.classList.remove('cur'); f.el.classList.add(acc >= 0.7 ? 'done' : 'miss');
    f.acc.textContent = Math.round(acc * 100) + ' %';
    blip(acc >= 0.9 ? 9 : acc >= 0.7 ? 5 : 1);
    mix.i++;
    if (mix.i >= 4) { finishMixGame(); return; }
    mix.faders[mix.i].el.classList.add('cur');
    setText($('mixStep'), 'Fader ' + (mix.i + 1) + ' sur 4 : ' + CHANNELS[mix.i]);
    mix.t0 = performance.now();
  }
  function finishMixGame() {
    mix.done = true; cancelAnimationFrame(mix.raf);
    var score = mix.acc.reduce(function (a, b) { return a + b; }, 0) / mix.acc.length;
    var r = G.finishMix(S, mix.act, score);
    if (!r) { closeMix(); return; }
    $('mixStars').innerHTML = '★★★★★'.slice(0, r.q) + '<s>' + '★★★★★'.slice(r.q) + '</s>';
    setText($('mixVerdict'), ['Mix raté…', 'Un peu brouillon', 'Mix correct', 'Très propre !', 'Mix parfait !'][r.q - 1] + ' (' + Math.round(score * 100) + ' %)');
    setText($('mixGain'), 'Gains ×' + nf2.format(r.m) + ' et +' + Math.round(r.x * 100) + ' % d’expertise sur la production en cours.' +
      (G.chartsOpen(S) ? ' Le titre mixé (' + r.q + '★) est prêt à sortir dans le Top 50.' : ' Les titres mixés pourront sortir dans le Top 50 dès le niveau ' + D.TUNING.chartLevel + '.') +
      (S.orders.active.some(function (o) { return o.act === mix.act && o.q > G.baseQuality(S, mix.act) && r.q >= o.q; }) ? ' Il compte pour ta commande exigeante.' : ''));
    $('mixPlay').hidden = true; $('mixResult').hidden = false;
    $('mixClose').focus();
    markCloud(); saveLocal(); chs.key = '';
    blip(r.q >= 5 ? 12 : 7);
  }
  function closeMix() {
    if (!mix.open) return;
    if (!mix.done) G.cancelMix(S, mix.act);
    mix.open = false; cancelAnimationFrame(mix.raf);
    $('mixScrim').hidden = true; $('app').inert = false;
    var o = mix.opener; mix.opener = null;
    if (o && document.body.contains(o) && !o.closest('[hidden]') && o.focus) { try { o.focus(); } catch (e) { /* facultatif */ } }
    render();
  }







  // ---------- Label ----------
  var lbv = { key: '', cards: {}, wasOpen: null, tv: 'staff' };
  function labelAsks() { return G.labelOpen(S) && S.label.roster.some(function (r) { return r.ask || r.story || r.offer || (r.tour && r.tour.inc); }); }
  function labelOffer() { return G.labelOpen(S) && S.label.roster.some(function (r) { return r.offer; }); }
  // L'onglet Équipe regroupe l'équipe du studio et le label (artistes signés).
  function teamView(v) {
    lbv.tv = (v === 'label' || v === 'disco') && G.labelOpen(S) ? v : 'staff';
    $('teamSeg').querySelectorAll('[data-tv]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-tv') === lbv.tv)); });
    team.key = ''; lbv.key = '';
    renderTeam(true); renderLabel(true);
  }
  var GENRE_COL = { rap: '#e0663d', pop: '#e04f8f', electro: '#3d7be0', lofi: '#7a8fa8', chanson: '#b8743a', afro: '#d99a20', rnb: '#8e4fd1', trap: '#5a5f6b', rock: '#c0392b', jazz: '#2e8b78', kpop: '#ff6fb1', bo: '#4a6fb0' };
  function moodTxt(m) { return m >= 80 ? ['Ravi', 4] : m >= 60 ? ['Content', 3] : m >= 40 ? ['Partagé', 2] : m >= 20 ? ['Frustré', 1] : ['En colère', 0]; }
  function artName(id) { return G.ART_BY[id] ? G.ART_BY[id].name : ''; }
  function artInitials(n) { return n.split(/[\s&]+/).filter(Boolean).slice(0, 2).map(function (w) { return w.charAt(0).toUpperCase(); }).join(''); }
  function renderLabel(force) {
    var open = G.labelOpen(S), L = S.label, onTeamV = $('app').getAttribute('data-view') === 'team', onCh = onTeamV && lbv.tv === 'label';
    if (lbv.wasOpen === false && open && !quiet) toast('Nouveau : ton label ! Signe des artistes et produis leurs albums depuis l’onglet Équipe.', 7000);
    lbv.wasOpen = open;
    if (!open && lbv.tv !== 'staff') lbv.tv = 'staff';
    setHidden($('teamSeg'), !open);
    setHidden($('labelBox'), !open || lbv.tv !== 'label');
    setHidden($('discoBox'), !open || lbv.tv !== 'disco');
    setHidden($('teamSegDot'), !labelAsks() || lbv.tv === 'label');
    if (open && lbv.tv === 'disco' && (onTeamV || force)) renderDisco();
    if (!open || (!onCh && !force)) return;
    var cap = G.labelCap(S), avail = G.ARTISTS.filter(function (a) { return G.artistAvailable(S, a); });
    setText($('labelChip'), L.roster.length + ' / ' + cap + ' artiste' + (cap > 1 ? 's' : ''));
    setText($('labelNote'), L.roster.length
      ? 'Leur notoriété ajoute +' + nf1.format((G.labelMult(S) - 1) * 100) + ' % à tous tes gains. Respecte leur genre et leurs goûts : un artiste content progresse plus vite.'
      : 'Signe un artiste, puis produis ses albums avec l’outil de projet de création. Ses albums font grimper sa notoriété, qui dope les ventes et tous tes gains.');
    var key = JSON.stringify(L.roster.map(function (r) { return [r.id, Math.round(r.fame), Math.round(r.mood), !!r.ask, r.albums, !!r.story, r.style, r.duo, r.offer && r.offer.lab, r.tour ? r.tour.i + (r.tour.inc ? r.tour.inc.id : '') : r.tcd > 0, r.tours]; })) + '|' + avail.map(function (a) { return a.id; }).join(',') + '|' + cap + '|' + !!S.proj.cur;
    if (key !== lbv.key) {
      lbv.key = key; lbv.cards = {};
      $('labelRoster').innerHTML = L.roster.map(function (r) {
        var a = G.ART_BY[r.id], mt = moodTxt(r.mood), last = r.disco[0];
        var vn = D.VENUES[G.venueIndex(r)];
        var tl = r.tourLast;
        return '<article class="card artist' + (r.ask ? ' ask' : '') + (r.story ? ' story' : '') + (r.offer ? ' offer' : '') + (r.tour ? ' touring' : '') + '" data-aid="' + r.id + '">' +
          '<div class="a-head"><span class="a-av" style="--ac:' + (GENRE_COL[a.genre] || '#777') + '" aria-hidden="true">' + esc(artInitials(a.name)) + '</span><div><b>' + esc(a.name) + '</b><small>' + esc(G.PJ_G[a.genre].name) + ' · aime ' + a.likes.map(function (m) { return esc(G.PJ_M[m].name.toLowerCase()); }).join(' et ') + '</small></div><span class="a-mood m' + mt[1] + '">' + mt[0] + '</span></div>' +
          '<div class="a-fame"><span>Notoriété</span><span class="meter" aria-hidden="true"><i style="width:' + r.fame + '%"></i></span><b>' + Math.round(r.fame) + '</b></div>' +
          (r.tour ? '<p class="a-tour" data-k="tour"></p>' + (r.tour.inc ? '<p class="a-offer">Imprévu : ' + esc(G.ltourText(S, r, G.LT_INC[r.tour.inc.id].title)) + '</p>' : '') : '<p class="' + (r.ask ? 'a-ask' : 'a-line') + '" data-k="when"></p>') +
          (r.offer ? '<p class="a-offer" data-k="offer"></p>' : '') +
          (r.story ? '<p class="a-story">' + esc(artName(r.id)) + ' a quelque chose à te dire.</p>' : '') +
          (r.style || r.duo ? '<p class="a-line">' + (r.style ? 'Prochain album : envie de ' + esc(G.PJ_G[r.style].name) + '. ' : '') + (r.duo ? 'Duo prévu avec ' + esc(artName(r.duo)) + '.' : '') + '</p>' : '') +
          (tl && !r.tour ? '<p class="a-line">Dernière tournée (' + esc(G.COUNTRY_BY[tl.c] ? G.COUNTRY_BY[tl.c].name : '') + ') : ' + tl.ok + '/' + tl.n + ' dates réussies, +' + eur(tl.cash) + ', notoriété ' + (tl.fame >= 0 ? '+' : '') + Math.round(tl.fame) + '</p>' : '') +
          (last ? '<p class="a-line">Dernier album : « ' + esc(last.t) + ' » ' + nf1.format(last.avg) + '/10' + (last.pos ? ', entré n°' + last.pos : '') + ' · ' + r.albums + ' album' + (r.albums > 1 ? 's' : '') + '</p>' : '<p class="a-line">Pas encore d’album sur ton label.</p>') +
          '<div class="proj-row">' + (r.tour ? (r.tour.inc ? '<button class="btn sm primary" type="button" data-art="inc" data-id="' + r.id + '">Répondre</button>' : '') :
          '<button class="btn sm' + (r.ask ? ' primary' : '') + '" type="button" data-art="album" data-id="' + r.id + '"' + (S.proj.cur ? ' disabled' : '') + '>' + (S.proj.cur ? 'Un projet est déjà en cours' : 'Préparer son album') + '</button>') +
          (r.offer ? '<button class="btn sm primary" type="button" data-art="offer" data-id="' + r.id + '">Répondre</button>' : '') +
          (r.story ? '<button class="btn sm primary" type="button" data-art="story" data-id="' + r.id + '">L’écouter</button>' : '') +
          (r.tour ? '' : '<button class="btn sm" type="button" data-art="concert" data-id="' + r.id + '"><span data-k="cc">Concert</span></button>' +
          '<button class="btn sm" type="button" data-art="ltour" data-id="' + r.id + '"><span data-k="lt">Tournée</span></button>') + '</div></article>';
      }).join('');
      lbv.offers = {};
      L.roster.forEach(function (r) { var cd = $('labelRoster').querySelector('[data-aid="' + r.id + '"]'); lbv.cards[r.id] = cd.querySelector('[data-k="when"]'); lbv.offers[r.id] = cd.querySelector('[data-k="offer"]'); lbv.cc = lbv.cc || {}; lbv.cc[r.id] = cd.querySelector('[data-art="concert"]'); lbv.lt = lbv.lt || {}; lbv.lt[r.id] = cd.querySelector('[data-art="ltour"]'); lbv.tr = lbv.tr || {}; lbv.tr[r.id] = cd.querySelector('[data-k="tour"]'); });
      setHidden($('labelScoutT'), !avail.length);
      var full = L.roster.length >= cap, cost = G.artistCost(S);
      $('labelScouts').innerHTML = avail.map(function (a) {
        return '<article class="card scout"><div><b>' + esc(a.name) + ' · ' + esc(G.PJ_G[a.genre].name) + '</b><p>' + esc(a.bio) + ' ' + (a.contact ? 'Rencontré en sortie de studio.' : 'Repéré par ton réseau.') + '</p></div>' +
          '<button class="btn sm primary" type="button" data-art="sign" data-id="' + a.id + '"' + (full ? ' disabled' : '') + '><span>Signer</span><span class="p">' + eur(cost) + '</span></button></article>';
      }).join('');
      var hidden = G.ARTISTS.filter(function (a) { return !G.artistOf(S, a.id) && !G.artistAvailable(S, a) && !G.goneOf(S, a.id); }).length;
      var gone = L.gone.map(function (g) { return artName(g.id) + ' (' + g.lab + ')'; });
      setText($('labelMore'), (avail.length && full ? 'Ton lieu actuel accueille ' + cap + ' artiste' + (cap > 1 ? 's' : '') + ' : emménage plus grand pour en signer d’autres. ' : '') +
        (hidden ? hidden + ' autre' + (hidden > 1 ? 's' : '') + ' talent' + (hidden > 1 ? 's' : '') + ' à découvrir en sortie de studio ou en faisant grandir ton studio. ' : '') +
        (gone.length ? 'Sous contrat ailleurs pour l’instant : ' + gone.join(', ') + '.' : ''));
    }
    L.roster.forEach(function (r) {
      var oe = lbv.offers && lbv.offers[r.id];
      if (oe && r.offer) setText(oe, r.offer.lab + ' veut signer ' + artName(r.id) + ' · réponds avant ' + clock(r.offer.left));
      var te = lbv.tr && lbv.tr[r.id];
      if (te && r.tour) { var T0 = r.tour, left = (T0.cities.length - T0.i) * G.legTime(T0) - T0.t; setText(te, 'En tournée · ' + T0.cities[T0.i] + ' (' + (T0.i + 1) + '/' + T0.cities.length + ') · retour dans ' + clock(left)); }
      var el = lbv.cards[r.id]; if (!el) return;
      var busy = S.proj.cur && S.proj.cur.artist === r.id;
      setText(el, busy ? 'Son album est en cours de production.' : r.ask ? artName(r.id) + ' veut sortir un album · reste ' + clock(r.ask.left) : 'Prochaine envie d’album dans ' + clock(r.cd) + '.');
    });
    L.roster.forEach(function (r) {
      var lb = lbv.lt && lbv.lt[r.id]; if (!lb) return;
      var rd = G.ltourReady(S, r);
      setText(lb.firstChild, rd ? 'Tournée' : r.tcd > 0 ? 'Tournée dans ' + clock(r.tcd) : 'Tournée');
      setDisabled(lb, !rd);
    });
    L.roster.forEach(function (r) {
      var b = lbv.cc && lbv.cc[r.id]; if (!b) return;
      var ok = G.concertReady(S, r), vn = D.VENUES[G.venueIndex(r)];
      setText(b.firstChild, ok ? 'Concert · ' + ({ bar: 'bar', quartier: 'quartier', salle: 'grande salle', zenith: 'Zénith', stade: 'stade' }[vn.id] || vn.name) : 'Concert dans ' + clock(r.ccd)); b.title = vn.name;
      setDisabled(b, !ok || cl.open);
    });
    $('labelScouts').querySelectorAll('[data-art="sign"]').forEach(function (b) { setDisabled(b, L.roster.length >= cap || S.money < G.artistCost(S)); });
  }
  function bindLabel() {
    $('labelBox').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-art]'); if (!b || b.disabled) return;
      var id = b.getAttribute('data-id');
      var what = b.getAttribute('data-art');
      if (what === 'sign') { if (G.signArtist(S, id)) { saveLocal(); markCloud(); lbv.key = ''; renderLabel(true); render(); } }
      else if (what === 'concert') { var cc = G.startConcert(S, id); if (cc) openClash(cc); }
      else if (what === 'story') openStory(id);
      else if (what === 'offer') openOffer(id);
      else if (what === 'ltour') openLtour(id);
      else if (what === 'inc') openIncident(id);
      else openProj(id);
    });
  }

  // ---------- Tournées locales ----------
  var ltv = { open: false, id: null, opener: null, size: 'nationale', tr: 'bus', set: 'classiques' };
  function ltSeg(box, list, cur, key) {
    box.innerHTML = list.map(function (x) { return '<button type="button" data-' + key + '="' + x.id + '" aria-pressed="' + (x.id === cur) + '"><span>' + esc(x.name) + '</span><small>' + esc(x.desc || (x.n + ' villes')) + '</small></button>'; }).join('');
  }
  function ltPreview() {
    var p = G.ltourPreview(S, ltv.id, ltv.size, ltv.tr, ltv.set); if (!p) return;
    var C = G.homeCountry(S), cells = [['Coût', eur(p.cost)], ['Durée', away(p.time)], ['Villes', p.n + ', finale à ' + C.cities[C.cities.length - 1]],
      ['Réussite par date', Math.round(p.ok * 100) + ' %'], ['Gains estimés', '+' + eur(p.cash)], ['Notoriété estimée', (p.fame >= 0 ? '+' : '') + Math.round(p.fame)]];
    $('ltPrev').innerHTML = cells.map(function (c) { return '<div><span>' + esc(c[0]) + '</span><b>' + esc(c[1]) + '</b></div>'; }).join('');
    var ok = S.money >= p.cost;
    setDisabled($('ltGo'), !ok);
    setText($('ltGoS'), ok ? artName(ltv.id) + ' sera indisponible ' + away(p.time) + ' (albums, concerts)' : 'Il te manque ' + eur(p.cost - S.money));
  }
  function openLtour(id) {
    var r = G.artistOf(S, id);
    if (!r || ltv.open || !G.ltourReady(S, r)) return;
    ltv.open = true; ltv.id = id; ltv.opener = document.activeElement;
    var C = G.homeCountry(S);
    setText($('ltCountry'), C.name);
    $('ltTitle').textContent = artName(id) + ' part sur les routes';
    $('ltText').textContent = 'Choisis la tournée de ' + artName(id) + ' à travers le pays (' + C.name + '). La tournée continue même quand tu n’es pas là ; des imprévus t’attendront en route. Plus l’artiste est connu et de bonne humeur, plus les dates réussissent.';
    ltSeg($('ltSize'), G.LTOUR.sizes, ltv.size, 'lsz'); ltSeg($('ltTr'), G.LTOUR.transports, ltv.tr, 'ltr'); ltSeg($('ltSet'), G.LTOUR.sets, ltv.set, 'lst');
    ltPreview();
    $('ltScrim').hidden = false; $('app').inert = true; $('tabs').inert = true;
    $('ltGo').focus();
  }
  function closeLtour() {
    if (!ltv.open) return;
    ltv.open = false;
    $('ltScrim').hidden = true; $('app').inert = false; $('tabs').inert = false;
    var o = ltv.opener; ltv.opener = null;
    if (o && document.body.contains(o) && !o.closest('[hidden]') && o.focus) { try { o.focus(); } catch (e) { /* facultatif */ } }
    lbv.key = ''; render();
  }
  function bindLtour() {
    $('ltScrim').addEventListener('click', function (e) {
      if (e.target === $('ltScrim')) { closeLtour(); return; }
      var b = e.target.closest('button[data-lsz],button[data-ltr],button[data-lst]'); if (!b) return;
      if (b.hasAttribute('data-lsz')) ltv.size = b.getAttribute('data-lsz');
      if (b.hasAttribute('data-ltr')) ltv.tr = b.getAttribute('data-ltr');
      if (b.hasAttribute('data-lst')) ltv.set = b.getAttribute('data-lst');
      b.parentNode.querySelectorAll('button').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      ltPreview();
    });
    $('ltGo').addEventListener('click', function () {
      var t = G.startLtour(S, ltv.id, ltv.size, ltv.tr, ltv.set);
      if (!t) return;
      saveLocal(); markCloud(); blip(10);
      toast(artName(ltv.id) + ' part en tournée : ' + t.cities.join(', ') + '.', 6000);
      closeLtour();
    });
    $('ltClose').addEventListener('click', closeLtour);
    document.addEventListener('keydown', function (e) { if (ltv.open && e.key === 'Escape') { e.preventDefault(); closeLtour(); } });
  }
  // Imprévu en tournée: même fenêtre que les histoires, deux réponses.
  function openIncident(id) {
    var r = G.artistOf(S, id), inc = r && r.tour && r.tour.inc, x = inc && G.LT_INC[inc.id];
    if (!x || stv.open) return;
    stv.open = true; stv.id = id; stv.kind = 'inc'; stv.opener = document.activeElement;
    setText($('stWho'), artName(id) + ' en tournée');
    $('stTitle').textContent = G.ltourText(S, r, x.title);
    $('stText').textContent = G.ltourText(S, r, x.text) + ' Sans réponse avant ' + clock(inc.left) + ', l’équipe de tournée choisira « ' + x.choices[x.def].text.toLowerCase() + ' ».';
    var box = $('stChoices'); box.innerHTML = ''; var first = null;
    x.choices.forEach(function (c, i) {
      var cost = c.fx.cost ? G.eventRef(S) * c.fx.cost : 0, ok = S.money >= cost, b = document.createElement('button');
      b.type = 'button'; b.className = 'btn choice'; b.setAttribute('data-ic', i); b.disabled = !ok;
      b.innerHTML = '<span class="k"></span><span class="cw"><span class="ct"></span><span class="tags"></span></span>';
      b.querySelector('.k').textContent = 'AB'.charAt(i); b.querySelector('.ct').textContent = c.text;
      var tg = b.querySelector('.tags'), tags = [];
      if (cost) tags.push(['cost' + (ok ? '' : ' short'), 'Coûte ' + eur(cost)]);
      if (c.fx.risk) tags.push(['risk', 'Risqué · ' + Math.round(c.fx.risk * 100) + ' % de réussite']);
      if (c.fx.delay) tags.push(['', 'Retard ' + dur(c.fx.delay)]);
      if (c.fx.skip) tags.push(['', 'Date annulée']);
      tags.forEach(function (x2) { var sp = document.createElement('span'); sp.className = 'tag ' + x2[0]; sp.textContent = x2[1]; tg.appendChild(sp); });
      if (!tags.length) tg.remove();
      if (ok && !first) first = b;
      box.appendChild(b);
    });
    $('stAsk').hidden = false; $('stDone').hidden = true;
    $('storyScrim').hidden = false; $('app').inert = true; $('tabs').inert = true;
    (first || $('stLater')).focus();
  }
  function incidentDone(res) {
    var vd = $('stVerdict');
    vd.hidden = res.win === null;
    if (res.win !== null) { vd.textContent = res.win ? 'Ça passe !' : 'Ça casse…'; vd.className = 'ev-verdict ' + (res.win ? 'win' : 'loss'); }
    $('stOut').textContent = res.skip ? 'La date est annulée : ' + artName(stv.id) + ' se repose avant la suite.' : res.delay ? 'La tournée prend un peu de retard.' : 'La tournée continue.';
    var rows = [];
    if (res.cost) rows.push(['Dépense', '−' + eur(res.cost)]);
    if (res.fame) rows.push(['Notoriété', (res.fame > 0 ? '+' : '') + Math.round(res.fame)]);
    if (res.mood) rows.push(['Humeur', (res.mood > 0 ? '+' : '') + Math.round(res.mood)]);
    if (res.delay) rows.push(['Retard', dur(res.delay)]);
    var box = $('stReward'); box.innerHTML = '';
    rows.forEach(function (r, k) {
      var row = document.createElement('div'); row.className = 'rw'; row.style.setProperty('--d', (0.2 + k * 0.4) + 's');
      row.innerHTML = '<span class="rl"></span><b class="rv"></b>'; row.firstChild.textContent = r[0]; row.lastChild.textContent = r[1];
      box.appendChild(row);
    });
    $('stAsk').hidden = true; $('stDone').hidden = false; $('stClose').focus();
    blip(8); saveLocal(); markCloud();
  }

  // ---------- Souvenirs et globe des tournées ----------
  var CTRY_COL = { fr: '#2f5fb3', uk: '#b3263a', us: '#1f3c88', jp: '#c4122f', br: '#1f8a4c', ng: '#0f7a3b', de: '#3a3a3a' };
  function souvenirList() {
    var out = [];
    Object.keys(S.world.souv).forEach(function (id) { var d = G.WDATE_BY[id]; if (d) out.push({ id: id, title: d.city, sub: d.venue.replace(/^l[ea’] ?|^les /i, '').replace(/^./, function (c) { return c.toUpperCase(); }), kicker: 'TOURNÉE MONDIALE', bg: CTRY_COL[d.c] || '#5b3fc4' }); });
    var v = G.visited(S);
    Object.keys(v).forEach(function (c) { var n = v[c].cities.length; if (n) out.push({ id: 'lt-' + c, title: G.COUNTRY_BY[c].name, sub: n + ' ville' + (n > 1 ? 's' : ''), kicker: 'TOURNÉE LOCALE', bg: CTRY_COL[c] || '#7a5cd6' }); });
    return out;
  }
  function globeOn() { var v = G.visited(S); return G.worldOpen(S) || Object.keys(v).some(function (c) { return v[c].cities.length || v[c].dates.length; }); }
  var glv = { open: false, ctl: null, sel: null, opener: null };
  function globeInfo() {
    var v = G.visited(S), vis = {}, cities = [], stars = [];
    Object.keys(v).forEach(function (c) {
      if (v[c].cities.length || v[c].dates.length || v[c].based) vis[c] = 1;
      v[c].cities.forEach(function (n) { var p = D.GEO.cities[n]; if (p) cities.push(p); });
      v[c].dates.forEach(function (id) { var d = G.WDATE_BY[id], p = d && D.GEO.cities[d.city]; if (p) stars.push(p); });
    });
    return { visited: vis, home: S.world.home, sel: glv.sel, cities: cities, stars: stars };
  }
  function globeRender() {
    var v = G.visited(S), info = globeInfo(), nv = Object.keys(info.visited).length, nc = Object.keys(S.label.cities).length, nd = G.souvenirs(S);
    setText($('glSum'), nv + ' pays · ' + nc + ' ville' + (nc > 1 ? 's' : '') + ' · ' + nd + ' date' + (nd > 1 ? 's' : '') + ' mondiale' + (nd > 1 ? 's' : ''));
    $('glChips').innerHTML = D.WORLD.countries.map(function (c) {
      var cls = c.id === S.world.home ? 'h' : info.visited[c.id] ? 'v' : '';
      return '<button type="button" class="' + cls + '" data-gc="' + c.id + '" aria-pressed="' + (glv.sel === c.id) + '">' + esc(c.name) + '</button>';
    }).join('');
    var c = glv.sel && G.COUNTRY_BY[glv.sel], x = c && v[c.id];
    if (!c) $('glInfo').innerHTML = '<p style="margin:0">Ton studio est basé en <b>' + esc(G.homeCountry(S).name) + '</b>. Les tournées locales de tes artistes et les dates de la tournée mondiale colorent la carte, et chaque carrière peut te faire déménager.</p>';
    else {
      var lines = [];
      if (c.id === S.world.home) lines.push('Ton studio est installé ici pour cette carrière.');
      else if (x && x.based) lines.push('Ton studio a été installé ici lors d’une carrière passée.');
      if (x && x.cities.length) lines.push('Tournées locales : ' + x.cities.length + ' ville' + (x.cities.length > 1 ? 's' : '') + ' (' + x.cities.join(', ') + ').');
      if (x && x.dates.length) lines.push('Tournée mondiale : ' + x.dates.map(function (id) { var d = G.WDATE_BY[id]; return d.city + ', ' + d.venue; }).join(' · ') + '.');
      if (!lines.length) lines.push(D.WORLD.dates.some(function (d) { return d.c === c.id; }) ? 'Pas encore visité. Une date de la tournée mondiale peut t’y emmener, et y installer ton studio ouvrira ses villes aux tournées locales.' : 'Pas encore visité.');
      $('glInfo').innerHTML = '<h3>' + esc(c.name) + '</h3>' + lines.map(function (l) { return '<p>' + esc(l) + '</p>'; }).join('');
    }
    if (glv.ctl) glv.ctl.set(info);
  }
  window.__glv = glv;
  function openGlobe() {
    if (glv.open) return;
    glv.open = true; glv.opener = document.activeElement; glv.sel = null;
    $('globeScrim').hidden = false; $('app').inert = true; $('tabs').inert = true; if (S3) S3.paused = true;
    if (!glv.ctl && S3 && S3.globe) glv.ctl = S3.globe($('glCanvas'), function (c, la, lo) { glv.sel = c; glv.last = [la, lo]; globeRender(); });
    if (glv.ctl) { glv.ctl.resize(); var h = D.GEO.cities[G.homeCountry(S).cities[G.homeCountry(S).cities.length - 1]]; if (h) glv.ctl.focus(h[0], h[1]); }
    globeRender();
    $('glClose').focus();
  }
  function closeGlobe() {
    if (!glv.open) return;
    glv.open = false;
    if (glv.ctl) { glv.ctl.dispose(); glv.ctl = null; }
    $('globeScrim').hidden = true; $('app').inert = false; $('tabs').inert = false; if (S3) S3.paused = false;
    var o = glv.opener; glv.opener = null;
    if (o && document.body.contains(o) && !o.closest('[hidden]') && o.focus) { try { o.focus(); } catch (e) { /* facultatif */ } }
  }
  function bindGlobe() {
    $('glClose').addEventListener('click', closeGlobe);
    $('wtGlobe').addEventListener('click', openGlobe);
    $('globeScrim').addEventListener('click', function (e) { if (e.target === $('globeScrim')) closeGlobe(); });
    $('glIn').addEventListener('click', function () { if (glv.ctl) glv.ctl.zoom(0.85); });
    $('glOut').addEventListener('click', function () { if (glv.ctl) glv.ctl.zoom(1.18); });
    $('glChips').addEventListener('click', function (e) {
      var b = e.target.closest('[data-gc]'); if (!b) return;
      var c = G.COUNTRY_BY[b.getAttribute('data-gc')]; glv.sel = c.id;
      var p = D.GEO.cities[c.cities[c.cities.length - 1]]; if (p && glv.ctl) glv.ctl.focus(p[0], p[1]);
      globeRender();
    });
    document.addEventListener('keydown', function (e) { if (glv.open && e.key === 'Escape') { e.preventDefault(); closeGlobe(); } });
    window.addEventListener('resize', function () { if (glv.open && glv.ctl) glv.ctl.resize(); });
  }

  // ---------- Discographie du label ----------
  function renderDisco() {
    var dg = G.discography(S), L = S.label;
    var key = dg.list.length + '|' + (dg.list[0] ? dg.list[0].t : '') + '|' + L.roster.map(function (r) { return r.id; }).join(',') + '|' + L.gone.length;
    if (key === lbv.dkey) return;
    lbv.dkey = key;
    var cards = [['Albums', String(dg.count)], ['Meilleure note', dg.best ? nf1.format(dg.best.avg) + '/10' : '–'], ['Entrées top 10', String(dg.top10)], ['Numéros 1', String(dg.n1)]];
    $('discoSum').innerHTML = cards.map(function (c) { return '<div class="card"><span class="lbl">' + esc(c[0]) + '</span><b>' + esc(c[1]) + '</b></div>'; }).join('');
    $('discoList').innerHTML = dg.list.map(function (x) {
      var a = G.ART_BY[x.a], name = a ? a.name : 'Artiste', g = x.g || (a && a.genre), here = a && G.artistOf(S, a.id), gone = a && G.goneOf(S, a.id);
      return '<li><span class="cv" style="--ac:' + (GENRE_COL[g] || '#777') + '" aria-hidden="true">' + esc(artInitials(x.t)) + '</span>' +
        '<div><b>' + esc(x.t) + '</b><small>' + esc(name) + (g && G.PJ_G[g] ? ' · ' + esc(G.PJ_G[g].name) : '') + (x.w ? ' · semaine ' + x.w : '') + '</small>' +
        (here ? '' : '<small class="gone">' + (gone ? 'Parti chez ' + esc(gone.lab) : 'N’est plus sur ton label') + '</small>') + '</div>' +
        '<span class="nt">' + nf1.format(x.avg) + '<small>/10</small><small>' + (x.pos ? 'entré n°' + x.pos : 'hors classement') + '</small></span></li>';
    }).join('');
    setText($('discoNote'), dg.list.length ? 'Les ' + Math.min(80, dg.list.length) + ' derniers albums de ton label, du plus récent au plus ancien.' : 'Aucun album pour l’instant : prépare l’album d’un de tes artistes depuis la vue Label.');
  }
  // Silhouette 3D d'un artiste: apparence stable tirée de son identifiant.
  function artistLook(id) {
    var h = 7; for (var i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    return { s: h % 8, h: (h >> 3) % 8, c: (h >> 6) % 16, y: (h >> 10) % 4 };
  }

  // ---------- Tendances de la semaine ----------
  var RULE_TXT = { rapide: ['Tempo rapide', 'Les clashs vont 10 % plus vite, et la victoire rapporte 25 % de plus.'], 'sans-clap': ['Sans clap', 'La piste Clap reste muette pendant les clashs : concentre-toi sur les trois autres.'], prime: ['Grosse prime', 'Les victoires en clash rapportent 50 % de plus.'] };
  var trv = { key: '' };
  function renderTrends() {
    var tr = G.trendFor(S);
    setHidden($('trendCard'), !tr);
    if (!tr) return;
    setText($('trendLeft'), 'Nouvelles tendances dans ' + clock(S.charts.left));
    var key = JSON.stringify(tr) + G.battleOpen(S) + G.projOpen(S);
    if (key === trv.key) return;
    trv.key = key;
    var A = G.ACT_BY[tr.act], T = D.TUNING, rows = [];
    rows.push(['🔥', A.name + ' en vogue', 'Gains de cette production +' + Math.round((T.trendAct - 1) * 100) + ' %, et ses commandes clients sont plus nombreuses et mieux payées (+' + Math.round((T.trendOrderReward - 1) * 100) + ' %).']);
    rows.push(['🎧', 'Le public veut du ' + G.PJ_G[tr.g].name + ' sur le thème « ' + G.PJ_M[tr.m].name.toLowerCase() + ' »', G.projOpen(S) ? 'Un projet de création dans ce genre ou cette ambiance plaît davantage aux critiques et se vend mieux.' : 'Les projets de création s’ouvriront au niveau ' + T.projLevel + '.']);
    if (G.battleOpen(S)) rows.push(['🥁', 'Clash : ' + RULE_TXT[tr.rule][0], RULE_TXT[tr.rule][1]]);
    $('trendList').innerHTML = rows.map(function (r) { return '<li><i aria-hidden="true">' + r[0] + '</i><div><b>' + esc(r[1]) + '</b><span>' + esc(r[2]) + '</span></div></li>'; }).join('');
  }

  // ---------- Atelier de décoration ----------
  var dv = { open: false, opener: null };
  function decoCups() { var n = 0; G.TROPHIES.forEach(function (t) { if ((S.trophies[t.id] || 0) >= 3 || (t.levels.length < 3 && (S.trophies[t.id] || 0) >= t.levels.length)) n++; }); return n; }
  function decoView() {
    var o = {};
    G.DECO.slots.forEach(function (s) { var x = G.decoOpt(s.id, S.deco[s.id]); if (x && x.v !== undefined) o[s.id] = x.v; });
    o.cups = Math.min(8, decoCups());
    return o;
  }
  function hexCss(n) { return '#' + ('000000' + n.toString(16)).slice(-6); }
  function swatch(slot, o) {
    var v = o.v;
    if (v === undefined) return '';
    if (slot === 'wall' || slot === 'rug') return 'linear-gradient(135deg,' + hexCss(v[0]) + ' 0 55%,' + hexCss(v[1]) + ' 55%)';
    if (slot === 'light') return 'radial-gradient(circle at 50% 30%,' + hexCss(v) + ', #3a3d45)';
    if (slot === 'floor') return v[0] === 'wood' ? 'repeating-linear-gradient(90deg,' + v[1] + ' 0 18px,' + v[2] + ' 18px 20px)' : v[0] === 'marble' ? 'linear-gradient(135deg,#f2efe9,#d9d5cf 60%,#ece8e2)' : 'linear-gradient(135deg,#a9a49b,#8f8a82)';
    if (slot === 'neon') return '#1b1d22';
    return '';
  }
  var NEON_GLYPH = { text: 'PM', note: '♫', heart: '♥', bolt: 'ϟ', star: '★' };
  function renderDeco() {
    var box = $('decoSlots'), fresh = {};
    G.decoNew(S).forEach(function (k) { fresh[k] = 1; });
    var n = decoCups();
    setText($('decoCups'), 'Ton étagère expose ' + Math.min(8, n) + ' coupe' + (n > 1 ? 's' : '') + ' sur 8 : une par famille du palmarès décrochée au niveau Or.');
    box.innerHTML = G.DECO.slots.map(function (s) {
      return '<section class="deco-slot"><h3>' + esc(s.name) + '</h3><div class="deco-opts" role="group" aria-label="' + esc(s.name) + '">' + s.options.map(function (o) {
        var ok = G.decoUnlocked(S, s.id, o.id), on = S.deco[s.id] === o.id, pr = G.decoProgress(S, s.id, o.id), sw = swatch(s.id, o);
        var glyph = s.id === 'neon' && o.v ? '<span style="color:' + o.v.c + '">' + NEON_GLYPH[o.v.k] + '</span>' : '';
        return '<button type="button" class="dopt" data-slot="' + s.id + '" data-opt="' + o.id + '" aria-pressed="' + on + '"' + (ok ? '' : ' disabled') + '>' +
          (fresh[s.id + ':' + o.id] ? '<span class="new">Nouveau</span>' : '') +
          '<span class="sw" style="' + (sw ? '--sw:' + sw : '') + '" aria-hidden="true">' + glyph + '</span>' +
          '<span>' + esc(o.name) + '</span>' +
          (ok ? (on ? '<small>Installé</small>' : '<small>' + (o.need ? 'Débloqué' : 'Offert') + '</small>') : '<small>' + esc(o.need.t) + '</small><span class="meter" aria-hidden="true"><i style="width:' + Math.round(pr.v / pr.n * 100) + '%"></i></span>') +
          '</button>';
      }).join('') + '</div></section>';
    }).join('');
  }
  function openDeco() {
    if (dv.open) return;
    dv.open = true; dv.opener = document.activeElement;
    renderDeco();
    G.seeDeco(S); saveLocal();
    $('decoScrim').hidden = false; $('app').inert = true; $('tabs').inert = true;
    $('decoScrim').querySelector('.sheet').scrollTop = 0;
    var first = $('decoSlots').querySelector('.dopt[aria-pressed="true"]'); (first || $('decoClose')).focus();
  }
  function closeDeco() {
    if (!dv.open) return;
    dv.open = false;
    $('decoScrim').hidden = true; $('app').inert = false; $('tabs').inert = false;
    var o = dv.opener; dv.opener = null;
    if (o && document.body.contains(o) && !o.closest('[hidden]') && o.focus) { try { o.focus(); } catch (e) { /* facultatif */ } }
    render();
  }
  function bindDeco() {
    $('decoSlots').addEventListener('click', function (e) {
      var b = e.target.closest('.dopt'); if (!b || b.disabled) return;
      var slot = b.getAttribute('data-slot'), id = b.getAttribute('data-opt');
      if (G.setDeco(S, slot, id)) {
        saveLocal(); markCloud(); blip(6);
        renderDeco(); renderScene(true);
        var nb = $('decoSlots').querySelector('[data-slot="' + slot + '"][data-opt="' + id + '"]'); if (nb) nb.focus();
      }
    });
    $('decoClose').addEventListener('click', closeDeco);
    $('decoScrim').addEventListener('click', function (e) { if (e.target === $('decoScrim')) closeDeco(); });
    document.addEventListener('keydown', function (e) { if (dv.open && e.key === 'Escape') { e.preventDefault(); closeDeco(); } });
  }

  // ---------- Atelier piano ----------
  // Notes MIDI de do4 à sol5; touches du clavier selon la position physique (QWERTY comme AZERTY).
  var PI_LOW = 60, PI_HIGH = 79, PI_SCALE = [60, 62, 64, 67, 69, 72, 74, 76];
  var PI_CODES = { KeyA: 60, KeyW: 61, KeyS: 62, KeyE: 63, KeyD: 64, KeyF: 65, KeyT: 66, KeyG: 67, KeyY: 68, KeyH: 69, KeyU: 70, KeyJ: 71, KeyK: 72, KeyO: 73, KeyL: 74, KeyP: 75, Semicolon: 76, Quote: 77 };
  var PI_NAMES = ['Do', 'Do♯', 'Ré', 'Ré♯', 'Mi', 'Fa', 'Fa♯', 'Sol', 'Sol♯', 'La', 'La♯', 'Si'];
  var pi = { open: false, mode: 'tiles', state: 'idle', tiles: null, songName: '', result: '', timers: [], keys: {}, labels: {}, gain: null, opener: null, built: false };
  function piBlack(n) { return [1, 3, 6, 8, 10].indexOf(n % 12) >= 0; }
  function piBuild() {
    var box = $('piKeys'); box.innerHTML = ''; pi.keys = {};
    var wi = 0, whites = 0;
    for (var n = PI_LOW; n <= PI_HIGH; n++) if (!piBlack(n)) whites++;
    for (var m = PI_LOW; m <= PI_HIGH; m++) {
      var b = document.createElement('button'), black = piBlack(m);
      b.type = 'button'; b.className = black ? 'bk' : 'wk'; b.setAttribute('data-n', m);
      b.setAttribute('aria-label', PI_NAMES[m % 12] + ' ' + Math.floor(m / 12 - 1));
      b.innerHTML = '<small class="kl"></small>' + (black ? '' : '<span>' + PI_NAMES[m % 12] + '</span>');
      if (black) b.style.left = 'calc(8px + (100% - 16px) / ' + whites + ' * ' + wi + ')';
      else wi++;
      box.appendChild(b); pi.keys[m] = b;
    }
    piLabels();
    pi.built = true;
  }
  function piLabels() {
    function apply(map) {
      Object.keys(PI_CODES).forEach(function (code) {
        var k = pi.keys[PI_CODES[code]]; if (!k) return;
        var l = map ? map.get(code) : code.replace('Key', '').replace('Semicolon', ';').replace('Quote', '\'');
        k.querySelector('.kl').textContent = l ? String(l).toUpperCase() : '';
      });
    }
    apply(null);
    try { if (navigator.keyboard && navigator.keyboard.getLayoutMap) navigator.keyboard.getLayoutMap().then(apply, function () { /* étiquettes QWERTY */ }); } catch (e) { /* étiquettes QWERTY */ }
  }
  function piAudio() {
    if (!gameSnd()) return false;
    try {
      ac = ac || new (window.AudioContext || window.webkitAudioContext)();
      if (ac.state === 'suspended') ac.resume();
      if (!pi.gain) { pi.gain = ac.createGain(); pi.gain.connect(ac.destination); }
      pi.gain.gain.value = 0.5 * volMul(vol.game);
      return true;
    } catch (e) { return false; }
  }
  // Son de piano électrique: fondamentale, octave douce et légère attaque.
  function piSound(n, at) {
    if (!piAudio()) return;
    var t = Math.max(ac.currentTime, at || 0), f = 440 * Math.pow(2, (n - 69) / 12);
    [[1, 'sine', 0.5, 1.6], [2, 'triangle', 0.12, 0.7], [3, 'sine', 0.05, 0.35]].forEach(function (h) {
      var o = ac.createOscillator(), g = ac.createGain();
      o.type = h[1]; o.frequency.setValueAtTime(f * h[0], t); o.detune.setValueAtTime(h[0] === 2 ? 4 : 0, t);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(h[2], t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + h[3]);
      o.connect(g); g.connect(pi.gain); o.start(t); o.stop(t + h[3] + 0.05);
    });
  }
  function piFlash(n, cls, ms) {
    var k = pi.keys[n]; if (!k) return;
    k.classList.add(cls);
    pi.timers.push(setTimeout(function () { k.classList.remove(cls); }, ms || 260));
  }
  function piClear() { pi.timers.forEach(clearTimeout); pi.timers = []; Object.keys(pi.keys).forEach(function (n) { pi.keys[n].classList.remove('on', 'bad', 'cue'); }); }
  // ---------- Moteur « piano tiles » (atelier et clashs au piano) ----------
  // Une tuile noire par rangée: on touche la plus basse avant qu'elle ne sorte de l'écran. Chaque bonne tuile joue la note suivante.
  var TILE_KEYS = { d: 0, f: 1, j: 2, k: 3 }, TILE_ROWS = 4;
  function songOf(id) { var s = D.PIANO.songs.filter(function (x) { return x.id === id; })[0]; return s || D.PIANO.songs[0]; }
  function makeTiles(canvas, cb) {
    var t = { cv: canvas, ctx: null, W: 0, H: 0, cols: [], song: null, endless: false, n: 0, i: 0, dist: 0, speed: 2, acc: 0, max: 6,
      started: false, over: false, hits: 0, wrong: 0, missed: 0, combo: 0, best: 0, last: 0, fx: [], raf: 0, endAt: 0 };
    t.size = function () {
      var r = canvas.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
      t.W = r.width; t.H = r.height; canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr);
      t.ctx = canvas.getContext('2d'); t.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    // cfg: { song, cols (clash) | endless: true, speed, acc }
    t.reset = function (cfg) {
      cancelAnimationFrame(t.raf);
      t.song = songOf(cfg.song); t.endless = !!cfg.endless; t.cols = (cfg.cols || []).slice(); t.n = t.endless ? Infinity : t.cols.length;
      t.speed = cfg.speed || 2; t.acc = cfg.acc || 0; t.i = 0; t.dist = 0; t.started = false; t.over = false;
      t.hits = 0; t.wrong = 0; t.missed = 0; t.combo = 0; t.best = 0; t.fx = []; t.state = []; t.endAt = 0;
      if (t.endless) { t.cols = []; t.grow(12); }
      t.size(); t.draw(); t.raf = requestAnimationFrame(t.loop);
    };
    // en mode infini, la colonne suit le contour de la mélodie
    t.grow = function (k) {
      var N = t.song.notes;
      while (t.cols.length < k) {
        var i = t.cols.length, prev = i ? t.cols[i - 1] : Math.floor(Math.random() * 4), a = N[(i - 1 + N.length) % N.length], b2 = N[i % N.length], c;
        if (!i) c = prev;
        else if (b2 > a) c = prev < 3 ? prev + 1 : Math.floor(Math.random() * 3);
        else if (b2 < a) c = prev > 0 ? prev - 1 : 1 + Math.floor(Math.random() * 3);
        else { c = Math.floor(Math.random() * 3); if (c >= prev) c++; }
        t.cols.push(c);
      }
    };
    t.note = function (k) { var N = t.song.notes; return N[k % N.length] + (t.endless && Math.floor(k / N.length) % 2 ? 12 : 0); };
    t.done = function () { return t.over || (!t.endless && t.i >= t.n); };
    t.tap = function (col) {
      if (t.done() || col < 0 || col > 3) return;
      var now = performance.now() / 1000;
      if (t.cols[t.i] === col) {
        t.state[t.i] = 1; t.fx.push({ k: 'ok', c: col, row: t.i, at: now });
        if (cb.note) cb.note(t.note(t.i));
        t.i++; t.hits++; t.combo++; t.best = Math.max(t.best, t.combo);
        if (!t.started) { t.started = true; t.last = now; }
        if (t.endless) { t.speed = Math.min(t.max, t.speed + t.acc); t.grow(t.i + 12); }
      } else {
        t.fx.push({ k: 'bad', c: col, row: t.i, at: now }); t.combo = 0;
        if (cb.wrong) cb.wrong();
        if (t.endless) { t.over = true; t.endAt = now; }
        else if (t.started) t.wrong++;
      }
      if (cb.hud) cb.hud(t);
      if (t.done() && !t.endAt) t.endAt = now;
    };
    t.loop = function () {
      var now = performance.now() / 1000;
      if (t.started && !t.done()) {
        t.dist += Math.min(0.1, now - t.last) * t.speed;
        // une tuile ratée sort de l'écran
        while (t.i < t.n && t.dist > t.i + 1.45) {
          t.state[t.i] = -1; t.fx.push({ k: 'miss', c: t.cols[t.i], row: t.i, at: now }); t.combo = 0;
          if (cb.wrong) cb.wrong();
          if (t.endless) { t.over = true; t.endAt = now; t.dist = t.i + 0.9; break; }
          t.missed++; t.i++;
          if (cb.hud) cb.hud(t);
          if (t.done()) t.endAt = now;
        }
      }
      t.last = now;
      t.draw();
      if (t.endAt && now - t.endAt > (t.endless ? 0.9 : 0.6)) { if (cb.end) cb.end(t); return; }
      t.raf = requestAnimationFrame(t.loop);
    };
    t.stop = function () { cancelAnimationFrame(t.raf); t.raf = 0; };
    t.score = function () { return t.n && t.n !== Infinity ? Math.max(0, t.hits - 0.5 * t.wrong) / t.n : 0; };
    t.draw = function () {
      var c = t.ctx; if (!c) return;
      var W = t.W, H = t.H, cw = W / 4, rh = H / TILE_ROWS, now = performance.now() / 1000;
      c.fillStyle = '#fbf8f2'; c.fillRect(0, 0, W, H);
      c.strokeStyle = 'rgba(30,25,20,0.12)'; c.lineWidth = 1;
      for (var x = 1; x < 4; x++) { c.beginPath(); c.moveTo(x * cw, 0); c.lineTo(x * cw, H); c.stroke(); }
      var first = Math.max(0, Math.floor(t.dist) - 2), lastK = Math.min(t.cols.length - 1, Math.ceil(t.dist) + TILE_ROWS + 1);
      for (var k = first; k <= lastK; k++) {
        var yb = H - (k + 1 - t.dist) * rh, y = yb - rh;
        if (yb < 0 || y > H) continue;
        var st = t.state[k], col = t.cols[k], px = col * cw + 2, pw = cw - 4;
        c.fillStyle = st === 1 ? 'rgba(30,30,36,0.16)' : st === -1 ? '#e05a4f' : '#1d1f26';
        c.fillRect(px, y + 2, pw, rh - 4);
        if (!st) { c.fillStyle = 'rgba(255,255,255,0.08)'; c.fillRect(px, y + 2, pw, Math.min(10, rh * 0.12)); }
        if (k === 0 && !t.started) {
          c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = '800 ' + Math.round(Math.min(18, cw * 0.2)) + 'px system-ui, sans-serif';
          c.fillText('Départ', px + pw / 2, y + rh / 2);
        }
      }
      // retours visuels: bonne tuile (onde orange), erreur (case rouge)
      t.fx = t.fx.filter(function (f) { return now - f.at < 0.45; });
      t.fx.forEach(function (f) {
        var a = 1 - (now - f.at) / 0.45, yb2 = H - (f.row + 1 - t.dist) * rh;
        c.globalAlpha = a;
        if (f.k === 'ok') { c.strokeStyle = '#ff7a2f'; c.lineWidth = 3; c.strokeRect(f.c * cw + 3, yb2 - rh + 3, cw - 6, rh - 6); }
        else { c.fillStyle = 'rgba(224,90,79,0.55)'; c.fillRect(f.c * cw, f.k === 'miss' ? H - rh : yb2 - rh, cw, rh); }
        c.globalAlpha = 1;
      });
      // progression ou compteur
      if (!t.endless) { c.fillStyle = 'rgba(30,25,20,0.12)'; c.fillRect(0, 0, W, 4); c.fillStyle = '#ff7a2f'; c.fillRect(0, 0, W * Math.min(1, t.i / t.n), 4); }
      else if (t.started) { c.fillStyle = 'rgba(255,122,47,0.9)'; c.textAlign = 'center'; c.textBaseline = 'top'; c.font = '800 34px system-ui, sans-serif'; c.fillText(String(t.hits), W / 2, 10); }
    };
    canvas.addEventListener('pointerdown', function (e) {
      e.preventDefault(); var r = canvas.getBoundingClientRect();
      t.tap(Math.max(0, Math.min(3, Math.floor((e.clientX - r.left) / (r.width / 4)))));
    });
    return t;
  }
  function tileWrong() { if (!piAudio()) return; var o = ac.createOscillator(), g = ac.createGain(), at = ac.currentTime; o.type = 'square'; o.frequency.setValueAtTime(98, at); g.gain.setValueAtTime(0.12, at); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.25); o.connect(g); g.connect(pi.gain); o.start(at); o.stop(at + 0.3); }

  function piStatus() {
    var P = S.piano, ready = P.cd <= 0, mn = D.PIANO.min;
    var free = pi.mode === 'free';
    $('piKeys').hidden = !free; $('piStage').hidden = free; $('piText').hidden = false;
    if (free) {
      setText($('piText'), 'Joue librement : chaque touche sonne comme un vrai piano. Idéal pour trouver une idée de mélodie.');
      setText($('piState'), 'Jeu libre'); setText($('piInfo'), '');
      $('piStart').hidden = true; return;
    }
    var tl = pi.tiles, playing = tl && pi.state === 'play';
    $('piStart').hidden = playing; $('piText').hidden = playing;
    setText($('piText'), 'Touche les tuiles noires de bas en haut, sans toucher le blanc ni en laisser filer une : chaque tuile joue la note suivante de la mélodie, et ça accélère. Dès ' + mn + ' tuiles, ton inspiration dope les gains du studio' + (ready ? '.' : ' (une fois toutes les ' + Math.round(D.TUNING.pianoEvery / 60) + ' minutes ; tu peux t’entraîner en attendant).'));
    setText($('piInfo'), 'Record : ' + P.best + ' tuile' + (P.best > 1 ? 's' : '') + ' · ' + (ready ? 'inspiration disponible' : 'prochaine inspiration dans ' + clock(P.cd)));
    setText($('piState'), playing ? (tl.started ? tl.hits + ' tuile' + (tl.hits > 1 ? 's' : '') + ' · ' + pi.songName : 'Touche « Départ » pour lancer ' + pi.songName) : pi.state === 'over' ? pi.result : 'Prêt ?');
    setText($('piStartT'), pi.state === 'over' ? 'Rejouer' : 'Jouer');
    setText($('piStartS'), ready ? 'Inspiration en jeu' : 'Entraînement');
  }
  function piTiles() {
    if (!pi.tiles) pi.tiles = makeTiles($('piCanvas'), {
      note: function (n) { piSound(n); },
      wrong: tileWrong,
      hud: function () { piStatus(); },
      end: function (t) { piEnd(t.hits); }
    });
    return pi.tiles;
  }
  function piStart() {
    if (pi.mode !== 'tiles') return;
    var songs = D.PIANO.songs, s = songs[Math.floor(Math.random() * songs.length)];
    pi.songName = s.name; pi.state = 'play'; pi.result = '';
    piStatus();
    piTiles().reset({ song: s.id, endless: true, speed: 1.9, acc: 0.035 });
    try { $('piCanvas').focus(); } catch (e) { /* facultatif */ }
  }
  function piEnd(n) {
    if (pi.state !== 'play') return;
    pi.state = 'over'; if (pi.tiles) pi.tiles.stop();
    var res = G.finishPiano(S, n), mn = D.PIANO.min;
    if (res && res.reward) {
      pi.result = n + ' tuiles : inspiration !';
      toast('Inspiration : gains ×' + nf1.format(res.reward.m) + ' pendant ' + dur(res.reward.s) + '.', 5000); blip(12);
    } else pi.result = n >= mn ? n + ' tuiles. Bel entraînement !' : n + ' tuile' + (n > 1 ? 's' : '') + ' : vise au moins ' + mn + ' tuiles.';
    saveLocal(); markCloud(); piStatus(); render();
    $('piStart').focus();
  }
  function piPress(n) {
    if (!pi.open) return;
    piSound(n); piFlash(n, 'on', 220);
  }
  function openPiano() {
    if (pi.open || !G.pianoOpen(S)) return;
    if (!pi.built) piBuild();
    pi.open = true; pi.opener = document.activeElement; pi.state = 'idle';
    $('piTitle').textContent = S.owned.orchestre ? 'Au piano à queue' : 'Au clavier maître';
    var snd = gameSnd();
    $('piSoundOn').hidden = snd;
    setText($('piTip'), (snd ? '' : 'Le son est coupé : tu peux jouer quand même, mais la mélodie fait tout le charme. ') + 'Sur ordinateur : touches D, F, J et K pour les quatre colonnes (et ton clavier en jeu libre).');
    $('pianoScrim').hidden = false; $('app').inert = true; $('tabs').inert = true; if (S3) if (S3) S3.paused = true;
    piStatus();
    if (pi.mode === 'tiles') { piTiles().size(); pi.tiles.draw(); }
    (pi.mode === 'tiles' ? $('piStart') : pi.keys[PI_LOW]).focus();
  }
  function closePiano() {
    if (!pi.open) return;
    if (pi.state === 'play' && pi.tiles) { var h = pi.tiles.hits; pi.tiles.stop(); if (h >= D.PIANO.min) piEnd(h); }
    pi.open = false; pi.state = 'idle'; piClear();
    $('pianoScrim').hidden = true; $('app').inert = false; $('tabs').inert = false; if (S3) S3.paused = false;
    var o = pi.opener; pi.opener = null;
    if (o && document.body.contains(o) && !o.closest('[hidden]') && o.focus) { try { o.focus(); } catch (e) { /* facultatif */ } }
    render();
  }
  function bindPiano() {
    $('piKeys').addEventListener('pointerdown', function (e) { var k = e.target.closest('[data-n]'); if (!k) return; e.preventDefault(); piPress(+k.getAttribute('data-n')); });
    $('piKeys').addEventListener('keydown', function (e) { if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) { var k = e.target.closest('[data-n]'); if (k) { e.preventDefault(); piPress(+k.getAttribute('data-n')); } } });
    $('piStart').addEventListener('click', piStart);
    $('piClose').addEventListener('click', closePiano);
    $('pianoScrim').addEventListener('click', function (e) { if (e.target === $('pianoScrim')) closePiano(); });
    $('pianoScrim').querySelector('.pi-mode').addEventListener('click', function (e) {
      var b = e.target.closest('[data-pm]'); if (!b) return;
      if (pi.state === 'play' && pi.tiles) { var h = pi.tiles.hits; pi.tiles.stop(); if (h >= D.PIANO.min) piEnd(h); }
      pi.mode = b.getAttribute('data-pm'); pi.state = 'idle'; piClear();
      $('pianoScrim').querySelectorAll('[data-pm]').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      piStatus();
      if (pi.mode === 'tiles') { piTiles().size(); pi.tiles.draw(); }
    });
    $('piSoundOn').addEventListener('click', function () {
      vol.gameOn = true; if (vol.game <= 0) vol.game = VDEF; saveVol();
      markCloud(); saveLocal(); $('piSoundOn').hidden = true;
      if (bind.syncSound) bind.syncSound(); if (bind.syncVol) bind.syncVol();
      piSound(72); setText($('piTip'), 'Sur ordinateur : touches D, F, J et K pour les quatre colonnes (et ton clavier en jeu libre).');
    });
    document.addEventListener('keydown', function (e) {
      if (!pi.open) return;
      if (e.key === 'Escape') { e.preventDefault(); closePiano(); return; }
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      if (pi.mode === 'tiles') {
        var c = TILE_KEYS[(e.key || '').toLowerCase()];
        if (c !== undefined && pi.state === 'play') { e.preventDefault(); pi.tiles.tap(c); }
        return;
      }
      var n = PI_CODES[e.code];
      if (n !== undefined) { e.preventDefault(); piPress(n); }
    });
    window.addEventListener('resize', function () { if (pi.open && pi.tiles && pi.mode === 'tiles') { pi.tiles.size(); pi.tiles.draw(); } });
    document.addEventListener('visibilitychange', function () { if (document.hidden && pi.open && pi.state === 'play' && pi.tiles) { var h = pi.tiles.hits; pi.tiles.stop(); pi.state = 'play'; piEnd(h); } });
    setInterval(function () { if (pi.open && pi.state !== 'play') piStatus(); }, 1000);
  }

  // ---------- Icônes dans la scène 3D ----------
  var HOT_DRUM = '<svg viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="9" rx="8" ry="3.2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M4 9v6c0 1.8 3.6 3.2 8 3.2s8-1.4 8-3.2V9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M15 2l-4 6M20 3l-6 5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  var HOT_DECO = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h12v5H4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M16 6.5h3v5.5h-8v3" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><rect x="9" y="15" width="4" height="6" rx="1" fill="currentColor"/></svg>';
  var HOT_PIANO = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="5" width="19" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 5v14M12 5v14M16 5v14" stroke="currentColor" stroke-width="1.6"/><rect x="6.6" y="5" width="2.8" height="8" fill="currentColor"/><rect x="14.6" y="5" width="2.8" height="8" fill="currentColor"/></svg>';
  function hotspots() {
    var list = [];
    if (G.battleOpen(S)) {
      var R = S.battle.rival;
      var pk = !!R && R.kind === 'piano' && G.pianoOpen(S);
      list.push({ id: 'clash', anchor: pk ? 'piano' : 'drums', hot: !!R,
        label: R ? (pk ? 'Duel au piano : ' : 'Clash de beatmakers : ') + R.name + ' te défie' : 'Clash : prochain défi dans ' + clock(S.battle.cd),
        html: (pk ? HOT_PIANO : HOT_DRUM) + '<span>' + (pk ? 'Duel' : 'Clash') + '</span>' + (R ? '<i class="bang" aria-hidden="true">!</i>' : '<small>' + clock(S.battle.cd) + '</small>') });
    }
    if (globeOn()) list.push({ id: 'globe', anchor: 'globe', hot: false, label: 'Globe des tournées', html: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" fill="none" stroke="currentColor" stroke-width="1.6"/></svg><span>Globe</span>' });
    var dn = G.decoNew(S).length;
    list.push({ id: 'deco', anchor: 'shelf', hot: dn > 0, label: 'Décoration du studio' + (dn ? ' : ' + dn + ' nouveauté' + (dn > 1 ? 's' : '') : ''),
      html: HOT_DECO + '<span>Déco</span>' + (dn ? '<i class="bang" aria-hidden="true">' + dn + '</i>' : '') });
    var HOT_MIC = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="2.5" width="6" height="11" rx="3" fill="currentColor"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
    if (G.labelOpen(S)) S.label.roster.forEach(function (r) {
      if (r.tour) return;
      var what = r.offer ? 'offer' : r.story ? 'story' : r.ask ? 'ask' : null;
      if (!what) return;
      var nm = artName(r.id);
      // simple envie d'album: une petite note discrète au-dessus de l'artiste
      if (what === 'ask') { list.push({ id: 'art:' + r.id, anchor: 'artist:' + r.id, hot: false, mini: true, label: nm + ' aimerait sortir un album', html: '<span aria-hidden="true">♪</span>' }); return; }
      list.push({ id: 'art:' + r.id, anchor: 'artist:' + r.id, hot: true,
        label: what === 'offer' ? r.offer.lab + ' veut signer ' + nm : what === 'story' ? nm + ' a quelque chose à te dire' : nm + ' veut sortir un album',
        html: HOT_MIC + '<span>' + esc(nm) + '</span><i class="bang" aria-hidden="true">' + (what === 'offer' ? '€' : what === 'story' ? '…' : '!') + '</i>' });
    });
    if (G.pianoOpen(S)) {
      var ready = S.piano.cd <= 0;
      list.push({ id: 'piano', anchor: 'piano', hot: ready, label: 'Atelier piano' + (ready ? ' : inspiration disponible' : ''),
        html: HOT_PIANO + '<span>Piano</span>' + (ready ? '<i class="bang" aria-hidden="true">♪</i>' : '') });
    }
    S3.setHotspots(list);
  }
  function onHotspot(id) {
    if (id === 'clash') { if (S.battle.rival) openClash(); else toast('Pas de rival pour l’instant : prochain défi dans ' + clock(S.battle.cd) + '.'); }
    else if (id === 'piano') openPiano();
    else if (id === 'deco') openDeco();
    else if (id === 'globe') openGlobe();
    else if (id.indexOf('art:') === 0) {
      var aid = id.slice(4), r = G.artistOf(S, aid);
      if (!r) return;
      if (r.offer) openOffer(aid); else if (r.story) openStory(aid); else showArtist(aid);
    }
  }
  function showArtist(aid) {
    if (!menuOpen) setMenu(true);
    if (bind.view) bind.view('team');
    teamView('label');
    var card = document.querySelector('.artist[data-aid="' + aid + '"]');
    if (card) card.scrollIntoView({ block: 'center' });
  }

  // ---------- Clash de beatmakers ----------
  var LANE_COL = ['#ff7a2f', '#3d7be0', '#24a066', '#7a5cd6'], LANE_KEYS = { d: 0, f: 1, j: 2, k: 3 };
  var METKEY = 'premier-mix:metro';
  function metroPref() { try { return localStorage.getItem(METKEY) !== '0'; } catch (e) { return true; } }
  var cl = { metro: true, open: false, playing: false, done: false, cfg: null, notes: [], t0: 0, raf: 0, score: 0, combo: 0, best: 0, opener: null, gain: null, flash: [0, 0, 0, 0], judge: [null, null, null, null], end: 0, lead: 0, step: 0, key: '', wasOpen: null, ctx: null, W: 0, H: 0, dpr: 1 };
  function clNow() { return performance.now() / 1000; }
  function renderClash(force) {
    var open = G.battleOpen(S), B = S.battle, onProd = $('app').getAttribute('data-view') === 'prod';
    if (cl.wasOpen === false && open && !quiet) toast('Nouveau : les clashs de beatmakers. Des rivaux vont te défier depuis Productions.', 6500);
    cl.wasOpen = open;
    setHidden($('clashBox'), !open);
    if (!open) return;
    var L = D.BATTLE.leagues[B.league - 1], R = B.rival;
    setText($('clashChip'), 'Ligue ' + L.name);
    var key = (R ? 'r' + R.name + R.target + R.kind : 'w') + '|' + B.league + '|' + B.pts + '|' + B.wins + '|' + B.losses;
    if (key !== cl.key || force) {
      cl.key = key;
      var up = B.league < D.BATTLE.leagues.length;
      var bar = '<span class="league-bar" aria-hidden="true">' + D.BATTLE.leagues.map(function (x, i) { return '<i class="' + (i < B.league ? 'on' : '') + '"></i>'; }).join('') + '</span>';
      var prog = up ? B.pts + ' / ' + D.TUNING.battleUp + ' victoires pour monter en ligue ' + D.BATTLE.leagues[B.league].name + '.' : 'Tu es au sommet : ligue Légende.';
      $('clashBody').innerHTML = R
        ? '<article class="card clash-card hot"><span class="who-r"></span><p class="proj-meta">' + (R.kind === 'piano' ? '<span class="vogue">Au piano</span> ' : '<span class="vogue">À la batterie</span> ') + 'Score à battre : <b>' + Math.round(R.target * 100) + ' %</b> · ' + (R.kind === 'piano' ? L.tiles + ' tuiles' : Math.round(L.bpm * (R.rule === 'rapide' ? 1.1 : 1)) + ' BPM') + ' · ' + prog + '</p>' + (R.rule ? '<p class="proj-meta"><span class="vogue">' + esc(RULE_TXT[R.rule][0]) + '</span> ' + esc(RULE_TXT[R.rule][1]) + '</p>' : '') + bar +
          '<div class="proj-row"><button class="btn primary" type="button" data-cl="go">Relever le défi</button><button class="btn sm" type="button" data-cl="no">Décliner</button></div></article>'
        : '<article class="card clash-card"><p class="proj-meta" id="clWait"></p>' + bar + '<p class="proj-meta">' + prog + ' ' + B.wins + ' victoire' + (B.wins > 1 ? 's' : '') + ', ' + B.losses + ' défaite' + (B.losses > 1 ? 's' : '') + (B.best ? ', meilleur combo ' + B.best : '') + '.</p></article>';
      var w = $('clashBody').querySelector('.who-r'); if (w) w.textContent = R.name + ' te défie !';
    }
    if (!R && $('clWait')) setText($('clWait'), 'Prochain défi dans ' + clock(B.cd) + ' (le compte à rebours avance quand le jeu est ouvert).');
    if (R && !onProd) setClass($('tabProd'), 'has', true);
  }
  // Sons de batterie synthétisés (aucun fichier audio).
  function drum(l, at, gainMul) {
    if (!cl.gain || !ac) return;
    var t = Math.max(ac.currentTime, at || ac.currentTime), g = ac.createGain(), m = gainMul || 1;
    g.connect(cl.gain);
    if (l === 0) { // kick
      var o = ac.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.16);
      g.gain.setValueAtTime(0.9 * m, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      o.connect(g); o.start(t); o.stop(t + 0.4); return;
    }
    var len = l === 2 ? 0.05 : l === 3 ? 0.18 : 0.2, buf = ac.createBuffer(1, Math.ceil(ac.sampleRate * len), ac.sampleRate), d = buf.getChannelData(0);
    for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    var n = ac.createBufferSource(); n.buffer = buf;
    var f = ac.createBiquadFilter();
    if (l === 1) { f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = 0.7; g.gain.setValueAtTime(0.55 * m, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      var o2 = ac.createOscillator(), g2 = ac.createGain(); o2.type = 'triangle'; o2.frequency.setValueAtTime(220, t); g2.gain.setValueAtTime(0.3 * m, t); g2.gain.exponentialRampToValueAtTime(0.001, t + 0.1); o2.connect(g2); g2.connect(cl.gain); o2.start(t); o2.stop(t + 0.12); }
    else if (l === 2) { f.type = 'highpass'; f.frequency.value = 7000; g.gain.setValueAtTime(0.28 * m, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.05); }
    else { f.type = 'bandpass'; f.frequency.value = 1200; f.Q.value = 1.2; g.gain.setValueAtTime(0.0001, t);
      [0, 0.012, 0.024].forEach(function (dt) { g.gain.setValueAtTime(0.5 * m, t + dt); g.gain.exponentialRampToValueAtTime(0.05 * m, t + dt + 0.01); });
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.18); }
    n.connect(f); f.connect(g); n.start(t); n.stop(t + len);
  }
  function tone(freq, at, len, vol, type) {
    if (!cl.gain || !ac) return;
    var o = ac.createOscillator(), g = ac.createGain(), t = Math.max(ac.currentTime, at);
    o.type = type || 'triangle'; o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(g); g.connect(cl.gain); o.start(t); o.stop(t + len + 0.02);
  }
  function clAudioOn() {
    if (!gameSnd()) return false;
    try {
      ac = ac || new (window.AudioContext || window.webkitAudioContext)();
      if (ac.state === 'suspended') ac.resume();
      cl.gain = ac.createGain(); cl.gain.gain.value = 0.55 * volMul(vol.game); cl.gain.connect(ac.destination);
      return true;
    } catch (e) { cl.gain = null; return false; }
  }
  function clAudioOff() { if (cl.gain) { try { cl.gain.gain.cancelScheduledValues(0); cl.gain.disconnect(); } catch (e) { /* déjà coupé */ } cl.gain = null; } }
  function openClash(given) {
    var cfg = given && given.concert ? given : G.startBattle(S);
    if (!cfg || cl.open) return;
    cl.open = true; cl.playing = false; cl.done = false; cl.cfg = cfg; cl.opener = document.activeElement;
    var conc = cfg.concert, an = conc ? artName(conc.artist) : '', pk = cfg.kind === 'piano';
    setText($('clKind'), conc ? 'Concert' : pk ? 'Duel au piano' : 'Clash de beatmakers');
    $('clKeysD').hidden = pk; $('clKeysP').hidden = !pk; $('clMetroL').hidden = pk;
    setText($('clLeague'), conc ? cfg.leagueName + ' · ' + D.VENUES[conc.venue].cap : 'Ligue ' + cfg.leagueName);
    $('clTitle').textContent = conc ? an + ' en concert' : cfg.rival.name + ' te défie';
    $('clIntroText').textContent = pk ? cfg.rival.name + ' t’attend au piano sur « ' + songOf(cfg.song).name + ' ». Touche les tuiles noires de bas en haut avant qu’elles ne sortent de l’écran : chaque tuile joue une note. Une tuile ratée ou une fausse note fait baisser ton score.' : conc ? an + ' monte sur scène et compte sur toi à la batterie. Frappe chaque note quand elle touche la ligne : plus tu es en rythme, plus le public s’enflamme. Vise ' + Math.round(cfg.rival.target * 100) + ' % pour un beau concert.' : 'Ton rival a posé son beat, à toi de répondre. Les notes descendent sur quatre pistes : frappe chaque note quand elle touche la ligne. Plus tu es dans le temps, plus ton score monte.';
    setText($('clTargetL'), conc ? 'Objectif' : 'À battre'); setText($('clTheirsL'), conc ? 'Objectif' : 'Rival');
    setText($('clGoSub'), Math.round(cfg.rival.target * 100) + (conc ? ' % visés · ' : ' % à battre · ') + (pk ? cfg.cols.length + ' tuiles' : cfg.bpm + ' BPM') + (cfg.rule ? ' · ' + RULE_TXT[cfg.rule][0] : ''));
    var snd = gameSnd();
    setText($('clTip'), pk ? (snd ? 'Le son est activé : chaque tuile joue la note suivante de la mélodie.' : 'Le son est coupé : tu peux jouer quand même, mais la mélodie fait tout le charme.') : snd ? (conc ? 'Le son est activé : ta batterie accompagne la ligne de basse du groupe.' : 'Le son est activé : chaque frappe joue ton beat par-dessus la ligne de basse du rival.') : 'Le son est coupé : tu peux jouer quand même, mais c’est bien plus amusant en musique.');
    $('clSoundOn').hidden = snd;
    cl.metro = metroPref(); $('clMetro').checked = cl.metro;
    $('clIntro').hidden = false; $('clPlay').hidden = true; $('clDone').hidden = true;
    $('clashScrim').hidden = false; $('app').inert = true; $('tabs').inert = true; if (S3) if (S3) S3.paused = true;
    $('clGo').focus();
  }
  function closeClash() {
    if (!cl.open) return;
    if (cl.playing) return; // pendant la partie, il faut abandonner explicitement
    cl.open = false; cancelAnimationFrame(cl.raf); clAudioOff();
    $('clashScrim').hidden = true; $('app').inert = false; $('tabs').inert = false; if (S3) S3.paused = false;
    var o = cl.opener; cl.opener = null;
    if (o && document.body.contains(o) && !o.closest('[hidden]') && o.focus) { try { o.focus(); } catch (e) { /* facultatif */ } }
    cl.key = ''; render();
  }
  function clSize() {
    var c = $('clCanvas'), r = c.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    cl.W = r.width; cl.H = r.height; cl.dpr = dpr;
    c.width = Math.round(r.width * dpr); c.height = Math.round(r.height * dpr);
    cl.ctx = c.getContext('2d'); cl.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function startClash() {
    var cfg = cl.cfg;
    $('clIntro').hidden = true; $('clPlay').hidden = false;
    if (cfg.kind === 'piano') { clStartTiles(cfg); return; }
    $('clPlay').classList.remove('tiles'); $('clPads').hidden = false;
    clSize();
    var beat = 60 / cfg.bpm; cl.step = beat / 4; cl.lead = beat * 4 + 0.4;
    cl.notes = cfg.notes.map(function (n) { return { t: cl.lead + n.s * cl.step, l: n.l, hit: 0 }; });
    cl.end = cl.lead + cfg.bars * 16 * cl.step + 0.8;
    cl.score = 0; cl.combo = 0; cl.best = 0; cl.pts = 0; cl.flash = [0, 0, 0, 0]; cl.judge = [null, null, null, null];
    setText($('clTarget'), Math.round(cfg.rival.target * 100) + ' %'); setText($('clScore'), '0 %'); setText($('clCombo'), '0');
    cl.t0 = clNow() + 0.1;
    if (clAudioOn()) {
      var a0 = ac.currentTime + 0.1, BASS = [55, 43.65, 65.41, 49];
      for (var k = 0; k < 4; k++) tone(k === 0 ? 1320 : 880, a0 + 0.4 + k * beat, 0.08, 0.12, 'square');
      for (var b = 0; b < cfg.bars; b++) for (var q = 0; q < 4; q++) {
        var at = a0 + cl.lead + (b * 4 + q) * beat, f = BASS[Math.floor(b / 2) % 4];
        tone(f, at, beat * 0.9, 0.22, 'triangle'); if (q % 2 === 1) tone(f * 2, at + beat / 2, beat * 0.4, 0.08, 'sawtooth');
        if (cl.metro) tone(q === 0 ? 1560 : 1040, at, 0.035, 0.11, 'square');
      }
    }
    cl.playing = true; cl.done = false;
    $('clPads').querySelector('.clpad').focus();
    cancelAnimationFrame(cl.raf); cl.raf = requestAnimationFrame(clLoop);
  }
  // Duel au piano: même scène, mais le canevas devient une piste de tuiles qu'on touche directement.
  function clStartTiles(cfg) {
    $('clPlay').classList.add('tiles'); $('clPads').hidden = true;
    if (!cl.tiles) cl.tiles = makeTiles($('clCanvas'), {
      note: function (n) { piSound(n); },
      wrong: tileWrong,
      hud: function (t) { setText($('clScore'), Math.round(t.score() * 100) + ' %'); setText($('clCombo'), String(t.combo)); },
      end: function () { finishClash(false); }
    });
    cl.score = 0; cl.combo = 0; cl.best = 0; cl.pts = 0;
    setText($('clTarget'), Math.round(cfg.rival.target * 100) + ' %'); setText($('clScore'), '0 %'); setText($('clCombo'), '0');
    piAudio();
    cl.playing = true; cl.done = false;
    cl.tiles.reset({ song: cfg.song, cols: cfg.cols, speed: cfg.tps });
    try { $('clCanvas').focus(); } catch (e) { /* facultatif */ }
  }
  var JUDGE = { p: 'Parfait', g: 'Bien', m: 'Raté' };
  function clHit(l) {
    if (!cl.playing) return;
    var now = clNow() - cl.t0, T = D.TUNING, best = null, bd = 1;
    drum(l);
    cl.flash[l] = now;
    for (var i = 0; i < cl.notes.length; i++) {
      var n = cl.notes[i];
      if (n.hit || n.l !== l) continue;
      var d = Math.abs(n.t - now);
      if (n.t - now > T.battleGood) break;
      if (d < bd) { bd = d; best = n; }
    }
    if (best && bd <= T.battleGood) {
      var perfect = bd <= T.battlePerfect;
      best.hit = perfect ? 2 : 1; cl.pts += perfect ? 1 : 0.6; cl.combo++; cl.best = Math.max(cl.best, cl.combo);
      cl.judge[l] = { k: perfect ? 'p' : 'g', t: now };
    } else { cl.combo = 0; cl.judge[l] = { k: 'm', t: now }; }
    clHud();
  }
  function clHud() { setText($('clScore'), Math.round(cl.pts / cl.notes.length * 100) + ' %'); setText($('clCombo'), String(cl.combo)); }
  function clLoop() {
    if (!cl.playing) return;
    var now = clNow() - cl.t0, T = D.TUNING;
    cl.notes.forEach(function (n) { if (!n.hit && now - n.t > T.battleGood) { n.hit = -1; cl.combo = 0; clHud(); } });
    clDraw(now);
    if (now >= cl.end) { finishClash(false); return; }
    cl.raf = requestAnimationFrame(clLoop);
  }
  function clDraw(now) {
    var c = cl.ctx, W = cl.W, H = cl.H, lw = W / 4, hy = H - 46, travel = 1.6, sp = hy / travel;
    c.clearRect(0, 0, W, H);
    for (var l = 0; l < 4; l++) {
      c.fillStyle = l % 2 ? 'rgba(255,255,255,0.035)' : 'rgba(255,255,255,0.015)'; c.fillRect(l * lw, 0, lw, H);
      var fl = Math.max(0, 1 - (now - cl.flash[l]) / 0.18);
      if (fl > 0) { c.fillStyle = LANE_COL[l]; c.globalAlpha = 0.25 * fl; c.fillRect(l * lw, 0, lw, H); c.globalAlpha = 1; }
    }
    // lignes de temps (une par temps)
    var beat = cl.step * 4, first = Math.ceil((now - 0.2 - cl.lead) / beat);
    c.strokeStyle = 'rgba(255,255,255,0.08)'; c.lineWidth = 1;
    for (var b = first; ; b++) { var bt = cl.lead + b * beat, y = hy - (bt - now) * sp; if (y < 0) break; if (b >= 0 && y <= H) { c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); } }
    // ligne de frappe
    c.fillStyle = 'rgba(255,255,255,0.85)'; c.fillRect(0, hy - 1.5, W, 3);
    for (var k = 0; k < 4; k++) { c.strokeStyle = LANE_COL[k]; c.lineWidth = 3; c.beginPath(); c.arc(k * lw + lw / 2, hy, Math.min(lw * 0.3, 18), 0, Math.PI * 2); c.stroke(); }
    // notes
    cl.notes.forEach(function (n) {
      if (n.hit > 0) return;
      var y = hy - (n.t - now) * sp;
      if (y < -20 || y > H + 20) return;
      var x = n.l * lw + lw / 2, r = Math.min(lw * 0.28, 16);
      c.globalAlpha = n.hit < 0 ? 0.3 : 1;
      c.fillStyle = LANE_COL[n.l]; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
      c.fillStyle = 'rgba(255,255,255,0.55)'; c.beginPath(); c.arc(x - r * 0.3, y - r * 0.3, r * 0.3, 0, Math.PI * 2); c.fill();
      c.globalAlpha = 1;
    });
    // jugements
    c.textAlign = 'center'; c.font = '800 14px system-ui, sans-serif';
    for (var j = 0; j < 4; j++) {
      var jd = cl.judge[j]; if (!jd) continue;
      var a = 1 - (now - jd.t) / 0.5; if (a <= 0) continue;
      c.globalAlpha = a; c.fillStyle = jd.k === 'p' ? '#ffd166' : jd.k === 'g' ? '#9be7c4' : '#ff8a80';
      c.fillText(JUDGE[jd.k], j * lw + lw / 2, hy - 30 - (1 - a) * 14); c.globalAlpha = 1;
    }
    // décompte
    if (now < cl.lead - 0.4) {
      var cnt = 4 - Math.floor((now - 0.4) / (cl.step * 4));
      if (now >= 0.4 && cnt >= 1 && cnt <= 4) { c.fillStyle = '#fff'; c.font = '800 64px system-ui, sans-serif'; c.fillText(String(cnt), W / 2, H / 2); }
      else if (now < 0.4) { c.fillStyle = '#fff'; c.font = '800 22px system-ui, sans-serif'; c.fillText('Prêt ?', W / 2, H / 2); }
    }
    // métronome visuel: un voyant pulse à chaque temps
    if (cl.metro && now > 0.4) {
      var bp = (now - 0.4) / beat, ph = bp - Math.floor(bp), down = Math.floor(bp) % 4 === 0;
      c.globalAlpha = Math.max(0.15, 1 - ph * 2.2);
      c.fillStyle = down ? '#ffd166' : '#ffffff';
      c.beginPath(); c.arc(W - 18, 20, down ? 8 : 6, 0, Math.PI * 2); c.fill();
      c.fillRect(0, hy - 1.5, W * (1 - ph) * 0.12, 3); c.fillRect(W - W * (1 - ph) * 0.12, hy - 1.5, W * (1 - ph) * 0.12, 3);
      c.globalAlpha = 1;
    }
    // progression
    c.fillStyle = 'rgba(255,255,255,0.15)'; c.fillRect(0, 0, W, 4);
    c.fillStyle = '#ff7a2f'; c.fillRect(0, 0, W * Math.max(0, Math.min(1, now / cl.end)), 4);
  }
  function finishClash(quit) {
    if (!cl.playing) return;
    cl.playing = false; cancelAnimationFrame(cl.raf);
    if (quit) clAudioOff(); else setTimeout(clAudioOff, 1200);
    var score = cl.notes.length ? cl.pts / cl.notes.length : 0;
    if (cl.cfg.kind === 'piano' && cl.tiles) { cl.tiles.stop(); score = cl.tiles.score(); cl.best = cl.tiles.best; }
    if (cl.cfg.concert) { finishConcertUi(quit, score); return; }
    var res = G.finishBattle(S, { score: score, combo: cl.best });
    cl.done = true;
    $('clPlay').hidden = true; $('clDone').hidden = false;
    if (!res) { closeClash(); return; }
    var v = $('clVerdict');
    v.textContent = quit ? 'Abandon' : res.win ? 'Victoire !' : 'Défaite';
    v.className = 'ev-verdict ' + (res.win ? 'win' : 'loss');
    setText($('clMine'), Math.round(res.score * 100) + ' %'); setText($('clTheirs'), Math.round(res.target * 100) + ' %'); setText($('clBest'), String(cl.best));
    var L = D.BATTLE.leagues;
    $('clRes').textContent = res.win
      ? 'Tu remportes ' + eur(res.cash) + ' et ta réputation grimpe.' + (res.promo ? ' Promotion : bienvenue en ligue ' + L[res.newLeague - 1].name + ' !' : res.newLeague < L.length ? ' Encore ' + (D.TUNING.battleUp - res.pts) + ' victoire' + (D.TUNING.battleUp - res.pts > 1 ? 's' : '') + ' pour monter en ligue ' + L[res.newLeague].name + '.' : '')
      : res.rival + ' garde la couronne cette fois. Tu gagnes un peu d’expérience. Un nouveau rival se présentera bientôt.';
    setText($('clLive'), v.textContent + '. ' + $('clRes').textContent);
    blip(res.win ? 12 : 3);
    saveLocal(); markCloud();
    $('clClose').focus();
  }
  var GRADES = ['Soirée difficile', 'Concert correct', 'Beau concert !', 'Triomphe !'];
  function finishConcertUi(quit, score) {
    var cc = cl.cfg.concert, res = G.finishConcert(S, cc.artist, cc.venue, { score: score, combo: cl.best });
    cl.done = true;
    $('clPlay').hidden = true; $('clDone').hidden = false;
    if (!res) { closeClash(); return; }
    var v = $('clVerdict'), an = artName(cc.artist);
    v.textContent = quit ? 'Concert écourté' : GRADES[res.grade];
    v.className = 'ev-verdict ' + (res.grade >= 2 ? 'win' : 'loss');
    setText($('clMine'), Math.round(res.score * 100) + ' %'); setText($('clTheirs'), Math.round(D.TUNING.concertGood * 100) + ' %'); setText($('clBest'), String(cl.best));
    $('clRes').textContent = 'Recette : ' + eur(res.cash) + '. Notoriété de ' + an + ' : ' + Math.round(res.fame) + ' (' + (res.dFame >= 0 ? '+' : '') + res.dFame + '), humeur ' + moodTxt(res.mood)[0].toLowerCase() + '. ' + an + ' se repose avant le prochain concert.';
    setText($('clLive'), v.textContent + '. ' + $('clRes').textContent);
    blip(res.grade >= 2 ? 12 : 3);
    lbv.key = ''; saveLocal(); markCloud();
    $('clClose').focus();
  }

  // ---------- Histoires d'artistes ----------
  var stv = { open: false, id: null, opener: null, kind: 'story' };
  var ST_LABEL = { spent: 'Dépense', amood: 'Humeur', afame: 'Notoriété', cash: 'Argent', rep: 'Réputation', style: 'Style', duo: 'Duo' };
  function stReward(r) {
    switch (r.k) {
      case 'spent': return '−' + eur(r.v);
      case 'amood': case 'afame': return (r.v >= 0 ? '+' : '') + Math.round(r.v);
      case 'cash': return '+' + eur(r.v);
      case 'rep': return '+' + r.v + ' de réputation';
      case 'style': return 'Son prochain album pourra être du ' + G.PJ_G[r.g].name;
      case 'duo': return 'Prochain album en duo avec ' + artName(r.other);
    }
    return '';
  }
  // Offre d'un label rival: même fenêtre que les histoires, avec trois réponses.
  function openOffer(id) {
    var r = G.artistOf(S, id), of = r && r.offer;
    if (!of || stv.open) return;
    stv.open = true; stv.id = id; stv.kind = 'offer'; stv.opener = document.activeElement;
    var nm = artName(id), cost = G.retainCost(S, r), fee = G.transferFee(S, r), ch = G.keepChance(r);
    setText($('stWho'), nm);
    $('stTitle').textContent = of.lab + ' veut signer ' + nm;
    $('stText').textContent = 'Le label ' + of.lab + ' propose un gros contrat à ' + nm + ' (notoriété ' + Math.round(r.fame) + ', humeur ' + moodTxt(r.mood)[0].toLowerCase() + '). Un artiste heureux chez toi a toutes les raisons de rester. Sans réponse de ta part avant ' + clock(of.left) + ', ' + nm + ' décidera seul.';
    var opts = [
      { c: 'pay', text: 'Lui offrir une prime de fidélité : ' + nm + ' reste à coup sûr', tags: [['cost' + (S.money >= cost ? '' : ' short'), 'Coûte ' + eur(cost)], ['', 'Humeur +10']], ok: S.money >= cost },
      { c: 'trust', text: 'Lui faire confiance et compter sur votre relation', tags: [['risk', Math.round(ch * 100) + ' % de chances de rester']], ok: true },
      { c: 'release', text: 'Accepter son départ contre une indemnité de transfert', tags: [['', '+' + eur(fee)]], ok: true }
    ];
    var box = $('stChoices'); box.innerHTML = ''; var first = null;
    opts.forEach(function (o, i) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'btn choice'; b.setAttribute('data-oc', o.c); b.disabled = !o.ok;
      b.innerHTML = '<span class="k"></span><span class="cw"><span class="ct"></span><span class="tags"></span></span>';
      b.querySelector('.k').textContent = 'ABC'.charAt(i); b.querySelector('.ct').textContent = o.text;
      var tg = b.querySelector('.tags');
      o.tags.forEach(function (x) { var sp = document.createElement('span'); sp.className = 'tag ' + x[0]; sp.textContent = x[1]; tg.appendChild(sp); });
      if (o.ok && !first) first = b;
      box.appendChild(b);
    });
    $('stAsk').hidden = false; $('stDone').hidden = true;
    $('storyScrim').hidden = false; $('app').inert = true; $('tabs').inert = true;
    (first || $('stLater')).focus();
  }
  function offerDone(res) {
    var nm = artName(res.id), vd = $('stVerdict');
    vd.hidden = res.choice !== 'trust';
    if (res.choice === 'trust') { vd.textContent = res.kept ? 'Pari réussi !' : 'Pari perdu…'; vd.className = 'ev-verdict ' + (res.kept ? 'win' : 'loss'); }
    $('stOut').textContent = res.kept ? nm + ' reste sur ton label et refuse l’offre de ' + res.lab + '.' : nm + ' signe chez ' + res.lab + '. Ses albums restent dans ta discographie, et un retour sur ton label reste possible plus tard.';
    var rows = [];
    if (res.cost) rows.push(['Prime', '−' + eur(res.cost)]);
    if (res.kept) rows.push(['Humeur', moodTxt(res.mood)[0]]);
    if (res.fee) rows.push(['Indemnité', '+' + eur(res.fee)]);
    if (res.kept) rows.push(['Fidélité', S.label.kept + ' artiste' + (S.label.kept > 1 ? 's' : '') + ' retenu' + (S.label.kept > 1 ? 's' : '')]);
    var box = $('stReward'); box.innerHTML = '';
    rows.forEach(function (r, k) {
      var row = document.createElement('div'); row.className = 'rw'; row.style.setProperty('--d', (0.2 + k * 0.4) + 's');
      row.innerHTML = '<span class="rl"></span><b class="rv"></b>'; row.firstChild.textContent = r[0]; row.lastChild.textContent = r[1];
      box.appendChild(row);
    });
    $('stAsk').hidden = true; $('stDone').hidden = false; $('stClose').focus();
    blip(res.kept ? 10 : 4); saveLocal(); markCloud();
  }
  function openStory(id) {
    var r = G.artistOf(S, id), st = r && r.story, s = st && G.STORY_BY[st.id];
    if (!s || stv.open) return;
    stv.open = true; stv.id = id; stv.kind = 'story'; stv.opener = document.activeElement;
    setText($('stWho'), artName(id));
    $('stTitle').textContent = G.storyText(S, r, s.title);
    $('stText').textContent = G.storyText(S, r, s.text);
    var box = $('stChoices'); box.innerHTML = ''; var first = null;
    s.choices.forEach(function (c, i) {
      var cost = G.storyCost(S, c), ok = S.money >= cost, b = document.createElement('button');
      b.type = 'button'; b.className = 'btn choice'; b.setAttribute('data-i', i); b.disabled = !ok;
      b.innerHTML = '<span class="k"></span><span class="cw"><span class="ct"></span><span class="tags"></span></span>';
      b.querySelector('.k').textContent = 'ABC'.charAt(i); b.querySelector('.ct').textContent = G.storyText(S, r, c.text);
      var tg = b.querySelector('.tags'), tags = [];
      if (cost) tags.push(['cost' + (ok ? '' : ' short'), 'Coûte ' + eur(cost)]);
      if (c.risk) tags.push(['risk', 'Risqué · ' + Math.round(c.risk * 100) + ' % de réussite']);
      tags.forEach(function (x) { var sp = document.createElement('span'); sp.className = 'tag ' + x[0]; sp.textContent = x[1]; tg.appendChild(sp); });
      if (!tags.length) tg.remove();
      if (ok && !first) first = b;
      box.appendChild(b);
    });
    $('stAsk').hidden = false; $('stDone').hidden = true;
    $('storyScrim').hidden = false; $('app').inert = true; $('tabs').inert = true;
    (first || $('stLater')).focus();
  }
  function closeStory() {
    if (!stv.open) return;
    stv.open = false;
    $('storyScrim').hidden = true; $('app').inert = false; $('tabs').inert = false;
    var o = stv.opener; stv.opener = null;
    if (o && document.body.contains(o) && !o.closest('[hidden]') && o.focus) { try { o.focus(); } catch (e) { /* facultatif */ } }
    lbv.key = ''; render();
  }
  function bindStory() {
    $('stChoices').addEventListener('click', function (e) {
      var ob = e.target.closest('button[data-oc]');
      if (ob && !ob.disabled && stv.kind === 'offer') { var or = G.resolveOffer(S, stv.id, ob.getAttribute('data-oc')); if (or) offerDone(or); return; }
      var ib = e.target.closest('button[data-ic]');
      if (ib && !ib.disabled && stv.kind === 'inc') { var ir = G.resolveIncident(S, stv.id, +ib.getAttribute('data-ic')); if (ir) incidentDone(ir); return; }
      var b = e.target.closest('button[data-i]'); if (!b || b.disabled) return;
      var res = G.resolveStory(S, stv.id, +b.getAttribute('data-i'));
      if (!res) return;
      var vd = $('stVerdict'); vd.hidden = res.win === null;
      if (res.win !== null) { vd.textContent = res.win ? 'Pari réussi !' : 'Pari perdu…'; vd.className = 'ev-verdict ' + (res.win ? 'win' : 'loss'); }
      $('stOut').textContent = res.text;
      var box = $('stReward'); box.innerHTML = '';
      res.rewards.forEach(function (r, k) {
        var row = document.createElement('div'); row.className = 'rw'; row.style.setProperty('--d', (0.2 + k * 0.4) + 's');
        row.innerHTML = '<span class="rl"></span><b class="rv"></b>'; row.firstChild.textContent = ST_LABEL[r.k]; row.lastChild.textContent = stReward(r);
        box.appendChild(row);
      });
      $('stAsk').hidden = true; $('stDone').hidden = false; $('stClose').focus();
      blip(8); saveLocal(); markCloud();
    });
    $('stLater').addEventListener('click', closeStory);
    $('stClose').addEventListener('click', closeStory);
    $('storyScrim').addEventListener('click', function (e) { if (e.target === $('storyScrim')) closeStory(); });
    document.addEventListener('keydown', function (e) { if (stv.open && e.key === 'Escape') { e.preventDefault(); closeStory(); } });
  }
  function bindClash() {
    $('clashBody').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-cl]'); if (!b) return;
      if (b.getAttribute('data-cl') === 'go') openClash();
      else { G.declineBattle(S); saveLocal(); toast('Défi décliné. Un autre rival se présentera bientôt.'); cl.key = ''; render(); }
    });
    $('clGo').addEventListener('click', startClash);
    $('clMetro').addEventListener('change', function () { cl.metro = this.checked; try { localStorage.setItem(METKEY, cl.metro ? '1' : '0'); } catch (e) { /* facultatif */ } });
    $('clLater').addEventListener('click', closeClash);
    $('clClose').addEventListener('click', closeClash);
    $('clQuit').addEventListener('click', function () { finishClash(true); });
    $('clSoundOn').addEventListener('click', function () {
      vol.gameOn = true; if (vol.game <= 0) vol.game = VDEF; saveVol();
      markCloud(); saveLocal(); $('clSoundOn').hidden = true; setText($('clTip'), 'Son activé : chaque frappe joue ton beat par-dessus la ligne de basse du rival.'); blip(8);
      if (bind.syncSound) bind.syncSound(); if (bind.syncVol) bind.syncVol();
      $('clGo').focus();
    });
    $('clPads').addEventListener('pointerdown', function (e) {
      var p = e.target.closest('.clpad'); if (!p) return;
      e.preventDefault(); p.classList.add('down'); clHit(+p.getAttribute('data-l'));
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(function (ev2) { $('clPads').addEventListener(ev2, function (e) { var p = e.target.closest('.clpad'); if (p) p.classList.remove('down'); }); });
    // pads au clavier (Entrée / Espace sur le pad sélectionné)
    $('clPads').addEventListener('keydown', function (e) { if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) { var p = e.target.closest('.clpad'); if (p) { e.preventDefault(); clHit(+p.getAttribute('data-l')); } } });
    document.addEventListener('keydown', function (e) {
      if (!cl.open) return;
      var k = LANE_KEYS[(e.key || '').toLowerCase()];
      if (cl.playing && k !== undefined && cl.cfg.kind === 'piano') { e.preventDefault(); if (!e.repeat) cl.tiles.tap(k); return; }
      if (cl.playing && k !== undefined) { e.preventDefault(); if (!e.repeat) { clHit(k); var pd = $('clPads').children[k]; pd.classList.add('down'); setTimeout(function () { pd.classList.remove('down'); }, 90); } return; }
      if (e.key === 'Escape' && !cl.playing) { e.preventDefault(); closeClash(); }
    });
    window.addEventListener('resize', function () { if (cl.playing) { if (cl.cfg.kind === 'piano') { cl.tiles.size(); cl.tiles.draw(); } else clSize(); } });
    document.addEventListener('visibilitychange', function () { if (document.hidden && cl.playing) finishClash(true); });
  }

  // ---------- Projets de création (bonus) ----------
  var pjv = { key: '', t: 0, wasOpen: null, open: false, opener: null, cfg: { genre: 'rap', mood: null, pub: null, fmt: 'single', sl: [50, 50, 50], team: [null, null, null], artist: null }, confirm: false };
  var GRADE = { top: 'idéal', ok: 'neutre', bad: 'à éviter' };
  function pjGenreName(id) { return G.PJ_G[id] ? G.PJ_G[id].name : id; }
  function pjMeta(c) { return G.PJ_F[c.fmt].name + ' · ' + pjGenreName(c.genre) + ' · ' + G.PJ_M[c.mood].name + ' · ' + G.PJ_P[c.pub].name; }
  function pjNote(n) { return nf1.format(n) + '/10'; }
  function pjWeek(m) { return m.pj && m.pj.w < D.PROJECTS.sales.length ? m.pj.sales * D.PROJECTS.sales[m.pj.w] : 0; }
  function renderProj(force) {
    var open = G.projOpen(S), P = S.proj, c = P.cur, onProd = $('app').getAttribute('data-view') === 'charts';
    if (pjv.wasOpen === false && open && !quiet) toast('Nouveau : les projets de création. Un bonus facultatif à lancer depuis l’onglet Top 50.', 6500);
    pjv.wasOpen = open;
    setHidden($('projBox'), !open);
    if (!open) return;
    var now = performance.now();
    if (!force && (!onProd || now - pjv.t < 200)) return;
    pjv.t = now;
    setText($('projChip'), P.done ? P.done + (P.done > 1 ? ' projets · record ' : ' projet · record ') + pjNote(P.best) : 'Bonus');
    var key = (c ? 'run' + c.phase + c.title : 'idle') + '|' + (P.last ? P.last.title + P.last.avg : '') + '|' + pjv.confirm + '|' + S.team.staff.length;
    var body = $('projBody');
    if (key !== pjv.key) {
      pjv.key = key;
      var h = '';
      if (P.last) {
        var L = P.last, gn = pjGenreName(L.genre);
        h += '<article class="card proj-card proj-res"><div class="proj-score"><b>' + pjNote(L.avg) + '</b><span>' + esc(L.title) + '</span></div>' +
          '<p class="proj-meta">' + esc(pjMeta(L)) + '</p>' +
          '<div class="critics">' + L.notes.map(function (x) { return '<div class="critic"><span>' + esc(x.name) + '</span><b>' + nf1.format(x.n) + '</b></div>'; }).join('') + '</div>' +
          '<ul class="verdicts">' +
          '<li class="' + L.combo + '">' + esc(gn) + ' et ' + esc(G.PJ_M[L.mood].name.toLowerCase()) + ' : association ' + (L.combo === 'top' ? 'excellente' : L.combo === 'bad' ? 'ratée' : 'correcte') + '.</li>' +
          '<li class="' + L.pubG + '">Public ' + esc(G.PJ_P[L.pub].name.toLowerCase()) + ' : ' + (L.pubG === 'top' ? 'la cible idéale.' : L.pubG === 'bad' ? 'pas du tout sa cible.' : 'une cible correcte.') + '</li>' +
          '<li class="' + (L.acc >= 85 ? 'top' : L.acc < 50 ? 'bad' : 'ok') + '">Réglages des phases justes à ' + L.acc + ' %. Le carnet garde la zone probable.</li>' +
          '<li class="' + (L.fit >= 75 ? 'top' : L.fit < 45 ? 'bad' : 'ok') + '">Apport de l’équipe : ' + L.fit + ' %.</li>' +
          (L.artist ? '<li class="' + (L.artist.dMood >= 0 ? 'top' : 'bad') + '">' + esc(artName(L.artist.id)) + ' : ' + (L.artist.match ? '' : 'pas son genre, ') + 'humeur ' + moodTxt(L.artist.mood)[0].toLowerCase() + ' (' + (L.artist.dMood >= 0 ? '+' : '') + Math.round(L.artist.dMood) + '), notoriété ' + Math.round(L.artist.fame) + ' (' + (L.artist.dFame >= 0 ? '+' : '') + Math.round(L.artist.dFame) + ')' + (L.artist.ask ? ', demande comblée' : '') + (L.artist.duo ? ', duo avec ' + esc(artName(L.artist.duo)) : '') + (L.artist.style ? ', nouveau style assumé' : '') + '.</li>' : '') +
          (L.tg || L.tm ? '<li class="top">Dans l’air du temps : ' + (L.tg && L.tm ? 'genre et ambiance à la mode' : L.tg ? 'genre à la mode, ventes boostées' : 'ambiance à la mode') + '.</li>' : '') +
          (L.fresh < 0 ? '<li class="bad">' + (L.fresh <= -1.5 ? 'Déjà entendu : le public se lasse de cette association.' : 'Encore ce genre : un peu de lassitude.') + '</li>' : '') +
          '</ul><p class="proj-meta">' + (L.pos ? 'Entré au Top 50 à la place ' + L.pos + '. Ventes attendues : ' + eur(L.sales) + ' sur ' + D.PROJECTS.sales.length + ' semaines s’il reste classé (budget ' + eur(L.cost) + ').' : 'Pas assez fort pour entrer au Top 50 : aucune vente.') + '</p>' +
          '<button class="btn sm" type="button" data-pj="dismiss">Ranger le compte rendu</button></article>';
      }
      if (c) {
        h += '<article class="card proj-card"><h4>' + esc(c.title) + '</h4><p class="proj-meta">' + (c.artist ? 'Album de ' + esc(artName(c.artist)) + ' · ' : '') + esc(pjMeta(c)) + '</p><div class="proj-phases">' +
          D.PROJECTS.phases.map(function (ph, i) {
            var m = c.team[i] ? G.findMember(S, c.team[i]) : null;
            return '<div class="proj-ph' + (i < c.phase ? ' done' : i === c.phase ? ' now' : '') + '"><span>' + esc(ph.name) + '</span><span class="meter"><i data-pjm="' + i + '"></i></span><span>' + (m ? esc(m.name) : 'Personne') + '</span></div>';
          }).join('') + '</div><p class="proj-meta" id="pjLeft"></p>' +
          (pjv.confirm ? '<div class="confirm"><span>Abandonner « ' + esc(c.title) + ' » ? La moitié du budget est remboursée.</span><div class="row"><button class="btn sm danger" type="button" data-pj="cancelGo">Abandonner</button><button class="btn sm" type="button" data-pj="cancelNo">Continuer</button></div></div>'
            : '<div class="proj-row"><button class="btn sm" type="button" data-pj="cancel">Abandonner le projet</button></div>') + '</article>';
      } else {
        h += '<article class="card proj-card"><p class="proj-meta m-hide" style="font-weight:600">Choisis un genre, une ambiance, un public et règle chaque phase. Tes productions continuent pendant ce temps : c’est un bonus, pas une obligation.</p>' +
          '<div class="proj-row"><button class="btn primary" type="button" data-pj="new"><span>Nouveau projet</span><small id="pjFrom"></small></button></div></article>';
      }
      body.innerHTML = h;
    }
    if (c) {
      var tot = 0, done = 0;
      D.PROJECTS.phases.forEach(function (ph, i) {
        var T = G.projTime(c.fmt, i), f = i < c.phase ? 1 : i === c.phase ? c.t / T : 0, el = body.querySelector('[data-pjm="' + i + '"]');
        if (el) el.style.width = (f * 100).toFixed(1) + '%';
        tot += T; done += T * f;
      });
      var cur = c.team[c.phase] ? G.findMember(S, c.team[c.phase]) : null;
      setText($('pjLeft'), 'Phase ' + (c.phase + 1) + ' sur 3 · encore ' + dur(tot - done) + '.' + (cur ? ' ' + cur.name + ' quitte son poste pendant cette phase.' : '') + ' Le projet avance quand le jeu est ouvert.');
    } else if ($('pjFrom')) setText($('pjFrom'), 'dès ' + eur(G.projCost(S, 'single')));
  }

  function pjGrade(kind, g, x) { var b = S.proj.book; return (kind === 'm' ? b.c : b.p)[g + '|' + x] || ''; }
  function pickBtn(attr, id, label, on, dis, extra, grade) {
    return '<button type="button" class="pk" data-' + attr + '="' + id + '" aria-pressed="' + on + '"' + (dis ? ' disabled' : '') + '>' +
      (grade !== undefined ? '<i class="gd ' + grade + '" aria-hidden="true"></i>' : '') + esc(label) + (extra ? ' <small>' + esc(extra) + '</small>' : '') +
      (grade ? '<span class="sr-only"> (' + GRADE[grade] + ' d’après ton carnet)</span>' : '') + '</button>';
  }
  function renderPjForm() {
    var cf = pjv.cfg, PR = D.PROJECTS;
    if (cf.artist && !G.artistOf(S, cf.artist)) cf.artist = null;
    var ART = cf.artist ? G.ART_BY[cf.artist] : null;
    var AR = ART ? G.artistOf(S, ART.id) : null;
    function gOk(id) { return G.genreOpen(S, id) || (ART && (ART.genre === id || AR.style === id)); }
    if (!gOk(cf.genre)) cf.genre = 'rap';
    var ros = G.labelOpen(S) ? S.label.roster : [];
    setHidden($('pjForBox'), !ros.length);
    $('pjFor').innerHTML = ros.length ? '<button type="button" class="pk" data-artist="" aria-pressed="' + !cf.artist + '">Le studio</button>' + ros.map(function (r) {
      var a = G.ART_BY[r.id]; return '<button type="button" class="pk" data-artist="' + r.id + '" aria-pressed="' + (cf.artist === r.id) + '">' + esc(a.name) + (r.ask ? ' <small>demande</small>' : '') + '</button>';
    }).join('') : '';
    setText($('pjForNote'), ART ? ART.name + ' fait du ' + G.PJ_G[ART.genre].name + ' et aime ' + ART.likes.map(function (m) { return G.PJ_M[m].name.toLowerCase(); }).join(' et ') + '. Son humeur (' + moodTxt(AR.mood)[0].toLowerCase() + ') pèse sur la note, sa notoriété sur les ventes.' + (AR.style ? ' Envie du moment : ' + G.PJ_G[AR.style].name + '.' : '') + (AR.duo ? ' Duo prévu avec ' + artName(AR.duo) + ' (bonus de note).' : '') : ros.length ? 'Un projet libre pour le studio, ou l’album d’un de tes artistes.' : '');
    if (!G.formatOpen(S, cf.fmt)) cf.fmt = 'single';
    $('pjFmt').innerHTML = PR.formats.map(function (f) { var ok = G.formatOpen(S, f.id); return pickBtn('fmt', f.id, f.name, cf.fmt === f.id, !ok, ok ? (f.cost > 1 ? '×' + nf1.format(f.cost) + ' budget' : '') : 'dès ' + D.TIERS[f.tier].name.toLowerCase()); }).join('');
    var trd = G.trendFor(S);
    $('pjGenre').innerHTML = PR.genres.map(function (g) { var ok = gOk(g.id); return pickBtn('genre', g.id, g.name, cf.genre === g.id, !ok, ok ? (ART && ART.genre === g.id ? 'son genre' : ART && AR.style === g.id ? 'son envie' : '') : 'recherche ' + G.RD_BY[g.rd].name); }).join('');
    $('pjMood').innerHTML = PR.moods.map(function (m) { return pickBtn('mood', m.id, m.name, cf.mood === m.id, false, '', pjGrade('m', cf.genre, m.id)); }).join('');
    $('pjPub').innerHTML = PR.pubs.map(function (p) { return pickBtn('pub', p.id, p.name, cf.pub === p.id, false, '', pjGrade('p', cf.genre, p.id)); }).join('');
    if (ART) ART.likes.forEach(function (m) { var b = $('pjMood').querySelector('[data-mood="' + m + '"]'); if (b) { var s = document.createElement('span'); s.className = 'lk'; s.textContent = 'aime'; b.appendChild(s); } });
    if (trd) [['pjGenre', 'genre', trd.g], ['pjMood', 'mood', trd.m]].forEach(function (q) {
      var b = $(q[0]).querySelector('[data-' + q[1] + '="' + q[2] + '"]');
      if (b && !b.disabled) { var s = document.createElement('span'); s.className = 'tr'; s.textContent = 'tendance'; b.appendChild(s); }
    });
    var known = Object.keys(S.proj.book.c).length;
    $('pjLegend').innerHTML = '<span>Carnet du studio, ' + known + ' association' + (known > 1 ? 's' : '') + ' découverte' + (known > 1 ? 's' : '') + ' :</span><span><i class="gd-l top"></i>idéal</span><span><i class="gd-l ok"></i>neutre</span><span><i class="gd-l bad"></i>à éviter</span><span><i class="gd-l"></i>inconnu</span>';
    var h = S.proj.book.h[cf.genre], staff = S.team.staff;
    $('pjPhases').innerHTML = PR.phases.map(function (ph, i) {
      var z = h && h[i], zone = z && z[1] - z[0] < 100 ? '<i class="zone" style="left:' + z[0] + '%;width:' + Math.max(2, z[1] - z[0]) + '%"></i>' : '';
      var opts = '<option value="">Personne (apport ' + Math.round(G.phaseFit(S, i, null) * 100) + ' %)</option>' + staff.map(function (m) {
        return '<option value="' + m.id + '"' + (cf.team[i] === m.id ? ' selected' : '') + '>' + esc(m.name) + ' · ' + esc(G.ROLE_BY[m.role].name) + ' (apport ' + Math.round(G.phaseFit(S, i, m.id) * 100) + ' %)</option>';
      }).join('');
      return '<div class="pj-phase"><div class="lbl-row"><b>' + (i + 1) + '. ' + esc(ph.name) + '</b><span class="small-note">' + dur(G.projTime(cf.fmt, i)) + '</span></div>' +
        '<div class="pj-range">' + zone + '<input type="range" min="0" max="100" step="5" value="' + cf.sl[i] + '" data-sl="' + i + '" aria-label="' + esc(ph.name) + ', de ' + esc(ph.lo) + ' à ' + esc(ph.hi) + '"></div>' +
        '<div class="pj-ends"><span>' + esc(ph.lo) + '</span><span>' + esc(ph.hi) + '</span></div>' +
        '<select data-team="' + i + '" aria-label="Membre de l’équipe pour ' + esc(ph.name) + '"' + (staff.length ? '' : ' disabled') + '>' + opts + '</select></div>';
    }).join('');
    setText($('pjTeamNote'), (h ? 'La bande verte sur un curseur montre la zone probable notée dans le carnet pour ce genre. ' : 'Un premier projet dans ce genre révélera dans le carnet la zone à viser sur chaque curseur. ') +
      (staff.length ? 'Un membre affecté à une phase quitte son poste de production le temps de cette phase.' : 'Recrute une équipe pour renforcer les phases.'));
    pjFoot();
  }
  function pjFoot() {
    var cf = pjv.cfg, cost = G.projCost(S, cf.fmt), tot = 0;
    D.PROJECTS.phases.forEach(function (ph, i) { tot += G.projTime(cf.fmt, i); });
    setText($('pjCost'), 'Budget ' + eur(cost));
    setText($('pjInfo'), !cf.mood ? 'Choisis une ambiance.' : !cf.pub ? 'Choisis un public.' : S.money < cost ? 'Budget insuffisant.' : 'Durée ' + dur(tot) + ', jeu ouvert.');
    setDisabled($('pjGo'), !cf.mood || !cf.pub || S.money < cost || !!S.proj.cur);
  }
  var TW = ['Minuit', 'Néon', 'Asphalte', 'Comète', 'Velours', 'Mirage', 'Orage', 'Sirène', 'Cendres', 'Lumière', 'Satellite', 'Rivage'];
  var TT = ['sur la ville', 'de juillet', 'en boucle', 'sans retour', 'au ralenti', 'dans le noir', 'pour toujours', 'à l’horizon'];
  function suggestTitle() { return TW[Math.floor(Math.random() * TW.length)] + ' ' + TT[Math.floor(Math.random() * TT.length)]; }
  function openProj(artist) {
    if (pjv.open || !G.projOpen(S) || S.proj.cur) return;
    pjv.open = true; pjv.opener = document.activeElement;
    var cf = pjv.cfg;
    cf.artist = typeof artist === 'string' && G.artistOf(S, artist) ? artist : null;
    if (cf.artist) cf.genre = G.ART_BY[cf.artist].genre;
    cf.team = cf.team.map(function (id) { return id && G.findMember(S, id) ? id : null; });
    $('pjName').value = ''; $('pjName').placeholder = suggestTitle();
    setText($('pjTitle'), cf.artist ? 'Album de ' + G.ART_BY[cf.artist].name : 'Nouveau projet');
    renderPjForm();
    $('projScrim').hidden = false; $('app').inert = true;
    $('projScrim').querySelector('.sheet').scrollTop = 0;
    $('pjName').focus();
  }
  function closeProj() {
    if (!pjv.open) return;
    pjv.open = false;
    $('projScrim').hidden = true; $('app').inert = false;
    var o = pjv.opener; pjv.opener = null;
    if (o && document.body.contains(o) && !o.closest('[hidden]') && o.focus) { try { o.focus(); } catch (e) { /* facultatif */ } }
    else { var b = $('projBody').querySelector('button'); if (b) b.focus(); }
  }
  function bindProj() {
    $('projBody').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-pj]'); if (!b) return;
      var a = b.getAttribute('data-pj'), nb;
      if (a === 'new') openProj();
      else if (a === 'dismiss') { G.dismissProject(S); saveLocal(); renderProj(true); nb = $('projBody').querySelector('button'); if (nb) nb.focus(); }
      else if (a === 'cancel') { pjv.confirm = true; renderProj(true); nb = $('projBody').querySelector('[data-pj="cancelNo"]'); if (nb) nb.focus(); }
      else if (a === 'cancelNo') { pjv.confirm = false; renderProj(true); }
      else if (a === 'cancelGo') { var back = G.cancelProject(S); pjv.confirm = false; saveLocal(); markCloud(); toast('Projet abandonné, ' + eur(back) + ' remboursés.'); renderProj(true); render(); }
    });
    var scrim = $('projScrim'), KS = ['fmt', 'genre', 'mood', 'pub'];
    scrim.addEventListener('click', function (e) {
      if (e.target === scrim) { closeProj(); return; }
      var b = e.target.closest('button.pk'); if (!b || b.disabled) return;
      if (b.hasAttribute('data-artist')) {
        var aid = b.getAttribute('data-artist') || null;
        pjv.cfg.artist = aid; if (aid) pjv.cfg.genre = G.ART_BY[aid].genre;
        renderPjForm();
        var fb = scrim.querySelector('[data-artist="' + (aid || '') + '"]'); if (fb) fb.focus();
        return;
      }
      var k = KS.filter(function (x) { return b.hasAttribute('data-' + x); })[0]; if (!k) return;
      var v = b.getAttribute('data-' + k);
      pjv.cfg[k] = v;
      renderPjForm();
      var nb = scrim.querySelector('[data-' + k + '="' + v + '"]'); if (nb) nb.focus();
    });
    scrim.addEventListener('input', function (e) {
      var i = e.target.getAttribute('data-sl'); if (i !== null) pjv.cfg.sl[+i] = Math.max(0, Math.min(100, +e.target.value || 0));
    });
    scrim.addEventListener('change', function (e) {
      var i = e.target.getAttribute('data-team');
      if (i !== null) { var id = +e.target.value || null; pjv.cfg.team[+i] = id; }
    });
    $('pjClose').addEventListener('click', closeProj);
    $('pjGo').addEventListener('click', function () {
      var cf = pjv.cfg;
      var c = G.startProject(S, { genre: cf.genre, mood: cf.mood, pub: cf.pub, fmt: cf.fmt, sl: cf.sl.slice(), team: cf.team.slice(), artist: cf.artist, title: $('pjName').value.trim() || $('pjName').placeholder });
      if (!c) { pjFoot(); return; }
      saveLocal(); markCloud();
      closeProj(); pjv.key = ''; renderProj(true); render();
    });
    document.addEventListener('keydown', function (e) { if (pjv.open && e.key === 'Escape') { e.preventDefault(); closeProj(); } });
  }

  // ---------- Recherche ----------
  var rdv = { key: '', t: 0, nodes: {} };
  function fmtPts(n) { return short(Math.floor(n)); }
  function renderRd(force) {
    var R = G.RESEARCH, rd = S.rd, onRd = $('app').getAttribute('data-view') === 'rd';
    var affordable = R.nodes.some(function (n) { return G.canResearch(S, n.id); });
    var specReady = R.specs.some(function (t) { return G.specOpen(S, t.tier) && !rd.spec[t.tier]; });
    setClass($('tabRd'), 'has', !onRd && specReady);
    setClass($('tabRd'), 'warn', !onRd && !specReady && affordable);
    if (!onRd && !force) return;
    var now = performance.now();
    if (!force && now - rdv.t < 250) return;
    rdv.t = now;
    setText($('rdPts'), fmtPts(rd.pts));
    setText($('rdCount'), G.rdCount(S) + ' / ' + R.nodes.length);
    var rate = G.rdRate(S) * 60;
    setText($('rdRate'), (rate >= 1 ? '+' + fmtPts(rate) + ' par minute grâce aux productions automatiques. ' : 'Chaque production terminée en rapporte. ') + 'Mix, commandes et Top 50 en donnent en plus.');
    var key = Object.keys(rd.nodes).sort().join(',') + '|' + JSON.stringify(rd.spec) + '|' + G.specOpen(S, 1) + G.specOpen(S, 2);
    if (key !== rdv.key) {
      rdv.key = key;
      var sb = $('rdSpecs'); sb.innerHTML = '';
      R.specs.forEach(function (t) {
        var open = G.specOpen(S, t.tier), chosen = rd.spec[t.tier];
        var box = document.createElement('div'); box.className = 'spec-tier';
        box.innerHTML = '<h3></h3><p></p><div class="spec-opts"></div>';
        box.querySelector('h3').textContent = 'Spécialisation ' + t.tier + ' · ' + t.name;
        box.querySelector('p').textContent = chosen ? 'Choix fait pour cette carrière. Tu pourras en changer après une tournée mondiale.' : open ? 'Choisis une seule voie : le choix est définitif jusqu’à ta prochaine tournée.' : 'Se débloque à ' + t.need + ' recherches terminées (' + G.rdCount(S) + ' / ' + t.need + ').';
        var opts = box.querySelector('.spec-opts');
        t.options.forEach(function (o) {
          var el = document.createElement('article');
          el.className = 'card spec' + (chosen === o.id ? ' chosen' : chosen ? ' off' : '');
          el.innerHTML = '<div><b></b><p></p></div>' + (chosen === o.id ? '<span class="rd-tag">✓ Choisie</span>' : chosen ? '' : '<button class="btn sm primary" type="button" data-spec="' + o.id + '" data-tier="' + t.tier + '"' + (open ? '' : ' disabled') + '>Choisir</button>');
          el.querySelector('b').textContent = o.name; el.querySelector('p').textContent = o.desc;
          opts.appendChild(el);
        });
        sb.appendChild(box);
      });
      var tb = $('rdTree'); tb.innerHTML = ''; rdv.nodes = {};
      R.branches.forEach(function (b) {
        var sec = document.createElement('section'); sec.className = 'rd-branch rd-' + b.id;
        sec.innerHTML = '<h3><i aria-hidden="true"></i></h3><p class="rd-bdesc"></p><div class="rd-chain"></div>';
        sec.querySelector('h3').appendChild(document.createTextNode(b.name)); sec.querySelector('p').textContent = b.desc;
        var chain = sec.querySelector('.rd-chain'), prevOwned = true;
        G.branchNodes(b.id).forEach(function (n) {
          var own = !!rd.nodes[n.id], next = !own && prevOwned, cost = fmtPts(G.researchCost(n.id)) + ' pts';
          var el = document.createElement('article');
          el.className = 'card rd-node' + (own ? ' own' : next ? ' next' : ' lock');
          el.innerHTML = '<div><b></b><p></p></div>' + (own ? '<span class="rd-tag">✓ Acquise</span>' : next ? '<button class="btn sm primary" type="button" data-rd="' + n.id + '">' + cost + '</button>' : '<span class="rd-tag dim">' + cost + '</span>');
          el.querySelector('b').textContent = n.name; el.querySelector('p').textContent = n.desc;
          chain.appendChild(el);
          if (next) rdv.nodes[n.id] = el.querySelector('button');
          prevOwned = own;
        });
        tb.appendChild(sec);
      });
    }
      // spécialisations en tête quand un choix attend, sinon sous l'arbre
      var sbx = $('rdSpecs'), tbx = $('rdTree');
      if (specReady !== (sbx.nextElementSibling === tbx)) tbx.parentNode.insertBefore(sbx, specReady ? tbx : tbx.nextSibling);
    Object.keys(rdv.nodes).forEach(function (id) { setDisabled(rdv.nodes[id], !G.canResearch(S, id)); });
  }

  // ---------- Commandes clients ----------
  var ord = { key: '', cards: {}, t: 0, wasOpen: null };
  function orderCard(x, active) {
    var act = G.ACT_BY[x.act], needMix = x.q > G.baseQuality(S, x.act);
    var el = document.createElement('article');
    el.className = 'card order' + (active ? ' active' : '');
    el.setAttribute('data-oid', x.id);
    el.innerHTML = '<div class="o-head"><b></b><span class="p"></span></div>' +
      '<p class="o-what"></p>' +
      (active ? '<span class="meter" aria-hidden="true"><i data-k="fill"></i></span>' : '') +
      '<div class="o-meta"><span data-k="a"></span><span data-k="b"></span></div>' +
      (active ? '' : '<div class="o-btns"><button class="btn sm primary" type="button" data-oact="accept">Accepter</button><button class="btn sm" type="button" data-oact="decline">Refuser</button></div>');
    el.querySelector('.o-head b').textContent = x.client + ' · ' + x.kind;
    el.querySelector('.o-head .p').textContent = '+' + eur(x.reward);
    if (x.trend) { var vt = document.createElement('span'); vt.className = 'vogue'; vt.textContent = 'Tendance'; el.querySelector('.o-head b').appendChild(document.createTextNode(' ')); el.querySelector('.o-head b').appendChild(vt); }
    el.querySelector('.o-what').innerHTML = '<b>' + x.n + ' ×</b> ' + esc(act.name) + ' · qualité ' + starsHtml(x.q) + ' min.' + (needMix ? ' <span class="need-mix">Exige un mix</span>' : '');
    var r = { root: el, x: x, active: active };
    el.querySelectorAll('[data-k]').forEach(function (n) { r[n.getAttribute('data-k')] = n; });
    r.accept = el.querySelector('[data-oact="accept"]');
    return r;
  }
  function renderOrders() {
    var open = G.ordersOpen(S), o = S.orders, onProd = $('app').getAttribute('data-view') === 'prod';
    if (ord.wasOpen === false && open && !quiet) toast('Des clients commencent à t’appeler : retrouve leurs commandes dans Productions.', 6000);
    ord.wasOpen = open;
    setHidden($('ordersBox'), !open);
    setClass($('tabProd'), 'has', open && !onProd && o.offers.length > 0 && o.active.length < G.orderMax(S));
    if (!open) return;
    var now = performance.now();
    if (!onProd && now - ord.t < 1000) return;
    ord.t = now;
    setText($('repChip'), 'Réputation ' + Math.round(o.rep) + ' / ' + D.TUNING.repMax);
    var key = o.active.map(function (x) { return 'a' + x.id; }).concat(o.offers.map(function (x) { return 'o' + x.id; })).join(',') + '|' + G.tierIndex(S);
    if (key !== ord.key) {
      ord.key = key;
      var box = $('orderList'); box.innerHTML = ''; ord.cards = {};
      o.active.forEach(function (x) { var c = orderCard(x, true); box.appendChild(c.root); ord.cards['a' + x.id] = c; });
      o.offers.forEach(function (x) { var c = orderCard(x, false); box.appendChild(c.root); ord.cards['o' + x.id] = c; });
    }
    var full = o.active.length >= G.orderMax(S);
    Object.keys(ord.cards).forEach(function (k) {
      var c = ord.cards[k], x = c.x;
      if (c.active) {
        setWidth(c.fill, x.got / x.n * 100);
        setText(c.a, x.got + ' / ' + x.n + ' livré' + (x.got > 1 ? 's' : ''));
        setText(c.b, 'Reste ' + clock(x.left));
        setClass(c.root, 'urgent', x.left < 30);
      } else {
        setText(c.a, 'Délai : ' + dur(x.time));
        setText(c.b, 'Offre valable ' + clock(x.life));
        setDisabled(c.accept, full);
      }
    });
    setText($('orderNote'), !o.active.length && !o.offers.length ? 'Pas de demande pour l’instant. Prochain appel dans ' + clock(o.cd) + '. La réputation augmente la prime des commandes et ton classement au Top 50.'
      : full && o.offers.length ? 'Tu mènes déjà ' + G.orderMax(S) + ' commandes : termine-en une pour en accepter une autre.' : 'Les productions terminées comptent si leur qualité suffit. Un délai dépassé coûte ' + D.TUNING.repLose + ' points de réputation.');
  }

  // ---------- Top 50 ----------
  var chs = { key: '', t: 0, listT: 0, wasOpen: null };
  function moveHtml(e) {
    if (!e.prev) return '<span class="mv new">NEW</span>';
    var d = e.prev - e.pos;
    return d > 0 ? '<span class="mv up">▲' + d + '</span>' : d < 0 ? '<span class="mv down">▼' + (-d) + '</span>' : '<span class="mv">=</span>';
  }
  function renderCharts(force) {
    var open = G.chartsOpen(S), c = S.charts, onCh = $('app').getAttribute('data-view') === 'charts';
    if (chs.wasOpen === false && open && !quiet) toast('Le Top 50 est ouvert : sors tes titres et grimpe au classement.', 6000);
    chs.wasOpen = open;
    setClass($('tabCharts'), 'has', open && !onCh && S.masters.length > 0);
    setHidden($('chartLock'), open); setHidden($('chartOpen'), !open);
    if (!open) { setText($('chartWeek'), ''); setText($('chartLockText'), 'Atteins le niveau d’expertise ' + D.TUNING.chartLevel + ' pour sortir tes titres face aux studios rivaux.'); return; }
    if (!onCh && !force) return;
    setText($('chartWeek'), 'Semaine ' + c.week + ' · fin dans ' + clock(c.left));
    var pc = G.promoCost(S);
    setText($('promoP'), 'Coûte ' + eur(pc) + ' · place au classement ×' + nf1.format(D.TUNING.promoMult));
    setDisabled($('promoChk'), S.money < pc);
    if ($('promoChk').checked && S.money < pc) $('promoChk').checked = false;
    var unlocked = G.ACTS.filter(function (a) { return G.isUnlocked(S, a); });
    var key = S.masters.map(function (m) { return m.id; }).join(',') + '|' + G.canFreeRelease(S) + '|' + unlocked.length + '|' + c.mine.map(function (m) { return m.id + ':' + m.pos; }).join(',');
    if (key !== chs.key || force) {
      chs.key = key;
      var box = $('releaseList'); box.innerHTML = '';
      S.masters.slice().reverse().forEach(function (m) {
        var el = document.createElement('article'); el.className = 'card rel';
        el.innerHTML = '<div><b>Titre mixé · ' + esc(G.ACT_BY[m.act].name) + '</b><p>' + starsHtml(m.q) + '</p></div><button class="btn sm primary" type="button" data-rel="' + m.id + '">Sortir</button>';
        box.appendChild(el);
      });
      var fr = document.createElement('article'); fr.className = 'card rel';
      var opts = unlocked.slice().reverse().map(function (a) { return '<option value="' + a.id + '">' + esc(a.name) + ' (' + G.baseQuality(S, a.id) + '★)</option>'; }).join('');
      fr.innerHTML = '<div><b>Titre du catalogue</b><p>' + (G.canFreeRelease(S) ? 'Qualité de base, une sortie par semaine.' : 'Déjà fait cette semaine.') + '</p><select id="freeAct" aria-label="Production à sortir">' + opts + '</select></div><button class="btn sm" type="button" data-rel="free"' + (G.canFreeRelease(S) ? '' : ' disabled') + '>Sortir</button>';
      box.appendChild(fr);
      if (!S.masters.length) { var n = document.createElement('p'); n.className = 'small-note'; n.style.margin = '0'; n.textContent = 'Mixe une production toi-même (bouton Mixer) pour obtenir un titre de meilleure qualité.'; box.insertBefore(n, fr); }
      var mine = c.mine.slice().sort(function (a, b) { return a.pos - b.pos; });
      setText($('mineNote'), mine.length ? 'Gains par semaine selon la place. Les titres perdent des places au fil des semaines.' : 'Aucun titre classé pour l’instant.');
      $('mineList').innerHTML = mine.map(function (m) {
        return '<li class="mine' + (m.pos === 1 ? ' top1' : '') + '"><span class="pos">' + m.pos + '</span>' + moveHtml({ prev: m.p, pos: m.pos }) + '<span class="tt"><b>' + esc(m.t) + '</b><span>' + (m.pj ? (m.pj.ar ? esc(artName(m.pj.ar)) + ' · ' : '') + '<span class="pjt">' + esc(G.PJ_F[m.pj.f].name + ' ' + pjGenreName(m.pj.g)) + '</span> · ' + pjNote(m.pj.avg) : esc(G.ACT_BY[m.act].name) + ' · ' + starsTxt(m.q)) + ' · ' + m.weeks + ' sem.' + (m.best ? ' · record ' + m.best : '') + '</span></span><span class="gain">+' + eur(G.chartPay(S, m.pos) + pjWeek(m)) + '/sem.</span></li>';
      }).join('');
    }
    var now = performance.now();
    if (now - chs.listT > 2000 || force) {
      chs.listT = now;
      $('chartList').innerHTML = G.chartTop(S).map(function (e) {
        return '<li class="' + (e.mine ? 'mine' : '') + (e.pos === 1 ? ' top1' : '') + '"><span class="pos">' + e.pos + '</span>' + moveHtml(e) + '<span class="tt"><b>' + esc(e.t) + '</b><span>' + (e.mine ? (e.pj ? (e.pj.ar ? 'Ton label · ' + esc(artName(e.pj.ar)) : 'Ton projet') + ' · <span class="pjt">' + esc(pjGenreName(e.pj.g)) + '</span> · ' + pjNote(e.pj.avg) : 'Ta prod · ' + esc(G.ACT_BY[e.act].name) + ' · ' + starsTxt(e.q)) : esc(e.a)) + '</span></span><span class="gain">' + (e.mine ? '+' + eur(G.chartPay(S, e.pos) + pjWeek(e)) : '') + '</span></li>';
      }).join('');
    }
  }

  function bindFeatures() {
    bindProj();
    bindClash();
    bindPiano();
    bindDeco();
    bindLabel();
    bindStory();
    $('rd').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-rd]'), sp = e.target.closest('button[data-spec]');
      if (b && !b.disabled) { if (G.research(S, b.getAttribute('data-rd'))) saveLocal(); renderRd(true); render(); }
      else if (sp && !sp.disabled) { if (G.chooseSpec(S, +sp.getAttribute('data-tier'), sp.getAttribute('data-spec'))) saveLocal(); renderRd(true); render(); }
    });
    $('mixStop').addEventListener('click', mixStop);
    $('mixer').addEventListener('pointerdown', function (e) { e.preventDefault(); mixStop(); });
    $('mixCancel').addEventListener('click', closeMix);
    $('mixClose').addEventListener('click', closeMix);
    document.addEventListener('keydown', function (e) {
      if (!mix.open) return;
      if (e.key === 'Escape') { e.preventDefault(); closeMix(); }
      else if ((e.key === ' ' || e.key === 'Enter') && !mix.done && document.activeElement !== $('mixCancel')) { e.preventDefault(); mixStop(); }
    });
    $('orderList').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-oact]'), card = e.target.closest('[data-oid]');
      if (!b || b.disabled || !card) return;
      var id = +card.getAttribute('data-oid');
      if (b.getAttribute('data-oact') === 'accept') { if (G.acceptOrder(S, id)) toast('Commande acceptée. Au travail !'); }
      else G.declineOrder(S, id);
      ord.key = ''; markCloud(); render();
    });
    $('releaseList').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-rel]');
      if (!b || b.disabled) return;
      var src = b.getAttribute('data-rel'), promo = $('promoChk').checked;
      var r = src === 'free' ? G.release(S, 'free', promo, $('freeAct') && $('freeAct').value) : G.release(S, +src, promo);
      if (!r) { toast('Sortie impossible pour le moment.'); return; }
      $('promoChk').checked = false;
      markCloud(); render(); renderCharts(true);
    });
  }

  // ---------- Construction de l'interface ----------
  function buildActs() {
    var host = $('acts');
    host.innerHTML = '';
    rows = {};
    G.ACTS.forEach(function (act) {
      var el = document.createElement('article');
      el.className = 'strip card';
      el.id = 'strip-' + act.id;
      el.innerHTML =
        '<div class="strip-head"><span class="led" aria-hidden="true"></span><h3>' + act.name + '</h3><span class="who" data-k="who" hidden><i></i><span></span></span><span class="rank" data-k="rank"></span><button class="info-i" type="button" data-info aria-expanded="false" aria-label="Détails : ' + act.name + '">i</button></div>' +
        '<p class="desc">' + act.desc + '</p>' +
        '<p class="lock-note" data-k="lock" hidden></p>' +
        '<div class="live" data-k="live">' +
          '<div class="meter" aria-hidden="true"><i data-k="fill"></i></div>' +
          '<div class="meter-info"><span data-k="gain"></span><span data-k="time"></span></div>' +
          '<div class="actions">' +
            '<div class="go-row"><button class="pad" type="button" id="go-' + act.id + '" data-do="go" data-act="' + act.id + '"><b data-k="goT"></b><small data-k="goS"></small></button>' +
            '<button class="btn mixbtn" type="button" id="mix-' + act.id + '" data-do="mix" data-act="' + act.id + '" title="Mixer toi-même cette production"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3v18M12 3v18M18 3v18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><rect x="3.5" y="12" width="5" height="3.4" rx="1" fill="currentColor"/><rect x="9.5" y="6" width="5" height="3.4" rx="1" fill="currentColor"/><rect x="15.5" y="14.5" width="5" height="3.4" rx="1" fill="currentColor"/></svg><small data-k="mixT">Mixer</small></button></div>' +
            '<button class="btn" type="button" id="up-' + act.id + '" data-do="up" data-act="' + act.id + '"><span class="t"><b data-k="upT">Perfectionner</b><small data-k="upS"></small></span><span class="p" data-k="upP"></span></button>' +
            '<button class="btn" type="button" id="auto-' + act.id + '" data-do="auto" data-act="' + act.id + '"><span class="t"><b>Automatiser</b><small>' + act.autoRole + '</small></span><span class="p" data-k="autoP"></span></button>' +
          '</div>' +
          '<div class="perks" data-k="perks" role="list" aria-label="Paliers de maîtrise">' + G.PERKS.map(function (p) { return '<button type="button" class="perk" role="listitem" data-perk="' + p.id + '" title="Rang ' + p.lvl + ' · ' + p.name + ' : ' + p.desc + '"><b>' + p.lvl + '</b><span>' + p.name + '</span></button>'; }).join('') + '</div>' +
          '<p class="foot-line" data-k="foot"></p>' +
        '</div>';
      host.appendChild(el);
      var r = { root: el, led: el.querySelector('.led') };
      el.querySelectorAll('[data-k]').forEach(function (n) { r[n.getAttribute('data-k')] = n; });
      r.go = el.querySelector('[data-do="go"]'); r.up = el.querySelector('[data-do="up"]'); r.auto = el.querySelector('[data-do="auto"]'); r.mix = el.querySelector('[data-do="mix"]');
      rows[act.id] = r;
    });
  }

  function bindPerks() {
    // Petit « i »: affiche les détails facultatifs d'une carte (description, paliers, qualité...).
    document.addEventListener('click', function (e) {
      var ib = e.target.closest('[data-info]'); if (!ib) return;
      var card = ib.closest('.strip, .unit, .card, .pane');
      if (!card) return;
      var cls = card.classList.contains('pane') ? 'hints' : 'open', on = !card.classList.contains(cls);
      card.classList.toggle(cls, on); ib.setAttribute('aria-expanded', String(on));
    });
    document.querySelectorAll('.pane').forEach(function (p) {
      var h = p.querySelector('h2'); if (!h || !p.querySelector('.hint')) return;
      var b = document.createElement('button'); b.type = 'button'; b.className = 'info-i pane-i'; b.setAttribute('data-info', ''); b.setAttribute('aria-expanded', 'false'); b.setAttribute('aria-label', 'Aide'); b.textContent = 'i';
      h.appendChild(b);
    });
    $('acts').addEventListener('click', function (e) {
      var b = e.target.closest('.perk'); if (!b) return;
      var p = G.PERKS.filter(function (x) { return x.id === b.getAttribute('data-perk'); })[0]; if (!p) return;
      toast('Palier du rang ' + p.lvl + ' · ' + p.name + ' : ' + p.desc + (b.classList.contains('on') ? ' (atteint).' : '.'), 4500);
    });
  }
  function floater(id, text) {
    var r = rows[id];
    if (!r || r.live.hidden) return;
    var f = document.createElement('span');
    f.className = 'float'; f.textContent = text;
    r.live.appendChild(f);
    setTimeout(function () { if (f.parentNode) f.parentNode.removeChild(f); }, 950);
  }

  function visibleItems() {
    var list = G.ITEMS.filter(function (i) { return !i.hidden && !S.owned[i.id]; }).sort(function (a, b) { return a.cost - b.cost; });
    var out = list.filter(function (i, idx) { return idx < 2 || S.lifetime >= i.cost * 0.2; });
    return { out: out, rest: list.slice(out.length) };
  }

  function unlockText(it) {
    if (!it.unlock) return '';
    var act = G.ACT_BY[it.unlock];
    var t = 'Débloque : ' + act.name;
    if (S.level < act.reqLvl) t += ' (expertise niveau ' + act.reqLvl + ' requise)';
    return t;
  }

  function buildShop() {
    var v = visibleItems(), host = $('items');
    host.innerHTML = '';
    rows.items = {};
    v.out.forEach(function (it) {
      var el = document.createElement('article');
      el.className = 'unit card';
      el.innerHTML =
        '<div><span class="tag">' + (it.kind === 'gear' ? 'Matériel' : 'Logiciel et contrats') + '</span><h3>' + it.name + ' <button class="info-i" type="button" data-info aria-expanded="false" aria-label="Détails : ' + it.name + '">i</button></h3><p class="u-desc">' + it.desc + '</p>' +
        (it.unlock ? '<p class="unlock" data-k="unlock"></p>' : '') + '</div>' +
        '<button class="btn primary" type="button" id="buy-' + it.id + '" data-buy="' + it.id + '"><span class="t"><b>Acheter</b></span><span class="p">' + eur(it.cost) + '</span></button>';
      host.appendChild(el);
      rows.items[it.id] = { btn: el.querySelector('button'), unlock: el.querySelector('[data-k="unlock"]'), item: it };
    });
    if (v.rest.length) {
      var t = document.createElement('p');
      t.className = 'teaser';
      t.textContent = v.rest.length + (v.rest.length > 1 ? ' autres équipements restent à découvrir.' : ' autre équipement reste à découvrir.') +
        ' Le prochain apparaît quand tu auras gagné ' + eur(v.rest[0].cost * 0.2) + ' au total.';
      host.appendChild(t);
    }
    var ow = $('owned');
    ow.innerHTML = '';
    G.ITEMS.forEach(function (it) {
      if (!S.owned[it.id]) return;
      var c = document.createElement('span'); c.className = 'chip'; c.textContent = it.name; ow.appendChild(c);
    });
    shopKey = v.out.map(function (i) { return i.id; }).join(',') + '|' + v.rest.length + '|' + Object.keys(S.owned).length;
  }

  // ---------- Affichage ----------
  function render() {
    var vm = G.valueMult(S), V = G.studioValue(S);
    var byAct = {};
    S.team.staff.forEach(function (m) { if (m.act) byAct[m.act] = m; });
    var passive = G.royRate(S), auto = G.activeRate(S), total = passive + auto;

    setText($('money'), eur(S.money));
    var bm = G.boostMult(S);
    setText($('rate'), total > 0 ? '+' + eur(total) + '/s' : 'Lance une production');
    setHidden($('fameSub'), !S.fame); if (S.fame) setText($('fameSub'), 'Renommée ' + S.fame);
    var boosted = bm > 1;
    setHidden($('boost'), !boosted);
    setClass($('lcd'), 'boosted', boosted);
    var cap = G.teamCap(S), open = G.teamOpen(S);
    setText($('teamMini'), open ? S.team.staff.length + ' / ' + cap : 'Niv. ' + D.TUNING.teamLevel);
    setText($('teamMiniSub'), open ? (S.team.staff.length ? '−' + eur(G.payroll(S)) + '/s' : 'Recrute !') : 'pour recruter');
    if (boosted) {
      var bl = S.boost.left, bt = Math.max(S.boost.t || 0, bl);
      setText($('boostMult'), '×' + String(bm).replace('.', ','));
      setText($('boostTime'), clock(bl));
      setWidth($('boostFill'), Math.min(100, bl / bt * 100));
      setClass($('boost'), 'low', bl <= 10);
    }
    setText($('value'), eur(V));
    setText($('valueBonus'), 'bonus ×' + nf2.format(vm) + ' sur les gains');
    setText($('level'), 'Niv. ' + S.level);
    var need = G.xpNeeded(S.level);
    setWidth($('xpFill'), Math.min(100, S.xp / need * 100));
    setText($('xpText'), short(S.xp) + ' / ' + short(need) + ' pts');
    var tr = Math.floor(G.trackCount(S));
    setText($('tracks'), nf0.format(tr) + (tr > 1 ? ' titres' : ' titre'));
    setText($('royText'), passive > 0 ? '+' + eur(passive) + '/s de royalties' : 'Pas encore de royalties');

    var ti = G.tierIndex(S), tier = D.TIERS[ti], next = D.TIERS[ti + 1];
    setText($('tierName'), tier.name);
    setText($('tierNext'), next ? 'palier suivant : ' + eur(next.min) : 'palier maximal');
    setWidth($('tierFill'), next ? Math.min(100, (V - tier.min) / (next.min - tier.min) * 100) : 100);

    var anyUnlockedNow = false;
    G.ACTS.forEach(function (act) {
      var r = rows[act.id], a = S.acts[act.id], un = G.isUnlocked(S, act);
      if (!firstRender && un && prevUnlocked[act.id] === false && !quiet) { toast('Nouvelle production : ' + act.name + '.'); anyUnlockedNow = true; }
      prevUnlocked[act.id] = un;
      setClass(r.root, 'locked', !un);
      setHidden(r.live, !un);
      setHidden(r.lock, un);
      if (!un) {
        setText(r.rank, '');
        setText(r.lock, 'Requiert : ' + G.lockReason(S, act).join(' et ') + '.');
        setClass(r.led, 'on', false);
        return;
      }
      var d = G.duration(S, act), pct = a.run ? Math.min(1, a.prog / d) : 0;
      var pay = G.payout(S, act), xp = G.xpGain(S, act), plan = G.upPlan(S, act, buyN), cost = plan.cost;
      setText(r.rank, 'Rang ' + a.lvl);
      var vg = G.trendAct(S, act.id) > 1;
      if (r.vogue === undefined) { r.vogue = document.createElement('span'); r.vogue.className = 'vogue'; r.vogue.textContent = 'En vogue +' + Math.round((D.TUNING.trendAct - 1) * 100) + ' %'; r.rank.parentNode.insertBefore(r.vogue, r.rank); }
      setHidden(r.vogue, !vg);
      var wm = byAct[act.id];
      setHidden(r.who, !wm);
      if (wm) { var wt = wm.name + (G.working(wm) ? '' : wm.rest > 0 ? ' · en vacances' : ' · en formation'); if (r.who._t !== wt) { r.who._t = wt; r.who.lastChild.textContent = wt; r.who.firstChild.style.background = shirtCol(wm); } }
      setWidth(r.fill, pct * 100);
      setClass(r.led, 'on', a.run);
      setText(r.gain, '+' + eur(pay) + ' · +' + short(xp) + ' pts');
      setText(r.time, a.run ? dur(d - a.prog) + ' restantes' : dur(d));
      setClass(r.go, 'run', a.run);
      setText(r.goT, a.run ? 'Accélérer' : 'Lancer');
      setText(r.goS, a.run ? (a.auto ? 'Automatique · ' : '') + 'chaque clic gagne ' + nf1.format(G.TAP) + ' s' : 'Un clic pour démarrer');
      var np = G.nextPerk(a.lvl), to = a.lvl + plan.n, crossed = G.perksBetween(a.lvl, to);
      if (narrow()) setText(r.upT, buyN === 1 ? 'Améliorer' : buyN === 'max' ? (plan.ok ? 'Améliorer ×' + plan.n : 'Améliorer · max') : 'Améliorer ×' + buyN);
      else setText(r.upT, buyN === 1 ? 'Perfectionner' : buyN === 'max' ? (plan.ok ? 'Perfectionner ×' + plan.n : 'Perfectionner · max') : 'Perfectionner ×' + buyN);
      if (narrow()) setText(r.upS, (plan.n > 1 ? a.lvl + ' → ' + to : 'Rang ' + to) + (crossed.length ? ' · palier !' : np ? ' · palier au ' + np.lvl : ''));
      else setText(r.upS, (plan.n > 1 ? 'Rang ' + a.lvl + ' → ' + to : 'Rang ' + to) + (crossed.length ? ' · palier ' + crossed.map(function (p) { return '« ' + p.name + ' »'; }).join(', ') + ' !' : np ? ' · « ' + np.name + ' » au rang ' + np.lvl : ''));
      var pk = G.perkFx(a.lvl).n;
      if (r.pk !== pk) { r.pk = pk; [].forEach.call(r.perks.children, function (b, i) { b.classList.toggle('on', i < pk); b.classList.toggle('next', i === pk); }); }
      setText(r.upP, eur(cost));
      setDisabled(r.up, !plan.ok);
      setHidden(r.auto, a.auto);
      setText(r.autoP, eur(act.autoCost));
      setDisabled(r.auto, S.money < act.autoCost);
      setText(r.foot, nf0.format(a.done) + (a.done > 1 ? ' réalisés' : ' réalisé') + (a.tubes ? ' dont ' + nf0.format(a.tubes) + ' tube' + (a.tubes > 1 ? 's' : '') : '') + ' · qualité ' + starsTxt(G.baseQuality(S, act.id)) + (a.auto ? ' · ' + act.autoRole + ' s’en occupe' : ''));
      setDisabled(r.mix, !G.canMix(S, act.id));
      setText(r.mixT, a.mix ? 'Mixé ' + a.mix.q + '★' : a.hold ? 'Mixage…' : 'Mixer');
    });

    var key = visibleItems();
    var k = key.out.map(function (i) { return i.id; }).join(',') + '|' + key.rest.length + '|' + Object.keys(S.owned).length;
    if (k !== shopKey) buildShop();
    var affordable = false;
    Object.keys(rows.items || {}).forEach(function (id) {
      var r = rows.items[id], can = S.money >= r.item.cost;
      if (can) affordable = true;
      setDisabled(r.btn, !can);
      if (r.unlock) setText(r.unlock, unlockText(r.item));
    });
    setClass($('tabShop'), 'has', affordable && $('app').getAttribute('data-view') !== 'shop');
    setText($('studioCount'), (Object.keys(S.owned).length - 1) + ' / ' + (G.ITEMS.length - 1) + ' installés');
    renderAccount();
    renderEvents();
    renderTour();
    renderTrophies();
    renderTeam();
    renderOrders();
    renderCharts();
    renderRd();
    renderProj();
    renderClash();
    renderTrends();
    renderLabel();
    if (pjv.open) pjFoot();
    renderScene();
    var hint = $('hint');
    if (hint) setHidden(hint, S.acts.beat.done >= 6);

    if (!S.legend && ti === D.TIERS.length - 1) {
      S.legend = true;
      toast('Complexe légendaire ! Ta chambre est devenue un monument.', 8000);
    }
    firstRender = false;
  }

  // ---------- Sorties de studio ----------
  var ev = { slot: 0, shownId: null, open: false, resolved: false, opener: null, ckey: null };
  var RW_LABEL = { cash: 'Argent', xp: 'Expertise', boost: 'Boost', rank: 'Perfectionnement', tracks: 'Catalogue', contact: 'Nouveau contact',
    rp: 'Recherche', rep: 'Réputation', morale: 'Équipe', master: 'Titre mixé', spent: 'Investissement' };
  function rewardText(r) {
    switch (r.k) {
      case 'cash': return '+' + eur(r.v) + (r.again ? ' (cachet de retrouvailles)' : '');
      case 'xp': return '+' + short(r.v) + ' pts d’expertise';
      case 'boost': return 'Gains ×' + nf0.format(r.m) + ' pendant ' + dur(r.s);
      case 'rank': return G.ACT_BY[r.act].name + ' passe au rang ' + r.lvl;
      case 'tracks': return '+' + nf0.format(r.n) + ' titres au catalogue (' + G.ACT_BY[r.act].name + ')';
      case 'contact': return r.name + ', +' + nf0.format(D.TUNING.contactBonus * 100) + ' % de gains pour toujours';
      case 'rp': return '+' + short(r.v) + ' points de recherche';
      case 'rep': return r.v > 0 ? '+' + nf0.format(r.v) + ' de réputation' : 'Réputation déjà au maximum';
      case 'morale': return 'Moral de l’équipe +' + nf0.format(r.v);
      case 'master': return 'Un titre ' + r.q + '★ prêt à sortir dans le Top 50';
      case 'spent': return '−' + eur(r.v);
    }
    return '';
  }

  function renderEvents() {
    var p = S.ev.pending, show = !!p && !ev.open, inv = $('invite');
    if (show && ev.shownId !== p.id) {
      ev.shownId = p.id; ev.slot = Math.floor(Math.random() * 4);
      inv.className = 'invite pos-' + ev.slot;
      setText($('invSub'), G.EVENT_BY[p.id].title);
    }
    if (!p) ev.shownId = null;
    setHidden(inv, !show);
    if (show) setWidth($('invFill'), Math.max(0, p.left / D.TUNING.eventWindow * 100));

    var key = Object.keys(S.contacts).join(',');
    if (key !== ev.ckey) {
      ev.ckey = key;
      var box = $('contacts'), n = G.contactCount(S);
      box.innerHTML = '';
      G.EVENTS.forEach(function (x) {
        if (!S.contacts[x.id]) return;
        var c = document.createElement('span'); c.className = 'chip'; c.textContent = S.contacts[x.id]; box.appendChild(c);
      });
      setText($('contactNote'), n
        ? 'Bonus des contacts : +' + nf0.format(D.TUNING.contactBonus * n * 100) + ' % de gains, définitif.'
        : 'Les sorties de studio te font rencontrer du monde. Chaque contact ajoute ' + nf0.format(D.TUNING.contactBonus * 100) + ' % de gains pour toujours.');
    }
  }

  // ---------- Scène 3D ----------
  var SHIRT = ['#ff8a3d', '#2bb3a3', '#f2c14e', '#8e6bd8', '#e2574c', '#4a7bd0', '#5aa469', '#f06292', '#37474f', '#9e9e9e', '#26a69a', '#ab47bc', '#ffa726', '#5c6bc0', '#8d6e63', '#29b6f6'];
  function shirtCol(m) { return SHIRT[(m.look && m.look.c || 0) % 16]; }
  var sceneT = 0;
  function memberStatus(m) {
    if (m.train > 0) return 'train';
    if (m.rest > 0) return 'rest';
    if (m.act && G.isUnlocked(S, G.ACT_BY[m.act])) return 'work';
    return 'idle';
  }
  function renderScene(force) {
    if (!scene3d) return;
    var now = performance.now();
    if (!force && now - sceneT < 250) return;
    sceneT = now;
    var ti = G.tierIndex(S), live = {};
    G.ACTS.forEach(function (a) { if (S.acts[a.id].run && G.isUnlocked(S, a)) live[a.id] = true; });
    S3.update({
      tier: ti, place: D.TIERS[ti].place, owned: S.owned, live: live,
      ghosts: visibleItems().out.slice(0, 2).map(function (i) { return i.id; }),
      cap: G.teamOpen(S) ? G.teamCap(S) : 0, edrums: G.battleOpen(S), deco: decoView(),
      staff: S.team.staff.map(function (m) { return { id: m.id, look: m.look, role: m.role, morale: m.morale, act: m.act, status: memberStatus(m) }; }),
      souvenirs: souvenirList(), globe: globeOn(),
      artists: G.labelOpen(S) ? S.label.roster.filter(function (r) { return !r.tour; }).map(function (r) { return { id: r.id, look: artistLook(r.id), mood: r.mood }; }) : []
    });
    if (S3.setHotspots) hotspots();
  }
  var tip = { t: 0 };
  function showTip(title, text, x, y) {
    var el = $('pickTip'), r = $('stage').getBoundingClientRect();
    el.innerHTML = '<b></b><span></span>';
    el.firstChild.textContent = title; el.lastChild.textContent = text;
    el.style.left = Math.max(120, Math.min(r.width - 120, x - r.left)) + 'px';
    el.style.top = Math.max(70, y - r.top) + 'px';
    el.hidden = false;
    clearTimeout(tip.t); tip.t = setTimeout(function () { el.hidden = true; }, 3800);
  }
  function onPick(u, x, y) {
    if (!u) { $('pickTip').hidden = true; return; }
    if (u.type === 'hot') { onHotspot(u.id); return; }
    if (u.type === 'item') {
      var it = G.ITEM_BY[u.id];
      if (!it) return;
      showTip(it.name, S.owned[it.id] ? it.desc : 'Bientôt dans ton studio : ' + eur(it.cost) + '.', x, y);
    } else if (u.type === 'staff') {
      var m = G.findMember(S, u.id);
      if (!m) return;
      showTip(m.name, G.ROLE_BY[m.role].name + ' · niveau ' + m.lvl + ' · moral ' + Math.round(m.morale) + ' %', x, y);
      if (!menuOpen) setMenu(true);
      if (bind.view) bind.view('team');
      team.focus = m.id; team.key = '';
      renderTeam(true);
      var card = document.querySelector('.member[data-id="' + m.id + '"]');
      if (card) card.scrollIntoView({ block: 'center' });
    } else if (u.type === 'souvenir') {
      var sv = souvenirList().filter(function (x) { return x.id === u.id; })[0];
      if (sv) showTip(sv.kicker === 'TOURNÉE MONDIALE' ? 'Souvenir : ' + sv.title : 'Tournée locale : ' + sv.title, sv.kicker === 'TOURNÉE MONDIALE' ? sv.sub + ' · +' + Math.round(D.WORLD.souvenir * 100) + ' % de gains pour toujours' : sv.sub + ' visitées par tes artistes', x, y);
    } else if (u.type === 'artist') {
      var ar = G.artistOf(S, u.id);
      if (!ar) return;
      showTip(artName(u.id), G.PJ_G[G.ART_BY[u.id].genre].name + ' · notoriété ' + Math.round(ar.fame) + ' · ' + moodTxt(ar.mood)[0].toLowerCase(), x, y);
      if (ar.offer) openOffer(u.id); else if (ar.story) openStory(u.id); else showArtist(u.id);
    } else if (u.type === 'player') {
      var running = G.ACTS.filter(function (a) { return S.acts[a.id].run; }).length;
      showTip('C’est toi', running ? running + (running > 1 ? ' productions en cours.' : ' production en cours.') : 'Lance une production pour te mettre au travail.', x, y);
    }
  }
  function moveBanner(place) {
    var ti = G.tierIndex(S), el = document.createElement('div');
    el.className = 'move-banner';
    el.innerHTML = '<small>Nouveau lieu</small><b></b>';
    el.lastChild.textContent = D.TIERS[ti].name;
    $('stage').appendChild(el);
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 3300);
    if (!quiet && !firstRender) blip(11);
  }
  // ---------- Thème (réglage propre à l'appareil) ----------
  var TKEY = 'premier-mix:theme', themeMode = 'auto', hostTheme = null, themeBusy = false;
  function loadTheme() { try { var v = localStorage.getItem(TKEY); return v === 'light' || v === 'dark' ? v : 'auto'; } catch (e) { return 'auto'; } }
  function applyTheme() {
    var root = document.documentElement, want = themeMode === 'auto' ? hostTheme : themeMode;
    themeBusy = true;
    if (want) { if (root.getAttribute('data-theme') !== want) root.setAttribute('data-theme', want); }
    else if (root.hasAttribute('data-theme')) root.removeAttribute('data-theme');
    themeBusy = false;
    var seg = $('themeSeg');
    if (seg) seg.querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-theme-set') === themeMode ? 'true' : 'false'); });
  }
  function initTheme() {
    hostTheme = document.documentElement.getAttribute('data-theme'); // thème éventuellement imposé par la page hôte
    themeMode = loadTheme();
    applyTheme();
    try {
      new MutationObserver(function () {
        if (themeBusy) return;
        var v = document.documentElement.getAttribute('data-theme');
        if (themeMode === 'auto') { hostTheme = v; return; }
        hostTheme = v;
        if (v !== themeMode) applyTheme(); // le choix du joueur reste prioritaire
      }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    } catch (e) { /* facultatif */ }
    $('themeSeg').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-theme-set]');
      if (!b) return;
      themeMode = b.getAttribute('data-theme-set');
      try { localStorage.setItem(TKEY, themeMode); } catch (x) { /* stockage indisponible */ }
      applyTheme();
    });
  }
  // ---------- Menu repliable ----------
  var MENUKEY = 'premier-mix:menu', menuOpen = true;
  var narrowMq = window.matchMedia ? window.matchMedia('(max-width: 999px)') : null;
  function narrow() { return !!(narrowMq && narrowMq.matches); }
  function updateInsets() {
    var app = $('app'), st = $('stage').getBoundingClientRect(), hud = $('hud').getBoundingClientRect();
    var hudH = Math.max(0, hud.bottom - st.top);
    var sheetH = narrow() && menuOpen ? $('panes').offsetHeight : 0;
    app.style.setProperty('--hud-h', Math.round(hudH) + 'px');
    app.style.setProperty('--sheet-h', Math.round(sheetH) + 'px');
    if (scene3d) S3.setInsets(hudH + 6, sheetH);
  }
  function setMenu(open, save) {
    menuOpen = !!open;
    $('app').classList.toggle('collapsed', !menuOpen);
    $('menuToggle').setAttribute('aria-expanded', menuOpen ? 'true' : 'false');
    $('menuToggle').title = menuOpen ? 'Replier le menu pour ne garder que le studio' : 'Afficher le menu';
    setText($('menuToggleText'), menuOpen ? 'Masquer' : 'Menu');
    $('sheetGrip').setAttribute('aria-expanded', menuOpen ? 'true' : 'false');
    if (save !== false) { try { localStorage.setItem(MENUKEY, menuOpen ? '1' : '0'); } catch (e) { /* stockage indisponible */ } }
    updateInsets();
    if (scene3d) S3.resize();
    setTimeout(updateInsets, 320);
  }
  function initMenu() {
    try { menuOpen = localStorage.getItem(MENUKEY) !== '0'; } catch (e) { menuOpen = true; }
    $('menuToggle').addEventListener('click', function () { setMenu(!menuOpen); });
    $('sheetGrip').addEventListener('click', function () { setMenu(false); });
    try { new ResizeObserver(function () { updateInsets(); }).observe($('hud')); new ResizeObserver(function () { updateInsets(); }).observe($('panes')); } catch (e) { window.addEventListener('resize', updateInsets); }
    if (narrowMq && narrowMq.addEventListener) narrowMq.addEventListener('change', function () { setMenu(menuOpen, false); });
    setMenu(menuOpen, false);
  }
  function initScene() {
    if (!S3 || !window.THREE) { $('stageFallback').hidden = false; return; }
    scene3d = S3.init($('stage'));
    if (!scene3d) { $('stageFallback').hidden = false; return; }
    var mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
    function theme() {
      var t = document.documentElement.getAttribute('data-theme');
      S3.setTheme(t ? t === 'dark' : !!(mq && mq.matches));
    }
    theme();
    if (mq && mq.addEventListener) mq.addEventListener('change', theme);
    try { new MutationObserver(theme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] }); } catch (e) { /* facultatif */ }
    S3.onPick(onPick);
    if (S3.onHotspot) S3.onHotspot(onHotspot);
    S3.onCamChange(function (moved) { $('camReset').hidden = !moved; });
    $('camReset').addEventListener('click', function () { S3.resetCam(); });
    S3.onMove = moveBanner;
  }

  // ---------- Équipe ----------
  var team = { key: '', poolKey: '', focus: null, fire: null, t: 0, wasOpen: null, lastUnpaid: 0 };
  function starHtml(n) { return '<span class="stars" aria-label="' + n + ' étoile' + (n > 1 ? 's' : '') + ' sur 5">' + '★★★★★'.slice(0, n) + '<s>' + '★★★★★'.slice(n) + '</s></span>'; }
  function initials(n) { return n.slice(0, 2).toUpperCase(); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fitsText(role) { return G.ROLE_BY[role].acts.map(function (id) { return G.ACT_BY[id].name; }).join(', '); }
  function headHtml(m) {
    return '<div class="m-head"><span class="avatar" style="background:' + shirtCol(m) + '">' + esc(initials(m.name)) + '</span>' +
      '<div class="m-id"><h3>' + esc(m.name) + '</h3><p>' + esc(G.ROLE_BY[m.role].name) + ' · ' + starHtml(m.stars) + '</p></div><span class="lv" data-k="lv">Niv. ' + m.lvl + '</span></div>';
  }
  function actOptions(m) {
    var html = '<option value="">Sans poste</option>', taken = {};
    S.team.staff.forEach(function (x) { if (x !== m && x.act) taken[x.act] = x.name; });
    G.ACTS.forEach(function (a) {
      if (!G.isUnlocked(S, a)) return;
      var lbl = a.name + (G.roleFits(m, a.id) ? ' ★' : '') + (taken[a.id] ? ' (échange avec ' + taken[a.id] + ')' : '');
      html += '<option value="' + a.id + '"' + (m.act === a.id ? ' selected' : '') + '>' + esc(lbl) + '</option>';
    });
    return html;
  }
  function buildTeam() {
    var box = $('staffList');
    box.innerHTML = '';
    team.cards = {};
    if (!S.team.staff.length) {
      var e = document.createElement('p'); e.className = 'small-note m-hide'; e.textContent = 'Personne pour l’instant. Recrute un premier membre parmi les candidats.'; box.appendChild(e);
    }
    S.team.staff.forEach(function (m) {
      var el = document.createElement('article');
      el.className = 'card member' + (team.focus === m.id ? ' focus' : '');
      el.setAttribute('data-id', m.id);
      el.innerHTML = headHtml(m) +
        '<div class="bars"><span>Moral</span><span class="meter mor" data-k="morM"><i data-k="morF"></i></span><span data-k="mor"></span>' +
        '<span>Expérience</span><span class="meter xpm"><i data-k="xpF"></i></span><span data-k="xp"></span></div>' +
        '<p class="m-status" data-k="status"></p>' +
        '<label class="assign">Poste <select data-do="assign" aria-label="Poste de ' + esc(m.name) + '">' + actOptions(m) + '</select></label>' +
        '<div class="m-acts">' +
          '<button class="btn" type="button" data-do="train"><span>Former</span><small data-k="trainP"></small></button>' +
          '<button class="btn" type="button" data-do="bonus"><span>Prime</span><small data-k="bonusP"></small></button>' +
          '<button class="btn" type="button" data-do="rest"><span>Vacances</span><small>' + Math.round(D.TUNING.restTime) + ' s</small></button>' +
        '</div>' +
        '<div class="m-more"><button class="linkish" type="button" data-do="fire">Se séparer de ' + esc(m.name) + '</button></div>' +
        '<div class="confirm" data-k="confirm" hidden><span>' + esc(m.name) + ' quittera le studio pour de bon.</span><div class="row"><button class="btn sm danger" type="button" data-do="fireGo">Confirmer</button><button class="btn sm" type="button" data-do="fireNo">Annuler</button></div></div>';
      box.appendChild(el);
      var r = { root: el, m: m };
      el.querySelectorAll('[data-k]').forEach(function (n) { r[n.getAttribute('data-k')] = n; });
      el.querySelectorAll('[data-do]').forEach(function (n) { r['b_' + n.getAttribute('data-do')] = n; });
      team.cards[m.id] = r;
    });
  }
  function buildPool() {
    var box = $('poolList'), cap = G.teamCap(S);
    box.innerHTML = '';
    team.pcards = {};
    S.team.pool.forEach(function (c) {
      var el = document.createElement('article');
      el.className = 'card member cand';
      el.innerHTML = headHtml(c) +
        '<p class="fits opt">Excelle sur : ' + esc(fitsText(c.role)) + '</p>' +
        (c.back ? '<span class="back-tag">Ancien membre : revient sans prime d’embauche</span>' : '') +
        '<p class="small-note opt" style="margin:0">Salaire : ' + eur(c.salary) + '/s</p>' +
        '<button class="info-i card-i" type="button" data-info aria-expanded="false" aria-label="Détails : ' + esc(c.name) + '">i</button>' +
        '<button class="btn primary" type="button" data-hire="' + c.id + '"><span class="t"><b>Recruter</b><small data-k="why"></small></span><span class="p">' + (c.back ? 'Gratuit' : eur(G.signCost(S, c))) + '</span></button>';
      box.appendChild(el);
      team.pcards[c.id] = { btn: el.querySelector('button'), why: el.querySelector('[data-k="why"]'), c: c };
    });
    if (!S.team.pool.length) { var e = document.createElement('p'); e.className = 'small-note'; e.textContent = 'Aucun candidat pour le moment.'; box.appendChild(e); }
  }
  function renderTeam(force) {
    var open = G.teamOpen(S), tm = S.team, cap = G.teamCap(S);
    if (team.wasOpen === false && open && !quiet) { toast('Tu peux maintenant recruter une équipe. Rendez-vous dans l’onglet Équipe.', 6500); blip(8); }
    team.wasOpen = open;
    var low = tm.staff.some(function (m) { return m.morale < 25; });
    var canHire = open && tm.staff.length < cap && tm.pool.some(function (c) { return S.money >= G.signCost(S, c); });
    var onTeam = $('app').getAttribute('data-view') === 'team', asks = labelAsks(), lv = lbv.tv !== 'staff';
    setClass($('tabTeam'), 'has', !onTeam && (low || canHire || asks));
    setClass($('tabTeam'), 'warn', !onTeam && !low && !labelOffer() && (canHire || asks));
    setHidden($('teamLock'), open || lv);
    setHidden($('teamOpenBox'), !open || lv);
    if (lv) { setText($('teamCount'), S.label.roster.length + ' / ' + G.labelCap(S) + ' artiste' + (G.labelCap(S) > 1 ? 's' : '')); return; }
    setText($('teamCount'), open ? tm.staff.length + ' / ' + cap + ' postes' : '');
    if (!open) { setText($('teamLockText'), 'Atteins le niveau d’expertise ' + D.TUNING.teamLevel + ' pour recruter ton premier membre. Chaque lieu offre plus de postes : 1 dans ta chambre, jusqu’à ' + D.TUNING.teamCap[D.TUNING.teamCap.length - 1] + ' dans le complexe.'); return; }
    if (!onTeam && !force) { var now0 = performance.now(); if (now0 - team.t < 1000) return; team.t = now0; }
    var key = tm.staff.map(function (m) { return m.id + ':' + m.lvl + ':' + m.act; }).join(',') + '|' + G.ACTS.filter(function (a) { return G.isUnlocked(S, a); }).length + '|' + team.focus;
    if (key !== team.key) { team.key = key; buildTeam(); }
    var pk = tm.pool.map(function (c) { return c.id; }).join(',') + '|' + tm.staff.length;
    if (pk !== team.poolKey) { team.poolKey = pk; buildPool(); }
    setText($('teamSeats'), tm.staff.length + ' / ' + cap);
    setText($('teamPay'), tm.staff.length ? eur(G.payroll(S)) + '/s' : '0 €/s');
    setText($('teamHired'), String(tm.hired));
    tm.staff.forEach(function (m) {
      var r = team.cards[m.id];
      if (!r) return;
      var mo = Math.round(m.morale), need = G.staffXpNeed(m.lvl), maxed = m.lvl >= D.TUNING.staffMaxLvl;
      setWidth(r.morF, m.morale);
      setClass(r.morM, 'mid', m.morale < 60 && m.morale >= 25); setClass(r.morM, 'low', m.morale < 25);
      setText(r.mor, mo + ' %');
      setWidth(r.xpF, maxed ? 100 : Math.min(100, m.xp / need * 100));
      setText(r.xp, maxed ? 'max' : dur(Math.max(0, need - m.xp)));
      var st, warn = false;
      if (m.train > 0) st = 'En formation · niveau ' + (m.lvl + 1) + ' dans ' + clock(m.train);
      else if (m.rest > 0) st = 'En vacances · retour dans ' + clock(m.rest);
      else if (m.morale <= 0) { st = 'Démotivé : démission dans ' + clock(D.TUNING.leaveAfter - m.zero) + ' sans prime ni vacances'; warn = true; }
      else if (m.act && G.isUnlocked(S, G.ACT_BY[m.act])) {
        var fx = G.memberFx(S, m, m.act);
        st = 'Sur « ' + G.ACT_BY[m.act].name + ' » · vitesse ×' + nf2.format(fx.sp) + ' · gains ×' + nf2.format(fx.gn) + (G.roleFits(m, m.act) ? '' : ' (hors spécialité)');
        if (m.morale < 25) { st += ' · moral bas'; warn = true; }
      } else st = 'Sans poste : il reprend des forces mais n’apporte rien.';
      setText(r.status, st); setClass(r.status, 'warn', warn);
      var busy = m.train > 0 || m.rest > 0;
      var tc = G.trainCost(S, m), bc = G.bonusCost(S, m);
      setText(r.trainP, maxed ? 'Niveau max' : eur(tc));
      setDisabled(r.b_train, maxed || busy || S.money < tc);
      setText(r.bonusP, eur(bc));
      setDisabled(r.b_bonus, m.morale >= 100 || S.money < bc);
      setDisabled(r.b_rest, busy || m.morale >= 100);
      setHidden(r.confirm, team.fire !== m.id);
      setHidden(r.b_fire.parentNode, team.fire === m.id);
    });
    var full = tm.staff.length >= cap;
    Object.keys(team.pcards || {}).forEach(function (id) {
      var p = team.pcards[id], cost = G.signCost(S, p.c);
      setDisabled(p.btn, full || S.money < cost);
      setText(p.why, full ? 'Plus de poste libre : agrandis le studio' : S.money < cost ? 'Budget insuffisant' : 'Prend un poste tout de suite');
    });
    setText($('poolNote'), 'Nouveaux dans ' + clock(tm.poolCd));
    var rc = G.poolRefreshCost(S);
    setText($('poolRefreshP'), eur(rc));
    setDisabled($('poolRefresh'), S.money < rc);
  }

  // ---------- Palmarès ----------
  var tro = { cards: null, fresh: {}, last: 0, timer: 0 };
  function fmtN(fam, n) {
    var f = fam && fam.fmt;
    if (f === 'eur') return eur(n);
    if (f === 'eurs') return eur(n) + '/s';
    if (f === 'note') return nf1.format(n) + '/10';
    return n >= 10000 ? short(n) : nf0.format(n);
  }
  function troDesc(fam, i) { var d = fam.descs && fam.descs[i]; return d || fam.desc.replace('{n}', fmtN(fam, fam.levels[i])); }
  // t: famille ou niveau visé (nextGoals) avec m et n.
  function fmtProg(t, v) {
    var fam = t.fam || t, n = t.n;
    if (n === 1 || fam.m === 'tier' || fam.m === 'chartBest' || fam.m === 'league') return '';
    if (fam.fmt === 'eur') return eur(v) + ' / ' + eur(n);
    if (fam.fmt === 'eurs') return short(v) + ' / ' + short(n) + NB + '€/s';
    if (fam.fmt === 'note') return nf1.format(v) + ' / ' + nf1.format(n);
    return short(v) + ' / ' + short(n);
  }
  function buildTrophies() {
    var grid = $('troGrid');
    grid.innerHTML = '';
    tro.cards = {};
    G.TROPHIES.forEach(function (t) {
      var c = document.createElement('article');
      c.className = 'tro';
      c.innerHTML = '<span class="medal" aria-hidden="true"></span><h3></h3><p class="tro-lv"></p><p class="tro-d"></p>' +
        '<span class="pips" aria-hidden="true">' + t.levels.map(function () { return '<i></i>'; }).join('') + '</span>' +
        '<div class="tro-prog"><span class="meter" aria-hidden="true"><i></i></span><span class="tro-n"></span></div>';
      c.querySelector('h3').textContent = t.name;
      grid.appendChild(c);
      tro.cards[t.id] = { root: c, lv: c.querySelector('.tro-lv'), d: c.querySelector('.tro-d'), pips: c.querySelectorAll('.pips i'), meter: c.querySelector('.meter'), fill: c.querySelector('.meter i'), num: c.querySelector('.tro-n') };
    });
  }
  function renderTrophies(force) {
    if (!tro.cards) return;
    var n = G.trophyCount(S), tot = G.trophyTotal(), hasFresh = Object.keys(tro.fresh).length > 0;
    setText($('troCount'), n + ' / ' + tot + ' niveaux');
    setText($('troBonus'), n
      ? '+' + nf0.format(D.TUNING.trophyBonus * n * 100) + ' % de gains, définitif'
      : 'Chaque niveau décroché ajoute ' + nf0.format(D.TUNING.trophyBonus * 100) + ' % de gains pour toujours.');
    setClass($('tabTro'), 'has', (hasFresh || tour.fresh) && $('app').getAttribute('data-view') !== 'trophies');
    var now = performance.now();
    if (!force && now - tro.last < 400) return;
    tro.last = now;
    G.TROPHIES.forEach(function (t) {
      var c = tro.cards[t.id], p = G.trophyProgress(S, t), lvl = p.lvl;
      c.root.className = 'tro lv-' + Math.min(lvl, 6) + (lvl ? ' got' : '') + (p.done ? ' done' : '') + (tro.fresh[t.id] ? ' fresh' : '') + (t.levels.length === 1 ? ' solo' : '');
      setText(c.lv, lvl ? G.levelName(t, lvl) + (t.levels.length > 1 ? ' · ' + lvl + '/' + t.levels.length : '') : 'À décrocher');
      setText(c.d, p.done ? (t.levels.length > 1 ? 'Tous les niveaux sont décrochés.' : troDesc(t, 0)) : (lvl ? 'Niveau ' + G.levelName(t, lvl + 1) + ' : ' : '') + troDesc(t, lvl));
      for (var k = 0; k < c.pips.length; k++) setClass(c.pips[k], 'on', k < lvl);
      setHidden(c.meter, p.done);
      if (p.done) { setText(c.num, ''); return; }
      setWidth(c.fill, p.f * 100);
      setText(c.num, fmtProg({ fam: t, n: p.n }, p.v));
    });
    var g = G.nextGoals(S, 1)[0];
    setHidden($('goal'), !g);
    if (g) {
      setText($('goalName'), g.t.name);
      setText($('goalDesc'), troDesc(g.t.fam, g.t.lvl - 1));
      setText($('goalN'), fmtProg(g.t, g.p.v));
      setWidth($('goalFill'), g.p.f * 100);
    }
  }
  function seeTrophies() { tro.fresh = {}; tour.fresh = false; renderTrophies(true); }
  // Crédite sans bruit les trophées déjà mérités (anciennes parties). Renvoie leur nombre.
  function creditTrophies(raw) {
    var migrated = !!raw && typeof raw === 'object' && raw.trophies === undefined;
    G.checkTrophies(S, true);
    var n = G.trophyCount(S);
    if (migrated && n > 0) toast('Nouveau : le Palmarès. Tu as déjà ' + n + (n > 1 ? ' niveaux' : ' niveau') + ', soit +' + nf0.format(D.TUNING.trophyBonus * n * 100) + ' % de gains.', 8000);
    return n;
  }

  // ---------- Tournée mondiale ----------
  var tour = { open: false, was: null, fresh: false };
  function pctOf(x) { return nf0.format(Math.round(x * 100)); }
  var wtv = { key: '', home: null };
  function renderWorld() {
    var open = G.worldOpen(S);
    setHidden($('wtBox'), !open);
    if (!open) return;
    var W = D.WORLD, ds = G.worldDates(S), done = G.worldDone(S).length, mult = G.worldMult(S);
    setText($('wtSum'), done + ' / ' + ds.length + ' dates · renommée +' + Math.round((mult - 1) * 100) + ' %');
    var key = ds.map(function (d) { var n = G.worldNeed(S, d), v = Math.min(n, G.worldValue(S, d)); return d.id + (S.world.done[d.id] ? '!' : Math.floor(v / n * 20)); }).join(',');
    if (key !== wtv.key) {
      wtv.key = key;
      $('wtDates').innerHTML = ds.map(function (d, i) {
        var n = G.worldNeed(S, d), on = !!S.world.done[d.id], v = on ? n : Math.min(n, G.worldValue(S, d)), C = G.COUNTRY_BY[d.c];
        return '<li class="' + (on ? 'on' : '') + '"><span class="pin" aria-hidden="true">' + (on ? '✓' : i + 1) + '</span><b>' + esc(d.city) + ', ' + esc(d.venue) + '</b>' +
          '<small>' + esc(C ? C.name : '') + ' · ' + esc(d.text.replace('{n}', d.m === 'projRun' ? n : nf0.format(n))) + (d.abs == null ? ' pendant cette carrière' : '') + '</small>' +
          (on ? '<small>Date confirmée</small>' : '<span class="meter" aria-hidden="true"><i style="width:' + Math.round(v / n * 100) + '%"></i></span>') + '</li>';
      }).join('');
    }
    var sv = G.souvenirs(S);
    setText($('wtNote'), 'Chaque date confirmée ajoute ' + Math.round(W.fameDate * 100) + ' % de renommée au départ en tournée, et +' + Math.round(W.fameSlam * 100) + ' % de plus si toutes le sont. Chaque date jouée devient un souvenir : +' + Math.round(W.souvenir * 100) + ' % de gains pour toujours' +
      (sv ? ' (déjà ' + sv + ' souvenir' + (sv > 1 ? 's' : '') + ', +' + Math.round(W.souvenir * sv * 100) + ' %)' : '') + '. Ton studio est basé en ' + G.homeCountry(S).name + '.');
  }
  function renderTour() {
    var T = D.TUNING, fame = S.fame || 0, avail = G.canTour(S), pts = G.fameAvailable(S);
    renderWorld();
    var wm = G.worldMult(S), xtra = Math.round(pts * (wm - 1));
    setHidden($('tourFame'), !fame);
    setText($('tourFame'), 'Renommée ' + fame + ' · +' + pctOf(T.fameBonus * fame) + NB + '% de gains · +' + pctOf(T.fameXp * fame) + NB + '% d’expertise');
    var lt = S.lifetime;
    if (avail) {
      var tot = fame + pts;
      tot += xtra;
      setText($('tourText'), 'Tu peux partir maintenant : +' + (pts + xtra) + (pts + xtra > 1 ? ' points' : ' point') + ' de renommée' + (xtra ? ' (dont ' + xtra + ' grâce aux dates confirmées)' : '') + ' (' + tot + ' au total), soit +' + pctOf(T.fameBonus * tot) +
        NB + '% de gains et +' + pctOf(T.fameXp * tot) + NB + '% d’expertise pour toujours. Attendre rapporte plus de points, mais de moins en moins vite.');
      var lo = G.fameAt(G.fameFor(lt)), hi = G.fameNextAt(S);
      setWidth($('tourFill'), Math.max(0, Math.min(100, (lt - lo) / (hi - lo) * 100)));
      setText($('tourNote'), 'Point suivant : ' + eur(lt) + ' / ' + eur(hi));
      setText($('tourBtnSub'), '+' + (pts + xtra) + (pts + xtra > 1 ? ' points' : ' point') + ' de renommée');
    } else {
      var need = G.fameUnlockAt(S);
      setText($('tourText'), fame
        ? 'Une nouvelle tournée t’attend quand ton studio aura gagné assez de plus. Chaque départ remet la carrière à zéro, la renommée reste.'
        : 'Quand ton studio aura fait ses preuves, pars en tournée mondiale. Tu repars d’un simple portable, mais ta renommée augmente pour toujours tes gains et ton expertise.');
      setWidth($('tourFill'), Math.max(0, Math.min(100, lt / need * 100)));
      setText($('tourNote'), 'Gains cumulés : ' + eur(lt) + ' / ' + eur(need));
    }
    setHidden($('tourBtn'), !avail || tour.open);
    setHidden($('tourConfirm'), !avail || !tour.open);
    if (tour.open && !avail) tour.open = false;
    if (tour.was === false && avail && !quiet) {
      tour.fresh = true;
      toast('Tournée mondiale disponible. Tout se passe dans le Palmarès.', 6500);
      blip(10);
    }
    if (tour.was === null && avail) tour.fresh = true; // signalé par un point sur l'onglet, sans alerte
    tour.was = avail;
  }
  function askTour() {
    var pts = G.fameAvailable(S);
    if (!pts || !G.canTour(S)) return;
    tour.open = true;
    var xtra = Math.round(pts * (G.worldMult(S) - 1)), nd = G.worldDone(S).length;
    $('tourAsk').textContent = 'Tu repars d’un ordinateur portable : budget, expertise, matériel, perfectionnements et catalogue sont remis à zéro. Tu gardes ta renommée (+' + (pts + xtra) +
      (pts + xtra > 1 ? ' points' : ' point') + (nd ? ', dont ' + xtra + ' grâce à ' + nd + ' date' + (nd > 1 ? 's' : '') + ' confirmée' + (nd > 1 ? 's' : '') : '') + '), tes contacts, tes trophées, ton label et ton compteur de gains. Partir maintenant ?';
    var hc = G.homeChoices(S); wtv.home = S.world.home;
    setHidden($('wtHomeBox'), hc.length < 2);
    $('wtHome').innerHTML = hc.map(function (c) { return '<button type="button" data-home="' + c + '" aria-pressed="' + (c === wtv.home) + '">' + esc(G.COUNTRY_BY[c].name) + '</button>'; }).join('');
    renderTour();
    $('tourNo').focus({ preventScroll: true });
    $('tourConfirm').scrollIntoView({ block: 'center' });
  }
  function startTour() {
    var r = G.tour(S, Date.now(), wtv.home);
    if (!r) return;
    tour.open = false; tour.fresh = false; wtv.key = '';
    adopt(JSON.parse(JSON.stringify(S)), true);
    if (bind.view) bind.view('prod');
    showWorldTour(r);
    blip(12);
  }
  // Récit de la tournée mondiale: les dates jouées défilent, puis le bilan de renommée.
  function showWorldTour(r) {
    var rows = r.dates.map(function (id) { var d = G.WDATE_BY[id]; return [d.city, d.venue.charAt(0).toUpperCase() + d.venue.slice(1) + ' · complet']; });
    rows.push(['Renommée', '+' + r.points + ' point' + (r.points > 1 ? 's' : '') + (r.extra ? ' (dont ' + r.extra + ' grâce aux dates)' : '')]);
    if (r.dates.length) rows.push(['Souvenirs', G.souvenirs(S) + ' au total · +' + Math.round(D.WORLD.souvenir * G.souvenirs(S) * 100) + ' % de gains pour toujours']);
    rows.push(['Nouvelle base', G.COUNTRY_BY[r.home].name]);
    $('wtText').textContent = r.dates.length ? 'Ta tournée mondiale passe par ' + r.dates.length + ' grande' + (r.dates.length > 1 ? 's' : '') + ' salle' + (r.dates.length > 1 ? 's' : '') + '. Le public est en délire.' : 'Une tournée sans grande date, mais le public a répondu présent. Prépare mieux la prochaine pour décrocher plus de renommée.';
    $('wtRows').innerHTML = rows.map(function (x, k) { return '<div class="rw" style="--d:' + (0.3 + k * 0.45) + 's"><span class="rl">' + esc(x[0]) + '</span><b class="rv">' + esc(x[1]) + '</b></div>'; }).join('');
    $('wtScrim').hidden = false; $('app').inert = true; $('tabs').inert = true;
    $('wtClose').focus();
  }
  function closeWorldTour() { $('wtScrim').hidden = true; $('app').inert = false; $('tabs').inert = false; toast('Tu repars avec ton portable, en ' + G.homeCountry(S).name + '. Bonne nouvelle carrière !', 6000); }

  function openEvent() {
    var p = S.ev.pending;
    if (!p || ev.open) return;
    var x = G.EVENT_BY[p.id];
    ev.open = true; ev.resolved = false; ev.opener = document.activeElement;
    S.ev.hold = true;
    $('evTitle').textContent = x.title;
    $('evText').textContent = x.intro;
    var box = $('evChoices');
    box.innerHTML = '';
    var first = null;
    x.choices.forEach(function (c, i) {
      var b = document.createElement('button'), info = G.choiceInfo(S, c), tags = [];
      b.type = 'button'; b.className = 'btn choice'; b.id = 'choice-' + i; b.setAttribute('data-i', i);
      b.innerHTML = '<span class="k"></span><span class="cw"><span class="ct"></span><span class="tags"></span></span>';
      b.querySelector('.k').textContent = 'ABC'.charAt(i);
      b.querySelector('.ct').textContent = c.text;
      if (info.need) tags.push(['need' + (info.needOk ? ' ok' : ''), (info.needOk ? 'Grâce à ' : 'Requiert ') + info.need]);
      if (info.cost) tags.push(['cost' + (S.money >= info.cost ? '' : ' short'), 'Coûte ' + eur(info.cost)]);
      if (info.risk !== null) tags.push(['risk', 'Risqué · ' + nf0.format(info.risk * 100) + ' % de réussite']);
      var tg = b.querySelector('.tags');
      tags.forEach(function (x2) { var s = document.createElement('span'); s.className = 'tag ' + x2[0]; s.textContent = x2[1]; tg.appendChild(s); });
      if (!tags.length) tg.remove();
      b.disabled = !info.ok;
      if (info.ok && first === null) first = b;
      box.appendChild(b);
    });
    $('evAsk').hidden = false; $('evDone').hidden = true;
    $('scrim').hidden = false;
    $('app').inert = true; $('tabs').inert = true;
    (first || $('evLater')).focus();
    render();
  }

  function closeEvent() {
    if (!ev.open) return;
    ev.open = false; S.ev.hold = false;
    $('scrim').hidden = true;
    $('app').inert = false; $('tabs').inert = false;
    var o = ev.opener; ev.opener = null;
    if (o && document.body.contains(o) && !o.closest('[hidden]') && o.focus) { try { o.focus(); } catch (e) { /* focus facultatif */ } }
    render();
  }

  function chooseEvent(i) {
    var res = G.resolveEvent(S, i);
    if (!res) return;
    ev.resolved = true;
    var vd = $('evVerdict');
    vd.hidden = res.win === null;
    if (res.win !== null) { vd.textContent = res.win ? 'Pari réussi !' : 'Pari perdu…'; vd.className = 'ev-verdict ' + (res.win ? 'win' : 'loss'); }
    $('evOutcome').textContent = res.outcome;
    var box = $('evReward');
    box.innerHTML = '';
    res.rewards.forEach(function (r, k) {
      var row = document.createElement('div');
      row.className = 'rw';
      row.style.setProperty('--d', (0.25 + k * 0.5) + 's');
      row.innerHTML = '<span class="rl"></span><b class="rv"></b>';
      row.firstChild.textContent = RW_LABEL[r.k];
      row.lastChild.textContent = rewardText(r);
      box.appendChild(row);
      setTimeout(function () { blip(5 + k * 2); }, 250 + k * 500);
    });
    $('evAsk').hidden = true; $('evDone').hidden = false;
    $('evClose').focus();
    markCloud(); saveLocal();
    render();
  }

  // ---------- Sauvegarde locale et compte ----------
  function loadLocal() { try { var raw = localStorage.getItem(KEY); return raw ? JSON.parse(raw) : null; } catch (e) { return null; } }
  function saveLocal() { try { S.savedAt = Date.now(); localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* stockage indisponible */ } }
  function markCloud() { cloud.dirty = true; }

  function ago(ms) {
    var s = Math.max(0, Math.round((Date.now() - ms) / 1000));
    if (s < 10) return 'à l’instant';
    if (s < 60) return 'il y a ' + s + ' s';
    if (s < 3600) return 'il y a ' + Math.round(s / 60) + ' min';
    return 'il y a ' + Math.round(s / 3600) + ' h';
  }

  function renderAccount() {
    var st = cloud.status;
    setText($('pillText'), st === 'ok' ? 'Synchronisé' : st === 'pending' ? 'Connexion…' : 'Local');
    setClass($('pillLed'), 'sync', st === 'ok');
    var who = cloud.me ? (cloud.me.name || 'Ton compte Claude') : st === 'pending' ? 'Connexion au compte…' : 'Aucun compte détecté';
    setText($('accWho'), who);
    var msg;
    if (st === 'ok') msg = 'Ta progression est enregistrée sur ton compte' + (cloud.lastWrite ? ' (dernière sauvegarde : ' + ago(cloud.lastWrite) + ')' : '') + '. Ouvre ce jeu sur un autre appareil avec le même compte Claude pour la retrouver.';
    else if (st === 'pending') msg = 'Recherche de ta sauvegarde en ligne.';
    else if (st === 'denied') msg = 'Ton accès à cette page ne permet pas d’enregistrer en ligne. La partie reste sur cet appareil.';
    else msg = 'La synchronisation en ligne fonctionne uniquement dans la version claude.ai du jeu. Ici, la partie est sauvegardée sur cet appareil : utilise le code de sauvegarde pour la transférer.';
    setText($('accState'), msg);
    var av = $('accAvatar');
    if (cloud.me && cloud.me.avatarUrl && av._src !== cloud.me.avatarUrl) { av._src = cloud.me.avatarUrl; av.src = cloud.me.avatarUrl; }
    setHidden(av, !(cloud.me && cloud.me.avatarUrl));
    setDisabled($('accSave'), !cloud.ok);
    setDisabled($('accLoad'), !cloud.ok);
  }

  function remoteInfo(snap) {
    var d = snap && snap.exists ? snap.data() : null;
    if (!d || typeof d.s !== 'string') return null;
    var o = null;
    try { o = JSON.parse(d.s); } catch (e) { return null; }
    if (!o || !o.acts) return null;
    return { obj: o, savedAt: d.savedAt || 0, level: d.level || o.level || 1, lifetime: d.lifetime || o.lifetime || 0, epoch: d.epoch || o.epoch || 0 };
  }
  // La partie la plus avancée gagne. Une remise à zéro ou un import volontaire passe devant grâce à l'époque.
  function remoteAhead(r) { return r.epoch > S.epoch || (r.epoch === S.epoch && r.lifetime > S.lifetime + 1); }
  function offerRemote(r, manual) {
    pendingCloud = r.obj;
    $('cloudMsg').textContent = (manual ? 'Partie enregistrée sur ton compte' : 'Une autre version de ta partie est enregistrée sur ton compte') +
      ' : niveau ' + r.level + ', ' + eur(r.lifetime) + ' gagnés au total. La charger remplace la partie de cet appareil.';
    $('cloudBanner').hidden = false;
  }
  function onRemote(snap, initial) {
    var r = remoteInfo(snap);
    if (!r) { if (initial) markCloud(); return; }
    if (r.savedAt <= cloud.lastSeen) return;
    cloud.lastSeen = r.savedAt;
    if (!remoteAhead(r)) { if (initial) markCloud(); return; }
    if (initial && !localLoadedAt && S.lifetime < 50) { adopt(r.obj); toast('Ta progression a été retrouvée sur ton compte.', 5000); return; }
    offerRemote(r, false);
  }

  function saveCloud(force) {
    if (!cloud.ok || pendingCloud) return Promise.resolve(false);
    if (cloud.busy) { cloud.dirty = true; if (force) lastCloud = 0; return Promise.resolve(false); }
    cloud.busy = true; cloud.dirty = false;
    var now = Date.now();
    lastCloud = now; cloud.lastSeen = now; S.savedAt = now;
    var payload = { s: JSON.stringify(S), savedAt: now, level: S.level, lifetime: S.lifetime, epoch: S.epoch };
    return cloud.ref.set(payload).then(function () { cloud.busy = false; cloud.lastWrite = now; return true; }, function (e) {
      cloud.busy = false;
      var c = e && e.code;
      if (c === 'invalid_argument' || c === 'revoked' || c === 'not_granted' || c === 'quota_exceeded') { cloud.ok = false; cloud.status = 'denied'; }
      else cloud.dirty = true;
      return false;
    });
  }

  function adopt(obj, force) {
    closeEvent();
    var now = Date.now();
    S = G.hydrate(obj, now);
    if (force) S.epoch = now;
    var tc0 = creditTrophies(obj);
    quiet = true; var off = G.offline(S, now); quiet = false;
    S.savedAt = now;
    pendingCloud = null; $('cloudBanner').hidden = true;
    prevUnlocked = {}; firstRender = true; shopKey = ''; ev.shownId = null; ev.ckey = null; tro.fresh = {}; tour.open = false; tour.fresh = false; tour.was = null;
    team.key = ''; team.poolKey = ''; team.focus = null; team.fire = null; team.wasOpen = null;
    closeMix(); closeProj(); cl.playing = false; closeClash(); closePiano(); closeDeco(); closeStory(); trv.key = ''; lbv.key = ''; lbv.wasOpen = null; cl.key = ''; cl.wasOpen = null; pjv.key = ''; pjv.wasOpen = null; pjv.confirm = false; ord.key = ''; ord.wasOpen = null; chs.key = ''; chs.wasOpen = null; rdv.key = '';
    buildActs(); buildShop(); renderTrophies(true); render(); renderScene(true);
    if (bind.syncSound) bind.syncSound();
    saveLocal(); markCloud();
    if (force) saveCloud(true);
    if (off) { off.trophies = G.trophyCount(S) - tc0; showOffline(off); }
  }
  // Débrief au retour: jeu fermé (production réduite) ou resté ouvert en arrière-plan (plein régime).
  var dbf = { open: false, opener: null };
  function showOffline(off) {
    if (!off || !(off.gain > 0)) return;
    if (off.gap < 120) { var n0 = off.net != null ? off.net : off.gain; toast('Pendant ton absence (' + away(off.gap) + ') : ' + (n0 >= 0 ? '+' : '−') + eur(Math.abs(n0)) + '.', 5000); return; }
    // Revenus bruts, salaires, puis le bilan: exactement ce que le budget a gagné.
    var net = off.net != null ? off.net : off.gain - (off.wages || 0), wages = Math.max(0, off.gain - net);
    var rows = [['Revenus', '+' + eur(off.gain)]];
    if (off.charts > 0) rows.push(['dont Top 50 et ventes d’albums', '+' + eur(off.charts)]);
    if (wages > 1e-6 * off.gain) { rows.push(['Salaires versés', '−' + eur(wages)]); rows.push(['Bilan sur ton budget', (net >= 0 ? '+' : '−') + eur(Math.abs(net))]); }
    rows.push(['Ton budget', eur(Math.max(0, S.money - net)) + ' → ' + eur(S.money)]);
    if (off.tracks > 0) rows.push(['Productions réalisées', '+' + nf0.format(off.tracks)]);
    if (off.levels > 0) rows.push(['Expertise', '+' + off.levels + ' niveau' + (off.levels > 1 ? 'x' : '')]);
    if (off.trophies > 0) rows.push(['Palmarès', '+' + off.trophies + ' niveau' + (off.trophies > 1 ? 'x' : '')]);
    if (lbv.back && lbv.back.length) { rows.push(['Retours de tournée', lbv.back.join(', ')]); lbv.back = []; }
    if (S.team.staff.length) {
      var mo1 = G.avgMorale(S), mo0 = off.mor0 != null ? off.mor0 : mo1;
      rows.push(['Moral de l’équipe', mo1 - mo0 >= 0.5 ? Math.round(mo0) + ' % → ' + Math.round(mo1) + ' % (repos)' : Math.round(mo1) + ' %']);
    }
    setText($('dbGap'), 'Tu étais absent ' + away(off.gap) + '.');
    $('dbRows').innerHTML = rows.map(function (r, k) { return '<div class="rw" style="--d:' + (0.15 + k * 0.25) + 's"><span class="rl">' + esc(r[0]) + '</span><b class="rv">' + esc(r[1]) + '</b></div>'; }).join('');
    setText($('dbNote'), off.open && off.froze ? 'Le jeu est resté ouvert, mais ton appareil l’a mis en veille une partie du temps : pendant la veille, la production tourne à ' + nf0.format(G.OFFLINE_EFF * 100) + ' %.'
      : off.open ? 'Le jeu est resté ouvert en arrière-plan : ton studio a tourné à plein régime.'
      : 'Studio fermé : la production tourne à ' + nf0.format(G.OFFLINE_EFF * 100) + ' %, jusqu’à ' + Math.round(G.OFFLINE_CAP / 3600) + ' h d’absence.' + (off.capped ? ' Au-delà, le studio s’est mis en pause.' : ''));
    if (dbf.open) return;
    dbf.open = true; dbf.opener = document.activeElement;
    $('debriefScrim').hidden = false; $('app').inert = true; $('tabs').inert = true;
    $('dbClose').focus();
    blip(10);
  }
  function closeDebrief() {
    if (!dbf.open) return;
    dbf.open = false;
    $('debriefScrim').hidden = true; $('app').inert = false; $('tabs').inert = false;
    var o = dbf.opener; dbf.opener = null;
    if (o && document.body.contains(o) && !o.closest('[hidden]') && o.focus) { try { o.focus(); } catch (e) { /* facultatif */ } }
  }

  function initCloud() {
    var c = window.claude;
    if (!c || !c.use) { cloud.status = 'off'; return; }
    Promise.all([c.use('db'), c.use('user')]).then(function (r) {
      var db = r[0], user = r[1];
      if (!db || !user) { cloud.status = 'off'; return null; }
      return Promise.all([user.id(), user.me()]).then(function (x) {
        if (!x[0]) { cloud.status = 'off'; return null; }
        cloud.me = x[1];
        cloud.ref = db.collection('data/users/' + x[0]).doc('save');
        return cloud.ref.get();
      });
    }).then(function (snap) {
      if (!snap) return;
      cloud.ok = true; cloud.status = 'ok';
      onRemote(snap, true);
      try { cloud.ref.onSnapshot(function (s) { onRemote(s, false); }, function () { /* flux interrompu */ }); } catch (e) { /* pas de flux */ }
    }).catch(function () { cloud.status = 'off'; });
  }

  function exportCode() {
    saveLocal();
    return 'PM1.' + btoa(unescape(encodeURIComponent(JSON.stringify(S))));
  }
  function importCode(text) {
    var t = (text || '').trim();
    if (t.indexOf('PM1.') !== 0) return null;
    try { var o = JSON.parse(decodeURIComponent(escape(atob(t.slice(4))))); return o && o.acts ? o : null; } catch (e) { return null; }
  }

  // ---------- Quantité d'achat des perfectionnements ----------
  var BUYKEY = 'premier-mix:buyN', buyN = 1;
  try { var bv = localStorage.getItem(BUYKEY); buyN = bv === 'max' ? 'max' : [1, 10, 25].indexOf(+bv) >= 0 ? +bv : 1; } catch (e) { buyN = 1; }
  function setBuyN(v) {
    buyN = v;
    try { localStorage.setItem(BUYKEY, String(v)); } catch (e) { /* stockage indisponible */ }
    $('buyN').querySelectorAll('button').forEach(function (b) { var d = b.getAttribute('data-n'); b.setAttribute('aria-pressed', String(d === String(v))); });
  }

  // ---------- Événements ----------
  function bind() {
    setBuyN(buyN);
    $('buyN').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-n]'); if (!b) return;
      var d = b.getAttribute('data-n'); setBuyN(d === 'max' ? 'max' : +d); render();
    });
    $('acts').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-do]');
      if (!b || b.disabled) return;
      var id = b.getAttribute('data-act'), what = b.getAttribute('data-do');
      markCloud();
      if (what === 'go') { if (!G.startAct(S, id)) G.tapAct(S, id); }
      else if (what === 'mix') { openMix(id); return; }
      else if (what === 'up') { G.upgradeActN(S, id, buyN); }
      else if (what === 'auto') { if (G.buyAuto(S, id)) { toast(G.ACT_BY[id].autoRole + ' s’occupe de « ' + G.ACT_BY[id].name + ' ».'); markCloud(); } }
      render();
    });
    $('items').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-buy]');
      if (!b || b.disabled) return;
      G.buy(S, b.getAttribute('data-buy'));
      render();
    });
    var TABS = { prod: 'tabProd', shop: 'tabShop', team: 'tabTeam', rd: 'tabRd', charts: 'tabCharts', trophies: 'tabTro', account: 'tabMore' };
    function view(v) {
      var was = $('app').getAttribute('data-view');
      $('app').setAttribute('data-view', v);
      Object.keys(TABS).forEach(function (k) { $(TABS[k]).setAttribute('aria-selected', k === v ? 'true' : 'false'); });
      if (was !== v) $('panes').scrollTop = 0;
      if (v === 'trophies') seeTrophies();
      if (v === 'team') { team.key = ''; renderTeam(true); lbv.key = ''; renderLabel(true); }
      if (v === 'charts') { chs.key = ''; chs.listT = 0; renderCharts(true); pjv.key = ''; renderProj(true); }
      if (v === 'rd') { rdv.key = ''; renderRd(true); }
      if (v !== 'team') team.focus = null;
      render();
    }
    bind.view = view;
    $('tourBtn').addEventListener('click', askTour);
    $('tourNo').addEventListener('click', function () { tour.open = false; renderTour(); $('tourBtn').focus(); });
    $('wtHome').addEventListener('click', function (e) { var b = e.target.closest('[data-home]'); if (!b) return; wtv.home = b.getAttribute('data-home'); $('wtHome').querySelectorAll('[data-home]').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); }); });
    $('wtClose').addEventListener('click', closeWorldTour);
    $('tourGo').addEventListener('click', startTour);
    // Un onglet rouvre le menu ; sur écran étroit, toucher l'onglet déjà ouvert replie le volet.
    function tab(v) {
      if (narrow() && menuOpen && $('app').getAttribute('data-view') === v) { setMenu(false); return; }
      if (!menuOpen) setMenu(true);
      view(v);
    }
    bind.tab = tab;
    $('tabProd').addEventListener('click', function () { tab('prod'); });
    $('tabShop').addEventListener('click', function () { tab('shop'); });
    $('tabTro').addEventListener('click', function () { tab('trophies'); });
    $('tabTeam').addEventListener('click', function () { tab('team'); });
    $('tabCharts').addEventListener('click', function () { tab('charts'); });
    $('teamSeg').addEventListener('click', function (e) { var b = e.target.closest('[data-tv]'); if (b) teamView(b.getAttribute('data-tv')); });
    $('tabRd').addEventListener('click', function () { tab('rd'); });
    bindFeatures();
    $('tabMore').addEventListener('click', function () { tab('account'); });
    $('goal').addEventListener('click', function () { view('trophies'); });

    // Équipe
    $('team').addEventListener('click', function (e) {
      var h = e.target.closest('button[data-hire]');
      if (h && !h.disabled) {
        var m = G.hire(S, +h.getAttribute('data-hire'));
        if (m) { team.key = ''; team.poolKey = ''; markCloud(); render(); }
        return;
      }
      var b = e.target.closest('button[data-do]'), card = e.target.closest('.member[data-id]');
      if (!b || b.disabled || !card) return;
      var id = +card.getAttribute('data-id'), what = b.getAttribute('data-do'), m2 = G.findMember(S, id);
      if (!m2) return;
      if (what === 'train') { if (G.train(S, id)) toast(m2.name + ' part en formation.'); }
      else if (what === 'bonus') { if (G.giveBonus(S, id)) { toast(m2.name + ' apprécie la prime : moral +' + D.TUNING.bonusMorale + '.'); blip(4); } }
      else if (what === 'rest') { if (G.sendRest(S, id)) toast(m2.name + ' part en vacances.'); }
      else if (what === 'fire') { team.fire = id; }
      else if (what === 'fireNo') { team.fire = null; }
      else if (what === 'fireGo') { G.fire(S, id); team.fire = null; team.key = ''; team.poolKey = ''; toast(m2.name + ' quitte le studio.'); }
      markCloud(); render(); renderTeam(true);
    });
    $('team').addEventListener('change', function (e) {
      var s = e.target.closest('select[data-do="assign"]'), card = e.target.closest('.member[data-id]');
      if (!s || !card) return;
      G.assign(S, +card.getAttribute('data-id'), s.value || null);
      team.key = ''; markCloud(); render(); renderTeam(true);
    });
    $('poolRefresh').addEventListener('click', function () { if (G.buyRefresh(S)) { team.poolKey = ''; markCloud(); render(); } });
    function syncSound() { $('soundBtn').setAttribute('aria-pressed', S.sound ? 'true' : 'false'); }
    $('soundBtn').addEventListener('click', function () { S.sound = !S.sound; syncSound(); if (S.sound) blip(0); saveLocal(); if (bind.syncVol) bind.syncVol(); });
    syncSound();
    bind.syncSound = syncSound;

    // Panneau des volumes
    loadVol();
    function syncVol() {
      $('volSfx').value = vol.sfx;
      $('volSfxOut').textContent = vol.sfx + ' %';
      $('volSfx').setAttribute('aria-valuetext', vol.sfx + ' %');
      $('volSfxHint').hidden = !!S.sound;
      $('volGame').value = vol.game; $('volGameOut').textContent = vol.game + ' %'; $('volGame').setAttribute('aria-valuetext', vol.game + ' %');
      $('gameSoundBtn').setAttribute('aria-pressed', vol.gameOn ? 'true' : 'false');
      $('volGameHint').hidden = vol.gameOn;
    }
    bind.syncVol = syncVol;
    var sfxT = 0;
    $('volSfx').addEventListener('input', function () {
      vol.sfx = +this.value; syncVol(); saveVol();
      clearTimeout(sfxT); sfxT = setTimeout(function () { lastBlip = 0; blip(2, true); }, 120); // aperçu du niveau
    });
    $('volReset').addEventListener('click', function () {
      vol.sfx = VDEF; vol.game = VDEF; syncVol(); saveVol();
    });
    var gT = 0;
    $('volGame').addEventListener('input', function () {
      vol.game = +this.value; syncVol(); saveVol();
      clearTimeout(gT); gT = setTimeout(function () { if (gameSnd() && typeof piSound === 'function') piSound(72); }, 120);
    });
    $('gameSoundBtn').addEventListener('click', function () { vol.gameOn = !vol.gameOn; syncVol(); saveVol(); if (gameSnd()) piSound(76); });
    syncVol();



    $('exportBtn').addEventListener('click', function () {
      var code = exportCode();
      function fallback() {
        $('importBox').hidden = false; $('codeArea').value = code; $('codeArea').focus(); $('codeArea').select();
        $('importMsg').textContent = 'Copie ce code et garde-le en lieu sûr.';
      }
      try {
        navigator.clipboard.writeText(code).then(function () { toast('Code de sauvegarde copié.'); }, fallback);
      } catch (e) { fallback(); }
    });
    $('importBtn').addEventListener('click', function () { $('importBox').hidden = false; $('resetBox').hidden = true; $('codeArea').value = ''; $('importMsg').textContent = ''; $('codeArea').focus(); });
    $('importClose').addEventListener('click', function () { $('importBox').hidden = true; });
    $('importGo').addEventListener('click', function () {
      var o = importCode($('codeArea').value);
      if (!o) { $('importMsg').textContent = 'Ce code n’est pas valide. Il doit commencer par PM1.'; return; }
      adopt(o, true); $('importBox').hidden = true; toast('Partie chargée.');
    });
    $('resetBtn').addEventListener('click', function () { $('resetBox').hidden = false; $('importBox').hidden = true; });
    $('resetNo').addEventListener('click', function () { $('resetBox').hidden = true; });
    $('resetGo').addEventListener('click', function () {
      $('resetBox').hidden = true; adopt(G.newState(Date.now()), true); toast('Nouvelle partie. Bon mix.');
    });
    $('cloudLoad').addEventListener('click', function () { if (pendingCloud) { adopt(pendingCloud); toast('Partie du compte chargée.'); } });
    $('cloudKeep').addEventListener('click', function () {
      pendingCloud = null; $('cloudBanner').hidden = true;
      S.epoch = Date.now(); saveLocal(); saveCloud(true);
      toast('Cette partie est devenue la référence de ton compte.');
    });
    $('accSave').addEventListener('click', function () {
      if (pendingCloud) { toast('Choisis d’abord quelle partie garder.'); return; }
      saveCloud(true).then(function (ok) { toast(ok ? 'Progression enregistrée sur ton compte.' : 'Enregistrement impossible pour le moment. Réessaie dans un instant.'); });
    });
    $('accLoad').addEventListener('click', function () {
      if (!cloud.ok) return;
      cloud.ref.get().then(function (snap) {
        var r = remoteInfo(snap);
        if (!r) toast('Aucune partie n’est enregistrée sur ton compte pour l’instant.');
        else offerRemote(r, true);
      }, function () { toast('Lecture du compte impossible pour le moment.'); });
    });
    $('invOpen').addEventListener('click', openEvent);
    $('invX').addEventListener('click', function () { G.dismissEvent(S); toast('Tu as laissé passer l’invitation.'); render(); });
    $('evChoices').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-i]');
      if (b) chooseEvent(+b.getAttribute('data-i'));
    });
    $('evLater').addEventListener('click', closeEvent);
    $('evClose').addEventListener('click', closeEvent);
    $('scrim').addEventListener('click', function (e) { if (e.target === $('scrim')) closeEvent(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && ev.open) closeEvent(); });
    $('accountPill').addEventListener('click', function () { if (!menuOpen) setMenu(true); view('account'); });

    document.addEventListener('visibilitychange', function () { if (document.hidden) { saveLocal(); if (cloud.dirty) saveCloud(true); } });
    window.addEventListener('pagehide', function () { saveLocal(); });
  }

  // ---------- Démarrage ----------
  G.hooks.complete = function (act, n, p, mixed, hits) {
    if (quiet) return;
    var now = performance.now();
    if (hits) { lastFloat[act.id] = now; floater(act.id, 'Tube ! +' + eur(p)); if (scene3d) S3.pop('Tube ! +' + eur(p), act.id, 'tube'); blip(11); return; }
    if (now - (lastFloat[act.id] || 0) > 800) { lastFloat[act.id] = now; floater(act.id, '+' + eur(p)); if (scene3d) S3.pop('+' + eur(p), act.id); }
    blip(G.ACTS.indexOf(act));
  };
  G.hooks.levelUp = function (lvl) { if (!quiet) { toast('Expertise niveau ' + lvl + '.'); markCloud(); } };
  G.hooks.buy = function (it) { shopKey = ''; markCloud(); if (!quiet) toast(it.name + ' installé dans le studio.'); };
  G.hooks.trophy = function (t) {
    tro.fresh[t.id] = true; tro.last = 0;
    markCloud();
    if (quiet) return;
    toast('Palmarès : ' + t.name + (t.fam.levels.length > 1 ? ', niveau ' + t.level : '') + ' · +' + nf0.format(D.TUNING.trophyBonus * 100) + ' % de gains', 4800);
    blip(9);
  };
  G.hooks.hire = function (m, back) {
    markCloud();
    if (quiet) return;
    toast(m.name + (back ? ' revient' : ' rejoint') + ' l’équipe' + (m.act ? ' et prend en charge « ' + G.ACT_BY[m.act].name + ' ».' : '.'), 5000);
    blip(6);
  };
  G.hooks.staffLevel = function (m, how) {
    markCloud(); team.key = '';
    if (quiet) return;
    toast(m.name + ' passe au niveau ' + m.lvl + (how === 'train' ? ' (formation terminée)' : '') + '. Salaire : ' + eur(m.salary) + '/s.', 4500);
    if (scene3d && m.act) S3.pop('Niv. ' + m.lvl + ' !', m.act, 'lvl');
    blip(8);
  };
  G.hooks.staffWarn = function (m) { if (!quiet) { toast(m.name + ' n’a plus le moral. Une prime ou des vacances le remettront d’aplomb.', 6500); blip(1); } };
  G.hooks.staffLeave = function (m) { markCloud(); team.key = ''; if (!quiet) toast(m.name + ' a démissionné et quitte le studio.', 7000); };
  G.hooks.staffBack = function (m) { if (!quiet) toast(m.name + ' revient de vacances en pleine forme.'); };
  G.hooks.unpaid = function () {
    var now = Date.now();
    if (quiet || now - team.lastUnpaid < 30000) return;
    team.lastUnpaid = now;
    toast('Budget à zéro : les salaires ne sont plus payés et le moral de l’équipe chute.', 6000);
  };
  G.hooks.research = function (n) { markCloud(); rdv.key = ''; if (!quiet) { toast('Recherche terminée : ' + n.name + '.', 4500); blip(10); } };
  G.hooks.spec = function (o) { markCloud(); rdv.key = ''; if (!quiet) { toast('Nouvelle spécialisation : ' + o.name + '.', 5000); blip(12); } };
  G.hooks.artistSign = function (a) { lbv.key = ''; markCloud(); if (!quiet) { toast(a.name + ' rejoint ton label !', 5000); blip(12); } };
  G.hooks.artistAsk = function (a) { lbv.key = ''; markCloud(); if (!quiet) { toast(a.name + ' veut sortir un album. Rendez-vous dans l’onglet Équipe, section Ton label.', 6500); blip(9); } };
  G.hooks.worldDate = function (d) { wtv.key = ''; tour.fresh = true; markCloud(); if (!quiet) { toast('Date confirmée pour la tournée mondiale : ' + d.city + ', ' + d.venue + ' !', 6500); blip(11); } };
  G.hooks.ltourIncident = function (a, r, x) { lbv.key = ''; markCloud(); if (!quiet) { toast(a.name + ' en tournée : ' + G.ltourText(S, r, x.title).toLowerCase().replace(/^./, function (c) { return c.toUpperCase(); }) + '. Réponds depuis l’onglet Équipe.', 6500); blip(8); } };
  G.hooks.ltourAuto = function (a, res) { lbv.key = ''; markCloud(); };
  G.hooks.ltourCity = function () { lbv.key = ''; markCloud(); };
  G.hooks.ltourDone = function (a, r, x) { lbv.key = ''; markCloud(); if (quiet) { (lbv.back = lbv.back || []).push(a.name + ' (' + x.ok + '/' + x.n + ' dates, +' + eur(x.cash) + ')'); return; } if (!quiet) { toast(a.name + ' est rentré de tournée : ' + x.ok + '/' + x.n + ' dates réussies, +' + eur(x.cash) + ', notoriété ' + (x.fame >= 0 ? '+' : '') + Math.round(x.fame) + '.', 7500); blip(11); } };
  G.hooks.artistOffer = function (a, r) { lbv.key = ''; markCloud(); if (!quiet) { toast(r.offer.lab + ' veut signer ' + a.name + ' ! Réponds vite depuis l’onglet Équipe, section Label.', 7000); blip(10); } };
  G.hooks.offerAuto = function (res) { lbv.key = ''; lbv.dkey = ''; markCloud(); saveLocal(); if (!quiet) toast(res.kept ? artName(res.id) + ' a refusé l’offre de ' + res.lab + ' et reste sur ton label.' : artName(res.id) + ' est parti chez ' + res.lab + ' faute de réponse. Indemnité : ' + eur(res.fee) + '.', 7000); };
  G.hooks.offerDone = function () { lbv.key = ''; lbv.dkey = ''; };
  G.hooks.artistStory = function (a) { lbv.key = ''; markCloud(); if (!quiet) { toast(a.name + ' a quelque chose à te dire. Rendez-vous dans l’onglet Équipe, section Ton label.', 6000); blip(8); } };
  G.hooks.concertDone = function () { lbv.key = ''; markCloud(); };
  G.hooks.artistIgnored = function (a) { lbv.key = ''; markCloud(); if (!quiet) toast(a.name + ' attendra son album un peu plus longtemps, un peu déçu.', 5000); };
  G.hooks.trend = function (tr) {
    trv.key = ''; markCloud();
    if (quiet) return;
    toast('Nouvelles tendances : « ' + G.ACT_BY[tr.act].name + ' » en vogue, le public veut du ' + G.PJ_G[tr.g].name + '. Détails dans le Top 50.', 6500);
  };
  G.hooks.battleNew = function (r) { cl.key = ''; markCloud(); if (!quiet) { toast(r.kind === 'piano' ? r.name + ' te défie en duel au piano ! Touche le piano du studio ou va dans Productions.' : r.name + ' te défie en clash de beatmakers ! Touche la batterie du studio ou va dans Productions.', 6000); blip(10); } };
  G.hooks.battleDone = function () { cl.key = ''; markCloud(); };
  G.hooks.projectStart = function (c) { markCloud(); if (!quiet) { toast('« ' + c.title + ' » est lancé : écriture en cours.', 4000); blip(6); } };
  G.hooks.projectPhase = function (c) { pjv.key = ''; markCloud(); if (!quiet) toast('« ' + c.title + ' » : ' + D.PROJECTS.phases[c.phase].name.toLowerCase() + ' en cours.', 3500); };
  G.hooks.projectDone = function (r) {
    pjv.key = ''; chs.key = ''; markCloud(); saveLocal();
    if (quiet) return;
    toast('Les critiques ont parlé : « ' + r.title + ' » obtient ' + pjNote(r.avg) + (r.pos ? ' et entre au Top 50 à la place ' + r.pos + '.' : '.'), 7000);
    blip(r.avg >= 8 ? 12 : 7);
  };
  G.hooks.orderNew = function (x) { if (!quiet) { toast('Nouvelle commande : ' + x.client + ' (' + x.kind.toLowerCase() + ') te contacte.', 4500); blip(6); } };
  G.hooks.orderDone = function (x) {
    markCloud(); ord.key = '';
    if (quiet) return;
    toast('Commande livrée à ' + x.client + ' : +' + eur(x.reward) + ', réputation +' + D.TUNING.repWin + '.', 5000);
    if (scene3d) S3.pop('+' + eur(x.reward), x.act, 'lvl');
    blip(10);
  };
  G.hooks.orderFail = function (x) { markCloud(); ord.key = ''; if (!quiet) { toast('Délai dépassé : ' + x.client + ' annule sa commande. Réputation −' + D.TUNING.repLose + '.', 6000); blip(1); } };
  G.hooks.release = function (e) { markCloud(); chs.key = ''; if (!quiet) { toast('« ' + e.t + ' » entre dans le Top 50 à la place ' + e.pos + ' !', 5500); blip(9); } };
  G.hooks.chartWeek = function (w) {
    markCloud(); chs.key = '';
    if (quiet || !w.entries.length) return;
    var best = w.entries.reduce(function (a, b) { return a.pos < b.pos ? a : b; });
    toast('Top 50, semaine ' + w.week + ' : +' + eur(w.pay) + (best.pos === 1 ? '. « ' + best.t + ' » est numéro un !' : '. Meilleure place : ' + best.pos + '.'), 6000);
    blip(best.pos === 1 ? 12 : 8);
  };
  G.hooks.eventSpawn = function (x) { toast('Sortie de studio : une rencontre t’attend.', 4200); blip(7); };
  G.hooks.eventExpire = function () { if (!ev.open) toast('L’occasion est passée.'); };
  G.hooks.upgrade = function (act, lvl, from) {
    if (from == null) from = lvl - 1;
    var ps = G.perksBetween(from, lvl);
    if (ps.length === 1) toast('Palier « ' + ps[0].name + ' » pour « ' + act.name + ' » : ' + ps[0].desc.charAt(0).toLowerCase() + ps[0].desc.slice(1) + '.', 5500);
    else if (ps.length > 1) toast(ps.length + ' paliers pour « ' + act.name + ' » : ' + ps.map(function (p) { return p.name; }).join(', ') + '.', 5500);
    if (ps.length) blip(9);
  };

  // Accès en lecture pour le diagnostic (console: premierMix().money).
  window.premierMix = function () { return S; };
  function boot(hot) {
    var raw = hot && typeof hot === 'object' && hot.acts ? hot : loadLocal();
    var now = Date.now();
    S = G.hydrate(raw, now);
    localLoadedAt = raw ? S.savedAt : 0;
    var off = null, tc0 = creditTrophies(raw);
    if (raw) { quiet = true; off = G.offline(S, now); quiet = false; }
    S.savedAt = now;
    initTheme();
    buildActs(); buildShop(); buildTrophies(); bind(); bindPerks(); bindLtour(); bindGlobe();
    initScene();
    initMenu();
    render(); renderScene(true);
    if (off) { off.trophies = G.trophyCount(S) - tc0; showOffline(off); }
    try {
      var h = window.claude && window.claude.hot;
      if (h && h.snapshot) h.snapshot(function () { S.savedAt = Date.now(); return JSON.parse(JSON.stringify(S)); });
    } catch (e) { /* mise à jour à chaud facultative */ }

    var last = Date.now(), bg = null;
    // Jeu ouvert mais caché (autre onglet, appli en arrière-plan, écran verrouillé): on mémorise le point de départ du débrief.
    function bgStart(t) { if (!bg) bg = { t: t, life: S.lifetime, money: S.money, lvl: S.level, tc: G.trophyCount(S), tracks: G.trackCount(S), froze: false, charts: 0, mor0: G.avgMorale(S) }; }
    function bgEnd() {
      if (!bg) return;
      var b = bg, gap = (Date.now() - b.t) / 1000; bg = null;
      if (gap < 60) return;
      showOffline({ gap: gap, gain: S.lifetime - b.life, net: S.money - b.money, levels: S.level - b.lvl, trophies: G.trophyCount(S) - b.tc, tracks: G.trackCount(S) - b.tracks, open: true, froze: b.froze, charts: b.charts, mor0: b.mor0 });
      render();
    }
    // Au retour, on rattrape d'abord le temps écoulé (appareil en veille), puis on affiche le débrief complet.
    document.addEventListener('visibilitychange', function () { if (document.hidden) bgStart(Date.now()); else { tick(); bgEnd(); } });
    if (document.hidden) bgStart(Date.now());
    $('dbClose').addEventListener('click', closeDebrief);
    $('debriefScrim').addEventListener('click', function (e) { if (e.target === $('debriefScrim')) closeDebrief(); });
    document.addEventListener('keydown', function (e) { if (dbf.open && e.key === 'Escape') { e.preventDefault(); closeDebrief(); } });
    function tick() {
      var t = Date.now(), dt = (t - last) / 1000;
      last = t;
      if (dt <= 0) return;
      if (document.hidden) bgStart(t);
      // onglet caché: le navigateur espace les tours de boucle (jusqu'à 1 par minute) sans geler le jeu
      if (dt > (document.hidden ? 180 : 60)) {
        S.savedAt = t - dt * 1000; var tc1 = G.trophyCount(S); quiet = true; var o = G.offline(S, t); quiet = false;
        if (bg) { bg.froze = true; if (o) bg.charts += o.charts; }
        else if (o) { o.trophies = G.trophyCount(S) - tc1; showOffline(o); }
      } else if (document.hidden) {
        quiet = true; var chg = G.advanceAway(S, dt); quiet = false;
        if (bg) bg.charts += chg;
      } else {
        G.advance(S, dt);
        G.tickEvents(S, dt); G.tickLive(S, dt);
      }
      render();
      if (t - lastSave > 5000) { lastSave = t; saveLocal(); }
      if (cloud.ok && t - lastCloud > 300000) cloud.dirty = true;
      if (cloud.dirty && t - lastCloud > 20000) saveCloud();
    }
    setInterval(tick, 100);
    initCloud();
  }

  var hot = window.claude && window.claude.hot;
  if (hot && hot.ready) hot.ready(boot); else boot(hot && hot.data);
})();
