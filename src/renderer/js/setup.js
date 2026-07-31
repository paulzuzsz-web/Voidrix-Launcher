/**
 * Ersteinrichtung: Datenordner wählen.
 * Wird einmalig nach der Installation gezeigt, bevor es zum Login geht.
 */

import { $, esc, icon, toastError, toastOk, withBusy } from './ui.js';

const vx = window.voidrix;

function treeRow(item, last) {
  const branch = last ? '└─' : '├─';
  return `
  <div class="tree__row">
    <span class="tree__branch">${branch}</span>
    <span class="tree__icon">${icon(item.type === 'file' ? 'edit' : 'folder')}</span>
    <span class="tree__name">${esc(item.name)}${item.type === 'dir' ? '/' : ''}</span>
    <span class="tree__info">${esc(item.info)}</span>
  </div>`;
}

function template(status, folder) {
  return `
  <section class="auth__pitch">
    <div class="auth__logo">
      <span class="brand__mark" aria-hidden="true"><svg viewBox="0 0 32 32"><use href="#i-void" /></svg></span>
      <div class="auth__wordmark">VOIDRIX<small>LAUNCHER</small></div>
    </div>
    <h1 class="auth__headline">Wo sollen deine <em>Daten</em> liegen?</h1>
    <p class="auth__lead">
      Der Launcher legt im gewählten Ordner alles ab, was er braucht: den Katalog
      <span class="mono">Games-Apps.json</span>, die Konten, deine Bilder und die Sicherungen.
      Du kannst den Ordner später jederzeit in den Einstellungen wechseln — die Daten ziehen mit um.
    </p>
    <div class="auth__features">
      <div class="auth__feature"><span>${icon('folder')}</span>Ein Ordner für alles — leicht zu sichern</div>
      <div class="auth__feature"><span>${icon('shield')}</span>Nichts verlässt deinen PC</div>
      <div class="auth__feature"><span>${icon('refresh')}</span>Umziehen ohne Datenverlust</div>
    </div>
  </section>

  <section class="auth__panel">
    <div class="auth__card auth__card--wide">
      <h2 class="auth__title">Ersteinrichtung</h2>
      <p class="auth__sub">Schritt 1 von 2 — danach legst du dein Konto an.</p>

      <div class="auth__alert" id="setup-alert">${icon('warn')}<span></span></div>

      <div class="field">
        <label class="field__label" for="setup-path">Datenordner</label>
        <div class="input-group">
          <input class="input mono" id="setup-path" value="${esc(folder)}" spellcheck="false" />
          <button class="btn btn--sm" type="button" id="setup-browse">${icon('folder')}Durchsuchen</button>
        </div>
        <div class="field__hint">
          Der Ordner wird angelegt, falls es ihn noch nicht gibt. Gibt es dort schon Voidrix-Daten,
          bleiben sie erhalten.
        </div>
      </div>

      <div class="tree">
        <div class="tree__head">${icon('folder')}<span class="mono" id="setup-preview">${esc(folder)}</span></div>
        ${status.folders.map((item, i) => treeRow(item, i === status.folders.length - 1)).join('')}
      </div>

      <button class="btn btn--primary btn--lg btn--block" id="setup-go" style="margin-top:22px">
        ${icon('check')}Ordner einrichten und weiter
      </button>

      <div class="auth__hintbox">
        ${icon('info')} Tipp: Ein Ordner wie <span class="mono">D:\\Voidrix</span> auf einer großen
        Festplatte eignet sich gut — dort ist auch gleich Platz für die Spiele selbst.
      </div>
    </div>
  </section>`;
}

/**
 * Zeigt die Ersteinrichtung. `onDone(status)` läuft, sobald der Ordner steht.
 */
export async function renderSetup(onDone) {
  const screen = $('#setup-screen');
  screen.hidden = false;

  let status;
  try {
    status = await vx.setup.status();
  } catch (err) {
    toastError(err.message, 'Einrichtung');
    return;
  }

  let folder = status.suggestion;
  screen.innerHTML = template(status, folder);

  const input = $('#setup-path', screen);
  const preview = $('#setup-preview', screen);
  const alertBox = $('#setup-alert', screen);

  const showError = (message) => {
    alertBox.classList.add('is-visible');
    $('span', alertBox).textContent = message;
  };

  const setFolder = (value) => {
    folder = value;
    input.value = value;
    preview.textContent = value;
    alertBox.classList.remove('is-visible');
  };

  input.addEventListener('input', () => {
    folder = input.value.trim();
    preview.textContent = folder || '…';
    alertBox.classList.remove('is-visible');
  });

  $('#setup-browse', screen).addEventListener('click', async () => {
    try {
      const picked = await vx.setup.pickFolder(folder);
      if (!picked) return;
      setFolder(picked.folder);
      if (!picked.writable) showError('In diesem Ordner darf nicht geschrieben werden. Bitte einen anderen wählen.');
    } catch (err) {
      showError(err.message);
    }
  });

  $('#setup-go', screen).addEventListener('click', async (event) => {
    if (!folder) {
      showError('Bitte einen Ordner auswählen.');
      return;
    }
    await withBusy(event.currentTarget, async () => {
      try {
        const result = await vx.setup.apply(folder);
        toastOk(
          `Ordner eingerichtet:\n${result.dataRoot}` +
            (result.moved ? `\n${result.moved} vorhandene Dateien übernommen.` : ''),
          'Alles bereit'
        );
        screen.hidden = true;
        screen.innerHTML = '';
        onDone(result);
      } catch (err) {
        showError(err.message);
      }
    });
  });
}
