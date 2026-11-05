// Общие мелочи для экранов: значки, экранирование текста, проценты.

const svg = (body, extra = '') =>
  `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"${extra}>${body}</svg>`;

export const ICONS = {
  back: svg('<path d="M15 18l-6-6 6-6"/>'),
  play: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4.5v15l12-7.5z" fill="currentColor"/></svg>',
  pause: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M8 5v14M16 5v14"/></svg>',
  minus: svg('<path d="M5 12h14"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  rewind: svg('<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/>'),
  forward: svg('<path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 4v5h-5"/>'),
  close: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  share: svg('<path d="M12 15V4M7 9l5-5 5 5M5 14v6h14v-6"/>'),
  upload: svg('<path d="M12 15V4M7 9l5-5 5 5M5 20h14"/>'),
  gauge: svg('<path d="M12 14l4-4"/><path d="M3.3 17a9 9 0 1 1 17.4 0"/>'),
  check: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
  trash: svg('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
  lock: svg('<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
};

export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function percent(index, total) {
  if (total <= 1) return 0;
  return Math.min(100, Math.round((index / (total - 1)) * 100));
}

export function shortAuthor(author) {
  if (!author) return '';
  const parts = author.split(' ').filter(Boolean);
  return parts[parts.length - 1];
}

export function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
}

export function cover(book, size = '') {
  return `<span class="cover ${size}" style="background:${esc(book.cover)}" aria-hidden="true">
    <span class="cover-title">${esc(book.title)}</span>
    <span class="cover-author">${esc(shortAuthor(book.author))}</span>
  </span>`;
}
