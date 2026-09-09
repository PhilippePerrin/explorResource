/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

// Served locally by Rebex Tiny Web Server (or `vite preview`) from its root.
// Keep this in sync with docs/pwa-and-hosting.md.
const REPO_BASE = '/';

export default defineConfig({
  base: REPO_BASE,
  server: {
    watch: {
      // The Salesforce CLI extension rewrites this metadata cache continuously
      // while VS Code is open, which otherwise triggers a full dev-server page
      // reload on every write (wiping in-memory state, e.g. mid-import wizards).
      ignored: ['**/.sf/**'],
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: [
        'assets/biomerieux-logo.jpeg',
        'icons/apple-touch-icon.png',
        'icons/pwa-192x192.png',
        'icons/pwa-512x512.png',
        'icons/pwa-maskable-512x512.png',
      ],
      manifest: {
        id: REPO_BASE,
        name: 'Resource Capacity & Project Demand Planner',
        short_name: 'Capacity Planner',
        description:
          'Local-first capacity, project demand and resource allocation planner for a single Domain Manager.',
        start_url: REPO_BASE,
        scope: REPO_BASE,
        display: 'standalone',
        background_color: '#060e1f',
        theme_color: '#00427f',
        icons: [
          {
            src: 'icons/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'icons/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'icons/pwa-maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // App-shell caching only. Business data lives in the local SQLite
        // database (OPFS) and must never be intercepted or cached by the
        // service worker.
        navigateFallback: `${REPO_BASE}index.html`,
        cleanupOutdatedCaches: true,
        // Includes .wasm: the SQLite engine's binary must be precached too,
        // or opening the local database (and therefore the whole app) fails
        // offline after the first visit.
        globPatterns: ['**/*.{js,css,html,svg,ico,png,webmanifest,wasm}'],
        runtimeCaching: [
          {
            urlPattern: ({ request, url }) =>
              request.mode === 'navigate' && url.pathname.startsWith(REPO_BASE),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'app-shell-pages',
              networkTimeoutSeconds: 3,
              cacheableResponse: {
                statuses: [0, 200],
              },
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 7 * 24 * 60 * 60,
              },
            },
          },
          {
            urlPattern: ({ request, url }) =>
              url.pathname.startsWith(REPO_BASE) &&
              ['font', 'image', 'script', 'style', 'worker'].includes(request.destination),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'app-shell-assets',
              networkTimeoutSeconds: 3,
              cacheableResponse: {
                statuses: [0, 200],
              },
              expiration: {
                maxEntries: 64,
                maxAgeSeconds: 30 * 24 * 60 * 60,
              },
            },
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  resolve: {
    alias: {
      '@': '/src',
    },
  },
  worker: {
    format: 'es',
  },
  optimizeDeps: {
    // The SQLite Wasm package manages its own Worker/wasm loading; letting
    // esbuild pre-bundle it breaks that. Per the package's own Vite guidance.
    exclude: ['@sqlite.org/sqlite-wasm'],
  },
  test: {
    environment: 'jsdom',
    globals: true,
    // Each test that touches persistence now compiles/instantiates a real
    // SQLite Wasm module (heavier than the previous fake-indexeddb
    // polyfill), which can be tight against the 5s default under full-suite
    // parallel load.
    testTimeout: 10_000,
    setupFiles: ['./tests/unit/setup.ts'],
    include: [
      'tests/unit/**/*.test.ts',
      'tests/unit/**/*.test.tsx',
      'tests/component/**/*.test.tsx',
    ],
    css: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
    },
  },
});
