---
title: Troubleshooting
id: troubleshooting
status: living
last_updated: 2026-09-08
---

# Troubleshooting

This log records real issues encountered during development and their resolutions (mirrors "Incidents et solutions" in `ai.memory`, kept here for discoverability by anyone browsing `docs/`).

## `npm create vite@latest` prompts not automatable in PowerShell

Interactive scaffolding prompts (overwrite non-empty directory, template choice) could not be reliably piped through the non-interactive PowerShell tool. **Resolution**: scaffolded all configuration files manually (`package.json`, `tsconfig*.json`, `vite.config.ts`, ESLint/Prettier/Vitest/Playwright configs, GitHub Actions workflows).

## Build error: `Unable to resolve @import "tailwindcss"`

`src/index.css` uses Tailwind v4 `@theme` syntax but the `tailwindcss`/`@tailwindcss/vite` packages were not yet installed/wired. **Resolution**: added both dependencies and the `tailwindcss()` Vite plugin in `vite.config.ts` (Tailwind v4 needs no separate PostCSS config with this plugin).

## TypeScript error on `vite.config.ts` `test` option

`tsc` complained that `test` is not a known `UserConfigExport` property. **Resolution**: added `/// <reference types="vitest/config" />` at the top of `vite.config.ts` so Vitest augments Vite's config types.

## React Router future-flag warnings in tests

`v7_startTransition` / `v7_relativeSplatPath` warnings appeared in Vitest output. **Resolution**: opted in early via the `HashRouter` `future` prop, since the project's zero-warning quality bar applies to test output too.
