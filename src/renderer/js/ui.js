/**
 * Kleine UI-Werkzeuge: Escaping, Icons, Toasts, Modale, Formatierung.
 */

const vx = window.voidrix;

/* ------------------------------- Basics -------------------------------- */

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/** HTML-Escaping - alles was aus Games-Apps.json kommt läuft hier durch. */
export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function icon(name, cls = '') {
  return `<svg class="${cls}" aria-hidden="true"><use href="#i-${name}" /></svg>`;
}

export function mediaUrl(ref) {
  return vx.mediaUrl(ref);
}

/** Bild-Tag nur erzeugen, wenn auch wirklich ein Bild hinterlegt ist. */
export function img(ref, alt = '', cls = '') {
  const url = mediaUrl(ref);
  if (!url) return '';
  return `<img src="${esc(url)}" alt="${esc(alt)}" class="${cls}" loading="lazy" onerror="this.remove()" />`;
}

export function initials(name) {
  const parts = String(name || '?')
    .trim()
    .split(/[\s_.-]+/)
    .filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function debounce(fn, ms = 200) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

/* ----------------------------- Formatierung ---------------------------- */

export function formatDate(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatDateTime(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function relativeTime(value) {
  if (!value) return 'nie';
  const diff = Date.now() - new Date(value).getTime();
  if (Number.isNaN(diff)) return 'nie';
  const min = Math.round(diff / 60000);
  if (min < 1) return 'gerade eben';
  if (min < 60) return `vor ${min} Min.`;
  const std = Math.round(min / 60);
  if (std < 24) return `vor ${std} Std.`;
  const tage = Math.round(std / 24);
  if (tage < 31) return `vor ${tage} Tg.`;
  return formatDate(value);
}

export function formatPlaytime(minutes) {
  const m = Number(minutes) || 0;
  if (m < 1) return '0 Min.';
  if (m < 60) return `${m} Min.`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h} Std. ${rest} Min.` : `${h} Std.`;
}

/* -------------------------------- Toasts -------------------------------- */

const TOAST_ICONS = { ok: 'check', error: 'warn', info: 'info' };

export function toast(message, { type = 'info', title = '', duration = 4200 } = {}) {
  const root = $('#toasts');
  if (!root) return;

  const el = document.createElement('div');
  el.className = `toast toast--${type}`;
  el.innerHTML = `
    ${icon(TOAST_ICONS[type] || 'info')}
    <div class="toast__body">
      ${title ? `<div class="toast__title">${esc(title)}</div>` : ''}
      <div class="toast__msg">${esc(message)}</div>
    </div>`;
  root.appendChild(el);

  const close = () => {
    el.classList.add('is-out');
    el.addEventListener('animationend', () => el.remove(), { once: true });
  };
  el.addEventListener('click', close);
  setTimeout(close, duration);
}

export const toastOk = (msg, title = 'Erledigt') => toast(msg, { type: 'ok', title });
export const toastError = (msg, title = 'Fehler') => toast(msg, { type: 'error', title, duration: 6500 });

/* -------------------------------- Modale -------------------------------- */

/**
 * Zeigt ein Modal. `render(close)` liefert das HTML, `onMount(root, close)`
 * bekommt danach den Knoten zum Verdrahten.
 */
export function modal({ title = '', text = '', html = '', actions = [], wide = false, onMount } = {}) {
  return new Promise((resolve) => {
    const root = $('#modal-root');
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';

    const buttons = actions
      .map(
        (a, i) =>
          `<button class="btn ${a.className || 'btn--ghost'}" data-action="${i}">${
            a.icon ? icon(a.icon) : ''
          }${esc(a.label)}</button>`
      )
      .join('');

    backdrop.innerHTML = `
      <div class="modal ${wide ? 'modal--wide' : ''}" role="dialog" aria-modal="true">
        ${title ? `<h2 class="modal__title">${esc(title)}</h2>` : ''}
        ${text ? `<p class="modal__text">${esc(text)}</p>` : ''}
        ${html}
        ${actions.length ? `<div class="modal__actions">${buttons}</div>` : ''}
      </div>`;

    const close = (value) => {
      document.removeEventListener('keydown', onKey);
      backdrop.remove();
      resolve(value);
    };

    const onKey = (e) => {
      if (e.key === 'Escape') close(null);
    };

    backdrop.addEventListener('mousedown', (e) => {
      if (e.target === backdrop) close(null);
    });
    document.addEventListener('keydown', onKey);

    $$('[data-action]', backdrop).forEach((btn) => {
      btn.addEventListener('click', async () => {
        const action = actions[Number(btn.dataset.action)];
        if (action.keepOpen) {
          await action.onClick?.(backdrop, close);
          return;
        }
        close(action.value !== undefined ? action.value : true);
      });
    });

    root.appendChild(backdrop);
    onMount?.(backdrop.firstElementChild, close);
    const firstInput = $('input, textarea, select', backdrop);
    if (firstInput) firstInput.focus();
  });
}

export function confirmDialog({
  title = 'Bist du sicher?',
  text = '',
  confirmLabel = 'Ja, weiter',
  cancelLabel = 'Abbrechen',
  danger = false,
} = {}) {
  return modal({
    title,
    text,
    actions: [
      { label: cancelLabel, className: 'btn--ghost', value: false },
      {
        label: confirmLabel,
        className: danger ? 'btn--danger' : 'btn--primary',
        value: true,
      },
    ],
  }).then((v) => v === true);
}

export function lightbox(src) {
  const el = document.createElement('div');
  el.className = 'lightbox';
  el.innerHTML = `<img src="${esc(src)}" alt="" />`;
  el.addEventListener('click', () => el.remove());
  document.addEventListener('keydown', function onKey(e) {
    if (e.key === 'Escape') {
      el.remove();
      document.removeEventListener('keydown', onKey);
    }
  });
  document.body.appendChild(el);
}

/* ------------------------------ Buttons --------------------------------- */

/** Führt eine Aktion aus und zeigt solange einen Spinner im Button. */
export async function withBusy(button, fn) {
  if (!button) return fn();
  button.classList.add('is-busy');
  button.disabled = true;
  try {
    return await fn();
  } finally {
    button.classList.remove('is-busy');
    button.disabled = false;
  }
}
