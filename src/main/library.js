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

/** Dateien, die als startbares Programm gelten. */
const EXE_EXTS = new Set(['.exe', '.bat', '.cmd', '.msi', '.jar', '.lnk', '.url', '.app', '.sh']);

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

/**
 * Kopiert ein Bild in den media-Ordner und gibt die Referenz zurück.
 * `kind` bestimmt den Unterordner (banner, cover, icons, screenshots,
 * profilbilder) - so bleibt der Datenordner aufgeräumt.
 */
function importMedia(sourcePath, kind = 'sonstiges') {
  const src = String(sourcePath || '').trim();
  if (!src) return '';
  if (/^(https?|data):/i.test(src)) return src; // URLs bleiben wie sie sind
  if (src.startsWith('media/') || src.startsWith('media\\')) return src.replace(/\\/g, '/');

  if (!store.fileExists(src)) throw new LibraryError(`Bilddatei nicht gefunden: ${src}`);

  const ext = path.extname(src).toLowerCase();
  if (!IMAGE_EXTS.has(ext)) {
    throw new LibraryError(`Nicht unterstütztes Bildformat: ${ext || '(keines)'}`);
  }

  const buf = fs.readFileSync(src);
  const hash = crypto.createHash('sha1').update(buf).digest('hex').slice(0, 16);
  const folder = store.ensureDir(store.mediaKindDir(kind));
  const target = path.join(folder, `${hash}${ext}`);
  if (!store.fileExists(target)) fs.writeFileSync(target, buf);
  return `media/${path.basename(folder)}/${hash}${ext}`;
}

function importMediaList(list, kind) {
  if (!Array.isArray(list)) return [];
  return list.map((item) => importMedia(item, kind)).filter(Boolean);
}

/* --------------------------------------------------------------------- */
/* Programme hochladen (Kopie in den Ordner spiele/)                      */
/* --------------------------------------------------------------------- */

/** Alle Dateien unterhalb eines Pfades samt Gesamtgröße. */
function collectFiles(src) {
  const stat = fs.statSync(src);
  if (stat.isFile()) {
    return { files: [{ abs: src, rel: path.basename(src), size: stat.size, mode: stat.mode }], bytes: stat.size };
  }

  const files = [];
  let bytes = 0;
  const walk = (dir, prefix) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(abs, rel);
      else if (entry.isFile()) {
        const info = fs.statSync(abs);
        files.push({ abs, rel, size: info.size, mode: info.mode });
        bytes += info.size;
      }
    }
  };
  walk(src, '');
  return { files, bytes };
}

