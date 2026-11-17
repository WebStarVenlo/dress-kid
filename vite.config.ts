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
        // Vangt de POST van "Delen → Dress Kid" af (zie share_target); relatief aan sw.js.
        importScripts: ['share-target-sw.js'],
      },
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Dress Kid',
        short_name: 'Dress Kid',
        description: 'Kies zelf je kleren voor vandaag.',
        lang: 'nl',
        display: 'standalone',
        start_url: './',
        scope: './',
        // Android: verschijnt in het deelmenu als de app geïnstalleerd is. De service worker
        // (public/share-target-sw.js) ontvangt de POST en stuurt door naar het ouderscherm.
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
