// Хранение на телефоне. Если браузер не даёт сохранять, приложение всё равно работает.
const PREFIX = 'beglo.';

export function load(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function save(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* хранилище недоступно — ничего страшного */
  }
}

export const DEFAULT_SETTINGS = { wpm: 300, punct: true, ramp: true };

export function loadSettings() {
  return { ...DEFAULT_SETTINGS, ...load('settings', {}) };
}

export function saveSettings(settings) {
  save('settings', settings);
}

export function loadProgress(bookId) {
  const value = load('progress.' + bookId, 0);
  return Number.isFinite(value) ? value : 0;
}

export function saveProgress(bookId, index) {
  save('progress.' + bookId, index);
}
