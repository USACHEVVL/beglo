import { ICONS, esc } from '../ui.js';
import { loadSettings, saveSettings } from '../storage.js';
import { formatMinutes, clampWpm, MIN_WPM, MAX_WPM, WPM_STEP } from '../rsvp.js';
import { findBook } from '../books.js';

const PRESETS = [
  { label: 'Спокойно', wpm: 200 },
  { label: 'Обычно', wpm: 300 },
  { label: 'Быстро', wpm: 450 },
  { label: 'Очень быстро', wpm: 600 },
];
const FREE_LIMIT = 250;
const AVERAGE_NOVEL = 80000;

const pos = (wpm) => `${(((wpm - MIN_WPM) / (MAX_WPM - MIN_WPM)) * 100).toFixed(2)}%`;

export function renderSpeed(app, ctx) {
  let alive = true;
  const back = ctx.returnTo();
  const bookId = back.startsWith('#read-') ? back.slice(6) : null;

  (async () => {
    const book = bookId ? await findBook(bookId) : null;
    if (!alive) return;
    let settings = loadSettings();

    app.innerHTML = `
      <main class="speed">
        <header class="reader-header">
          <a class="icon-btn" href="${esc(back)}" aria-label="Назад">${ICONS.back}</a>
          <h1 class="speed-title">Скорость</h1>
          <a class="btn-text" href="${esc(back)}">Готово</a>
        </header>
        <div class="speed-body">
          <div class="speed-hero">
            <p class="speed-number" data-ref="number"></p>
            <p class="speed-unit">слов в минуту</p>
            <p class="speed-book" data-ref="book"></p>
          </div>

          <div class="slider">
            <label for="wpm-range" class="slider-label">Перетащите, чтобы выбрать скорость</label>
            <input id="wpm-range" type="range" min="${MIN_WPM}" max="${MAX_WPM}" step="${WPM_STEP}">
            <div class="scale-bar" aria-hidden="true"><span style="width:${pos(FREE_LIMIT)}"></span></div>
            <div class="scale" aria-hidden="true">
              <span style="left:0">100</span>
              <span style="left:${pos(250)}" class="mid">250</span>
              <span style="left:${pos(500)}" class="mid">500</span>
              <span style="right:0">1000</span>
            </div>
          </div>

          <p class="speed-note" data-ref="note" hidden>${ICONS.lock}<span>Скорость выше 250 будет по подписке, а сейчас бесплатно.</span></p>

          <div class="presets" role="group" aria-label="Готовые варианты">
            ${PRESETS.map((p) => `<button type="button" class="preset" data-wpm="${p.wpm}" aria-pressed="false"><span class="preset-name">${p.label}</span><span class="preset-wpm">${p.wpm} слов/мин</span></button>`).join('')}
          </div>

          <div class="toggles">
            <button type="button" class="toggle" data-setting="punct" aria-pressed="false">
              <span class="toggle-text"><span class="toggle-name">Пауза на знаках препинания</span><span class="toggle-hint">Слово с точкой или запятой держится дольше</span></span>
              <span class="switch" aria-hidden="true"><span></span></span>
            </button>
            <button type="button" class="toggle" data-setting="ramp" aria-pressed="false">
              <span class="toggle-text"><span class="toggle-name">Плавный разгон</span><span class="toggle-hint">После паузы первые слова идут медленнее</span></span>
              <span class="switch" aria-hidden="true"><span></span></span>
            </button>
          </div>
        </div>
      </main>`;

    const range = app.querySelector('#wpm-range');
    const number = app.querySelector('[data-ref="number"]');
    const bookLine = app.querySelector('[data-ref="book"]');
    const note = app.querySelector('[data-ref="note"]');

    const show = () => {
      range.value = String(settings.wpm);
      number.textContent = settings.wpm;
      const words = book ? book.words : AVERAGE_NOVEL;
      const time = formatMinutes(words / settings.wpm);
      bookLine.textContent = book ? `«${book.title}» целиком: ≈ ${time}` : `Средний роман целиком: ≈ ${time}`;
      note.hidden = settings.wpm <= FREE_LIMIT;
      app.querySelectorAll('.preset').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.wpm) === settings.wpm)));
      app.querySelectorAll('.toggle').forEach((b) => b.setAttribute('aria-pressed', String(Boolean(settings[b.dataset.setting]))));
    };

    const update = (patch) => {
      settings = { ...settings, ...patch };
      saveSettings(settings);
      show();
    };

    range.addEventListener('input', () => update({ wpm: clampWpm(Number(range.value)) }));
    app.querySelector('.presets').addEventListener('click', (e) => {
      const b = e.target.closest('.preset');
      if (b) update({ wpm: Number(b.dataset.wpm) });
    });
    app.querySelector('.toggles').addEventListener('click', (e) => {
      const b = e.target.closest('.toggle');
      if (b) update({ [b.dataset.setting]: !settings[b.dataset.setting] });
    });
    show();
  })();

  return () => {
    alive = false;
  };
}
