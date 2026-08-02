'use strict';

/**
 * Selbst-Update des Launchers.
 *
 * Beim Start wird die package.json aus dem Netz geholt (z.B. die Rohdatei
 * aus GitHub). Ist die dortige "version" neuer als die laufende, bietet der
 * Launcher das Update an: die passende Datei wird heruntergeladen und
 * gestartet - unter Windows also der Installer, der den Launcher ersetzt.
 *
 * Die Adressen stehen im Block "voidrix.update" der package.json und lassen
 * sich in den Einstellungen überschreiben.
 */

const { app, net, shell } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const store = require('./store');
const { download, DownloadError, formatBytes } = require('./download');

/** Wie lange ein Ergebnis als frisch gilt (12 Stunden). */
const CHECK_INTERVAL_MS = 12 * 60 * 60 * 1000;

class UpdateError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UpdateError';
  }
}

let cancelDownload = null;

/* --------------------------------------------------------------------- */
/* Konfiguration                                                          */
/* --------------------------------------------------------------------- */

function packageJson() {
  try {
    return require(path.join(app.getAppPath(), 'package.json'));
  } catch {
    return {};
  }
}

/**
 * Zusammengesetzte Update-Einstellungen:
 * package.json < gespeicherte Einstellungen < Umgebungsvariable.
 */
function config() {
  const fromPackage = packageJson().voidrix?.update || {};
  const saved = store.isConfigured() ? store.readSettings().update || {} : {};
  const merged = { ...fromPackage, ...saved };

  if (process.env.VOIDRIX_UPDATE_MANIFEST) {
    merged.manifest = process.env.VOIDRIX_UPDATE_MANIFEST.trim();
  }
  return {
    manifest: String(merged.manifest || ''),
    downloads: merged.downloads || {},
    url: String(merged.url || ''),
    notes: String(merged.notes || ''),
    autoCheck: merged.autoCheck !== false,
    skipVersion: String(merged.skipVersion || ''),
    lastCheck: merged.lastCheck || null,
  };
}

function saveConfig(patch) {
  const current = store.readSettings().update || {};
  const update = { ...current, ...patch };
  store.writeSettings({ update });
  return config();
}

/* --------------------------------------------------------------------- */
/* Versionsvergleich                                                      */
/* --------------------------------------------------------------------- */

/**
 * Vergleicht zwei Versionen ("1.2.10" > "1.2.9").
 * Vorabversionen wie 1.1.0-beta.2 gelten als älter als 1.1.0.
 * @returns {number} 1 = a neuer, -1 = b neuer, 0 = gleich
 */
function compareVersions(a, b) {
  const split = (v) => {
    const [core, pre = ''] = String(v || '0').trim().replace(/^v/i, '').split('-');
    return {
      parts: core.split('.').map((n) => parseInt(n, 10) || 0),
      pre: pre.split('.').filter(Boolean),
    };
  };
  const left = split(a);
  const right = split(b);

  for (let i = 0; i < Math.max(left.parts.length, right.parts.length); i++) {
    const l = left.parts[i] || 0;
    const r = right.parts[i] || 0;
    if (l !== r) return l > r ? 1 : -1;
  }

  if (left.pre.length === right.pre.length && left.pre.join('.') === right.pre.join('.')) return 0;
  if (!left.pre.length) return 1; // Release schlägt Vorabversion
  if (!right.pre.length) return -1;

  for (let i = 0; i < Math.max(left.pre.length, right.pre.length); i++) {
    const l = left.pre[i];
    const r = right.pre[i];
    if (l === r) continue;
    if (l === undefined) return -1;
    if (r === undefined) return 1;
    const ln = Number(l);
    const rn = Number(r);
    if (!Number.isNaN(ln) && !Number.isNaN(rn)) return ln > rn ? 1 : -1;
    return l > r ? 1 : -1;
  }
  return 0;
}

/* --------------------------------------------------------------------- */
/* Prüfen                                                                 */
/* --------------------------------------------------------------------- */

