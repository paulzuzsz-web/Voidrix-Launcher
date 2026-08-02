/**
 * Wiederverwendbare Karten für Store und Bibliothek.
 */

import { esc, icon, img, initials } from '../ui.js';
import {
  cancelInstall,
  downloadOf,
  getApp,
  installApp,
  launchApp,
  pickExePath,
  stopApp,
} from '../state.js';

export function statusBadge(app) {
  if (downloadOf(app.id)) return `<span class="badge badge--live">Lädt…</span>`;
  if (app.running) return `<span class="badge badge--live">Läuft</span>`;
  if (app.installed) return `<span class="badge badge--ok">${icon('check')}Installiert</span>`;
  if (app.downloadUrl) return `<span class="badge">${icon('download')}Verfügbar</span>`;
  if (!app.exePath) return `<span class="badge badge--warn">Kein Pfad</span>`;
  return `<span class="badge badge--warn">${icon('warn')}Fehlt</span>`;
}

/** Welche Hauptaktion hat der Titel gerade? */
export function primaryAction(app) {
  if (downloadOf(app.id)) return { key: 'cancel', label: 'Abbrechen', icon: 'close', style: 'btn--danger' };
  if (app.running) return { key: 'stop', label: 'Beenden', icon: 'stop', style: 'btn--danger' };
  if (app.installed) return { key: 'play', label: 'Starten', icon: 'play', style: 'btn--play' };
  if (app.downloadUrl) return { key: 'install', label: 'Installieren', icon: 'download', style: 'btn--primary' };
  if (!app.exePath) return { key: 'pick', label: 'Pfad festlegen', icon: 'folder', style: 'btn--primary' };
  return { key: 'pick', label: 'Pfad prüfen', icon: 'folder', style: 'btn--primary' };
}

export function primaryLabel(app) {
  return primaryAction(app).label;
}

/** Fortschrittsbalken, der per data-progress live aktualisiert wird. */
export function progressBox(app, extraClass = '') {
  const dl = downloadOf(app.id);
  if (!dl) return '';
  return `
  <div class="progress ${extraClass}" data-progress="${esc(app.id)}">
    <div class="progress__bar"><span style="width:${dl.percent}%"></span></div>
    <div class="progress__text">${esc(dl.text)}</div>
  </div>`;
}

/** Portrait-Karte (3:4) wie im Store. */
export function appCard(app) {
  const cover = app.cover || app.banner || app.icon;
  const action = primaryAction(app);
  const dl = downloadOf(app.id);

  return `
  <article class="card" data-id="${esc(app.id)}" style="--card-accent:${esc(app.accentColor)}80">
    <div class="card__media">
      ${img(cover, app.title) || `<div class="card__fallback">${esc(initials(app.title))}</div>`}
      <div class="card__scrim"></div>
      <div class="card__top">
        ${statusBadge(app)}
        <span class="badge">${
          app.source === 'remote' ? `${icon('globe')}Store` : app.type === 'app' ? 'App' : 'Game'
        }</span>
      </div>
      <div class="card__body">
        <div class="card__title">${esc(app.title)}</div>
        ${dl ? progressBox(app, 'progress--card') : `<div class="card__meta">${esc(app.developer)}</div>`}
      </div>
      <div class="card__quick">
        <button class="btn ${action.style} btn--sm btn--block" data-act="primary" data-id="${esc(app.id)}">
          ${icon(action.icon)}${esc(action.label)}
        </button>
      </div>
    </div>
  </article>`;
}

/** Breite Zeilen-Karte für Listen. */
export function appRow(app) {
  const thumb = app.banner || app.cover || app.icon;
  const action = primaryAction(app);
  return `
  <article class="rowcard" data-id="${esc(app.id)}">
    <div class="rowcard__thumb">${img(thumb, app.title) || esc(initials(app.title))}</div>
    <div class="rowcard__body">
      <div class="rowcard__title">${esc(app.title)}</div>
      <div class="rowcard__desc">${esc(app.shortDescription || app.description || 'Keine Beschreibung.')}</div>
      ${progressBox(app)}
    </div>
    <div class="rowcard__side">
      ${statusBadge(app)}
      <button class="btn btn--sm ${action.style}" data-act="primary" data-id="${esc(app.id)}">
        ${icon(action.icon)}${esc(action.label)}
      </button>
    </div>
  </article>`;
}

/** Führt die Hauptaktion einer Karte aus. */
export async function runPrimaryAction(id, button) {
  const app = getApp(id);
  if (!app) return;
  const { key } = primaryAction(app);

  if (key === 'cancel') return cancelInstall(id);
  if (key === 'stop') return stopApp(id, button);
  if (key === 'play') return launchApp(id, button);
  if (key === 'install') return installApp(id);
  return pickExePath(id, app.title);
}


/**
 * Klicks auf Karten verdrahten: Karte -> Detailseite, Button -> Aktion.
 */
export function bindCards(root, { onOpen }) {
  root.addEventListener('click', async (event) => {
    const actionBtn = event.target.closest('[data-act="primary"]');
    if (actionBtn) {
      event.stopPropagation();
      await runPrimaryAction(actionBtn.dataset.id, actionBtn);
      return;
    }

    const card = event.target.closest('[data-id]');
    if (card && onOpen) onOpen(card.dataset.id);
  });
}
