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
  var VKEY = 'premier-mix:volumes', VDEF = 70, vol = { sfx: VDEF };
  function volMul(v) { return Math.pow(v / VDEF, 2); }
  function loadVol() {
    try { var o = JSON.parse(localStorage.getItem(VKEY) || 'null'); if (o) ['sfx'].forEach(function (k) { var n = +o[k]; if (isFinite(n)) vol[k] = Math.max(0, Math.min(100, Math.round(n))); }); } catch (e) { /* valeurs par défaut */ }
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
  var CHANNELS = ['Voix', 'Batterie', 'Basse', 'Synthé'], ZH = 0.09;
  var mix = { open: false, act: null, i: 0, acc: [], zones: [], speeds: [], phase: [], t0: 0, raf: 0, pos: 0, done: false, opener: null, faders: [] };
  function knobPos(k, t) { var x = (t * mix.speeds[k] + mix.phase[k]) % 2; x = x < 1 ? x : 2 - x; return 0.04 + 0.92 * x; }
  function openMix(id) {
    if (mix.open || !G.startMix(S, id)) return;
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    mix.open = true; mix.done = false; mix.act = id; mix.i = 0; mix.acc = []; mix.opener = document.activeElement;
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
    setClass($('tabProd'), 'has', open && !onProd && o.offers.length > 0 && o.active.length < D.TUNING.orderMaxActive);
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
    var full = o.active.length >= D.TUNING.orderMaxActive;
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
      : full && o.offers.length ? 'Tu mènes déjà ' + D.TUNING.orderMaxActive + ' commandes : termine-en une pour en accepter une autre.' : 'Les productions terminées comptent si leur qualité suffit. Un délai dépassé coûte ' + D.TUNING.repLose + ' points de réputation.');
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
        return '<li class="mine' + (m.pos === 1 ? ' top1' : '') + '"><span class="pos">' + m.pos + '</span>' + moveHtml({ prev: m.p, pos: m.pos }) + '<span class="tt"><b>' + esc(m.t) + '</b><span>' + esc(G.ACT_BY[m.act].name) + ' · ' + starsTxt(m.q) + ' · ' + m.weeks + ' sem.' + (m.best ? ' · record ' + m.best : '') + '</span></span><span class="gain">+' + eur(G.chartPay(S, m.pos)) + '/sem.</span></li>';
      }).join('');
    }
    var now = performance.now();
    if (now - chs.listT > 2000 || force) {
      chs.listT = now;
      $('chartList').innerHTML = G.chartTop(S).map(function (e) {
        return '<li class="' + (e.mine ? 'mine' : '') + (e.pos === 1 ? ' top1' : '') + '"><span class="pos">' + e.pos + '</span>' + moveHtml(e) + '<span class="tt"><b>' + esc(e.t) + '</b><span>' + (e.mine ? 'Ta prod · ' + esc(G.ACT_BY[e.act].name) + ' · ' + starsTxt(e.q) : esc(e.a)) + '</span></span><span class="gain">' + (e.mine ? '+' + eur(G.chartPay(S, e.pos)) : '') + '</span></li>';
      }).join('');
    }
  }

  function bindFeatures() {
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
        '<div class="strip-head"><span class="led" aria-hidden="true"></span><h3>' + act.name + '</h3><span class="who" data-k="who" hidden><i></i><span></span></span><span class="rank" data-k="rank"></span></div>' +
        '<p class="desc">' + act.desc + '</p>' +
        '<p class="lock-note" data-k="lock" hidden></p>' +
        '<div class="live" data-k="live">' +
          '<div class="meter" aria-hidden="true"><i data-k="fill"></i></div>' +
          '<div class="meter-info"><span data-k="gain"></span><span data-k="time"></span></div>' +
          '<div class="actions">' +
            '<div class="go-row"><button class="pad" type="button" id="go-' + act.id + '" data-do="go" data-act="' + act.id + '"><b data-k="goT"></b><small data-k="goS"></small></button>' +
            '<button class="btn mixbtn" type="button" id="mix-' + act.id + '" data-do="mix" data-act="' + act.id + '" title="Mixer toi-même cette production"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3v18M12 3v18M18 3v18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><rect x="3.5" y="12" width="5" height="3.4" rx="1" fill="currentColor"/><rect x="9.5" y="6" width="5" height="3.4" rx="1" fill="currentColor"/><rect x="15.5" y="14.5" width="5" height="3.4" rx="1" fill="currentColor"/></svg><small data-k="mixT">Mixer</small></button></div>' +
            '<button class="btn" type="button" id="up-' + act.id + '" data-do="up" data-act="' + act.id + '"><span class="t"><b>Perfectionner</b><small data-k="upS"></small></span><span class="p" data-k="upP"></span></button>' +
            '<button class="btn" type="button" id="auto-' + act.id + '" data-do="auto" data-act="' + act.id + '"><span class="t"><b>Automatiser</b><small>' + act.autoRole + '</small></span><span class="p" data-k="autoP"></span></button>' +
          '</div>' +
          '<p class="foot-line" data-k="foot"></p>' +
        '</div>';
      host.appendChild(el);
      var r = { root: el, led: el.querySelector('.led') };
      el.querySelectorAll('[data-k]').forEach(function (n) { r[n.getAttribute('data-k')] = n; });
      r.go = el.querySelector('[data-do="go"]'); r.up = el.querySelector('[data-do="up"]'); r.auto = el.querySelector('[data-do="auto"]'); r.mix = el.querySelector('[data-do="mix"]');
      rows[act.id] = r;
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
        '<div><span class="tag">' + (it.kind === 'gear' ? 'Matériel' : 'Logiciel et contrats') + '</span><h3>' + it.name + '</h3><p>' + it.desc + '</p>' +
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
    setText($('rate'), (total > 0 ? '+' + eur(total) + '/s' : 'Lance une production') + (S.fame ? ' · Renommée ' + S.fame : ''));
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
      var pay = G.payout(S, act), xp = G.xpGain(S, act), cost = G.upCost(S, act);
      setText(r.rank, 'Rang ' + a.lvl);
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
      var nm = G.nextMilestone(a.lvl);
      setText(r.upS, nm ? 'Rang ' + (a.lvl + 1) + ' · palier ×2 au rang ' + nm : 'Rang ' + (a.lvl + 1));
      setText(r.upP, eur(cost));
      setDisabled(r.up, S.money < cost);
      setHidden(r.auto, a.auto);
      setText(r.autoP, eur(act.autoCost));
      setDisabled(r.auto, S.money < act.autoCost);
      setText(r.foot, nf0.format(a.done) + (a.done > 1 ? ' réalisés' : ' réalisé') + ' · qualité ' + starsTxt(G.baseQuality(S, act.id)) + (a.auto ? ' · ' + act.autoRole + ' s’en occupe' : ''));
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
  var RW_LABEL = { cash: 'Argent', xp: 'Expertise', boost: 'Boost', rank: 'Perfectionnement', tracks: 'Catalogue', contact: 'Nouveau contact' };
  function rewardText(r) {
    switch (r.k) {
      case 'cash': return '+' + eur(r.v) + (r.again ? ' (cachet de retrouvailles)' : '');
      case 'xp': return '+' + short(r.v) + ' pts d’expertise';
      case 'boost': return 'Gains ×' + nf0.format(r.m) + ' pendant ' + dur(r.s);
      case 'rank': return G.ACT_BY[r.act].name + ' passe au rang ' + r.lvl;
      case 'tracks': return '+' + nf0.format(r.n) + ' titres au catalogue (' + G.ACT_BY[r.act].name + ')';
      case 'contact': return r.name + ', +' + nf0.format(D.TUNING.contactBonus * 100) + ' % de gains pour toujours';
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
      cap: G.teamOpen(S) ? G.teamCap(S) : 0,
      staff: S.team.staff.map(function (m) { return { id: m.id, look: m.look, role: m.role, morale: m.morale, act: m.act, status: memberStatus(m) }; })
    });
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
      var e = document.createElement('p'); e.className = 'small-note'; e.textContent = 'Personne pour l’instant. Recrute un premier membre parmi les candidats.'; box.appendChild(e);
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
        '<p class="fits">Excelle sur : ' + esc(fitsText(c.role)) + '</p>' +
        (c.back ? '<span class="back-tag">Ancien membre : revient sans prime d’embauche</span>' : '') +
        '<p class="small-note" style="margin:0">Salaire : ' + eur(c.salary) + '/s</p>' +
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
    var onTeam = $('app').getAttribute('data-view') === 'team';
    setClass($('tabTeam'), 'has', !onTeam && (low || canHire));
    setClass($('tabTeam'), 'warn', !onTeam && !low && canHire);
    setHidden($('teamLock'), open);
    setHidden($('teamOpenBox'), !open);
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
  function fmtProg(t, v) {
    if (t.n === 1) return '';
    if (t.m === 'lifetime') return eur(v) + ' / ' + eur(t.n);
    if (t.m === 'income') return short(v) + ' / ' + short(t.n) + NB + '€/s';
    return short(v) + ' / ' + short(t.n);
  }
  function buildTrophies() {
    var grid = $('troGrid');
    grid.innerHTML = '';
    tro.cards = {};
    G.TROPHIES.forEach(function (t) {
      var c = document.createElement('article');
      c.className = 'tro';
      c.innerHTML = '<span class="disc" aria-hidden="true"></span><h3></h3><p></p><div class="tro-prog"><span class="meter" aria-hidden="true"><i></i></span><span class="tro-n"></span></div>';
      c.querySelector('h3').textContent = t.name;
      c.querySelector('p').textContent = t.desc;
      grid.appendChild(c);
      tro.cards[t.id] = { root: c, meter: c.querySelector('.meter'), fill: c.querySelector('.meter i'), num: c.querySelector('.tro-n') };
    });
  }
  function renderTrophies(force) {
    if (!tro.cards) return;
    var n = G.trophyCount(S), tot = G.TROPHIES.length, hasFresh = Object.keys(tro.fresh).length > 0;
    setText($('troCount'), n + ' / ' + tot + ' trophées');
    setText($('troBonus'), n
      ? '+' + nf0.format(D.TUNING.trophyBonus * n * 100) + ' % de gains, définitif'
      : 'Chaque trophée ajoute ' + nf0.format(D.TUNING.trophyBonus * 100) + ' % de gains pour toujours.');
    setClass($('tabTro'), 'has', (hasFresh || tour.fresh) && $('app').getAttribute('data-view') !== 'trophies');
    var now = performance.now();
    if (!force && now - tro.last < 400) return;
    tro.last = now;
    G.TROPHIES.forEach(function (t) {
      var c = tro.cards[t.id], got = !!S.trophies[t.id];
      setClass(c.root, 'got', got);
      setClass(c.root, 'fresh', !!tro.fresh[t.id]);
      setHidden(c.meter, got);
      if (got) { setText(c.num, 'Décroché'); return; }
      var p = G.trophyProgress(S, t);
      setWidth(c.fill, p.f * 100);
      setText(c.num, fmtProg(t, p.v));
    });
    var g = G.nextGoals(S, 1)[0];
    setHidden($('goal'), !g);
    if (g) {
      setText($('goalName'), g.t.name);
      setText($('goalDesc'), g.t.desc);
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
    if (migrated && n > 0) toast('Nouveau : le Palmarès. Tu as déjà ' + n + (n > 1 ? ' trophées' : ' trophée') + ', soit +' + nf0.format(D.TUNING.trophyBonus * n * 100) + ' % de gains.', 8000);
    return n;
  }

  // ---------- Tournée mondiale ----------
  var tour = { open: false, was: null, fresh: false };
  function pctOf(x) { return nf0.format(Math.round(x * 100)); }
  function renderTour() {
    var T = D.TUNING, fame = S.fame || 0, avail = G.canTour(S), pts = G.fameAvailable(S);
    setHidden($('tourFame'), !fame);
    setText($('tourFame'), 'Renommée ' + fame + ' · +' + pctOf(T.fameBonus * fame) + NB + '% de gains · +' + pctOf(T.fameXp * fame) + NB + '% d’expertise');
    var lt = S.lifetime;
    if (avail) {
      var tot = fame + pts;
      setText($('tourText'), 'Tu peux partir maintenant : +' + pts + (pts > 1 ? ' points' : ' point') + ' de renommée (' + tot + ' au total), soit +' + pctOf(T.fameBonus * tot) +
        NB + '% de gains et +' + pctOf(T.fameXp * tot) + NB + '% d’expertise pour toujours. Attendre rapporte plus de points, mais de moins en moins vite.');
      var lo = G.fameAt(G.fameFor(lt)), hi = G.fameNextAt(S);
      setWidth($('tourFill'), Math.max(0, Math.min(100, (lt - lo) / (hi - lo) * 100)));
      setText($('tourNote'), 'Point suivant : ' + eur(lt) + ' / ' + eur(hi));
      setText($('tourBtnSub'), '+' + pts + (pts > 1 ? ' points' : ' point') + ' de renommée');
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
    $('tourAsk').textContent = 'Tu repars d’un ordinateur portable : budget, expertise, matériel, perfectionnements et catalogue sont remis à zéro. Tu gardes ta renommée (+' + pts +
      (pts > 1 ? ' points' : ' point') + '), tes contacts, tes trophées et ton compteur de gains. Partir maintenant ?';
    renderTour();
    $('tourNo').focus({ preventScroll: true });
    $('tourConfirm').scrollIntoView({ block: 'center' });
  }
  function startTour() {
    var r = G.tour(S, Date.now());
    if (!r) return;
    tour.open = false; tour.fresh = false;
    adopt(JSON.parse(JSON.stringify(S)), true);
    if (bind.view) bind.view('prod');
    toast('Tournée terminée : +' + r.points + (r.points > 1 ? ' points' : ' point') + ' de renommée. Tu repars avec ton portable.', 7000);
    blip(12);
  }

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
    x.choices.forEach(function (c, i) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'btn choice'; b.id = 'choice-' + i; b.setAttribute('data-i', i);
      b.innerHTML = '<span class="k"></span><span class="ct"></span>';
      b.firstChild.textContent = 'ABC'.charAt(i);
      b.lastChild.textContent = c.text;
      box.appendChild(b);
    });
    $('evAsk').hidden = false; $('evDone').hidden = true;
    $('scrim').hidden = false;
    $('app').inert = true; $('tabs').inert = true;
    $('choice-0').focus();
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
    $('evOutcome').textContent = res.choice.outcome;
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
    closeMix(); ord.key = ''; ord.wasOpen = null; chs.key = ''; chs.wasOpen = null;
    buildActs(); buildShop(); renderTrophies(true); render(); renderScene(true);
    if (bind.syncSound) bind.syncSound();
    saveLocal(); markCloud();
    if (force) saveCloud(true);
    if (off) { off.trophies = G.trophyCount(S) - tc0; showOffline(off); }
  }
  function showOffline(off) {
    toast('Pendant ton absence (' + away(off.gap) + ') : +' + eur(off.gain) + (off.wages > 1e-9 ? ' après ' + eur(off.wages) + ' de salaires' : '') + (off.levels > 0 ? ', ' + off.levels + ' niveau' + (off.levels > 1 ? 'x' : '') + ' d’expertise' : '') + (off.trophies > 0 ? ', ' + off.trophies + (off.trophies > 1 ? ' trophées' : ' trophée') : '') + '.', 7000);
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

  // ---------- Événements ----------
  function bind() {
    $('acts').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-do]');
      if (!b || b.disabled) return;
      var id = b.getAttribute('data-act'), what = b.getAttribute('data-do');
      markCloud();
      if (what === 'go') { if (!G.startAct(S, id)) G.tapAct(S, id); }
      else if (what === 'mix') { openMix(id); return; }
      else if (what === 'up') { G.upgradeAct(S, id); }
      else if (what === 'auto') { if (G.buyAuto(S, id)) { toast(G.ACT_BY[id].autoRole + ' s’occupe de « ' + G.ACT_BY[id].name + ' ».'); markCloud(); } }
      render();
    });
    $('items').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-buy]');
      if (!b || b.disabled) return;
      G.buy(S, b.getAttribute('data-buy'));
      render();
    });
    var TABS = { prod: 'tabProd', shop: 'tabShop', team: 'tabTeam', charts: 'tabCharts', trophies: 'tabTro', account: 'tabMore' };
    function view(v) {
      var was = $('app').getAttribute('data-view');
      $('app').setAttribute('data-view', v);
      Object.keys(TABS).forEach(function (k) { $(TABS[k]).setAttribute('aria-selected', k === v ? 'true' : 'false'); });
      if (was !== v) $('panes').scrollTop = 0;
      if (v === 'trophies') seeTrophies();
      if (v === 'team') { team.key = ''; renderTeam(true); }
      if (v === 'charts') { chs.key = ''; chs.listT = 0; renderCharts(true); }
      if (v !== 'team') team.focus = null;
      render();
    }
    bind.view = view;
    $('tourBtn').addEventListener('click', askTour);
    $('tourNo').addEventListener('click', function () { tour.open = false; renderTour(); $('tourBtn').focus(); });
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
    }
    function openVol(open) {
      $('volPanel').hidden = !open; $('volBtn').setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open) syncVol();
    }
    bind.syncVol = syncVol;
    $('volBtn').addEventListener('click', function () { openVol($('volPanel').hidden); });
    var sfxT = 0;
    $('volSfx').addEventListener('input', function () {
      vol.sfx = +this.value; syncVol(); saveVol();
      clearTimeout(sfxT); sfxT = setTimeout(function () { lastBlip = 0; blip(2, true); }, 120); // aperçu du niveau
    });
    $('volReset').addEventListener('click', function () {
      vol.sfx = VDEF; syncVol(); saveVol();
    });
    document.addEventListener('pointerdown', function (e) {
      if ($('volPanel').hidden) return;
      if (e.target.closest && (e.target.closest('#volPanel') || e.target.closest('#volBtn') || e.target.closest('.toggles'))) return;
      openVol(false);
    }, true);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !$('volPanel').hidden) { openVol(false); $('volBtn').focus(); } });


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
  G.hooks.complete = function (act, n, p) {
    if (quiet) return;
    var now = performance.now();
    if (now - (lastFloat[act.id] || 0) > 800) { lastFloat[act.id] = now; floater(act.id, '+' + eur(p)); if (scene3d) S3.pop('+' + eur(p), act.id); }
    blip(G.ACTS.indexOf(act));
  };
  G.hooks.levelUp = function (lvl) { if (!quiet) { toast('Expertise niveau ' + lvl + '.'); markCloud(); } };
  G.hooks.buy = function (it) { shopKey = ''; markCloud(); if (!quiet) toast(it.name + ' installé dans le studio.'); };
  G.hooks.trophy = function (t) {
    tro.fresh[t.id] = true; tro.last = 0;
    markCloud();
    if (quiet) return;
    toast('Trophée : ' + t.name + ' · +' + nf0.format(D.TUNING.trophyBonus * 100) + ' % de gains', 4800);
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
  G.hooks.upgrade = function (act, lvl) {
    if (G.milestoneMult(lvl) !== G.milestoneMult(lvl - 1)) toast('Palier atteint : les gains de « ' + act.name + ' » sont doublés.');
  };

  function boot(hot) {
    var raw = hot && typeof hot === 'object' && hot.acts ? hot : loadLocal();
    var now = Date.now();
    S = G.hydrate(raw, now);
    localLoadedAt = raw ? S.savedAt : 0;
    var off = null, tc0 = creditTrophies(raw);
    if (raw) { quiet = true; off = G.offline(S, now); quiet = false; }
    S.savedAt = now;
    initTheme();
    buildActs(); buildShop(); buildTrophies(); bind();
    initScene();
    initMenu();
    render(); renderScene(true);
    if (off) { off.trophies = G.trophyCount(S) - tc0; showOffline(off); }
    try {
      var h = window.claude && window.claude.hot;
      if (h && h.snapshot) h.snapshot(function () { S.savedAt = Date.now(); return JSON.parse(JSON.stringify(S)); });
    } catch (e) { /* mise à jour à chaud facultative */ }

    var last = Date.now();
    setInterval(function () {
      var t = Date.now(), dt = (t - last) / 1000;
      last = t;
      if (dt > 60) {
        S.savedAt = t - dt * 1000; var tc1 = G.trophyCount(S); quiet = true; var o = G.offline(S, t); quiet = false;
        if (o) { o.trophies = G.trophyCount(S) - tc1; showOffline(o); }
      } else {
        G.advance(S, dt);
        if (!document.hidden) { G.tickEvents(S, dt); G.tickLive(S, dt); }
      }
      render();
      if (t - lastSave > 5000) { lastSave = t; saveLocal(); }
      if (cloud.ok && t - lastCloud > 300000) cloud.dirty = true;
      if (cloud.dirty && t - lastCloud > 20000) saveCloud();
    }, 100);
    initCloud();
  }

  var hot = window.claude && window.claude.hot;
  if (hot && hot.ready) hot.ready(boot); else boot(hot && hot.data);
})();
