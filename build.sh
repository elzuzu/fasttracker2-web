#!/usr/bin/env bash
# Builds the WebAssembly version of ft2-clone into dist/ (needs Emscripten: brew install emscripten).
set -euo pipefail
cd "$(dirname "$0")"

SRC=ft2-clone/src
OUT=dist
OPT=${OPT:--O3}

mkdir -p "$OUT"

emcc $OPT -ffast-math -DNDEBUG \
	-Wno-deprecated -Wno-unused-parameter -Wno-missing-field-initializers \
	-sUSE_SDL=2 \
	-include web/ft2_web.h -I"$SRC" \
	"$SRC"/*.c "$SRC"/gfxdata/*.c "$SRC"/mixer/*.c "$SRC"/scopes/*.c \
	"$SRC"/modloaders/*.c "$SRC"/smploaders/*.c web/ft2_web.c \
	-sASYNCIFY -sASYNCIFY_STACK_SIZE=262144 \
	-sALLOW_MEMORY_GROWTH -sINITIAL_MEMORY=64MB -sMAXIMUM_MEMORY=4GB -sSTACK_SIZE=2MB \
	-sENVIRONMENT=web \
	-sFORCE_FILESYSTEM -lidbfs.js \
	-sEXPORTED_FUNCTIONS=_main,_ft2web_dropFile,_ft2web_requestResize,_ft2web_songIsModified,_ft2web_autoSaveConfig \
	-sEXPORTED_RUNTIME_METHODS=ccall,FS,addRunDependency,removeRunDependency \
	--preload-file demo@/demos --exclude-file '*.md' \
	--pre-js web/pre.js \
	--shell-file web/shell.html \
	-o "$OUT/index.html"

ls -l "$OUT"
