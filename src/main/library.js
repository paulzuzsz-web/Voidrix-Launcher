'use strict';

/**
 * Der Katalog: Games-Apps.json lesen/schreiben, Medien importieren,
 * Installation erkennen und Programme starten.
 */

const { shell } = require('electron');
const { spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const store = require('./store');

const EMPTY_CATALOG = { $schema: 'voidrix-catalog/1', version: 1, apps: [] };

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.bmp', '.svg']);
const URI_RE = /^[a-z][a-z0-9+.-]*:\/\//i;

/** id -> { child, startedAt } für alles was gerade läuft. */
const running = new Map();
let runningListener = null;

class LibraryError extends Error {
  constructor(message) {
    super(message);
    this.name = 'LibraryError';
  }
}

/* --------------------------------------------------------------------- */
/* Lesen / Schreiben                                                      */
/* --------------------------------------------------------------------- */

function readCatalog() {
  const data = store.readJson(store.catalogPath(), EMPTY_CATALOG);
  if (!Array.isArray(data.apps)) data.apps = [];
  data.apps = data.apps.map(normalizeEntry);
  return data;
}

function writeCatalog(data) {
  data.version = 1;
  data.$schema = 'voidrix-catalog/1';
  data.updatedAt = new Date().toISOString();
  return store.writeJson(store.catalogPath(), data);
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

function newId(title) {
  const base = slugify(title) || 'app';
  return `${base}-${crypto.randomBytes(3).toString('hex')}`;
}

/** Sorgt dafür, dass auch von Hand geschriebene Einträge vollständig sind. */
function normalizeEntry(raw) {
  const entry = typeof raw === 'object' && raw ? { ...raw } : {};
  const title = String(entry.title || entry.name || 'Unbenannt').trim();

  return {
    id: String(entry.id || newId(title)),
    title,
    type: entry.type === 'app' ? 'app' : 'game',
    developer: String(entry.developer || 'Voidrix Studios'),
    publisher: String(entry.publisher || entry.developer || 'Voidrix'),
    description: String(entry.description || ''),
    shortDescription: String(entry.shortDescription || ''),
    banner: String(entry.banner || ''),
    cover: String(entry.cover || ''),
    icon: String(entry.icon || ''),
    screenshots: Array.isArray(entry.screenshots) ? entry.screenshots.map(String) : [],
    tags: Array.isArray(entry.tags) ? entry.tags.map((t) => String(t).trim()).filter(Boolean) : [],
    version: String(entry.version || '1.0.0'),
    size: String(entry.size || ''),
    releaseDate: String(entry.releaseDate || ''),
    price: String(entry.price || 'Kostenlos'),
    // Der wichtigste Wert: hier traegt man ein, wo die .exe liegt.
    exePath: String(entry.exePath || entry.path || ''),
    args: Array.isArray(entry.args) ? entry.args.map(String) : [],
    workingDir: String(entry.workingDir || ''),
    website: String(entry.website || ''),
    featured: Boolean(entry.featured),
    accentColor: String(entry.accentColor || '#8b5cf6'),
    addedBy: String(entry.addedBy || ''),
    addedAt: String(entry.addedAt || new Date().toISOString()),
    updatedAt: String(entry.updatedAt || ''),
    lastPlayedAt: entry.lastPlayedAt || null,
    launchCount: Number(entry.launchCount) || 0,
    playtimeMinutes: Number(entry.playtimeMinutes) || 0,
  };
}

/* --------------------------------------------------------------------- */
/* Medien                                                                 */
/* --------------------------------------------------------------------- */

/**
 * Löst eine Bildangabe in einen echten Dateipfad auf.
 * Erlaubt sind: "media/xy.png", absolute Pfade und Pfade relativ zur
 * Games-Apps.json. http(s)- und data-URLs werden direkt vom UI geladen.
 */
function resolveMediaPath(ref) {
  const value = String(ref || '').trim();
  if (!value) return null;
  if (/^(https?|data):/i.test(value)) return null;

  const mediaRoot = store.mediaDir();
  if (value.startsWith('media/') || value.startsWith('media\\')) {
    const rel = value.slice('media/'.length).replace(/\\/g, '/');
    const full = path.resolve(mediaRoot, rel);
    if (!full.startsWith(path.resolve(mediaRoot))) return null; // kein Ausbrechen
    return full;
  }
  if (path.isAbsolute(value)) return value;
  return path.resolve(path.dirname(store.catalogPath()), value);
}

/** Kopiert ein Bild in den media-Ordner und gibt die Referenz zurück. */
function importMedia(sourcePath) {
  const src = String(sourcePath || '').trim();
  if (!src) return '';
  if (/^(https?|data):/i.test(src)) return src; // URLs bleiben wie sie sind
  if (src.startsWith('media/')) return src; // schon importiert

  if (!store.fileExists(src)) throw new LibraryError(`Bilddatei nicht gefunden: ${src}`);

  const ext = path.extname(src).toLowerCase();
  if (!IMAGE_EXTS.has(ext)) {
    throw new LibraryError(`Nicht unterstütztes Bildformat: ${ext || '(keines)'}`);
  }

  const buf = fs.readFileSync(src);
  const hash = crypto.createHash('sha1').update(buf).digest('hex').slice(0, 16);
  const fileName = `${hash}${ext}`;
  const target = path.join(store.ensureDir(store.mediaDir()), fileName);
  if (!store.fileExists(target)) fs.writeFileSync(target, buf);
  return `media/${fileName}`;
}

function importMediaList(list) {
  if (!Array.isArray(list)) return [];
  return list.map((item) => importMedia(item)).filter(Boolean);
}

/* --------------------------------------------------------------------- */
/* Abfragen                                                               */
/* --------------------------------------------------------------------- */

function isInstalled(entry) {
  const p = String(entry.exePath || '').trim();
  if (!p) return false;
  if (URI_RE.test(p)) return true; // steam://, com.epicgames.launcher://, ...
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

/** Einträge inkl. Laufzeit-Infos für das UI. */
function decorate(entry) {
  const state = running.get(entry.id);
  return {
    ...entry,
    installed: isInstalled(entry),
    running: Boolean(state),
    runningSince: state ? state.startedAt : null,
    exeExists: entry.exePath ? isInstalled(entry) : false,
  };
}

function listApps() {
  return readCatalog().apps.map(decorate);
}

function getApp(id) {
  const entry = readCatalog().apps.find((a) => a.id === id);
  return entry ? decorate(entry) : null;
}

function catalogInfo() {
  const file = store.catalogPath();
  let bytes = 0;
  try {
    bytes = fs.statSync(file).size;
  } catch {
    /* egal */
  }
  return {
    catalogPath: file,
    dataDir: store.dataDir(),
    mediaDir: store.mediaDir(),
    accountsPath: store.accountsPath(),
    bytes,
    count: readCatalog().apps.length,
  };
}

/* --------------------------------------------------------------------- */
/* Schreiben (Admin)                                                      */
/* --------------------------------------------------------------------- */

function validateEntry(input) {
  const title = String(input.title || '').trim();
  if (title.length < 2) throw new LibraryError('Bitte einen Titel mit mindestens 2 Zeichen angeben.');
  if (title.length > 60) throw new LibraryError('Der Titel darf maximal 60 Zeichen lang sein.');
  const description = String(input.description || '').trim();
  if (description.length > 4000) throw new LibraryError('Die Beschreibung ist zu lang (max. 4000 Zeichen).');
  return title;
}

/** Legt einen Eintrag an oder aktualisiert ihn (nur Admin). */
function saveEntry(input, user) {
  const title = validateEntry(input);
  const data = readCatalog();
  const now = new Date().toISOString();

  const existingIndex = input.id ? data.apps.findIndex((a) => a.id === input.id) : -1;
  const existing = existingIndex >= 0 ? data.apps[existingIndex] : null;

  const merged = normalizeEntry({
    ...(existing || {}),
    ...input,
    title,
    id: existing ? existing.id : input.id || newId(title),
    banner: importMedia(input.banner ?? existing?.banner ?? ''),
    cover: importMedia(input.cover ?? existing?.cover ?? ''),
    icon: importMedia(input.icon ?? existing?.icon ?? ''),
    screenshots: importMediaList(input.screenshots ?? existing?.screenshots ?? []),
    tags: Array.isArray(input.tags)
      ? input.tags
      : String(input.tags || '')
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
    args: Array.isArray(input.args)
      ? input.args
      : splitArgs(String(input.args || '')),
    addedBy: existing?.addedBy || (user ? user.profileName || user.username : ''),
    addedAt: existing?.addedAt || now,
    updatedAt: now,
  });

  if (existingIndex >= 0) data.apps[existingIndex] = merged;
  else data.apps.push(merged);

  writeCatalog(data);
  return decorate(merged);
}

function splitArgs(value) {
  const out = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m;
  while ((m = re.exec(value))) out.push(m[1] ?? m[2] ?? m[3]);
  return out;
}

function deleteEntry(id) {
  const data = readCatalog();
  const before = data.apps.length;
  data.apps = data.apps.filter((a) => a.id !== id);
  if (data.apps.length === before) throw new LibraryError('Eintrag nicht gefunden.');
  writeCatalog(data);
  return true;
}

/** Speichert den .exe-Pfad - der Kern von "installiert oder nicht". */
function setExePath(id, exePath) {
  const data = readCatalog();
  const entry = data.apps.find((a) => a.id === id);
  if (!entry) throw new LibraryError('Eintrag nicht gefunden.');
  entry.exePath = String(exePath || '').trim();
  entry.updatedAt = new Date().toISOString();
  writeCatalog(data);
  return decorate(entry);
}

function patchEntry(id, patch) {
  const data = readCatalog();
  const idx = data.apps.findIndex((a) => a.id === id);
  if (idx < 0) throw new LibraryError('Eintrag nicht gefunden.');
  data.apps[idx] = normalizeEntry({ ...data.apps[idx], ...patch });
  writeCatalog(data);
  return decorate(data.apps[idx]);
}

/* --------------------------------------------------------------------- */
/* Starten                                                                */
/* --------------------------------------------------------------------- */

function onRunningChanged(cb) {
  runningListener = cb;
}

function notifyRunning(id) {
  if (runningListener) {
    try {
      runningListener(getApp(id));
    } catch {
      /* UI-Fehler dürfen den Start nicht stoeren */
    }
  }
}

/**
 * Startet ein Spiel/eine App.
 * - .exe / Binary  -> eigener Prozess (überlebt das Schließen des Launchers)
 * - steam:// & Co. -> über das System geöffnet
 * - .lnk/.bat/...  -> über die Standard-Anwendung geöffnet
 */
async function launch(id) {
  const entry = readCatalog().apps.find((a) => a.id === id);
  if (!entry) throw new LibraryError('Eintrag nicht gefunden.');

  const target = String(entry.exePath || '').trim();
  if (!target) {
    throw new LibraryError(
      'Für diesen Eintrag ist noch kein Pfad hinterlegt. Trage die .exe in Games-Apps.json ein oder wähle sie über "Pfad festlegen".'
    );
  }

  if (running.has(id)) throw new LibraryError(`${entry.title} läuft bereits.`);

  if (URI_RE.test(target)) {
    await shell.openExternal(target);
    return markLaunched(id, null);
  }

  if (!fs.existsSync(target)) {
    throw new LibraryError(`Die Datei wurde nicht gefunden:\n${target}`);
  }

  const ext = path.extname(target).toLowerCase();
  const openWithShell = ['.lnk', '.url', '.bat', '.cmd', '.ps1', '.msi', '.jar', '.app'].includes(ext);

  if (openWithShell) {
    const err = await shell.openPath(target);
    if (err) throw new LibraryError(err);
    return markLaunched(id, null);
  }

  const cwd = entry.workingDir && fs.existsSync(entry.workingDir)
    ? entry.workingDir
    : path.dirname(target);

  let child;
  try {
    child = spawn(target, entry.args || [], {
      cwd,
      detached: true,
      stdio: 'ignore',
      windowsHide: false,
    });
  } catch (err) {
    throw new LibraryError(`Start fehlgeschlagen: ${err.message}`);
  }

  return await new Promise((resolve, reject) => {
    let settled = false;

    child.once('error', (err) => {
      running.delete(id);
      notifyRunning(id);
      if (!settled) {
        settled = true;
        reject(new LibraryError(`Start fehlgeschlagen: ${err.message}`));
      }
    });

    child.once('exit', () => {
      const state = running.get(id);
      running.delete(id);
      if (state) addPlaytime(id, Date.now() - state.startedAtMs);
      notifyRunning(id);
    });

    running.set(id, { child, startedAt: new Date().toISOString(), startedAtMs: Date.now() });
    child.unref();

    // Kurz warten: schlaegt der Start sofort fehl, kommt 'error' zuerst.
    setTimeout(() => {
      if (settled) return;
      settled = true;
      notifyRunning(id);
      resolve(markLaunched(id, child.pid));
    }, 350);
  });
}

function markLaunched(id, pid) {
  const data = readCatalog();
  const entry = data.apps.find((a) => a.id === id);
  if (entry) {
    entry.launchCount = (Number(entry.launchCount) || 0) + 1;
    entry.lastPlayedAt = new Date().toISOString();
    writeCatalog(data);
  }
  return { ...getApp(id), pid: pid || null };
}

function addPlaytime(id, ms) {
  const minutes = Math.round(ms / 60000);
  if (minutes <= 0) return;
  const data = readCatalog();
  const entry = data.apps.find((a) => a.id === id);
  if (!entry) return;
  entry.playtimeMinutes = (Number(entry.playtimeMinutes) || 0) + minutes;
  writeCatalog(data);
}

function stop(id) {
  const state = running.get(id);
  if (!state || !state.child) throw new LibraryError('Dieser Eintrag läuft gerade nicht.');
  try {
    state.child.kill();
  } catch (err) {
    throw new LibraryError(`Beenden fehlgeschlagen: ${err.message}`);
  }
  return true;
}

function revealInFolder(id) {
  const entry = readCatalog().apps.find((a) => a.id === id);
  if (!entry || !entry.exePath) throw new LibraryError('Kein Pfad hinterlegt.');
  if (URI_RE.test(entry.exePath)) throw new LibraryError('Dieser Eintrag hat keinen lokalen Ordner.');
  if (!fs.existsSync(entry.exePath)) throw new LibraryError('Der hinterlegte Pfad existiert nicht mehr.');
  shell.showItemInFolder(entry.exePath);
  return true;
}

module.exports = {
  LibraryError,
  catalogInfo,
  decorate,
  deleteEntry,
  getApp,
  importMedia,
  isInstalled,
  launch,
  listApps,
  onRunningChanged,
  patchEntry,
  readCatalog,
  resolveMediaPath,
  revealInFolder,
  saveEntry,
  setExePath,
  stop,
  writeCatalog,
};
