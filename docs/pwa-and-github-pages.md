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

`vite-plugin-pwa` (Workbox `generateSW` mode). App-shell assets only (`js`, `css`, `html`, `svg`, `ico`, generated PWA icons, manifest) are cached. **Business data (IndexedDB) is never intercepted or cached by the service worker** — this is a hard rule (see `AGENTS.md` §3). There is no backend API in this app, so the runtime caching rules are restricted to same-origin navigations and static app-shell assets under `/explorResource/`.

`registerType: 'prompt'` is used (not `autoUpdate`) so the Domain Manager gets an explicit "new version available, reload?" banner rather than a silent update, avoiding data-loss surprises mid-session. The UI implementation lives in `src/app/UpdateBanner.tsx` and is mounted once from the application shell.

### Icons

The original brand logo remains `public/assets/biomerieux-logo.jpeg` (read-only). Lot 11 adds derived square PNG icons (`192×192`, `512×512`, plus a maskable `512×512`) generated from that source and referenced by the manifest so installed PWAs and GitHub Pages previews have correctly-sized launcher assets without altering the original JPEG.

## Offline

After a first successful visit, the app shell loads fully offline. Business data already lives in IndexedDB, so read/write of existing data continues to work offline; only network refresh of static assets is attempted first (`NetworkFirst`) before the cached shell is used. Excel import is file-picker based, so there is no backend dependency for the core use case.

## Deployment

`.github/workflows/deploy.yml` builds with `npm run build` and deploys the `dist/` folder via `actions/configure-pages` + `actions/upload-pages-artifact` + `actions/deploy-pages`, triggered on push to `main`. See `deployment.md` for manual verification steps.