function freeSpace(dir) {
  try {
    const info = fs.statfsSync(dir);
    return info.bavail * info.bsize;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function formatBytes(bytes) {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = Number(bytes) || 0;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

/** Freier Ordnername unterhalb von spiele/. */
function uniqueGameDir(name) {
  const base = slugify(name) || 'programm';
  const games = store.ensureDir(store.gamesDir());
  let candidate = path.join(games, base);
  let n = 2;
  while (fs.existsSync(candidate)) {
    candidate = path.join(games, `${base}-${n}`);
    n++;
  }
  return candidate;
}

function copyFileStream(src, dest, onChunk) {
  return new Promise((resolve, reject) => {
    const read = fs.createReadStream(src);
    const write = fs.createWriteStream(dest);
    read.on('data', (chunk) => onChunk(chunk.length));
    read.on('error', reject);
    write.on('error', reject);
    write.on('finish', resolve);
    read.pipe(write);
  });
}

/** Startbare Dateien in einem hochgeladenen Ordner finden. */
function findExecutables(root) {
  const { files } = collectFiles(root);
  const isExecutable = (file) => {
    const ext = path.extname(file.abs).toLowerCase();
    if (EXE_EXTS.has(ext)) return true;
    if (process.platform === 'win32' || ext) return false;
    try {
      return Boolean(fs.statSync(file.abs).mode & 0o111); // Unix: Ausführbar-Bit
    } catch {
      return false;
    }
  };

  return files
    .filter(isExecutable)
    .sort((a, b) => {
      // Flach liegende und große Dateien zuerst - das ist meist das Hauptprogramm.
      const depth = a.rel.split('/').length - b.rel.split('/').length;
      return depth !== 0 ? depth : b.size - a.size;
    })
    .slice(0, 40)
    .map((f) => ({ rel: f.rel, size: f.size, sizeText: formatBytes(f.size) }));
}

/**
 * Kopiert eine Programmdatei oder einen kompletten Spiel-Ordner nach
 * <Datenordner>/spiele/<name>/ und liefert den neuen Pfad zurück.
 *
 * @param {{sourcePath: string, mode?: 'file'|'folder', title?: string}} input
 * @param {(p: {percent:number, copied:number, total:number, file:string}) => void} onProgress
 */
async function uploadExecutable({ sourcePath, mode = 'file', title = '' }, onProgress = () => {}) {
  const src = path.resolve(String(sourcePath || '').trim());
  if (!src || !fs.existsSync(src)) throw new LibraryError(`Nicht gefunden: ${src}`);

  const stat = fs.statSync(src);
  const isFolder = stat.isDirectory();
  if (mode === 'folder' && !isFolder) throw new LibraryError('Bitte einen Ordner auswählen.');
  if (mode === 'file' && isFolder) throw new LibraryError('Bitte eine Datei auswählen.');

  const gamesRoot = path.resolve(store.gamesDir());
  if (src === gamesRoot || src.startsWith(gamesRoot + path.sep)) {
    throw new LibraryError('Diese Dateien liegen bereits im Ordner spiele/.');
  }

  const { files, bytes } = collectFiles(src);
  if (!files.length) throw new LibraryError('Der Ordner enthält keine Dateien.');

  const available = freeSpace(store.dataDir());
  if (bytes > available) {
    throw new LibraryError(
      `Zu wenig Speicherplatz: ${formatBytes(bytes)} werden gebraucht, frei sind ${formatBytes(available)}.`
    );
  }

  const targetDir = uniqueGameDir(title || path.basename(src, path.extname(src)));
  store.ensureDir(targetDir);

  let copied = 0;
  let lastReport = 0;
  const report = (file, force = false) => {
    const now = Date.now();
    if (!force && now - lastReport < 120) return;
    lastReport = now;
    onProgress({
      percent: bytes ? Math.min(100, Math.round((copied / bytes) * 100)) : 100,
      copied,
      total: bytes,
      copiedText: formatBytes(copied),
      totalText: formatBytes(bytes),
      file,
    });
  };

  report('', true);
  try {
    for (const file of files) {
      const dest = path.join(targetDir, ...file.rel.split('/'));
      store.ensureDir(path.dirname(dest));
      await copyFileStream(file.abs, dest, (chunk) => {
        copied += chunk;
        report(file.rel);
      });
      // Rechte übernehmen, damit ausführbare Dateien ausführbar bleiben.
      if (file.mode) {
        try {
          fs.chmodSync(dest, file.mode & 0o777);
        } catch {
          /* unter Windows nicht nötig */
        }
      }
      report(file.rel, true);
    }
  } catch (err) {
    // Halbe Kopie wieder wegräumen, damit nichts Kaputtes zurückbleibt.
    fs.rmSync(targetDir, { recursive: true, force: true });
    throw new LibraryError(`Hochladen fehlgeschlagen: ${err.message}`);
  }

  const folderRef = store.relativizeToData(targetDir);
  const result = { folder: folderRef, bytes, sizeText: formatBytes(bytes), files: files.length };

  if (!isFolder) {
    return { ...result, exePath: `${folderRef}/${path.basename(src)}` };
  }

  const candidates = findExecutables(targetDir);
  if (candidates.length === 1) {
    return { ...result, exePath: `${folderRef}/${candidates[0].rel}` };
  }
  if (candidates.length > 1) {
    // Mehrere Kandidaten: das UI fragt nach.
    return { ...result, needsChoice: true, candidates };
  }
  throw new LibraryError(
    `Der Ordner wurde nach ${folderRef} kopiert, enthält aber keine startbare Datei.\n` +
      'Bitte den Pfad zur Programmdatei von Hand eintragen.'
  );
}

/** Löscht die hochgeladenen Dateien eines Eintrags (nur innerhalb spiele/). */
function removeUploadedFiles(entry) {
  if (!entry || !entry.exePath || URI_RE.test(entry.exePath)) return false;
  if (!store.isInsideGames(entry.exePath)) return false;

  const games = path.resolve(store.gamesDir());
  const abs = path.resolve(store.resolveDataPath(entry.exePath));
  const rel = path.relative(games, abs);
  const top = rel.split(path.sep)[0];
  if (!top || top === '..' || top === '.') return false;

  try {
    fs.rmSync(path.join(games, top), { recursive: true, force: true });
    return true;
  } catch (err) {
    throw new LibraryError(`Dateien konnten nicht gelöscht werden: ${err.message}`);
  }
}

/* --------------------------------------------------------------------- */
/* Abfragen                                                               */
/* --------------------------------------------------------------------- */

/**
 * Absoluter Pfad zur Programmdatei.
 * Hochgeladene Spiele stehen als "spiele/…" im Katalog und werden gegen den
 * Datenordner aufgelöst - so überlebt der Eintrag auch einen Umzug.
 */
function resolveExe(entry) {
  const p = String(entry?.exePath || '').trim();
  if (!p || URI_RE.test(p)) return p;
  return store.resolveDataPath(p);
}

function isInstalled(entry) {
  const p = String(entry.exePath || '').trim();
  if (!p) return false;
  if (URI_RE.test(p)) return true; // steam://, com.epicgames.launcher://, ...
  try {
    return fs.existsSync(resolveExe(entry));
  } catch {
    return false;
  }
}

/** Einträge inkl. Laufzeit-Infos für das UI. */
function decorate(entry) {
  const state = running.get(entry.id);
  const installed = isInstalled(entry);
  return {
    ...entry,
    installed,
    running: Boolean(state),
    runningSince: state ? state.startedAt : null,
    exeExists: entry.exePath ? installed : false,
    exeAbsolute: resolveExe(entry),
    // true = die Dateien liegen im Launcher-Ordner spiele/
    uploaded: Boolean(entry.exePath) && !URI_RE.test(entry.exePath) && store.isInsideGames(entry.exePath),
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
  const paths = store.paths();
  let bytes = 0;
  try {
    bytes = fs.statSync(paths.catalogPath).size;
  } catch {
    /* egal */
  }
  return {
    ...paths,
    dataDir: paths.dataRoot,
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
    banner: importMedia(input.banner ?? existing?.banner ?? '', 'banner'),
    cover: importMedia(input.cover ?? existing?.cover ?? '', 'cover'),
    icon: importMedia(input.icon ?? existing?.icon ?? '', 'icons'),
    screenshots: importMediaList(input.screenshots ?? existing?.screenshots ?? [], 'screenshots'),
    // Pfade im Datenordner relativ speichern (überlebt einen Umzug).
    exePath: (() => {
      const value = String(input.exePath ?? existing?.exePath ?? '').trim();
      return URI_RE.test(value) ? value : store.relativizeToData(value);
    })(),
    workingDir: store.relativizeToData(String(input.workingDir ?? existing?.workingDir ?? '').trim()),
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

  store.backupCatalog(); // Sicherung des bisherigen Stands
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

/**
 * Entfernt einen Eintrag. Mit `withFiles` werden auch die hochgeladenen
 * Dateien im Ordner spiele/ gelöscht (nie etwas außerhalb davon).
 */
function deleteEntry(id, { withFiles = false } = {}) {
  const data = readCatalog();
  const entry = data.apps.find((a) => a.id === id);
  if (!entry) throw new LibraryError('Eintrag nicht gefunden.');

  let filesRemoved = false;
  if (withFiles) filesRemoved = removeUploadedFiles(entry);

  data.apps = data.apps.filter((a) => a.id !== id);
  store.backupCatalog(); // Sicherung vor dem Löschen
  writeCatalog(data);
  return { removed: true, filesRemoved };
}

/** Speichert den .exe-Pfad - der Kern von "installiert oder nicht". */
function setExePath(id, exePath) {
  const data = readCatalog();
  const entry = data.apps.find((a) => a.id === id);
  if (!entry) throw new LibraryError('Eintrag nicht gefunden.');
  const value = String(exePath || '').trim();
  // Liegt die Datei im Datenordner, wird der Pfad relativ gespeichert.
  entry.exePath = URI_RE.test(value) ? value : store.relativizeToData(value);
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

  // Relative Pfade (hochgeladene Spiele) gegen den Datenordner auflösen.
  const target = resolveExe(entry);
  if (!target) {
    throw new LibraryError(
      'Für diesen Eintrag ist noch kein Pfad hinterlegt. Lade die .exe hoch oder wähle sie über "Pfad festlegen".'
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

  const workDir = entry.workingDir ? store.resolveDataPath(entry.workingDir) : '';
  const cwd = workDir && fs.existsSync(workDir) ? workDir : path.dirname(target);

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
  const abs = resolveExe(entry);
  if (!fs.existsSync(abs)) throw new LibraryError('Der hinterlegte Pfad existiert nicht mehr.');
  shell.showItemInFolder(abs);
  return true;
}

module.exports = {
  LibraryError,
  catalogInfo,
  decorate,
  deleteEntry,
  getApp,
  formatBytes,
  importMedia,
  isInstalled,
  launch,
  listApps,
  onRunningChanged,
  patchEntry,
  readCatalog,
  removeUploadedFiles,
  resolveExe,
  resolveMediaPath,
  revealInFolder,
  saveEntry,
  setExePath,
  stop,
  uploadExecutable,
  writeCatalog,
};
