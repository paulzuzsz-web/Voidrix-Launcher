'use strict';

/**
 * Gemeinsamer Katalog.
 *
 * Alle Launcher holen sich beim Start dieselbe Games-Apps.json aus dem Netz
 * (z.B. die Rohdatei aus einem GitHub-Repo). Was dort steht, sieht jeder -
 * ohne dass irgendwer etwas von Hand eintragen muss.
 *
 * Admins können einen Titel direkt aus dem Launcher heraus veröffentlichen:
 * mit einem GitHub-Token schreibt der Launcher ihn in die Datei im Repo,
 * beim nächsten Abgleich haben ihn alle anderen.
 *
 * Ohne Token gibt es "Exportieren": die fertige Datei zum Hochladen von Hand.
 */

const { app, net, safeStorage } = require('electron');
const path = require('path');

const store = require('./store');
const library = require('./library');

/** Frühestens alle 15 Minuten automatisch abgleichen. */
const SYNC_INTERVAL_MS = 15 * 60 * 1000;

/** Diese Felder bleiben immer lokal - sie gehören zu diesem PC. */
const LOCAL_FIELDS = [
  'exePath',
  'workingDir',
  'installedAt',
  'installedFrom',
  'lastPlayedAt',
  'launchCount',
  'playtimeMinutes',
];

class CatalogError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CatalogError';
  }
}

/* --------------------------------------------------------------------- */
/* Einstellungen                                                          */
/* --------------------------------------------------------------------- */

function packageJson() {
  try {
    return require(path.join(app.getAppPath(), 'package.json'));
  } catch {
    return {};
  }
}

function config() {
  const fromPackage = packageJson().voidrix?.catalog || {};
  const saved = store.isConfigured() ? store.readSettings().catalog || {} : {};
  const merged = { ...fromPackage, ...saved };
  const publish = { ...(fromPackage.publish || {}), ...(saved.publish || {}) };

  if (process.env.VOIDRIX_CATALOG_URL) merged.url = process.env.VOIDRIX_CATALOG_URL.trim();

  return {
    url: String(merged.url || ''),
    autoSync: merged.autoSync !== false,
    lastSync: merged.lastSync || null,
    lastResult: merged.lastResult || null,
    publish: {
      repo: String(publish.repo || ''),
      branch: String(publish.branch || 'main'),
      path: String(publish.path || 'Games-Apps.json'),
      api: String(publish.api || 'https://api.github.com'),
    },
    hasToken: Boolean(saved.token),
    tokenPlain: Boolean(saved.tokenPlain),
  };
}

function saveConfig(patch) {
  const current = store.readSettings().catalog || {};
  const catalog = { ...current, ...patch };
  if (patch.publish) catalog.publish = { ...(current.publish || {}), ...patch.publish };
  store.writeSettings({ catalog });
  return config();
}

/* ------------------------------- Token ---------------------------------- */

/** Token verschlüsselt ablegen, wenn das System das kann. */
function setToken(token) {
  const value = String(token || '').trim();
  if (!value) {
    saveConfig({ token: '', tokenPlain: false });
    return { stored: false, encrypted: false };
  }

  let encrypted = false;
  let stored = value;
  try {
    if (safeStorage.isEncryptionAvailable()) {
      stored = safeStorage.encryptString(value).toString('base64');
      encrypted = true;
    }
  } catch {
    encrypted = false;
  }
  saveConfig({ token: stored, tokenPlain: !encrypted });
  return { stored: true, encrypted };
}

function readToken() {
  const saved = store.readSettings().catalog || {};
  if (!saved.token) return '';
  if (saved.tokenPlain) return String(saved.token);
  try {
    return safeStorage.decryptString(Buffer.from(saved.token, 'base64'));
  } catch {
    return '';
  }
}

/* --------------------------------------------------------------------- */
/* HTTP                                                                   */
/* --------------------------------------------------------------------- */

function checkUrl(raw, { allowHttpLocal = true } = {}) {
  let url;
  try {
    url = new URL(String(raw || '').trim());
  } catch {
    throw new CatalogError('Die Katalog-Adresse ist ungültig.');
  }
  const local = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  if (url.protocol === 'https:' || (allowHttpLocal && url.protocol === 'http:' && local)) return url;
  throw new CatalogError('Der Katalog muss über https erreichbar sein (zum Testen auch localhost).');
}

