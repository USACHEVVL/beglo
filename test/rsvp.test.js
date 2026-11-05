import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tokenize, tokenizeParagraphs, chapterAt, splitWord, delayFor, clampWpm, formatMinutes, Reader, RAMP_WORDS } from '../src/rsvp.js';

test('опорная буква: примерно треть слова от начала', () => {
  assert.deepEqual(splitWord('Бегло'), { left: 'Б', mid: 'е', right: 'гло' });
  assert.deepEqual(splitWord('дворянина'), { left: 'дво', mid: 'р', right: 'янина' });
  assert.deepEqual(splitWord('я'), { left: '', mid: 'я', right: '' });
  assert.deepEqual(splitWord('и'), { left: '', mid: 'и', right: '' });
});

test('знаки препинания не считаются буквами', () => {
  assert.deepEqual(splitWord('«Отец'), { left: '«О', mid: 'т', right: 'ец' });
  assert.deepEqual(splitWord('Ю.,'), { left: '', mid: 'Ю', right: '.,' });
  assert.deepEqual(splitWord('—'), { left: '', mid: '—', right: '' });
});

test('длинные слова с дефисом делятся, короткие — нет', () => {
  const words = tokenize('в отставку премьер-майором не по-нонешнему').map((t) => t.t);
  assert.deepEqual(words, ['в', 'отставку', 'премьер-', 'майором', 'не', 'по-нонешнему']);
});

test('последнее слово абзаца помечено', () => {
  const tokens = tokenize('Первый абзац.\nВторой абзац.');
  assert.equal(tokens.length, 4);
  assert.equal(tokens[1].p, true);
  assert.equal(tokens[3].p, true);
  assert.equal(tokens[0].p, undefined);
});

test('паузы на знаках длиннее обычного слова', () => {
  const base = delayFor({ t: 'дом' }, 300);
  assert.equal(base, 200);
  assert.equal(Math.round(delayFor({ t: 'дом.' }, 300)), 440);
  assert.equal(Math.round(delayFor({ t: 'дом,' }, 300)), 320);
  assert.equal(delayFor({ t: 'дом.' }, 300, { punct: false }), 200);
  assert.ok(delayFor({ t: 'родственника' }, 300) > base);
});

test('скорость в пределах 100–1000 с шагом 25', () => {
  assert.equal(clampWpm(50), 100);
  assert.equal(clampWpm(5000), 1000);
  assert.equal(clampWpm(312), 300);
  assert.equal(clampWpm(313), 325);
});

test('оставшееся время по-русски', () => {
  assert.equal(formatMinutes(0.4), 'меньше минуты');
  assert.equal(formatMinutes(42), '42 мин');
  assert.equal(formatMinutes(68), '1 ч 8 мин');
  assert.equal(formatMinutes(120), '2 ч');
});

test('классика разбирается без пустых слов, главы встают на свои места', () => {
  const book = JSON.parse(readFileSync(new URL('../public/classics/kapitanskaya-dochka.json', import.meta.url)));
  const { tokens, starts } = tokenizeParagraphs(book.paragraphs);
  assert.ok(tokens.length > 25000);
  assert.ok(tokens.every((t) => t.t.length > 0));
  const chapterStarts = book.chapters.map((c) => starts[c.para]);
  assert.equal(tokens[chapterStarts[0]].t, 'ГЛАВА');
  assert.equal(chapterAt(chapterStarts, 0), -1);
  assert.equal(chapterAt(chapterStarts, chapterStarts[1]), 1);
  assert.equal(chapterAt(chapterStarts, tokens.length - 1), chapterStarts.length - 1);
});

test('чтение идёт по словам, разгоняется и останавливается в конце', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const tokens = tokenize('один два три');
    let ended = false;
    const r = new Reader(tokens, { wpm: 600, punct: false, ramp: true, onEnd: () => { ended = true; } });
    r.play();
    // 600 слов/мин = 100 мс на слово; первое слово после старта идёт в 2 раза медленнее.
    mock.timers.tick(199);
    assert.equal(r.i, 0);
    mock.timers.tick(1);
    assert.equal(r.i, 1);
    mock.timers.tick(180);
    assert.equal(r.i, 2);
    mock.timers.tick(1000);
    assert.equal(r.playing, false);
    assert.equal(ended, true);
    // ▶ в конце начинает сначала
    r.play();
    assert.equal(r.i, 0);
    r.destroy();
    assert.equal(RAMP_WORDS, 5);
  } finally {
    mock.timers.reset();
  }
});

test('перемотка не выходит за границы', () => {
  const r = new Reader(tokenize('а б в г д'), {});
  r.step(-10);
  assert.equal(r.i, 0);
  r.step(10);
  assert.equal(r.i, 4);
});
