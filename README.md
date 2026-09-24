# Fasttracker II — version web

Fasttracker II dans le navigateur, sans émulation : c'est **ft2-clone v2.24** d'Olav « 8bitbubsy »
Sørensen compilé en WebAssembly. ft2-clone est la reconstruction fidèle de FT2 2.08 pour DOS ; son
replayer et une grande partie du code sont portés directement du code source original de Fredrik
« Mr. H » Huss et Magnus « Vogue » Högdahl (Triton), avec leur autorisation, sous licence BSD 3-Clause.
Aucune décompilation n'a donc été nécessaire : le code source existe et est libre.

Interface 632×400 d'origine au pixel près (mise à l'échelle entière ×1…×16), même moteur audio
(mixage flottant, interpolation sinc 8/16 points, cubique, linéaire FT2), mêmes raccourcis clavier,
Disk Op., éditeurs d'instruments et de samples, export WAV, Nibbles.

## Lancer

```sh
brew install emscripten          # une fois
./build.sh                       # → dist/ (index.html, index.js, index.wasm, index.data)
cd dist && python3 -m http.server 8765
open http://localhost:8765/
```

`dist/` est un site statique : n'importe quel hébergement convient (pas besoin d'en-têtes
COOP/COEP, la version est mono-thread). Le premier build télécharge et compile le port SDL2
d'Emscripten (~20 s).

## Utilisation dans le navigateur

- `$HOME` du programme (`/home/web_user`) est stocké dans IndexedDB : config (`FT2.CFG`) et fichiers
  sauvés depuis Disk Op. persistent entre les visites. Disk Op. s'ouvre sur `Desktop/`.
- Charger : glisser-déposer n'importe où sur la page, ou bouton **Load…** (copie dans `Desktop/`
  puis chargement, comme un glisser-déposer sur la fenêtre desktop).
- Récupérer un fichier sauvé : lien *download* dans la barre après chaque sauvegarde, ou **Files**.
- `?song=<url>` charge un module à l'ouverture (l'URL doit autoriser CORS).
- Trois modules du domaine public sont copiés dans `Desktop/` au premier lancement (voir `demo/`).
- Plein écran : Alt+Entrée (comme FT2) ou bouton **Fullscreen**.

## Adaptations au navigateur

Toutes les modifications du code d'origine sont sous `#ifdef __EMSCRIPTEN__` (`git diff` sur le
premier commit pour les voir, +158 lignes au total). La colle navigateur est dans `web/`.

| Desktop | Web |
|---|---|
| Boucle principale bloquante, attente vblank par `usleep` | Même boucle, ASYNCIFY ; l'attente 60 Hz cède la main via `requestAnimationFrame` |
| Threads de travail (chargement, sauvegarde, effets, rendu WAV) | Exécutés de façon synchrone là où ils seraient lancés |
| Thread des scopes à 64 Hz | Mêmes mises à jour 64 Hz, rattrapées à chaque image |
| Attentes actives sur le thread audio (`while (ch->status & CS_TRIGGER_VOICE);`) | Supprimées : la voix part au callback audio suivant |
| Position souris globale − position fenêtre | Coordonnées relatives au canvas |
| `fts.h` (suppression récursive) | `nftw()` |
| iconv `850` | iconv `cp850` (nom reconnu par musl) |
| Fréquence de sortie 44,1/48/96 kHz | Contexte Web Audio créé à la fréquence choisie |
| Taille de fenêtre « Auto » selon l'écran | Selon la zone disponible dans la page |
| Plein écran SDL | Plein écran de la page (exige une action utilisateur) |
| Config sauvée à la sortie si « Auto save » | Aussi quand l'onglet est masqué ou fermé |

## Limites connues

- Pas d'entrée MIDI (Web MIDI non branché).
- Les opérations longues (rendu WAV, rééchantillonnage, trim) figent la page jusqu'à la fin et ne
  peuvent pas être interrompues ; le son se coupe pendant ce temps.
- Les raccourcis réservés par le navigateur (⌘W/Ctrl+W, ⌘T, ⌘Q…) ne peuvent pas être capturés.
- Échap ouvre la demande de sortie de FT2, comme sous DOS ; après sortie, la page propose de relancer.

## Licences

- Code ft2-clone : BSD 3-Clause (`ft2-clone/LICENSE`), bibliothèques tierces sous leurs licences
  (`ft2-clone/LICENSES.txt`).
- Graphismes : Magnus Högdahl, **CC BY-NC-SA 4.0 — usage non commercial uniquement**.
- Modules de démonstration : domaine public (`demo/README.md`).
