---
title: Deployment
id: deployment
status: living
last_updated: 2026-09-08
---

# Deployment

## GitHub Pages (automated)

`.github/workflows/deploy.yml` runs on every push to `main`:

1. `npm ci`
2. `npm run build` (outputs to `dist/`, respecting `base: '/explorResource/'`)
3. `actions/configure-pages` + `actions/upload-pages-artifact` + `actions/deploy-pages`

One-time repository setup required (manual, not automatable from this codebase): enable **GitHub Pages → Source: GitHub Actions** in the repository settings.

## Manual build & preview

```bash
npm run build
npm run preview
```

`npm run preview` serves the production build; verify the app loads correctly under the `/explorResource/` sub-path locally before relying on CI.

## Verifying the base path

After deployment, confirm:

- The app loads at `https://<owner>.github.io/explorResource/`.
- Deep links (e.g. `https://<owner>.github.io/explorResource/#/projects`) load correctly on a hard refresh (validates the `HashRouter` strategy).
- The PWA manifest and service worker register without console errors (DevTools → Application tab).
