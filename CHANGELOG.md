# Changelog

All notable changes to this project are documented in this file. Format loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added — Lot 0 (bootstrap)

- Vite + React 18 + TypeScript strict project scaffold.
- Tailwind CSS v4 wired to the existing bioMérieux branding tokens (`src/index.css`).
- ESLint (flat config) + Prettier, Vitest + React Testing Library, Playwright.
- `vite-plugin-pwa` manifest + service worker (app-shell caching only).
- GitHub Actions CI (`ci.yml`) and GitHub Pages deploy workflow (`deploy.yml`).
- Base path `/explorResource/` and `HashRouter` for GitHub Pages compatibility.
- Full feature-folder skeleton for upcoming lots.

### Added — Lot 1 (documentation & memory)

- `AGENTS.md`, `.github/copilot-instructions.md`, `ai.memory`.
- `README.md`, this `CHANGELOG.md`, and the `docs/` skeleton (see `docs/index.md`).

### Added — Lot 2 (domain & persistence)

- See `ai.memory` and this changelog's next entry once Lot 2 lands.
