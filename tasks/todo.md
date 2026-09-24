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
- [ ] Vendoriser ft2-clone (commit pristine)
- [ ] En-tête forcé `web/ft2_web.h` + `web/ft2_web.c` (shims threads, attente vblank, FS, export)
- [ ] Patches ciblés `#ifdef __EMSCRIPTEN__` : spin-waits mixer, souris, fts, scopes, MIDI off
- [ ] Script `build.sh` (emcc) → `dist/`
- [ ] Shell HTML : écran de démarrage (déblocage audio), canvas net, import/export, glisser-déposer
- [ ] Vérif navigateur : UI identique (capture), lecture XM, clavier, Disk Op, sauvegarde/export
- [ ] Déploiement / partage

## Revue
