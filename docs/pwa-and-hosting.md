---
title: PWA & Hosting
id: pwa-and-hosting
status: living
last_updated: 2026-09-09
---

# PWA & Hosting

Supersedes `pwa-and-github-pages.md` (GitHub Pages hosting was removed — see `docs/adr/0005-sqlite-wasm-and-rebex-hosting.md`).

## Base path

`vite.config.ts` sets `base: '/'`, assuming the app is served from the root of whatever static server hosts it (Rebex Tiny Web Server, `vite preview`, or any other plain static host). If Rebex is configured to serve the app from a sub-folder instead, this constant (and `playwright.config.ts`'s `baseURL`) must be updated together — see `AGENTS.md` §14.

## Routing

`HashRouter` (see `architecture.md` for the rationale) — avoids 404s on deep-link refresh since Rebex Tiny Web Server is confirmed static-file-only and its support for a server-side SPA fallback rewrite rule is unconfirmed. Revisit only if that's confirmed available and configured.

## Service worker & manifest

`vite-plugin-pwa` (Workbox `generateSW` mode). App-shell assets only (`js`, `css`, `html`, `svg`, `ico`, `wasm`, generated PWA icons, manifest) are cached. **Business data (SQLite/OPFS) is never intercepted or cached by the service worker** — this is a hard rule (see `AGENTS.md` §3). The `.wasm` SQLite engine binary is included in the precache list deliberately: without it, opening the local database (and therefore the whole app) fails offline after the first visit. There is no backend API in this app, so the runtime caching rules are restricted to same-origin navigations and static app-shell assets.

`registerType: 'prompt'` is used (not `autoUpdate`) so the Domain Manager gets an explicit "new version available, reload?" banner rather than a silent update, avoiding data-loss surprises mid-session. The UI implementation lives in `src/app/UpdateBanner.tsx` and is mounted once from the application shell.

### Icons

The original brand logo remains `public/assets/biomerieux-logo.jpeg` (read-only). Derived square PNG icons (`192×192`, `512×512`, plus a maskable `512×512`) generated from that source are referenced by the manifest so installed PWAs have correctly-sized launcher assets without altering the original JPEG.

## Offline

After a first successful visit, the app shell loads fully offline, including the SQLite engine (`.wasm`, precached). Business data already lives in OPFS via the SQLite Worker, so read/write of existing data continues to work offline; only network refresh of static assets is attempted first (`NetworkFirst`) before the cached shell is used. Excel import is file-picker based, so there is no backend dependency for the core use case.

## Single-connection constraint

Unlike IndexedDB, the OPFS SyncAccessHandle Pool VFS holds an exclusive lock per database file — only one tab/window can have the app open at a time. If the app is opened in a second tab, `src/app/DatabaseLockGuard.tsx` shows a clear "already open elsewhere" message rather than letting pages fail silently on their first read. No multi-tab sync exists or is planned — this app is single-user, single-machine by design.

## Deployment

No deployment workflow. See `deployment.md` for the manual build-and-copy steps to serve the app via Rebex Tiny Web Server.