/** Holt die entfernte package.json (oder ein anderes JSON-Manifest). */
function fetchManifest(url) {
  return new Promise((resolve, reject) => {
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      reject(new UpdateError('Die Update-Adresse ist ungültig.'));
      return;
    }
    if (!isAllowedHost(parsed)) {
      reject(new UpdateError('Updates nur über https (oder localhost zum Testen).'));
      return;
    }

    const request = net.request({ url: parsed.toString(), method: 'GET', redirect: 'follow' });
    request.setHeader('Accept', 'application/json, text/plain, */*');
    // GitHub liefert ohne User-Agent teilweise 403.
    request.setHeader('User-Agent', `VoidrixLauncher/${app.getVersion()}`);
    request.setHeader('Cache-Control', 'no-cache');

    request.on('response', (response) => {
      if (response.statusCode >= 400) {
        response.on('data', () => {});
        reject(new UpdateError(`Update-Datei nicht erreichbar (Fehler ${response.statusCode}).`));
        return;
      }
      const chunks = [];
      let size = 0;
      response.on('data', (chunk) => {
        size += chunk.length;
        if (size > 1_000_000) {
          request.abort();
          reject(new UpdateError('Die Update-Datei ist unerwartet groß.'));
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        } catch {
          reject(new UpdateError('Die Update-Datei ist kein gültiges JSON.'));
        }
      });
      response.on('error', (err) => reject(new UpdateError(err.message)));
    });

    request.on('error', (err) => reject(new UpdateError(`Keine Verbindung: ${err.message}`)));
    request.end();
  });
}

/** https erzwingen - http nur lokal (für Tests). */
function isAllowedHost(url) {
  if (url.protocol === 'https:') return true;
  return url.protocol === 'http:' && ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
}

/** Passende Datei für dieses Betriebssystem aus dem Manifest ziehen. */
function pickDownloadUrl(manifest, cfg) {
  const remote = manifest.voidrix?.update || {};
  const byPlatform = { ...(cfg.downloads || {}), ...(remote.downloads || {}) };
  const key = process.platform === 'win32' ? 'win' : process.platform === 'darwin' ? 'mac' : 'linux';
  return String(byPlatform[key] || remote.url || cfg.downloads?.[key] || cfg.url || '');
}

/**
 * Sucht nach einer neueren Version.
 * @returns {Promise<{current, latest, hasUpdate, url, notes, skipped, manifest}>}
 */
async function check({ silent = false } = {}) {
  const cfg = config();
  const current = app.getVersion();

  if (!cfg.manifest) {
    if (silent) return { current, hasUpdate: false, configured: false };
    throw new UpdateError(
      'Es ist keine Update-Adresse hinterlegt. Trag sie in den Einstellungen ein (package.json → voidrix.update.manifest).'
    );
  }

  const manifest = await fetchManifest(cfg.manifest);
  const latest = String(manifest.version || '').trim();
  if (!latest) throw new UpdateError('In der Update-Datei steht keine "version".');

  const url = pickDownloadUrl(manifest, cfg);
  const hasUpdate = compareVersions(latest, current) > 0;

  saveConfig({ lastCheck: new Date().toISOString(), lastSeenVersion: latest });

  return {
    configured: true,
    current,
    latest,
    hasUpdate,
    url,
    notes: String(manifest.voidrix?.update?.notes || cfg.notes || ''),
    name: String(manifest.productName || manifest.name || 'Voidrix Launcher'),
    skipped: hasUpdate && cfg.skipVersion === latest,
    canInstall: Boolean(url),
  };
}

/** Soll beim Start automatisch gesucht werden (und ist es an der Zeit)? */
function shouldAutoCheck() {
  const cfg = config();
  if (!cfg.autoCheck || !cfg.manifest) return false;
  if (!cfg.lastCheck) return true;
  return Date.now() - Date.parse(cfg.lastCheck) > CHECK_INTERVAL_MS;
}

/* --------------------------------------------------------------------- */
/* Herunterladen und installieren                                         */
/* --------------------------------------------------------------------- */

