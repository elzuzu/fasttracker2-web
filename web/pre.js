// Page side of the WebAssembly build of ft2-clone (runs inside the Emscripten module scope).
//
// - /home/web_user (the program's $HOME) is an IndexedDB-backed filesystem, so the config
//   (~/.config/FT2 clone/FT2.CFG) and everything saved from Disk Op. persist between visits.
// - Files can be loaded by dropping them on the page or with the "Load…" button: they are
//   copied to ~/Desktop (where Disk Op. opens) and handed to the tracker as a dropped file.
// - Files the tracker writes are announced with a download link, and listed in "Files".

(function () {
  'use strict';

  const HOME = '/home/web_user';
  const DESKTOP = HOME + '/Desktop';
  const CONFIG_DIR = HOME + '/.config/FT2 clone';

  const $ = (id) => document.getElementById(id);
  const stage = $('stage');
  const canvas = $('canvas');
  const overlay = $('overlay');
  const overlayText = $('overlay-text');
  const toastEl = $('toast');

  let persistent = false;

  // ---------- virtual filesystem ----------

  function mkdirs(path) {
    let current = '';
    for (const part of path.split('/').filter(Boolean)) {
      current += '/' + part;
      try { FS.mkdir(current); } catch (e) { /* exists */ }
    }
  }

  let syncTimer = 0;
  let syncRunning = false;
  let syncAgain = false;

  function persistNow() {
    if (!persistent)
      return;
    if (syncRunning) {
      syncAgain = true;
      return;
    }
    syncRunning = true;
    FS.syncfs(false, (err) => {
      syncRunning = false;
      if (err)
        console.warn('ft2: could not save files to browser storage', err);
      if (syncAgain) {
        syncAgain = false;
        persistNow();
      }
    });
  }

  function schedulePersist() {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(persistNow, 400);
  }

  Module.preRun = Module.preRun || [];
  Module.preRun.push(() => {
    FS.mount(FS.filesystems.IDBFS, {}, HOME);
    addRunDependency('ft2-idbfs');
    FS.syncfs(true, (err) => {
      if (err)
        console.warn('ft2: browser storage unavailable, files will not persist', err);
      else
        persistent = true;

      mkdirs(CONFIG_DIR);
      mkdirs(DESKTOP);
      installDemos();
      removeRunDependency('ft2-idbfs');
    });
  });

  // The public domain demo modules bundled at /demos are copied to the Desktop once
  function installDemos() {
    const marker = CONFIG_DIR + '/.demos-installed';
    if (FS.analyzePath(marker).exists || !FS.analyzePath('/demos').exists)
      return;
    for (const name of FS.readdir('/demos')) {
      if (!name.toLowerCase().endsWith('.xm'))
        continue;
      const target = DESKTOP + '/' + name;
      if (!FS.analyzePath(target).exists)
        FS.writeFile(target, FS.readFile('/demos/' + name));
    }
    FS.writeFile(marker, '');
    schedulePersist();
  }

  Module.postRun = Module.postRun || [];
  Module.postRun.push(() => {
    overlay.hidden = true;
    loadFromQueryString();
  });

  // Periodic safety net (config written on exit, directories created from Disk Op., deletions...)
  setInterval(persistNow, 10000);
  // "Auto save" config: the desktop version saves on exit, a tab just gets hidden and closed
  function autoSaveConfig() {
    if (Module._ft2web_autoSaveConfig)
      Module._ft2web_autoSaveConfig();
    persistNow();
  }
  document.addEventListener('visibilitychange', () => { if (document.hidden) autoSaveConfig(); });
  window.addEventListener('pagehide', autoSaveConfig);

  // ---------- audio ----------

  // SDL calls `new AudioContext()` when it opens the audio device: use the output rate chosen in
  // the tracker's config screen (44.1/48/96kHz) instead of the browser's default.
  const NativeAudioContext = window.AudioContext || window.webkitAudioContext;
  if (NativeAudioContext) {
    window.AudioContext = class extends NativeAudioContext {
      constructor(options) {
        const rate = Module.ft2WantedAudioRate;
        if (options === undefined && rate) {
          try {
            super({ sampleRate: rate, latencyHint: 'interactive' });
            return;
          } catch (e) {
            console.warn('ft2: ' + rate + 'Hz audio output not supported by this browser', e);
          }
        }
        super(options);
      }
    };
  }

  // ---------- messages ----------

  let toastTimer = 0;
  function toast(text, linkText, onLink) {
    toastEl.textContent = text;
    if (linkText) {
      const a = document.createElement('a');
      a.textContent = linkText;
      a.addEventListener('click', onLink);
      toastEl.append(' ', a);
    }
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 8000);
  }

  const baseName = (path) => path.substring(path.lastIndexOf('/') + 1);
  const displayPath = (path) => path.startsWith(HOME + '/') ? path.substring(HOME.length + 1) : path;

  function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function download(path) {
    const data = FS.readFile(path);
    const url = URL.createObjectURL(new Blob([data], { type: 'application/octet-stream' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = baseName(path);
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  // ---------- hooks called by the C code (web/ft2_web.c) ----------

  Module.ft2FileWritten = (path) => {
    schedulePersist();
    if (path.startsWith(HOME + '/.config/'))
      return; // FT2.CFG and friends
    toast('Saved ' + displayPath(path) + ' —', 'download', () => download(path));
  };

  Module.ft2AutoUpscaleFactor = (w, h) => {
    const rect = stage.getBoundingClientRect();
    return Math.max(1, Math.floor(Math.min(rect.width / w, rect.height / h)));
  };

  Module.ft2ToggleFullscreen = () => {
    if (document.fullscreenElement)
      document.exitFullscreen().catch(() => {});
    else if (stage.requestFullscreen)
      stage.requestFullscreen().catch((e) => toast('Fullscreen was refused by the browser (' + e.message + ')'));
  };

  Module.ft2ProgramEnded = () => {
    persistNow();
    overlayText.textContent = 'Fasttracker II has exited.';
    const button = document.createElement('button');
    button.textContent = 'Restart';
    button.addEventListener('click', () => location.reload());
    overlay.append(button);
    overlay.hidden = false;
  };

  Module.onAbort = (what) => {
    overlayText.textContent = 'Fasttracker II crashed: ' + what;
    overlay.hidden = false;
  };

  // ---------- loading files ----------

  function uniquePath(dir, name) {
    let path = dir + '/' + name;
    if (!FS.analyzePath(path).exists)
      return path;
    const dot = name.lastIndexOf('.');
    const stem = dot > 0 ? name.substring(0, dot) : name;
    const ext = dot > 0 ? name.substring(dot) : '';
    for (let i = 2; ; i++) {
      path = dir + '/' + stem + ' (' + i + ')' + ext;
      if (!FS.analyzePath(path).exists)
        return path;
    }
  }

  function sameContent(path, bytes) {
    try {
      const existing = FS.readFile(path);
      if (existing.length !== bytes.length)
        return false;
      for (let i = 0; i < bytes.length; i++)
        if (existing[i] !== bytes[i]) return false;
      return true;
    } catch (e) {
      return false;
    }
  }

  // Characters 128-255 of code page 850, the character set of the tracker's file lists
  const CP850_HIGH =
    'ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜø£Ø×ƒáíóúñÑªº¿®¬½¼¡«»░▒▓│┤ÁÂÀ©╣║╗╝¢¥┐└┴┬├─┼ãÃ╚╔╩╦╠═╬¤' +
    'ðÐÊËÈıÍÎÏ┘┌█▄¦Ì▀ÓßÔÒõÕµþÞÚÛÙýÝ¯´\u00AD±‗¾¶§÷¸°¨·¹³²■\u00A0';

  // File names must be representable in code page 850, or the tracker can't list or open them
  function trackerSafeName(name) {
    let out = '';
    for (const ch of name.normalize('NFC')) {
      const code = ch.codePointAt(0);
      const ok = (code >= 32 && code < 127 && ch !== '/') || CP850_HIGH.includes(ch);
      out += ok ? ch : '_';
    }
    return out.trim() || 'untitled';
  }

  // Stores the file on the Desktop (reusing an identical copy) and returns its path
  function storeFile(name, bytes) {
    name = trackerSafeName(name);
    const existing = DESKTOP + '/' + name;
    if (sameContent(existing, bytes))
      return existing;
    const path = uniquePath(DESKTOP, name);
    FS.writeFile(path, bytes);
    return path;
  }

  // Hands a file to the tracker like a desktop drag'n'drop. Retries while a system request is shown.
  function handToTracker(path, attempt = 0) {
    const accepted = Module.ccall('ft2web_dropFile', 'number', ['string'], [path]);
    if (!accepted && attempt < 150)
      setTimeout(() => handToTracker(path, attempt + 1), 200);
  }

  async function loadFiles(files) {
    const list = Array.from(files);
    if (list.length === 0)
      return;
    let first = null;
    for (const file of list) {
      const path = storeFile(file.name, new Uint8Array(await file.arrayBuffer()));
      if (first === null)
        first = path;
    }
    schedulePersist();
    if (list.length > 1)
      toast(list.length + ' files copied to Desktop/ — loading ' + baseName(first));
    handToTracker(first);
  }

  async function loadFromQueryString() {
    const url = new URLSearchParams(location.search).get('song');
    if (!url)
      return;
    try {
      const response = await fetch(url);
      if (!response.ok)
        throw new Error('HTTP ' + response.status);
      let name = decodeURIComponent(new URL(response.url, location.href).pathname.split('/').pop() || 'song.xm');
      const path = storeFile(name, new Uint8Array(await response.arrayBuffer()));
      schedulePersist();
      handToTracker(path);
    } catch (e) {
      toast('Could not fetch ' + url + ' (' + e.message + ')');
    }
  }

  // ---------- page UI ----------

  // keep keyboard input going to the tracker: page buttons must never keep the focus
  function blurActive() {
    if (document.activeElement && document.activeElement !== document.body)
      document.activeElement.blur();
  }

  $('btn-load').addEventListener('click', () => { blurActive(); $('file-input').click(); });
  $('file-input').addEventListener('change', (e) => {
    loadFiles(e.target.files);
    e.target.value = '';
    blurActive();
  });
  $('btn-fullscreen').addEventListener('click', () => { blurActive(); Module.ft2ToggleFullscreen(); });
  $('btn-about').addEventListener('click', () => { blurActive(); $('about-dialog').showModal(); });
  $('btn-files').addEventListener('click', () => { blurActive(); showFiles(); });

  for (const dialog of document.querySelectorAll('dialog')) {
    dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); }); // backdrop
    dialog.addEventListener('close', blurActive);
  }

  // while a page dialog is open, keys belong to it and not to the tracker (the tracker listens on window)
  window.addEventListener('keydown', (e) => {
    const open = document.querySelector('dialog[open]');
    if (!open)
      return;
    e.stopImmediatePropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      open.close();
    }
  }, true);
  window.addEventListener('keyup', (e) => {
    if (document.querySelector('dialog[open]'))
      e.stopImmediatePropagation();
  }, true);

  function listFiles(dir, out) {
    let names;
    try { names = FS.readdir(dir); } catch (e) { return out; }
    for (const name of names.sort((a, b) => a.localeCompare(b))) {
      if (name === '.' || name === '..' || name.startsWith('.'))
        continue;
      const path = dir + '/' + name;
      const stat = FS.stat(path);
      if (FS.isDir(stat.mode))
        listFiles(path, out);
      else
        out.push({ path, size: stat.size });
    }
    return out;
  }

  function showFiles() {
    const body = $('files-list');
    body.replaceChildren();
    const files = listFiles(HOME, []);
    if (files.length === 0) {
      const row = body.insertRow();
      const cell = row.insertCell();
      cell.className = 'muted';
      cell.textContent = 'No files yet. Load or drop some, or save from Disk Op.';
    }
    for (const file of files) {
      const row = body.insertRow();
      const name = row.insertCell();
      name.className = 'name';
      name.textContent = displayPath(file.path);
      const size = row.insertCell();
      size.className = 'size';
      size.textContent = formatSize(file.size);
      const actions = row.insertCell();
      actions.className = 'actions';
      const get = document.createElement('button');
      get.textContent = 'Download';
      get.tabIndex = -1;
      get.addEventListener('click', () => download(file.path));
      const del = document.createElement('button');
      del.textContent = 'Delete';
      del.className = 'delete';
      del.tabIndex = -1;
      del.addEventListener('click', () => {
        if (!confirm('Delete ' + displayPath(file.path) + ' from browser storage?'))
          return;
        try { FS.unlink(file.path); } catch (e) { /* already gone */ }
        schedulePersist();
        showFiles();
      });
      actions.append(get, ' ', del);
    }
    const dialog = $('files-dialog');
    if (!dialog.open)
      dialog.showModal();
  }

  // drag and drop anywhere on the page
  window.addEventListener('dragover', (e) => {
    if (e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    }
  });
  window.addEventListener('drop', (e) => {
    if (!e.dataTransfer || e.dataTransfer.files.length === 0)
      return;
    e.preventDefault();
    loadFiles(e.dataTransfer.files);
  });

  // the tracker uses the right mouse button everywhere
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  // keep the "Auto" window size fitted to the page
  const requestResize = () => { if (Module._ft2web_requestResize) Module._ft2web_requestResize(); };
  window.addEventListener('resize', requestResize);
  document.addEventListener('fullscreenchange', requestResize);

  window.addEventListener('beforeunload', (e) => {
    if (Module._ft2web_songIsModified && Module._ft2web_songIsModified()) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
})();
