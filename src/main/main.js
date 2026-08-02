'use strict';

/**
 * Voidrix Launcher - Hauptprozess.
 *
 * Aufgaben:
 *  - Fenster (rahmenlos, eigene Titelleiste)
 *  - eigene Protokolle: app:// für das UI, vximg:// für lokale Bilder
 *  - IPC-Schnittstelle für Konten, Katalog und Programmstart
 */

const { app, BrowserWindow, Menu, dialog, ipcMain, protocol, shell, nativeTheme } = require('electron');
const fs = require('fs');
const path = require('path');

const store = require('./store');
const auth = require('./auth');
const library = require('./library');
const updater = require('./updater');

const RENDERER_DIR = path.join(__dirname, '..', 'renderer');
const APP_ORIGIN = 'app://voidrix';
const isDev = !app.isPackaged || process.argv.includes('--dev');

/** Aktuell angemeldeter Benutzer - Quelle der Wahrheit für Rechte. */
let currentUser = null;
/** @type {BrowserWindow|null} */
let mainWindow = null;

/* --------------------------------------------------------------------- */
/* Vorbereitung                                                           */
/* --------------------------------------------------------------------- */

// In der Entwicklung liegen die Daten im Projekt (leicht zu finden/löschen).
if (isDev && !app.isPackaged) {
  app.setPath('userData', path.join(app.getAppPath(), '.voidrix-data'));
}

// Deutsche Oberflaeche (u.a. für Datumsfelder und Kontextmenues).
app.commandLine.appendSwitch('lang', 'de-DE');

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
  },
  {
    scheme: 'vximg',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
  },
]);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
};

function mimeFor(file) {
  return MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
}

function fileResponse(absPath, status = 200) {
  try {
    const body = fs.readFileSync(absPath);
    return new Response(body, {
      status,
      headers: { 'content-type': mimeFor(absPath), 'cache-control': 'no-cache' },
    });
  } catch {
    return new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain' } });
  }
}

function registerProtocols() {
  // UI-Dateien: app://voidrix/index.html
  protocol.handle('app', (request) => {
    const url = new URL(request.url);
    const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
    const abs = path.join(RENDERER_DIR, rel);
    if (!abs.startsWith(RENDERER_DIR)) {
      return new Response('Forbidden', { status: 403 });
    }
    return fileResponse(abs);
  });

  // Lokale Bilder: vximg://img/?ref=media/xyz.png
  protocol.handle('vximg', (request) => {
    try {
      const ref = new URL(request.url).searchParams.get('ref');
      const abs = library.resolveMediaPath(ref);
      if (!abs || !store.fileExists(abs)) return new Response('Not found', { status: 404 });
      return fileResponse(abs);
    } catch {
      return new Response('Bad request', { status: 400 });
    }
  });
}

/* --------------------------------------------------------------------- */
/* Fenster                                                                */
/* --------------------------------------------------------------------- */

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    frame: false,
    backgroundColor: '#07060e',
    title: 'Voidrix Launcher',
    icon: resolveAppIcon(),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
      devTools: true,
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (isDev && process.argv.includes('--devtools')) mainWindow.webContents.openDevTools({ mode: 'detach' });
  });

  const sendState = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.webContents.send('window:state', {
      maximized: mainWindow.isMaximized(),
      fullscreen: mainWindow.isFullScreen(),
    });
  };
  mainWindow.on('maximize', sendState);
  mainWindow.on('unmaximize', sendState);
  mainWindow.on('enter-full-screen', sendState);
  mainWindow.on('leave-full-screen', sendState);
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Externe Links immer im Browser öffnen, nie im Launcher-Fenster.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(APP_ORIGIN)) {
      event.preventDefault();
      if (/^https?:/i.test(url)) shell.openExternal(url);
    }
  });

  // F12 / Strg+Shift+I für die DevTools, F5 zum Neuladen.
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const key = (input.key || '').toLowerCase();
    if (key === 'f12' || (input.control && input.shift && key === 'i')) {
      mainWindow.webContents.toggleDevTools();
      event.preventDefault();
    } else if (key === 'f5' || (input.control && key === 'r')) {
      mainWindow.webContents.reload();
      event.preventDefault();
    }
  });

  mainWindow.loadURL(`${APP_ORIGIN}/index.html`);
  return mainWindow;
}

function resolveAppIcon() {
  const candidates = [
    path.join(app.getAppPath(), 'build', 'icon.png'),
    path.join(process.resourcesPath || '', 'build', 'icon.png'),
  ];
  return candidates.find((p) => store.fileExists(p)) || undefined;
}

