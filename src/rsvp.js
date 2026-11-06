// Движок чтения по одному слову (RSVP).
// Здесь нет ничего про экран: только деление текста, выбор опорной буквы и таймер.

export const MIN_WPM = 100;
export const MAX_WPM = 1000;
export const WPM_STEP = 25;
export const RAMP_WORDS = 5;

const LETTER_RE = /[0-9A-Za-zА-Яа-яЁё]/;
const LETTERS_G = /[0-9A-Za-zА-Яа-яЁё]/g;
const SENTENCE_END_RE = /[.!?…]["»”)\]]*$/;
const CLAUSE_END_RE = /[,;:]["»”)\]]*$/;
const DASH_RE = /^[—–-]+$/;

export function letterCount(word) {
  const m = word.match(LETTERS_G);
  return m ? m.length : 0;
}

// Абзацы → список слов. Последнее слово абзаца помечено p: true.
// Длинные слова с дефисом (больше 12 букв) делятся на части.
// starts[i] — номер первого слова i-го абзаца (для глав).
export function tokenizeParagraphs(paragraphs) {
  const tokens = [];
  const starts = [];
  for (const raw of paragraphs) {
    starts.push(tokens.length);
    const para = String(raw).trim();
    if (!para) continue;
    const start = tokens.length;
    for (const word of para.split(/\s+/)) {
      if (!word) continue;
      if (letterCount(word) > 12 && word.indexOf('-') > 0) {
        const parts = word.split('-');
        parts.forEach((part, i) => {
          if (part) tokens.push({ t: i < parts.length - 1 ? part + '-' : part });
        });
      } else {
        tokens.push({ t: word });
      }
    }
    if (tokens.length > start) tokens[tokens.length - 1].p = true;
  }
  return { tokens, starts };
}

export function tokenize(text) {
  return tokenizeParagraphs(String(text).split(/\r?\n/)).tokens;
}

// Номер главы, в которой стоит слово index. chapterStarts отсортированы.
export function chapterAt(chapterStarts, index) {
  let lo = 0;
  let hi = chapterStarts.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (chapterStarts[mid] <= index) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}

// Какую главу показывать в шапке. До первой главы обычно идёт только название книги
// в несколько слов — тогда сразу показываем первую главу, чтобы шапка не «молчала».
export const LEAD_IN_WORDS = 30;
export function headerChapter(chapterStarts, index) {
  const c = chapterAt(chapterStarts, index);
  if (c === -1 && chapterStarts.length && chapterStarts[0] <= LEAD_IN_WORDS) return 0;
  return c;
}

// Номер опорной буквы среди букв слова: примерно треть слова от начала.
export function orpLetterIndex(letters) {
  if (letters <= 1) return 0;
  return Math.max(0, Math.ceil(letters * 0.35) - 1);
}

// Слово → три части: до опорной буквы, сама буква, после неё.
export function splitWord(word) {
  const positions = [];
  for (let i = 0; i < word.length; i++) {
    if (LETTER_RE.test(word[i])) positions.push(i);
  }
  if (!positions.length) return { left: '', mid: word, right: '' };
  const at = positions[orpLetterIndex(positions.length)];
  return { left: word.slice(0, at), mid: word[at], right: word.slice(at + 1) };
}

// Сколько миллисекунд показывать слово.
export function delayFor(token, wpm, { punct = true } = {}) {
  const word = token.t;
  let factor = 1;
  if (punct) {
    if (token.p) factor = 2.6;
    else if (SENTENCE_END_RE.test(word)) factor = 2.2;
    else if (CLAUSE_END_RE.test(word) || DASH_RE.test(word)) factor = 1.6;
  }
  if (letterCount(word) > 8) factor *= 1.25;
  return (60000 / wpm) * factor;
}

export function clampWpm(wpm) {
  const rounded = Math.round(wpm / WPM_STEP) * WPM_STEP;
  return Math.min(MAX_WPM, Math.max(MIN_WPM, rounded));
}

export function minutesLeft(tokensLeft, wpm) {
  return tokensLeft / wpm;
}

export function formatMinutes(minutes) {
  if (minutes < 1) return 'меньше минуты';
  const total = Math.round(minutes);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (!h) return `${m} мин`;
  return m ? `${h} ч ${m} мин` : `${h} ч`;
}

export class Reader {
  constructor(tokens, { wpm = 300, punct = true, ramp = true, onTick, onState, onEnd } = {}) {
    this.tokens = tokens;
    this.i = 0;
    this.wpm = clampWpm(wpm);
    this.punct = punct;
    this.ramp = ramp;
    this.playing = false;
    this.ended = false;
    this.onTick = onTick || (() => {});
    this.onState = onState || (() => {});
    this.onEnd = onEnd || (() => {});
    this._timer = null;
    this._rampLeft = 0;
  }

  get current() {
    return this.tokens[this.i];
  }

  get atEnd() {
    return this.i >= this.tokens.length - 1;
  }

  play() {
    if (!this.tokens.length) return;
    if (this.ended) {
      this.i = 0;
      this.ended = false;
      this.onTick();
    }
    this.playing = true;
    this._rampLeft = this.ramp ? RAMP_WORDS : 0;
    this.onState();
    this._schedule();
  }

  pause() {
    this.playing = false;
    clearTimeout(this._timer);
    this.onState();
  }

  toggle() {
    if (this.playing) this.pause();
    else this.play();
  }

  seek(index) {
    const last = Math.max(0, this.tokens.length - 1);
    this.i = Math.min(last, Math.max(0, index));
    this.ended = false;
    this.onTick();
    if (this.playing) {
      this._rampLeft = this.ramp ? RAMP_WORDS : 0;
      this._schedule();
    }
  }

  step(n) {
    this.seek(this.i + n);
  }

  setWpm(wpm) {
    this.wpm = clampWpm(wpm);
    this.onState();
  }

  destroy() {
    this.playing = false;
    clearTimeout(this._timer);
  }

  _schedule() {
    clearTimeout(this._timer);
    if (!this.playing) return;
    let delay = delayFor(this.current, this.wpm, { punct: this.punct });
    if (this._rampLeft > 0) {
      delay *= 1 + 0.2 * this._rampLeft;
      this._rampLeft -= 1;
    }
    this._timer = setTimeout(() => this._advance(), delay);
  }

  _advance() {
    if (!this.playing) return;
    if (this.atEnd) {
      this.ended = true;
      this.pause();
      this.onEnd();
      return;
    }
    this.i += 1;
    this.onTick();
    this._schedule();
  }
}
