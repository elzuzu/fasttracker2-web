# FastTracker II — portage web

Source : ft2-clone d'Olav Sørensen (8bitbubsy), commit `aeb2fd89187735df45fc12a0ae339acd344b883e`
(2026-09-17, v2.24). Portage C/SDL2 du code original de FT2 (Pascal/asm de Vogue & Mr.H), BSD-3.
Graphismes : Magnus Högdahl, CC BY-NC-SA 4.0 (usage non commercial).

Pas de décompilation : le code source existe légalement. On compile ft2-clone en WebAssembly.

## Choix
- Emscripten + SDL2 port + ASYNCIFY, mono-thread (pas de SharedArrayBuffer, hébergement statique quelconque).
- Threads SDL « jetables » exécutés de façon synchrone (shim `SDL_CreateThread`).
- Thread des scopes remplacé par une mise à jour 64 Hz rattrapée depuis la boucle principale.
- Attente vblank 60 Hz via `requestAnimationFrame` (ASYNCIFY) au lieu de `usleep`.
- FS : IDBFS monté sur `/home/web_user` (config + morceaux persistants).

## Étapes
- [x] Vendoriser ft2-clone (commit pristine)
- [x] En-tête forcé `web/ft2_web.h` + `web/ft2_web.c` (shims threads, attente vblank, FS, export)
- [x] Patches ciblés `#ifdef __EMSCRIPTEN__` : spin-waits mixer, souris, fts, scopes, MIDI off
- [x] Script `build.sh` (emcc) → `dist/`
- [x] Shell HTML : écran de démarrage (déblocage audio), canvas net, import/export, glisser-déposer
- [x] Vérif navigateur : UI identique (capture), lecture XM, clavier, Disk Op, sauvegarde/export
- [ ] Déploiement / partage (en attente de décision)

## Revue

Vérifié le 2026-09-24 dans Chrome headless (agent-browser), viewport 1400×900, DPR 1 et 2 :
- Rendu identique à ft2-clone desktop (écran principal, About animé, Disk Op., Config, Help,
  éditeur de samples, export WAV, boîtes système).
- Boucle principale 59,7 i/s ; callbacks audio 46,7/s pour 46,9 attendus (48 kHz / 1024) ;
  coût moyen du callback 0,14 ms (max 0,40 ms) ; aucune tâche longue pendant la lecture.
- Lecture XM 4, 6 et 10 canaux ; scopes animés ; saisie de notes au clavier ; saisie de texte.
- Sauvegarde XM avec demande d'écrasement → toast de téléchargement ; persistance après rechargement.
- Fréquences 44,1 / 48 / 96 kHz effectives (AudioContext recréé à la fréquence demandée).
- Prévisualisation de filtre : 0,975 s de son pour la seconde prévue (SDL_Delay asynchrone).
- Export WAV : RIFF/WAVE 44,1 kHz 16 bits stéréo, 84,5 s, RMS −13,9 dBFS.
- Sortie par Échap → demande « unsaved changes » → écran « exited » + Restart.

Non vérifié : sortie audio réelle sur haut-parleurs (headless), Firefox/Safari, écrans 120 Hz,
entrée audio (sampling), égalité bit à bit avec un rendu WAV natif.
