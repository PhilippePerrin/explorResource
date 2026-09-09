---
title: Deployment
id: deployment
status: living
last_updated: 2026-09-09
---

# Deployment

No GitHub Pages, no deployment workflow. The app is a set of static files served locally by [Rebex Tiny Web Server](https://www.rebex.net/tiny-web-server/) (or any other plain static host) — see `docs/adr/0005-sqlite-wasm-and-rebex-hosting.md`.

## Build

```bash
npm ci
npm run build
```

Outputs to `dist/`, respecting `base: '/'` in `vite.config.ts`.

## Serve with Rebex Tiny Web Server

1. Copy the contents of `dist/` into the folder Rebex Tiny Web Server is configured to serve.
2. Confirm Rebex's configured root/virtual directory matches `base: '/'` — if Rebex instead serves the app from a sub-path, update `REPO_BASE` in `vite.config.ts` (and `playwright.config.ts`'s `baseURL`) to match, and rebuild.
3. Start (or restart) the Rebex Tiny Web Server process.

## Manual build & preview (local verification before copying to Rebex)

```bash
npm run build
npm run preview
```

`npm run preview` serves the production build via Vite's own static server — a close approximation of Rebex, but not a substitute for testing against the real thing (see below).

## Pre-release smoke test against real Rebex

Automated e2e (`npm run test:e2e`) runs against `vite preview`, not the actual Rebex binary — a Windows executable that's impractical to script in CI (GitHub Actions runs on `ubuntu-latest`). Before each release, manually verify against a real Rebex instance:

1. Build (`npm run build`) and copy `dist/` into the folder Rebex serves.
2. Start Rebex and open the app in a real browser at its URL.
3. Confirm the app loads and the primary navigation/dashboard render.
4. Create or edit a record, then reload the page (F5) — confirm the data persisted (validates the SQLite/OPFS Worker actually opened and wrote to disk under Rebex, not just under Vite's dev/preview server).
5. Navigate to a route other than `/`, then hard-refresh — confirm it still loads (validates `HashRouter` avoids a 404 from Rebex having no SPA rewrite rule).
6. Export a backup, then restore it — confirm the round-trip works.
7. Check the browser DevTools console for errors, especially anything from the SQLite Worker (`sqlite.worker`) failing to install the OPFS VFS.
