// Music Studio Tycoon : service worker limité à /music-studio-tycoon/ (il ne touche pas aux autres applis du domaine).
// Réseau d'abord (les mises à jour arrivent tout de suite), copie locale si le téléphone est hors ligne.
var CACHE = 'music-studio-tycoon-v2';
var CORE = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png'];
self.addEventListener('install', function (e) {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(CORE); }).catch(function () {}));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return (k.indexOf('premier-mix-') === 0 || k.indexOf('music-studio-tycoon-') === 0) && k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var r = e.request; if (r.method !== 'GET') return;
  var u = new URL(r.url);
  if (u.origin === location.origin) {
    if (u.pathname.indexOf('/music-studio-tycoon/') !== 0) return;
    e.respondWith(fetch(r).then(function (res) {
      if (res.ok) { var cp = res.clone(); caches.open(CACHE).then(function (c) { c.put(r, cp); }); }
      return res;
    }).catch(function () {
      return caches.match(r, { ignoreSearch: true }).then(function (m) { return m || (r.mode === 'navigate' ? caches.match('./index.html') : Response.error()); });
    }));
  } else if (/^fonts\.(googleapis|gstatic)\.com$/.test(u.hostname)) { // polices: copie locale, rafraîchie en arrière-plan
    e.respondWith(caches.match(r).then(function (m) {
      var net = fetch(r).then(function (res) { var cp = res.clone(); caches.open(CACHE).then(function (c) { c.put(r, cp); }); return res; }).catch(function () { return m || Response.error(); });
      return m || net;
    }));
  }
});
