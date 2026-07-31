/**
 * Einstellungen: Profil, Speicherorte, Katalogdatei und Infos.
 */

import {
  $,
  esc,
  icon,
  img,
  initials,
  modal,
  toastError,
  toastOk,
  withBusy,
} from '../ui.js';
import { emit, loadApps, state } from '../state.js';

const vx = window.voidrix;

function setting(title, desc, actionsHtml) {
  return `
  <div class="setting">
    <div class="setting__body">
      <div class="setting__title">${title}</div>
      <div class="setting__desc">${desc}</div>
    </div>
    <div class="setting__actions">${actionsHtml}</div>
  </div>`;
}

export function renderSettings(view, { onLogout }) {
  const info = state.info || {};
  const user = state.user || {};

  view.innerHTML = `
    <div class="view__inner">
      <div class="settings">
        <div class="setting">
          <div class="avatar" style="--size:62px">
            ${img(user.avatar, user.profileName) || esc(initials(user.profileName || user.username))}
          </div>
          <div class="setting__body">
            <div class="setting__title">${esc(user.profileName || '')} ${
              user.isAdmin ? `<span class="badge badge--admin">${icon('shield')}Admin</span>` : ''
            }</div>
            <div class="setting__desc mono">@${esc(user.username || '')}</div>
          </div>
          <div class="setting__actions">
            <button class="btn btn--sm" data-act="profile">${icon('edit')}Profil bearbeiten</button>
            <button class="btn btn--sm btn--ghost" data-act="password">Passwort ändern</button>
          </div>
        </div>

        ${setting(
          'Games-Apps.json',
          `Hier stehen alle Titel und die Pfade zu den .exe-Dateien.<br><span class="mono">${esc(
            info.catalogPath || ''
          )}</span>`,
          `<button class="btn btn--sm" data-act="open-catalog">${icon('edit')}Datei öffnen</button>
           <button class="btn btn--sm btn--ghost" data-act="open-folder">${icon('folder')}Ordner</button>
           <button class="btn btn--sm btn--ghost" data-act="reload">${icon('refresh')}Neu laden</button>`
        )}

        ${setting(
          'Bilder-Ordner',
          `Hochgeladene Banner, Cover und Icons.<br><span class="mono">${esc(info.mediaDir || '')}</span>`,
          `<button class="btn btn--sm btn--ghost" data-act="open-media">${icon('folder')}Öffnen</button>`
        )}

        ${setting(
          'Konten',
          `Alle Konten liegen lokal auf diesem PC.<br><span class="mono">${esc(info.accountsPath || '')}</span>`,
          `<button class="btn btn--sm btn--ghost" data-act="open-data">${icon('folder')}Datenordner</button>`
        )}

        ${setting(
          'Beispiel-Eintrag',
          'So sieht ein Eintrag in Games-Apps.json aus - einfach kopieren und anpassen.',
          `<button class="btn btn--sm btn--ghost" data-act="example">${icon('info')}Anzeigen</button>`
        )}

        ${setting(
          'Abmelden',
          'Beendet die gespeicherte Anmeldung auf diesem Geraet.',
          `<button class="btn btn--sm btn--danger" data-act="logout">${icon('logout')}Abmelden</button>`
        )}

        <div class="setting">
          <div class="setting__body">
            <div class="setting__title">Voidrix Launcher ${esc(info.version || '')}</div>
            <div class="setting__desc mono">
              Electron ${esc(info.electron || '?')} &middot; Chromium ${esc(info.chrome || '?')} &middot;
              Node ${esc(info.node || '?')} &middot; ${esc(info.platform || '')}/${esc(info.arch || '')}
            </div>
          </div>
        </div>
      </div>
    </div>`;

  const actions = {
    'open-catalog': () => vx.shell.openPath('catalog').catch((e) => toastError(e.message)),
    'open-folder': () => vx.shell.openPath('catalogFolder').catch((e) => toastError(e.message)),
    'open-media': () => vx.shell.openPath('media').catch((e) => toastError(e.message)),
    'open-data': () => vx.shell.openPath('data').catch((e) => toastError(e.message)),
    reload: async (btn) => {
      await withBusy(btn, () => loadApps({ silent: false }));
      toastOk('Katalog neu geladen.');
    },
    example: () => showExample(),
    profile: () => editProfile(),
    password: () => changePassword(),
    logout: () => onLogout(),
  };

  view.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-act]');
    if (btn) actions[btn.dataset.act]?.(btn);
  });

  return () => {};
}

/* --------------------------------- Modale -------------------------------- */

