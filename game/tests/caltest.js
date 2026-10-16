// Calendrier de carrière, climat, fêtes et interactions du jardin.
var D = require('../data.js'), G = require('../engine.js');
var fails = 0;
function ok(name, c, info) { console.log((c ? 'ok   ' : 'FAIL ') + name + (info !== undefined ? ' | ' + info : '')); if (!c) fails++; }
var DAY = D.CAL.day;
// partie créée le 15 janvier 2027 à 10 h
var t0 = new Date(2027, 0, 15, 10, 0, 0).getTime();
var S = G.newState(t0);
ok('jour 1 = date de création', G.calendar(S).day === 1 && G.calendar(S).text === '15 janvier 2027', G.calendar(S).text);
G.advance(S, DAY * 3.5);
ok('les jours suivent le temps du jeu', G.calendar(S).day === 4 && G.calendar(S).text === '18 janvier 2027', G.calendar(S).text);
ok('une semaine du Top 50 = 7 jours', Math.abs(DAY * 7 - D.TUNING.weekLen) < 1e-9);
// absence: le calendrier suit le temps réel écoulé
var S2 = G.newState(t0); S2.savedAt = t0; S2.owned = { laptop: 1 }; S2.acts.beat.auto = true; S2.acts.beat.run = true;
var r = G.offline(S2, t0 + 3600 * 1000);
ok('absence d’1 h: le calendrier n’avance que de 3 jours', Math.abs(S2.cal.d - D.CAL.awayDays) < 1e-9, S2.cal.d.toFixed(2));
ok('absence: les gains se cumulent toujours', r && r.gain > 0 && r.days <= D.CAL.awayDays, r && r.days);
var S2b = G.newState(t0); S2b.cal.d = 10; S2b._off = 1; for (var q = 0; q < 50; q++) G.advance(S2b, 60); delete S2b._off;
ok('jeu en arrière-plan: plafond sur toute l’absence', Math.abs(S2b.cal.d - 13) < 1e-9, S2b.cal.d);
G.advance(S2b, DAY * 2);
ok('retour au jeu: les jours reprennent leur rythme', Math.abs(S2b.cal.d - 15) < 1e-9 && S2b.cal.ad === 0, S2b.cal.d);
var short = G.newState(t0); short._off = 1; G.advance(short, DAY * 1.5); delete short._off;
ok('courte absence: le temps réel compte', Math.abs(short.cal.d - 1.5) < 1e-9, short.cal.d);
var legacy = JSON.parse(JSON.stringify(G.newState(Date.now() - 5 * 864e5))); legacy.cal.d = 900; delete legacy.cal.v;
ok('anciennes parties: date ramenée aux jours réels depuis le premier lancement', Math.abs(G.hydrate(legacy, Date.now()).cal.d - 5) < 0.01);
// saisons en France
function at(k, y, m, d, hour) { var s = G.newState(new Date(y, 0, 1, 12).getTime()); s.world.home = k; var c = new Date(y, m - 1, d, 12); s.cal.d = Math.round((c - new Date(y, 0, 1, 12)) / 864e5) + (hour || 0.5); return G.env(s); }
var jan = at('fr', 2027, 1, 18), jul = at('fr', 2027, 7, 15), oct = at('fr', 2027, 10, 25), apr = at('fr', 2027, 4, 20);
ok('France: hiver en janvier, feuilles tombées', jan.season.id === 'hiver' && jan.leaf < 0.05, jan.season.id + ' ' + jan.leaf.toFixed(2));
ok('France: neige possible au cœur de l’hiver', jan.snow > 0.2, jan.snow.toFixed(2));
ok('France: pas de neige en juillet', jul.snow === 0 && jul.leaf > 0.95 && jul.season.id === 'ete', jul.snow + ' ' + jul.leaf.toFixed(2));
ok('France: couleurs d’automne fin octobre', oct.fall > 0.7 && oct.leaf > 0.1 && oct.leaf < 0.9, oct.fall.toFixed(2) + ' ' + oct.leaf.toFixed(2));
ok('France: bourgeons au printemps', apr.leaf > 0.3 && apr.leaf < 0.95 && apr.fresh > 0.8, apr.leaf.toFixed(2));
ok('France: pas de neige en novembre', at('fr', 2027, 11, 10).snow < 0.05);
// Allemagne et États-Unis plus enneigés que le Royaume-Uni
function snowDays(k) { var n = 0; for (var d = 0; d < 365; d++) { var s = G.newState(new Date(2027, 0, 1, 12).getTime()); s.world.home = k; s.cal.d = d + 0.5; if (G.env(s).snow > 0.3) n++; } return n; }
var sd = { fr: snowDays('fr'), uk: snowDays('uk'), us: snowDays('us'), de: snowDays('de'), jp: snowDays('jp'), br: snowDays('br'), ng: snowDays('ng') };
ok('jours de neige: US/DE > FR > UK, rien sous les tropiques', sd.us > sd.fr && sd.de > sd.fr && sd.fr >= sd.uk && sd.br === 0 && sd.ng === 0, JSON.stringify(sd));
ok('neige limitée à l’hiver fort en France', sd.fr > 10 && sd.fr < 80, sd.fr);
// Japon: cerisiers en fleurs début avril
ok('Japon: cerisiers en fleurs début avril', at('jp', 2027, 4, 2).blossom > 0.8, at('jp', 2027, 4, 2).blossom.toFixed(2));
ok('Japon: pas de fleurs en juin', at('jp', 2027, 6, 10).blossom === 0);
// Brésil: hémisphère sud, tropical
ok('Brésil: été en janvier, jamais de neige', at('br', 2027, 1, 15).season.id === 'ete' && at('br', 2027, 7, 15).season.id === 'hiver' && at('br', 2027, 7, 15).snow === 0);
ok('Nigeria: harmattan en janvier, pluies en juin', at('ng', 2027, 1, 10).season.id === 'harmattan' && at('ng', 2027, 1, 10).haze > 0.4 && at('ng', 2027, 6, 15).season.id === 'pluies');
// météo déterministe et variée
var rain = 0, snow = 0, s3 = G.newState(new Date(2027, 0, 1, 12).getTime());
for (var d = 0; d < 365; d++) { var w = G.weatherDay(s3, 'fr', d); if (w.wet && !w.snow) rain++; if (w.snow) snow++; }
ok('France: ~100 jours de pluie, quelques jours de neige', rain > 60 && rain < 140 && snow >= 1 && snow < 25, rain + ' / ' + snow);
ok('météo déterministe', JSON.stringify(G.weatherDay(s3, 'fr', 42)) === JSON.stringify(G.weatherDay(s3, 'fr', 42)));
// continuité: pas de saut brutal d'un instant à l'autre
var prev = null, jump = 0, s4 = G.newState(new Date(2027, 0, 1, 12).getTime());
for (var x = 0; x < 365 * 20; x++) { s4.cal.d = x / 20; var e = G.env(s4); if (prev) jump = Math.max(jump, Math.abs(e.leaf - prev.leaf), Math.abs(e.snow - prev.snow), Math.abs(e.cloud - prev.cloud)); prev = e; }
ok('évolution fluide (variation max par 1/20 de jour)', jump < 0.2, jump.toFixed(3));
// fêtes
var fd = at('fr', 2027, 6, 21);
ok('Fête de la musique le 21 juin', fd.fests.indexOf('fdlm') >= 0);
var S5 = G.newState(new Date(2027, 5, 21, 12).getTime()); S5.acts.beat.lvl = 1;
var p1 = G.payout(S5, G.ACT_BY.beat); S5.cal.d = 30; G.touch(S5); var p2 = G.payout(S5, G.ACT_BY.beat);
ok('Fête de la musique: gains ×1,5', Math.abs(p1 / p2 - 1.5) < 1e-6, (p1 / p2).toFixed(3));
ok('14 juillet en France seulement', at('fr', 2027, 7, 14).fests.indexOf('quatorze') >= 0 && at('de', 2027, 7, 14).fests.indexOf('quatorze') < 0);
ok('Noël et Nouvel An', at('fr', 2027, 12, 31).fests.indexOf('noel') >= 0 && at('fr', 2027, 12, 31).fests.indexOf('nouvelan') >= 0 && at('fr', 2028, 1, 3).fests.indexOf('noel') >= 0);
// interactions du jardin
var S6 = G.newState(t0); S6.level = 3; S6.money = 0;
ok('boîte aux lettres vide au départ', !G.outdoorState(S6).mail);
G.advance(S6, D.CAL.out.mail.every + 1);
ok('courrier des fans après 5 min', G.outdoorState(S6).mail);
var m0 = S6.money, rm = G.outdoor(S6, 'mail');
ok('lire le courrier rapporte', rm && rm.text && S6.money > m0 && !G.outdoorState(S6).mail, rm && rm.from);
var rt = G.outdoor(S6, 'tree');
ok('secouer l’arbre donne de l’expertise puis attend', rt && rt.rewards[0].k === 'xp' && G.outdoor(S6, 'tree') === null);
var rc = G.outdoor(S6, 'cat');
ok('caresser le chat sans équipe rapporte un peu', rc && rc.rewards[0].k === 'cash' && G.outdoor(S6, 'cat') === null);
var S7 = G.newState(new Date(2027, 0, 1, 12).getTime()); S7.world.home = 'de';
var bestD = 0, bestS = 0; for (var q = 0; q < 60; q++) { S7.cal.d = q + 0.5; var sn = G.env(S7).snow; if (sn > bestS) { bestS = sn; bestD = q + 0.5; } }
S7.cal.d = bestD;
ok('bonhomme de neige possible en hiver allemand', G.outdoorState(S7).snowman === 'build', bestS.toFixed(2));
G.outdoor(S7, 'snowman'); G.outdoor(S7, 'snowman'); var r3 = G.outdoor(S7, 'snowman');
ok('bonhomme fini: boost', r3 && r3.done && S7.boost.left > 0 && G.outdoorState(S7).snowman === 'done');
// sauvegarde / chargement
var S8 = G.hydrate(JSON.parse(JSON.stringify(S7)), Date.now());
ok('calendrier sauvegardé', Math.abs(S8.cal.d - S7.cal.d) < 1e-9 && S8.cal.sm === 3);
var old = JSON.parse(JSON.stringify(S7)); delete old.cal; old.charts.week = 11; old.charts.left = D.TUNING.weekLen / 2;
var S9 = G.hydrate(old, Date.now());
ok('anciennes sauvegardes: jours déduits des semaines du Top 50 (sans dépasser le temps réel)', Math.abs(S9.cal.d - Math.min(73.5, Math.max(0, (Date.now() - S9.created) / 864e5))) < 0.01, S9.cal.d);
// tournée mondiale: le temps passe
var S10 = G.newState(t0); S10.lifetime = 1e15; S10.cal.d = 10;
var tr = G.tour(S10, Date.now(), 'fr');
ok('la tournée mondiale fait avancer le calendrier', tr && tr.days >= 14 && S10.cal.d === 10 + tr.days, tr && tr.days);
console.log(fails ? fails + ' échec(s)' : 'tout est bon');
process.exit(fails ? 1 : 0);