/** Lädt die neue Version in den Ordner updates/. */
async function downloadUpdate({ url, version }, onProgress = () => {}) {
  const target = String(url || '').trim();
  if (!target) throw new UpdateError('Für dieses System gibt es keine Update-Datei.');

  let parsed;
  try {
    parsed = new URL(target);
  } catch {
    throw new UpdateError('Die Download-Adresse ist ungültig.');
  }
  if (!isAllowedHost(parsed)) throw new UpdateError('Updates nur über https (oder localhost zum Testen).');

  // Alte Downloads wegräumen, damit sich nichts ansammelt.
  const dir = store.ensureDir(store.updatesDir());
  for (const name of fs.readdirSync(dir)) {
    try {
      fs.rmSync(path.join(dir, name), { recursive: true, force: true });
    } catch {
      /* egal */
    }
  }

  let result;
  try {
    result = await download(target, dir, {
      onProgress: (p) => onProgress({ ...p, version }),
      register: (cancel) => {
        cancelDownload = cancel;
      },
    });
  } catch (err) {
    cancelDownload = null;
    throw err instanceof DownloadError ? new UpdateError(err.message) : err;
  }
  cancelDownload = null;

  if (process.platform !== 'win32') {
    try {
      fs.chmodSync(result.file, 0o755);
    } catch {
      /* nicht kritisch */
    }
  }

  return { ...result, sizeText: formatBytes(result.bytes), version };
}

/** Hat die Datei das Ausführbar-Bit (Linux/macOS)? */
function isExecutable(file) {
  try {
    return Boolean(fs.statSync(file).mode & 0o111);
  } catch {
    return false;
  }
}

function cancel() {
  if (!cancelDownload) throw new UpdateError('Gerade läuft kein Update-Download.');
  cancelDownload();
  cancelDownload = null;
  return true;
}

/**
 * Startet die heruntergeladene Datei und beendet den Launcher, damit der
 * Installer die Dateien ersetzen kann.
 */
async function install(file, { quit = true } = {}) {
  const target = String(file || '').trim();
  if (!target || !store.fileExists(target)) {
    throw new UpdateError('Die Update-Datei wurde nicht gefunden.');
  }

  const ext = path.extname(target).toLowerCase();
  const runnable =
    (process.platform === 'win32' && (ext === '.exe' || ext === '.msi')) ||
    (process.platform !== 'win32' && (ext === '.appimage' || isExecutable(target)));

  if (runnable) {
    // Installer starten und loslösen - er läuft weiter, wenn wir beenden.
    const child = spawn(target, [], { detached: true, stdio: 'ignore' });

    // Kurz abwarten: schlägt der Start sofort fehl, beenden wir uns nicht,
    // sondern melden den Fehler (sonst wäre der Launcher einfach weg).
    await new Promise((resolve, reject) => {
      let settled = false;
      child.once('error', (err) => {
        if (settled) return;
        settled = true;
        reject(new UpdateError(`Der Installer ließ sich nicht starten: ${err.message}`));
      });
      setTimeout(() => {
        if (settled) return;
        settled = true;
        child.unref();
        resolve();
      }, 400);
    });
  } else {
    // Sonst dem System übergeben (.dmg, .zip …). Antwortet das System nicht,
    // zeigen wir wenigstens den Ordner - sonst hinge der Launcher hier fest.
    const result = await Promise.race([
      shell.openPath(target),
      new Promise((resolve) => setTimeout(() => resolve('timeout'), 4000)),
    ]);
    if (result) {
      shell.showItemInFolder(target);
      throw new UpdateError(
        `Die Datei konnte nicht automatisch gestartet werden. Sie liegt hier:\n${target}`
      );
    }
  }

  if (quit) {
    setTimeout(() => app.quit(), 800);
  }
  return { started: true, file: target };
}

module.exports = {
  UpdateError,
  cancel,
  check,
  compareVersions,
  config,
  downloadUpdate,
  install,
  saveConfig,
  shouldAutoCheck,
};
