/**
 * Detailseite eines Spiels / einer App.
 */

import {
  $,
  $$,
  esc,
  formatDate,
  formatPlaytime,
  icon,
  img,
  initials,
  lightbox,
  relativeTime,
} from '../ui.js';
import {
  cancelInstall,
  clearExePath,
  deleteApp,
  downloadOf,
  getApp,
  isAdmin,
  installApp,
  launchApp,
  pickExePath,
  revealApp,
  stopApp,
  uninstallApp,
} from '../state.js';
import { primaryAction, progressBox } from './cards.js';

function infoRow(label, value) {
  if (!value) return '';
  return `<div class="info-row"><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`;
}

export function renderDetail(view, { navigate, params }) {
  const app = getApp(params.id);

  if (!app) {
    view.innerHTML = `
      <div class="view__inner">
        <div class="empty">
          <div class="empty__mark">${icon('warn')}</div>
          <h3>Eintrag nicht gefunden</h3>
          <p>Dieser Titel existiert nicht mehr in Games-Apps.json.</p>
          <button class="btn btn--primary" data-go="store">Zurück zum Store</button>
        </div>
      </div>`;
    $('[data-go="store"]', view)?.addEventListener('click', () => navigate('store'));
    return () => {};
  }

  const banner = app.banner || app.cover || app.icon;
  const action = primaryAction(app);
  const loading = downloadOf(app.id);

  view.innerHTML = `
  <article class="detail ${loading ? 'is-loading' : ''}" style="--detail-accent:${esc(app.accentColor)}">
    <header class="detail__hero">
      ${img(banner, app.title) || '<div class="detail__hero-fallback"></div>'}
      <div class="detail__hero-scrim"></div>
      <button class="btn btn--sm btn--ghost detail__back" data-act="back">${icon('chev-left')}Zurück</button>

      <div class="detail__head">
        <div class="detail__icon">
          ${img(app.icon || app.cover, app.title) || esc(initials(app.title))}
        </div>
        <div class="detail__headings">
          <div class="detail__by">
            ${app.type === 'app' ? 'App' : 'Spiel'} &middot; ${esc(app.developer)}
            ${app.running ? '<span class="badge badge--live">Läuft</span>' : ''}
            ${
              !app.running && app.installed
                ? `<span class="badge badge--ok">${icon('check')}Installiert</span>`
                : ''
            }
            ${!app.installed ? `<span class="badge badge--warn">${icon('warn')}Nicht installiert</span>` : ''}
          </div>
          <h1 class="detail__title">${esc(app.title)}</h1>
          <div class="detail__by">
            ${(app.tags || []).map((t) => `<span class="tag">${esc(t)}</span>`).join('')}
          </div>
        </div>

        <div class="detail__actions">
          <button class="btn ${action.style} btn--lg" data-act="${esc(action.key)}">
            ${icon(action.icon)}${esc(action.label)}
          </button>
          ${
            app.installed && !loading
              ? `<button class="btn btn--icon btn--ghost" data-act="reveal" title="Im Ordner anzeigen">${icon(
                  'folder'
                )}</button>`
              : ''
          }
          ${
            app.installed && !loading && app.uploaded
              ? `<button class="btn btn--icon btn--ghost" data-act="uninstall" title="Deinstallieren">${icon(
                  'trash'
                )}</button>`
              : ''
          }
          ${
            isAdmin()
              ? `<button class="btn btn--icon btn--ghost" data-act="edit" title="Bearbeiten">${icon('edit')}</button>
                 <button class="btn btn--icon btn--danger" data-act="delete" title="Löschen">${icon('trash')}</button>`
              : ''
          }
        </div>
      </div>
      ${loading ? `<div class="detail__progress">${progressBox(app)}</div>` : ''}
    </header>

    <div class="detail__grid">
      <div>
        <section class="detail__section">
          <h3>Über ${esc(app.title)}</h3>
          <p class="detail__desc">${esc(app.description || app.shortDescription || 'Keine Beschreibung hinterlegt.')}</p>
        </section>

        ${
          (app.screenshots || []).length
            ? `<section class="detail__section">
                 <h3>Screenshots</h3>
                 <div class="shots">
                   ${app.screenshots
                     .map((s) => img(s, `${app.title} Screenshot`) || '')
                     .join('')}
                 </div>
               </section>`
            : ''
        }

        ${
          app.website
            ? `<section class="detail__section">
                 <h3>Links</h3>
                 <button class="btn btn--sm btn--ghost" data-act="web">${icon('link')}Website öffnen</button>
               </section>`
            : ''
        }
      </div>

      <aside class="infopanel">
        <dl>
          ${infoRow('Typ', app.type === 'app' ? 'Anwendung' : 'Spiel')}
          ${infoRow('Version', app.version)}
          ${infoRow('Größe', app.size)}
          ${infoRow('Preis', app.price)}
          ${infoRow('Entwickler', app.developer)}
          ${infoRow('Publisher', app.publisher)}
          ${infoRow('Release', app.releaseDate ? formatDate(app.releaseDate) : '')}
          ${infoRow('Hinzugefügt', `${formatDate(app.addedAt)}${app.addedBy ? ` von ${app.addedBy}` : ''}`)}
          ${infoRow('Zuletzt gestartet', relativeTime(app.lastPlayedAt))}
          ${infoRow('Starts', String(app.launchCount || 0))}
          ${infoRow('Laufzeit', formatPlaytime(app.playtimeMinutes))}
        </dl>

        ${
          app.downloadUrl
            ? `<div class="pathbox">
                 <div class="pathbox__label">Download-Link</div>
                 <div class="mono pathbox__value">${esc(app.downloadUrl)}</div>
                 ${
                   app.installedAt
                     ? `<div class="field__hint" style="margin-top:6px">${icon('check')} Installiert am ${esc(
                         formatDate(app.installedAt)
                       )}</div>`
                     : ''
                 }
               </div>`
            : ''
        }

        <div class="pathbox">
          <div class="pathbox__label">Programmdatei (.exe)</div>
          <div class="mono pathbox__value ${app.exePath && !app.installed ? 'is-missing' : ''}">
            ${esc(app.exePath || 'Noch kein Pfad hinterlegt')}
          </div>
          ${
            app.exePath
              ? `<div class="field__hint" style="margin-top:6px">${
                  app.uploaded
                    ? `${icon('upload')} In den Launcher hochgeladen (Ordner spiele/)`
                    : `${icon('link')} Nur verknüpft — liegt außerhalb des Launchers`
                }</div>`
              : ''
          }
        </div>

        <div class="modal__actions" style="justify-content:flex-start;margin-top:14px">
          <button class="btn btn--sm" data-act="pick">${icon('folder')}${app.exePath ? 'Pfad ändern' : 'Pfad wählen'}</button>
          ${app.exePath ? `<button class="btn btn--sm btn--ghost" data-act="clear">Entfernen</button>` : ''}
        </div>
      </aside>
    </div>
  </article>`;

  const actions = {
    back: () => navigate('store'),
    play: (btn) => launchApp(app.id, btn),
    stop: (btn) => stopApp(app.id, btn),
    install: () => installApp(app.id),
    cancel: () => cancelInstall(app.id),
    uninstall: () => uninstallApp(app.id),
    reveal: () => revealApp(app.id),
    pick: () => pickExePath(app.id, app.title),
    clear: () => clearExePath(app.id),
    edit: () => navigate('admin', { id: app.id }),
    delete: async () => {
      if (await deleteApp(app.id)) navigate('library');
    },
    web: () => window.voidrix.shell.openExternal(app.website),
  };

  view.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-act]');
    if (!btn) return;
    actions[btn.dataset.act]?.(btn);
  });

  $$('.shots img', view).forEach((el) =>
    el.addEventListener('click', () => lightbox(el.getAttribute('src')))
  );

  // Kleiner Parallax-Effekt beim Scrollen.
  const hero = $('.detail__hero img', view) || $('.detail__hero-fallback', view);
  const onScroll = () => {
    if (!hero) return;
    hero.style.transform = `scale(1.06) translateY(${Math.min(view.scrollTop * 0.12, 40)}px)`;
  };
  view.addEventListener('scroll', onScroll, { passive: true });

  return () => view.removeEventListener('scroll', onScroll);
}
