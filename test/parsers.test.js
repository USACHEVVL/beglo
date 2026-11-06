import { test } from 'node:test';
import assert from 'node:assert/strict';
import { zipSync, strToU8 } from 'fflate';
import { DOMParser } from '@xmldom/xmldom';
import { parseBookBytes, decodeText, prettyTitle, BookError } from '../src/parsers.js';

// Кодирует строку в Windows-1251 (только то, что нужно тестам: ASCII и русские буквы).
function cp1251(str) {
  const out = [];
  for (const ch of str) {
    const c = ch.codePointAt(0);
    if (c < 128) out.push(c);
    else if (c >= 0x410 && c <= 0x44f) out.push(c - 0x410 + 0xc0);
    else if (c === 0x401) out.push(0xa8);
    else if (c === 0x451) out.push(0xb8);
    else if (c === 0x2014) out.push(0x97);
    else if (c === 0xab) out.push(0xab);
    else if (c === 0xbb) out.push(0xbb);
    else out.push(0x3f);
  }
  return new Uint8Array(out);
}

const parse = (bytes, name) => parseBookBytes(bytes, name, DOMParser);

const FB2 = `<?xml version="1.0" encoding="windows-1251"?>
<FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0" xmlns:l="http://www.w3.org/1999/xlink">
<description><title-info><author><first-name>Иван</first-name><last-name>Тестов</last-name></author><book-title>Проверка</book-title></title-info></description>
<body>
<title><p>Проверка</p></title>
<section><title><p>ГЛАВА I</p></title><section><title><p>НАЧАЛО</p></title>
<p>Первый абзац со сноской<a l:href="#n1" type="note">1</a>.</p>
<p>Ёлка&nbsp;и -- тире.</p>
</section></section>
<section><title><p>Глава II</p></title><poem><stanza><v>Строка стиха</v></stanza></poem></section>
</body>
<body name="notes"><section id="n1"><p>Текст сноски</p></section></body>
</FictionBook>`;

test('FB2 в Windows-1251: название, автор, главы, без сносок', () => {
  const book = parse(cp1251(FB2), 'kniga.fb2');
  assert.equal(book.title, 'Проверка');
  assert.equal(book.author, 'Иван Тестов');
  assert.deepEqual(book.paragraphs, ['Проверка', 'ГЛАВА I', 'НАЧАЛО', 'Первый абзац со сноской.', 'Ёлка и — тире.', 'Глава II', 'Строка стиха']);
  assert.deepEqual(book.chapters, [
    { title: 'Глава I. Начало', para: 1 },
    { title: 'Глава II', para: 5 },
  ]);
});

test('FB2 в архиве .fb2.zip', () => {
  const zip = zipSync({ 'kniga.fb2': cp1251(FB2) });
  const book = parse(zip, 'kniga.fb2.zip');
  assert.equal(book.title, 'Проверка');
  assert.equal(book.paragraphs.length, 7);
});

function epub(files) {
  return zipSync({
    mimetype: strToU8('application/epub+zip'),
    'META-INF/container.xml': strToU8('<?xml version="1.0"?><container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>'),
    'OEBPS/content.opf': strToU8(`<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Электронная</dc:title><dc:creator>Пётр Автор</dc:creator></metadata>
      <manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="c1" href="text/c1.xhtml" media-type="application/xhtml+xml"/><item id="c2" href="text/c2.xhtml" media-type="application/xhtml+xml"/><item id="notes" href="text/notes.xhtml" media-type="application/xhtml+xml"/></manifest>
      <spine><itemref idref="nav"/><itemref idref="c1"/><itemref idref="c2"/><itemref idref="notes" linear="no"/></spine></package>`),
    'OEBPS/nav.xhtml': strToU8('<html xmlns="http://www.w3.org/1999/xhtml"><body><nav><ol><li>Оглавление</li></ol></nav></body></html>'),
    'OEBPS/text/c1.xhtml': strToU8('<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>x</title><style>p{}</style></head><body><h1>Глава первая</h1><p>Раз<br/>два&nbsp;три<a epub:type="noteref" href="notes.xhtml#n1">1</a>.</p><div><p>Внутри блока.</p></div></body></html>'),
    'OEBPS/text/c2.xhtml': strToU8('<html xmlns="http://www.w3.org/1999/xhtml"><body><section><h2>Глава вторая</h2><div>Простой текст в div.</div></section></body></html>'),
    'OEBPS/text/notes.xhtml': strToU8('<html xmlns="http://www.w3.org/1999/xhtml"><body><p>Сноска</p></body></html>'),
    ...files,
  });
}

