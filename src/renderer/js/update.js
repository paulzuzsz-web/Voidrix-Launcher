/**
 * Launcher-Update: beim Start nach einer neueren Version suchen,
 * herunterladen und den Installer starten.
 */

import { $, esc, icon, modal, toast, toastError, toastOk, withBusy } from './ui.js';

const vx = window.voidrix;

/** Inhalt des Update-Fensters. */
function template(info) {
  return `
  <div class="update">
    <div class="update__head">
      <span class="update__mark">${icon('download')}</span>
      <div>
        <div class="update__versions">
          <span class="mono">${esc(info.current)}</span>
          ${icon('chev-right')}
          <span class="mono update__new">${esc(info.latest)}</span>
        </div>
        <div class="field__hint">Neue Version von ${esc(info.name || 'Voidrix Launcher')}</div>
      </div>
    </div>

    ${info.notes ? `<p class="update__notes">${esc(info.notes)}</p>` : ''}

    <div class="progress update__progress" hidden>
      <div class="progress__bar"><span></span></div>
      <div class="progress__text">Wird geladen…</div>
    </div>

    ${
      info.canInstall
        ? `<div class="field__hint" style="margin-top:12px">
             Der Launcher lädt die neue Datei herunter und startet sie. Danach beendet er sich,
             damit die Installation die alte Version ersetzen kann.
           </div>`
        : `<div class="field__hint" style="margin-top:12px">
             ${icon('warn')} Für dieses System ist keine Datei hinterlegt — bitte von Hand aktualisieren.
           </div>`
    }
  </div>`;
}

/**
 * Zeigt das Update-Fenster. Läuft der Download, bleibt es offen und
 * verwandelt sich in eine Fortschrittsanzeige.
 */
export function showUpdateDialog(info) {
  let downloaded = null;
  let stopProgress = () => {};

  return modal({
    title: `Update verfügbar: ${info.latest}`,
    html: template(info),
    wide: true,
    actions: [
      { label: 'Später', className: 'btn--ghost', value: 'later' },
      { label: 'Diese Version überspringen', className: 'btn--ghost', value: 'skip' },
      {
        label: 'Jetzt aktualisieren',
        className: 'btn--primary',
        keepOpen: true,
        onClick: async (root, close) => {
          if (!info.canInstall) {
            toastError('Für dieses System ist keine Update-Datei hinterlegt.');
            return;
          }
          const button = $('[data-action="2"]', root);
          const box = $('.update__progress', root);
          const bar = $('.progress__bar span', root);
          const text = $('.progress__text', root);
          const later = $('[data-action="0"]', root);

          box.hidden = false;
          later.textContent = 'Abbrechen';

          await withBusy(button, async () => {
            try {
              downloaded = await vx.update.download(info.url, info.latest);
              text.textContent = `Fertig — ${downloaded.sizeText}. Launcher wird neu gestartet…`;
              bar.style.width = '100%';
              toastOk(`Version ${info.latest} geladen. Der Installer startet gleich.`, 'Update');
              await vx.update.install(downloaded.file);
              close('installing');
            } catch (err) {
              box.hidden = true;
              later.textContent = 'Später';
              if (/abgebrochen/i.test(err.message)) toast('Update abgebrochen.', { type: 'info' });
              else toastError(err.message, 'Update fehlgeschlagen');
            }
          });
        },
      },
    ],
    onMount: (root) => {
      const bar = $('.progress__bar span', root);
      const text = $('.progress__text', root);
      stopProgress = vx.update.onProgress((p) => {
        bar.style.width = `${p.percent || 0}%`;
        text.textContent = p.total
          ? `${p.receivedText} von ${p.totalText} · ${p.speedText}`
          : `${p.receivedText} geladen`;
      });

      // "Später" wird während des Downloads zum Abbrechen-Knopf.
      $('[data-action="0"]', root).addEventListener('click', () => {
        if (!$('.update__progress', root).hidden) vx.update.cancel().catch(() => {});
      });
    },
  }).then(async (choice) => {
    stopProgress();
    if (choice === 'skip') {
      await vx.update.saveSettings({ skipVersion: info.latest }).catch(() => {});
      toast(`Version ${info.latest} wird übersprungen.`, { type: 'info' });
    }
    return choice;
  });
}

/**
 * Stiller Blick beim Start: nur melden, wenn es wirklich etwas Neues gibt.
 */
export async function checkOnStart() {
  try {
    const info = await vx.update.autoCheck();
    if (!info || info.skip || !info.hasUpdate || info.skipped) return null;
    return showUpdateDialog(info);
  } catch {
    return null; // ohne Netz einfach weitermachen
  }
}

/** Manuelle Suche (Einstellungen). */
export async function checkNow(button) {
  return withBusy(button, async () => {
    try {
      const info = await vx.update.check(false);
      if (!info.configured) {
        toastError('Es ist keine Update-Adresse hinterlegt.');
        return info;
      }
      if (!info.hasUpdate) {
        toastOk(`Version ${info.current} ist aktuell.`, 'Alles frisch');
        return info;
      }
      await vx.update.saveSettings({ skipVersion: '' }).catch(() => {});
      showUpdateDialog({ ...info, skipped: false });
      return info;
    } catch (err) {
      toastError(err.message, 'Update-Suche fehlgeschlagen');
      return null;
    }
  });
}
