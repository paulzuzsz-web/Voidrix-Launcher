'use strict';

/**
 * Zentrale Datei-/Pfadverwaltung des Launchers.
 *
 * Beim ersten Start wählt man einen Datenordner. Darin legt der Launcher
 * folgende Struktur an:
 *
 *   <Datenordner>/
 *   ├── Games-Apps.json     Katalog: alle Titel + Pfade zu den .exe-Dateien
 *   ├── konten/             accounts.json und session.json
 *   ├── media/              hochgeladene Bilder
 *   │   ├── banner/  cover/  icons/  screenshots/  profilbilder/
 *   ├── spiele/             Platz für eigene Installationen
 *   └── sicherungen/        automatische Kopien der Games-Apps.json
 *
 * Wo dieser Ordner liegt, merkt sich location.json im Standard-Benutzerordner
 * von Electron.
 */

const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');

const CATALOG_FILE = 'Games-Apps.json';
const LOCATION_FILE = 'location.json';
const APP_FOLDER_NAME = 'Voidrix Launcher';

/** Die Unterordner, die im Datenordner angelegt werden. */
const DIRS = {
  accounts: 'konten',
  media: 'media',
  games: 'spiele',
  backups: 'sicherungen',
};

/** Unterordner in media/ - Bilder werden nach Art einsortiert. */
const MEDIA_KINDS = ['banner', 'cover', 'icons', 'screenshots', 'profilbilder'];

const MAX_BACKUPS = 15;

/** Aktuell benutzter Datenordner (null = noch nicht eingerichtet). */
let dataRoot = null;

/* --------------------------------------------------------------------- */
/* Kleine Helfer                                                          */
/* --------------------------------------------------------------------- */

