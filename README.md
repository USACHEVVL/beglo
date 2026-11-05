# Бегло

Веб-приложение (PWA) для быстрого чтения книг по одному слову. Опорная буква каждого слова красная и всегда стоит в одной точке экрана.

## Команды

- `npm install` — поставить зависимости
- `npm run dev` — запустить локально
- `npm test` — проверить логику чтения
- `npm run build` — собрать приложение в `dist/` (с офлайн-режимом)
- `npm run build:preview && node scripts/artifact.mjs` — собрать одну страницу для предпросмотра по ссылке

## Устройство

- `src/rsvp.js` — деление текста на слова, опорная буква, паузы, таймер чтения
- `src/parsers.js` — разбор FB2 (в том числе в zip), EPUB без защиты и TXT
- `src/books.js`, `src/db.js` — каталог книг, хранение на телефоне (IndexedDB)
- `src/screens/` — экраны «Библиотека», «Чтение», «Скорость»
- `src/storage.js` — настройки и место чтения
- `public/classics/` — полка классики; собирается `node scripts/build_classics.mjs <папка Texts>` из корпуса [19th Century Russian Literature](https://github.com/kaylinland/19thCenturyRussianLiterature) (тексты lib.ru, общественное достояние); комментарии издателей вырезаны
- `scripts/make_icons.py` — рисует иконки из шрифта PT Serif

Шрифты PT Serif и Inter встроены в приложение (лицензия SIL Open Font License).
