/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages deployment target: https://<owner>.github.io/explorResource/
// Keep this in sync with .github/workflows/deploy.yml and docs/pwa-and-github-pages.md.
const REPO_BASE = '/explorResource/';

export default defineConfig({
  base: REPO_BASE,
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['assets/biomerieux-logo.jpeg'],
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
            src: 'assets/biomerieux-logo.jpeg',
            sizes: '842x596',
            type: 'image/jpeg',
            purpose: 'any',
          },
        ],
      },
      workbox: {
        // App-shell caching only. Business data lives in IndexedDB and must
        // never be intercepted or cached by the service worker.
        navigateFallback: `${REPO_BASE}index.html`,
        globPatterns: ['**/*.{js,css,html,svg,ico}'],
        runtimeCaching: [],
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
  test: {
    environment: 'jsdom',
    globals: true,
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
