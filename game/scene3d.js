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
  var souvG = null, souvKey = '', globeNode = null;
  var artistNodes = {}, itemNodes = {}, staffNodes = {}, deskNodes = [], player = null, anims = [], blinkers = [], spinners = [];
  var view = null, pickFn = null, deco = {}, decoKey = '';
  var cam = { yaw: 0.72, pitch: 0.62, zoom: 1, fit: 12, target: null, pan: null, yawBase: 0.72 };
  var ZMIN = 0.28, ZMAX = 2.1, PITCH0 = 0.62, camMoved = false, camFn = null;
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
    else if (kind === 'ico') g = new THREE.IcosahedronGeometry(1, a || 0);
    else if (kind === 'cone') g = new THREE.ConeGeometry(1, 1, a || 8);
    else if (kind === 'circle') g = new THREE.CircleGeometry(1, 20);
    else if (kind === 'prism') g = prismGeo();
    else if (kind === 'rbox') g = rboxGeo(a, b);
    g.userData.cached = true;
    return (GEOS[k] = g);
  }
  // Prisme triangulaire (toits à deux pans): base en y = 0, faîte en y = 1, profondeur sur z.
  function prismGeo() {
    var v = [-0.5, 0, 0.5, 0.5, 0, 0.5, 0, 1, 0.5, 0.5, 0, -0.5, -0.5, 0, -0.5, 0, 1, -0.5], P = [], U = [];
    function tri(a, b, c, uv) { [a, b, c].forEach(function (i, k) { P.push(v[i * 3], v[i * 3 + 1], v[i * 3 + 2]); U.push(uv[k * 2], uv[k * 2 + 1]); }); }
    function quad(a, b, c, d) { tri(a, b, c, [0, 0, 1, 0, 1, 1]); tri(a, c, d, [0, 0, 1, 1, 0, 1]); }
    tri(0, 1, 2, [0, 0, 1, 0, 0.5, 1]); tri(3, 4, 5, [0, 0, 1, 0, 0.5, 1]);
    quad(1, 3, 5, 2); quad(4, 0, 2, 5); quad(4, 3, 1, 0);
    var g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); g.computeVertexNormals();
    return g;
  }
  // Boîte aux arêtes arrondies (taille 1, rayon relatif r): extrusion biseautée d'un rectangle arrondi.
  function rboxGeo(r, seg) {
    r = Math.min(0.45, r || 0.1); seg = seg || 3;
    var a = 0.5 - r, c = Math.min(a * 0.9, r), s = new THREE.Shape(); // contour intérieur; le biseau ajoute r tout autour
    s.moveTo(-a + c, -a); s.lineTo(a - c, -a); s.quadraticCurveTo(a, -a, a, -a + c); s.lineTo(a, a - c); s.quadraticCurveTo(a, a, a - c, a);
    s.lineTo(-a + c, a); s.quadraticCurveTo(-a, a, -a, a - c); s.lineTo(-a, -a + c); s.quadraticCurveTo(-a, -a, -a + c, -a);
    var g = new THREE.ExtrudeGeometry(s, { depth: 1 - 2 * r, bevelEnabled: true, bevelThickness: r, bevelSize: r * 0.98, bevelSegments: seg, curveSegments: seg });
    g.translate(0, 0, -(1 - 2 * r) / 2);
    g.computeVertexNormals();
    return g;
  }
  // Boîte aux arêtes arrondies aux dimensions exactes (lissée), posée avec rb(): y = base.
  var RBG = {};
  function autoSmooth(g, deg) {
    var pos = g.attributes.position, nor = g.attributes.normal, n = pos.count, map = {}, cs = Math.cos((deg || 50) * Math.PI / 180);
    var fn = new Float32Array(n * 3), a = new V3(), b = new V3(), c = new V3(), i, k;
    for (i = 0; i + 2 < n; i += 3) { a.fromBufferAttribute(pos, i); b.fromBufferAttribute(pos, i + 1); c.fromBufferAttribute(pos, i + 2); b.sub(a); c.sub(a); b.cross(c).normalize(); for (k = 0; k < 3; k++) { fn[(i + k) * 3] = b.x; fn[(i + k) * 3 + 1] = b.y; fn[(i + k) * 3 + 2] = b.z; } }
    for (i = 0; i < n; i++) { var key = Math.round(pos.getX(i) * 1e4) + ',' + Math.round(pos.getY(i) * 1e4) + ',' + Math.round(pos.getZ(i) * 1e4); (map[key] = map[key] || []).push(i); }
    Object.keys(map).forEach(function (key) {
      var l = map[key];
      l.forEach(function (i) {
        var sx = 0, sy = 0, sz = 0;
        l.forEach(function (j) { if (fn[i * 3] * fn[j * 3] + fn[i * 3 + 1] * fn[j * 3 + 1] + fn[i * 3 + 2] * fn[j * 3 + 2] > cs) { sx += fn[j * 3]; sy += fn[j * 3 + 1]; sz += fn[j * 3 + 2]; } });
        var L = Math.hypot(sx, sy, sz) || 1; nor.setXYZ(i, sx / L, sy / L, sz / L);
      });
    });
    nor.needsUpdate = true;
  }
  function rbGeo(w, h, d, r) {
    var k = [w, h, d, r].map(function (v) { return Math.round(v * 1000); }).join(',');
    if (RBG[k]) return RBG[k];
    r = Math.max(0.002, Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001));
    var a = w / 2 - r, b = h / 2 - r, c = Math.max(0.0005, Math.min(a, b, r) * 0.8), s = new THREE.Shape(), dep = Math.max(0.0008, d - 2 * r);
    s.moveTo(-a + c, -b); s.lineTo(a - c, -b); s.quadraticCurveTo(a, -b, a, -b + c); s.lineTo(a, b - c); s.quadraticCurveTo(a, b, a - c, b);
    s.lineTo(-a + c, b); s.quadraticCurveTo(-a, b, -a, b - c); s.lineTo(-a, -b + c); s.quadraticCurveTo(-a, -b, -a + c, -b);
    var g = new THREE.ExtrudeGeometry(s, { depth: dep, bevelEnabled: true, bevelThickness: r, bevelSize: r, bevelSegments: 2, curveSegments: 3 });
    g.translate(0, 0, -dep / 2); autoSmooth(g, 52); g.computeBoundingBox(); g.computeBoundingSphere(); g.userData.cached = true;
    return (RBG[k] = g);
  }
  function rb(p, w, h, d, mat, x, y, z, r, ry) { var m = mesh(p, rbGeo(w, h, d, r == null ? Math.min(w, h, d) * 0.2 : r), mat, x, (y || 0) + h / 2, z, 1, 1, 1); if (ry) m.rotation.y = ry; return m; }
  // Matériau texturé teintable (la couleur multiplie la texture): bois, tissu, enduit.
  var TM = {};
  function tintMat(texKey, draw, color, o) {
    o = o || {};
    var k = texKey + '|' + color + '|' + (o.r != null ? o.r : '') + '|' + (o.m || 0);
    if (TM[k]) return TM[k];
    var t = canvasTex(texKey, o.size || 256, o.size || 256, draw, [1, 1]); t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return (TM[k] = new THREE.MeshStandardMaterial({ color: color, map: t, roughness: o.r != null ? o.r : 0.75, metalness: o.m || 0 }));
  }
  function grainDraw(c, w, h) { // fil du bois (gris clair, teinté par la couleur)
    c.fillStyle = '#e9e5df'; c.fillRect(0, 0, w, h); var r = rnd(31);
    for (var i = 0; i < 90; i++) { var y = r() * h, a = 0.05 + r() * 0.12; c.strokeStyle = 'rgba(90,60,30,' + a.toFixed(3) + ')'; c.lineWidth = 0.6 + r() * 2.2; c.beginPath(); c.moveTo(0, y); for (var x = 0; x <= w; x += 12) c.lineTo(x, y + Math.sin(x / (25 + r() * 30) + i) * 2.5); c.stroke(); }
    for (var k = 0; k < 6; k++) { c.strokeStyle = 'rgba(80,50,25,0.12)'; c.lineWidth = 1.2; c.beginPath(); c.ellipse(r() * w, r() * h, 6 + r() * 10, 2 + r() * 3, 0, 0, 6.3); c.stroke(); }
  }
  function fabricDraw(c, w, h) { // trame de tissu
    c.fillStyle = '#ebebeb'; c.fillRect(0, 0, w, h); var r = rnd(37);
    for (var y = 0; y < h; y += 3) for (var x = 0; x < w; x += 3) { var l = 215 + Math.floor(r() * 40); c.fillStyle = 'rgb(' + l + ',' + l + ',' + l + ')'; c.fillRect(x + ((y / 3) % 2), y, 2, 2); }
  }
  function plasterDraw(c, w, h) { // enduit mural très léger
    c.fillStyle = '#f6f6f6'; c.fillRect(0, 0, w, h); var r = rnd(41);
    for (var i = 0; i < 1600; i++) { var l = 228 + Math.floor(r() * 27); c.fillStyle = 'rgba(' + l + ',' + l + ',' + l + ',0.6)'; c.fillRect(r() * w, r() * h, 2 + r() * 5, 2 + r() * 5); }
  }
  function grilleDraw(c, w, h) { c.fillStyle = '#2a2b2e'; c.fillRect(0, 0, w, h); c.fillStyle = '#6d7076'; for (var y = 2; y < h; y += 5) for (var x = 2 + (y % 10 ? 2 : 0); x < w; x += 5) { c.beginPath(); c.arc(x, y, 1.3, 0, 6.3); c.fill(); } }
  function kbDraw(c, w, h) { c.fillStyle = '#2b2d31'; c.fillRect(0, 0, w, h); c.fillStyle = '#44474d'; var rows = 5, kw = w / 14, kh = h / rows; for (var y = 0; y < rows; y++) for (var x = 0; x < 14; x++) { if (y === 4 && x > 3 && x < 10) { if (x === 4) c.fillRect(4 * kw + 2, y * kh + 2, kw * 6 - 4, kh - 4); continue; } c.fillRect(x * kw + 2, y * kh + 2, kw - 4, kh - 4); } }
  function foamDraw(c, w, h) { // mousse acoustique en dièdres: bandes ombrées alternées
    var n = 8, bw = w / n;
    for (var i = 0; i < n; i++) {
      var g = c.createLinearGradient(i * bw, 0, (i + 1) * bw, 0); g.addColorStop(0, '#c9c9c9'); g.addColorStop(0.5, '#ffffff'); g.addColorStop(0.52, '#8f8f8f'); g.addColorStop(1, '#b5b5b5');
      c.fillStyle = g; c.fillRect(i * bw, 0, bw, h);
    }
    var r = rnd(51); for (var k = 0; k < 600; k++) { c.fillStyle = 'rgba(0,0,0,' + (r() * 0.08).toFixed(3) + ')'; c.fillRect(r() * w, r() * h, 2, 2); }
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
  // Personnage stylisé mais proportionné: jambes et bras articulés (genou, coude), cou, visage, mains.
  // Environ 25 petits maillages partagés (géométries et matériaux en cache): léger même avec une grande équipe.
  // Le personnage regarde vers -z. Rotation x positive d'un membre: il part vers l'avant.
  var HIP_STAND = 0.72, HIP_SIT = 0.55;
  function person(look, pose, opts) {
    opts = opts || {};
    var g = grp(null), skin = M(SKIN[look.s % 8]), hair = M(HAIR[look.h % 8]), shirt = M(SHIRT[look.c % 16]), pants = M(opts.pants || 0x3b4a63);
    var shoe = M(0x23252a), dark = M(0x1b1b1b, { r: 0.4 });
    var sit = pose === 'sit', hip = sit ? HIP_SIT : HIP_STAND;
    // jambes: cuisse (pivot à la hanche) puis tibia (pivot au genou) et chaussure
    function leg(side) {
      var th = grp(g, side * 0.085, hip, 0);
      mesh(th, G('cap', 0.07, 0.22), pants, 0, -0.18, 0, 1, 1, 1);
      var sh = grp(th, 0, -0.36, 0);
      mesh(sh, G('cap', 0.057, 0.24), pants, 0, -0.16, 0, 1, 1, 1);
      var ft = grp(sh, 0, -0.31, 0);
      mesh(ft, G('cap', 0.05, 0.12), shoe, 0, 0.0, -0.045, 1.15, 1, 1).rotation.x = Math.PI / 2;
      // assis: cuisses légèrement inclinées vers le genou, tibias à la verticale jusqu'au sol
      if (sit) { th.rotation.x = 1.3; sh.rotation.x = -1.3; sh.scale.y = 1.2; ft.scale.y = 1 / 1.2; }
      return { th: th, sh: sh };
    }
    var legL = leg(-1), legR = leg(1);
    var body = grp(g, 0, hip, 0);
    // bassin (pantalon), buste (haut), épaules arrondies
    mesh(body, G('cap', 0.13, 0.08), pants, 0, 0.04, 0, 1.12, 1, 0.76);
    mesh(body, G('cap', 0.15, 0.2), shirt, 0, 0.29, 0, 1.18, 1, 0.74);
    mesh(body, G('cap', 0.07, 0.3), shirt, 0, 0.45, 0, 1, 1, 0.9).rotation.z = Math.PI / 2;
    cyl(body, 0.048, 0.08, skin, 0, 0.5, 0, 10);
    var head = grp(body, 0, 0.7, 0);
    sph(head, 0.13, skin, 0, 0, 0).scale.set(0.125, 0.14, 0.13);
    // visage: yeux, sourcils, nez, oreilles
    mesh(head, G('sph', 8, 6), dark, -0.045, 0.012, -0.117, 0.017, 0.022, 0.012, false);
    mesh(head, G('sph', 8, 6), dark, 0.045, 0.012, -0.117, 0.017, 0.022, 0.012, false);
    box(head, 0.045, 0.012, 0.01, hair, -0.047, 0.045, -0.118).castShadow = false;
    box(head, 0.045, 0.012, 0.01, hair, 0.047, 0.045, -0.118).castShadow = false;
    mesh(head, G('sph', 8, 6), skin, 0, -0.02, -0.13, 0.022, 0.03, 0.022, false);
    mesh(head, G('sph', 8, 6), skin, -0.125, 0, 0.005, 0.02, 0.035, 0.028, false);
    mesh(head, G('sph', 8, 6), skin, 0.125, 0, 0.005, 0.02, 0.035, 0.028, false);
    var hs = look.y % 4, top;
    if (hs === 3) { // casquette
      var capC = M(SHIRT[(look.c + 5) % 16]);
      top = sph(head, 0.14, capC, 0, 0.045, 0.01); top.scale.set(0.138, 0.11, 0.142);
      box(head, 0.19, 0.018, 0.12, capC, 0, 0.055, -0.15);
    } else {
      top = sph(head, 0.14, hair, 0, 0.035, 0.022); top.scale.set(0.136, 0.125, 0.135);
      if (hs === 1) mesh(head, G('cap', 0.1, 0.16), hair, 0, -0.1, 0.07, 1.25, 1, 0.55); // cheveux longs
      else if (hs === 2) sph(head, 0.065, hair, 0, 0.1, 0.1); // chignon
    }
    if (opts.headphones) { mesh(head, G('tor', 0.15, 0.016, 16), M(C.black), 0, 0.03, 0, 1, 1, 1); cyl(head, 0.05, 0.045, M(C.black), -0.14, -0.03, 0).rotation.z = Math.PI / 2; cyl(head, 0.05, 0.045, M(C.black), 0.14, -0.03, 0).rotation.z = Math.PI / 2; }
    // bras: épaule -> coude -> main
    function arm(side) {
      var a = grp(body, side * 0.205, 0.46, 0);
      mesh(a, G('cap', 0.05, 0.16), shirt, 0, -0.12, 0, 1, 1, 1);
      var f = grp(a, 0, -0.25, 0);
      mesh(f, G('cap', 0.042, 0.15), skin, 0, -0.1, 0, 1, 1, 1);
      mesh(f, G('sph', 10, 8), skin, 0, -0.22, -0.005, 0.046, 0.055, 0.04, false);
      return { a: a, f: f };
    }
    var aL = arm(-1), aR = arm(1);
    if (opts.mic) { cyl(aR.f, 0.017, 0.12, M(C.black), 0, -0.34, -0.01, 10); sph(aR.f, 0.038, M(0x9aa0a8, { m: 0.7, r: 0.35 }), 0, -0.36, -0.01, 10); }
    g.userData.p = { body: body, head: head, armL: aL.a, armR: aR.a, foreL: aL.f, foreR: aR.f, legL: legL, legR: legR, sit: sit, hip: hip, t: Math.random() * 10 };
    pose3(g.userData.p, 0.08, 0.15, 0.08, 0.15);
    return g;
  }
  // Pose des bras: épaule (x), coude (x), écart (z) des deux côtés.
  // fzL / fzR: l'avant-bras pivote vers l'intérieur (bras croisés, micro vers la bouche).
  function pose3(p, aL, fL, aR, fR, zL, zR, fzL, fzR) {
    p.armL.rotation.set(aL, 0, zL || 0.06); p.foreL.rotation.set(fL, 0, fzL || 0);
    p.armR.rotation.set(aR, 0, zR || -0.06); p.foreR.rotation.set(fR, 0, fzR || 0);
  }
  function chair(p, x, z, ry, col) {
    var g = grp(p, x, 0, z, ry || 0), m = tintMat('fab', fabricDraw, col || C.plastic, { r: 0.9 }), met = M(0x9aa1a8, { m: 0.75, r: 0.3 }), blk = M(0x1d1e21, { r: 0.6 });
    // piètement cinq branches et roulettes
    for (var i = 0; i < 5; i++) { var a = i / 5 * Math.PI * 2, arm = rb(g, 0.045, 0.035, 0.27, blk, Math.sin(a) * 0.13, 0.04, Math.cos(a) * 0.13, 0.012); arm.rotation.y = a; sph(g, 0.028, blk, Math.sin(a) * 0.26, 0.03, Math.cos(a) * 0.26, 8).castShadow = false; }
    cyl(g, 0.045, 0.08, blk, 0, 0.03, 0, 12); cyl(g, 0.022, 0.3, met, 0, 0.1, 0, 10);
    // assise et dossier rembourrés
    rb(g, 0.5, 0.09, 0.48, m, 0, 0.4, 0, 0.04);
    var bk = rb(g, 0.46, 0.5, 0.075, m, 0, 0.55, 0.24, 0.035); bk.rotation.x = -0.08;
    rb(g, 0.06, 0.16, 0.05, blk, 0, 0.44, 0.24, 0.012);
    [-1, 1].forEach(function (sd) { rb(g, 0.04, 0.18, 0.04, blk, sd * 0.24, 0.45, 0.02, 0.01); rb(g, 0.07, 0.03, 0.26, blk, sd * 0.24, 0.62, 0.02, 0.012); });
    return g;
  }

  // ---------- Équipements ----------
  // Chaque modèle est construit autour de son origine, face avant vers +z.
  var MODELS = {
    laptop: function (p) {
      var alu = M(0xc4c8cd, { m: 0.65, r: 0.32 });
      rb(p, 0.34, 0.018, 0.24, alu, 0, 0, 0, 0.007);
      box(p, 0.3, 0.003, 0.12, texMat('kb', 256, 96, kbDraw), 0, 0.018, -0.03).castShadow = false;
      rb(p, 0.11, 0.003, 0.06, M(0xb5b9be, { m: 0.5, r: 0.25 }), 0, 0.017, 0.075, 0.001).castShadow = false;
      var s2 = grp(p, 0, 0.02, -0.115); s2.rotation.x = -0.28;
      rb(s2, 0.34, 0.23, 0.012, alu, 0, -0.005, 0, 0.006);
      box(s2, 0.31, 0.2, 0.004, texMat('daw', 256, 128, daw, { glow: 0.65 }), 0, 0.012, 0.006);
    },
    daw: function (p) {
      var blk = M(0x1c1d20, { m: 0.3, r: 0.35 });
      var base = cyl(p, 0.1, 0.012, blk, 0, 0, -0.05, 24); base.scale.set(0.13, 0.012, 0.08);
      rb(p, 0.05, 0.24, 0.025, M(0x9aa1a8, { m: 0.7, r: 0.3 }), 0, 0.005, -0.075, 0.01);
      rb(p, 0.68, 0.4, 0.03, blk, 0, 0.18, -0.06, 0.012);
      box(p, 0.64, 0.36, 0.004, texMat('daw', 256, 128, daw, { glow: 0.7 }), 0, 0.2, -0.043).castShadow = false;
    },
    plugins: function (p) {
      var blk = M(0x1c1d20, { m: 0.3, r: 0.35 });
      var base = cyl(p, 0.09, 0.012, blk, 0, 0, -0.05, 24); base.scale.set(0.11, 0.012, 0.07);
      rb(p, 0.045, 0.22, 0.025, M(0x9aa1a8, { m: 0.7, r: 0.3 }), 0, 0.005, -0.075, 0.01);
      rb(p, 0.52, 0.33, 0.028, blk, 0, 0.16, -0.06, 0.012);
      box(p, 0.48, 0.29, 0.004, texMat('plug', 256, 150, plug, { glow: 0.7 }), 0, 0.18, -0.044).castShadow = false;
    },
    clavier: function (p) {
      rb(p, 0.78, 0.055, 0.24, M(0x2a2c31, { r: 0.45 }), 0, 0, 0, 0.018);
      box(p, 0.62, 0.012, 0.15, texMat('keys', 256, 64, keys), 0.06, 0.05, 0.04).castShadow = false;
      rb(p, 0.04, 0.02, 0.1, M(0x111214), -0.33, 0.05, 0.03, 0.008); rb(p, 0.04, 0.02, 0.1, M(0x111214), -0.28, 0.05, 0.03, 0.008);
      for (var i = 0; i < 4; i++) cyl(p, 0.013, 0.022, M(C.orange, { r: 0.4 }), -0.1 + i * 0.05, 0.055, -0.08, 12);
      box(p, 0.09, 0.004, 0.03, M(0x6cf, { e: 0x66ccff, ei: 0.9 }), -0.3, 0.056, -0.07).castShadow = false;
    },
    interface: function (p) {
      rb(p, 0.24, 0.07, 0.16, M(C.red, { r: 0.35, m: 0.25 }), 0, 0, 0, 0.012);
      box(p, 0.22, 0.004, 0.14, M(0xc0392b, { r: 0.3, m: 0.4 }), 0, 0.068, 0).castShadow = false;
      for (var i = 0; i < 3; i++) { cyl(p, 0.022, 0.028, M(0x1b1c1f, { r: 0.4 }), -0.07 + i * 0.07, 0.07, 0.01, 18); cyl(p, 0.004, 0.03, M(0xffffff), -0.07 + i * 0.07, 0.072, -0.008, 4).castShadow = false; }
      for (var k = 0; k < 2; k++) box(p, 0.035, 0.006, 0.012, M(k ? 0xf2c14e : 0x5be07a, { e: k ? 0xf2c14e : 0x5be07a, ei: 1.4 }), 0.05 + k * 0.04, 0.072, -0.06);
      [-0.06, 0.02].forEach(function (x) { cyl(p, 0.016, 0.012, M(0x111111), x, 0.03, 0.081, 12).rotation.x = Math.PI / 2; });
    },
    samples: function (p) {
      box(p, 0.26, 0.04, 0.26, M(0x2a2c31), 0, 0, 0);
      var cols = [C.orange, C.teal, C.purple, C.yellow];
      for (var i = 0; i < 16; i++) { var x = (i % 4) - 1.5, z = Math.floor(i / 4) - 1.5; var m = box(p, 0.045, 0.012, 0.045, M(cols[(i + Math.floor(i / 4)) % 4], { e: cols[(i + Math.floor(i / 4)) % 4], ei: 0.5 }), x * 0.058, 0.04, z * 0.058); if (i % 5 === 0) blinkers.push({ m: m, ph: i }); }
    },
    casque: function (p) {
      var g = grp(p, 0, 0.075, 0); g.rotation.x = -Math.PI / 2;
      var blk = M(0x1d1e21, { r: 0.45 }), pad = tintMat('fab', fabricDraw, 0x2a2b2f, { r: 0.95 });
      mesh(g, G('tor', 0.11, 0.013, 18), blk, 0, 0, 0);
      mesh(g, G('tor', 0.105, 0.02, 18), pad, 0, 0.005, 0).scale.set(1, 1, 0.6);
      [-1, 1].forEach(function (sd) {
        var cup = cyl(g, 0.052, 0.04, M(0x34363b, { m: 0.4, r: 0.35 }), sd * 0.115, -0.025, 0, 20); cup.rotation.z = Math.PI / 2;
        var cu = mesh(g, G('ring', 0.04, 0.016, 18), pad, sd * 0.09, -0.005, 0, 1, 1, 1); cu.rotation.y = Math.PI / 2;
      });
    },
    mastering: function (p) {
      for (var i = 0; i < 3; i++) {
        box(p, 0.34, 0.075, 0.22, M(i === 1 ? 0xb8bcc2 : 0x2b2e33, { m: 0.5, r: 0.4 }), 0, i * 0.08, 0);
        box(p, 0.08, 0.03, 0.005, M(0x6cf, { e: 0x66ccff, ei: 1.2 }), -0.08, i * 0.08 + 0.025, 0.112);
        box(p, 0.04, 0.03, 0.005, M(0xff8a3d, { e: 0xff8a3d, ei: 1.2 }), 0.08, i * 0.08 + 0.025, 0.112);
      }
    },
    moniteurs: function (p, w) {
      var half = (w || 1.9) / 2 + 0.28, cab = M(0x1c1d20, { r: 0.45 }), ring = M(0x0f1012, { r: 0.6 }), cone = M(0xd9d9d9, { r: 0.55, m: 0.1 }), dome = M(0xe6e6e6, { m: 0.5, r: 0.25 });
      [-1, 1].forEach(function (s2) {
        var g = grp(p, s2 * half, 0, 0.0);
        cyl(g, 0.15, 0.02, M(C.black), 0, -0.75, 0, 20); cyl(g, 0.025, 0.85, M(C.metal, { m: 0.7, r: 0.3 }), 0, -0.75, 0, 10);
        rb(g, 0.2, 0.03, 0.2, M(C.black), 0, -0.1, 0, 0.008);
        g.rotation.y = -s2 * 0.35;
        rb(g, 0.24, 0.36, 0.26, cab, 0, -0.1, 0, 0.025);
        var w1 = mesh(g, G('ring', 0.074, 0.012, 22), ring, 0, 0.0, 0.131, 1, 1, 1); w1.position.y = -0.1 + 0.13;
        var cn = mesh(g, G('cone', 22), cone, 0, -0.1 + 0.13, 0.115, 0.068, 0.03, 0.068); cn.rotation.x = -Math.PI / 2;
        sph(g, 0.022, M(0x26272b, { r: 0.4 }), 0, -0.1 + 0.13, 0.13, 10).scale.set(0.022, 0.022, 0.012);
        mesh(g, G('ring', 0.03, 0.008, 18), ring, 0, -0.1 + 0.29, 0.131, 1, 1, 1);
        sph(g, 0.018, dome, 0, -0.1 + 0.29, 0.128, 12).scale.set(0.02, 0.02, 0.012);
        box(g, 0.012, 0.008, 0.004, M(0x6cff9a, { e: 0x6cff9a, ei: 1.5 }), 0.08, -0.1 + 0.035, 0.131).castShadow = false;
        var port = cyl(g, 0.02, 0.01, M(0x050505), 0.06, -0.1 + 0.32, 0.131, 12); port.rotation.x = Math.PI / 2;
      });
    },
    micro: function (p) {
      var met = M(0x2d2f33, { m: 0.6, r: 0.35 });
      cyl(p, 0.17, 0.03, met, 0, 0, 0, 24); cyl(p, 0.016, 1.45, M(C.metal, { m: 0.75, r: 0.25 }), 0, 0, 0, 10);
      var b = grp(p, 0, 1.45, 0); b.rotation.x = 0.5;
      rb(b, 0.024, 0.024, 0.42, met, 0, -0.012, 0.15, 0.008);
      mesh(b, G('ring', 0.06, 0.006, 20), met, 0, -0.02, 0.36, 1, 1, 1).rotation.x = Math.PI / 2;
      cyl(b, 0.042, 0.13, M(0xc9b27c, { m: 0.7, r: 0.28 }), 0, -0.08, 0.36, 18);
      var gr = sph(b, 0.046, tintMat('grille', grilleDraw, 0xffffff, { r: 0.4, m: 0.6, size: 64 }), 0, 0.075, 0.36, 18); gr.scale.set(0.046, 0.06, 0.046);
      cyl(b, 0.047, 0.012, M(0xc9b27c, { m: 0.7, r: 0.28 }), 0, 0.04, 0.36, 18);
      mesh(b, G('ring', 0.09, 0.008, 24), M(0x111111), 0, 0.06, 0.52, 1, 1, 1).rotation.x = 0;
      mesh(b, G('cyl', 1, 1, 24), M(0x111111, { op: 0.45 }), 0, 0.06, 0.52, 0.085, 0.004, 0.085, false).rotation.x = Math.PI / 2;
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
      [-0.72, 0.72].forEach(function (x) { rb(p, 0.08, 0.75, 0.75, tintMat('grain', grainDraw, 0x7a5236, { r: 0.55 }), x, 0, 0, 0.02); });
      rb(p, 1.36, 0.6, 0.6, M(0x26282c, { r: 0.6 }), 0, 0, -0.05, 0.02);
      var top = grp(p, 0, 0.78, 0); top.rotation.x = 0.22;
      rb(top, 1.55, 0.08, 0.8, M(0x2f3238, { r: 0.45, m: 0.2 }), 0, -0.04, 0, 0.02);
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
      var w = 2.0, d = 1.9, h = 2.3, wall = M(0x3d4250, { r: 0.55 }), trim = M(0x2a2e38, { r: 0.4, m: 0.3 }), foam = tintMat('foam', foamDraw, 0x5a4a6b, { r: 0.98, size: 128 });
      rb(p, w, h, 0.08, wall, 0, 0, -d / 2, 0.02);
      rb(p, 0.08, h, d, wall, -w / 2, 0, 0, 0.02);
      rb(p, 0.08, h, d, wall, w / 2, 0, 0, 0.02);
      rb(p, w + 0.08, 0.08, d, wall, 0, h, 0, 0.025);
      rb(p, w * 0.45, h, 0.08, wall, -w * 0.275, 0, d / 2, 0.02);
      mesh(p, G('box'), M(0xbfe6ff, { op: 0.24, r: 0.05 }), w * 0.225, h / 2 + 0.2, d / 2, w * 0.55, h * 0.6, 0.03, false);
      rb(p, w * 0.55, 0.06, 0.1, trim, w * 0.225, h * 0.8 + 0.15, d / 2, 0.015);
      rb(p, w * 0.55, 0.25, 0.08, wall, w * 0.225, 0, d / 2, 0.015);
      rb(p, 0.05, h * 0.6, 0.1, trim, w / 2 - 0.03, h * 0.2 + 0.25, d / 2, 0.012);
      rb(p, 0.03, 0.22, 0.04, M(0xc9ccd1, { m: 0.85, r: 0.2 }), -w * 0.06, 1.0, d / 2 + 0.05, 0.012);
      for (var i = 0; i < 6; i++) rb(p, 0.4, 0.4, 0.06, foam, -0.6 + (i % 3) * 0.5, 0.9 + Math.floor(i / 3) * 0.5, -d / 2 + 0.06, 0.01);
      for (var j = 0; j < 4; j++) { var sf = rb(p, 0.06, 0.4, 0.4, foam, -w / 2 + 0.07, 0.9 + Math.floor(j / 2) * 0.5, -0.45 + (j % 2) * 0.5, 0.01); }
      var mic = grp(p, 0, 0, -0.2); MODELS.micro(mic);
      cyl(p, 0.14, 0.03, M(0xfff1d6, { e: 0xffd28a, ei: 1.2 }), 0, h - 0.03, 0, 18);
      rb(p, 0.6, 0.2, 0.05, M(0xff4d6d, { e: 0xff4d6d, ei: 1.3 }), 0, h + 0.08, d / 2 + 0.02, 0.02);
    },
    orchestre: function (p) {
      var gloss = M(0x0d0e10, { r: 0.12, m: 0.15 }), gold = M(0xc9a24a, { m: 0.8, r: 0.3 }), felt = M(0x7a1f26, { r: 0.9 });
      // caisse vue de dessus: côté droit en courbe, queue arrondie
      var sh = new THREE.Shape(), pts = function (k) { var q = new THREE.Path(); q.moveTo(-0.725 * k, -0.95 * k); q.lineTo(0.725 * k, -0.95 * k); q.lineTo(0.725 * k, -0.35 * k); q.quadraticCurveTo(0.725 * k, 0.1 * k, 0.3 * k, 0.4 * k); q.quadraticCurveTo(0.05 * k, 0.6 * k, -0.2 * k, 0.95 * k); q.lineTo(-0.725 * k, 0.95 * k); q.closePath(); return q; };
      sh.curves = pts(1).curves; sh.currentPoint = pts(1).currentPoint;
      function slab(k, depth, mat, y, hole) {
        var s2 = new THREE.Shape(); s2.curves = pts(k).curves;
        if (hole) s2.holes.push(pts(hole));
        var gg = new THREE.ExtrudeGeometry(s2, { depth: depth, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 1, curveSegments: 10 });
        gg.rotateX(-Math.PI / 2); autoSmooth(gg, 40);
        var m = new THREE.Mesh(gg, mat); m.position.y = y; m.castShadow = true; m.receiveShadow = true; p.add(m); return m;
      }
      slab(1, 0.22, gloss, 0.64); slab(0.93, 0.005, gold, 0.85); slab(1, 0.07, gloss, 0.86, 0.93);
      var lid = grp(p, -0.725, 0.94, 0); lid.rotation.z = 0.6;
      var ls = new THREE.Shape(); ls.curves = pts(1).curves; var lg = new THREE.ExtrudeGeometry(ls, { depth: 0.02, bevelEnabled: false, curveSegments: 10 }); lg.rotateX(-Math.PI / 2);
      var lm = new THREE.Mesh(lg, gloss); lm.position.x = 0.725; lm.castShadow = true; lid.add(lm);
      cyl(p, 0.008, 0.7, M(C.black), 0.35, 0.92, 0.25, 6).rotation.z = 0.35;
      // clavier, joues et pupitre
      rb(p, 1.42, 0.08, 0.26, gloss, 0, 0.74, 1.0, 0.02);
      box(p, 1.26, 0.025, 0.17, texMat('keys', 256, 64, keys), 0, 0.82, 1.03).castShadow = false;
      rb(p, 0.08, 0.1, 0.26, gloss, -0.67, 0.78, 1.0, 0.02); rb(p, 0.08, 0.1, 0.26, gloss, 0.67, 0.78, 1.0, 0.02);
      box(p, 1.26, 0.03, 0.02, felt, 0, 0.83, 0.94).castShadow = false;
      var desk2 = rb(p, 0.7, 0.24, 0.02, gloss, 0, 0.93, 0.86, 0.008); desk2.rotation.x = -0.25;
      // pieds galbés, lyre et pédales
      [[-0.6, 0.95], [0.6, 0.95], [-0.45, -0.8]].forEach(function (l) { cyl(p, 0.06, 0.64, gloss, l[0], 0, l[1], 12, 0.045); cyl(p, 0.035, 0.03, gold, l[0], 0, l[1], 10); });
      rb(p, 0.12, 0.5, 0.04, gloss, 0, 0.14, 0.82, 0.015);
      [-0.04, 0, 0.04].forEach(function (x) { rb(p, 0.025, 0.012, 0.08, gold, x, 0.04, 0.86, 0.004); });
      // banquette capitonnée
      rb(p, 0.6, 0.06, 0.35, felt, 0, 0.45, 1.4, 0.03);
      rb(p, 0.62, 0.05, 0.36, gloss, 0, 0.4, 1.4, 0.015);
      [[-0.26, 1.25], [0.26, 1.25], [-0.26, 1.55], [0.26, 1.55]].forEach(function (l) { cyl(p, 0.025, 0.4, gloss, l[0], 0, l[1], 8, 0.02); });
    },
    assistant: function (p) {
      rb(p, 0.62, 2.0, 0.7, M(0x1d1f24, { m: 0.35, r: 0.45 }), 0, 0, 0, 0.02);
      box(p, 0.58, 1.9, 0.01, tintMat('grille', grilleDraw, 0x8a8f99, { r: 0.5, m: 0.5, size: 64 }), 0, 0.05, 0.352).castShadow = false;
      for (var i = 0; i < 9; i++) {
        for (var k = 0; k < 5; k++) { var led = box(p, 0.025, 0.025, 0.01, M(k % 2 ? 0x6cff9a : 0x66ccff, { e: k % 2 ? 0x6cff9a : 0x66ccff, ei: 1.6 }), -0.2 + k * 0.05, 0.24 + i * 0.2, 0.36); if ((i + k) % 3 === 0) blinkers.push({ m: led, ph: i * 1.7 + k }); }
      }
      rb(p, 0.03, 0.4, 0.03, M(0xc9ccd1, { m: 0.85, r: 0.2 }), 0.26, 0.9, 0.37, 0.01);
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
      var kit = grp(p, -0.2, 0, -0.6); kit.name = 'kit';
      var shell = M(0xb3262f, { r: 0.18, m: 0.25 }), chrome = M(0xd9dde2, { m: 0.85, r: 0.2 }), head = M(0xf2efe8, { r: 0.6 }), bronze = M(0xd4a640, { m: 0.85, r: 0.28 });
      // grosse caisse couchée: fût, cercles chromés, peau avant
      var kick = grp(kit, 0, 0.3, 0); kick.rotation.x = Math.PI / 2;
      cyl(kick, 0.3, 0.42, shell, 0, -0.21, 0, 24); [-0.21, 0.21].forEach(function (y) { mesh(kick, G('ring', 0.3, 0.018, 28), chrome, 0, y, 0, 1, 1, 1).rotation.x = Math.PI / 2; });
      cyl(kick, 0.29, 0.005, head, 0, 0.21, 0, 24); cyl(kick, 0.1, 0.006, M(0x1b1b1b), 0, 0.214, 0, 18);
      // toms et caisse claire: fûts, peaux, cercles
      [[-0.45, 0.6, 0.2, 0.18, 0.2], [0.45, 0.62, 0.2, 0.2, 0.18], [0.2, 0.75, -0.05, 0.15, 0.17], [-0.15, 0.78, -0.05, 0.14, 0.15]].forEach(function (t, i) {
        cyl(kit, t[3], t[4], i === 0 ? M(0xc0c4ca, { m: 0.8, r: 0.25 }) : shell, t[0], t[1], t[2], 20);
        cyl(kit, t[3] - 0.005, 0.005, head, t[0], t[1] + t[4], t[2], 20);
        mesh(kit, G('ring', t[3], 0.012, 22), chrome, t[0], t[1] + t[4], t[2], 1, 1, 1).rotation.x = Math.PI / 2;
        cyl(kit, 0.012, t[1], chrome, t[0], 0, t[2] + 0.02, 6);
      });
      // cymbales sur pied, charleston
      [[-0.6, 1.1], [0.65, 1.15]].forEach(function (c) { cyl(kit, 0.012, c[1], chrome, c[0], 0, -0.1, 6); [0, 2.1, 4.2].forEach(function (a) { var lg = cyl(kit, 0.008, 0.3, chrome, c[0] + Math.sin(a) * 0.1, 0, -0.1 + Math.cos(a) * 0.1, 4); lg.rotation.set(Math.cos(a) * 0.5, 0, -Math.sin(a) * 0.5); }); var cy = cyl(kit, 0.24, 0.012, bronze, c[0], c[1], -0.1, 26, 0.02); cy.rotation.z = 0.12; });
      cyl(kit, 0.012, 0.8, chrome, -0.75, 0, 0.35, 6); cyl(kit, 0.17, 0.01, bronze, -0.75, 0.8, 0.35, 22, 0.02); cyl(kit, 0.17, 0.01, bronze, -0.75, 0.83, 0.35, 22, 0.02);
      chair(kit, 0, -0.6, Math.PI, 0x222222);
      box(p, 0.6, 0.6, 0.35, M(0x222222), 1.1, 0, -1.2); box(p, 0.5, 0.35, 0.01, M(0x8a7a5a), 1.1, 0.15, -1.02);
      sph(p, 0.0001, M(0xffffff), 0, 0, 0);
      var gt = grp(p, -1.2, 0, 0.6); MODELS.micro(gt);
    },
    management: function (p) {
      var t = M(0xf4f1ea, { r: 0.3 });
      var top = cyl(p, 1, 0.05, t, 0, 0.72, 0, 40); top.scale.set(1.2, 0.05, 0.62);
      var rim = cyl(p, 1, 0.02, M(0xd9d4ca, { r: 0.4 }), 0, 0.7, 0, 40); rim.scale.set(1.18, 0.02, 0.6);
      [-0.5, 0.5].forEach(function (x) { cyl(p, 0.06, 0.7, M(C.metal, { m: 0.8, r: 0.25 }), x, 0, 0, 14); var ft = cyl(p, 0.25, 0.03, M(C.metal, { m: 0.8, r: 0.25 }), x, 0, 0, 20); ft.scale.set(0.25, 0.03, 0.4); });
      [[-0.6, -0.95, Math.PI], [0.6, -0.95, Math.PI], [-0.6, 0.95, 0], [0.6, 0.95, 0], [-1.5, 0, -Math.PI / 2], [1.5, 0, Math.PI / 2]].forEach(function (c) { chair(p, c[0], c[1], c[2], 0x3a3f4a); });
      var lp = grp(p, 0.2, 0.77, 0.1); MODELS.laptop(lp);
      box(p, 0.2, 0.01, 0.28, M(0xffffff), -0.4, 0.77, 0.05, 0.3);
    },
    neve: function (p) {
      [-1.25, 1.25].forEach(function (x) { rb(p, 0.12, 0.8, 1.0, tintMat('grain', grainDraw, 0x8a5430, { r: 0.4 }), x, 0, 0, 0.025); });
      rb(p, 2.4, 0.7, 0.9, M(0x23262c), 0, 0, 0.02, 0.02);
      var top = grp(p, 0, 0.82, 0); top.rotation.x = 0.25;
      rb(top, 2.5, 0.08, 1.0, M(0x3a4a66, { m: 0.25, r: 0.4 }), 0, -0.04, 0, 0.025);
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
  // Agencement vérifié par un test de collisions (boîtes englobantes) avec tout le matériel et toute l'équipe.
  // sofas: [x, z, rotY, couleur, largeur]; rotY = 0: assise tournée vers le fond de la pièce, -PI/2: dos au mur de gauche.
  var PLACES = {
    chambre: { win: [[0.9, 1.25, 1.2, 0.95]], artists: [[0.3, 0.75, Math.PI]], shelf: [-1.45, 1.55], neon: [0.45, 2.02], edrums: [2.68, -0.42, -Math.PI / 2], W: 6.4, D: 5, H: 2.7, floor: ['wood', '#b98a5e', '#9c6f48'], wall: 0x9cc3d5, wall2: 0xb7d3df, desk: [1.15, -2.13, 1.9],
      staff: [[2.1, 0.75]], lounge: [[-1.95, -1.0, -Math.PI / 2]], board: [-1.0, -1.55],
      slots: { micro: [-0.45, -1.35, 0.4], formation: [-1.0, -2.33, 0], distrib: { w: 'b', u: -1.0, y: 2.5 }, playlists: { w: 'b', u: -2.5, y: 2.45 } },
      foam: [{ w: 'b', u0: 0.15, u1: 2.05, y0: 1.35, y1: 2.45 }, { w: 'l', u0: -2.4, u1: -0.9, y0: 1.2, y1: 2.3 }] },
    garage: { artists: [[2.75, 2.15, Math.PI], [1.6, 2.6, Math.PI]], shelf: { w: 'b', u: 3.45, y: 1.4 }, neon: [-2.35, 2.3], edrums: [-2.6, 0.45, 0], W: 8.4, D: 6.2, H: 3.0, floor: ['concrete'], wall: 0xc9c2b5, wall2: 0xd8d1c4, brick: 'blocks', desk: [1.1, -2.73, 2.2],
      staff: [[2.75, 0.55], [0.2, 0.95]], sofas: [[-3.75, -1.95, -Math.PI / 2, 0x7a6a4f, 1.9]], board: [-2.0, -2.2],
      slots: { micro: [-0.25, -1.85, 0.4], formation: [-0.95, -2.93, 0], distrib: { w: 'b', u: 3.4, y: 2.6 }, preamps: [3.05, -2.83, 0],
        playlists: { w: 'l', u: -2.0, y: 2.75 } },
      foam: [{ w: 'b', u0: 0.0, u1: 2.2, y0: 1.5, y1: 2.7 }, { w: 'l', u0: -2.9, u1: -1.0, y0: 1.5, y1: 2.4 }] },
    local: { win: [[1.0, 3.0, 2.0, 0.6]], artists: [[-3.2, 2.55, Math.PI], [-0.1, 2.95, Math.PI]], shelf: { w: 'b', u: 4.4, y: 1.45 }, neon: [-0.6, 1.9], edrums: [1.25, 2.6, 0], W: 10.5, D: 7.4, H: 3.2, floor: ['wood', '#5b4030', '#4a3426'], wall: 0xece7df, wall2: 0xf4f0ea, brick: 'bricks', desk: [1.4, -3.33, 2.4],
      staff: [[0.9, 0.35], [3.3, 0.35], [3.3, 2.45]], sofas: [[-4.68, 1.0, -Math.PI / 2, 0x2f6f73, 2.2]], board: [-2.3, -0.4],
      slots: { cabine: [-4.2, -2.7, 0], console: [-2.1, -3.28, 0], micro: [-0.55, -2.15, 0.4], formation: [-5.08, -1.1, Math.PI / 2], preamps: [3.45, -3.43, 0],
        distrib: { w: 'b', u: 4.4, y: 2.6 }, playlists: { w: 'b', u: -2.1, y: 2.75 }, label: { w: 'b', u: -0.6, y: 2.9 }, orchestre: [-1.4, 1.9, 0] },
      foam: [{ w: 'b', u0: 0.2, u1: 2.6, y0: 1.6, y1: 2.9 }] },
    pro: { artists: [[1.45, 4.3, Math.PI], [-4.6, 4.25, Math.PI], [6.05, 3.5, Math.PI]], shelf: [1.6, 1.3], neon: [-1.6, 2.32], edrums: [-4.7, -2.6, 0], W: 13, D: 9.5, H: 3.6, floor: ['wood', '#a77b52', '#8e6542'], wall: 0x3b4250, wall2: 0x4a5263, slats: true, desk: [1.6, -4.38, 2.8],
      staff: [[1.3, 0.3], [3.4, 0.3], [5.5, 0.3], [1.3, 2.4], [3.4, 2.4], [5.5, 2.4]], sofas: [[3.4, 4.1, 0, 0x3b2f2a, 2.6]], board: [-1.4, 0.4],
      slots: { studioA: [-4.7, -2.95, 0], cabine: [5.45, -3.76, 0], console: [-1.6, -4.33, 0], neve: [-1.45, -2.75, 0], preamps: [3.75, -4.48, 0], assistant: [4.03, -3.35, -Math.PI / 2],
        orchestre: [-4.6, 2.0, 0.4], management: [-1.25, 3.0, 0], micro: [0.3, -2.3, 0.4], formation: [-6.33, -0.35, Math.PI / 2],
        distrib: { w: 'b', u: 1.6, y: 3.0 }, playlists: { w: 'b', u: 3.75, y: 3.4 }, label: { w: 'l', u: 4.1, y: 2.9 }, mentor: { w: 'b', u: -1.6, y: 3.4 }, disques: { w: 'l', u: 1.6, y: 3.3 } },
      foam: [{ w: 'b', u0: 0.2, u1: 3.0, y0: 1.65, y1: 2.3 }] },
    complexe: { win: [[4.0, 3.2, 2.6, 0.9]], artists: [[-4.3, 4.6, Math.PI], [0.9, 4.7, Math.PI], [-7.7, 4.5, Math.PI], [7.7, 4.0, Math.PI]], shelf: [0.9, 1.6], neon: [-3.1, 1.95], edrums: [-6.6, -3.9, 0], W: 17, D: 12, H: 4.2, floor: ['marble'], wall: 0xe9e1d3, wall2: 0xf1ebe0, gold: true, desk: [1.6, -5.63, 3.2],
      staff: [[0.9, 0.6], [3.1, 0.6], [5.3, 0.6], [7.5, 0.6], [0.9, 2.8], [3.1, 2.8], [5.3, 2.8], [7.5, 2.8]],
      sofas: [[5.3, 5.2, 0, 0x7d1f2b, 3.0], [3.05, 4.55, -Math.PI / 2, 0x7d1f2b, 1.6]], board: [-2.6, 1.0],
      slots: { studioA: [-6.7, -4.2, 0], cabine: [7.45, -5.0, 0], console: [-3.1, -5.58, 0], neve: [-3.1, -3.85, 0], preamps: [4.2, -5.73, 0], assistant: [5.85, -5.6, 0],
        orchestre: [-6.4, 2.0, 0.4], management: [-1.8, 4.0, 0], micro: [-0.9, -3.3, 0.4], formation: [-8.33, -1.0, Math.PI / 2],
        distrib: { w: 'b', u: 1.6, y: 3.3 }, playlists: { w: 'b', u: 4.6, y: 3.9 }, label: { w: 'b', u: 7.45, y: 3.7 }, mentor: { w: 'b', u: -0.9, y: 3.4 }, disques: { w: 'b', u: -3.1, y: 4.0 } },
      foam: [{ w: 'b', u0: 0.1, u1: 3.1, y0: 2.0, y1: 2.7 }] }
  };
  // Places assises des canapés pour les membres de l'équipe en vacances.
  function lounges(def) {
    if (def.lounge) return def.lounge;
    var out = [];
    (def.sofas || []).forEach(function (so) {
      var w = so[4], r = so[2], c = Math.cos(r), sn = Math.sin(r);
      [-w / 3, 0, w / 3].forEach(function (lx) { var lz = 0.05; out.push([so[0] + lx * c + lz * sn, so[1] - lx * sn + lz * c, r]); });
    });
    return out.length ? out : [[def.board[0] + 1, def.board[1], 0]];
  }
  var FALLBACK = [[-1.2, 1.6], [-0.2, 2.0], [-2.2, 1.0], [0.6, 1.5], [-1.6, 0.4], [-2.6, 1.9]];

  // ---------- Pièce ----------
  function floorMat(f, W, D) {
    var k = f[0];
    if (k === 'wood') return texMat('floor-' + f[1] + '-' + W, 256, 256, function (c, w, h) { planks(c, w, h, f[1], f[2]); }, { rep: [W / 2.5, D / 2.5], r: 0.62 });
    if (k === 'concrete') return texMat('concrete-' + W, 256, 256, concrete, { rep: [W / 3, D / 3] });
    return texMat('marble-' + W, 256, 256, marble, { rep: [W / 2, D / 2], r: 0.35 });
  }
  function buildRoom(def, tier) {
    var g = grp(null), W = def.W, D = def.D, H = def.H;
    mesh(g, G('box'), floorMat(deco.floor || def.floor, W, D), 0, -0.05, 0, W, 0.1, D).castShadow = false;
    // socle visible sous la pièce (effet maquette)
    mesh(g, G('box'), texMat('socle', 256, 64, function (c, w, h) { blocks(c, w, h); }, { rep: [W / 2, 0.5] }), 0, -0.35, 0, W + 0.16, 0.5, D + 0.16).castShadow = false;
    var wallM = tintMat('plaster', plasterDraw, deco.wall ? deco.wall[0] : def.wall, { r: 0.92 }), wall2M = tintMat('plaster', plasterDraw, deco.wall ? deco.wall[1] : def.wall2, { r: 0.92 });
    var backM = deco.wall ? wallM : def.brick === 'bricks' ? texMat('bricks', 256, 256, bricks, { rep: [W / 3, H / 2] }) : def.brick === 'blocks' ? texMat('blocks', 256, 256, blocks, { rep: [W / 3, H / 2] }) : def.slats ? texMat('slats', 256, 128, slats, { rep: [W / 2, 1] }) : wallM;
    var bw = mesh(g, G('box'), backM, 0, H / 2, -D / 2 - 0.06, W + 0.24, H, 0.12); bw.castShadow = false;
    var lwM = def.slats && !deco.wall ? texMat('slats', 256, 128, slats, { rep: [W / 2, 1] }) : wall2M;
    if (def.win) { // mur percé de vraies fenêtres: on voit le jardin au travers
      var sh = new THREE.Shape(); sh.moveTo(-D / 2, 0); sh.lineTo(D / 2, 0); sh.lineTo(D / 2, H); sh.lineTo(-D / 2, H); sh.closePath();
      def.win.forEach(function (wq) { var hp = new THREE.Path(), u0 = -(wq[0] + wq[1] / 2), u1 = -(wq[0] - wq[1] / 2); hp.moveTo(u0, wq[3]); hp.lineTo(u0, wq[3] + wq[2]); hp.lineTo(u1, wq[3] + wq[2]); hp.lineTo(u1, wq[3]); hp.closePath(); sh.holes.push(hp); });
      var wg = new THREE.ExtrudeGeometry(sh, { depth: 0.12, bevelEnabled: false }); wg.rotateY(Math.PI / 2);
      var lw = new THREE.Mesh(wg, lwM); lw.position.set(-W / 2 - 0.12, 0, 0); lw.receiveShadow = true; g.add(lw);
    } else { var lw2 = mesh(g, G('box'), lwM, -W / 2 - 0.06, H / 2, 0, 0.12, H, D); lw2.castShadow = false; }
    // arête des murs coupés (effet maquette) et corniche
    var cap = M(dark ? 0x2a2f3a : 0x4a4f58, { r: 0.8 });
    box(g, W + 0.24, 0.02, 0.12, cap, 0, H, -D / 2 - 0.06).castShadow = false; box(g, 0.12, 0.02, D, cap, -W / 2 - 0.06, H, 0).castShadow = false;
    if (!def.gold) { box(g, W, 0.07, 0.05, M(0xf6f3ee, { r: 0.6 }), 0, H - 0.07, -D / 2 + 0.025).castShadow = false; box(g, 0.05, 0.07, D, M(0xf6f3ee, { r: 0.6 }), -W / 2 + 0.025, H - 0.07, 0).castShadow = false; }
    // plinthes
    box(g, W, 0.1, 0.03, M(def.gold ? C.gold : 0xf3f0ea), 0, 0, -D / 2 + 0.015);
    box(g, 0.03, 0.1, D, M(def.gold ? C.gold : 0xf3f0ea), -W / 2 + 0.015, 0, 0);
    if (def.gold) { box(g, W, 0.08, 0.04, M(C.gold, { m: 0.8, r: 0.3 }), 0, H - 0.3, -D / 2 + 0.02); box(g, 0.04, 0.08, D, M(C.gold, { m: 0.8, r: 0.3 }), -W / 2 + 0.02, H - 0.3, 0); }
    decor[cur.placeKey](g, def, tier);
    if (def.shelf) buildShelf(g, def);
    if (def.neon && deco.neon) buildNeon(g, def, deco.neon);
    g.children.forEach(function (c) { if (c.isGroup && !c.isLight) batchInterior(c); });
    return g;
  }
  // Étagère à souvenirs: une coupe par famille du palmarès décrochée au niveau Or. Elle ouvre l'atelier de décoration.
  function buildShelf(g0, def) {
    var sp = def.shelf, g = sp.w === 'b' ? grp(g0, sp.u, sp.y, -def.D / 2 + 0.03, 0) : grp(g0, -def.W / 2 + 0.03, sp[1], sp[0], Math.PI / 2); g.name = 'étagère à souvenirs';
    var wood = M(C.woodD), cups = Math.max(0, Math.min(8, deco.cups || 0));
    box(g, 1.2, 0.04, 0.24, wood, 0, 0, 0.12); box(g, 1.2, 0.04, 0.24, wood, 0, 0.42, 0.12);
    box(g, 0.04, 0.46, 0.24, wood, -0.6, 0, 0.12); box(g, 0.04, 0.46, 0.24, wood, 0.6, 0, 0.12);
    var gold = M(C.gold, { m: 0.85, r: 0.25 }), plate = M(0x2b2b2b);
    for (var i = 0; i < 8; i++) {
      var x = -0.47 + (i % 4) * 0.31, y = i < 4 ? 0.04 : 0.46;
      if (i < cups) { cyl(g, 0.05, 0.03, plate, x, y, 0.13, 10); cyl(g, 0.015, 0.09, gold, x, y + 0.03, 0.13, 8); cyl(g, 0.055, 0.1, gold, x, y + 0.12, 0.13, 12, 0.03); }
    }
    if (!cups) { var bx = box(g, 0.22, 0.16, 0.16, M(0xc9a37a), -0.3, 0.04, 0.12); bx.rotation.y = 0.2; sph(g, 0.08, M(0x7ec8e3), 0.25, 0.12, 0.12, 12); }
    // pot de peinture: la décoration s'ouvre ici
    var pot = grp(g, 0.42, 0.04, 0.12); cyl(pot, 0.07, 0.14, M(0xf3f0ea, { m: 0.3, r: 0.4 }), 0, 0, 0, 14); cyl(pot, 0.072, 0.03, M(0xff8a3d), 0, 0.12, 0, 14);
    // objet de saison posé sur l'étagère: bouquet, citrouille ou petit sapin
    var sea = grp(g, 0.3, 0.44, 0.12); sea.userData.keep = true; cur.seasonG = sea;
    var vase = grp(sea); vase.name = 'bouquet';
    cyl(vase, 0.05, 0.15, M(0x6fb3c9, { r: 0.25, m: 0.1 }), 0, 0, 0, 14, 0.035);
    [0xe85a7a, 0xf2c14e, 0x9b7fd6, 0xffffff, 0xff8a3d].forEach(function (fc, i) { var a = i / 5 * 6.28; cyl(vase, 0.006, 0.12, M(0x4f8a3a), Math.cos(a) * 0.02, 0.13, Math.sin(a) * 0.02, 4); sph(vase, 0.03, M(fc, { r: 0.7 }), Math.cos(a) * 0.04, 0.27 + (i % 2) * 0.03, Math.sin(a) * 0.04, 8); });
    var pump = grp(sea); pump.name = 'citrouille';
    for (var k = 0; k < 6; k++) { var lb = sph(pump, 0.08, M(0xf08a24, { r: 0.6 }), Math.cos(k / 6 * 6.28) * 0.025, 0.065, Math.sin(k / 6 * 6.28) * 0.025, 10); lb.scale.set(0.045, 0.065, 0.07); lb.rotation.y = k / 6 * 6.28; }
    cyl(pump, 0.012, 0.05, M(0x4f6a2a), 0, 0.14, 0, 6);
    var xt = grp(sea); xt.name = 'sapin';
    for (var t2 = 0; t2 < 3; t2++) cone(xt, 0.085 - t2 * 0.02, 0.14, M(0x2c6a45, { flat: true }), 0, 0.04 + t2 * 0.08, 0, 8);
    cyl(xt, 0.03, 0.05, M(0x8a5a30), 0, 0, 0, 8); cone(xt, 0.025, 0.05, M(0xffd166, { e: 0xffd166, ei: 1.6 }), 0, 0.3, 0, 5);
    [0xe2364a, 0xffd166, 0x66ccff, 0xffffff].forEach(function (bc, i) { sph(xt, 0.012, M(bc, { e: bc, ei: 1.2 }), Math.cos(i * 1.7) * 0.055, 0.1 + i * 0.04, Math.sin(i * 1.7) * 0.07, 6); });
    [vase, pump, xt].forEach(function (o) { o.visible = false; });
    g.traverse(function (o) { if (o.isMesh) o.userData.pick = { type: 'hot', id: 'deco' }; });
    cur.shelf = g;
  }
  // Néon mural dessiné sur une toile (texte ou pictogramme lumineux).
  function neonDraw(kind, col) {
    return function (c, w, h) {
      c.clearRect(0, 0, w, h); c.lineJoin = 'round'; c.lineCap = 'round';
      function glow(fn) { c.save(); c.strokeStyle = col; c.shadowColor = col; c.shadowBlur = 22; c.lineWidth = 9; fn(); c.stroke(); c.restore(); c.save(); c.strokeStyle = '#fff'; c.lineWidth = 3.5; fn(); c.stroke(); c.restore(); }
      if (kind === 'text') {
        c.font = '800 70px "Trebuchet MS", system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.save(); c.shadowColor = col; c.shadowBlur = 24; c.strokeStyle = col; c.lineWidth = 8; c.strokeText('PREMIER MIX', w / 2, h / 2); c.restore();
        c.save(); c.strokeStyle = '#fff'; c.lineWidth = 2.5; c.strokeText('PREMIER MIX', w / 2, h / 2); c.restore();
        return;
      }
      var cx = w / 2, cy = h / 2, r = h * 0.36;
      glow(function () {
        c.beginPath();
        if (kind === 'heart') { c.moveTo(cx, cy + r); c.bezierCurveTo(cx - r * 1.9, cy - r * 0.2, cx - r * 0.7, cy - r * 1.5, cx, cy - r * 0.45); c.bezierCurveTo(cx + r * 0.7, cy - r * 1.5, cx + r * 1.9, cy - r * 0.2, cx, cy + r); }
        else if (kind === 'star') { for (var i = 0; i < 10; i++) { var a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r * 1.1; c[i ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } c.closePath(); }
        else if (kind === 'bolt') { var p = [[0.15, -1.1], [-0.55, 0.12], [-0.02, 0.12], [-0.22, 1.1], [0.55, -0.2], [0.04, -0.2], [0.15, -1.1]]; p.forEach(function (q, i) { c[i ? 'lineTo' : 'moveTo'](cx + q[0] * r, cy + q[1] * r); }); }
        else { // double croche
          c.moveTo(cx - r * 0.55, cy + r * 0.65); c.lineTo(cx - r * 0.55, cy - r * 0.85); c.lineTo(cx + r * 0.75, cy - r * 1.05); c.lineTo(cx + r * 0.75, cy + r * 0.45);
          c.moveTo(cx - r * 0.55, cy - r * 0.45); c.lineTo(cx + r * 0.75, cy - r * 0.65);
          c.moveTo(cx - r * 0.55 + r * 0.38, cy + r * 0.65); c.ellipse(cx - r * 0.85, cy + r * 0.65, r * 0.32, r * 0.22, -0.4, 0, Math.PI * 2);
          c.moveTo(cx + r * 0.75 + r * 0.38, cy + r * 0.45); c.ellipse(cx + r * 0.45, cy + r * 0.45, r * 0.32, r * 0.22, -0.4, 0, Math.PI * 2);
        }
      });
    };
  }
  function buildNeon(g0, def, n) {
    var sp = def.neon, text = n.k === 'text', w = text ? 1.5 : 0.75, h = text ? 0.32 : 0.6;
    var key = 'neon-' + n.k + n.c, t = canvasTex(key, text ? 512 : 256, text ? 110 : 205, neonDraw(n.k, n.c));
    var mat = MATS[key] || (MATS[key] = new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, toneMapped: false }));
    var m = mesh(g0, new THREE.PlaneGeometry(1, 1), mat, sp[0], sp[1] + h / 2, -def.D / 2 + 0.02, w, h, 1, false);
    m.name = 'néon'; m.castShadow = false;
    var l = new THREE.PointLight(new THREE.Color(n.c), 0.9, 3, 2); l.position.set(sp[0], sp[1] + h / 2, -def.D / 2 + 0.5); g0.add(l);
  }
  function windowL(g0, def, z, w, h, y) {
    var g = grp(g0); g.name = 'fenêtre';
    var x = -def.W / 2 - 0.06, fr = M(0xf6f3ee, { r: 0.35 }), gl = M(0xd6ecf7, { op: 0.14, r: 0.04, m: 0.1 });
    mesh(g, G('box'), gl, x, y + h / 2, z, 0.012, h, w, false);
    box(g, 0.12, 0.05, w, fr, x, y, z); box(g, 0.12, 0.05, w, fr, x, y + h - 0.05, z);
    box(g, 0.12, h, 0.05, fr, x, y, z - w / 2 + 0.025); box(g, 0.12, h, 0.05, fr, x, y, z + w / 2 - 0.025);
    box(g, 0.06, h, 0.04, fr, x, y, z);
    if (h > 1.6) box(g, 0.06, 0.04, w, fr, x, y + h * 0.72, z);
    rb(g, 0.1, 0.035, w + 0.16, fr, -def.W / 2 + 0.02, y - 0.04, z, 0.01);
    if (cur.placeKey === 'chambre') {
      var cu = tintMat('fab', fabricDraw, 0xe7d3a8, { r: 0.95 });
      cyl(g, 0.012, w + 0.36, M(0x6b5038), -def.W / 2 + 0.07, y + h + 0.12, z, 8).rotation.x = Math.PI / 2;
      [-1, 1].forEach(function (sd) { rb(g, 0.06, h + 0.3, 0.18, cu, -def.W / 2 + 0.07, y - 0.18, z + sd * (w / 2 + 0.1), 0.03); });
    }
  }
  function posterB(g, def, x, y, k, a, b, w, h) { box(g, w || 0.5, h || 0.7, 0.01, texMat('poster' + k, 128, 180, poster(k, a, b)), x, y, -def.D / 2 + 0.01).name = 'affiche'; }
  function plant(g0, x, z, s) {
    var g = grp(g0); g.name = 'plante';
    s = s || 1;
    var pot = M(0xd9a066, { r: 0.6 });
    cyl(g, 0.16 * s, 0.3 * s, pot, x, 0, z, 18, 0.12 * s);
    cyl(g, 0.17 * s, 0.04 * s, pot, x, 0.29 * s, z, 18);
    cyl(g, 0.15 * s, 0.01, M(0x4a3426), x, 0.325 * s, z, 16).castShadow = false;
    var l1 = M(0x3f8a4a, { r: 0.7, flat: true }), l2 = M(0x5aa85a, { r: 0.7 });
    for (var i = 0; i < 11; i++) {
      var a = i / 11 * Math.PI * 2 + (i % 2) * 0.3, h = (0.4 + (i % 4) * 0.07) * s, lean = 0.22 + (i % 3) * 0.15;
      var lf = grp(g, x, 0.32 * s, z, a);
      cyl(lf, 0.008 * s, h * 0.55, M(0x4f7a3a), 0, 0, 0, 4).rotation.x = lean * 0.6;
      var bl = sph(lf, 0.1 * s, i % 2 ? l1 : l2, 0, Math.cos(lean) * h * 0.7, Math.sin(lean) * h * 0.7, 8);
      bl.scale.set(0.065 * s, 0.16 * s, 0.03 * s); bl.rotation.x = lean;
    }
  }
  function sofa(g, x, z, ry, col, w) {
    var s2 = grp(g, x, 0, z, ry); w = w || 1.8; s2.name = 'canapé';
    var c0 = col || 0x8a5a44, m = tintMat('fab', fabricDraw, c0, { r: 0.95 }), cu = tintMat('fab', fabricDraw, new THREE.Color(c0).offsetHSL(0, 0, 0.05).getHex(), { r: 0.95 }), leg = M(0x3a2a1e, { r: 0.5 });
    rb(s2, w, 0.3, 0.85, m, 0, 0.08, 0, 0.05);
    rb(s2, w - 0.1, 0.5, 0.22, m, 0, 0.3, 0.31, 0.07);
    [-1, 1].forEach(function (sd) { rb(s2, 0.18, 0.56, 0.85, m, sd * (w / 2 - 0.09), 0.08, 0, 0.07); });
    var n = w > 2.2 ? 3 : 2, cw = (w - 0.36) / n;
    for (var i = 0; i < n; i++) {
      var cx = -w / 2 + 0.18 + cw * (i + 0.5);
      rb(s2, cw - 0.02, 0.13, 0.62, cu, cx, 0.38, -0.06, 0.05);
      var bk = rb(s2, cw - 0.04, 0.34, 0.14, cu, cx, 0.48, 0.17, 0.06); bk.rotation.x = -0.14;
    }
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (q) { cyl(s2, 0.03, 0.08, leg, q[0] * (w / 2 - 0.1), 0, q[1] * 0.34, 8, 0.022); });
    var pil = rb(s2, 0.3, 0.28, 0.1, tintMat('fab', fabricDraw, 0xf2c14e, { r: 0.95 }), -w / 2 + 0.36, 0.5, 0.08, 0.05); pil.rotation.set(-0.3, 0.25, 0.12);
    return s2;
  }
  function lamp(g0, x, z, h, warm) {
    var g = grp(g0); g.name = 'lampe';
    var met = M(0x26282c, { m: 0.6, r: 0.35 });
    cyl(g, 0.14, 0.025, met, x, 0, z, 24); cyl(g, 0.012, h, M(0xb9bec4, { m: 0.8, r: 0.25 }), x, 0.02, z, 8);
    var shade = cyl(g, 0.12, 0.22, M(0xfff3d6, { e: 0xffd28a, ei: 0.9, r: 0.9 }), x, h - 0.02, z, 24, 0.17);
    cyl(g, 0.172, 0.012, M(0xd8cbb0), x, h - 0.02, z, 24); cyl(g, 0.122, 0.012, M(0xd8cbb0), x, h + 0.19, z, 24);
    if (warm !== false) { var l = new THREE.PointLight(0xffc27a, 1.6, 4.5, 1.6); l.position.set(x, h + 0.05, z); g.add(l); }
  }
  function bulb(g0, x, y, z) {
    var g = grp(g0); g.name = 'ampoule';
    cyl(g, 0.005, 0.5, M(C.black), x, y - 0.5, z);
    sph(g, 0.06, M(0xfff3d6, { e: 0xffd28a, ei: 2 }), x, y - 0.55, z, 10);
    var l = new THREE.PointLight(0xffcf8a, 2.2, 6, 1.6); l.position.set(x, y - 0.6, z); g.add(l);
  }
  function rugDraw(a, b) {
    return function (c, w, h) {
      var A = '#' + new THREE.Color(a).getHexString(), B = '#' + new THREE.Color(b).getHexString(), r = rnd(43);
      c.fillStyle = A; c.fillRect(0, 0, w, h);
      c.fillStyle = B; c.fillRect(w * 0.08, h * 0.08, w * 0.84, h * 0.84);
      c.strokeStyle = A; c.lineWidth = 6; c.strokeRect(w * 0.14, h * 0.14, w * 0.72, h * 0.72);
      c.fillStyle = A; c.globalAlpha = 0.55; c.beginPath(); c.moveTo(w / 2, h * 0.3); c.lineTo(w * 0.7, h / 2); c.lineTo(w / 2, h * 0.7); c.lineTo(w * 0.3, h / 2); c.closePath(); c.fill(); c.globalAlpha = 1;
      for (var i = 0; i < 3500; i++) { c.fillStyle = 'rgba(' + (r() > 0.5 ? '255,255,255' : '0,0,0') + ',0.05)'; c.fillRect(r() * w, r() * h, 2, 2); }
    };
  }
  function rug(g, x, z, w, d, col, col2) {
    if (deco.rug) { col = deco.rug[0]; col2 = deco.rug[1]; }
    var m = texMat('rug-' + col + '-' + col2, 256, 256, rugDraw(col, col2), { r: 0.98 });
    var r0 = rb(g, w, 0.016, d, m, x, 0, z, 0.006); r0.castShadow = false;
    return r0;
  }
  function desk(g, def, x, z, w, style) {
    var d = grp(g, x, 0, z), top = style === 'white' ? M(0xf1eee8, { r: 0.35 }) : style === 'dark' ? tintMat('grain', grainDraw, 0x3a3230, { r: 0.4 }) : tintMat('grain', grainDraw, C.wood, { r: 0.55 }), leg = M(style === 'dark' ? 0x111111 : 0x2f3236, { m: 0.6, r: 0.35 }); d.name = 'bureau';
    rb(d, w, 0.045, 0.7, top, 0, 0.725, 0, 0.015);
    [-1, 1].forEach(function (sd) {
      var lx = sd * (w / 2 - 0.08);
      rb(d, 0.05, 0.7, 0.05, leg, lx, 0.025, -0.28, 0.012); rb(d, 0.05, 0.7, 0.05, leg, lx, 0.025, 0.28, 0.012);
      rb(d, 0.05, 0.035, 0.6, leg, lx, 0, 0, 0.012); rb(d, 0.04, 0.04, 0.6, leg, lx, 0.69, 0, 0.01);
    });
    rb(d, w - 0.25, 0.06, 0.12, M(0x2a2c30, { m: 0.4, r: 0.5 }), 0, 0.6, -0.26, 0.01).castShadow = false;
    return d;
  }
  function sofas(g, def) { (def.sofas || []).forEach(function (so) { sofa(g, so[0], so[1], so[2], so[3], so[4]); }); }
  function named(g, name, x, z, ry) { var o = grp(g, x, 0, z, ry); o.name = name; return o; }
  var decor = {
    chambre: function (g, def, tier) {
      var D = def.D;
      var bed = named(g, 'lit', -2.48, -1.45), frameM = tintMat('grain', grainDraw, C.woodD, { r: 0.6 }), duvet = tintMat('fab', fabricDraw, tier ? 0x6b5bd6 : 0x4a7bd0, { r: 0.95 }), linen = tintMat('fab', fabricDraw, 0xf6f3ee, { r: 0.95 });
      rb(bed, 1.4, 0.26, 2.05, frameM, 0, 0.06, 0, 0.03);
      [[-0.64, -0.96], [0.64, -0.96], [-0.64, 0.96], [0.64, 0.96]].forEach(function (q) { rb(bed, 0.08, 0.08, 0.08, frameM, q[0], 0, q[1], 0.015); });
      rb(bed, 1.34, 0.2, 1.96, linen, 0, 0.3, 0.02, 0.06);
      rb(bed, 1.4, 0.11, 1.32, duvet, 0, 0.44, 0.36, 0.05);
      rb(bed, 1.38, 0.05, 0.22, linen, 0, 0.47, -0.36, 0.02);
      [-0.3, 0.3].forEach(function (x) { var pl = rb(bed, 0.56, 0.14, 0.34, linen, x, 0.48, -0.74, 0.06); pl.rotation.x = -0.18; });
      rb(bed, 1.44, 0.82, 0.1, tintMat('fab', fabricDraw, 0x8a7a68, { r: 0.95 }), 0, 0, -1.0, 0.04);
      windowL(g, def, 0.9, 1.25, 1.2, 0.95);
      posterB(g, def, 2.78, 1.75, 3, '#ff8a3d', '#8e3b5a', 0.5, 0.7);
      rug(g, 0.5, 0.45, 2.6, 1.7, tier ? 0x3c3a66 : 0xe8b04b, tier ? 0x5c5a96 : 0xf3cf7a);
      lamp(g, 2.85, -1.35, 1.45);
      plant(g, -2.85, 2.05);
      var amp = named(g, 'ampli', -0.9, 1.75);
      rb(amp, 0.45, 0.34, 0.35, M(0x2a2b2e, { r: 0.6 }), 0, 0, 0, 0.03);
      box(amp, 0.39, 0.22, 0.01, tintMat('grille', grilleDraw, 0xb8a888, { r: 0.9, size: 64 }), 0, 0.03, 0.172).castShadow = false;
      rb(amp, 0.41, 0.05, 0.02, M(0xd9534f, { r: 0.4 }), 0, 0.27, 0.168, 0.008);
      for (var kn = 0; kn < 5; kn++) cyl(amp, 0.012, 0.02, M(0xe8e8e8, { m: 0.5, r: 0.3 }), -0.14 + kn * 0.07, 0.285, 0.185, 10).rotation.x = Math.PI / 2;
      rb(amp, 0.16, 0.02, 0.03, M(0x111111), 0, 0.34, 0, 0.008);
      var gt = named(g, 'guitare', -1.45, 1.9, 0.3), red = M(0xc0392b, { r: 0.18, m: 0.15 }), neck = tintMat('grain', grainDraw, 0x8a5a30, { r: 0.5 });
      var b1 = cyl(gt, 0.17, 0.06, red, 0, 0.12, 0, 22); b1.rotation.x = Math.PI / 2; b1.position.set(0, 0.18, 0); b1.scale.set(0.17, 0.06, 0.15);
      var b2 = cyl(gt, 0.13, 0.06, red, 0, 0.3, 0, 22); b2.rotation.x = Math.PI / 2; b2.position.set(0, 0.36, 0); b2.scale.set(0.13, 0.06, 0.11);
      box(gt, 0.12, 0.08, 0.004, M(0xf2f2f2, { r: 0.3 }), 0, 0.14, 0.031).castShadow = false;
      rb(gt, 0.05, 0.6, 0.03, neck, 0, 0.42, 0, 0.01); rb(gt, 0.08, 0.14, 0.025, M(0x1b1b1b, { r: 0.3 }), 0, 1.0, 0, 0.012);
      gt.rotation.z = 0.12;
      if (tier >= 1) { // chambre-studio: ruban LED
        box(g, def.W, 0.03, 0.03, M(0xb388ff, { e: 0xb388ff, ei: 2.2 }), 0, def.H - 0.08, -D / 2 + 0.04, 0).castShadow = false;
        box(g, 0.03, 0.03, D, M(0xb388ff, { e: 0xb388ff, ei: 2.2 }), -def.W / 2 + 0.04, def.H - 0.08, 0).castShadow = false;
        var led = new THREE.PointLight(0xb388ff, 1.2, 6, 1.5); led.position.set(0, def.H - 0.3, -1); g.add(led);
      }
    },
    garage: function (g, def) {
      // porte de garage sur le mur de gauche (devant le canapé, côté rue)
      var door = named(g, 'porte', -def.W / 2 + 0.03, 1.55), w = 2.6, h = 2.4;
      for (var i = 0; i < 8; i++) box(door, 0.04, h / 8 - 0.02, w, M(i % 2 ? 0xd7d9dc : 0xc8cbcf, { m: 0.3, r: 0.5 }), 0.02, i * h / 8, 0);
      box(door, 0.08, 0.12, w + 0.2, M(0x777777), 0.03, h, 0);
      var wb = named(g, 'établi', -2.35, -def.D / 2 + 0.3);
      var bw2 = tintMat('grain', grainDraw, 0xb08a60, { r: 0.7 });
      rb(wb, 1.5, 0.07, 0.6, bw2, 0, 0.78, 0, 0.015);
      [[-0.68, -0.24], [0.68, -0.24], [-0.68, 0.24], [0.68, 0.24]].forEach(function (q) { rb(wb, 0.07, 0.78, 0.07, bw2, q[0], 0, q[1], 0.012); });
      rb(wb, 1.4, 0.04, 0.5, bw2, 0, 0.2, 0, 0.01);
      for (var dr = 0; dr < 2; dr++) rb(wb, 0.4, 0.16, 0.5, M(0x6b8fa8, { m: 0.4, r: 0.45 }), 0.42, 0.4 + dr * 0.18, 0, 0.012);
      var peg = rb(wb, 1.4, 0.9, 0.03, tintMat('grain', grainDraw, 0xd8c09a, { r: 0.8 }), 0, 1.15, -0.28, 0.01);
      for (var t = 0; t < 6; t++) rb(wb, 0.04, 0.25, 0.03, M([C.red, C.yellow, C.metal][t % 3], { r: 0.4, m: t % 3 === 2 ? 0.7 : 0 }), -0.55 + t * 0.22, 1.5, -0.24, 0.01);
      cyl(wb, 0.06, 0.12, M(0x2bb3a3, { r: 0.4 }), -0.5, 0.85, 0.1, 14); rb(wb, 0.3, 0.08, 0.2, M(0xe2574c, { r: 0.4 }), -0.1, 0.85, 0.05, 0.02);
      sofas(g, def);
      rug(g, -2.75, -1.95, 1.4, 2.2, 0x9b3d3d, 0xc65f4f);
      bulb(g, -1.2, def.H, -1.0); bulb(g, 2.0, def.H, -1.0);
      var bx = named(g, 'cartons', 3.6, 2.55); for (var b = 0; b < 3; b++) { var cb = rb(bx, 0.5, 0.35, 0.4, M(0xc49a6c, { r: 0.9 }), (b % 2) * 0.08, b * 0.35, -b * 0.04, 0.012); cb.rotation.y = b * 0.2; var tp = box(bx, 0.08, 0.005, 0.41, M(0xd8c8a0, { r: 0.6 }), (b % 2) * 0.08, b * 0.35 + 0.35, -b * 0.04); tp.rotation.y = b * 0.2; tp.castShadow = false; }
      var bike = named(g, 'vélo', 3.3, -1.35, 0.4), fr2 = M(C.red, { r: 0.3, m: 0.3 }), tyre2 = M(0x1b1b1b, { r: 0.8 });
      [-0.45, 0.45].forEach(function (wx) { mesh(bike, G('ring', 0.3, 0.028, 24), tyre2, wx, 0.32, 0, 1, 1, 1); for (var sp = 0; sp < 6; sp++) { var spk = cyl(bike, 0.003, 0.58, M(0xc0c4c8, { m: 0.8 }), wx, 0.03, 0, 4); spk.rotation.z = sp * Math.PI / 6; spk.position.set(wx, 0.32, 0); } cyl(bike, 0.03, 0.05, M(0x9aa1a8, { m: 0.8 }), wx, 0.3, 0, 8).rotation.x = Math.PI / 2; });
      [[0, 0.58, 0, 0.82, 1.57], [-0.12, 0.45, 0, 0.62, 0.9], [0.18, 0.44, 0, 0.6, -0.95]].forEach(function (t2) { var tb2 = cyl(bike, 0.018, t2[3], fr2, 0, 0, 0, 8); tb2.position.set(t2[0], t2[1], 0); tb2.rotation.z = t2[4]; tb2.position.y = t2[1]; });
      rb(bike, 0.2, 0.05, 0.1, M(0x1b1b1b), -0.2, 0.74, 0, 0.02); cyl(bike, 0.012, 0.42, M(0x1b1b1b), 0.4, 0.76, 0, 6).rotation.x = Math.PI / 2;
      plant(g, 3.85, -0.35, 0.9);
    },
    local: function (g, def) {
      windowL(g, def, 1.0, 3.0, 2.0, 0.6);
      sofas(g, def);
      var tb = named(g, 'table basse', -3.65, 1.0), tw = tintMat('grain', grainDraw, 0x7a5236, { r: 0.45 });
      rb(tb, 0.6, 0.06, 1.1, tw, 0, 0.34, 0, 0.02); rb(tb, 0.52, 0.03, 1.0, tw, 0, 0.1, 0, 0.01);
      [[-0.25, -0.5], [0.25, -0.5], [-0.25, 0.5], [0.25, 0.5]].forEach(function (q) { cyl(tb, 0.025, 0.34, M(0x26282c, { m: 0.6, r: 0.35 }), q[0], 0, q[1], 8); });
      cyl(tb, 0.05, 0.1, M(0xffffff, { r: 0.3 }), 0.1, 0.4, -0.2, 14); rb(tb, 0.22, 0.03, 0.3, M(0xe2574c, { r: 0.6 }), -0.1, 0.4, 0.25, 0.008);
      rug(g, -3.9, 1.0, 2.4, 3.0, 0x3a3f58, 0x575f87);
      plant(g, -4.85, 3.25, 1.2); plant(g, 4.85, -3.3, 1.1); plant(g, 4.85, 3.3, 1);
      lamp(g, -4.85, 2.65, 1.6);
      for (var i = 0; i < 3; i++) { var pl = new THREE.PointLight(0xffd59a, 1.3, 6, 1.7); pl.position.set(-2.5 + i * 3, def.H - 0.4, -0.8); g.add(pl); cyl(g, 0.18, 0.12, M(C.black), -2.5 + i * 3, def.H - 0.12, -0.8, 16, 0.08).name = 'suspension'; }
    },
    pro: function (g, def) {
      sofas(g, def);
      rug(g, 3.4, 3.7, 3.6, 1.6, 0x2a2e3b, 0x3d4357);
      plant(g, 6.1, -1.0, 1.2); plant(g, -6.0, 4.3, 1.2); plant(g, 5.25, 4.3, 1.0);
      box(g, 2.6, 0.04, 0.5, M(0xff8a3d, { e: 0xff8a3d, ei: 1.2 }), 1.6, def.H - 0.05, -def.D / 2 + 0.3).castShadow = false;
      for (var i = 0; i < 4; i++) { var pl = new THREE.PointLight(0xffe0b3, 1.4, 7, 1.6); pl.position.set(-4 + i * 3.3, def.H - 0.3, -0.5 + (i % 2) * 2); g.add(pl); cyl(g, 0.15, 0.06, M(0xfff3d6, { e: 0xffe0b3, ei: 1.5 }), -4 + i * 3.3, def.H - 0.06, -0.5 + (i % 2) * 2, 16).name = 'spot'; }
      var cm = named(g, 'machine à café', 6.15, 4.25);
      rb(cm, 0.6, 0.9, 0.5, tintMat('grain', grainDraw, 0x3a3230, { r: 0.5 }), 0, 0, 0, 0.02);
      rb(cm, 0.34, 0.36, 0.3, M(0xb9bec4, { m: 0.75, r: 0.25 }), 0, 0.9, 0, 0.04);
      rb(cm, 0.2, 0.06, 0.1, M(0x1b1b1b), 0, 1.03, 0.16, 0.01); cyl(cm, 0.035, 0.07, M(0xffffff, { r: 0.3 }), 0.06, 0.92, 0.17, 12); cyl(cm, 0.035, 0.07, M(0xe2574c, { r: 0.4 }), -0.18, 0.92, 0.1, 12);
    },
    complexe: function (g, def) {
      sofas(g, def);
      rug(g, 4.6, 4.7, 4.6, 2.2, 0x7d1f2b, 0x9c2c3b);
      rug(g, 0, 0.5, 2.4, 9, 0x8c1c2c, 0xa52a3a);
      plant(g, 8.1, -1.6, 1.4); plant(g, -8.0, 5.5, 1.4); plant(g, 8.0, 5.5, 1.3); plant(g, 1.8, 5.55, 1.2);
      windowL(g, def, 4.0, 3.2, 2.6, 0.9);
      [[-2.5, -1], [4, -1.2], [0, 3]].forEach(function (c) {
        var ch = grp(g, c[0], def.H, c[1]); ch.name = 'lustre';
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
    var cols = [tintMat('foam', foamDraw, 0x3b3f4a, { r: 0.98, size: 128 }), tintMat('foam', foamDraw, 0x5a4a6b, { r: 0.98, size: 128 })];
    (def.foam || []).forEach(function (f) {
      var n = 0;
      for (var y = f.y0; y + 0.38 <= f.y1 + 0.01; y += 0.44) for (var u = f.u0; u + 0.38 <= f.u1 + 0.01; u += 0.44) {
        var m = cols[(n++ + Math.round(y * 3)) % 2];
        var pn;
        if (f.w === 'b') pn = rb(g, 0.4, 0.4, 0.07, m, u + 0.2, y, -def.D / 2 + 0.035, 0.012);
        else { pn = rb(g, 0.4, 0.4, 0.07, m, -def.W / 2 + 0.035, y, u + 0.2, 0.012); pn.rotation.y = Math.PI / 2; }
        if ((n + Math.round(y * 3)) % 2) pn.rotation.z = Math.PI / 2;
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
    batchInterior(g);
    return g;
  }

  // ---------- Équipe ----------
  function staffDesk(p, x, z, idx) {
    var d = grp(p, x, 0, z);
    var top = cur.placeKey === 'complexe' ? M(0xf1eee8, { r: 0.35 }) : cur.placeKey === 'pro' ? tintMat('grain', grainDraw, 0x3a3230, { r: 0.4 }) : tintMat('grain', grainDraw, C.wood, { r: 0.55 }), leg = M(0x2f3236, { m: 0.6, r: 0.35 });
    rb(d, 1.25, 0.045, 0.65, top, 0, 0.725, -0.2, 0.015);
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (s) { rb(d, 0.045, 0.72, 0.045, leg, s[0] * 0.56, 0, -0.2 + s[1] * 0.26, 0.012); });
    var mon = grp(d, 0, 0.745, -0.35); MODELS.daw(mon); mon.scale.set(0.75, 0.75, 0.75);
    box(d, 0.36, 0.012, 0.12, texMat('kb', 256, 96, kbDraw), 0, 0.77, -0.05).castShadow = false;
    rb(d, 0.05, 0.02, 0.08, M(0x2f3136, { r: 0.4 }), 0.28, 0.77, -0.04, 0.01);
    cyl(d, 0.04, 0.1, M(0xffffff, { r: 0.4 }), -0.42, 0.77, -0.15, 12);
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
        var ls = lounges(def), l = ls[i % ls.length];
        g = n.sitG; g.position.set(l[0], 0.0, l[1]); g.rotation.y = l[2] || 0; g.userData.p.mode = 'rest';
      } else if (m.status === 'train') {
        g = n.standG; g.position.set(def.board[0] + (i % 3 - 1) * 0.5, 0, def.board[1]); g.rotation.y = Math.PI; g.userData.p.mode = 'train';
      } else {
        g = n.sitG; g.position.set(deskPos[0], 0, deskPos[1] + 0.35); g.rotation.y = 0; g.userData.p.mode = m.status === 'work' ? 'work' : 'idle';
      }
      g.visible = true; n.cur = g;
      head = g.userData.p.mode === 'rest' ? 0.85 : g === n.standG ? 1.7 : 1.48;
      n.gem.position.set(g.position.x, head + 0.12, g.position.z);
      n.gem.material = M(m.morale >= 60 ? STATUS_COL.ok : m.morale >= 25 ? STATUS_COL.mid : STATUS_COL.low, { e: m.morale >= 60 ? STATUS_COL.ok : m.morale >= 25 ? STATUS_COL.mid : STATUS_COL.low, ei: 0.9 });
      n.anchor = new V3(g.position.x, head, g.position.z);
    });
    Object.keys(staffNodes).forEach(function (id) { if (!seen[id]) removeStaff(id); });
  }
  // Artistes du label: debout dans le studio, micro en main, à leur place dans chaque lieu.
  function layoutArtists(list) {
    var spots = cur.def.artists || [], seen = {};
    (list || []).forEach(function (a, i) {
      var sp = spots[i]; if (!sp) return;
      var lk = JSON.stringify(a.look), n = artistNodes[a.id];
      if (n && n.look !== lk) { staffG.remove(n.g); n = null; }
      if (!n) {
        n = artistNodes[a.id] = { look: lk, g: person(a.look, 'stand', { mic: true, pants: 0x2a2730 }) };
        n.g.userData.pick = { type: 'artist', id: a.id }; n.g.traverse(function (o) { if (o.isMesh) o.userData.pick = n.g.userData.pick; });
        n.g.userData.p.mode = 'artist'; n.g.name = 'artiste';
        staffG.add(n.g);
      }
      seen[a.id] = 1; n.mood = a.mood;
      n.g.position.set(sp[0], 0, sp[1]); n.g.rotation.y = sp[2] || 0;
      n.anchor = new V3(sp[0], 1.8, sp[1]);
    });
    Object.keys(artistNodes).forEach(function (id) { if (!seen[id]) { staffG.remove(artistNodes[id].g); delete artistNodes[id]; } });
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
    var wide = camera.aspect > 1.15, lim = wide ? 0.86 : 0.97;
    var yTop = (wide ? 0.9 : 0.95) - 2 * ins.t / hh, yBot = (wide ? -0.9 : -0.97) + 2 * ins.b / hh;
    if (yTop - yBot < 0.5) { var mid0 = (yTop + yBot) / 2; yTop = mid0 + 0.25; yBot = mid0 - 0.25; }
    for (var it = 0; it < 22; it++) {
      var mid = (lo + hi) / 2; placeCam(mid, cam.yawBase, cam.pitch, false); camera.updateMatrixWorld();
      var ok = pts.every(function (p) { v.copy(p).project(camera); return Math.abs(v.x) < lim && v.y < yTop && v.y > yBot; });
      if (ok) hi = mid; else lo = mid;
    }
    cam.fit = hi;
  }
  var tgt = null;
  function placeCam(dist, yaw, pitch, withPan) {
    tgt = tgt || new V3();
    tgt.copy(cam.target); if (withPan) tgt.add(cam.pan);
    camera.position.set(tgt.x + Math.sin(yaw) * Math.cos(pitch) * dist, tgt.y + Math.sin(pitch) * dist, tgt.z + Math.cos(yaw) * Math.cos(pitch) * dist);
    camera.lookAt(tgt);
  }
  function applyCam() { placeCam(cam.fit * cam.zoom, cam.yaw, cam.pitch, true); }
  // Déplacement latéral de la caméra (en pixels d'écran), limité à la pièce.
  function clampPan() {
    if (!cur.def) return;
    var ext = 0.45 + Math.max(0, cam.zoom - 1) * 0.6, hx = cur.def.W * ext + 2, hz = cur.def.D * ext + 2;
    cam.pan.x = Math.max(-hx - cam.target.x, Math.min(hx - cam.target.x, cam.pan.x));
    cam.pan.z = Math.max(-hz - cam.target.z, Math.min(hz - cam.target.z, cam.pan.z));
    cam.pan.y = 0;
  }
  function panBy(dx, dy) {
    var h = Math.max(1, host.clientHeight), k = 0.536 * cam.fit * cam.zoom / h;
    var rx = Math.cos(cam.yaw), rz = -Math.sin(cam.yaw), fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw), g = dy * k / Math.max(0.5, Math.sin(cam.pitch));
    cam.pan.x += -dx * k * rx + g * fx;
    cam.pan.z += -dx * k * rz + g * fz;
    clampPan(); camChanged();
  }
  // Zoom vers un point de l'écran: le point visé reste sous le curseur (approximativement).
  var groundPlane = null;
  function zoomAt(f, cx, cy) {
    var z0 = cam.zoom, z1 = Math.max(ZMIN, Math.min(ZMAX, z0 * f));
    if (z1 === z0) return;
    if (cx != null) {
      groundPlane = groundPlane || new THREE.Plane(new V3(0, 1, 0), -0.5);
      var r = canvas.getBoundingClientRect(), hit = new V3();
      ndc.set((cx - r.left) / r.width * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      if (ray.ray.intersectPlane(groundPlane, hit)) {
        var c = cam.target.clone().add(cam.pan), t = 1 - z1 / z0;
        cam.pan.x += (hit.x - c.x) * t; cam.pan.z += (hit.z - c.z) * t;
      }
    }
    cam.zoom = z1;
    if (z1 >= 0.999) { cam.pan.multiplyScalar(0.85); }
    clampPan(); camChanged();
  }
  function camChanged() {
    var m = Math.abs(cam.zoom - 1) > 0.02 || cam.pan.lengthSq() > 0.01 || Math.abs(cam.yaw - cam.yawBase) > 0.03 || Math.abs(cam.pitch - PITCH0) > 0.03;
    if (m !== camMoved) { camMoved = m; if (camFn) camFn(m); }
  }
  function resetCam() { cam.zoom = 1; cam.yaw = cam.yawBase; cam.pitch = PITCH0; cam.pan.set(0, 0, 0); camChanged(); }
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
  // Reflets d'ambiance (studio virtuel flou): donne du volume au métal, aux écrans et aux surfaces vernies.
  function makeEnv() {
    try {
      var pm = new THREE.PMREMGenerator(R), es = new THREE.Scene(), bx = new THREE.BoxGeometry(1, 1, 1);
      var room = new THREE.Mesh(bx, new THREE.MeshBasicMaterial({ color: new THREE.Color(0x9a948c).multiplyScalar(0.32), side: THREE.BackSide })); room.scale.set(24, 12, 24); room.position.y = 5; es.add(room);
      var floor = new THREE.Mesh(bx, new THREE.MeshBasicMaterial({ color: new THREE.Color(0x6b5a4a).multiplyScalar(0.5) })); floor.scale.set(24, 0.2, 24); floor.position.y = -0.9; es.add(floor);
      [[0, 10.8, 0, 12, 0.1, 12, 0xffffff, 1.6], [-11.8, 5, -2, 0.1, 6, 10, 0xfff1dc, 1.1], [11.8, 5, 3, 0.1, 5, 8, 0xdfeaff, 0.9], [0, 5, -11.8, 10, 4, 0.1, 0xffffff, 0.7]].forEach(function (q) {
        var m = new THREE.Mesh(bx, new THREE.MeshBasicMaterial({ color: new THREE.Color(q[6]).multiplyScalar(q[7]) })); m.position.set(q[0], q[1], q[2]); m.scale.set(q[3], q[4], q[5]); es.add(m);
      });
      scene.environment = pm.fromScene(es, 0.035).texture;
      pm.dispose(); bx.dispose();
    } catch (e) { /* reflets facultatifs */ }
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
    hemi.intensity = dark ? 0.95 : 0.78; hemi.color.set(dark ? 0xd2d9ff : 0xfff4e6); hemi.groundColor.set(dark ? 0x4a4258 : 0x6b5a4a);
    if (deco.light) { hemi.color.lerp(new THREE.Color(deco.light), dark ? 0.75 : 0.6); hemi.intensity *= 1.05; }
    sun.intensity = dark ? 1.0 : 1.7; sun.color.set(dark ? 0xc4d0ff : 0xfff0dc);
    if (deco.light) sun.color.lerp(new THREE.Color(deco.light), 0.35);
    fill.intensity = dark ? 0.32 : 0.35;
    if (R) R.toneMappingExposure = dark ? 1.12 : 0.97;
    OUT.base = { sun: sun.color.clone(), ground: hemi.groundColor.clone() };
    if (OUT.g) applyEnv(0);
  }

  // ---------- Construction d'un lieu ----------
  function setPlace(key, tier) {
    cur.placeKey = key; cur.def = PLACES[key]; cur.tier = tier;
    if (roomG) { world.remove(roomG); disposeTree(roomG); }
    Object.keys(itemNodes).forEach(function (id) { itemsG.remove(itemNodes[id]); });
    itemNodes = {}; blinkers = []; fallbackUsed = 0; cur.key = ''; cur.edrums = null; cur.edrumsSeen = false; cur.shelf = null;
    Object.keys(staffNodes).forEach(removeStaff);
    Object.keys(artistNodes).forEach(function (id) { staffG.remove(artistNodes[id].g); delete artistNodes[id]; });
    if (souvG) { world.remove(souvG); souvG = null; } globeNode = null; souvKey = '';
    deskNodes.forEach(function (d) { world.remove(d); }); deskNodes = [];
    roomG = buildRoom(cur.def, tier); world.add(roomG);
    var def = cur.def;
    var md = desk(roomG, def, def.desk[0], def.desk[1], def.desk[2], key === 'pro' ? 'dark' : key === 'complexe' ? 'white' : null);
    chair(roomG, def.desk[0], def.desk[1] + 0.75, 0, key === 'complexe' ? 0x7d1f2b : 0x2f3a4a).name = 'fauteuil';
    if (player) world.remove(player);
    player = person({ s: 1, h: 0, c: 8, y: 3 }, 'sit', { headphones: true, pants: 0x2d2d2d });
    player.position.set(def.desk[0], 0, def.desk[1] + 0.82);
    player.userData.pick = { type: 'player' };
    player.traverse(function (o) { if (o.isMesh) o.userData.pick = player.userData.pick; });
    world.add(player);
    if (cam.pan) cam.pan.set(0, 0, 0);
    lightRoom(); fitCamera(); applyCam(); camChanged();
  }
  function disposeTree(o) { o.traverse(function (x) { if (x.isLight && x.dispose) x.dispose(); }); }

  function syncDesks(cap) {
    var def = cur.def;
    if (deskNodes.length === cap) return;
    deskNodes.forEach(function (d) { world.remove(d); }); deskNodes = [];
    for (var i = 0; i < Math.min(cap, def.staff.length); i++) { var d = staffDesk(world, def.staff[i][0], def.staff[i][1], i); batchInterior(d); deskNodes.push(d); }
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


  // Batterie électronique compacte (pads sur un rack), présente dès que les clashs sont ouverts.
  function buildEdrums(def) {
    var e = def.edrums, g = grp(null, e[0], 0, e[1], e[2]);
    g.name = 'batterie électronique';
    var rack = M(0x2b2e35, { m: 0.5, r: 0.4 }), pad = M(0x1a1c20, { r: 0.8 }), rim = M(C.metal, { m: 0.7, r: 0.3 });
    // montants et barre du rack
    [-0.36, 0.36].forEach(function (x) { cyl(g, 0.025, 0.78, rack, x, 0, -0.12); });
    box(g, 0.8, 0.04, 0.04, rack, 0, 0.72, -0.12);
    box(g, 0.04, 0.04, 0.32, rack, -0.36, 0.72, 0.02); box(g, 0.04, 0.04, 0.32, rack, 0.36, 0.72, 0.02);
    // pads: caisse claire, toms, cymbales (disques plats)
    [[-0.2, 0.7, 0.14, 0.13, 0xff4d6d], [0.08, 0.84, -0.08, 0.11, 0x66ccff], [0.3, 0.8, 0.04, 0.11, 0x6cff9a]].forEach(function (p) {
      cyl(g, p[3], 0.05, pad, p[0], p[1], p[2], 22);
      cyl(g, p[3] - 0.01, 0.006, tintMat('grille', grilleDraw, 0x9a9ea6, { r: 0.85, size: 64 }), p[0], p[1] + 0.048, p[2], 22).castShadow = false;
      mesh(g, G('ring', p[3], 0.011, 26), M(p[4], { e: p[4], ei: 0.9 }), p[0], p[1] + 0.05, p[2], 1, 1, 1).rotation.x = Math.PI / 2;
    });
    [[-0.38, 1.02, 0.02, 0.17], [0.4, 1.06, -0.04, 0.18]].forEach(function (c) { cyl(g, 0.012, c[1], rack, c[0], 0, c[2] - 0.04); cyl(g, c[3], 0.012, rim, c[0], c[1], c[2], 22); });
    // pédale de grosse caisse et module
    box(g, 0.24, 0.3, 0.2, pad, 0.02, 0, 0.02);
    box(g, 0.1, 0.03, 0.26, rack, 0.02, 0, 0.3);
    var mod = box(g, 0.22, 0.12, 0.05, M(0x111215), 0.36, 0.95, 0.1); mod.rotation.x = -0.4;
    blinkers.push({ m: box(g, 0.14, 0.04, 0.01, M(0xff8a3d, { e: 0xff8a3d, ei: 1.5 }), 0.36, 0.98, 0.13), ph: 0.7, soft: true });
    // tabouret
    cyl(g, 0.17, 0.05, M(0x1c1d21), 0, 0.5, 0.5, 18); cyl(g, 0.03, 0.5, rack, 0, 0, 0.5);
    [0, 2.1, 4.2].forEach(function (a) { var l = box(g, 0.03, 0.03, 0.3, rack, Math.sin(a) * 0.1, 0.02, 0.5 + Math.cos(a) * 0.1); l.rotation.y = a; });
    g.traverse(function (o) { if (o.isMesh) o.userData.pick = { type: 'hot', id: 'clash' }; });
    batchInterior(g);
    return g;
  }
  // ---------- Carte du monde (globe du studio et globe interactif) ----------
  var GEO = (root.GameData && root.GameData.GEO) || { land: [], countries: {}, cities: {} };
  // info: { visited: {pays: 1}, home: 'fr', sel: 'fr', cities: [[lat, lon]], stars: [[lat, lon]] }
  function drawWorld(x, w, h, info) {
    info = info || {};
    function P(lon, lat) { return [(lon + 180) / 360 * w, (90 - lat) / 180 * h]; }
    function poly(a) { x.beginPath(); for (var i = 0; i < a.length; i += 2) { var p = P(a[i], a[i + 1]); if (i) x.lineTo(p[0], p[1]); else x.moveTo(p[0], p[1]); } x.closePath(); }
    var g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#173a5c'); g.addColorStop(0.5, '#23598a'); g.addColorStop(1, '#173a5c');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    x.strokeStyle = 'rgba(255,255,255,0.08)'; x.lineWidth = Math.max(1, w / 1024);
    for (var lo = -150; lo < 180; lo += 30) { var a = P(lo, 0)[0]; x.beginPath(); x.moveTo(a, 0); x.lineTo(a, h); x.stroke(); }
    for (var la = -60; la <= 60; la += 30) { var b = P(0, la)[1]; x.beginPath(); x.moveTo(0, b); x.lineTo(w, b); x.stroke(); }
    x.fillStyle = '#7da874'; x.strokeStyle = 'rgba(30,60,30,0.35)'; x.lineWidth = Math.max(1, w / 900);
    GEO.land.forEach(function (p) { poly(p); x.fill(); x.stroke(); });
    Object.keys(GEO.countries).forEach(function (k) {
      var vis = info.visited && info.visited[k], home = info.home === k;
      x.fillStyle = home ? '#ffd166' : vis ? '#ff8a3d' : '#94bd8a';
      GEO.countries[k].forEach(function (p) { poly(p); x.fill(); });
      if (info.sel === k) { x.strokeStyle = '#ffffff'; x.lineWidth = Math.max(2, w / 400); GEO.countries[k].forEach(function (p) { poly(p); x.stroke(); }); }
    });
    var r = Math.max(2, w / 520);
    (info.cities || []).forEach(function (c) { var p = P(c[1], c[0]); x.fillStyle = 'rgba(255,255,255,0.35)'; x.beginPath(); x.arc(p[0], p[1], r * 2, 0, 6.29); x.fill(); x.fillStyle = '#ffffff'; x.beginPath(); x.arc(p[0], p[1], r, 0, 6.29); x.fill(); });
    (info.stars || []).forEach(function (c) {
      var p = P(c[1], c[0]), R0 = r * 3.2; x.fillStyle = '#ffd166'; x.strokeStyle = '#5b3fc4'; x.lineWidth = Math.max(1, r * 0.6); x.beginPath();
      for (var i = 0; i < 10; i++) { var an = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? R0 * 0.45 : R0; x.lineTo(p[0] + Math.cos(an) * rr, p[1] + Math.sin(an) * rr); }
      x.closePath(); x.fill(); x.stroke();
    });
  }
  function inPoly(a, lon, lat) {
    var inside = false;
    for (var i = 0, j = a.length - 2; i < a.length; j = i, i += 2) {
      var xi = a[i], yi = a[i + 1], xj = a[j], yj = a[j + 1];
      if ((yi > lat) !== (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  function countryAt(lat, lon) {
    var ks = Object.keys(GEO.countries);
    for (var i = 0; i < ks.length; i++) if (GEO.countries[ks[i]].some(function (p) { return inPoly(p, lon, lat); })) return ks[i];
    return null;
  }

  // ---------- Souvenirs de tournée: affiches aux murs, globe sur pied ----------
  // Cherche des emplacements libres: boîte candidate comparée aux boîtes de tout ce qui est déjà posé.
  function obstacles() {
    var out = [];
    function add(o) { var b = new THREE.Box3().setFromObject(o); if (!b.isEmpty()) out.push(b); }
    world.updateMatrixWorld(true);
    roomG.children.forEach(function (o) {
      if (o.isLight) return;
      var b = new THREE.Box3().setFromObject(o); if (b.isEmpty()) return;
      var sx = b.max.x - b.min.x, sz = b.max.z - b.min.z, sy = b.max.y - b.min.y;
      if (sy < 0.03 || sx > cur.def.W * 0.8 || sz > cur.def.D * 0.8) return; // sol, murs, tapis
      out.push(b);
    });
    Object.keys(itemNodes).forEach(function (id) { if (!itemNodes[id].userData.ghost) add(itemNodes[id]); });
    deskNodes.forEach(add);
    Object.keys(staffNodes).forEach(function (id) { var n = staffNodes[id]; if (n.cur) add(n.cur); });
    Object.keys(artistNodes).forEach(function (id) { add(artistNodes[id].g); });
    if (player) add(player);
    var def = cur.def;
    (def.staff || []).forEach(function (p) { out.push(new THREE.Box3(new V3(p[0] - 0.7, 0, p[1] - 0.6), new V3(p[0] + 0.7, 1.6, p[1] + 0.9))); }); // postes futurs
    (def.artists || []).forEach(function (p) { out.push(new THREE.Box3(new V3(p[0] - 0.4, 0, p[1] - 0.4), new V3(p[0] + 0.4, 1.9, p[1] + 0.4))); });
    if (def.board) out.push(new THREE.Box3(new V3(def.board[0] - 1.2, 0, def.board[1] - 0.6), new V3(def.board[0] + 1.2, 2, def.board[1] + 0.8)));
    return out;
  }
  function freeBox(b, obs) { for (var i = 0; i < obs.length; i++) if (obs[i].intersectsBox(b)) return false; return true; }
  function posterDraw(p) {
    return function (c, w, h) {
      c.fillStyle = p.bg; c.fillRect(0, 0, w, h);
      var g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, 'rgba(255,255,255,0.18)'); g.addColorStop(1, 'rgba(0,0,0,0.35)'); c.fillStyle = g; c.fillRect(0, 0, w, h);
      c.fillStyle = 'rgba(255,255,255,0.9)'; c.beginPath(); c.arc(w / 2, h * 0.38, w * 0.26, 0, 6.29); c.fill();
      c.fillStyle = p.bg; c.beginPath(); c.arc(w / 2, h * 0.38, w * 0.1, 0, 6.29); c.fill();
      c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.font = '800 ' + Math.round(w * 0.1) + 'px system-ui, sans-serif'; c.fillText(p.kicker, w / 2, h * 0.09);
      var t = p.title, fs = w * 0.15; c.font = '900 ' + Math.round(fs) + 'px system-ui, sans-serif';
      while (c.measureText(t).width > w * 0.9 && fs > 8) { fs -= 1; c.font = '900 ' + Math.round(fs) + 'px system-ui, sans-serif'; }
      c.fillText(t, w / 2, h * 0.73);
      c.font = '700 ' + Math.round(w * 0.085) + 'px system-ui, sans-serif'; c.fillText(p.sub, w / 2, h * 0.86);
    };
  }
  function buildPoster(p) {
    var g = grp(null);
    box(g, 0.46, 0.64, 0.025, M(0x1b1b1b), 0, -0.64, 0);
    box(g, 0.4, 0.58, 0.01, texMat('souv-' + p.id + '-' + p.title, 128, 186, posterDraw(p), { r: 0.6 }), 0, -0.61, 0.02);
    g.traverse(function (o) { if (o.isMesh) { o.castShadow = false; o.userData.pick = { type: 'souvenir', id: p.id }; } });
    g.name = 'souvenir';
    return g;
  }
  function buildGlobe() {
    var g = grp(null), wood = M(C.woodD), brass = M(C.gold, { m: 0.8, r: 0.3 });
    cyl(g, 0.2, 0.04, wood, 0, 0, 0, 20); cyl(g, 0.025, 0.62, wood, 0, 0.04, 0, 10);
    var head = grp(g, 0, 0.92, 0); head.rotation.z = 0.41;
    var tex = canvasTex('globe-mini', 512, 256, function (x, w, h) { drawWorld(x, w, h, {}); });
    var ball = new THREE.Mesh(new THREE.SphereGeometry(0.22, 32, 24), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55 }));
    ball.castShadow = true; head.add(ball); head.userData.ball = ball;
    mesh(head, G('ring', 0.245, 0.012, 40), brass, 0, 0, 0, 1, 1, 1).rotation.y = Math.PI / 2;
    g.userData.ball = ball;
    g.traverse(function (o) { if (o.isMesh) o.userData.pick = { type: 'hot', id: 'globe' }; });
    g.name = 'globe';
    return g;
  }
  // v.souvenirs: [{ id, title, sub, kicker, bg }] · v.globe: globe sur pied
  function syncSouvenirs(v) {
    var list = v.souvenirs || [], key = JSON.stringify(list) + '|' + !!v.globe + '|' + cur.placeKey + '|' + cur.tier + '|' + Object.keys(itemNodes).join(',') + '|' + deskNodes.length + '|' + Object.keys(artistNodes).length;
    if (key === souvKey) return;
    souvKey = key;
    if (souvG) { world.remove(souvG); souvG = null; } globeNode = null;
    if (!list.length && !v.globe) return;
    souvG = grp(world);
    var def = cur.def, obs = obstacles(), W = def.W, D = def.D;
    if (v.globe) {
      var spots = [];
      for (var u = -D / 2 + 0.8; u <= D / 2 - 0.6; u += 0.4) spots.push([-W / 2 + 0.45, u]);
      for (var u2 = -W / 2 + 0.8; u2 <= W / 2 - 0.6; u2 += 0.4) spots.push([u2, -D / 2 + 0.45]);
      for (var i = 0; i < spots.length; i++) {
        var p = spots[i], b = new THREE.Box3(new V3(p[0] - 0.32, 0.01, p[1] - 0.32), new V3(p[0] + 0.32, 1.25, p[1] + 0.32));
        if (!freeBox(b, obs)) continue;
        globeNode = buildGlobe(); globeNode.position.set(p[0], 0, p[1]); souvG.add(globeNode); obs.push(b);
        break;
      }
    }
    var cands = [];
    [2.05, 1.45, 2.7].forEach(function (y) {
      for (var u = -W / 2 + 0.45; u <= W / 2 - 0.45; u += 0.52) cands.push({ w: 'b', u: u, y: y });
      for (var u2 = -D / 2 + 0.45; u2 <= D / 2 - 0.45; u2 += 0.52) cands.push({ w: 'l', u: u2, y: y });
    });
    var k = 0;
    for (var c = 0; c < cands.length && k < list.length; c++) {
      var q = cands[c], top = Math.min(q.y + 0.04, def.H - 0.15), bx;
      if (q.y + 0.04 > def.H - 0.1) continue;
      bx = q.w === 'b' ? new THREE.Box3(new V3(q.u - 0.27, q.y - 0.7, -D / 2), new V3(q.u + 0.27, top, -D / 2 + 0.16))
        : new THREE.Box3(new V3(-W / 2, q.y - 0.7, q.u - 0.27), new V3(-W / 2 + 0.16, top, q.u + 0.27));
      if (!freeBox(bx, obs)) continue;
      var n = buildPoster(list[k]);
      if (q.w === 'b') n.position.set(q.u, q.y, -D / 2 + 0.025); else { n.position.set(-W / 2 + 0.025, q.y, q.u); n.rotation.y = Math.PI / 2; }
      souvG.add(n); obs.push(bx); k++;
    }
  }

  function syncExtras(v) {
    var want = !!v.edrums && !(v.owned && v.owned.studioA) && !!cur.def.edrums;
    if (want && !cur.edrums) { cur.edrums = buildEdrums(cur.def); roomG.add(cur.edrums); if (!reduce && cur.edrumsSeen) { cur.edrums.scale.set(0.01, 0.01, 0.01); anims.push({ n: cur.edrums, t: 0, d: 0.7 }); sparkle(cur.edrums.position); } }
    else if (!want && cur.edrums) { roomG.remove(cur.edrums); cur.edrums = null; }
    cur.edrumsSeen = true;
  }

  // =====================================================================
  // ---------- Extérieur: jardin, rue, cour ou domaine selon le lieu ----------
  // Le décor vit au rythme du calendrier de carrière (Game.env): feuillage, floraisons, neige, pluie, brume et fêtes.
  // Le pays du studio choisit les essences d'arbres, les façades et le mobilier urbain.
  // Tout ce qui ne bouge pas est fusionné par matériau (quelques dizaines d'appels de dessin pour tout l'extérieur).
  var OUT = { allM: [], g: null, key: '', env: null, cur: null, mc: {}, tint: [], night: [], leafM: {}, bloomM: {}, flowerM: [], trees: [], spots: {}, inter: {}, fests: {}, t: 0, wet: 0, k: '' };
  var QUAL = { lvl: 2, pref: 'auto' }; // 0: économie, 1: équilibrée, 2: détaillée

  // Bruit à histogramme uniforme (texture linéaire): masque alphaTest pour faire apparaître feuilles, fleurs et neige par touches.
  var NOISE = {};
  function noiseTex(key, size, blobs, seed, rep) {
    if (NOISE[key]) return NOISE[key];
    var c = document.createElement('canvas'); c.width = c.height = size;
    var x = c.getContext('2d'), r = rnd(seed || 5), n = size * size, v = new Float32Array(n), img = x.createImageData(size, size);
    for (var k = 0; k < blobs; k++) {
      var cx = r() * size, cy = r() * size, rad = (0.03 + r() * 0.1) * size, a = 0.4 + r();
      for (var yy = -rad; yy <= rad; yy++) for (var xx = -rad; xx <= rad; xx++) {
        var d = (xx * xx + yy * yy) / (rad * rad); if (d > 1) continue;
        var px = ((Math.floor(cx + xx) % size) + size) % size, py = ((Math.floor(cy + yy) % size) + size) % size;
        v[py * size + px] += (1 - d) * a;
      }
    }
    for (var i = 0; i < n; i++) v[i] += r() * 0.3;
    var idx = new Uint32Array(n); for (i = 0; i < n; i++) idx[i] = i;
    idx.sort(function (a, b) { return v[a] - v[b]; });
    for (i = 0; i < n; i++) { var q = Math.round(i / (n - 1) * 255), p = idx[i] * 4; img.data[p] = img.data[p + 1] = img.data[p + 2] = q; img.data[p + 3] = 255; }
    x.putImageData(img, 0, 0);
    var t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
    if (rep) t.repeat.set(rep, rep);
    return (NOISE[key] = t);
  }
  // Matériaux propres à l'extérieur (teinte de neige, lampes de nuit), recréés à chaque construction.
  function OM(color, o) {
    o = o || {};
    var k = color + '|' + (o.r != null ? o.r : '') + '|' + (o.m || 0) + '|' + (o.flat ? 1 : 0) + '|' + (o.map ? o.map.uuid : '') + '|' + (o.e || '') + '|' + (o.ei || '') + '|' + (o.op || '') + '|' + (o.snow || 0) + '|' + (o.lamp ? 1 : 0);
    if (OUT.mc[k]) return OUT.mc[k];
    var std = o.m || (o.r != null && o.r < 0.4), p = { color: color, flatShading: !!o.flat };
    if (std) { p.roughness = o.r != null ? o.r : 0.9; p.metalness = o.m || 0; }
    if (o.map) p.map = o.map;
    if (o.e) { p.emissive = o.e; p.emissiveIntensity = o.ei || 1; }
    if (o.op) { p.transparent = true; p.opacity = o.op; p.depthWrite = false; }
    var m = std ? new THREE.MeshStandardMaterial(p) : new THREE.MeshLambertMaterial(p);
    if (o.snow) OUT.tint.push({ m: m, c: new THREE.Color(color), k: o.snow });
    if (o.lamp) OUT.night.push({ m: m, on: o.ei || 1.6 });
    OUT.allM.push(m);
    return (OUT.mc[k] = m);
  }
  // Vent: les feuillages ondulent doucement (décalage dans le shader, plus fort en hauteur).
  OUT.windU = { value: null };
  function windy(m) {
    m.onBeforeCompile = function (sh) {
      sh.uniforms.uWind = OUT.windU;
      sh.vertexShader = 'uniform vec2 uWind;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vec4 wp0 = modelMatrix * vec4(position, 1.0);\n  float sw0 = sin(uWind.x * 1.6 + wp0.x * 0.35 + wp0.z * 0.27) + 0.4 * sin(uWind.x * 3.1 + wp0.z * 0.8);\n  float hk0 = max(0.0, wp0.y - 0.8) * 0.022 * uWind.y;\n  transformed.x += sw0 * hk0; transformed.z += sw0 * hk0 * 0.6;');
    };
    m.customProgramCacheKey = function () { return 'wind'; };
    return m;
  }
  function maskMat(color, rep, o) { // matériau à masque (feuillage, fleurs, neige)
    o = o || {};
    if (!OUT.windU.value) OUT.windU.value = new THREE.Vector2(0, 0.5);
    var m = new THREE.MeshLambertMaterial({ color: color, flatShading: o.flat !== false, alphaMap: noiseTex('n' + (rep || 2), 128, 70, 7, rep || 2), alphaTest: 0.5 });
    if (o.wind !== false) windy(m);
    m.userData.dens = 1; OUT.allM.push(m);
    return m;
  }
  function setDens(m, d, meshes) {
    d = Math.max(0, Math.min(1, d));
    m.alphaTest = Math.max(0.002, Math.min(0.998, 1 - d));
    m.userData.dens = d;
    m.visible = d > 0.015;
  }
  // Géométries posées dans un groupe (repère local), réutilisées depuis le cache.
  function ico(p, r, mat, x, y, z, sx, sy, sz) { var m = mesh(p, G('ico', 1), mat, x, y, z, r * (sx || 1), r * (sy || 1), r * (sz || 1), false); return m; }
  function cone(p, r, h, mat, x, y, z, seg) { var m = mesh(p, G('cone', seg || 8), mat, x, (y || 0) + h / 2, z, r, h, r, false); return m; }

  // Fusionne tous les maillages statiques d'un groupe par matériau (repère du groupe).
  function mergeGeos(list) {
    var nv = 0, uv = true;
    list.forEach(function (g) { nv += g.attributes.position.count; if (!g.attributes.uv) uv = false; });
    var pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uvs = uv ? new Float32Array(nv * 2) : null, o = 0;
    list.forEach(function (g) {
      var c = g.attributes.position.count;
      pos.set(g.attributes.position.array, o * 3);
      if (g.attributes.normal) nor.set(g.attributes.normal.array, o * 3);
      if (uvs) uvs.set(g.attributes.uv.array, o * 2);
      o += c; g.dispose();
    });
    var out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    if (uvs) out.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    out.computeBoundingSphere(); out.computeBoundingBox();
    return out;
  }
  // o.cast: les maillages fusionnés projettent une ombre (intérieur); o.skip: maillages à garder tels quels (voyants animés).
  function batchStatic(root, o) {
    o = o || {};
    root.updateMatrixWorld(true);
    var inv = new THREE.Matrix4().copy(root.matrixWorld).invert(), m4 = new THREE.Matrix4(), by = {}, kill = [];
    root.traverse(function (x) {
      if (!x.isMesh || x.isInstancedMesh || Array.isArray(x.material)) return;
      for (var p = x; p && p !== root; p = p.parent) if (p.userData.keep) return;
      if (o.skip && o.skip.has(x)) return;
      if (x.matrixWorld.determinant() < 0) return;
      var g = x.geometry.index ? x.geometry.toNonIndexed() : x.geometry.clone();
      ['color', 'tangent', 'uv1', 'uv2'].forEach(function (a) { if (g.attributes[a]) g.deleteAttribute(a); });
      m4.multiplyMatrices(inv, x.matrixWorld); g.applyMatrix4(m4);
      var k = x.material.uuid + (o.cast && x.castShadow ? 's' : '');
      var b = by[k] = by[k] || { m: x.material, l: [], cast: o.cast && x.castShadow, pick: x.userData.pick, name: x.name };
      b.l.push(g);
      kill.push(x);
    });
    if (kill.length < 2) return;
    kill.forEach(function (x) { x.parent.remove(x); });
    Object.keys(by).forEach(function (k) {
      var b = by[k], mm = new THREE.Mesh(mergeGeos(b.l), b.m);
      mm.castShadow = !!b.cast; mm.receiveShadow = o.cast ? true : !!b.m.userData.recv; mm.matrixAutoUpdate = false; mm.updateMatrix();
      if (b.pick) mm.userData.pick = b.pick;
      root.add(mm);
    });
  }
  function batchInterior(g, from) {
    var skip = new Set(); for (var i = from || 0; i < blinkers.length; i++) skip.add(blinkers[i].m);
    blinkers.forEach(function (b) { skip.add(b.m); });
    batchStatic(g, { cast: true, skip: skip });
  }

  // ---------- Couleurs du décor ----------
  var LEAF = {
    platane: { spr: 0x9fd05a, sum: 0x4d8c3a, fall: 0xc79a42, bark: 0xb9a888, form: 'round', h: 1.25 },
    tilleul: { spr: 0xa6d860, sum: 0x55963c, fall: 0xe1c24a, bark: 0x6e5a48, form: 'oval', h: 1.1 },
    chene: { spr: 0x94c856, sum: 0x467f34, fall: 0xb06a2c, bark: 0x5e4a3a, form: 'round', h: 1.05 },
    hetre: { spr: 0xa9d86a, sum: 0x4f8a3a, fall: 0xbf6328, bark: 0x8d8a82, form: 'oval', h: 1.15 },
    erable: { spr: 0x9fd05a, sum: 0x4a8a38, fall: 0xd8402a, bark: 0x5b4a3e, form: 'round', h: 1.0 },
    bouleau: { spr: 0xb4dc66, sum: 0x67a846, fall: 0xe9cd45, bark: 0xeeeae2, form: 'slim', h: 1.15 },
    sakura: { spr: 0x9fd05a, sum: 0x56913c, fall: 0xd9773a, bark: 0x4a3530, form: 'wide', h: 0.85, flower: 0xf7b9d0 },
    momiji: { spr: 0xa5cf62, sum: 0x5c9a3c, fall: 0xd22a1e, bark: 0x4b3a33, form: 'wide', h: 0.75 },
    sapin: { sum: 0x2c6a45, bark: 0x5a4434, form: 'cone', ever: true, h: 1.2 },
    pin: { sum: 0x3c6d3a, bark: 0x7a5236, form: 'pine', ever: true, h: 1.25 },
    palmier: { sum: 0x4f9a3a, bark: 0x9a7a55, form: 'palm', ever: true, h: 1.2 },
    manguier: { sum: 0x2e6f34, bark: 0x5b4636, form: 'dome', ever: true, h: 1.0 },
    flamboyant: { sum: 0x5a9a3a, bark: 0x6e5a48, form: 'umbrella', ever: true, h: 1.0, flower: 0xe8401f },
    ipe: { sum: 0x5d9b3e, bark: 0x6a5240, form: 'round', ever: true, h: 1.0, flower: 0xf2c43a }
  };
  // Façades, toits et mobilier par pays
  var STYLE = {
    fr: { walls: [0xefe4cf, 0xe8dcc4, 0xf3ebdc, 0xdcd0b8], roof: 0x5d6670, roof2: 0xb5532f, trim: 0xf6f2ea, shutter: 0x5f7d95, fence: 'muret', mail: 0xe9c33b, door: 0x2f4a6b },
    uk: { walls: [0xa5523a, 0x9a4a35, 0xb2604a, 0xe9e4da], roof: 0x4a4e57, roof2: 0x4a4e57, trim: 0xffffff, shutter: 0x2f3a4a, fence: 'haie', mail: 0xc8202a, door: 0x1f3d2a },
    us: { walls: [0xf2efe8, 0x9fb7c8, 0xe6d3b3, 0xb46a52], roof: 0x5a5a5a, roof2: 0x6b4a3a, trim: 0xffffff, shutter: 0x2f3e55, fence: 'piquets', mail: 0x8a9096, door: 0xa3332b },
    jp: { walls: [0xf1efe9, 0xd9d6cf, 0xc9c4ba, 0xece4d4], roof: 0x3e4650, roof2: 0x2e3540, trim: 0x8a6a4a, shutter: 0x6b5a48, fence: 'bambou', mail: 0xd8342c, door: 0x7a5a3a },
    br: { walls: [0xf2c14e, 0x4fb3a9, 0xe8743b, 0xf4a6c0, 0x7fb3ff], roof: 0xb5532f, roof2: 0xc4643c, trim: 0xffffff, shutter: 0x2f7d6b, fence: 'mur', mail: 0xf2c14e, door: 0x2f6f8a },
    ng: { walls: [0xe9d8b8, 0x8fc9a8, 0xf0b35a, 0xd7a8c8, 0xcfe0e8], roof: 0x8a8f94, roof2: 0x9a6a3a, trim: 0xffffff, shutter: 0x2f7d4f, fence: 'mur', mail: 0x1f8a4c, door: 0x8a4a2a },
    de: { walls: [0xf3ede1, 0xe7d9b8, 0xd8e2e6, 0xf0d9c8], roof: 0x9a3e2c, roof2: 0x5a5a5a, trim: 0x6a4a32, shutter: 0x4a6a4a, fence: 'bois', mail: 0xf2c14e, door: 0x6a3a2a }
  };
  function lerpHex(a, b, t, out) { out = out || new THREE.Color(); out.setHex(a); OUT._c2 = OUT._c2 || new THREE.Color(); OUT._c2.setHex(b); return out.lerp(OUT._c2, Math.max(0, Math.min(1, t))); }

  // ---------- Textures du sol ----------
  function grassDraw(c, w, h) {
    c.fillStyle = '#c9c9c9'; c.fillRect(0, 0, w, h);
    var r = rnd(13);
    for (var i = 0; i < 2600; i++) { var l = 150 + r() * 105; c.fillStyle = 'rgb(' + l + ',' + l + ',' + l + ')'; c.fillRect(r() * w, r() * h, 1 + r() * 2.5, 2 + r() * 5); }
  }
  function pavingDraw(base, line, cols, rows) {
    return function (c, w, h) {
      c.fillStyle = base; c.fillRect(0, 0, w, h); var r = rnd(17), cw = w / cols, rh = h / rows;
      for (var y = 0; y < rows; y++) for (var x = 0; x < cols; x++) { var l = r() * 0.12; c.fillStyle = 'rgba(0,0,0,' + l.toFixed(3) + ')'; c.fillRect(x * cw + ((y % 2) * cw / 2) % cw, y * rh, cw - 2, rh - 2); }
      c.strokeStyle = line; c.lineWidth = 2;
      for (y = 0; y <= rows; y++) { c.beginPath(); c.moveTo(0, y * rh); c.lineTo(w, y * rh); c.stroke(); }
      for (y = 0; y < rows; y++) for (x = 0; x <= cols; x++) { var xx = x * cw + (y % 2) * cw / 2; c.beginPath(); c.moveTo(xx, y * rh); c.lineTo(xx, (y + 1) * rh); c.stroke(); }
    };
  }
  function asphaltDraw(c, w, h) { c.fillStyle = '#56595e'; c.fillRect(0, 0, w, h); var r = rnd(23); for (var i = 0; i < 1400; i++) { var l = r() > 0.5 ? 255 : 0; c.fillStyle = 'rgba(' + l + ',' + l + ',' + l + ',' + (0.04 + r() * 0.06).toFixed(3) + ')'; c.fillRect(r() * w, r() * h, 2, 2); } }
  function gravelDraw(c, w, h) { c.fillStyle = '#d8cdb8'; c.fillRect(0, 0, w, h); var r = rnd(29); for (var i = 0; i < 2200; i++) { var l = 160 + r() * 80; c.fillStyle = 'rgb(' + l + ',' + (l - 8) + ',' + (l - 22) + ')'; c.beginPath(); c.arc(r() * w, r() * h, 0.8 + r() * 1.8, 0, 6.3); c.fill(); } }
  function flat(p, w, d, mat, x, z, y, ry) { // dalle posée au sol
    var m = mesh(p, G('box'), mat, x, (y != null ? y : -0.12), z, w, 0.04, d, false); if (ry) m.rotation.y = ry; m.receiveShadow = false; return m;
  }

  // ---------- Végétation ----------
  // Arbre d'une essence donnée. Feuillage (masqué selon la saison), fleurs éventuelles, neige sur les conifères.
  function leafMat(sp) { return OUT.leafM[sp] || (OUT.leafM[sp] = maskMat(LEAF[sp].sum, 2)); }
  function bloomMat(sp) { return OUT.bloomM[sp] || (OUT.bloomM[sp] = maskMat(LEAF[sp].flower || 0xffffff, 3)); }
  function capMat() { return OUT.capM || (OUT.capM = maskMat(0xf7fbff, 3, { r: 0.6 })); }
  function tree(p, sp, x, z, s, r) {
    var L = LEAF[sp] || LEAF.chene, g = grp(p, x, -0.12, z, r() * 6.28), bark = OM(L.bark, { r: 0.95, snow: 0.15 }), lm = leafMat(sp), h = (L.h || 1) * s;
    g.name = 'arbre';
    var top;
    if (L.form === 'cone') {
      cyl(g, 0.1 * s, 0.6 * s, bark, 0, 0, 0, 8, 0.12 * s);
      for (var i = 0; i < 4; i++) {
        var y = (0.45 + i * 0.62) * s, rr = (1.05 - i * 0.22) * s;
        cone(g, rr, 1.1 * s, lm, 0, y, 0, 9);
        cone(g, rr * 0.86, 0.5 * s, capMat(), 0, y + 0.62 * s, 0, 9);
      }
      top = 3.2 * s;
    } else if (L.form === 'pine') {
      cyl(g, 0.11 * s, 2.6 * h, bark, 0, 0, 0, 8, 0.07 * s);
      [[0, 2.7, 0, 1.0], [0.5, 2.45, 0.2, 0.7], [-0.45, 2.5, -0.25, 0.75], [0.1, 3.0, -0.3, 0.6]].forEach(function (b) {
        ico(g, b[3] * s, lm, b[0] * s, b[1] * h, b[2] * s, 1.25, 0.45, 1.25); ico(g, b[3] * s * 0.95, capMat(), b[0] * s, b[1] * h + 0.14 * s, b[2] * s, 1.15, 0.28, 1.15);
      });
      top = 3.3 * h;
    } else if (L.form === 'palm') {
      var seg = 6, px = 0, py = 0, lean = 0.08 + r() * 0.08;
      for (var k = 0; k < seg; k++) { var c = cyl(g, (0.13 - k * 0.012) * s, 0.55 * s, bark, px, py, 0, 8, (0.12 - k * 0.012) * s); c.rotation.z = -lean * k * 0.6; px += Math.sin(lean * k * 0.6) * 0.55 * s; py += Math.cos(lean * k * 0.6) * 0.53 * s; }
      var crown = grp(g, px, py, 0);
      for (var f = 0; f < 8; f++) {
        var fr = grp(crown, 0, 0, 0, f / 8 * 6.28 + r() * 0.3);
        var lf = mesh(fr, G('cone', 4), lm, 0, -0.05 * s, 0.75 * s, 0.22 * s, 1.6 * s, 0.05 * s, false); lf.rotation.x = Math.PI / 2 + 0.55;
      }
      for (var cn = 0; cn < 3; cn++) sph(crown, 0.08 * s, OM(0x6b4a2a), Math.cos(cn * 2.1) * 0.12 * s, -0.12 * s, Math.sin(cn * 2.1) * 0.12 * s, 6).castShadow = false;
      top = py + 0.4 * s;
    } else {
      // tronc et branches
      var th = (L.form === 'umbrella' ? 1.7 : L.form === 'wide' ? 0.9 : L.form === 'slim' ? 1.5 : 1.25) * h;
      cyl(g, 0.12 * s, th, bark, 0, 0, 0, 8, (L.form === 'slim' ? 0.07 : 0.09) * s);
      var nb = L.form === 'wide' || L.form === 'umbrella' ? 5 : 4;
      for (var b = 0; b < nb; b++) {
        var a = b / nb * 6.28 + r() * 0.5, br = grp(g, 0, th * (0.75 + r() * 0.2), 0, a);
        var bl = (L.form === 'wide' ? 0.95 : L.form === 'umbrella' ? 1.1 : 0.7) * s, tilt = L.form === 'wide' || L.form === 'umbrella' ? 0.95 : 0.6;
        var bm = mesh(br, G('cyl', 0.6, 1, 6), bark, 0, 0, 0, 0.06 * s, bl, 0.06 * s, false); bm.position.set(0, Math.cos(tilt) * bl / 2, Math.sin(tilt) * bl / 2); bm.rotation.x = tilt;
      }
      // houppier en grappes
      var cy = th + 0.55 * s, blobs = [];
      if (L.form === 'slim') blobs = [[0, 0.1, 0, 0.62, 1.5], [0.25, -0.35, 0.1, 0.45, 1.2], [-0.22, 0.45, -0.1, 0.42, 1.3], [0.05, 0.9, 0.05, 0.35, 1.3]];
      else if (L.form === 'oval') blobs = [[0, 0.1, 0, 0.85, 1.25], [0.5, -0.1, 0.2, 0.6, 1], [-0.45, 0.05, -0.25, 0.62, 1], [0.1, 0.75, -0.1, 0.6, 1.1], [-0.2, -0.35, 0.45, 0.5, 0.9]];
      else if (L.form === 'wide') blobs = [[0, 0, 0, 0.8, 0.6], [0.8, -0.1, 0.3, 0.62, 0.55], [-0.75, -0.05, -0.2, 0.65, 0.55], [0.2, 0.25, -0.75, 0.58, 0.5], [-0.3, 0.2, 0.75, 0.55, 0.5], [0, 0.45, 0, 0.5, 0.5]];
      else if (L.form === 'umbrella') blobs = [[0, 0.1, 0, 1.0, 0.42], [0.95, 0, 0.2, 0.7, 0.4], [-0.9, 0.05, -0.3, 0.72, 0.4], [0.2, 0, -0.95, 0.7, 0.4], [-0.25, 0.05, 0.9, 0.7, 0.4]];
      else if (L.form === 'dome') blobs = [[0, 0.2, 0, 1.05, 0.85], [0.7, -0.1, 0.3, 0.7, 0.75], [-0.7, -0.05, -0.2, 0.72, 0.75], [0.1, -0.1, -0.75, 0.7, 0.7], [-0.2, -0.05, 0.75, 0.7, 0.7]];
      else blobs = [[0, 0.15, 0, 0.9, 0.95], [0.6, -0.1, 0.3, 0.62, 0.85], [-0.55, 0, -0.3, 0.65, 0.85], [0.15, 0.6, -0.2, 0.55, 0.85], [-0.25, -0.25, 0.55, 0.55, 0.8]];
      blobs.forEach(function (q) {
        var j = 0.85 + r() * 0.3;
        ico(g, q[3] * s * j, lm, q[0] * s, cy + q[1] * s, q[2] * s, 1, q[4], 1);
        if (L.flower) ico(g, q[3] * s * j * 1.04, bloomMat(sp), q[0] * s, cy + q[1] * s + 0.02, q[2] * s, 1, q[4], 1);
      });
      top = cy + 0.8 * s;
    }
    // ombre portée douce au pied
    var sh = mesh(g, G('circle'), OUT.shadowM, 0, 0.045, 0, 0.9 * s, 0.9 * s, 0.9 * s, false); sh.rotation.x = -Math.PI / 2; sh.renderOrder = -1;
    OUT.trees.push({ g: g, sp: sp, top: top, x: x, z: z, s: s });
    return g;
  }
  function bush(p, x, z, s, col, r, round) {
    var m = OM(col, { flat: true, snow: 0.55, r: 0.9 }), g = grp(p, x, -0.12, z);
    ico(g, 0.45 * s, m, 0, 0.32 * s, 0, 1.2, 0.8, 1.1);
    if (!round) { ico(g, 0.32 * s, m, 0.32 * s, 0.25 * s, 0.1 * s, 1, 0.8, 1); ico(g, 0.3 * s, m, -0.3 * s, 0.22 * s, -0.08 * s, 1, 0.8, 1); }
    return g;
  }
  function hedge(p, x, z, w, d, h, col) {
    var m = OM(col || 0x3f7a3c, { flat: true, snow: 0.6 }), g = grp(p, x, -0.12, z);
    box(g, w, h, d, m, 0, 0, 0); box(g, w * 0.96, 0.08, d * 0.96, OM(col ? col + 0x0a0a0a : 0x4a8a44, { flat: true, snow: 0.85 }), 0, h, 0);
    return g;
  }
  // Massif de fleurs: tiges et corolles qui s'ouvrent au printemps et disparaissent l'hiver.
  function flowerBed(p, x, z, w, d, cols, r, n) {
    var g = grp(p, x, -0.12, z), soil = OM(0x6a4a34, { snow: 0.9 });
    box(g, w, 0.08, d, soil, 0, 0, 0);
    box(g, w + 0.08, 0.12, 0.06, OM(0x9a958a, { snow: 0.6 }), 0, 0, d / 2); box(g, w + 0.08, 0.12, 0.06, OM(0x9a958a, { snow: 0.6 }), 0, 0, -d / 2);
    var stem = OM(0x4f8a3a, { snow: 0.3 });
    n = n || Math.round(w * d * 14);
    for (var i = 0; i < n; i++) {
      var fx = (r() - 0.5) * w * 0.9, fz = (r() - 0.5) * d * 0.8, fh = 0.14 + r() * 0.16;
      cyl(g, 0.012, fh, stem, fx, 0.06, fz, 4).castShadow = false;
      var ci = Math.floor(r() * cols.length);
      ico(g, 0.055, flowerMat(cols[ci], ci), fx, 0.08 + fh, fz, 1, 0.8, 1);
    }
    return g;
  }
  function flowerMat(col, i) {
    var k = 'f' + col;
    if (!OUT.mc[k]) { OUT.mc[k] = maskMat(col, 1, { r: 0.7 }); OUT.flowerM.push(OUT.mc[k]); }
    return OUT.mc[k];
  }
  // Touffes d'herbe (instanciées) qui prennent la couleur de la pelouse.
  function grassTufts(p, n, inside, r) {
    var geo = new THREE.ConeGeometry(0.05, 0.22, 4), im = new THREE.InstancedMesh(geo, OUT.tuftM, n), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new V3(), ps = new V3(), k = 0;
    for (var i = 0; i < n * 6 && k < n; i++) {
      var x = (r() - 0.5) * 60, z = (r() - 0.5) * 60;
      if (!inside(x, z)) continue;
      e.set((r() - 0.5) * 0.3, r() * 6, (r() - 0.5) * 0.3); q.setFromEuler(e); var s = 0.6 + r() * 0.9; sc.set(s, s, s); ps.set(x, -0.03, z);
      m4.compose(ps, q, sc); im.setMatrixAt(k++, m4);
    }
    im.count = k; im.castShadow = false; im.receiveShadow = false;
    p.add(im);
    return im;
  }

  // ---------- Mobilier et constructions ----------
  function fenceRun(p, st, x0, z0, x1, z1, gate) {
    var len = Math.hypot(x1 - x0, z1 - z0), a = Math.atan2(x1 - x0, z1 - z0), g = grp(p, x0, -0.12, z0, a), n = Math.max(1, Math.round(len / 0.5));
    var wood = OM(0xf4f1ea, { snow: 0.5 }), dark = OM(0x6b5038, { snow: 0.4 }), stone = OM(0xd8cdb5, { snow: 0.7, r: 0.95 }), iron = OM(0x2d3136, { m: 0.4, r: 0.5 });
    function skip(u) { return gate && Math.abs(u - gate) < 0.65; }
    if (st === 'piquets') { // palissade blanche
      for (var i = 0; i <= n; i++) { var u = i * len / n; if (skip(u)) continue; box(g, 0.08, 0.8, 0.04, wood, 0, 0, u); cone(g, 0.06, 0.1, wood, 0, 0.8, u, 4); }
      [0.25, 0.6].forEach(function (y) { var segs = gate ? [[0, gate - 0.65], [gate + 0.65, len]] : [[0, len]]; segs.forEach(function (sgm) { if (sgm[1] > sgm[0]) box(g, 0.03, 0.06, sgm[1] - sgm[0], wood, -0.04, y, (sgm[0] + sgm[1]) / 2); }); });
    } else if (st === 'muret') { // muret de pierre et grille
      var segs2 = gate ? [[0, gate - 0.7], [gate + 0.7, len]] : [[0, len]];
      segs2.forEach(function (sgm) { if (sgm[1] <= sgm[0]) return; var L2 = sgm[1] - sgm[0], c = (sgm[0] + sgm[1]) / 2; box(g, 0.25, 0.5, L2, stone, 0, 0, c); box(g, 0.3, 0.06, L2, stone, 0, 0.5, c);
        for (var u2 = sgm[0] + 0.12; u2 < sgm[1]; u2 += 0.16) cyl(g, 0.012, 0.42, iron, 0, 0.56, u2, 4); box(g, 0.025, 0.03, L2, iron, 0, 0.96, c); });
      if (gate) { box(g, 0.32, 1.0, 0.32, stone, 0, 0, gate - 0.75); box(g, 0.32, 1.0, 0.32, stone, 0, 0, gate + 0.75); }
    } else if (st === 'bambou') {
      for (var b = 0; b <= n * 3; b++) { var u3 = b * len / (n * 3); if (skip(u3)) continue; cyl(g, 0.035, 1.0 + (b % 3) * 0.04, OM(0xb9a86a, { snow: 0.4 }), 0, 0, u3, 6); }
      [0.3, 0.75].forEach(function (y) { box(g, 0.05, 0.05, len, OM(0x6b5a3a), 0.05, y, len / 2); });
    } else if (st === 'mur') { // mur crépi coloré
      var segs3 = gate ? [[0, gate - 0.8], [gate + 0.8, len]] : [[0, len]];
      segs3.forEach(function (sgm) { if (sgm[1] <= sgm[0]) return; var L3 = sgm[1] - sgm[0]; box(g, 0.2, 1.1, L3, OM(0xf1e6d2, { snow: 0.3 }), 0, 0, (sgm[0] + sgm[1]) / 2); box(g, 0.26, 0.07, L3, OM(0xd8742a), 0, 1.1, (sgm[0] + sgm[1]) / 2); });
      if (gate) { var gt = OM(0x2d3136, { m: 0.4, r: 0.5 }); for (var gx = -0.7; gx <= 0.7; gx += 0.14) cyl(g, 0.015, 1.0, gt, 0, 0, gate + gx, 4); }
    } else if (st === 'bois') {
      for (var j = 0; j <= n; j++) { var u4 = j * len / n; if (skip(u4)) continue; box(g, 0.1, 0.95, 0.1, dark, 0, 0, u4); }
      [0.3, 0.7].forEach(function (y) { box(g, 0.05, 0.12, len, dark, -0.06, y, len / 2); });
    } else { // haie
      var segs4 = gate ? [[0, gate - 0.6], [gate + 0.6, len]] : [[0, len]];
      segs4.forEach(function (sgm) { if (sgm[1] <= sgm[0]) return; var L4 = sgm[1] - sgm[0], hm = OM(0x4a8a42, { flat: true, snow: 0.6 }); box(g, 0.55, 1.0, L4, hm, 0, 0, (sgm[0] + sgm[1]) / 2); box(g, 0.5, 0.08, L4 - 0.05, OM(0x579a4c, { flat: true, snow: 0.85 }), 0, 1.0, (sgm[0] + sgm[1]) / 2); });
    }
    return g;
  }
  function lampPost(p, x, z, kind) {
    var g = grp(p, x, -0.12, z), iron = OM(0x2a2e33, { m: 0.5, r: 0.45, snow: 0.2 }), bulb = OM(0xfff1c8, { e: 0xffd27a, ei: 1.8, lamp: true });
    if (kind === 'moderne') { box(g, 0.1, 3.2, 0.1, OM(0x9aa0a6, { m: 0.6, r: 0.35 }), 0, 0, 0); box(g, 0.5, 0.06, 0.16, OM(0x9aa0a6, { m: 0.6, r: 0.35 }), 0.2, 3.2, 0); box(g, 0.36, 0.02, 0.1, bulb, 0.26, 3.18, 0); }
    else if (kind === 'borne') { cyl(g, 0.07, 0.75, iron, 0, 0, 0, 10); cyl(g, 0.075, 0.08, bulb, 0, 0.62, 0, 10); }
    else if (kind === 'jardin') { cyl(g, 0.03, 0.6, iron, 0, 0, 0, 6); sph(g, 0.09, bulb, 0, 0.66, 0, 10).castShadow = false; }
    else { // réverbère classique
      cyl(g, 0.11, 0.5, iron, 0, 0, 0, 10, 0.08); cyl(g, 0.045, 3.2, iron, 0, 0.5, 0, 8);
      var hd = grp(g, 0, 3.7, 0); cyl(hd, 0.16, 0.06, iron, 0, 0, 0, 6, 0.04); cone(hd, 0.2, 0.18, iron, 0, 0.36, 0, 6);
      cyl(hd, 0.12, 0.32, bulb, 0, 0.04, 0, 6, 0.16);
    }
    OUT.lamps.push(new V3(x, kind === 'borne' ? 0.7 : kind === 'jardin' ? 0.6 : 3.6, z));
    return g;
  }
  function bench(p, x, z, ry) {
    var g = grp(p, x, -0.12, z, ry), wood = OM(0x9a6a42, { snow: 0.7 }), iron = OM(0x2a2e33, { m: 0.4, r: 0.5 });
    [-0.62, 0.62].forEach(function (u) { box(g, 0.06, 0.42, 0.42, iron, u, 0, 0); box(g, 0.06, 0.45, 0.06, iron, u, 0.42, 0.2); });
    for (var i = 0; i < 3; i++) box(g, 1.4, 0.04, 0.12, wood, 0, 0.42, -0.14 + i * 0.13);
    for (var j = 0; j < 2; j++) box(g, 1.4, 0.1, 0.03, wood, 0, 0.58 + j * 0.16, 0.22);
    return g;
  }
  function car(p, x, z, ry, col) {
    var g = grp(p, x, -0.12, z, ry), body = OM(col, { m: 0.45, r: 0.3, snow: 0.6 }), glass = OM(0x1f2b38, { m: 0.5, r: 0.12 }), tyre = OM(0x1c1d20, { r: 0.85 }), chrome = OM(0xcfd4d9, { m: 0.85, r: 0.2 }), dk = OM(0x15171a, { r: 0.7 });
    mesh(g, G('rbox', 0.2), body, 0, 0.55, 0, 1.82, 0.62, 4.1, false);
    mesh(g, G('rbox', 0.28), glass, 0, 1.0, -0.2, 1.56, 0.56, 2.15, false);
    mesh(g, G('rbox', 0.25), body, 0, 1.25, -0.25, 1.5, 0.1, 1.7, false);
    box(g, 1.84, 0.12, 4.12, dk, 0, 0.24, 0);
    [[-0.86, 1.3], [0.86, 1.3], [-0.86, -1.3], [0.86, -1.3]].forEach(function (w) {
      var t = mesh(g, G('cyl', 1, 1, 16), tyre, w[0], 0.34, w[1], 0.34, 0.24, 0.34, false); t.rotation.z = Math.PI / 2;
      var hub = mesh(g, G('cyl', 1, 1, 10), chrome, w[0] + Math.sign(w[0]) * 0.02, 0.34, w[1], 0.18, 0.22, 0.18, false); hub.rotation.z = Math.PI / 2;
    });
    [-0.55, 0.55].forEach(function (u) {
      mesh(g, G('rbox', 0.3), OM(0xfff6d8, { e: 0xfff1c8, ei: 0.7, lamp: true }), u, 0.66, 2.04, 0.42, 0.13, 0.06, false);
      mesh(g, G('rbox', 0.3), OM(0xc8202a, { e: 0xc8202a, ei: 0.6 }), u, 0.68, -2.04, 0.4, 0.11, 0.06, false);
    });
    box(g, 0.7, 0.14, 0.04, chrome, 0, 0.42, 2.06);
    return g;
  }
  // Façade dessinée (fenêtres, portes): la nuit, certaines fenêtres s'allument.
  function facadeTex(key, col, trim, floors, cols, style) {
    return canvasTex('fac-' + key, 256, 256, function (c, w, h) {
      var cc = new THREE.Color(col); c.fillStyle = '#' + cc.getHexString(); c.fillRect(0, 0, w, h);
      var r = rnd(key.length * 7 + floors), fw = w / cols, fh = h / floors;
      if (style === 'uk' || style === 'brick') { for (var by = 0; by < h; by += 8) for (var bx = (by / 8) % 2 * 8; bx < w; bx += 16) { c.fillStyle = 'rgba(0,0,0,' + (0.04 + r() * 0.08).toFixed(3) + ')'; c.fillRect(bx, by, 15, 7); } }
      for (var y = 0; y < floors; y++) for (var x = 0; x < cols; x++) {
        var px = x * fw + fw * 0.22, py = y * fh + fh * 0.2, ww = fw * 0.56, hh = fh * 0.58;
        c.fillStyle = '#' + new THREE.Color(trim).getHexString(); c.fillRect(px - 3, py - 3, ww + 6, hh + 6);
        c.fillStyle = '#3b4a5e'; c.fillRect(px, py, ww, hh);
        c.fillStyle = 'rgba(255,255,255,0.18)'; c.fillRect(px, py, ww * 0.45, hh);
        if (style === 'fr' && y < floors - 1) { c.fillStyle = '#2d3136'; c.fillRect(px - 4, py + hh - 2, ww + 8, 4); for (var k = 0; k < 6; k++) c.fillRect(px - 2 + k * (ww + 4) / 5, py + hh - 12, 2, 12); }
      }
    }, [1, 1]);
  }
  function windowsGlow(key, floors, cols, seed) { // carte d'émission: fenêtres allumées la nuit
    return canvasTex('glow-' + key, 256, 256, function (c, w, h) {
      c.fillStyle = '#000'; c.fillRect(0, 0, w, h); var r = rnd(seed), fw = w / cols, fh = h / floors;
      for (var y = 0; y < floors; y++) for (var x = 0; x < cols; x++) if (r() < 0.55) { c.fillStyle = r() < 0.7 ? '#ffd58a' : '#bfe0ff'; c.fillRect(x * fw + fw * 0.22, y * fh + fh * 0.2, fw * 0.56, fh * 0.58); }
    }, [1, 1]);
  }
  function building(p, x, z, w, d, floors, st, i, roofKind) {
    var col = st.walls[i % st.walls.length], hh = floors * 3, g = grp(p, x, -0.12, z), key = st.k + i + '-' + floors + '-' + Math.round(w);
    var cols = Math.max(2, Math.round(w / 1.6));
    var fm = new THREE.MeshLambertMaterial({ color: 0xffffff, map: facadeTex(key, col, st.trim, floors, cols, st.k === 'uk' && i % 4 < 3 ? 'brick' : st.k), emissive: 0xffffff, emissiveMap: windowsGlow(key, floors, cols, i + 3), emissiveIntensity: 0 });
    OUT.night.push({ m: fm, on: 0.9 });
    var side = OM(col, { r: 0.9 });
    var b = mesh(g, G('box'), [fm, fm, side, side, fm, fm], 0, hh / 2, 0, w, hh, d, false); b.userData.keep = true; OUT.allM.push(fm);
    if (roofKind === 'pente') { var rf = mesh(g, G('prism'), OM(st.roof2, { snow: 0.9, flat: true }), 0, hh, 0, w * 1.04, 1.6, d * 1.06, false); }
    else { box(g, w + 0.2, 0.25, d + 0.2, OM(st.roof, { snow: 0.85 }), 0, hh, 0); if (st.k === 'fr') { var mz = mesh(g, G('prism'), OM(0x6a737d, { snow: 0.9, flat: true }), 0, hh + 0.25, 0, w, 1.4, d * 0.8, false); } }
    return g;
  }
  function house(p, x, z, ry, st, i, s) {
    s = s || 1;
    var g = grp(p, x, -0.12, z, ry), col = st.walls[i % st.walls.length], wall = OM(col, { r: 0.9 }), roof = OM(st.roof2, { snow: 0.9, flat: true }), trim = OM(st.trim);
    box(g, 5 * s, 3 * s, 4.2 * s, wall, 0, 0, 0);
    mesh(g, G('prism'), roof, 0, 3 * s, 0, 5.4 * s, 1.8 * s, 4.6 * s, false);
    var win = OM(0x3b4a5e, { r: 0.2, e: 0xffd58a, ei: 0.8, lamp: true });
    [[-1.4, 1.7], [1.4, 1.7], [-1.4, 0.6], [1.4, 0.6]].forEach(function (q) { box(g, 0.9 * s, 0.8 * s, 0.05, trim, q[0] * s, q[1] * s - 0.05, 2.12 * s); box(g, 0.75 * s, 0.65 * s, 0.06, win, q[0] * s, q[1] * s, 2.13 * s); });
    box(g, 0.9 * s, 1.7 * s, 0.06, OM(st.door), 0, 0, 2.13 * s);
    box(g, 0.5 * s, 1.0 * s, 0.5 * s, wall, 1.6 * s, 3.6 * s, -0.6 * s); // cheminée
    return g;
  }
  function mailbox(p, x, z, ry, col, st) {
    var g = grp(p, x, -0.12, z, ry); g.name = 'boîte aux lettres';
    var post = OM(0x6b5038), body = OM(col, { m: 0.3, r: 0.45, snow: 0.6 });
    box(g, 0.08, 1.0, 0.08, post, 0, 0, 0);
    var bx = grp(g, 0, 1.0, 0);
    if (st === 'us') { box(bx, 0.24, 0.2, 0.46, body, 0, 0, 0); cyl(bx, 0.12, 0.46, body, 0, 0.2, 0, 14).rotation.x = Math.PI / 2; }
    else box(bx, 0.32, 0.38, 0.22, body, 0, 0, 0);
    box(bx, 0.2, 0.025, 0.01, OM(0x222222), 0, st === 'us' ? 0.2 : 0.28, st === 'us' ? 0.235 : 0.115);
    var flag = grp(bx, 0.15, 0.12, -0.05); box(flag, 0.02, 0.24, 0.02, OM(0xd8342c), 0, 0, 0); box(flag, 0.02, 0.1, 0.14, OM(0xd8342c), 0, 0.16, 0.06);
    flag.rotation.x = Math.PI / 2;
    var env = grp(bx, 0, st === 'us' ? 0.26 : 0.4, st === 'us' ? 0.25 : 0.12); box(env, 0.22, 0.15, 0.015, OM(0xfffaf0), 0, 0, 0); env.rotation.x = -0.25; env.visible = false;
    g.userData.flag = flag; g.userData.env = env; g.userData.keep = true;
    g.traverse(function (o) { if (o.isMesh) o.userData.pick = { type: 'out', id: 'mail' }; });
    return g;
  }
  // Chat du studio: il se promène dans le jardin, s'assoit au soleil et ronronne quand on le caresse.
  function catModel(p) {
    var g = grp(p, 0, -0.12, 0), fur = OM(0xe58a3a, { r: 0.9 }), white = OM(0xfaf3e6, { r: 0.9 }), dark = OM(0x2a2a2a);
    var body = grp(g, 0, 0.2, 0);
    mesh(body, G('cap', 0.09, 0.22), fur, 0, 0, 0, 1, 1, 1).rotation.x = Math.PI / 2;
    var head = grp(body, 0, 0.08, 0.2); sph(head, 0.085, fur, 0, 0, 0, 10);
    cone(head, 0.03, 0.06, fur, -0.045, 0.06, -0.01, 4); cone(head, 0.03, 0.06, fur, 0.045, 0.06, -0.01, 4);
    sph(head, 0.045, white, 0, -0.025, 0.06, 8).scale.set(0.05, 0.035, 0.035);
    sph(head, 0.012, dark, -0.03, 0.015, 0.075, 6); sph(head, 0.012, dark, 0.03, 0.015, 0.075, 6);
    var legs = [];
    [[-0.05, 0.14], [0.05, 0.14], [-0.05, -0.12], [0.05, -0.12]].forEach(function (l) { var lg = grp(body, l[0], -0.05, l[1]); cyl(lg, 0.022, 0.16, l[1] > 0 ? white : fur, 0, -0.16, 0, 6); legs.push(lg); });
    var tail = grp(body, 0, 0.03, -0.2); var tm = cyl(tail, 0.018, 0.26, fur, 0, 0, 0, 6); tm.rotation.x = -0.6; tail.rotation.x = -0.4;
    g.userData = { body: body, head: head, legs: legs, tail: tail, keep: true };
    g.traverse(function (o) { if (o.isMesh) { o.userData.pick = { type: 'out', id: 'cat' }; o.castShadow = true; } });
    g.name = 'chat';
    return g;
  }
  // Bonhomme de neige construit en trois clics (boule, buste, tête avec chapeau et écharpe).
  function snowmanModel(p, x, z) {
    var g = grp(p, x, -0.12, z), snow = OM(0xf7fbff, { r: 0.7 }), coal = OM(0x1e1e1e), carrot = OM(0xff7a1a);
    var pile = grp(g); ico(pile, 0.32, snow, 0, 0.05, 0, 1.3, 0.35, 1.1); ico(pile, 0.18, snow, 0.3, 0.04, 0.12, 1, 0.4, 1);
    var s1 = grp(g); sph(s1, 0.42, snow, 0, 0.38, 0, 14);
    var s2 = grp(g); sph(s2, 0.3, snow, 0, 0.98, 0, 14); [0.92, 1.04, 1.16].forEach(function (y) { sph(s2, 0.03, coal, 0, y, 0.285, 6); });
    var s3 = grp(g); sph(s3, 0.21, snow, 0, 1.42, 0, 12); sph(s3, 0.025, coal, -0.07, 1.47, 0.18, 6); sph(s3, 0.025, coal, 0.07, 1.47, 0.18, 6);
    var nose = cone(s3, 0.035, 0.18, carrot, 0, 1.4, 0.2, 8); nose.rotation.x = Math.PI / 2; nose.position.set(0, 1.4, 0.27);
    cyl(s3, 0.2, 0.03, coal, 0, 1.58, 0, 14); cyl(s3, 0.13, 0.22, coal, 0, 1.6, 0, 14);
    mesh(s3, G('ring', 0.2, 0.05, 16), OM(0xd8342c), 0, 1.27, 0, 1, 1, 1).rotation.x = Math.PI / 2;
    [-1, 1].forEach(function (sd) { var arm = cyl(s2, 0.015, 0.55, OM(0x5a3a22), sd * 0.4, 0.95, 0, 5); arm.rotation.z = -sd * 1.0; arm.position.set(sd * 0.42, 1.08, 0); });
    g.userData = { st: [pile, s1, s2, s3], keep: true };
    g.traverse(function (o) { if (o.isMesh) o.userData.pick = { type: 'out', id: 'snowman' }; });
    g.name = 'bonhomme de neige';
    return g;
  }
  // Potager: les cultures changent avec les saisons (pousses, légumes, citrouilles en automne, terre nue l'hiver).
  function potager(p, x, z, r) {
    var g = grp(p, x, -0.12, z), wood = OM(0x8a6040, { snow: 0.6 }), soil = OM(0x5a3e2a, { snow: 0.9 });
    var crops = OUT.cropM || (OUT.cropM = maskMat(0x5f9a3a, 2)), fruit = OUT.fruitM || (OUT.fruitM = maskMat(0xe8742a, 1, { r: 0.6 }));
    [[-0.65, 0], [0.65, 0]].forEach(function (b) {
      box(g, 1.1, 0.3, 2.0, wood, b[0], 0, b[1]); box(g, 1.0, 0.04, 1.9, soil, b[0], 0.28, b[1]);
      for (var i = 0; i < 8; i++) { var cx = b[0] + (i % 2 ? 0.22 : -0.22), cz = b[1] - 0.75 + Math.floor(i / 2) * 0.5; ico(g, 0.16, crops, cx, 0.42, cz, 1, 0.7, 1); if (i % 3 === 0) sph(g, 0.1, fruit, cx + 0.06, 0.36, cz + 0.08, 8); }
    });
    return g;
  }
  // Fontaine à vasques avec jets d'eau (gelée en plein hiver).
  function fountain(p, x, z, s) {
    var g = grp(p, x, -0.12, z), stone = OM(0xd9d2c3, { snow: 0.7, r: 0.8 }), water = OUT.waterM;
    var basin = cyl(g, 1.6 * s, 0.45, stone, 0, 0, 0, 28); var inner = cyl(g, 1.45 * s, 0.4, water, 0, 0.06, 0, 28);
    cyl(g, 0.25 * s, 1.1, stone, 0, 0.3, 0, 12); cyl(g, 0.7 * s, 0.15, stone, 0, 1.3, 0, 20, 0.5 * s); cyl(g, 0.6 * s, 0.05, water, 0, 1.4, 0, 20);
    cyl(g, 0.12 * s, 0.5, stone, 0, 1.4, 0, 10); sph(g, 0.16 * s, stone, 0, 1.95, 0, 10);
    OUT.spots.fountain = new V3(x, 1.9, z); OUT.fountains = (OUT.fountains || []).concat([{ x: x, z: z, y: 2.05, r: 1.3 * s }]);
    return g;
  }
  function pool(p, x, z, w, d) {
    var g = grp(p, x, -0.12, z), rim = OM(0xeeeae2, { snow: 0.7, r: 0.6 }), tile = OM(0x7fc6dc, { r: 0.4 });
    box(g, w + 0.5, 0.1, 0.25, rim, 0, 0, d / 2 + 0.125); box(g, w + 0.5, 0.1, 0.25, rim, 0, 0, -d / 2 - 0.125);
    box(g, 0.25, 0.1, d, rim, w / 2 + 0.125, 0, 0); box(g, 0.25, 0.1, d, rim, -w / 2 - 0.125, 0, 0);
    box(g, w, 0.05, d, tile, 0, -0.02, 0);
    var wtr = mesh(g, G('box'), OUT.poolM, 0, 0.05, 0, w, 0.02, d, false); wtr.userData.keep = true;
    [-1, 1].forEach(function (s2) { var l = grp(g, s2 * (w / 2 + 1.1), 0, 0); mesh(l, G('rbox', 0.15), OM(0xffffff), 0, 0.2, 0, 0.62, 0.22, 1.6, false); mesh(l, G('rbox', 0.2), OM(0x2bb3a3), 0, 0.34, 0.08, 0.56, 0.08, 1.4, false); var bk = mesh(l, G('rbox', 0.2), OM(0x2bb3a3), 0, 0.5, -0.66, 0.56, 0.08, 0.5, false); bk.rotation.x = -0.9; });
    return g;
  }
  function planter(p, x, z, w, d, col, inner) {
    var g = grp(p, x, -0.12, z); box(g, w, 0.55, d, OM(col || 0x9a9890, { r: 0.85, snow: 0.6 }), 0, 0, 0); box(g, w - 0.1, 0.05, d - 0.1, OM(0x5a3e2a, { snow: 0.9 }), 0, 0.5, 0);
    if (inner === 'buis') for (var i = 0; i < Math.max(1, Math.round(w / 0.7)); i++) ico(g, 0.3, OM(0x3f7a3c, { flat: true, snow: 0.55 }), -w / 2 + 0.35 + i * 0.7, 0.75, 0, 1, 0.85, 1);
    return g;
  }
  function lantern(p, x, z) { // lanterne de pierre japonaise
    var g = grp(p, x, -0.12, z), st = OM(0xa9a59b, { snow: 0.75, r: 0.95 });
    box(g, 0.5, 0.12, 0.5, st, 0, 0, 0); cyl(g, 0.09, 0.6, st, 0, 0.12, 0, 8); box(g, 0.42, 0.08, 0.42, st, 0, 0.72, 0);
    box(g, 0.32, 0.3, 0.32, OM(0xfff1c8, { e: 0xffc66a, ei: 1.2, lamp: true }), 0, 0.8, 0); cone(g, 0.42, 0.28, st, 0, 1.1, 0, 4).rotation.y = Math.PI / 4;
    return g;
  }
  function vending(p, x, z, ry) { var g = grp(p, x, -0.12, z, ry); box(g, 0.9, 1.8, 0.7, OM(0xd8342c, { r: 0.4 }), 0, 0, 0); box(g, 0.7, 1.0, 0.02, OM(0xeaf6ff, { e: 0xdff0ff, ei: 0.9, lamp: true }), 0, 0.65, 0.36); return g; }
  function busStop(p, x, z, st) { // abribus avec panneau publicitaire éclairé
    var g = grp(p, x, -0.12, z), met = OM(0x4a4f57, { m: 0.5, r: 0.4 }), glass = OM(0xcfe8f5, { op: 0.25, r: 0.1, m: 0.1 });
    [[-1.1, -0.45], [1.1, -0.45], [-1.1, 0.45], [1.1, 0.45]].forEach(function (q) { box(g, 0.06, 2.3, 0.06, met, q[0], 0, q[1], 0); });
    box(g, 2.4, 0.08, 1.1, OM(0x3a3f47, { snow: 0.9 }), 0, 2.3, 0);
    box(g, 2.2, 1.7, 0.02, glass, 0, 0.45, -0.45);
    box(g, 0.04, 1.6, 0.85, OM(0xffffff, { e: 0xfff1d8, ei: 1.0, lamp: true }), -1.12, 0.5, 0);
    box(g, 1.6, 0.06, 0.3, OM(0x9a6a42, { snow: 0.6 }), 0.2, 0.45, -0.25);
    cyl(g, 0.03, 2.6, met, 1.5, 0, 0.5, 8); box(g, 0.45, 0.45, 0.04, OM(0x2f6fd3, { r: 0.5 }), 1.5, 2.3, 0.5);
    return g;
  }
  function hydrant(p, x, z) { var g = grp(p, x, -0.12, z), m = OM(0xd8342c, { r: 0.5, snow: 0.4 }); cyl(g, 0.1, 0.5, m, 0, 0, 0, 10); sph(g, 0.1, m, 0, 0.5, 0, 10); cyl(g, 0.05, 0.3, m, 0, 0.3, 0, 8).rotation.z = Math.PI / 2; return g; }
  function pillarBox(p, x, z) { var g = grp(p, x, -0.12, z), m = OM(0xc8202a, { r: 0.45, snow: 0.4 }); cyl(g, 0.24, 1.2, m, 0, 0, 0, 16); sph(g, 0.25, m, 0, 1.2, 0, 14).scale.set(0.25, 0.12, 0.25); box(g, 0.25, 0.04, 0.02, OM(0x111111), 0, 0.95, 0.24); return g; }
  function bikeRack(p, x, z, ry) { var g = grp(p, x, -0.12, z, ry), m = OM(0x9aa0a6, { m: 0.6, r: 0.3 }); for (var i = 0; i < 4; i++) { var a = mesh(g, G('tor', 0.3, 0.025, 10), m, i * 0.45, 0.3, 0, 1, 1, 1, false); a.rotation.y = Math.PI / 2; } return g; }
  function statue(p, x, z) { var g = grp(p, x, -0.12, z), st = OM(0xe6e1d6, { snow: 0.7, r: 0.7 }); box(g, 0.8, 1.0, 0.8, st, 0, 0, 0); var tr = mesh(g, G('ring', 0.32, 0.06, 20), OM(0xd9a520, { m: 0.8, r: 0.3 }), 0, 1.5, 0, 1, 1, 1, false); cyl(g, 0.05, 0.5, st, 0, 1.0, 0, 8); sph(g, 0.14, OM(0xd9a520, { m: 0.8, r: 0.3 }), 0, 1.5, 0, 12).scale.set(0.14, 0.14, 0.05); return g; }
  function flagPole(p, x, z, cols) { var g = grp(p, x, -0.12, z); cyl(g, 0.04, 4.5, OM(0xdfe3e8, { m: 0.6, r: 0.3 }), 0, 0, 0, 8); var f = grp(g, 0, 4.1, 0); cols.forEach(function (c, i) { box(f, 0.02, 0.6, 0.9 / cols.length, OM(c), 0, -0.3, 0.05 + (i + 0.5) * 0.9 / cols.length); }); f.userData.flag = true; return g; }

  // ---------- Décors de fête ----------
  // Guirlande d'ampoules ou de fanions tendue entre deux points.
  function strand(p, a, b, n, sag, make) {
    for (var i = 0; i <= n; i++) {
      var t = i / n, x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t, y = a.y + (b.y - a.y) * t - Math.sin(t * Math.PI) * sag;
      make(p, x, y, z, i, Math.atan2(b.x - a.x, b.z - a.z));
    }
  }
  function festDecor(id, cfg, def) {
    var g = grp(null); g.name = 'fête:' + id; g.visible = false;
    var W = def.W, Dd = def.D, cols, top = def.H + 0.12;
    // guirlandes accrochées en haut des murs (elles ne cachent jamais l'intérieur)
    var A = new V3(-W / 2 - 0.08, top, Dd / 2), B = new V3(-W / 2 - 0.08, top, -Dd / 2 - 0.08), C = new V3(W / 2, top, -Dd / 2 - 0.08);
    function posts() {}
    if (cfg.fx === 'lights' || cfg.fx === 'lanterns') {
      posts();
      cols = cfg.fx === 'lanterns' ? [0xff4d4d, 0xfff1d8] : [0xff4d4d, 0xffd166, 0x5be07a, 0x66ccff, 0xff8ad8];
      [[A, B], [B, C]].forEach(function (ab) {
        strand(g, ab[0], ab[1], Math.round(ab[0].distanceTo(ab[1]) * (cfg.fx === 'lanterns' ? 1.1 : 3)), 0.12, function (pp, x, y, z, i) {
          var c = cols[i % cols.length], m = OM(c, { e: c, ei: 1.6, lamp: true });
          if (cfg.fx === 'lanterns') { var l = sph(pp, 0.14, m, x, y - 0.25, z, 10); l.scale.set(0.13, 0.17, 0.13); }
          else sph(pp, 0.045, m, x, y - 0.05, z, 6).castShadow = false;
        });
      });
      if (cfg.fx === 'lights') { // sapin décoré au coin du jardin
        var tg = grp(g, -W / 2 - 1.4, -0.12, Dd / 2 + 1.6), green = OM(0x2c6a45, { flat: true });
        for (var k = 0; k < 4; k++) cone(tg, 0.9 - k * 0.2, 0.9, green, 0, 0.3 + k * 0.5, 0, 8);
        cyl(tg, 0.08, 0.35, OM(0x5a4434), 0, 0, 0, 6);
        cone(tg, 0.12, 0.25, OM(0xffd166, { e: 0xffd166, ei: 2, lamp: true }), 0, 2.45, 0, 5);
        for (var bl = 0; bl < 18; bl++) { var an = bl * 2.4, hy = 0.45 + (bl % 6) * 0.32, rr = 0.82 - (bl % 6) * 0.13; var bc = [0xe2364a, 0xffd166, 0x66ccff, 0xffffff][bl % 4]; sph(tg, 0.06, OM(bc, { e: bc, ei: 1.2, lamp: true }), Math.cos(an) * rr, hy, Math.sin(an) * rr, 6); }
        [[0.5, 0.6, 0xe2364a], [-0.45, 0.5, 0x2f6fd3], [0.1, 0.75, 0xffd166]].forEach(function (pq) { box(tg, 0.32, 0.25, 0.32, OM(pq[2]), pq[0], 0, pq[1]); box(tg, 0.34, 0.05, 0.08, OM(0xffffff), pq[0], 0.25, pq[1]); });
      }
    } else if (cfg.fx === 'bunting' || cfg.fx === 'carnival' || cfg.fx === 'flags') {
      posts();
      cols = cfg.cols || [0xe2364a, 0xffd166, 0x2bb3a3, 0x7a5cd6, 0xff8a3d, 0x3d7be0];
      [[A, B], [B, C]].forEach(function (ab) {
        strand(g, ab[0], ab[1], Math.round(ab[0].distanceTo(ab[1]) * 2.5), 0.14, function (pp, x, y, z, i, ry) {
          var tri = mesh(pp, G('cone', 3), OM(cols[i % cols.length], { r: 0.8 }), x, y - 0.14, z, 0.12, 0.26, 0.012, false); tri.rotation.set(Math.PI, ry + Math.PI / 2, 0);
        });
      });
      if (id === 'fdlm') { // petite scène pour la Fête de la musique
        var sg = grp(g, W / 2 + 2.6, -0.12, Dd / 2 + 2.4, -0.6);
        box(sg, 2.4, 0.35, 1.6, OM(0x2a2e33), 0, 0, 0); box(sg, 2.4, 1.6, 0.06, OM(0x7a5cd6), 0, 0.35, -0.77);
        [-0.9, 0.9].forEach(function (u) { box(sg, 0.4, 0.6, 0.35, OM(0x1c1d20), u, 0.35, -0.4); });
        cyl(sg, 0.012, 1.2, OM(0x9aa0a6, { m: 0.7 }), 0, 0.35, 0.2, 6); sph(sg, 0.05, OM(0x222222), 0, 1.58, 0.2, 8);
        OUT.spots.stage = new V3(W / 2 + 2.6, 1.6, Dd / 2 + 2.4);
      }
    } else if (cfg.fx === 'pumpkins') {
      [[W / 2 + 1.0, Dd / 2 + 0.9], [W / 2 + 1.5, Dd / 2 + 1.3], [-W / 2 - 0.6, Dd / 2 + 0.9], [0.6, Dd / 2 + 1.2], [W / 2 + 0.9, -Dd / 2 + 0.6]].forEach(function (q, i) {
        var pg = grp(g, q[0], -0.12, q[1], i), s = 0.8 + (i % 3) * 0.2, orange = OM(0xf08a24, { r: 0.6 });
        for (var k = 0; k < 6; k++) { var lobe = sph(pg, 0.2 * s, orange, Math.cos(k / 6 * 6.28) * 0.08 * s, 0.17 * s, Math.sin(k / 6 * 6.28) * 0.08 * s, 10); lobe.scale.set(0.12 * s, 0.17 * s, 0.2 * s); lobe.rotation.y = k / 6 * 6.28; }
        cyl(pg, 0.025, 0.12, OM(0x4f6a2a), 0, 0.32 * s, 0, 6);
        var face = OM(0xffc04a, { e: 0xffa020, ei: 1.6, lamp: true });
        box(pg, 0.05 * s, 0.05 * s, 0.02, face, -0.07 * s, 0.22 * s, 0.205 * s); box(pg, 0.05 * s, 0.05 * s, 0.02, face, 0.07 * s, 0.22 * s, 0.205 * s); box(pg, 0.16 * s, 0.04 * s, 0.02, face, 0, 0.12 * s, 0.2 * s);
      });
    }
    return g;
  }

  // ---------- Implantation selon le lieu ----------
  // Un objet de hauteur h posé en (x, z) cache-t-il la pièce depuis les angles de caméra habituels ?
  function hides(def, x, z, h) {
    var W = def.W / 2 + 0.15, Dd = def.D / 2 + 0.15, H = def.H, yaws = [cam.yawBase - 0.6, cam.yawBase - 0.25, cam.yawBase, cam.yawBase + 0.3, cam.yawBase + 0.55], pitches = [0.42, 0.62];
    for (var a = 0; a < yaws.length; a++) for (var b = 0; b < pitches.length; b++) {
      var cp = Math.cos(pitches[b]), dx = -Math.sin(yaws[a]) * cp, dy = -Math.sin(pitches[b]), dz = -Math.cos(yaws[a]) * cp;
      for (var k = 0; k < 2; k++) {
        var oy = k ? h : h * 0.5, t0 = 0, t1 = 1e9;
        [[x, dx, -W, W], [oy, dy, 0, H], [z, dz, -Dd, Dd]].forEach(function (s) {
          if (Math.abs(s[1]) < 1e-9) { if (s[0] < s[2] || s[0] > s[3]) t1 = -1; return; }
          var u = (s[2] - s[0]) / s[1], v = (s[3] - s[0]) / s[1]; if (u > v) { var w = u; u = v; v = w; }
          t0 = Math.max(t0, u); t1 = Math.min(t1, v);
        });
        if (t1 >= t0 && t1 > 0) return true;
      }
    }
    return false;
  }
  function freeAt(list, x, z, rad) { for (var i = 0; i < list.length; i++) { var q = list[i]; if (Math.hypot(q[0] - x, q[1] - z) < rad + q[2]) return false; } return true; }
  // Arbres et buissons répartis autour du lieu, sans masquer la pièce ni empiéter sur les zones réservées.
  function scatter(g, def, cfg, r, o) {
    var W = def.W / 2, Dd = def.D / 2, used = o.used, n = 0, R = o.R, tries = o.n * 30;
    for (var i = 0; i < tries && n < o.n; i++) {
      var a = r() * 6.28, d = o.r0 + r() * (R - o.r0), x = Math.cos(a) * d * (1 + W / Math.max(W, Dd) * 0.25), z = Math.sin(a) * d;
      if (Math.abs(x) < W + o.m && Math.abs(z) < Dd + o.m) continue;
      if (o.zone && !o.zone(x, z)) continue;
      var s = o.s0 + r() * (o.s1 - o.s0), h = o.h * s;
      if (hides(def, x, z, h)) continue;
      if (!freeAt(used, x, z, o.rad * s)) continue;
      used.push([x, z, o.rad * s]);
      o.make(x, z, s);
      n++;
    }
  }
  function outLayout(key, tier) { return key === 'chambre' || key === 'garage' ? 'jardin' : key === 'local' ? 'rue' : key === 'pro' ? 'cour' : 'domaine'; }
  function buildOutdoor(def, key, tier, country) {
    var oldG = OUT.g, oldM = OUT.allM;
    OUT.allM = [];
    OUT.fountains = []; OUT.mc = {}; OUT.tint = []; OUT.night = []; OUT.leafM = {}; OUT.bloomM = {}; OUT.flowerM = []; OUT.trees = []; OUT.lamps = []; OUT.spots = {}; OUT.inter = {}; OUT.fests = {}; OUT.capM = null; OUT.cropM = null; OUT.fruitM = null;
    var cfgC = (root.GameData && GameData.CAL && GameData.CAL.climate[country]) || { trees: ['chene', 'tilleul', 'platane'], conifer: 'sapin', flowers: [0xe85a7a, 0xf2c14e, 0x9b7fd6], style: 'fr' };
    var st = STYLE[cfgC.style] || STYLE.fr; st.k = cfgC.style || 'fr';
    var lay = outLayout(key, tier), W = def.W / 2, Dd = def.D / 2, r = rnd(17 + tier * 31 + country.charCodeAt(0)), q = QUAL.lvl;
    var g = grp(null); g.name = 'extérieur';
    OUT.shadowM = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.16, depthWrite: false });
    OUT.waterM = OM(0x4f8fb8, { r: 0.12, m: 0.1 }); OUT.poolM = new THREE.MeshStandardMaterial({ color: 0x3fb7d6, roughness: 0.08, metalness: 0.1, map: canvasTex('poolw', 128, 128, function (c, w, h) { c.fillStyle = '#9fe3f2'; c.fillRect(0, 0, w, h); c.strokeStyle = 'rgba(255,255,255,0.55)'; c.lineWidth = 2; for (var i = 0; i < 14; i++) { c.beginPath(); var y = i * 9 + 4; c.moveTo(0, y); for (var x = 0; x <= w; x += 8) c.lineTo(x, y + Math.sin(x / 10 + i) * 3); c.stroke(); } }, [3, 3]) });
    // sol: pelouse (teinte de saison) et voile de neige
    var gt = canvasTex('grass', 256, 256, grassDraw, [40, 40]);
    OUT.groundM = new THREE.MeshLambertMaterial({ color: 0x7cb350, map: gt }); OUT.groundM.userData.recv = true; OUT.allM.push(OUT.groundM);
    var ground = mesh(g, new THREE.CircleGeometry(95, 48), OUT.groundM, 0, -0.14, 0, 1, 1, 1, false); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = false; ground.userData.keep = true;
    OUT.snowM = new THREE.MeshLambertMaterial({ color: 0xf4f8ff, alphaMap: noiseTex('snowg', 128, 420, 11, 110), alphaTest: 0.5 }); OUT.allM.push(OUT.snowM);
    var sn = mesh(g, new THREE.CircleGeometry(95, 48), OUT.snowM, 0, -0.085, 0, 1, 1, 1, false); sn.rotation.x = -Math.PI / 2; sn.userData.keep = true; sn.receiveShadow = false; OUT.snowMesh = sn;
    OUT.tuftM = new THREE.MeshLambertMaterial({ color: 0x6aa548, flatShading: true }); OUT.allM.push(OUT.tuftM);
    var used = [];
    function reserve(x, z, rad) { used.push([x, z, rad]); }
    var trees = cfgC.trees, conif = cfgC.conifer, flowers = cfgC.flowers, bushCol = cfgC.style === 'br' || cfgC.style === 'ng' ? 0x3f8a3a : 0x3f7a3c;
    var tropical = cfgC.zone === 'tropical';
    // zone de terrasse au pied du studio
    var deck = lay === 'jardin' ? texMat('deck', 256, 256, function (c, w, h) { planks(c, w, h, '#a8998a', '#8e7f70'); }, { rep: [3, 3] }) : null;
    if (lay === 'jardin') {
      var deckM = OM(0xffffff, { map: deck.map, snow: 0.0 });
      flat(g, def.W + 1.2, 1.3, deckM, 0.6, Dd + 0.65, -0.12); flat(g, 1.3, def.D, deckM, W + 0.65, -0.0, -0.12);
      // allée en pas japonais vers le portail
      var gateZ = Dd + 6.2, pathX = Math.min(W - 0.8, 1.2);
      for (var s = Dd + 1.6; s < gateZ - 0.2; s += 0.62) { var stn = mesh(g, G('cyl', 1, 1, 9), OM(0xc9c2b2, { snow: 0.0, r: 0.95 }), pathX + Math.sin(s * 1.3) * 0.12, -0.11, s, 0.3, 0.04, 0.24, false); }
      reserve(pathX, Dd + 3.5, 0.6); reserve(pathX, Dd + 5.2, 0.6);
      // clôture du terrain, portail devant
      var fx0 = -W - 6.5, fx1 = W + 6.5, fz0 = -Dd - 5.5, fz1 = gateZ;
      fenceRun(g, st.fence, fx1, fz1, fx0, fz1, fx1 - pathX);
      fenceRun(g, st.fence, fx1, fz0, fx1, fz1);
      fenceRun(g, st.fence === 'piquets' ? 'piquets' : 'haie', fx0, fz1, fx0, fz0);
      fenceRun(g, st.fence === 'piquets' ? 'piquets' : 'haie', fx0, fz0, fx1, fz0);
      var mb = mailbox(g, pathX + 0.85, Dd + 2.2, 0.35, st.mail, st.k); OUT.inter.mail = mb; reserve(pathX + 0.85, Dd + 2.2, 0.5);
      // arbre à secouer, au coin avant gauche
      var bigSp = tropical ? trees[1] : trees[0], ti = tree(g, bigSp, -W - 1.5, Dd + 1.1, 1.3, r); ti.userData.keep = true; ti.traverse(function (o) { if (o.isMesh) o.userData.pick = { type: 'out', id: 'tree' }; }); OUT.inter.tree = ti; reserve(-W - 1.5, Dd + 1.1, 1.8);
      // massifs fleuris le long de la terrasse
      flowerBed(g, -W * 0.45, Dd + 1.75, Math.min(3.2, W * 0.9), 0.55, flowers, r);
      flowerBed(g, W + 1.75, -Dd * 0.35, 0.55, Math.min(3, Dd * 1.1), flowers, r);
      reserve(-W * 0.45, Dd + 1.75, 1.6); reserve(W + 1.75, -Dd * 0.35, 1.5);
      // banc et potager côté droit
      bench(g, W + 2.6, Dd - 1.2, -Math.PI / 2); reserve(W + 2.6, Dd - 1.2, 1);
      potager(g, W + 3.4, -Dd - 0.8, r); reserve(W + 3.4, -Dd - 0.8, 1.6);
      lampPost(g, pathX - 0.7, gateZ - 0.4, 'jardin'); lampPost(g, W + 1.3, Dd + 1.4, 'jardin');
      if (st.k === 'jp') { lantern(g, -W - 1.0, Dd + 3.6); reserve(-W - 1.0, Dd + 3.6, 0.5); }
      if (key === 'garage') { // allée goudronnée et voiture devant la porte de garage (côté gauche)
        var asp = texMat('asph3', 256, 256, asphaltDraw, { rep: [3, 3] }); flat(g, 7, 3.2, OM(0xffffff, { map: asp.map }), -W - 3.5, 1.55, -0.12);
        car(g, -W - 3.6, 1.55, Math.PI / 2, [0x3d7be0, 0xe2574c, 0xf2f2f2, 0x2f3a4a][tier % 4]); reserve(-W - 3.6, 1.55, 2.6);
        if (st.k === 'us') { var hoop = grp(g, -W - 6.2, -0.12, 3.6); cyl(hoop, 0.05, 3.0, OM(0x6b6f75), 0, 0, 0, 8); box(hoop, 1.0, 0.7, 0.04, OM(0xffffff), 0, 3.0, 0.25); mesh(hoop, G('ring', 0.22, 0.015, 16), OM(0xff6a1a), 0, 3.05, 0.5, 1, 1, 1).rotation.x = Math.PI / 2; }
      }
      // voisinage: maisons derrière les haies
      [[-W - 13, -Dd - 3, Math.PI / 2], [-W - 4, -Dd - 13, 0], [W + 7, -Dd - 14, 0], [-W - 14, Dd + 6, Math.PI / 2]].forEach(function (hq, i) { house(g, hq[0], hq[1], hq[2], st, i + tier, 1); reserve(hq[0], hq[1], 4); });
      // arbres et buissons
      scatter(g, def, cfgC, r, { n: q ? 14 : 7, r0: 2.5, R: Math.max(W, Dd) + 11, m: 1.0, s0: 0.95, s1: 1.45, h: 4.2, rad: 1.3, used: used,
        zone: function (x, z) { return x > fx0 + 0.8 && x < fx1 - 0.8 && z > fz0 + 0.8 && z < fz1 - 0.8 || x < fx0 - 1.5 || z < fz0 - 1.5; },
        make: function (x, z, s2) { var sp = r() < 0.25 && conif ? conif : trees[Math.floor(r() * trees.length)]; tree(g, sp, x, z, s2, r); } });
      scatter(g, def, cfgC, r, { n: q ? 12 : 6, r0: 1.6, R: Math.max(W, Dd) + 6.5, m: 0.6, s0: 0.7, s1: 1.2, h: 0.75, rad: 0.6, used: used,
        zone: function (x, z) { return x > fx0 + 0.5 && x < fx1 - 0.5 && z > fz0 + 0.5 && z < fz1 - 0.5; },
        make: function (x, z, s2) { bush(g, x, z, s2, bushCol + Math.floor(r() * 3) * 0x050805, r); } });
      OUT.catZone = { x0: W + 0.4, x1: W + 2.8, z0: -Dd + 0.6, z1: Dd + 1.6 };
      OUT.snowSpot = [W + 3.0, Dd + 3.1];
      OUT.tuftZone = function (x, z) { return (Math.abs(x) > W + 1.4 || Math.abs(z) > Dd + 1.5) && x > fx0 && x < fx1 && z > fz0 && z < fz1 && freeAt(used, x, z, 0.1); };
    } else if (lay === 'rue') {
      // coin de rue: trottoirs devant et à droite, chaussée, passages piétons, réverbères, immeubles mitoyens derrière
      var pav = texMat('pav-' + st.k, 256, 256, pavingDraw('#cfc8bb', 'rgba(0,0,0,0.18)', 6, 6), { rep: [10, 10] }).map, asp2 = texMat('asph10', 256, 256, asphaltDraw, { rep: [10, 10] }).map;
      var pavM = OM(0xffffff, { map: pav }), aspM = OM(0xffffff, { map: asp2, r: 0.8 }), curb = OM(0xb9b5ad, { snow: 0.5 });
      var sw = 2.6, rd = 7;
      flat(g, def.W + sw + 30, sw, pavM, -10, Dd + sw / 2, -0.1); flat(g, sw, def.D + sw + 30, pavM, W + sw / 2, -10, -0.1);
      flat(g, def.W + 60, rd, aspM, -10, Dd + sw + rd / 2, -0.13); flat(g, rd, def.D + 60, aspM, W + sw + rd / 2, -10, -0.13);
      flat(g, def.W + 60, sw, pavM, -10, Dd + sw + rd + sw / 2, -0.1); flat(g, sw, def.D + 60, pavM, W + sw + rd + sw / 2, -10, -0.1);
      box(g, def.W + 60, 0.14, 0.12, curb, -10, -0.14, Dd + sw); box(g, 0.12, 0.14, def.D + 60, curb, W + sw, -0.14, -10);
      // marquages
      var white = OM(0xf2f2ee, { r: 0.7 });
      for (var mx = -W - 26; mx < W + sw - 1; mx += 3) flat(g, 1.5, 0.12, white, mx, Dd + sw + rd / 2, -0.1);
      for (var mz = -Dd - 26; mz < Dd + sw - 1; mz += 3) flat(g, 0.12, 1.5, white, W + sw + rd / 2, mz, -0.1);
      for (var k2 = 0; k2 < 7; k2++) { flat(g, 0.32, rd - 1.2, white, W - 1.0 - k2 * 0.62, Dd + sw + rd / 2, -0.1); flat(g, rd - 1.2, 0.32, white, W + sw + rd / 2, Dd - 1.0 - k2 * 0.62, -0.1); }
      // immeubles mitoyens derrière et à gauche (visibles au-dessus des murs)
      [[-W - 7.2, -Dd + 2, 11, 9, 4, Math.PI / 2], [0, -Dd - 5.75, def.W + 2, 11, 5, 0], [W + 5.5, -Dd - 5.2, 9, 10, 3, 0], [-W - 5.2, -Dd - 6.5, 10, 12, 6, 0], [-W - 5.5, Dd + 4.6, 9, 9, 3, Math.PI / 2]].forEach(function (bq, i) {
        var bg = building(g, bq[0], bq[1], bq[2], bq[3], bq[4], st, i + 1, i % 2 ? 'pente' : 'plat'); bg.rotation.y = bq[5] || 0;
      });
      // trottoir: arbres en grille, réverbères, banc, vélos, mobilier du pays
      [[-W + 1.2, Dd + sw - 0.7], [-W * 0.1, Dd + sw - 0.7], [W + sw - 0.7, -Dd * 0.2], [W + sw - 0.7, -Dd - 3]].forEach(function (tq, i) {
        flat(g, 1.1, 1.1, OM(0x5a4a3a), tq[0], tq[1], -0.095); var tg3 = tree(g, trees[i % trees.length], tq[0], tq[1], 0.95, r);
        if (i === 1) { tg3.userData.keep = true; tg3.traverse(function (o) { if (o.isMesh) o.userData.pick = { type: 'out', id: 'tree' }; }); OUT.inter.tree = tg3; }
      });
      lampPost(g, W * 0.45, Dd + sw - 0.35, 'classique'); lampPost(g, -W - 3, Dd + sw - 0.35, 'classique'); lampPost(g, W + sw - 0.35, Dd * 0.55, 'classique'); lampPost(g, W + sw - 0.35, -Dd - 6, 'classique');
      bench(g, W + 1.4, Dd * 0.15, -Math.PI / 2); bikeRack(g, -W + 3.0, Dd + 1.0, 0);
      busStop(g, W + sw - 0.55, -Dd - 2.6, st);
      [[W + 0.5, Dd * 0.6], [-W + 4.6, Dd + 0.45]].forEach(function (bq) { var bin = grp(g, bq[0], -0.12, bq[1]); cyl(bin, 0.22, 0.85, OM(0x3d6b4a, { snow: 0.4 }), 0, 0, 0, 14, 0.2); cyl(bin, 0.24, 0.06, OM(0x2c4c36), 0, 0.85, 0, 14); });
      if (st.k === 'uk') pillarBox(g, W * 0.2, Dd + sw - 0.45); else if (st.k === 'us') hydrant(g, W + 1.0, Dd + 1.1); else if (st.k === 'jp') vending(g, W + 0.75, -Dd + 1.2, -Math.PI / 2);
      var mb2 = mailbox(g, W + 0.6, Dd + 0.6, Math.PI / 4, st.mail, st.k); OUT.inter.mail = mb2;
      // voitures garées
      car(g, W + sw + 1.3, -Dd + 1.0, 0, 0xe2574c); car(g, -W + 2.0, Dd + sw + 1.3, Math.PI / 2, 0x3d7be0); car(g, W + sw + 1.3, -Dd - 6, 0, 0xf2f2f2);
      // jardinières fleuries devant la vitrine
      flowerBed(g, -W * 0.5, Dd + 0.45, Math.min(2.6, W * 0.8), 0.4, flowers, r, 16); flowerBed(g, W + 0.45, -Dd * 0.6, 0.4, 2.2, flowers, r, 14);
      // de l'autre côté de la rue: square avec haies basses
      var px0 = W + sw * 2 + rd, pz0 = Dd + sw * 2 + rd;
      hedge(g, -W, pz0 + 0.6, def.W + 8, 0.6, 0.7); hedge(g, px0 + 0.6, -Dd, 0.6, def.D + 8, 0.7);
      tree(g, trees[0], W + sw + rd + sw + 2.6, Dd + sw + rd + sw + 2.6, 1.4, r);
      OUT.catZone = { x0: W + 0.5, x1: W + sw - 0.4, z0: -Dd + 1, z1: Dd + 1.6 };
      OUT.snowSpot = [W + 1.4, Dd + 1.6];
      OUT.tuftZone = function (x, z) { return x > px0 + 1.2 || z > pz0 + 1.2; };
    } else if (lay === 'cour') {
      // parvis pavé, jardinières, bornes lumineuses, parking, tours de bureaux derrière
      var pav2 = texMat('pav2', 256, 256, pavingDraw('#d9d4ca', 'rgba(0,0,0,0.14)', 4, 4), { rep: [12, 12] }).map;
      var plM = OM(0xffffff, { map: pav2, r: 0.8 });
      flat(g, def.W + 10, 6.5, plM, 1.5, Dd + 3.25, -0.1); flat(g, 7, def.D + 4, plM, W + 3.5, -2, -0.1);
      var asp3 = texMat('asph6', 256, 256, asphaltDraw, { rep: [6, 6] }).map;
      flat(g, 9, 12, OM(0xffffff, { map: asp3 }), W + 11.5, -Dd + 3, -0.12);
      for (var pk = 0; pk < 5; pk++) flat(g, 3.2, 0.1, OM(0xf2f2ee), W + 9.6, -Dd - 1.5 + pk * 2.6, -0.1);
      car(g, W + 9.5, -Dd - 0.2, -Math.PI / 2, 0x26282c); car(g, W + 9.5, -Dd + 5.0, -Math.PI / 2, 0xf2f2f2); if (tier >= 5) car(g, W + 9.5, -Dd + 2.4, -Math.PI / 2, 0xe0b440);
      [[-W + 1, Dd + 1.5], [W * 0.2, Dd + 1.5], [W + 1.5, -Dd * 0.3]].forEach(function (pq, i) { planter(g, pq[0], pq[1], i < 2 ? 2.4 : 0.9, i < 2 ? 0.9 : 2.4, 0x8f8d86, 'buis'); });
      [[-W - 1.6, Dd + 2.6], [W + 2.8, Dd + 3.2], [W + 2.8, -Dd + 0.4]].forEach(function (tq, i) { planter(g, tq[0], tq[1], 1.4, 1.4, 0x8f8d86); tree(g, tropical ? 'palmier' : trees[(i + 1) % trees.length], tq[0], tq[1], 1.1, r); });
      for (var bo = 0; bo < 6; bo++) lampPost(g, -W + 0.8 + bo * (def.W + 2) / 5, Dd + 5.6, 'borne');
      lampPost(g, W + 5.5, -Dd - 2, 'moderne'); lampPost(g, W + 5.5, -Dd + 6, 'moderne');
      bikeRack(g, W + 1.6, Dd + 1.4, Math.PI / 2);
      [[0x2f5bd3, 0xffffff], [0xe2364a, 0xffd166], [0x2bb3a3, 0xffffff]].forEach(function (fc, i) { flagPole(g, -W - 1.2 + i * 0.9, Dd + 5.0, fc); });
      // tours vitrées
      var glass = { walls: [0x6f8fa8, 0x8aa6b9, 0x5d7a92], roof: 0x3a4250, roof2: 0x3a4250, trim: 0xd8e2ea, k: 'glass' };
      [[-W - 6, -Dd - 2, 9, 9, 7], [0, -Dd - 7, 12, 9, 9], [W + 8, -Dd - 9, 10, 10, 6], [-W - 8, Dd + 6, 8, 8, 5]].forEach(function (bq, i) { building(g, bq[0], bq[1], bq[2], bq[3], bq[4], glass, i, 'plat'); });
      if (tier >= 5) { fountain(g, -W - 3.6, Dd + 3.4, 0.8); }
      var ti3 = tree(g, trees[0], -W - 3.2, -Dd + 1.2, 1.5, r); ti3.userData.keep = true; ti3.traverse(function (o) { if (o.isMesh) o.userData.pick = { type: 'out', id: 'tree' }; }); OUT.inter.tree = ti3;
      var mb3 = mailbox(g, W + 0.7, Dd + 3.0, 0.4, st.mail, st.k); OUT.inter.mail = mb3;
      // pelouse au-delà du parvis
      scatter(g, def, cfgC, r, { n: q ? 10 : 5, r0: 9, R: Math.max(W, Dd) + 16, m: 7, s0: 1, s1: 1.4, h: 4.2, rad: 1.4, used: used,
        zone: function (x, z) { return !(x > W && x < W + 17 && z < Dd + 4 && z > -Dd - 6); }, make: function (x, z, s2) { tree(g, trees[Math.floor(r() * trees.length)], x, z, s2, r); } });
      OUT.catZone = { x0: W + 1.0, x1: W + 6.0, z0: Dd + 0.8, z1: Dd + 6.0 };
      OUT.snowSpot = [W + 4.2, Dd + 4.4];
      OUT.tuftZone = function (x, z) { return (z > Dd + 7 || x < -W - 6 || x > W + 17) && freeAt(used, x, z, 0.1); };
    } else {
      // domaine: grande pelouse, allée de gravier, fontaine, piscine, haies taillées, allée d'arbres
      var gr = texMat('gravel', 256, 256, gravelDraw, { rep: [6, 6] }).map, grM = OM(0xffffff, { map: gr });
      flat(g, def.W + 1.6, 2.2, grM, 0, Dd + 1.1, -0.1); flat(g, 2.2, def.D + 1.6, grM, W + 1.1, 0, -0.1);
      flat(g, 3.2, 16, grM, W * 0.35, Dd + 10.2, -0.105);
      fountain(g, -W - 3.6, Dd + 3.8, 1.0);
      pool(g, W + 6.5, -Dd * 0.2, 4, 8); OUT.spots.pool = new V3(W + 6.5, 0, -Dd * 0.2);
      car(g, W * 0.35 - 0.2, Dd + 6.8, 0.15, 0xe0b440);
      // haies et topiaires
      [[-W * 0.55, Dd + 2.9], [W * 0.75, Dd + 2.9]].forEach(function (hq) { hedge(g, hq[0], hq[1], def.W * 0.5, 0.55, 0.6); });
      for (var tp = 0; tp < 6; tp++) { var tz = Dd + 3.6 + tp * 2.4; [W * 0.35 - 2.2, W * 0.35 + 2.2].forEach(function (tx) { var tg2 = grp(g, tx, -0.12, tz); cyl(tg2, 0.32, 0.4, OM(0xd9d2c3), 0, 0, 0, 12); cone(tg2, 0.4, 1.3, OM(0x2f6b3c, { flat: true, snow: 0.6 }), 0, 0.4, 0, 8); }); }
      statue(g, W + 2.6, Dd + 3.2);
      for (var la = 0; la < 8; la++) lampPost(g, W * 0.35 + (la % 2 ? 1.8 : -1.8), Dd + 4.8 + Math.floor(la / 2) * 2.4, 'jardin');
      // allée d'arbres derrière et sur la gauche
      for (var al = 0; al < 7; al++) tree(g, trees[al % 2], -W - 1 + al * (def.W + 6) / 6, -Dd - 3.2, 1.3, r);
      for (var al2 = 0; al2 < 4; al2++) tree(g, trees[(al2 + 1) % 3], -W - 3.4, -Dd + 1 + al2 * (def.D + 4) / 5, 1.25, r);
      var ti4 = tree(g, trees[0], -W - 1.9, Dd + 1.0, 1.5, r); ti4.userData.keep = true; ti4.traverse(function (o) { if (o.isMesh) o.userData.pick = { type: 'out', id: 'tree' }; }); OUT.inter.tree = ti4;
      flowerBed(g, -W * 0.5, Dd + 2.25, def.W * 0.4, 0.5, flowers, r, 30); flowerBed(g, W * 0.8, Dd + 2.25, def.W * 0.3, 0.5, flowers, r, 24);
      flowerBed(g, W + 2.25, -Dd * 0.55, 0.5, def.D * 0.35, flowers, r, 24);
      var mb4 = mailbox(g, W + 2.5, Dd + 1.0, 0.3, st.mail, st.k); OUT.inter.mail = mb4;
      // grille d'honneur et murs du domaine au loin
      fenceRun(g, 'muret', W + 18, Dd + 18.5, -W - 18, Dd + 18.5, W + 18 - W * 0.35);
      if (st.k === 'jp') { lantern(g, -W - 1.2, Dd + 6.2); lantern(g, W + 2.4, Dd + 6.0); }
      scatter(g, def, cfgC, r, { n: q ? 16 : 8, r0: 6, R: Math.max(W, Dd) + 18, m: 4, s0: 1.1, s1: 1.6, h: 4.5, rad: 1.5, used: used.concat([[W * 0.35, Dd + 10, 3.2], [W + 6.5, -Dd * 0.2, 4.5], [-W - 3.6, Dd + 3.8, 2.4]]),
        make: function (x, z, s2) { var sp = r() < 0.3 && conif ? conif : trees[Math.floor(r() * trees.length)]; tree(g, sp, x, z, s2, r); } });
      OUT.catZone = { x0: W + 1.3, x1: W + 4.0, z0: Dd + 0.5, z1: Dd + 5.5 };
      OUT.snowSpot = [-W - 1.0, Dd + 6.6];
      OUT.tuftZone = function (x, z) { return (Math.abs(x) > W + 2.4 || Math.abs(z) > Dd + 2.4) && Math.abs(x - W * 0.35) > 1.8 && freeAt(used, x, z, 0.1); };
    }
    if (q >= 1 && OUT.tuftZone) OUT.tufts = grassTufts(g, q >= 2 ? 650 : 260, OUT.tuftZone, r);
    // interactions: chat et bonhomme de neige
    var cat = catModel(g); OUT.inter.cat = cat; var cz = OUT.catZone; cat.position.set((cz.x0 + cz.x1) / 2, -0.12, (cz.z0 + cz.z1) / 2);
    OUT.catSt = { tx: cat.position.x, tz: cat.position.z, wait: 2, mode: 'sit', hop: 0, purr: 0 };
    var smn = snowmanModel(g, OUT.snowSpot[0], OUT.snowSpot[1]); OUT.inter.snowman = smn; smn.visible = false;
    // oiseaux qui tournent au-dessus du jardin les beaux jours
    OUT.birds = [];
    for (var bi = 0; bi < (q ? 4 : 0); bi++) {
      var bd = grp(g, 0, 4, 0), bm = OM(0x3a3a44), body = sph(bd, 0.07, bm, 0, 0, 0, 8); body.scale.set(0.05, 0.05, 0.11); body.castShadow = false;
      var wl = grp(bd, -0.03, 0, 0), wr = grp(bd, 0.03, 0, 0);
      box(wl, 0.22, 0.012, 0.09, bm, -0.11, 0, 0).castShadow = false; box(wr, 0.22, 0.012, 0.09, bm, 0.11, 0, 0).castShadow = false;
      bd.userData = { keep: true, wl: wl, wr: wr, a: bi * 1.6 + r() * 0.5, R: Math.max(W, Dd) + 2.5 + bi * 1.3 + r() * 2, h: def.H + 1.8 + bi * 0.5, sp: 0.18 + r() * 0.08, ph: r() * 6 };
      OUT.birds.push(bd);
    }
    // fêtes de l'année (visibles le moment venu)
    ((root.GameData && GameData.CAL && GameData.CAL.fests) || []).forEach(function (f) {
      if (f.c && f.c.indexOf(country) < 0) return;
      if (f.fx === 'fireworks') return;
      var fg = festDecor(f.id, f, def); batchStatic(fg, {}); fg.userData.keep = true; g.add(fg); OUT.fests[f.id] = fg;
    });
    // halos lumineux au pied des réverbères (visibles la nuit)
    var halo = canvasTex('halo', 64, 64, function (c, w, h) { var gr = c.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,214,150,0.85)'); gr.addColorStop(0.45, 'rgba(255,200,120,0.35)'); gr.addColorStop(1, 'rgba(255,190,110,0)'); c.fillStyle = gr; c.fillRect(0, 0, w, h); });
    OUT.poolM = OUT.poolM; OUT.haloM = new THREE.MeshBasicMaterial({ map: halo, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, fog: false }); OUT.allM.push(OUT.haloM);
    var hg = grp(g); hg.userData.keep = true; OUT.halos = hg;
    OUT.lamps.forEach(function (lp) { var rr = lp.y > 2 ? 2.4 : 0.9, hm = mesh(hg, G('circle'), OUT.haloM, lp.x, -0.07, lp.z, rr, rr, rr, false); hm.rotation.x = -Math.PI / 2; hm.renderOrder = 2; });
    batchStatic(hg, {}); hg.children.forEach(function (m) { m.renderOrder = 2; });
    batchStatic(g);
    OUT.g = g; world.add(g);
    if (oldG) { world.remove(oldG); disposeOut(oldG); }
    oldM.forEach(function (m) { m.dispose(); });
    OUT.cur = null; // les teintes se recalculent aussitôt
    initParticles();
  }
  function disposeOut(g) { g.traverse(function (o) { if (o.isMesh && o.geometry && !o.geometry.userData.cached) o.geometry.dispose(); }); }

  // ---------- Particules: pluie, neige, feuilles et pétales, feux d'artifice ----------
  var PT = null;
  function dotTex() { return canvasTex('dot', 32, 32, function (c, w, h) { var gr = c.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = gr; c.fillRect(0, 0, w, h); }); }
  function leafTex() { return canvasTex('leafdot', 32, 32, function (c, w, h) { c.fillStyle = '#fff'; c.beginPath(); c.ellipse(16, 16, 13, 7, 0.6, 0, 6.29); c.fill(); }); }
  function initParticles() {
    if (PT) { [PT.rain, PT.snow, PT.leaves, PT.fw, PT.water].forEach(function (o) { if (o) { fxG.remove(o); o.geometry.dispose(); } }); }
    var q = QUAL.lvl, NR = q >= 2 ? 900 : q ? 500 : 220, NS = q >= 2 ? 900 : q ? 500 : 220, NL = q >= 2 ? 160 : q ? 90 : 40, NF = q >= 2 ? 600 : 300;
    var def = cur.def, ext = Math.max(def.W, def.D) / 2 + 9;
    PT = { ext: ext, NR: NR, NS: NS, NL: NL, NF: NF, bursts: [], fwT: 0 };
    var rg = new THREE.BufferGeometry(); PT.rp = new Float32Array(NR * 6); rg.setAttribute('position', new THREE.BufferAttribute(PT.rp, 3));
    PT.rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: 0xbfd0e8, transparent: true, opacity: 0.5, depthWrite: false }));
    var sg = new THREE.BufferGeometry(); PT.sp = new Float32Array(NS * 3); sg.setAttribute('position', new THREE.BufferAttribute(PT.sp, 3));
    PT.snow = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 0.09, map: dotTex(), transparent: true, depthWrite: false, opacity: 0.95 }));
    var lg = new THREE.BufferGeometry(); PT.lp = new Float32Array(NL * 3); PT.lc = new Float32Array(NL * 3); PT.lv = new Float32Array(NL * 4);
    lg.setAttribute('position', new THREE.BufferAttribute(PT.lp, 3)); lg.setAttribute('color', new THREE.BufferAttribute(PT.lc, 3));
    PT.leaves = new THREE.Points(lg, new THREE.PointsMaterial({ size: 0.16, map: leafTex(), vertexColors: true, transparent: true, alphaTest: 0.3, depthWrite: false }));
    var fg = new THREE.BufferGeometry(); PT.fp = new Float32Array(NF * 3); PT.fc = new Float32Array(NF * 3); PT.fv = new Float32Array(NF * 4);
    fg.setAttribute('position', new THREE.BufferAttribute(PT.fp, 3)); fg.setAttribute('color', new THREE.BufferAttribute(PT.fc, 3));
    PT.fw = new THREE.Points(fg, new THREE.PointsMaterial({ size: 0.62, map: dotTex(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })); PT.fb = new Float32Array(NF * 3);
    PT.fi = 0;
    for (var i = 0; i < NF; i++) PT.fp[i * 3 + 1] = -50;
    var NW = OUT.fountains.length ? 90 * OUT.fountains.length : 1, wg = new THREE.BufferGeometry(); PT.NW = NW; PT.wp = new Float32Array(NW * 3); PT.wv = new Float32Array(NW * 4);
    wg.setAttribute('position', new THREE.BufferAttribute(PT.wp, 3));
    PT.water = new THREE.Points(wg, new THREE.PointsMaterial({ color: 0xd8f0ff, size: 0.07, map: dotTex(), transparent: true, depthWrite: false, opacity: 0.85 }));
    for (var wi = 0; wi < NW; wi++) { PT.wp[wi * 3 + 1] = -50; PT.wv[wi * 4 + 3] = Math.random() * 1.2; }
    [PT.rain, PT.snow, PT.leaves, PT.fw, PT.water].forEach(function (o) { o.frustumCulled = false; o.visible = false; fxG.add(o); });
    for (i = 0; i < NR; i++) respawnDrop(i, true);
    for (i = 0; i < NS; i++) respawnFlake(i, true);
    for (i = 0; i < NL; i++) { PT.lp[i * 3 + 1] = -50; PT.lv[i * 4 + 3] = 0; }
  }
  function outsideXZ() { // point tiré hors de la pièce (pas de pluie dans le studio)
    var def = cur.def, W = def.W / 2 + 0.3, Dd = def.D / 2 + 0.3, e = PT.ext, x, z;
    for (var k = 0; k < 8; k++) { x = (Math.random() * 2 - 1) * e; z = (Math.random() * 2 - 1) * e; if (Math.abs(x) > W || Math.abs(z) > Dd) break; }
    if (Math.abs(x) <= W && Math.abs(z) <= Dd) x = W + Math.random() * 2;
    return [x, z];
  }
  function respawnDrop(i, any) { var p = outsideXZ(), y = any ? Math.random() * 9 : 8 + Math.random() * 2, a = PT.rp, o = i * 6; a[o] = p[0]; a[o + 1] = y; a[o + 2] = p[1]; a[o + 3] = p[0]; a[o + 4] = y + 0.35; a[o + 5] = p[1]; }
  function respawnFlake(i, any) { var p = outsideXZ(), a = PT.sp, o = i * 3; a[o] = p[0]; a[o + 1] = any ? Math.random() * 9 : 8 + Math.random() * 2; a[o + 2] = p[1]; }
  function isInRoom(x, z) { var def = cur.def; return Math.abs(x) < def.W / 2 + 0.2 && Math.abs(z) < def.D / 2 + 0.2; }
  // Feuilles mortes ou pétales qui se détachent des arbres.
  function spawnLeaf(col, burstAt) {
    var i = PT.li = ((PT.li || 0) + 1) % PT.NL, o = i * 3, t;
    if (burstAt) t = burstAt; else { if (!OUT.trees.length) return; var tr = OUT.trees[Math.floor(Math.random() * OUT.trees.length)]; if (LEAF[tr.sp].ever && !LEAF[tr.sp].flower) return; t = { x: tr.x, y: tr.top * 0.8, z: tr.z, s: tr.s }; }
    PT.lp[o] = t.x + (Math.random() - 0.5) * 1.6 * (t.s || 1); PT.lp[o + 1] = t.y + (Math.random() - 0.5) * 0.6; PT.lp[o + 2] = t.z + (Math.random() - 0.5) * 1.6 * (t.s || 1);
    PT.lc[o] = col.r; PT.lc[o + 1] = col.g; PT.lc[o + 2] = col.b;
    PT.lv[i * 4] = (Math.random() - 0.5) * 0.4; PT.lv[i * 4 + 1] = -(0.35 + Math.random() * 0.35); PT.lv[i * 4 + 2] = Math.random() * 6; PT.lv[i * 4 + 3] = 1;
  }
  function burstFirework(cols) {
    var def = cur.def, n = 80, x, z, y, side = Math.random();
    // sur les côtés dégagés (jamais dans les immeubles voisins ni devant l'intérieur)
    // au-dessus du fond du studio: toujours dans le champ, devant les immeubles voisins
    x = (Math.random() - 0.5) * def.W * 0.9; z = -def.D / 2 + Math.random() * def.D * 0.35; y = def.H + 1.2 + Math.random() * 2.2;
    if (side < 0.25) { x = def.W / 2 + 1.5 + Math.random() * 2; z = -def.D / 4 + Math.random() * def.D * 0.4; }
    var c = new THREE.Color(cols[Math.floor(Math.random() * cols.length)]);
    for (var k = 0; k < n; k++) {
      var i = PT.fi = (PT.fi + 1) % PT.NF, o = i * 3, u = Math.random() * 2 - 1, a = Math.random() * 6.28, sp = 2.2 + Math.random() * 1.6, sq = Math.sqrt(1 - u * u);
      PT.fp[o] = x; PT.fp[o + 1] = y; PT.fp[o + 2] = z; PT.fb[o] = c.r * 1.6; PT.fb[o + 1] = c.g * 1.6; PT.fb[o + 2] = c.b * 1.6;
      PT.fv[i * 4] = sq * Math.cos(a) * sp; PT.fv[i * 4 + 1] = u * sp; PT.fv[i * 4 + 2] = sq * Math.sin(a) * sp; PT.fv[i * 4 + 3] = 1.6 + Math.random() * 0.6;
    }
  }
  function tickParticles(dt, e) {
    if (!PT) return;
    var pr = e && e.precip, wind = e ? e.wind : 0.3, rainK = pr && pr.t === 'rain' ? pr.k : 0, snowK = pr && pr.t === 'snow' ? pr.k : 0;
    if (reduce) { rainK *= 0.4; snowK *= 0.4; }
    // pluie
    var nr = Math.floor(PT.NR * Math.min(1, rainK * 1.2));
    PT.rain.visible = nr > 0;
    if (nr > 0) {
      var a = PT.rp, wx = wind * 1.5;
      for (var i = 0; i < nr; i++) { var o = i * 6; a[o + 1] -= 11 * dt; a[o + 4] -= 11 * dt; a[o] += wx * dt; a[o + 3] += wx * dt; if (a[o + 1] < -0.1) respawnDrop(i); }
      for (i = nr; i < PT.NR; i++) a[i * 6 + 1] = a[i * 6 + 4] = -50;
      PT.rain.geometry.attributes.position.needsUpdate = true;
      PT.rain.material.opacity = 0.25 + 0.35 * rainK;
    }
    // neige
    var ns = Math.floor(PT.NS * Math.min(1, snowK * 1.2));
    PT.snow.visible = ns > 0;
    if (ns > 0) {
      var b = PT.sp, t = clock.elapsedTime;
      for (i = 0; i < ns; i++) { var p = i * 3; b[p + 1] -= (0.6 + (i % 7) * 0.06) * dt; b[p] += (Math.sin(t * 0.9 + i) * 0.25 + wind * 0.35) * dt; b[p + 2] += Math.cos(t * 0.7 + i * 1.3) * 0.2 * dt; if (b[p + 1] < -0.1) respawnFlake(i); }
      for (i = ns; i < PT.NS; i++) b[i * 3 + 1] = -50;
      PT.snow.geometry.attributes.position.needsUpdate = true;
    }
    // feuilles et pétales
    if (e) {
      var rate = 0;
      if (e.fall > 0.25 && e.leaf > 0.02 && e.leaf < 0.98) rate = 9 * e.fall * (1 - e.leaf) * (0.5 + wind);
      var petal = e.blossom > 0.05 && OUT.leafM.sakura ? 3 * e.blossom : 0;
      PT.acc = (PT.acc || 0) + (rate + petal) * dt * (QUAL.lvl ? 1 : 0.4);
      while (PT.acc > 1) { PT.acc--; if (petal > 0 && Math.random() < petal / (rate + petal)) spawnLeaf(new THREE.Color(0xf7c6d8)); else spawnLeaf(OUT.fallCol || new THREE.Color(0xc98a3a)); }
    }
    var lv = PT.lv, lp = PT.lp, any = false, tt = clock.elapsedTime;
    for (i = 0; i < PT.NL; i++) {
      if (lv[i * 4 + 3] <= 0) continue; any = true;
      var q = i * 3; lv[i * 4 + 2] += dt;
      lp[q] += (lv[i * 4] + Math.sin(tt * 2 + i) * 0.35 + wind * 0.3) * dt; lp[q + 1] += lv[i * 4 + 1] * dt; lp[q + 2] += Math.cos(tt * 1.7 + i) * 0.3 * dt;
      if (lp[q + 1] < -0.08) { lp[q + 1] = -0.08; lv[i * 4 + 3] -= dt * 0.25; if (lv[i * 4 + 3] <= 0) lp[q + 1] = -50; }
    }
    PT.leaves.visible = any;
    if (any) { PT.leaves.geometry.attributes.position.needsUpdate = true; PT.leaves.geometry.attributes.color.needsUpdate = true; }
    // jets des fontaines (arrêtés par le gel)
    var frozen = e && e.snow > 0.55;
    PT.water.visible = !!OUT.fountains.length && !frozen;
    if (PT.water.visible) {
      var wp = PT.wp, wv = PT.wv;
      for (i = 0; i < PT.NW; i++) {
        var fo = OUT.fountains[i % OUT.fountains.length], wq = i * 3;
        wv[i * 4 + 3] -= dt;
        if (wv[i * 4 + 3] <= 0) { var an = Math.random() * 6.28, sp2 = 0.5 + Math.random() * 0.4; wp[wq] = fo.x; wp[wq + 1] = fo.y; wp[wq + 2] = fo.z; wv[i * 4] = Math.cos(an) * sp2; wv[i * 4 + 1] = 1.2 + Math.random() * 0.5; wv[i * 4 + 2] = Math.sin(an) * sp2; wv[i * 4 + 3] = 1.1; }
        wv[i * 4 + 1] -= 3.2 * dt; wp[wq] += wv[i * 4] * dt; wp[wq + 1] += wv[i * 4 + 1] * dt; wp[wq + 2] += wv[i * 4 + 2] * dt;
        if (wp[wq + 1] < 0.3) wv[i * 4 + 3] = 0;
      }
      PT.water.geometry.attributes.position.needsUpdate = true;
    }
    // feux d'artifice
    var fw = OUT.fw;
    if (fw) { PT.fwT -= dt; if (PT.fwT <= 0) { burstFirework(fw.cols); PT.fwT = (dark ? 0.7 : 1.6) + Math.random() * 1.2; } }
    var fv = PT.fv, fp = PT.fp, fany = false;
    for (i = 0; i < PT.NF; i++) {
      if (fv[i * 4 + 3] <= 0) continue; fany = true;
      var f = i * 3; fv[i * 4 + 3] -= dt; fv[i * 4 + 1] -= 2.2 * dt;
      fp[f] += fv[i * 4] * dt; fp[f + 1] += fv[i * 4 + 1] * dt; fp[f + 2] += fv[i * 4 + 2] * dt;
      fv[i * 4] *= 0.985; fv[i * 4 + 2] *= 0.985;
      var fl = Math.min(1, fv[i * 4 + 3] / 0.9); PT.fc[f] = PT.fb[f] * fl; PT.fc[f + 1] = PT.fb[f + 1] * fl; PT.fc[f + 2] = PT.fb[f + 2] * fl;
      if (fv[i * 4 + 3] <= 0) fp[f + 1] = -50;
    }
    PT.fw.visible = fany;
    if (fany) { PT.fw.geometry.attributes.position.needsUpdate = true; PT.fw.geometry.attributes.color.needsUpdate = true; }
  }

  // ---------- Saisons: teintes, densités, ciel, lumière ----------
  var EKEYS = ['leaf', 'fall', 'fresh', 'blossom', 'flowers', 'dry', 'dormant', 'snow', 'cloud', 'haze', 'bloom', 'wind'];
  var TMP = { c: null, c2: null };
  function grassCol(e, out) {
    lerpHex(0x7cb350, 0x67bd4c, e.fresh, out);
    out.lerp(TMP.c.setHex(0xaaa45a), e.dry * 0.85);
    out.lerp(TMP.c.setHex(0x8e9b52), e.fall * (1 - e.dormant) * 0.5);
    out.lerp(TMP.c.setHex(0x7d8a62), e.dormant * 0.75);
    if (e.zone === 'tropical') { out.lerp(TMP.c.setHex(0x5aa845), 0.4 * (1 - e.dry)); out.lerp(TMP.c.setHex(0xbca866), e.dry * 0.75); }
    return out;
  }
  function leafCol(sp, e, out) {
    var L = LEAF[sp];
    if (L.ever) { out.setHex(L.sum); if (e.dry) out.lerp(TMP.c.setHex(0x9a9a4a), e.dry * 0.35); if (e.dormant) out.lerp(TMP.c.setHex(0x3a5a40), e.dormant * 0.3); return out; }
    lerpHex(L.sum, L.spr, e.fresh * 0.75, out);
    out.lerp(TMP.c.setHex(0x8f9a3e), e.dry * 0.3);
    var f = e.fall; if (f > 0) { out.lerp(TMP.c.setHex(0xa8a83e), Math.min(1, f * 2) * 0.5); out.lerp(TMP.c.setHex(L.fall), Math.max(0, f * 1.4 - 0.3)); }
    return out;
  }
  function applyEnv(dt, force) {
    if (!OUT.g || !OUT.env) return;
    var tg = OUT.env, c = OUT.cur;
    if (!TMP.c) { TMP.c = new THREE.Color(); TMP.c2 = new THREE.Color(); }
    if (!c || force) { c = OUT.cur = {}; EKEYS.forEach(function (k) { c[k] = tg[k] || 0; }); }
    else { var a = Math.min(1, dt * 1.5); EKEYS.forEach(function (k) { c[k] += ((tg[k] || 0) - c[k]) * a; }); }
    c.zone = tg.zone; c.precip = tg.precip;
    // pelouse, touffes, neige au sol
    OUT.wet += ((tg.precip && tg.precip.t === 'rain' ? 1 : 0) - OUT.wet) * Math.min(1, dt * 0.25);
    // la nuit, le jardin s'assombrit et la neige prend des reflets bleutés
    var nightK = dark ? 0.58 : 1;
    grassCol(c, OUT.groundM.color).lerp(TMP.c.setHex(0xe9eef3), Math.min(0.75, c.snow * 0.7)).multiplyScalar(nightK * (1 - OUT.wet * 0.15)); if (OUT.tuftM) OUT.tuftM.color.copy(OUT.groundM.color).multiplyScalar(0.92);
    OUT.snowM.color.setHex(dark ? 0xb9c4dc : 0xf4f8ff);
    setDens(OUT.snowM, c.snow * 1.08);
    if (OUT.tufts) OUT.tufts.visible = c.snow < 0.75;
    // feuillages par essence
    Object.keys(OUT.leafM).forEach(function (sp) {
      var L = LEAF[sp], m = OUT.leafM[sp], d = L.ever ? 1 : c.leaf;
      if (sp === 'sakura') d = Math.max(0, c.leaf - c.blossom * 0.6);
      if (sp === 'ipe') d = 1 - c.bloom * 0.6;
      leafCol(sp, c, m.color); setDens(m, d);
    });
    Object.keys(OUT.bloomM).forEach(function (sp) { var b = sp === 'sakura' ? c.blossom : c.bloom; setDens(OUT.bloomM[sp], b); });
    if (OUT.capM) setDens(OUT.capM, c.snow * 1.15);
    var fl = c.zone === 'tropical' ? 0.85 - c.dry * 0.4 : c.flowers;
    OUT.flowerM.forEach(function (m) { setDens(m, fl); });
    if (OUT.cropM) { setDens(OUT.cropM, c.zone === 'tropical' ? 1 : Math.max(0.05, 1 - c.dormant * 1.2) * (1 - c.snow)); leafCol('tilleul', c, OUT.cropM.color); }
    if (OUT.fruitM) setDens(OUT.fruitM, c.zone === 'tropical' ? 0.6 : c.fall * (1 - c.dormant) * (1 - c.snow));
    var sp0 = Object.keys(OUT.leafM).filter(function (k) { return !LEAF[k].ever; })[0];
    if (sp0) OUT.fallCol = leafCol(sp0, c, OUT.fallCol || new THREE.Color());
    // neige sur les toits, haies, voitures (teinte vers le blanc)
    OUT.tint.forEach(function (t) { t.m.color.copy(t.c).lerp(TMP.c.setHex(0xf4f8ff), Math.min(1, c.snow * t.k * 1.2)); });
    // eau: gel en plein hiver
    var ice = Math.min(1, c.snow * 1.3);
    OUT.waterM.color.setHex(0x4f8fb8).lerp(TMP.c.setHex(0xdfeaf2), ice); if (OUT.waterM.isMeshStandardMaterial) OUT.waterM.roughness = 0.12 + ice * 0.5;
    // lampes et fenêtres la nuit, ou par temps très sombre
    var lit = dark ? 1 : Math.max(0, c.cloud - 0.7) * 1.2;
    OUT.night.forEach(function (n) { n.m.emissiveIntensity = n.on * (0.04 + 0.96 * lit); });
    if (OUT.haloM) { OUT.haloM.opacity = lit * 0.9; OUT.halos.visible = lit > 0.02; }
    // fêtes
    var fests = tg.fests || [], fwCols = null;
    Object.keys(OUT.fests).forEach(function (id) { var on = fests.indexOf(id) >= 0; if (OUT.fests[id].visible !== on) { OUT.fests[id].visible = on; } });
    fests.forEach(function (id) { var f = root.GameData && GameData.CAL && GameData.CAL.fests.filter(function (x) { return x.id === id; })[0]; if (f && f.fx === 'fireworks') fwCols = f.cols || [0xff4d6d, 0xffd166, 0x66ccff, 0x9b82f0, 0x6cff9a]; });
    OUT.fw = fwCols ? { cols: fwCols } : null;
    if (cur.seasonG) {
      var want = fests.indexOf('noel') >= 0 ? 'sapin' : fests.indexOf('halloween') >= 0 ? 'citrouille' : (c.zone === 'tropical' || c.flowers > 0.4) ? 'bouquet' : '';
      cur.seasonG.children.forEach(function (o) { o.visible = o.name === want; });
    }
    if (OUT.inter.snowman) {
      var sm = OUT.smState || { stage: 0, can: false };
      OUT.inter.snowman.visible = c.snow > 0.3 && (sm.can || sm.stage > 0);
      var stg = OUT.inter.snowman.userData.st; for (var i = 0; i < stg.length; i++) stg[i].visible = i === 0 ? sm.stage < 3 && c.snow > 0.3 : i <= sm.stage;
    }
    skyLight(c);
  }
  // Ciel (brouillard et fond), soleil et lumière d'ambiance suivent la météo.
  function skyLight(c) {
    if (!scene || !TMP.c) return;
    var sky = TMP.c2;
    if (dark) sky.setHex(0x141a24).lerp(TMP.c.setHex(0x232a36), c.cloud * 0.5);
    else { sky.setHex(0xcfe4f2).lerp(TMP.c.setHex(0xc4c9cf), c.cloud * 0.8); if (c.snow > 0.2) sky.lerp(TMP.c.setHex(0xe6ecf2), (c.snow - 0.2) * 0.6); if (c.haze) sky.lerp(TMP.c.setHex(0xe0c79a), c.haze * 0.8); }
    if (!scene.background || !scene.background.isColor) scene.background = new THREE.Color();
    scene.background.copy(sky);
    if (!scene.fog) scene.fog = new THREE.Fog(0xffffff, 30, 90);
    scene.fog.color.copy(sky);
    var near = (cam.fit * cam.zoom) + Math.max(cur.def.W, cur.def.D) * 0.75, wetFog = (c.precip ? c.precip.k * 0.35 : 0) + c.haze * 0.45;
    scene.fog.near = near; scene.fog.far = near + Math.max(16, cam.fit * 1.1) * (1 - wetFog);
    var base = dark ? 1.0 : 1.7;
    sun.intensity = base * (1 - 0.45 * c.cloud) * (1 - 0.2 * c.haze);
    hemi.intensity = (dark ? 0.95 : 0.78) * (1 + 0.15 * c.cloud + 0.12 * c.snow);
    if (OUT.base) { hemi.groundColor.copy(OUT.base.ground).lerp(TMP.c.setHex(dark ? 0x6a7080 : 0xd8dde4), c.snow * 0.6); sun.color.copy(OUT.base.sun).lerp(TMP.c.setHex(0xffcf9a), c.haze * 0.6); }
  }
  // Animations du jardin: chat, boîte aux lettres, arbre secoué, vent.
  function tickOutdoor(dt, t) {
    if (!OUT.g) return;
    applyEnv(dt);
    tickParticles(dt, OUT.cur ? Object.assign({}, OUT.cur, { precip: OUT.env && OUT.env.precip }) : null);
    var ev = OUT.env, pr = ev && ev.precip;
    if (OUT.windU.value) OUT.windU.value.set(t, (ev ? ev.wind : 0.4) * (pr ? 1.6 : 1) * (reduce ? 0.3 : 1));
    // orage: éclairs quand il pleut fort par temps chaud
    if (pr && pr.t === 'rain' && pr.k > 0.72 && ev.temp > 15 && !reduce) {
      OUT.boltT = (OUT.boltT == null ? 4 : OUT.boltT) - dt;
      if (OUT.boltT <= 0) { OUT.flash = 1; OUT.boltT = 6 + Math.random() * 10; }
    }
    if (OUT.flash > 0) { OUT.flash = Math.max(0, OUT.flash - dt * 4); hemi.intensity *= 1 + OUT.flash * (OUT.flash > 0.6 || OUT.flash < 0.3 ? 2.2 : 0.6); }
    var mb = OUT.inter.mail;
    if (mb) { var want = OUT.mailOn ? 0 : Math.PI / 2; mb.userData.flag.rotation.x += (want - mb.userData.flag.rotation.x) * Math.min(1, dt * 4); mb.userData.env.visible = !!OUT.mailOn; if (OUT.mailOn) mb.userData.env.position.y = (OUT.mailEnvY || (OUT.mailEnvY = mb.userData.env.position.y)) + Math.abs(Math.sin(t * 3)) * 0.05; }
    var cc = OUT.cur, fly = cc && !dark && !(OUT.env && OUT.env.precip) && (cc.zone === 'tropical' || cc.leaf > 0.25) && cc.snow < 0.2;
    (OUT.birds || []).forEach(function (bd) {
      bd.visible = !!fly; if (!fly) return;
      var u = bd.userData; u.a += u.sp * dt;
      bd.position.set(Math.cos(u.a) * u.R, u.h + Math.sin(u.a * 2 + u.ph) * 0.6, Math.sin(u.a) * u.R * 0.85);
      bd.rotation.y = -u.a; bd.rotation.z = 0.25;
      var fl = Math.sin(t * 13 + u.ph) * 0.7 * (0.5 + 0.5 * Math.max(0, Math.sin(t * 0.7 + u.ph)));
      u.wl.rotation.z = fl; u.wr.rotation.z = -fl;
    });
    var tr = OUT.inter.tree;
    if (tr && OUT.shake > 0) { OUT.shake = Math.max(0, OUT.shake - dt); var k = OUT.shake; tr.rotation.z = Math.sin(t * 38) * 0.035 * k; tr.rotation.x = Math.cos(t * 31) * 0.025 * k; }
    if (OUT.poolM && OUT.poolM.map) { OUT.poolM.map.offset.x = Math.sin(t * 0.3) * 0.05; OUT.poolM.map.offset.y = t * 0.02; }
    tickCat(dt, t);
  }
  function tickCat(dt, t) {
    var cat = OUT.inter.cat, s = OUT.catSt, z = OUT.catZone; if (!cat || !s) return;
    var u = cat.userData, wet = OUT.env && OUT.env.precip;
    if (s.purr > 0) { s.purr -= dt; u.tail.rotation.z = Math.sin(t * 10) * 0.4; u.head.rotation.x = -0.25; return; }
    if (s.hop > 0) { s.hop -= dt; cat.position.y = -0.12 + Math.sin((1 - s.hop / 0.5) * Math.PI) * 0.35; if (s.hop <= 0) cat.position.y = -0.12; }
    if (s.mode === 'walk') {
      var dx = s.tx - cat.position.x, dz = s.tz - cat.position.z, d = Math.hypot(dx, dz);
      if (d < 0.05) { s.mode = 'sit'; s.wait = 3 + Math.random() * 6; }
      else {
        var sp = 0.45 * dt; cat.position.x += dx / d * Math.min(sp, d); cat.position.z += dz / d * Math.min(sp, d);
        var ang = Math.atan2(dx, dz); cat.rotation.y += (((ang - cat.rotation.y + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * Math.min(1, dt * 6);
        u.legs.forEach(function (l, i) { l.rotation.x = Math.sin(t * 9 + (i % 2 ? 0 : Math.PI) + (i > 1 ? Math.PI : 0)) * 0.5; });
        u.body.position.y = 0.2 + Math.abs(Math.sin(t * 9)) * 0.012;
      }
    } else {
      u.legs.forEach(function (l, i) { l.rotation.x = i > 1 ? -0.9 : 0; }); u.body.rotation.x = -0.25; u.body.position.y = 0.17;
      u.tail.rotation.z = Math.sin(t * 1.4) * 0.3; u.head.rotation.y = Math.sin(t * 0.5) * 0.5;
      s.wait -= dt;
      if (s.wait <= 0 && !wet) { s.mode = 'walk'; s.tx = z.x0 + Math.random() * (z.x1 - z.x0); s.tz = z.z0 + Math.random() * (z.z1 - z.z0); u.body.rotation.x = 0; }
      if (wet) { s.tx = z.x0 + 0.2; s.tz = z.z0 + 0.3; if (Math.hypot(s.tx - cat.position.x, s.tz - cat.position.z) > 0.3) { s.mode = 'walk'; u.body.rotation.x = 0; } }
    }
  }
  // Effets des interactions: courrier ouvert, arbre secoué, chat qui ronronne, bonhomme qui grandit.
  S3.outFx = function (id) {
    if (!OUT.g) return;
    if (id === 'tree' && OUT.inter.tree) {
      OUT.shake = 1.2;
      var tr = OUT.trees.filter(function (q) { return q.g === OUT.inter.tree; })[0], c = OUT.cur || {};
      if (tr) {
        var col = c.blossom > 0.2 && tr.sp === 'sakura' ? new THREE.Color(0xf7c6d8) : c.snow > 0.4 && c.leaf < 0.2 ? new THREE.Color(0xffffff) : leafCol(tr.sp, c.zone ? c : { fresh: 0, dry: 0, fall: 0, dormant: 0 }, new THREE.Color());
        for (var i = 0; i < 26; i++) spawnLeaf(col, { x: tr.x, y: tr.top * 0.75, z: tr.z, s: tr.s });
      }
    } else if (id === 'cat' && OUT.catSt) { OUT.catSt.purr = 2.4; OUT.catSt.hop = 0.5; hearts(OUT.inter.cat.position); }
    else if (id === 'snowman' && OUT.inter.snowman) { var p = OUT.inter.snowman.position; sparkle(new V3(p.x, 0.3, p.z)); }
    else if (id === 'mail' && OUT.inter.mail) { var q = OUT.inter.mail.position; sparkle(new V3(q.x, 0.8, q.z)); }
  };
  function hearts(pos) {
    for (var i = 0; i < 6; i++) {
      var s = sph(fxG, 0.05, M(0xff5d8a, { e: 0xff5d8a, ei: 1.5 }), pos.x, 0.5, pos.z, 6); s.castShadow = false;
      anims.push({ fx: s, t: 0, d: 1.1, vx: (Math.random() - 0.5) * 0.4, vy: 0.9 + Math.random() * 0.4, vz: (Math.random() - 0.5) * 0.4, g: -0.2 });
    }
  }
  // État des interactions reçu de l'interface (courrier prêt, bonhomme à construire).
  function syncOutdoor(v) {
    var def = cur.def, e = v.env || null, country = (e && e.country) || 'fr';
    var key = cur.placeKey + '|' + cur.tier + '|' + country + '|' + QUAL.lvl;
    if (key !== OUT.key) { OUT.key = key; buildOutdoor(def, cur.placeKey, cur.tier, country); }
    if (e) { var first = !OUT.env; OUT.env = e; if (first) applyEnv(0, true); }
    var o = v.outdoor || {};
    OUT.mailOn = !!o.mail;
    OUT.smState = { stage: o.sm || 0, can: o.snowman === 'build' || o.snowman === 'done' };
  }

  // ---------- Icônes cliquables posées dans la scène (clash, piano) ----------
  var hots = {}, hotFn = null;
  function hotAnchor(kind) {
    var p = null, n;
    if (kind === 'drums') {
      n = itemNodes.studioA;
      if (n && !n.userData.ghost) { var k = n.getObjectByName('kit'); if (k) { p = k.getWorldPosition(new V3()); p.y += 1.45; } }
      if (!p && cur.edrums) { p = cur.edrums.getWorldPosition(new V3()); p.y += 1.45; }
    } else if (kind === 'globe') {
      if (globeNode) { p = globeNode.getWorldPosition(new V3()); p.y += 1.45; }
    } else if (kind === 'shelf') {
      if (cur.shelf) { p = cur.shelf.getWorldPosition(new V3()); p.y += 0.75; p.x += 0.2; }
    } else if (kind && kind.indexOf('artist:') === 0) {
      n = artistNodes[kind.slice(7)]; if (n) p = n.anchor.clone();
    } else if (kind && kind.indexOf('out:') === 0) {
      n = OUT.inter[kind.slice(4)];
      if (n && n.visible !== false) { p = n.getWorldPosition(new V3()); p.y += kind === 'out:snowman' ? 1.9 : kind === 'out:mail' ? 1.75 : 0.8; }
    } else if (kind === 'piano') {
      n = itemNodes.orchestre;
      if (n && !n.userData.ghost) { p = n.getWorldPosition(new V3()); p.y += 1.55; }
      else if ((n = itemNodes.clavier) && !n.userData.ghost) { p = n.getWorldPosition(new V3()); p.y += 0.75; }
    }
    return p;
  }
  // list: [{ id, anchor: 'drums' | 'piano', label, html, hot }]
  S3.setHotspots = function (list) {
    if (!overlay) return;
    var seen = {};
    (list || []).forEach(function (h) {
      seen[h.id] = 1;
      var o = hots[h.id];
      if (!o) {
        var b = document.createElement('button');
        b.type = 'button'; b.className = 'hot3d'; b.setAttribute('data-hot', h.id);
        b.addEventListener('click', function (e) { e.stopPropagation(); if (hotFn) hotFn(h.id); });
        b.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
        overlay.appendChild(b);
        o = hots[h.id] = { el: b, key: '' };
      }
      o.anchor = h.anchor;
      var key = h.html + '|' + h.label + '|' + !!h.hot + '|' + !!h.mini;
      if (key !== o.key) { o.key = key; o.el.innerHTML = h.html; o.el.setAttribute('aria-label', h.label); o.el.title = h.label; o.el.classList.toggle('hot', !!h.hot); o.el.classList.toggle('mini', !!h.mini); }
    });
    Object.keys(hots).forEach(function (id) { if (!seen[id]) { var o = hots[id]; if (o.el.parentNode) o.el.parentNode.removeChild(o.el); delete hots[id]; } });
  };
  S3.onHotspot = function (fn) { hotFn = fn; };
  function updateHots() {
    var ids = Object.keys(hots);
    if (!ids.length) return;
    var w = canvas.clientWidth, h = canvas.clientHeight;
    ids.forEach(function (id) {
      var o = hots[id], p = hotAnchor(o.anchor);
      if (!p) { if (!o.el.hidden) o.el.hidden = true; return; }
      p.project(camera);
      var x = (p.x + 1) / 2 * w, y = (1 - p.y) / 2 * h, out = p.z > 1 || x < 8 || x > w - 8 || y < 8 || y > h - 8;
      if (o.el.hidden !== out) o.el.hidden = out;
      o.x = x; o.y = y; o.out = out;
    });
    // les icônes proches s'écartent pour rester lisibles
    var vis = ids.map(function (id) { return hots[id]; }).filter(function (o) { return !o.out; });
    vis.forEach(function (o) { if (!o.w || o.key !== o.wk) { o.w = o.el.offsetWidth || 60; o.h = o.el.offsetHeight || 30; o.wk = o.key; } });
    vis.sort(function (a, b) { return b.y - a.y; });
    for (var i = 0; i < vis.length; i++) {
      for (var j = 0; j < i; j++) {
        var a = vis[i], b = vis[j];
        if (Math.abs(a.x - b.x) < (a.w + b.w) / 2 + 4 && Math.abs(a.y - b.y) < (a.h + b.h) / 2 + 4) a.y = b.y - (a.h + b.h) / 2 - 6;
      }
    }
    vis.forEach(function (o) { var tr = 'translate(' + o.x.toFixed(1) + 'px,' + o.y.toFixed(1) + 'px) translate(-50%,-100%)'; if (o.tr !== tr) { o.tr = tr; o.el.style.transform = tr; } });
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
  var live = {}, anyLive = false, FT = { r: 0, js: 0 };
  S3._ft = function () { return FT; };
  function smooth(x) { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); }
  function animatePerson(g, t, mode) {
    var p = g.userData.p; if (!p) return;
    var k = reduce ? 0.3 : 1, ph = t + p.t;
    p.head.rotation.set(0, 0, 0); p.body.rotation.set(0, 0, 0); p.body.position.y = p.hip;
    if (mode === 'work') { // au clavier: avant-bras posés vers le bureau, doigts qui tapent
      pose3(p, 0.42, 0.95 + Math.sin(t * 13 + p.t) * 0.06 * k, 0.42, 0.95 + Math.sin(t * 11.3 + p.t + 1.3) * 0.06 * k, 0.12, -0.12);
      p.head.rotation.x = 0.12 + Math.sin(ph * 0.9) * 0.04 * k;
    } else if (mode === 'rest') { // pause canapé: une main sur la cuisse, l'autre tient un téléphone
      pose3(p, 0.35, 0.55, 0.3, 1.55 + Math.sin(ph * 0.9) * 0.08 * k, 0.1, -0.22);
      p.head.rotation.x = 0.28; p.body.rotation.y = Math.sin(ph * 0.4) * 0.1 * k;
    } else if (mode === 'artist') {
      // l'artiste chante par moments (micro à la bouche), puis baisse le micro et se balance
      var cyc = (ph * 0.12) % 1, sing = smooth((cyc < 0.5 ? cyc : 1 - cyc) * 6 - 0.6), beat = Math.sin(ph * 4.2);
      pose3(p, 0.12 + 0.2 * sing + 0.04 * beat * k, 0.35 + 0.45 * sing, 0.12 + 0.12 * sing, 0.45 + 2.2 * sing,
        0.08 + 0.18 * sing, -0.07 - 0.2 * sing, 0, -0.75 * sing);
      p.head.rotation.x = -0.08 * sing + beat * 0.05 * k; p.head.rotation.y = (1 - sing) * Math.sin(ph * 0.6) * 0.3 * k;
      p.body.rotation.z = Math.sin(ph * 2.1) * 0.03 * k; p.body.rotation.y = Math.sin(ph * 1.05) * 0.1 * k;
      p.body.position.y = p.hip + Math.abs(Math.sin(ph * 2.1)) * 0.012 * k;
    } else if (mode === 'train') { // devant le tableau: bras croisés, tête qui acquiesce
      pose3(p, 0.18, 1.5, 0.22, 1.45, 0.12, -0.12, 1.15, -1.1);
      p.head.rotation.x = 0.1 + Math.sin(ph * 0.7) * 0.05 * k;
    } else { // assis, mains sur les genoux, regard qui balaie la pièce
      pose3(p, 0.32, 0.45, 0.32, 0.45, 0.08, -0.08);
      p.head.rotation.y = Math.sin(ph * 0.5) * 0.35 * k;
      p.body.position.y = p.hip + Math.sin(ph * 1.6) * 0.004;
    }
  }
  function frame(now) {
    requestAnimationFrame(frame);
    // en pause pendant un mini-jeu plein écran: toute la fluidité va au jeu (et à la batterie du téléphone)
    if (document.hidden || !S3.ok) return;
    if (S3.paused) { clock.getDelta(); return; }
    var dt = Math.min(0.1, clock.getDelta()), t = clock.elapsedTime, tf0 = performance.now();
    if (player) animatePerson(player, t, anyLive ? 'work' : 'idle');
    Object.keys(artistNodes).forEach(function (id) { animatePerson(artistNodes[id].g, t, 'artist'); });
    if (globeNode && !reduce) globeNode.userData.ball.rotation.y = t * 0.25;
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
    tickOutdoor(dt, t);
    // caméra: retour doux vers l'angle de base quand on ne la touche pas
    applyCam();
    updatePops(dt);
    // ombres recalculées une image sur deux en qualité réduite (les personnages bougent peu)
    FT.n = (FT.n || 0) + 1; R.shadowMap.needsUpdate = QUAL.lvl >= 2 || FT.n % 2 === 0;
    var tr0 = performance.now();
    R.render(scene, camera);
    var tr1 = performance.now(); FT.r = FT.r * 0.8 + (tr1 - tr0) * 0.2; FT.js = FT.js * 0.8 + (tr0 - tf0) * 0.2;
    updateHots();
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
    var lastTap = 0;
    function mid(ids) { var a = drag.pts[ids[0]], b = drag.pts[ids[1]]; return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y) }; }
    canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    canvas.addEventListener('pointerdown', function (e) {
      if (e.isPrimary) drag.pts = {}; // nouveau geste: oublier les doigts restés en mémoire
      drag.pts[e.pointerId] = { x: e.clientX, y: e.clientY };
      var ids = Object.keys(drag.pts);
      if (ids.length === 2) { var m = mid(ids); drag.pinch = m.d; drag.z0 = cam.zoom; drag.mx = m.x; drag.my = m.y; }
      drag.on = true; drag.x = e.clientX; drag.y = e.clientY; drag.moved = 0; drag.yaw0 = cam.yaw; drag.pitch0 = cam.pitch;
      // clic droit, clic molette ou Maj + clic: déplacer la caméra
      drag.pan = e.pointerType === 'mouse' && (e.button === 2 || e.button === 1 || e.shiftKey);
      try { canvas.setPointerCapture(e.pointerId); } catch (x) { /* facultatif */ }
    });
    canvas.addEventListener('pointermove', function (e) {
      if (!drag.pts[e.pointerId]) return;
      var px = drag.pts[e.pointerId].x, py = drag.pts[e.pointerId].y;
      drag.pts[e.pointerId] = { x: e.clientX, y: e.clientY };
      var ids = Object.keys(drag.pts);
      if (ids.length >= 2) {
        // deux doigts: pincer pour zoomer, glisser pour se déplacer
        var m = mid(ids);
        if (drag.pinch > 0 && m.d > 0) zoomAt(drag.z0 * drag.pinch / m.d / cam.zoom, m.x, m.y);
        panBy(m.x - drag.mx, m.y - drag.my);
        drag.mx = m.x; drag.my = m.y;
        drag.moved = 99; return;
      }
      var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      drag.moved = Math.max(drag.moved, Math.abs(dx) + Math.abs(dy));
      if (drag.moved > 6) {
        if (drag.pan) panBy(e.clientX - px, e.clientY - py);
        else {
          cam.yaw = Math.max(cam.yawBase - 0.75, Math.min(cam.yawBase + 0.6, drag.yaw0 - dx * 0.006));
          cam.pitch = Math.max(0.35, Math.min(1.05, drag.pitch0 + dy * 0.004));
          camChanged();
        }
        drag.last = Date.now();
      }
    });
    function up(e) {
      var wasTap = drag.moved <= 6 && Object.keys(drag.pts).length === 1 && !drag.pan;
      delete drag.pts[e.pointerId];
      var ids = Object.keys(drag.pts);
      if (!ids.length) { drag.on = false; drag.pinch = 0; drag.last = Date.now(); }
      else if (ids.length === 1) { var p = drag.pts[ids[0]]; drag.x = p.x; drag.y = p.y; drag.yaw0 = cam.yaw; drag.pitch0 = cam.pitch; drag.moved = 99; }
      if (wasTap && e.type === 'pointerup') {
        var now = Date.now();
        if (e.pointerType !== 'mouse' && now - lastTap < 320) { resetCam(); lastTap = 0; return; } // double tape: recadrer
        lastTap = now;
        if (pickFn) { var u = pick(e.clientX, e.clientY); pickFn(u, e.clientX, e.clientY); }
      }
    }
    canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('wheel', function (e) { e.preventDefault(); zoomAt(e.deltaY > 0 ? 1.1 : 1 / 1.1, e.clientX, e.clientY); drag.last = Date.now(); }, { passive: false });
    canvas.addEventListener('dblclick', resetCam);
    // Clavier: flèches pour se déplacer, + et − pour zoomer, 0 pour recadrer
    window.addEventListener('keydown', function (e) {
      var t = document.activeElement, tag = t && t.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || e.ctrlKey || e.metaKey || e.altKey) return;
      if (document.querySelector('.scrim:not([hidden])')) return;
      var step = 40, done = true;
      if (e.key === 'ArrowLeft') panBy(step, 0); else if (e.key === 'ArrowRight') panBy(-step, 0);
      else if (e.key === 'ArrowUp') panBy(0, step); else if (e.key === 'ArrowDown') panBy(0, -step);
      else if (e.key === '+' || e.key === '=') zoomAt(1 / 1.15); else if (e.key === '-' || e.key === '_') zoomAt(1.15);
      else if (e.key === '0') resetCam();
      else done = false;
      if (done) e.preventDefault();
    });
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
      R.shadowMap.enabled = true; R.shadowMap.type = THREE.PCFSoftShadowMap; R.shadowMap.autoUpdate = false; R.shadowMap.needsUpdate = true;
      R.outputColorSpace = THREE.SRGBColorSpace; R.toneMapping = THREE.ACESFilmicToneMapping; R.toneMappingExposure = 1.05;
      scene = new THREE.Scene();
      camera = new THREE.PerspectiveCamera(30, 1, 0.1, 200);
      cam.target = new V3(); cam.pan = new V3();
      world = grp(scene); itemsG = grp(world); staffG = grp(world); fxG = grp(world);
      ray = new THREE.Raycaster(); ndc = new THREE.Vector2();
      clock = new THREE.Clock();
      reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
      QUAL.lvl = mobile ? 1 : 2;
      lights();
      makeEnv();
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
    var dk = JSON.stringify(v.deco || {});
    if (dk !== decoKey) {
      deco = v.deco || {}; var had = decoKey !== '';
      decoKey = dk;
      if (had && cur.placeKey && v.place === cur.placeKey && v.tier === cur.tier) {
        var keep = { yaw: cam.yaw, pitch: cam.pitch, zoom: cam.zoom, pan: cam.pan ? cam.pan.clone() : null };
        setPlace(cur.placeKey, cur.tier);
        cam.yaw = keep.yaw; cam.pitch = keep.pitch; cam.zoom = keep.zoom; if (keep.pan && cam.pan) cam.pan.copy(keep.pan);
        applyCam(); camChanged();
      } else applyTheme();
    }
    if (v.place !== cur.placeKey || v.tier !== cur.tier) {
      var moved = cur.placeKey && v.place !== cur.placeKey;
      setPlace(v.place, v.tier);
      if (moved && S3.onMove) S3.onMove(v.place);
    }
    syncItems(v);
    syncExtras(v);
    syncDesks(v.cap || 0);
    layoutStaff(v.staff);
    layoutArtists(v.artists);
    syncSouvenirs(v);
    syncOutdoor(v);
    live = v.live || {}; anyLive = Object.keys(live).some(function (k) { return live[k] && !(v.staff || []).some(function (m) { return m.act === k && m.status === 'work'; }); });
  };
  S3.setTheme = function (d) { var was = dark; dark = !!d; if (!S3.ok) return; applyTheme(); if (was !== dark && cur.placeKey) { var k = cur.placeKey, t = cur.tier; cur.placeKey = null; S3.update(Object.assign({}, view || {}, { place: k, tier: t })); } };
  S3.onPick = function (fn) { pickFn = fn; };
  // Qualité: 'auto' (selon l'appareil), 'low' (économie) ou 'high' (détaillée).
  S3.setQuality = function (q) {
    QUAL.pref = q || 'auto';
    var lvl = q === 'low' ? 0 : q === 'high' ? 2 : mobile ? 1 : 2;
    if (!S3.ok || lvl === QUAL.lvl && OUT.g) { QUAL.lvl = lvl; return; }
    QUAL.lvl = lvl;
    if (lvl === 0) { if (scene.environment) { OUT.envTex = scene.environment; scene.environment = null; } } else if (!scene.environment && OUT.envTex) scene.environment = OUT.envTex;
    R.setPixelRatio(Math.min(window.devicePixelRatio || 1, lvl === 0 ? 1 : mobile ? 1.6 : q === 'high' ? 2 : 1.75));
    var ms = lvl === 0 ? 512 : lvl === 1 ? 1024 : 2048;
    if (sun.shadow.mapSize.x !== ms) { sun.shadow.mapSize.set(ms, ms); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }
    S3.resize();
  };
  S3.onCamChange = function (fn) { camFn = fn; };
  S3.resetCam = function () { if (S3.ok) resetCam(); };
  S3.setInsets = function (t, b) {
    t = Math.max(0, Math.round(t || 0)); b = Math.max(0, Math.round(b || 0));
    if (t === ins.t && b === ins.b) return;
    ins.t = t; ins.b = b;
    if (!S3.ok) return;
    applyOffset();
    if (cur.def) { fitCamera(); applyCam(); }
  };
  // Globe interactif dans sa propre toile: glisser pour tourner, molette ou pincement pour zoomer, toucher un pays pour le choisir.
  S3.globe = function (cv, onPick) {
    if (!THREE) return null;
    var Rg;
    try { Rg = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true }); } catch (e) { return null; }
    Rg.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); Rg.outputColorSpace = THREE.SRGBColorSpace;
    var sc = new THREE.Scene(), cm = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
    sc.add(new THREE.HemisphereLight(0xffffff, 0x334466, 1.6)); var dl = new THREE.DirectionalLight(0xffffff, 1.4); dl.position.set(-2, 2, 4); sc.add(dl);
    var mc = document.createElement('canvas'); mc.width = 2048; mc.height = 1024;
    var tex = new THREE.CanvasTexture(mc); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    var ball = new THREE.Mesh(new THREE.SphereGeometry(1, 72, 48), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 }));
    var halo = new THREE.Mesh(new THREE.SphereGeometry(1.07, 48, 32), new THREE.MeshBasicMaterial({ color: 0x8cc4ff, transparent: true, opacity: 0.16, side: THREE.BackSide }));
    sc.add(ball); sc.add(halo);
    var st = { yaw: 0, pitch: 0.5, ty: null, tp: null, vy: 0, zoom: 3.6, drag: null, moved: 0, raf: 0, idle: 0, alive: true };
    function lookAt(lat, lon) { st.idle = -12; st.ty = -(lon + 90) * Math.PI / 180; st.tp = lat * Math.PI / 180; while (st.ty - st.yaw > Math.PI) st.ty -= 2 * Math.PI; while (st.yaw - st.ty > Math.PI) st.ty += 2 * Math.PI; }
    function size() { var r = cv.getBoundingClientRect(); Rg.setSize(Math.max(1, r.width), Math.max(1, r.height), false); cm.aspect = r.width / Math.max(1, r.height); cm.updateProjectionMatrix(); }
    var last = performance.now();
    function loop(now) {
      if (!st.alive) return;
      st.raf = requestAnimationFrame(loop);
      var dt = Math.min(0.25, (now - last) / 1000); last = now;
      if (st.ty != null) { st.yaw += (st.ty - st.yaw) * Math.min(1, dt * 5); st.pitch += (st.tp - st.pitch) * Math.min(1, dt * 5); if (Math.abs(st.ty - st.yaw) < 0.002) { st.ty = null; } }
      else if (!st.drag) { st.yaw += st.vy * dt; st.vy *= Math.pow(0.05, dt); st.idle += dt; if (st.idle > 3 && !reduce) st.yaw += dt * 0.12; }
      st.pitch = Math.max(-1.2, Math.min(1.2, st.pitch));
      ball.rotation.set(st.pitch, st.yaw, 0, 'XYZ'); halo.rotation.copy(ball.rotation);
      var fit = 1.08 / (Math.tan(cm.fov * Math.PI / 360) * Math.min(1, cm.aspect));
      cm.position.set(0, 0, fit * st.zoom / 3.6); cm.lookAt(0, 0, 0);
      Rg.render(sc, cm);
    }
    function pickAt(cx, cy) {
      var r = cv.getBoundingClientRect(), v2 = new THREE.Vector2((cx - r.left) / r.width * 2 - 1, -((cy - r.top) / r.height) * 2 + 1), rc = new THREE.Raycaster();
      rc.setFromCamera(v2, cm); var hit = rc.intersectObject(ball)[0];
      if (!hit || !hit.uv) { if (onPick) onPick(null); return; }
      var lon = hit.uv.x * 360 - 180, lat = (hit.uv.y - 0.5) * 180;
      if (onPick) onPick(countryAt(lat, lon), lat, lon);
    }
    cv.addEventListener('pointerdown', function (e) { st.drag = { x: e.clientX, y: e.clientY, id: e.pointerId }; st.moved = 0; st.ty = null; st.idle = 0; try { cv.setPointerCapture(e.pointerId); } catch (err) { /* facultatif */ } });
    cv.addEventListener('pointermove', function (e) {
      if (!st.drag || e.pointerId !== st.drag.id) return;
      var dx = e.clientX - st.drag.x, dy = e.clientY - st.drag.y; st.drag.x = e.clientX; st.drag.y = e.clientY; st.moved += Math.abs(dx) + Math.abs(dy);
      var k = 0.006 * st.zoom / 3.6; st.yaw += dx * k; st.pitch += dy * k; st.vy = dx * k / 0.016;
    });
    function up(e) { if (!st.drag) return; var d = st.drag; st.drag = null; if (st.moved < 6) { st.vy = 0; pickAt(e.clientX, e.clientY); } }
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', function () { st.drag = null; });
    cv.addEventListener('wheel', function (e) { e.preventDefault(); st.zoom = Math.max(1.9, Math.min(5, st.zoom * (e.deltaY > 0 ? 1.1 : 0.9))); st.idle = 0; }, { passive: false });
    size(); st.raf = requestAnimationFrame(loop);
    return {
      set: function (info) { var x = mc.getContext('2d'); drawWorld(x, mc.width, mc.height, info); tex.needsUpdate = true; },
      focus: lookAt, resize: size, state: function () { return st; },
      zoom: function (f) { st.zoom = Math.max(1.9, Math.min(5, st.zoom * f)); },
      dispose: function () { st.alive = false; cancelAnimationFrame(st.raf); tex.dispose(); ball.geometry.dispose(); halo.geometry.dispose(); Rg.dispose(); }
    };
  };
  S3.countryAt = countryAt;
  S3.PLACES = PLACES;
  S3._person = person; S3._animate = animatePerson; // tests
  S3._dbg = function () { return { OUT: OUT, world: world, scene: scene, R: R, PT: PT, roomG: roomG, staffG: staffG, itemsG: itemsG }; };
  S3._cam = function () { return { zoom: cam.zoom, fit: cam.fit, yaw: cam.yaw, pitch: cam.pitch, ins: ins, place: cur.placeKey }; };
  S3._view = function (o) { if (o.zoom) cam.zoom = o.zoom; if (o.yaw != null) cam.yaw = cam.yawBase + o.yaw; if (o.pitch) cam.pitch = o.pitch; if (o.pan) cam.pan.set(o.pan[0], 0, o.pan[1]); applyCam(); };
  S3._info = function () { var n = 0, tri = 0; if (OUT.g) OUT.g.traverse(function (o) { if (o.isMesh) { n++; tri += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3 * (o.isInstancedMesh ? o.count : 1); } }); var fa = 0; if (PT) for (var i = 0; i < PT.NF; i++) if (PT.fv[i * 4 + 3] > 0) fa++; return { outMeshes: n, outTris: Math.round(tri), calls: R.info.render.calls, tris: R.info.render.triangles, fw: !!OUT.fw, fwAlive: fa, fwVis: PT && PT.fw.visible }; };
  // Tests: boîtes englobantes des objets posés (décor, équipements, bureaux) pour repérer les collisions.
  S3._boxes = function () {
    var out = [], def = cur.def;
    function add(o, name) {
      var b = new THREE.Box3().setFromObject(o);
      if (b.isEmpty()) return;
      var sx = b.max.x - b.min.x, sz = b.max.z - b.min.z, sy = b.max.y - b.min.y;
      if (sy < 0.06 || sx > def.W * 0.8 || sz > def.D * 0.8) return; // tapis, sol, murs, plinthes
      out.push({ n: name, x0: +b.min.x.toFixed(2), x1: +b.max.x.toFixed(2), y0: +b.min.y.toFixed(2), y1: +b.max.y.toFixed(2), z0: +b.min.z.toFixed(2), z1: +b.max.z.toFixed(2) });
    }
    roomG.updateMatrixWorld(true); world.updateMatrixWorld(true);
    roomG.children.forEach(function (o, i) { if (o.isLight) return; add(o, o.name || ('decor' + i + (o.isMesh ? '' : '[g]'))); });
    Object.keys(itemNodes).forEach(function (id) { if (!itemNodes[id].userData.ghost && id !== 'traitement') add(itemNodes[id], 'item:' + id); });
    deskNodes.forEach(function (d, i) { add(d, 'poste' + i); });
    Object.keys(staffNodes).forEach(function (id) { var n = staffNodes[id]; if (n.cur && n.cur.userData.p.mode === 'rest') add(n.cur, 'repos' + id); });
    Object.keys(staffNodes).forEach(function (id) { var n = staffNodes[id]; if (n.cur && n.cur.userData.p.mode === 'train') add(n.cur, 'formation' + id); });
    Object.keys(artistNodes).forEach(function (id) { add(artistNodes[id].g, 'artiste:' + id); });
    if (souvG) souvG.children.forEach(function (o, i) { add(o, o.name + i); });
    return out;
  };
  S3.screenOf = function (kind, id) {
    if (!S3.ok) return null;
    var p = null;
    if (kind === 'item' && itemNodes[id]) p = itemNodes[id].getWorldPosition(new V3());
    if (kind === 'staff' && staffNodes[id]) p = staffNodes[id].anchor.clone();
    if (kind === 'artist' && artistNodes[id]) p = artistNodes[id].anchor.clone();
    if (kind === 'player' && player) p = new V3(player.position.x, 1.5, player.position.z);
    if (kind === 'out' && OUT.inter[id]) { p = OUT.inter[id].getWorldPosition(new V3()); p.y += id === 'tree' ? 2.2 : id === 'cat' ? 0.25 : 0.6; }
    if (!p) return null;
    p.project(camera);
    var r = canvas.getBoundingClientRect();
    return { x: r.left + (p.x + 1) / 2 * r.width, y: r.top + (1 - p.y) / 2 * r.height };
  };
  root.Scene3D = S3;
})(typeof window !== 'undefined' ? window : globalThis);
