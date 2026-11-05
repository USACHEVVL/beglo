import './fonts.css';
import './styles.css';
import { tokenize, splitWord, Reader, formatMinutes, minutesLeft, MIN_WPM, MAX_WPM, WPM_STEP } from './rsvp.js';
import { load, save, loadSettings, saveSettings, loadProgress, saveProgress } from './storage.js';
import { DEMO_BOOK } from './demo.js';

/* global __PREVIEW__ */
const IS_PREVIEW = typeof __PREVIEW__ !== 'undefined' && __PREVIEW__;

const app = document.getElementById('app');
if (IS_PREVIEW) document.documentElement.classList.add('preview');
const books = [DEMO_BOOK];
const tokenCache = new Map();
let cleanup = null;
let installPrompt = null;

const ICONS = {
  back: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>',
  play: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4.5v15l12-7.5z" fill="currentColor"/></svg>',
  pause: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M8 5v14M16 5v14"/></svg>',
  minus: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14"/></svg>',
  plus: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  rewind: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg>',
  forward: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 4v5h-5"/></svg>',
  close: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  share: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V4M7 9l5-5 5 5M5 14v6h14v-6"/></svg>',
};

function esc(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function tokensFor(book) {
  if (!tokenCache.has(book.id)) tokenCache.set(book.id, tokenize(book.text));
  return tokenCache.get(book.id);
}

function percent(index, total) {
  if (total <= 1) return 0;
  return Math.round((index / (total - 1)) * 100);
}

function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
}

/* ---------- Библиотека ---------- */

function renderLibrary() {
  const book = books[0];
  const tokens = tokensFor(book);
  const idx = loadProgress(book.id);
  const pct = percent(idx, tokens.length);
  const settings = loadSettings();
  const left = formatMinutes(minutesLeft(tokens.length - idx, settings.wpm));
  const started = idx > 0;

  let notice = '';
  if (IS_PREVIEW) {
    notice = `<div class="notice" role="note"><p>Это предпросмотр. Установка на экран телефона и работа без интернета заработают, когда приложение будет на своём адресе.</p></div>`;
  } else if (isIOS() && !isStandalone() && !load('hint.ios.dismissed', false)) {
    notice = `<div class="notice" role="note" data-notice="ios">${ICONS.share}<p>Чтобы книги не пропадали, установите приложение: «Поделиться» → «На экран Домой».</p><button type="button" class="notice-close" data-action="dismiss-ios" aria-label="Скрыть подсказку">${ICONS.close}</button></div>`;
  } else if (installPrompt && !isStandalone()) {
    notice = `<div class="notice" role="note"><p>Установите Бегло на экран телефона — так оно будет работать и без интернета.</p><button type="button" class="btn-primary" data-action="install">Установить</button></div>`;
  }

  app.innerHTML = `
    <main class="library">
      <header class="library-header">
        <h1 class="wordmark">Б<span>е</span>гло</h1>
      </header>
      ${notice}
      <section class="section" aria-labelledby="continue-title">
        <h2 class="section-title" id="continue-title">${started ? 'Продолжить' : 'Начать'}</h2>
        <div class="book-card">
          <div class="cover" style="background:${esc(book.cover)}" aria-hidden="true">
            <span class="cover-title">${esc(book.title)}</span>
            <span class="cover-author">${esc(book.author.split(' ').pop())}</span>
          </div>
          <div class="book-info">
            <div>
              <p class="book-title">${esc(book.title)}</p>
              <p class="book-author">${esc(book.author)}${book.excerpt ? ' · отрывок' : ''}</p>
            </div>
            <div class="bar" aria-hidden="true"><div class="bar-fill" style="width:${pct}%"></div></div>
            <p class="book-meta">${pct}% · осталось ${left}</p>
            <a class="btn-primary" href="#read-${encodeURIComponent(book.id)}">${ICONS.play}${started ? 'Продолжить' : 'Читать'}</a>
          </div>
        </div>
      </section>
      <p class="soon">Загрузка своих книг (FB2, EPUB, TXT) и полка бесплатной классики появятся на следующих этапах.</p>
    </main>`;

  const onClick = (e) => {
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (action === 'dismiss-ios') {
      save('hint.ios.dismissed', true);
      app.querySelector('[data-notice="ios"]')?.remove();
    } else if (action === 'install' && installPrompt) {
      installPrompt.prompt();
      installPrompt.userChoice.finally(() => {
        installPrompt = null;
        renderLibrary();
      });
    }
  };
  app.addEventListener('click', onClick);
  return () => app.removeEventListener('click', onClick);
}

/* ---------- Чтение ---------- */

