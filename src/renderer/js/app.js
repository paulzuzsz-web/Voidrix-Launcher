/**
 * Einstiegspunkt des UI: Start, Anmeldung, Navigation, Kopfzeile.
 */

import { $, $$, debounce, esc, icon, img, initials, toast, toastError, watchBrokenImages, withBusy } from './ui.js';
import {
  connectLiveUpdates,
  emit,
  isAdmin,
  loadApps,
  state,
  stats,
  subscribe,
  syncCatalog,
} from './state.js';
import { renderAuth } from './auth.js';
import { renderSetup } from './setup.js';
import { checkOnStart } from './update.js';
import { renderStore } from './views/store.js';
import { renderLibrary } from './views/library.js';
import { renderDetail } from './views/detail.js';
import { renderAdmin } from './views/admin.js';
import { renderUsers } from './views/users.js';
import { renderSettings } from './views/settings.js';

const vx = window.voidrix;

const ROUTES = {
  store: {
    label: 'Store',
    icon: 'store',
    title: 'Store',
    sub: 'Entdecke alles was auf diesem PC bereitsteht',
    render: renderStore,
    search: true,
  },
  library: {
    label: 'Bibliothek',
    icon: 'library',
    title: 'Meine Bibliothek',
    sub: 'Deine Spiele und Apps auf einen Blick',
    render: renderLibrary,
    search: true,
  },
  detail: { title: 'Details', render: renderDetail, hidden: true },
  admin: {
    label: 'Hochladen',
    icon: 'upload',
    title: 'Game oder App hochladen',
    sub: 'Neue Titel mit Banner, Bild und Beschreibung in den Store legen',
    render: renderAdmin,
    admin: true,
  },
  users: {
    label: 'Benutzer',
    icon: 'users',
    title: 'Konten',
    sub: 'Alle auf diesem PC gespeicherten Voidrix-Konten',
    render: renderUsers,
    admin: true,
  },
  settings: {
    label: 'Einstellungen',
    icon: 'settings',
    title: 'Einstellungen',
    sub: 'Speicherorte, Profil und Katalogdatei',
    render: renderSettings,
  },
};

let cleanup = () => {};

/* ---------------------------- Fenstersteuerung --------------------------- */

function wireWindowControls() {
  $('#btn-min').addEventListener('click', () => vx.window.minimize());
  $('#btn-max').addEventListener('click', () => vx.window.toggleMaximize());
  $('#btn-close').addEventListener('click', () => vx.window.close());
  $('#titlebar').addEventListener('dblclick', (event) => {
    if (event.target.closest('.titlebar__actions')) return;
    vx.window.toggleMaximize();
  });
}

/* -------------------------------- Navigation ----------------------------- */

export function navigate(name, params = {}) {
  if (!ROUTES[name]) name = 'store';
  if (ROUTES[name].admin && !isAdmin()) {
    toastError('Dieser Bereich ist nur für Administratoren.');
    name = 'store';
    params = {};
  }
  state.route = { name, params };
  renderRoute();
  renderRail();
  renderTopbar();
}

/**
 * Zeichnet die aktuelle Ansicht.
 * `keepScroll` = true bei Aktualisierungen im Hintergrund, damit die Seite
 * nicht nach oben springt, während man scrollt.
 */
function renderRoute({ keepScroll = false } = {}) {
  const route = ROUTES[state.route.name];

  cleanup();

  // Frisches #view-Element: so verschwinden alle Listener der alten Ansicht
  // und nichts wird beim nächsten Klick doppelt ausgelöst.
  const previous = $('#view');
  const scrollTop = previous.scrollTop;
  const view = previous.cloneNode(false);
  previous.replaceWith(view);

  cleanup =
    route.render(view, {
      navigate,
      params: state.route.params,
      onLogout: logout,
    }) || (() => {});

  if (keepScroll && scrollTop) view.scrollTop = scrollTop;
}

/* ------------------------------ Seitenleiste ----------------------------- */

function renderRail() {
  const rail = $('#rail');
  const s = stats();
  const current = state.route.name;
  const user = state.user || {};

  const item = (key) => {
    const route = ROUTES[key];
    if (route.admin && !isAdmin()) return '';
    const count = key === 'library' ? s.total : key === 'store' ? s.installed : null;
    return `
      <button class="rail__item ${current === key ? 'is-active' : ''}" data-route="${key}">
        ${icon(route.icon)}<span>${esc(route.label)}</span>
        ${count !== null ? `<span class="rail__count">${count}</span>` : ''}
      </button>`;
  };

  rail.innerHTML = `
    <div class="rail__group">Entdecken</div>
    ${item('store')}
    ${item('library')}
    ${
      isAdmin()
        ? `<div class="rail__group">Administration</div>${item('admin')}${item('users')}`
        : ''
    }
    <div class="rail__spacer"></div>
    ${item('settings')}
    <button class="rail__user" data-route="settings" title="Profil und Einstellungen">
      <div class="avatar" style="--size:36px">
        ${img(user.avatar, user.profileName) || esc(initials(user.profileName || user.username))}
      </div>
      <div class="rail__user-info">
        <span class="rail__user-name">${esc(user.profileName || '')}</span>
        <span class="rail__user-role">${user.isAdmin ? 'Administrator' : 'Mitglied'}</span>
      </div>
    </button>`;

  $$('[data-route]', rail).forEach((btn) =>
    btn.addEventListener('click', () => navigate(btn.dataset.route))
  );
}

