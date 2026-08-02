/**
 * Einstellungen: Profil, Speicherorte, Katalogdatei und Infos.
 */

import {
  $,
  confirmDialog,
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
import { checkNow } from '../update.js';

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
          `${icon('folder')} Datenordner`,
          `Hier liegt alles: Katalog, Konten, Bilder und Sicherungen.<br><span class="mono">${esc(
            info.dataRoot || info.dataDir || ''
          )}</span>`,
          `<button class="btn btn--sm" data-act="open-data">${icon('folder')}Öffnen</button>
           ${
             state.user?.isAdmin
               ? `<button class="btn btn--sm btn--ghost" data-act="change-data">${icon('refresh')}Ändern</button>`
               : ''
           }`
        )}

        ${setting(
          'Games-Apps.json',
          `Alle Titel und die Pfade zu den .exe-Dateien.<br><span class="mono">${esc(
            info.catalogPath || ''
          )}</span>`,
          `<button class="btn btn--sm" data-act="open-catalog">${icon('edit')}Datei öffnen</button>
           <button class="btn btn--sm btn--ghost" data-act="open-folder">${icon('folder')}Ordner</button>
           <button class="btn btn--sm btn--ghost" data-act="reload">${icon('refresh')}Neu laden</button>`
        )}

        ${setting(
          'media/ — Bilder',
          `Banner, Cover, Icons, Screenshots und Profilbilder, nach Art sortiert.<br><span class="mono">${esc(
            info.mediaDir || ''
          )}</span>`,
          `<button class="btn btn--sm btn--ghost" data-act="open-media">${icon('folder')}Öffnen</button>`
        )}

        ${setting(
          'spiele/ — Installationen',
          `Vorgeschlagener Platz für deine Spiele und Apps.<br><span class="mono">${esc(
            info.gamesDir || ''
          )}</span>`,
          `<button class="btn btn--sm btn--ghost" data-act="open-games">${icon('folder')}Öffnen</button>`
        )}

        ${setting(
          'sicherungen/ — Backups',
          `Automatische Kopien der Games-Apps.json vor jeder Änderung.<br><span class="mono">${esc(
            info.backupDir || ''
          )}</span>`,
          `<button class="btn btn--sm btn--ghost" data-act="open-backups">${icon('folder')}Öffnen</button>`
        )}

        ${setting(
          'konten/ — Konten',
          `Alle Konten liegen lokal auf diesem PC.<br><span class="mono">${esc(info.accountsPath || '')}</span>`,
          `<button class="btn btn--sm btn--ghost" data-act="open-accounts">${icon('folder')}Öffnen</button>`
        )}

        ${setting(
          `${icon('download')} Launcher-Updates`,
          `Beim Start prüft der Launcher, ob es eine neuere Version gibt (Vergleich mit der
           <span class="mono">package.json</span> aus dem Netz) — und installiert sie auf Wunsch.
           <span id="update-state" class="mono"></span>`,
          `<button class="btn btn--sm" data-act="update-check">${icon('refresh')}Jetzt suchen</button>
           ${
             state.user?.isAdmin
               ? `<button class="btn btn--sm btn--ghost" data-act="update-settings">${icon('settings')}Quelle</button>`
               : ''
           }`
        )}

        ${setting(
          'Beispiel-Eintrag',
          'So sieht ein Eintrag in Games-Apps.json aus - einfach kopieren und anpassen.',
          `<button class="btn btn--sm btn--ghost" data-act="example">${icon('info')}Anzeigen</button>`
        )}

        ${setting(
          'Abmelden',
          'Beendet die gespeicherte Anmeldung auf diesem Gerät.',
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

  const open = (target) => vx.shell.openPath(target).catch((e) => toastError(e.message));

  const actions = {
    'open-catalog': () => open('catalog'),
    'open-folder': () => open('catalogFolder'),
    'open-media': () => open('media'),
    'open-data': () => open('data'),
    'open-games': () => open('games'),
    'open-backups': () => open('backups'),
    'open-accounts': () => open('accounts'),
    'change-data': () => changeDataFolder(info),
    'update-check': (btn) => checkNow(btn),
    'update-settings': () => editUpdateSource(),
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

  // Version und letzte Suche nachtragen.
  vx.update
    .settings()
    .then((cfg) => {
      const el = $('#update-state', view);
      if (!el) return;
      const last = cfg.lastCheck ? new Date(cfg.lastCheck).toLocaleString('de-DE') : 'noch nie';
      el.textContent = `Version ${info.version || ''} · zuletzt gesucht: ${last}` +
        (cfg.autoCheck ? '' : ' · Auto-Suche aus');
    })
    .catch(() => {});

  return () => {};
}

/** Woher kommt die Update-Info? (nur Admin) */
async function editUpdateSource() {
  let cfg;
  try {
    cfg = await vx.update.settings();
  } catch (err) {
    toastError(err.message);
    return;
  }

  await modal({
    title: 'Update-Quelle',
    text: 'Der Launcher vergleicht seine Version mit der "version" aus dieser Datei.',
    html: `
      <div class="field">
        <label class="field__label" for="up-manifest">Adresse der package.json</label>
        <input class="input mono" id="up-manifest" value="${esc(cfg.manifest || '')}"
               placeholder="https://raw.githubusercontent.com/USER/REPO/main/package.json" />
        <div class="field__hint">Nur https (zum Testen auch localhost).</div>
      </div>
      <div class="field">
        <label class="field__label" for="up-win">Download für Windows (.exe)</label>
        <input class="input mono" id="up-win" value="${esc(cfg.downloads?.win || '')}"
               placeholder="https://github.com/USER/REPO/releases/latest/download/Setup.exe" />
        <div class="field__hint">
          Kann auch in der entfernten package.json unter <span class="mono">voidrix.update.downloads</span> stehen.
        </div>
      </div>
      <label class="checkbox">
        <input type="checkbox" id="up-auto" ${cfg.autoCheck ? 'checked' : ''} />
        Beim Start automatisch nach Updates suchen
      </label>`,
    wide: true,
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
              await vx.update.saveSettings({
                manifest: $('#up-manifest', root).value.trim(),
                downloads: { ...(cfg.downloads || {}), win: $('#up-win', root).value.trim() },
                autoCheck: $('#up-auto', root).checked,
                skipVersion: '',
              });
              toastOk('Update-Quelle gespeichert.');
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

/* --------------------------------- Modale -------------------------------- */

/** Datenordner verschieben: Ordner wählen, Daten mitnehmen, neu starten. */
async function changeDataFolder(info) {
  let picked;
  try {
    picked = await vx.setup.pickFolder(info.dataRoot || info.dataDir);
  } catch (err) {
    toastError(err.message);
    return;
  }
  if (!picked) return;

  if (!picked.writable) {
    toastError('In diesem Ordner darf nicht geschrieben werden. Bitte einen anderen wählen.');
    return;
  }

  const ok = await confirmDialog({
    title: 'Datenordner wechseln?',
    text:
      `Neuer Ordner:\n${picked.folder}\n\n` +
      'Katalog, Konten und Bilder werden dorthin kopiert und die Ordnerstruktur wird angelegt. ' +
      'Der Launcher startet anschließend neu. Die Dateien im alten Ordner bleiben als Kopie liegen.',
    confirmLabel: 'Verschieben und neu starten',
  });
  if (!ok) return;

  try {
    const result = await vx.setup.changeFolder(picked.folder);
    toastOk(
      `Neuer Datenordner:\n${result.dataRoot}` +
        (result.moved ? `\n${result.moved} Dateien übernommen.` : '') +
        '\nDer Launcher startet gleich neu…',
      'Umgezogen'
    );
  } catch (err) {
    toastError(err.message, 'Wechsel fehlgeschlagen');
  }
}

function showExample() {
  const example = `{
  "apps": [
    {
      "id": "voidrix-arena",
      "title": "Voidrix Arena",
      "type": "game",
      "developer": "Voidrix Studios",
      "description": "Schneller Arena-Shooter.",
      "banner": "media/banner/arena.png",
      "cover": "media/cover/arena.png",
      "icon": "media/icons/arena.png",
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
          const ref = await vx.dialog.pickImage(false, 'profilbilder');
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