function renderReading(bookId) {
  const book = books.find((b) => b.id === bookId);
  if (!book) {
    location.hash = '';
    return null;
  }
  const tokens = tokensFor(book);
  const settings = loadSettings();
  let wakeLock = null;

  app.innerHTML = `
    <main class="reader">
      <header class="reader-header">
        <a class="icon-btn" href="#library" aria-label="К библиотеке">${ICONS.back}</a>
        <div class="reader-title">
          <p class="t1">${esc(book.title)}</p>
          <p class="t2">${esc(book.chapter || book.author)}${book.excerpt ? ' · отрывок' : ''}</p>
        </div>
        <span class="icon-btn" aria-hidden="true"></span>
      </header>
      <div class="stage" data-action="toggle">
        <div class="ticks" aria-hidden="true"><span class="l"></span><span class="m"></span><span class="r"></span></div>
        <p class="word" aria-hidden="true"><span class="l"><span data-ref="left"></span></span><span class="m" data-ref="mid"></span><span class="r" data-ref="right"></span></p>
        <div class="ticks" aria-hidden="true"><span class="l"></span><span class="m"></span><span class="r"></span></div>
        <p class="status" data-ref="status" aria-live="polite"></p>
      </div>
      <div class="reader-bottom">
        <div>
          <div class="bar" aria-hidden="true"><div class="bar-fill" data-ref="bar"></div></div>
          <div class="progress-row" style="margin-top:8px"><span data-ref="pct"></span><span data-ref="left-time"></span></div>
        </div>
        <p class="wpm-label" data-ref="wpm"></p>
        <div class="controls">
          <button type="button" class="ctrl" data-action="slower" aria-label="Медленнее">${ICONS.minus}</button>
          <button type="button" class="ctrl plain" data-action="rewind" aria-label="Назад на 10 слов">${ICONS.rewind}</button>
          <button type="button" class="ctrl-play" data-action="toggle" data-ref="play" aria-label="Читать">${ICONS.play}</button>
          <button type="button" class="ctrl plain" data-action="forward" aria-label="Вперёд на 10 слов">${ICONS.forward}</button>
          <button type="button" class="ctrl" data-action="faster" aria-label="Быстрее">${ICONS.plus}</button>
        </div>
      </div>
    </main>`;

  const ref = (name) => app.querySelector(`[data-ref="${name}"]`);
  const els = {
    left: ref('left'), mid: ref('mid'), right: ref('right'), status: ref('status'),
    bar: ref('bar'), pct: ref('pct'), leftTime: ref('left-time'), wpm: ref('wpm'), play: ref('play'),
    slower: app.querySelector('[data-action="slower"]'), faster: app.querySelector('[data-action="faster"]'),
  };

  let lastSaved = -1;
  const persist = () => {
    if (reader.i !== lastSaved) {
      saveProgress(book.id, reader.i);
      lastSaved = reader.i;
    }
  };

  const showWord = () => {
    const token = reader.current;
    const parts = splitWord(token ? token.t : '');
    els.left.textContent = parts.left;
    els.mid.textContent = parts.mid;
    els.right.textContent = parts.right;
  };

  const showProgress = () => {
    const pct = percent(reader.i, tokens.length);
    els.bar.style.width = pct + '%';
    els.pct.textContent = `Прочитано ${pct}%`;
    els.leftTime.textContent = `Осталось ${formatMinutes(minutesLeft(tokens.length - reader.i, reader.wpm))}`;
  };

  const showState = () => {
    els.play.innerHTML = reader.playing ? ICONS.pause : ICONS.play;
    els.play.setAttribute('aria-label', reader.playing ? 'Пауза' : 'Читать');
    els.wpm.textContent = `${reader.wpm} слов в минуту`;
    els.slower.disabled = reader.wpm <= MIN_WPM;
    els.faster.disabled = reader.wpm >= MAX_WPM;
    if (reader.playing) els.status.textContent = '';
    else if (reader.ended) els.status.textContent = book.excerpt ? 'Отрывок закончился. Нажмите ▶, чтобы начать сначала.' : 'Книга закончилась.';
    else els.status.textContent = 'Нажмите на слово или ▶, чтобы читать';
    showProgress();
  };

  const requestWakeLock = async () => {
    try {
      if ('wakeLock' in navigator && !wakeLock) {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => { wakeLock = null; });
      }
    } catch { /* экран может погаснуть — не страшно */ }
  };
  const releaseWakeLock = () => {
    try { wakeLock?.release(); } catch { /* ничего */ }
    wakeLock = null;
  };

  const reader = new Reader(tokens, {
    wpm: settings.wpm,
    punct: settings.punct,
    ramp: settings.ramp,
    onTick: () => {
      showWord();
      showProgress();
      if (reader.i % 20 === 0) persist();
    },
    onState: () => {
      showState();
      if (reader.playing) requestWakeLock();
      else {
        releaseWakeLock();
        persist();
      }
    },
  });
  reader.i = Math.min(loadProgress(book.id), Math.max(0, tokens.length - 1));
  showWord();
  showState();

  const onClick = (e) => {
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (!action) return;
    if (action === 'toggle') reader.toggle();
    else if (action === 'rewind') reader.step(-10);
    else if (action === 'forward') reader.step(10);
    else if (action === 'slower' || action === 'faster') {
      reader.setWpm(reader.wpm + (action === 'faster' ? WPM_STEP : -WPM_STEP));
      saveSettings({ ...loadSettings(), wpm: reader.wpm });
    }
  };
  const onKey = (e) => {
    if (e.target.closest && e.target.closest('button, a, input')) return;
    if (e.code === 'Space') { e.preventDefault(); reader.toggle(); }
    else if (e.code === 'ArrowLeft') reader.step(-10);
    else if (e.code === 'ArrowRight') reader.step(10);
  };
  const onHidden = () => {
    if (document.hidden && reader.playing) reader.pause();
  };

  app.addEventListener('click', onClick);
  document.addEventListener('keydown', onKey);
  document.addEventListener('visibilitychange', onHidden);
  window.addEventListener('pagehide', persist);

  return () => {
    reader.destroy();
    persist();
    releaseWakeLock();
    app.removeEventListener('click', onClick);
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('visibilitychange', onHidden);
    window.removeEventListener('pagehide', persist);
  };
}

/* ---------- Переходы между экранами ---------- */

function route() {
  if (cleanup) cleanup();
  cleanup = null;
  const hash = location.hash;
  if (hash.startsWith('#read-')) cleanup = renderReading(decodeURIComponent(hash.slice(6)));
  else cleanup = renderLibrary();
  window.scrollTo(0, 0);
}

window.addEventListener('hashchange', route);
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installPrompt = e;
  if (!location.hash.startsWith('#read-')) route();
});

route();
