// Разбор книг: FB2 (и FB2 в архиве), EPUB без защиты, TXT.
// Результат: { title, author, paragraphs: string[], chapters: [{ title, para }] }.
import { unzipSync } from 'fflate';

export class BookError extends Error {}

const MAX_BYTES = 60 * 1024 * 1024;

/* ---------- Общее ---------- */

function startsWith(bytes, sig) {
  return sig.every((b, i) => bytes[i] === b);
}

function asciiHead(bytes, n = 400) {
  let s = '';
  for (let i = 0; i < Math.min(n, bytes.length); i++) s += String.fromCharCode(bytes[i]);
  return s;
}

function tryDecode(bytes, encoding, fatal = false) {
  try {
    return new TextDecoder(encoding, { fatal }).decode(bytes);
  } catch {
    return null;
  }
}

// Текст в неизвестной кодировке: метка BOM, объявленная кодировка, UTF-8, иначе Windows-1251.
export function decodeText(bytes, declared) {
  if (startsWith(bytes, [0xef, 0xbb, 0xbf])) return tryDecode(bytes.subarray(3), 'utf-8');
  if (startsWith(bytes, [0xff, 0xfe])) return tryDecode(bytes.subarray(2), 'utf-16le');
  if (startsWith(bytes, [0xfe, 0xff])) return tryDecode(bytes.subarray(2), 'utf-16be');
  if (declared) {
    const text = tryDecode(bytes, declared.toLowerCase());
    if (text != null) return text;
  }
  return tryDecode(bytes, 'utf-8', true) ?? tryDecode(bytes, 'windows-1251') ?? tryDecode(bytes, 'utf-8');
}

