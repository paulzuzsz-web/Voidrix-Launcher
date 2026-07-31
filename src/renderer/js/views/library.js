/**
 * Bibliothek: Filter, Kennzahlen und alle Titel als Raster.
 */

import { $$, esc, formatPlaytime, icon } from '../ui.js';
import { emit, isAdmin, state, stats, visibleApps } from '../state.js';
import { appCard, bindCards } from './cards.js';

const FILTERS = [
  ['all', 'Alle'],
  ['game', 'Spiele'],
  ['app', 'Apps'],
  ['installed', 'Installiert'],
  ['missing', 'Ohne Pfad'],
];

export function renderLibrary(view, { navigate }) {
  const apps = visibleApps();
  const s = stats();

  view.innerHTML = `
    <div class="view__inner">
      <div class="stats">
        <div class="stat">
          <span class="stat__value">${s.total}</span>
          <span class="stat__label">Titel im Katalog</span>
        </div>
        <div class="stat">
          <span class="stat__value">${s.installed}</span>
          <span class="stat__label">Startbereit</span>
        </div>
        <div class="stat">
          <span class="stat__value">${esc(formatPlaytime(s.minutes))}</span>
          <span class="stat__label">Gesamte Laufzeit</span>
        </div>
        <div class="stat">
          <span class="stat__value">${s.missing}</span>
          <span class="stat__label">Ohne gültigen Pfad</span>
        </div>
      </div>

      <div class="filters">
        ${FILTERS.map(
          ([key, label]) =>
            `<button class="chip ${state.filter === key ? 'is-active' : ''}" data-filter="${key}">${esc(
              label
            )}</button>`
        ).join('')}
        <span class="filters__spacer"></span>
        <span class="section__note">${apps.length} von ${s.total} angezeigt</span>
      </div>

      ${
        apps.length
          ? `<div class="grid">${apps.map(appCard).join('')}</div>`
          : `<div class="empty">
              <div class="empty__mark">${icon('library')}</div>
              <h3>${state.search ? 'Kein Treffer' : 'Hier ist es noch leer'}</h3>
              <p>${
                state.search
                  ? 'Für diese Suche gibt es keinen Eintrag.'
                  : isAdmin()
                    ? 'Lade oben unter "Hochladen" dein erstes Game oder deine erste App hoch.'
                    : 'Sobald ein Administrator Titel hinzufügt, erscheinen sie hier.'
              }</p>
            </div>`
      }
    </div>`;

  $$('[data-filter]', view).forEach((chip) =>
    chip.addEventListener('click', () => {
      state.filter = chip.dataset.filter;
      emit('filter');
    })
  );

  bindCards(view, { onOpen: (id) => navigate('detail', { id }) });
  return () => {};
}
