// Готовит полку классики: берёт FB2 из корпуса 19th Century Russian Literature
// (github.com/kaylinland/19thCenturyRussianLiterature, тексты с lib.ru, общественное достояние),
// оставляет только авторский текст без комментариев издателей и пишет
// public/classics/<id>.json и src/classics.js.
//
// Запуск: node scripts/build_classics.mjs <папка Texts корпуса>
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { DOMParser } from '@xmldom/xmldom';
import { parseBookBytes } from '../src/parsers.js';
import { tokenize } from '../src/rsvp.js';

const SRC = process.argv[2];
if (!SRC) throw new Error('Укажите папку Texts корпуса');

const ROMAN = /^[IVXLC]+\.?$/;

const BOOKS = [
  {
    id: 'kapitanskaya-dochka', file: 'Pushkin/Капитанская дочка.xml', title: 'Капитанская дочка', author: 'А. С. Пушкин', cover: '#2C3E5C',
    keep: [[4, 695]],
    chapter: (p, next) => (/^ГЛАВА [IVXLC]+$/.test(p) ? `Глава ${p.split(' ')[1]}. ${cap(next)}` : null),
  },
  {
    id: 'pikovaya-dama', file: 'Pushkin/Пиковая дама.xml', title: 'Пиковая дама', author: 'А. С. Пушкин', cover: '#6E2B3A',
    keep: [[5, 247]],
    chapter: (p) => (ROMAN.test(p) ? `Глава ${p}` : p === 'ЗАКЛЮЧЕНИЕ' ? 'Заключение' : null),
  },
  { id: 'shinel', file: 'Gogol/Шинель.xml', title: 'Шинель', author: 'Н. В. Гоголь', cover: '#4A4A42', keep: [[2, 48]] },
  {
    id: 'nos', file: 'Gogol/Нос.xml', title: 'Нос', author: 'Н. В. Гоголь', cover: '#5B4636',
    keep: [[2, 181]],
    chapter: (p) => (ROMAN.test(p) ? `Глава ${p}` : null),
  },
  { id: 'mumu', file: 'Turgenev/Муму.xml', title: 'Муму', author: 'И. С. Тургенев', cover: '#3D5A4A', keep: [[2, 3], [6, Infinity]] },
  {
    id: 'belye-nochi', file: 'Dostoevsky/Белые ночи.xml', title: 'Белые ночи', author: 'Ф. М. Достоевский', cover: '#2F4660',
    keep: [[2, 384]],
    chapter: (p) => (/^(Ночь (первая|вторая|третья|четвертая)|Утро)$/.test(p) ? p : /^История настеньки$/i.test(p) ? 'История Настеньки' : null),
  },
  {
    id: 'smert-ivana-ilicha', file: 'Tolstoy_Lev/Смерть Ивана Ильича.xml', title: 'Смерть Ивана Ильича', author: 'Л. Н. Толстой', cover: '#3B3833',
    keep: [[2, 388]],
    chapter: (p) => (ROMAN.test(p) ? `Глава ${p}` : null),
  },
  {
    id: 'dama-s-sobachkoy', file: 'Chekhov/Individual Stories/Дама с собачкой.xml', title: 'Дама с собачкой', author: 'А. П. Чехов', cover: '#6F5424',
    keep: [[2, 3], [8, 139]],
    chapter: (p) => (ROMAN.test(p) ? `Глава ${p}` : null),
  },
];

function cap(s) {
  const l = s.toLowerCase();
  return l.charAt(0).toUpperCase() + l.slice(1);
}

const isSeparator = (p) => /^[-—*\s.]+$/.test(p);

mkdirSync('public/classics', { recursive: true });
const index = [];

for (const book of BOOKS) {
  const parsed = parseBookBytes(new Uint8Array(readFileSync(join(SRC, book.file))), 'x.fb2', DOMParser);
  const src = parsed.paragraphs;
  const kept = [];
  for (const [from, to] of book.keep) kept.push(...src.slice(from, Math.min(to, src.length)));
  const paragraphs = kept.filter((p) => !isSeparator(p));

  const chapters = [];
  if (book.chapter) {
    paragraphs.forEach((p, i) => {
      const title = book.chapter(p, paragraphs[i + 1] || '');
      if (title) chapters.push({ title, para: i });
    });
  }

  const words = tokenize(paragraphs.join('\n')).length;
  writeFileSync(`public/classics/${book.id}.json`, JSON.stringify({ paragraphs, chapters }));
  index.push({ id: book.id, title: book.title, author: book.author, cover: book.cover, words });
  console.log(book.id, paragraphs.length, 'абз.', words, 'слов', chapters.length, 'глав');
  console.log('   начало:', paragraphs.slice(0, 2).map((p) => p.slice(0, 50)).join(' | '));
  console.log('   конец :', paragraphs.slice(-1)[0].slice(0, 90));
}

writeFileSync(
  'src/classics.js',
  `// Создано scripts/build_classics.mjs. Тексты — общественное достояние.\nexport const CLASSICS = ${JSON.stringify(index, null, 2)};\n`,
);