function declaredXmlEncoding(bytes) {
  const m = asciiHead(bytes).match(/<\?xml[^>]*encoding=["']([A-Za-z0-9_-]+)["']/);
  return m ? m[1] : null;
}

const ENTITIES = {
  nbsp: ' ', mdash: '—', ndash: '–', laquo: '«', raquo: '»', hellip: '…',
  bdquo: '„', ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’', shy: '', copy: '©', sect: '§', middot: '·',
};

// XML-разбор не знает HTML-имён вроде &nbsp; — заменяем их на сами символы.
function fixEntities(text) {
  return text.replace(/&([a-zA-Z]+);/g, (m, name) => {
    if (['amp', 'lt', 'gt', 'quot', 'apos'].includes(name)) return m;
    return ENTITIES[name.toLowerCase()] ?? ' ';
  });
}

function parseXml(text, DP, mime = 'application/xml') {
  let doc = null;
  try {
    doc = new DP({ onError: () => {} }).parseFromString(text, mime);
  } catch {
    doc = null;
  }
  if (doc && doc.documentElement && !doc.getElementsByTagName('parsererror').length) return doc;
  // В браузере даём второй шанс снисходительному HTML-разбору.
  if (typeof document !== 'undefined') {
    try {
      return new DP().parseFromString(text, 'text/html');
    } catch {
      return null;
    }
  }
  return doc && doc.documentElement ? doc : null;
}

// Строка, похожая на заголовок главы: «Глава 2», «Часть первая», «IV», «12.».
const CHAPTER_RE = /^(глава|часть|книга|пролог|эпилог|предисловие|послесловие|chapter|part)(?=$|[\s.:]).{0,60}$|^[IVXLC]{1,7}\.?$|^\d{1,3}\.?$/i;
const ROMAN_OR_NUMBER_RE = /^([IVXLC]{1,7}|\d{1,3})\.?$/i;

function sameText(a, b) {
  const norm = (x) => String(x || '').toLowerCase().replace(/ё/g, 'е').replace(/[^0-9a-zа-я]+/g, '');
  return Boolean(norm(a)) && norm(a) === norm(b);
}

function local(el) {
  return (el.localName || el.nodeName || '').toLowerCase().replace(/^.*:/, '');
}

function elementChildren(el) {
  const out = [];
  for (let n = el.firstChild; n; n = n.nextSibling) if (n.nodeType === 1) out.push(n);
  return out;
}

function findAll(root, name) {
  return Array.from(root.getElementsByTagName('*')).filter((e) => local(e) === name);
}

function findFirst(root, name) {
  const all = root.getElementsByTagName('*');
  for (let i = 0; i < all.length; i++) if (local(all[i]) === name) return all[i];
  return null;
}

export function cleanText(s) {
  return String(s)
    .replace(/[­​﻿]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/(^|[^-])--(?!-)/g, '$1—')
    .trim();
}

// «ГЛАВА I» → «Глава I»: заголовки капсом читаются тяжело.
export function prettyTitle(title) {
  if (/[a-zа-яё]/.test(title) || !/[А-ЯЁA-Z]{2}/.test(title) || /^[IVXLC.\s]+$/.test(title)) return title;
  const lower = title.toLowerCase().replace(/(^|[\s.])([ivxlc]+)(?=$|[\s.,:])/g, (m, pre, num) => pre + num.toUpperCase());
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

// Соседние заголовки («Глава I» + «Сержант гвардии») — одна глава.
export function addChapter(chapters, title, para) {
  const t = prettyTitle(title);
  const last = chapters[chapters.length - 1];
  if (last && last.para + last.parts === para) {
    last.title = `${last.title.replace(/[.:]$/, '')}. ${t}`;
    last.parts += 1;
    return;
  }
  chapters.push({ title: t, para, parts: 1 });
}

function finishChapters(chapters) {
  return chapters.map(({ title, para }) => ({ title, para }));
}

// Текст элемента без сносок и служебных вставок.
function textOf(el, skip) {
  let out = '';
  for (let n = el.firstChild; n; n = n.nextSibling) {
    if (n.nodeType === 3 || n.nodeType === 4) out += n.nodeValue;
    else if (n.nodeType === 1 && local(n) === 'br') out += ' ';
    else if (n.nodeType === 1 && !skip(n)) out += textOf(n, skip);
  }
  return out;
}

/* ---------- FB2 ---------- */

const isFb2NoteLink = (n) => local(n) === 'a' && /note/i.test(n.getAttribute('type') || '');

export function parseFb2(bytes, DP) {
  const text = decodeText(bytes, declaredXmlEncoding(bytes));
  if (!text) throw new BookError('Не получилось прочитать текст файла.');
  const doc = parseXml(fixEntities(text), DP);
  if (!doc) throw new BookError('Файл FB2 повреждён: не удалось разобрать его разметку.');

  const info = findFirst(doc, 'title-info');
  let title = '';
  let author = '';
  if (info) {
    const t = findFirst(info, 'book-title');
    if (t) title = cleanText(t.textContent);
    const a = findFirst(info, 'author');
    if (a) {
      author = ['first-name', 'middle-name', 'last-name']
        .map((k) => findFirst(a, k))
        .filter(Boolean)
        .map((e) => cleanText(e.textContent))
        .filter(Boolean)
        .join(' ');
      if (!author) {
        const nick = findFirst(a, 'nickname');
        if (nick) author = cleanText(nick.textContent);
      }
    }
  }

  const paragraphs = [];
  const chapters = [];
  const push = (s) => {
    const t = cleanText(s);
    if (t) paragraphs.push(t);
    return Boolean(t);
  };

  const walk = (el, depth) => {
    for (const child of elementChildren(el)) {
      const name = local(child);
      if (name === 'title') {
        const parts = elementChildren(child)
          .filter((c) => local(c) === 'p')
          .map((c) => cleanText(textOf(c, isFb2NoteLink)))
          .filter(Boolean);
        const heading = parts.join('. ').replace(/\.\./g, '.');
        if (heading) {
          // Заголовок, повторяющий название книги (рассказ в одном разделе), — не глава.
          if (depth > 0 && !sameText(heading, title)) addChapter(chapters, heading, paragraphs.length);
          push(heading);
        }
      } else if (name === 'subtitle') {
        // Часто главы помечены подзаголовком: <subtitle>II</subtitle> или «Глава 2».
        const text = cleanText(textOf(child, isFb2NoteLink));
        if (text && CHAPTER_RE.test(text) && text.length < 70) {
          addChapter(chapters, ROMAN_OR_NUMBER_RE.test(text) ? `Глава ${text.replace(/\.$/, '')}` : text, paragraphs.length);
        }
        push(text);
      } else if (['p', 'v', 'text-author'].includes(name)) {
        push(textOf(child, isFb2NoteLink));
      } else if (['section', 'epigraph', 'poem', 'stanza', 'cite'].includes(name)) {
        walk(child, name === 'section' ? depth + 1 : depth);
      } else if (name === 'table') {
        for (const row of findAll(child, 'tr')) push(textOf(row, isFb2NoteLink));
      }
    }
  };

  const root = doc.documentElement;
  for (const body of elementChildren(root).filter((e) => local(e) === 'body')) {
    const kind = (body.getAttribute('name') || '').toLowerCase();
    if (kind === 'notes' || kind === 'comments' || kind === 'footnotes') continue;
    walk(body, 0);
  }
  return { title, author, paragraphs, chapters: finishChapters(chapters) };
}

/* ---------- EPUB ---------- */

function dirOf(path) {
  const i = path.lastIndexOf('/');
  return i < 0 ? '' : path.slice(0, i + 1);
}

function resolvePath(base, href) {
  const parts = (base + decodeURIComponent(href.split('#')[0])).split('/');
  const out = [];
  for (const p of parts) {
    if (p === '..') out.pop();
    else if (p !== '.' && p !== '') out.push(p);
  }
  return out.join('/');
}

const BLOCKS = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'pre', 'dt', 'dd', 'blockquote', 'div', 'section', 'article', 'table', 'tr', 'ul', 'ol', 'dl', 'figure', 'aside', 'header', 'footer', 'main', 'nav', 'body', 'hr', 'br']);
const SKIP = new Set(['script', 'style', 'head', 'rt', 'rp', 'svg', 'math', 'img', 'nav']);

function isEpubNote(n) {
  const name = local(n);
  if (SKIP.has(name)) return true;
  const type = n.getAttribute && (n.getAttribute('epub:type') || n.getAttribute('role') || '');
  if (/noteref|doc-noteref/.test(type || '')) return true;
  return false;
}

function hasBlockChild(el) {
  for (const c of elementChildren(el)) if (BLOCKS.has(local(c)) && local(c) !== 'br') return true;
  return false;
}

function epubBlocks(el, out) {
  for (const child of elementChildren(el)) {
    const name = local(child);
    if (isEpubNote(child)) continue;
    const type = child.getAttribute('epub:type') || child.getAttribute('role') || '';
    if (/footnote|endnote|rearnote|doc-footnote|doc-endnote/.test(type)) continue;
    if (/^h[1-6]$/.test(name)) {
      out.push({ text: cleanText(textOf(child, isEpubNote)), level: Number(name[1]) });
    } else if (['p', 'li', 'pre', 'dt', 'dd'].includes(name) && !hasBlockChild(child)) {
      out.push({ text: cleanText(textOf(child, isEpubNote)) });
    } else if (BLOCKS.has(name) || hasBlockChild(child)) {
      if (hasBlockChild(child)) epubBlocks(child, out);
      else out.push({ text: cleanText(textOf(child, isEpubNote)) });
    }
  }
}

export function parseEpub(entries, DP) {
  const get = (path) => entries[path] || entries[Object.keys(entries).find((k) => k.toLowerCase() === path.toLowerCase())];

  const enc = get('META-INF/encryption.xml');
  if (enc) {
    const encDoc = parseXml(decodeText(enc), DP);
    const refs = encDoc ? findAll(encDoc, 'cipherreference').map((r) => r.getAttribute('URI') || '') : [];
    if (refs.some((u) => /\.(x?html?|xml)$/i.test(u))) {
      throw new BookError('Эта книга защищена от копирования (DRM). Такие книги открываются только в приложении магазина.');
    }
  }

  const containerBytes = get('META-INF/container.xml');
  if (!containerBytes) throw new BookError('Файл EPUB повреждён: нет описания содержимого.');
  const container = parseXml(decodeText(containerBytes), DP);
  const rootfile = container && findFirst(container, 'rootfile');
  const opfPath = rootfile && rootfile.getAttribute('full-path');
  const opfBytes = opfPath && get(opfPath);
  if (!opfBytes) throw new BookError('Файл EPUB повреждён: не нашлось оглавление книги.');
  const opf = parseXml(decodeText(opfBytes, declaredXmlEncoding(opfBytes)), DP);
  if (!opf) throw new BookError('Файл EPUB повреждён: не удалось разобрать оглавление.');

  const meta = findFirst(opf, 'metadata');
  const title = meta && findFirst(meta, 'title') ? cleanText(findFirst(meta, 'title').textContent) : '';
  const author = meta && findFirst(meta, 'creator') ? cleanText(findFirst(meta, 'creator').textContent) : '';

  const base = dirOf(opfPath);
  const manifest = new Map();
  for (const item of findAll(opf, 'item')) {
    manifest.set(item.getAttribute('id'), {
      href: item.getAttribute('href') || '',
      type: item.getAttribute('media-type') || '',
      props: item.getAttribute('properties') || '',
    });
  }

  const paragraphs = [];
  const chapters = [];
  for (const ref of findAll(opf, 'itemref')) {
    if ((ref.getAttribute('linear') || '').toLowerCase() === 'no') continue;
    const item = manifest.get(ref.getAttribute('idref'));
    if (!item || !/x?html|xml/i.test(item.type) || /\bnav\b/.test(item.props)) continue;
    const bytes = get(resolvePath(base, item.href));
    if (!bytes) continue;
    const text = decodeText(bytes, declaredXmlEncoding(bytes));
    const doc = text && parseXml(fixEntities(text), DP, 'application/xhtml+xml');
    if (!doc) continue;
    const body = findFirst(doc, 'body');
    if (!body) continue;
    const blocks = [];
    epubBlocks(body, blocks);
    let chapterMarked = false;
    for (const b of blocks) {
      if (!b.text) continue;
      if (b.level && b.level <= 3 && !chapterMarked) {
        addChapter(chapters, b.text, paragraphs.length);
        chapterMarked = true;
      }
      paragraphs.push(b.text);
    }
  }
  return { title, author, paragraphs, chapters: finishChapters(chapters) };
}

/* ---------- TXT ---------- */


export function parseTxt(bytes) {
  const text = decodeText(bytes);
  if (text == null) throw new BookError('Не получилось прочитать текст файла.');
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const nonEmpty = lines.filter((l) => l.trim());
  if (!nonEmpty.length) throw new BookError('В файле нет текста.');

  const isIndented = (l) => /^(\s{2,}|\t)\S/.test(l);
  const indented = nonEmpty.filter(isIndented).length;
  const blank = lines.length - nonEmpty.length;
  const avg = nonEmpty.reduce((sum, l) => sum + l.trim().length, 0) / nonEmpty.length;
  const hardWrapped = avg < 90 && nonEmpty.length > 20;
  // A: абзац начинается с отступа; B: абзацы разделены пустой строкой; C: строка = абзац.
  const mode = hardWrapped && indented > nonEmpty.length * 0.15 ? 'A'
    : hardWrapped && blank > nonEmpty.length * 0.1 ? 'B' : 'C';

  const paragraphs = [];
  const chapters = [];
  let buf = [];
  const flush = () => {
    const t = cleanText(buf.join(' '));
    buf = [];
    if (!t) return;
    if (t.length < 70 && CHAPTER_RE.test(t)) addChapter(chapters, t, paragraphs.length);
    paragraphs.push(t);
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      flush();
      continue;
    }
    if (mode === 'C' || (trimmed.length < 70 && CHAPTER_RE.test(trimmed))) {
      flush();
      buf.push(trimmed);
      flush();
      continue;
    }
    if (mode === 'A' && isIndented(line)) flush();
    buf.push(trimmed);
  }
  flush();
  return { title: '', author: '', paragraphs, chapters: finishChapters(chapters) };
}

