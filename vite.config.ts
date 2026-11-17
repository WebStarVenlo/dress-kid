/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,css,html,woff2,svg,png}'],
        // Catches the POST from "Share → Dress Kid" (see share_target); relative to sw.js.
        importScripts: ['share-target-sw.js'],
      },
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        // NOTE: the manifest is generated at build time and is not translated by i18next.
        // name, short_name, description (and the share_target text) are Dutch-only for now.
        // They must be localized per language later (e.g. one manifest per locale).
        name: 'Dress Kid',
        short_name: 'Dress Kid',
        description: 'Kies zelf je kleren voor vandaag.',
        lang: 'nl',
        display: 'standalone',
        start_url: './',
        scope: './',
        // Android: appears in the share sheet when the app is installed. The service worker
        // (public/share-target-sw.js) receives the POST and forwards to the parent screen.
        share_target: {
          action: './share-target',
          method: 'POST',
          enctype: 'multipart/form-data',
          params: {
            title: 'title',
            text: 'text',
            url: 'url',
            files: [{ name: 'photos', accept: ['image/*'] }],
          },
        },
        theme_color: '#FF8A3D',
        background_color: '#FFF6EC',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
})
