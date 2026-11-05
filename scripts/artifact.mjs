// Превращает собранный предпросмотр (dist-preview/index.html) в страницу для ссылки claude.ai:
// оставляет название, стили и скрипт, а оболочку страницы добавляет сам claude.ai.
import { readFileSync, writeFileSync } from 'node:fs';

const html = readFileSync('dist-preview/index.html', 'utf8');
const title = html.match(/<title>([\s\S]*?)<\/title>/)[1];
const styles = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');
const scripts = [...html.matchAll(/<script type="module"[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n');
if (!styles || !scripts) throw new Error('не нашёл стили или скрипт');
const out = `<title>${title}</title>\n<style>${styles}</style>\n<div id="app"></div>\n<script type="module">${scripts}</script>\n`;
writeFileSync('dist-preview/beglo.html', out);
console.log('dist-preview/beglo.html', out.length, 'bytes');
