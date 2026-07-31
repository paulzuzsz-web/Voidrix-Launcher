/**
 * Wiederverwendbare Karten für Store und Bibliothek.
 */

import { esc, icon, img, initials } from '../ui.js';
import { getApp, launchApp, pickExePath, stopApp } from '../state.js';

export function statusBadge(app) {
  if (app.running) return `<span class="badge badge--live">Läuft</span>`;
  if (app.installed) return `<span class="badge badge--ok">${icon('check')}Installiert</span>`;
  if (!app.exePath) return `<span class="badge badge--warn">Kein Pfad</span>`;
  return `<span class="badge badge--warn">${icon('warn')}Fehlt</span>`;
}

export function primaryLabel(app) {
  if (app.running) return 'Beenden';
  if (app.installed) return 'Starten';
  if (!app.exePath) return 'Pfad festlegen';
  return 'Pfad prüfen';
}

/** Portrait-Karte (3:4) wie im Store. */
export function appCard(app) {
  const cover = app.cover || app.banner || app.icon;
  return `
  <article class="card" data-id="${esc(app.id)}" style="--card-accent:${esc(app.accentColor)}80">
    <div class="card__media">
      ${img(cover, app.title) || `<div class="card__fallback">${esc(initials(app.title))}</div>`}
      <div class="card__scrim"></div>
      <div class="card__top">
        ${statusBadge(app)}
        <span class="badge">${app.type === 'app' ? 'App' : 'Game'}</span>
      </div>
      <div class="card__body">
        <div class="card__title">${esc(app.title)}</div>
        <div class="card__meta">${esc(app.developer)}</div>
      </div>
      <div class="card__quick">
        <button class="btn ${app.running ? 'btn--danger' : app.installed ? 'btn--play' : 'btn--primary'} btn--sm btn--block"
                data-act="primary" data-id="${esc(app.id)}">
          ${icon(app.running ? 'stop' : app.installed ? 'play' : 'folder')}${esc(primaryLabel(app))}
        </button>
      </div>
    </div>
  </article>`;
}

/** Breite Zeilen-Karte für Listen. */
export function appRow(app) {
  const thumb = app.banner || app.cover || app.icon;
  return `
  <article class="rowcard" data-id="${esc(app.id)}">
    <div class="rowcard__thumb">${img(thumb, app.title) || esc(initials(app.title))}</div>
    <div class="rowcard__body">
      <div class="rowcard__title">${esc(app.title)}</div>
      <div class="rowcard__desc">${esc(app.shortDescription || app.description || 'Keine Beschreibung.')}</div>
    </div>
    <div class="rowcard__side">
      ${statusBadge(app)}
      <button class="btn btn--sm ${app.installed && !app.running ? 'btn--play' : 'btn--ghost'}"
              data-act="primary" data-id="${esc(app.id)}">
        ${icon(app.running ? 'stop' : app.installed ? 'play' : 'folder')}${esc(primaryLabel(app))}
      </button>
    </div>
  </article>`;
}

/**
 * Klicks auf Karten verdrahten: Karte -> Detailseite, Button -> Aktion.
 */
export function bindCards(root, { onOpen }) {
  root.addEventListener('click', async (event) => {
    const actionBtn = event.target.closest('[data-act="primary"]');
    if (actionBtn) {
      event.stopPropagation();
      const id = actionBtn.dataset.id;
      const app = getApp(id);
      if (app?.running) await stopApp(id, actionBtn);
      else if (app?.exePath) await launchApp(id, actionBtn);
      else await pickExePath(id, app?.title);
      return;
    }

    const card = event.target.closest('[data-id]');
    if (card && onOpen) onOpen(card.dataset.id);
  });
}
