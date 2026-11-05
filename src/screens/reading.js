import { ICONS, esc, percent } from '../ui.js';
import { loadSettings, saveSettings, loadProgress, saveProgress, load } from '../storage.js';
import { splitWord, Reader, formatMinutes, minutesLeft, chapterAt, MIN_WPM, MAX_WPM, WPM_STEP } from '../rsvp.js';
import { findBook, prepareBook, markOpened, BookError } from '../books.js';

export function renderReading(app, ctx, bookId) {
  let alive = true;
  let reader = null;
  let wakeLock = null;
  let detach = () => {};

  app.innerHTML = `<main class="reader"><p class="reader-loading" role="status">Открываю книгу…</p></main>`;

  (async () => {
    const book = await findBook(bookId);
    if (!alive) return;
    if (!book) {
      ctx.navigate('#library');
      return;
    }
    let prepared;
    try {
      prepared = await prepareBook(book);
    } catch (err) {
      if (!alive) return;
      const msg = err instanceof BookError ? err.message : 'Не получилось открыть книгу.';
      app.innerHTML = `<main class="reader"><div class="reader-error" role="alert"><p>${esc(msg)}</p><a class="btn-primary" href="#library">В библиотеку</a></div></main>`;
      return;
    }
    if (!alive) return;
    markOpened(book.id);
    mount(book, prepared);
  })();

  function mount(book, { tokens, chapters }) {
    const settings = loadSettings();
    const chapterStarts = chapters.map((c) => c.start);
    const memoryOnly = book.source === 'file' && load('warn.memory', false);

    app.innerHTML = `
      <main class="reader">
        <header class="reader-header">
          <a class="icon-btn" href="#library" aria-label="К библиотеке">${ICONS.back}</a>
          <div class="reader-title">
            <p class="t1">${esc(book.title)}</p>
            <p class="t2" data-ref="chapter"></p>
          </div>
          <a class="icon-btn" href="#speed" aria-label="Настройки скорости">${ICONS.gauge}</a>
        </header>
        ${memoryOnly ? '<p class="reader-warn">Браузер не разрешил сохранить книгу: после закрытия страницы её нужно будет загрузить снова.</p>' : ''}
        <div class="stage" data-action="toggle">
          <div class="ticks" aria-hidden="true"><span class="l"></span><span class="m"></span><span class="r"></span></div>
          <p class="word" aria-hidden="true"><span class="l"><span data-ref="left"></span></span><span class="m" data-ref="mid"></span><span class="r" data-ref="right"></span></p>
          <div class="ticks" aria-hidden="true"><span class="l"></span><span class="m"></span><span class="r"></span></div>
          <p class="status" data-ref="status" aria-live="polite"></p>
        </div>
        <div class="reader-bottom">
          <div>
            <div class="bar" aria-hidden="true"><div class="bar-fill" data-ref="bar"></div></div>
            <div class="progress-row"><span data-ref="pct"></span><span data-ref="left-time"></span></div>
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
      left: ref('left'), mid: ref('mid'), right: ref('right'), status: ref('status'), chapter: ref('chapter'),
      bar: ref('bar'), pct: ref('pct'), leftTime: ref('left-time'), wpm: ref('wpm'), play: ref('play'),
      slower: app.querySelector('[data-action="slower"]'), faster: app.querySelector('[data-action="faster"]'),
    };

    let lastSaved = -1;
    let lastChapter = -2;
    const persist = () => {
      if (reader && reader.i !== lastSaved) {
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

    const showChapter = () => {
      const c = chapterAt(chapterStarts, reader.i);
      if (c === lastChapter) return;
      lastChapter = c;
      els.chapter.textContent = c >= 0 ? chapters[c].title : book.author || 'Свой файл';
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
      else if (reader.ended) els.status.textContent = 'Книга закончилась. Нажмите ▶, чтобы начать сначала.';
      else els.status.textContent = 'Нажмите на слово или ▶, чтобы читать';
      showProgress();
    };

    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator && !wakeLock) {
          wakeLock = await navigator.wakeLock.request('screen');
          wakeLock.addEventListener('release', () => {
            wakeLock = null;
          });
        }
      } catch {
        /* экран может погаснуть — не страшно */
      }
    };
    const releaseWakeLock = () => {
      try {
        wakeLock?.release();
      } catch {
        /* ничего */
      }
      wakeLock = null;
    };

    reader = new Reader(tokens, {
      wpm: settings.wpm,
      punct: settings.punct,
      ramp: settings.ramp,
      onTick: () => {
        showWord();
        showProgress();
        showChapter();
        if (reader.i % 25 === 0) persist();
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
    if (reader.i > 0 && reader.i >= tokens.length - 1) reader.ended = true;
    showWord();
    showChapter();
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
      if (e.target.closest && e.target.closest('button, a, input, label')) return;
      if (e.code === 'Space') {
        e.preventDefault();
        reader.toggle();
      } else if (e.code === 'ArrowLeft') reader.step(-10);
      else if (e.code === 'ArrowRight') reader.step(10);
    };
    const onHidden = () => {
      if (document.hidden && reader.playing) reader.pause();
    };

    app.addEventListener('click', onClick);
    document.addEventListener('keydown', onKey);
    document.addEventListener('visibilitychange', onHidden);
    window.addEventListener('pagehide', persist);
    detach = () => {
      app.removeEventListener('click', onClick);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('visibilitychange', onHidden);
      window.removeEventListener('pagehide', persist);
      persist();
    };
  }

  return () => {
    alive = false;
    if (reader) reader.destroy();
    detach();
    releaseWakeLockSafe();
  };

  function releaseWakeLockSafe() {
    try {
      wakeLock?.release();
    } catch {
      /* ничего */
    }
  }
}
