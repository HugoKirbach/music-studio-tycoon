# Premier Mix

Jeu de gestion en 3D : tu montes ton studio de musique, de ta chambre jusqu'au complexe légendaire, avec ton équipe.

Le jeu tient dans un seul fichier, `www/index.html`. Il est emballé de deux façons :

- **Windows** avec Electron : un installateur `.exe` et une version portable `.exe`.
- **Android** avec Capacitor : un fichier `.apk`.

## Récupérer les applications

À chaque envoi sur la branche `main`, GitHub compile tout seul les deux applications (onglet **Actions**, environ 10 minutes). Il les publie ensuite dans l'onglet **Releases** du dépôt :

| Fichier | Pour quoi faire |
| --- | --- |
| `PremierMix-Installation-1.0.0.exe` | Installe le jeu sur Windows, avec un raccourci sur le bureau. |
| `PremierMix-Portable-1.0.0.exe` | Lance le jeu directement, sans installation. |
| `PremierMix.apk` | Installe le jeu sur un téléphone ou une tablette Android. |

### Windows : avertissement SmartScreen

L'application n'est pas signée avec un certificat payant, donc Windows peut afficher « Windows a protégé votre ordinateur ». Clique sur **Informations complémentaires**, puis sur **Exécuter quand même**.

### Android : installer l'APK

1. Télécharge `PremierMix.apk` depuis la page Releases, directement sur le téléphone.
2. Ouvre le fichier. Android te demande d'autoriser l'installation d'applications inconnues pour ton navigateur (ou ton gestionnaire de fichiers) : accepte.
3. Lance **Premier Mix**.

L'APK est signé avec une clé de développement. Il s'installe sans problème, mais il n'est pas destiné au Play Store. Pour une publication sur le Play Store, il faudra une clé de signature à toi.

## Sauvegardes

- Sur **claude.ai**, la partie est synchronisée avec ton compte Claude.
- Dans les applications **.exe** et **.apk**, la partie est sauvegardée sur l'appareil.
- Pour passer une partie d'un endroit à l'autre, utilise l'onglet **Compte**, puis **Copier mon code** sur l'appareil de départ et **Importer un code** sur l'appareil d'arrivée.

## Modifier le jeu

Le code source du jeu est dans `game/` :

- `data.js` : productions, matériel, paliers, sorties, trophées, métiers de l'équipe et équilibrage.
- `engine.js` : moteur de jeu (logique pure, testable avec Node).
- `scene3d.js` : la scène 3D (Three.js r160, licence MIT).
- `ui.js` et `template.html` : l'interface.

Après une modification :

```
python game/build.py          # régénère www/index.html
node game/tests/teamtest.js   # tests du moteur (aussi trophytest, tourtest, evtest)
```

Envoie ensuite la modification sur `main` : GitHub recompile les applications.

## Compiler sur ton propre PC (facultatif)

Il faut Node.js 20 :

```
npm install
npm start            # lance le jeu dans une fenêtre
npm run dist:win     # fabrique les .exe dans release/ (sous Windows)
```

Pour l'APK sur ton PC, il faut en plus Android Studio (avec le SDK Android) et Java 17 :

```
npm run android:prepare
npm run android:apk  # APK dans android/app/build/outputs/apk/debug/
```
