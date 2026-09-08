---
title: PWA & GitHub Pages
id: pwa-and-github-pages
status: living
last_updated: 2026-09-08
---

# PWA & GitHub Pages

## Base path

`vite.config.ts` sets `base: '/explorResource/'`, matching the target repository name confirmed during planning. If the repository is ever renamed or forked, this constant (and `playwright.config.ts` `baseURL`, and `.github/workflows/deploy.yml`) must be updated together — see `AGENTS.md` §14.

## Routing

`HashRouter` (see `architecture.md` for the rationale) — avoids GitHub Pages 404s on deep-link refresh since there is no server-side SPA fallback rule available on static Pages hosting.

## Service worker & manifest

`vite-plugin-pwa` (Workbox `generateSW` mode). App-shell assets only (`js`, `css`, `html`, `svg`, `ico`) are precached. **Business data (IndexedDB) is never intercepted or cached by the service worker** — this is a hard rule (see `AGENTS.md` §3).

`registerType: 'prompt'` is used (not `autoUpdate`) so the Domain Manager gets an explicit "new version available, reload?" banner rather than a silent update, avoiding data-loss surprises mid-session — implemented in a later lot's update-banner component.

## Offline

After a first successful visit, the app shell loads fully offline. Business data already lives in IndexedDB, so read/write of existing data continues to work offline; only Excel-file network fetches (none exist — import is a local file picker) would be affected, so there is no offline gap for the core use case.

## Deployment

`.github/workflows/deploy.yml` builds with `npm run build` and deploys the `dist/` folder via `actions/configure-pages` + `actions/upload-pages-artifact` + `actions/deploy-pages`, triggered on push to `main`. See `deployment.md` for manual verification steps.
