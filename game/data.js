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
    moraleOffline: 25,  // plancher du moral pendant l'absence du joueur
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
    projLevel: 5, projCostSec: 90, projRefund: 0.5, rpProj: 12, projXp: 4
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
      ] }
  ];


  // Palmarès: trophées à décrocher. m = mesure suivie (voir trophyMetric dans engine.js), n = seuil à atteindre.
  // Mesures: done (productions réalisées, ou done:<voie>), lifetime, level, items (équipements hors portable),
  // own:<équipement>, tier, income (revenu continu par seconde, hors boost), autos, rank (plus haut rang), contacts, outings, fame, tours.
  var TROPHIES = [
    { id: 'premier-beat', name: 'Premier beat', desc: 'Réalise ton premier beat.', m: 'done:beat', n: 1 },
    { id: 'clients', name: 'Premiers clients', desc: 'Réalise 25 productions.', m: 'done', n: 25 },
    { id: 'commandes', name: 'Carnet de commandes', desc: 'Réalise 250 productions.', m: 'done', n: 250 },
    { id: 'chaine', name: 'Chaîne de montage', desc: 'Réalise 2 500 productions.', m: 'done', n: 2500 },

    { id: 'poche', name: 'Argent de poche', desc: 'Gagne 100 € au total.', m: 'lifetime', n: 100 },
    { id: 'salaire', name: 'Premier salaire', desc: 'Gagne 10 000 € au total.', m: 'lifetime', n: 1e4 },
    { id: 'million', name: 'Cap du million', desc: 'Gagne un million d’euros au total.', m: 'lifetime', n: 1e6 },
    { id: 'cent-millions', name: 'Cent millions', desc: 'Gagne cent millions d’euros au total.', m: 'lifetime', n: 1e8 },
    { id: 'fortune', name: 'Fortune de la scène', desc: 'Gagne dix milliards d’euros au total.', m: 'lifetime', n: 1e10 },

    { id: 'oreille', name: 'Oreille formée', desc: 'Atteins le niveau d’expertise 5.', m: 'level', n: 5 },
    { id: 'inge', name: 'Ingé son confirmé', desc: 'Atteins le niveau d’expertise 12.', m: 'level', n: 12 },
    { id: 'maitre', name: 'Maître du mix', desc: 'Atteins le niveau d’expertise 20.', m: 'level', n: 20 },
    { id: 'hitmaker', name: 'Faiseur de hits', desc: 'Atteins le niveau d’expertise 26.', m: 'level', n: 26 },

    { id: 'achat', name: 'Premier achat', desc: 'Achète ton premier équipement.', m: 'items', n: 1 },
    { id: 'rack', name: 'Le rack se remplit', desc: 'Possède 8 équipements.', m: 'items', n: 8 },
    { id: 'complet', name: 'Studio au complet', desc: 'Possède tous les équipements.', m: 'items', n: ITEMS.length - 1 },
    { id: 'console', name: 'Table de mixage', desc: 'Installe la console analogique.', m: 'own:console', n: 1 },
    { id: 'grande-salle', name: 'Grande salle', desc: 'Ouvre le Studio A.', m: 'own:studioA', n: 1 },

    { id: 'home', name: 'Home studio', desc: 'Transforme ta chambre en vrai home studio.', m: 'tier', n: 1 },
    { id: 'semi-pro', name: 'Pignon sur rue', desc: 'Installe ton studio dans un local en ville.', m: 'tier', n: 3 },
    { id: 'legendaire', name: 'Studio légendaire', desc: 'Ouvre ton complexe légendaire, le dernier palier.', m: 'tier', n: 6 },

    { id: 'compteur', name: 'Le compteur tourne', desc: 'Atteins 1 € de revenu continu par seconde.', m: 'income', n: 1 },
    { id: 'entrees', name: 'Les entrées s’enchaînent', desc: 'Atteins 100 € de revenu continu par seconde.', m: 'income', n: 100 },
    { id: 'pluie', name: 'Pluie continue', desc: 'Atteins 10 000 € de revenu continu par seconde.', m: 'income', n: 1e4 },
    { id: 'maree', name: 'Marée de billets', desc: 'Atteins un million d’euros de revenu continu par seconde.', m: 'income', n: 1e6 },

    { id: 'stagiaire', name: 'Un stagiaire motivé', desc: 'Automatise une première production.', m: 'autos', n: 1 },
    { id: 'pilote', name: 'Pilote automatique', desc: 'Automatise toutes les productions.', m: 'autos', n: ACTS.length },

    { id: 'palier-double', name: 'Palier doublé', desc: 'Amène une production au rang 10.', m: 'rank', n: 10 },
    { id: 'perfectionniste', name: 'Perfectionniste', desc: 'Amène une production au rang 40.', m: 'rank', n: 40 },

    { id: 'carnet', name: 'Carnet d’adresses ouvert', desc: 'Rencontre ton premier contact.', m: 'contacts', n: 1 },
    { id: 'reseau', name: 'Réseau solide', desc: 'Rencontre 6 contacts.', m: 'contacts', n: 6 },
    { id: 'gotha', name: 'Tout le gotha', desc: 'Rencontre tous les contacts.', m: 'contacts', n: EVENTS.length },
    { id: 'tournee', name: 'Première tournée', desc: 'Pars en tournée mondiale pour la première fois.', m: 'tours', n: 1 },
    { id: 'tete-affiche', name: 'Tête d’affiche', desc: 'Atteins 25 points de renommée.', m: 'fame', n: 25 },
    { id: 'grande-tournee', name: 'Grande tournée', desc: 'Pars quatre fois en tournée mondiale.', m: 'tours', n: 4 },
    { id: 'sortie', name: 'Première sortie', desc: 'Fais ta première sortie de studio.', m: 'outings', n: 1 },
    { id: 'noctambule', name: 'Noctambule', desc: 'Fais 15 sorties de studio.', m: 'outings', n: 15 },
    { id: 'recrue', name: 'Première recrue', desc: 'Recrute un premier membre dans ton équipe.', m: 'staff', n: 1 },
    { id: 'equipe', name: 'Une vraie équipe', desc: 'Fais travailler cinq personnes en même temps.', m: 'staff', n: 5 },
    { id: 'talent', name: 'Talent maison', desc: 'Fais monter un membre de l’équipe au niveau 5.', m: 'staffLvl', n: 5 },
    { id: 'pilier', name: 'Pilier du studio', desc: 'Fais monter un membre de l’équipe au niveau 10.', m: 'staffLvl', n: 10 },
    { id: 'premier-mix', name: 'Premier mix', desc: 'Mixe une production toi-même.', m: 'mixes', n: 1 },
    { id: 'oreille-or', name: 'Oreille d’or', desc: 'Réussis un mix parfait (5 étoiles).', m: 'perfect', n: 1 },
    { id: 'client', name: 'Premier client', desc: 'Livre une commande à temps.', m: 'orders', n: 1 },
    { id: 'carnet-commandes', name: 'Carnet de commandes', desc: 'Livre 15 commandes à temps.', m: 'orders', n: 15 },
    { id: 'reputation', name: 'Réputation en or', desc: 'Atteins 60 points de réputation.', m: 'rep', n: 60 },
    { id: 'top10', name: 'Top 10', desc: 'Place un titre dans le Top 10.', m: 'chartBest', n: 41 },
    { id: 'numero-un', name: 'Numéro un', desc: 'Place un titre en tête du Top 50.', m: 'chartBest', n: 50 },
    { id: 'chercheur', name: 'Esprit curieux', desc: 'Termine 3 recherches.', m: 'rdNodes', n: 3 },
    { id: 'savant', name: 'Laboratoire du son', desc: 'Termine 12 recherches.', m: 'rdNodes', n: 12 },
    { id: 'encyclopedie', name: 'Tout savoir', desc: 'Termine les 18 recherches.', m: 'rdNodes', n: 18 },
    { id: 'specialiste', name: 'Une identité', desc: 'Choisis ta première spécialisation.', m: 'specs', n: 1 },
    { id: 'premier-projet', name: 'Premier projet', desc: 'Termine un projet de création.', m: 'projects', n: 1 },
    { id: 'chef-oeuvre', name: 'Chef-d’œuvre', desc: 'Obtiens une moyenne de 9/10 auprès des critiques.', m: 'projBest', n: 9 },
    { id: 'carnet-plein', name: 'Carnet bien rempli', desc: 'Découvre 12 associations genre et ambiance.', m: 'book', n: 12 }
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

  var D = { TUNING: TUNING, ACTS: ACTS, ITEMS: ITEMS, TIERS: TIERS, EVENTS: EVENTS, TROPHIES: TROPHIES, ROLES: ROLES, NAMES: NAMES, CLIENTS: CLIENTS, CHART: CHART, RESEARCH: RESEARCH, PROJECTS: PROJECTS };
  if (typeof module !== 'undefined' && module.exports) module.exports = D;
  root.GameData = D;
})(typeof window !== 'undefined' ? window : globalThis);
