/*
** Force-included (-include) into every ft2-clone translation unit of the WebAssembly build.
**
** The browser build is single-threaded (no SharedArrayBuffer requirement) and uses ASYNCIFY
** so that the program's blocking loops (main loop, modal system requests) can yield to the
** browser. Only what cannot be expressed as a small #ifdef in the original sources lives here.
*/

#pragma once

#ifdef __EMSCRIPTEN__

// system headers first, so that the macros below never touch their declarations
#include <stdio.h>
#include <stdbool.h>
#include <SDL2/SDL.h>

/* Worker threads ("load module", "save sample", "resample" and so on) are started, detached
** and never waited upon. In the single-threaded build they run to completion, synchronously,
** at the point where they would have been started. The permanent scope thread is replaced by
** updateScopesWeb() (see ft2_scopes.c).
*/
SDL_Thread *ft2web_runThread(SDL_ThreadFunction fn, const char *name, void *data);
#define SDL_CreateThread(fn, name, data) ft2web_runThread((fn), (name), (data))
#define SDL_DetachThread(t) ((void)(t))
#define SDL_WaitThread(t, status) ((void)(t))

// Yields to the browser until the next display refresh (used by hpc_Wait())
void ft2web_waitAnimationFrame(void);

/* Files written by the tracker (modules, samples, instruments, WAVs...) are reported to the
** page when closed, so it can persist the virtual filesystem and offer them for download.
*/
FILE *ft2web_fopen(const char *path, const char *mode);
int ft2web_fclose(FILE *f);
#define fopen(path, mode) ft2web_fopen((path), (mode))
#define fclose(f) ft2web_fclose(f)

// Integer upscaling factor that makes the 632x400 screen fit the page (config "Auto" window size)
int32_t ft2web_autoUpscaleFactor(void);

/* SDL creates its Web Audio context with the browser's default rate. The page makes it use the
** rate chosen in the config screen instead (the browser resamples to the hardware rate).
*/
void ft2web_setWantedAudioRate(int32_t rate);

// Fullscreen is handled by the page (the canvas is resized to fit)
void ft2web_toggleFullscreen(void);

// Called once per main loop iteration (handles page resizes)
void ft2web_handleEvents(void);

// Called when the main loop has ended (the user quit the tracker)
void ft2web_programEnded(void);

#endif
