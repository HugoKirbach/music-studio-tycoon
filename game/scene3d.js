/* Premier Mix 3D: la scène du studio en Three.js (pièce, équipements, équipe animée).
   API: Scene3D.init(host) · update(view) · pop(text, anchor) · setTheme(dark) · onPick(fn) · resize() */
(function (root) {
  'use strict';
  var THREE = root.THREE;
  var V3 = THREE ? THREE.Vector3 : null;
  var S3 = { ok: false };
  var R = null, scene, camera, host, canvas, overlay, world, roomG, itemsG, staffG, fxG, clock;
  var hemi, sun, fill;
  var dark = false, reduce = false, mobile = false;
  var cur = { place: null, tier: -1, key: '', def: null };
  var itemNodes = {}, staffNodes = {}, deskNodes = [], player = null, anims = [], blinkers = [], spinners = [];
  var view = null, pickFn = null;
  var cam = { yaw: 0.72, pitch: 0.62, zoom: 1, fit: 12, target: null, yawBase: 0.72 };
  var ins = { t: 0, b: 0 }; // zones de l'écran couvertes par l'interface (px), pour cadrer la pièce dans la partie visible

  // ---------- Outils de construction ----------
  var MATS = {}, GEOS = {};
  function M(color, o) {
    o = o || {};
    var k = color + '|' + (o.r != null ? o.r : 0.82) + '|' + (o.m || 0) + '|' + (o.e || '') + '|' + (o.ei || 0) + '|' + (o.op || 1);
    if (MATS[k]) return MATS[k];
    var p = { color: color, roughness: o.r != null ? o.r : 0.82, metalness: o.m || 0 };
    if (o.e) { p.emissive = o.e; p.emissiveIntensity = o.ei || 1; }
    if (o.op && o.op < 1) { p.transparent = true; p.opacity = o.op; p.depthWrite = false; }
    return (MATS[k] = new THREE.MeshStandardMaterial(p));
  }
  function G(kind, a, b, c) {
    var k = kind + a + ',' + b + ',' + c;
    if (GEOS[k]) return GEOS[k];
    var g;
    if (kind === 'box') g = new THREE.BoxGeometry(1, 1, 1);
    else if (kind === 'cyl') g = new THREE.CylinderGeometry(a, b, 1, c || 16);
    else if (kind === 'sph') g = new THREE.SphereGeometry(1, a || 16, b || 12);
    else if (kind === 'tor') g = new THREE.TorusGeometry(a, b, 8, c || 20, Math.PI);
    else if (kind === 'ring') g = new THREE.TorusGeometry(a, b, 8, c || 24);
    else if (kind === 'cap') g = new THREE.CapsuleGeometry(a, b, 4, 10);
    return (GEOS[k] = g);
  }
  function mesh(p, geo, mat, x, y, z, sx, sy, sz, shadow) {
    var m = new THREE.Mesh(geo, mat);
    m.position.set(x || 0, y || 0, z || 0);
    if (sx != null) m.scale.set(sx, sy, sz);
    m.castShadow = shadow !== false; m.receiveShadow = true;
    if (p) p.add(m);
    return m;
  }
  // Boîte posée: y = base
  function box(p, w, h, d, mat, x, y, z, ry) { var m = mesh(p, G('box'), mat, x, (y || 0) + h / 2, z, w, h, d); if (ry) m.rotation.y = ry; return m; }
  function cyl(p, r, h, mat, x, y, z, seg, r2) { return mesh(p, G('cyl', r2 != null ? r2 / r : 1, 1, seg || 16), mat, x, (y || 0) + h / 2, z, r, h, r); }
  function sph(p, r, mat, x, y, z, seg) { return mesh(p, G('sph', seg || 16, seg ? Math.max(6, seg - 4) : 12), mat, x, y, z, r, r, r); }
  function grp(p, x, y, z, ry) { var g = new THREE.Group(); g.position.set(x || 0, y || 0, z || 0); if (ry) g.rotation.y = ry; if (p) p.add(g); return g; }

  // Textures dessinées (écrans, sols, briques)
  var TEX = {};
  function canvasTex(key, w, h, draw, rep) {
    if (TEX[key]) return TEX[key];
    var c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    var t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]); }
    return (TEX[key] = t);
  }
  function texMat(key, w, h, draw, o) {
    var k = 'tm:' + key;
    if (MATS[k]) return MATS[k];
    var t = canvasTex(key, w, h, draw, o && o.rep);
    var p = { map: t, roughness: o && o.r != null ? o.r : 0.8, metalness: 0 };
    if (o && o.glow) { p.emissive = 0xffffff; p.emissiveMap = t; p.emissiveIntensity = o.glow; }
    return (MATS[k] = new THREE.MeshStandardMaterial(p));
  }
  function rnd(seed) { var s = seed || 1; return function () { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }
  function planks(ctx, w, h, base, alt) {
    var r = rnd(3); ctx.fillStyle = base; ctx.fillRect(0, 0, w, h);
    var rows = 8, ph = h / rows;
    for (var i = 0; i < rows; i++) {
      var off = r() * w;
      for (var x = -off; x < w; x += w * 0.55) {
        ctx.fillStyle = r() > 0.5 ? alt : base; ctx.globalAlpha = 0.35 + r() * 0.3;
        ctx.fillRect(x + 2, i * ph + 2, w * 0.55 - 4, ph - 4);
      }
      ctx.globalAlpha = 1; ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(0, i * ph, w, 2);
    }
  }
  function daw(ctx, w, h) {
    ctx.fillStyle = '#1d2230'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#2c3346'; ctx.fillRect(0, 0, w, 14);
    var cols = ['#ff8a3d', '#2bb3a3', '#f2c14e', '#8e6bd8', '#e2574c', '#4a9be0'], r = rnd(11);
    for (var t = 0; t < 7; t++) {
      var y = 20 + t * 15; ctx.fillStyle = '#262c3d'; ctx.fillRect(0, y, w, 13);
      ctx.fillStyle = cols[t % cols.length]; ctx.fillRect(2, y + 1, 18, 11);
      for (var x = 26; x < w - 10;) { var len = 12 + r() * 40; if (r() > 0.25) { ctx.globalAlpha = 0.85; ctx.fillRect(x, y + 2, len, 9); ctx.globalAlpha = 1; } x += len + 3 + r() * 8; }
    }
    ctx.fillStyle = '#fff'; ctx.fillRect(w * 0.42, 14, 2, h - 14);
  }
  function plug(ctx, w, h) {
    ctx.fillStyle = '#2a2433'; ctx.fillRect(0, 0, w, h);
    for (var i = 0; i < 4; i++) {
      var cx = 22 + i * ((w - 44) / 3), cy = h * 0.42;
      ctx.strokeStyle = '#4b4258'; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(cx, cy, 13, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = ['#ff8a3d', '#2bb3a3', '#f2c14e', '#e2574c'][i]; ctx.beginPath(); ctx.arc(cx, cy, 13, 2.4, 2.4 + 1 + i * 0.9); ctx.stroke();
    }
    ctx.strokeStyle = '#5be0c9'; ctx.lineWidth = 2; ctx.beginPath();
    for (var x = 0; x < w; x += 2) { var y = h * 0.82 - Math.sin(x / 9) * 8 * Math.sin(x / 50); if (x) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
    ctx.stroke();
  }
  function chart(ctx, w, h) {
    ctx.fillStyle = '#121826'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#1db954'; ctx.font = 'bold 16px sans-serif'; ctx.fillText('▶ STREAMS', 10, 22);
    var r = rnd(5);
    for (var i = 0; i < 12; i++) { var bh = 20 + i * 5 + r() * 18; ctx.fillStyle = i > 8 ? '#1db954' : '#2f6f4c'; ctx.fillRect(12 + i * ((w - 24) / 12), h - 10 - bh, (w - 24) / 12 - 4, bh); }
  }
  function onair(ctx, w, h) {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#ff4d6d'; ctx.lineWidth = 6; ctx.shadowColor = '#ff4d6d'; ctx.shadowBlur = 16;
    ctx.strokeRect(8, 8, w - 16, h - 16);
    ctx.fillStyle = '#ffd1dc'; ctx.font = 'bold ' + Math.floor(h * 0.5) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('ON AIR', w / 2, h / 2 + 2);
  }
  function keys(ctx, w, h) {
    ctx.fillStyle = '#f4f1ea'; ctx.fillRect(0, 0, w, h);
    var n = 29, kw = w / n;
    ctx.fillStyle = '#9a958c'; for (var i = 1; i < n; i++) ctx.fillRect(i * kw, 0, 1, h);
    ctx.fillStyle = '#1b1b1b'; var pat = [1, 1, 0, 1, 1, 1, 0];
    for (var j = 0; j < n - 1; j++) if (pat[j % 7]) ctx.fillRect((j + 1) * kw - kw * 0.3, 0, kw * 0.6, h * 0.6);
  }
  function bricks(ctx, w, h) {
    ctx.fillStyle = '#7d3f2d'; ctx.fillRect(0, 0, w, h);
    var r = rnd(9), bh = h / 16, bw = w / 6;
    for (var y = 0; y < 16; y++) for (var x = -1; x < 7; x++) {
      var ox = (y % 2) * bw / 2; ctx.fillStyle = 'hsl(' + (12 + r() * 10) + ',' + (40 + r() * 15) + '%,' + (34 + r() * 12) + '%)';
      ctx.fillRect(x * bw + ox + 2, y * bh + 2, bw - 4, bh - 4);
    }
  }
  function blocks(ctx, w, h) {
    ctx.fillStyle = '#b9b4aa'; ctx.fillRect(0, 0, w, h);
    var bh = h / 8, bw = w / 4, r = rnd(4);
    for (var y = 0; y < 8; y++) for (var x = -1; x < 5; x++) { var ox = (y % 2) * bw / 2; ctx.fillStyle = 'hsl(40,8%,' + (70 + r() * 8) + '%)'; ctx.fillRect(x * bw + ox + 2, y * bh + 2, bw - 4, bh - 4); }
  }
  function concrete(ctx, w, h) {
    ctx.fillStyle = '#8f918c'; ctx.fillRect(0, 0, w, h);
    var r = rnd(8);
    for (var i = 0; i < 900; i++) { ctx.fillStyle = 'rgba(' + (r() > 0.5 ? '255,255,255' : '0,0,0') + ',' + (0.03 + r() * 0.05) + ')'; ctx.fillRect(r() * w, r() * h, 2 + r() * 6, 2 + r() * 6); }
    ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(0, h / 2, w, 2); ctx.fillRect(w / 2, 0, 2, h);
  }
  function marble(ctx, w, h) {
    ctx.fillStyle = '#ece8e1'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(150,140,130,0.25)'; ctx.lineWidth = 1.5; var r = rnd(21);
    for (var i = 0; i < 14; i++) { ctx.beginPath(); var x = r() * w, y = r() * h; ctx.moveTo(x, y); for (var k = 0; k < 6; k++) { x += (r() - 0.3) * 40; y += (r() - 0.5) * 40; ctx.lineTo(x, y); } ctx.stroke(); }
    ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(0, 0, w, 2); ctx.fillRect(0, 0, 2, h);
  }
  function slats(ctx, w, h) {
    ctx.fillStyle = '#2d3340'; ctx.fillRect(0, 0, w, h);
    for (var x = 0; x < w; x += 16) { ctx.fillStyle = '#7a5537'; ctx.fillRect(x + 3, 0, 9, h); ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(x + 11, 0, 2, h); }
  }
  function poster(seed, a, b) {
    return function (ctx, w, h) {
      var g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, a); g.addColorStop(1, b); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      var r = rnd(seed); ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath(); ctx.arc(w / 2, h * 0.42, w * 0.26, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = b; ctx.beginPath(); ctx.arc(w / 2, h * 0.42, w * 0.08, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.9)'; for (var i = 0; i < 3; i++) ctx.fillRect(w * 0.18, h * (0.75 + i * 0.06), w * (0.4 + r() * 0.4), h * 0.025);
    };
  }

  // ---------- Couleurs ----------
  var C = { wood: 0xb5835a, woodD: 0x6e4a32, white: 0xf3f0ea, black: 0x26282c, plastic: 0x34373d, metal: 0xa7afb6, orange: 0xff8a3d, teal: 0x2bb3a3,
    red: 0xe2574c, yellow: 0xf2c14e, blue: 0x4a7bd0, purple: 0x8e6bd8, green: 0x5aa469, gold: 0xe0b440, cream: 0xefe6d4 };
  var SKIN = [0xf1c7a5, 0xe0ac85, 0xc98c63, 0xa8714a, 0x8a5a3b, 0x6b4430, 0xf5d6bd, 0xb9805a];
  var HAIR = [0x2b1d14, 0x4a2f1b, 0x7b4a26, 0xc79a5b, 0xe3c16f, 0x161616, 0xa03a2a, 0x8a8a8a];
  var SHIRT = [0xff8a3d, 0x2bb3a3, 0xf2c14e, 0x8e6bd8, 0xe2574c, 0x4a7bd0, 0x5aa469, 0xf06292, 0x37474f, 0xffffff, 0x26a69a, 0xab47bc, 0xffa726, 0x5c6bc0, 0x8d6e63, 0x29b6f6];

  // ---------- Personnages ----------
  // pose: 'sit' (assis face à -z) ou 'stand'. Renvoie un objet animable.
  function person(look, pose, opts) {
    opts = opts || {};
    var g = grp(null), skin = M(SKIN[look.s % 8]), hair = M(HAIR[look.h % 8]), shirt = M(SHIRT[look.c % 16]), pants = M(opts.pants || 0x3b4a63);
    var sit = pose === 'sit', hip = sit ? 0.47 : 0.86;
    if (sit) {
      box(g, 0.15, 0.13, 0.42, pants, -0.1, hip - 0.06, -0.2); box(g, 0.15, 0.13, 0.42, pants, 0.1, hip - 0.06, -0.2);
      box(g, 0.12, hip - 0.06, 0.13, pants, -0.1, 0, -0.38); box(g, 0.12, hip - 0.06, 0.13, pants, 0.1, 0, -0.38);
      box(g, 0.13, 0.07, 0.2, M(0x222222), -0.1, 0, -0.44); box(g, 0.13, 0.07, 0.2, M(0x222222), 0.1, 0, -0.44);
    } else {
      box(g, 0.14, hip, 0.15, pants, -0.09, 0, 0); box(g, 0.14, hip, 0.15, pants, 0.09, 0, 0);
      box(g, 0.14, 0.07, 0.22, M(0x222222), -0.09, 0, -0.03); box(g, 0.14, 0.07, 0.22, M(0x222222), 0.09, 0, -0.03);
    }
    var body = grp(g, 0, hip, 0);
    var torso = mesh(body, G('cap', 0.19, 0.3), shirt, 0, 0.3, 0, 1, 1, 0.78);
    var head = grp(body, 0, 0.7, 0);
    sph(head, 0.15, skin, 0, 0.0, 0);
    var face = 0;
    box(head, 0.03, 0.03, 0.02, M(0x1b1b1b), -0.05, 0.01, -0.145); box(head, 0.03, 0.03, 0.02, M(0x1b1b1b), 0.05, 0.01, -0.145);
    var hs = look.y % 4;
    if (hs === 0) { var hc = sph(head, 0.158, hair, 0, 0.035, 0.015); hc.scale.set(0.158, 0.13, 0.158); }
    else if (hs === 1) { var hl = sph(head, 0.16, hair, 0, 0.02, 0.03); hl.scale.set(0.17, 0.16, 0.17); box(head, 0.32, 0.26, 0.1, hair, 0, -0.22, 0.09); }
    else if (hs === 2) { var hb = sph(head, 0.158, hair, 0, 0.035, 0.015); hb.scale.set(0.16, 0.13, 0.16); sph(head, 0.075, hair, 0, 0.13, 0.11); }
    else { var cap = sph(head, 0.16, M(SHIRT[(look.c + 5) % 16]), 0, 0.05, 0.01); cap.scale.set(0.162, 0.11, 0.162); box(head, 0.2, 0.025, 0.13, M(SHIRT[(look.c + 5) % 16]), 0, 0.03, -0.18); }
    if (opts.headphones) { mesh(head, G('tor', 0.16, 0.018, 16), M(C.black), 0, 0.02, 0, 1, 1, 1).rotation.z = 0; cyl(head, 0.055, 0.05, M(C.black), -0.165, -0.04, 0).rotation.z = Math.PI / 2; cyl(head, 0.055, 0.05, M(C.black), 0.165, -0.04, 0).rotation.z = Math.PI / 2; }
    // bras: pivot à l'épaule
    function arm(side) {
      var a = grp(body, side * 0.22, 0.5, 0);
      mesh(a, G('cap', 0.055, 0.26), shirt, 0, -0.16, 0, 1, 1, 1);
      sph(a, 0.05, skin, 0, -0.33, 0);
      a.rotation.x = sit ? 1.05 : 0.05; // positif: le bras part vers l'avant (le personnage regarde vers -z) a.rotation.z = side * (sit ? -0.05 : 0.08);
      return a;
    }
    var armL = arm(-1), armR = arm(1);
    g.userData.p = { body: body, head: head, armL: armL, armR: armR, sit: sit, t: Math.random() * 10 };
    return g;
  }
  function chair(p, x, z, ry, col) {
    var g = grp(p, x, 0, z, ry || 0), m = M(col || C.plastic);
    cyl(g, 0.03, 0.4, M(C.metal), 0, 0.02, 0);
    for (var i = 0; i < 5; i++) { var a = i / 5 * Math.PI * 2; box(g, 0.05, 0.04, 0.3, M(C.metal), Math.sin(a) * 0.15, 0, Math.cos(a) * 0.15, a); }
    box(g, 0.5, 0.08, 0.48, m, 0, 0.42, 0);
    box(g, 0.48, 0.55, 0.07, m, 0, 0.52, 0.24);
    return g;
  }

  // ---------- Équipements ----------
  // Chaque modèle est construit autour de son origine, face avant vers +z.
  var MODELS = {
    laptop: function (p) {
      box(p, 0.34, 0.02, 0.24, M(0xc9ccd1, { m: 0.4, r: 0.4 }), 0, 0, 0);
      var s = grp(p, 0, 0.02, -0.115); s.rotation.x = -0.28;
      box(s, 0.34, 0.23, 0.012, M(0xc9ccd1, { m: 0.4, r: 0.4 }), 0, 0, 0);
      box(s, 0.31, 0.2, 0.004, texMat('daw', 256, 128, daw, { glow: 0.65 }), 0, 0.015, 0.008);
    },
    daw: function (p) {
      cyl(p, 0.09, 0.015, M(C.black), 0, 0, -0.05); box(p, 0.04, 0.22, 0.03, M(C.black), 0, 0, -0.08);
      box(p, 0.66, 0.38, 0.035, M(C.black), 0, 0.2, -0.06);
      box(p, 0.62, 0.34, 0.005, texMat('daw', 256, 128, daw, { glow: 0.7 }), 0, 0.22, -0.04);
    },
    plugins: function (p) {
      cyl(p, 0.08, 0.015, M(C.black), 0, 0, -0.05); box(p, 0.035, 0.2, 0.03, M(C.black), 0, 0, -0.08);
      box(p, 0.5, 0.31, 0.03, M(C.black), 0, 0.18, -0.06);
      box(p, 0.46, 0.27, 0.005, texMat('plug', 256, 150, plug, { glow: 0.7 }), 0, 0.2, -0.042);
    },
    clavier: function (p) {
      box(p, 0.78, 0.055, 0.24, M(0x2f3136), 0, 0, 0);
      box(p, 0.7, 0.012, 0.15, texMat('keys', 256, 64, keys), 0.03, 0.055, 0.04);
      for (var i = 0; i < 4; i++) cyl(p, 0.014, 0.02, M(C.orange), -0.33 + i * 0.03, 0.055, -0.07, 10);
    },
    interface: function (p) {
      box(p, 0.24, 0.07, 0.16, M(C.red, { r: 0.5 }), 0, 0, 0);
      for (var i = 0; i < 3; i++) cyl(p, 0.022, 0.025, M(C.black), -0.07 + i * 0.07, 0.07, 0.01, 12);
      box(p, 0.05, 0.012, 0.01, M(0x5be07a, { e: 0x5be07a, ei: 1.4 }), 0.08, 0.072, -0.06);
    },
    samples: function (p) {
      box(p, 0.26, 0.04, 0.26, M(0x2a2c31), 0, 0, 0);
      var cols = [C.orange, C.teal, C.purple, C.yellow];
      for (var i = 0; i < 16; i++) { var x = (i % 4) - 1.5, z = Math.floor(i / 4) - 1.5; var m = box(p, 0.045, 0.012, 0.045, M(cols[(i + Math.floor(i / 4)) % 4], { e: cols[(i + Math.floor(i / 4)) % 4], ei: 0.5 }), x * 0.058, 0.04, z * 0.058); if (i % 5 === 0) blinkers.push({ m: m, ph: i }); }
    },
    casque: function (p) {
      var g = grp(p, 0, 0.07, 0); g.rotation.x = -Math.PI / 2;
      mesh(g, G('tor', 0.11, 0.015, 16), M(C.black), 0, 0, 0);
      cyl(g, 0.05, 0.05, M(0x444444), -0.11, -0.02, 0).rotation.z = Math.PI / 2;
      cyl(g, 0.05, 0.05, M(0x444444), 0.11, -0.02, 0).rotation.z = Math.PI / 2;
    },
    mastering: function (p) {
      for (var i = 0; i < 3; i++) {
        box(p, 0.34, 0.075, 0.22, M(i === 1 ? 0xb8bcc2 : 0x2b2e33, { m: 0.5, r: 0.4 }), 0, i * 0.08, 0);
        box(p, 0.08, 0.03, 0.005, M(0x6cf, { e: 0x66ccff, ei: 1.2 }), -0.08, i * 0.08 + 0.025, 0.112);
        box(p, 0.04, 0.03, 0.005, M(0xff8a3d, { e: 0xff8a3d, ei: 1.2 }), 0.08, i * 0.08 + 0.025, 0.112);
      }
    },
    moniteurs: function (p, w) {
      var half = (w || 1.9) / 2 + 0.28;
      [-1, 1].forEach(function (s) {
        var g = grp(p, s * half, 0, 0.0);
        cyl(g, 0.15, 0.02, M(C.black), 0, -0.75, 0); cyl(g, 0.025, 0.85, M(C.metal), 0, -0.75, 0);
        g.rotation.y = -s * 0.35;
        box(g, 0.24, 0.36, 0.26, M(0x1e1f22), 0, 0.08, 0);
        cyl(g, 0.075, 0.01, M(0xd9d9d9, { r: 0.4 }), 0, 0.17, 0.131, 20).rotation.x = Math.PI / 2;
        cyl(g, 0.03, 0.01, M(0xd9d9d9, { r: 0.4 }), 0, 0.37, 0.131, 14).rotation.x = Math.PI / 2;
      });
    },
    micro: function (p) {
      cyl(p, 0.17, 0.03, M(C.black), 0, 0, 0, 20); cyl(p, 0.018, 1.45, M(C.metal), 0, 0, 0);
      var b = grp(p, 0, 1.45, 0); b.rotation.x = 0.5;
      box(b, 0.025, 0.025, 0.4, M(C.metal), 0, 0, 0.15);
      cyl(b, 0.045, 0.16, M(0xc9b27c, { m: 0.6, r: 0.3 }), 0, -0.02, 0.36);
      mesh(b, G('ring', 0.09, 0.008, 24), M(0x111111), 0, 0.06, 0.5, 1, 1, 1).rotation.x = 0;
      mesh(b, G('cyl', 1, 1, 24), M(0x111111, { op: 0.45 }), 0, 0.06, 0.5, 0.085, 0.004, 0.085, false).rotation.x = Math.PI / 2;
    },
    formation: function (p) {
      var wd = M(C.woodD);
      box(p, 0.85, 1.8, 0.03, wd, 0, 0, -0.145); box(p, 0.04, 1.8, 0.32, wd, -0.405, 0, 0); box(p, 0.04, 1.8, 0.32, wd, 0.405, 0, 0); box(p, 0.85, 0.04, 0.32, wd, 0, 1.76, 0); box(p, 0.85, 0.1, 0.32, wd, 0, 0, 0);
      var cols = [C.red, C.blue, C.yellow, C.teal, C.purple, C.green, C.orange], r = rnd(2);
      for (var s = 0; s < 4; s++) {
        box(p, 0.78, 0.03, 0.28, M(C.wood), 0, 0.12 + s * 0.42, 0.02);
        for (var x = -0.35; x < 0.33;) { var bw = 0.04 + r() * 0.04, bh = 0.22 + r() * 0.12; box(p, bw, bh, 0.22, M(cols[Math.floor(r() * 7)]), x + bw / 2, 0.15 + s * 0.42, 0.03); x += bw + 0.008; if (r() > 0.85) x += 0.08; }
      }
    },
    distrib: function (p) {
      box(p, 1.0, 0.58, 0.05, M(C.black), 0, -0.29, 0);
      box(p, 0.94, 0.52, 0.005, texMat('chart', 256, 140, chart, { glow: 0.75 }), 0, -0.26, 0.027);
    },
    preamps: function (p) {
      box(p, 0.56, 1.0, 0.5, M(0x2b2420), 0, 0, 0);
      for (var i = 0; i < 4; i++) {
        box(p, 0.5, 0.17, 0.02, M(i % 2 ? 0x9da3a8 : 0x1f2023, { m: 0.5, r: 0.4 }), 0, 0.12 + i * 0.21, 0.25);
        for (var k = 0; k < 3; k++) cyl(p, 0.018, 0.02, M(0xf3f0ea), -0.15 + k * 0.1, 0.2 + i * 0.21, 0.26, 10).rotation.x = Math.PI / 2;
      }
      for (var t = 0; t < 3; t++) { var tb = cyl(p, 0.035, 0.12, M(0xffb15c, { e: 0xff8a3d, ei: 1.5, op: 0.85 }), -0.14 + t * 0.14, 1.0, 0.05, 12); blinkers.push({ m: tb, ph: t * 2, soft: true }); }
    },
    console: function (p) {
      [-0.72, 0.72].forEach(function (x) { box(p, 0.08, 0.75, 0.75, M(C.woodD), x, 0, 0); });
      var top = grp(p, 0, 0.78, 0); top.rotation.x = 0.22;
      box(top, 1.55, 0.08, 0.8, M(0x2f3238), 0, -0.04, 0);
      var cols = [C.red, C.blue, C.yellow, C.teal, 0xffffff];
      for (var i = 0; i < 14; i++) {
        var x = -0.68 + i * 0.105;
        box(top, 0.06, 0.006, 0.6, M(0x1a1b1e), x, 0.04, 0.0);
        for (var k = 0; k < 4; k++) cyl(top, 0.016, 0.02, M(cols[(i + k) % 5]), x, 0.045, -0.24 + k * 0.08, 8);
        box(top, 0.04, 0.025, 0.03, M(0xdddddd), x, 0.045, 0.18 + (i % 3) * 0.03);
      }
      box(top, 1.4, 0.18, 0.03, M(0x1a1b1e), 0, 0.04, -0.4);
      for (var v = 0; v < 6; v++) box(top, 0.12, 0.08, 0.005, M(0xffe9a8, { e: 0xffcc66, ei: 0.9 }), -0.55 + v * 0.22, 0.12, -0.384);
    },
    playlists: function (p) {
      box(p, 1.0, 0.42, 0.04, texMat('onair', 256, 108, onair, { glow: 1.6 }), 0, -0.21, 0);
    },
    cabine: function (p) {
      var w = 2.0, d = 1.9, h = 2.3, wall = M(0x3d4250), foam = M(0x5a4a6b);
      box(p, w, h, 0.08, wall, 0, 0, -d / 2);
      box(p, 0.08, h, d, wall, -w / 2, 0, 0);
      box(p, 0.08, h, d, wall, w / 2, 0, 0);
      box(p, w + 0.08, 0.08, d, wall, 0, h, 0);
      box(p, w * 0.45, h, 0.08, wall, -w * 0.275, 0, d / 2);
      mesh(p, G('box'), M(0xbfe6ff, { op: 0.28, r: 0.05 }), w * 0.225, h / 2 + 0.2, d / 2, w * 0.55, h * 0.6, 0.03, false);
      box(p, w * 0.55, 0.05, 0.1, wall, w * 0.225, h * 0.8 + 0.15, d / 2);
      box(p, w * 0.55, 0.25, 0.08, wall, w * 0.225, 0, d / 2);
      for (var i = 0; i < 6; i++) box(p, 0.4, 0.4, 0.06, foam, -0.6 + (i % 3) * 0.5, 0.9 + Math.floor(i / 3) * 0.5, -d / 2 + 0.06);
      var mic = grp(p, 0, 0, -0.2); MODELS.micro(mic);
      box(p, 0.6, 0.2, 0.05, M(0xff4d6d, { e: 0xff4d6d, ei: 1.3 }), 0, h + 0.08, d / 2 + 0.02);
    },
    orchestre: function (p) {
      var bl = M(0x111214, { r: 0.25 });
      box(p, 1.45, 0.32, 1.9, bl, 0, 0.62, 0);
      var lid = grp(p, -0.7, 0.95, 0); lid.rotation.z = 0.6; box(lid, 1.45, 0.03, 1.8, bl, 0.72, 0, 0);
      box(p, 0.03, 0.62, 0.03, M(C.black), -0.1, 0.95, 0.4);
      [[-0.6, -0.8], [0.6, -0.8], [0, 0.85]].forEach(function (l) { cyl(p, 0.05, 0.62, bl, l[0], 0, l[1]); });
      box(p, 1.3, 0.04, 0.22, texMat('keys', 256, 64, keys), 0, 0.82, 0.98);
      box(p, 0.6, 0.45, 0.35, bl, 0, 0, 1.4);
    },
    assistant: function (p) {
      box(p, 0.62, 2.0, 0.7, M(0x1d1f24, { m: 0.3, r: 0.5 }), 0, 0, 0);
      for (var i = 0; i < 9; i++) {
        box(p, 0.56, 0.16, 0.01, M(0x2c2f36), 0, 0.18 + i * 0.2, 0.355);
        for (var k = 0; k < 5; k++) { var led = box(p, 0.025, 0.025, 0.01, M(k % 2 ? 0x6cff9a : 0x66ccff, { e: k % 2 ? 0x6cff9a : 0x66ccff, ei: 1.6 }), -0.2 + k * 0.05, 0.24 + i * 0.2, 0.362); if ((i + k) % 3 === 0) blinkers.push({ m: led, ph: i * 1.7 + k }); }
      }
    },
    label: function (p) {
      box(p, 0.7, 0.9, 0.04, M(C.gold, { m: 0.7, r: 0.3 }), 0, -0.45, 0);
      box(p, 0.6, 0.8, 0.01, M(0xfaf6ea), 0, -0.4, 0.022);
      for (var i = 0; i < 6; i++) box(p, 0.42 - (i % 2) * 0.1, 0.02, 0.005, M(0x777777), 0, -0.2 - i * 0.07, 0.03);
      box(p, 0.5, 0.03, 0.18, M(C.woodD), 0, -1.05, 0.06);
      cyl(p, 0.05, 0.03, M(C.gold, { m: 0.8, r: 0.25 }), 0.15, -1.02, 0.08); cyl(p, 0.025, 0.1, M(C.gold, { m: 0.8, r: 0.25 }), 0.15, -0.99, 0.08);
      sph(p, 0.07, M(C.gold, { m: 0.8, r: 0.25 }), 0.15, -0.83, 0.08);
    },
    mentor: function (p) {
      box(p, 0.62, 0.78, 0.05, M(C.woodD), 0, -0.39, 0);
      box(p, 0.52, 0.68, 0.01, texMat('mentor', 128, 168, function (ctx, w, h) {
        var g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#6b7f99'); g.addColorStop(1, '#2d3442'); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#d6a77f'; ctx.beginPath(); ctx.arc(w / 2, h * 0.38, w * 0.2, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ddd'; ctx.beginPath(); ctx.arc(w / 2, h * 0.3, w * 0.21, Math.PI, 0); ctx.fill();
        ctx.fillStyle = '#1e2633'; ctx.beginPath(); ctx.ellipse(w / 2, h, w * 0.42, h * 0.36, 0, Math.PI, 0); ctx.fill();
        ctx.fillStyle = '#111'; ctx.fillRect(w * 0.36, h * 0.36, w * 0.28, h * 0.03);
      }), 0, -0.36, 0.027);
    },
    studioA: function (p) {
      // salle de prise vue à travers une vitre: batterie, ampli, tapis
      var w = 3.6, d = 3.6;
      box(p, w, 0.03, d, M(0x4b3a6b), 0, 0, 0);
      mesh(p, G('box'), M(0xbfe6ff, { op: 0.22, r: 0.05 }), w / 2, 1.3, 0, 0.04, 2.6, d, false);
      mesh(p, G('box'), M(0xbfe6ff, { op: 0.22, r: 0.05 }), 0, 1.3, d / 2, w, 2.6, 0.04, false);
      box(p, 0.1, 2.7, 0.1, M(C.black), w / 2, 0, d / 2); box(p, w, 0.1, 0.1, M(C.black), 0, 2.6, d / 2); box(p, 0.1, 0.1, d, M(C.black), w / 2, 2.6, 0);
      var kit = grp(p, -0.2, 0, -0.6);
      cyl(kit, 0.3, 0.45, M(0xd0d0d0), 0, 0.05, 0, 20).rotation.x = Math.PI / 2;
      cyl(kit, 0.3, 0.02, M(C.red), 0, 0.05, 0.24, 20).rotation.x = Math.PI / 2;
      [[-0.45, 0.6, 0.2, 0.18], [0.45, 0.62, 0.2, 0.2], [0.2, 0.75, -0.05, 0.15], [-0.15, 0.78, -0.05, 0.14]].forEach(function (t) { cyl(kit, t[3], 0.22, M(C.red, { r: 0.4 }), t[0], t[1], t[2], 18); });
      [[-0.6, 1.1], [0.65, 1.15]].forEach(function (c) { cyl(kit, 0.01, c[1], M(C.metal), c[0], 0, -0.1); cyl(kit, 0.24, 0.01, M(C.gold, { m: 0.8, r: 0.3 }), c[0], c[1], -0.1, 20); });
      chair(kit, 0, -0.6, Math.PI, 0x222222);
      box(p, 0.6, 0.6, 0.35, M(0x222222), 1.1, 0, -1.2); box(p, 0.5, 0.35, 0.01, M(0x8a7a5a), 1.1, 0.15, -1.02);
      sph(p, 0.0001, M(0xffffff), 0, 0, 0);
      var gt = grp(p, -1.2, 0, 0.6); MODELS.micro(gt);
    },
    management: function (p) {
      var t = M(0xf4f1ea, { r: 0.4 });
      var top = cyl(p, 1, 0.05, t, 0, 0.72, 0, 32); top.scale.set(1.2, 0.05, 0.62);
      cyl(p, 0.08, 0.72, M(C.metal), -0.5, 0, 0); cyl(p, 0.08, 0.72, M(C.metal), 0.5, 0, 0);
      [[-0.6, -0.95, 0], [0.6, -0.95, 0], [-0.6, 0.95, Math.PI], [0.6, 0.95, Math.PI], [-1.5, 0, -Math.PI / 2], [1.5, 0, Math.PI / 2]].forEach(function (c) { chair(p, c[0], c[1], c[2], 0x3a3f4a); });
      var lp = grp(p, 0.2, 0.77, 0.1); MODELS.laptop(lp);
      box(p, 0.2, 0.01, 0.28, M(0xffffff), -0.4, 0.77, 0.05, 0.3);
    },
    neve: function (p) {
      [-1.25, 1.25].forEach(function (x) { box(p, 0.12, 0.8, 1.0, M(0x7a4a2a, { r: 0.5 }), x, 0, 0); });
      box(p, 2.4, 0.7, 0.9, M(0x23262c), 0, 0, 0.02);
      var top = grp(p, 0, 0.82, 0); top.rotation.x = 0.25;
      box(top, 2.5, 0.08, 1.0, M(0x3a4a66, { m: 0.2, r: 0.5 }), 0, -0.04, 0);
      var cols = [C.red, C.blue, 0xcccccc, C.yellow];
      for (var i = 0; i < 22; i++) {
        var x = -1.12 + i * 0.106;
        for (var k = 0; k < 6; k++) cyl(top, 0.017, 0.025, M(cols[(k + (i > 15 ? 1 : 0)) % 4]), x, 0.04, -0.36 + k * 0.08, 8);
        box(top, 0.03, 0.03, 0.04, M(0xdddddd), x, 0.04, 0.3 + (i % 4) * 0.025);
      }
      box(top, 2.3, 0.3, 0.04, M(0x1d1f24), 0, 0.12, -0.5);
      for (var v = 0; v < 8; v++) box(top, 0.18, 0.12, 0.005, M(0xffe9a8, { e: 0xffcc66, ei: 1.1 }), -0.95 + v * 0.27, 0.27, -0.478);
    },
    disques: function (p) {
      for (var i = 0; i < 12; i++) {
        var x = (i % 6) - 2.5, y = Math.floor(i / 6);
        var f = grp(p, x * 0.56, -0.35 - y * 0.62, 0);
        box(f, 0.5, 0.56, 0.035, M(0x1b1b1b), 0, -0.28, 0);
        var d = cyl(f, 0.19, 0.01, M(C.gold, { m: 0.9, r: 0.22 }), 0, -0.24, 0.02, 28); d.rotation.x = Math.PI / 2;
        cyl(f, 0.05, 0.012, M(0xf3f0ea), 0, -0.24, 0.022, 16).rotation.x = Math.PI / 2;
        box(f, 0.3, 0.05, 0.005, M(0xf3f0ea), 0, -0.5, 0.02);
      }
    },
    traitement: function () { /* panneaux posés à part sur les murs (voir placeFoam) */ }
  };
  // Hauteurs de pose sur un mur (les modèles muraux pendent sous leur origine)
  var WALL = { distrib: 1, playlists: 1, label: 1, mentor: 1, disques: 1 };
  var DESK_TOP = { laptop: 1, daw: 1, plugins: 1, clavier: 1, interface: 1, samples: 1, casque: 1, mastering: 1 };

  // ---------- Lieux ----------
  // x vers la droite, z vers la caméra. Mur du fond en z = -D/2, mur de gauche en x = -W/2.
  // desk: bureau principal (où tu travailles). staff: postes de l'équipe. lounge/board: coins repos et formation.
  // slots: emplacement de chaque équipement (sol: [x, z, rotY]; mur: { w: 'b'|'l', u, y }).
  var PLACES = {
    chambre: { W: 6.4, D: 5, H: 2.7, floor: ['wood', '#b98a5e', '#9c6f48'], wall: 0x9cc3d5, wall2: 0xb7d3df, desk: [1.1, -2.15, 1.9],
      staff: [[2.25, 0.55]], lounge: [[-1.75, -0.9, Math.PI / 2]], board: [-0.55, -1.65],
      slots: { micro: [-0.35, -1.25, 0.4], formation: [-0.55, -2.33, 0], distrib: { w: 'l', u: -0.15, y: 1.95 }, preamps: [2.75, -2.2, 0],
        playlists: { w: 'b', u: -0.55, y: 2.55 }, console: [-0.6, 1.4, Math.PI] },
      foam: [{ w: 'b', u0: 0.15, u1: 2.05, y0: 1.35, y1: 2.45 }, { w: 'l', u0: -2.4, u1: -0.9, y0: 1.35, y1: 2.45 }] },
    garage: { W: 8.4, D: 6.2, H: 3.0, floor: ['concrete'], wall: 0xc9c2b5, wall2: 0xd8d1c4, brick: 'blocks', desk: [0.9, -2.75, 2.2],
      staff: [[2.75, 0.5], [0.15, 0.9]], lounge: [[-3.55, -1.9, Math.PI / 2], [-3.55, -1.2, Math.PI / 2]], board: [-2.6, -2.3],
      slots: { micro: [-0.75, -2.0, 0.4], formation: [-1.15, -2.93, 0], distrib: { w: 'b', u: 3.2, y: 2.4 }, preamps: [2.6, -2.7, 0],
        playlists: { w: 'l', u: -1.6, y: 2.75 }, console: [-1.4, -0.6, 0], traitement: null, plugins: null },
      foam: [{ w: 'b', u0: -0.25, u1: 2.05, y0: 1.5, y1: 2.7 }, { w: 'l', u0: -2.8, u1: -0.6, y0: 1.5, y1: 2.6 }] },
    local: { W: 10.5, D: 7.4, H: 3.2, floor: ['wood', '#5b4030', '#4a3426'], wall: 0xece7df, wall2: 0xf4f0ea, brick: 'bricks', desk: [1.6, -3.35, 2.4],
      staff: [[3.9, 0.3], [1.5, 0.7], [-0.9, 1.1]], lounge: [[-3.6, 2.2, Math.PI], [-3.0, 2.2, Math.PI]], board: [-2.4, 0.2],
      slots: { cabine: [-3.85, -2.6, 0], console: [-0.75, -3.1, 0], micro: [-0.2, -1.8, 0.4], formation: [-4.98, -1.0, Math.PI / 2], preamps: [3.6, -3.35, 0],
        distrib: { w: 'b', u: 4.4, y: 2.6 }, playlists: { w: 'b', u: -0.75, y: 2.75 }, label: { w: 'l', u: 0.2, y: 2.9 }, orchestre: [3.9, 2.35, -0.4] },
      foam: [{ w: 'b', u0: 0.35, u1: 2.85, y0: 1.6, y1: 2.9 }] },
    pro: { W: 13, D: 9.5, H: 3.6, floor: ['wood', '#a77b52', '#8e6542'], wall: 0x3b4250, wall2: 0x4a5263, slats: true, desk: [1.8, -4.35, 2.8],
      staff: [[1.3, 0.3], [3.4, 0.3], [5.5, 0.3], [1.3, 2.4], [3.4, 2.4], [5.5, 2.4]], lounge: [[-3.6, 3.7, Math.PI], [-2.9, 3.7, Math.PI], [-4.3, 3.7, Math.PI]], board: [-1.6, 0.9],
      slots: { studioA: [-4.7, -2.75, 0], cabine: [5.0, -3.7, 0], console: [-0.85, -4.25, 0], neve: [-0.85, -2.7, 0], preamps: [3.6, -4.4, 0], assistant: [6.0, -1.4, -Math.PI / 2],
        orchestre: [-4.6, 2.2, 0.4], management: [-0.9, 2.9, 0], micro: [0.6, -2.0, 0.4], formation: [-2.45, 0.6, Math.PI / 2],
        distrib: { w: 'b', u: 1.8, y: 2.9 }, playlists: { w: 'b', u: 3.7, y: 3.3 }, label: { w: 'b', u: 5.0, y: 3.45 }, mentor: { w: 'b', u: -0.85, y: 3.35 }, disques: { w: 'l', u: 1.6, y: 3.3 } },
      foam: [{ w: 'b', u0: 0.4, u1: 3.2, y0: 1.7, y1: 2.3 }] },
    complexe: { W: 17, D: 12, H: 4.2, floor: ['marble'], wall: 0xe9e1d3, wall2: 0xf1ebe0, gold: true, desk: [2.0, -5.6, 3.2],
      staff: [[0.9, 0.6], [3.1, 0.6], [5.3, 0.6], [7.5, 0.6], [0.9, 2.8], [3.1, 2.8], [5.3, 2.8], [7.5, 2.8]], lounge: [[5.4, 5.0, Math.PI], [6.1, 5.0, Math.PI], [4.7, 5.0, Math.PI]], board: [-2.6, 1.4],
      slots: { studioA: [-6.6, -4.1, 0], cabine: [6.9, -4.9, 0], console: [-1.3, -5.5, 0], neve: [-1.3, -3.7, 0], preamps: [4.2, -5.65, 0], assistant: [8.0, -2.4, -Math.PI / 2],
        orchestre: [-6.0, 3.4, 0.4], management: [-1.6, 4.0, 0], micro: [0.7, -3.2, 0.4], formation: [-3.6, 0.4, Math.PI / 2],
        distrib: { w: 'b', u: 2.0, y: 3.4 }, playlists: { w: 'b', u: 6.9, y: 3.9 }, label: { w: 'b', u: 4.4, y: 3.5 }, mentor: { w: 'l', u: 3.0, y: 3.2 }, disques: { w: 'b', u: -1.3, y: 3.9 } },
      foam: [{ w: 'b', u0: 0.5, u1: 3.6, y0: 2.0, y1: 2.7 }] }
  };
  var FALLBACK = [[-1.2, 1.4], [0.3, 1.8], [-2.4, 0.4], [1.8, 1.9], [-0.2, 0.2], [2.6, 1.0]];

  // ---------- Pièce ----------
  function floorMat(f, W, D) {
    var k = f[0];
    if (k === 'wood') return texMat('floor-' + f[1], 256, 256, function (c, w, h) { planks(c, w, h, f[1], f[2]); }, { rep: [W / 2.5, D / 2.5] });
    if (k === 'concrete') return texMat('concrete', 256, 256, concrete, { rep: [W / 3, D / 3] });
    return texMat('marble', 256, 256, marble, { rep: [W / 2, D / 2], r: 0.35 });
  }
  function buildRoom(def, tier) {
    var g = grp(null), W = def.W, D = def.D, H = def.H;
    mesh(g, G('box'), floorMat(def.floor, W, D), 0, -0.05, 0, W, 0.1, D).castShadow = false;
    // socle visible sous la pièce (effet maquette)
    mesh(g, G('box'), M(dark ? 0x2a2f3a : 0x6d625a), 0, -0.35, 0, W + 0.02, 0.5, D + 0.02).castShadow = false;
    var wallM = M(def.wall), wall2M = M(def.wall2);
    var backM = def.brick === 'bricks' ? texMat('bricks', 256, 256, bricks, { rep: [W / 3, H / 2] }) : def.brick === 'blocks' ? texMat('blocks', 256, 256, blocks, { rep: [W / 3, H / 2] }) : def.slats ? texMat('slats', 256, 128, slats, { rep: [W / 2, 1] }) : wallM;
    var bw = mesh(g, G('box'), backM, 0, H / 2, -D / 2 - 0.06, W + 0.24, H, 0.12); bw.castShadow = false;
    var lw = mesh(g, G('box'), def.slats ? texMat('slats', 256, 128, slats, { rep: [W / 2, 1] }) : wall2M, -W / 2 - 0.06, H / 2, 0, 0.12, H, D); lw.castShadow = false;
    // plinthes
    box(g, W, 0.1, 0.03, M(def.gold ? C.gold : 0xf3f0ea), 0, 0, -D / 2 + 0.015);
    box(g, 0.03, 0.1, D, M(def.gold ? C.gold : 0xf3f0ea), -W / 2 + 0.015, 0, 0);
    if (def.gold) { box(g, W, 0.08, 0.04, M(C.gold, { m: 0.8, r: 0.3 }), 0, H - 0.3, -D / 2 + 0.02); box(g, 0.04, 0.08, D, M(C.gold, { m: 0.8, r: 0.3 }), -W / 2 + 0.02, H - 0.3, 0); }
    decor[cur.placeKey](g, def, tier);
    return g;
  }
  function windowL(g, def, z, w, h, y) {
    var x = -def.W / 2 + 0.02, fr = M(0xf6f3ee);
    var sky = M(dark ? 0x1b2a48 : 0xbfe3f7, { e: dark ? 0x22345a : 0xbfe3f7, ei: dark ? 0.5 : 0.6 });
    mesh(g, G('box'), sky, x, y + h / 2, z, 0.02, h, w, false);
    box(g, 0.08, 0.06, w + 0.1, fr, x + 0.02, y - 0.03, z); box(g, 0.08, 0.06, w + 0.1, fr, x + 0.02, y + h, z);
    box(g, 0.08, h, 0.06, fr, x + 0.02, y, z - w / 2); box(g, 0.08, h, 0.06, fr, x + 0.02, y, z + w / 2); box(g, 0.06, h, 0.04, fr, x + 0.02, y, z);
    if (dark) { var st = M(0xffffff, { e: 0xffffff, ei: 1.5 }); for (var i = 0; i < 5; i++) sph(g, 0.012, st, x + 0.03, y + 0.2 + (i * 0.37) % h, z - w / 2 + 0.15 + (i * 0.53) % (w - 0.3), 6); }
  }
  function posterB(g, def, x, y, k, a, b, w, h) { box(g, w || 0.5, h || 0.7, 0.01, texMat('poster' + k, 128, 180, poster(k, a, b)), x, y, -def.D / 2 + 0.01); }
  function plant(g, x, z, s) {
    s = s || 1;
    cyl(g, 0.16 * s, 0.32 * s, M(0xd9a066), x, 0, z, 16, 0.12 * s);
    var leaf = M(0x4f9a5a);
    for (var i = 0; i < 7; i++) { var a = i / 7 * Math.PI * 2, l = sph(g, 0.14 * s, leaf, x + Math.sin(a) * 0.1 * s, (0.48 + (i % 3) * 0.14) * s, z + Math.cos(a) * 0.1 * s, 8); l.scale.set(0.12 * s, 0.22 * s, 0.12 * s); }
  }
  function sofa(g, x, z, ry, col, w) {
    var s = grp(g, x, 0, z, ry), m = M(col || 0x8a5a44); w = w || 1.8;
    box(s, w, 0.42, 0.85, m, 0, 0, 0); box(s, w, 0.45, 0.2, m, 0, 0.4, 0.33); box(s, 0.18, 0.62, 0.85, m, -w / 2 + 0.09, 0, 0); box(s, 0.18, 0.62, 0.85, m, w / 2 - 0.09, 0, 0);
    box(s, w * 0.42, 0.12, 0.6, M(col ? col + 0x111111 : 0x9a6a54), -w * 0.22, 0.42, -0.05); box(s, w * 0.42, 0.12, 0.6, M(col ? col + 0x111111 : 0x9a6a54), w * 0.22, 0.42, -0.05);
    return s;
  }
  function lamp(g, x, z, h, warm) {
    cyl(g, 0.14, 0.03, M(C.black), x, 0, z); cyl(g, 0.015, h, M(C.black), x, 0, z);
    cyl(g, 0.12, 0.2, M(0xfff3d6, { e: 0xffd28a, ei: 1.2 }), x, h, z, 16, 0.18);
    if (warm !== false) { var l = new THREE.PointLight(0xffc27a, 1.6, 4.5, 1.6); l.position.set(x, h + 0.05, z); g.add(l); }
  }
  function bulb(g, x, y, z) {
    cyl(g, 0.005, 0.5, M(C.black), x, y - 0.5, z);
    sph(g, 0.06, M(0xfff3d6, { e: 0xffd28a, ei: 2 }), x, y - 0.55, z, 10);
    var l = new THREE.PointLight(0xffcf8a, 2.2, 6, 1.6); l.position.set(x, y - 0.6, z); g.add(l);
  }
  function rug(g, x, z, w, d, col, col2) {
    box(g, w, 0.015, d, M(col), x, 0, z).castShadow = false;
    box(g, w * 0.8, 0.017, d * 0.7, M(col2), x, 0, z).castShadow = false;
  }
  function desk(g, def, x, z, w, style) {
    var d = grp(g, x, 0, z), top = M(style === 'white' ? 0xf1eee8 : style === 'dark' ? 0x2c2a29 : C.wood), leg = M(style === 'dark' ? 0x111111 : 0x3a3a3a);
    box(d, w, 0.05, 0.7, top, 0, 0.72, 0);
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (s) { box(d, 0.05, 0.72, 0.05, leg, s[0] * (w / 2 - 0.06), 0, s[1] * 0.29); });
    return d;
  }
  var decor = {
    chambre: function (g, def, tier) {
      var D = def.D;
      // lit
      var bed = grp(g, -2.45, 0, -1.4);
      box(bed, 1.4, 0.32, 2.05, M(C.woodD), 0, 0, 0); box(bed, 1.35, 0.18, 2.0, M(0xf6f3ee), 0, 0.32, 0);
      box(bed, 1.38, 0.12, 1.3, M(tier ? 0x6b5bd6 : 0x4a7bd0), 0, 0.46, 0.35); box(bed, 0.55, 0.12, 0.35, M(0xffffff), -0.3, 0.5, -0.75); box(bed, 0.55, 0.12, 0.35, M(0xffffff), 0.3, 0.5, -0.75);
      box(bed, 1.4, 0.75, 0.08, M(C.woodD), 0, 0, -1.02);
      windowL(g, def, 0.9, 1.25, 1.2, 0.95);
      posterB(g, def, 2.55, 1.55, 3, '#ff8a3d', '#8e3b5a');
      box(g, 0.6, 0.85, 0.01, texMat('posterL', 128, 180, poster(7, '#2bb3a3', '#173d5c')), -def.W / 2 + 0.01, 1.55, -1.5).rotation.y = Math.PI / 2;
      rug(g, 0.4, 0.5, 2.6, 1.7, tier ? 0x3c3a66 : 0xe8b04b, tier ? 0x5c5a96 : 0xf3cf7a);
      lamp(g, 2.7, -2.15, 1.45);
      plant(g, -2.75, 2.0);
      box(g, 0.45, 0.32, 0.35, M(0xd9534f), -0.9, 0, 1.6); box(g, 0.4, 0.04, 0.3, M(0x333333), -0.9, 0.32, 1.6); // ampli de guitare
      var gt = grp(g, -1.3, 0, 1.75, 0.3); box(gt, 0.34, 0.45, 0.08, M(0xc0392b), 0, 0.05, 0); box(gt, 0.05, 0.6, 0.04, M(C.woodD), 0, 0.5, 0); gt.rotation.z = 0.12;
      if (tier >= 1) { // chambre-studio: ruban LED
        box(g, def.W, 0.03, 0.03, M(0xb388ff, { e: 0xb388ff, ei: 2.2 }), 0, def.H - 0.08, -D / 2 + 0.04, 0).castShadow = false;
        box(g, 0.03, 0.03, D, M(0xb388ff, { e: 0xb388ff, ei: 2.2 }), -def.W / 2 + 0.04, def.H - 0.08, 0).castShadow = false;
        var led = new THREE.PointLight(0xb388ff, 1.2, 6, 1.5); led.position.set(0, def.H - 0.3, -1); g.add(led);
      }
    },
    garage: function (g, def) {
      // porte de garage sur le mur de gauche
      var x = -def.W / 2 + 0.03, z0 = 0.5, w = 2.8, h = 2.4;
      for (var i = 0; i < 8; i++) box(g, 0.04, h / 8 - 0.02, w, M(i % 2 ? 0xd7d9dc : 0xc8cbcf, { m: 0.3, r: 0.5 }), x + 0.02, i * h / 8, z0 + w / 2 - w / 2);
      box(g, 0.08, 0.12, w + 0.2, M(0x777777), x + 0.03, h, z0);
      // établi et panneau d'outils
      box(g, 1.6, 0.85, 0.6, M(0x8d6e4c), -2.6, 0, -def.D / 2 + 0.3);
      box(g, 1.5, 0.9, 0.03, M(0xc7a77a), -2.6, 1.15, -def.D / 2 + 0.02);
      for (var t = 0; t < 6; t++) box(g, 0.04, 0.25, 0.03, M([C.red, C.yellow, C.metal][t % 3]), -3.15 + t * 0.22, 1.5, -def.D / 2 + 0.06);
      sofa(g, -3.55, -1.55, Math.PI / 2, 0x7a6a4f, 1.9);
      rug(g, -2.3, -1.5, 1.6, 2.2, 0x9b3d3d, 0xc65f4f);
      bulb(g, -1.2, def.H, -1.0); bulb(g, 2.0, def.H, -1.0);
      for (var b = 0; b < 3; b++) box(g, 0.5, 0.35, 0.4, M(0xc49a6c), 3.4 + (b % 2) * 0.1, b * 0.35, 2.3 - b * 0.05, b * 0.2);
      var bike = grp(g, 3.6, 0, -1.2, 0.4); mesh(bike, G('ring', 0.3, 0.03, 20), M(C.black), -0.45, 0.32, 0).castShadow = true; mesh(bike, G('ring', 0.3, 0.03, 20), M(C.black), 0.45, 0.32, 0); box(bike, 0.9, 0.04, 0.04, M(C.red), 0, 0.55, 0); box(bike, 0.04, 0.4, 0.04, M(C.red), 0.2, 0.35, 0);
      plant(g, 3.7, 0.4, 0.9);
    },
    local: function (g, def) {
      windowL(g, def, 1.0, 3.0, 2.0, 0.6);
      sofa(g, -3.3, 2.4, Math.PI, 0x2f6f73, 2.2);
      box(g, 1.1, 0.4, 0.6, M(C.woodD), -3.3, 0, 1.25);
      rug(g, -3.0, 1.6, 3.4, 2.4, 0x3a3f58, 0x575f87);
      plant(g, -4.8, 3.2, 1.2); plant(g, 4.8, -3.2, 1.1); plant(g, 4.7, 3.2, 1);
      lamp(g, -4.7, 2.0, 1.6);
      posterB(g, def, 3.0, 2.2, 11, '#f2c14e', '#b8442c', 0.6, 0.85);
      for (var i = 0; i < 3; i++) { var pl = new THREE.PointLight(0xffd59a, 1.3, 6, 1.7); pl.position.set(-2.5 + i * 3, def.H - 0.4, -0.8); g.add(pl); cyl(g, 0.18, 0.12, M(C.black), -2.5 + i * 3, def.H - 0.12, -0.8, 16, 0.08); }
    },
    pro: function (g, def) {
      sofa(g, -3.6, 4.0, Math.PI, 0x3b2f2a, 2.6);
      rug(g, -3.4, 3.0, 4, 2.2, 0x2a2e3b, 0x3d4357);
      plant(g, 6.0, -4.3, 1.2); plant(g, -6.0, 4.3, 1.2); plant(g, 6.0, 4.2, 1.1);
      box(g, 2.6, 0.04, 0.5, M(0xff8a3d, { e: 0xff8a3d, ei: 1.2 }), 1.8, def.H - 0.05, -def.D / 2 + 0.3).castShadow = false;
      for (var i = 0; i < 4; i++) { var pl = new THREE.PointLight(0xffe0b3, 1.4, 7, 1.6); pl.position.set(-4 + i * 3.3, def.H - 0.3, -0.5 + (i % 2) * 2); g.add(pl); cyl(g, 0.15, 0.06, M(0xfff3d6, { e: 0xffe0b3, ei: 1.5 }), -4 + i * 3.3, def.H - 0.06, -0.5 + (i % 2) * 2, 16); }
      var cm = grp(g, 6.2, 0, 3.1); box(cm, 0.6, 0.9, 0.5, M(0x2c2a29), 0, 0, 0); box(cm, 0.3, 0.35, 0.3, M(0x555555), 0, 0.9, 0);
    },
    complexe: function (g, def) {
      [-4, 0.5, 5].forEach(function (x) { cyl(g, 0.32, def.H, M(0xf3eee5, { r: 0.4 }), x, 0, -def.D / 2 + 0.45, 20); box(g, 0.8, 0.12, 0.8, M(C.gold, { m: 0.8, r: 0.3 }), x, def.H - 0.12, -def.D / 2 + 0.45); });
      sofa(g, 5.4, 5.3, Math.PI, 0x7d1f2b, 3.0); sofa(g, 3.2, 4.5, Math.PI / 2, 0x7d1f2b, 1.8);
      rug(g, 5.0, 4.3, 4.2, 2.6, 0x7d1f2b, 0x9c2c3b);
      rug(g, 0, 0.5, 2.4, 9, 0x8c1c2c, 0xa52a3a);
      plant(g, 8.0, -5.5, 1.4); plant(g, -8.0, 5.5, 1.4); plant(g, 8.0, 5.4, 1.3); plant(g, 2.5, 5.6, 1.2);
      windowL(g, def, 4.0, 3.2, 2.6, 0.9);
      [[-3, -1], [3, -1], [0, 3]].forEach(function (c) {
        var ch = grp(g, c[0], def.H, c[1]);
        cyl(ch, 0.01, 0.6, M(C.gold, { m: 0.8 }), 0, -0.6, 0);
        for (var i = 0; i < 8; i++) { var a = i / 8 * Math.PI * 2; sph(ch, 0.06, M(0xfff6dd, { e: 0xffe6a8, ei: 2 }), Math.sin(a) * 0.35, -0.75, Math.cos(a) * 0.35, 8); }
        mesh(ch, G('ring', 0.35, 0.02, 24), M(C.gold, { m: 0.8, r: 0.3 }), 0, -0.78, 0).rotation.x = Math.PI / 2;
        var pl = new THREE.PointLight(0xffe6b0, 2.4, 9, 1.5); pl.position.set(0, -0.9, 0); ch.add(pl);
      });
    }
  };

  // ---------- Placement des équipements ----------
  function deskSpot(def, id) {
    var w = def.desk[2], f = w / 1.9;
    var L = { laptop: [-0.68, -0.02, 0.25], daw: [0, -0.16, 0], plugins: [0.46, -0.14, -0.3], clavier: [-0.05, 0.19, 0], interface: [0.52, 0.2, -0.1], samples: [-0.5, 0.2, 0.1], casque: [0.86, 0.05, 0.4], mastering: [0.82, -0.2, -0.2] }[id];
    return { x: def.desk[0] + L[0] * f, y: 0.745, z: def.desk[1] + L[1], r: L[2] };
  }
  var fallbackUsed = 0;
  function itemSpot(def, id) {
    if (DESK_TOP[id]) return deskSpot(def, id);
    if (id === 'moniteurs') return { x: def.desk[0], y: 0.82, z: def.desk[1] - 0.05, r: 0, w: def.desk[2] };
    var s = def.slots[id];
    if (s && s.w) return s.w === 'b' ? { x: s.u, y: s.y, z: -def.D / 2 + 0.03, r: 0 } : { x: -def.W / 2 + 0.03, y: s.y, z: s.u, r: Math.PI / 2 };
    if (s) return { x: s[0], y: 0, z: s[1], r: s[2] || 0 };
    var fb = FALLBACK[(fallbackUsed++) % FALLBACK.length], k = def.W / 6.4;
    return { x: fb[0] * k, y: 0, z: fb[1] * k * 0.8, r: 0 };
  }
  function placeFoam(g, def) {
    var cols = [M(0x3b3f4a), M(0x5a4a6b)];
    (def.foam || []).forEach(function (f) {
      var n = 0;
      for (var y = f.y0; y + 0.38 <= f.y1 + 0.01; y += 0.44) for (var u = f.u0; u + 0.38 <= f.u1 + 0.01; u += 0.44) {
        var m = cols[(n++ + Math.round(y * 3)) % 2];
        if (f.w === 'b') box(g, 0.4, 0.4, 0.07, m, u + 0.2, y, -def.D / 2 + 0.035);
        else box(g, 0.07, 0.4, 0.4, m, -def.W / 2 + 0.035, y, u + 0.2);
      }
    });
  }
  var ghostMat = null;
  function buildItem(id, ghost) {
    var def = cur.def, sp = itemSpot(def, id), g = grp(null, sp.x, sp.y, sp.z, sp.r);
    g.userData.pick = { type: 'item', id: id };
    var mark = blinkers.length;
    if (id === 'traitement') placeFoam(g, def), g.position.set(0, 0, 0), g.rotation.y = 0;
    else if (id === 'moniteurs') MODELS.moniteurs(g, sp.w);
    else if (MODELS[id]) MODELS[id](g);
    if (ghost) {
      blinkers.length = mark;
      if (!ghostMat) ghostMat = new THREE.MeshBasicMaterial({ color: 0x7fd3ff, transparent: true, opacity: 0.14, depthWrite: false });
      g.traverse(function (o) { if (o.isMesh) { o.material = ghostMat; o.castShadow = false; o.receiveShadow = false; } if (o.isLight) o.intensity = 0; });
      g.userData.ghost = true;
    }
    g.traverse(function (o) { if (o.isMesh) o.userData.pick = g.userData.pick; });
    return g;
  }

  // ---------- Équipe ----------
  function staffDesk(p, x, z, idx) {
    var d = grp(p, x, 0, z);
    var top = M(cur.placeKey === 'complexe' ? 0xf1eee8 : cur.placeKey === 'pro' ? 0x2c2a29 : C.wood);
    box(d, 1.25, 0.05, 0.65, top, 0, 0.72, -0.2);
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (s) { box(d, 0.05, 0.72, 0.05, M(0x333333), s[0] * 0.56, 0, -0.2 + s[1] * 0.26); });
    var mon = grp(d, 0, 0.745, -0.35); MODELS.daw(mon); mon.scale.set(0.75, 0.75, 0.75);
    box(d, 0.36, 0.015, 0.12, M(0x2f3136), 0, 0.745, -0.05);
    chair(d, 0, 0.35, 0, C.plastic);
    var badge = box(d, 0.3, 0.06, 0.015, M(0xffffff), 0, 0.68, 0.135); badge.castShadow = false;
    return d;
  }
  var STATUS_COL = { ok: 0x5be07a, mid: 0xf2c14e, low: 0xe2574c };
  function makeStaff(m) {
    var node = { id: m.id, look: JSON.stringify(m.look), sitG: person(m.look, 'sit', { headphones: m.role === 'mixeur' || m.role === 'master' }), standG: person(m.look, 'stand', { headphones: false }) };
    node.gem = mesh(null, G('sph', 4, 2), M(0xffffff, { e: 0xffffff, ei: 0.8 }), 0, 0, 0, 0.07, 0.11, 0.07, false);
    node.book = grp(null); box(node.book, 0.2, 0.26, 0.04, M(C.red), 0, 0, 0);
    [node.sitG, node.standG].forEach(function (g) { g.userData.pick = { type: 'staff', id: m.id }; g.traverse(function (o) { if (o.isMesh) o.userData.pick = g.userData.pick; }); });
    staffG.add(node.sitG); staffG.add(node.standG); staffG.add(node.gem);
    return node;
  }
  function layoutStaff(list) {
    var def = cur.def, seen = {};
    (list || []).forEach(function (m, i) {
      var n = staffNodes[m.id];
      if (n && n.look !== JSON.stringify(m.look)) { removeStaff(m.id); n = null; }
      if (!n) n = staffNodes[m.id] = makeStaff(m);
      seen[m.id] = 1;
      n.status = m.status; n.morale = m.morale; n.act = m.act;
      var deskPos = def.staff[i] || def.staff[def.staff.length - 1];
      n.sitG.visible = n.standG.visible = false;
      var g, head;
      if (m.status === 'rest') {
        var l = def.lounge[i % def.lounge.length];
        g = n.sitG; g.position.set(l[0], 0.0, l[1]); g.rotation.y = l[2] || 0; g.userData.p.mode = 'rest';
      } else if (m.status === 'train') {
        g = n.standG; g.position.set(def.board[0] + (i % 3 - 1) * 0.5, 0, def.board[1]); g.rotation.y = Math.PI; g.userData.p.mode = 'train';
      } else {
        g = n.sitG; g.position.set(deskPos[0], 0, deskPos[1] + 0.35); g.rotation.y = 0; g.userData.p.mode = m.status === 'work' ? 'work' : 'idle';
      }
      g.visible = true; n.cur = g;
      head = g.userData.p.mode === 'rest' ? 0.85 : g === n.standG ? 1.95 : 1.55;
      n.gem.position.set(g.position.x, head + 0.12, g.position.z);
      n.gem.material = M(m.morale >= 60 ? STATUS_COL.ok : m.morale >= 25 ? STATUS_COL.mid : STATUS_COL.low, { e: m.morale >= 60 ? STATUS_COL.ok : m.morale >= 25 ? STATUS_COL.mid : STATUS_COL.low, ei: 0.9 });
      n.anchor = new V3(g.position.x, head, g.position.z);
    });
    Object.keys(staffNodes).forEach(function (id) { if (!seen[id]) removeStaff(id); });
  }
  function removeStaff(id) {
    var n = staffNodes[id];
    if (!n) return;
    [n.sitG, n.standG, n.gem].forEach(function (o) { staffG.remove(o); });
    delete staffNodes[id];
  }

  // ---------- Caméra ----------
  function fitCamera() {
    if (!cur.def || !camera) return;
    var def = cur.def, W = def.W, D = def.D, H = def.H;
    cam.target.set(-W * 0.04, H * 0.22, D * 0.02);
    var pts = [];
    [-W / 2, W / 2].forEach(function (x) { [-D / 2, D / 2].forEach(function (z) { [0, H].forEach(function (y) { pts.push(new V3(x, y, z)); }); }); });
    var lo = 3, hi = 80, v = new V3(), hh = Math.max(1, host.clientHeight);
    var yTop = 0.95 - 2 * ins.t / hh, yBot = -0.97 + 2 * ins.b / hh;
    if (yTop - yBot < 0.5) { var mid0 = (yTop + yBot) / 2; yTop = mid0 + 0.25; yBot = mid0 - 0.25; }
    for (var it = 0; it < 22; it++) {
      var mid = (lo + hi) / 2; placeCam(mid, cam.yawBase, cam.pitch); camera.updateMatrixWorld();
      var ok = pts.every(function (p) { v.copy(p).project(camera); return Math.abs(v.x) < 0.97 && v.y < yTop && v.y > yBot; });
      if (ok) hi = mid; else lo = mid;
    }
    cam.fit = hi;
  }
  function placeCam(dist, yaw, pitch) {
    camera.position.set(cam.target.x + Math.sin(yaw) * Math.cos(pitch) * dist, cam.target.y + Math.sin(pitch) * dist, cam.target.z + Math.cos(yaw) * Math.cos(pitch) * dist);
    camera.lookAt(cam.target);
  }
  function applyCam() { placeCam(cam.fit * cam.zoom, cam.yaw, cam.pitch); }
  // Décale l'image pour centrer la pièce entre le haut et le bas couverts par l'interface.
  function applyOffset() {
    var w = Math.max(1, host.clientWidth), h = Math.max(1, host.clientHeight), d = Math.round((ins.b - ins.t) / 2);
    if (d) camera.setViewOffset(w, h, 0, d, w, h); else camera.clearViewOffset();
  }

  // ---------- Lumières et thème ----------
  function lights() {
    hemi = new THREE.HemisphereLight(0xfff4e6, 0x6b5a4a, 1.1); scene.add(hemi);
    sun = new THREE.DirectionalLight(0xfff0dc, 1.7);
    sun.castShadow = true; sun.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
    scene.add(sun); scene.add(sun.target);
    fill = new THREE.DirectionalLight(0xcfe3ff, 0.35); fill.position.set(-6, 5, 8); scene.add(fill);
  }
  function lightRoom() {
    var def = cur.def, s = Math.max(def.W, def.D);
    sun.position.set(def.W * 0.35, def.H * 3.2, def.D * 0.9); sun.target.position.set(0, 0, -def.D * 0.1);
    var c = sun.shadow.camera; c.left = -s * 0.75; c.right = s * 0.75; c.top = s * 0.75; c.bottom = -s * 0.75; c.near = 0.5; c.far = s * 5; c.updateProjectionMatrix();
    applyTheme();
  }
  function applyTheme() {
    if (!scene) return;
    scene.background = new THREE.Color(dark ? 0x141a24 : 0xdfe9ee);
    hemi.intensity = dark ? 0.55 : 1.05; hemi.color.set(dark ? 0xb8c4ff : 0xfff4e6); hemi.groundColor.set(dark ? 0x2b2433 : 0x6b5a4a);
    sun.intensity = dark ? 0.55 : 1.7; sun.color.set(dark ? 0x9fb4ff : 0xfff0dc);
    fill.intensity = dark ? 0.15 : 0.35;
  }

  // ---------- Construction d'un lieu ----------
  function setPlace(key, tier) {
    cur.placeKey = key; cur.def = PLACES[key]; cur.tier = tier;
    if (roomG) { world.remove(roomG); disposeTree(roomG); }
    Object.keys(itemNodes).forEach(function (id) { itemsG.remove(itemNodes[id]); });
    itemNodes = {}; blinkers = []; fallbackUsed = 0; cur.key = '';
    Object.keys(staffNodes).forEach(removeStaff);
    deskNodes.forEach(function (d) { world.remove(d); }); deskNodes = [];
    roomG = buildRoom(cur.def, tier); world.add(roomG);
    var def = cur.def;
    var md = desk(roomG, def, def.desk[0], def.desk[1], def.desk[2], key === 'pro' ? 'dark' : key === 'complexe' ? 'white' : null);
    chair(roomG, def.desk[0], def.desk[1] + 0.75, 0, key === 'complexe' ? 0x7d1f2b : 0x2f3a4a);
    if (player) world.remove(player);
    player = person({ s: 1, h: 0, c: 8, y: 3 }, 'sit', { headphones: true, pants: 0x2d2d2d });
    player.position.set(def.desk[0], 0, def.desk[1] + 0.82);
    player.userData.pick = { type: 'player' };
    player.traverse(function (o) { if (o.isMesh) o.userData.pick = player.userData.pick; });
    world.add(player);
    lightRoom(); fitCamera(); applyCam();
  }
  function disposeTree(o) { o.traverse(function (x) { if (x.isLight && x.dispose) x.dispose(); }); }

  function syncDesks(cap) {
    var def = cur.def;
    if (deskNodes.length === cap) return;
    deskNodes.forEach(function (d) { world.remove(d); }); deskNodes = [];
    for (var i = 0; i < Math.min(cap, def.staff.length); i++) { var d = staffDesk(world, def.staff[i][0], def.staff[i][1], i); deskNodes.push(d); }
  }

  function syncItems(v) {
    var key = Object.keys(v.owned).sort().join(',') + '|' + (v.ghosts || []).join(',');
    if (key === cur.key) return;
    var first = cur.key === '';
    cur.key = key;
    var want = {};
    Object.keys(v.owned).forEach(function (id) { want[id] = 'on'; });
    (v.ghosts || []).forEach(function (id) { if (!want[id]) want[id] = 'ghost'; });
    Object.keys(itemNodes).forEach(function (id) {
      var n = itemNodes[id], st = n.userData.ghost ? 'ghost' : 'on';
      if (want[id] !== st) { itemsG.remove(n); delete itemNodes[id]; }
    });
    fallbackUsed = 0;
    Object.keys(want).forEach(function (id) {
      if (itemNodes[id] || id === 'laptop' && false) return;
      var n = buildItem(id, want[id] === 'ghost');
      itemsG.add(n); itemNodes[id] = n;
      if (!first && want[id] === 'on' && !reduce) { n.scale.set(0.01, 0.01, 0.01); anims.push({ n: n, t: 0, d: 0.7 }); sparkle(n.position); }
    });
  }
  function sparkle(pos) {
    for (var i = 0; i < 14; i++) {
      var s = sph(fxG, 0.035, M(0xffe08a, { e: 0xffd166, ei: 2 }), pos.x, pos.y + 0.4, pos.z, 6);
      s.castShadow = false;
      var a = Math.random() * Math.PI * 2, sp = 0.6 + Math.random() * 0.9;
      anims.push({ fx: s, t: 0, d: 0.9, vx: Math.cos(a) * sp, vy: 1.5 + Math.random(), vz: Math.sin(a) * sp });
    }
  }

  // ---------- Pops (gains flottants) ----------
  var pops = [];
  S3.pop = function (text, actId, kind) {
    if (!S3.ok || !overlay) return;
    var anchor = null;
    Object.keys(staffNodes).forEach(function (id) { var n = staffNodes[id]; if (n.act === actId && n.status === 'work') anchor = n.anchor; });
    if (!anchor && player) anchor = new V3(player.position.x, 1.6, player.position.z);
    if (!anchor) return;
    var el = document.createElement('span');
    el.className = 'pop3d' + (kind ? ' ' + kind : ''); el.textContent = text;
    overlay.appendChild(el);
    pops.push({ el: el, p: anchor.clone(), t: 0 });
    while (pops.length > 14) { var o = pops.shift(); if (o.el.parentNode) o.el.parentNode.removeChild(o.el); }
  };
  function updatePops(dt) {
    var v = new V3(), w = canvas.clientWidth, h = canvas.clientHeight;
    for (var i = pops.length - 1; i >= 0; i--) {
      var p = pops[i]; p.t += dt;
      if (p.t > 1.2) { if (p.el.parentNode) p.el.parentNode.removeChild(p.el); pops.splice(i, 1); continue; }
      v.copy(p.p); v.y += p.t * 0.55; v.project(camera);
      p.el.style.transform = 'translate(' + ((v.x + 1) / 2 * w).toFixed(1) + 'px,' + ((1 - v.y) / 2 * h).toFixed(1) + 'px) translate(-50%,-100%)';
      p.el.style.opacity = String(Math.min(1, (1.2 - p.t) * 2.5));
    }
  }

  // ---------- Animation ----------
  var live = {}, anyLive = false;
  function animatePerson(g, t, mode) {
    var p = g.userData.p; if (!p) return;
    var k = reduce ? 0.3 : 1;
    if (mode === 'work') {
      p.armL.rotation.x = 1.05 + Math.sin(t * 13 + p.t) * 0.09 * k;
      p.armR.rotation.x = 1.05 + Math.sin(t * 11.3 + p.t + 1.3) * 0.09 * k;
      p.head.rotation.x = Math.sin(t * 9.2 / 2 + p.t) * 0.06 * k + 0.05;
      p.body.rotation.y = 0;
    } else if (mode === 'rest') {
      p.armL.rotation.x = 0.3; p.armR.rotation.x = 1.4 + Math.sin(t * 0.9 + p.t) * 0.15 * k;
      p.head.rotation.x = -0.1; p.body.rotation.y = Math.sin(t * 0.4 + p.t) * 0.15 * k;
    } else if (mode === 'train') {
      p.armL.rotation.x = 1.2; p.armR.rotation.x = 1.2; p.head.rotation.x = 0.35 + Math.sin(t * 0.7 + p.t) * 0.05 * k;
    } else {
      p.armL.rotation.x = 0.6; p.armR.rotation.x = 0.6;
      p.head.rotation.x = 0; p.head.rotation.y = Math.sin(t * 0.5 + p.t) * 0.35 * k;
      p.body.position.y = (p.sit ? 0.47 : 0.86) + Math.sin(t * 1.6 + p.t) * 0.004;
    }
  }
  function frame(now) {
    requestAnimationFrame(frame);
    if (document.hidden || !S3.ok) return;
    var dt = Math.min(0.1, clock.getDelta()), t = clock.elapsedTime;
    if (player) animatePerson(player, t, anyLive ? 'work' : 'idle');
    Object.keys(staffNodes).forEach(function (id) {
      var n = staffNodes[id]; if (!n.cur) return;
      var mode = n.cur.userData.p.mode;
      animatePerson(n.cur, t, mode === 'work' && !(live[n.act]) ? 'idle' : mode);
      n.gem.rotation.y = t * 1.5; n.gem.position.y = n.anchor.y + 0.12 + Math.sin(t * 2 + n.id) * 0.03;
    });
    for (var b = 0; b < blinkers.length; b++) {
      var bl = blinkers[b], m = bl.m.material;
      if (!bl.own) { bl.m.material = m = m.clone(); bl.own = true; bl.base = m.emissiveIntensity; }
      m.emissiveIntensity = bl.soft ? bl.base * (0.75 + 0.25 * Math.sin(t * 2 + bl.ph)) : (Math.sin(t * 3.1 + bl.ph * 1.7) > -0.2 ? bl.base : 0.1);
    }
    for (var i = anims.length - 1; i >= 0; i--) {
      var a = anims[i]; a.t += dt;
      var f = Math.min(1, a.t / a.d);
      if (a.n) { var e = 1 + 2.7 * Math.pow(f - 1, 3) + 1.7 * Math.pow(f - 1, 2); a.n.scale.setScalar(Math.max(0.01, e)); }
      if (a.fx) { a.fx.position.x += a.vx * dt; a.fx.position.y += a.vy * dt; a.fx.position.z += a.vz * dt; a.vy -= 4 * dt; a.fx.scale.setScalar(0.035 * (1 - f)); }
      if (f >= 1) { if (a.fx) fxG.remove(a.fx); anims.splice(i, 1); }
    }
    // caméra: retour doux vers l'angle de base quand on ne la touche pas
    if (!drag.on && !reduce) { cam.yaw += (cam.yawBase - cam.yaw) * Math.min(1, dt * 0.25) * (Date.now() - drag.last > 6000 ? 1 : 0); }
    applyCam();
    updatePops(dt);
    R.render(scene, camera);
  }

  // ---------- Interaction ----------
  var drag = { on: false, x: 0, y: 0, moved: 0, last: 0, pts: {}, pinch: 0 };
  var ray = null, ndc = null;
  function pick(cx, cy) {
    var r = canvas.getBoundingClientRect();
    ndc.set((cx - r.left) / r.width * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    var hits = ray.intersectObjects([itemsG, staffG, world], true);
    for (var i = 0; i < hits.length; i++) { var u = hits[i].object.userData.pick; if (u) return u; }
    return null;
  }
  function bindInput() {
    canvas.addEventListener('pointerdown', function (e) {
      drag.pts[e.pointerId] = { x: e.clientX, y: e.clientY };
      var ids = Object.keys(drag.pts);
      if (ids.length === 2) { var a = drag.pts[ids[0]], b = drag.pts[ids[1]]; drag.pinch = Math.hypot(a.x - b.x, a.y - b.y); drag.z0 = cam.zoom; }
      drag.on = true; drag.x = e.clientX; drag.y = e.clientY; drag.moved = 0; drag.yaw0 = cam.yaw; drag.pitch0 = cam.pitch;
      try { canvas.setPointerCapture(e.pointerId); } catch (x) { /* facultatif */ }
    });
    canvas.addEventListener('pointermove', function (e) {
      if (!drag.pts[e.pointerId]) return;
      drag.pts[e.pointerId] = { x: e.clientX, y: e.clientY };
      var ids = Object.keys(drag.pts);
      if (ids.length >= 2) {
        var a = drag.pts[ids[0]], b = drag.pts[ids[1]], d = Math.hypot(a.x - b.x, a.y - b.y);
        if (drag.pinch > 0) cam.zoom = Math.max(0.45, Math.min(1.25, drag.z0 * drag.pinch / d));
        drag.moved = 99; return;
      }
      var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      drag.moved = Math.max(drag.moved, Math.abs(dx) + Math.abs(dy));
      if (drag.moved > 6) {
        cam.yaw = Math.max(cam.yawBase - 0.75, Math.min(cam.yawBase + 0.6, drag.yaw0 - dx * 0.006));
        cam.pitch = Math.max(0.35, Math.min(1.05, drag.pitch0 + dy * 0.004));
        drag.last = Date.now();
      }
    });
    function up(e) {
      var wasTap = drag.moved <= 6 && Object.keys(drag.pts).length === 1;
      delete drag.pts[e.pointerId];
      if (!Object.keys(drag.pts).length) { drag.on = false; drag.pinch = 0; drag.last = Date.now(); }
      if (wasTap && e.type === 'pointerup' && pickFn) { var u = pick(e.clientX, e.clientY); pickFn(u, e.clientX, e.clientY); }
    }
    canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('wheel', function (e) { e.preventDefault(); cam.zoom = Math.max(0.45, Math.min(1.25, cam.zoom * (1 + Math.sign(e.deltaY) * 0.08))); drag.last = Date.now(); }, { passive: false });
    canvas.addEventListener('dblclick', function () { cam.zoom = 1; cam.yaw = cam.yawBase; cam.pitch = 0.62; });
  }

  // ---------- API ----------
  S3.init = function (hostEl) {
    host = hostEl;
    if (!THREE) return false;
    try {
      canvas = document.createElement('canvas'); canvas.className = 'scene3d'; canvas.setAttribute('aria-hidden', 'true');
      host.appendChild(canvas);
      overlay = document.createElement('div'); overlay.className = 'scene-overlay'; host.appendChild(overlay);
      mobile = Math.min(window.innerWidth, window.innerHeight) < 700 || /Android|iPhone|iPad/i.test(navigator.userAgent);
      R = new THREE.WebGLRenderer({ canvas: canvas, antialias: !mobile || (window.devicePixelRatio || 1) < 2, powerPreference: 'high-performance', preserveDrawingBuffer: !!root.__pm3dShots });
      R.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.6 : 2));
      R.shadowMap.enabled = true; R.shadowMap.type = THREE.PCFSoftShadowMap;
      R.outputColorSpace = THREE.SRGBColorSpace; R.toneMapping = THREE.ACESFilmicToneMapping; R.toneMappingExposure = 1.05;
      scene = new THREE.Scene();
      camera = new THREE.PerspectiveCamera(30, 1, 0.1, 200);
      cam.target = new V3();
      world = grp(scene); itemsG = grp(world); staffG = grp(world); fxG = grp(world);
      ray = new THREE.Raycaster(); ndc = new THREE.Vector2();
      clock = new THREE.Clock();
      reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
      lights();
      bindInput();
      S3.ok = true;
      S3.resize();
      if (window.ResizeObserver) new ResizeObserver(function () { S3.resize(); }).observe(host);
      else window.addEventListener('resize', S3.resize);
      requestAnimationFrame(frame);
      return true;
    } catch (e) {
      S3.ok = false;
      if (canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas);
      return false;
    }
  };
  S3.resize = function () {
    if (!S3.ok) return;
    var w = Math.max(1, host.clientWidth), h = Math.max(1, host.clientHeight);
    R.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix(); applyOffset();
    cam.pitch = Math.max(0.35, Math.min(1.05, cam.pitch));
    if (cur.def) { fitCamera(); applyCam(); }
  };
  // v: { tier, place, owned, ghosts, cap, staff: [{id, look, role, status, morale, act}], live: {actId: true} }
  S3.update = function (v) {
    if (!S3.ok) return;
    view = v;
    if (v.place !== cur.placeKey || v.tier !== cur.tier) {
      var moved = cur.placeKey && v.place !== cur.placeKey;
      setPlace(v.place, v.tier);
      if (moved && S3.onMove) S3.onMove(v.place);
    }
    syncItems(v);
    syncDesks(v.cap || 0);
    layoutStaff(v.staff);
    live = v.live || {}; anyLive = Object.keys(live).some(function (k) { return live[k] && !(v.staff || []).some(function (m) { return m.act === k && m.status === 'work'; }); });
  };
  S3.setTheme = function (d) { var was = dark; dark = !!d; if (!S3.ok) return; applyTheme(); if (was !== dark && cur.placeKey) { var k = cur.placeKey, t = cur.tier; cur.placeKey = null; S3.update(Object.assign({}, view || {}, { place: k, tier: t })); } };
  S3.onPick = function (fn) { pickFn = fn; };
  S3.setInsets = function (t, b) {
    t = Math.max(0, Math.round(t || 0)); b = Math.max(0, Math.round(b || 0));
    if (t === ins.t && b === ins.b) return;
    ins.t = t; ins.b = b;
    if (!S3.ok) return;
    applyOffset();
    if (cur.def) { fitCamera(); applyCam(); }
  };
  S3.PLACES = PLACES;
  S3._person = person; // tests
  S3.screenOf = function (kind, id) {
    if (!S3.ok) return null;
    var p = null;
    if (kind === 'item' && itemNodes[id]) p = itemNodes[id].getWorldPosition(new V3());
    if (kind === 'staff' && staffNodes[id]) p = staffNodes[id].anchor.clone();
    if (kind === 'player' && player) p = new V3(player.position.x, 1.5, player.position.z);
    if (!p) return null;
    p.project(camera);
    var r = canvas.getBoundingClientRect();
    return { x: r.left + (p.x + 1) / 2 * r.width, y: r.top + (1 - p.y) / 2 * r.height };
  };
  root.Scene3D = S3;
})(typeof window !== 'undefined' ? window : globalThis);
