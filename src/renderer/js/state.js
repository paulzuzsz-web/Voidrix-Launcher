/**
 * Gemeinsamer Zustand des UI + alle Aktionen die den Katalog verändern.
 */

import { confirmDialog, modal, toast, toastError, toastOk, withBusy } from './ui.js';

const vx = window.voidrix;

export const state = {
  user: null,
  apps: [],
  info: null,
  search: '',
  filter: 'all', // all | game | app | installed | missing
  route: { name: 'store', params: {} },
  booted: false,
};

const listeners = new Set();

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function emit(reason = 'change') {
  listeners.forEach((fn) => fn(reason));
}

export function isAdmin() {
  return Boolean(state.user?.isAdmin);
}

/* ------------------------------ Laden ---------------------------------- */

export async function loadApps({ silent = true } = {}) {
  try {
    state.apps = await vx.library.list();
    state.info = await vx.library.info();
    emit('apps');
    return state.apps;
  } catch (err) {
    if (!silent) toastError(err.message, 'Katalog');
    return [];
  }
}

export function getApp(id) {
  return state.apps.find((a) => a.id === id) || null;
}

/** Ersetzt einen Eintrag im Zustand (z.B. nach dem Start). */
export function upsertApp(entry) {
  if (!entry) return;
  const idx = state.apps.findIndex((a) => a.id === entry.id);
  if (idx >= 0) state.apps[idx] = entry;
  else state.apps.push(entry);
  emit('apps');
}

/* ---------------------------- Filter/Suche ------------------------------ */

export function visibleApps() {
  const q = state.search.trim().toLowerCase();
  return state.apps
    .filter((app) => {
      if (state.filter === 'game' && app.type !== 'game') return false;
      if (state.filter === 'app' && app.type !== 'app') return false;
      if (state.filter === 'installed' && !app.installed) return false;
      if (state.filter === 'missing' && app.installed) return false;
      if (!q) return true;
      return [app.title, app.developer, app.publisher, app.shortDescription, ...(app.tags || [])]
        .join(' ')
        .toLowerCase()
        .includes(q);
    })
    .sort((a, b) => a.title.localeCompare(b.title, 'de'));
}

export function stats() {
  const total = state.apps.length;
  const installed = state.apps.filter((a) => a.installed).length;
  const games = state.apps.filter((a) => a.type === 'game').length;
  const minutes = state.apps.reduce((sum, a) => sum + (Number(a.playtimeMinutes) || 0), 0);
  return { total, installed, games, apps: total - games, minutes, missing: total - installed };
}

/* ------------------------------ Aktionen -------------------------------- */

export async function launchApp(id, button) {
  const app = getApp(id);
  if (!app) return;

  if (!app.exePath) {
    const chosen = await pickExePath(id, app.title);
    if (!chosen) return;
  }

  await withBusy(button, async () => {
    try {
      const updated = await vx.library.launch(id);
      upsertApp(updated);
      toastOk(`${app.title} wurde gestartet.`, 'Viel Spaß!');
    } catch (err) {
      toastError(err.message, `${app.title} konnte nicht gestartet werden`);
    }
  });
}

export async function stopApp(id, button) {
  const app = getApp(id);
  await withBusy(button, async () => {
    try {
      await vx.library.stop(id);
      toast(`${app?.title || 'Programm'} wurde beendet.`, { type: 'info', title: 'Gestoppt' });
    } catch (err) {
      toastError(err.message);
    }
  });
}

/** Dateidialog für die .exe - danach steht der Pfad in Games-Apps.json. */
export async function pickExePath(id, title) {
  try {
    const file = await vx.dialog.pickExecutable(`${title || 'Programm'}: .exe auswählen`);
    if (!file) return null;
    const updated = await vx.library.setExePath(id, file);
    upsertApp(updated);
    toastOk(`Pfad gespeichert:\n${file}`, 'Games-Apps.json aktualisiert');
    return updated;
  } catch (err) {
    toastError(err.message);
    return null;
  }
}

export async function clearExePath(id) {
  try {
    const updated = await vx.library.setExePath(id, '');
    upsertApp(updated);
    toast('Pfad entfernt.', { type: 'info' });
  } catch (err) {
    toastError(err.message);
  }
}

export async function revealApp(id) {
  try {
    await vx.library.reveal(id);
  } catch (err) {
    toastError(err.message);
  }
}

export async function deleteApp(id) {
  const app = getApp(id);

  // Bei hochgeladenen Titeln zusätzlich anbieten, die Dateien mitzulöschen.
  const choice = app?.uploaded
    ? await modal({
        title: `"${app.title}" löschen?`,
        text:
          'Die Dateien dieses Titels liegen im Launcher-Ordner:\n' +
          `${app.exePath}\n\n` +
          'Sollen sie mitgelöscht werden?',
        actions: [
          { label: 'Abbrechen', className: 'btn--ghost', value: 'cancel' },
          { label: 'Nur Eintrag löschen', className: 'btn--ghost', value: 'entry' },
          { label: 'Eintrag + Dateien löschen', className: 'btn--danger', value: 'files' },
        ],
      })
    : (await confirmDialog({
        title: `"${app?.title || 'Eintrag'}" löschen?`,
        text: 'Der Eintrag wird aus Games-Apps.json entfernt. Die Spieldateien auf der Festplatte bleiben unberührt.',
        confirmLabel: 'Endgültig löschen',
        danger: true,
      }))
        ? 'entry'
        : 'cancel';

  if (!choice || choice === 'cancel') return false;

  try {
    const result = await vx.library.remove(id, choice === 'files');
    await loadApps();
    toastOk(result?.filesRemoved ? 'Eintrag und Dateien gelöscht.' : 'Eintrag gelöscht.');
    return true;
  } catch (err) {
    toastError(err.message);
    return false;
  }
}

export async function saveApp(payload) {
  const saved = await vx.library.save(payload);
  await loadApps();
  return saved;
}

/* ------------------------------ Live-Events ----------------------------- */

export function connectLiveUpdates() {
  vx.library.onChanged(() => loadApps());
  vx.library.onRunning((entry) => upsertApp(entry));
}
