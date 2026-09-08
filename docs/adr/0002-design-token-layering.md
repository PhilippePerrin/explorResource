---
title: 'ADR-0002: Layer new design tokens in a companion file, never edit src/index.css'
id: adr-0002
status: accepted
date: 2026-09-08
---

# ADR-0002: Layer new design tokens in a companion file, never edit src/index.css

## Context

`src/index.css` is a verbatim copy of bioMérieux's provided branding (Tailwind v4 `@theme` color/font tokens, the light/dark runtime theme variables, base resets, focus ring, reduced-motion handling). `AGENTS.md` and `CLAUDE.md` both state it must never be rewritten. The 2026 visual refresh needs an elevation/shadow system that brand guidelines don't define, and Tailwind v4 has no separate config file to hold it (`@theme` in CSS is the only configuration surface here).

## Decision

- New tokens live in `src/design-tokens.css`, a companion file imported in `src/main.tsx` immediately after `./index.css`, so the cascade order is deterministic and the protected file is never touched.
- Tailwind v4 merges multiple `@theme` blocks across files, so if a static (non-theme-switching) token is ever needed, it can be added there without redeclaring any existing `--color-*`/`--font-*` name.
- Theme-switching values (i.e. anything that differs between `[data-theme="light"]` and dark) are added as plain CSS custom properties under `:root` / `[data-theme="light"]` in `design-tokens.css`, mirroring the pattern already used for `--surf-*`/`--text-*` in `src/index.css`.
- Tailwind's default radius and spacing scales are used as-is (the codebase already relies on them via `rounded-md`, `rounded-xl`, etc.) — no radius/spacing tokens are duplicated in the companion file, only what's genuinely missing: elevation shadows (`--shadow-xs/sm/md/lg`).

## Consequences

- `src/index.css` stays byte-for-byte the protected branding file; a diff against the original branding drop will show zero changes.
- Any future brand-provided update to `src/index.css` can be dropped in wholesale without needing to reconcile refactor-era additions.
- Contributors must add new non-brand tokens to `src/design-tokens.css`, never inline duplicate values or a new competing token file.

## Alternatives considered

- **Add a `tailwind.config.ts`** (rejected: Tailwind v4 favors CSS-first config; introducing a config file that only partially owns tokens — some in `@theme`, some in JS — would be more confusing than one companion CSS file).
- **Append directly to `src/index.css`** (rejected: violates the explicit "never rewrite" rule and would make it impossible to verify the file still matches the original branding drop).
