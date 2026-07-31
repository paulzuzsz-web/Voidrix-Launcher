/**
 * Admin-Bereich: alle gespeicherten Konten verwalten.
 */

import { $$, confirmDialog, esc, formatDate, icon, img, initials, relativeTime, toastError, toastOk } from '../ui.js';
import { state } from '../state.js';

const vx = window.voidrix;

function row(user, me) {
  const isSelf = user.id === me.id;
  return `
  <tr data-id="${esc(user.id)}">
    <td>
      <div class="usercell">
        <div class="avatar" style="--size:38px">
          ${img(user.avatar, user.profileName) || esc(initials(user.profileName || user.username))}
        </div>
        <div>
          <div class="usercell__name">${esc(user.profileName)}${isSelf ? ' <span class="tag">Du</span>' : ''}</div>
          <div class="usercell__handle mono">@${esc(user.username)}</div>
        </div>
      </div>
    </td>
    <td>
      ${
        user.isAdmin
          ? `<span class="badge badge--admin">${icon('shield')}Administrator</span>`
          : '<span class="badge">Mitglied</span>'
      }
    </td>
    <td>${esc(formatDate(user.createdAt))}</td>
    <td>${esc(relativeTime(user.lastLoginAt))}</td>
    <td>
      <div class="table__actions">
        <button class="btn btn--sm btn--ghost" data-role="${esc(user.id)}" data-next="${user.isAdmin ? 'user' : 'admin'}">
          ${icon('shield')}${user.isAdmin ? 'Zu Mitglied' : 'Zu Admin'}
        </button>
        <button class="btn btn--sm btn--danger btn--icon" data-del="${esc(user.id)}" title="Konto löschen">
          ${icon('trash')}
        </button>
      </div>
    </td>
  </tr>`;
}

export function renderUsers(view) {
  const me = state.user;

  view.innerHTML = `
    <div class="view__inner">
      <div class="stats" style="grid-template-columns:repeat(auto-fit,minmax(160px,1fr))">
        <div class="stat"><span class="stat__value" id="u-total">-</span><span class="stat__label">Konten gesamt</span></div>
        <div class="stat"><span class="stat__value" id="u-admins">-</span><span class="stat__label">Administratoren</span></div>
      </div>
      <div id="users-wrap"><div class="skeleton" style="height:220px"></div></div>
      <p class="field__hint" style="margin-top:14px">
        ${icon('info')} Konten liegen als scrypt-Hash in <span class="mono">accounts.json</span> im
        Benutzerdaten-Ordner. Passwörter werden nie im Klartext gespeichert.
      </p>
    </div>`;

  const load = async () => {
    try {
      const users = await vx.users.list();
      const wrap = view.querySelector('#users-wrap');
      view.querySelector('#u-total').textContent = String(users.length);
      view.querySelector('#u-admins').textContent = String(users.filter((u) => u.isAdmin).length);

      wrap.innerHTML = `
        <table class="table">
          <thead>
            <tr><th>Profil</th><th>Rolle</th><th>Erstellt</th><th>Zuletzt online</th><th></th></tr>
          </thead>
          <tbody>${users.map((u) => row(u, me)).join('')}</tbody>
        </table>`;

      $$('[data-role]', wrap).forEach((btn) =>
        btn.addEventListener('click', async () => {
          try {
            await vx.users.setRole(btn.dataset.role, btn.dataset.next);
            toastOk('Rolle geändert.');
            load();
          } catch (err) {
            toastError(err.message);
          }
        })
      );

      $$('[data-del]', wrap).forEach((btn) =>
        btn.addEventListener('click', async () => {
          const target = users.find((u) => u.id === btn.dataset.del);
          const ok = await confirmDialog({
            title: `Konto "${target?.profileName}" löschen?`,
            text: 'Das Konto wird dauerhaft aus accounts.json entfernt.',
            confirmLabel: 'Löschen',
            danger: true,
          });
          if (!ok) return;
          try {
            await vx.users.remove(btn.dataset.del);
            toastOk('Konto gelöscht.');
            load();
          } catch (err) {
            toastError(err.message);
          }
        })
      );
    } catch (err) {
      toastError(err.message, 'Konten konnten nicht geladen werden');
    }
  };

  load();
  return () => {};
}
