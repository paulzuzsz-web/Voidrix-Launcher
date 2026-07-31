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

  /* ---------- Konten ---------- */
  handle('auth:bootstrap', () => {
    auth.ensureAdminAccount();
    currentUser = auth.restoreSession();
    return {
      user: currentUser,
      hasAccounts: auth.listUsers().length > 0,
      version: app.getVersion(),
      platform: process.platform,
      isDev,
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
        avatar: payload.avatar !== undefined ? library.importMedia(payload.avatar) : undefined,
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
    ({ id }) => {
      const result = library.deleteEntry(id);
      broadcast('library:changed', { reason: 'delete', id });
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

  handle('library:launch', ({ id }) => library.launch(id), { auth: true });
  handle('library:stop', ({ id }) => library.stop(id), { auth: true });
  handle('library:reveal', ({ id }) => library.revealInFolder(id), { auth: true });

  /* ---------- Dialoge / System ---------- */
  handle(
    'dialog:pickExecutable',
    async ({ title } = {}) => {
      const filters =
        process.platform === 'win32'
          ? [
              { name: 'Programme', extensions: ['exe', 'lnk', 'bat', 'cmd', 'url', 'msi'] },
              { name: 'Alle Dateien', extensions: ['*'] },
            ]
          : [{ name: 'Alle Dateien', extensions: ['*'] }];

      const result = await dialog.showOpenDialog(mainWindow, {
        title: title || 'Programmdatei auswählen',
        properties: ['openFile', 'dontAddToRecent'],
        filters,
      });
      return result.canceled ? null : result.filePaths[0];
    },
    { auth: true }
  );

  handle(
    'dialog:pickImage',
    async ({ multiple } = {}) => {
      const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Bild auswählen',
        properties: multiple ? ['openFile', 'multiSelections'] : ['openFile'],
        filters: [{ name: 'Bilder', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp', 'svg'] }],
      });
      if (result.canceled) return multiple ? [] : null;
      const refs = result.filePaths.map((p) => library.importMedia(p));
      return multiple ? refs : refs[0];
    },
    { auth: true }
  );

  handle(
    'dialog:pickFolder',
    async () => {
      const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Ordner auswählen',
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

    store.ensureDir(store.dataDir());
    store.ensureDir(store.mediaDir());
    store.catalogPath(); // legt Games-Apps.json an, falls sie fehlt
    auth.ensureAdminAccount();

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
