// Каталог: встроенная классика + книги, которые человек загрузил сам.
import { CLASSICS } from './classics.js';
import * as db from './db.js';
import { load, save } from './storage.js';
import { tokenizeParagraphs } from './rsvp.js';
import { parseBookFile, BookError } from './parsers.js';

export { BookError };

const COVERS = ['#2C3E5C', '#6E2B3A', '#3D5A4A', '#5B4636', '#6F5424', '#2F4660', '#4A4A42', '#7A2E25'];
const prepared = new Map();

export function classics() {
  return CLASSICS.map((c) => ({ ...c, source: 'classic' }));
}

export async function userBooks() {
  const list = await db.listBooks();
  return list.map((b) => ({ ...b, source: 'file' }));
}

export async function allBooks() {
  return [...classics(), ...(await userBooks())];
}

export async function findBook(id) {
  const classic = classics().find((b) => b.id === id);
  if (classic) return classic;
  return (await userBooks()).find((b) => b.id === id) || null;
}

/* ---------- Недавние ---------- */

export function recent() {
  const map = load('recent', {});
  return map && typeof map === 'object' ? map : {};
}

export function markOpened(id) {
  save('recent', { ...recent(), [id]: Date.now() });
}

/* ---------- Текст книги ---------- */

async function loadContent(book) {
  if (book.source === 'classic') {
    const res = await fetch(`classics/${book.id}.json`);
    if (!res.ok) throw new BookError('Не удалось загрузить книгу. Проверьте интернет и попробуйте ещё раз.');
    return res.json();
  }
  const content = await db.getContent(book.id);
  if (!content) throw new BookError('Книга не найдена на этом телефоне. Загрузите файл ещё раз.');
  return content;
}

// Слова книги и начала глав (номера слов) — считаются один раз за сеанс.
export async function prepareBook(book) {
  if (prepared.has(book.id)) return prepared.get(book.id);
  const content = await loadContent(book);
  const { tokens, starts } = tokenizeParagraphs(content.paragraphs);
  const chapters = (content.chapters || [])
    .filter((c) => c.para < starts.length)
    .map((c) => ({ title: c.title, start: starts[c.para] }))
    .sort((a, b) => a.start - b.start);
  const result = { tokens, chapters };
  prepared.set(book.id, result);
  return result;
}

/* ---------- Загрузка своей книги ---------- */

function newId() {
  const rnd = Math.random().toString(36).slice(2, 8);
  return `u${Date.now().toString(36)}${rnd}`;
}

function coverFor(title) {
  let h = 0;
  for (const ch of title) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return COVERS[h % COVERS.length];
}

export async function addBookFromFile(file) {
  const parsed = await parseBookFile(file);
  const { tokens, starts } = tokenizeParagraphs(parsed.paragraphs);
  const existing = (await userBooks()).find(
    (b) => b.title === parsed.title && b.author === parsed.author && b.words === tokens.length,
  );
  if (existing) return { book: existing, duplicate: true, persisted: db.isPersistent() };

  const book = {
    id: newId(),
    title: parsed.title,
    author: parsed.author,
    cover: coverFor(parsed.title),
    words: tokens.length,
    addedAt: Date.now(),
  };
  let persisted;
  try {
    persisted = await db.saveBook(book, { paragraphs: parsed.paragraphs, chapters: parsed.chapters });
  } catch {
    throw new BookError('На телефоне не хватает места, чтобы сохранить книгу.');
  }
  const chapters = parsed.chapters
    .map((c) => ({ title: c.title, start: starts[c.para] }))
    .sort((a, b) => a.start - b.start);
  prepared.set(book.id, { tokens, chapters });
  return { book: { ...book, source: 'file' }, duplicate: false, persisted };
}

export async function removeBook(id) {
  await db.deleteBook(id);
  prepared.delete(id);
  const map = recent();
  delete map[id];
  save('recent', map);
  save('progress.' + id, null);
}

export function storageIsPersistent() {
  return db.isPersistent();
}
