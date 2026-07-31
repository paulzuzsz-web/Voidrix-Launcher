/**
 * Admin-Bereich: Games & Apps hochladen bzw. bearbeiten.
 * Links das Formular, rechts eine Live-Vorschau der Store-Karte.
 */

import { $, $$, esc, icon, img, initials, mediaUrl, toastError, toastOk, withBusy } from '../ui.js';
import { deleteApp, getApp, saveApp, state } from '../state.js';

const vx = window.voidrix;

/** Formularfeld -> Unterordner in media/ */
const MEDIA_KIND = { banner: 'banner', cover: 'cover', icon: 'icons' };

const EMPTY = {
  id: '',
  title: '',
  type: 'game',
  developer: 'Voidrix Studios',
  publisher: 'Voidrix',
  shortDescription: '',
  description: '',
  version: '1.0.0',
  size: '',
  releaseDate: '',
  price: 'Kostenlos',
  tags: [],
  accentColor: '#8b5cf6',
  featured: false,
  banner: '',
  cover: '',
  icon: '',
  screenshots: [],
  exePath: '',
  args: [],
  workingDir: '',
  website: '',
};

/** Bild-Feld: Vorschau + Pfad/URL + Auswahl-Button. */
function mediaField(key, label, hint, value, { square = false } = {}) {
  return `
  <div class="field" data-media="${key}">
    <label class="field__label">${esc(label)}</label>
    <div class="media-pick">
      <div class="media-pick__preview ${square ? 'media-pick__preview--square' : ''}" data-preview>
        ${img(value, label) || 'leer'}
      </div>
      <div class="media-pick__actions">
        <div class="input-group">
          <input class="input" name="${key}" value="${esc(value)}" placeholder="Datei wählen oder https://… einfügen" spellcheck="false" />
          <button type="button" class="btn btn--sm" data-pick="${key}">${icon('upload')}Wählen</button>
        </div>
        <div class="field__hint">${esc(hint)}</div>
      </div>
    </div>
  </div>`;
}

function entryRow(app) {
  return `
  <div class="admin-item" data-id="${esc(app.id)}">
    <div class="admin-item__thumb">${img(app.banner || app.cover || app.icon, app.title) || esc(initials(app.title))}</div>
    <div class="admin-item__body">
      <div class="admin-item__title">${esc(app.title)} <span class="tag">${app.type === 'app' ? 'App' : 'Game'}</span></div>
      <div class="admin-item__path mono">${esc(app.exePath || 'kein Pfad hinterlegt')}</div>
    </div>
    <div class="admin-item__actions">
      <button class="btn btn--sm btn--ghost" data-edit="${esc(app.id)}">${icon('edit')}Bearbeiten</button>
      <button class="btn btn--sm btn--danger btn--icon" data-del="${esc(app.id)}" title="Löschen">${icon('trash')}</button>
    </div>
  </div>`;
}

