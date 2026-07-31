'use strict';

/**
 * Zentrale Datei-/Pfad-Verwaltung des Launchers.
 *
 * Gespeichert wird:
 *   accounts.json    -> alle Benutzerkonten (Passwörter als scrypt-Hash)
 *   session.json     -> die aktive Anmeldung ("angemeldet bleiben")
 *   Games-Apps.json  -> der Katalog mit allen Spielen/Apps + .exe-Pfaden
 *   media/           -> hochgeladene Banner, Cover, Icons, Screenshots
 *
 * Games-Apps.json wird bewusst so aufgelöst, dass man die Datei immer
 * von Hand bearbeiten kann:
 *   1. Umgebungsvariable VOIDRIX_CATALOG (für Power-User / Tests)
 *   2. Games-Apps.json direkt neben der .exe (portable Version)
 *   3. <Benutzerdaten>/Games-Apps.json (Standard bei der Installation)
 */

const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');

const CATALOG_FILE = 'Games-Apps.json';

let cachedCatalogPath = null;

function isPackaged() {
  return app.isPackaged;
}

/** Ordner in dem alle Launcher-Daten liegen. */
function dataDir() {
  return app.getPath('userData');
}

function mediaDir() {
  return path.join(dataDir(), 'media');
}

function accountsPath() {
  return path.join(dataDir(), 'accounts.json');
}

function sessionPath() {
  return path.join(dataDir(), 'session.json');
}

function settingsPath() {
  return path.join(dataDir(), 'settings.json');
}

/** Die mitgelieferte Vorlage (im asar bzw. im Projektordner). */
function bundledCatalogPath() {
  const candidates = [
    path.join(process.resourcesPath || '', CATALOG_FILE),
    path.join(app.getAppPath(), CATALOG_FILE),
    path.join(__dirname, '..', '..', CATALOG_FILE),
  ];
  return candidates.find((p) => p && fileExists(p)) || null;
}

function isWritableDir(dir) {
  try {
    fs.accessSync(dir, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Ermittelt den Pfad zur Games-Apps.json. Existiert sie noch nicht,
 * wird sie aus der mitgelieferten Vorlage erzeugt.
 */
function catalogPath() {
  if (cachedCatalogPath) return cachedCatalogPath;

  const fromEnv = process.env.VOIDRIX_CATALOG && process.env.VOIDRIX_CATALOG.trim();
  if (fromEnv) {
    cachedCatalogPath = path.resolve(fromEnv);
    ensureCatalogFile(cachedCatalogPath);
    return cachedCatalogPath;
  }

  if (!isPackaged()) {
    // Entwicklung: die Datei im Projektordner ist die "echte" Datei.
    cachedCatalogPath = path.join(app.getAppPath(), CATALOG_FILE);
    ensureCatalogFile(cachedCatalogPath);
    return cachedCatalogPath;
  }

  // Portable / neben der .exe - nur wenn dort auch geschrieben werden darf.
  const exeDir = path.dirname(app.getPath('exe'));
  const portable = path.join(exeDir, CATALOG_FILE);
  if (fileExists(portable) && isWritableDir(exeDir)) {
    cachedCatalogPath = portable;
    return cachedCatalogPath;
  }

  cachedCatalogPath = path.join(dataDir(), CATALOG_FILE);
  ensureCatalogFile(cachedCatalogPath);
  return cachedCatalogPath;
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
      /* faellt unten auf ein leeres Grundgeruest zurück */
    }
  }
  writeJson(target, { $schema: 'voidrix-catalog/1', version: 1, apps: [] });
}

function fileExists(p) {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

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
  accountsPath,
  bundledCatalogPath,
  catalogPath,
  dataDir,
  ensureDir,
  fileExists,
  isPackaged,
  mediaDir,
  readJson,
  sessionPath,
  settingsPath,
  writeJson,
};