function fileExists(p) {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

function dirExists(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** Prüft, ob in einem Ordner wirklich geschrieben werden darf. */
function isWritableDir(dir) {
  try {
    ensureDir(dir);
    const probe = path.join(dir, `.vx-probe-${process.pid}`);
    fs.writeFileSync(probe, '');
    fs.unlinkSync(probe);
    return true;
  } catch {
    return false;
  }
}

/* --------------------------------------------------------------------- */
/* Datenordner: merken, vorschlagen, einrichten                           */
/* --------------------------------------------------------------------- */

/** Die kleine Zeigerdatei liegt immer am Electron-Standardort. */
function locationPath() {
  return path.join(app.getPath('userData'), LOCATION_FILE);
}

function readLocation() {
  try {
    const data = JSON.parse(fs.readFileSync(locationPath(), 'utf8'));
    const dir = data && typeof data.dataRoot === 'string' ? data.dataRoot.trim() : '';
    return dir || null;
  } catch {
    return null;
  }
}

function saveLocation(dir) {
  ensureDir(path.dirname(locationPath()));
  fs.writeFileSync(
    locationPath(),
    JSON.stringify({ dataRoot: dir, updatedAt: new Date().toISOString() }, null, 2) + os.EOL,
    'utf8'
  );
}

/** Ordner, der beim ersten Start vorgeschlagen wird. */
function suggestDataRoot() {
  // Portable neben der .exe: dort liegen die Daten am naheliegendsten.
  if (app.isPackaged) {
    const exeDir = path.dirname(app.getPath('exe'));
    if (fileExists(path.join(exeDir, CATALOG_FILE)) && isWritableDir(exeDir)) {
      return path.join(exeDir, 'VoidrixData');
    }
  }
  let base;
  try {
    base = app.getPath('documents');
  } catch {
    base = app.getPath('home');
  }
  return path.join(base, APP_FOLDER_NAME);
}

/** Sieht ein Ordner nach einem bereits eingerichteten Datenordner aus? */
function looksLikeDataRoot(dir) {
  return (
    fileExists(path.join(dir, CATALOG_FILE)) ||
    fileExists(path.join(dir, DIRS.accounts, 'accounts.json')) ||
    fileExists(path.join(dir, 'accounts.json'))
  );
}

/**
 * Ist der Launcher schon eingerichtet?
 * Übernimmt dabei stillschweigend Daten früherer Versionen bzw. eine
 * portable Installation, damit niemand seine Konten verliert.
 */
function isConfigured() {
  if (dataRoot) return true;

  const saved = readLocation();
  if (saved && isWritableDir(saved)) {
    dataRoot = saved;
    return true;
  }

  // Alte Version: Daten lagen direkt im Electron-Benutzerordner.
  const legacy = app.getPath('userData');
  if (looksLikeDataRoot(legacy)) {
    dataRoot = legacy;
    createStructure(dataRoot);
    saveLocation(dataRoot);
    return true;
  }

  // Portable: Games-Apps.json liegt neben der .exe.
  if (app.isPackaged) {
    const exeDir = path.dirname(app.getPath('exe'));
    if (fileExists(path.join(exeDir, CATALOG_FILE)) && isWritableDir(exeDir)) {
      dataRoot = exeDir;
      createStructure(dataRoot);
      saveLocation(dataRoot);
      return true;
    }
  }

  return false;
}

/** Legt nur die Ordner an (ohne Katalogdatei). */
function createFolders(root) {
  const created = [];
  const make = (p) => {
    if (!dirExists(p)) created.push(p);
    ensureDir(p);
  };

  make(root);
  make(path.join(root, DIRS.accounts));
  make(path.join(root, DIRS.media));
  MEDIA_KINDS.forEach((kind) => make(path.join(root, DIRS.media, kind)));
  make(path.join(root, DIRS.games));
  make(path.join(root, DIRS.backups));

  writeReadme(root);
  return created;
}

/** Ordner + Katalogdatei - der komplette Datenordner. */
function createStructure(root) {
  const created = createFolders(root);
  ensureCatalogFile(path.join(root, CATALOG_FILE));
  return created;
}

/** Kurze Erklärung in den Datenordner legen - hilft beim Wiederfinden. */
function writeReadme(root) {
  const file = path.join(root, 'LIESMICH.txt');
  if (fileExists(file)) return;
  const text = [
    'Voidrix Launcher - Datenordner',
    '==============================',
    '',
    'Games-Apps.json   Alle Spiele und Apps. Bei "exePath" steht der Pfad zur .exe;',
    '                  existiert die Datei, gilt der Titel als installiert.',
    'konten/           Benutzerkonten (Passwörter nur als scrypt-Hash) und die',
    '                  gespeicherte Anmeldung.',
    'media/            Hochgeladene Bilder, sortiert nach banner, cover, icons,',
    '                  screenshots und profilbilder.',
    'spiele/           Freier Platz für eigene Installationen.',
    'sicherungen/      Automatische Kopien der Games-Apps.json.',
    '',
    'Der Ordner lässt sich im Launcher unter Einstellungen -> Datenordner ändern.',
    '',
  ].join(os.EOL);
  try {
    fs.writeFileSync(file, text, 'utf8');
  } catch {
    /* nicht schlimm */
  }
}

/**
 * Richtet einen Datenordner ein: Struktur anlegen, vorhandene Daten aus dem
 * alten Ordner übernehmen und den Ort merken.
 */
function setDataRoot(dir, { migrate = true } = {}) {
  const target = path.resolve(String(dir || '').trim());
  if (!target) throw new Error('Bitte einen Ordner auswählen.');
  if (!isWritableDir(target)) {
    throw new Error(`In diesem Ordner darf nicht geschrieben werden:\n${target}`);
  }

  const previous = dataRoot || readLocation();

  // Erst die Ordner, dann die alten Daten übernehmen - und ganz zum Schluss
  // eine leere Games-Apps.json anlegen, falls keine übernommen wurde.
  const created = createFolders(target);

  let moved = 0;
  if (migrate && previous && path.resolve(previous) !== target && dirExists(previous)) {
    moved = migrateData(previous, target);
  }
  ensureCatalogFile(path.join(target, CATALOG_FILE));

  dataRoot = target;
  saveLocation(target);
  return { dataRoot: target, created, moved };
}

/** Kopiert vorhandene Daten in den neuen Ordner (nichts wird überschrieben). */
function migrateData(from, to) {
  let count = 0;

  const copyFile = (src, dest) => {
    if (!fileExists(src) || fileExists(dest)) return;
    ensureDir(path.dirname(dest));
    fs.copyFileSync(src, dest);
    count++;
  };

  const copyTree = (src, dest) => {
    if (!dirExists(src)) return;
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
      const s = path.join(src, entry.name);
      const d = path.join(dest, entry.name);
      if (entry.isDirectory()) copyTree(s, d);
      else copyFile(s, d);
    }
  };

  copyFile(path.join(from, CATALOG_FILE), path.join(to, CATALOG_FILE));

  // Konten lagen früher direkt im Hauptordner.
  copyFile(path.join(from, 'accounts.json'), path.join(to, DIRS.accounts, 'accounts.json'));
  copyFile(path.join(from, 'session.json'), path.join(to, DIRS.accounts, 'session.json'));
  copyFile(path.join(from, DIRS.accounts, 'accounts.json'), path.join(to, DIRS.accounts, 'accounts.json'));
  copyFile(path.join(from, DIRS.accounts, 'session.json'), path.join(to, DIRS.accounts, 'session.json'));

  copyTree(path.join(from, DIRS.media), path.join(to, DIRS.media));
  copyTree(path.join(from, DIRS.backups), path.join(to, DIRS.backups));
  // Hochgeladene Spiele ziehen mit um, sonst zeigen die Einträge ins Leere.
  copyTree(path.join(from, DIRS.games), path.join(to, DIRS.games));

  return count;
}

/* --------------------------------------------------------------------- */
/* Pfade innerhalb des Datenordners                                       */
/* --------------------------------------------------------------------- */

/**
 * Macht aus einem absoluten Pfad im Datenordner einen relativen
 * (z.B. "spiele/arena/Arena.exe"). Alles außerhalb bleibt unverändert.
 * So bleibt der Katalog auch nach einem Umzug gültig.
 */
function relativizeToData(value) {
  const input = String(value || '').trim();
  if (!input || !path.isAbsolute(input)) return input;
  const root = path.resolve(dataDir());
  const abs = path.resolve(input);
  if (abs !== root && !abs.startsWith(root + path.sep)) return input;
  return path.relative(root, abs).split(path.sep).join('/');
}

/** Gegenstück zu relativizeToData: liefert immer einen absoluten Pfad. */
function resolveDataPath(value) {
  const input = String(value || '').trim();
  if (!input) return '';
  if (path.isAbsolute(input)) return input;
  return path.resolve(dataDir(), input);
}

/** Liegt der Pfad im Ordner spiele/ des Datenordners? */
function isInsideGames(value) {
  const abs = path.resolve(resolveDataPath(value));
  const games = path.resolve(gamesDir());
  return abs.startsWith(games + path.sep);
}

/* --------------------------------------------------------------------- */
/* Pfade                                                                  */
/* --------------------------------------------------------------------- */

/** Der Datenordner. Vor der Einrichtung der Electron-Standardordner. */
function dataDir() {
  return dataRoot || app.getPath('userData');
}

function catalogPath() {
  const file = process.env.VOIDRIX_CATALOG
    ? path.resolve(process.env.VOIDRIX_CATALOG.trim())
    : path.join(dataDir(), CATALOG_FILE);
  ensureCatalogFile(file);
  return file;
}

function accountsDir() {
  return path.join(dataDir(), DIRS.accounts);
}

function accountsPath() {
  return path.join(accountsDir(), 'accounts.json');
}

function sessionPath() {
  return path.join(accountsDir(), 'session.json');
}

function mediaDir() {
  return path.join(dataDir(), DIRS.media);
}

/** Unterordner für eine Bildart, z.B. media/banner. */
function mediaKindDir(kind) {
  const safe = MEDIA_KINDS.includes(kind) ? kind : 'sonstiges';
  return path.join(mediaDir(), safe);
}

function gamesDir() {
  return path.join(dataDir(), DIRS.games);
}

function backupDir() {
  return path.join(dataDir(), DIRS.backups);
}

/** Alle Orte auf einen Blick - für die Einstellungen. */
function paths() {
  return {
    dataRoot: dataDir(),
    catalogPath: catalogPath(),
    accountsPath: accountsPath(),
    sessionPath: sessionPath(),
    mediaDir: mediaDir(),
    gamesDir: gamesDir(),
    backupDir: backupDir(),
    locationFile: locationPath(),
    configured: Boolean(dataRoot),
  };
}

/* --------------------------------------------------------------------- */
/* Katalogdatei                                                           */
/* --------------------------------------------------------------------- */

/** Die mitgelieferte Vorlage (im asar bzw. im Projektordner). */
function bundledCatalogPath() {
  const candidates = [
    path.join(process.resourcesPath || '', CATALOG_FILE),
    path.join(app.getAppPath(), CATALOG_FILE),
    path.join(__dirname, '..', '..', CATALOG_FILE),
  ];
  return candidates.find((p) => p && fileExists(p)) || null;
}

function ensureCatalogFile(target) {
  if (fileExists(target)) return;
  ensureDir(path.dirname(target));
  const template = bundledCatalogPath();
  if (template && path.resolve(template) !== path.resolve(target)) {
    try {
      fs.copyFileSync(template, target);
      return;
    } catch {
      /* fällt unten auf ein leeres Grundgerüst zurück */
    }
  }
  writeJson(target, { $schema: 'voidrix-catalog/1', version: 1, apps: [] });
}

/** Legt eine datierte Kopie der Games-Apps.json in sicherungen/ ab. */
function backupCatalog() {
  const source = catalogPath();
  if (!fileExists(source)) return null;
  try {
    const dir = ensureDir(backupDir());
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const target = path.join(dir, `Games-Apps-${stamp}.json`);
    if (!fileExists(target)) fs.copyFileSync(source, target);

    // Nur die neuesten Sicherungen behalten.
    const backups = fs
      .readdirSync(dir)
      .filter((n) => n.startsWith('Games-Apps-') && n.endsWith('.json'))
      .sort();
    while (backups.length > MAX_BACKUPS) {
      const old = backups.shift();
      try {
        fs.unlinkSync(path.join(dir, old));
      } catch {
        /* egal */
      }
    }
    return target;
  } catch {
    return null;
  }
}

/* --------------------------------------------------------------------- */
/* JSON lesen/schreiben                                                   */
/* --------------------------------------------------------------------- */

/** Liest JSON, gibt bei Fehlern den Fallback zurück (nichts soll crashen). */
function readJson(file, fallback) {
  try {
    const raw = fs.readFileSync(file, 'utf8');
    if (!raw.trim()) return structuredClone(fallback);
    return JSON.parse(raw);
  } catch (err) {
    if (err && err.code !== 'ENOENT') {
      console.error(`[store] ${file} konnte nicht gelesen werden:`, err.message);
      backupBrokenFile(file);
    }
    return structuredClone(fallback);
  }
}

/** Schreibt atomar: erst .tmp, dann rename - so geht nie eine Datei kaputt. */
function writeJson(file, data) {
  ensureDir(path.dirname(file));
  const tmp = path.join(
    path.dirname(file),
    `.${path.basename(file)}.${process.pid}.${Date.now()}.tmp`
  );
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + os.EOL, 'utf8');
  fs.renameSync(tmp, file);
  return data;
}

function backupBrokenFile(file) {
  try {
    const broken = `${file}.broken-${Date.now()}`;
    fs.copyFileSync(file, broken);
    console.error(`[store] Defekte Datei gesichert: ${broken}`);
  } catch {
    /* ignorieren */
  }
}

module.exports = {
  CATALOG_FILE,
  DIRS,
  MEDIA_KINDS,
  accountsPath,
  backupCatalog,
  backupDir,
  bundledCatalogPath,
  catalogPath,
  createFolders,
  createStructure,
  dataDir,
  ensureDir,
  fileExists,
  gamesDir,
  isConfigured,
  isInsideGames,
  isWritableDir,
  mediaDir,
  mediaKindDir,
  paths,
  readJson,
  relativizeToData,
  resolveDataPath,
  sessionPath,
  setDataRoot,
  suggestDataRoot,
  writeJson,
};
