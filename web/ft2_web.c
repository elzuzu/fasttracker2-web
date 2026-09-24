/*
** Browser glue for the WebAssembly build of ft2-clone (see ft2_web.h).
*/

#ifdef __EMSCRIPTEN__

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <limits.h>
#include <emscripten.h>
#include "ft2_header.h"
#include "ft2_config.h"
#include "ft2_video.h"
#include "ft2_structs.h"
#include "ft2_replayer.h"

// this file must reach the real libc functions
#undef fopen
#undef fclose

#define MAX_TRACKED_FILES 64

typedef struct trackedFile_t
{
	FILE *f;
	char *path;
} trackedFile_t;

static trackedFile_t trackedFiles[MAX_TRACKED_FILES];
static volatile bool resizeRequested;
static int dummyThread;

EM_ASYNC_JS(void, ft2web_js_waitAnimationFrame, (void), {
	await new Promise((resolve) => {
		// requestAnimationFrame() never fires in a hidden tab, keep the program ticking slowly instead
		if (document.hidden)
			setTimeout(resolve, 16);
		else
			requestAnimationFrame(() => resolve());
	});
});

EM_JS(void, ft2web_js_fileWritten, (const char *path), {
	if (Module.ft2FileWritten)
		Module.ft2FileWritten(UTF8ToString(path));
});

EM_JS(int, ft2web_js_autoUpscaleFactor, (int w, int h), {
	return Module.ft2AutoUpscaleFactor ? Module.ft2AutoUpscaleFactor(w, h) : 1;
});

EM_JS(void, ft2web_setWantedAudioRate, (int32_t rate), {
	Module.ft2WantedAudioRate = rate;
});

EM_JS(void, ft2web_toggleFullscreen, (void), {
	if (Module.ft2ToggleFullscreen)
		Module.ft2ToggleFullscreen();
});

EM_JS(void, ft2web_js_programEnded, (void), {
	if (Module.ft2ProgramEnded)
		Module.ft2ProgramEnded();
});

SDL_Thread *ft2web_runThread(SDL_ThreadFunction fn, const char *name, void *data)
{
	(void)name;

	fn(data);
	return (SDL_Thread *)&dummyThread; // non-NULL: "thread created"
}

void ft2web_waitAnimationFrame(void)
{
	ft2web_js_waitAnimationFrame();
}

FILE *ft2web_fopen(const char *path, const char *mode)
{
	FILE *f = fopen(path, mode);
	if (f == NULL || mode == NULL || (strchr(mode, 'w') == NULL && strchr(mode, 'a') == NULL && strchr(mode, '+') == NULL))
		return f;

	for (int32_t i = 0; i < MAX_TRACKED_FILES; i++)
	{
		if (trackedFiles[i].f == NULL)
		{
			trackedFiles[i].path = realpath(path, NULL); // the file exists now, get its absolute path
			if (trackedFiles[i].path != NULL)
				trackedFiles[i].f = f;

			break;
		}
	}

	return f;
}

int ft2web_fclose(FILE *f)
{
	char *path = NULL;
	for (int32_t i = 0; i < MAX_TRACKED_FILES; i++)
	{
		if (trackedFiles[i].f == f)
		{
			path = trackedFiles[i].path;
			trackedFiles[i].f = NULL;
			trackedFiles[i].path = NULL;
			break;
		}
	}

	const int result = fclose(f);
	if (path != NULL)
	{
		if (result == 0)
			ft2web_js_fileWritten(path);

		free(path);
	}

	return result;
}

int32_t ft2web_autoUpscaleFactor(void)
{
	int32_t factor = ft2web_js_autoUpscaleFactor(SCREEN_W, SCREEN_H);
	return CLAMP(factor, 1, 16);
}

void ft2web_handleEvents(void)
{
	if (resizeRequested)
	{
		resizeRequested = false;
		if (!video.fullscreen && (config.windowFlags & WINSIZE_AUTO))
			setWindowSizeFromConfig(true);
	}
}

void ft2web_programEnded(void)
{
	ft2web_js_programEnded();
}

// ---- called from the page ----

EMSCRIPTEN_KEEPALIVE void ft2web_requestResize(void)
{
	resizeRequested = true;
}

/* Hands a file (already written to the virtual filesystem) to the tracker, as if it was dropped on
** the window. Returns 0 if it can't be accepted right now (system request shown, not started yet).
*/
EMSCRIPTEN_KEEPALIVE int ft2web_dropFile(const char *path)
{
	if (!editor.mainLoopOngoing || video.window == NULL || SDL_GetEventState(SDL_DROPFILE) != SDL_ENABLE)
		return 0;

	SDL_Event event;
	memset(&event, 0, sizeof (event));
	event.type = SDL_DROPFILE;
	event.drop.file = SDL_strdup(path);
	event.drop.windowID = SDL_GetWindowID(video.window);

	if (event.drop.file == NULL)
		return 0;

	if (SDL_PushEvent(&event) != 1)
	{
		SDL_free(event.drop.file);
		return 0;
	}

	return 1;
}

/* The desktop version saves the config on exit when "Auto save" is enabled. A browser tab is
** closed without the program ever exiting, so the page calls this when the tab gets hidden.
*/
EMSCRIPTEN_KEEPALIVE void ft2web_autoSaveConfig(void)
{
	if (editor.mainLoopOngoing && editor.programRunning && config.cfg_AutoSave)
		saveConfig(CONFIG_HIDE_ERRORS);
}

EMSCRIPTEN_KEEPALIVE int ft2web_songIsModified(void)
{
	return song.isModified ? 1 : 0;
}

#endif
