/* Premier Mix: données et réglages d'équilibrage. */
(function (root) {
  'use strict';

  var TUNING = {
    roy: 0.0004,        // royalties par seconde et par titre, en fraction du gain de base
    trackExp: 0.9,      // rendements décroissants du catalogue
    valueExp: 0.2,      // bonus de la valeur du studio: (V / 400) ^ valueExp
    levelBonus: 0.04,   // bonus de gains par niveau d'expertise
    xpBase: 30,         // expérience pour passer du niveau 1 au niveau 2
    xpGrowth: 1.55,     // croissance de l'expérience requise
    upGain: 0.15,       // gain de base ajouté par niveau de perfectionnement
    upGrowth: 1.3,      // croissance du prix de perfectionnement
    offlineCap: 6 * 3600,
    offlineEff: 0.5,
    tap: 0.4,
    fameBase: 3.5e7,    // gains cumulés qui donnent 1 point de renommée
    fameExp: 1 / 3,     // points = (gains cumulés / fameBase) ^ fameExp
    fameBonus: 0.15,    // bonus de gains par point de renommée
    fameXp: 0.05,       // bonus d'expertise par point de renommée
    fameMin: 8,         // points minimum pour pouvoir partir en tournée
    trophyBonus: 0.01,  // bonus de gains par trophée du palmarès
    eventFirst: 180,    // secondes avant la première sortie de studio
    eventMin: 300,      // délai minimal entre deux invitations
    eventMax: 660,      // délai maximal
    eventWindow: 120,   // durée pendant laquelle une invitation reste disponible
    eventFloor: 6,      // plancher des récompenses en argent: n productions de la meilleure voie
    contactBonus: 0.02, // bonus de gains définitif par contact
    // Équipe du studio
    teamLevel: 3,       // niveau d'expertise pour recruter
    teamCap: [1, 1, 2, 3, 5, 6, 8], // postes de travail par palier du studio
    poolSize: 3,        // candidats proposés
    poolEvery: 240,     // renouvellement automatique des candidats (s)
    poolRefreshSec: 60, // prix d'un renouvellement immédiat, en secondes de revenu
    salaryShare: 0.012, // salaire par étoile, en part du revenu du studio à l'embauche
    salaryMin: 0.02,    // salaire minimal (€/s)
    signSec: 240,       // prime d'embauche, en secondes de salaire
    trainSec: 900,      // prix d'une formation, en secondes de salaire par niveau visé
    trainTime: 40,      // durée d'une formation, en secondes par niveau visé
    staffMaxLvl: 10,
    staffXpBase: 120,   // secondes de travail pour passer du niveau 1 au niveau 2
    staffXpGrowth: 1.6,
    raise: 1.12,        // augmentation de salaire à chaque niveau
    moraleDecay: 100 / 2400, // perte de moral par seconde de travail
    moraleRest: 0.05,   // regain de moral par seconde sans affectation
    moraleUnpaid: 0.5,  // perte supplémentaire par seconde quand le salaire n'est pas payé
    moraleOffline: 25,  // plancher du moral pendant l'absence du joueur (ancien réglage)
    awayRest: 10800,    // absence: l'équipe se repose, son moral remonte de 0 à 100 % en awayRest secondes
    bonusSec: 300,      // prix d'une prime, en secondes de salaire
    bonusMorale: 35,
    restTime: 90,       // durée des vacances (s)
    leaveAfter: 120,    // secondes à moral nul avant de démissionner
    staffSpeedStar: 0.04, staffSpeedLvl: 0.03, staffGainStar: 0.08, staffGainLvl: 0.06, offRole: 0.5,
    // Mini-jeu de mixage
    mixMax: 1,          // un mix parfait double les gains de la production mixée
    mixXp: 0.5,         // et ajoute jusqu'à 50 % d'expertise
    mastersMax: 5,      // titres mixés prêts à sortir
    // Commandes clients
    orderLevel: 2, orderEvery: 150, orderFirst: 40, orderOfferLife: 300, orderMaxOffers: 3, orderMaxActive: 2,
    orderTimeMin: 60, orderTimeMax: 150, orderDeadlineK: 2.5, orderRewardBase: 1.5, orderRewardQ: 0.5,
    repWin: 4, repLose: 6, repMax: 100,
    // Top 50
    chartLevel: 4, weekLen: 180, chartSize: 50, chartPaySec: 90, promoSec: 120, promoMult: 1.4, chartDecay: 0.85,
    // Recherche
    rpPer: 0.6,         // points par production terminée, multipliés par le rang de la production (1 à 11)
    rpMix: 6,           // points par étoile d'un mix
    rpOrder: 25,        // points par commande livrée (multipliés par la qualité demandée)
    rpChart: 0.5,       // points par place au-dessus de la 51e, chaque semaine, pour chaque titre classé
    // Projets de création (bonus facultatif)
    projLevel: 5, projCostSec: 90, projRefund: 0.5, rpProj: 12, projXp: 4,
    // Clash de beatmakers (mini-jeu de rythme)
    battleLevel: 3, battleFirst: 45, battleEvery: 210, battleUp: 3, battleBars: 8, battlePerfect: 0.07, battleGood: 0.14,
    // Atelier piano: une inspiration récompensée toutes les pianoEvery secondes de jeu
    pianoEvery: 240,
    // Tendances de la semaine (une par semaine du Top 50)
    // Label: artistes signés et cycle d'album
    labelLevel: 6, artistSignSec: 240, askEvery: 420, askFirst: 90, askLife: 600, labelFame: 0.0006,
    concertEvery: 300, concertGood: 0.65, storyEvery: 540, storyFirst: 200, storyLife: 600,
    // Labels rivaux: une offre pour un artiste assez connu (offerFame), à trancher avant offerLife secondes; un artiste parti revient sur le marché après goneFor
    offerFirst: 360, offerEvery: 720, offerLife: 300, offerFame: 30, goneFor: 1800,
    trendAct: 1.25, trendOrder: 0.4, trendOrderReward: 1.3, trendGenre: 0.6, trendMood: 0.4, trendSales: 1.3
  };

  // dur: secondes, pay: euros, xp: points d'expertise
  var ACTS = [
    { id: 'beat', name: 'Composer un beat', desc: 'Un beat fait sur ton portable, vendu sur une marketplace.',
      dur: 4, pay: 5, xp: 2, reqLvl: 1, reqItem: null, upCost: 15, autoCost: 150, autoRole: 'Un stagiaire motivé' },
    { id: 'mix', name: 'Mixer un morceau', desc: 'Un rappeur du quartier t’envoie ses pistes à mixer.',
      dur: 7, pay: 17, xp: 4, reqLvl: 2, reqItem: 'casque', upCost: 50, autoCost: 500, autoRole: 'Un assistant mixage' },
    { id: 'voix', name: 'Enregistrer une voix', desc: 'Une chanteuse vient poser sa voix sur ton micro.',
      dur: 10, pay: 50, xp: 8, reqLvl: 4, reqItem: 'micro', upCost: 150, autoCost: 2600, autoRole: 'Un ingé son junior' },
    { id: 'single', name: 'Produire un single', desc: 'Composition, prise de voix, mixage. Le morceau sort sur les plateformes.',
      dur: 14, pay: 140, xp: 16, reqLvl: 6, reqItem: 'interface', upCost: 420, autoCost: 17000, autoRole: 'Un réalisateur artistique' },
    { id: 'ep', name: 'Réaliser un EP', desc: 'Cinq titres pour un groupe qui commence à faire parler de lui.',
      dur: 20, pay: 400, xp: 36, reqLvl: 9, reqItem: 'moniteurs', upCost: 1700, autoCost: 120000, autoRole: 'Une cheffe de projet' },
    { id: 'album', name: 'Enregistrer un album', desc: 'Des semaines de studio pour un artiste signé en indépendant.',
      dur: 28, pay: 1120, xp: 80, reqLvl: 12, reqItem: 'traitement', upCost: 8100, autoCost: 840000, autoRole: 'Un ingé son confirmé' },
    { id: 'bo', name: 'Composer une BO', desc: 'Musique de pub, de série ou de film. Le cachet est confortable.',
      dur: 40, pay: 3200, xp: 180, reqLvl: 15, reqItem: 'console', upCost: 38000, autoCost: 6000000, autoRole: 'Un compositeur associé' },
    { id: 'live', name: 'Capter une session live', desc: 'Un groupe entier joue en direct dans ta cabine.',
      dur: 55, pay: 8800, xp: 400, reqLvl: 17, reqItem: 'cabine', upCost: 180000, autoCost: 41000000, autoRole: 'Un preneur de son live' },
    { id: 'mastering', name: 'Masteriser pour un label', desc: 'Les majors t’envoient leurs albums pour la touche finale.',
      dur: 75, pay: 24000, xp: 900, reqLvl: 20, reqItem: 'mastering', upCost: 790000, autoCost: 300000000, autoRole: 'Un ingé mastering' },
    { id: 'star', name: 'Produire un album de star', desc: 'Une tête d’affiche réserve ta grande salle pour six mois.',
      dur: 100, pay: 64000, xp: 2000, reqLvl: 23, reqItem: 'studioA', upCost: 3400000, autoCost: 2100000000, autoRole: 'Un directeur de studio' },
    { id: 'hit', name: 'Signer un hit mondial', desc: 'Numéro un dans quarante pays. Le téléphone ne s’arrête plus.',
      dur: 130, pay: 166000, xp: 4500, reqLvl: 26, reqItem: 'neve', upCost: 14000000, autoCost: 15000000000, autoRole: 'Un bureau de production' }
  ];

  // kind: gear (matériel) ou soft (logiciels et contrats)
  // fx: gain (tous les gains), speed (vitesse), xp, roy (royalties), act { id: multiplicateur }
  var ITEMS = [
    { id: 'laptop', kind: 'gear', name: 'Ordinateur portable', desc: 'Là où tout commence.', cost: 0, value: 400, hidden: true },
    { id: 'casque', kind: 'gear', name: 'Casque fermé', desc: 'Tu entends enfin ce que tu mixes.', cost: 60, unlock: 'mix' },
    { id: 'daw', kind: 'soft', name: 'Logiciel de production (DAW)', desc: 'Raccourcis, pistes illimitées. Tout va 15 % plus vite.', cost: 250, fx: { speed: 1.15 } },
    { id: 'micro', kind: 'gear', name: 'Micro à condensateur', desc: 'Les voix sonnent enfin comme un disque.', cost: 300, unlock: 'voix' },
    { id: 'clavier', kind: 'gear', name: 'Clavier maître MIDI', desc: 'Les beats rapportent 60 % de plus.', cost: 600, fx: { act: { beat: 1.6 } } },
    { id: 'interface', kind: 'gear', name: 'Interface audio', desc: 'Entrées propres, latence nulle.', cost: 1700, unlock: 'single' },
    { id: 'samples', kind: 'soft', name: 'Banque de samples', desc: 'Les beats rapportent 50 % de plus.', cost: 2400, fx: { act: { beat: 1.5 } } },
    { id: 'formation', kind: 'soft', name: 'Formation en mixage', desc: 'L’expertise vient 50 % plus vite.', cost: 10000, fx: { xp: 1.5 } },
    { id: 'moniteurs', kind: 'gear', name: 'Enceintes de monitoring', desc: 'Un son fidèle, des EP qui tiennent la route.', cost: 14000, unlock: 'ep' },
    { id: 'distrib', kind: 'soft', name: 'Distribution numérique', desc: 'Tes titres sont partout. Royalties ×2.', cost: 29000, fx: { roy: 2 } },
    { id: 'traitement', kind: 'gear', name: 'Traitement acoustique', desc: 'Pièce traitée, albums possibles. Expertise +20 %.', cost: 120000, unlock: 'album', fx: { xp: 1.2 } },
    { id: 'plugins', kind: 'soft', name: 'Plugins haut de gamme', desc: 'Tous les gains augmentent de 30 %.', cost: 160000, fx: { gain: 1.3 } },
    { id: 'preamps', kind: 'gear', name: 'Préamplis à lampes', desc: 'Voix et singles rapportent 50 % de plus.', cost: 330000, fx: { act: { voix: 1.5, single: 1.5 } } },
    { id: 'console', kind: 'gear', name: 'Console analogique', desc: 'Seize voies, un son de disque. Les BO deviennent possibles.', cost: 920000, unlock: 'bo' },
    { id: 'playlists', kind: 'soft', name: 'Playlists éditoriales', desc: 'Tes titres passent en boucle. Royalties ×2.', cost: 2400000, fx: { roy: 2 } },
    { id: 'cabine', kind: 'gear', name: 'Cabine de prise de son', desc: 'Un groupe entier peut jouer en direct.', cost: 7400000, unlock: 'live' },
    { id: 'orchestre', kind: 'soft', name: 'Banque de sons orchestraux', desc: 'BO et sessions live rapportent deux fois plus.', cost: 19000000, fx: { act: { bo: 2, live: 2 } } },
    { id: 'mastering', kind: 'gear', name: 'Chaîne de mastering', desc: 'Convertisseurs de référence. Les labels frappent à ta porte.', cost: 61000000, unlock: 'mastering' },
    { id: 'assistant', kind: 'soft', name: 'Assistant de mastering', desc: 'Les tâches répétitives se font seules. Tout va 25 % plus vite.', cost: 120000000, fx: { speed: 1.25 } },
    { id: 'label', kind: 'soft', name: 'Contrat de distribution avec un label', desc: 'Royalties ×3 et gains +20 %.', cost: 210000000, fx: { roy: 3, gain: 1.2 } },
    { id: 'mentor', kind: 'soft', name: 'Mentor reconnu', desc: 'Il te recommande partout. Expertise ×2.', cost: 330000000, fx: { xp: 2 } },
    { id: 'studioA', kind: 'gear', name: 'Grande salle (Studio A)', desc: 'Cent mètres carrés, régie en verre. Les stars réservent.', cost: 600000000, unlock: 'star' },
    { id: 'management', kind: 'soft', name: 'Équipe de management', desc: 'Les meilleurs contrats viennent à toi. Gains ×1,5.', cost: 1700000000, fx: { gain: 1.5 } },
    { id: 'neve', kind: 'gear', name: 'Console légendaire', desc: 'Celle des disques que tout le monde connaît.', cost: 6000000000, unlock: 'hit' },
    { id: 'disques', kind: 'gear', name: 'Mur de disques d’or', desc: 'Il fait le tour du hall. Gains ×1,5.', cost: 29000000000, fx: { gain: 1.5 } }
  ];

  var TIERS = [
    { min: 0, name: 'Ta chambre', place: 'chambre' },
    { min: 1000, name: 'Chambre-studio', place: 'chambre' },
    { min: 20000, name: 'Le garage', place: 'garage' },
    { min: 500000, name: 'Local en ville', place: 'local' },
    { min: 15000000, name: 'Studio professionnel', place: 'pro' },
    { min: 400000000, name: 'Studio de référence', place: 'pro' },
    { min: 35000000000, name: 'Complexe légendaire', place: 'complexe' }
  ];


  // Sorties de studio: rencontres à choix. tiers = paliers de studio concernés (voir TIERS).
  // Récompenses (rw): cash x = minutes de revenu, xp x = part du niveau en cours, boost m/s = multiplicateur et secondes,
  // rank = un rang gratuit, tracks n = titres ajoutés au catalogue, contact = bonus définitif (une fois par rencontre).
  var EVENTS = [
    { id: 'rappeur', tiers: [0, 2], title: 'Le rappeur du café', contact: 'Kaïs, rappeur du quartier',
      intro: 'Au café du coin, un rappeur nommé Kaïs se bat avec un fichier audio qui sature. Il te reconnaît : « Tu fais des prods, toi, non ? »',
      choices: [
        { text: 'Écouter son morceau au casque et lui dire précisément ce qui sature',
          outcome: 'Il avait poussé le volume de la voix au maximum. Tu le baisses de trois décibels et tout respire. Kaïs en parle à tout le quartier.',
          rw: [{ k: 'contact' }, { k: 'cash', x: 1.5 }] },
        { text: 'Lui vendre un beat tout de suite, sans écouter ce qu’il fait',
          outcome: 'Il l’achète par politesse. Il ne s’en servira jamais, mais la vente est faite.',
          rw: [{ k: 'cash', x: 1 }] },
        { text: 'Lui laisser ta carte en disant que tu es pressé',
          outcome: 'Il ne rappellera pas. La carte finira au fond d’une poche.',
          rw: [{ k: 'xp', x: 0.15 }] }
      ] },
    { id: 'openmic', tiers: [0, 3], title: 'La soirée micro ouvert', contact: 'Inès, chanteuse',
      intro: 'Inès doit monter sur scène dans dix minutes quand la sono du bar rend l’âme. La salle commence à s’impatienter.',
      choices: [
        { text: 'Apporter ton interface et ton micro et monter une sono de secours',
          outcome: 'Ça tient. Le public croit à un choix artistique tant le son est chaud. Inès te doit une fière chandelle.',
          rw: [{ k: 'contact' }, { k: 'boost', m: 2, s: 90 }] },
        { text: 'Filmer la panne pour les réseaux',
          outcome: 'La vidéo fait un petit buzz. Inès, elle, ne te répond plus.',
          rw: [{ k: 'cash', x: 1 }] },
        { text: 'Lui conseiller d’annuler pour ne pas se griller',
          outcome: 'Elle reste sur sa déception. Pas de drame, mais pas d’histoire non plus.',
          rw: [{ k: 'xp', x: 0.15 }] }
      ] },
    { id: 'videgrenier', tiers: [0, 3], title: 'Le vide-grenier', contact: 'Gaston, brocanteur',
      intro: 'Sur un stand, un vieux synthétiseur recouvert de poussière est affiché à 40 €. Le vendeur ne semble pas savoir ce que c’est.',
      choices: [
        { text: 'Demander à le brancher et le tester avant de parler du prix',
          outcome: 'Les touches répondent, le son est superbe. Tu négocies à 30 €. C’est un modèle que les collectionneurs s’arrachent.',
          rw: [{ k: 'rank' }, { k: 'cash', x: 2 }] },
        { text: 'L’acheter tout de suite au prix affiché',
          outcome: 'Il fonctionne, au moins. Un peu cher pour ce que c’est.',
          rw: [{ k: 'cash', x: 0.6 }] },
        { text: 'Marchander à 10 € sans le tester',
          outcome: 'Le vendeur accepte. Une pédale est cassée, mais tu apprends à les réparer.',
          rw: [{ k: 'xp', x: 0.2 }] }
      ] },
    { id: 'radio', tiers: [1, 4], title: 'Le jingle de la radio locale', contact: 'Marc, directeur de radio',
      intro: 'Le directeur de la radio locale te rappelle. Il lui faut un jingle pour demain matin, sinon il perd un sponsor.',
      choices: [
        { text: 'Accepter et livrer la veille au soir deux versions à comparer',
          outcome: 'Il en retient une, et le sponsor en commande une seconde pour sa publicité.',
          rw: [{ k: 'contact' }, { k: 'tracks', n: 10 }, { k: 'cash', x: 1.5 }] },
        { text: 'Accepter, mais demander le double du prix pour l’urgence',
          outcome: 'Il paie, un peu agacé. Tu ne seras pas rappelé de sitôt.',
          rw: [{ k: 'cash', x: 1.5 }] },
        { text: 'Refuser, tu n’as pas le temps',
          outcome: 'Il trouve quelqu’un d’autre. Tu en profites pour te former.',
          rw: [{ k: 'xp', x: 0.15 }] }
      ] },
    { id: 'panne', tiers: [1, 5], title: 'Coupure de courant', contact: 'Salomé, chanteuse lyrique',
      intro: 'En pleine séance, le disjoncteur saute. La chanteuse venait de faire la meilleure prise de la journée.',
      choices: [
        { text: 'Sauvegarder la session sur batterie, puis couper proprement',
          outcome: 'La prise est sauvée. Salomé n’oubliera pas ton sang-froid, et tu as appris à toujours garder un onduleur sous la main.',
          rw: [{ k: 'contact' }, { k: 'xp', x: 0.4 }, { k: 'boost', m: 2, s: 60 }] },
        { text: 'Attendre que le courant revienne',
          outcome: 'Il revient vite, par chance. La session reprend sans dommage.',
          rw: [{ k: 'cash', x: 0.6 }] },
        { text: 'Rallumer tout de suite pour continuer',
          outcome: 'Un fichier est corrompu. Une leçon retenue, rien de plus.',
          rw: [{ k: 'xp', x: 0.1 }] }
      ] },
    { id: 'groupe', tiers: [2, 5], title: 'Le groupe mécontent', contact: 'Les Marées, groupe de rock',
      intro: 'Un groupe que tu as mixé le mois dernier t’écrit : leur morceau sonne mal sur les enceintes de leur voiture.',
      choices: [
        { text: 'L’écouter dans leur voiture, puis proposer une retouche gratuite',
          outcome: 'Les basses étaient trop présentes pour ce type d’enceintes. Ils repartent ravis et te recommandent à trois autres groupes.',
          rw: [{ k: 'contact' }, { k: 'tracks', n: 8 }] },
        { text: 'Les rembourser sans discuter',
          outcome: 'Ton nom reste propre, mais tu n’as rien appris sur leur problème.',
          rw: [{ k: 'cash', x: 0.6 }] },
        { text: 'Répondre que ton mixage était bon et que c’est leur voiture',
          outcome: 'Tu n’as pas tort. Ils ne reviendront pas pour autant.',
          rw: [{ k: 'xp', x: 0.2 }] }
      ] },
    { id: 'festival', tiers: [2, 5], title: 'Le régisseur du festival', contact: 'Hélène, régisseuse de festival',
      intro: 'Une régisseuse de festival cherche quelqu’un pour enregistrer les concerts. Elle hésite entre toi et un studio plus grand.',
      choices: [
        { text: 'Lui faire écouter une prise live réalisée dans ton studio',
          outcome: 'Elle reconnaît tout de suite le travail soigné. Elle t’engage pour les trois soirées.',
          rw: [{ k: 'contact' }, { k: 'boost', m: 3, s: 60 }, { k: 'xp', x: 0.3 }] },
        { text: 'Lui proposer un tarif cassé pour décrocher le contrat',
          outcome: 'Elle accepte, mais le tarif te colle à la peau pour les prochaines années.',
          rw: [{ k: 'cash', x: 1 }] },
        { text: 'Lui dire que tu es meilleur que l’autre studio',
          outcome: 'Elle sourit sans te croire. Tu n’as rien à lui montrer.',
          rw: [{ k: 'xp', x: 0.1 }] }
      ] },
    { id: 'artiste', tiers: [3, 6], title: 'Un grand nom au bar de l’hôtel', contact: 'Maya Lorent, chanteuse',
      intro: 'Après son concert, Maya Lorent, la chanteuse que tout le monde connaît, prend un verre seule au bar de l’hôtel où a lieu ton salon professionnel.',
      choices: [
        { text: 'Lui parler de ce qui t’a marqué dans la production de son dernier album, sans rien demander',
          outcome: 'Elle sourit : on lui parle toujours de ses paroles, jamais du travail de studio. Elle te laisse son numéro pour un futur projet.',
          rw: [{ k: 'contact' }, { k: 'cash', x: 3 }] },
        { text: 'Lui tendre ta démo tout de suite',
          outcome: 'Elle la prend avec politesse et la glisse dans son sac. Elle l’écoutera peut-être.',
          rw: [{ k: 'cash', x: 1.5 }] },
        { text: 'Lui demander un selfie',
          outcome: 'Elle accepte avec un sourire fatigué. La photo est réussie, c’est tout.',
          rw: [{ k: 'xp', x: 0.15 }] }
      ] },
    { id: 'label', tiers: [3, 6], title: 'Le directeur de label', contact: 'Victor Aubry, directeur de label',
      intro: 'Le directeur d’un label indépendant accepte de te recevoir dix minutes dans son bureau.',
      choices: [
        { text: 'Arriver avec les chiffres de ton catalogue et une proposition précise',
          outcome: 'Il n’a pas l’habitude qu’on lui apporte des chiffres. En quinze minutes, il t’ouvre le catalogue de ses artistes.',
          rw: [{ k: 'contact' }, { k: 'tracks', n: 25 }] },
        { text: 'Improviser en parlant de ta passion',
          outcome: 'Il est touché, mais il a un autre rendez-vous. Il te promet de te rappeler.',
          rw: [{ k: 'cash', x: 1.5 }] },
        { text: 'L’inviter dans un restaurant étoilé',
          outcome: 'Le dîner est excellent. L’addition aussi, et il ne parle pas de travail.',
          rw: [{ k: 'xp', x: 0.2 }] }
      ] },
    { id: 'star', tiers: [4, 6], title: 'La star change d’avis', contact: 'Leïla Noor, auteure-compositrice',
      intro: 'En pleine séance, la star que tu enregistres veut réécrire le refrain. Le planning est serré et l’ingénieur du son soupire.',
      choices: [
        { text: 'Enregistrer sa version et une alternative, puis laisser trancher à l’écoute',
          outcome: 'Elle choisit une troisième voie qui reprend les deux. Le refrain devient le tube de l’album.',
          rw: [{ k: 'contact' }, { k: 'boost', m: 3, s: 90 }, { k: 'rank' }] },
        { text: 'Tout refaire sans discuter',
          outcome: 'Elle est contente, toi épuisé. L’album sort en retard, mais il sort.',
          rw: [{ k: 'cash', x: 2 }] },
        { text: 'Refuser, le planning est le planning',
          outcome: 'Elle range ses affaires et revient le lendemain avec son manager.',
          rw: [{ k: 'xp', x: 0.15 }] }
      ] },
    { id: 'legende', tiers: [5, 6], title: 'La légende au téléphone', contact: 'Jean-Paul Sorel, producteur légendaire',
      intro: 'Un producteur à la retraite, dont tu possèdes tous les disques, t’appelle : il cherche un studio pour un dernier album.',
      choices: [
        { text: 'L’inviter à visiter la régie et à écouter ses vieilles bandes sur ton matériel',
          outcome: 'Il reste trois heures, en larmes devant ses propres bandes remastérisées. Il signe l’album chez toi.',
          rw: [{ k: 'contact' }, { k: 'cash', x: 4 }] },
        { text: 'Lui envoyer un devis détaillé par courriel',
          outcome: 'Il trouve le devis très pro. Il trouve aussi que ça manque de chaleur.',
          rw: [{ k: 'cash', x: 1.5 }] },
        { text: 'Lui demander s’il peut te présenter à ses contacts',
          outcome: 'Il rit, un peu froissé. Il te laisse tout de même deux numéros.',
          rw: [{ k: 'xp', x: 0.15 }] }
      ] },
    // ---- Nouvelles sorties : options sous condition (need), payantes (cost), risquées (risk) et suites d'histoires ----
    { id: 'cypher', tiers: [0, 2], title: 'Le cypher du parc', contact: 'Moussa, beatboxer',
      intro: 'Dans un parc, un cercle de rappeurs improvise. Le beatboxer s’essouffle et te lance un regard plein d’espoir.',
      choices: [
        { text: 'Prendre le relais avec un beat lancé depuis ton téléphone',
          outcome: 'Le cercle repart de plus belle. Moussa te serre la main : « On remet ça la semaine prochaine. »',
          rw: [{ k: 'contact' }, { k: 'xp', x: 0.2 }] },
        { text: 'Te lancer en beatbox sans jamais avoir essayé', risk: { p: 0.5,
          outcome: 'Tu postillonnes dans le micro. Le cercle te remercie poliment et passe à autre chose.', rw: [{ k: 'xp', x: 0.05 }] },
          outcome: 'Silence, puis une ovation : ton kick à la bouche est étonnamment propre. La vidéo tourne déjà.',
          rw: [{ k: 'contact' }, { k: 'boost', m: 2, s: 60 }] },
        { text: 'Enregistrer l’ambiance pour en faire des samples',
          outcome: 'Les voix, les rires et les claquements de mains font une banque de sons unique.',
          rw: [{ k: 'tracks', n: 5 }, { k: 'rp', x: 0.5 }] }
      ] },
    { id: 'disquaire', tiers: [0, 3], title: 'Le disquaire en liquidation', contact: 'Odile, disquaire',
      intro: 'Le disquaire de ton enfance ferme ses portes. Odile brade tout, y compris des caisses de vinyles jamais triées.',
      choices: [
        { text: 'Racheter un lot entier de vinyles rares pour les sampler', cost: 0.8,
          outcome: 'Des pépites oubliées, des breaks de batterie introuvables. Odile est ravie que ses disques revivent.',
          rw: [{ k: 'contact' }, { k: 'tracks', n: 15 }, { k: 'rp', x: 1 }] },
        { text: 'Aider Odile à inventorier le stock toute la journée',
          outcome: 'Elle te raconte quarante ans de musique, disque après disque. Tu repars avec une culture énorme.',
          rw: [{ k: 'contact' }, { k: 'xp', x: 0.25 }] },
        { text: 'Repartir avec un seul disque choisi au hasard',
          outcome: 'Un pressage original qui vaut trois fois son prix.',
          rw: [{ k: 'cash', x: 0.8 }] }
      ] },
    { id: 'voisin', tiers: [0, 1], title: 'Le voisin excédé', contact: 'M. Garnier, voisin',
      intro: 'Il est 23 h. Ton voisin tambourine à la porte : les basses traversent le mur de sa chambre.',
      choices: [
        { text: 'Lui proposer d’écouter le morceau au casque',
          outcome: 'Il hoche la tête, puis sourit : il jouait de la basse dans les années 80. Il passera t’en prêter une.',
          rw: [{ k: 'contact' }, { k: 'xp', x: 0.15 }] },
        { text: 'Baisser le son et continuer au casque',
          outcome: 'Le calme revenu, tu te concentres comme jamais.',
          rw: [{ k: 'boost', m: 1.5, s: 120 }] },
        { text: 'Faire semblant de ne pas entendre',
          outcome: 'Le syndic t’envoie un courrier. Tu perds la soirée à rédiger des excuses.',
          rw: [{ k: 'xp', x: 0.05 }] }
      ] },
    { id: 'concours', tiers: [0, 3], title: 'Le concours de remix', contact: 'Studio Pulse, organisateur',
      intro: 'Un concours de remix en ligne ferme ce soir à minuit. Le premier prix : une belle somme et une mise en avant.',
      choices: [
        { text: 'Envoyer un remix audacieux qui change tout le tempo', risk: { p: 0.4,
          outcome: 'Le jury trouve ça trop loin de l’original. Tu apprends beaucoup de leurs retours.', rw: [{ k: 'xp', x: 0.2 }] },
          outcome: 'Le jury adore la prise de risque : premier prix ! Studio Pulse veut retravailler avec toi.',
          rw: [{ k: 'contact' }, { k: 'cash', x: 3 }] },
        { text: 'Envoyer un remix fidèle et soigné',
          outcome: 'Troisième place, et une jolie mention sur leur page.',
          rw: [{ k: 'cash', x: 1 }, { k: 'rep', n: 3 }] },
        { text: 'Écouter les remix des autres pour apprendre',
          outcome: 'Tu notes des dizaines d’astuces de production.',
          rw: [{ k: 'rp', x: 1 }] }
      ] },
    { id: 'fan', tiers: [1, 6], title: 'La lettre d’un fan', contact: 'Théo, fan de la première heure',
      intro: 'Une lettre manuscrite arrive au studio. Théo raconte comment un de tes morceaux l’a aidé à traverser une année difficile.',
      choices: [
        { text: 'Lui répondre et l’inviter à visiter le studio',
          outcome: 'Théo passe une après-midi avec vous. L’équipe en parle encore le soir.',
          rw: [{ k: 'contact' }, { k: 'morale', n: 10 }, { k: 'boost', m: 1.5, s: 120 }] },
        { text: 'Partager sa lettre sur les réseaux, avec son accord',
          outcome: 'Des centaines de messages similaires affluent.',
          rw: [{ k: 'rep', n: 3 }] },
        { text: 'La ranger précieusement dans un tiroir',
          outcome: 'Tu la reliras les jours de doute.',
          rw: [{ k: 'xp', x: 0.05 }] }
      ] },
    { id: 'stagiaire', tiers: [1, 4], title: 'L’étudiante en son', contact: 'Romane, étudiante en son',
      intro: 'Romane, étudiante en école de son, cherche un stage. Elle a apporté un mix étonnamment propre.',
      choices: [
        { text: 'L’intégrer à une vraie session avec ton équipe', need: { staff: 1 },
          outcome: 'Elle pose mille questions et l’équipe adore transmettre. Tout le monde ressort motivé.',
          rw: [{ k: 'contact' }, { k: 'morale', n: 20 }, { k: 'xp', x: 0.1 }] },
        { text: 'La former toi-même pendant un après-midi',
          outcome: 'Expliquer ta méthode t’oblige à la clarifier. Tu progresses autant qu’elle.',
          rw: [{ k: 'contact' }, { k: 'xp', x: 0.2 }] },
        { text: 'Lui dire de repasser l’année prochaine',
          outcome: 'Elle trouvera un autre studio. Dommage.',
          rw: [{ k: 'xp', x: 0.05 }] }
      ] },
    { id: 'tendance', tiers: [1, 4], title: 'Le son qui tourne en boucle', contact: 'Léo, créateur de contenu',
      intro: 'Un créateur de vidéos te demande un son de quinze secondes pour lancer une tendance.',
      choices: [
        { text: 'Créer un gimmick absurde et entêtant', risk: { p: 0.55,
          outcome: 'La tendance ne prend pas. Léo te remercie quand même.', rw: [{ k: 'cash', x: 0.5 }] },
          outcome: 'Des millions de vidéos l’utilisent. Ton nom circule partout.',
          rw: [{ k: 'contact' }, { k: 'rep', n: 8 }, { k: 'boost', m: 3, s: 60 }] },
        { text: 'Livrer une boucle propre et passe-partout',
          outcome: 'Elle sert dans quelques vidéos. Un travail honnête, payé correctement.',
          rw: [{ k: 'cash', x: 1.2 }] },
        { text: 'Refuser : ce n’est pas ton style',
          outcome: 'Tu gardes ta ligne. Personne n’en saura rien.',
          rw: [{ k: 'xp', x: 0.1 }] }
      ] },
    { id: 'mariage', tiers: [1, 4], title: 'Le mariage sans DJ', contact: 'Claire et Yanis, jeunes mariés',
      intro: 'Un couple d’amis t’appelle en panique : leur DJ a annulé, la soirée commence dans deux heures.',
      choices: [
        { text: 'Installer tes enceintes et mixer toute la soirée', need: { item: 'moniteurs' },
          outcome: 'La piste ne désemplit pas jusqu’à l’aube. La moitié des invités te demandent ta carte.',
          rw: [{ k: 'contact' }, { k: 'cash', x: 2 }] },
        { text: 'Lancer une longue playlist depuis ton téléphone',
          outcome: 'Ça tient la soirée, sans plus.',
          rw: [{ k: 'cash', x: 0.8 }] },
        { text: 'Leur recommander un ami DJ',
          outcome: 'Ton ami assure. Il t’en doit une.',
          rw: [{ k: 'xp', x: 0.15 }] }
      ] },
    { id: 'chorale', tiers: [1, 5], title: 'La chorale du quartier', contact: 'La chorale Saint-Michel',
      intro: 'La chorale du quartier fête ses cinquante ans et rêve d’un vrai enregistrement.',
      choices: [
        { text: 'Les enregistrer dans ton studio avec ton micro', need: { item: 'micro' },
          outcome: 'Trente voix dans une pièce, un frisson à chaque prise. Le disque se vend à la sortie de la messe… et au-delà.',
          rw: [{ k: 'contact' }, { k: 'tracks', n: 10 }, { k: 'master', q: 3 }] },
        { text: 'Leur écrire un arrangement',
          outcome: 'Ils le chantent à leur concert anniversaire. Tu progresses en écriture vocale.',
          rw: [{ k: 'xp', x: 0.2 }] },
        { text: 'Les orienter vers une église à l’acoustique parfaite',
          outcome: 'Ils te remercient du conseil.',
          rw: [{ k: 'rep', n: 2 }] }
      ] },
    { id: 'rappeur2', tiers: [1, 5], need: { contact: 'rappeur' }, title: 'Kaïs revient', contact: 'Le crew de Kaïs',
      intro: 'Kaïs, le rappeur du café, a percé. Il débarque au studio : il veut que tu réalises son premier album.',
      choices: [
        { text: 'Avancer les frais de studio pour lui', cost: 1,
          outcome: 'L’album sort et cartonne. Kaïs te reverse une belle part et te remercie dans chaque interview.',
          rw: [{ k: 'contact' }, { k: 'cash', x: 3 }, { k: 'master', q: 4 }] },
        { text: 'Lui faire un tarif ami',
          outcome: 'L’album est solide. Le quartier sait qui l’a produit.',
          rw: [{ k: 'master', q: 3 }, { k: 'rep', n: 4 }] },
        { text: 'Le présenter à un autre producteur',
          outcome: 'Il comprend, mais il est déçu.',
          rw: [{ k: 'xp', x: 0.2 }] }
      ] },
    { id: 'pianiste', tiers: [2, 6], title: 'Le pianiste du métro', contact: 'Anatole, pianiste',
      intro: 'Dans un couloir du métro, un pianiste joue sur un vieux piano droit. Les passants s’arrêtent tous.',
      choices: [
        { text: 'Le présenter à ton compositeur', need: { role: 'compo' },
          outcome: 'Ils improvisent pendant des heures. Un thème naît dans la nuit.',
          rw: [{ k: 'contact' }, { k: 'master', q: 4 }, { k: 'morale', n: 10 }] },
        { text: 'L’enregistrer sur place avec ton micro', need: { item: 'micro' },
          outcome: 'La réverbération du couloir est magique. Tu tiens un son unique.',
          rw: [{ k: 'contact' }, { k: 'tracks', n: 15 }] },
        { text: 'Lui laisser un billet',
          outcome: 'Il te remercie d’un signe de tête sans s’arrêter de jouer.',
          rw: [{ k: 'xp', x: 0.1 }] }
      ] },
    { id: 'pub', tiers: [2, 5], title: 'La publicité télé', contact: 'Agence Lumen',
      intro: 'Une agence cherche une musique pour la publicité d’une grande marque. Le brief tient en une ligne : « Que ça reste en tête. »',
      choices: [
        { text: 'Composer un thème original sur mesure',
          outcome: 'Le client signe à la première écoute. L’agence te met sur sa liste.',
          rw: [{ k: 'contact' }, { k: 'cash', x: 2.5 }] },
        { text: 'Proposer de reprendre un classique', risk: { p: 0.6,
          outcome: 'Les droits sont refusés au dernier moment. L’agence paie quand même tes heures.', rw: [{ k: 'cash', x: 0.6 }] },
          outcome: 'Les droits passent, la pub est diffusée partout.',
          rw: [{ k: 'cash', x: 3 }, { k: 'rep', n: 3 }] },
        { text: 'Envoyer un morceau de ton catalogue',
          outcome: 'Ils le prennent en version courte.',
          rw: [{ k: 'cash', x: 1 }] }
      ] },
    { id: 'pirate', tiers: [2, 5], title: 'La radio pirate', contact: 'DJ Nox, radio pirate',
      intro: 'Une radio pirate émet chaque nuit depuis un toit. DJ Nox cherche des inédits pour son émission.',
      choices: [
        { text: 'Lui confier tes inédits', risk: { p: 0.6,
          outcome: 'Les inédits fuitent sur internet. Au moins, ça fait parler de toi.', rw: [{ k: 'tracks', n: 5 }] },
          outcome: 'L’émission devient culte et tes titres avec. Les auditeurs cherchent qui se cache derrière.',
          rw: [{ k: 'contact' }, { k: 'rep', n: 6 }] },
        { text: 'Animer une émission de nuit avec lui',
          outcome: 'Trois heures de direct, des appels d’auditeurs, une énergie folle.',
          rw: [{ k: 'contact' }, { k: 'xp', x: 0.25 }] },
        { text: 'Lui conseiller de passer en podcast',
          outcome: 'Il réfléchit. Tu y gagnes une discussion passionnante sur la diffusion.',
          rw: [{ k: 'rp', x: 1 }] }
      ] },
    { id: 'openmic2', tiers: [2, 5], need: { contact: 'openmic' }, title: 'La tournée d’Inès', contact: 'Les musiciens d’Inès',
      intro: 'Inès, la chanteuse du micro ouvert, part en tournée. Elle n’a pas oublié la sono de secours.',
      choices: [
        { text: 'Envoyer ton preneur de son assurer ses concerts', need: { role: 'preneur' },
          outcome: 'Chaque date sonne parfaitement. Ton preneur de son revient fier comme jamais.',
          rw: [{ k: 'contact' }, { k: 'rep', n: 6 }, { k: 'morale', n: 15 }] },
        { text: 'Enregistrer un concert en live',
          outcome: 'Un live brut et vibrant, prêt à sortir.',
          rw: [{ k: 'tracks', n: 20 }, { k: 'master', q: 3 }] },
        { text: 'Lui souhaiter bonne route',
          outcome: 'Elle t’enverra une carte postale de chaque ville.',
          rw: [{ k: 'xp', x: 0.15 }] }
      ] },
    { id: 'groupe2', tiers: [2, 5], need: { contact: 'groupe' }, title: 'Les Marées se déchirent', contact: 'Lou, chanteuse des Marées',
      intro: 'Le groupe que tu avais réconcilié avec son mix se dispute en pleine session. La chanteuse menace de partir en solo.',
      choices: [
        { text: 'Organiser une médiation autour d’une écoute',
          outcome: 'Réécouter leur premier titre ensemble apaise tout le monde. Le morceau suivant est le meilleur de leur carrière.',
          rw: [{ k: 'contact' }, { k: 'master', q: 4 }] },
        { text: 'Proposer à la chanteuse un projet solo',
          outcome: 'Le groupe t’en veut, mais son premier single solo est superbe.',
          rw: [{ k: 'master', q: 3 }, { k: 'rep', n: 3 }] },
        { text: 'Rester neutre et finir la session',
          outcome: 'La session se termine dans un silence glacial.',
          rw: [{ k: 'xp', x: 0.15 }] }
      ] },
    { id: 'critique', tiers: [3, 6], title: 'Le critique influent', contact: 'Bastien Roux, critique',
      intro: 'Le critique le plus lu du pays prépare un dossier sur les studios qui montent. Ton nom est sur sa liste.',
      choices: [
        { text: 'L’inviter pendant une vraie session de travail',
          outcome: 'Il reste quatre heures et écrit un portrait élogieux.',
          rw: [{ k: 'contact' }, { k: 'rep', n: 6 }] },
        { text: 'Lui offrir un dîner luxueux', cost: 1.5,
          outcome: 'Il apprécie le dîner… et écrit un article tiède. L’argent n’achète pas tout.',
          rw: [{ k: 'rep', n: 2 }] },
        { text: 'Lui envoyer un disque avec un mot manuscrit',
          outcome: 'Il cite ton mot dans son article.',
          rw: [{ k: 'rep', n: 3 }, { k: 'xp', x: 0.1 }] }
      ] },
    { id: 'ecole', tiers: [3, 6], title: 'L’école de musique', contact: 'Mme Bensaïd, directrice d’école',
      intro: 'L’école de musique du quartier n’a plus de quoi faire enregistrer ses élèves. La directrice frappe à ta porte.',
      choices: [
        { text: 'Ouvrir le studio aux élèves avec toute ton équipe', need: { staff: 3 },
          outcome: 'Une journée joyeuse et bruyante. L’équipe en ressort transformée.',
          rw: [{ k: 'contact' }, { k: 'morale', n: 25 }, { k: 'rep', n: 4 }] },
        { text: 'Donner une masterclass gratuite',
          outcome: 'Les questions des élèves te poussent dans tes retranchements.',
          rw: [{ k: 'contact' }, { k: 'rp', x: 2 }] },
        { text: 'Leur vendre des sessions au prix fort',
          outcome: 'L’école paie, sans enthousiasme.',
          rw: [{ k: 'cash', x: 1.5 }] }
      ] },
    { id: 'sample', tiers: [3, 6], title: 'Le sample non déclaré', contact: 'Maître Lefort, avocate',
      intro: 'Un titre produit chez toi contient un sample non déclaré. Les ayants droit menacent de faire retirer le morceau.',
      choices: [
        { text: 'Négocier les droits honnêtement', cost: 1,
          outcome: 'Accord trouvé. Le titre reste en ligne et l’avocate retient ton sérieux.',
          rw: [{ k: 'contact' }, { k: 'rep', n: 5 }, { k: 'tracks', n: 10 }] },
        { text: 'Rejouer la partie samplée avec un vrai clavier', need: { item: 'clavier' },
          outcome: 'Ta version jouée est encore meilleure que l’originale.',
          rw: [{ k: 'master', q: 4 }, { k: 'rp', x: 1 }] },
        { text: 'Faire le mort et attendre', risk: { p: 0.35,
          outcome: 'Le titre est retiré. Toutes ses ventes s’arrêtent.', rw: [{ k: 'xp', x: 0.05 }] },
          outcome: 'Les ayants droit finissent par abandonner.',
          rw: [{ k: 'cash', x: 1 }] }
      ] },
    { id: 'festival2', tiers: [3, 6], need: { contact: 'festival' }, title: 'La grande scène', contact: 'La régie du festival',
      intro: 'Hélène, la régisseuse du festival, t’appelle : l’ingénieur de la grande scène est malade, le concert commence dans une heure.',
      choices: [
        { text: 'Mixer la grande scène sur ta console analogique', need: { item: 'console' },
          outcome: 'Quarante mille personnes, un son énorme. Ton nom apparaît dans tous les comptes rendus.',
          rw: [{ k: 'contact' }, { k: 'rep', n: 8 }, { k: 'boost', m: 2, s: 120 }] },
        { text: 'Monter sur scène pour un set surprise', risk: { p: 0.5,
          outcome: 'Le public attendait la tête d’affiche. Tu tiens bon, sans plus.', rw: [{ k: 'xp', x: 0.15 }] },
          outcome: 'Le public ne t’attendait pas et repart en parlant de toi.',
          rw: [{ k: 'rep', n: 10 }, { k: 'cash', x: 2 }] },
        { text: 'Tenir le stand du studio',
          outcome: 'Tu vends des disques toute la soirée.',
          rw: [{ k: 'cash', x: 1.2 }] }
      ] },
    { id: 'hackathon', tiers: [3, 6], title: 'Le hackathon audio', contact: 'Lina, développeuse',
      intro: 'Un week-end entier pour inventer des outils audio. Une développeuse cherche un producteur pour son équipe.',
      choices: [
        { text: 'Coder avec elle un plugin maison',
          outcome: 'Votre plugin gagne le prix du public. Tu l’utilises depuis tous les jours.',
          rw: [{ k: 'contact' }, { k: 'rp', x: 3 }] },
        { text: 'Montrer ton réglage d’Auto-Tune secret', need: { rd: 'autotune' },
          outcome: 'La salle entière prend des notes. On te cite dans trois conférences.',
          rw: [{ k: 'rp', x: 4 }, { k: 'rep', n: 3 }] },
        { text: 'Venir surtout pour le buffet',
          outcome: 'Le buffet était excellent.',
          rw: [{ k: 'xp', x: 0.05 }] }
      ] },
    { id: 'documentaire', tiers: [4, 6], title: 'Le documentaire', contact: 'Nadia, réalisatrice',
      intro: 'Une réalisatrice prépare un documentaire sur les studios d’enregistrement. Elle veut filmer le tien.',
      choices: [
        { text: 'Laisser les caméras filmer une vraie journée',
          outcome: 'Le film montre le travail tel qu’il est. Le public adore ton équipe.',
          rw: [{ k: 'contact' }, { k: 'rep', n: 6 }, { k: 'morale', n: 10 }] },
        { text: 'Composer la musique du documentaire avec ta banque orchestrale', need: { item: 'orchestre' },
          outcome: 'La bande originale est saluée à sa diffusion.',
          rw: [{ k: 'cash', x: 3 }, { k: 'tracks', n: 20 }] },
        { text: 'Refuser pour protéger la tranquillité de tes artistes',
          outcome: 'L’équipe apprécie que tu la protèges.',
          rw: [{ k: 'morale', n: 15 }] }
      ] },
    { id: 'investisseur', tiers: [4, 6], title: 'L’investisseuse pressée', contact: 'Sophie Marchal, investisseuse',
      intro: 'Une investisseuse te donne cinq minutes entre deux avions. Elle a deux projets à te proposer.',
      choices: [
        { text: 'Co-investir dans un studio de quartier', cost: 3,
          outcome: 'Le studio de quartier tourne à plein et te reverse rapidement de beaux dividendes.',
          rw: [{ k: 'contact' }, { k: 'cash', x: 6 }] },
        { text: 'Parier sur une jeune pousse de la musique assistée', cost: 2, risk: { p: 0.4,
          outcome: 'L’entreprise ferme au bout de six mois. Une leçon chère payée.', rw: [{ k: 'xp', x: 0.1 }] },
          outcome: 'L’entreprise est rachetée. Ta part est multipliée.',
          rw: [{ k: 'cash', x: 8 }, { k: 'rp', x: 2 }] },
        { text: 'Décliner poliment',
          outcome: 'Elle te laisse sa carte « pour plus tard ».',
          rw: [{ k: 'xp', x: 0.1 }] }
      ] },
    { id: 'jury', tiers: [4, 6], title: 'Le jury télé', contact: 'Production Starlight',
      intro: 'Une émission de télé-crochet cherche un nouveau juré. Le tournage commence demain.',
      choices: [
        { text: 'Accepter et rester bienveillant',
          outcome: 'Les candidats t’adorent. Les téléspectateurs aussi.',
          rw: [{ k: 'contact' }, { k: 'rep', n: 8 }] },
        { text: 'Jouer le juré impitoyable', risk: { p: 0.5,
          outcome: 'Le public te trouve odieux. L’émission ne te réinvite pas.', rw: [{ k: 'rep', n: 1 }] },
          outcome: 'Tes répliques font le tour du web. Tout le monde veut savoir qui tu es.',
          rw: [{ k: 'rep', n: 12 }, { k: 'cash', x: 2 }] },
        { text: 'Refuser pour rester au studio',
          outcome: 'Tu passes la soirée à produire, l’esprit tranquille.',
          rw: [{ k: 'boost', m: 2, s: 120 }] }
      ] },
    { id: 'artiste2', tiers: [4, 6], need: { contact: 'artiste' }, title: 'Le duo de Maya Lorent', contact: 'L’équipe de Maya Lorent',
      intro: 'Maya Lorent n’a pas oublié votre discussion au bar de l’hôtel. Elle veut enregistrer un duo dans ton studio.',
      choices: [
        { text: 'Préparer la session avec ton coach vocal', need: { role: 'vocal' },
          outcome: 'Les voix se marient parfaitement dès la deuxième prise. Le duo est immédiatement un classique.',
          rw: [{ k: 'contact' }, { k: 'master', q: 5 }, { k: 'rep', n: 6 }] },
        { text: 'Produire le duo toi-même, en une seule nuit', risk: { p: 0.5,
          outcome: 'Le résultat est bon, mais tu sens qu’il manque quelque chose.', rw: [{ k: 'master', q: 3 }] },
          outcome: 'Une nuit de grâce. Au matin, le morceau est parfait.',
          rw: [{ k: 'master', q: 5 }, { k: 'boost', m: 3, s: 90 }] },
        { text: 'Proposer de garder l’idée pour plus tard',
          outcome: 'Elle comprend. L’occasion ne se représentera peut-être pas.',
          rw: [{ k: 'xp', x: 0.15 }] }
      ] },
    { id: 'legende2', tiers: [5, 6], need: { contact: 'legende' }, title: 'Le dernier album de Jean-Paul Sorel', contact: 'Les héritiers de Jean-Paul Sorel',
      intro: 'Jean-Paul Sorel, le producteur légendaire, revient avec des bandes inachevées. Il veut que ce soit toi qui les termines.',
      choices: [
        { text: 'Les terminer sur ta console légendaire', need: { item: 'neve' },
          outcome: 'Sa signature sonore et la tienne se rejoignent. L’album est salué comme un testament.',
          rw: [{ k: 'contact' }, { k: 'master', q: 5 }, { k: 'rp', x: 4 }] },
        { text: 'Lui demander de t’enseigner sa méthode de mixage',
          outcome: 'Trois jours d’enseignement qui valent dix ans de pratique.',
          rw: [{ k: 'contact' }, { k: 'xp', x: 0.4 }] },
        { text: 'Lui conseiller de les publier telles quelles',
          outcome: 'Les bandes brutes ont leur charme. Il te remercie de ta franchise.',
          rw: [{ k: 'rep', n: 4 }] }
      ] }
  ];


  // Palmarès: trophées à décrocher. m = mesure suivie (voir trophyMetric dans engine.js), n = seuil à atteindre.
  // Mesures: done (productions réalisées, ou done:<voie>), lifetime, level, items (équipements hors portable),
  // own:<équipement>, tier, income (revenu continu par seconde, hors boost), autos, rank (plus haut rang), contacts, outings, fame, tours.
  // Palmarès à plusieurs niveaux. Chaque niveau décroché ajoute trophyBonus aux gains.
  // desc: {n} est remplacé par le seuil (formaté selon fmt), descs[i] remplace la phrase d'un niveau.
  // old: anciens trophées à niveau unique, dans l'ordre des niveaux (null si aucun), pour reprendre les sauvegardes.
  var TROPHY_LEVELS = ['Bronze', 'Argent', 'Or', 'Platine', 'Diamant', 'Légende'];
  var TROPHIES = [
    { id: 'production', name: 'Producteur', m: 'done', levels: [1, 25, 250, 2500, 25000, 250000], desc: 'Termine {n} productions.', descs: ['Termine ta toute première production.'], old: ['premier-beat', 'clients', 'commandes', 'chaine'] },
    { id: 'gains', name: 'Fortune', m: 'lifetime', fmt: 'eur', levels: [100, 1e4, 1e6, 1e8, 1e10, 1e13], desc: 'Gagne {n} au total.', old: ['poche', 'salaire', 'million', 'cent-millions', 'fortune'] },
    { id: 'savoir', name: 'Expertise', m: 'level', levels: [5, 12, 20, 26, 30, 35], desc: 'Atteins le niveau d’expertise {n}.', old: ['oreille', 'inge', 'maitre', 'hitmaker'] },
    { id: 'equipement', name: 'Collectionneur', m: 'items', levels: [1, 8, 16, 24], desc: 'Installe {n} équipements.', descs: ['Achète ton premier équipement.'], old: ['achat', 'rack', null, 'complet'] },
    { id: 'analogique', name: 'Son analogique', m: 'own:console', levels: [1], descs: ['Installe une console analogique.'], old: ['console'] },
    { id: 'studio-a', name: 'Grande salle', m: 'own:studioA', levels: [1], descs: ['Ouvre la grande salle (Studio A).'], old: ['grande-salle'] },
    { id: 'batisseur', name: 'Bâtisseur', m: 'tier', levels: [1, 3, 5, 6], descs: ['Transforme ta chambre en chambre-studio.', 'Emménage dans un local en ville.', 'Deviens un studio de référence.', 'Ouvre le complexe légendaire.'], old: ['home', 'semi-pro', null, 'legendaire'] },
    { id: 'revenus', name: 'Revenus', m: 'income', fmt: 'eurs', levels: [1, 100, 1e4, 1e6, 1e8], desc: 'Gagne {n} en continu.', old: ['compteur', 'entrees', 'pluie', 'maree'] },
    { id: 'auto', name: 'Pilote automatique', m: 'autos', levels: [1, 5, 11], desc: 'Automatise {n} productions.', descs: ['Automatise une première production.', null, 'Automatise les 11 productions.'], old: ['stagiaire', null, 'pilote'] },
    { id: 'rangs', name: 'Perfectionniste', m: 'rank', levels: [10, 40, 100, 200], desc: 'Monte une production au rang {n}.', old: ['palier-double', 'perfectionniste'] },
    { id: 'contacts', name: 'Carnet d’adresses', m: 'contacts', levels: [1, 6, 12, 24, 36], desc: 'Rencontre {n} contacts en sortie de studio.', descs: ['Rencontre ton premier contact.'], old: ['carnet', 'reseau', 'gotha'] },
    { id: 'monde', name: 'Globe-trotter', m: 'tours', levels: [1, 4, 10], desc: 'Pars {n} fois en tournée mondiale.', descs: ['Pars en tournée mondiale.'], old: ['tournee', 'grande-tournee'] },
    { id: 'renommee', name: 'Renommée', m: 'fame', levels: [25, 100, 400], desc: 'Cumule {n} points de renommée.', old: ['tete-affiche'] },
    { id: 'nuits', name: 'Noctambule', m: 'outings', levels: [1, 15, 50, 150], desc: 'Vis {n} sorties de studio.', descs: ['Accepte ta première sortie de studio.'], old: ['sortie', 'noctambule'] },
    { id: 'histoires', name: 'Fil rouge', m: 'chains', levels: [1, 3, 6], desc: 'Vis {n} suites d’histoires en sortie de studio.', descs: ['Retrouve une connaissance dans une suite d’histoire.'] },
    { id: 'poker', name: 'Coup de poker', m: 'gambles', levels: [1, 10, 30], desc: 'Réussis {n} choix risqués en sortie de studio.', descs: ['Réussis un choix risqué en sortie de studio.'] },
    { id: 'chef', name: 'Chef d’équipe', m: 'staff', levels: [1, 5, 8], desc: 'Réunis {n} membres dans ton équipe.', descs: ['Recrute ton premier membre.'], old: ['recrue', 'equipe'] },
    { id: 'mentor', name: 'Formateur', m: 'staffLvl', levels: [5, 10], desc: 'Fais monter un membre au niveau {n}.', old: ['talent', 'pilier'] },
    { id: 'mixeur', name: 'Ingé mix', m: 'mixes', levels: [1, 25, 100, 500], desc: 'Mixe {n} morceaux toi-même.', descs: ['Mixe ton premier morceau.'], old: ['premier-mix'] },
    { id: 'oreille-absolue', name: 'Oreille d’or', m: 'perfect', levels: [1, 10, 50], desc: 'Réussis {n} mix parfaits.', descs: ['Réussis un mix parfait.'], old: ['oreille-or'] },
    { id: 'service', name: 'Service client', m: 'orders', levels: [1, 15, 50, 150], desc: 'Livre {n} commandes à temps.', descs: ['Livre une commande à temps.'], old: ['client', 'carnet-commandes'] },
    { id: 'estime', name: 'Réputation', m: 'rep', levels: [30, 60, 100], desc: 'Atteins {n} points de réputation.', old: [null, 'reputation'] },
    { id: 'classement', name: 'Top 50', m: 'chartBest', levels: [26, 41, 50], descs: ['Classe un titre dans le top 25.', 'Classe un titre dans le top 10.', 'Classe un titre numéro 1.'], old: [null, 'top10', 'numero-un'] },
    { id: 'tubes', name: 'Machine à tubes', m: 'num1', levels: [3, 10, 25], desc: 'Passe {n} semaines à la première place du Top 50.' },
    { id: 'labo', name: 'Chercheur', m: 'rdNodes', levels: [3, 12, 18], desc: 'Termine {n} recherches.', old: ['chercheur', 'savant', 'encyclopedie'] },
    { id: 'identite', name: 'Identité', m: 'specs', levels: [1, 2], descs: ['Choisis ta première spécialisation.', 'Choisis les deux spécialisations d’une même carrière.'], old: ['specialiste'] },
    { id: 'createur', name: 'Créateur', m: 'projects', levels: [1, 10, 30], desc: 'Termine {n} projets de création.', descs: ['Termine un projet de création.'], old: ['premier-projet'] },
    { id: 'critiques', name: 'Chouchou des critiques', m: 'projBest', fmt: 'note', levels: [7, 9, 9.8], desc: 'Obtiens une moyenne de {n} auprès des critiques.', old: [null, 'chef-oeuvre'] },
    { id: 'carnet-studio', name: 'Carnet du studio', m: 'book', levels: [4, 12, 30], desc: 'Découvre {n} associations genre et ambiance.', old: [null, 'carnet-plein'] },
    { id: 'clash', name: 'Clash', m: 'battles', levels: [1, 10, 50, 150], desc: 'Remporte {n} clashs de beatmakers.', descs: ['Remporte ton premier clash de beatmakers.'] },
    { id: 'ligue', name: 'Ligue des beatmakers', m: 'league', levels: [2, 3, 4, 5], descs: ['Monte en ligue Régionale.', 'Monte en ligue Nationale.', 'Monte en ligue Internationale.', 'Atteins la ligue Légende.'] },
    { id: 'piano', name: 'Doigts de fée', m: 'pianoBest', levels: [25, 60, 120], desc: 'Enchaîne {n} tuiles sans faute à l’atelier piano.' },
    { id: 'label', name: 'Directeur de label', m: 'signed', levels: [1, 2, 4], desc: 'Signe {n} artistes sur ton label.', descs: ['Signe ton premier artiste.'] },
    { id: 'albums', name: 'Disques d’artistes', m: 'artistAlbums', levels: [1, 10, 30], desc: 'Réalise {n} albums pour tes artistes.', descs: ['Réalise le premier album d’un de tes artistes.'] },
    { id: 'vedette', name: 'Faiseur de vedettes', m: 'artistFame', levels: [40, 75, 100], desc: 'Porte un artiste à {n} de notoriété.' },
    { id: 'scene', name: 'Bête de scène', m: 'concerts', levels: [1, 10, 40], desc: 'Donne {n} concerts avec tes artistes.', descs: ['Donne le premier concert d’un de tes artistes.'] },
    { id: 'salles', name: 'Grandes salles', m: 'bestVenue', levels: [3, 4, 5], descs: ['Remplis une salle de concert.', 'Remplis le Zénith.', 'Remplis un stade.'] },
    { id: 'fidele', name: 'Fidélité', m: 'kept', levels: [1, 5, 15], desc: 'Garde {n} artistes courtisés par un label rival.', descs: ['Garde un artiste courtisé par un label rival.'] },
    { id: 'combo', name: 'Main sûre', m: 'combo', levels: [20, 50, 100], desc: 'Enchaîne {n} frappes réussies d’affilée dans un clash.' }
  ];


  // Recherche: trois branches de six recherches (chacune demande la précédente de sa branche) et deux paliers de spécialisation.
  // fx multiplicatifs: gain, speed, xp, roy, mixZone, mixMul, chartScore, chartPay, promoCost, event, orderReward, orderEvery, rep, salary, trainCost, trainTime
  // fx additifs: quality, mixMax, mixStar, promoAdd, orderSlots, cap, autoQ4 ; chartDecay: valeur (la plus haute gagne)
  var RESEARCH = {
    branches: [
      { id: 'tech', name: 'Technique', desc: 'Vitesse, qualité et mixage.' },
      { id: 'crea', name: 'Création', desc: 'Expertise, Top 50 et rencontres.' },
      { id: 'biz', name: 'Business', desc: 'Commandes, équipe et revenus.' }
    ],
    costs: [100, 500, 2500, 10000, 40000, 150000],
    nodes: [
      { id: 'raccourcis', b: 'tech', name: 'Raccourcis clavier', desc: 'Toutes les productions vont 8 % plus vite.', fx: { speed: 1.08 } },
      { id: 'gain-staging', b: 'tech', name: 'Gain staging', desc: 'Au mini-jeu de mixage, la zone verte est 40 % plus large.', fx: { mixZone: 1.4 } },
      { id: 'autotune', b: 'tech', name: 'Auto-Tune', desc: 'Tous les gains augmentent de 10 %.', fx: { gain: 1.1 } },
      { id: 'mastering-ia', b: 'tech', name: 'Mastering par IA', desc: '+1 étoile de qualité sur toutes les productions.', fx: { quality: 1 } },
      { id: 'atmos', b: 'tech', name: 'Dolby Atmos', desc: 'Un mix parfait rapporte ×2,5 au lieu de ×2.', fx: { mixMax: 0.5 } },
      { id: 'hybride', b: 'tech', name: 'Studio hybride', desc: 'Toutes les productions vont 15 % plus vite.', fx: { speed: 1.15 } },
      { id: 'carnet-idees', b: 'crea', name: 'Carnet d’idées', desc: 'L’expertise vient 15 % plus vite.', fx: { xp: 1.15 } },
      { id: 'ecoute', b: 'crea', name: 'Écoute active', desc: 'Tes sorties se classent 10 % mieux au Top 50.', fx: { chartScore: 1.1 } },
      { id: 'signature', b: 'crea', name: 'Signature sonore', desc: 'Les récompenses des sorties de studio augmentent de 50 %.', fx: { event: 1.5 } },
      { id: 'residence', b: 'crea', name: 'Écriture en résidence', desc: 'L’expertise vient 30 % plus vite.', fx: { xp: 1.3 } },
      { id: 'instinct', b: 'crea', name: 'Tube instinctif', desc: 'Tes titres perdent beaucoup moins de places au Top 50 chaque semaine.', fx: { chartDecay: 0.93 } },
      { id: 'genie', b: 'crea', name: 'Génie créatif', desc: '+1 étoile sur chaque titre que tu mixes.', fx: { mixStar: 1 } },
      { id: 'reseau-pro', b: 'biz', name: 'Réseau professionnel', desc: 'Les primes des commandes augmentent de 25 %.', fx: { orderReward: 1.25 } },
      { id: 'negociation', b: 'biz', name: 'Négociation', desc: 'Les salaires de l’équipe baissent de 15 %.', fx: { salary: 0.85 } },
      { id: 'presse', b: 'biz', name: 'Attaché de presse', desc: 'Campagnes promo deux fois moins chères et plus efficaces (×1,6).', fx: { promoCost: 0.5, promoAdd: 0.2 } },
      { id: 'cadres', b: 'biz', name: 'Contrats cadres', desc: 'Une commande de plus en même temps, et les clients appellent plus souvent.', fx: { orderSlots: 1, orderEvery: 0.7 } },
      { id: 'distribution', b: 'biz', name: 'Distribution mondiale', desc: 'Royalties ×2.', fx: { roy: 2 } },
      { id: 'empire', b: 'biz', name: 'Empire musical', desc: 'Tous les gains augmentent de 20 %.', fx: { gain: 1.2 } }
    ],
    specs: [
      { tier: 1, need: 5, name: 'Identité du studio', options: [
        { id: 'usine', name: 'Usine à tubes', desc: 'Productions 20 % plus rapides, mais une étoile de qualité en moins.', fx: { speed: 1.2, quality: -1 } },
        { id: 'prestige', name: 'Studio de prestige', desc: 'Gains +30 %, mais productions 15 % plus lentes.', fx: { gain: 1.3, speed: 0.87 } },
        { id: 'independant', name: 'Studio indépendant', desc: 'Réputation gagnée doublée et primes des commandes +40 %, mais gains −10 %.', fx: { rep: 2, orderReward: 1.4, gain: 0.9 } }
      ] },
      { tier: 2, need: 11, name: 'Savoir-faire', options: [
        { id: 'stars', name: 'Faiseur de stars', desc: 'Gains du Top 50 doublés et classement +20 %.', fx: { chartPay: 2, chartScore: 1.2 } },
        { id: 'formation-maison', name: 'Maison de formation', desc: 'Formations deux fois moins chères et deux fois plus rapides, un poste d’équipe en plus.', fx: { trainCost: 0.5, trainTime: 0.5, cap: 1 } },
        { id: 'artisan', name: 'Artisan du son', desc: 'Les mix rapportent 50 % de plus, et une production automatique sur dix sort en 4 étoiles.', fx: { mixMul: 1.5, autoQ4: 0.1 } }
      ] }
    ]
  };


  // Projets de création: un bonus facultatif à côté des productions.
  // Curseurs (0 à 100): Écriture (mélodie → paroles), Enregistrement (instruments → voix), Production (brut → léché).
  var PROJECTS = {
    genres: [
      { id: 'rap', name: 'Rap', ideal: [80, 75, 40], good: ['rue', 'revolte'], bad: ['voyage'], pub: 'ados', badPub: 'fins' },
      { id: 'pop', name: 'Pop', ideal: [50, 65, 80], good: ['amour', 'fete'], bad: ['revolte'], pub: 'large', badPub: 'fins' },
      { id: 'electro', name: 'Électro', ideal: [10, 10, 70], good: ['fete', 'voyage'], bad: ['amour'], pub: 'jeunes', badPub: 'large' },
      { id: 'lofi', name: 'Lo-fi', rd: 'raccourcis', ideal: [20, 25, 20], good: ['nostalgie', 'spleen'], bad: ['fete'], pub: 'jeunes', badPub: 'large' },
      { id: 'chanson', name: 'Chanson française', rd: 'carnet-idees', ideal: [90, 60, 55], good: ['amour', 'nostalgie'], bad: ['fete'], pub: 'fins', badPub: 'ados' },
      { id: 'afro', name: 'Afro', rd: 'reseau-pro', ideal: [35, 55, 65], good: ['fete', 'amour'], bad: ['spleen'], pub: 'large', badPub: 'fins' },
      { id: 'rnb', name: 'R&B', rd: 'ecoute', ideal: [55, 85, 85], good: ['amour', 'spleen'], bad: ['revolte'], pub: 'jeunes', badPub: 'ados' },
      { id: 'trap', name: 'Trap', rd: 'autotune', ideal: [40, 70, 60], good: ['rue', 'fete'], bad: ['nostalgie'], pub: 'ados', badPub: 'large' },
      { id: 'rock', name: 'Rock', rd: 'signature', ideal: [45, 30, 20], good: ['revolte', 'spleen'], bad: ['fete'], pub: 'jeunes', badPub: 'ados' },
      { id: 'jazz', name: 'Jazz', rd: 'residence', ideal: [15, 20, 65], good: ['nostalgie', 'voyage'], bad: ['rue'], pub: 'fins', badPub: 'ados' },
      { id: 'kpop', name: 'K-pop', rd: 'distribution', ideal: [40, 70, 95], good: ['amour', 'espoir'], bad: ['spleen'], pub: 'ados', badPub: 'fins' },
      { id: 'bo', name: 'Bande originale', rd: 'genie', ideal: [5, 5, 90], good: ['voyage', 'espoir'], bad: ['fete'], pub: 'large', badPub: 'ados' }
    ],
    moods: [
      { id: 'amour', name: 'Amour' }, { id: 'fete', name: 'Fête' }, { id: 'rue', name: 'La rue' }, { id: 'nostalgie', name: 'Nostalgie' },
      { id: 'revolte', name: 'Révolte' }, { id: 'voyage', name: 'Voyage' }, { id: 'spleen', name: 'Spleen' }, { id: 'espoir', name: 'Espoir' }
    ],
    pubs: [
      { id: 'ados', name: 'Ados' }, { id: 'jeunes', name: 'Jeunes adultes' }, { id: 'large', name: 'Grand public' }, { id: 'fins', name: 'Connaisseurs' }
    ],
    formats: [
      { id: 'single', name: 'Single', tier: 0, cost: 1, time: 1, roi: 1, chart: 1 },
      { id: 'ep', name: 'EP', tier: 1, cost: 2.5, time: 1.8, roi: 1.15, chart: 1.05 },
      { id: 'album', name: 'Album', tier: 2, cost: 6, time: 3, roi: 1.3, chart: 1.1 }
    ],
    phases: [
      { id: 'ecriture', name: 'Écriture', dur: 45, lo: 'Mélodie', hi: 'Paroles', roles: ['compo', 'beatmaker', 'real'] },
      { id: 'prise', name: 'Enregistrement', dur: 60, lo: 'Instruments', hi: 'Voix', roles: ['vocal', 'preneur', 'real'] },
      { id: 'prod', name: 'Production', dur: 45, lo: 'Brut', hi: 'Léché', roles: ['mixeur', 'master', 'real'] }
    ],
    critics: ['Sono Mag', 'Le Fil Musical', 'Beat Hebdo', 'Radio Néon'],
    // part des ventes encaissée chaque semaine passée dans le Top 50
    sales: [0.34, 0.24, 0.16, 0.11, 0.08, 0.07]
  };


  // Clash de beatmakers: ligues, rivaux et pistes du mini-jeu de rythme.
  var BATTLE = {
    leagues: [
      { name: 'Quartier', bpm: 86, target: 0.5, dens: 0, tiles: 28, tps: 2.3 },
      { name: 'Régionale', bpm: 94, target: 0.58, dens: 1, tiles: 32, tps: 2.7 },
      { name: 'Nationale', bpm: 102, target: 0.65, dens: 2, tiles: 36, tps: 3.1 },
      { name: 'Internationale', bpm: 110, target: 0.72, dens: 3, tiles: 40, tps: 3.5 },
      { name: 'Légende', bpm: 118, target: 0.8, dens: 4, tiles: 44, tps: 3.9 }
    ],
    lanes: [
      { id: 'kick', name: 'Kick', key: 'D' }, { id: 'snare', name: 'Caisse claire', key: 'F' },
      { id: 'hat', name: 'Charleston', key: 'J' }, { id: 'clap', name: 'Clap', key: 'K' }
    ],
    rivals: ['MC Gravier', 'Lil Boucle', 'DJ Sablier', 'Kenza Kick', 'Le Baron du 808', 'Nina Snare', 'Yo-Yo Loop', 'Big Tempo', 'Sœur Sampler', 'Rico Groove',
      'La Machine', 'Prince Charley', 'Mamadou Bass', 'Capitaine Clap', 'Zélie Swing', 'Oscar Offbeat', 'Duchesse Dub', 'Toto Trap'],
    pianists: ['Lady Arpège', 'Max Ivoire', 'Clara Touche', 'Hugo Legato', 'Mlle Staccato', 'Le Comte Bémol', 'Rosa Ritournelle', 'Félix Fa Dièse', 'Inès Glissando', 'Doc Pédale']
  };

  // Atelier piano « tuiles »: mélodies du domaine public (notes MIDI) jouées tuile après tuile.
  var PIANO = {
    songs: [
      { id: 'joie', name: 'Ode à la joie', notes: [64, 64, 65, 67, 67, 65, 64, 62, 60, 60, 62, 64, 64, 62, 62, 64, 64, 65, 67, 67, 65, 64, 62, 60, 60, 62, 64, 62, 60, 60,
        62, 62, 64, 60, 62, 64, 65, 64, 60, 62, 64, 65, 64, 62, 60, 62, 55, 64, 64, 65, 67, 67, 65, 64, 62, 60, 60, 62, 64, 62, 60, 60] },
      { id: 'jacques', name: 'Frère Jacques', notes: [60, 62, 64, 60, 60, 62, 64, 60, 64, 65, 67, 64, 65, 67, 67, 69, 67, 65, 64, 60, 67, 69, 67, 65, 64, 60, 60, 55, 60, 60, 55, 60] },
      { id: 'lune', name: 'Au clair de la lune', notes: [60, 60, 60, 62, 64, 62, 60, 64, 62, 62, 60, 60, 60, 60, 62, 64, 62, 60, 64, 62, 62, 60,
        62, 62, 62, 62, 57, 57, 62, 60, 59, 57, 55, 60, 60, 60, 62, 64, 62, 60, 64, 62, 62, 60] },
      { id: 'elise', name: 'Lettre à Élise', notes: [76, 75, 76, 75, 76, 71, 74, 72, 69, 60, 64, 69, 71, 64, 68, 71, 72, 64, 76, 75, 76, 75, 76, 71, 74, 72, 69, 60, 64, 69, 71, 64, 72, 71, 69] },
      { id: 'danube', name: 'Le Beau Danube bleu', notes: [60, 60, 64, 67, 67, 79, 79, 76, 76, 60, 60, 64, 67, 67, 79, 79, 77, 77, 59, 59, 62, 69, 69, 81, 81, 77, 77, 59, 59, 62, 69, 69, 81, 81, 76, 76] }
    ],
    min: 10
  };


  // Décoration du studio: purement esthétique, appliquée à tous les lieux et conservée après une tournée.
  // need: { m: mesure du palmarès, n: seuil, t: texte } ; sans need, l'option est offerte.
  var DECO = {
    slots: [
      { id: 'wall', name: 'Peinture des murs', options: [
        { id: 'origine', name: 'D’origine' },
        { id: 'craie', name: 'Blanc craie', v: [0xf2efe8, 0xf8f5ef] },
        { id: 'sauge', name: 'Vert sauge', v: [0x9fb59a, 0xb4c8af], need: { m: 'tier', n: 2, t: 'Emménage dans le garage' } },
        { id: 'terracotta', name: 'Terracotta', v: [0xc8735a, 0xd9896f], need: { m: 'projects', n: 3, t: 'Termine 3 projets de création' } },
        { id: 'nuit', name: 'Bleu nuit', v: [0x2d3550, 0x3a4462], need: { m: 'league', n: 2, t: 'Monte en ligue Régionale au clash' } },
        { id: 'aubergine', name: 'Aubergine', v: [0x5b3b5e, 0x6e4a72], need: { m: 'pianoBest', n: 60, t: 'Enchaîne 60 tuiles à l’atelier piano' } },
        { id: 'sable-or', name: 'Sable doré', v: [0xe6d3a8, 0xefe0bd], need: { m: 'num1', n: 3, t: 'Passe 3 semaines numéro 1 du Top 50' } }
      ] },
      { id: 'floor', name: 'Sol', options: [
        { id: 'origine', name: 'D’origine' },
        { id: 'chene', name: 'Chêne clair', v: ['wood', '#cfa06c', '#b38452'] },
        { id: 'noyer', name: 'Noyer', v: ['wood', '#5b4030', '#4a3426'], need: { m: 'items', n: 8, t: 'Installe 8 équipements' } },
        { id: 'beton', name: 'Béton ciré', v: ['concrete'], need: { m: 'battles', n: 5, t: 'Remporte 5 clashs' } },
        { id: 'marbre', name: 'Marbre', v: ['marble'], need: { m: 'tours', n: 1, t: 'Pars en tournée mondiale' } }
      ] },
      { id: 'rug', name: 'Tapis', options: [
        { id: 'origine', name: 'D’origine' },
        { id: 'bleu', name: 'Bleu océan', v: [0x2f4f8a, 0x4a6fb0] },
        { id: 'vert', name: 'Vert forêt', v: [0x2f6b4f, 0x4c8c6a], need: { m: 'contacts', n: 6, t: 'Rencontre 6 contacts' } },
        { id: 'rouge', name: 'Tapis rouge', v: [0x8c1c2c, 0xa52a3a], need: { m: 'chartBest', n: 41, t: 'Classe un titre dans le top 10' } },
        { id: 'or', name: 'Or', v: [0xb8902f, 0xd9b04f], need: { m: 'projBest', n: 9, t: 'Obtiens 9/10 auprès des critiques' } }
      ] },
      { id: 'light', name: 'Ambiance lumineuse', options: [
        { id: 'origine', name: 'Naturelle' },
        { id: 'chaud', name: 'Chaleureuse', v: 0xffc89a },
        { id: 'froid', name: 'Fraîche', v: 0xbcd6ff, need: { m: 'mixes', n: 10, t: 'Mixe 10 morceaux' } },
        { id: 'violet', name: 'Violette', v: 0xd2b2ff, need: { m: 'league', n: 3, t: 'Monte en ligue Nationale au clash' } },
        { id: 'rose', name: 'Rose bonbon', v: 0xffbcd6, need: { m: 'outings', n: 15, t: 'Vis 15 sorties de studio' } },
        { id: 'vert', name: 'Aurore', v: 0xbff5d2, need: { m: 'rdNodes', n: 6, t: 'Termine 6 recherches' } }
      ] },
      { id: 'neon', name: 'Néon mural', options: [
        { id: 'aucun', name: 'Aucun' },
        { id: 'nom', name: 'Premier Mix', v: { k: 'text', c: '#ff8a3d' } },
        { id: 'note', name: 'Double croche', v: { k: 'note', c: '#66ccff' }, need: { m: 'battles', n: 1, t: 'Remporte un clash' } },
        { id: 'coeur', name: 'Cœur', v: { k: 'heart', c: '#ff5c8a' }, need: { m: 'contacts', n: 12, t: 'Rencontre 12 contacts' } },
        { id: 'eclair', name: 'Éclair', v: { k: 'bolt', c: '#ffd166' }, need: { m: 'league', n: 4, t: 'Monte en ligue Internationale' } },
        { id: 'etoile', name: 'Étoile', v: { k: 'star', c: '#c792ff' }, need: { m: 'chartBest', n: 50, t: 'Classe un titre numéro 1' } }
      ] }
    ]
  };


  // Artistes à signer. contact: rencontré en sortie de studio ; tier: repéré quand le studio atteint ce lieu.
  var ARTISTS = [
    { id: 'kais', name: 'Kaïs', genre: 'rap', likes: ['rue', 'revolte'], contact: 'rappeur', bio: 'Le rappeur du café, plume affûtée et flow nerveux.' },
    { id: 'ines', name: 'Inès', genre: 'chanson', likes: ['amour', 'nostalgie'], contact: 'openmic', bio: 'La chanteuse du micro ouvert, une voix qui fait taire les bars.' },
    { id: 'moussa', name: 'Moussa', genre: 'trap', likes: ['rue', 'fete'], contact: 'cypher', bio: 'Beatboxer du parc, il veut ses propres morceaux.' },
    { id: 'lou', name: 'Lou', genre: 'rock', likes: ['revolte', 'spleen'], contact: 'groupe', bio: 'Chanteuse des Marées, prête à tracer sa route.' },
    { id: 'salome', name: 'Salomé', genre: 'bo', likes: ['voyage', 'espoir'], contact: 'panne', bio: 'Chanteuse lyrique, elle rêve de musiques de film.' },
    { id: 'anatole', name: 'Anatole', genre: 'jazz', likes: ['nostalgie', 'voyage'], contact: 'pianiste', bio: 'Le pianiste du métro, des doigts d’or.' },
    { id: 'nox', name: 'DJ Nox', genre: 'electro', likes: ['fete', 'voyage'], contact: 'pirate', bio: 'La voix des nuits de la radio pirate.' },
    { id: 'maya', name: 'Maya Lorent', genre: 'pop', likes: ['amour', 'espoir'], contact: 'artiste', bio: 'La star que tout le monde connaît. Exigeante, et généreuse avec ceux qui la suivent.' },
    { id: 'leila', name: 'Leïla Noor', genre: 'rnb', likes: ['amour', 'spleen'], contact: 'star', bio: 'Auteure-compositrice perfectionniste, des refrains en or.' },
    { id: 'zoe', name: 'Zoé Kahn', genre: 'pop', likes: ['fete', 'amour'], tier: 2, bio: 'Repérée sur les réseaux, un tube par semaine dans sa chambre.' },
    { id: 'volts', name: 'Les Volts', genre: 'rock', likes: ['revolte', 'fete'], tier: 3, bio: 'Quatre lycéens devenus groupe de scène redoutable.' },
    { id: 'nayla', name: 'Nayla', genre: 'afro', likes: ['fete', 'amour'], tier: 3, bio: 'Danseuse et chanteuse, elle fait bouger tout le quartier.' },
    { id: 'seo', name: 'Kim Seo-yeon', genre: 'kpop', likes: ['amour', 'espoir'], tier: 4, bio: 'Venue de Séoul pour une carrière européenne.' },
    { id: 'lofi-sam', name: 'Sam & Lune', genre: 'lofi', likes: ['nostalgie', 'spleen'], tier: 4, bio: 'Un duo de chambre aux millions d’écoutes.' }
  ];


  // Concerts des artistes: la salle dépend de leur notoriété.
  var VENUES = [
    { id: 'bar', name: 'Le bar du coin', fame: 0, mult: 1, cap: '80 places' },
    { id: 'quartier', name: 'La salle de quartier', fame: 20, mult: 2, cap: '400 places' },
    { id: 'salle', name: 'La salle de concert', fame: 40, mult: 4, cap: '2 000 places' },
    { id: 'zenith', name: 'Le Zénith', fame: 65, mult: 8, cap: '6 000 places' },
    { id: 'stade', name: 'Le stade', fame: 90, mult: 15, cap: '60 000 places' }
  ];
  var GENRE_BPM = { rap: 90, pop: 108, electro: 124, lofi: 80, chanson: 96, afro: 104, rnb: 92, trap: 140, rock: 128, jazz: 100, kpop: 116, bo: 88 };
  // Labels rivaux qui tentent de débaucher tes artistes.
  var RIVAL_LABELS = ['Sonix Records', 'Plume Majeure', 'Galaxie Music', 'Bulle Prod', 'Néon Disques', 'Hexagone Music', 'Vinyle d’Or', 'Studio Comète'];

  // Histoires d'artistes. {name}: l'artiste, {other}: un autre artiste du label, {genre}: un autre genre.
  // Effets: mood, fame, cash (multiple du revenu de référence), rep ; style: prochain album dans {genre} compte comme son genre ; duo: prochain album en duo.
  var STORIES = [
    { id: 'style', title: '{name} veut changer de style', text: '{name} écoute du {genre} en boucle depuis des semaines et rêve d’un album dans ce style.',
      choices: [
        { text: 'L’encourager : le prochain album sera du {genre}', out: '{name} est aux anges. Son prochain album pourra être du {genre} sans le trahir.', fx: { mood: 12, style: 1 } },
        { text: 'Lui demander de rester fidèle à son public', out: '{name} comprend, mais l’envie reste là.', fx: { mood: -5, fame: 2 } }
      ] },
    { id: 'duo', need: 'other', title: 'Un duo {name} et {other} ?', text: '{name} et {other} se sont croisés au studio. Ils veulent enregistrer ensemble.',
      choices: [
        { text: 'Organiser le duo pour le prochain album de {name}', out: 'Rendez-vous est pris. Le prochain album de {name} sera un duo avec {other}.', fx: { mood: 8, duo: 1 } },
        { text: 'Garder leurs carrières séparées', out: 'Ils restent bons amis, sans plus.', fx: { mood: -3 } }
      ] },
    { id: 'tele', title: 'L’interview en direct', text: 'Une émission du soir veut {name} en direct, mais l’animateur a la réputation de piéger ses invités.',
      choices: [
        { text: 'Préparer {name} pendant deux heures', out: 'Réponses justes, humour bien dosé : l’interview fait le tour des réseaux.', fx: { fame: 7, mood: 4 } },
        { text: 'Laisser {name} improviser', risk: 0.5, out: '{name} est brillant d’instinct : on ne parle que de ça.', fail: 'L’animateur pique {name} au vif, la séquence tourne mal.', fx: { fame: 12 }, ffx: { fame: -2, mood: -8 } },
        { text: 'Décliner l’invitation', out: 'Pas de risque, pas de lumière.', fx: { mood: -2 } }
      ] },
    { id: 'panne', title: 'La page blanche', text: '{name} n’arrive plus à écrire une seule ligne depuis des jours.',
      choices: [
        { text: 'Lui offrir une semaine de retraite au bord de la mer', cost: 0.8, out: '{name} revient reposé, la tête pleine d’idées.', fx: { mood: 20 } },
        { text: 'Lui organiser une séance d’écriture avec ton équipe', out: 'À plusieurs, les idées reviennent doucement.', fx: { mood: 8 } },
        { text: 'Lui fixer une date limite', out: '{name} s’exécute, mais sans plaisir.', fx: { mood: -10, fame: 2 } }
      ] },
    { id: 'clip', title: 'Le clip de {name}', text: 'Une jeune réalisatrice propose un clip ambitieux pour le dernier titre de {name}.',
      choices: [
        { text: 'Financer le grand clip', cost: 1.5, out: 'Le clip est magnifique et cumule les vues.', fx: { fame: 10, mood: 6 } },
        { text: 'Tourner un clip simple au studio', out: 'Sobre et sincère : les fans adorent.', fx: { fame: 4, mood: 3 } },
        { text: 'Pas de clip pour l’instant', out: '{name} est un peu déçu.', fx: { mood: -4 } }
      ] },
    { id: 'merch', title: 'Le fan club de {name}', text: 'Le fan club de {name} réclame des t-shirts et des vinyles dédicacés.',
      choices: [
        { text: 'Lancer une collection soignée', cost: 1, out: 'Tout part en quelques heures. Les fans sont ravis.', fx: { cash: 2.6, fame: 3, mood: 4 } },
        { text: 'Faire une petite série en ligne', out: 'Une jolie vente sans prise de tête.', fx: { cash: 1, fame: 1 } }
      ] },
    { id: 'caritatif', title: 'Le concert solidaire', text: 'Une association demande à {name} de chanter gratuitement pour une collecte.',
      choices: [
        { text: 'Accepter avec plaisir', out: 'Une soirée émouvante. La presse salue le geste.', fx: { fame: 5, mood: 8, rep: 5 } },
        { text: 'Envoyer un don à la place', cost: 0.5, out: 'L’association remercie le label.', fx: { rep: 3 } }
      ] },
    { id: 'reseaux', title: 'La polémique', text: 'Une vieille vidéo de {name} refait surface et fait jaser sur les réseaux.',
      choices: [
        { text: 'Publier un message sincère d’explication', out: 'Le message est bien reçu, la tempête retombe.', fx: { fame: 2, mood: 3 } },
        { text: 'Jouer la carte de l’humour', risk: 0.55, out: 'La réponse drôle devient virale : tout le monde en rit avec {name}.', fail: 'L’humour tombe à plat et la polémique enfle.', fx: { fame: 8 }, ffx: { fame: -5, mood: -6 } },
        { text: 'Ne rien dire', out: 'L’affaire s’éteint d’elle-même, lentement.', fx: { mood: -3 } }
      ] }
  ];

  // Commandes: clients par type de production
  var CLIENTS = {
    beat: ['Rappeur', ['Kaïs', 'Lil Néo', 'Sami B', 'Zoya']], mix: ['Groupe', ['Les Rivages', 'Fuzz Club', 'Velvet Garage']],
    voix: ['Chanteuse', ['Inès', 'Maëva', 'Lou']], single: ['Artiste indé', ['Noé B.', 'Alma', 'Yaëlle']],
    ep: ['Groupe', ['Les Satellites', 'Néon Fauve', 'Marée Haute']], album: ['Label indé', ['Disques Volcan', 'Sillon Records', 'Label Orage']],
    bo: ['Réalisatrice', ['Claire Ozanne', 'Studio Lumen', 'Agence Pixel']], live: ['Festival', ['Les Nuits Chaudes', 'Rock en Ville', 'Fest’Ouest']],
    mastering: ['Major', ['Universon', 'Sonora Music', 'Warnex']], star: ['Star', ['Maya Lorent', 'Joe Kaz', 'Neïla']], hit: ['Major', ['Universon', 'Sonora Music', 'Warnex']]
  };
  // Top 50: titres et artistes des studios rivaux
  var CHART = {
    words: ['Nuit', 'Lumière', 'Vertige', 'Saison', 'Écho', 'Mirage', 'Néon', 'Rêve', 'Orage', 'Velours', 'Sirène', 'Satellite', 'Comète', 'Fièvre', 'Marée', 'Minuit', 'Boussole', 'Horizon', 'Papillon', 'Cœur', 'Vague', 'Étoile', 'Ciel', 'Danse'],
    tails: ['blanche', 'bleue', 'd’été', 'sans fin', 'électrique', 'de verre', 'perdue', 'dorée', 'sauvage', 'en retard', 'de nuit', 'au ralenti', 'XXL', 'pour toujours', 'en feu', 'à deux'],
    artists: ['Lyna', 'Kéo', 'Les Rivages', 'MC Sora', 'Noé B.', 'Alma', 'DJ Tessa', 'Vito', 'Les Bonnes Ondes', 'Yaëlle', 'Rafa', 'Clémence & Co', 'Zed', 'Oona', 'Big Malo', 'Sacha V.', 'Neïla', 'Les Satellites', 'Joe Kaz', 'Mira', 'Tiago', 'Swann', 'Kalia', 'Nyx', 'Lou Ann', 'Moussa K.', 'Élio', 'Bianca']
  };

  // Équipe: métiers et productions où chacun excelle (ailleurs, il apporte moitié moins).
  var ROLES = [
    { id: 'beatmaker', name: 'Beatmaker', acts: ['beat', 'single', 'hit'] },
    { id: 'mixeur', name: 'Ingé mix', acts: ['mix', 'ep', 'album'] },
    { id: 'vocal', name: 'Coach vocal', acts: ['voix', 'single', 'live'] },
    { id: 'real', name: 'Réalisateur', acts: ['ep', 'album', 'star'] },
    { id: 'compo', name: 'Compositeur', acts: ['bo', 'hit', 'beat'] },
    { id: 'master', name: 'Ingé mastering', acts: ['mastering', 'album', 'star'] },
    { id: 'preneur', name: 'Preneur de son', acts: ['live', 'voix', 'mix'] }
  ];
  var NAMES = ['Léa', 'Yanis', 'Inaya', 'Hugo', 'Maëlle', 'Sacha', 'Nora', 'Malik', 'Jade', 'Tom', 'Aïcha', 'Lucas', 'Zoé', 'Samir', 'Chloé', 'Noah',
    'Lina', 'Enzo', 'Camille', 'Rayan', 'Manon', 'Idriss', 'Louise', 'Théo', 'Sofia', 'Bastien', 'Anaïs', 'Karim', 'Romane', 'Élias', 'Agathe', 'Moussa',
    'Clara', 'Nathan', 'Yasmine', 'Gabin', 'Salomé', 'Ilyes', 'Margaux', 'Adam'];

  var D = { TUNING: TUNING, ACTS: ACTS, ITEMS: ITEMS, TIERS: TIERS, EVENTS: EVENTS, TROPHIES: TROPHIES, ROLES: ROLES, NAMES: NAMES, CLIENTS: CLIENTS, CHART: CHART, RESEARCH: RESEARCH, PROJECTS: PROJECTS, BATTLE: BATTLE, PIANO: PIANO, TROPHY_LEVELS: TROPHY_LEVELS, DECO: DECO, ARTISTS: ARTISTS, VENUES: VENUES, GENRE_BPM: GENRE_BPM, STORIES: STORIES, RIVAL_LABELS: RIVAL_LABELS };
  if (typeof module !== 'undefined' && module.exports) module.exports = D;
  root.GameData = D;
})(typeof window !== 'undefined' ? window : globalThis);