function showExample() {
  const example = `{
  "apps": [
    {
      "id": "voidrix-arena",
      "title": "Voidrix Arena",
      "type": "game",
      "developer": "Voidrix Studios",
      "description": "Schneller Arena-Shooter.",
      "banner": "media/arena-banner.png",
      "cover": "media/arena-cover.png",
      "icon": "media/arena-icon.png",
      "tags": ["Action", "Multiplayer"],
      "version": "1.0.0",
      "size": "12 GB",
      "exePath": "C:\\\\Games\\\\VoidrixArena\\\\Arena.exe",
      "args": ["-fullscreen"],
      "featured": true,
      "accentColor": "#8b5cf6"
    }
  ]
}`;
  modal({
    title: 'Aufbau von Games-Apps.json',
    text: 'Wichtig ist "exePath" - dort steht der Pfad zur .exe. Unter Windows Backslashes doppelt schreiben.',
    html: `<div class="codeblock mono">${esc(example)}</div>`,
    wide: true,
    actions: [{ label: 'Schließen', className: 'btn--ghost' }],
  });
}

async function editProfile() {
  const user = state.user;
  let avatar = user.avatar || '';

  await modal({
    title: 'Profil bearbeiten',
    html: `
      <div style="display:flex;gap:16px;align-items:center;margin-bottom:18px">
        <div class="avatar" style="--size:64px" id="pf-avatar">
          ${img(avatar, user.profileName) || esc(initials(user.profileName))}
        </div>
        <div style="display:grid;gap:8px">
          <button type="button" class="btn btn--sm" data-pick-avatar>${icon('upload')}Profilbild wählen</button>
          <button type="button" class="btn btn--sm btn--ghost" data-clear-avatar>Entfernen</button>
        </div>
      </div>
      <div class="field">
        <label class="field__label" for="pf-name">Profilname</label>
        <input class="input" id="pf-name" value="${esc(user.profileName)}" maxlength="24" />
      </div>
      <div class="field">
        <label class="field__label">Benutzername</label>
        <input class="input mono" value="${esc(user.username)}" disabled />
        <div class="field__hint">Der Benutzername kann nicht geändert werden.</div>
      </div>`,
    actions: [
      { label: 'Abbrechen', className: 'btn--ghost' },
      {
        label: 'Speichern',
        className: 'btn--primary',
        keepOpen: true,
        onClick: async (root, close) => {
          const btn = $('[data-action="1"]', root);
          await withBusy(btn, async () => {
            try {
              state.user = await vx.auth.updateProfile({
                profileName: $('#pf-name', root).value,
                avatar,
              });
              emit('user');
              toastOk('Profil aktualisiert.');
              close(true);
            } catch (err) {
              toastError(err.message);
            }
          });
        },
      },
    ],
    onMount: (root) => {
      $('[data-pick-avatar]', root).addEventListener('click', async () => {
        try {
          const ref = await vx.dialog.pickImage(false);
          if (!ref) return;
          avatar = ref;
          $('#pf-avatar', root).innerHTML = img(avatar, '') || '';
        } catch (err) {
          toastError(err.message);
        }
      });
      $('[data-clear-avatar]', root).addEventListener('click', () => {
        avatar = '';
        $('#pf-avatar', root).innerHTML = esc(initials(state.user.profileName));
      });
    },
  });
}

async function changePassword() {
  await modal({
    title: 'Passwort ändern',
    html: `
      <div class="field">
        <label class="field__label" for="pw-cur">Aktuelles Passwort</label>
        <input class="input" id="pw-cur" type="password" autocomplete="current-password" />
      </div>
      <div class="field">
        <label class="field__label" for="pw-new">Neues Passwort</label>
        <input class="input" id="pw-new" type="password" autocomplete="new-password" />
      </div>
      <div class="field">
        <label class="field__label" for="pw-rep">Neues Passwort wiederholen</label>
        <input class="input" id="pw-rep" type="password" autocomplete="new-password" />
      </div>`,
    actions: [
      { label: 'Abbrechen', className: 'btn--ghost' },
      {
        label: 'Passwort speichern',
        className: 'btn--primary',
        keepOpen: true,
        onClick: async (root, close) => {
          const btn = $('[data-action="1"]', root);
          await withBusy(btn, async () => {
            try {
              await vx.auth.changePassword({
                currentPassword: $('#pw-cur', root).value,
                password: $('#pw-new', root).value,
                passwordRepeat: $('#pw-rep', root).value,
              });
              toastOk('Passwort geändert.');
              close(true);
            } catch (err) {
              toastError(err.message);
            }
          });
        },
      },
    ],
  });
}
