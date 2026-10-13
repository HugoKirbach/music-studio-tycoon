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
  var pi = { open: false, mode: 'ear', state: 'idle', mel: [], pos: 0, len: 0, timers: [], keys: {}, labels: {}, gain: null, opener: null, built: false };
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
    if (!S.sound || vol.sfx <= 0) return false;
    try {
      ac = ac || new (window.AudioContext || window.webkitAudioContext)();
      if (ac.state === 'suspended') ac.resume();
      if (!pi.gain) { pi.gain = ac.createGain(); pi.gain.connect(ac.destination); }
      pi.gain.gain.value = 0.5 * volMul(vol.sfx);
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
  function piNextNote(prev) {
    var i = prev == null ? Math.floor(Math.random() * 5) : PI_SCALE.indexOf(prev), j;
    do { j = i + Math.floor(Math.random() * 7) - 3; } while (j < 0 || j >= PI_SCALE.length || (j === i && Math.random() < 0.7));
    return PI_SCALE[j];
  }
  function piStatus() {
    var P = S.piano, ready = P.cd <= 0, r = G.pianoReward(Math.max(3, pi.len || 3));
    var info = 'Record : ' + P.best + ' note' + (P.best > 1 ? 's' : '') + ' · ' + (ready ? 'inspiration disponible' : 'prochaine inspiration dans ' + clock(P.cd));
    if (pi.mode === 'free') {
      setText($('piText'), 'Joue librement : chaque touche sonne comme un vrai piano. Idéal pour trouver une idée de mélodie.');
      setText($('piState'), 'Jeu libre'); setText($('piInfo'), '');
      $('piStart').hidden = true; return;
    }
    $('piStart').hidden = pi.state === 'listen' || pi.state === 'input';
    setText($('piText'), 'Écoute la mélodie, puis rejoue-la note par note. À chaque réussite, elle s’allonge d’une note. Plus tu vas loin, plus ton inspiration dope les gains du studio' + (ready ? '.' : ' (une fois toutes les ' + Math.round(D.TUNING.pianoEvery / 60) + ' minutes ; tu peux t’entraîner en attendant).'));
    setText($('piInfo'), info);
    var st = pi.state;
    setText($('piState'), st === 'listen' ? 'Écoute… (' + pi.mel.length + ' notes)' : st === 'input' ? 'À toi ! ' + pi.pos + ' / ' + pi.mel.length : st === 'over' ? pi.result : 'Prêt ?');
    setText($('piStartT'), st === 'over' ? 'Rejouer' : 'Écouter la mélodie');
    setText($('piStartS'), ready ? 'Inspiration en jeu' : 'Entraînement');
  }
  function piPlayMel() {
    piClear(); pi.state = 'listen'; pi.pos = 0; piStatus();
    var gap = Math.max(0.32, 0.55 - pi.mel.length * 0.015), now = ac && piAudio() ? ac.currentTime : 0;
    pi.mel.forEach(function (n, i) {
      if (now) piSound(n, now + 0.35 + i * gap);
      pi.timers.push(setTimeout(function () { piFlash(n, 'cue', gap * 900); }, (0.35 + i * gap) * 1000));
    });
    pi.timers.push(setTimeout(function () { pi.state = 'input'; piStatus(); }, (0.35 + pi.mel.length * gap) * 1000));
  }
  function piStart() {
    if (pi.mode !== 'ear') return;
    pi.mel = []; for (var i = 0; i < 3; i++) pi.mel.push(piNextNote(pi.mel[i - 1]));
    pi.len = 0; pi.result = '';
    piPlayMel();
  }
  function piEnd() {
    pi.state = 'over';
    var res = G.finishPiano(S, pi.len);
    if (res && res.reward) {
      pi.result = pi.len + ' note' + (pi.len > 1 ? 's' : '') + ' : inspiration !';
      toast('Inspiration : gains ×' + nf1.format(res.reward.m) + ' pendant ' + dur(res.reward.s) + '.', 5000); blip(12);
    } else pi.result = pi.len >= 3 ? pi.len + ' notes rejouées. Bel entraînement !' : 'Raté ! Écoute bien et retente ta chance.';
    saveLocal(); markCloud(); piStatus(); render();
  }
  function piPress(n) {
    if (!pi.open) return;
    piSound(n);
    if (pi.mode === 'free' || pi.state !== 'input') { piFlash(n, 'on', 220); return; }
    if (n === pi.mel[pi.pos]) {
      piFlash(n, 'on', 220); pi.pos++;
      if (pi.pos >= pi.mel.length) {
        pi.len = pi.mel.length; pi.state = 'listen'; piStatus();
        pi.mel.push(piNextNote(pi.mel[pi.mel.length - 1]));
        pi.timers.push(setTimeout(piPlayMel, 700));
      } else piStatus();
    } else {
      piFlash(n, 'bad', 500); piFlash(pi.mel[pi.pos], 'cue', 700);
      piEnd();
    }
  }
  function openPiano() {
    if (pi.open || !G.pianoOpen(S)) return;
    if (!pi.built) piBuild();
    pi.open = true; pi.opener = document.activeElement; pi.state = 'idle';
    $('piTitle').textContent = S.owned.orchestre ? 'Au piano à queue' : 'Au clavier maître';
    var snd = S.sound && vol.sfx > 0;
    $('piSoundOn').hidden = snd;
    setText($('piTip'), (snd ? '' : 'Le son est coupé : les touches s’allument quand même, mais c’est bien plus facile à l’oreille. ') + 'Sur ordinateur, joue avec les touches de ton clavier indiquées sur le piano.');
    piStatus();
    $('pianoScrim').hidden = false; $('app').inert = true; $('tabs').inert = true;
    (pi.mode === 'ear' ? $('piStart') : pi.keys[PI_LOW]).focus();
  }
  function closePiano() {
    if (!pi.open) return;
    if (pi.state === 'listen' || pi.state === 'input') { if (pi.len >= 3) piEnd(); }
    pi.open = false; pi.state = 'idle'; piClear();
    $('pianoScrim').hidden = true; $('app').inert = false; $('tabs').inert = false;
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
      if (pi.state === 'listen' || pi.state === 'input') { if (pi.len >= 3) piEnd(); }
      pi.mode = b.getAttribute('data-pm'); pi.state = 'idle'; piClear();
      $('pianoScrim').querySelectorAll('[data-pm]').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      piStatus();
    });
    $('piSoundOn').addEventListener('click', function () {
      S.sound = true; if (vol.sfx <= 0) { vol.sfx = VDEF; saveVol(); }
      markCloud(); saveLocal(); $('piSoundOn').hidden = true;
      if (bind.syncSound) bind.syncSound(); if (bind.syncVol) bind.syncVol();
      piSound(72); setText($('piTip'), 'Sur ordinateur, joue avec les touches de ton clavier indiquées sur le piano.');
    });
    document.addEventListener('keydown', function (e) {
      if (!pi.open) return;
      if (e.key === 'Escape') { e.preventDefault(); closePiano(); return; }
      var n = PI_CODES[e.code];
      if (n !== undefined && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); piPress(n); }
    });
    setInterval(function () { if (pi.open && pi.state !== 'listen') piStatus(); }, 1000);
  }

  // ---------- Icônes dans la scène 3D ----------
  var HOT_DRUM = '<svg viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="9" rx="8" ry="3.2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M4 9v6c0 1.8 3.6 3.2 8 3.2s8-1.4 8-3.2V9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M15 2l-4 6M20 3l-6 5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  var HOT_DECO = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h12v5H4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M16 6.5h3v5.5h-8v3" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><rect x="9" y="15" width="4" height="6" rx="1" fill="currentColor"/></svg>';
  var HOT_PIANO = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="5" width="19" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 5v14M12 5v14M16 5v14" stroke="currentColor" stroke-width="1.6"/><rect x="6.6" y="5" width="2.8" height="8" fill="currentColor"/><rect x="14.6" y="5" width="2.8" height="8" fill="currentColor"/></svg>';
  function hotspots() {
    var list = [];
    if (G.battleOpen(S)) {
      var R = S.battle.rival;
      list.push({ id: 'clash', anchor: 'drums', hot: !!R,
        label: R ? 'Clash de beatmakers : ' + R.name + ' te défie' : 'Clash de beatmakers : prochain défi dans ' + clock(S.battle.cd),
        html: HOT_DRUM + '<span>Clash</span>' + (R ? '<i class="bang" aria-hidden="true">!</i>' : '<small>' + clock(S.battle.cd) + '</small>') });
    }
    var dn = G.decoNew(S).length;
    list.push({ id: 'deco', anchor: 'shelf', hot: dn > 0, label: 'Décoration du studio' + (dn ? ' : ' + dn + ' nouveauté' + (dn > 1 ? 's' : '') : ''),
      html: HOT_DECO + '<span>Déco</span>' + (dn ? '<i class="bang" aria-hidden="true">' + dn + '</i>' : '') });
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
  }

  // ---------- Clash de beatmakers ----------
  var LANE_COL = ['#ff7a2f', '#3d7be0', '#24a066', '#7a5cd6'], LANE_KEYS = { d: 0, f: 1, j: 2, k: 3 };
  var cl = { open: false, playing: false, done: false, cfg: null, notes: [], t0: 0, raf: 0, score: 0, combo: 0, best: 0, opener: null, gain: null, flash: [0, 0, 0, 0], judge: [null, null, null, null], end: 0, lead: 0, step: 0, key: '', wasOpen: null, ctx: null, W: 0, H: 0, dpr: 1 };
  function clNow() { return performance.now() / 1000; }
  function renderClash(force) {
    var open = G.battleOpen(S), B = S.battle, onProd = $('app').getAttribute('data-view') === 'prod';
    if (cl.wasOpen === false && open && !quiet) toast('Nouveau : les clashs de beatmakers. Des rivaux vont te défier depuis Productions.', 6500);
    cl.wasOpen = open;
    setHidden($('clashBox'), !open);
    if (!open) return;
    var L = D.BATTLE.leagues[B.league - 1], R = B.rival;
    setText($('clashChip'), 'Ligue ' + L.name);
    var key = (R ? 'r' + R.name + R.target : 'w') + '|' + B.league + '|' + B.pts + '|' + B.wins + '|' + B.losses;
    if (key !== cl.key || force) {
      cl.key = key;
      var up = B.league < D.BATTLE.leagues.length;
      var bar = '<span class="league-bar" aria-hidden="true">' + D.BATTLE.leagues.map(function (x, i) { return '<i class="' + (i < B.league ? 'on' : '') + '"></i>'; }).join('') + '</span>';
      var prog = up ? B.pts + ' / ' + D.TUNING.battleUp + ' victoires pour monter en ligue ' + D.BATTLE.leagues[B.league].name + '.' : 'Tu es au sommet : ligue Légende.';
      $('clashBody').innerHTML = R
        ? '<article class="card clash-card hot"><span class="who-r"></span><p class="proj-meta">Score à battre : <b>' + Math.round(R.target * 100) + ' %</b> · ' + Math.round(L.bpm * (R.rule === 'rapide' ? 1.1 : 1)) + ' BPM · ' + prog + '</p>' + (R.rule ? '<p class="proj-meta"><span class="vogue">' + esc(RULE_TXT[R.rule][0]) + '</span> ' + esc(RULE_TXT[R.rule][1]) + '</p>' : '') + bar +
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
    if (!S.sound || vol.sfx <= 0) return false;
    try {
      ac = ac || new (window.AudioContext || window.webkitAudioContext)();
      if (ac.state === 'suspended') ac.resume();
      cl.gain = ac.createGain(); cl.gain.gain.value = 0.55 * volMul(vol.sfx); cl.gain.connect(ac.destination);
      return true;
    } catch (e) { cl.gain = null; return false; }
  }
  function clAudioOff() { if (cl.gain) { try { cl.gain.gain.cancelScheduledValues(0); cl.gain.disconnect(); } catch (e) { /* déjà coupé */ } cl.gain = null; } }
  function openClash() {
    var cfg = G.startBattle(S);
    if (!cfg || cl.open) return;
    cl.open = true; cl.playing = false; cl.done = false; cl.cfg = cfg; cl.opener = document.activeElement;
    setText($('clLeague'), 'Ligue ' + cfg.leagueName);
    $('clTitle').textContent = cfg.rival.name + ' te défie';
    setText($('clGoSub'), Math.round(cfg.rival.target * 100) + ' % à battre · ' + cfg.bpm + ' BPM' + (cfg.rule ? ' · ' + RULE_TXT[cfg.rule][0] : ''));
    var snd = S.sound && vol.sfx > 0;
    setText($('clTip'), snd ? 'Le son est activé : chaque frappe joue ton beat par-dessus la ligne de basse du rival.' : 'Le son est coupé : tu peux jouer quand même, mais le clash est bien plus amusant en musique.');
    $('clSoundOn').hidden = snd;
    $('clIntro').hidden = false; $('clPlay').hidden = true; $('clDone').hidden = true;
    $('clashScrim').hidden = false; $('app').inert = true; $('tabs').inert = true;
    $('clGo').focus();
  }
  function closeClash() {
    if (!cl.open) return;
    if (cl.playing) return; // pendant la partie, il faut abandonner explicitement
    cl.open = false; cancelAnimationFrame(cl.raf); clAudioOff();
    $('clashScrim').hidden = true; $('app').inert = false; $('tabs').inert = false;
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
      }
    }
    cl.playing = true; cl.done = false;
    $('clPads').querySelector('.clpad').focus();
    cancelAnimationFrame(cl.raf); cl.raf = requestAnimationFrame(clLoop);
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
    // progression
    c.fillStyle = 'rgba(255,255,255,0.15)'; c.fillRect(0, 0, W, 4);
    c.fillStyle = '#ff7a2f'; c.fillRect(0, 0, W * Math.max(0, Math.min(1, now / cl.end)), 4);
  }
  function finishClash(quit) {
    if (!cl.playing) return;
    cl.playing = false; cancelAnimationFrame(cl.raf);
    if (quit) clAudioOff(); else setTimeout(clAudioOff, 1200);
    var score = cl.notes.length ? cl.pts / cl.notes.length : 0;
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
  function bindClash() {
    $('clashBody').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-cl]'); if (!b) return;
      if (b.getAttribute('data-cl') === 'go') openClash();
      else { G.declineBattle(S); saveLocal(); toast('Défi décliné. Un autre rival se présentera bientôt.'); cl.key = ''; render(); }
    });
    $('clGo').addEventListener('click', startClash);
    $('clLater').addEventListener('click', closeClash);
    $('clClose').addEventListener('click', closeClash);
    $('clQuit').addEventListener('click', function () { finishClash(true); });
    $('clSoundOn').addEventListener('click', function () {
      S.sound = true; if (vol.sfx <= 0) { vol.sfx = VDEF; saveVol(); }
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
      if (cl.playing && k !== undefined) { e.preventDefault(); if (!e.repeat) { clHit(k); var pd = $('clPads').children[k]; pd.classList.add('down'); setTimeout(function () { pd.classList.remove('down'); }, 90); } return; }
      if (e.key === 'Escape' && !cl.playing) { e.preventDefault(); closeClash(); }
    });
    window.addEventListener('resize', function () { if (cl.playing) clSize(); });
    document.addEventListener('visibilitychange', function () { if (document.hidden && cl.playing) finishClash(true); });
  }

  // ---------- Projets de création (bonus) ----------
  var pjv = { key: '', t: 0, wasOpen: null, open: false, opener: null, cfg: { genre: 'rap', mood: null, pub: null, fmt: 'single', sl: [50, 50, 50], team: [null, null, null] }, confirm: false };
  var GRADE = { top: 'idéal', ok: 'neutre', bad: 'à éviter' };
  function pjGenreName(id) { return G.PJ_G[id] ? G.PJ_G[id].name : id; }
  function pjMeta(c) { return G.PJ_F[c.fmt].name + ' · ' + pjGenreName(c.genre) + ' · ' + G.PJ_M[c.mood].name + ' · ' + G.PJ_P[c.pub].name; }
  function pjNote(n) { return nf1.format(n) + '/10'; }
  function pjWeek(m) { return m.pj && m.pj.w < D.PROJECTS.sales.length ? m.pj.sales * D.PROJECTS.sales[m.pj.w] : 0; }
  function renderProj(force) {
    var open = G.projOpen(S), P = S.proj, c = P.cur, onProd = $('app').getAttribute('data-view') === 'prod';
    if (pjv.wasOpen === false && open && !quiet) toast('Nouveau : les projets de création. Un bonus facultatif à lancer depuis Productions.', 6500);
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
          (L.tg || L.tm ? '<li class="top">Dans l’air du temps : ' + (L.tg && L.tm ? 'genre et ambiance à la mode' : L.tg ? 'genre à la mode, ventes boostées' : 'ambiance à la mode') + '.</li>' : '') +
          (L.fresh < 0 ? '<li class="bad">' + (L.fresh <= -1.5 ? 'Déjà entendu : le public se lasse de cette association.' : 'Encore ce genre : un peu de lassitude.') + '</li>' : '') +
          '</ul><p class="proj-meta">' + (L.pos ? 'Entré au Top 50 à la place ' + L.pos + '. Ventes attendues : ' + eur(L.sales) + ' sur ' + D.PROJECTS.sales.length + ' semaines s’il reste classé (budget ' + eur(L.cost) + ').' : 'Pas assez fort pour entrer au Top 50 : aucune vente.') + '</p>' +
          '<button class="btn sm" type="button" data-pj="dismiss">Ranger le compte rendu</button></article>';
      }
      if (c) {
        h += '<article class="card proj-card"><h4>' + esc(c.title) + '</h4><p class="proj-meta">' + esc(pjMeta(c)) + '</p><div class="proj-phases">' +
          D.PROJECTS.phases.map(function (ph, i) {
            var m = c.team[i] ? G.findMember(S, c.team[i]) : null;
            return '<div class="proj-ph' + (i < c.phase ? ' done' : i === c.phase ? ' now' : '') + '"><span>' + esc(ph.name) + '</span><span class="meter"><i data-pjm="' + i + '"></i></span><span>' + (m ? esc(m.name) : 'Personne') + '</span></div>';
          }).join('') + '</div><p class="proj-meta" id="pjLeft"></p>' +
          (pjv.confirm ? '<div class="confirm"><span>Abandonner « ' + esc(c.title) + ' » ? La moitié du budget est remboursée.</span><div class="row"><button class="btn sm danger" type="button" data-pj="cancelGo">Abandonner</button><button class="btn sm" type="button" data-pj="cancelNo">Continuer</button></div></div>'
            : '<div class="proj-row"><button class="btn sm" type="button" data-pj="cancel">Abandonner le projet</button></div>') + '</article>';
      } else {
        h += '<article class="card proj-card"><p class="proj-meta" style="font-weight:600">Choisis un genre, une ambiance, un public et règle chaque phase. Tes productions continuent pendant ce temps : c’est un bonus, pas une obligation.</p>' +
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
    if (!G.genreOpen(S, cf.genre)) cf.genre = 'rap';
    if (!G.formatOpen(S, cf.fmt)) cf.fmt = 'single';
    $('pjFmt').innerHTML = PR.formats.map(function (f) { var ok = G.formatOpen(S, f.id); return pickBtn('fmt', f.id, f.name, cf.fmt === f.id, !ok, ok ? (f.cost > 1 ? '×' + nf1.format(f.cost) + ' budget' : '') : 'dès ' + D.TIERS[f.tier].name.toLowerCase()); }).join('');
    var trd = G.trendFor(S);
    $('pjGenre').innerHTML = PR.genres.map(function (g) { var ok = G.genreOpen(S, g.id); return pickBtn('genre', g.id, g.name, cf.genre === g.id, !ok, ok ? '' : 'recherche ' + G.RD_BY[g.rd].name); }).join('');
    $('pjMood').innerHTML = PR.moods.map(function (m) { return pickBtn('mood', m.id, m.name, cf.mood === m.id, false, '', pjGrade('m', cf.genre, m.id)); }).join('');
    $('pjPub').innerHTML = PR.pubs.map(function (p) { return pickBtn('pub', p.id, p.name, cf.pub === p.id, false, '', pjGrade('p', cf.genre, p.id)); }).join('');
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
  function openProj() {
    if (pjv.open || !G.projOpen(S) || S.proj.cur) return;
    pjv.open = true; pjv.opener = document.activeElement;
    var cf = pjv.cfg;
    cf.team = cf.team.map(function (id) { return id && G.findMember(S, id) ? id : null; });
    $('pjName').value = ''; $('pjName').placeholder = suggestTitle();
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
      var c = G.startProject(S, { genre: cf.genre, mood: cf.mood, pub: cf.pub, fmt: cf.fmt, sl: cf.sl.slice(), team: cf.team.slice(), title: $('pjName').value.trim() || $('pjName').placeholder });
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
        sec.innerHTML = '<h3><i aria-hidden="true"></i></h3><p></p><div class="rd-chain"></div>';
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
        return '<li class="mine' + (m.pos === 1 ? ' top1' : '') + '"><span class="pos">' + m.pos + '</span>' + moveHtml({ prev: m.p, pos: m.pos }) + '<span class="tt"><b>' + esc(m.t) + '</b><span>' + (m.pj ? '<span class="pjt">' + esc(G.PJ_F[m.pj.f].name + ' ' + pjGenreName(m.pj.g)) + '</span> · ' + pjNote(m.pj.avg) : esc(G.ACT_BY[m.act].name) + ' · ' + starsTxt(m.q)) + ' · ' + m.weeks + ' sem.' + (m.best ? ' · record ' + m.best : '') + '</span></span><span class="gain">+' + eur(G.chartPay(S, m.pos) + pjWeek(m)) + '/sem.</span></li>';
      }).join('');
    }
    var now = performance.now();
    if (now - chs.listT > 2000 || force) {
      chs.listT = now;
      $('chartList').innerHTML = G.chartTop(S).map(function (e) {
        return '<li class="' + (e.mine ? 'mine' : '') + (e.pos === 1 ? ' top1' : '') + '"><span class="pos">' + e.pos + '</span>' + moveHtml(e) + '<span class="tt"><b>' + esc(e.t) + '</b><span>' + (e.mine ? (e.pj ? 'Ton projet · <span class="pjt">' + esc(pjGenreName(e.pj.g)) + '</span> · ' + pjNote(e.pj.avg) : 'Ta prod · ' + esc(G.ACT_BY[e.act].name) + ' · ' + starsTxt(e.q)) : esc(e.a)) + '</span></span><span class="gain">' + (e.mine ? '+' + eur(G.chartPay(S, e.pos) + pjWeek(e)) : '') + '</span></li>';
      }).join('');
    }
  }

  function bindFeatures() {
    bindProj();
    bindClash();
    bindPiano();
    bindDeco();
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
        '<div class="strip-head"><span class="led" aria-hidden="true"></span><h3>' + act.name + '</h3><span class="who" data-k="who" hidden><i></i><span></span></span><span class="rank" data-k="rank"></span></div>' +
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
      var nm = G.nextMilestone(a.lvl), to = a.lvl + plan.n, pal = 0;
      for (var lv = a.lvl + 1; lv <= to; lv++) if (G.milestoneMult(lv) !== G.milestoneMult(lv - 1)) pal++;
      setText(r.upT, buyN === 1 ? 'Perfectionner' : buyN === 'max' ? (plan.ok ? 'Perfectionner ×' + plan.n : 'Perfectionner · max') : 'Perfectionner ×' + buyN);
      setText(r.upS, (plan.n > 1 ? 'Rang ' + a.lvl + ' → ' + to : 'Rang ' + to) + (pal ? ' · ' + (pal > 1 ? pal + ' paliers ×2 franchis' : 'palier ×2 franchi') : nm ? ' · palier ×2 au rang ' + nm : ''));
      setText(r.upP, eur(cost));
      setDisabled(r.up, !plan.ok);
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
    renderRd();
    renderProj();
    renderClash();
    renderTrends();
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
      staff: S.team.staff.map(function (m) { return { id: m.id, look: m.look, role: m.role, morale: m.morale, act: m.act, status: memberStatus(m) }; })
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
    closeMix(); closeProj(); cl.playing = false; closeClash(); closePiano(); closeDeco(); trv.key = ''; cl.key = ''; cl.wasOpen = null; pjv.key = ''; pjv.wasOpen = null; pjv.confirm = false; ord.key = ''; ord.wasOpen = null; chs.key = ''; chs.wasOpen = null; rdv.key = '';
    buildActs(); buildShop(); renderTrophies(true); render(); renderScene(true);
    if (bind.syncSound) bind.syncSound();
    saveLocal(); markCloud();
    if (force) saveCloud(true);
    if (off) { off.trophies = G.trophyCount(S) - tc0; showOffline(off); }
  }
  function showOffline(off) {
    toast('Pendant ton absence (' + away(off.gap) + ') : +' + eur(off.gain) + (off.wages > 1e-9 ? ' après ' + eur(off.wages) + ' de salaires' : '') + (off.levels > 0 ? ', ' + off.levels + ' niveau' + (off.levels > 1 ? 'x' : '') + ' d’expertise' : '') + (off.trophies > 0 ? ', ' + off.trophies + (off.trophies > 1 ? ' niveaux de palmarès' : ' niveau de palmarès') : '') + '.', 7000);
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
      if (v === 'team') { team.key = ''; renderTeam(true); }
      if (v === 'charts') { chs.key = ''; chs.listT = 0; renderCharts(true); }
      if (v === 'rd') { rdv.key = ''; renderRd(true); }
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
    }
    bind.syncVol = syncVol;
    var sfxT = 0;
    $('volSfx').addEventListener('input', function () {
      vol.sfx = +this.value; syncVol(); saveVol();
      clearTimeout(sfxT); sfxT = setTimeout(function () { lastBlip = 0; blip(2, true); }, 120); // aperçu du niveau
    });
    $('volReset').addEventListener('click', function () {
      vol.sfx = VDEF; syncVol(); saveVol();
    });
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
  G.hooks.trend = function (tr) {
    trv.key = ''; markCloud();
    if (quiet) return;
    toast('Nouvelles tendances : ' + G.ACT_BY[tr.act].name.toLowerCase() + ' en vogue, le public veut du ' + G.PJ_G[tr.g].name + '. Détails dans le Top 50.', 6500);
  };
  G.hooks.battleNew = function (r) { cl.key = ''; markCloud(); if (!quiet) { toast(r.name + ' te défie en clash de beatmakers ! Rendez-vous dans Productions.', 6000); blip(10); } };
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
    var k = Math.round(Math.log2(G.milestoneMult(lvl) / G.milestoneMult(from)));
    if (k === 1) toast('Palier atteint : les gains de « ' + act.name + ' » sont doublés.');
    else if (k > 1) toast(k + ' paliers atteints : les gains de « ' + act.name + ' » sont multipliés par ' + Math.pow(2, k) + '.');
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
