---
title: 'ADR-0003: Adopt lucide-react as the icon library'
id: adr-0003
status: accepted
date: 2026-09-08
---

# ADR-0003: Adopt lucide-react as the icon library

## Context

Status indicators (`UtilizationBadge`, `DemandCoverageBadge`) and several inline hints (`SettingsPage`) used Unicode glyphs (`○ ◔ ⚠ ⛔ ✓ ↗ ◩ 📄`) as pseudo-icons. This works but renders inconsistently across platforms/fonts and looks dated for the 2026 visual refresh. The project has no icon library and, per brand rules, no webfonts — any icon solution must not introduce a webfont or runtime CSS dependency.

## Decision

- Adopt `lucide-react` (zero runtime dependencies, tree-shakeable named SVG-component imports, no CSS/webfont required).
- All icon imports go through a single barrel, `src/components/icons.ts`, re-exporting only the specific icons in use — one place to see (and change) the whole icon set.
- Icons are always decorative: rendered with `aria-hidden="true"` and never the sole carrier of information. Every status indicator keeps its existing **label + icon + value + tooltip** pattern (`aria-label`, visible text, `title`) — only the glyph itself is swapped for an `<Icon aria-hidden />` element, with all `aria-label`/`title` strings kept byte-identical to preserve existing test expectations.

## Consequences

- One new dependency (`lucide-react`), no dev/build tooling changes — it's a plain ESM package consumed like any other React component library.
- Future icon needs should extend the `src/components/icons.ts` barrel rather than importing directly from `lucide-react` elsewhere, keeping the icon surface auditable.

## Alternatives considered

- **Hand-authored inline SVG set** (rejected: more maintenance for equivalent visual quality, no meaningful bundle-size advantage at this icon count since lucide-react is tree-shaken to only the icons imported).
- **Icon webfont** (rejected outright: conflicts with the project's system-font-only brand constraint and adds a render-blocking asset).