/* --------------------------------------------------------------------- */
/* Datenordner                                                            */
/* --------------------------------------------------------------------- */

/** Was im gewählten Ordner angelegt wird - für die Vorschau im Einrichtungs-Bildschirm. */
const FOLDER_PREVIEW = [
  { name: 'Games-Apps.json', type: 'file', info: 'Alle Titel und die Pfade zu den .exe-Dateien' },
  { name: 'konten', type: 'dir', info: 'Benutzerkonten und gespeicherte Anmeldung' },
  { name: 'media', type: 'dir', info: 'banner, cover, icons, screenshots, profilbilder' },
  { name: 'spiele', type: 'dir', info: 'Platz für eigene Installationen' },
  { name: 'sicherungen', type: 'dir', info: 'Automatische Kopien der Games-Apps.json' },
  { name: 'updates', type: 'dir', info: 'Heruntergeladene Launcher-Updates' },
];

/** Ordnerstruktur sicherstellen und den Admin-Zugang anlegen. */
function prepareDataFolder() {
  store.createStructure(store.dataDir());
  auth.ensureAdminAccount();
}

/** Startordner für Dateidialoge: zum Hochladen die Downloads, sonst spiele/. */
function startDir(kind) {
  try {
    if (kind === 'downloads') return app.getPath('downloads');
  } catch {
    /* nicht überall vorhanden */
  }
  const games = store.gamesDir();
  return store.isWritableDir(games) ? games : undefined;
}

function setupStatus() {
  const configured = store.isConfigured();
  return {
    configured,
    suggestion: store.suggestDataRoot(),
    folders: FOLDER_PREVIEW,
    paths: configured ? store.paths() : null,
    version: app.getVersion(),
    platform: process.platform,
  };
}

/* --------------------------------------------------------------------- */
/* IPC                                                                    */
/* --------------------------------------------------------------------- */

/** Wrapper: Ergebnis immer als { ok, data } / { ok:false, error } liefern. */
function handle(channel, fn, { auth: needsAuth = false, admin = false } = {}) {
  ipcMain.handle(channel, async (event, payload) => {
    try {
      if (!isTrustedSender(event)) throw new Error('Ungültiger Absender.');
      if ((needsAuth || admin) && !currentUser) throw new Error('Bitte zuerst anmelden.');
      if (admin && currentUser.role !== 'admin') {
        throw new Error('Nur Administratoren dürfen das.');
      }
      const data = await fn(payload ?? {}, event);
      return { ok: true, data };
    } catch (err) {
      return {
        ok: false,
        error: { message: err?.message || 'Unbekannter Fehler', field: err?.field || null },
      };
    }
  });
}

function isTrustedSender(event) {
  const url = event.senderFrame?.url || event.sender.getURL();
  return !url || url.startsWith(APP_ORIGIN);
}

function broadcast(channel, payload) {
  BrowserWindow.getAllWindows().forEach((win) => {
    if (!win.isDestroyed()) win.webContents.send(channel, payload);
  });
}