test('EPUB: порядок глав, без оглавления и сносок', () => {
  const book = parse(epub({}), 'kniga.epub');
  assert.equal(book.title, 'Электронная');
  assert.equal(book.author, 'Пётр Автор');
  assert.deepEqual(book.paragraphs, ['Глава первая', 'Раз два три.', 'Внутри блока.', 'Глава вторая', 'Простой текст в div.']);
  assert.deepEqual(book.chapters, [
    { title: 'Глава первая', para: 0 },
    { title: 'Глава вторая', para: 3 },
  ]);
});

test('EPUB с защитой — понятная ошибка', () => {
  const enc = strToU8('<encryption xmlns="urn:oasis:names:tc:opendocument:xmlns:container" xmlns:enc="http://www.w3.org/2001/04/xmlenc#"><enc:EncryptedData><enc:CipherData><enc:CipherReference URI="OEBPS/text/c1.xhtml"/></enc:CipherData></enc:EncryptedData></encryption>');
  assert.throws(() => parse(epub({ 'META-INF/encryption.xml': enc }), 'drm.epub'), (e) => e instanceof BookError && /защищена/.test(e.message));
});

test('TXT в Windows-1251 с абзацами по отступу и переносами строк', () => {
  const lines = ['Глава 1', ''];
  for (let i = 0; i < 15; i++) lines.push(`    Абзац номер ${i} начинается с отступа`, 'и продолжается на следующей строке.');
  lines.push('', 'Глава 2', '', '    Последний абзац.');
  const book = parse(cp1251(lines.join('\r\n')), 'Моя_книга.txt');
  assert.equal(book.title, 'Моя книга');
  assert.equal(book.paragraphs[1], 'Абзац номер 0 начинается с отступа и продолжается на следующей строке.');
  assert.deepEqual(book.chapters.map((c) => c.title), ['Глава 1', 'Глава 2']);
  assert.equal(book.paragraphs.at(-1), 'Последний абзац.');
});

test('TXT в UTF-8: строка — абзац', () => {
  const book = parse(new TextEncoder().encode('Первая строка.\nВторая строка.\n'), 'a.txt');
  assert.deepEqual(book.paragraphs, ['Первая строка.', 'Вторая строка.']);
});

test('PDF и пустой файл — понятные ошибки', () => {
  assert.throws(() => parse(strToU8('%PDF-1.7 ...'), 'x.pdf'), /PDF пока не поддерживается/);
  assert.throws(() => parse(new Uint8Array(), 'x.txt'), /пустой/);
  assert.throws(() => parse(new Uint8Array([0, 1, 2, 0, 0, 0, 0, 9, 0, 0]), 'x.bin'), /не похоже на книгу/);
});

test('кодировки и заголовки', () => {
  assert.equal(decodeText(cp1251('Привет')), 'Привет');
  assert.equal(decodeText(new Uint8Array([0xef, 0xbb, 0xbf, 0x41])), 'A');
  assert.equal(prettyTitle('ГЛАВА XIV'), 'Глава XIV');
  assert.equal(prettyTitle('СУД'), 'Суд');
  assert.equal(prettyTitle('IV'), 'IV');
  assert.equal(prettyTitle('Обычный заголовок'), 'Обычный заголовок');
});

test('FB2: главы-подзаголовки (<subtitle>II</subtitle>), раздел с названием книги — не глава', () => {
  const fb2 = `<?xml version="1.0" encoding="utf-8"?>
<FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0">
<description><title-info><author><first-name>Антон</first-name><last-name>Чехов</last-name></author><book-title>Дама с собачкой</book-title></title-info></description>
<body><title><empty-line/></title>
<section><title><p>Дама с собачкой</p></title>
<subtitle>I</subtitle><p>Говорили, что на набережной появилось новое лицо.</p>
<subtitle>II.</subtitle><p>Прошла неделя после знакомства.</p>
<subtitle>* * *</subtitle><p>Звёздочки — не глава.</p>
<cite><text-author>1899</text-author></cite>
</section></body></FictionBook>`;
  const book = parse(new TextEncoder().encode(fb2), 'dama.fb2');
  assert.deepEqual(book.chapters, [
    { title: 'Глава I', para: 1 },
    { title: 'Глава II', para: 3 },
  ]);
  assert.equal(book.paragraphs[0], 'Дама с собачкой');
  assert.equal(book.paragraphs.at(-1), '1899');
});
