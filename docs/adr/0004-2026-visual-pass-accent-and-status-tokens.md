---
title: 'ADR-0004: Data-viz accent color, centralized status tokens, and duotone icon chips'
id: adr-0004
status: accepted
date: 2026-09-09
---

# ADR-0004: Data-viz accent color, centralized status tokens, and duotone icon chips

## Context

The Domain Manager asked for a visually attractive, "2026" redesign and explicitly authorized modifying `src/index.css` if needed to get there. Two gaps remained after Lots 15-16 (design tokens, `lucide-react`, `ui/` primitives, sidebar, theme switcher, partial page reskin):

1. `UtilizationBadge` and `DemandCoverageBadge` hardcoded raw Tailwind colors (`emerald/amber/orange/red-950`) that only look correct in dark mode — the light theme inherited dark-only pill colors with no theme-aware override, an accessibility/consistency gap.
2. The brand palette (blue/green/lime/yellow/cyan/gold + grays) has no color reserved purely for data-viz differentiation when two chart series or icon "tones" need to be told apart and the existing brand hues already carry other meaning.
3. `lucide-react` icons are outline-only (no duotone/filled variant in the library), but a "2026" look benefits from more visual weight on icons than a bare stroke glyph.

## Decision

- **Status tokens**: introduce a shared 5-tone severity/semantic scale (`success`, `caution`, `attention`, `critical`, `info`), each as a `{bg, text, border}` triplet, defined for dark (`:root`) and light (`[data-theme='light']`) in `src/design-tokens.css` — never `src/index.css`. `UtilizationBadge` and `DemandCoverageBadge` now consume these tokens instead of literal Tailwind color classes, fixing the light-theme gap. The existing icon + label + value + tooltip pattern is unchanged (ADR-0003) — only the color source changed.
- **Data-viz accent**: add one non-brand accent (`--accent-viz-*`, a soft violet, dark/light pair) to `src/design-tokens.css`, reserved for chart/status differentiation only — never used for brand chrome (logo, primary actions, nav, headings). This keeps the official bioMérieux palette in `src/index.css` untouched, per the Domain Manager's own preference (asked and confirmed: keep the brand palette as-is, add a data-viz accent only if the existing palette can't distinguish two states).
- **Duotone icon chips**: rather than adding a second icon library (more bundle weight, a second visual language, and it would need to reopen ADR-0003), a `IconChip` component renders any existing `lucide-react` icon inside a small tinted, bordered rounded chip using the status/accent/neutral tokens above (`ui-icon-chip-*` utility classes). This reads as "duotone" (icon + colored fill) without a second icon set. Used for KPI cards, empty states, alert rows, and page headers.
- **Motion**: one orchestrated entrance sequence on the Dashboard only (`hero-rise` keyframes + staggered delay utility classes in `src/design-tokens.css`, gated behind `prefers-reduced-motion: no-preference` like every other animation in this codebase) — not a per-card hover effect repeated across every page.

## Consequences

- `src/index.css` (the protected, verbatim bioMérieux brand file) was **not modified** by this pass, despite the standing authorization to do so — `src/design-tokens.css` already covered every need. The authorization is recorded here and in `ai.memory` in case a future change genuinely requires touching the brand file.
- New shared components `src/components/ui/{IconChip,EmptyState,Skeleton}.tsx`, exported from the `ui/` barrel alongside `Button`/`Card`/etc.
- `src/components/icons.ts` grew from 14 to ~40 exported icons to cover every page's domain (Projects, Releases, Resources, Companies, Calendars, Imports, Settings) — still a single audited barrel, per ADR-0003.

## Alternatives considered

- **Add a second icon package for real duotone/filled icons** (rejected: reopens ADR-0003's decision, adds bundle weight and a second visual language for marginal gain over the chip treatment).
- **Let each badge/page keep its own ad hoc color classes** (rejected: this is exactly the inconsistency being fixed — dark-only colors leaking into the light theme).
- **Edit `src/index.css` directly for the new accent** (rejected: `src/design-tokens.css` is the established, ADR-0002-sanctioned extension point and was sufficient; editing the protected brand file was unnecessary even though authorized).