/* -------------------------------- Kopfzeile ------------------------------ */

function renderTopbar() {
  const bar = $('#topbar');
  const route = ROUTES[state.route.name];
  const isDetail = state.route.name === 'detail';

  // Auf der Detailseite steht der Titel des Spiels in der Kopfzeile.
  const openApp = isDetail ? state.apps.find((a) => a.id === state.route.params.id) : null;
  const title = openApp ? openApp.title : route.title;
  const sub = openApp ? `${openApp.type === 'app' ? 'App' : 'Spiel'} von ${openApp.developer}` : route.sub;

  bar.innerHTML = `
    <div>
      <div class="topbar__title">${esc(title)}</div>
      ${sub ? `<div class="topbar__sub">${esc(sub)}</div>` : ''}
    </div>
    ${
      route.search
        ? `<div class="search">
             ${icon('search')}
             <input class="input" id="search-input" type="search" placeholder="Spiele und Apps durchsuchen…"
                    value="${esc(state.search)}" />
           </div>`
        : '<div style="margin-left:auto"></div>'
    }
    ${
      isAdmin() && !isDetail
        ? `<button class="btn btn--sm btn--primary" data-quick="admin">${icon('plus')}Hochladen</button>`
        : ''
    }
    <button class="btn btn--sm btn--ghost btn--icon" data-quick="reload" title="Katalog neu laden">
      ${icon('refresh')}
    </button>`;

  const search = $('#search-input', bar);
  if (search) {
    search.addEventListener(
      'input',
      debounce(() => {
        state.search = search.value;
        emit('search');
      }, 180)
    );
  }

  $$('[data-quick]', bar).forEach((btn) =>
    btn.addEventListener('click', async () => {
      if (btn.dataset.quick === 'admin') {
        navigate('admin');
        return;
      }
      // loadApps meldet die Änderung; die Ansicht zeichnet sich selbst neu.
      await withBusy(btn, () => loadApps({ silent: false }));
      toast('Katalog neu geladen.', { type: 'info' });
    })
  );
}

/* ------------------------------- Ab-/Anmelden ---------------------------- */

async function logout() {
  try {
    await vx.auth.logout();
  } catch {
    /* auch bei Fehlern zurück zum Login */
  }
  state.user = null;
  state.apps = [];
  cleanup();
  cleanup = () => {};
  $('#shell').hidden = true;
  $('#view').innerHTML = '';
  renderAuth(onLoggedIn);
}

async function onLoggedIn(user) {
  state.user = user;
  await loadApps();
  $('#shell').hidden = false;
  navigate('store');
  setTimeout(() => syncCatalog({ silent: true }), 700);
  setTimeout(() => checkOnStart(), 2600);
}

/* ---------------------------------- Start -------------------------------- */

function wireShortcuts() {
  document.addEventListener('keydown', (event) => {
    if (event.ctrlKey && event.key.toLowerCase() === 'f') {
      const input = $('#search-input');
      if (input) {
        event.preventDefault();
        input.focus();
        input.select();
      }
    }
    if (event.key === 'Escape' && state.route.name === 'detail' && !$('.modal-backdrop')) {
      navigate('store');
    }
  });
}

/** Bei Datenänderungen die passenden Bereiche neu zeichnen. */
function wireReactivity() {
  subscribe((reason) => {
    const name = state.route.name;
    if (reason === 'user') {
      renderRail();
      return;
    }
    // Im Admin-Formular niemals neu rendern - sonst wäre die Eingabe weg.
    if (name === 'admin') return;
    if (['apps', 'filter', 'search'].includes(reason)) {
      renderRoute({ keepScroll: reason === 'apps' });
      if (reason === 'apps') {
        renderRail();
        // Kopfzeile nur neu bauen, wenn gerade niemand ins Suchfeld tippt.
        if (document.activeElement !== $('#search-input')) renderTopbar();
      }
    }
  });
}

async function boot() {
  watchBrokenImages();
  wireWindowControls();
  wireShortcuts();
  wireReactivity();
  connectLiveUpdates();

  let info = null;
  try {
    info = await vx.auth.bootstrap();
  } catch (err) {
    toastError(err.message, 'Start fehlgeschlagen');
  }

  if (info?.needsSetup) {
    // Erster Start nach der Installation: zuerst den Datenordner wählen.
    renderSetup(() => renderAuth(onLoggedIn));
  } else if (info?.user) {
    state.user = info.user;
    await loadApps();
    $('#shell').hidden = false;
    navigate('store');
    // Kurz warten, damit der Store zuerst steht - dann abgleichen und
    // nach Launcher-Updates sehen.
    setTimeout(() => syncCatalog({ silent: true }), 700);
    setTimeout(() => checkOnStart(), 2200);
  } else {
    renderAuth(onLoggedIn);
  }

  // Ladebildschirm sanft ausblenden.
  setTimeout(() => {
    const boot = $('#boot');
    boot.hidden = true;
    setTimeout(() => boot.remove(), 600);
  }, 450);
}

boot();