export function renderAdmin(view, { navigate, params }) {
  const editing = params.id ? getApp(params.id) : null;
  const data = { ...EMPTY, ...(editing || {}) };
  const screenshots = [...(data.screenshots || [])];

  view.innerHTML = `
  <div class="view__inner">
    <form id="entry-form" class="form-grid" autocomplete="off" novalidate>
      <div>
        <div class="form-card">
          <div class="form-card__title">${icon('info')} Grunddaten</div>

          <div class="form-row">
            <div class="field">
              <label class="field__label" for="a-title">Titel *</label>
              <input class="input" id="a-title" name="title" value="${esc(data.title)}" maxlength="60"
                     placeholder="z. B. Voidrix Arena" />
            </div>
            <div class="field">
              <label class="field__label" for="a-type">Typ</label>
              <select class="select" id="a-type" name="type">
                <option value="game" ${data.type === 'game' ? 'selected' : ''}>Spiel</option>
                <option value="app" ${data.type === 'app' ? 'selected' : ''}>App / Tool</option>
              </select>
            </div>
          </div>

          <div class="form-row">
            <div class="field">
              <label class="field__label" for="a-dev">Entwickler</label>
              <input class="input" id="a-dev" name="developer" value="${esc(data.developer)}" />
            </div>
            <div class="field">
              <label class="field__label" for="a-pub">Publisher</label>
              <input class="input" id="a-pub" name="publisher" value="${esc(data.publisher)}" />
            </div>
          </div>

          <div class="field">
            <label class="field__label" for="a-short">Kurzbeschreibung</label>
            <input class="input" id="a-short" name="shortDescription" maxlength="180"
                   value="${esc(data.shortDescription)}" placeholder="Ein Satz für Store-Karte und Hero" />
          </div>

          <div class="field">
            <label class="field__label" for="a-desc">Beschreibung</label>
            <textarea class="textarea" id="a-desc" name="description"
                      placeholder="Worum geht es? Features, Steuerung, Systemvoraussetzungen …">${esc(data.description)}</textarea>
            <div class="field__hint">Zeilenumbrüche bleiben auf der Detailseite erhalten.</div>
          </div>

          <div class="form-row--3 form-row">
            <div class="field">
              <label class="field__label" for="a-version">Version</label>
              <input class="input" id="a-version" name="version" value="${esc(data.version)}" />
            </div>
            <div class="field">
              <label class="field__label" for="a-size">Größe</label>
              <input class="input" id="a-size" name="size" value="${esc(data.size)}" placeholder="z. B. 24 GB" />
            </div>
            <div class="field">
              <label class="field__label" for="a-release">Release</label>
              <input class="input" id="a-release" name="releaseDate" type="date" value="${esc(
                String(data.releaseDate).slice(0, 10)
              )}" />
            </div>
          </div>

          <div class="form-row">
            <div class="field">
              <label class="field__label" for="a-tags">Tags</label>
              <input class="input" id="a-tags" name="tags" value="${esc((data.tags || []).join(', '))}"
                     placeholder="Action, Multiplayer, Indie" />
              <div class="field__hint">Mit Komma trennen.</div>
            </div>
            <div class="field">
              <label class="field__label" for="a-price">Preis</label>
              <input class="input" id="a-price" name="price" value="${esc(data.price)}" placeholder="Kostenlos" />
            </div>
          </div>
        </div>

        <div class="form-card">
          <div class="form-card__title">${icon('upload')} Bilder</div>
          ${mediaField('banner', 'Banner (16:9)', 'Großes Bild für Hero und Detailseite.', data.banner)}
          ${mediaField('cover', 'Cover (3:4)', 'Hochkant-Bild für die Store-Karten.', data.cover)}
          ${mediaField('icon', 'Profilbild / Logo', 'Quadratisches Icon für die Detailseite.', data.icon, {
            square: true,
          })}

          <div class="field">
            <label class="field__label">Screenshots</label>
            <div class="media-pick__actions">
              <div id="shots-list" class="admin-list"></div>
              <button type="button" class="btn btn--sm" data-add-shots>${icon('plus')}Screenshots hinzufügen</button>
            </div>
          </div>
        </div>

        <div class="form-card">
          <div class="form-card__title">${icon('play')} Start &amp; Installation</div>

          <div class="field">
            <label class="field__label" for="a-exe">Pfad zur .exe</label>
            <div class="input-group">
              <input class="input mono" id="a-exe" name="exePath" value="${esc(data.exePath)}" spellcheck="false"
                     placeholder="C:\\Games\\VoidrixArena\\Arena.exe" />
              <button type="button" class="btn btn--sm" data-pick-exe>${icon('folder')}Datei wählen</button>
            </div>
            <div class="field__hint">
              Genau dieser Wert landet in <span class="mono">Games-Apps.json</span>. Existiert die Datei,
              gilt der Titel als installiert und lässt sich starten. Auch <span class="mono">steam://</span>-Links sind erlaubt.
            </div>
          </div>

          <div class="form-row">
            <div class="field">
              <label class="field__label" for="a-args">Startparameter</label>
              <input class="input mono" id="a-args" name="args" value="${esc((data.args || []).join(' '))}"
                     placeholder="-fullscreen -novid" />
            </div>
            <div class="field">
              <label class="field__label" for="a-cwd">Arbeitsverzeichnis</label>
              <div class="input-group">
                <input class="input mono" id="a-cwd" name="workingDir" value="${esc(data.workingDir)}"
                       placeholder="(automatisch)" />
                <button type="button" class="btn btn--sm" data-pick-dir>${icon('folder')}</button>
              </div>
            </div>
          </div>

          <div class="field">
            <label class="field__label" for="a-web">Website</label>
            <input class="input" id="a-web" name="website" value="${esc(data.website)}" placeholder="https://…" />
          </div>
        </div>
      </div>

      <aside>
        <div class="preview-card">
          <div class="form-card" style="padding:18px">
            <div class="form-card__title">${icon('store')} Vorschau</div>
            <div class="preview-banner" id="pv-banner">
              <div class="preview-banner__scrim"></div>
              <div class="preview-banner__body">
                <div class="preview-icon" id="pv-icon"></div>
                <div style="min-width:0">
                  <div style="font-weight:750;font-size:16px" id="pv-title">Titel</div>
                  <div style="font-size:12px;color:var(--text-dim)" id="pv-dev">Entwickler</div>
                </div>
              </div>
            </div>

            <div style="display:flex;gap:14px;margin-top:16px">
              <div class="preview-cover" id="pv-cover">Cover</div>
              <div style="min-width:0;display:grid;gap:10px;align-content:start">
                <div class="field" style="margin:0">
                  <label class="field__label" for="a-accent">Akzentfarbe</label>
                  <input class="color-input" id="a-accent" name="accentColor" type="color" value="${esc(
                    data.accentColor || '#8b5cf6'
                  )}" />
                </div>
                <label class="checkbox">
                  <input type="checkbox" name="featured" ${data.featured ? 'checked' : ''} />
                  Im Hero-Karussell zeigen
                </label>
              </div>
            </div>
          </div>

          <div class="form-card" style="padding:18px">
            <button class="btn btn--primary btn--block btn--lg" type="submit" id="btn-save">
              ${icon(editing ? 'check' : 'upload')}${editing ? 'Änderungen speichern' : 'Jetzt hochladen'}
            </button>
            ${
              editing
                ? `<button class="btn btn--ghost btn--block" type="button" style="margin-top:10px" data-new>
                     ${icon('plus')}Neuen Eintrag anlegen
                   </button>`
                : ''
            }
            <div class="field__hint" style="margin-top:12px">
              Gespeichert wird direkt in <span class="mono">Games-Apps.json</span>.
              Bilder werden in den Ordner <span class="mono">media/</span> kopiert.
            </div>
          </div>
        </div>
      </aside>
    </form>

    <section class="section">
      <div class="section__head">
        <h2 class="section__title">Katalog verwalten</h2>
        <span class="section__note">${state.apps.length} Einträge</span>
      </div>
      <div class="admin-list" id="admin-list">
        ${state.apps.length ? state.apps.map(entryRow).join('') : '<p class="field__hint">Noch keine Einträge.</p>'}
      </div>
    </section>
  </div>`;

  const form = $('#entry-form', view);

  /* ------------------------- Live-Vorschau ------------------------- */
  const refreshPreview = () => {
    const values = Object.fromEntries(new FormData(form).entries());
    const bannerBox = $('#pv-banner', view);

    $('#pv-title', view).textContent = values.title || 'Titel';
    $('#pv-dev', view).textContent = values.developer || 'Entwickler';
    bannerBox.style.setProperty('--preview-accent', values.accentColor || '#8b5cf6');

    // Banner liegt hinter Scrim + Text, deshalb nur das <img> austauschen.
    $('img', bannerBox)?.remove();
    const bannerUrl = mediaUrl(values.banner);
    if (bannerUrl) {
      const el = new Image();
      el.src = bannerUrl;
      el.alt = '';
      el.onerror = () => el.remove();
      bannerBox.prepend(el);
    }

    $('#pv-cover', view).innerHTML = img(values.cover, 'Cover') || 'Cover';
    $('#pv-icon', view).innerHTML = img(values.icon, '') || esc(initials(values.title || '?'));

    $$('[data-media]', view).forEach((wrap) => {
      $('[data-preview]', wrap).innerHTML = img($('input', wrap).value, '') || 'leer';
    });
  };

  form.addEventListener('input', refreshPreview);

  /* ------------------------- Screenshots --------------------------- */
  const renderShots = () => {
    const list = $('#shots-list', view);
    list.innerHTML = screenshots.length
      ? screenshots
          .map(
            (s, i) => `
        <div class="admin-item" style="padding:8px 10px">
          <div class="admin-item__thumb" style="width:74px;height:42px">${img(s, '') || '?'}</div>
          <div class="admin-item__body"><div class="admin-item__path mono">${esc(s)}</div></div>
          <div class="admin-item__actions">
            <button type="button" class="btn btn--sm btn--ghost btn--icon" data-shot-del="${i}">${icon('close')}</button>
          </div>
        </div>`
          )
          .join('')
      : '<div class="field__hint">Noch keine Screenshots.</div>';

    $$('[data-shot-del]', list).forEach((btn) =>
      btn.addEventListener('click', () => {
        screenshots.splice(Number(btn.dataset.shotDel), 1);
        renderShots();
      })
    );
  };
  renderShots();

  /* --------------------------- Dialoge ----------------------------- */
  view.addEventListener('click', async (event) => {
    const pick = event.target.closest('[data-pick]');
    if (pick) {
      const kind = MEDIA_KIND[pick.dataset.pick] || 'sonstiges';
      const ref = await vx.dialog.pickImage(false, kind).catch((err) => toastError(err.message));
      if (ref) {
        form.elements[pick.dataset.pick].value = ref;
        refreshPreview();
      }
      return;
    }

    if (event.target.closest('[data-add-shots]')) {
      const refs = await vx.dialog.pickImage(true, 'screenshots').catch((err) => toastError(err.message));
      if (refs?.length) {
        screenshots.push(...refs);
        renderShots();
      }
      return;
    }

    if (event.target.closest('[data-pick-exe]')) {
      const file = await vx.dialog.pickExecutable('Programmdatei auswählen').catch(() => null);
      if (file) form.elements.exePath.value = file;
      return;
    }

    if (event.target.closest('[data-pick-dir]')) {
      const dir = await vx.dialog.pickFolder().catch(() => null);
      if (dir) form.elements.workingDir.value = dir;
      return;
    }

    if (event.target.closest('[data-new]')) {
      navigate('admin');
      return;
    }

    const edit = event.target.closest('[data-edit]');
    if (edit) {
      navigate('admin', { id: edit.dataset.edit });
      return;
    }

    const del = event.target.closest('[data-del]');
    if (del) {
      if (await deleteApp(del.dataset.del)) navigate('admin');
    }
  });

  /* --------------------------- Speichern --------------------------- */
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(form).entries());
    const payload = {
      ...values,
      id: editing ? editing.id : '',
      featured: form.elements.featured.checked,
      tags: String(values.tags || '')
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      screenshots,
    };

    await withBusy($('#btn-save', view), async () => {
      try {
        const saved = await saveApp(payload);
        toastOk(
          editing ? `"${saved.title}" wurde aktualisiert.` : `"${saved.title}" ist jetzt im Store.`,
          'Games-Apps.json gespeichert'
        );
        navigate('detail', { id: saved.id });
      } catch (err) {
        toastError(err.message, 'Speichern fehlgeschlagen');
      }
    });
  });

  refreshPreview();
  return () => {};
}
