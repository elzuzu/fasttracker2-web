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
      removeRunDependency('ft2-idbfs');
    });
  });

  // the embedded /demos files only exist once the runtime is initialized (after preRun)
  Module.onRuntimeInitialized = installDemos;

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

  // ZIP archive holding one file, stored without compression (the file is kept byte for byte)
  const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++)
        c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      table[n] = c >>> 0;
    }
    return table;
  })();

  function crc32(bytes) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++)
      c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  function zipOneFile(name, bytes) {
    const nameBytes = new TextEncoder().encode(name);
    const crc = crc32(bytes);
    const now = new Date();
    const time = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
    const date = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034B50, true); // local file header
    local.setUint16(4, 20, true);         // version needed
    local.setUint16(6, 0x0800, true);     // UTF-8 file name
    local.setUint16(8, 0, true);          // stored
    local.setUint16(10, time, true);
    local.setUint16(12, date, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, bytes.length, true);
    local.setUint32(22, bytes.length, true);
    local.setUint16(26, nameBytes.length, true);

    const central = new DataView(new ArrayBuffer(46));
    central.setUint32(0, 0x02014B50, true); // central directory header
    central.setUint16(4, 20, true);
    central.setUint16(6, 20, true);
    central.setUint16(8, 0x0800, true);
    central.setUint16(12, time, true);
    central.setUint16(14, date, true);
    central.setUint32(16, crc, true);
    central.setUint32(20, bytes.length, true);
    central.setUint32(24, bytes.length, true);
    central.setUint16(28, nameBytes.length, true);
    central.setUint32(42, 0, true);          // offset of the local header

    const centralOffset = 30 + nameBytes.length + bytes.length;
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054B50, true); // end of central directory
    end.setUint16(8, 1, true);
    end.setUint16(10, 1, true);
    end.setUint32(12, 46 + nameBytes.length, true);
    end.setUint32(16, centralOffset, true);

    return new Blob([local, nameBytes, bytes, central, nameBytes, end], { type: 'application/zip' });
  }

  // Inside a claude.ai artifact, pages can't start downloads themselves: the platform's
  // "downloads" capability asks the viewer instead, and only accepts common extensions
  // (not .xm, .wav...), so the file travels inside a .zip there.
  const artifactHost = typeof window.claude === 'object' && window.claude && typeof window.claude.use === 'function';

  async function download(path) {
    const name = baseName(path);
    const data = FS.readFile(path);

    if (artifactHost) {
      const downloads = await window.claude.use('downloads');
      if (!downloads) {
        toast('Downloads are not available in this view.');
        return;
      }
      const dot = name.lastIndexOf('.');
      const zipName = (dot > 0 ? name.substring(0, dot) : name) + '.zip';
      try {
        await downloads.save({ filename: zipName, data: zipOneFile(name, data) });
      } catch (e) {
        if (e && e.code === 'declined')
          return;
        if (e && e.code === 'rate_limited')
          toast('A download is already waiting for your answer.');
        else
          toast('Could not download ' + name + ' here (' + ((e && (e.message || e.code)) || 'unavailable') + ').');
      }
      return;
    }

    const url = URL.createObjectURL(new Blob([data], { type: 'application/octet-stream' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
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

  // ---------- screen size ----------
  //
  // The canvas is SCREEN_W*n x SCREEN_H*n device pixels. With "Auto" window size, n is the largest
  // whole number of device pixels per tracker pixel that fits the page (pixel-perfect: on a 2x
  // display that allows 1.5x, 2.5x...). When that would leave more than a fifth of the room unused,
  // the screen is instead scaled to fill the page (smoothed), from the next larger canvas.
  const SCREEN_W = 632, SCREEN_H = 400;
  let autoMode = true;

  const dpr = () => window.devicePixelRatio || 1;
  function fitScale() { // CSS pixels per tracker pixel that fill the stage
    const rect = stage.getBoundingClientRect();
    return Math.max(0.1, Math.min(rect.width / SCREEN_W, rect.height / SCREEN_H));
  }
  function pixelPerfectFactor() {
    const exact = Math.floor(fitScale() * dpr() + 1e-6);
    return exact >= 1 && exact >= 0.8 * fitScale() * dpr() ? exact : 0;
  }

  Module.ft2AutoUpscaleFactor = () => {
    autoMode = true;
    return pixelPerfectFactor() || Math.max(1, Math.ceil(fitScale() * dpr() - 1e-6));
  };

  Module.ft2FixedUpscaleFactor = (factor) => {
    autoMode = false;
    return factor * Math.max(1, Math.round(dpr()));
  };

  Module.ft2CanvasCssScale = (canvasWidth) => {
    const n = canvasWidth / SCREEN_W;
    if (!autoMode || n === pixelPerfectFactor())
      return n / dpr();
    return fitScale();
  };

  function applyCanvasCss() {
    if (!canvas.width)
      return;
    const scale = Module.ft2CanvasCssScale(canvas.width);
    const devicePixels = scale * dpr();
    canvas.style.width = (SCREEN_W * scale) + 'px';
    canvas.style.height = (SCREEN_H * scale) + 'px';
    canvas.style.imageRendering = Math.abs(devicePixels - Math.round(devicePixels)) < 1e-3 ? 'pixelated' : 'auto';
  }
  new MutationObserver(applyCanvasCss).observe(canvas, { attributes: true, attributeFilter: ['width', 'height'] });

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
      // two-step delete: the first click arms the button for a few seconds
      let armTimer = 0;
      del.addEventListener('click', () => {
        if (!del.classList.contains('armed')) {
          del.classList.add('armed');
          del.textContent = 'Really delete?';
          armTimer = setTimeout(() => { del.classList.remove('armed'); del.textContent = 'Delete'; }, 4000);
          return;
        }
        clearTimeout(armTimer);
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

  // page#debug: a status line for diagnosing the page where the developer tools can't reach it
  if (location.hash === '#debug') {
    const line = document.createElement('div');
    line.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:9;padding:2px 8px;font:11px ui-monospace,monospace;background:#000c;color:#9f9;pointer-events:none;white-space:pre-wrap';
    document.body.append(line);
    let pointers = 0, keys = 0, lastError = '';
    window.addEventListener('pointerdown', () => pointers++, true);
    window.addEventListener('keydown', () => keys++, true);
    window.addEventListener('error', (e) => { lastError = String(e.message || e.error); });
    window.addEventListener('unhandledrejection', (e) => { lastError = 'promise: ' + String(e.reason && (e.reason.message || e.reason)); });
    const started = performance.now();
    setInterval(() => {
      const ctx = Module.SDL2 && Module.SDL2.audioContext;
      line.textContent = 't ' + ((performance.now() - started) / 1000).toFixed(1) + 's · frames ' + (Module.ft2Frames | 0) +
        ' · pointer ' + pointers + ' · keys ' + keys + ' · hidden ' + document.hidden + ' · focus ' + document.hasFocus() +
        ' · audio ' + (ctx ? ctx.state + ' ' + ctx.sampleRate : 'none') + ' · persistent ' + persistent +
        ' · claude ' + artifactHost + (lastError ? '\nerror: ' + lastError : '');
    }, 250);
  }

  // the tracker uses the right mouse button everywhere
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  // keep the "Auto" window size fitted to the page
  const requestResize = () => {
    applyCanvasCss(); // fractional scaling follows the page right away, the canvas follows next frame
    if (Module._ft2web_requestResize)
      Module._ft2web_requestResize();
  };
  window.addEventListener('resize', requestResize);
  document.addEventListener('fullscreenchange', requestResize);

  window.addEventListener('beforeunload', (e) => {
    if (Module._ft2web_songIsModified && Module._ft2web_songIsModified()) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
})();
