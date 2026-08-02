/**
 * Store: Hero-Karussell + Reihen mit allen Titeln.
 */

import { $, $$, esc, icon, img, initials } from '../ui.js';
import { isAdmin, state, visibleApps } from '../state.js';
import { appCard, bindCards, primaryAction, progressBox } from './cards.js';

const HERO_INTERVAL = 7000;

function heroSlide(app, index) {
  const banner = app.banner || app.cover || app.icon;
  return `
  <div class="hero__slide ${index === 0 ? 'is-active' : ''}" data-index="${index}" style="--hero-accent:${esc(
    app.accentColor
  )}">
    ${
      img(banner, app.title, 'hero__img') ||
      `<div class="hero__fallback"></div><div class="hero__ghost">${esc(initials(app.title))}</div>`
    }
    <div class="hero__scrim"></div>
    <div class="hero__body">
      <div class="hero__eyebrow">${icon('shield')} ${app.type === 'app' ? 'Empfohlene App' : 'Empfohlenes Spiel'}</div>
      <h2 class="hero__title">${esc(app.title)}</h2>
      <p class="hero__desc">${esc(app.shortDescription || app.description || '')}</p>
      <div class="hero__actions">
        <button class="btn ${primaryAction(app).style} btn--lg" data-act="primary" data-id="${esc(app.id)}">
          ${icon(primaryAction(app).icon)}${esc(primaryAction(app).label)}
        </button>
        <button class="btn btn--lg btn--ghost" data-act="open" data-id="${esc(app.id)}">Details ansehen</button>
      </div>
      ${progressBox(app, 'progress--hero')}
    </div>
  </div>`;
}

function section(title, note, contentHtml, { scroll = false } = {}) {
  return `
  <section class="section">
    <div class="section__head">
      <h2 class="section__title">${esc(title)}</h2>
      ${note ? `<span class="section__note">${esc(note)}</span>` : ''}
    </div>
    <div class="${scroll ? 'scroll-x' : 'grid'}">${contentHtml}</div>
  </section>`;
}

export function renderStore(view, { navigate }) {
  const apps = visibleApps();
  const all = state.apps;

  if (!all.length) {
    view.innerHTML = `
      <div class="view__inner">
        <div class="empty">
          <div class="empty__mark">${icon('store')}</div>
          <h3>Noch keine Titel im Store</h3>
          <p>
            Trage deine Spiele und Apps in <span class="mono">Games-Apps.json</span> ein
            ${isAdmin() ? 'oder lade sie direkt hier im Launcher hoch.' : '. Ein Administrator kann sie auch hier hochladen.'}
          </p>
          ${
            isAdmin()
              ? `<button class="btn btn--primary" data-go="admin">${icon('upload')}Ersten Titel hochladen</button>`
              : ''
          }
        </div>
      </div>`;
    $('[data-go="admin"]', view)?.addEventListener('click', () => navigate('admin'));
    return () => {};
  }

  const featured = all.filter((a) => a.featured);
  const heroApps = (featured.length ? featured : all.slice(0, 5)).slice(0, 6);

  const newest = [...all]
    .sort((a, b) => String(b.addedAt).localeCompare(String(a.addedAt)))
    .slice(0, 10);
  const games = apps.filter((a) => a.type === 'game');
  const tools = apps.filter((a) => a.type === 'app');

  view.innerHTML = `
    <div class="view__inner">
      <div class="hero" id="hero">
        ${heroApps.map(heroSlide).join('')}
        ${
          heroApps.length > 1
            ? `<div class="hero__dots">${heroApps
                .map((_, i) => `<button class="hero__dot ${i === 0 ? 'is-active' : ''}" data-dot="${i}"></button>`)
                .join('')}</div>`
            : ''
        }
      </div>

      ${
        state.search || state.filter !== 'all'
          ? section(
              `Treffer (${apps.length})`,
              state.search ? `Suche: "${state.search}"` : '',
              apps.map(appCard).join('') || emptyRow()
            )
          : `
        ${section('Neu hinzugefügt', `${newest.length} Titel`, newest.map(appCard).join(''), {
          scroll: true,
        })}
        ${games.length ? section('Spiele', `${games.length} im Katalog`, games.map(appCard).join('')) : ''}
        ${tools.length ? section('Apps & Tools', `${tools.length} im Katalog`, tools.map(appCard).join('')) : ''}`
      }
    </div>`;

  // Deckt Karten und die Hero-Buttons ab (beide nutzen data-act="primary").
  bindCards(view, { onOpen: (id) => navigate('detail', { id }) });

  view.addEventListener('click', (event) => {
    const openBtn = event.target.closest('[data-act="open"]');
    if (openBtn) {
      event.stopPropagation();
      navigate('detail', { id: openBtn.dataset.id });
    }
  });

  return startCarousel(view, heroApps.length);
}

function emptyRow() {
  return `<div class="empty" style="grid-column:1/-1">
    <div class="empty__mark">${icon('search')}</div>
    <h3>Nichts gefunden</h3>
    <p>Andere Suche oder anderen Filter probieren.</p>
  </div>`;
}

function startCarousel(view, count) {
  if (count < 2) return () => {};
  const slides = $$('.hero__slide', view);
  const dots = $$('.hero__dot', view);
  let index = 0;

  const show = (next) => {
    index = (next + slides.length) % slides.length;
    slides.forEach((s, i) => s.classList.toggle('is-active', i === index));
    dots.forEach((d, i) => d.classList.toggle('is-active', i === index));
  };

  let timer = setInterval(() => show(index + 1), HERO_INTERVAL);
  const restart = () => {
    clearInterval(timer);
    timer = setInterval(() => show(index + 1), HERO_INTERVAL);
  };

  dots.forEach((dot) =>
    dot.addEventListener('click', () => {
      show(Number(dot.dataset.dot));
      restart();
    })
  );

  return () => clearInterval(timer);
}
