/**
 * Anmelde-/Registrierungsbildschirm.
 * Wird angezeigt bis ein Konto angemeldet ist - danach übernimmt app.js.
 */

import { $, $$, esc, icon, toastOk } from './ui.js';

const vx = window.voidrix;

const FEATURES = [
  ['library', 'Alle Spiele und Apps in einer Bibliothek'],
  ['play', 'Ein Klick - die .exe startet direkt'],
  ['upload', 'Admins laden Titel mit Banner & Beschreibung hoch'],
  ['shield', 'Konten bleiben lokal auf deinem PC gespeichert'],
];

function template(mode) {
  const isLogin = mode === 'login';
  return `
  <section class="auth__pitch">
    <div class="auth__logo">
      <span class="brand__mark" aria-hidden="true"><svg viewBox="0 0 32 32"><use href="#i-void" /></svg></span>
      <div class="auth__wordmark">VOIDRIX<small>LAUNCHER</small></div>
    </div>
    <h1 class="auth__headline">Deine Welt startet <em>hier</em>.</h1>
    <p class="auth__lead">
      Der Voidrix Launcher bündelt deine Games und Apps an einem Ort - mit Store-Optik,
      Bibliothek und einem einzigen Knopf zum Starten.
    </p>
    <div class="auth__features">
      ${FEATURES.map(
        ([ic, text]) => `<div class="auth__feature"><span>${icon(ic)}</span>${esc(text)}</div>`
      ).join('')}
    </div>
  </section>

  <section class="auth__panel">
    <div class="auth__card">
      <div class="auth__tabs" role="tablist">
        <button class="auth__tab ${isLogin ? 'is-active' : ''}" data-mode="login">Anmelden</button>
        <button class="auth__tab ${!isLogin ? 'is-active' : ''}" data-mode="register">Konto erstellen</button>
      </div>

      <h2 class="auth__title">${isLogin ? 'Willkommen zurück' : 'Konto erstellen'}</h2>
      <p class="auth__sub">
        ${
          isLogin
            ? 'Melde dich an, um auf deine Bibliothek zuzugreifen.'
            : 'Lege dein Voidrix-Profil an - es wird lokal gespeichert.'
        }
      </p>

      <div class="auth__alert" id="auth-alert">${icon('warn')}<span></span></div>

      <form id="auth-form" autocomplete="off" novalidate>
        <div class="field" data-field="username">
          <label class="field__label" for="f-username">Benutzername</label>
          <input class="input" id="f-username" name="username" placeholder="z. B. voidrunner"
                 autocomplete="username" spellcheck="false" maxlength="20" />
          <div class="field__error"></div>
        </div>

        ${
          isLogin
            ? ''
            : `
        <div class="field" data-field="profileName">
          <label class="field__label" for="f-profile">Profilname</label>
          <input class="input" id="f-profile" name="profileName" placeholder="Wie du im Launcher heisst"
                 maxlength="24" />
          <div class="field__error"></div>
        </div>`
        }

        <div class="field" data-field="password">
          <label class="field__label" for="f-password">Passwort</label>
          <input class="input" id="f-password" name="password" type="password" placeholder="Mindestens 6 Zeichen"
                 autocomplete="${isLogin ? 'current-password' : 'new-password'}" />
          <div class="field__error"></div>
        </div>

        ${
          isLogin
            ? ''
            : `
        <div class="field" data-field="passwordRepeat">
          <label class="field__label" for="f-password2">Passwort wiederholen</label>
          <input class="input" id="f-password2" name="passwordRepeat" type="password"
                 placeholder="Passwort erneut eingeben" autocomplete="new-password" />
          <div class="field__error"></div>
        </div>`
        }

        <div class="auth__foot">
          <label class="checkbox">
            <input type="checkbox" name="remember" checked />
            Angemeldet bleiben
          </label>
          ${isLogin ? '' : '<span>Alles bleibt auf diesem PC.</span>'}
        </div>

        <button class="btn btn--primary btn--lg btn--block" type="submit" style="margin-top:20px">
          ${icon(isLogin ? 'play' : 'plus')}${isLogin ? 'Anmelden' : 'Konto erstellen & starten'}
        </button>
      </form>

      <div class="auth__hintbox">
        ${icon('info')} <strong>Erster Start?</strong> Der Administrator-Zugang hat den Benutzernamen
        <span class="mono">adminpass</span>. Als Admin kannst du Games &amp; Apps hochladen.
      </div>
    </div>
  </section>`;
}

export function renderAuth(onSuccess, mode = 'login') {
  const screen = $('#auth-screen');
  screen.hidden = false;
  screen.innerHTML = template(mode);

  $$('.auth__tab', screen).forEach((tab) => {
    tab.addEventListener('click', () => renderAuth(onSuccess, tab.dataset.mode));
  });

  const form = $('#auth-form', screen);
  const alertBox = $('#auth-alert', screen);

  const clearErrors = () => {
    alertBox.classList.remove('is-visible');
    $$('.field', screen).forEach((f) => f.classList.remove('has-error'));
  };

  const showError = (err) => {
    const field = err?.field && $(`.field[data-field="${err.field}"]`, screen);
    if (field) {
      field.classList.add('has-error');
      $('.field__error', field).textContent = err.message;
      $('.input', field)?.focus();
    }
    alertBox.classList.add('is-visible');
    $('span', alertBox).textContent = err?.message || 'Etwas ist schiefgelaufen.';
  };

  form.addEventListener('input', clearErrors);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearErrors();

    const data = Object.fromEntries(new FormData(form).entries());
    const payload = {
      username: (data.username || '').trim(),
      profileName: (data.profileName || '').trim(),
      password: data.password || '',
      passwordRepeat: data.passwordRepeat || '',
      remember: form.elements.remember.checked,
    };

    const submit = $('button[type="submit"]', form);
    submit.classList.add('is-busy');
    submit.disabled = true;

    try {
      const user =
        mode === 'login' ? await vx.auth.login(payload) : await vx.auth.register(payload);
      toastOk(
        mode === 'login'
          ? `Willkommen zurück, ${user.profileName}!`
          : `Konto erstellt. Willkommen bei Voidrix, ${user.profileName}!`,
        'Angemeldet'
      );
      screen.hidden = true;
      screen.innerHTML = '';
      onSuccess(user);
    } catch (err) {
      showError(err);
    } finally {
      submit.classList.remove('is-busy');
      submit.disabled = false;
    }
  });

  $('#f-username', screen)?.focus();
}