/** JSON holen oder schreiben - schlank gehalten, ohne externe Pakete. */
function request(url, { method = 'GET', token = '', body = null, accept = 'application/json' } = {}) {
  const target = checkUrl(url);

  return new Promise((resolve, reject) => {
    const req = net.request({ url: target.toString(), method, redirect: 'follow' });
    req.setHeader('Accept', accept);
    req.setHeader('User-Agent', `VoidrixLauncher/${app.getVersion()}`);
    req.setHeader('Cache-Control', 'no-cache');
    if (token) req.setHeader('Authorization', `Bearer ${token}`);
    if (body) req.setHeader('Content-Type', 'application/json');

    req.on('response', (response) => {
      const chunks = [];
      let size = 0;
      response.on('data', (chunk) => {
        size += chunk.length;
        if (size > 20_000_000) {
          req.abort();
          reject(new CatalogError('Die Katalogdatei ist unerwartet groß.'));
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        if (response.statusCode >= 400) {
          let hint = '';
          try {
            hint = JSON.parse(text).message || '';
          } catch {
            /* egal */
          }
          reject(
            new CatalogError(
              `Server antwortet mit Fehler ${response.statusCode}${hint ? `: ${hint}` : ''}.`
            )
          );
          return;
        }
        try {
          resolve(text ? JSON.parse(text) : {});
        } catch {
          reject(new CatalogError('Die Antwort ist kein gültiges JSON.'));
        }
      });
      response.on('error', (err) => reject(new CatalogError(err.message)));
    });

    req.on('error', (err) => reject(new CatalogError(`Keine Verbindung: ${err.message}`)));
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

/* --------------------------------------------------------------------- */
/* Abgleichen                                                             */
/* --------------------------------------------------------------------- */

/** Felder, die nur lokal Sinn ergeben, vor dem Veröffentlichen entfernen. */
function forPublishing(entry) {
  const copy = { ...entry };
  LOCAL_FIELDS.forEach((field) => delete copy[field]);
  delete copy.installed;
  delete copy.running;
  delete copy.runningSince;
  delete copy.exeExists;
  delete copy.exeAbsolute;
  delete copy.uploaded;
  delete copy.source;
  return copy;
}

/**
 * Führt den entfernten Katalog mit dem lokalen zusammen.
 * Entfernte Einträge liefern die Beschreibung, lokal bleiben Pfade und
 * Spielzeiten erhalten.
 */
function merge(localApps, remoteApps) {
  const byId = new Map(localApps.map((a) => [a.id, a]));
  const remoteIds = new Set();
  let added = 0;
  let updated = 0;
  let removed = 0;

  for (const raw of remoteApps) {
    if (!raw || typeof raw !== 'object') continue;
    const incoming = { ...raw, source: 'remote' };
    const id = String(incoming.id || '').trim();
    if (!id) continue;
    remoteIds.add(id);

    const existing = byId.get(id);
    if (!existing) {
      byId.set(id, incoming);
      added++;
      continue;
    }

    // Lokale Werte gewinnen bei allem, was zu diesem PC gehört.
    const keep = {};
    LOCAL_FIELDS.forEach((field) => {
      if (existing[field]) keep[field] = existing[field];
    });
    const merged = { ...incoming, ...keep, id };
    if (JSON.stringify(merged) !== JSON.stringify(existing)) updated++;
    byId.set(id, merged);
  }

  // Titel, die es oben nicht mehr gibt.
  for (const entry of localApps) {
    if (entry.source !== 'remote' || remoteIds.has(entry.id)) continue;
    if (library.isInstalled(entry)) {
      // Installiertes bleibt - nur nicht mehr als "aus dem Store" markiert.
      byId.set(entry.id, { ...entry, source: 'local' });
    } else {
      byId.delete(entry.id);
      removed++;
    }
  }

  return { apps: [...byId.values()], added, updated, removed };
}

/** Holt den entfernten Katalog und schreibt das Ergebnis lokal. */
async function sync({ silent = false } = {}) {
  const cfg = config();
  if (!cfg.url) {
    if (silent) return { skip: true, configured: false };
    throw new CatalogError(
      'Es ist kein gemeinsamer Katalog hinterlegt. Trag die Adresse in den Einstellungen ein.'
    );
  }

  const remote = await request(cfg.url);
  const remoteApps = Array.isArray(remote?.apps) ? remote.apps : null;
  if (!remoteApps) throw new CatalogError('Die Datei enthält keine Liste "apps".');

  const data = library.readCatalog();
  const result = merge(data.apps, remoteApps);
  data.apps = result.apps;
  library.writeCatalog(data);

  const at = new Date().toISOString();
  saveConfig({
    lastSync: at,
    lastResult: { added: result.added, updated: result.updated, removed: result.removed },
  });

  return {
    configured: true,
    at,
    added: result.added,
    updated: result.updated,
    removed: result.removed,
    total: result.apps.length,
    remoteTotal: remoteApps.length,
  };
}

function shouldAutoSync() {
  const cfg = config();
  if (!cfg.autoSync || !cfg.url) return false;
  if (!cfg.lastSync) return true;
  return Date.now() - Date.parse(cfg.lastSync) > SYNC_INTERVAL_MS;
}

/* --------------------------------------------------------------------- */
/* Veröffentlichen (GitHub)                                               */
/* --------------------------------------------------------------------- */

function publishTarget() {
  const cfg = config();
  const { repo, branch, path: file, api } = cfg.publish;
  if (!repo || !repo.includes('/')) {
    throw new CatalogError('Es ist kein Repository zum Veröffentlichen hinterlegt (z.B. "Nutzer/Repo").');
  }
  const token = readToken();
  if (!token) {
    throw new CatalogError(
      'Zum Veröffentlichen fehlt ein GitHub-Token. Alternativ den Katalog exportieren und von Hand hochladen.'
    );
  }
  return {
    token,
    contentsUrl: `${api.replace(/\/$/, '')}/repos/${repo}/contents/${encodeURI(file)}`,
    branch,
    file,
    repo,
  };
}

/** Aktuellen Stand der Datei im Repo holen (inklusive sha zum Schreiben). */
async function fetchRemoteFile(target) {
  try {
    const info = await request(`${target.contentsUrl}?ref=${encodeURIComponent(target.branch)}`, {
      token: target.token,
      accept: 'application/vnd.github+json',
    });
    const text = Buffer.from(String(info.content || ''), 'base64').toString('utf8');
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      throw new CatalogError('Die Datei im Repo ist kein gültiges JSON.');
    }
    if (!Array.isArray(json.apps)) json.apps = [];
    return { json, sha: info.sha };
  } catch (err) {
    if (/Fehler 404/.test(err.message)) {
      // Datei gibt es noch nicht - dann legen wir sie an.
      return { json: { $schema: 'voidrix-catalog/1', version: 1, apps: [] }, sha: null };
    }
    throw err;
  }
}

async function writeRemoteFile(target, json, sha, message) {
  const content = Buffer.from(JSON.stringify(json, null, 2) + '\n', 'utf8').toString('base64');
  return request(target.contentsUrl, {
    method: 'PUT',
    token: target.token,
    accept: 'application/vnd.github+json',
    body: { message, content, sha: sha || undefined, branch: target.branch },
  });
}

/** Bilder, die nur lokal liegen, sieht sonst niemand. */
function localImageWarnings(entry) {
  const fields = [
    ['banner', entry.banner],
    ['cover', entry.cover],
    ['icon', entry.icon],
    ...(entry.screenshots || []).map((s, i) => [`screenshot ${i + 1}`, s]),
  ];
  return fields
    .filter(([, value]) => value && !/^https?:\/\//i.test(value))
    .map(([name]) => name);
}

/**
 * Schreibt einen Titel in den gemeinsamen Katalog.
 * Danach sehen ihn alle anderen beim nächsten Abgleich.
 */
async function publish(id) {
  const entry = library.getApp(id);
  if (!entry) throw new CatalogError('Eintrag nicht gefunden.');
  if (!entry.downloadUrl) {
    throw new CatalogError(
      'Ohne Download-Link kann der Titel bei anderen nicht installiert werden. Bitte zuerst einen Link eintragen.'
    );
  }

  const target = publishTarget();
  const { json, sha } = await fetchRemoteFile(target);

  const clean = forPublishing(entry);
  clean.publishedAt = new Date().toISOString();

  const index = json.apps.findIndex((a) => a && a.id === entry.id);
  const isNew = index < 0;
  if (isNew) json.apps.push(clean);
  else json.apps[index] = { ...json.apps[index], ...clean };

  await writeRemoteFile(
    target,
    json,
    sha,
    `Voidrix: ${entry.title} ${isNew ? 'veröffentlicht' : 'aktualisiert'}`
  );

  // Lokal gleich als "aus dem Store" markieren.
  library.patchEntry(entry.id, { source: 'remote', publishedAt: clean.publishedAt });

  return {
    published: true,
    isNew,
    title: entry.title,
    repo: target.repo,
    file: target.file,
    warnings: localImageWarnings(entry),
    total: json.apps.length,
  };
}

/** Titel wieder aus dem gemeinsamen Katalog nehmen. */
async function unpublish(id) {
  const entry = library.getApp(id);
  if (!entry) throw new CatalogError('Eintrag nicht gefunden.');

  const target = publishTarget();
  const { json, sha } = await fetchRemoteFile(target);
  const before = json.apps.length;
  json.apps = json.apps.filter((a) => a && a.id !== entry.id);
  if (json.apps.length === before) throw new CatalogError('Dieser Titel steht nicht im gemeinsamen Katalog.');

  await writeRemoteFile(target, json, sha, `Voidrix: ${entry.title} zurückgezogen`);
  library.patchEntry(entry.id, { source: 'local', publishedAt: '' });

  return { unpublished: true, title: entry.title, total: json.apps.length };
}

/**
 * Ohne Token: eine fertige Datei zum Hochladen erzeugen.
 * Enthält alle Titel mit Download-Link.
 */
function exportCatalog() {
  const apps = library
    .listApps()
    .filter((a) => a.downloadUrl)
    .map(forPublishing);

  const file = path.join(store.dataDir(), 'Games-Apps.veroeffentlichen.json');
  store.writeJson(file, { $schema: 'voidrix-catalog/1', version: 1, apps });
  return { file, count: apps.length };
}

module.exports = {
  CatalogError,
  config,
  exportCatalog,
  merge,
  publish,
  readToken,
  saveConfig,
  setToken,
  shouldAutoSync,
  sync,
  unpublish,
};
