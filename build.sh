#!/usr/bin/env bash
# Builds the WebAssembly version of ft2-clone into dist/.
# Needs Emscripten 6.0.10 (brew install emscripten, or emsdk install 6.0.10 as in .github/workflows/pages.yml).
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
	--embed-file demo@/demos --exclude-file '*.md' \
	--pre-js web/pre.js \
	--shell-file web/shell.html \
	-o "$OUT/index.html"

# license texts served with the page (required by the BSD, CC BY-NC-SA, zlib and MIT licenses)
LIC="$OUT/licenses"
mkdir -p "$LIC"
cp web/NOTICE.txt "$LIC/NOTICE.txt"
cp ft2-clone/LICENSE "$LIC/ft2-clone-BSD-3-Clause.txt"
cp ft2-clone/src/gfxdata/bmp/LICENSE.txt "$LIC/graphics-CC-BY-NC-SA-4.0.txt"
EM_ROOT="$(em-config EMSCRIPTEN_ROOT)"
SDL_LICENSE="$(ls "$(em-config CACHE)"/ports/sdl2/SDL-*/LICENSE.txt | head -n 1)"
cp "$SDL_LICENSE" "$LIC/SDL2-zlib.txt"
# Homebrew keeps Emscripten's LICENSE one level above EMSCRIPTEN_ROOT (libexec/)
if [ -f "$EM_ROOT/LICENSE" ]; then cp "$EM_ROOT/LICENSE" "$LIC/emscripten-MIT.txt"; else cp "$EM_ROOT/../LICENSE" "$LIC/emscripten-MIT.txt"; fi
cp "$EM_ROOT/system/lib/libc/musl/COPYRIGHT" "$LIC/musl-MIT.txt"
cat ft2-clone/src/smploaders/*license*.txt > "$LIC/sample-loaders.txt"
# byte order mark: plain-text servers rarely declare a charset, it makes browsers read UTF-8
for f in "$LIC"/*.txt; do printf '\xef\xbb\xbf' | cat - "$f" > "$f.tmp" && mv "$f.tmp" "$f"; done

ls -l "$OUT" "$LIC"

# claude.ai Artifact variant of the page (build/artifact/)
python3 web/make_artifact.py