function registerIpc() {
  /* ---------- Fenster ---------- */
  handle('window:minimize', () => {
    mainWindow?.minimize();
    return true;
  });
  handle('window:toggleMaximize', () => {
    if (!mainWindow) return false;
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
    return mainWindow.isMaximized();
  });
  handle('window:close', () => {
    mainWindow?.close();
    return true;
  });
  handle('window:isMaximized', () => Boolean(mainWindow?.isMaximized()));

  /* ---------- Ersteinrichtung: Datenordner ---------- */
  handle('setup:status', () => setupStatus());

  handle('setup:pickFolder', async ({ current } = {}) => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Ordner für die Voidrix-Daten wählen',
      defaultPath: current || store.suggestDataRoot(),
      buttonLabel: 'Diesen Ordner nehmen',
      properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled) return null;
    const folder = result.filePaths[0];
    return { folder, writable: store.isWritableDir(folder) };
  });

  /** Legt die Ordnerstruktur an und schaltet den Launcher frei. */
  handle('setup:apply', ({ folder }) => {
    // Nur bei der Ersteinrichtung erlaubt - danach geht es über setup:changeFolder.
    if (store.isConfigured()) {
      throw new Error('Der Datenordner ist bereits eingerichtet.');
    }
    const result = store.setDataRoot(folder);
    prepareDataFolder();
    return { ...result, ...setupStatus() };
  });

  /** Datenordner nachträglich verschieben (nur Admin) - danach Neustart. */
  handle(
    'setup:changeFolder',
    ({ folder, restart = true }) => {
      const result = store.setDataRoot(folder);
      prepareDataFolder();
      if (restart) {
        setTimeout(() => {
          app.relaunch();
          app.exit(0);
        }, 900);
      }
      return { ...result, ...setupStatus() };
    },
    { admin: true }
  );

  /* ---------- Konten ---------- */
  handle('auth:bootstrap', () => {
    if (!store.isConfigured()) {
      return { needsSetup: true, user: null, ...setupStatus() };
    }
    prepareDataFolder();
    currentUser = auth.restoreSession();
    return {
      needsSetup: false,
      user: currentUser,
      hasAccounts: auth.listUsers().length > 0,
      version: app.getVersion(),
      platform: process.platform,
      isDev,
      ...setupStatus(),
    };
  });

  handle('auth:register', (payload) => {
    currentUser = auth.register(payload);
    return currentUser;
  });

  handle('auth:login', (payload) => {
    currentUser = auth.login(payload);
    return currentUser;
  });

  handle('auth:logout', () => {
    if (currentUser) auth.logout(currentUser.id);
    currentUser = null;
    return true;
  });

  handle('auth:me', () => currentUser, { auth: true });

  handle(
    'auth:updateProfile',
    (payload) => {
      currentUser = auth.updateProfile(currentUser.id, {
        ...payload,
        avatar:
          payload.avatar !== undefined ? library.importMedia(payload.avatar, 'profilbilder') : undefined,
      });
      return currentUser;
    },
    { auth: true }
  );

  handle(
    'auth:changePassword',
    (payload) => {
      currentUser = auth.changePassword(currentUser.id, payload);
      return currentUser;
    },
    { auth: true }
  );

  handle('users:list', () => auth.listUsers(), { admin: true });

  handle(
    'users:setRole',
    ({ userId, role }) => {
      const updated = auth.setRole(currentUser.id, userId, role);
      if (updated.id === currentUser.id) currentUser = updated;
      return updated;
    },
    { admin: true }
  );

  handle('users:delete', ({ userId }) => auth.deleteUser(currentUser.id, userId), { admin: true });

  /* ---------- Katalog ---------- */
  handle('library:list', () => library.listApps(), { auth: true });
  handle('library:get', ({ id }) => library.getApp(id), { auth: true });
  handle('library:info', () => library.catalogInfo(), { auth: true });

  handle(
    'library:save',
    (payload) => {
      const saved = library.saveEntry(payload, currentUser);
      broadcast('library:changed', { reason: 'save', id: saved.id });
      return saved;
    },
    { admin: true }
  );

  handle(
    'library:delete',
    ({ id, withFiles }) => {
      const result = library.deleteEntry(id, { withFiles: Boolean(withFiles) });
      broadcast('library:changed', { reason: 'delete', id });
      return result;
    },
    { admin: true }
  );

  /** Programmdatei oder ganzen Spiel-Ordner in den Ordner spiele/ kopieren. */
  handle(
    'library:upload',
    async ({ sourcePath, mode, title }, event) => {
      const result = await library.uploadExecutable({ sourcePath, mode, title }, (progress) => {
        if (!event.sender.isDestroyed()) event.sender.send('library:upload-progress', progress);
      });
      broadcast('library:changed', { reason: 'upload' });
      return result;
    },
    { admin: true }
  );

  handle(
    'library:setExePath',
    ({ id, exePath }) => {
      const updated = library.setExePath(id, exePath);
      broadcast('library:changed', { reason: 'path', id });
      return updated;
    },
    { auth: true }
  );

  /* ---------- Installieren per Download-Link ---------- */

  handle(
    'library:install',
    async ({ id }, event) => {
      const entry = await library.installEntry(id, (progress) => {
        if (!event.sender.isDestroyed()) event.sender.send('library:download-progress', progress);
      });
      broadcast('library:changed', { reason: 'install', id });
      return entry;
    },
    { auth: true }
  );

  handle('library:cancelInstall', ({ id }) => library.cancelInstall(id), { auth: true });

  handle(
    'library:uninstall',
    ({ id }) => {
      const entry = library.uninstallEntry(id);
      broadcast('library:changed', { reason: 'uninstall', id });
      return entry;
    },
    { auth: true }
  );

  /** Link im Admin-Formular prüfen: Dateiname und Größe anzeigen. */
  handle('library:probeDownload', ({ url }) => library.probeDownload(url), { admin: true });

  handle('library:launch', ({ id }) => library.launch(id), { auth: true });
  handle('library:stop', ({ id }) => library.stop(id), { auth: true });
  handle('library:reveal', ({ id }) => library.revealInFolder(id), { auth: true });

  /* ---------- Launcher-Update ---------- */

  handle('update:check', ({ silent } = {}) => updater.check({ silent: Boolean(silent) }), { auth: true });

  /** Soll beim Start automatisch gesucht werden? */
  handle('update:autoCheck', async () => {
    if (!updater.shouldAutoCheck()) return { skip: true };
    try {
      return await updater.check({ silent: true });
    } catch (err) {
      // Kein Netz o.ä. soll den Start nicht stören.
      return { skip: true, error: err.message };
    }
  }, { auth: true });

  handle(
    'update:download',
    async ({ url, version }, event) => {
      const result = await updater.downloadUpdate({ url, version }, (progress) => {
        if (!event.sender.isDestroyed()) event.sender.send('update:progress', progress);
      });
      return result;
    },
    { auth: true }
  );

  handle('update:cancel', () => updater.cancel(), { auth: true });
  handle('update:install', ({ file }) => updater.install(file), { auth: true });
  handle('update:settings', () => updater.config(), { auth: true });
  handle('update:saveSettings', (patch) => updater.saveConfig(patch), { admin: true });

  /* ---------- Dialoge / System ---------- */
  handle(
    'dialog:pickExecutable',
    async ({ title, start } = {}) => {
      const filters =
        process.platform === 'win32'
          ? [
              { name: 'Programme', extensions: ['exe', 'lnk', 'bat', 'cmd', 'url', 'msi'] },
              { name: 'Alle Dateien', extensions: ['*'] },
            ]
          : [{ name: 'Alle Dateien', extensions: ['*'] }];

      const result = await dialog.showOpenDialog(mainWindow, {
        title: title || 'Programmdatei auswählen',
        defaultPath: startDir(start),
        properties: ['openFile', 'dontAddToRecent'],
        filters,
      });
      return result.canceled ? null : result.filePaths[0];
    },
    { auth: true }
  );

  handle(
    'dialog:pickImage',
    async ({ multiple, kind } = {}) => {
      const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Bild auswählen',
        properties: multiple ? ['openFile', 'multiSelections'] : ['openFile'],
        filters: [{ name: 'Bilder', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp', 'svg'] }],
      });
      if (result.canceled) return multiple ? [] : null;
      // Das Bild wandert direkt in den passenden Unterordner von media/.
      const refs = result.filePaths.map((p) => library.importMedia(p, kind));
      return multiple ? refs : refs[0];
    },
    { auth: true }
  );

  handle(
    'dialog:pickFolder',
    async ({ start } = {}) => {
      const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Ordner auswählen',
        defaultPath: startDir(start),
        properties: ['openDirectory'],
      });
      return result.canceled ? null : result.filePaths[0];
    },
    { auth: true }
  );

  handle(
    'shell:openPath',
    async ({ target }) => {
      const map = {
        catalog: store.catalogPath(),
        catalogFolder: path.dirname(store.catalogPath()),
        data: store.dataDir(),
        media: store.ensureDir(store.mediaDir()),
        games: store.ensureDir(store.gamesDir()),
        backups: store.ensureDir(store.backupDir()),
        accounts: path.dirname(store.accountsPath()),
      };
      const p = map[target] || target;
      const err = await shell.openPath(p);
      if (err) throw new Error(err);
      return true;
    },
    { auth: true }
  );

  handle(
    'shell:openExternal',
    async ({ url }) => {
      if (!/^https?:\/\//i.test(String(url))) throw new Error('Nur http(s)-Links sind erlaubt.');
      await shell.openExternal(url);
      return true;
    },
    { auth: true }
  );

  handle('app:info', () => ({
    version: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    platform: process.platform,
    arch: process.arch,
    isDev,
    ...library.catalogInfo(),
  }));
}

/* --------------------------------------------------------------------- */
/* Start                                                                  */
/* --------------------------------------------------------------------- */

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    nativeTheme.themeSource = 'dark';
    Menu.setApplicationMenu(null);

    registerProtocols();
    registerIpc();

    // Erst wenn ein Datenordner gewählt wurde, werden Dateien angelegt.
    if (store.isConfigured()) prepareDataFolder();

    library.onRunningChanged((entry) => broadcast('library:running', entry));

    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}

process.on('uncaughtException', (err) => {
  console.error('[voidrix] Unerwarteter Fehler:', err);
  if (app.isReady()) {
    dialog.showErrorBox('Voidrix Launcher', String(err?.stack || err));
  }
});
