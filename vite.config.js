import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { viteSingleFile } from 'vite-plugin-singlefile';

// PREVIEW=1 собирает один HTML-файл для предпросмотра по ссылке (без офлайн-режима).
const preview = process.env.PREVIEW === '1';

export default defineConfig({
  base: './',
  define: {
    __PREVIEW__: JSON.stringify(preview),
  },
  build: {
    outDir: preview ? 'dist-preview' : 'dist',
    emptyOutDir: true,
  },
  plugins: preview
    ? [viteSingleFile()]
    : [
        VitePWA({
          registerType: 'autoUpdate',
          injectRegister: 'auto',
          includeAssets: ['icons/apple-touch-icon.png', 'icons/favicon.png'],
          manifest: {
            name: 'Бегло',
            short_name: 'Бегло',
            description: 'Быстрое чтение книг по одному слову',
            lang: 'ru',
            start_url: './',
            scope: './',
            display: 'standalone',
            orientation: 'portrait',
            background_color: '#F4EBDD',
            theme_color: '#F4EBDD',
            icons: [
              { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
              { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
              { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
            ],
          },
          workbox: {
            globPatterns: ['**/*.{js,css,html,woff2,png,svg}'],
          },
        }),
      ],
});
