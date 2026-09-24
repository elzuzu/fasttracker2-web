# Fasttracker II — version web

**▶ Jouer / Play: https://elzuzu.github.io/fasttracker2-web/**

*Fasttracker II in the browser: [ft2-clone](https://github.com/8bitbubsy/ft2-clone) v2.24 by Olav
"8bitbubsy" Sørensen, a faithful rebuild of FT2 2.08 whose replayer is ported from the original
source code, compiled to WebAssembly with a handful of browser adaptations. Same 632×400 interface,
same mixer, same keyboard shortcuts. Files you save stay in your browser; drop modules on the page
to load them. Non-commercial use only (graphics under CC BY-NC-SA 4.0, see below).*

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
./build.sh                       # → dist/ (index.html, index.js, index.wasm)
cd dist && python3 -m http.server 8768 --bind 127.0.0.1
open http://127.0.0.1:8768/
```

Port 8768 et non 8765 : sur ce Mac, `127.0.0.1:8765` est déjà pris par un `llama-server`.

Publication : GitHub Pages sert la branche `gh-pages` (une seule révision, remplacée à chaque
publication). `./publish.sh` compile et la pousse depuis ce Mac ; `.github/workflows/pages.yml`
fait pareil à chaque push sur `main` (emsdk 6.0.10) quand GitHub Actions est disponible sur le
compte — au 2026-09-24 les jobs ne démarrent pas (« account is locked due to a billing issue »).

`dist/` est un site statique : n'importe quel hébergement convient (pas besoin d'en-têtes
COOP/COEP, la version est mono-thread). Le premier build télécharge et compile le port SDL2
d'Emscripten (~20 s).

## Utilisation dans le navigateur

- `$HOME` du programme (`/home/web_user`) est stocké dans IndexedDB : config (`FT2.CFG`) et fichiers
  sauvés depuis Disk Op. persistent entre les visites, dans ce navigateur et pour ce site
  uniquement. Disk Op. s'ouvre sur `Desktop/`.
- Charger : glisser-déposer n'importe où sur la page, ou bouton **Load…** (copie dans `Desktop/`
  puis chargement, comme un glisser-déposer sur la fenêtre desktop).
- Récupérer un fichier sauvé : lien *download* dans la barre après chaque sauvegarde, ou **Files**.
- `?song=<url>` charge un module à l'ouverture (l'URL doit autoriser CORS).
- Trois modules du domaine public sont copiés dans `Desktop/` au premier lancement (voir `demo/`).
- Plein écran : Alt+Entrée (comme FT2) ou bouton **Fullscreen**.
- Taille « Auto » : le plus grand nombre entier de pixels physiques par pixel FT2 qui tient dans la
  page (sur écran Retina, ×1,5, ×2,5… restent nets) ; si cela laisse plus d'un cinquième de la place
  vide, l'écran est mis à l'échelle pour remplir la page (lissé). Les tailles fixes 1x…4x du Config
  gardent leur sens desktop. `page#debug` affiche une ligne d'état (images, clics, audio).
- `build/artifact/` : variante pour un Artifact claude.ai (sans squelette HTML, chargeur inline,
  export en `.zip` via la capacité `downloads`). Voir limites.

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
- Artifact claude.ai (https://claude.ai/artifact/TP72TKoyYwSAxTZCDeYXjd, privé) : l'interface
  s'affiche mais les clics envoyés par l'automatisation n'y ont aucun effet et une version a figé
  l'onglet ; la même page dans une iframe cross-origin locale fonctionne. Non résolu, cause côté
  hôte non observable. Utiliser la version servie normalement.

## Licences et publication

| Élément | Licence | Conséquence |
|---|---|---|
| Code ft2-clone (dont le code FT2 original porté) | BSD 3-Clause | tout usage, avis de copyright à conserver |
| Logo « Fasttracker II » de l'écran About, logo MIDI | BSD 3-Clause (redessinés par 8bitbubsy) | tout usage |
| Les 22 autres bitmaps (polices, badges, curseurs, widgets, Nibbles) de Magnus « Vogue » Högdahl | CC BY-NC-SA 4.0 | partage **non commercial** uniquement, crédit obligatoire, modifications sous la même licence |
| SDL 2, Emscripten, musl, minimp3, miniflac, minivorbis | zlib, MIT, MIT, CC0, 0BSD, type BSD | avis à conserver |
| Modules de démonstration | domaine public (`demo/README.md`) | aucune |

Publier le site gratuitement (Cloudflare Pages, GitHub Pages, serveur perso…) est donc permis tel
quel, à condition de ne pas en faire un usage commercial (publicité, accès payant, vente). Le
build place tous les textes de licence dans `dist/licenses/` (`NOTICE.txt` résume qui détient quoi)
et la boîte **About** de la page donne les crédits et le lien vers la licence CC.

Un usage commercial exigerait de remplacer les 22 bitmaps CC BY-NC-SA par des créations
originales. Un redessin fidèle ne suffirait pas : il reste une reproduction de l'œuvre de Vogue,
soumise à la même licence. Des graphismes neufs peuvent reprendre le style (palette, reliefs,
disposition), pas le dessin lui-même.
