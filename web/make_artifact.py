#!/usr/bin/env python3
"""Builds the claude.ai Artifact variant of the page into build/artifact/.

An Artifact page is published without its own <html>/<head>/<body> skeleton (the platform
wraps it), and scripts may only come from a few CDNs, so the Emscripten loader is inlined.
index.wasm (which embeds the demo songs) is published next to it and fetched with a relative URL.
"""
import re
import shutil
import sys
from pathlib import Path

root = Path(__file__).resolve().parent.parent
dist = root / 'dist'
out = root / 'build' / 'artifact'
out.mkdir(parents=True, exist_ok=True)

shell = (root / 'web' / 'shell.html').read_text()
loader = (dist / 'index.js').read_text()
if '</script' in loader:
    sys.exit('index.js contains "</script", it cannot be inlined')

head = re.search(r'<head>(.*)</head>', shell, re.S).group(1)
body = re.search(r'<body>(.*)</body>', shell, re.S).group(1)

title = re.search(r'<title>.*?</title>', head, re.S).group(0)
style = re.search(r'<style>.*?</style>', head, re.S).group(0)
body = body.replace('{{{ SCRIPT }}}', '<script>\n' + loader + '\n</script>')

(out / 'index.html').write_text(title + '\n' + style + '\n' + body.strip() + '\n')
shutil.copyfile(dist / 'index.wasm', out / 'index.wasm')
shutil.copytree(dist / 'licenses', out / 'licenses', dirs_exist_ok=True)

print('artifact page:', out / 'index.html')