/* ---------- Выбор формата ---------- */

const ZIP_SIG = [0x50, 0x4b, 0x03, 0x04];

function stripExt(name) {
  return name.replace(/\.(fb2\.zip|fb2|epub|txt|zip)$/i, '').replace(/[_]+/g, ' ').trim();
}

export function parseBookBytes(bytes, fileName = '', DP = globalThis.DOMParser) {
  if (!bytes || !bytes.length) throw new BookError('Файл пустой.');
  if (bytes.length > MAX_BYTES) throw new BookError('Файл слишком большой: больше 60 МБ.');
  const lower = fileName.toLowerCase();
  let result;

  if (startsWith(bytes, ZIP_SIG)) {
    let entries;
    try {
      entries = unzipSync(bytes);
    } catch {
      throw new BookError('Архив повреждён, открыть его не получилось.');
    }
    const names = Object.keys(entries);
    const mimetype = entries.mimetype ? decodeText(entries.mimetype).trim() : '';
    if (mimetype === 'application/epub+zip' || names.some((n) => n.toLowerCase() === 'meta-inf/container.xml')) {
      result = parseEpub(entries, DP);
    } else {
      const fb2 = names.find((n) => n.toLowerCase().endsWith('.fb2'));
      const txt = names.find((n) => n.toLowerCase().endsWith('.txt'));
      if (fb2) result = parseFb2(entries[fb2], DP);
      else if (txt) result = { ...parseTxt(entries[txt]), title: stripExt(txt.split('/').pop()) };
      else throw new BookError('В архиве нет книги в формате FB2, EPUB или TXT.');
    }
  } else if (lower.endsWith('.fb2') || /<FictionBook/i.test(asciiHead(bytes, 600))) {
    result = parseFb2(bytes, DP);
  } else if (lower.endsWith('.pdf') || startsWith(bytes, [0x25, 0x50, 0x44, 0x46])) {
    throw new BookError('PDF пока не поддерживается. Подойдут FB2, EPUB или TXT.');
  } else if (/\.(docx?|rtf|mobi|azw3?|djvu)$/i.test(lower)) {
    throw new BookError('Этот формат пока не поддерживается. Подойдут FB2, EPUB или TXT.');
  } else {
    const probe = bytes.subarray(0, 4096);
    let binary = 0;
    for (const b of probe) if (b === 0) binary++;
    if (binary > 4 && !startsWith(bytes, [0xff, 0xfe]) && !startsWith(bytes, [0xfe, 0xff])) {
      throw new BookError('Это не похоже на книгу. Подойдут файлы FB2, EPUB или TXT.');
    }
    result = parseTxt(bytes);
  }

  const paragraphs = result.paragraphs.filter(Boolean);
  if (!paragraphs.length) throw new BookError('В книге не нашлось текста.');
  return {
    title: result.title || stripExt(fileName) || 'Без названия',
    author: result.author || '',
    paragraphs,
    chapters: result.chapters.filter((c) => c.para < paragraphs.length),
  };
}

export async function parseBookFile(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  return parseBookBytes(bytes, file.name || '');
}
