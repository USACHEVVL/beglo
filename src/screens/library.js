import { ICONS, esc, percent, isIOS, isStandalone, cover } from '../ui.js';
import { load, save, loadSettings, loadProgress } from '../storage.js';
import { formatMinutes, minutesLeft } from '../rsvp.js';
import { allBooks, classics, recent, markOpened, addBookFromFile, removeBook, storageIsPersistent, BookError } from '../books.js';

/* global __PREVIEW__ */
const IS_PREVIEW = typeof __PREVIEW__ !== 'undefined' && __PREVIEW__;

function status(book) {
  const idx = loadProgress(book.id);
  const pct = percent(idx, book.words);
  if (idx > 0 && idx >= book.words - 1) return { idx, pct: 100, label: 'прочитано', done: true };
  if (idx > 0) return { idx, pct, label: `${pct}%`, done: false };
  return { idx, pct: 0, label: book.source === 'file' ? 'новая' : '', done: false };
}

export function renderLibrary(app, ctx) {
  const state = { confirmDelete: null, error: '', info: '', busy: false };
  let alive = true;

  async function draw() {
    const books = await allBooks();
    if (!alive) return;
    const rec = recent();
    const settings = loadSettings();
    const byRecent = books.filter((b) => rec[b.id]).sort((a, b) => rec[b.id] - rec[a.id]);
    const current = byRecent[0] || classics()[0];
    const cur = status(current);
    const started = cur.idx > 0;

    const mine = books
      .filter((b) => b.id !== current.id && (b.source === 'file' || loadProgress(b.id) > 0))
      .sort((a, b) => (rec[b.id] || b.addedAt || 0) - (rec[a.id] || a.addedAt || 0));

    let notice = '';
    if (state.error) {
      notice = `<div class="notice notice-error" role="alert"><p>${esc(state.error)}</p><button type="button" class="notice-close" data-action="close-error" aria-label="Скрыть сообщение">${ICONS.close}</button></div>`;
    } else if (state.info) {
      notice = `<div class="notice" role="status"><p>${esc(state.info)}</p><button type="button" class="notice-close" data-action="close-error" aria-label="Скрыть сообщение">${ICONS.close}</button></div>`;
    } else if (IS_PREVIEW) {
      notice = `<div class="notice" role="note"><p>Это предпросмотр. Установка на экран телефона и работа без интернета заработают, когда приложение будет на своём адресе.</p></div>`;
    } else if (isIOS() && !isStandalone() && !load('hint.ios.dismissed', false)) {
      notice = `<div class="notice" role="note" data-notice="ios">${ICONS.share}<p>Чтобы книги не пропадали, установите приложение: «Поделиться» → «На экран Домой».</p><button type="button" class="notice-close" data-action="dismiss-ios" aria-label="Скрыть подсказку">${ICONS.close}</button></div>`;
    } else if (ctx.installPrompt() && !isStandalone()) {
      notice = `<div class="notice" role="note"><p>Установите Бегло на экран телефона — так оно будет работать и без интернета.</p><button type="button" class="btn-primary" data-action="install">Установить</button></div>`;
    }

    const mineRows = mine
      .map((b) => {
        const s = status(b);
        const right =
          state.confirmDelete === b.id
            ? `<span class="row-confirm"><button type="button" class="btn-danger" data-action="delete" data-id="${esc(b.id)}">Удалить</button><button type="button" class="btn-text" data-action="cancel-delete">Отмена</button></span>`
            : `<span class="row-status">${s.done ? ICONS.check : ''}${esc(s.label)}</span>${
                b.source === 'file'
                  ? `<button type="button" class="icon-btn small" data-action="ask-delete" data-id="${esc(b.id)}" aria-label="Удалить «${esc(b.title)}»">${ICONS.trash}</button>`
                  : ''
              }`;
        return `<li class="book-row">
          <a class="book-row-link" href="#read-${esc(b.id)}">
            <span class="cover-sm" style="background:${esc(b.cover)}" aria-hidden="true"></span>
            <span class="book-row-text"><span class="book-row-title">${esc(b.title)}</span><span class="book-row-author">${esc(b.author || 'Свой файл')}</span></span>
          </a>
          ${right}
        </li>`;
      })
      .join('');

    const shelf = classics()
      .map((b) => `<a class="shelf-item" href="#read-${esc(b.id)}" aria-label="${esc(b.title)}, ${esc(b.author)}">${cover(b, 'cover-lg')}</a>`)
      .join('');

    const leftTime = formatMinutes(minutesLeft(current.words - cur.idx, settings.wpm));

    app.innerHTML = `
      <main class="library">
        <header class="library-header">
          <h1 class="wordmark">Б<span>е</span>гло</h1>
          <div class="header-actions">
            <a class="icon-btn outlined" href="#speed" aria-label="Скорость чтения">${ICONS.gauge}</a>
            <label class="icon-btn filled" for="book-file" aria-label="Загрузить книгу">${ICONS.plus}</label>
          </div>
        </header>
        ${notice}
        <section class="section" aria-labelledby="continue-title">
          <h2 class="section-title" id="continue-title">${started ? 'Продолжить' : 'Начать'}</h2>
          <div class="book-card">
            ${cover(current)}
            <div class="book-info">
              <div>
                <p class="book-title">${esc(current.title)}</p>
                <p class="book-author">${esc(current.author || 'Свой файл')}</p>
              </div>
              <div class="bar" aria-hidden="true"><div class="bar-fill" style="width:${cur.pct}%"></div></div>
              <p class="book-meta">${cur.done ? 'Прочитано' : `${cur.pct}% · осталось ${leftTime}`}</p>
              <a class="btn-primary" href="#read-${esc(current.id)}">${ICONS.play}${started && !cur.done ? 'Продолжить' : 'Читать'}</a>
            </div>
          </div>
        </section>

        <label class="upload" for="book-file" aria-busy="${state.busy}">
          ${ICONS.upload}
          <span class="upload-text">
            <span class="upload-title">${state.busy ? 'Открываю книгу…' : 'Загрузить книгу'}</span>
            <span class="upload-hint">FB2, EPUB или TXT</span>
          </span>
        </label>
        <input type="file" id="book-file" class="visually-hidden" ${state.busy ? 'disabled' : ''}>

        ${mine.length ? `<section class="section" aria-labelledby="mine-title">
          <h2 class="section-title" id="mine-title">Мои книги</h2>
          <ul class="book-list">${mineRows}</ul>
        </section>` : ''}

        <section class="section" aria-labelledby="classics-title">
          <h2 class="section-title" id="classics-title">Классика бесплатно</h2>
          <div class="shelf">${shelf}</div>
        </section>
      </main>`;
  }

  const onClick = async (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const action = el.dataset.action;
    if (action === 'dismiss-ios') {
      save('hint.ios.dismissed', true);
      app.querySelector('[data-notice="ios"]')?.remove();
    } else if (action === 'install') {
      const prompt = ctx.installPrompt();
      if (prompt) {
        prompt.prompt();
        prompt.userChoice.finally(() => {
          ctx.clearInstallPrompt();
          draw();
        });
      }
    } else if (action === 'close-error') {
      state.error = '';
      state.info = '';
      draw();
    } else if (action === 'ask-delete') {
      state.confirmDelete = el.dataset.id;
      draw();
    } else if (action === 'cancel-delete') {
      state.confirmDelete = null;
      draw();
    } else if (action === 'delete') {
      await removeBook(el.dataset.id);
      state.confirmDelete = null;
      state.info = 'Книга удалена с телефона.';
      draw();
    }
  };

  const onChange = async (e) => {
    if (e.target.id !== 'book-file' || !e.target.files || !e.target.files[0]) return;
    const file = e.target.files[0];
    state.busy = true;
    state.error = '';
    state.info = '';
    await draw();
    try {
      const { book, persisted } = await addBookFromFile(file);
      if (!alive) return;
      markOpened(book.id);
      if (!persisted || !storageIsPersistent()) save('warn.memory', true);
      ctx.navigate(`#read-${book.id}`);
    } catch (err) {
      state.busy = false;
      state.error = err instanceof BookError ? err.message : 'Не получилось открыть файл. Подойдут книги в форматах FB2, EPUB или TXT.';
      if (!(err instanceof BookError)) console.error(err);
      if (alive) draw();
    }
  };

  app.addEventListener('click', onClick);
  app.addEventListener('change', onChange);
  draw();

  return () => {
    alive = false;
    app.removeEventListener('click', onClick);
    app.removeEventListener('change', onChange);
  };
}
