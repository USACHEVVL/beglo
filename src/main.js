import './fonts.css';
import './styles.css';
import { renderLibrary } from './screens/library.js';
import { renderReading } from './screens/reading.js';
import { renderSpeed } from './screens/speed.js';

/* global __PREVIEW__ */
const IS_PREVIEW = typeof __PREVIEW__ !== 'undefined' && __PREVIEW__;

const app = document.getElementById('app');
if (IS_PREVIEW) document.documentElement.classList.add('preview');

let cleanup = null;
let installPrompt = null;
let previousHash = '';
let speedReturn = '#library';

// Экраны: #library, #read-<id книги>, #speed. Имена простые — так их понимает и предпросмотр по ссылке.
const ctx = {
  navigate(hash) {
    if (location.hash === hash) route();
    else location.hash = hash;
  },
  installPrompt: () => installPrompt,
  clearInstallPrompt() {
    installPrompt = null;
  },
  returnTo: () => speedReturn,
};

function route() {
  if (cleanup) cleanup();
  cleanup = null;
  const hash = location.hash;
  if (hash.startsWith('#read-')) {
    cleanup = renderReading(app, ctx, decodeURIComponent(hash.slice(6)));
  } else if (hash === '#speed') {
    speedReturn = previousHash.startsWith('#read-') ? previousHash : '#library';
    cleanup = renderSpeed(app, ctx);
  } else {
    cleanup = renderLibrary(app, ctx);
  }
  previousHash = hash;
  window.scrollTo(0, 0);
}

window.addEventListener('hashchange', route);
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installPrompt = e;
  if (!location.hash.startsWith('#read-') && location.hash !== '#speed') route();
});

route();
